import { FormEvent, useState } from 'react';
import { ArrowLeft, CheckCircle2, FlaskConical, MessageCircle, Phone } from 'lucide-react';
import { normalizePhone } from '../auth/demoAuth';

export default function UserForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!normalizePhone(phone)) {
      setError('Vui lòng nhập số điện thoại đã đăng ký.');
      return;
    }

    setSuccess('Yêu cầu khôi phục đã được ghi nhận. Vui lòng liên hệ HomeLab hoặc quản trị viên để được hỗ trợ.');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-teal-50 px-4 py-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <a href="/" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
          HomeLab
        </a>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-white/70 bg-white shadow-xl md:grid-cols-[0.95fr_1.05fr]">
          <section className="bg-gradient-to-br from-slate-900 to-teal-950 px-8 py-10 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-400/20 text-teal-200">
              <FlaskConical className="h-6 w-6" />
            </div>
            <h1 className="mt-8 text-3xl font-semibold">Khôi phục tài khoản</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Nhập số điện thoại đã đăng ký để HomeLab hỗ trợ khôi phục quyền truy cập.
            </p>
          </section>

          <form onSubmit={handleSubmit} className="px-8 py-10">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">HomeLab AI</p>
              <h2 className="mt-2 text-2xl font-semibold">Yêu cầu khôi phục</h2>
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              Số điện thoại
              <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
                <Phone className="h-4 w-4 text-slate-400" />
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="0912345678"
                  className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                />
              </div>
            </label>

            {error ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="mt-4 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Gửi yêu cầu khôi phục
            </button>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <a
                href="/user/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Quay lại đăng nhập
              </a>
              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <MessageCircle className="h-4 w-4" />
                Về Chatbot
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
