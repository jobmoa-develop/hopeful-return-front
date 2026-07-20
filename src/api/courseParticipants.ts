import { apiClient } from './client';
import type { ApiResponse, PageData } from './courses';

// 상담 슬롯 3분화(V10) — 구 값 PRE/POST 전송 시 400
export type CounselingType = 'PRE_SESSION' | 'POST_SESSION_1' | 'POST_SESSION_2';

export const COUNSELING_TYPE_LABELS: Record<CounselingType, string> = {
  PRE_SESSION: '사전상담',
  POST_SESSION_1: '사후상담 1차',
  POST_SESSION_2: '사후상담 2차',
};

// 진행상태 enum (BE CourseParticipantStatus와 동일)
export type CourseParticipantStatus =
  'APPLIED' | 'CONFIRMED' | 'CANCELED' | 'COMPLETED' | 'INCOMPLETE';

export const CP_STATUS_LABELS: Record<CourseParticipantStatus, string> = {
  APPLIED: '접수',
  CONFIRMED: '선정',
  CANCELED: '취소',
  COMPLETED: '수료',
  INCOMPLETE: '미수료',
};

// 진행상태 → 칩 색상 클래스
export const CP_STATUS_CHIP: Record<CourseParticipantStatus, string> = {
  APPLIED: 'neutral',
  CONFIRMED: 'info',
  CANCELED: 'neutral',
  COMPLETED: 'ok',
  INCOMPLETE: 'danger',
};

// 상담사 배정 요약 (CounselorSummary와 동일)
export type CounselorSummary = {
  counselorId: number;
  counselorName: string | null;
  status: CounselingType | string;
  startedAt: string | null; // LocalDateTime "YYYY-MM-DDTHH:mm:ss"
  endedAt: string | null;
  memo: string | null;
  completed: boolean;
};

// 상담사 배정 요청 항목 (전체 교체 방식)
export type CounselorAssignment = {
  counselorId: number;
  status: CounselingType;
};

// GET /api/course-participants/{id} 응답 (CourseParticipantDetailResponse와 동일)
export type CourseParticipantDetail = {
  courseParticipantId: number;
  participantId: number;
  participantName: string;
  matchKey: string | null;
  birthYear: number | null;
  phone: string | null;
  courseId: number | null;
  courseName: string | null;
  regionName: string | null;
  courseNumber: number | null;
  localCourseNumber: number | null;
  counselors: CounselorSummary[];
  status: CourseParticipantStatus | string;
  contactAttempt: number | null;
  inflowType: string | null;
  applyDate: string | null; // "YYYY-MM-DD"
  receptionDate: string | null;
  completionDate: string | null;
  basicEducation: string | null;
};

export type RecordCounselingSessionRequest = {
  startedAt?: string | null; // null이면 기존값 유지, endedAt 입력 시 완료
  endedAt?: string | null;
  memo?: string | null;
};

export type CounselingSessionResponse = {
  courseParticipantId: number;
  counselingType: CounselingType | string;
  counselorId: number;
  counselorName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  memo: string | null;
  completed: boolean;
};

// 기존 참여자를 특정 강좌에 배정(수강 등록) — swagger POST /api/course-participants
// 권한: ADMIN, HEAD_OFFICE, REGIONAL_MANAGER, PROJECT_MANAGER, PROJECT_LEADER
export type EnrollParticipantRequest = {
  courseId: number;
  participantId: number;
  counselors?: CounselorAssignment[];
  inflowType?: string;
  applyDate?: string;
  receptionDate?: string;
  basicEducation?: string;
};

// 권한: HEAD_OFFICE, REGIONAL_MANAGER, OPERATOR, COUNSELOR, STAFF
export function getCourseParticipant(courseParticipantId: number) {
  return apiClient.get<ApiResponse<CourseParticipantDetail>>(
    `/api/course-participants/${courseParticipantId}`,
  );
}

// 진행상태 변경 — 권한: HEAD_OFFICE, REGIONAL_MANAGER, OPERATOR (backend#49)
export function changeCourseParticipantStatus(courseParticipantId: number, status: string) {
  return apiClient.patch<ApiResponse<{ courseParticipantId: number; status: string }>>(
    `/api/course-participants/${courseParticipantId}/status`,
    { status },
  );
}

// 상담사 3슬롯 전체 교체 — 같은 슬롯 중복 시 400 COUNSELING_SLOT_DUPLICATED
export function changeCounselors(courseParticipantId: number, counselors: CounselorAssignment[]) {
  return apiClient.patch<
    ApiResponse<{ courseParticipantId: number; counselors: CounselorSummary[] }>
  >(`/api/course-participants/${courseParticipantId}/counselor`, { counselors });
}

// 상담 세션(일시·메모) 기록 — endedAt 입력 시 해당 상담 완료 처리
export function recordCounselingSession(
  courseParticipantId: number,
  counselingType: CounselingType,
  payload: RecordCounselingSessionRequest,
) {
  return apiClient.patch<ApiResponse<CounselingSessionResponse>>(
    `/api/course-participants/${courseParticipantId}/counselors/${counselingType}`,
    payload,
  );
}

// 수강 취소 — status=CANCELED, 사유는 incompleteReason에 기록
export function cancelCourseParticipant(courseParticipantId: number, reason?: string) {
  return apiClient.post<ApiResponse<{ status: string }>>(
    `/api/course-participants/${courseParticipantId}/cancel`,
    { reason },
  );
}

// 수료 처리 — status = COMPLETED | INCOMPLETE
export function completeCourseParticipant(
  courseParticipantId: number,
  payload: {
    status: 'COMPLETED' | 'INCOMPLETE';
    completionDate?: string;
    incompleteReason?: string;
  },
) {
  return apiClient.patch<ApiResponse<{ courseParticipantId: number; status: string }>>(
    `/api/course-participants/${courseParticipantId}/completion`,
    payload,
  );
}

// 연락 시도 횟수 증가
export function increaseContactAttempt(courseParticipantId: number) {
  return apiClient.patch<ApiResponse<{ courseParticipantId: number; contactAttempt: number }>>(
    `/api/course-participants/${courseParticipantId}/contact-attempt`,
  );
}

export function enrollParticipant(payload: EnrollParticipantRequest) {
  return apiClient.post<ApiResponse<{ courseParticipantId: number; status: string }>>(
    '/api/course-participants',
    payload,
  );
}

// ── 상담 관리(course-participants 목록) · 일괄 처리 · 상담사 지정 ──────────────

// GET /api/course-participants 목록 항목 (BE CourseParticipantListResponse.Item)
export type CourseParticipantListItem = {
  courseParticipantId: number;
  participantName: string | null;
  matchKey: string | null;
  phone: string | null;
  regionName: string | null;
  courseName: string | null;
  courseNumber: number | null;
  localCourseNumber: number | null;
  status: CourseParticipantStatus | string | null;
  counselors: CounselorSummary[];
};

export type CourseParticipantListParams = {
  courseId?: number;
  regionId?: number;
  courseNumber?: number;
  status?: string;
  keyword?: string;
  page?: number;
  size?: number;
};

// 수강생 목록 조회 — COUNSELOR는 본인 배정건만(서버측 스코프), 지역/회차/상태/검색어 필터
export function getCourseParticipants(params: CourseParticipantListParams) {
  return apiClient.get<ApiResponse<PageData<CourseParticipantListItem>>>(
    '/api/course-participants',
    {
      params,
    },
  );
}

// 일괄 수료/미수료 처리 — 선택 수강건에 동일 상태·수료일·미수료 사유 적용
export function bulkCompleteCourseParticipants(payload: {
  courseParticipantIds: number[];
  status: 'COMPLETED' | 'INCOMPLETE';
  completionDate?: string; // "YYYY-MM-DD"
  incompleteReason?: string;
}) {
  return apiClient.patch<ApiResponse<{ updatedCount: number; updatedIds: number[] }>>(
    '/api/course-participants/completion/bulk',
    payload,
  );
}

export type AssignableCounselor = { counselorId: number; name: string | null };

// 배정 가능 상담사 조회 — 해당 수강건 회차에 인력 배치된 상담사
export function getAssignableCounselors(courseParticipantId: number) {
  return apiClient.get<ApiResponse<{ counselors: AssignableCounselor[] }>>(
    `/api/course-participants/${courseParticipantId}/assignable-counselors`,
  );
}

// 단일 슬롯 상담사 지정 — COUNSELOR는 본인 배정건만, 대상은 회차 배치 상담사만(BE 검증)
export function assignSlotCounselor(
  courseParticipantId: number,
  counselingType: CounselingType,
  payload: { counselorId: number },
) {
  return apiClient.patch<
    ApiResponse<{ courseParticipantId: number; counselors: CounselorSummary[] }>
  >(
    `/api/course-participants/${courseParticipantId}/counselors/${counselingType}/counselor`,
    payload,
  );
}
