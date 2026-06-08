import { AppState, Attachment, AuthUser } from './types';

const getToken = () => localStorage.getItem('auth_token');

const authHeaders = (): HeadersInit => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = async (email: string, password: string): Promise<{ token: string; user: AuthUser }> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
};

export const getMe = async (): Promise<AuthUser> => {
  const res = await fetch('/api/auth/me', {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to change password');
  }
};

export const setUserCredentials = async (userId: string, email: string, password: string, role: 'admin' | 'member'): Promise<void> => {
  const res = await fetch('/api/auth/set-user-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ userId, email, password, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to set credentials');
  }
};

export const resetUserPassword = async (userId: string): Promise<{ tempPassword: string }> => {
  const res = await fetch('/api/auth/reset-user-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to reset password');
  }
  return res.json();
};

export const getAuthList = async (): Promise<{ userId: string; email: string; role: string }[]> => {
  const res = await fetch('/api/auth/list', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch auth list');
  return res.json();
};

// ── App State ─────────────────────────────────────────────────────────────────

export const fetchState = async (): Promise<AppState> => {
  const res = await fetch('/api/state', { headers: authHeaders() });
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
};

export const syncState = async (state: AppState): Promise<void> => {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error('Failed to sync state');
};

export const uploadFile = async (file: File): Promise<Attachment> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  return res.json();
};

export const estimateTaskTime = async (title: string, description: string): Promise<number> => {
  const res = await fetch('/api/estimate-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, description }),
  });
  if (!res.ok) return 60; // default fallback
  const data = await res.json();
  return data.estimatedMinutes || 60;
};

export const reviewPlanWithAI = async (title: string, description: string, subtasks: any[]): Promise<{ explanation: string, newSubtasks: string[], storyPoints: number }> => {
  const res = await fetch('/api/review-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, description, subtasks }),
  });
  if (!res.ok) throw new Error('Failed to review plan');
  return res.json();
};

export const createEntity = async (type: string, data: any): Promise<void> => {
  const res = await fetch(`/api/entity/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create ${type}`);
};

export const updateEntity = async (type: string, id: string, updates: any): Promise<void> => {
  const res = await fetch(`/api/entity/${type}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update ${type}`);
};

export const deleteEntity = async (type: string, id: string): Promise<void> => {
  const res = await fetch(`/api/entity/${type}/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`Failed to delete ${type}`);
};
