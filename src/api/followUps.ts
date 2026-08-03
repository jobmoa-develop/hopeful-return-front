import { apiClient } from './client';
import type { ApiResponse, PageData } from './courses';

// ── 사후관리(follow_up) — BE V11 실 API 연동 ─────────────────────────────
// 목록: GET /api/follow-ups (수료 참여자 + follow_up 스냅샷 + 상담 요약, 상담사 스코프)
// 스냅샷이 아직 없는 수료자는 followUpId=null 로 내려오며, 저장 시 생성(POST)한다.

// national_program_branch CHECK 제약(14개 지점)과 동일
export const NATIONAL_PROGRAM_BRANCHES = [
  '남부',
  '서부',
  '부천',
  '수원',
  '인천서부',
  '의정부',
  '인천남부',
  '동대문',
  '광명',
  '안양',
  '북부',
  '성남',
  '천호',
  '관악',
] as const;
export type NationalProgramBranch = (typeof NATIONAL_PROGRAM_BRANCHES)[number];

// 목록 항목 — follow_up 스냅샷 + 참여자/회차 표시정보 + 상담 요약
export type FollowUpListItem = {
  followUpId: number | null; // 스냅샷 미존재 시 null
  courseParticipantId: number;
  name: string;
  matchKey: string | null;
  regionName: string | null;
  localCourseNumber: number | null;
  completionDate: string | null; // "YYYY-MM-DD"
  employmentDate: string | null;
  forestProgramDate: string | null;
  nationalProgramDate: string | null;
  nationalProgramBranch: string | null;
  counselCount: number;
  lastCounselDate: string | null;
};

// 상세(follow_up 스냅샷) — 상담 로그는 followUpCounsels 모듈에서 별도 조회
export type FollowUpDetail = {
  followUpId: number;
  courseParticipantId: number;
  employmentDate: string | null;
  forestProgramDate: string | null;
  nationalProgramDate: string | null;
  nationalProgramBranch: string | null;
};

export type FollowUpListParams = {
  name?: string;
  regionId?: number;
  courseNumber?: number; // localCourseNumber 기준
  page?: number;
  size?: number;
};

export type CreateFollowUpRequest = {
  courseParticipantId: number;
  employmentDate?: string | null;
  forestProgramDate?: string | null;
  nationalProgramDate?: string | null;
  nationalProgramBranch?: string | null;
};

export type UpdateFollowUpRequest = {
  employmentDate?: string | null;
  forestProgramDate?: string | null;
  nationalProgramDate?: string | null;
  nationalProgramBranch?: string | null;
};

// GET /api/follow-ups — 사후관리 목록(수료 참여자 기준, 상담사 스코프)
export function getFollowUpList(params: FollowUpListParams) {
  return apiClient.get<ApiResponse<PageData<FollowUpListItem>>>('/api/follow-ups', { params });
}

// GET /api/follow-ups/{followUpId} — 사후관리 상세
export function getFollowUpDetail(followUpId: number) {
  return apiClient.get<ApiResponse<FollowUpDetail>>(`/api/follow-ups/${followUpId}`);
}

// POST /api/follow-ups — 사후관리 스냅샷 신규 등록(스냅샷 없던 수료자 저장 시)
export function createFollowUp(payload: CreateFollowUpRequest) {
  return apiClient.post<
    ApiResponse<{ followUpId: number; courseParticipantId: number; createdAt: string }>
  >('/api/follow-ups', payload);
}

// PUT /api/follow-ups/{followUpId} — 사후관리 기본정보 수정
export function updateFollowUp(followUpId: number, payload: UpdateFollowUpRequest) {
  return apiClient.put<ApiResponse<{ followUpId: number; updatedAt: string }>>(
    `/api/follow-ups/${followUpId}`,
    payload,
  );
}

// ── 사후관리 집계(대시보드) ──────────────────────────────────────────────
export type FollowUpStatsResponse = {
  totalCompleted: number;
  employedCount: number;
  forestVisitCount: number;
  nationalProgramCount: number;
  employmentRate: number;
  forestVisitRate: number;
  nationalProgramRate: number;
};

export type FollowUpStatsParams = {
  regionId?: number;
  courseNumber?: number; // 주의: course.courseNumber(교육과정 전체 회차) 기준 — localCourseNumber 아님
};

// GET /api/follow-ups/stats — 취업률/숲체험 방문률/국취연계률 집계 (regionId/courseNumber 미지정 시 전체)
export function getFollowUpStats(params?: FollowUpStatsParams) {
  return apiClient.get<ApiResponse<FollowUpStatsResponse>>('/api/follow-ups/stats', { params });
}
