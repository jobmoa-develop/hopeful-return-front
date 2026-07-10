import axios, { AxiosHeaders } from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenStore } from '../auth/token';
import { notifyAccessTokenChanged, notifySessionCleared } from '../auth/sessionEvents';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3434';

type RefreshResponse = {
  success: boolean;
  data: {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
  };
};

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<string> | null = null;

function isAuthRequest(
  config: InternalAxiosRequestConfig | undefined,
  path: string,
): boolean {
  return Boolean(config?.url?.includes(path));
}

function clearSessionAndRedirect(): void {
  tokenStore.clear();
  notifySessionCleared();

  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

function requestNewAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<RefreshResponse>('/api/auth/refresh')
      .then((response) => {
        const nextAccessToken = response.data.data.accessToken;

        tokenStore.setAccessToken(nextAccessToken);
        notifyAccessTokenChanged(nextAccessToken);

        return nextAccessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

apiClient.interceptors.request.use((config) => {
  if (isAuthRequest(config, '/api/auth/refresh')) {
    delete config.headers.Authorization;
    return config;
  }

  const token = tokenStore.getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    if (!originalRequest) {
      clearSessionAndRedirect();
      return Promise.reject(error);
    }

    if (
      originalRequest._retry ||
      isAuthRequest(originalRequest, '/api/auth/login') ||
      isAuthRequest(originalRequest, '/api/auth/refresh')
    ) {
      clearSessionAndRedirect();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const nextAccessToken = await requestNewAccessToken();

      originalRequest.headers =
        originalRequest.headers ?? new AxiosHeaders();

      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;

      return apiClient(originalRequest);
    } catch (refreshError) {
      clearSessionAndRedirect();
      return Promise.reject(refreshError);
    }
  },
);