import { BookingStatus } from './adminBookingApi';
import { getDemoAuthHeaders } from '../auth/demoAuth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

export type StaffRole = 'ADMIN' | 'STAFF' | 'SAMPLE_COLLECTOR' | 'LAB_TECHNICIAN';

export type StaffWorkload = {
  assignedToday: number;
  pendingToday: number;
  collectedToday: number;
  totalActiveAssigned: number;
  warning?: string | null;
};

export type StaffAssignedBooking = {
  id: string;
  bookingCode: string;
  status: BookingStatus;
  patientName?: string | null;
  phone?: string | null;
  testName?: string | null;
  testTypeText?: string | null;
  sampleDate?: string | null;
  sampleTimeStart?: string | null;
  address?: string | null;
};

export type StaffWorkingArea = {
  id: string;
  province: string;
  district?: string | null;
  ward?: string | null;
  active: boolean;
};

export type StaffWorkingSchedule = {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  active: boolean;
  capacity: number;
};

export type StaffProfileAdmin = {
  id: string;
  fullName: string;
  name?: string;
  phone?: string | null;
  role: StaffRole;
  serviceArea?: string | null;
  active: boolean;
  workload: StaffWorkload;
  assignedBookings?: StaffAssignedBooking[];
  workingAreas?: StaffWorkingArea[];
  workingSchedules?: StaffWorkingSchedule[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StaffFilters = {
  role?: string;
  active?: string;
  search?: string;
  limit?: number;
};

export type StaffPayload = {
  name?: string;
  fullName?: string;
  phone?: string;
  role?: StaffRole;
  active?: boolean;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

function buildQuery(filters: StaffFilters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...getDemoAuthHeaders(),
      ...(options.headers || {}),
    },
  });
  const payload: ApiResponse<T> = await response.json();

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(
      payload.message ||
        'Không thể tải dữ liệu nhân viên. Vui lòng kiểm tra máy chủ và thử lại.',
    );
  }

  return payload.data;
}

export function listStaff(filters: StaffFilters = {}) {
  return request<{ staff: StaffProfileAdmin[]; total: number }>(
    `/api/admin/staff${buildQuery({ limit: 100, ...filters })}`,
  );
}

export function getStaffDetail(id: string) {
  return request<StaffProfileAdmin>(`/api/admin/staff/${encodeURIComponent(id)}`);
}

export function createStaff(payload: StaffPayload) {
  return request<StaffProfileAdmin>('/api/admin/staff', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateStaff(id: string, payload: StaffPayload) {
  return request<StaffProfileAdmin>(`/api/admin/staff/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
