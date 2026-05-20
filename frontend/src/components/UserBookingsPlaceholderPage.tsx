import { ClipboardList, MessageCircle } from 'lucide-react';
import { getDemoSession } from '../auth/demoAuth';

export default function UserBookingsPlaceholderPage() {
  const session = getDemoSession();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <ClipboardList className="h-7 w-7 text-teal-700" />
      <h2 className="mt-4 text-2xl font-semibold">Lịch của tôi</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Danh sách lịch hẹn đang được hiển thị tại trang tổng quan người dùng. Hệ thống lọc theo số điện thoại
        {session.phone ? ` ${session.phone}` : ''}.
      </p>
      <a
        href="/"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <MessageCircle className="h-4 w-4" />
        Đặt lịch mới qua Chatbot
      </a>
    </section>
  );
}
