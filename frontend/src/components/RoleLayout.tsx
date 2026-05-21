import { ReactNode } from 'react';
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
  ADMIN: 'from-indigo-600 to-sky-500',
  COLLECTOR: 'from-emerald-600 to-teal-500',
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
  const session = getDemoSession();
  const navItems = getNavItems(role);
  const activeNavItem = navItems.find((item) => window.location.pathname === item.href.split('#')[0]);
  const pageTitle = activeNavItem?.title || title;

  function handleLogout() {
    logoutDemoRole();
    window.location.href = getLoginPathForRole(role);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {role === DEMO_ROLES.USER ? (
            <div className="flex items-center justify-between gap-4">
              <h1 className="min-w-0 truncate text-xl font-semibold text-slate-900 sm:text-2xl">
                {pageTitle}
              </h1>
              <UserHeader session={session} />
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ROLE_ACCENTS[role]} text-white shadow-sm`}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold text-slate-900">{pageTitle}</h1>
                    <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {session.displayName || ROLE_FALLBACK_NAMES[role]}
                  {session.phone ? <span className="text-slate-400"> · Số điện thoại: {session.phone}</span> : null}
                </div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}

          <nav className="flex justify-center overflow-x-auto pb-1">
            <div className="flex max-w-full gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = window.location.pathname === item.href.split('#')[0];

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-teal-600 text-white shadow-sm'
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
