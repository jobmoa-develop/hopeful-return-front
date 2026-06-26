// 백엔드 공통 응답 envelope 와 동일 구조
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface MemberResponse {
  id: number;
  email: string;
  name: string;
}
