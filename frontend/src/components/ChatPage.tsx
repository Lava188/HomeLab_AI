import React, { useState, useEffect, useRef } from 'react';
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
  Syringe
} from 'lucide-react';
import { Message, mockSendMessage } from '../api/chatApi';

const STORAGE_KEY = 'homelab_chat_history';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'none' | 'preTest' | 'urgent' | 'bookTest'>('none');
  const [customSymptom, setCustomSymptom] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  const suggestionCards = [
    {
      text: 'Mình muốn đặt lịch xét nghiệm máu sáng mai',
      icon: Activity,
    },
    {
      text: 'Xét nghiệm mỡ máu có cần nhịn ăn không?',
      icon: FileText,
    },
    {
      text: 'Mình chóng mặt 2 ngày — mình nên làm gì?',
      icon: AlertCircle,
    },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 text-slate-900">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-[1px] md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[290px] shrink-0 flex-col bg-slate-900 text-slate-200 transition-transform duration-300 ease-in-out lg:w-[310px] md:static ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-slate-700/60 px-6">
          <div className="rounded-2xl bg-slate-800 p-2.5 shadow-sm ring-1 ring-white/5">
            <Stethoscope className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight text-white">HomeLab</div>
            <div className="text-sm text-slate-400">Hỗ trợ xét nghiệm tại nhà</div>
          </div>
        </div>

        <div className="px-5 py-5">
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-3 rounded-2xl bg-slate-800 px-4 py-3.5 text-[15px] font-semibold text-slate-100 shadow-sm transition-colors hover:bg-slate-700"
            aria-label="Bắt đầu cuộc trò chuyện mới"
          >
            <Plus className="h-5 w-5" />
            Cuộc trò chuyện mới
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Hành động nhanh
          </div>

          <div className="space-y-2">
            <button
              onClick={() => {
                setActiveModal('bookTest');
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <Activity className="h-5 w-5" />
              Đặt lịch xét nghiệm
            </button>

            <button
              onClick={() => {
                setActiveModal('preTest');
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <FileText className="h-5 w-5" />
              Hướng dẫn trước xét nghiệm
            </button>

            <button
              onClick={() => {
                setActiveModal('urgent');
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <AlertCircle className="h-5 w-5" />
              Triệu chứng khẩn cấp
            </button>
          </div>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="z-10 flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 md:hidden"
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-lg font-semibold text-slate-900 md:text-xl">
                Cuộc trò chuyện mới
              </h1>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Trực tuyến
                </div>
                <span className="text-slate-300">•</span>
                <span>Chế độ an toàn</span>
              </div>
            </div>
          </div>

          <button className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
            <User className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center px-2 py-6 text-center md:px-4 md:py-8">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-200 text-slate-700 shadow-sm">
                  <Stethoscope className="h-8 w-8" />
                </div>

                <h2 className="mb-2 text-2xl font-semibold tracking-tight text-slate-800 md:text-3xl">
                  Chào mừng đến với HomeLab
                </h2>

                <p className="mb-7 max-w-2xl text-sm leading-7 text-slate-500 md:text-base">
                  Đặt lịch xét nghiệm tại nhà và nhận hướng dẫn y tế cơ bản.
                </p>

                <div className="grid w-full max-w-6xl grid-cols-1 gap-3 md:grid-cols-3">
                  {suggestionCards.map((card, idx) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSend(card.text)}
                        className="group rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-slate-800 group-hover:text-white">
                          <Icon className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-semibold leading-6 text-slate-700 group-hover:text-slate-900 md:text-[15px]">
                          {card.text}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const prevMsg = messages[index - 1];
                const isFirstInGroup = !prevMsg || prevMsg.role !== msg.role;
                const nextMsg = messages[index + 1];
                const isLastInGroup = !nextMsg || nextMsg.role !== msg.role;

                return (
                  <div
                    key={msg.id}
                    className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} ${
                      isFirstInGroup ? 'mt-7' : 'mt-2'
                    }`}
                  >
                    <div
                      className={`flex max-w-[92%] gap-4 md:max-w-[78%] ${
                        isUser ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      {!isUser && (
                        <div className="flex w-10 shrink-0 flex-col items-center">
                          {isFirstInGroup ? (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 shadow-sm">
                              <Bot className="h-5 w-5 text-white" />
                            </div>
                          ) : (
                            <div className="h-10 w-10" />
                          )}
                        </div>
                      )}

                      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`px-5 py-4 text-[15px] leading-8 md:text-base ${
                            isUser
                              ? 'bg-slate-800 text-white'
                              : 'border border-slate-200 bg-white text-slate-800 shadow-sm'
                          } ${
                            isUser
                              ? `rounded-3xl ${!isFirstInGroup ? 'rounded-tr-md' : ''} ${!isLastInGroup ? 'rounded-br-md' : ''}`
                              : `rounded-3xl ${!isFirstInGroup ? 'rounded-tl-md' : ''} ${!isLastInGroup ? 'rounded-bl-md' : ''}`
                          }`}
                        >
                          {msg.text}

                          {!isUser && msg.citations && msg.citations.length > 0 && (
                            <div className="mt-4 border-t border-slate-100 pt-4">
                              <div className="mb-2 text-xs font-semibold text-slate-400">Nguồn:</div>
                              <div className="flex flex-wrap gap-2">
                                {msg.citations.map((cite, i) => (
                                  <button
                                    key={i}
                                    title={cite}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    {cite}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {isLastInGroup && (
                          <span className="mt-2 px-1 text-xs font-medium text-slate-400">
                            {msg.timestamp}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {isTyping && (
              <div className="mt-7 flex w-full justify-start">
                <div className="flex max-w-[92%] gap-4 md:max-w-[78%]">
                  <div className="flex w-10 shrink-0 flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 shadow-sm">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                  </div>

                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-1 rounded-3xl rounded-tl-md border border-slate-200 bg-white px-5 py-4 shadow-sm">
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200/70 bg-slate-50 px-4 py-4 md:px-6">
          <div className="relative mx-auto max-w-6xl">
            <div className="relative flex items-end overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all focus-within:border-slate-300 focus-within:ring-4 focus-within:ring-slate-500/5">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Nhắn tin cho HomeLab..."
                className="min-h-[60px] max-h-[150px] w-full resize-none border-none bg-transparent py-4 pl-4 pr-16 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 md:text-base"
                rows={1}
                aria-label="Nhập tin nhắn"
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping}
                className="absolute bottom-3 right-3 rounded-2xl bg-slate-800 p-3 text-white transition-colors hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                aria-label="Gửi tin nhắn"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 px-1">
              <p className="hidden text-xs font-medium text-slate-400 md:block">
                Enter để gửi • Shift+Enter xuống dòng
              </p>
              <p className="flex-1 text-center text-xs font-medium text-slate-400 md:flex-none md:text-right">
                HomeLab có thể mắc lỗi. Vui lòng kiểm tra lại các thông tin y tế quan trọng.
              </p>
            </div>
          </div>
        </div>
      </main>

      {activeModal === 'bookTest' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                <Activity className="h-5 w-5 text-indigo-500" />
                Chọn gói xét nghiệm
              </h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 transition-colors hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <p className="mb-5 text-[15px] leading-7 text-slate-600">
                Chọn một trong các gói xét nghiệm dưới đây để đặt lịch lấy mẫu tại nhà. Chuyên viên của chúng tôi sẽ liên hệ để xác nhận thông tin.
              </p>

              <div className="grid grid-cols-1 gap-3">
                {[
                  { name: 'Gói xét nghiệm máu tổng quát', icon: <Droplet className="h-5 w-5 text-rose-500" />, desc: 'Kiểm tra các chỉ số cơ bản của cơ thể' },
                  { name: 'Gói tầm soát tiểu đường', icon: <Activity className="h-5 w-5 text-blue-500" />, desc: 'Đo lượng đường trong máu (Glucose, HbA1c)' },
                  { name: 'Gói kiểm tra chức năng gan, thận', icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />, desc: 'Đánh giá men gan và chức năng lọc của thận' },
                  { name: 'Gói tầm soát mỡ máu', icon: <HeartPulse className="h-5 w-5 text-amber-500" />, desc: 'Kiểm tra Cholesterol, Triglyceride' },
                  { name: 'Gói khám sức khỏe toàn diện', icon: <Syringe className="h-5 w-5 text-indigo-500" />, desc: 'Kiểm tra tổng quát 15+ chỉ số quan trọng' }
                ].map(pkg => (
                  <button
                    key={pkg.name}
                    onClick={() => {
                      setActiveModal('none');
                      handleSend(`Tôi muốn đặt lịch: ${pkg.name}. Vui lòng hướng dẫn tôi các bước tiếp theo để lấy mẫu tại nhà.`);
                    }}
                    className="group flex items-start gap-4 rounded-2xl border border-slate-200 p-4 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50/50"
                  >
                    <div className="mt-0.5 rounded-xl border border-slate-100 bg-slate-50 p-2.5 transition-colors group-hover:border-indigo-100 group-hover:bg-white">
                      {pkg.icon}
                    </div>
                    <div>
                      <h4 className="text-[15px] font-semibold text-slate-800 transition-colors group-hover:text-indigo-700">
                        {pkg.name}
                      </h4>
                      <p className="mt-1 text-sm text-slate-500">{pkg.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'preTest' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h3 className="text-lg font-semibold text-slate-800">Hướng dẫn trước xét nghiệm</h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 transition-colors hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6 text-[15px] leading-7 text-slate-600">
              <div className="flex gap-3">
                <div className="mt-0.5 h-fit rounded-lg bg-indigo-50 p-2 text-indigo-500">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <strong className="mb-0.5 block text-slate-800">Nhịn ăn uống</strong>
                  Phần lớn các xét nghiệm máu (đường huyết, mỡ máu) yêu cầu nhịn ăn từ 8-12 tiếng. Chỉ nên uống nước lọc.
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-0.5 h-fit rounded-lg bg-indigo-50 p-2 text-indigo-500">
                  <Coffee className="h-4 w-4" />
                </div>
                <div>
                  <strong className="mb-0.5 block text-slate-800">Tránh chất kích thích</strong>
                  Không uống rượu, bia, cà phê, hoặc hút thuốc lá ít nhất 24 giờ trước khi lấy mẫu.
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-0.5 h-fit rounded-lg bg-indigo-50 p-2 text-indigo-500">
                  <Pill className="h-4 w-4" />
                </div>
                <div>
                  <strong className="mb-0.5 block text-slate-800">Thuốc đang sử dụng</strong>
                  Tham khảo ý kiến bác sĩ về việc có nên tạm ngưng các loại thuốc đang dùng hay không.
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-4">
              <button
                onClick={() => setActiveModal('none')}
                className="rounded-2xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'urgent' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Triệu chứng khẩn cấp
              </h3>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 transition-colors hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <p className="mb-4 text-[15px] leading-7 text-slate-600">
                Chọn triệu chứng bạn đang gặp phải để nhận tư vấn ngay:
              </p>

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
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-[15px] font-medium text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    {symptom}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <p className="mb-2 font-medium text-slate-600">Hoặc nhập triệu chứng khác:</p>
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
                    className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-all"
                  />
                  <button
                    disabled={!customSymptom.trim()}
                    onClick={() => {
                      setActiveModal('none');
                      handleSend(customSymptom);
                      setCustomSymptom('');
                    }}
                    className="rounded-2xl bg-slate-800 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Gửi
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
