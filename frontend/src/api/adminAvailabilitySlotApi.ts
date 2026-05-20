import { getDemoAuthHeaders } from '../auth/demoAuth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

export type AvailabilitySlot = {
  id: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  capacity: number;
  bookedCount: number;
  remainingCapacity: number;
  area?: string | null;
  active: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AvailabilitySlotFilters = {
  dateFrom?: string;
  dateTo?: string;
  active?: string;
  area?: string;
  limit?: number;
};

export type AvailabilitySlotPayload = {
  date?: string;
  timeStart?: string;
  timeEnd?: string;
  capacity?: number;
  area?: string | null;
  active?: boolean;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

function buildQuery(filters: AvailabilitySlotFilters) {
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
        'Không thể tải dữ liệu khung giờ lấy mẫu. Vui lòng kiểm tra backend và thử lại.',
    );
  }

  return payload.data;
}

export function listAvailabilitySlots(filters: AvailabilitySlotFilters = {}) {
  return request<{ slots: AvailabilitySlot[]; total: number }>(
    `/api/admin/availability-slots${buildQuery({ limit: 100, ...filters })}`,
  );
}

export function createAvailabilitySlot(payload: AvailabilitySlotPayload) {
  return request<AvailabilitySlot>('/api/admin/availability-slots', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAvailabilitySlot(
  id: string,
  payload: AvailabilitySlotPayload,
) {
  return request<AvailabilitySlot>(
    `/api/admin/availability-slots/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}
