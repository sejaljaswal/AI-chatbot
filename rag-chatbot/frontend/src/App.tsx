import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Send, RefreshCw, Bot, User, Loader2, FileText,
  CheckCircle, Trash2, Moon, Sun, Menu, Plus,
  LayoutGrid, Clock, ExternalLink, X
} from 'lucide-react';

type Message = {
  id: string;
  role: 'user' | 'bot';
  content: string;
  sources?: string[];
  model?: string;
  timestamp: string;
};

type DocFile = {
  name: string;
  status: 'uploaded' | 'uploading' | 'error';
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [targetDocument, setTargetDocument] = useState('All Documents');
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchDocuments();
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_URL}/documents`);
      const docs = res.data.documents.map((name: string) => ({ name, status: 'uploaded' }));
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setDocuments(prev => [{ name: file.name, status: 'uploading' }, ...prev]);
      const formData = new FormData();
      formData.append('file', file);
      try {
        await axios.post(`${API_URL}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setDocuments(prev => prev.map(d =>
          d.name === file.name ? { ...d, status: 'uploaded' } : d
        ));
      } catch (err) {
        console.error(err);
        setDocuments(prev => prev.map(d =>
          d.name === file.name ? { ...d, status: 'error' } : d
        ));
      }
    }
    e.target.value = '';
  };

  const handleDeleteFile = async (filename: string) => {
    try {
      await axios.delete(`${API_URL}/documents/${filename}`);
      setDocuments(prev => prev.filter(d => d.name !== filename));
      if (targetDocument === filename) setTargetDocument('All Documents');
    } catch (err) {
      console.error(err);
      alert('Failed to delete document.');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await axios.post(`${API_URL}/query`, {
        query: userMessage.content,
        filename: targetDocument
      });

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: res.data.answer,
        sources: res.data.sources,
        model: res.data.model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.response?.data?.detail || "I ran into an issue connecting to the RAG system. Please ensure documents are uploaded.";
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: errorMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const handlePreviewFile = (filename: string) => {
    // Generate the URL for the backend file service
    const url = `${API_URL}/files/${filename}`;
    setSelectedFileUrl(url);
  };

  return (
    <div className={`flex h-screen ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900'} transition-colors duration-300`}>

      {/* 1. Sidebar - Left Panel */}
      <aside className={`
        ${isSidebarOpen ? 'w-80' : 'w-0'} 
        flex flex-col border-r transition-all duration-300 overflow-hidden
        ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}
        relative z-20
        `}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
                <LayoutGrid className="w-5 h-5 text-white" />
              </div>
              <h2 className="font-bold text-lg tracking-tight">Vault Brain</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-widest opacity-40">Knowledge Base</h3>
                <label className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md cursor-pointer transition-colors">
                  <Plus className="w-4 h-4" />
                  <input type="file" className="hidden" multiple accept=".pdf,.txt,.md" onChange={handleFileUpload} />
                </label>
              </div>

              <div className="space-y-2">
                {documents.length === 0 && (
                  <p className="text-sm opacity-40 italic">No documents indexed yet.</p>
                )}
                {documents.map((doc, idx) => (
                  <div key={idx} className={`
                    group flex items-center p-3 rounded-xl border transition-all
                    ${isDarkMode ? 'bg-zinc-800/40 border-zinc-700/50 hover:bg-zinc-800' : 'bg-slate-50 border-slate-100 hover:bg-white hover:shadow-sm'}
                  `}>
                    <FileText className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" />
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold truncate leading-tight">{doc.name}</p>
                      <div className="flex items-center mt-1">
                        {doc.status === 'uploading' ? (
                          <span className="text-[10px] text-zinc-400 flex items-center">
                            <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" /> processing
                          </span>
                        ) : doc.status === 'uploaded' ? (
                          <span className="text-[10px] text-emerald-500 flex items-center font-bold">
                            <CheckCircle className="w-2.5 h-2.5 mr-1" /> INDEXED
                          </span>
                        ) : (
                          <span className="text-[10px] text-rose-500 flex items-center font-bold">ERROR</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => handlePreviewFile(doc.name)}
                        className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/30 rounded-lg transition-all"
                        title="Preview Document"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(doc.name)}
                        className="p-1.5 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 rounded-lg transition-all"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t dark:border-zinc-800 space-y-2">
            <button
              onClick={clearChat}
              className="w-full flex items-center justify-center space-x-2 p-3 text-sm font-semibold border rounded-xl hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>New Conversation</span>
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`
                w-full flex items-center justify-center space-x-2 p-3 text-sm font-semibold rounded-xl transition-all
                ${isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
              `}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Chat - Right Panel */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Top Navbar */}
        <header className={`
            flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10 backdrop-blur-md
            ${isDarkMode ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white/80 border-slate-200'}
        `}>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-sm lg:text-base">Document Intelligence v1.0</h1>
              <div className="flex items-center text-[10px] uppercase tracking-widest font-bold opacity-40">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                Gemini Multimodal Active
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-3 text-xs opacity-50">
            <Clock className="w-3 h-3" />
            <span>Current Session: {new Date().toLocaleDateString()}</span>
          </div>
        </header>

        {/* 3. Messages Container */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-10 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-10 pb-20">

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mb-8 rotate-3 hover:rotate-0 transition-transform cursor-default">
                  <Bot className="w-10 h-10 text-indigo-600" />
                </div>
                <h2 className="text-3xl lg:text-4xl font-extrabold mb-4 bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                  Hello! I'm your Vault Assistant.
                </h2>
                <p className="max-w-xl text-lg opacity-60 leading-relaxed">
                  Start by uploading your private documents in the sidebar. I'll analyze every detail to give you precise answers with citations.
                </p>
                <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                  <div className="p-4 border rounded-2xl dark:border-zinc-800/50 bg-white/5 dark:bg-zinc-900/20 backdrop-blur-sm text-sm text-left hover:scale-[1.02] transition-transform">
                    <Plus className="w-4 h-4 text-indigo-500 mb-2" />
                    <span className="font-bold block mb-1">Index Docs</span>
                    <span className="opacity-60 text-xs">Upload PDFs, TXTs or MDs from the sidebar.</span>
                  </div>
                  <div className="p-4 border rounded-2xl dark:border-zinc-800/50 bg-white/5 dark:bg-zinc-900/20 backdrop-blur-sm text-sm text-left hover:scale-[1.02] transition-transform delay-75">
                    <Send className="w-4 h-4 text-purple-500 mb-2" />
                    <span className="font-bold block mb-1">Ask Anything</span>
                    <span className="opacity-60 text-xs">Query specific facts or ask for summaries.</span>
                  </div>
                  <div className="p-4 border rounded-2xl dark:border-zinc-800/50 bg-white/5 dark:bg-zinc-900/20 backdrop-blur-sm text-sm text-left hover:scale-[1.02] transition-transform delay-150">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mb-2" />
                    <span className="font-bold block mb-1">Verified Citations</span>
                    <span className="opacity-60 text-xs">Every answer points back to its source.</span>
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`group flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}
              >
                <div className={`
                    relative flex max-w-[90%] lg:max-w-[80%] space-x-4
                    ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}
                `}>
                  {/* Avatar */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-110
                    ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-purple-600 text-white'}
                  `}>
                    {message.role === 'user' ? <User className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                  </div>

                  <div className="flex flex-col space-y-2">
                    {/* Message Bubble */}
                    <div className={`
                      p-5 rounded-3xl shadow-sm text-[15px] leading-relaxed
                      ${message.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : isDarkMode ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-tl-none' : 'bg-white border text-slate-800 rounded-tl-none'
                      }
                    `}>
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        {message.content}
                      </div>

                      {/* Bot Message Features */}
                      {message.role === 'bot' && (
                        <>
                          {message.sources && message.sources.length > 0 && (
                            <div className={`mt-5 pt-4 border-t ${isDarkMode ? 'border-zinc-800' : 'border-slate-100'} flex flex-wrap items-center gap-2`}>
                              <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mr-1">Sources</div>
                              {message.sources.map((src, i) => (
                                <button
                                  key={i}
                                  onClick={() => handlePreviewFile(src)}
                                  className={`
                                    flex items-center text-xs px-2.5 py-1 rounded-full border hover:border-indigo-500 hover:text-indigo-500 transition-all
                                    ${isDarkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-slate-50 border-slate-200'}
                                `}>
                                  <FileText className="w-3 h-3 mr-1.5 opacity-50" />
                                  <span className="truncate max-w-[120px]">{src}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="mt-4 flex items-center justify-between text-[10px] font-bold tracking-widest opacity-30 italic">
                            <span>Model: {message.model || 'Gemini Optimized'}</span>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Timestamp */}
                    <div className={`text-[10px] opacity-40 font-bold uppercase px-1 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                      {message.timestamp}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start animate-pulse">
                <div className="flex max-w-[80%] space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-purple-600/50 flex items-center justify-center text-white">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div className={`p-5 rounded-3xl rounded-tl-none shadow-sm flex flex-col space-y-3 ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border'}`}>
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1.5">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                      </div>
                      <span className="text-sm opacity-50 font-medium italic">Consulting Vault Intelligence...</span>
                    </div>
                    <div className={`h-2.5 w-48 rounded-full ${isDarkMode ? 'bg-zinc-800' : 'bg-slate-100'}`}></div>
                    <div className={`h-2.5 w-32 rounded-full ${isDarkMode ? 'bg-zinc-800' : 'bg-slate-100'}`}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* 4. Glassmorphic Input Area */}
        <footer className={`
            p-6 sticky bottom-0 z-10
            ${isDarkMode ? 'bg-zinc-950/60' : 'bg-slate-50/60'} backdrop-blur-xl
        `}>
          <div className="max-w-4xl mx-auto flex flex-col space-y-3">
            {/* Scope Selector */}
            <div className="flex items-center space-x-2 px-2 overflow-x-auto pb-2 scrollbar-hide">
              <button
                onClick={() => setTargetDocument('All Documents')}
                className={`
                  px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight flex items-center flex-shrink-0 transition-all border
                  ${targetDocument === 'All Documents'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : (isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50')}
                `}
              >
                <LayoutGrid className="w-3 h-3 mr-1.5" /> All Vault
              </button>
              {documents.filter(d => d.status === 'uploaded').map((doc, idx) => (
                <button
                  key={idx}
                  onClick={() => setTargetDocument(doc.name)}
                  className={`
                    px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight flex items-center flex-shrink-0 transition-all border
                    ${targetDocument === doc.name
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md scale-105'
                      : (isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50')}
                  `}
                >
                  <FileText className="w-3 h-3 mr-1.5" /> {doc.name}
                </button>
              ))}
            </div>

            <form
              onSubmit={handleSend}
              className={`
                relative flex items-end border rounded-[2rem] overflow-hidden focus-within:ring-4 focus-within:ring-indigo-500/20 transition-all shadow-2xl
                ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-800'}
              `}
            >
              <div className="p-3 pl-5 mb-2">
                <label className={`
                  p-2 rounded-xl cursor-pointer transition-all hover:opacity-100
                  ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-slate-100 hover:bg-slate-200'}
                  opacity-40 flex items-center justify-center
                `}>
                  <Plus className="w-5 h-5 text-indigo-500" />
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.txt,.md"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Message Vault..."
                className="flex-1 max-h-48 p-5 bg-transparent resize-none outline-none text-base placeholder-zinc-500"
                rows={1}
                style={{ minHeight: '64px' }}
              />

              <div className="p-3 pr-5 mb-1.5 flex items-center space-x-3">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={`
                    flex items-center justify-center w-12 h-12 rounded-2xl transition-all shadow-lg active:scale-95
                    ${!input.trim() || isLoading
                      ? (isDarkMode ? 'bg-zinc-800 text-zinc-600' : 'bg-slate-100 text-slate-400')
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20'
                    }
                  `}
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </form>
            <div className="text-[9px] text-center mt-4 uppercase tracking-[0.2em] font-black opacity-30">
              End-to-End Encrypted Retrieval Pipeline
            </div>
          </div>
        </footer>
      </div>

      {/* 3. PDF Preview Panel - Slides from Right */}
      {selectedFileUrl && (
        <aside className={`
          w-[500px] lg:w-[650px] flex flex-col border-l animate-in slide-in-from-right duration-300
          ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}
          relative z-30 shadow-2xl
        `}>
          <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-zinc-800' : 'border-slate-200'}`}>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-600/10 rounded-lg">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-bold text-sm truncate max-w-[300px]">
                {selectedFileUrl.split('/').pop()}
              </h3>
            </div>
            <button
              onClick={() => setSelectedFileUrl(null)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 opacity-50" />
            </button>
          </div>
          <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 overflow-hidden">
            <iframe
              src={`${selectedFileUrl}#toolbar=0`}
              className="w-full h-full border-none"
              title="PDF Preview"
            />
          </div>
        </aside>
      )}
    </div>
  );
}
