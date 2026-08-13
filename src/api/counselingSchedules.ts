import { apiClient } from './client';
import type { ApiResponse } from './courses';
import type { CounselingType } from './courseParticipants';

// GET /api/counseling-schedules 응답 항목 (BE CounselingScheduleResponse.Item과 동일)
export type CounselingScheduleItem = {
  courseParticipantId: number | null;
  courseParticipantCounselorId: number | null;
  date: string | null; // "YYYY-MM-DD" (상담 시작일)
  startedAt: string | null; // "YYYY-MM-DDTHH:mm:ss"
  endedAt: string | null;
  regionName: string | null;
  courseNumber: number | null;
  participantName: string | null;
  counselorId: number | null;
  counselorName: string | null;
  counselingType: CounselingType | string | null;
  completed: boolean;
};

// 상담사 본인 근무 불가일 (BE CounselingScheduleResponse.UnavailabilityItem과 동일)
export type CounselorUnavailabilityItem = {
  counselorId: number | null;
  counselorName: string | null;
  date: string | null; // "YYYY-MM-DD"
  sessionType: 'AM' | 'PM' | 'FULL' | string | null;
  memo: string | null;
};

export type CounselingScheduleParams = {
  from?: string; // "YYYY-MM-DD" 포함
  to?: string; // "YYYY-MM-DD" 포함
  regionId?: number; // 하위 지역(양천) 단일
  parentRegionId?: number; // 상위 지역(서울) 산하 하위 전체
  courseNumber?: number; // 전체회차(기수) — 전체 지역 조회 시 사용
  localCourseNumber?: number; // 지역회차 — 지역 선택 조회 시 사용
  counselorName?: string;
};

// 상담 시작일 기준 상담 일정 조회 (전 회차·전 상담사) — 권한: ADMIN/OPERATOR/COUNSELOR
export function getCounselingSchedules(params: CounselingScheduleParams) {
  return apiClient.get<
    ApiResponse<{
      schedules: CounselingScheduleItem[];
      unavailabilities: CounselorUnavailabilityItem[];
    }>
  >('/api/counseling-schedules', { params });
}
