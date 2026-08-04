import { apiClient } from './client';
import type { AuthUser } from '../auth/token';
import type { ApiResponse } from '../types/api';

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

// GET/PATCH /api/auth/me 응답 — 전화번호/이메일 포함
export type MeResponse = {
  userId: number;
  loginId: string;
  name: string;
  phone: string | null;
  email: string | null;
  roleNames: string[];
  canSendSms: boolean;
};

export type UpdateMyProfileRequest = {
  phone?: string;
  email?: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
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

// 내 정보 조회
export function me() {
  return apiClient.get<ApiResponse<MeResponse>>('/api/auth/me');
}

// 내 정보 수정 (전화번호/이메일)
export function updateMyProfile(payload: UpdateMyProfileRequest) {
  return apiClient.patch<ApiResponse<MeResponse>>('/api/auth/me', payload);
}

// 비밀번호 변경
export function changePassword(payload: ChangePasswordRequest) {
  return apiClient.patch<ApiResponse<{ message: string }>>('/api/auth/me/password', payload);
}