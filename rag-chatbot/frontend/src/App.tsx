import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Send, RefreshCw, Bot, User, Loader2, FileText,
  CheckCircle, Trash2, Moon, Sun, Menu, Plus,
  LayoutGrid, Clock, ExternalLink, X, LogOut
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

type UserData = {
  email: string;
  name: string;
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
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('vault_token'));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Axios Authorization Interceptor
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
      fetchDocuments();
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Handle OAuth Redirect Token
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const t = urlParams.get('token');
    if (t) {
      localStorage.setItem('vault_token', t);
      setToken(t);
      // Clean URL
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const fetchUser = async () => {
    try {
      const res = await axios.get(`${API_URL}/auth/me`);
      setUser({ email: res.data.email, name: res.data.name });
    } catch (err) {
      handleLogout();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
  }, []);

  const fetchDocuments = async () => {
    if (!localStorage.getItem('vault_token')) return;
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
      const errorMessage = error.response?.data?.detail || "I ran into an issue connecting to the RAG system.";
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

  const handleLogout = () => {
    localStorage.removeItem('vault_token');
    setToken(null);
    setUser(null);
    setDocuments([]);
  };

  const handleLogin = () => {
    window.location.href = `${API_URL}/auth/google/login`;
  };

  const handlePreviewFile = (filename: string) => {
    // Append token to the URL so the backend can authorize the iframe view
    const url = `${API_URL}/files/${filename}?token=${token}`;
    setSelectedFileUrl(url);
  };

  if (!token) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${isDarkMode ? 'bg-zinc-950' : 'bg-slate-50'}`}>
        <div className={`p-10 rounded-[2.5rem] shadow-2xl border flex flex-col items-center text-center max-w-md w-full mx-4 transition-all ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}>
          <div className="bg-indigo-600 p-4 rounded-3xl mb-8 shadow-xl shadow-indigo-500/20 rotate-3">
            <LayoutGrid className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black mb-3 bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Vault Brain</h1>
          <p className="opacity-60 mb-10 text-sm leading-relaxed">
            Your private AI knowledge workspace. Securely index and query your documents with Gemini 2.5 Flash-Lite.
          </p>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center space-x-3 p-4 bg-white text-zinc-900 border border-zinc-200 rounded-2xl font-bold hover:bg-zinc-50 transition-all shadow-sm active:scale-95"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            <span>Continue with Google</span>
          </button>
          <div className="mt-8 pt-8 border-t border-zinc-800/10 w-full text-[10px] uppercase tracking-widest opacity-30 font-bold">
            End-to-End Encrypted Retrieval
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900'} transition-colors duration-300`}>
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden transition-opacity" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 w-72 sm:w-80 lg:relative lg:z-20 flex flex-col border-r transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0'} ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
                <LayoutGrid className="w-5 h-5 text-white" />
              </div>
              <h2 className="font-bold text-lg tracking-tight">Vault Brain</h2>
            </div>
            {user && <div className="lg:hidden text-[10px] font-bold opacity-40">{user.email}</div>}
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
                {documents.map((doc, idx) => (
                  <div key={idx} className={`group flex items-center p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-zinc-800/40 border-zinc-700/50 hover:bg-zinc-800' : 'bg-slate-50 border-slate-100 hover:bg-white hover:shadow-sm'}`}>
                    <FileText className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" />
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-semibold truncate leading-tight">{doc.name}</p>
                      <div className="flex items-center mt-1">
                        {doc.status === 'uploading' ? <span className="text-[10px] text-zinc-400 flex items-center animate-pulse">processing</span> : <span className="text-[10px] text-emerald-500 flex items-center font-bold">INDEXED</span>}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => handlePreviewFile(doc.name)} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/30 rounded-lg"><ExternalLink className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteFile(doc.name)} className="p-1.5 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t dark:border-zinc-800 space-y-2">
            {user && (
              <div className={`flex items-center p-3 rounded-xl mb-2 ${isDarkMode ? 'bg-zinc-800/50' : 'bg-slate-50'}`}>
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs text-white font-bold mr-3">{user.name.charAt(0)}</div>
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-xs font-bold truncate">{user.name}</p>
                  <p className="text-[9px] opacity-40 truncate">{user.email}</p>
                </div>
                <button onClick={handleLogout} className="text-rose-500 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg"><LogOut className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <button onClick={clearChat} className="w-full flex items-center justify-center space-x-2 p-3 text-sm font-semibold border rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><RefreshCw className="w-4 h-4" /><span>New Chat</span></button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={`w-full flex items-center justify-center space-x-2 p-3 text-sm font-semibold rounded-xl transition-all ${isDarkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-100 text-slate-600'}`}>{isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}<span>Theme</span></button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className={`flex items-center justify-between px-6 py-4 border-b backdrop-blur-md ${isDarkMode ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white/80 border-slate-200'}`}>
          <div className="flex items-center space-x-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"><Menu className="w-5 h-5" /></button>
            <div>
              <h1 className="font-bold text-sm lg:text-base">Document Intelligence</h1>
              <div className="flex items-center text-[10px] uppercase font-bold opacity-40"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2" />Gemini 2.5 Active</div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="max-w-4xl mx-auto space-y-10 pb-20">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-20 text-center animate-in fade-in">
                <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mb-8 rotate-3"><Bot className="w-10 h-10 text-indigo-600" /></div>
                <h2 className="text-3xl lg:text-4xl font-extrabold mb-4 bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Public Intelligence, Private Context.</h2>
                <p className="max-w-xl text-lg opacity-60">Upload your docs to start a private retrieval session.</p>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in`}>
                <div className={`relative flex max-w-[90%] lg:max-w-[80%] space-x-4 ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-purple-600 text-white'}`}>
                    {message.role === 'user' ? <User className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className={`p-5 rounded-3xl ${message.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : isDarkMode ? 'bg-zinc-900 border border-zinc-800 rounded-tl-none text-zinc-100' : 'bg-white border rounded-tl-none text-slate-800'}`}>
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">{message.content}</div>
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-zinc-800/10 flex flex-wrap gap-2">
                          <div className="text-[10px] font-bold uppercase opacity-40 mr-1 w-full">Sources:</div>
                          {message.sources.map((src, i) => (
                            <button key={i} onClick={() => handlePreviewFile(src)} className={`flex items-center text-xs px-2.5 py-1 rounded-full border hover:border-indigo-500 transition-all ${isDarkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                              <FileText className="w-3 h-3 mr-1.5 opacity-50" />{src}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && <div className="flex justify-start animate-pulse"><div className="w-10 h-10 rounded-2xl bg-purple-600/50 mr-4" /><div className="h-20 w-64 bg-zinc-800/50 rounded-3xl" /></div>}
            <div ref={messagesEndRef} />
          </div>
        </main>

        <footer className={`p-6 sticky bottom-0 z-10 ${isDarkMode ? 'bg-zinc-950/60' : 'bg-slate-50/60'} backdrop-blur-xl`}>
          <div className="max-w-4xl mx-auto flex flex-col space-y-3">
            <div className="flex items-center space-x-2 px-2 overflow-x-auto pb-2 scrollbar-hide">
              <button onClick={() => setTargetDocument('All Documents')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase flex items-center flex-shrink-0 border ${targetDocument === 'All Documents' ? 'bg-indigo-600 text-white' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400'}`}><LayoutGrid className="w-3 h-3 mr-1.5" />All Vault</button>
              {documents.map((doc, idx) => (
                <button key={idx} onClick={() => setTargetDocument(doc.name)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase flex items-center flex-shrink-0 border ${targetDocument === doc.name ? 'bg-purple-600 text-white' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400'}`}><FileText className="w-3 h-3 mr-1.5" />{doc.name}</button>
              ))}
            </div>
            <form onSubmit={handleSend} className={`relative flex items-end border rounded-[2rem] overflow-hidden ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-800 shadow-xl'}`}>
              <div className="p-3 pl-5 mb-2">
                <label className="p-2 rounded-xl bg-zinc-800/50 cursor-pointer flex items-center justify-center hover:bg-zinc-700"><Plus className="w-5 h-5 text-indigo-500" /><input type="file" className="hidden" multiple accept=".pdf,.txt,.md" onChange={handleFileUpload} /></label>
              </div>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend(e))} placeholder="Message your private vault..." className="flex-1 max-h-48 p-5 bg-transparent resize-none outline-none text-base" rows={1} style={{ minHeight: '64px' }} />
              <div className="p-3 pr-5 mb-1.5"><button type="submit" disabled={!input.trim() || isLoading} className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white transition-all shadow-lg active:scale-95 disabled:opacity-50"><Send className="w-5 h-5" /></button></div>
            </form>
          </div>
        </footer>
      </div>

      {selectedFileUrl && (
        <aside className="fixed inset-0 z-50 lg:relative lg:inset-auto lg:w-[600px] xl:w-[750px] flex flex-col border-l animate-in slide-in-from-right duration-300 bg-white dark:bg-zinc-900 border-zinc-800 shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <div className="flex items-center space-x-3"><div className="p-2 bg-indigo-600/10 rounded-lg"><FileText className="w-5 h-5 text-indigo-600" /></div><h3 className="font-bold text-sm truncate max-w-[200px]">{selectedFileUrl.split('/').pop()}</h3></div>
            <button onClick={() => setSelectedFileUrl(null)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors"><X className="w-5 h-5 opacity-50" /></button>
          </div>
          <div className="flex-1 bg-zinc-950 overflow-hidden relative"><iframe src={`${selectedFileUrl}#view=FitH`} className="w-full h-full border-none" title="PDF Preview" /></div>
        </aside>
      )}
    </div>
  );
}
