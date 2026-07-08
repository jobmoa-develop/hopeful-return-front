import { apiClient } from './client';
import type { AuthUser } from '../auth/token';

export type LoginRequest = {
  loginId: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
};

export type LoginApiResponse = {
  success: boolean;
  data: LoginResponse;
};

export type RefreshResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
};

export type RefreshApiResponse = {
  success: boolean;
  data: RefreshResponse;
};

export function login(payload: LoginRequest) {
  return apiClient.post<LoginApiResponse>('/api/auth/login', payload);
}

export function logout() {
  return apiClient.post<void>('/api/auth/logout');
}

export function refresh() {
  return apiClient.post<RefreshApiResponse>('/api/auth/refresh');
}

export function me() {
  return apiClient.get<AuthUser>('/api/auth/me');
}
