import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  FlaskConical,
  HeartPulse,
  Loader2,
  LogOut,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { clearChatSession, Message, mockSendMessage, SourceCitation } from '../api/chatApi';
import { DEMO_ROLES, getDemoSession, logoutDemoRole } from '../auth/demoAuth';
import OperationsAccessMenu from './OperationsAccessMenu';

const STORAGE_KEY = 'homelab_chat_history';

type DisplaySource = {
  name: string;
  url?: string;
};

const FRIENDLY_SOURCE_NAMES: Record<string, string> = {
  'medlineplus.gov': 'MedlinePlus',
  'nhs.uk': 'NHS',
  'nice.org.uk': 'NICE',
  'niddk.nih.gov': 'NIDDK',
};

const SUGGESTED_PROMPTS = [
  'CBC là gì?',
  'Tôi muốn đặt lịch xét nghiệm máu sáng mai',
  'HbA1c có cần nhịn ăn không?',
  'Tôi đau ngực khó thở',
];

function cleanSourceValue(value: unknown) {
  const text = String(value ?? '').trim();

  if (!text || text.toLowerCase() === 'undefined' || text.toLowerCase() === 'null') {
    return '';
  }

  return text;
}

function getValidSourceUrl(value: unknown) {
  const text = cleanSourceValue(value);

  if (!text) return '';

  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function getDomainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function friendlySourceName(name: string, domain: string) {
  const normalizedDomain = domain.toLowerCase();
  const normalizedName = name.toLowerCase().replace(/^www\./, '');

  return FRIENDLY_SOURCE_NAMES[normalizedDomain] || FRIENDLY_SOURCE_NAMES[normalizedName] || name;
}

function parseStringCitation(citation: string) {
  const raw = cleanSourceValue(citation);
  const urlMatch = raw.match(/https?:\/\/\S+/);
  const url = getValidSourceUrl(urlMatch?.[0]);
  const name = cleanSourceValue(url ? raw.replace(urlMatch?.[0] || '', '').replace(/\s*-\s*$/, '') : raw);

  return { name, url };
}

function normalizeSourceDisplay(citation: SourceCitation): DisplaySource | null {
  const parsed = typeof citation === 'string' ? parseStringCitation(citation) : null;
  const url =
    typeof citation === 'string'
      ? parsed?.url || ''
      : getValidSourceUrl(
          citation.url ||
            citation.source_url ||
            citation.sourceUrl ||
            citation.finalUrl ||
            citation.final_url,
        );
  const domain = typeof citation === 'string' ? getDomainFromUrl(url) : cleanSourceValue(citation.domain) || getDomainFromUrl(url);
  const rawName =
    typeof citation === 'string'
      ? parsed?.name || domain
      : cleanSourceValue(citation.name || citation.source_name || citation.sourceName || citation.domain || citation.title || domain);
  const name = cleanSourceValue(friendlySourceName(rawName || domain, domain));

  if (!name) return null;

  return {
    name,
    url: url || undefined,
  };
}

function normalizeMessageSources(citations: SourceCitation[] = []) {
  const seen = new Set<string>();
  const sources: DisplaySource[] = [];

  citations.forEach((citation) => {
    const source = normalizeSourceDisplay(citation);

    if (!source) return;

    const key = source.url ? `url:${source.url.toLowerCase()}` : `name:${source.name.toLowerCase()}`;

    if (seen.has(key)) return;

    seen.add(key);
    sources.push(source);
  });

  return sources;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [session, setSession] = useState(() => getDemoSession());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isUserLoggedIn = session.role === DEMO_ROLES.USER && Boolean(session.phone);
  const userDashboardPath = isUserLoggedIn ? '/user/dashboard' : '/user/login';

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (error) {
        console.error('Không thể đọc lịch sử trò chuyện', error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function focusChat(nextValue?: string) {
    if (nextValue) setInputValue(nextValue);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function handleNewChat() {
    setMessages([]);
    setInputValue('');
    localStorage.removeItem(STORAGE_KEY);
    clearChatSession();
    focusChat();
  }

  function handleUserLogout() {
    logoutDemoRole();
    setSession(getDemoSession());
  }

  async function handleSend(text = inputValue) {
    const trimmedText = text.trim();
    if (!trimmedText || isTyping) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: Message = {
      id: `${Date.now()}`,
      role: 'user',
      text: trimmedText,
      timestamp,
    };

    setMessages((current) => [...current, userMessage]);
    setInputValue('');
    setIsTyping(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await mockSendMessage(trimmedText);
      setMessages((current) => [...current, response]);
    } catch (error) {
      console.error('Không thể gửi tin nhắn', error);
    } finally {
      setIsTyping(false);
    }
  }

  function handleInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.16),_transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eef8ff_52%,#ecfdf5_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-sky-600 text-white shadow-sm">
              <FlaskConical className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-semibold tracking-tight">HomeLab</span>
              <span className="hidden text-xs font-medium text-slate-500 sm:block">Xét nghiệm tại nhà</span>
            </span>
          </a>

          <nav className="hidden items-center gap-2 md:flex">
            <a href="/" className="rounded-xl bg-teal-50 px-3.5 py-2 text-sm font-semibold text-teal-700">
              Chatbot
            </a>
            <a
              href={userDashboardPath}
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-teal-700"
            >
              Theo dõi lịch hẹn
            </a>
          </nav>

          <div className="flex items-center gap-2">
            {isUserLoggedIn ? (
              <div className="hidden items-center gap-2 lg:flex">
                <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">
                  <span className="block">Đã đăng nhập</span>
                  <span className="mt-0.5 block text-teal-700">{session.phone}</span>
                </div>
                <a
                  href="/user/dashboard"
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Lịch của tôi
                </a>
                <button
                  onClick={handleUserLogout}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            ) : (
              <>
                <a
                  href="/user/login"
                  className="hidden rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:inline-flex"
                >
                  Đăng nhập
                </a>
                <a
                  href="/user/register"
                  className="hidden rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:inline-flex"
                >
                  Đăng ký
                </a>
              </>
            )}
            {isUserLoggedIn ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50 px-2.5 py-2 text-xs font-semibold text-teal-800 shadow-sm lg:hidden">
                <span className="hidden sm:inline">Đã đăng nhập</span>
                <span>{session.phone}</span>
                <button onClick={handleUserLogout} className="text-slate-700 hover:text-slate-900">
                  Đăng xuất
                </button>
              </div>
            ) : null}
            <OperationsAccessMenu compact />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-10">
        <section className="flex flex-col justify-between gap-8 py-2 lg:min-h-[calc(100vh-8rem)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-white/80 px-3 py-1.5 text-sm font-semibold text-teal-700 shadow-sm">
              <ShieldCheck className="h-4 w-4" />
              Hỗ trợ an toàn trước khi đặt lịch
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              Trợ lý xét nghiệm tại nhà HomeLab
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Hỏi thông tin xét nghiệm, kiểm tra triệu chứng ban đầu và đặt lịch lấy mẫu tại nhà một cách an toàn.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                onClick={() => focusChat('Tôi muốn đặt lịch xét nghiệm tại nhà. Vui lòng hướng dẫn tôi các bước tiếp theo.')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 hover:bg-teal-700"
              >
                <CalendarPlus className="h-5 w-5" />
                Đặt lịch xét nghiệm
              </button>
              <a
                href={userDashboardPath}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white px-5 py-3 text-sm font-semibold text-sky-700 shadow-sm hover:bg-sky-50"
              >
                <CalendarCheck className="h-5 w-5" />
                Theo dõi lịch hẹn
              </a>
              <button
                onClick={() => focusChat('Tôi muốn hỏi về xét nghiệm.')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <MessageCircle className="h-5 w-5" />
                Hỏi về xét nghiệm
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-teal-50 p-3 text-teal-700">
                <HeartPulse className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">HomeLab hỗ trợ</h2>
                <p className="text-sm text-slate-500">Thông tin rõ ràng cho người dùng trước và sau khi đặt lịch.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                'Giải thích xét nghiệm',
                'Kiểm tra dấu hiệu cần đi khám/cấp cứu',
                'Đặt lịch lấy mẫu tại nhà',
                'Theo dõi tiến trình lịch hẹn',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-[680px] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-sky-900/10 lg:max-h-[calc(100vh-8rem)]">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">Tư vấn với HomeLab</h2>
                <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-teal-700">
                  <span className="h-2 w-2 rounded-full bg-teal-500" />
                  Sẵn sàng hỗ trợ
                </div>
              </div>
            </div>
            <button
              onClick={handleNewChat}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              Làm mới
            </button>
          </div>

          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => focusChat(prompt)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50/70 px-5 py-5">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <div className="rounded-3xl bg-white p-4 text-teal-600 shadow-sm">
                  <Stethoscope className="h-8 w-8" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-slate-950">Bạn cần HomeLab hỗ trợ gì hôm nay?</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Nhập câu hỏi về xét nghiệm, triệu chứng ban đầu hoặc yêu cầu đặt lịch lấy mẫu tại nhà.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => {
                  const sources = normalizeMessageSources(message.citations);
                  const isUser = message.role === 'user';

                  return (
                    <article key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                          isUser
                            ? 'bg-teal-600 text-white'
                            : message.variant === 'clarify'
                              ? 'border border-amber-200 bg-amber-50 text-slate-800'
                              : 'border border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{message.text}</div>
                        {!isUser && message.selectedPackage ? (
                          <div className="mt-3 rounded-2xl border border-teal-100 bg-teal-50 p-3 text-left">
                            <div className="text-sm font-semibold text-teal-900">{message.selectedPackage.name}</div>
                            {message.selectedPackage.components && message.selectedPackage.components.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {message.selectedPackage.components.map((component) => (
                                  <span key={component} className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-teal-700">
                                    {component}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {!isUser && message.packageCandidates && message.packageCandidates.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {message.packageCandidates.map((item) => (
                              <span key={item.code || item.name} className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                {item.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {sources.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                            {sources.map((source) =>
                              source.url ? (
                                <a
                                  key={source.url}
                                  href={source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                                >
                                  {source.name}
                                </a>
                              ) : (
                                <span key={source.name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                  {source.name}
                                </span>
                              ),
                            )}
                          </div>
                        ) : null}
                        <div className={`mt-2 text-[11px] font-medium ${isUser ? 'text-teal-50' : 'text-slate-400'}`}>
                          {message.timestamp}
                        </div>
                        {!isUser && message.meta?.action === 'AUTH_REQUIRED' ? (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                            <a
                              href="/user/login"
                              className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                            >
                              Đăng nhập
                            </a>
                            <a
                              href="/user/register"
                              className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                            >
                              Tạo tài khoản
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {isTyping ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                      HomeLab đang soạn phản hồi
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          <div className="border-t border-slate-100 bg-white p-4">
            <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-teal-300 focus-within:ring-4 focus-within:ring-teal-100">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Nhắn tin cho HomeLab..."
                rows={1}
                className="max-h-[150px] min-h-[62px] w-full resize-none rounded-2xl bg-transparent py-4 pl-4 pr-14 text-base text-slate-900 outline-none placeholder:text-slate-400"
                aria-label="Nhập tin nhắn"
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping}
                className="absolute bottom-2.5 right-2.5 rounded-xl bg-teal-600 p-2.5 text-white hover:bg-teal-700 disabled:bg-slate-100 disabled:text-slate-400"
                aria-label="Gửi tin nhắn"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2 text-xs font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Enter để gửi, Shift+Enter để xuống dòng
              </span>
              <span className="inline-flex items-center gap-1.5 text-left sm:text-right">
                <AlertCircle className="h-3.5 w-3.5" />
                Kiểm tra lại các thông tin y tế quan trọng với nhân viên y tế.
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
