import { getAdminSession, getCollectorSession } from '../auth/demoAuth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

export type NotificationType =
  | 'BOOKING_CREATED'
  | 'ASSIGNMENT_AUTO_CREATED'
  | 'ASSIGNMENT_MANUAL_CREATED'
  | 'ASSIGNMENT_REJECTED'
  | 'COLLECTOR_TASK_ASSIGNED';

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
  bookingCode?: string | null;
  assignmentId?: string | null;
  bookingId?: string | null;
  metadata?: Record<string, unknown> | null;
  booking?: {
    bookingCode: string;
    status: string;
    sampleDate?: string | null;
    sampleTimeStart?: string | null;
    address?: string | null;
    patientName?: string | null;
    phone?: string | null;
  } | null;
  assignment?: {
    id: string;
    status: string;
    rejectReason?: string | null;
    collector?: {
      id: string;
      fullName: string;
      phone?: string | null;
    };
  } | null;
};

export type NotificationListResponse = {
  notifications: Notification[];
  unreadCount: number;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
  });
  const payload: ApiResponse<T> = await response.json();

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(
      payload.message || 'Không thể tải thông báo. Vui lòng thử lại.',
    );
  }

  return payload.data;
}

// Admin notifications
export function listAdminNotifications(params: {
  unreadOnly?: boolean;
  limit?: number;
} = {}) {
  return request<NotificationListResponse>(
    `/api/admin/notifications${buildQuery({ limit: 20, ...params })}`,
  );
}

export function markAdminNotificationRead(notificationId: string) {
  return request<{ id: string; readAt: string }>(
    `/api/admin/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function markAllAdminNotificationsRead() {
  return request<{ count: number; message: string }>(
    '/api/admin/notifications/read-all',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

// Collector notifications
export function listCollectorNotifications(params: {
  unreadOnly?: boolean;
  limit?: number;
} = {}) {
  const session = getCollectorSession();

  return request<NotificationListResponse>(
    `/api/collector/notifications${buildQuery({
      phone: session.phone,
      limit: 20,
      ...params,
    })}`,
  );
}

export function markCollectorNotificationRead(notificationId: string) {
  return request<{ id: string; readAt: string }>(
    `/api/collector/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export function markAllCollectorNotificationsRead() {
  return request<{ count: number; message: string }>(
    '/api/collector/notifications/read-all',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}
