// 토큰 및 로그인 사용자 저장/조회 유틸 (localStorage 기반)
const ACCESS_KEY = 'hr.accessToken';
const REFRESH_KEY = 'hr.refreshToken';
const USER_KEY = 'hr.user';

export type AuthUser = {
  userId: number;
  loginId: string;
  name: string;
  roles: string[];
  // 문자 발송 권한(계정 단위 플래그). 로그인 응답 user.canSendSms 로 내려온다.
  canSendSms?: boolean;
};

export const tokenStore = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_KEY),
  getRefreshToken: (): string | null => {
    localStorage.removeItem(REFRESH_KEY);
    return null;
  },
  getUser: (): AuthUser | null => {
    const storedUser = localStorage.getItem(USER_KEY);
    if (!storedUser) return null;

    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },
  setAccessToken: (accessToken: string): void => {
    localStorage.setItem(ACCESS_KEY, accessToken);
  },
  setUser: (user: AuthUser): void => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  setTokens: (accessToken: string, _refreshToken: string): void => {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.removeItem(REFRESH_KEY);
  },
  clear: (): void => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isAuthenticated: (): boolean => Boolean(localStorage.getItem(ACCESS_KEY)),
};
