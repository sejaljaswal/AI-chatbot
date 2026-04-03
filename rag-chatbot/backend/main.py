import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import TextLoader, PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate

load_dotenv()

app = FastAPI()

# Allow cross-origin requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root directory configuration
DOCS_DIR = "docs"
FAISS_INDEX = "faiss_index"

vectorstore = None
qa_chain = None
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

def get_qa_chain(vs):
    primary_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=0, max_retries=3)
    fallback_llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0, max_retries=3)
    fallback_llm_2 = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0, max_retries=3)
    llm = primary_llm.with_fallbacks([fallback_llm, fallback_llm_2])
    
    retriever = vs.as_retriever(search_type="similarity", search_kwargs={"k": 8})
    
    template = """
    You are a strict assistant that only answers questions based on the provided context.
    
    Instructions:
    1. Answer ONLY from the provided Context information below.
    2. If the answer is NOT present in the Context, respond explicitly with: "I couldn't find this information in the provided documents."
    3. Do NOT use outside knowledge or hallucinate details.
    4. Provide clear, formatted answers using headings or bullet points if applicable.

    ---
    Context Information:
    {context}
    ---

    Question: {question}

    Answer:
    """
    prompt = PromptTemplate(template=template, input_variables=["context", "question"])
    
    return RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        return_source_documents=True,
        chain_type_kwargs={"prompt": prompt}
    )

def init_rag():
    """Initializes or reloads the RAG system from the disk or docs folder."""
    global vectorstore, qa_chain
    print("\n--- [RAG System Initialization] ---")
    
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)

    # Try loading existing index first
    if os.path.exists(FAISS_INDEX):
        print(f"Loading existing FAISS index from {FAISS_INDEX}...")
        vectorstore = FAISS.load_local(FAISS_INDEX, embeddings, allow_dangerous_deserialization=True)
        qa_chain = get_qa_chain(vectorstore)
        print(f"System ready with {vectorstore.index.ntotal} vectors.")
    else:
        # If no index, scan docs folder and build from scratch
        file_names = [f for f in os.listdir(DOCS_DIR) if f.lower().endswith(('.md', '.txt', '.pdf'))]
        if not file_names:
            print("No documents found to index.")
            return

        documents = []
        for filename in file_names:
            file_path = os.path.join(DOCS_DIR, filename)
            try:
                loader = PyPDFLoader(file_path) if filename.lower().endswith('.pdf') else TextLoader(file_path, encoding='utf-8')
                documents.extend(loader.load())
            except Exception as e:
                print(f"ERROR: {filename}: {e}")

        if documents:
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
            texts = text_splitter.split_documents(documents)
            vectorstore = FAISS.from_documents(texts, embeddings)
            vectorstore.save_local(FAISS_INDEX)
            qa_chain = get_qa_chain(vectorstore)
            print(f"Created new index with {vectorstore.index.ntotal} vectors.")

@app.on_event("startup")
async def startup_event():
    init_rag()

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/documents")
async def list_documents():
    if not os.path.exists(DOCS_DIR):
        return {"documents": []}
    files = [f for f in os.listdir(DOCS_DIR) if f.lower().endswith(('.md', '.txt', '.pdf'))]
    return {"documents": files}

@app.delete("/documents/{filename}")
async def delete_document(filename: str):
    file_path = os.path.join(DOCS_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        print(f"Deleted file: {filename}. Rebuilding index...")
        # Clean index folder and rebuild to ensure file is completely removed from retrieval
        if os.path.exists(FAISS_INDEX):
            shutil.rmtree(FAISS_INDEX)
        init_rag()
        return {"message": f"Successfully deleted {filename} and rebuilt knowledge base."}
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    global vectorstore, qa_chain
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
    
    file_location = os.path.join(DOCS_DIR, file.filename)
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    print(f"Ingesting new file: {file.filename}")
    try:
        loader = PyPDFLoader(file_location) if file.filename.lower().endswith('.pdf') else TextLoader(file_location, encoding='utf-8')
        new_docs = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        new_texts = text_splitter.split_documents(new_docs)
        
        if vectorstore:
            vectorstore.add_documents(new_texts)
            vectorstore.save_local(FAISS_INDEX)
        else:
            vectorstore = FAISS.from_documents(new_texts, embeddings)
            vectorstore.save_local(FAISS_INDEX)
        
        # Update QA chain with new vectorstore state
        qa_chain = get_qa_chain(vectorstore)
        print(f"Updated index. Total vectors: {vectorstore.index.ntotal}")
        return {"message": f"Successfully added {file.filename} to knowledge base."}
    except Exception as e:
        print(f"INGESTION ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class QueryRequest(BaseModel):
    query: str
    filename: str = None # Optional filter

@app.post("/query")
async def query_backend(req: QueryRequest):
    if not qa_chain:
        return {
            "answer": "The RAG system is not yet initialized. Please upload at least one document to the vault first.",
            "sources": [],
            "model": "System"
        }
    
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    try:
        print(f"\n--- [Query: {req.query}] ---")
        
        if req.filename and req.filename != "All Documents":
            filter_path = os.path.join(DOCS_DIR, req.filename)
            print(f"Filtering by path: {filter_path}")
            filtered_retriever = vectorstore.as_retriever(
                search_type="similarity", 
                search_kwargs={"k": 8, "filter": {"source": filter_path}}
            )
            # Create a temporary chain for this filtered request
            temp_chain = get_qa_chain(vectorstore)
            temp_chain.retriever = filtered_retriever
            result = temp_chain.invoke({"query": req.query})
        else:
            result = qa_chain.invoke({"query": req.query})
        
        # Log retrieved chunks
        print(f"Retrieved {len(result['source_documents'])} chunks.")
        for idx, doc in enumerate(result['source_documents']):
            source = os.path.basename(doc.metadata.get('source', 'unknown'))
            print(f"[{source}] {doc.page_content[:100]}...")
        
        sources = list(set([os.path.basename(doc.metadata.get("source", "Unknown")) for doc in result["source_documents"]]))
        
        # Extract model name from the result metadata or default
        # Note: with_fallbacks makes it hard to see the final model in result
        # we will log it locally and use a placeholder or check response metadata
        active_model = "gemini-2.5-flash-lite" 
        
        return {
            "answer": result["result"],
            "sources": sources,
            "model": active_model
        }
    except Exception as e:
        print(f"QUERY ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
