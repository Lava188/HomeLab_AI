import React, { useState, useEffect, useRef } from 'react';
import { mockSendMessage, Message, clearChatSession } from '../api/chatApi';
import {
  Menu,
  Plus,
  Send,
  User,
  Activity,
  FileText,
  AlertCircle,
  Stethoscope,
  Bot,
  X,
  Clock,
  Coffee,
  Pill,
  Droplet,
  HeartPulse,
  ShieldCheck,
  Syringe,
  Calendar,
  ChevronLeft,
  LogIn,
  LogOut,
  Phone,
  Shield
} from 'lucide-react';

const STORAGE_KEY = 'homelab_chat_history';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'none' | 'preTest' | 'urgent' | 'bookTest' | 'login' | 'loginRequired'>('none');
  const [customSymptom, setCustomSymptom] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'appointments'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse chat history', e);
      }
    }
  }, []);

  // Save to localStorage on messages change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleNewChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    clearChatSession();
    setIsSidebarOpen(false);
  };

  const handleQuickAction = (text: string) => {
    setInputValue(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSend = async (text: string = inputValue) => {
    if (!text.trim() || isTyping) return;

    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
      timestamp,
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setInputValue('');
    setIsTyping(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await mockSendMessage(text);
      setMessages((prev) => [...prev, response]);
    } catch (error) {
      console.error('Failed to send message', error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  const suggestionCards = [
    {
      category: 'Đặt lịch xét nghiệm',
      text: 'Mình muốn đặt lịch xét nghiệm máu sáng mai',
      icon: <Calendar className="w-5 h-5 text-indigo-600" />
    },
    {
      category: 'Tư vấn chuyên môn',
      text: 'Xét nghiệm mỡ máu có cần nhịn ăn không?',
      icon: <Stethoscope className="w-5 h-5 text-emerald-600" />
    },
    {
      category: 'Kiểm tra triệu chứng',
      text: 'Mình chóng mặt 2 ngày — mình nên làm gì?',
      icon: <Activity className="w-5 h-5 text-rose-600" />
    }
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-80 bg-slate-800 text-slate-200 flex flex-col transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
      >
        <div className="p-6 flex items-center gap-3 font-semibold text-xl tracking-tight border-b border-slate-700/50">
          <div className="bg-slate-700 p-2 rounded-xl">
            <Stethoscope className="w-6 h-6 text-slate-200" />
          </div>
          HomeLab
        </div>

        <div className="p-6">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-3 bg-slate-700 hover:bg-slate-600 text-slate-100 px-5 py-3.5 rounded-xl transition-colors text-base font-medium shadow-sm"
            aria-label="Bắt đầu cuộc trò chuyện mới"
          >
            <Plus className="w-5 h-5" />
            Cuộc trò chuyện mới
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-3">
            Hành động nhanh
          </div>
          <div className="space-y-1.5">
            <button
              onClick={() => {
                setActiveModal('bookTest');
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[15px] text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 rounded-xl transition-colors text-left"
            >
              <Activity className="w-5 h-5" />
              Đặt lịch xét nghiệm
            </button>
            <button
              onClick={() => {
                setActiveModal('urgent');
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[15px] text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 rounded-xl transition-colors text-left"
            >
              <AlertCircle className="w-5 h-5" />
              Triệu chứng khẩn cấp
            </button>
          </div>

          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-8 mb-4 px-3">
            Dịch vụ
          </div>
          <div className="space-y-1.5">
            <button
              onClick={() => {
                setActiveModal('bookTest');
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[15px] text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 rounded-xl transition-colors text-left"
            >
              <Syringe className="w-5 h-5" />
              Các gói xét nghiệm phổ biến
            </button>
            <button
              onClick={() => {
                if (isLoggedIn) {
                  setCurrentView('appointments');
                } else {
                  setActiveModal('loginRequired');
                }
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[15px] text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 rounded-xl transition-colors text-left"
            >
              <Calendar className="w-5 h-5" />
              Lịch hẹn của tôi
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        {/* Top Bar */}
        <header className="h-20 flex items-center justify-between px-6 md:px-8 border-b border-slate-200 bg-white/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2.5 -ml-2.5 text-slate-500 hover:bg-slate-100 rounded-xl md:hidden"
              aria-label="Mở menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="font-semibold text-slate-900 text-base md:text-lg mb-0.5">
                {currentView === 'appointments' ? 'Lịch hẹn của tôi' : 'Cuộc trò chuyện mới'}
              </h1>
              <div className="flex items-center gap-2.5 text-[13px] text-slate-500 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Trực tuyến
                </div>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">Chế độ an toàn</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveModal('login')}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isLoggedIn
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
              }`}
            title={isLoggedIn ? "Đăng xuất" : "Đăng nhập"}
          >
            {isLoggedIn ? <LogOut className="w-5 h-5" /> : <User className="w-5 h-5" />}
          </button>
        </header>

        {/* Main Content Area */}
        {currentView === 'appointments' ? (
          <div className="flex-1 overflow-y-auto px-4 py-8 md:py-12 bg-slate-50">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => setCurrentView('chat')}
                  className="p-2 -ml-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-2xl font-semibold text-slate-800">Lịch hẹn của tôi</h2>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-medium text-slate-800 mb-2">Chưa có lịch hẹn nào</h3>
                <p className="text-slate-500 max-w-md mb-6">Bạn chưa đặt lịch xét nghiệm nào. Hãy bắt đầu trò chuyện với HomeLab để đặt lịch lấy mẫu tại nhà.</p>
                <button
                  onClick={() => {
                    setCurrentView('chat');
                    setActiveModal('bookTest');
                  }}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Đặt lịch ngay
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Area */}
            <div className={`flex-1 overflow-y-auto px-4 py-8 md:py-12 ${messages.length === 0 ? 'flex items-center justify-center' : ''}`}>
              <div className={`max-w-5xl mx-auto flex flex-col gap-1 w-full ${messages.length === 0 ? 'h-full justify-center' : ''}`}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center text-center px-4 w-full">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-indigo-100">
                      <Stethoscope className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl md:text-3xl font-semibold text-slate-800 mb-3 tracking-tight">
                      Chào mừng đến với HomeLab
                    </h2>
                    <p className="text-slate-500 max-w-lg mb-8 text-base leading-relaxed">
                      Trợ lý y tế thông minh hỗ trợ bạn đặt lịch xét nghiệm tại nhà, tra cứu thông tin sức khỏe và tư vấn triệu chứng ban đầu.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl">
                      {suggestionCards.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(suggestion.text)}
                          className="flex flex-col text-left p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all group h-full"
                        >
                          <div className="mb-3 bg-slate-50 p-2.5 rounded-xl w-fit group-hover:bg-indigo-50 transition-colors">
                            {suggestion.icon}
                          </div>
                          <h3 className="text-sm font-semibold text-slate-800 mb-1.5">{suggestion.category}</h3>
                          <p className="text-sm text-slate-500 group-hover:text-slate-700 leading-relaxed flex-1">
                            "{suggestion.text}"
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isUser = msg.role === 'user';
                    const isClarify = msg.variant === 'clarify';
                    const prevMsg = messages[index - 1];
                    const isFirstInGroup = !prevMsg || prevMsg.role !== msg.role;
                    const nextMsg = messages[index + 1];
                    const isLastInGroup = !nextMsg || nextMsg.role !== msg.role;

                    return (
                      <div
                        key={msg.id}
                        className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-6' : 'mt-1'
                          }`}
                      >
                        <div className={`flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
                          {/* Avatar for Assistant */}
                          {!isUser && (
                            <div className="w-8 shrink-0 flex flex-col items-center">
                              {isFirstInGroup ? (
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shadow-sm">
                                  <Bot className="w-4 h-4 text-white" />
                                </div>
                              ) : (
                                <div className="w-8 h-8" /> // Spacer
                              )}
                            </div>
                          )}

                          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`px-4 py-3 text-[15px] leading-relaxed ${isUser
                                ? 'bg-slate-800 text-white'
                                : isClarify
                                  ? 'bg-amber-50 text-amber-950 shadow-sm border border-amber-200'
                                  : 'bg-white text-slate-800 shadow-sm border border-slate-100'
                                } ${isUser
                                  ? `rounded-2xl ${!isFirstInGroup ? 'rounded-tr-sm' : ''} ${!isLastInGroup ? 'rounded-br-sm' : ''}`
                                  : `rounded-2xl ${!isFirstInGroup ? 'rounded-tl-sm' : ''} ${!isLastInGroup ? 'rounded-bl-sm' : ''}`
                                }`}
                            >
                              {!isUser && isClarify && (
                                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  Cần làm rõ
                                </div>
                              )}
                              {msg.text}

                              {!isUser && isClarify && (
                                <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/60 px-3 py-2 text-[12px] text-amber-800">
                                  Trả lời này xuất hiện khi câu hỏi còn ngắn hoặc chưa đủ rõ để HomeLab truy xuất tri thức an toàn.
                                </div>
                              )}

                              {/* Citations */}
                              {!isUser && msg.citations && msg.citations.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-100">
                                  <div className="text-[11px] font-medium text-slate-400 mb-1.5">Nguồn:</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {msg.citations.map((cite, i) => (
                                      <button
                                        key={i}
                                        title={cite}
                                        className="text-[11px] font-medium px-2 py-1 bg-slate-50 text-slate-500 rounded-md hover:bg-slate-100 hover:text-slate-700 transition-colors border border-slate-200"
                                      >
                                        {cite}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Timestamp */}
                            {isLastInGroup && (
                              <span className="text-[11px] text-slate-400 mt-1.5 px-1 font-medium">
                                {msg.timestamp}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex w-full justify-start mt-6">
                    <div className="flex max-w-[85%] md:max-w-[75%] flex-row gap-3">
                      <div className="w-8 shrink-0 flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shadow-sm">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="flex flex-col items-start">
                        <div className="px-4 py-4 bg-white rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-200/60 shrink-0">
              <div className="max-w-5xl mx-auto relative">
                <div className="relative flex items-end bg-white rounded-2xl shadow-sm border border-slate-200 focus-within:border-slate-300 focus-within:ring-4 focus-within:ring-slate-500/5 transition-all overflow-hidden">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Nhắn tin cho HomeLab..."
                    className="w-full max-h-[150px] min-h-[60px] py-4 pl-5 pr-14 bg-transparent border-none focus:ring-0 focus:outline-none resize-none text-base text-slate-900 placeholder:text-slate-400"
                    rows={1}
                    aria-label="Nhập tin nhắn"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || isTyping}
                    className="absolute right-2.5 bottom-2.5 p-2.5 rounded-xl bg-slate-800 text-white disabled:bg-slate-100 disabled:text-slate-400 hover:bg-slate-700 transition-colors"
                    aria-label="Gửi tin nhắn"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex justify-between items-center mt-2 px-1">
                  <p className="text-[11px] text-slate-400 font-medium hidden md:block">
                    Enter để gửi • Shift+Enter xuống dòng
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium text-center md:text-right flex-1 md:flex-none">
                    HomeLab có thể mắc lỗi. Vui lòng kiểm tra lại các thông tin y tế quan trọng.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Book Test Modal */}
      {activeModal === 'bookTest' && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                Chọn gói xét nghiệm
              </h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">Chọn một trong các gói xét nghiệm dưới đây để đặt lịch lấy mẫu tại nhà. Chuyên viên của chúng tôi sẽ liên hệ để xác nhận thông tin.</p>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { name: 'Gói xét nghiệm máu tổng quát', icon: <Droplet className="w-5 h-5 text-rose-500" />, desc: 'Kiểm tra các chỉ số cơ bản của cơ thể' },
                  { name: 'Gói tầm soát tiểu đường', icon: <Activity className="w-5 h-5 text-blue-500" />, desc: 'Đo lượng đường trong máu (Glucose, HbA1c)' },
                  { name: 'Gói kiểm tra chức năng gan, thận', icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />, desc: 'Đánh giá men gan và chức năng lọc của thận' },
                  { name: 'Gói tầm soát mỡ máu', icon: <HeartPulse className="w-5 h-5 text-amber-500" />, desc: 'Kiểm tra Cholesterol, Triglyceride' },
                  { name: 'Gói khám sức khỏe toàn diện', icon: <Syringe className="w-5 h-5 text-indigo-500" />, desc: 'Kiểm tra tổng quát 15+ chỉ số quan trọng' }
                ].map(pkg => (
                  <button
                    key={pkg.name}
                    onClick={() => {
                      setActiveModal('none');
                      handleSend(`Tôi muốn đặt lịch: ${pkg.name}. Vui lòng hướng dẫn tôi các bước tiếp theo để lấy mẫu tại nhà.`);
                    }}
                    className="flex items-start gap-4 text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
                  >
                    <div className="mt-0.5 bg-slate-50 group-hover:bg-white p-2 rounded-lg border border-slate-100 group-hover:border-indigo-100 transition-colors">
                      {pkg.icon}
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800 group-hover:text-indigo-700 transition-colors">{pkg.name}</h4>
                      <p className="text-xs text-slate-500 mt-1">{pkg.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pre-test Instructions Modal */}
      {activeModal === 'preTest' && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Hướng dẫn trước xét nghiệm</h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5 text-sm text-slate-600">
              <div className="flex gap-3">
                <div className="mt-0.5 text-indigo-500 bg-indigo-50 p-1.5 rounded-lg h-fit"><Clock className="w-4 h-4" /></div>
                <div>
                  <strong className="text-slate-800 block mb-0.5">Nhịn ăn uống</strong>
                  Phần lớn các xét nghiệm máu (đường huyết, mỡ máu) yêu cầu nhịn ăn từ 8-12 tiếng. Chỉ nên uống nước lọc.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="mt-0.5 text-indigo-500 bg-indigo-50 p-1.5 rounded-lg h-fit"><Coffee className="w-4 h-4" /></div>
                <div>
                  <strong className="text-slate-800 block mb-0.5">Tránh chất kích thích</strong>
                  Không uống rượu, bia, cà phê, hoặc hút thuốc lá ít nhất 24 giờ trước khi lấy mẫu.
                </div>
              </div>
              <div className="flex gap-3">
                <div className="mt-0.5 text-indigo-500 bg-indigo-50 p-1.5 rounded-lg h-fit"><Pill className="w-4 h-4" /></div>
                <div>
                  <strong className="text-slate-800 block mb-0.5">Thuốc đang sử dụng</strong>
                  Tham khảo ý kiến bác sĩ về việc có nên tạm ngưng các loại thuốc đang dùng hay không.
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setActiveModal('none')} className="px-5 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors">
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Urgent Symptoms Modal */}
      {activeModal === 'urgent' && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                Triệu chứng khẩn cấp
              </h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">Chọn triệu chứng bạn đang gặp phải để nhận tư vấn ngay:</p>
              <div className="flex flex-col gap-2">
                {[
                  'Đau tức ngực dữ dội',
                  'Khó thở, thở dốc',
                  'Chóng mặt, ngất xỉu',
                  'Chảy máu không ngừng',
                  'Đau bụng cấp tính',
                  'Sốt cao không hạ'
                ].map(symptom => (
                  <button
                    key={symptom}
                    onClick={() => {
                      setActiveModal('none');
                      handleSend(symptom);
                    }}
                    className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-colors text-sm font-medium text-slate-700 hover:text-red-700"
                  >
                    {symptom}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-600 mb-2 font-medium">Hoặc nhập triệu chứng khác:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSymptom}
                    onChange={e => setCustomSymptom(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customSymptom.trim()) {
                        setActiveModal('none');
                        handleSend(customSymptom);
                        setCustomSymptom('');
                      }
                    }}
                    placeholder="Mô tả triệu chứng..."
                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all"
                  />
                  <button
                    disabled={!customSymptom.trim()}
                    onClick={() => {
                      setActiveModal('none');
                      handleSend(customSymptom);
                      setCustomSymptom('');
                    }}
                    className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Gửi
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Login Modal */}
      {activeModal === 'login' && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Tài khoản</h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {isLoggedIn ? (
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                    <User className="w-10 h-10" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-800 mb-1">Khách hàng</h4>
                  <p className="text-sm text-slate-500 mb-6">+84 123 456 789</p>
                  <button
                    onClick={() => {
                      setIsLoggedIn(false);
                      setActiveModal('none');
                      if (currentView === 'appointments') setCurrentView('chat');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-medium transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Đăng xuất
                  </button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-800 mb-2">Đăng nhập</h4>
                  <p className="text-sm text-slate-500 mb-6">Đăng nhập để quản lý lịch hẹn và xem kết quả xét nghiệm của bạn.</p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Số điện thoại</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Phone className="w-4 h-4 text-slate-400" />
                        </div>
                        <input
                          type="tel"
                          placeholder="Nhập số điện thoại..."
                          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setIsLoggedIn(true);
                        setActiveModal('none');
                      }}
                      className="w-full px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-medium transition-colors shadow-sm"
                    >
                      Tiếp tục
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Login Required Modal */}
      {activeModal === 'loginRequired' && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden text-center p-6">
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Yêu cầu đăng nhập</h3>
            <p className="text-sm text-slate-500 mb-6">Bạn cần đăng nhập để xem lịch hẹn và kết quả xét nghiệm.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setActiveModal('none')}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-medium transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => setActiveModal('login')}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-medium transition-colors shadow-sm"
              >
                Đăng nhập
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

