import { getDemoAuthHeaders, getUserSession } from '../auth/demoAuth';
import { BookingStatus, StaffProfile, StatusHistoryItem } from './adminBookingApi';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export type UserBooking = {
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
  statusHistory?: Pick<StatusHistoryItem, 'id' | 'fromStatus' | 'toStatus' | 'createdAt'>[];
};

export type UserBookingFilters = {
  status?: string;
  bookingCode?: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

function buildQuery(filters: UserBookingFilters = {}) {
  const session = getUserSession();
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
  const session = getUserSession();

  if (!session.phone || !session.patientId) {
    window.location.replace('/user/login');
    throw new Error('Vui lòng đăng nhập bằng tài khoản người dùng đã đăng ký để xem lịch hẹn.');
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
        'Không thể tải dữ liệu lịch hẹn. Vui lòng kiểm tra số điện thoại và thử lại.',
    );
  }

  return payload.data;
}

export function listUserBookings(filters: UserBookingFilters = {}) {
  return request<{ bookings: UserBooking[]; total: number }>(
    `/api/user/bookings${buildQuery(filters)}`,
  );
}

export function getUserBookingDetail(bookingCode: string) {
  return request<UserBooking>(
    `/api/user/bookings/${encodeURIComponent(bookingCode)}${buildQuery()}`,
  );
}

export function cancelUserBooking(bookingCode: string) {
  return request<UserBooking>(
    `/api/user/bookings/${encodeURIComponent(bookingCode)}/cancel${buildQuery()}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        reason: 'user_dashboard_cancel',
      }),
    },
  );
}
