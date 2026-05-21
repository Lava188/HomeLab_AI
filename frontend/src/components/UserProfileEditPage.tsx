import { FormEvent, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, Phone, Save, UserRound, X } from 'lucide-react';
import { getUserSession, updateUserSessionProfile } from '../auth/demoAuth';
import { updateUserProfile } from '../api/userProfileApi';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export function UserProfileEditForm({
  onCancel,
  onSaved,
}: {
  onCancel?: () => void;
  onSaved?: (profile: { displayName: string; email: string }) => void;
}) {
  const session = getUserSession();
  const [name, setName] = useState(session.displayName || '');
  const [email, setEmail] = useState(session.email || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!session.phone || !session.patientId) {
    window.location.replace('/user/login');
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError('Vui lòng nhập họ và tên.');
      return;
    }

    if (!trimmedEmail) {
      setError('Vui lòng nhập email.');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError('Email không đúng định dạng.');
      return;
    }

    setIsSaving(true);

    try {
      const data = await updateUserProfile({
        name: trimmedName,
        email: trimmedEmail,
      });
      const nextName = data.session?.name || data.patient?.fullName || trimmedName;
      const nextEmail = data.session?.email || data.patient?.email || trimmedEmail;

      updateUserSessionProfile({
        displayName: nextName,
        email: nextEmail,
      });
      setName(nextName);
      setEmail(nextEmail);
      setSuccess('Đã cập nhật thông tin cá nhân.');
      onSaved?.({ displayName: nextName, email: nextEmail });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể cập nhật thông tin. Vui lòng thử lại.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <UserRound className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">Thông tin tài khoản</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Chỉnh sửa thông tin</h2>
          </div>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            Đóng
          </button>
        ) : (
          <a
            href="/user/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            Hủy
          </a>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <label className="block text-sm font-semibold text-slate-700">
          Họ và tên
          <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
            <UserRound className="h-4 w-4 text-slate-400" />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full bg-transparent px-3 py-3 text-sm outline-none"
            />
          </div>
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          Số điện thoại
          <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-500">
            <Phone className="h-4 w-4 text-slate-400" />
            <input
              value={session.phone}
              readOnly
              className="w-full bg-transparent px-3 py-3 text-sm outline-none"
            />
          </div>
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          Email
          <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
            <Mail className="h-4 w-4 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full bg-transparent px-3 py-3 text-sm outline-none"
            />
          </div>
        </label>

        {error || success ? (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {error ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <span>{error || success}</span>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>
          ) : (
            <a
              href="/user/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </a>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function UserProfileEditPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <UserProfileEditForm />
    </div>
  );
}
