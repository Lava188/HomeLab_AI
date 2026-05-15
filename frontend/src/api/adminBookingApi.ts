const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const DEMO_HEADERS = {
  'Content-Type': 'application/json',
  'x-demo-role': 'ADMIN',
  'x-demo-user-id': 'admin-demo',
};

export type BookingStatus =
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'SAMPLE_COLLECTED'
  | 'IN_LAB_PROCESSING'
  | 'RESULT_READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED'
  | 'DRAFT'
  | 'PENDING_CONFIRMATION';

export type BookingFilters = {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  phone?: string;
  bookingCode?: string;
  limit?: number;
};

export type StatusHistoryItem = {
  id: string;
  fromStatus?: BookingStatus | null;
  toStatus: BookingStatus;
  reason?: string | null;
  changedByType?: string;
  changedById?: string | null;
  createdAt?: string;
};

export type StaffProfile = {
  id: string;
  fullName: string;
  phone?: string | null;
  role?: string;
  serviceArea?: string | null;
  active?: boolean;
};

export type AdminBooking = {
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
  internalNote?: string | null;
  createdAt?: string | null;
  assignedStaff?: StaffProfile | null;
  patient?: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
  } | null;
  testCatalogItem?: {
    id: string;
    code: string;
    name: string;
    category?: string | null;
  } | null;
  statusHistory?: StatusHistoryItem[];
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

function buildQuery(filters: BookingFilters) {
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
      ...DEMO_HEADERS,
      ...(options.headers || {}),
    },
  });
  const payload: ApiResponse<T> = await response.json();

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(
      payload.message ||
        'Không thể tải dữ liệu booking. Vui lòng kiểm tra backend và thử lại.',
    );
  }

  return payload.data;
}

export function listBookings(filters: BookingFilters = {}) {
  return request<{ bookings: AdminBooking[]; total: number }>(
    `/api/admin/bookings${buildQuery({ limit: 50, ...filters })}`,
  );
}

export function getBookingDetail(bookingCode: string) {
  return request<AdminBooking>(
    `/api/admin/bookings/${encodeURIComponent(bookingCode)}`,
  );
}

export function assignBooking(
  bookingCode: string,
  payload: {
    staffId?: string;
    staffName?: string;
    staffPhone?: string;
    role?: string;
  },
) {
  return request<AdminBooking>(
    `/api/admin/bookings/${encodeURIComponent(bookingCode)}/assign`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function updateBookingStatus(
  bookingCode: string,
  payload: {
    status: BookingStatus;
    reason?: string;
  },
) {
  return request<AdminBooking>(
    `/api/admin/bookings/${encodeURIComponent(bookingCode)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function updateInternalNote(
  bookingCode: string,
  payload: {
    internalNote: string;
  },
) {
  return request<AdminBooking>(
    `/api/admin/bookings/${encodeURIComponent(bookingCode)}/internal-note`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}
