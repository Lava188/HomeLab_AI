import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { getUserSession, updateUserSessionProfile } from '../auth/demoAuth';
import {
  cancelUserBooking,
  getUserBookingDetail,
  listUserBookings,
  UserBooking,
} from '../api/userBookingApi';
import { getBookingStatusLabel } from '../utils/bookingDisplay';

const ACTIVE_STATUSES = new Set([
  'CONFIRMED',
  'RESCHEDULED',
  'ASSIGNED',
  'SAMPLE_COLLECTED',
  'IN_LAB_PROCESSING',
  'RESULT_READY',
  'PENDING_CONFIRMATION',
]);

const LOCKED_CANCEL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-sky-50 text-sky-700 border-sky-200',
  RESCHEDULED: 'bg-violet-50 text-violet-700 border-violet-200',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SAMPLE_COLLECTED: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_LAB_PROCESSING: 'bg-orange-50 text-orange-700 border-orange-200',
  RESULT_READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  NO_SHOW: 'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_OPTIONS = [
  '',
  'CONFIRMED',
  'RESCHEDULED',
  'ASSIGNED',
  'SAMPLE_COLLECTED',
  'IN_LAB_PROCESSING',
  'RESULT_READY',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

function getTestName(booking: UserBooking) {
  return booking.testName || booking.testCatalogItem?.name || booking.testTypeText || '-';
}

function formatSampleTime(booking: UserBooking) {
  const date = booking.sampleDate || '-';
  const start = booking.sampleTimeStart || '-';
  const end = booking.sampleTimeEnd ? ` - ${booking.sampleTimeEnd}` : '';

  return `${date} ${start}${end}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span>-</span>;

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
      {getBookingStatusLabel(status)}
    </span>
  );
}

export default function UserDashboardPage() {
  const session = getUserSession();
  const [bookings, setBookings] = useState<UserBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<UserBooking | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [bookingCodeSearch, setBookingCodeSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmCancelCode, setConfirmCancelCode] = useState('');
  const [profileEmail, setProfileEmail] = useState(session.email || '');

  const summary = useMemo(() => {
    return {
      total: bookings.length,
      active: bookings.filter((booking) => ACTIVE_STATUSES.has(booking.status)).length,
      completed: bookings.filter((booking) => booking.status === 'COMPLETED').length,
      cancelled: bookings.filter((booking) => booking.status === 'CANCELLED').length,
    };
  }, [bookings]);

  async function loadBookings(nextFilters?: { status: string; bookingCode: string }) {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const activeFilters = nextFilters || {
        status: statusFilter,
        bookingCode: bookingCodeSearch,
      };
      const data = await listUserBookings({
        status: activeFilters.status,
        bookingCode: activeFilters.bookingCode,
      });
      const bookingPatient = data.bookings.find((booking) => booking.patient?.email || booking.patient?.fullName)?.patient;

      if (bookingPatient?.email && bookingPatient.email !== profileEmail) {
        setProfileEmail(bookingPatient.email);
        updateUserSessionProfile({ email: bookingPatient.email });
      }

      if (bookingPatient?.fullName && bookingPatient.fullName !== session.displayName) {
        updateUserSessionProfile({ displayName: bookingPatient.fullName });
      }

      setBookings(data.bookings);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải lịch hẹn. Vui lòng thử lại.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(bookingCode: string) {
    setIsDetailLoading(true);
    setError('');
    setSuccess('');
    setConfirmCancelCode('');

    try {
      const detail = await getUserBookingDetail(bookingCode);
      setSelectedBooking(detail);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải chi tiết lịch hẹn.',
      );
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function handleCancel(bookingCode: string) {
    setIsCancelling(true);
    setError('');
    setSuccess('');

    try {
      await cancelUserBooking(bookingCode);
      setSuccess(`Đã hủy lịch ${bookingCode}.`);
      setConfirmCancelCode('');
      await loadBookings();
      const detail = await getUserBookingDetail(bookingCode);
      setSelectedBooking(detail);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể hủy lịch hẹn. Vui lòng thử lại.',
      );
    } finally {
      setIsCancelling(false);
    }
  }

  useEffect(() => {
    if (!session.phone || !session.patientId) {
      window.location.replace('/user/login');
      return;
    }

    loadBookings();
  }, [session.phone, session.patientId]);

  const summaryCards = [
    { label: 'Tổng lịch hẹn', value: summary.total, icon: ClipboardList, tone: 'bg-white text-slate-800 border-slate-200' },
    { label: 'Sắp tới/Đang xử lý', value: summary.active, icon: Clock3, tone: 'bg-sky-50 text-sky-700 border-sky-100' },
    { label: 'Đã hoàn thành', value: summary.completed, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { label: 'Đã hủy', value: summary.cancelled, icon: AlertCircle, tone: 'bg-rose-50 text-rose-700 border-rose-100' },
  ];

  if (!session.phone || !session.patientId) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.label} className={`rounded-2xl border p-5 shadow-sm ${card.tone}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{card.value}</p>
                </div>
                <div className="rounded-xl bg-white/80 p-3">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {(error || success) && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>{error || success}</span>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto_auto]">
          <label className="text-sm font-semibold text-slate-700">
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status || 'ALL'} value={status}>
                  {status ? getBookingStatusLabel(status) : 'Tất cả trạng thái'}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Mã lịch hẹn
            <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-400 focus-within:bg-white">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={bookingCodeSearch}
                onChange={(event) => setBookingCodeSearch(event.target.value)}
                placeholder="HLB-YYYYMMDD-XXXX"
                className="w-full bg-transparent px-3 py-3 text-sm outline-none"
              />
            </div>
          </label>

          <button
            onClick={() => loadBookings()}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 lg:self-end"
          >
            <Search className="h-4 w-4" />
            Lọc
          </button>
          <button
            onClick={() => {
              setStatusFilter('');
              setBookingCodeSearch('');
              loadBookings({ status: '', bookingCode: '' });
            }}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 lg:self-end"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Lịch hẹn của tôi</h3>
          <p className="mt-1 text-sm text-slate-500">{bookings.length} lịch hẹn đang hiển thị</p>
        </div>

        {isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Đang tải lịch hẹn...</div>
        ) : bookings.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarPlus className="mx-auto h-10 w-10 text-teal-600" />
            <h4 className="mt-4 font-semibold">Chưa có lịch hẹn cho số điện thoại này</h4>
            <p className="mt-2 text-sm text-slate-500">
              Bạn có thể quay lại Chatbot để tạo lịch xét nghiệm mới.
            </p>
            <a
              href="/"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <MessageCircle className="h-4 w-4" />
              Đặt lịch mới qua Chatbot
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Mã lịch</th>
                  <th className="px-5 py-3">Xét nghiệm</th>
                  <th className="px-5 py-3">Lịch lấy mẫu</th>
                  <th className="px-5 py-3">Địa chỉ</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {bookings.map((booking) => (
                  <tr key={booking.bookingCode} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">{booking.bookingCode}</td>
                    <td className="px-5 py-4 text-slate-600">
                      <span className="line-clamp-2">{getTestName(booking)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <p className="font-medium text-slate-700">{formatSampleTime(booking)}</p>
                      <p className="mt-1 text-xs text-slate-500">Lịch lấy mẫu</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <span className="line-clamp-2" title={booking.address || ''}>{booking.address || '-'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-2">
                        <StatusBadge status={booking.status} />
                        <p className="max-w-[220px] text-xs text-slate-500">
                          {booking.assignedStaff?.fullName || 'Chưa phân công nhân viên lấy mẫu'}
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <button
                        onClick={() => loadDetail(booking.bookingCode)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold">{selectedBooking.bookingCode}</h3>
                  <StatusBadge status={selectedBooking.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedBooking.patientName || selectedBooking.patient?.fullName || '-'} · {selectedBooking.phone || '-'}
                </p>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng chi tiết"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-78px)] overflow-y-auto p-5">
              {isDetailLoading ? (
                <div className="py-12 text-center text-sm text-slate-500">Đang tải chi tiết lịch hẹn...</div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  <section className="space-y-5">
                    <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2">
                      <Info label="Xét nghiệm/gói" value={getTestName(selectedBooking)} />
                      <Info label="Ngày/giờ lấy mẫu" value={formatSampleTime(selectedBooking)} />
                      <Info label="Địa chỉ" value={selectedBooking.address || '-'} wide />
                      <Info label="Nhân viên lấy mẫu" value={selectedBooking.assignedStaff?.fullName || 'Chưa phân công'} />
                      <Info label="Số điện thoại nhân viên lấy mẫu" value={selectedBooking.assignedStaff?.phone || '-'} />
                    </div>

                    <div>
                      <h4 className="font-semibold">Dòng thời gian trạng thái</h4>
                      <div className="mt-3 rounded-2xl border border-slate-200">
                        {(selectedBooking.statusHistory || []).length === 0 ? (
                          <div className="p-4 text-sm text-slate-500">Chưa có lịch sử trạng thái.</div>
                        ) : (
                          selectedBooking.statusHistory?.map((item) => (
                            <div key={item.id} className="border-b border-slate-100 p-4 last:border-b-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {item.fromStatus ? <StatusBadge status={item.fromStatus} /> : <span className="text-sm text-slate-400">Bắt đầu</span>}
                                <span className="text-slate-400">→</span>
                                <StatusBadge status={item.toStatus} />
                              </div>
                              <p className="mt-2 text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </section>

                  <aside className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="font-semibold">Thao tác</h4>
                      <p className="mt-2 text-sm text-slate-500">
                        Đổi lịch hiện thực hiện qua Chatbot. Bạn có thể nhập mã lịch hẹn để được hỗ trợ.
                      </p>
                      <a
                        href="/"
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Đổi lịch qua Chatbot
                      </a>
                    </div>

                    {!LOCKED_CANCEL_STATUSES.has(selectedBooking.status) ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                        <h4 className="font-semibold text-rose-800">Hủy lịch</h4>
                        <p className="mt-2 text-sm text-rose-700">
                          Xác nhận trước khi hủy lịch hẹn này.
                        </p>
                        {confirmCancelCode === selectedBooking.bookingCode ? (
                          <div className="mt-4 grid gap-2">
                            <button
                              onClick={() => handleCancel(selectedBooking.bookingCode)}
                              disabled={isCancelling}
                              className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              {isCancelling ? 'Đang hủy...' : 'Xác nhận hủy lịch'}
                            </button>
                            <button
                              onClick={() => setConfirmCancelCode('')}
                              disabled={isCancelling}
                              className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              Giữ lịch
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmCancelCode(selectedBooking.bookingCode)}
                            className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700"
                          >
                            Hủy lịch
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        Lịch ở trạng thái {getBookingStatusLabel(selectedBooking.status)} nên không thể hủy trên trang này.
                      </div>
                    )}
                  </aside>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <div className="text-xs font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{value}</div>
    </div>
  );
}
