export const BOOKING_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Đã xác nhận',
  ASSIGNED: 'Đã phân công',
  RESCHEDULED: 'Đã đổi lịch',
  SAMPLE_COLLECTED: 'Đã lấy mẫu',
  IN_LAB_PROCESSING: 'Đang xử lý tại phòng xét nghiệm',
  RESULT_READY: 'Có kết quả',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không có mặt',
  DRAFT: 'Bản nháp',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
};

export function getBookingStatusLabel(status?: string | null) {
  if (!status) return '-';
  return BOOKING_STATUS_LABELS[status] || status;
}
