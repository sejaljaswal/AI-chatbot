# AI RAG Chatbot

An advanced Retrieval-Augmented Generation (RAG) Chatbot application powered by FastAPI, React, Langchain, and Google Generative AI (Gemini). It allows users to securely authenticate via Google OAuth, upload documents (PDF, TXT, MD), and ask context-aware questions against their own isolate document vaults. 

## Live Demo

🚀 **[Click here to view the live deployment](<https://ai-rag-chatbot-kohl.vercel.app/>)**

## Features

- **Document Ingestion:** Upload and parse PDF, TXT, and Markdown files securely.
- **RAG Architecture:** Leverages Langchain and FAISS vector database to retrieve highly relevant context for accurate answering.
- **Google Generative AI (Gemini):** Uses Google's state-of-the-art embedding models and Gemini-2.5-flash / Gemini-2.5-pro with smart fallback mechanisms.
- **Secure Isolation:** Per-user vaults ensure that users can only query information from documents they have uploaded themselves.
- **Google OAuth Authentication:** Seamless and secure sign-in process for users using Authlib.
- **Streaming Responses:** Get real-time answers as the AI generates them stream-by-stream.
- **Chat History Management:** Full persistent chat history, enabling users to revisit previous Q&A sessions. Delete individual chat entries easily.

## Technology Stack

### Backend
- **Framework:** FastAPI
- **LLM/Embeddings:** Google Generative AI (Gemini)
- **RAG Framework:** Langchain
- **Vector Store:** FAISS
- **Authentication:** Authlib (Google OAuth), Python-JOSE (JWT)
- **Document Loading:** PyMuPDF / Langchain Text and PDF Loaders

### Frontend
- **Framework:** React / Vite
- **Styling:** Tailwind CSS

---

## Prerequisites

Before starting, ensure you have the following installed:
- Python 3.9+
- Node.js (v16+)
- A [Google Cloud Console](https://console.cloud.google.com/) Project with OAuth 2.0 Credentials
- Google Gemini API Key

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd rag-chatbot
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory (`rag-chatbot/.env`) and add the following keys.

```env
# Google Gemini API Key
GOOGLE_API_KEY=your_gemini_api_key_here

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret_here

# JWT Secret for session management
JWT_SECRET=your_super_secret_jwt_key_here

# Frontend URL (For CORS and OAuth Callback)
FRONTEND_URL=http://localhost:5173
```

### 3. Backend Setup

Open a terminal and navigate to the backend directory:

```bash
# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Run the FastAPI server
cd backend
python main.py
```
*The backend server will run at http://localhost:8000*

### 4. Frontend Setup

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend

# Install dependencies
npm install

# Run the Vite development server
npm run dev
```
*The frontend will run at http://localhost:5173*

---

## How It Works

1. **Authentication:** User logs in with Google. The FastAPI backend handles the OAuth flow and returns a JWT access token.
2. **Uploading Docs:** When a user uploads a document, the system initializes an isolated directory and FAISS vector index. The text is split into chunks of 1000 characters with 200 character overlap.
3. **Querying:** As a question is asked, it goes through a vector similarity search across the FAISS index to find the most relevant document chunks.
4. **LLM Generation:** The context and the question are supplied to Gemini 2.5 Flash (with fallback to 2.5 Pro) to synthesize a highly accurate, properly formatted answer. Sources are also provided.

## Directory Structure

- `/backend` - Contains FastAPI application (`main.py`)
- `/frontend` - Contains React+Vite frontend application and Tailwind configurations
- `/docs` - Automatically generated per-user directory where raw document uploads are stored
- `/faiss_index` - Automatically generated directory storing vectors for the FAISS database per user
- `/chat_history` - Contains JSON files representing Q&A history grouped by user

## Troubleshooting

- **Google OAuth Login Failing:** Ensure that your Google Console OAuth Redirect URIs perfectly match the backend endpoint handling callbacks (e.g. `http://localhost:8000/auth/google/callback`).
- **No Documents Retrieved:** Confirm your uploaded PDF/TXT contains selectable text and is not strictly image-based. You can verify this by checking if it extracts properly.
- **SSL Certificates on macOS:** The backend has built-in code (`certifi`) to fix SSL verification failures during Langchain / Gemini operations.
