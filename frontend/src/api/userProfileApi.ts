import { getDemoAuthHeaders, getUserSession } from '../auth/demoAuth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export type UserProfilePayload = {
  name: string;
  email: string;
};

export type UserProfileResponse = {
  session?: {
    role?: 'USER';
    patientId?: string;
    phone?: string;
    name?: string;
    email?: string | null;
  };
  patient?: {
    id?: string;
    fullName?: string;
    phone?: string;
    email?: string | null;
  };
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

export async function updateUserProfile(payload: UserProfilePayload) {
  const session = getUserSession();

  if (!session.phone || !session.patientId) {
    window.location.replace('/user/login');
    throw new Error('Vui lòng đăng nhập để cập nhật thông tin cá nhân.');
  }

  const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getDemoAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const body: ApiResponse<UserProfileResponse> = await response.json();

  if (!response.ok || !body.success || body.data === undefined) {
    throw new Error(body.message || 'Không thể cập nhật thông tin. Vui lòng thử lại.');
  }

  return body.data;
}
