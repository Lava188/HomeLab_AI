import { ReactNode, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Truck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  DEMO_ROLES,
  DemoRole,
  getDemoSession,
  getLoginPathForRole,
  logoutDemoRole,
} from '../auth/demoAuth';
import UserHeader from './UserHeader';

const ROLE_LABELS: Record<DemoRole, string> = {
  USER: 'Người dùng/Bệnh nhân',
  ADMIN: 'Quản trị viên',
  COLLECTOR: 'Nhân viên lấy mẫu',
};

const ROLE_ACCENTS: Record<DemoRole, string> = {
  USER: 'from-sky-600 to-teal-500',
  ADMIN: 'from-sky-500 to-teal-400',
  COLLECTOR: 'from-emerald-300 to-lime-200',
};

const ROLE_FALLBACK_NAMES: Record<DemoRole, string> = {
  USER: 'Người dùng',
  ADMIN: 'Quản trị viên',
  COLLECTOR: 'Nhân viên lấy mẫu',
};

function getNavItems(role: DemoRole) {
  if (role === DEMO_ROLES.ADMIN) {
    return [
      { href: '/admin/bookings', label: 'Quản lý lịch hẹn', title: 'Vận hành lịch hẹn', icon: ClipboardList },
      { href: '/admin/availability-slots', label: 'Quản lý khung giờ', title: 'Khung giờ lấy mẫu', icon: CalendarClock },
      { href: '/admin/staff', label: 'Quản lý nhân viên', title: 'Nhân viên lấy mẫu', icon: UsersRound },
      { href: '/', label: 'Chatbot', title: 'Chatbot', icon: MessageCircle },
    ];
  }

  if (role === DEMO_ROLES.COLLECTOR) {
    return [
      { href: '/collector/dashboard', label: 'Tổng quan', title: 'Lịch lấy mẫu', icon: Home },
      { href: '/collector/dashboard#assigned', label: 'Lịch được giao', title: 'Lịch được giao', icon: Truck },
      { href: '/', label: 'Chatbot', title: 'Chatbot', icon: MessageCircle },
    ];
  }

  return [
    { href: '/user/dashboard', label: 'Tổng quan', title: 'Tổng quan', icon: Home },
    { href: '/user/bookings', label: 'Lịch của tôi', title: 'Lịch của tôi', icon: CalendarDays },
    { href: '/user/lab-results', label: 'Phân tích kết quả', title: 'Phân tích kết quả xét nghiệm', icon: FileText },
    { href: '/', label: 'Đặt lịch mới qua Chatbot', title: 'Đặt lịch mới qua Chatbot', icon: MessageCircle },
  ];
}

export default function RoleLayout({
  role,
  title,
  subtitle,
  children,
}: {
  role: DemoRole;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const session = getDemoSession();
  const navItems = getNavItems(role);
  const activeNavItem = navItems.find((item) => window.location.pathname === item.href.split('#')[0]);
  const pageTitle = activeNavItem?.title || title;
  const PageIcon = activeNavItem?.icon || Home;
  const isAdmin = role === DEMO_ROLES.ADMIN;
  const isCollector = role === DEMO_ROLES.COLLECTOR;

  function handleLogout() {
    logoutDemoRole();
    window.location.href = getLoginPathForRole(role);
  }

  return (
    <div className={isAdmin ? 'min-h-screen bg-gradient-to-br from-sky-50 via-white to-teal-50 text-slate-900' : isCollector ? 'min-h-screen bg-gradient-to-br from-emerald-50 via-lime-50/50 to-yellow-50 text-slate-900' : 'min-h-screen bg-slate-100 text-slate-900'}>
      <header className={isAdmin ? 'sticky top-0 z-40 border-b border-sky-100 bg-white/90 shadow-[0_10px_30px_rgba(14,165,233,0.08)] backdrop-blur' : isCollector ? 'sticky top-0 z-40 border-b border-emerald-100 bg-white/90 shadow-[0_12px_32px_rgba(16,185,129,0.10)] backdrop-blur' : 'border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur'}>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {role === DEMO_ROLES.USER ? (
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ROLE_ACCENTS[role]} text-white shadow-sm`}>
                  <PageIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
                    {pageTitle}
                  </h1>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
                </div>
              </div>
              <UserHeader session={session} />
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ROLE_ACCENTS[role]} ${isCollector ? 'text-emerald-800 shadow-[0_10px_22px_rgba(16,185,129,0.16)]' : 'text-white shadow-sm'}`}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold text-slate-900">{pageTitle}</h1>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${isCollector ? 'border-yellow-200 bg-yellow-50 text-emerald-800' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
                </div>
              </div>

              <div className="relative flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIsAccountOpen((current) => !current)}
                  className={`inline-flex items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition ${isCollector ? 'border-emerald-100 bg-emerald-50/80 hover:border-emerald-200 hover:bg-yellow-50' : 'border-sky-100 bg-sky-50/70 hover:border-sky-200 hover:bg-sky-100/70'}`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm ${isCollector ? 'bg-gradient-to-br from-emerald-400 to-lime-300' : 'bg-gradient-to-br from-sky-400 to-teal-400'}`}>
                    <UserRound className="h-5 w-5" />
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block truncate font-semibold text-slate-900">
                      {session.displayName || ROLE_FALLBACK_NAMES[role]}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{ROLE_LABELS[role]}</span>
                  </span>
                </button>

                {isAccountOpen ? (
                  <div className={`absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border bg-white p-3 ${isCollector ? 'border-emerald-100 shadow-[0_20px_50px_rgba(16,185,129,0.16)]' : 'border-sky-100 shadow-[0_20px_50px_rgba(14,165,233,0.16)]'}`}>
                    <div className={`rounded-xl px-3 py-3 text-sm ${isCollector ? 'bg-emerald-50' : 'bg-sky-50'}`}>
                      <div className="font-semibold text-slate-900">
                        {session.displayName || ROLE_FALLBACK_NAMES[role]}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{ROLE_LABELS[role]}</div>
                      {session.phone ? <div className="mt-2 text-xs text-slate-500">Số điện thoại: {session.phone}</div> : null}
                    </div>
                    <button
                      onClick={handleLogout}
                      className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition ${isCollector ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600'}`}
                    >
                      <LogOut className="h-4 w-4" />
                      Đăng xuất
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <nav className="flex justify-center overflow-x-auto pb-1">
            <div className={isAdmin ? 'flex max-w-full gap-2 rounded-2xl border border-sky-100 bg-white/80 p-2 shadow-sm' : isCollector ? 'flex max-w-full gap-2 rounded-2xl border border-emerald-100 bg-white/80 p-2 shadow-[0_10px_24px_rgba(16,185,129,0.08)]' : 'flex max-w-full gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2'}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = window.location.pathname === item.href.split('#')[0];

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? isAdmin
                          ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-sm'
                          : isCollector
                            ? 'bg-emerald-400 text-emerald-950 shadow-sm shadow-emerald-100'
                            : 'bg-teal-600 text-white shadow-sm'
                        : isAdmin
                          ? 'bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700'
                          : isCollector
                            ? 'bg-white text-slate-700 hover:bg-yellow-50 hover:text-emerald-800'
                            : 'bg-white text-slate-700 hover:bg-teal-50 hover:text-teal-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
