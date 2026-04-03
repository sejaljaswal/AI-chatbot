import os
import argparse
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate

# Load environment variables
load_dotenv()

# Verify API Key
if not os.getenv("GOOGLE_API_KEY"):
    print("\nError: GOOGLE_API_KEY not found in .env. Please add it.")
    exit(1)

def setup_rag():
    # 1. Load documents
    print("\n[RAG Setup] Loading documents from ./docs...")
    docs_dir = './docs'
    documents = []
    if not os.path.exists(docs_dir):
        print(f"Error: {docs_dir} directory not found.")
        exit(1)
        
    file_paths = [os.path.join(docs_dir, f) for f in os.listdir(docs_dir) if f.endswith('.md')]
    for file_path in file_paths:
        try:
            loader = TextLoader(file_path, encoding='utf-8')
            documents.extend(loader.load())
        except Exception as e:
            print(f"Skipping {file_path} due to error: {e}")
    
    if not documents:
        print("No documents found to index.")
        exit(1)
        
    # 2. Split documents
    print("[RAG Setup] Splitting documents into chunks...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    texts = text_splitter.split_documents(documents)
    
    # 3. Create embeddings and vector store
    # Use embedding-001 (Google's standard embedding model)
    print("[RAG Setup] Creating embeddings (models/gemini-embedding-001)...")
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    vectorstore = FAISS.from_documents(texts, embeddings)
    
    # 4. Initialize LLM with fallback mechanism for 404/429 errors
    print("[RAG Setup] Initializing Gemini LLM (gemini-1.5-flash) with fallbacks...")
    
    # Primary model with max_retries for 429 errors
    primary_llm = ChatGoogleGenerativeAI(
        model="gemini-1.5-flash", 
        temperature=0, 
        max_retries=3
    )
    
    # Fallback model when primary fails (e.g., 404 error)
    fallback_llm = ChatGoogleGenerativeAI(
        model="gemini-pro", 
        temperature=0, 
        max_retries=3
    )
    
    # Secondary fallback for ensuring at least one available model works
    fallback_llm_2 = ChatGoogleGenerativeAI(
        model="gemini-flash-latest", 
        temperature=0, 
        max_retries=3
    )
    
    # Combine with fallbacks to automatically switch
    llm = primary_llm.with_fallbacks([fallback_llm, fallback_llm_2])
    retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 3})
    
    # 5. Create Prompt
    template = """
    You are a helpful assistant that answers questions based on provided documents.
    Provide proper formatted answer with proper heading and sub headings and paragraphs

    Context information from documents:
    {context}

    Question: {question}

    Answer the question based only on the provided context. If you don't know the answer or cannot find it in the context, say "I couldn't find this information in the provided documents." Include specific details and cite the sources of information.
    """
    prompt = PromptTemplate(template=template, input_variables=["context", "question"])
    
    # 6. Create QA Chain
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        return_source_documents=True,
        chain_type_kwargs={"prompt": prompt}
    )
    
    return qa_chain

def main():
    try:
        qa_chain = setup_rag()
    except Exception as e:
        print(f"\n[Fatal Error] Could not initialize RAG system: {e}")
        exit(1)
    
    print("\n" + "*"*50)
    print("RAG System (Powered by Gemini) is Ready!")
    print("*"*50)
    print("Type 'exit' or 'quit' to stop.\n")
    
    while True:
        try:
            query = input("Ask a question: ")
        except (KeyboardInterrupt, EOFError):
            print("\nExiting...")
            break
            
        if query.lower() in ['exit', 'quit']:
            break
            
        if not query.strip():
            continue
            
        print("\nSearching relevant docs and generating answer with Gemini...")
        try:
            result = qa_chain.invoke({"query": query})
            print("\n" + "="*50)
            print("ANSWER:")
            print(result["result"])
            print("="*50 + "\n")
        except Exception as e:
            print(f"Error generating answer: {e}")

if __name__ == "__main__":
    main()
