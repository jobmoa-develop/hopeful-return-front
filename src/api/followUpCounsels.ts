import { apiClient } from './client';
import type { ApiResponse } from './courses';

// ── 사후관리 상담 로그(follow_up_counsel) — BE V11 실 API 연동 ───────────
// BE 목록은 { content: [...] } 봉투이므로 getCounsels 에서 flat 배열로 리맵한다.

// counsel_status CHECK 제약: 유선/문자/오프라인
export type CounselStatus = 'landline' | 'text' | 'offline';
export const COUNSEL_STATUS_LABELS: Record<CounselStatus, string> = {
  landline: '유선',
  text: '문자',
  offline: '오프라인',
};
export const COUNSEL_STATUSES: CounselStatus[] = ['landline', 'text', 'offline'];

export type FollowUpCounsel = {
  followUpCounselId: number;
  courseParticipantId: number;
  counselNumber: number | null;
  counselDate: string | null; // "YYYY-MM-DD"
  counselStatus: CounselStatus | null;
  counselMemo: string | null;
};

export type CreateCounselRequest = {
  courseParticipantId: number;
  counselNumber?: number | null;
  counselDate?: string | null;
  counselStatus?: CounselStatus | null;
  counselMemo?: string | null;
};

export type UpdateCounselRequest = {
  counselDate?: string | null;
  counselStatus?: CounselStatus | null;
  counselMemo?: string | null;
};

// GET /api/follow-up-counsels?courseParticipantId= — 상담 로그(회차 오름차순)
// BE는 { content: Item[] } 를 반환 → 화면(res.data.data)이 배열을 받도록 flat 리맵한다.
export async function getCounsels(courseParticipantId: number) {
  const res = await apiClient.get<ApiResponse<{ content: FollowUpCounsel[] }>>(
    '/api/follow-up-counsels',
    { params: { courseParticipantId } },
  );
  const data: ApiResponse<FollowUpCounsel[]> = {
    success: true,
    data: res.data.data?.content ?? [],
  };
  return { data };
}

// POST /api/follow-up-counsels — 상담 등록
export function createCounsel(payload: CreateCounselRequest) {
  return apiClient.post<
    ApiResponse<{
      followUpCounselId: number;
      courseParticipantId: number;
      counselNumber: number | null;
      createdAt: string;
    }>
  >('/api/follow-up-counsels', payload);
}

// PUT /api/follow-up-counsels/{id} — 상담 수정
export function updateCounsel(followUpCounselId: number, payload: UpdateCounselRequest) {
  return apiClient.put<ApiResponse<{ followUpCounselId: number; updatedAt: string }>>(
    `/api/follow-up-counsels/${followUpCounselId}`,
    payload,
  );
}

// DELETE /api/follow-up-counsels/{id} — 상담 삭제
export function deleteCounsel(followUpCounselId: number) {
  return apiClient.delete<ApiResponse<{ message: string }>>(
    `/api/follow-up-counsels/${followUpCounselId}`,
  );
}
