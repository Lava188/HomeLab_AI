import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  Clock3,
  Edit3,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import {
  AvailabilitySlot,
  AvailabilitySlotFilters,
  AvailabilitySlotPayload,
  createAvailabilitySlot,
  listAvailabilitySlots,
  updateAvailabilitySlot,
} from '../api/adminAvailabilitySlotApi';

const EMPTY_FILTERS: AvailabilitySlotFilters = {
  dateFrom: '',
  dateTo: '',
  active: 'true',
  area: '',
};

const EMPTY_FORM = {
  date: '',
  timeStart: '08:00',
  timeEnd: '09:00',
  capacity: '2',
  area: 'default',
  active: true,
};

function validateSlotForm(form: typeof EMPTY_FORM) {
  if (!form.date) return 'Vui lòng chọn ngày mở lịch.';
  if (!form.timeStart) return 'Vui lòng chọn giờ bắt đầu.';
  if (!form.timeEnd) return 'Vui lòng chọn giờ kết thúc.';
  if (Number(form.capacity) <= 0) return 'Sức chứa phải lớn hơn 0.';
  if (form.timeEnd <= form.timeStart) return 'Giờ kết thúc phải sau giờ bắt đầu.';

  return '';
}

function toPayload(form: typeof EMPTY_FORM): AvailabilitySlotPayload {
  return {
    date: form.date,
    timeStart: form.timeStart,
    timeEnd: form.timeEnd,
    capacity: Number(form.capacity),
    area: form.area.trim() || 'default',
    active: form.active,
  };
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-600'
      }`}
    >
      {active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
      {active ? 'Đang mở' : 'Tạm khóa'}
    </span>
  );
}

export default function AdminAvailabilitySlotsPage() {
  const [filters, setFilters] = useState<AvailabilitySlotFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AvailabilitySlotFilters>(EMPTY_FILTERS);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [editForm, setEditForm] = useState({
    capacity: '',
    area: '',
    active: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const summary = useMemo(() => {
    const totalCapacity = slots.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0);
    const booked = slots.reduce((sum, slot) => sum + Number(slot.bookedCount || 0), 0);
    const remaining = slots.reduce(
      (sum, slot) => sum + Number(slot.remainingCapacity || 0),
      0,
    );

    return {
      total: slots.length,
      active: slots.filter((slot) => slot.active).length,
      totalCapacity,
      booked,
      remaining,
    };
  }, [slots]);

  const summaryCards = [
    {
      label: 'Tổng khung giờ',
      value: summary.total,
      icon: Layers3,
      tone: 'border-slate-200 bg-white text-slate-800',
    },
    {
      label: 'Đang mở',
      value: summary.active,
      icon: ToggleRight,
      tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Tổng sức chứa',
      value: summary.totalCapacity,
      icon: CalendarClock,
      tone: 'border-sky-100 bg-sky-50 text-sky-700',
    },
    {
      label: 'Đã đặt',
      value: summary.booked,
      icon: Check,
      tone: 'border-sky-100 bg-sky-50 text-sky-700',
    },
    {
      label: 'Còn trống',
      value: summary.remaining,
      icon: Clock3,
      tone: 'border-teal-100 bg-teal-50 text-teal-700',
    },
  ];

  async function loadSlots(nextFilters = appliedFilters) {
    setIsLoading(true);
    setError('');

    try {
      const data = await listAvailabilitySlots(nextFilters);
      setSlots(data.slots);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải danh sách khung giờ lấy mẫu.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSlots(EMPTY_FILTERS);
  }, []);

  async function handleCreateSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateSlotForm(form);
    if (validationError) {
      setError(validationError);
      setSuccess('');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await createAvailabilitySlot(toPayload(form));
      setForm(EMPTY_FORM);
      setSuccess('Đã tạo khung giờ lấy mẫu.');
      await loadSlots(appliedFilters);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tạo khung giờ lấy mẫu.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(slot: AvailabilitySlot) {
    setEditingSlot(slot);
    setEditForm({
      capacity: String(slot.capacity),
      area: slot.area || 'default',
      active: slot.active,
    });
    setError('');
    setSuccess('');
  }

  async function handleUpdateSlot() {
    if (!editingSlot) return;

    const capacity = Number(editForm.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setError('Sức chứa phải lớn hơn 0.');
      return;
    }

    if (capacity < Number(editingSlot.bookedCount || 0)) {
      setError('Không thể đặt sức chứa thấp hơn số lịch đã được đặt.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateAvailabilitySlot(editingSlot.id, {
        capacity,
        area: editForm.area.trim() || 'default',
        active: editForm.active,
      });
      setEditingSlot(null);
      setSuccess('Đã cập nhật khung giờ lấy mẫu.');
      await loadSlots(appliedFilters);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể cập nhật khung giờ lấy mẫu.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApplyFilters() {
    setAppliedFilters(filters);
    await loadSlots(filters);
  }

  async function handleResetFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    await loadSlots(EMPTY_FILTERS);
  }

  return (
    <div className="space-y-6 text-slate-900">
      {(error || success) && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          <span>{error || success}</span>
        </div>
      )}

      <section className="rounded-2xl border border-sky-100 bg-white/95 p-6 shadow-[0_12px_35px_rgba(14,165,233,0.08)]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">Vận hành quản trị</p>
            <h2 className="mt-2 text-2xl font-semibold">Quản lý khung giờ lấy mẫu</h2>
            <p className="mt-2 text-sm text-slate-500">
              Mở và quản lý các khung giờ lấy mẫu tại nhà, sức chứa và trạng thái hoạt động.
            </p>
          </div>
          <button
            onClick={() => loadSlots(appliedFilters)}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white hover:from-sky-600 hover:to-teal-600 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form
          onSubmit={handleCreateSlot}
          className="rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-[0_12px_35px_rgba(14,165,233,0.08)]"
        >
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Tạo khung giờ lấy mẫu</h3>
              <p className="text-sm text-slate-500">Mở khung giờ trước khi cho phép đặt lịch.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Ngày
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Khu vực
              <input
                value={form.area}
                onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                placeholder="default"
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Giờ bắt đầu
              <input
                type="time"
                value={form.timeStart}
                onChange={(event) => setForm((current) => ({ ...current, timeStart: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Giờ kết thúc
              <input
                type="time"
                value={form.timeEnd}
                onChange={(event) => setForm((current) => ({ ...current, timeEnd: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Sức chứa
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <label className="flex items-end text-sm font-semibold text-slate-700">
              <span className="flex h-12 w-full items-center justify-between rounded-xl border border-sky-100 bg-sky-50/70 px-3">
                Đang mở
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  className="h-4 w-4 accent-teal-600"
                />
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white hover:from-sky-600 hover:to-teal-600 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Tạo khung giờ
          </button>
        </form>

        <section className="rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-[0_12px_35px_rgba(14,165,233,0.08)]">
          <div className="grid gap-3 lg:grid-cols-5">
            <label className="text-sm font-semibold text-slate-700">
              Từ ngày
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Đến ngày
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Trạng thái
              <select
                value={filters.active || ''}
                onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              >
                <option value="">Tất cả</option>
                <option value="true">Đang mở</option>
                <option value="false">Tạm khóa</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Khu vực
              <input
                value={filters.area || ''}
                onChange={(event) => setFilters((current) => ({ ...current, area: event.target.value }))}
                placeholder="default"
                className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleApplyFilters}
                disabled={isLoading}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 px-3 text-sm font-semibold text-white hover:from-sky-600 hover:to-teal-600 disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                Tìm kiếm
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                disabled={isLoading}
                className="h-12 rounded-xl border border-sky-100 bg-white px-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-60"
              >
                Đặt lại
              </button>
            </div>
          </div>
        </section>
      </section>

      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-white/95 shadow-[0_12px_35px_rgba(14,165,233,0.08)]">
        <div className="flex flex-col justify-between gap-3 border-b border-sky-100 px-5 py-4 md:flex-row md:items-center">
          <div>
            <h3 className="font-semibold">Khung giờ lấy mẫu</h3>
            <p className="mt-1 text-sm text-slate-500">{slots.length} khung giờ đang hiển thị</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full divide-y divide-sky-100 text-sm">
            <thead className="bg-sky-50 text-left text-xs font-semibold uppercase text-sky-800">
              <tr>
                <th className="px-5 py-3">Ngày</th>
                <th className="px-5 py-3">Bắt đầu</th>
                <th className="px-5 py-3">Kết thúc</th>
                <th className="px-5 py-3">Khu vực</th>
                <th className="px-5 py-3">Sức chứa</th>
                <th className="px-5 py-3">Đã đặt</th>
                <th className="px-5 py-3">Còn trống</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-50">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-500">
                    Đang tải danh sách khung giờ...
                  </td>
                </tr>
              ) : slots.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <CalendarClock className="mx-auto h-10 w-10 text-teal-600" />
                    <h4 className="mt-4 font-semibold">Chưa có khung giờ phù hợp</h4>
                    <p className="mt-2 text-sm text-slate-500">
                      Tạo khung giờ mới để Chatbot có thể nhận lịch hẹn trong thời gian đó.
                    </p>
                  </td>
                </tr>
              ) : (
                slots.map((slot) => (
                  <tr key={slot.id} className="hover:bg-sky-50/70">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                      {slot.date}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">{slot.timeStart}</td>
                    <td className="whitespace-nowrap px-5 py-4">{slot.timeEnd}</td>
                    <td className="whitespace-nowrap px-5 py-4">{slot.area || 'default'}</td>
                    <td className="whitespace-nowrap px-5 py-4">{slot.capacity}</td>
                    <td className="whitespace-nowrap px-5 py-4">{slot.bookedCount}</td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          slot.remainingCapacity > 0
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {slot.remainingCapacity}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <StatusPill active={slot.active} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <button
                        onClick={() => startEdit(slot)}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white hover:from-sky-600 hover:to-teal-600"
                      >
                        <Edit3 className="h-4 w-4" />
                        Sửa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(14,165,233,0.18)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Sửa khung giờ lấy mẫu</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {editingSlot.date} {editingSlot.timeStart} - {editingSlot.timeEnd}
                </p>
              </div>
              <StatusPill active={editingSlot.active} />
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Sức chứa
                <input
                  type="number"
                  min={Math.max(1, editingSlot.bookedCount)}
                  value={editForm.capacity}
                  onChange={(event) => setEditForm((current) => ({ ...current, capacity: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
                />
              </label>

              <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm text-slate-600">
                Đã đặt: <strong>{editingSlot.bookedCount}</strong>. Sức chứa không nên nhỏ hơn số lịch đã được đặt.
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                Khu vực
                <input
                  value={editForm.area}
                  onChange={(event) => setEditForm((current) => ({ ...current, area: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
                />
              </label>

              <label className="flex h-12 items-center justify-between rounded-xl border border-sky-100 bg-sky-50/70 px-3 text-sm font-semibold text-slate-700">
                Đang mở
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(event) => setEditForm((current) => ({ ...current, active: event.target.checked }))}
                  className="h-4 w-4 accent-teal-600"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEditingSlot(null)}
                className="rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                Hủy
              </button>
              <button
                onClick={handleUpdateSlot}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white hover:from-sky-600 hover:to-teal-600 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
