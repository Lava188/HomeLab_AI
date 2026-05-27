import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  MapPinned,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { getCollectorSession } from '../auth/demoAuth';
import {
  CollectorBooking,
  CollectorAssignment,
  CollectorWorkingArea,
  CollectorWorkingSchedule,
  acceptCollectorAssignment,
  createCollectorWorkingArea,
  createCollectorWorkingSchedule,
  getCollectorBookingDetail,
  listCollectorAssignments,
  listCollectorWorkingAreas,
  listCollectorBookings,
  listCollectorWorkingSchedules,
  markSampleCollected,
  rejectCollectorAssignment,
  updateCollectorWorkingArea,
  updateCollectorWorkingSchedule,
} from '../api/collectorBookingApi';
import { getBookingStatusLabel } from '../utils/bookingDisplay';

const COLLECTABLE_STATUSES = new Set(['CONFIRMED', 'RESCHEDULED', 'ASSIGNED']);
const WAITING_STATUSES = new Set(['CONFIRMED', 'RESCHEDULED', 'ASSIGNED']);

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

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: 'bg-lime-50 text-lime-800 border-lime-200',
  RESCHEDULED: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  ASSIGNED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  SAMPLE_COLLECTED: 'bg-teal-50 text-teal-800 border-teal-200',
  IN_LAB_PROCESSING: 'bg-amber-50 text-amber-800 border-amber-200',
  RESULT_READY: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  NO_SHOW: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

const collectorPanelClass = 'rounded-2xl border border-emerald-100 bg-white/95 shadow-[0_14px_36px_rgba(16,185,129,0.08)]';
const collectorPanelHeaderClass = 'border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-yellow-50/70 px-5 py-4';

const EMPTY_AREA_FORM = {
  province: 'Hà Nội',
  district: '',
  ward: '',
};

const EMPTY_SCHEDULE_FORM = {
  workDate: '',
  startTime: '08:00',
  endTime: '12:00',
  capacity: 4,
};

function todayIso() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getTestName(booking: CollectorBooking) {
  return booking.testName || booking.testCatalogItem?.name || booking.testTypeText || '-';
}

function formatSampleTime(booking: CollectorBooking) {
  const date = booking.sampleDate || '-';
  const start = booking.sampleTimeStart || '-';
  const end = booking.sampleTimeEnd ? ` - ${booking.sampleTimeEnd}` : '';

  return `${date} ${start}${end}`;
}

function getAssignmentTestName(assignment: CollectorAssignment) {
  return assignment.testName || assignment.testTypeText || assignment.testCode || '-';
}

function formatAssignmentTime(assignment: CollectorAssignment) {
  const date = assignment.sampleDate || '-';
  const start = assignment.sampleTimeStart || '-';
  const end = assignment.sampleTimeEnd ? ` - ${assignment.sampleTimeEnd}` : '';

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

export default function CollectorDashboardPage() {
  const session = getCollectorSession();
  const [bookings, setBookings] = useState<CollectorBooking[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<CollectorAssignment[]>([]);
  const [workingAreas, setWorkingAreas] = useState<CollectorWorkingArea[]>([]);
  const [workingSchedules, setWorkingSchedules] = useState<CollectorWorkingSchedule[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<CollectorBooking | null>(null);
  const [rejectingAssignment, setRejectingAssignment] = useState<CollectorAssignment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [areaForm, setAreaForm] = useState(EMPTY_AREA_FORM);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE_FORM);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateMode, setDateMode] = useState<'all' | 'today' | 'upcoming'>('today');
  const [bookingCodeSearch, setBookingCodeSearch] = useState('');
  const [collectorNote, setCollectorNote] = useState('');
  const [confirmCollectCode, setConfirmCollectCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const summary = useMemo(() => {
    const today = todayIso();

    return {
      total: bookings.length,
      today: bookings.filter((booking) => booking.sampleDate === today).length,
      waiting: bookings.filter((booking) => WAITING_STATUSES.has(booking.status)).length,
      collected: bookings.filter((booking) => booking.status === 'SAMPLE_COLLECTED').length,
    };
  }, [bookings]);

  function buildDateFilters(mode = dateMode) {
    const today = todayIso();

    if (mode === 'today') {
      return { dateFrom: today, dateTo: today };
    }

    if (mode === 'upcoming') {
      return { dateFrom: today, dateTo: '' };
    }

    return { dateFrom: '', dateTo: '' };
  }

  async function loadBookings(nextFilters?: {
    status: string;
    bookingCode: string;
    mode: 'all' | 'today' | 'upcoming';
  }) {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const activeFilters = nextFilters || {
        status: statusFilter,
        bookingCode: bookingCodeSearch,
        mode: dateMode,
      };
      const dateFilters = buildDateFilters(activeFilters.mode);
      const data = await listCollectorBookings({
        status: activeFilters.status,
        bookingCode: activeFilters.bookingCode,
        ...dateFilters,
      });
      setBookings(data.bookings);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải lịch được giao. Vui lòng thử lại.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadWorkingProfile() {
    setError('');

    try {
      const [areasData, schedulesData] = await Promise.all([
        listCollectorWorkingAreas(),
        listCollectorWorkingSchedules(),
      ]);

      setWorkingAreas(areasData.workingAreas);
      setWorkingSchedules(schedulesData.workingSchedules);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải vùng làm việc và lịch làm việc.',
      );
    }
  }

  async function loadPendingAssignments() {
    setError('');

    try {
      const data = await listCollectorAssignments({ status: 'PENDING_COLLECTOR_CONFIRMATION' });
      setPendingAssignments(data.assignments);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải nhiệm vụ chờ xác nhận.',
      );
    }
  }

  async function refreshCollectorWork() {
    await Promise.all([
      loadPendingAssignments(),
      loadBookings(),
    ]);
  }

  async function handleAcceptAssignment(assignment: CollectorAssignment) {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await acceptCollectorAssignment(assignment.id);
      setSuccess('Đã chấp nhận nhiệm vụ lấy mẫu.');
      await refreshCollectorWork();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể chấp nhận nhiệm vụ.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRejectAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejectingAssignment) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await rejectCollectorAssignment(rejectingAssignment.id, rejectReason);
      setSuccess('Đã gửi lý do từ chối nhiệm vụ để quản trị viên xem xét.');
      setRejectingAssignment(null);
      setRejectReason('');
      await loadPendingAssignments();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể từ chối nhiệm vụ.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await createCollectorWorkingArea(areaForm);
      setAreaForm(EMPTY_AREA_FORM);
      setSuccess('Đã thêm vùng làm việc.');
      await loadWorkingProfile();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể thêm vùng làm việc.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleArea(area: CollectorWorkingArea) {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateCollectorWorkingArea(area.id, { active: !area.active });
      setSuccess(area.active ? 'Đã tạm tắt vùng làm việc.' : 'Đã bật lại vùng làm việc.');
      await loadWorkingProfile();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể cập nhật vùng làm việc.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await createCollectorWorkingSchedule(scheduleForm);
      setScheduleForm(EMPTY_SCHEDULE_FORM);
      setSuccess('Đã thêm lịch làm việc.');
      await loadWorkingProfile();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể thêm lịch làm việc.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleSchedule(schedule: CollectorWorkingSchedule) {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateCollectorWorkingSchedule(schedule.id, { active: !schedule.active });
      setSuccess(schedule.active ? 'Đã tạm tắt lịch làm việc.' : 'Đã bật lại lịch làm việc.');
      await loadWorkingProfile();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể cập nhật lịch làm việc.');
    } finally {
      setIsSaving(false);
    }
  }

  async function loadDetail(bookingCode: string) {
    setIsDetailLoading(true);
    setError('');
    setSuccess('');
    setCollectorNote('');
    setConfirmCollectCode('');

    try {
      const detail = await getCollectorBookingDetail(bookingCode);
      setSelectedBooking(detail);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải chi tiết lịch lấy mẫu.',
      );
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function handleMarkCollected(bookingCode: string, note = collectorNote) {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await markSampleCollected(bookingCode, { note });
      setSuccess(`Đã cập nhật ${bookingCode} thành ${getBookingStatusLabel('SAMPLE_COLLECTED')}.`);
      setConfirmCollectCode('');
      setCollectorNote('');
      await loadBookings();
      const detail = await getCollectorBookingDetail(bookingCode);
      setSelectedBooking(detail);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể cập nhật đã lấy mẫu. Vui lòng thử lại.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    if (!session.phone) {
      window.location.replace('/collector/login');
      return;
    }

    loadBookings();
    loadWorkingProfile();
    loadPendingAssignments();
  }, [session.phone]);

  const summaryCards = [
    { label: 'Tổng lịch được giao', value: summary.total, icon: ClipboardList, tone: 'bg-emerald-50 text-emerald-900 border-emerald-100' },
    { label: 'Lịch hôm nay', value: summary.today, icon: CalendarClock, tone: 'bg-yellow-50 text-yellow-900 border-yellow-100' },
    { label: 'Đang chờ lấy mẫu', value: summary.waiting, icon: AlertCircle, tone: 'bg-lime-50 text-lime-900 border-lime-100' },
    { label: 'Đã lấy mẫu', value: summary.collected, icon: CheckCircle2, tone: 'bg-teal-50 text-teal-900 border-teal-100' },
  ];

  if (!session.phone) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className={`${collectorPanelClass} p-6`}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700">Nhân viên lấy mẫu</p>
            <h2 className="mt-2 text-2xl font-semibold">
              Xin chào {session.displayName || 'Nhân viên lấy mẫu'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Số điện thoại nhân viên lấy mẫu đang dùng: <span className="font-semibold text-slate-700">{session.phone}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.label} className={`rounded-2xl border p-5 shadow-[0_12px_30px_rgba(16,185,129,0.07)] ${card.tone}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{card.value}</p>
                </div>
                <div className="rounded-xl bg-white/80 p-3 shadow-sm">
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

      <section className={collectorPanelClass}>
        <div className={`flex items-center justify-between ${collectorPanelHeaderClass}`}>
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <ClipboardList className="h-5 w-5 text-emerald-700" />
              Nhiệm vụ chờ xác nhận
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {pendingAssignments.length} nhiệm vụ cần phản hồi
            </p>
          </div>
          <button
            onClick={loadPendingAssignments}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-yellow-50 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </button>
        </div>

        {pendingAssignments.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Hiện chưa có nhiệm vụ chờ xác nhận.
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[1fr_1fr_1.4fr_1fr_auto] items-center gap-4 border-b border-emerald-100 bg-yellow-50/70 px-5 py-3 text-xs font-bold uppercase text-emerald-900 xl:grid">
              <span>Ma lich</span>
              <span>Thoi gian</span>
              <span>Dia chi</span>
              <span>Trang thai</span>
              <span className="text-right">Thao tac</span>
            </div>
            <div className="divide-y divide-emerald-100">
            {pendingAssignments.map((assignment) => (
              <article key={assignment.id} className="grid gap-4 px-5 py-4 transition hover:bg-yellow-50 xl:grid-cols-[1fr_1fr_1.4fr_1fr_auto] xl:items-center">
                <div>
                  <p className="font-semibold text-slate-900">{assignment.bookingCode || '-'}</p>
                  <p className="mt-1 text-sm text-slate-500">{assignment.patientName || '-'}</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium text-slate-700">{formatAssignmentTime(assignment)}</p>
                  <p className="mt-1 text-slate-500">{getAssignmentTestName(assignment)}</p>
                </div>
                <p className="text-sm text-slate-600 xl:truncate" title={assignment.address || ''}>
                  {assignment.address || '-'}
                </p>
                <span className="inline-flex w-fit rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                  Chờ xác nhận
                </span>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <button
                    onClick={() => handleAcceptAssignment(assignment)}
                    disabled={isSaving}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-100 transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Chấp nhận
                  </button>
                  <button
                    onClick={() => {
                      setRejectingAssignment(assignment);
                      setRejectReason('');
                    }}
                    disabled={isSaving}
                    className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    Từ chối
                  </button>
                </div>
              </article>
            ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className={`${collectorPanelClass} p-5`}>
          <div className="mb-4 flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-emerald-700" />
            <h3 className="font-semibold">Vùng làm việc</h3>
          </div>
          <form onSubmit={handleCreateArea} className="grid gap-3 lg:grid-cols-[160px_1fr_1fr_auto]">
            <label className="text-sm font-semibold text-slate-700">
              Tỉnh/thành phố
              <select
                value={areaForm.province}
                onChange={(event) => setAreaForm((current) => ({ ...current, province: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              >
                <option value="Hà Nội">Hà Nội</option>
                <option value="TP.HCM">TP.HCM</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Quận/huyện
              <input
                value={areaForm.district}
                onChange={(event) => setAreaForm((current) => ({ ...current, district: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Phường/xã
              <input
                value={areaForm.ward}
                onChange={(event) => setAreaForm((current) => ({ ...current, ward: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-100 transition hover:bg-emerald-500 disabled:opacity-60 lg:self-end"
            >
              Thêm vùng
            </button>
          </form>
          <div className="mt-4 divide-y divide-emerald-100 rounded-2xl border border-emerald-100">
            {workingAreas.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Chưa có vùng làm việc.</p>
            ) : (
              workingAreas.map((area) => (
                <div key={area.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">
                      {[area.ward, area.district, area.province].filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {area.active ? 'Đang hoạt động' : 'Tạm tắt'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleArea(area)}
                    disabled={isSaving}
                    className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-yellow-50 disabled:opacity-60"
                  >
                    {area.active ? 'Tạm tắt' : 'Bật lại'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`${collectorPanelClass} p-5`}>
          <div className="mb-4 flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-emerald-700" />
            <h3 className="font-semibold">Lịch làm việc</h3>
          </div>
          <form onSubmit={handleCreateSchedule} className="grid gap-3 lg:grid-cols-[1fr_110px_110px_110px_auto]">
            <label className="text-sm font-semibold text-slate-700">
              Ngày làm việc
              <input
                type="date"
                value={scheduleForm.workDate}
                onChange={(event) => setScheduleForm((current) => ({ ...current, workDate: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Bắt đầu
              <input
                type="time"
                value={scheduleForm.startTime}
                onChange={(event) => setScheduleForm((current) => ({ ...current, startTime: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Kết thúc
              <input
                type="time"
                value={scheduleForm.endTime}
                onChange={(event) => setScheduleForm((current) => ({ ...current, endTime: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Sức chứa
              <input
                type="number"
                min={1}
                value={scheduleForm.capacity}
                onChange={(event) => setScheduleForm((current) => ({ ...current, capacity: Number(event.target.value) }))}
                className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-100 transition hover:bg-emerald-500 disabled:opacity-60 lg:self-end"
            >
              Thêm lịch
            </button>
          </form>
          <div className="mt-4 divide-y divide-emerald-100 rounded-2xl border border-emerald-100">
            {workingSchedules.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Chưa có lịch làm việc.</p>
            ) : (
              workingSchedules.map((schedule) => (
                <div key={schedule.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">
                      {schedule.workDate} · {schedule.startTime} - {schedule.endTime}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Sức chứa {schedule.capacity} · {schedule.active ? 'Đang hoạt động' : 'Tạm tắt'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleSchedule(schedule)}
                    disabled={isSaving}
                    className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-yellow-50 disabled:opacity-60"
                  >
                    {schedule.active ? 'Tạm tắt' : 'Bật lại'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className={`${collectorPanelClass} p-5`}>
        <div className="grid gap-3 xl:grid-cols-[200px_220px_1fr_auto_auto]">
          <label className="text-sm font-semibold text-slate-700">
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status || 'ALL'} value={status}>
                  {status ? getBookingStatusLabel(status) : 'Tất cả trạng thái'}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Ngày lấy mẫu
            <select
              value={dateMode}
              onChange={(event) => setDateMode(event.target.value as 'all' | 'today' | 'upcoming')}
              className="mt-2 w-full rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            >
              <option value="today">Hôm nay</option>
              <option value="upcoming">Sắp tới</option>
              <option value="all">Tất cả ngày</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Mã lịch hẹn
            <div className="mt-2 flex items-center rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 transition focus-within:border-emerald-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100">
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
            className="inline-flex items-end justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-100 transition hover:bg-emerald-500 disabled:opacity-60 xl:self-end"
          >
            <Search className="h-4 w-4" />
            Lọc
          </button>
          <button
            onClick={() => {
              setStatusFilter('');
              setDateMode('today');
              setBookingCodeSearch('');
              loadBookings({ status: '', bookingCode: '', mode: 'today' });
            }}
            disabled={isLoading}
            className="inline-flex items-end justify-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-yellow-50 disabled:opacity-60 xl:self-end"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </section>

      <section id="assigned" className={collectorPanelClass}>
        <div className={collectorPanelHeaderClass}>
          <h3 className="flex items-center gap-2 font-semibold">
            <Truck className="h-5 w-5 text-emerald-700" />
            Lịch được giao
          </h3>
          <p className="mt-1 text-sm text-slate-500">{bookings.length} lịch hẹn đang hiển thị</p>
        </div>

        {isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Đang tải lịch được giao...</div>
        ) : bookings.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <MapPinned className="mx-auto h-10 w-10 text-emerald-700" />
            <h4 className="mt-4 font-semibold">Chưa có lịch được giao</h4>
            <p className="mt-2 text-sm text-slate-500">
              Kiểm tra lại số điện thoại nhân viên lấy mẫu hoặc nhờ quản trị viên phân công lịch hẹn cho nhân viên này.
            </p>
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[1fr_1fr_1.1fr_1.4fr_1fr_auto] items-center gap-4 border-b border-emerald-100 bg-yellow-50/70 px-5 py-3 text-xs font-bold uppercase text-emerald-900 xl:grid">
              <span>Ma / Benh nhan</span>
              <span>Lien he</span>
              <span>Xet nghiem</span>
              <span>Dia chi</span>
              <span>Trang thai</span>
              <span className="text-right">Thao tac</span>
            </div>
            <div className="divide-y divide-emerald-100">
            {bookings.map((booking) => (
              <article key={booking.bookingCode} className="grid gap-4 px-5 py-4 hover:bg-yellow-50 xl:grid-cols-[1fr_1fr_1.1fr_1.4fr_1fr_auto] xl:items-center">
                <div>
                  <p className="font-semibold text-slate-900">{booking.bookingCode}</p>
                  <p className="mt-1 text-sm text-slate-500">{booking.patientName || booking.patient?.fullName || '-'}</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium text-slate-700">{booking.phone || '-'}</p>
                  <p className="mt-1 text-slate-500">Số điện thoại bệnh nhân</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium text-slate-700">{getTestName(booking)}</p>
                  <p className="mt-1 text-slate-500">{formatSampleTime(booking)}</p>
                </div>
                <p className="text-sm text-slate-600 xl:truncate" title={booking.address || ''}>
                  {booking.address || '-'}
                </p>
                <div className="space-y-2">
                  <StatusBadge status={booking.status} />
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <button
                    onClick={() => loadDetail(booking.bookingCode)}
                    className="rounded-xl border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-yellow-50"
                  >
                    Chi tiết
                  </button>
                  {COLLECTABLE_STATUSES.has(booking.status) ? (
                    <button
                      onClick={() => {
                        setSelectedBooking(booking);
                        setCollectorNote('');
                        setConfirmCollectCode(booking.bookingCode);
                      }}
                      className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-100 transition hover:bg-emerald-500"
                    >
                      Đã lấy mẫu
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            </div>
          </div>
        )}
      </section>

      {rejectingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/35 p-4">
          <form onSubmit={handleRejectAssignment} className="w-full max-w-lg rounded-2xl border border-emerald-100 bg-white p-5 shadow-[0_24px_70px_rgba(16,185,129,0.18)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Từ chối nhiệm vụ</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {rejectingAssignment.bookingCode || '-'} · {formatAssignmentTime(rejectingAssignment)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectingAssignment(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-yellow-50"
                aria-label="Đóng từ chối nhiệm vụ"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Lý do từ chối
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-3 text-sm outline-none transition focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
                placeholder="Nhập lý do để quản trị viên xem xét"
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectingAssignment(null)}
                disabled={isSaving}
                className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-yellow-50 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-200 disabled:opacity-60"
              >
                Gửi lý do từ chối
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/35 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(16,185,129,0.18)]">
            <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
              <div>
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
                className="rounded-lg p-2 text-slate-500 hover:bg-yellow-50"
                aria-label="Đóng chi tiết"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-78px)] overflow-y-auto p-5">
              {isDetailLoading ? (
                <div className="py-12 text-center text-sm text-slate-500">Đang tải chi tiết lịch lấy mẫu...</div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  <section className="space-y-5">
                    <div className="grid gap-3 rounded-2xl border border-emerald-100 p-4 sm:grid-cols-2">
                      <Info label="Bệnh nhân" value={selectedBooking.patientName || selectedBooking.patient?.fullName || '-'} />
                      <Info label="Số điện thoại" value={selectedBooking.phone || '-'} />
                      <Info label="Xét nghiệm/gói" value={getTestName(selectedBooking)} />
                      <Info label="Ngày/giờ lấy mẫu" value={formatSampleTime(selectedBooking)} />
                      <Info label="Địa chỉ" value={selectedBooking.address || '-'} wide />
                    </div>

                    <div>
                      <h4 className="font-semibold">Dòng thời gian trạng thái</h4>
                      <div className="mt-3 rounded-2xl border border-emerald-100">
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
                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-yellow-50/70 p-4">
                      <h4 className="font-semibold text-emerald-800">Đã lấy mẫu</h4>
                      <p className="mt-2 text-sm text-emerald-700">
                        Ghi chú không bắt buộc cho tình huống lấy mẫu hoặc bàn giao mẫu.
                      </p>
                      <textarea
                        value={collectorNote}
                        onChange={(event) => setCollectorNote(event.target.value)}
                        rows={4}
                        className="mt-4 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                        placeholder="VD: Đã lấy mẫu lúc 08:45, mẫu bàn giao tại quầy..."
                      />
                      {COLLECTABLE_STATUSES.has(selectedBooking.status) ? (
                        confirmCollectCode === selectedBooking.bookingCode ? (
                          <div className="mt-3 grid gap-2">
                            <button
                              onClick={() => handleMarkCollected(selectedBooking.bookingCode)}
                              disabled={isSaving}
                              className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-100 transition hover:bg-emerald-500 disabled:opacity-60"
                            >
                              {isSaving ? 'Đang cập nhật...' : 'Xác nhận đã lấy mẫu'}
                            </button>
                            <button
                              onClick={() => setConfirmCollectCode('')}
                              disabled={isSaving}
                              className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-yellow-50 disabled:opacity-60"
                            >
                              Hủy xác nhận
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmCollectCode(selectedBooking.bookingCode)}
                            className="mt-3 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-100 transition hover:bg-emerald-500"
                          >
                            Đã lấy mẫu
                          </button>
                        )
                      ) : (
                        <div className="mt-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-500">
                          Lịch hẹn ở trạng thái {getBookingStatusLabel(selectedBooking.status)} nên không thể cập nhật lấy mẫu.
                        </div>
                      )}
                    </div>
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
