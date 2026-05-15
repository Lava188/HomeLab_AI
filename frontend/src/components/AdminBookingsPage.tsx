import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  ClipboardList,
  RefreshCw,
  Search,
  UserRoundPlus,
  X,
} from 'lucide-react';
import {
  AdminBooking,
  BookingFilters,
  BookingStatus,
  assignBooking,
  getBookingDetail,
  listBookings,
  updateBookingStatus,
  updateInternalNote,
} from '../api/adminBookingApi';

const STATUS_OPTIONS: BookingStatus[] = [
  'CONFIRMED',
  'ASSIGNED',
  'SAMPLE_COLLECTED',
  'IN_LAB_PROCESSING',
  'RESULT_READY',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-sky-50 text-sky-700 border-sky-200',
  RESCHEDULED: 'bg-violet-50 text-violet-700 border-violet-200',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SAMPLE_COLLECTED: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_LAB_PROCESSING: 'bg-orange-50 text-orange-700 border-orange-200',
  RESULT_READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  NO_SHOW: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

const EMPTY_FILTERS: BookingFilters = {
  status: '',
  dateFrom: '',
  dateTo: '',
  phone: '',
  bookingCode: '',
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatSampleTime(booking: AdminBooking) {
  const date = booking.sampleDate || '-';
  const start = booking.sampleTimeStart || '-';
  const end = booking.sampleTimeEnd ? ` - ${booking.sampleTimeEnd}` : '';

  return `${date} ${start}${end}`;
}

function getTestName(booking: AdminBooking) {
  return booking.testName || booking.testCatalogItem?.name || booking.testTypeText || '-';
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span>-</span>;

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${
        STATUS_STYLES[status] || 'bg-slate-50 text-slate-700 border-slate-200'
      }`}
    >
      {status}
    </span>
  );
}

export default function AdminBookingsPage() {
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<BookingFilters>(EMPTY_FILTERS);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [statusValue, setStatusValue] = useState<BookingStatus>('CONFIRMED');
  const [statusReason, setStatusReason] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const totalCount = useMemo(() => bookings.length, [bookings]);

  async function loadBookings(nextFilters = appliedFilters) {
    setIsLoading(true);
    setError('');

    try {
      const data = await listBookings(nextFilters);
      setBookings(data.bookings);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải danh sách booking.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(bookingCode: string) {
    setIsDetailLoading(true);
    setError('');

    try {
      const detail = await getBookingDetail(bookingCode);
      setSelectedBooking(detail);
      setStaffName(detail.assignedStaff?.fullName || '');
      setStaffPhone(detail.assignedStaff?.phone || '');
      setStatusValue(
        STATUS_OPTIONS.includes(detail.status) ? detail.status : 'CONFIRMED',
      );
      setStatusReason('');
      setInternalNote(detail.internalNote || '');
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải chi tiết booking.',
      );
    } finally {
      setIsDetailLoading(false);
    }
  }

  useEffect(() => {
    loadBookings(EMPTY_FILTERS);
  }, []);

  async function refreshAfterUpdate(message: string, bookingCode: string) {
    const [detail] = await Promise.all([
      getBookingDetail(bookingCode),
      loadBookings(appliedFilters),
    ]);

    setSelectedBooking(detail);
    setInternalNote(detail.internalNote || '');
    setStaffName(detail.assignedStaff?.fullName || staffName);
    setStaffPhone(detail.assignedStaff?.phone || staffPhone);
    setStatusValue(
      STATUS_OPTIONS.includes(detail.status) ? detail.status : statusValue,
    );
    setSuccess(message);
  }

  async function handleApplyFilters() {
    setAppliedFilters(filters);
    await loadBookings(filters);
  }

  async function handleResetFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    await loadBookings(EMPTY_FILTERS);
  }

  async function handleAssignStaff() {
    if (!selectedBooking) return;
    if (!staffName.trim()) {
      setError('Vui lòng nhập tên nhân viên lấy mẫu.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await assignBooking(selectedBooking.bookingCode, {
        staffName: staffName.trim(),
        staffPhone: staffPhone.trim() || undefined,
        role: 'SAMPLE_COLLECTOR',
      });
      await refreshAfterUpdate('Đã gán nhân viên lấy mẫu.', selectedBooking.bookingCode);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể gán nhân viên.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateStatus() {
    if (!selectedBooking) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateBookingStatus(selectedBooking.bookingCode, {
        status: statusValue,
        reason: statusReason.trim() || undefined,
      });
      await refreshAfterUpdate('Đã cập nhật trạng thái.', selectedBooking.bookingCode);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể cập nhật trạng thái.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveNote() {
    if (!selectedBooking) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateInternalNote(selectedBooking.bookingCode, {
        internalNote,
      });
      await refreshAfterUpdate('Đã lưu ghi chú nội bộ.', selectedBooking.bookingCode);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể lưu ghi chú.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">
                Booking Operations
              </h1>
              <p className="text-sm text-slate-500">
                Quản lý lịch lấy mẫu và vòng đời booking
              </p>
            </div>
          </div>
          <a
            href="/"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Về chat
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {(error || success) && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
              error
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            <span>{error || success}</span>
          </div>
        )}

        <section className="mb-5 border-b border-slate-200 bg-white px-4 py-4">
          <div className="grid gap-3 md:grid-cols-6">
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                value={filters.status || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Date from
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    dateFrom: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Date to
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    dateTo: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Phone
              <input
                value={filters.phone || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="0912..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Booking code
              <input
                value={filters.bookingCode || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    bookingCode: event.target.value,
                  }))
                }
                placeholder="HLB-..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                onClick={handleApplyFilters}
                disabled={isLoading}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
              <button
                onClick={handleResetFilters}
                disabled={isLoading}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="font-semibold">Bookings</h2>
              <p className="text-sm text-slate-500">{totalCount} records loaded</p>
            </div>
            <button
              onClick={() => loadBookings(appliedFilters)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Booking code</th>
                  <th className="px-4 py-3">Patient name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Test/package</th>
                  <th className="px-4 py-3">Sample date/time</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned staff</th>
                  <th className="px-4 py-3">Created at</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      Đang tải danh sách booking...
                    </td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      Chưa có booking phù hợp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  bookings.map((booking) => (
                    <tr key={booking.bookingCode} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                        {booking.bookingCode}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {booking.patientName || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{booking.phone || '-'}</td>
                      <td className="min-w-44 px-4 py-3">{getTestName(booking)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatSampleTime(booking)}
                      </td>
                      <td className="max-w-72 truncate px-4 py-3" title={booking.address || ''}>
                        {booking.address || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {booking.assignedStaff?.fullName || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatDateTime(booking.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          onClick={() => loadDetail(booking.bookingCode)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">
                    {selectedBooking.bookingCode}
                  </h2>
                  <StatusBadge status={selectedBooking.status} />
                </div>
                <p className="text-sm text-slate-500">
                  {selectedBooking.patientName} · {selectedBooking.phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close detail"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5">
              {isDetailLoading ? (
                <div className="py-10 text-center text-slate-500">
                  Đang tải chi tiết booking...
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-5">
                    <section>
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-slate-500">
                        <CalendarDays className="h-4 w-4" />
                        Booking detail
                      </h3>
                      <div className="grid gap-3 border border-slate-200 p-4 sm:grid-cols-2">
                        <Info label="Test/package" value={getTestName(selectedBooking)} />
                        <Info label="Sample date/time" value={formatSampleTime(selectedBooking)} />
                        <Info label="Address" value={selectedBooking.address || '-'} wide />
                        <Info label="Assigned staff" value={selectedBooking.assignedStaff?.fullName || '-'} />
                        <Info label="Created at" value={formatDateTime(selectedBooking.createdAt)} />
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">
                        Status history
                      </h3>
                      <div className="border border-slate-200">
                        {(selectedBooking.statusHistory || []).length === 0 ? (
                          <div className="p-4 text-sm text-slate-500">
                            Chưa có lịch sử trạng thái.
                          </div>
                        ) : (
                          selectedBooking.statusHistory?.map((item) => (
                            <div
                              key={item.id}
                              className="border-b border-slate-100 p-4 last:border-b-0"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={item.fromStatus || 'START'} />
                                <span className="text-slate-400">→</span>
                                <StatusBadge status={item.toStatus} />
                              </div>
                              <p className="mt-2 text-sm text-slate-600">
                                {item.reason || 'No reason provided'}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDateTime(item.createdAt)} · {item.changedByType || '-'}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </div>

                  <aside className="space-y-5">
                    <section className="border border-slate-200 p-4">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold">
                        <UserRoundPlus className="h-4 w-4" />
                        Assign staff
                      </h3>
                      <div className="space-y-3">
                        <input
                          value={staffName}
                          onChange={(event) => setStaffName(event.target.value)}
                          placeholder="Staff name"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <input
                          value={staffPhone}
                          onChange={(event) => setStaffPhone(event.target.value)}
                          placeholder="Staff phone optional"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <input
                          value="SAMPLE_COLLECTOR"
                          readOnly
                          className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                        />
                        <button
                          onClick={handleAssignStaff}
                          disabled={isSaving}
                          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Assign
                        </button>
                      </div>
                    </section>

                    <section className="border border-slate-200 p-4">
                      <h3 className="mb-3 font-semibold">Update status</h3>
                      <div className="space-y-3">
                        <select
                          value={statusValue}
                          onChange={(event) =>
                            setStatusValue(event.target.value as BookingStatus)
                          }
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <input
                          value={statusReason}
                          onChange={(event) => setStatusReason(event.target.value)}
                          placeholder="Reason optional"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          onClick={handleUpdateStatus}
                          disabled={isSaving}
                          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Update status
                        </button>
                      </div>
                    </section>

                    <section className="border border-slate-200 p-4">
                      <h3 className="mb-3 font-semibold">Internal note</h3>
                      <textarea
                        value={internalNote}
                        onChange={(event) => setInternalNote(event.target.value)}
                        rows={5}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Operational note for staff"
                      />
                      <button
                        onClick={handleSaveNote}
                        disabled={isSaving}
                        className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        Save note
                      </button>
                    </section>
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
