export const DEMO_ROLES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  COLLECTOR: 'COLLECTOR',
} as const;

export type DemoRole = (typeof DEMO_ROLES)[keyof typeof DEMO_ROLES];

export type DemoSession = {
  role: DemoRole | '';
  token: string;
  userId: string;
  phone: string;
  displayName: string;
};

const STORAGE_KEYS = {
  role: 'homelab_demo_role',
  token: 'homelab_demo_token',
  userId: 'homelab_demo_user_id',
  phone: 'homelab_demo_phone',
  displayName: 'homelab_demo_display_name',
};

function isDemoRole(value: string | null): value is DemoRole {
  return value === DEMO_ROLES.USER || value === DEMO_ROLES.ADMIN || value === DEMO_ROLES.COLLECTOR;
}

export function normalizePhone(value = '') {
  return value.replace(/\D/g, '');
}

export function sanitizeHeaderValue(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9._:-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

function getDefaultUserId(role: DemoRole, phone: string, userId?: string) {
  const safeUserId = sanitizeHeaderValue(userId || '');

  if (safeUserId) return safeUserId;
  if (role === DEMO_ROLES.USER) return phone ? `user-${phone}` : 'user-demo';
  if (role === DEMO_ROLES.COLLECTOR) return phone ? `collector-${phone}` : 'collector-demo';
  return phone ? `admin-${phone}` : 'admin-demo';
}

export function loginDemoRole({
  role,
  userId,
  phone = '',
  displayName = '',
}: {
  role: DemoRole;
  userId?: string;
  phone?: string;
  displayName?: string;
}) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedUserId = getDefaultUserId(role, normalizedPhone, userId);

  localStorage.setItem(STORAGE_KEYS.role, role);
  localStorage.setItem(STORAGE_KEYS.token, `demo-${role.toLowerCase()}-${Date.now()}`);
  localStorage.setItem(STORAGE_KEYS.userId, normalizedUserId);
  localStorage.setItem(STORAGE_KEYS.phone, normalizedPhone);
  localStorage.setItem(STORAGE_KEYS.displayName, displayName.trim());
}

export function logoutDemoRole() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

export function getDemoSession(): DemoSession {
  const roleValue = localStorage.getItem(STORAGE_KEYS.role);
  const phone = normalizePhone(localStorage.getItem(STORAGE_KEYS.phone) || '');
  const role = isDemoRole(roleValue) ? roleValue : '';
  const storedUserId = sanitizeHeaderValue(localStorage.getItem(STORAGE_KEYS.userId) || '');
  const userId =
    role === DEMO_ROLES.USER && phone
      ? `user-${phone}`
      : role === DEMO_ROLES.COLLECTOR && phone
        ? `collector-${phone}`
        : storedUserId || getDefaultUserId(role || DEMO_ROLES.USER, phone);

  return {
    role,
    token: localStorage.getItem(STORAGE_KEYS.token) || '',
    userId,
    phone,
    displayName: localStorage.getItem(STORAGE_KEYS.displayName) || '',
  };
}

export function getUserSession() {
  const session = getDemoSession();
  return session.role === DEMO_ROLES.USER ? session : { ...session, role: '' as const };
}

export function getAdminSession() {
  const session = getDemoSession();
  return session.role === DEMO_ROLES.ADMIN ? session : { ...session, role: '' as const };
}

export function getCollectorSession() {
  const session = getDemoSession();
  return session.role === DEMO_ROLES.COLLECTOR ? session : { ...session, role: '' as const };
}

export function hasRole(expectedRole: DemoRole) {
  const session = getDemoSession();
  return session.role === expectedRole && Boolean(session.token);
}

export function getLoginPathForRole(role: DemoRole) {
  if (role === DEMO_ROLES.ADMIN) return '/admin/login';
  if (role === DEMO_ROLES.COLLECTOR) return '/collector/login';
  return '/user/login';
}

export function getDashboardPathForRole(role: DemoRole) {
  if (role === DEMO_ROLES.ADMIN) return '/admin/bookings';
  if (role === DEMO_ROLES.COLLECTOR) return '/collector/dashboard';
  return '/user/dashboard';
}

export function getDemoAuthHeaders() {
  const session = getDemoSession();
  const headers: Record<string, string> = {};

  if (session.role) headers['x-demo-role'] = sanitizeHeaderValue(session.role);
  if (session.userId) headers['x-demo-user-id'] = sanitizeHeaderValue(session.userId);
  if (session.phone) headers['x-demo-phone'] = normalizePhone(session.phone);

  return headers;
}
