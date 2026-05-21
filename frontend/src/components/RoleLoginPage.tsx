import { FormEvent, useState } from 'react';
import { ArrowRight, FlaskConical, KeyRound, Mail, MessageCircle, Phone, UserRound } from 'lucide-react';
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
    loginSubtitle: 'Dành cho nhân sự quản trị vận hành HomeLab.',
    registerSubtitle: 'Dành cho nhân sự quản trị vận hành HomeLab.',
    primaryLoginLabel: 'Đăng nhập',
    primaryRegisterLabel: 'Đăng nhập',
    phoneLabel: 'Số điện thoại',
    phonePlaceholder: '0900000001',
  },
  COLLECTOR: {
    loginTitle: 'Đăng nhập nhân viên lấy mẫu',
    registerTitle: 'Đăng nhập nhân viên lấy mẫu',
    loginSubtitle: 'Dành cho nhân viên lấy mẫu đã được quản trị viên tạo tài khoản.',
    registerSubtitle: 'Dành cho nhân viên lấy mẫu đã được quản trị viên tạo tài khoản.',
    primaryLoginLabel: 'Đăng nhập',
    primaryRegisterLabel: 'Đăng nhập',
    phoneLabel: 'Số điện thoại',
    phonePlaceholder: '0987654321',
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
  const relatedLinks = getRelatedLinks(role, effectiveMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-teal-50 px-4 py-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <a href="/" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
          HomeLab
        </a>
        {role === DEMO_ROLES.USER ? <OperationsAccessMenu compact /> : null}
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-white/70 bg-white shadow-xl md:grid-cols-[0.95fr_1.05fr]">
          <section className="bg-gradient-to-br from-slate-900 to-teal-950 px-8 py-10 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-400/20 text-teal-200">
              <FlaskConical className="h-6 w-6" />
            </div>
            <h1 className="mt-8 text-3xl font-semibold">
              {isRegister ? copy.registerTitle : copy.loginTitle}
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {isRegister ? copy.registerSubtitle : copy.loginSubtitle}
            </p>
            <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Thông tin đăng nhập được kiểm tra với tài khoản đã lưu trong hệ thống HomeLab.
            </div>
          </section>

          <form onSubmit={handleSubmit} className="px-8 py-10">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">HomeLab AI</p>
              <h2 className="mt-2 text-2xl font-semibold">
                {role === DEMO_ROLES.USER ? 'Tài khoản người dùng' : 'Khu vực nội bộ'}
              </h2>
            </div>

            <div className="space-y-4">
              {isRegister && (
                <label className="block text-sm font-semibold text-slate-700">
                  Họ tên
                  <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
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
                  <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
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
                <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
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
                <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
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
                  <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
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
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
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
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
