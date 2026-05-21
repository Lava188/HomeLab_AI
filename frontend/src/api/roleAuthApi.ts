const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export type UserAuthSession = {
  role: 'USER';
  patientId: string;
  phone: string;
  name: string;
  email?: string | null;
};

export type StaffAuthSession = {
  role: 'ADMIN' | 'COLLECTOR';
  staffId: string;
  phone: string;
  name: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

async function request<T>(path: string, body: Record<string, string>) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload: ApiResponse<T> = await response.json();

  if (!response.ok || !payload.success || payload.data === undefined) {
    const error = new Error(payload.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
    (error as Error & { code?: string }).code = payload.code;
    throw error;
  }

  return payload.data;
}

export function loginUser(phone: string, password: string) {
  return request<{ session: UserAuthSession }>('/api/user/auth/login', { phone, password });
}

export function registerUser(name: string, email: string, phone: string, password: string) {
  return request<{ session: UserAuthSession }>('/api/user/auth/register', { name, email, phone, password });
}

export function loginAdmin(phone: string, password: string) {
  return request<{ session: StaffAuthSession }>('/api/admin/auth/login', { phone, password });
}

export function loginCollector(phone: string, password: string) {
  return request<{ session: StaffAuthSession }>('/api/collector/auth/login', { phone, password });
}
