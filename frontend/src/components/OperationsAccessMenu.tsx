import { BriefcaseBusiness, ChevronDown, ShieldCheck, Truck } from 'lucide-react';

export default function OperationsAccessMenu({ compact = false }: { compact?: boolean }) {
  return (
    <details className="group relative">
      <summary
        className={`inline-flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 ${
          compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm'
        }`}
      >
        <BriefcaseBusiness className="h-4 w-4" />
        Cổng vận hành
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
        <a
          href="/admin/login"
          className="flex items-start gap-3 rounded-xl px-3 py-3 text-slate-700 hover:bg-slate-50"
        >
          <span className="rounded-lg bg-sky-50 p-2 text-sky-700">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span>
            <span className="block font-semibold">Quản trị viên</span>
            <span className="mt-0.5 block text-xs font-medium leading-5 text-slate-500">
              Quản lý lịch hẹn, khung giờ và nhân viên
            </span>
          </span>
        </a>
        <a
          href="/collector/login"
          className="flex items-start gap-3 rounded-xl px-3 py-3 text-slate-700 hover:bg-slate-50"
        >
          <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <Truck className="h-4 w-4" />
          </span>
          <span>
            <span className="block font-semibold">Nhân viên lấy mẫu</span>
            <span className="mt-0.5 block text-xs font-medium leading-5 text-slate-500">
              Xem lịch được giao và cập nhật lấy mẫu
            </span>
          </span>
        </a>
      </div>
    </details>
  );
}
