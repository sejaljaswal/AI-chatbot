import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from authlib.integrations.starlette_client import OAuth
from jose import jwt, JWTError
from starlette.middleware.sessions import SessionMiddleware
import time
import json
from datetime import datetime

from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import TextLoader, PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate
import certifi
import httpx

# Load environment variables from the root .env
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

# Fix SSL Certificate Verification (especially for macOS)
os.environ['SSL_CERT_FILE'] = certifi.where()

app = FastAPI()

# 1. ADD SESSION MIDDLEWARE (Inner-most for Authlib)
SECRET_KEY = os.getenv("JWT_SECRET") or "insecure-default-key-change-me"
app.add_middleware(
    SessionMiddleware, 
    secret_key=SECRET_KEY, 
    session_cookie="vault_session",
    same_site="lax",
    https_only=False
)

# 2. ALLOW CORS (Outer Middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Your Vite frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root directory configuration
DOCS_ROOT = "docs"
FAISS_ROOT = "faiss_index"
CHAT_HISTORY_ROOT = "chat_history"

# AUTH CONFIG
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SECRET_KEY = os.getenv("JWT_SECRET")

print("\n--- [System Configuration Check] ---")
if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
    print("FATAL ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from .env!")
    print("Please add them to /Users/sejaljaswal/Desktop/Langchain-master/rag-chatbot/.env")
    # In a real production app, you might raise a SystemExit here
    # For now, we will print big warnings to catch the user's attention
    print("************************************************")
    print("*  GOOGLE OAUTH IS CURRENTLY BROKEN            *")
    print("*  ADD YOUR KEYS TO THE .env FILE              *")
    print("************************************************")
else:
    # Safely log that they are loaded
    print(f"LOADED: GOOGLE_CLIENT_ID = {GOOGLE_CLIENT_ID[:10]}...{GOOGLE_CLIENT_ID[-5:]}")
    print(f"LOADED: GOOGLE_CLIENT_SECRET = (Hidden for security)")

if not SECRET_KEY:
    print("WARNING: JWT_SECRET is not set. Using insecure default.")
    SECRET_KEY = "insecure-default-key-change-me"
else:
    print("LOADED: JWT_SECRET = (Hidden)")

ALGORITHM = "HS256"

# Setup User-specific state cache
# In production, use Redis or a DB. For local, we use a dictionary.
user_systems = {} # {user_id: {"vs": vectorstore, "qa": qa_chain}}

# AUTH SETUP
oauth = OAuth()
oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

print("\n--- [System Configuration Check] ---")
if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
    print("FATAL ERROR: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from .env!")
else:
    print(f"LOADED: GOOGLE_CLIENT_ID = {GOOGLE_CLIENT_ID[:5]}...[SECURE]")

ALGORITHM = "HS256"
def create_access_token(data: dict):
    to_encode = data.copy()
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(request: Request, token: str = None):
    # Check Header First
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    # Check Query Param if no header (used for iframes/previews)
    if not token:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Global LLM Configuration with Fallbacks
# Updated to Gemini 2.5 series based on accessible models list
p_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0, max_retries=3)
f_llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro", temperature=0, max_retries=3)
shared_llm = p_llm.with_fallbacks([f_llm])

embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

def get_qa_chain(vs, retriever=None):
    # Use provided retriever or create a default one
    if not retriever:
        retriever = vs.as_retriever(search_type="similarity", search_kwargs={"k": 8})
    
    template = """
    You are an AI assistant. Answer clearly using the provided context.

    Rules:
    * Use proper paragraphs
    * Use bullet points where needed
    * Highlight important points (use bolding or italics)
    * Keep answers concise but informative
    * Do NOT hallucinate. 
    * If not found in the context, explicitly say 'Not found in documents'

    ---
    Context:
    {context}
    ---

    Question: {question}

    Answer:
    """
    prompt = PromptTemplate(template=template, input_variables=["context", "question"])
    
    return RetrievalQA.from_chain_type(
        llm=shared_llm,
        retriever=retriever,
        return_source_documents=True,
        chain_type_kwargs={"prompt": prompt}
    )

def get_history_file(user_id: str):
    user_history_dir = os.path.join(CHAT_HISTORY_ROOT, user_id)
    if not os.path.exists(user_history_dir):
        os.makedirs(user_history_dir)
    return os.path.join(user_history_dir, "history.json")

def load_user_history(user_id: str):
    file_path = get_history_file(user_id)
    if not os.path.exists(file_path):
        return []
    with open(file_path, "r") as f:
        try:
            return json.load(f)
        except:
            return []

def save_user_chat(user_id: str, query: str, answer: str, sources: list = []):
    history = load_user_history(user_id)
    chat_entry = {
        "id": str(time.time()),
        "query": query,
        "answer": answer,
        "sources": sources,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    history.append(chat_entry)
    with open(get_history_file(user_id), "w") as f:
        json.dump(history, f, indent=2)
    return chat_entry

def init_user_rag(user_id: str):
    """Initializes or reloads the RAG system for a specific user."""
    print(f"\n--- [RAG System Init for User: {user_id}] ---")
    
    user_docs_dir = os.path.join(DOCS_ROOT, user_id)
    user_faiss_dir = os.path.join(FAISS_ROOT, user_id)
    
    if not os.path.exists(user_docs_dir):
        os.makedirs(user_docs_dir)

    vs = None
    qa = None

    if os.path.exists(user_faiss_dir):
        print(f"Loading user index from {user_faiss_dir}...")
        vs = FAISS.load_local(user_faiss_dir, embeddings, allow_dangerous_deserialization=True)
        qa = get_qa_chain(vs)
    else:
        file_names = [f for f in os.listdir(user_docs_dir) if f.lower().endswith(('.md', '.txt', '.pdf'))]
        if file_names:
            documents = []
            for filename in file_names:
                file_path = os.path.join(user_docs_dir, filename)
                try:
                    loader = PyPDFLoader(file_path) if filename.lower().endswith('.pdf') else TextLoader(file_path, encoding='utf-8')
                    documents.extend(loader.load())
                except Exception as e:
                    print(f"ERROR: {filename}: {e}")

            if documents:
                text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
                texts = text_splitter.split_documents(documents)
                vs = FAISS.from_documents(texts, embeddings)
                vs.save_local(user_faiss_dir)
                qa = get_qa_chain(vs)
    
    if vs:
        print(f"SUCCESS: System ready for {user_id} with {vs.index.ntotal} vectors.")
    else:
        print(f"INFO: Vault is currently empty for user {user_id}.")
    
    user_systems[user_id] = {"vs": vs, "qa": qa}
    print(f"--- [Success] Vault isolation established for: {user_id} ---")
    return user_systems[user_id]

@app.get("/auth/google/login")
async def login(request: Request):
    # frontend_url = request.query_params.get("redirect_uri")
    redirect_uri = request.url_for('auth_callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/auth/google/callback")
async def auth_callback(request: Request):
    print("\n--- [OAuth Callback Hit] ---")
    print(f"Query Params: {request.query_params}")
    
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get('userinfo')
        if not user_info:
            print("ERROR: No user info found in token")
            return {"error": "Google authentication failed", "details": "No user info"}
        
        print(f"User Authed: {user_info['email']}")
        
        # Store user/create session
        user_id = user_info['email'].replace("@", "_").replace(".", "_")
        jwt_token = create_access_token({"sub": user_id, "email": user_info['email'], "name": user_info['name']})
        
        # Init their RAG system
        init_user_rag(user_id)
        
        frontend_url = os.getenv("FRONTEND_URL") or "http://localhost:5173"
        print(f"Redirecting to {frontend_url}")
        return RedirectResponse(url=f"{frontend_url}?token={jwt_token}")
        
    except Exception as e:
        print(f"OAUTH ERROR: {type(e).__name__} - {e}")
        # Return helpful error for debugging
        return {
            "error": "OAuth Callback Failed",
            "type": type(e).__name__,
            "details": str(e),
            "msg": "Make sure your GOOGLE_CLIENT_ID and SECRET are set in .env"
        }

@app.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return user

@app.on_event("startup")
async def startup_event():
    if not os.path.exists(DOCS_ROOT): os.makedirs(DOCS_ROOT)
    if not os.path.exists(FAISS_ROOT): os.makedirs(FAISS_ROOT)
    if not os.path.exists(CHAT_HISTORY_ROOT): os.makedirs(CHAT_HISTORY_ROOT)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/documents")
async def list_documents(user=Depends(get_current_user)):
    user_id = user['sub']
    user_docs_dir = os.path.join(DOCS_ROOT, user_id)
    if not os.path.exists(user_docs_dir):
        return {"documents": []}
    files = [f for f in os.listdir(user_docs_dir) if f.lower().endswith(('.md', '.txt', '.pdf'))]
    return {"documents": files}

@app.delete("/documents/{filename}")
async def delete_document(filename: str, user=Depends(get_current_user)):
    user_id = user['sub']
    user_docs_dir = os.path.join(DOCS_ROOT, user_id)
    user_faiss_dir = os.path.join(FAISS_ROOT, user_id)
    
    file_path = os.path.join(user_docs_dir, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        print(f"Deleted file: {filename} for user {user_id}. Rebuilding index...")
        if os.path.exists(user_faiss_dir):
            shutil.rmtree(user_faiss_dir)
        init_user_rag(user_id)
        return {"message": f"Successfully deleted {filename}."}
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.get("/files/{filename}")
async def serve_file(filename: str, user=Depends(get_current_user)):
    """Serves a document file for previewing, ensuring user isolation."""
    user_id = user['sub']
    # Sanitize filename and strictly enforce user path
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(DOCS_ROOT, user_id, safe_filename)
    
    print(f"--- [Security] User {user_id} accessing file {safe_filename} ---")
    
    if not os.path.exists(file_path):
        print(f"--- [Security Failure] File {file_path} not found or access denied ---")
        raise HTTPException(status_code=404, detail="File not found")
    
    # Return FileResponse with proper headers for PDF viewing
    return FileResponse(
        file_path, 
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"} # Encourage browser to preview, not download
    )

@app.post("/upload")
async def upload_document(file: UploadFile = File(...), user=Depends(get_current_user)):
    user_id = user['sub']
    user_docs_dir = os.path.join(DOCS_ROOT, user_id)
    user_faiss_dir = os.path.join(FAISS_ROOT, user_id)
    
    # Ensure user-specific directory exists
    if not os.path.exists(user_docs_dir):
        os.makedirs(user_docs_dir)
    
    # Sanitize filename
    safe_filename = os.path.basename(file.filename)
    file_location = os.path.join(user_docs_dir, safe_filename)
    
    print(f"--- [Upload] Processing file {safe_filename} for user {user_id} ---")
    
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        print(f"--- [In-App Processing for {user['email']}] ---")
        loader = PyPDFLoader(file_location) if file.filename.lower().endswith('.pdf') else TextLoader(file_location, encoding='utf-8')
        new_docs = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        new_texts = text_splitter.split_documents(new_docs)
        print(f"Processed {len(new_texts)} chunks from {file.filename}.")
        
        # Get or init user system
        system = user_systems.get(user_id) or init_user_rag(user_id)
        vs = system['vs']
        
        if vs:
            print(f"Updating existing index for {user_id}...")
            vs.add_documents(new_texts)
            vs.save_local(user_faiss_dir)
        else:
            print(f"Creating first index for {user_id}...")
            vs = FAISS.from_documents(new_texts, embeddings)
            vs.save_local(user_faiss_dir)
        
        # IMPORTANT: Always rebuild the chain after updating the vectorstore
        user_systems[user_id] = {"vs": vs, "qa": get_qa_chain(vs)}
        print(f"Vault Updated! Total vectors now: {vs.index.ntotal}")
        
        return {
            "message": f"Successfully added {file.filename} to vault.",
            "filename": file.filename,
            "status": "uploaded"
        }
    except Exception as e:
        print(f"INGESTION ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class QueryRequest(BaseModel):
    query: str
    filename: str = None # Optional filter

@app.post("/query")
async def query_backend(req: QueryRequest, user=Depends(get_current_user)):
    user_id = user['sub']
    query = req.query.strip()
    
    # 2. Log inputs
    print(f"\n--- [QUERY DEBUG: {user['email']}] ---")
    print(f"Query: {query}")

    # 3. Validate query
    if not query:
        print("QUERY ERROR: Empty query")
        return {"answer": "Please enter a question.", "sources": [], "model": "System"}

    try:
        system = user_systems.get(user_id) or init_user_rag(user_id)
        vs = system.get('vs')
        
        # 4. Check vectorstore
        if not vs:
            print("QUERY ERROR: No vectorstore found for user")
            return {"answer": "No documents uploaded. Please upload PDFs to begin.", "sources": [], "model": "System"}

        # Determine if we need to filter
        filter_dict = {}
        if req.filename and req.filename != "All Documents":
            filter_dict = {"source": os.path.join(DOCS_ROOT, user_id, req.filename)}
            print(f"Filtering by source: {filter_dict['source']}")

        # 5. Check retriever & Get relevant documents
        retriever = vs.as_retriever(search_type="similarity", search_kwargs={"k": 8, "filter": filter_dict})
        docs = retriever.invoke(query)
        print(f"Retrieved {len(docs)} chunks")

        # 6. Handle empty docs
        if not docs:
            print("QUERY ERROR: No relevant documents found")
            return {"answer": "I couldn't find any relevant information in your uploaded documents.", "sources": [], "model": "RAG"}

        # 7. & 8. Build and validate context
        context_parts = []
        for doc in docs:
            if doc.page_content and doc.page_content.strip():
                context_parts.append(doc.page_content)
        
        context = "\n---\n".join(context_parts)
        if not context:
            return {"answer": "The retrieved document snippets were empty or unreadable.", "sources": [], "model": "RAG"}

        # Prepare source citations
        unique_sources = list(set([os.path.basename(doc.metadata.get("source", "Unknown")) for doc in docs]))

        # 9. CONSTRUCT FINAL PROMPT
        final_prompt = f"""You are an AI assistant. Answer clearly using the provided context.

Rules:
* Use proper paragraphs
* Use bullet points where needed
* Highlight important points
* Keep answers concise but informative
* Do NOT hallucinate
* If not found, say 'Not found in documents'

Context:
{context}

Question:
{query}

Answer:"""

        # 9. ASYNC STREAMING GENERATOR
        async def response_generator():
            full_response = ""
            # Yield metadata (sources) first as a single line
            yield f"__SOURCES__:{json.dumps(unique_sources)}\n"
            
            try:
                # Use astream for real-time chunking
                async for chunk in shared_llm.astream(final_prompt):
                    content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                    full_response += content
                    yield content
                
                # 10. Persist to history after the stream finishes
                save_user_chat(user_id, query, full_response, unique_sources)
                print(f"Stream complete. History saved for {user['email']}.")
            except Exception as stream_err:
                print(f"STREAM ERROR: {stream_err}")
                yield f"\n[STREAM ERROR]: {str(stream_err)}"

        return StreamingResponse(response_generator(), media_type="text/plain")

    except Exception as e:
        print(f"QUERY ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={
            "answer": f"An internal error occurred: {str(e)}",
            "sources": [],
            "model": "Error Debugger"
        })

# CHAT HISTORY ENDPOINTS
@app.get("/history")
async def get_history(user=Depends(get_current_user)):
    user_id = user['sub']
    return {"history": load_user_history(user_id)}

@app.delete("/history/{chat_id}")
async def delete_chat_entry(chat_id: str, user=Depends(get_current_user)):
    user_id = user['sub']
    history = load_user_history(user_id)
    new_history = [c for c in history if c['id'] != chat_id]
    
    with open(get_history_file(user_id), "w") as f:
        json.dump(new_history, f, indent=2)
    return {"message": "Chat deleted successfully."}

# Note: Global DELETE /history is disabled to prevent accidental data loss.
# Only individual chat deletion is supported via DELETE /history/{chat_id}

if __name__ == "__main__":
    import uvicorn
    # Use reload=True if you're developing and making frequent changes
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
