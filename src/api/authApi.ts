import { apiClient } from './client';
import type { ApiResponse, MemberResponse, TokenResponse } from '../types/api';

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authApi = {
  signup: (payload: SignupPayload) =>
    apiClient.post<ApiResponse<MemberResponse>>('/api/auth/signup', payload),

  login: (payload: LoginPayload) =>
    apiClient.post<ApiResponse<TokenResponse>>('/api/auth/login', payload),

  sendEmailCode: (email: string) =>
    apiClient.post<ApiResponse<null>>('/api/auth/email/send', { email }),

  verifyEmailCode: (email: string, code: string) =>
    apiClient.post<ApiResponse<null>>('/api/auth/email/verify', { email, code }),
};
