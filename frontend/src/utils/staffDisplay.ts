export const STAFF_ROLE_LABELS: Record<string, string> = {
  SAMPLE_COLLECTOR: 'Nhân viên lấy mẫu',
  ADMIN: 'Quản trị viên',
  LAB_TECHNICIAN: 'Kỹ thuật viên xét nghiệm',
  STAFF: 'Nhân viên',
};

export function getStaffRoleLabel(role?: string | null) {
  if (!role) return '-';

  return STAFF_ROLE_LABELS[role] || role;
}

export function getStaffActiveLabel(active?: boolean | null) {
  return active ? 'Đang hoạt động' : 'Tạm khóa';
}
