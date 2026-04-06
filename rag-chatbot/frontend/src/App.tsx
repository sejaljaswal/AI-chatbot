import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Send, Bot, User, FileText,
  Trash2, Moon, Sun, Menu, Plus,
  LayoutGrid, ExternalLink, X, LogOut,
  Maximize2, Minimize2, ChevronLeft, ChevronRight,
  MessageSquare
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [targetDocument, setTargetDocument] = useState('All Documents');
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [viewerSize, setViewerSize] = useState<'small' | 'large' | 'full'>('small');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('vault_token'));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const PROGRESS_STEPS = [
    "Understanding your query...",
    "Scanning the document vault...",
    "Retrieving relevant context...",
    "Synthesizing your answer...",
    "Almost there..."
  ];

  // Axios Authorization Interceptor
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
      fetchDocuments();
      fetchHistory();
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

  // Global side-effect for Dark Mode class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
  }, []);

  const fetchHistory = async () => {
    if (!localStorage.getItem('vault_token')) return;
    try {
      const res = await axios.get(`${API_URL}/history`);
      if (res.data && res.data.history) {
        // Reverse so newest is first in sidebar
        setChatHistory([...res.data.history].reverse());
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  const loadChatFromHistory = (chat: any) => {
    const flattened: Message[] = [
      {
        id: `${chat.id}_q`,
        role: 'user',
        content: chat.query,
        timestamp: chat.timestamp.split(' ')[1]
      },
      {
        id: `${chat.id}_a`,
        role: 'bot',
        content: chat.answer,
        sources: chat.sources,
        model: 'Gemini 2.5',
        timestamp: chat.timestamp.split(' ')[1]
      }
    ];
    setMessages(flattened);
    // On mobile, close sidebar after selecting
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

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
    setLoadingMessage(PROGRESS_STEPS[0]);

    // Progressive loading messages
    let stepIdx = 0;
    let progressInterval: any;
    const botId = (Date.now() + 1).toString();

    try {
      progressInterval = setInterval(() => {
        stepIdx++;
        if (stepIdx < PROGRESS_STEPS.length) {
          setLoadingMessage(PROGRESS_STEPS[stepIdx]);
        } else {
          clearInterval(progressInterval);
        }
      }, 1500);

      // Bot message placeholder
      const botMessagePlaceholder: Message = {
        id: botId,
        role: 'bot',
        content: '',
        sources: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMessagePlaceholder]);

      const response = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          query: userMessage.content,
          filename: targetDocument
        })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let foundSources = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Check for sources metadata in the first chunk
        if (!foundSources && chunk.includes("__SOURCES__:")) {
          const lines = chunk.split('\n');
          const sourceLine = lines.find(l => l.startsWith("__SOURCES__:"));
          if (sourceLine) {
            try {
              const sourcesJson = JSON.parse(sourceLine.replace("__SOURCES__:", ""));
              setMessages(prev => prev.map(m =>
                m.id === botId ? { ...m, sources: sourcesJson } : m
              ));
              foundSources = true;

              // Remove the metadata line from the content
              const contentValue = lines.filter(l => !l.startsWith("__SOURCES__:")).join('\n').trimStart();
              fullContent += contentValue;
            } catch (e) { console.error("Source parsing error", e); }
          }
        } else {
          fullContent += chunk;
        }

        // Incrementally update the UI
        setMessages(prev => prev.map(m =>
          m.id === botId ? { ...m, content: fullContent } : m
        ));
      }

      fetchHistory(); // Refresh sidebar history
    } catch (error: any) {
      console.error(error);
      setMessages(prev => prev.map(m =>
        m.id === botId ? { ...m, content: "I ran into an issue connecting to the RAG system." } : m
      ));
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
      // @ts-ignore
      if (progressInterval) clearInterval(progressInterval);
    }
  };

  const deleteHistoryEntry = async (e: React.MouseEvent, chat_id: string) => {
    e.stopPropagation(); // Stop from loading the chat when clicking delete
    if (!window.confirm("Delete this chat?")) return;

    try {
      await axios.delete(`${API_URL}/history/${chat_id}`);
      setChatHistory(prev => prev.filter(c => c.id !== chat_id));
      // If the currently viewed chat was deleted, clear the chat window
      if (messages.some(m => m.id.startsWith(chat_id))) {
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete chat", err);
    }
  };

  const clearCurrentView = () => {
    console.log("--- [DEBUG] New Chat Clicked ---");
    setMessages([]);
    // Close sidebar on mobile for better UX
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
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
      <div className={`min-h-screen flex items-center justify-center p-4 relative transition-colors duration-500 overflow-hidden ${isDarkMode
        ? 'dark bg-gray-950 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gray-900 via-gray-950 to-indigo-950/20'
        : 'bg-gray-100 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-gray-100 to-indigo-50'
        }`}>
        {/* Decorative elements - Background blobs */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />

        {/* Theme Toggle Button */}
        <button
          onClick={() => {
            const nextMode = !isDarkMode;
            setIsDarkMode(nextMode);
            localStorage.setItem('theme', nextMode ? 'dark' : 'light');
          }}
          className={`absolute top-6 right-6 p-4 rounded-2xl shadow-lg border backdrop-blur-xl transition-all duration-300 hover:scale-110 active:scale-95 z-50 ${isDarkMode
            ? 'bg-gray-800/80 text-yellow-400 border-gray-700'
            : 'bg-white/80 text-gray-800 border-gray-200'
            }`}
          title="Toggle Theme"
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5 rotate-12" />}
        </button>

        {/* Login Card */}
        <div
          className={`w-full max-w-md p-8 md:p-10 rounded-3xl shadow-2xl backdrop-blur-2xl transition-all duration-700 border transform-gpu hover:shadow-indigo-500/10 ${isDarkMode
            ? 'bg-gray-900/60 border-gray-800 text-gray-100'
            : 'bg-white/70 border-gray-100 text-gray-900'
            }`}
        >
          <div className="flex flex-col items-center text-center space-y-8">
            {/* Logo Icon with Pulse Gradient */}
            <div className={`p-5 rounded-[2rem] shadow-2xl relative group-hover:rotate-12 transition-transform duration-500 ${isDarkMode
              ? 'bg-indigo-600/30 text-indigo-400 ring-1 ring-indigo-500/50'
              : 'bg-indigo-600 text-white shadow-indigo-500/30'
              }`}>
              <Bot className="w-12 h-12" />
            </div>

            {/* Header with improved typography */}
            <div className="space-y-3">
              <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent italic leading-[1.3]">
                Vault Brain
              </h1>
              <div className="space-y-1">
                <h2 className="text-xl font-bold">Welcome Back</h2>
                <p className="text-sm font-medium opacity-50 tracking-tight">Access your personal AI document vault</p>
              </div>
            </div>

            {/* Google Authentication Button - Modern Polish */}
            <div className="w-full pt-4">
              <button
                onClick={handleLogin}
                className={`flex items-center justify-center gap-4 w-full p-4.5 rounded-2xl border-2 font-bold text-base transition-all duration-300 transform-gpu active:scale-[0.98] group relative overflow-hidden ${isDarkMode
                  ? 'bg-gray-800 border-gray-700 hover:border-indigo-500/50 text-white shadow-xl shadow-black/20'
                  : 'bg-white border-gray-200 hover:border-indigo-100 text-gray-800 shadow-md hover:shadow-xl'
                  }`}
              >
                <div className="bg-white p-1 rounded-md shadow-sm">
                  <img
                    src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png"
                    className="w-6 h-6"
                    alt="Google"
                  />
                </div>
                <span className="relative z-10">Continue with Google</span>
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
              </button>
            </div>

            {/* Security Indicator */}
            <div className="flex items-center justify-center gap-2 pt-10 text-[11px] font-black uppercase tracking-[0.2em] opacity-20 antialiased italic">
              <div className="w-1 h-1 rounded-full bg-current" />
              E2E Encrypted Retrieval
              <div className="w-1 h-1 rounded-full bg-current" />
            </div>
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
                    <div className="flex items-center space-x-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => handlePreviewFile(doc.name)}
                        className="p-3 md:p-1.5 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/30 rounded-lg"
                        title="Preview"
                      >
                        <ExternalLink className="w-5 h-5 md:w-3.5 md:h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(doc.name)}
                        className="p-3 md:p-1.5 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5 md:w-3.5 md:h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat History Section */}
            <div>
              <div className="flex items-center justify-between mb-3 mt-4">
                <h3 className="text-xs font-bold uppercase tracking-widest opacity-40 px-1">Recent Chats</h3>
              </div>
              <div className="space-y-1">
                {chatHistory.length === 0 ? (
                  <p className="text-[10px] opacity-20 italic px-3">No recent history</p>
                ) : (
                  chatHistory.map((chat, idx) => (
                    <div
                      key={idx}
                      role="button"
                      onClick={() => loadChatFromHistory(chat)}
                      className={`w-full text-left p-3 rounded-xl transition-all border border-transparent group cursor-pointer ${messages.some(m => m.id.startsWith(chat.id))
                        ? 'bg-indigo-600/10 text-indigo-600 border-indigo-500/20'
                        : 'hover:bg-slate-100 dark:hover:bg-zinc-800/50 text-zinc-500'
                        }`}
                    >
                      <div className="flex items-center space-x-3">
                        <MessageSquare className={`w-4 h-4 flex-shrink-0 transition-opacity ${messages.some(m => m.id.startsWith(chat.id)) ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'
                          }`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate leading-tight ${messages.some(m => m.id.startsWith(chat.id)) ? 'text-indigo-600' : 'text-zinc-700 dark:text-zinc-300'
                            }`}>{chat.query}</p>
                          <p className="text-[10px] opacity-40 mt-1 font-medium">{chat.timestamp.split(' ')[1]}</p>
                        </div>
                        <button
                          onClick={(e) => deleteHistoryEntry(e, chat.id)}
                          className="opacity-100 lg:opacity-0 group-hover:opacity-100 p-3 lg:p-1.5 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/30 rounded-lg transition-all min-h-[44px] min-w-[44px] flex items-center justify-center relative z-10"
                          title="Delete Chat"
                        >
                          <Trash2 className="w-5 h-5 lg:w-3.5 lg:h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
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
            <button
              onClick={clearCurrentView}
              className="w-full flex items-center justify-center space-x-2 p-3 min-h-[44px] min-w-[44px] text-sm font-semibold border rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all relative z-50 pointer-events-auto"
            >
              <Plus className="w-4 h-4" />
              <span>New Chat</span>
            </button>
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
                    <div className={`p-5 rounded-3xl whitespace-pre-wrap ${message.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : isDarkMode ? 'bg-zinc-900 border border-zinc-800 rounded-tl-none text-zinc-100' : 'bg-white border rounded-tl-none text-slate-800'}`}>
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        {message.role === 'bot' ? (
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        ) : (
                          message.content
                        )}
                      </div>
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
            {isLoading && (
              <div className="flex justify-start items-center space-x-4 animate-in fade-in slide-in-from-left-4">
                <div className="w-10 h-10 rounded-2xl bg-purple-600/20 flex items-center justify-center animate-pulse">
                  <Bot className="w-6 h-6 text-purple-400" />
                </div>
                <div className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center space-x-2 ${isDarkMode ? 'bg-zinc-900 text-zinc-500' : 'bg-slate-100 text-slate-500'}`}>
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                  <span className="animate-pulse">{loadingMessage || "Thinking..."}</span>
                </div>
              </div>
            )}
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
        <aside
          className={`h-screen flex flex-col shadow-2xl transition-all duration-500 ease-in-out border-l transform-gpu ${viewerSize === 'full'
            ? 'fixed inset-0 w-full z-[60]'
            : `relative z-50 ${viewerSize === 'large' ? 'lg:w-[900px] xl:w-[1100px]' : 'lg:w-[550px] xl:w-[650px]'} w-full fixed lg:relative inset-y-0 right-0`
            } ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}
        >
          {/* Viewer Header Bar */}
          <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-zinc-800' : 'border-slate-200'}`}>
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="p-2 bg-indigo-600/10 rounded-lg flex-shrink-0">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-bold text-sm truncate pr-2">
                {selectedFileUrl.split('/').pop()?.split('?')[0]}
              </h3>
            </div>

            <div className="flex items-center space-x-1 flex-shrink-0">
              {/* Resize Toggle Controls (Only Desktop) */}
              <div className="hidden lg:flex items-center space-x-1 mr-2 pr-2 border-r border-gray-500/20">
                {viewerSize === 'small' ? (
                  <button
                    onClick={() => setViewerSize('large')}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                    title="Expand View"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                ) : viewerSize === 'large' ? (
                  <button
                    onClick={() => setViewerSize('small')}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                    title="Collapse View"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                ) : null}

                {/* Fullscreen Toggle */}
                <button
                  onClick={() => setViewerSize(viewerSize === 'full' ? 'large' : 'full')}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                  title={viewerSize === 'full' ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {viewerSize === 'full' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              </div>

              {/* Action Buttons */}
              <a
                href={selectedFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-5 h-5 opacity-70" />
              </a>
              <button
                onClick={() => {
                  setSelectedFileUrl(null);
                  setViewerSize('small'); // Reset to small for next time
                }}
                className="p-2 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 rounded-lg text-zinc-500 transition-colors"
                title="Close Viewer"
              >
                <X className="w-5 h-5 opacity-70" />
              </button>
            </div>
          </div>

          {/* Iframe Container */}
          <div className="flex-1 bg-zinc-950 overflow-hidden relative">
            <iframe
              src={`${selectedFileUrl}#view=FitH`}
              className="w-full h-full border-none"
              title="PDF Preview"
            />
          </div>

          {/* Mobile Overlay Fallback - Only visible when full height needed on mobile */}
          <div className="lg:hidden p-4 border-t bg-slate-50 dark:bg-zinc-800/50 flex justify-center">
            <button
              onClick={() => setSelectedFileUrl(null)}
              className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 shadow-indigo-500/20 active:scale-95"
            >
              Done Reading
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
