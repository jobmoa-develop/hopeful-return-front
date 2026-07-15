import axios from 'axios';

// 백엔드 공통 봉투의 error 메시지를 우선 사용하고, 없으면 일반 메시지로 대체
export function apiErrorMessage(
  err: unknown,
  fallback = '요청 처리 중 오류가 발생했습니다.',
): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.response?.status === 403) return '권한이 없습니다.';
  }
  return fallback;
}
