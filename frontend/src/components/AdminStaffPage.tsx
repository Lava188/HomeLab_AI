import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  Check,
  Clock3,
  Edit3,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  UserCheck,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react';
import {
  createStaff,
  getStaffDetail,
  listStaff,
  StaffFilters,
  StaffProfileAdmin,
  StaffRole,
  updateStaff,
} from '../api/adminStaffApi';
import { getBookingStatusLabel } from '../utils/bookingDisplay';
import { getStaffActiveLabel, getStaffRoleLabel } from '../utils/staffDisplay';

const EMPTY_FILTERS: StaffFilters = {
  search: '',
  role: '',
  active: '',
};

const EMPTY_FORM = {
  name: '',
  phone: '',
  role: 'SAMPLE_COLLECTOR' as StaffRole,
  active: true,
  initialPassword: '',
  newPassword: '',
};

const ROLE_OPTIONS: StaffRole[] = ['SAMPLE_COLLECTOR', 'ADMIN', 'LAB_TECHNICIAN', 'STAFF'];

function validateForm(form: typeof EMPTY_FORM) {
  if (!form.name.trim()) return 'Tên nhân viên là bắt buộc.';
  if (!form.phone.trim()) return 'Số điện thoại nhân viên là bắt buộc.';
  if (!form.role) return 'Vai trò nhân viên là bắt buộc.';
  if (!form.initialPassword.trim()) return 'Mật khẩu ban đầu là bắt buộc.';
  if (form.initialPassword.length < 8) return 'Mật khẩu cần có ít nhất 8 ký tự.';

  return '';
}

function validateEditForm(form: typeof EMPTY_FORM) {
  if (!form.name.trim()) return 'Tên nhân viên là bắt buộc.';
  if (!form.phone.trim()) return 'Số điện thoại nhân viên là bắt buộc.';
  if (!form.role) return 'Vai trò nhân viên là bắt buộc.';
  if (form.newPassword.trim() && form.newPassword.length < 8) return 'Mật khẩu mới cần có ít nhất 8 ký tự.';

  return '';
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-600'
      }`}
    >
      {getStaffActiveLabel(active)}
    </span>
  );
}

export default function AdminStaffPage() {
  const [filters, setFilters] = useState<StaffFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<StaffFilters>(EMPTY_FILTERS);
  const [staff, setStaff] = useState<StaffProfileAdmin[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingStaff, setEditingStaff] = useState<StaffProfileAdmin | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffProfileAdmin | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const summary = useMemo(() => {
    return {
      total: staff.length,
      active: staff.filter((item) => item.active).length,
      inactive: staff.filter((item) => !item.active).length,
      assignedToday: staff.reduce((sum, item) => sum + Number(item.workload?.assignedToday || 0), 0),
      pendingToday: staff.reduce((sum, item) => sum + Number(item.workload?.pendingToday || 0), 0),
    };
  }, [staff]);

  const summaryCards = [
    { label: 'Tổng nhân viên', value: summary.total, icon: UsersRound, tone: 'border-sky-100 bg-sky-50 text-sky-700' },
    { label: 'Đang hoạt động', value: summary.active, icon: UserCheck, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    { label: 'Tạm khóa', value: summary.inactive, icon: ShieldAlert, tone: 'border-slate-200 bg-slate-50 text-slate-700' },
    { label: 'Lịch được giao hôm nay', value: summary.assignedToday, icon: CalendarCheck, tone: 'border-cyan-100 bg-cyan-50 text-cyan-700' },
    { label: 'Lịch đang chờ lấy mẫu', value: summary.pendingToday, icon: Clock3, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
  ];

  async function loadStaff(nextFilters = appliedFilters) {
    setIsLoading(true);
    setError('');

    try {
      const data = await listStaff(nextFilters);
      setStaff(data.staff);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể tải danh sách nhân viên.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStaff(EMPTY_FILTERS);
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm(form);

    if (validationError) {
      setError(validationError);
      setSuccess('');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await createStaff(form);
      setForm(EMPTY_FORM);
      setSuccess('Đã lưu hồ sơ nhân viên.');
      await loadStaff(appliedFilters);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể lưu hồ sơ nhân viên.');
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(item: StaffProfileAdmin) {
    setEditingStaff(item);
    setEditForm({
      name: item.fullName,
      phone: item.phone || '',
      role: item.role,
      active: item.active,
      initialPassword: '',
      newPassword: '',
    });
    setError('');
    setSuccess('');
  }

  async function handleUpdate() {
    if (!editingStaff) return;

    const validationError = validateEditForm(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateStaff(editingStaff.id, editForm);
      setEditingStaff(null);
      setSuccess('Đã cập nhật hồ sơ nhân viên.');
      await loadStaff(appliedFilters);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể cập nhật hồ sơ nhân viên.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleViewDetail(item: StaffProfileAdmin) {
    setIsLoading(true);
    setError('');

    try {
      const detail = await getStaffDetail(item.id);
      setSelectedStaff(detail);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể tải chi tiết nhân viên.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApplyFilters() {
    setAppliedFilters(filters);
    await loadStaff(filters);
  }

  async function handleResetFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    await loadStaff(EMPTY_FILTERS);
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
            <p className="text-sm font-semibold uppercase text-sky-700">Vận hành nhân sự</p>
            <h2 className="mt-2 text-2xl font-semibold">Quản lý nhân viên lấy mẫu</h2>
            <p className="mt-2 text-sm text-slate-500">
              Quản lý hồ sơ nhân viên, trạng thái hoạt động và khối lượng lịch được phân công.
            </p>
          </div>
          <button
            onClick={() => loadStaff(appliedFilters)}
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
        <form onSubmit={handleCreate} className="rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-[0_12px_35px_rgba(14,165,233,0.08)]">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
              <UserRoundPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Tạo nhân viên</h3>
              <p className="text-sm text-slate-500">Thêm hồ sơ nhân viên lấy mẫu hoặc nhân sự vận hành.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Tên nhân viên
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nhập tên nhân viên"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Số điện thoại
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Nhập số điện thoại"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Vai trò
              <select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as StaffRole }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{getStaffRoleLabel(role)}</option>
                ))}
              </select>
            </label>
            <label className="flex h-12 items-center justify-between rounded-xl border border-sky-100 bg-sky-50/70 px-3 text-sm font-semibold text-slate-700">
              Đang hoạt động
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="h-4 w-4 accent-sky-600"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Mật khẩu ban đầu
              <input
                type="password"
                value={form.initialPassword}
                onChange={(event) => setForm((current) => ({ ...current, initialPassword: event.target.value }))}
                placeholder="Nhập mật khẩu ban đầu"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white hover:from-sky-600 hover:to-teal-600 disabled:opacity-60"
          >
            <UserRoundPlus className="h-4 w-4" />
            Tạo nhân viên
          </button>
        </form>

        <section className="rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-[0_12px_35px_rgba(14,165,233,0.08)]">
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              Tìm kiếm
              <input
                value={filters.search || ''}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Tên hoặc số điện thoại"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Vai trò
              <select
                value={filters.role || ''}
                onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
              >
                <option value="">Tất cả</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{getStaffRoleLabel(role)}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Trạng thái
              <select
                value={filters.active || ''}
                onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
              >
                <option value="">Tất cả</option>
                <option value="true">Đang hoạt động</option>
                <option value="false">Tạm khóa</option>
              </select>
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
        <div className="flex items-center justify-between border-b border-sky-100 px-5 py-4">
          <div>
            <h3 className="font-semibold">Danh sách nhân viên</h3>
            <p className="mt-1 text-sm text-slate-500">{staff.length} nhân viên đang hiển thị</p>
          </div>
          <UsersRound className="h-5 w-5 text-sky-600" />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full divide-y divide-sky-100 text-sm">
            <thead className="bg-sky-50 text-left text-xs font-semibold uppercase text-sky-800">
              <tr>
                <th className="px-5 py-3">Tên nhân viên</th>
                <th className="px-5 py-3">Số điện thoại</th>
                <th className="px-5 py-3">Vai trò</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3">Lịch hôm nay</th>
                <th className="px-5 py-3">Chờ lấy mẫu</th>
                <th className="px-5 py-3">Đang phụ trách</th>
                <th className="px-5 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    Đang tải danh sách nhân viên...
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    Chưa có nhân viên phù hợp.
                  </td>
                </tr>
              ) : (
                staff.map((item) => (
                  <tr key={item.id} className="hover:bg-sky-50/70">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">{item.fullName}</td>
                    <td className="whitespace-nowrap px-5 py-4">{item.phone || '-'}</td>
                    <td className="whitespace-nowrap px-5 py-4">{getStaffRoleLabel(item.role)}</td>
                    <td className="whitespace-nowrap px-5 py-4"><StatusPill active={item.active} /></td>
                    <td className="whitespace-nowrap px-5 py-4">{item.workload?.assignedToday || 0}</td>
                    <td className="whitespace-nowrap px-5 py-4">{item.workload?.pendingToday || 0}</td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        (item.workload?.totalActiveAssigned || 0) >= 8
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-sky-50 text-sky-700'
                      }`}>
                        {item.workload?.totalActiveAssigned || 0}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => handleViewDetail(item)}
                          className="rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                        >
                          Chi tiết
                        </button>
                        <button
                          onClick={() => startEdit(item)}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 px-3 py-2 text-sm font-semibold text-white hover:from-sky-600 hover:to-teal-600"
                        >
                          <Edit3 className="h-4 w-4" />
                          Sửa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(14,165,233,0.18)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Sửa hồ sơ nhân viên</h3>
                <p className="mt-1 text-sm text-slate-500">{editingStaff.fullName}</p>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng chỉnh sửa"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Tên nhân viên
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nhập tên nhân viên"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Số điện thoại
                <input
                  value={editForm.phone}
                  onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Nhập số điện thoại"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Vai trò
                <select
                  value={editForm.role}
                  onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value as StaffRole }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{getStaffRoleLabel(role)}</option>
                  ))}
                </select>
              </label>
              <label className="flex h-12 items-center justify-between rounded-xl border border-sky-100 bg-sky-50/70 px-3 text-sm font-semibold text-slate-700">
                Đang hoạt động
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(event) => setEditForm((current) => ({ ...current, active: event.target.checked }))}
                  className="h-4 w-4 accent-sky-600"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Đặt mật khẩu mới
                <input
                  type="password"
                  value={editForm.newPassword}
                  onChange={(event) => setEditForm((current) => ({ ...current, newPassword: event.target.value }))}
                  placeholder="Bỏ trống nếu không đổi mật khẩu"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(56,189,248,0.14)]"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEditingStaff(null)}
                className="rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                Hủy
              </button>
              <button
                onClick={handleUpdate}
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

      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(14,165,233,0.18)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedStaff.fullName}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedStaff.phone || '-'} · {getStaffRoleLabel(selectedStaff.role)}
                </p>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Đóng chi tiết"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                <p className="text-xs font-semibold text-slate-500">Trạng thái</p>
                <p className="mt-2 font-semibold">{getStaffActiveLabel(selectedStaff.active)}</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                <p className="text-xs font-semibold text-slate-500">Lịch hôm nay</p>
                <p className="mt-2 text-xl font-semibold">{selectedStaff.workload?.assignedToday || 0}</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                <p className="text-xs font-semibold text-slate-500">Chờ lấy mẫu</p>
                <p className="mt-2 text-xl font-semibold">{selectedStaff.workload?.pendingToday || 0}</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                <p className="text-xs font-semibold text-slate-500">Đang phụ trách</p>
                <p className="mt-2 text-xl font-semibold">{selectedStaff.workload?.totalActiveAssigned || 0}</p>
              </div>
            </div>

            {selectedStaff.workload?.warning ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {selectedStaff.workload.warning}
              </div>
            ) : null}

            <section className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="font-semibold">Vùng làm việc</h4>
                <div className="mt-3 divide-y divide-sky-50 rounded-2xl border border-slate-200">
                  {(selectedStaff.workingAreas || []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">Chưa có vùng làm việc.</p>
                  ) : (
                    selectedStaff.workingAreas?.map((area) => (
                      <div key={area.id} className="p-4">
                        <p className="font-semibold text-slate-800">
                          {[area.ward, area.district, area.province].filter(Boolean).join(', ')}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {area.active ? 'Đang hoạt động' : 'Tạm tắt'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold">Lịch làm việc sắp tới</h4>
                <div className="mt-3 divide-y divide-sky-50 rounded-2xl border border-slate-200">
                  {(selectedStaff.workingSchedules || []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">Chưa có lịch làm việc sắp tới.</p>
                  ) : (
                    selectedStaff.workingSchedules?.map((schedule) => (
                      <div key={schedule.id} className="p-4">
                        <p className="font-semibold text-slate-800">
                          {schedule.workDate} · {schedule.startTime} - {schedule.endTime}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Sức chứa {schedule.capacity} · {schedule.active ? 'Đang hoạt động' : 'Tạm tắt'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="mt-5">
              <h4 className="font-semibold">Lịch đang được giao</h4>
              <div className="mt-3 divide-y divide-sky-50 rounded-2xl border border-slate-200">
                {(selectedStaff.assignedBookings || []).length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Chưa có lịch đang phụ trách.</p>
                ) : (
                  selectedStaff.assignedBookings?.map((booking) => (
                    <div key={booking.bookingCode} className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                      <div>
                        <p className="font-semibold">{booking.bookingCode}</p>
                        <p className="text-sm text-slate-500">{booking.patientName || '-'} · {booking.phone || '-'}</p>
                      </div>
                      <p className="text-sm text-slate-600">
                        {booking.sampleDate || '-'} {booking.sampleTimeStart || ''}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {getBookingStatusLabel(booking.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
