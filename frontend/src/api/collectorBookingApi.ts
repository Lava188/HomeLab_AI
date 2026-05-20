import { getCollectorSession, getDemoAuthHeaders } from '../auth/demoAuth';
import { BookingStatus, StaffProfile, StatusHistoryItem } from './adminBookingApi';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export type CollectorBooking = {
  id?: string;
  bookingCode: string;
  status: BookingStatus;
  patientName?: string | null;
  phone?: string | null;
  testName?: string | null;
  testTypeText?: string | null;
  sampleDate?: string | null;
  sampleTimeStart?: string | null;
  sampleTimeEnd?: string | null;
  address?: string | null;
  note?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  assignedStaff?: StaffProfile | null;
  patient?: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
    defaultAddress?: string | null;
  } | null;
  testCatalogItem?: {
    id: string;
    code: string;
    name: string;
    category?: string | null;
    sampleType?: string | null;
  } | null;
  statusHistory?: Pick<StatusHistoryItem, 'id' | 'fromStatus' | 'toStatus' | 'reason' | 'createdAt'>[];
};

export type CollectorBookingFilters = {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  bookingCode?: string;
};

export type CollectorWorkingArea = {
  id: string;
  province: string;
  district?: string | null;
  ward?: string | null;
  active: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CollectorWorkingSchedule = {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  active: boolean;
  capacity: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CollectorWorkingAreaPayload = {
  province?: string;
  district?: string;
  ward?: string;
  active?: boolean;
};

export type CollectorWorkingSchedulePayload = {
  workDate?: string;
  startTime?: string;
  endTime?: string;
  capacity?: number;
  active?: boolean;
};

export type CollectorAssignment = {
  id: string;
  status: string;
  reviewStatus?: string | null;
  bookingCode?: string | null;
  sampleDate?: string | null;
  sampleTimeStart?: string | null;
  sampleTimeEnd?: string | null;
  address?: string | null;
  testTypeText?: string | null;
  testName?: string | null;
  testCode?: string | null;
  patientName?: string | null;
  patientPhone?: string | null;
  assignedAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
  expiresAt?: string | null;
};

export type CollectorAssignmentResult = {
  assignmentId: string | null;
  assignmentStatus: string | null;
  bookingStatus: string | null;
  bookingCode: string | null;
  assignedAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  message?: string | null;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

function buildQuery(filters: CollectorBookingFilters = {}) {
  const session = getCollectorSession();
  const params = new URLSearchParams();

  if (session.phone) params.set('phone', session.phone);

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, options: RequestInit = {}) {
  const session = getCollectorSession();

  if (!session.phone) {
    window.location.replace('/collector/login');
    throw new Error('Vui lòng đăng nhập bằng số điện thoại nhân viên lấy mẫu.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getDemoAuthHeaders(),
      ...(options.headers || {}),
    },
  });
  const payload: ApiResponse<T> = await response.json();

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(
      payload.message ||
        'Không thể tải lịch lấy mẫu. Vui lòng kiểm tra số điện thoại nhân viên lấy mẫu và thử lại.',
    );
  }

  return payload.data;
}

export function listCollectorBookings(filters: CollectorBookingFilters = {}) {
  return request<{ bookings: CollectorBooking[]; total: number }>(
    `/api/collector/bookings${buildQuery(filters)}`,
  );
}

export function getCollectorBookingDetail(bookingCode: string) {
  return request<CollectorBooking>(
    `/api/collector/bookings/${encodeURIComponent(bookingCode)}${buildQuery()}`,
  );
}

export function markSampleCollected(
  bookingCode: string,
  payload: { note?: string } = {},
) {
  return request<CollectorBooking>(
    `/api/collector/bookings/${encodeURIComponent(bookingCode)}/sample-collected${buildQuery()}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function listCollectorWorkingAreas() {
  return request<{ workingAreas: CollectorWorkingArea[]; collectorId: string }>(
    `/api/collector/working-areas${buildQuery()}`,
  );
}

export function createCollectorWorkingArea(payload: CollectorWorkingAreaPayload) {
  return request<CollectorWorkingArea>(`/api/collector/working-areas${buildQuery()}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCollectorWorkingArea(id: string, payload: CollectorWorkingAreaPayload) {
  return request<CollectorWorkingArea>(
    `/api/collector/working-areas/${encodeURIComponent(id)}${buildQuery()}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function listCollectorWorkingSchedules() {
  return request<{ workingSchedules: CollectorWorkingSchedule[]; collectorId: string }>(
    `/api/collector/working-schedules${buildQuery()}`,
  );
}

export function createCollectorWorkingSchedule(payload: CollectorWorkingSchedulePayload) {
  return request<CollectorWorkingSchedule>(`/api/collector/working-schedules${buildQuery()}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCollectorWorkingSchedule(id: string, payload: CollectorWorkingSchedulePayload) {
  return request<CollectorWorkingSchedule>(
    `/api/collector/working-schedules/${encodeURIComponent(id)}${buildQuery()}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function listCollectorAssignments(filters: { status?: string } = {}) {
  return request<{ assignments: CollectorAssignment[]; collectorId: string; collectorName?: string | null }>(
    `/api/collector/assignments${buildQuery(filters)}`,
  );
}

export function acceptCollectorAssignment(assignmentId: string) {
  return request<CollectorAssignmentResult>(
    `/api/collector/assignments/${encodeURIComponent(assignmentId)}/accept${buildQuery()}`,
    { method: 'POST' },
  );
}

export function rejectCollectorAssignment(assignmentId: string, reason: string) {
  return request<CollectorAssignmentResult>(
    `/api/collector/assignments/${encodeURIComponent(assignmentId)}/reject${buildQuery()}`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}
