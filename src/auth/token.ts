// 토큰 저장/조회 유틸 (localStorage 기반)
const ACCESS_KEY = 'hr.accessToken';
const REFRESH_KEY = 'hr.refreshToken';

export const tokenStore = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_KEY),
  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_KEY),
  setTokens: (accessToken: string, refreshToken: string): void => {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear: (): void => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  isAuthenticated: (): boolean => Boolean(localStorage.getItem(ACCESS_KEY)),
};
