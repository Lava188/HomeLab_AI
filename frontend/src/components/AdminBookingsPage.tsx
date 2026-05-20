import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Beaker,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  RefreshCw,
  Search,
  UserRound,
  UserRoundPlus,
  X,
} from 'lucide-react';
import {
  AdminBooking,
  BookingFilters,
  BookingStatus,
  assignBooking,
  approveCollectorAssignmentRejection,
  getBookingDetail,
  listBookings,
  manualCollectorAssignment,
  rejectCollectorAssignmentRejection,
  updateBookingStatus,
  updateInternalNote,
} from '../api/adminBookingApi';
import {
  listStaff,
  StaffProfileAdmin,
} from '../api/adminStaffApi';
import { getBookingStatusLabel } from '../utils/bookingDisplay';
import { getStaffActiveLabel, getStaffRoleLabel } from '../utils/staffDisplay';

const STATUS_OPTIONS: BookingStatus[] = [
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

const WORKFLOW_STEPS: Array<{
  status: BookingStatus;
  label: string;
  description: string;
  icon: typeof ClipboardList;
}> = [
  {
    status: 'CONFIRMED',
    label: 'Đã xác nhận',
    description: 'Chờ xác nhận/phân công',
    icon: ClipboardList,
  },
  {
    status: 'ASSIGNED',
    label: 'Đã phân công',
    description: 'Đã phân công nhân viên lấy mẫu',
    icon: UserRoundPlus,
  },
  {
    status: 'SAMPLE_COLLECTED',
    label: 'Đã lấy mẫu',
    description: 'Đã lấy mẫu',
    icon: FlaskConical,
  },
  {
    status: 'IN_LAB_PROCESSING',
    label: 'Đang xử lý',
    description: 'Đang xử lý tại phòng xét nghiệm',
    icon: Beaker,
  },
  {
    status: 'RESULT_READY',
    label: 'Có kết quả',
    description: 'Có kết quả',
    icon: FileText,
  },
  {
    status: 'COMPLETED',
    label: 'Hoàn thành',
    description: 'Hoàn tất',
    icon: CheckCircle2,
  },
];

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-sky-50 text-sky-700 border-sky-200',
  RESCHEDULED: 'bg-violet-50 text-violet-700 border-violet-200',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SAMPLE_COLLECTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_LAB_PROCESSING: 'bg-orange-50 text-orange-700 border-orange-200',
  RESULT_READY: 'bg-teal-50 text-teal-700 border-teal-200',
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

function getStatusCount(bookings: AdminBooking[], status: BookingStatus) {
  return bookings.filter((booking) => booking.status === status).length;
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span>-</span>;

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
      {getBookingStatusLabel(status)}
    </span>
  );
}

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  PENDING_COLLECTOR_CONFIRMATION: 'Chờ nhân viên xác nhận',
  ACCEPTED: 'Nhân viên đã nhận',
  REJECTED_PENDING_ADMIN_REVIEW: 'Chờ duyệt lý do từ chối',
  REJECTION_APPROVED: 'Đã duyệt lý do từ chối',
  REJECTION_REJECTED: 'Không duyệt lý do từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  SUPERSEDED: 'Đã thay thế',
};

function AssignmentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span>-</span>;

  const tone =
    status === 'ACCEPTED'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'REJECTED_PENDING_ADMIN_REVIEW'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : status === 'REJECTION_APPROVED'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : status === 'REJECTION_REJECTED'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {ASSIGNMENT_STATUS_LABELS[status] || status}
    </span>
  );
}

const ACTOR_LABELS: Record<string, string> = {
  USER: 'Người dùng',
  ADMIN: 'Quản trị viên',
  COLLECTOR: 'Nhân viên lấy mẫu',
  CHATBOT: 'Chatbot',
  SYSTEM: 'Hệ thống',
};

function getActorLabel(value?: string | null) {
  if (!value) return 'Không xác định';
  return ACTOR_LABELS[value] || value;
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => formatMetadataValue(item))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${formatMetadataValue(item)}`)
      .filter((item) => !item.endsWith(': '))
      .join('; ');
  }

  return '';
}

function getSafeMetadataLines(metadata: unknown): string[] {
  if (!metadata) return [];

  if (typeof metadata === 'string') {
    return metadata.trim() ? [metadata.trim()] : [];
  }

  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    const value = formatMetadataValue(metadata);
    return value ? [value] : [];
  }

  const hiddenKeys = new Set([
    'stack',
    'error',
    'password',
    'token',
    'authorization',
    'internalNote',
  ]);

  return Object.entries(metadata as Record<string, unknown>)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${formatMetadataValue(value)}`)
    .filter((item) => !item.endsWith(': '));
}

export default function AdminBookingsPage({ embedded = false }: { embedded?: boolean }) {
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [staffOptions, setStaffOptions] = useState<StaffProfileAdmin[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [statusValue, setStatusValue] = useState<BookingStatus>('CONFIRMED');
  const [statusReason, setStatusReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [manualAssignmentReason, setManualAssignmentReason] = useState('');

  const summary = useMemo(() => {
    return {
      total: bookings.length,
      unassigned: bookings.filter(
        (booking) =>
          ['CONFIRMED', 'RESCHEDULED'].includes(booking.status) &&
          !booking.assignedStaff,
      ).length,
      assigned: getStatusCount(bookings, 'ASSIGNED'),
      sampleCollected: getStatusCount(bookings, 'SAMPLE_COLLECTED'),
      completed: getStatusCount(bookings, 'COMPLETED'),
      cancelled: getStatusCount(bookings, 'CANCELLED'),
    };
  }, [bookings]);

  const summaryCards = [
    {
      label: 'Tổng lịch hẹn',
      value: summary.total,
      icon: ClipboardList,
      tone: 'bg-white text-slate-800 border-slate-200',
    },
    {
      label: 'Chờ phân công',
      value: summary.unassigned,
      icon: CalendarClock,
      tone: 'bg-sky-50 text-sky-700 border-sky-100',
    },
    {
      label: 'Đã phân công',
      value: summary.assigned,
      icon: UserRoundPlus,
      tone: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    },
    {
      label: 'Đã lấy mẫu',
      value: summary.sampleCollected,
      icon: FlaskConical,
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      label: 'Hoàn thành',
      value: summary.completed,
      icon: CheckCircle2,
      tone: 'bg-teal-50 text-teal-700 border-teal-100',
    },
    {
      label: 'Đã hủy',
      value: summary.cancelled,
      icon: AlertCircle,
      tone: 'bg-rose-50 text-rose-700 border-rose-100',
    },
  ];

  const pendingRejectedAssignment = selectedBooking?.collectorAssignments?.find(
    (assignment) =>
      assignment.status === 'REJECTED_PENDING_ADMIN_REVIEW' &&
      assignment.reviewStatus === 'PENDING',
  );
  const approvedRejectedAssignment = selectedBooking?.collectorAssignments?.find(
    (assignment) => assignment.status === 'REJECTION_APPROVED',
  );
  const activeCollectorAssignment = selectedBooking?.collectorAssignments?.find(
    (assignment) =>
      assignment.status === 'PENDING_COLLECTOR_CONFIRMATION' ||
      assignment.status === 'ACCEPTED',
  );

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
          : 'Không thể tải danh sách lịch hẹn.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(bookingCode: string) {
    setIsDetailLoading(true);
    setError('');
    setSuccess('');

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
      setManualAssignmentReason('');
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

  useEffect(() => {
    loadBookings(EMPTY_FILTERS);
    loadStaffOptions();
  }, []);

  async function loadStaffOptions() {
    try {
      const data = await listStaff({ role: 'SAMPLE_COLLECTOR', limit: 100 });
      setStaffOptions(data.staff);
    } catch {
      setStaffOptions([]);
    }
  }

  function handleSelectStaff(staffId: string) {
    setSelectedStaffId(staffId);
    const staff = staffOptions.find((item) => item.id === staffId);

    if (staff) {
      setStaffName(staff.fullName);
      setStaffPhone(staff.phone || '');
    }
  }

  async function refreshAfterUpdate(message: string, bookingCode: string) {
    const [detail] = await Promise.all([
      getBookingDetail(bookingCode),
      loadBookings(appliedFilters),
    ]);

    setSelectedBooking(detail);
    setInternalNote(detail.internalNote || '');
    setSelectedStaffId(detail.assignedStaff?.id || '');
    setStaffName(detail.assignedStaff?.fullName || staffName);
    setStaffPhone(detail.assignedStaff?.phone || staffPhone);
    setStatusValue(
      STATUS_OPTIONS.includes(detail.status) ? detail.status : statusValue,
    );
    setStatusReason('');
    setManualAssignmentReason('');
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
        staffId: selectedStaffId || undefined,
        staffName: staffName.trim(),
        staffPhone: staffPhone.trim() || undefined,
        role: 'SAMPLE_COLLECTOR',
      });
      await refreshAfterUpdate('Đã phân công nhân viên lấy mẫu.', selectedBooking.bookingCode);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể phân công nhân viên lấy mẫu.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApproveRejection(assignmentId: string) {
    if (!selectedBooking) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await approveCollectorAssignmentRejection(assignmentId);
      await refreshAfterUpdate('Đã duyệt lý do từ chối của nhân viên lấy mẫu.', selectedBooking.bookingCode);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể duyệt lý do từ chối.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRejectRejection(assignmentId: string) {
    if (!selectedBooking) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await rejectCollectorAssignmentRejection(assignmentId);
      await refreshAfterUpdate('Đã ghi nhận không duyệt lý do từ chối.', selectedBooking.bookingCode);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể cập nhật duyệt lý do từ chối.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleManualCollectorAssignment() {
    if (!selectedBooking) return;
    if (!selectedStaffId) {
      setError('Vui lòng chọn nhân viên lấy mẫu từ danh sách.');
      return;
    }
    if (!manualAssignmentReason.trim()) {
      setError('Vui lòng nhập lý do gán thủ công.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await manualCollectorAssignment(selectedBooking.bookingCode, {
        collectorId: selectedStaffId,
        reason: manualAssignmentReason.trim(),
      });
      await refreshAfterUpdate('Đã tạo phân công mới, chờ nhân viên lấy mẫu xác nhận.', selectedBooking.bookingCode);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể gán thủ công nhân viên lấy mẫu.',
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
          : 'Không thể lưu ghi chú nội bộ.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={embedded ? 'text-slate-900' : 'min-h-screen bg-slate-100 text-slate-900'}>
      {!embedded && (
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Vận hành lịch hẹn</h1>
                <p className="text-sm text-slate-500">Bảng quản trị lịch hẹn và lấy mẫu</p>
              </div>
            </div>
            <a
              href="/"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Chatbot
            </a>
          </div>
        </header>
      )}

      <main className={embedded ? 'space-y-6' : 'mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8'}>
        {(error || success) && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            <span>{error || success}</span>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase text-indigo-700">Vận hành quản trị</p>
              <h2 className="mt-2 text-2xl font-semibold">Bảng vận hành lịch hẹn</h2>
              <p className="mt-2 text-sm text-slate-500">
                Theo dõi vòng đời lịch hẹn, phân công nhân viên lấy mẫu và cập nhật trạng thái vận hành.
              </p>
            </div>
            <button
              onClick={() => loadBookings(appliedFilters)}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Làm mới dữ liệu
            </button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <Activity className="h-5 w-5 text-indigo-700" />
                Luồng vận hành
              </h3>
              <p className="mt-1 text-sm text-slate-500">Luồng xử lý lịch hẹn từ xác nhận đến hoàn tất.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {WORKFLOW_STEPS.map((step) => {
              const Icon = step.icon;
              const count = getStatusCount(bookings, step.status);

              return (
                <div key={step.status} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-5 w-5 text-indigo-600" />
                    <StatusBadge status={step.status} />
                  </div>
                  <p className="mt-4 text-2xl font-semibold">{count}</p>
                  <h4 className="mt-1 text-sm font-semibold text-slate-800">{step.label}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-6">
            <label className="text-sm font-semibold text-slate-700">
              Trạng thái
              <select
                value={filters.status || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              >
                <option value="">Tất cả trạng thái</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {getBookingStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Từ ngày
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    dateFrom: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Đến ngày
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    dateTo: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Số điện thoại
              <input
                value={filters.phone || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="0912345678"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Mã lịch hẹn
              <input
                value={filters.bookingCode || ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    bookingCode: event.target.value,
                  }))
                }
                placeholder="HLB-..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                onClick={handleApplyFilters}
                disabled={isLoading}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                Tìm kiếm
              </button>
              <button
                onClick={handleResetFilters}
                disabled={isLoading}
                className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Đặt lại
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center">
            <div>
              <h3 className="font-semibold">Danh sách lịch hẹn</h3>
              <p className="mt-1 text-sm text-slate-500">{bookings.length} bản ghi đang hiển thị</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Mã lịch hẹn</th>
                  <th className="px-5 py-3">Bệnh nhân</th>
                  <th className="px-5 py-3">Số điện thoại</th>
                  <th className="px-5 py-3">Xét nghiệm/gói</th>
                  <th className="px-5 py-3">Thời gian lấy mẫu</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3">Nhân viên lấy mẫu</th>
                  <th className="px-5 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                      Đang tải danh sách lịch hẹn...
                    </td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <ClipboardCheck className="mx-auto h-10 w-10 text-indigo-600" />
                      <h4 className="mt-4 font-semibold">Chưa có lịch hẹn phù hợp</h4>
                      <p className="mt-2 text-sm text-slate-500">Thử đặt lại bộ lọc hoặc tạo lịch hẹn mới qua Chatbot.</p>
                    </td>
                  </tr>
                ) : (
                  bookings.map((booking) => (
                    <tr key={booking.bookingCode} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                        {booking.bookingCode}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 text-slate-400" />
                          <span className="font-medium text-slate-800">{booking.patientName || '-'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">{booking.phone || '-'}</td>
                      <td className="max-w-[220px] px-5 py-4">
                        <span className="line-clamp-2">{getTestName(booking)}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">{formatSampleTime(booking)}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {booking.assignedStaff?.fullName || (
                          <span className="text-amber-700">Chưa phân công</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <button
                          onClick={() => loadDetail(booking.bookingCode)}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                          Chi tiết
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold">{selectedBooking.bookingCode}</h2>
                  <StatusBadge status={selectedBooking.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedBooking.patientName || '-'} · {selectedBooking.phone || '-'}
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

            <div className="overflow-y-auto px-5 py-5">
              {isDetailLoading ? (
                <div className="py-12 text-center text-slate-500">Đang tải chi tiết lịch hẹn...</div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                  <div className="space-y-5">
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                        <UserRound className="h-4 w-4 text-indigo-700" />
                        Thông tin khách hàng
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Info label="Tên khách hàng" value={selectedBooking.patientName || selectedBooking.patient?.fullName || '-'} />
                        <Info label="Số điện thoại" value={selectedBooking.phone || selectedBooking.patient?.phone || '-'} />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                        <ClipboardList className="h-4 w-4 text-indigo-700" />
                        Thông tin lịch hẹn
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Info label="Mã lịch hẹn" value={selectedBooking.bookingCode} />
                        <Info label="Xét nghiệm/gói" value={getTestName(selectedBooking)} />
                        <Info label="Thời điểm tạo" value={formatDateTime(selectedBooking.createdAt)} />
                        <div>
                          <div className="text-xs font-semibold uppercase text-slate-400">Trạng thái hiện tại</div>
                          <div className="mt-1"><StatusBadge status={selectedBooking.status} /></div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                        <CalendarClock className="h-4 w-4 text-indigo-700" />
                        Khung giờ lấy mẫu
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Info label="Ngày lấy mẫu" value={selectedBooking.sampleDate || '-'} />
                        <Info label="Giờ lấy mẫu" value={`${selectedBooking.sampleTimeStart || '-'}${selectedBooking.sampleTimeEnd ? ` - ${selectedBooking.sampleTimeEnd}` : ''}`} />
                        <Info label="Địa chỉ lấy mẫu" value={selectedBooking.address || '-'} wide />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                        <UserRoundPlus className="h-4 w-4 text-indigo-700" />
                        Nhân viên lấy mẫu
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Info label="Nhân viên được phân công" value={selectedBooking.assignedStaff?.fullName || 'Chưa phân công'} />
                        <Info label="Số điện thoại nhân viên" value={selectedBooking.assignedStaff?.phone || '-'} />
                        <Info label="Vai trò" value={getStaffRoleLabel(selectedBooking.assignedStaff?.role)} />
                        <Info label="Trạng thái nhân viên" value={selectedBooking.assignedStaff ? getStaffActiveLabel(selectedBooking.assignedStaff.active) : '-'} />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                        <UserRoundPlus className="h-4 w-4 text-indigo-700" />
                        Phân công nhân viên lấy mẫu
                      </h3>
                      {(selectedBooking.collectorAssignments || []).length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                          Chưa có phân công lấy mẫu theo quy trình xác nhận của nhân viên.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(selectedBooking.collectorAssignments || []).map((assignment) => (
                            <div key={assignment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-slate-900">
                                    {assignment.collectorName || 'Nhân viên lấy mẫu'}
                                  </div>
                                  <div className="mt-1 text-sm text-slate-600">
                                    {assignment.collectorPhone || '-'} · {assignment.assignmentSource === 'ADMIN' ? 'Gán thủ công' : 'Gán tự động'}
                                  </div>
                                </div>
                                <AssignmentStatusBadge status={assignment.status} />
                              </div>
                              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                <span>Thời điểm gán: <strong className="text-slate-800">{formatDateTime(assignment.assignedAt)}</strong></span>
                                <span>Thời điểm từ chối: <strong className="text-slate-800">{formatDateTime(assignment.rejectedAt)}</strong></span>
                              </div>
                              {assignment.rejectReason ? (
                                <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                  <span className="font-semibold">Lý do từ chối:</span> {assignment.rejectReason}
                                </div>
                              ) : null}
                              {assignment.adminReviewedAt ? (
                                <div className="mt-3 text-sm text-slate-600">
                                  Admin đã xử lý lúc <strong>{formatDateTime(assignment.adminReviewedAt)}</strong>.
                                </div>
                              ) : null}
                              {assignment.id === pendingRejectedAssignment?.id ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    onClick={() => handleApproveRejection(assignment.id)}
                                    disabled={isSaving}
                                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    Duyệt lý do
                                  </button>
                                  <button
                                    onClick={() => handleRejectRejection(assignment.id)}
                                    disabled={isSaving}
                                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                                  >
                                    Không duyệt
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                          <Activity className="h-4 w-4 text-indigo-700" />
                          Lịch sử thao tác
                        </h3>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {(selectedBooking.statusHistory || []).length} sự kiện
                        </span>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50">
                        {(selectedBooking.statusHistory || []).length === 0 ? (
                          <div className="p-4 text-sm text-slate-500">Chưa có lịch sử thao tác.</div>
                        ) : (
                          selectedBooking.statusHistory?.map((item) => {
                            const metadataLines = getSafeMetadataLines(item.metadata);

                            return (
                            <div key={item.id} className="border-b border-slate-200 bg-white p-4 last:border-b-0">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {item.fromStatus ? <StatusBadge status={item.fromStatus} /> : <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">Bắt đầu</span>}
                                    <span className="text-slate-400">→</span>
                                    <StatusBadge status={item.toStatus} />
                                  </div>
                                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                    <span><strong className="text-slate-800">Nguồn thao tác:</strong> {getActorLabel(item.changedByType)}</span>
                                    <span><strong className="text-slate-800">Mã người thao tác:</strong> {item.changedById || '-'}</span>
                                  </div>
                                </div>
                                <div className="text-xs font-medium text-slate-500">{formatDateTime(item.createdAt)}</div>
                              </div>
                              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                <span className="font-semibold text-slate-800">Lý do:</span> {item.reason || 'Không có lý do được ghi nhận'}
                              </div>
                              {metadataLines.length > 0 ? (
                                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-900">
                                  <div className="font-semibold">Ghi chú/metadata an toàn</div>
                                  {metadataLines.map((line) => (
                                    <div key={line}>{line}</div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            );
                          })
                        )}
                      </div>
                    </section>
                  </div>

                  <aside className="space-y-5">
                    <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-indigo-900">
                        <UserRoundPlus className="h-4 w-4" />
                        Phân công nhân viên
                      </h3>
                      <div className="space-y-3">
                        <select
                          value={selectedStaffId}
                          onChange={(event) => handleSelectStaff(event.target.value)}
                          className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        >
                          <option value="">Chọn từ danh sách nhân viên lấy mẫu</option>
                          {staffOptions.map((staff) => (
                            <option key={staff.id} value={staff.id}>
                              {staff.fullName} · {staff.phone || '-'} · {getStaffActiveLabel(staff.active)} · {staff.workload?.totalActiveAssigned || 0} lịch đang phụ trách
                            </option>
                          ))}
                        </select>
                        {selectedStaffId ? (
                          <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                            {(() => {
                              const staff = staffOptions.find((item) => item.id === selectedStaffId);

                              if (!staff) return null;

                              return (
                                <>
                                  Vai trò: <strong>{getStaffRoleLabel(staff.role)}</strong>. Trạng thái:{' '}
                                  <strong>{getStaffActiveLabel(staff.active)}</strong>. Lịch đang phụ trách:{' '}
                                  <strong>{staff.workload?.totalActiveAssigned || 0}</strong>.
                                  {staff.workload?.warning ? (
                                    <span className="mt-1 block text-amber-700">{staff.workload.warning}</span>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>
                        ) : null}
                        <input
                          value={staffName}
                          onChange={(event) => setStaffName(event.target.value)}
                          placeholder="Tên nhân viên lấy mẫu"
                          className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        />
                        <input
                          value={staffPhone}
                          onChange={(event) => setStaffPhone(event.target.value)}
                          placeholder="Số điện thoại nhân viên (không bắt buộc)"
                          className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        />
                        <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm font-medium text-slate-500">
                          Vai trò: Nhân viên lấy mẫu
                        </div>
                        <button
                          onClick={handleAssignStaff}
                          disabled={isSaving}
                          className="w-full rounded-xl bg-indigo-600 px-3 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          Phân công nhân viên lấy mẫu
                        </button>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                          <div className="font-semibold text-slate-800">Gán lại sau khi duyệt từ chối</div>
                          <div className="mt-1">
                            {activeCollectorAssignment
                              ? 'Lịch hẹn đang có phân công lấy mẫu hoạt động.'
                              : approvedRejectedAssignment
                                ? 'Có thể tạo phân công mới và giữ nguyên lịch sử phân công cũ.'
                                : 'Cần duyệt lý do từ chối trước khi gán lại theo luồng 5H-6.'}
                          </div>
                        </div>
                        <textarea
                          value={manualAssignmentReason}
                          onChange={(event) => setManualAssignmentReason(event.target.value)}
                          rows={3}
                          placeholder="Lý do gán thủ công"
                          className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={handleManualCollectorAssignment}
                          disabled={isSaving || !approvedRejectedAssignment || !!activeCollectorAssignment}
                          className="w-full rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Gán nhân viên này
                        </button>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                        <ClipboardCheck className="h-4 w-4 text-slate-700" />
                        Cập nhật trạng thái
                      </h3>
                      <div className="space-y-3">
                        <select
                          value={statusValue}
                          onChange={(event) => setStatusValue(event.target.value as BookingStatus)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {getBookingStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                        <input
                          value={statusReason}
                          onChange={(event) => setStatusReason(event.target.value)}
                          placeholder="Lý do cập nhật (không bắt buộc)"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                        />
                        <button
                          onClick={handleUpdateStatus}
                          disabled={isSaving}
                          className="w-full rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Cập nhật trạng thái
                        </button>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <h3 className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
                        <FileText className="h-4 w-4" />
                        Ghi chú nội bộ - chỉ hiển thị cho admin
                      </h3>
                      <p className="mb-3 text-xs leading-5 text-amber-700">
                        Nội dung này chỉ phục vụ điều phối vận hành nội bộ và không hiển thị trong trang người dùng.
                      </p>
                      <textarea
                        value={internalNote}
                        onChange={(event) => setInternalNote(event.target.value)}
                        rows={6}
                        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
                        placeholder="Ghi chú vận hành cho nhân viên"
                      />
                      <button
                        onClick={handleSaveNote}
                        disabled={isSaving}
                        className="mt-3 w-full rounded-xl bg-amber-600 px-3 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        Lưu ghi chú nội bộ
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
