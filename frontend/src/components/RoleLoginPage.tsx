import { FormEvent, useState } from 'react';
import { ArrowRight, FlaskConical, MessageCircle, Phone, UserRound } from 'lucide-react';
import {
  DEMO_ROLES,
  DemoRole,
  getDashboardPathForRole,
  loginDemoRole,
  normalizePhone,
  sanitizeHeaderValue,
} from '../auth/demoAuth';
import { listStaff } from '../api/adminStaffApi';
import OperationsAccessMenu from './OperationsAccessMenu';

type EntryMode = 'login' | 'register';

const ROLE_COPY: Record<
  DemoRole,
  {
    loginTitle: string;
    registerTitle: string;
    loginSubtitle: string;
    registerSubtitle: string;
    primaryLoginLabel: string;
    primaryRegisterLabel: string;
    idLabel: string;
    idPlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
  }
> = {
  USER: {
    loginTitle: 'Đăng nhập người dùng',
    registerTitle: 'Tạo tài khoản',
    loginSubtitle: 'Nhập số điện thoại để theo dõi lịch xét nghiệm và trạng thái lịch hẹn.',
    registerSubtitle: 'Tạo tài khoản để HomeLab ghi nhớ tên và số điện thoại khi theo dõi lịch hẹn.',
    primaryLoginLabel: 'Đăng nhập',
    primaryRegisterLabel: 'Tạo tài khoản',
    idLabel: 'Họ tên',
    idPlaceholder: 'Nguyễn Văn A',
    phoneLabel: 'Số điện thoại',
    phonePlaceholder: '0912345678',
  },
  ADMIN: {
    loginTitle: 'Đăng nhập quản trị',
    registerTitle: 'Đăng ký quản trị',
    loginSubtitle: 'Dành cho nhân sự quản trị vận hành HomeLab.',
    registerSubtitle: 'Tạo quyền truy cập quản trị cho nhân sự vận hành HomeLab.',
    primaryLoginLabel: 'Vào trang quản lý lịch hẹn',
    primaryRegisterLabel: 'Đăng ký quản trị',
    idLabel: 'Tên quản trị viên',
    idPlaceholder: 'Quản trị viên',
    phoneLabel: 'Số điện thoại hoặc mã truy cập',
    phonePlaceholder: '0900000001',
  },
  COLLECTOR: {
    loginTitle: 'Đăng nhập nhân viên lấy mẫu',
    registerTitle: 'Kích hoạt tài khoản nhân viên',
    loginSubtitle: 'Dành cho nhân viên lấy mẫu đã được phân công trong hệ thống.',
    registerSubtitle: 'Kích hoạt tài khoản bằng số điện thoại nhân viên đang hoạt động trong hệ thống.',
    primaryLoginLabel: 'Vào lịch được giao',
    primaryRegisterLabel: 'Kích hoạt và vào lịch được giao',
    idLabel: 'Họ tên nhân viên',
    idPlaceholder: 'Nhân viên lấy mẫu',
    phoneLabel: 'Số điện thoại nhân viên lấy mẫu',
    phonePlaceholder: '0987654321',
  },
};

function getSafeSessionId(role: DemoRole, phone: string, name: string) {
  if (role === DEMO_ROLES.USER) return `user-${phone}`;
  if (role === DEMO_ROLES.COLLECTOR) return `collector-${phone}`;
  return phone ? `admin-${phone}` : sanitizeHeaderValue(name || 'admin-access') || 'admin-access';
}

function getRelatedLinks(role: DemoRole) {
  if (role === DEMO_ROLES.USER) {
    return [
      { href: '/user/login', label: 'Đăng nhập' },
      { href: '/user/register', label: 'Đăng ký' },
    ];
  }

  if (role === DEMO_ROLES.ADMIN) {
    return [
      { href: '/admin/login', label: 'Đăng nhập quản trị' },
      { href: '/admin/register', label: 'Đăng ký quản trị' },
    ];
  }

  return [
    { href: '/collector/login', label: 'Đăng nhập nhân viên' },
    { href: '/collector/register', label: 'Kích hoạt tài khoản nhân viên' },
  ];
}

async function verifyCollector(phone: string) {
  const data = await listStaff({
    role: 'SAMPLE_COLLECTOR',
    active: 'true',
    search: phone,
    limit: 100,
  });
  const staff = data.staff.find((item) => normalizePhone(item.phone || '') === phone);

  if (!staff) {
    throw new Error('Tài khoản nhân viên chưa được quản trị viên tạo hoặc đang tạm khóa.');
  }

  return staff;
}

export default function RoleLoginPage({
  role,
  mode = 'login',
}: {
  role: DemoRole;
  mode?: EntryMode;
}) {
  const copy = ROLE_COPY[role];
  const isRegister = mode === 'register';
  const relatedLinks = getRelatedLinks(role).filter((item) => item.href !== `/${role.toLowerCase()}/${mode}`);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const normalizedPhone = normalizePhone(phone);
      const trimmedName = displayName.trim();

      if (role !== DEMO_ROLES.ADMIN && !normalizedPhone) {
        setError('Vui lòng nhập số điện thoại.');
        return;
      }

      if (role === DEMO_ROLES.USER && isRegister && !trimmedName) {
        setError('Vui lòng nhập họ tên.');
        return;
      }

      let sessionName = trimmedName;
      let sessionPhone = normalizedPhone;

      if (role === DEMO_ROLES.ADMIN && !sessionName && phone.trim()) {
        sessionName = phone.trim();
      }

      if (role === DEMO_ROLES.ADMIN && !sessionPhone && !trimmedName) {
        sessionName = 'Quản trị viên';
      }

      if (role === DEMO_ROLES.COLLECTOR) {
        const staff = await verifyCollector(normalizedPhone);
        sessionName = staff.fullName || trimmedName || 'Nhân viên lấy mẫu';
        sessionPhone = normalizePhone(staff.phone || normalizedPhone);
      }

      loginDemoRole({
        role,
        phone: sessionPhone,
        displayName: sessionName,
        userId: getSafeSessionId(role, sessionPhone, sessionName || phone),
      });

      window.location.href = getDashboardPathForRole(role);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể đăng nhập. Vui lòng thử lại.',
      );
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
              Thông tin đăng nhập được dùng để truy cập đúng khu vực tài khoản trong HomeLab.
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
              {(isRegister || role !== DEMO_ROLES.USER) && (
                <label className="block text-sm font-semibold text-slate-700">
                  {copy.idLabel}
                  <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
                    <UserRound className="h-4 w-4 text-slate-400" />
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder={copy.idPlaceholder}
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

            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {role === DEMO_ROLES.USER ? 'Tài khoản' : 'Cổng liên quan'}
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
          </form>
        </div>
      </div>
    </div>
  );
}
