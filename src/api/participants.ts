import { apiClient } from './client';
import type { ApiResponse, PageData } from './courses';
import type { CounselorAssignment, CounselorSummary } from './courseParticipants';

// 참여자 목록 항목의 최신 수강건 요약 (EnrollmentSummary와 동일)
export type EnrollmentSummary = {
  courseParticipantId: number;
  courseId: number | null;
  courseName: string | null;
  regionName: string | null;
  courseNumber: number | null;
  localCourseNumber: number | null;
  status: string | null;
  completionDate: string | null; // "YYYY-MM-DD"
  counselors: CounselorSummary[];
  preCounselingCompleted: boolean;
  attendedDays: number | null; // 출석+지각 집계
  totalCourseDays: number | null; // day1~day5 중 지정된 날짜 수
};

// GET /api/participants 목록 항목 — matchKey는 표시용 참여자ID
export type ParticipantListItem = {
  participantId: number;
  name: string;
  birthYear: number | null;
  phone: string;
  matchKey: string | null;
  latestEnrollment: EnrollmentSummary | null;
};

export type ParticipantListParams = {
  name?: string;
  phone?: string;
  regionId?: number; // 최신 수강건 기준 회차 필터(하위 지역)
  parentRegionId?: number; // 상위 지역(서울 등) — 산하 하위 지역 전체 포함 조회
  courseNumber?: number; // 전체회차(기수) — 전체 지역 조회 시 사용(최신 수강건 기준)
  localCourseNumber?: number; // 지역회차 — 지역 선택 조회 시 사용(최신 수강건 기준)
  registerDateFrom?: string; // 전산 등록일 시작(YYYY-MM-DD, 포함) — 최신 수강건 created_at 기준
  registerDateTo?: string; // 전산 등록일 종료(YYYY-MM-DD, 포함)
  sortBy?: string; // 정렬 키(name/phone/region/registerDate)
  sortOrder?: 'asc' | 'desc'; // 정렬 방향(기본 asc)
  page?: number;
  size?: number;
};

// 통합 등록 — enrollment가 있으면 수강(CONFIRMED=선정 고정)도 한 트랜잭션으로 생성
export type CreateParticipantRequest = {
  name: string;
  birthYear?: number;
  phone: string;
  enrollment?: {
    courseId: number;
    inflowType?: string;
    applyDate?: string; // "YYYY-MM-DD"
    receptionDate?: string;
    basicEducation?: string;
    counselors?: CounselorAssignment[];
  };
};

export type ParticipantCreatedResponse = {
  participantId: number;
  matchKey: string | null;
  courseParticipantId?: number; // enrollment 없이 등록하면 미포함
};

export function getParticipants(params: ParticipantListParams) {
  return apiClient.get<ApiResponse<PageData<ParticipantListItem>>>('/api/participants', { params });
}

export function createParticipant(payload: CreateParticipantRequest) {
  return apiClient.post<ApiResponse<ParticipantCreatedResponse>>('/api/participants', payload);
}

// 참여자 기본정보 수정 — 이름·전화 필수, 출생연도 선택(matchKey는 서버가 재생성)
// 권한: ADMIN, HEAD_OFFICE, REGIONAL_MANAGER, PROJECT_MANAGER, PROJECT_LEADER, OPERATOR
export type UpdateParticipantRequest = {
  name: string;
  birthYear?: number | null;
  phone: string;
};

export function updateParticipant(participantId: number, payload: UpdateParticipantRequest) {
  return apiClient.put<ApiResponse<{ participantId: number; updated: boolean }>>(
    `/api/participants/${participantId}`,
    payload,
  );
}

// 참여자 완전 삭제 — 권한: ADMIN. 회차 등록 이력이 있으면 서버가 409(PARTICIPANT_HAS_ENROLLMENTS)로 차단.
export function deleteParticipant(participantId: number) {
  return apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/api/participants/${participantId}`);
}

// 전화번호 중복 확인
export function checkPhone(phone: string) {
  return apiClient.get<ApiResponse<{ exists: boolean }>>('/api/participants/check-phone', {
    params: { phone },
  });
}
