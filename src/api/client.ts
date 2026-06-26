import axios from 'axios';
import { tokenStore } from '../auth/token';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3434';

export const apiClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

// 요청 인터셉터: access token 자동 첨부 (인증 도메인 확정 시 활용)
apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터: 401 시 토큰 정리 (리다이렉트는 인증 화면 도입 후 추가)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      tokenStore.clear();
    }
    return Promise.reject(error);
  },
);
