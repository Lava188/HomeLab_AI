import { FormEvent, useState } from 'react';
import { ArrowRight, ChevronDown, FlaskConical, KeyRound, Mail, MessageCircle, Phone, UserRound } from 'lucide-react';
import {
  DEMO_ROLES,
  DemoRole,
  getDashboardPathForRole,
  loginDemoRole,
  normalizePhone,
} from '../auth/demoAuth';
import { loginAdmin, loginCollector, loginUser, registerUser } from '../api/roleAuthApi';
import OperationsAccessMenu from './OperationsAccessMenu';

type EntryMode = 'login' | 'register';

type RoleCopy = {
  loginTitle: string;
  registerTitle: string;
  loginSubtitle: string;
  registerSubtitle: string;
  primaryLoginLabel: string;
  primaryRegisterLabel: string;
  phoneLabel: string;
  phonePlaceholder: string;
};

type RoleTheme = {
  pageClass: string;
  brandClass: string;
  panelClass: string;
  sideClass: string;
  iconClass: string;
  sideTextClass: string;
  infoClass: string;
  eyebrowClass: string;
  inputClass: string;
  buttonClass: string;
  chatbotClass: string;
};

const ROLE_COPY: Record<DemoRole, RoleCopy> = {
  USER: {
    loginTitle: 'Đăng nhập người dùng',
    registerTitle: 'Tạo tài khoản',
    loginSubtitle: 'Đăng nhập để theo dõi lịch xét nghiệm và kết quả của bạn.',
    registerSubtitle: 'Tạo tài khoản để HomeLab lưu thông tin đặt lịch và hỗ trợ theo dõi hồ sơ.',
    primaryLoginLabel: 'Đăng nhập',
    primaryRegisterLabel: 'Đăng ký',
    phoneLabel: 'Số điện thoại',
    phonePlaceholder: '0912345678',
  },
  ADMIN: {
    loginTitle: 'Đăng nhập quản trị',
    registerTitle: 'Đăng nhập quản trị',
    loginSubtitle: 'Đăng nhập để quản lý lịch hẹn, nhân viên và vận hành hệ thống HomeLab.',
    registerSubtitle: 'Đăng nhập để quản lý lịch hẹn, nhân viên và vận hành hệ thống HomeLab.',
    primaryLoginLabel: 'Đăng nhập',
    primaryRegisterLabel: 'Đăng nhập',
    phoneLabel: 'Email hoặc số điện thoại',
    phonePlaceholder: 'Nhập email hoặc số điện thoại',
  },
  COLLECTOR: {
    loginTitle: 'Đăng nhập nhân viên lấy mẫu',
    registerTitle: 'Đăng nhập nhân viên lấy mẫu',
    loginSubtitle: 'Đăng nhập để xem lịch lấy mẫu, cập nhật tiến trình và nhận nhiệm vụ.',
    registerSubtitle: 'Đăng nhập để xem lịch lấy mẫu, cập nhật tiến trình và nhận nhiệm vụ.',
    primaryLoginLabel: 'Đăng nhập',
    primaryRegisterLabel: 'Đăng nhập',
    phoneLabel: 'Email, tên đăng nhập hoặc số điện thoại',
    phonePlaceholder: 'Nhập thông tin tài khoản',
  },
};

const ROLE_THEME: Record<DemoRole, RoleTheme> = {
  USER: {
    pageClass: 'min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-teal-50 px-4 py-8 text-slate-900',
    brandClass: 'text-sm font-semibold text-teal-700 hover:text-teal-800',
    panelClass: 'grid w-full overflow-hidden rounded-2xl border border-white/70 bg-white shadow-xl md:grid-cols-[0.95fr_1.05fr]',
    sideClass: 'bg-gradient-to-br from-slate-900 to-teal-950 px-8 py-10 text-white',
    iconClass: 'flex h-12 w-12 items-center justify-center rounded-xl bg-teal-400/20 text-teal-200',
    sideTextClass: 'mt-4 text-sm leading-6 text-slate-300',
    infoClass: 'mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300',
    eyebrowClass: 'text-sm font-semibold uppercase tracking-wide text-teal-700',
    inputClass: 'mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white',
    buttonClass: 'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60',
    chatbotClass: 'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50',
  },
  ADMIN: {
    pageClass: 'min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 px-4 py-8 text-slate-900',
    brandClass: 'text-sm font-semibold text-blue-700 transition hover:text-blue-800',
    panelClass: 'grid w-full overflow-hidden rounded-2xl border border-blue-100/80 bg-white shadow-[0_24px_70px_rgba(37,99,235,0.14)] md:grid-cols-[0.95fr_1.05fr]',
    sideClass: 'bg-gradient-to-br from-blue-50 via-sky-50 to-white px-8 py-10 text-slate-900',
    iconClass: 'flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shadow-sm',
    sideTextClass: 'mt-4 text-sm leading-6 text-slate-600',
    infoClass: 'mt-8 rounded-xl border border-blue-100 bg-white/80 p-4 text-sm text-slate-600 shadow-sm',
    eyebrowClass: 'text-sm font-semibold uppercase tracking-wide text-blue-700',
    inputClass: 'mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 shadow-sm transition focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(96,165,250,0.16)]',
    buttonClass: 'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-600/30 disabled:translate-y-0 disabled:opacity-60',
    chatbotClass: 'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
  },
  COLLECTOR: {
    pageClass: 'min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-4 py-8 text-slate-900',
    brandClass: 'text-sm font-semibold text-emerald-700 transition hover:text-emerald-800',
    panelClass: 'grid w-full overflow-hidden rounded-2xl border border-emerald-100/80 bg-white shadow-[0_24px_70px_rgba(16,185,129,0.14)] md:grid-cols-[0.95fr_1.05fr]',
    sideClass: 'bg-gradient-to-br from-emerald-50 via-lime-50 to-amber-50 px-8 py-10 text-slate-900',
    iconClass: 'flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-sm',
    sideTextClass: 'mt-4 text-sm leading-6 text-slate-600',
    infoClass: 'mt-8 rounded-xl border border-emerald-100 bg-white/80 p-4 text-sm text-slate-600 shadow-sm',
    eyebrowClass: 'text-sm font-semibold uppercase tracking-wide text-emerald-700',
    inputClass: 'mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 shadow-sm transition focus-within:border-emerald-400 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(52,211,153,0.16)]',
    buttonClass: 'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-emerald-600/30 disabled:translate-y-0 disabled:opacity-60',
    chatbotClass: 'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700',
  },
};

function mapAuthError(error: unknown) {
  const codedError = error as Error & { code?: string };

  if (codedError.code === 'INVALID_CREDENTIALS') {
    return 'Số điện thoại hoặc mật khẩu không đúng.';
  }

  if (
    codedError.code === 'USER_ACCOUNT_NOT_FOUND' ||
    codedError.code === 'ADMIN_ACCOUNT_NOT_FOUND' ||
    codedError.code === 'COLLECTOR_ACCOUNT_NOT_FOUND'
  ) {
    return 'Không tìm thấy tài khoản phù hợp.';
  }

  if (codedError.code === 'STAFF_INACTIVE') {
    return 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.';
  }

  if (codedError.code === 'USER_PASSWORD_NOT_SET' || codedError.code === 'STAFF_PASSWORD_NOT_SET') {
    return 'Tài khoản chưa thiết lập mật khẩu. Vui lòng liên hệ quản trị viên.';
  }

  if (codedError.code === 'USER_ACCOUNT_ALREADY_EXISTS') {
    return 'Số điện thoại này đã có tài khoản. Vui lòng đăng nhập.';
  }

  if (codedError.code === 'USER_EMAIL_REQUIRED') {
    return 'Vui lòng nhập email.';
  }

  if (codedError.code === 'USER_EMAIL_INVALID') {
    return 'Email không đúng định dạng.';
  }

  if (codedError.code === 'USER_PHONE_INVALID') {
    return 'Số điện thoại phải bắt đầu bằng 0 và có 10 chữ số.';
  }

  if (codedError.code === 'PASSWORD_TOO_WEAK') {
    return 'Mật khẩu cần có ít nhất 8 ký tự.';
  }

  return codedError.message || 'Không thể đăng nhập. Vui lòng thử lại.';
}

function getRelatedLinks(role: DemoRole, mode: EntryMode) {
  if (role !== DEMO_ROLES.USER) return [];

  return [
    { href: '/user/login', label: 'Đăng nhập' },
    { href: '/user/register', label: 'Đăng ký' },
  ].filter((item) => item.href !== `/user/${mode}`);
}

export default function RoleLoginPage({
  role,
  mode = 'login',
}: {
  role: DemoRole;
  mode?: EntryMode;
}) {
  const effectiveMode = role === DEMO_ROLES.USER ? mode : 'login';
  const isRegister = effectiveMode === 'register';
  const copy = ROLE_COPY[role];
  const theme = ROLE_THEME[role];
  const relatedLinks = getRelatedLinks(role, effectiveMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRoleSwitchOpen, setIsRoleSwitchOpen] = useState(false);

  const roleSwitchOptions = role === DEMO_ROLES.ADMIN
    ? [
        { href: '/user/login', label: 'Người dùng' },
        { href: '/collector/login', label: 'Nhân viên lấy mẫu' },
      ]
    : role === DEMO_ROLES.COLLECTOR
      ? [
          { href: '/user/login', label: 'Người dùng' },
          { href: '/admin/login', label: 'Quản trị viên' },
        ]
      : [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const normalizedPhone = normalizePhone(phone);
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (isRegister && !trimmedName) {
      setError('Vui lòng nhập họ tên.');
      return;
    }

    if (isRegister && !trimmedEmail) {
      setError('Vui lòng nhập email.');
      return;
    }

    if (isRegister && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Email không đúng định dạng.');
      return;
    }

    if (!normalizedPhone) {
      setError('Vui lòng nhập số điện thoại.');
      return;
    }

    if (isRegister && !/^0\d{9}$/.test(normalizedPhone)) {
      setError('Số điện thoại phải bắt đầu bằng 0 và có 10 chữ số.');
      return;
    }

    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (role === DEMO_ROLES.USER && isRegister) {
        const data = await registerUser(trimmedName, trimmedEmail, normalizedPhone, password);
        loginDemoRole({
          role: DEMO_ROLES.USER,
          patientId: data.session.patientId,
          userId: data.session.patientId,
          phone: data.session.phone,
          displayName: data.session.name,
          email: data.session.email || trimmedEmail,
        });
        window.location.href = getDashboardPathForRole(DEMO_ROLES.USER);
        return;
      }

      if (role === DEMO_ROLES.USER) {
        const data = await loginUser(normalizedPhone, password);
        loginDemoRole({
          role: DEMO_ROLES.USER,
          patientId: data.session.patientId,
          userId: data.session.patientId,
          phone: data.session.phone,
          displayName: data.session.name,
          email: data.session.email || '',
        });
        window.location.href = getDashboardPathForRole(DEMO_ROLES.USER);
        return;
      }

      if (role === DEMO_ROLES.ADMIN) {
        const data = await loginAdmin(normalizedPhone, password);
        loginDemoRole({
          role: DEMO_ROLES.ADMIN,
          userId: data.session.staffId,
          phone: data.session.phone,
          displayName: data.session.name,
        });
        window.location.href = getDashboardPathForRole(DEMO_ROLES.ADMIN);
        return;
      }

      const data = await loginCollector(normalizedPhone, password);
      loginDemoRole({
        role: DEMO_ROLES.COLLECTOR,
        userId: data.session.staffId,
        phone: data.session.phone,
        displayName: data.session.name,
      });
      window.location.href = getDashboardPathForRole(DEMO_ROLES.COLLECTOR);
    } catch (nextError) {
      setError(mapAuthError(nextError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={theme.pageClass}>
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <a href="/" className={theme.brandClass}>
          HomeLab
        </a>
        {role === DEMO_ROLES.USER ? <OperationsAccessMenu compact /> : null}
        {roleSwitchOptions.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRoleSwitchOpen((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold shadow-sm transition ${
                role === DEMO_ROLES.ADMIN
                  ? 'border-blue-100 text-blue-700 hover:bg-blue-50'
                  : 'border-emerald-100 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Chuyển sang
              <ChevronDown className="h-4 w-4" />
            </button>
            {isRoleSwitchOpen ? (
              <div className={`absolute right-0 z-20 mt-2 w-56 rounded-2xl border bg-white p-2 shadow-xl ${
                role === DEMO_ROLES.ADMIN ? 'border-blue-100' : 'border-emerald-100'
              }`}>
                {roleSwitchOptions.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition ${
                      role === DEMO_ROLES.ADMIN
                        ? 'hover:bg-blue-50 hover:text-blue-700'
                        : 'hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className={theme.panelClass}>
          <section className={theme.sideClass}>
            <div className={theme.iconClass}>
              <FlaskConical className="h-6 w-6" />
            </div>
            <h1 className="mt-8 text-3xl font-semibold">
              {isRegister ? copy.registerTitle : copy.loginTitle}
            </h1>
            <p className={theme.sideTextClass}>
              {isRegister ? copy.registerSubtitle : copy.loginSubtitle}
            </p>
            <div className={theme.infoClass}>
              Thông tin đăng nhập được kiểm tra với tài khoản đã lưu trong hệ thống HomeLab.
            </div>
          </section>

          <form onSubmit={handleSubmit} className="px-8 py-10">
            <div className="mb-6">
              <p className={theme.eyebrowClass}>HomeLab AI</p>
              <h2 className="mt-2 text-2xl font-semibold">
                {role === DEMO_ROLES.USER ? 'Tài khoản người dùng' : 'Khu vực nội bộ'}
              </h2>
            </div>

            <div className="space-y-4">
              {isRegister && (
                <label className="block text-sm font-semibold text-slate-700">
                  Họ tên
                  <div className={theme.inputClass}>
                    <UserRound className="h-4 w-4 text-slate-400" />
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                    />
                  </div>
                </label>
              )}

              {isRegister && (
                <label className="block text-sm font-semibold text-slate-700">
                  Email
                  <div className={theme.inputClass}>
                    <Mail className="h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                    />
                  </div>
                </label>
              )}

              <label className="block text-sm font-semibold text-slate-700">
                {copy.phoneLabel}
                <div className={theme.inputClass}>
                  <Phone className="h-4 w-4 text-slate-400" />
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder={copy.phonePlaceholder}
                    className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                  />
                </div>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Mật khẩu
                <div className={theme.inputClass}>
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                  />
                </div>
              </label>

              {isRegister && (
                <label className="block text-sm font-semibold text-slate-700">
                  Xác nhận mật khẩu
                  <div className={theme.inputClass}>
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                    />
                  </div>
                </label>
              )}
            </div>

            {error ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className={theme.buttonClass}
            >
              {isSubmitting ? 'Đang xử lý...' : isRegister ? copy.primaryRegisterLabel : copy.primaryLoginLabel}
              <ArrowRight className="h-4 w-4" />
            </button>

            {role === DEMO_ROLES.USER && !isRegister ? (
              <a
                href="/user/forgot-password"
                className="mt-3 inline-flex w-full justify-center text-sm font-semibold text-teal-700 hover:text-teal-800"
              >
                Quên mật khẩu?
              </a>
            ) : null}

            <a
              href="/"
              className={theme.chatbotClass}
            >
              <MessageCircle className="h-4 w-4" />
              Về Chatbot
            </a>

            {relatedLinks.length > 0 ? (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Tài khoản
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {relatedLinks.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
