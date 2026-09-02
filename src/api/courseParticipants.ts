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
// COURSE_CANCELED(폐강)은 회차가 폐강될 때 BE가 자동으로 세팅한다(수동 변경 대상 아님).
export type CourseParticipantStatus =
  'APPLIED' | 'CONFIRMED' | 'CANCELED' | 'COMPLETED' | 'INCOMPLETE' | 'COURSE_CANCELED';

export const CP_STATUS_LABELS: Record<CourseParticipantStatus, string> = {
  APPLIED: '접수',
  CONFIRMED: '선정',
  CANCELED: '취소',
  COMPLETED: '수료',
  INCOMPLETE: '미수료',
  COURSE_CANCELED: '폐강',
};

// 진행상태 → 칩 색상 클래스
export const CP_STATUS_CHIP: Record<CourseParticipantStatus, string> = {
  APPLIED: 'neutral',
  CONFIRMED: 'info',
  CANCELED: 'neutral',
  COMPLETED: 'ok',
  INCOMPLETE: 'danger',
  COURSE_CANCELED: 'danger',
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

// 변경 주체 — NONE(빈칸) / COUNSELOR(상담사) / PARTICIPANT(참여자)
export type ChangeSubject = 'NONE' | 'COUNSELOR' | 'PARTICIPANT';

export const CHANGE_SUBJECT_LABELS: Record<ChangeSubject, string> = {
  NONE: '',
  COUNSELOR: '상담사',
  PARTICIPANT: '참여자',
};

// 상담사/일정 변경 시 필수인 변경 주체·비고
export type ChangeMeta = {
  changedBy: ChangeSubject;
  reason: string;
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
  changedBy: ChangeSubject; // 필수
  reason: string; // 필수
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

// 수강 정보 부분 수정 — null/미포함 필드는 미변경. 운영 필드(신청일·접수일·연락시도) 포함
// 권한: ADMIN, HEAD_OFFICE, REGIONAL_MANAGER, PROJECT_MANAGER, PROJECT_LEADER, OPERATOR
export type UpdateCourseParticipantRequest = {
  counselors?: CounselorAssignment[];
  basicEducation?: string | null;
  inflowType?: string | null;
  applyDate?: string | null; // "YYYY-MM-DD"
  receptionDate?: string | null;
  contactAttempt?: number | null;
};

export function updateCourseParticipant(
  courseParticipantId: number,
  payload: UpdateCourseParticipantRequest,
) {
  return apiClient.put<ApiResponse<{ updated: boolean }>>(
    `/api/course-participants/${courseParticipantId}`,
    payload,
  );
}

// 상담사 3슬롯 전체 교체 — 같은 슬롯 중복 시 400 COUNSELING_SLOT_DUPLICATED
// 변경 주체·비고는 필수(변경 이력 저장용)
export function changeCounselors(
  courseParticipantId: number,
  counselors: CounselorAssignment[],
  meta: ChangeMeta,
) {
  return apiClient.patch<
    ApiResponse<{ courseParticipantId: number; counselors: CounselorSummary[] }>
  >(`/api/course-participants/${courseParticipantId}/counselor`, { counselors, ...meta });
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

// 회차 등록 취소(수강건 삭제) — 해당 회차 등록만 제거하고 참여자 원본은 유지. 권한: ADMIN, OPERATOR
export function deleteCourseParticipant(courseParticipantId: number) {
  return apiClient.delete<ApiResponse<{ deleted: boolean }>>(
    `/api/course-participants/${courseParticipantId}`,
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
  regionId?: number; // 하위 지역
  parentRegionId?: number; // 상위 지역(서울 등) — 산하 하위 지역 전체 포함 조회
  courseNumber?: number; // 전체회차(기수) — 전체 지역 조회 시 사용
  localCourseNumber?: number; // 지역회차 — 지역 선택 조회 시 사용
  status?: string;
  keyword?: string;
  sortBy?: string; // 정렬 키(participantName/phone/status/region/courseNumber/localCourseNumber/registerDate)
  sortOrder?: 'asc' | 'desc'; // 정렬 방향(기본 asc)
  page?: number;
  size?: number;
  excludeCanceledCourse?: boolean; // 폐강(course.status=CANCELED) 회차 참여자 제외 — 상담관리에서 true
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

// 상담 슬롯 상담사 일괄 배정 — 선택 수강건들에 동일 슬롯·상담사 지정(관리 롤 전용)
// 대상 상담사는 각 수강건 회차 배치 상담사여야 함(BE 검증, 불일치 시 전체 롤백)
export function bulkAssignCounselors(payload: {
  courseParticipantIds: number[];
  counselingType: CounselingType;
  counselorId: number;
}) {
  return apiClient.patch<ApiResponse<{ updatedCount: number; updatedIds: number[] }>>(
    '/api/course-participants/counselors/bulk',
    payload,
  );
}

// ── 참여자 XLSX 일괄 등록 (bulk import) ──────────────────────────────────

// 미리보기 파싱 행 (BE BulkImportParsedRow)
export type BulkImportParsedRow = {
  rowNumber: number;
  sourceCourseName: string | null;
  sido: string | null;
  sigungu: string | null;
  name: string | null;
  phone: string | null;
  birthYear: number | null;
  applyDate: string | null;
  receptionDate: string | null; // 선정일시
  selected: string | null; // 선정여부 원문(선정/미선정/공란)
  status: string; // 선정→CONFIRMED, 미선정→CANCELED, 그 외→APPLIED
  error: string | null;
};

// 교육과정명별 그룹 (BE BulkImportCourseGroup)
export type BulkImportCourseGroup = {
  sourceCourseName: string;
  sido: string | null;
  sigungu: string | null;
  roundNumber: number | null;
  participantCount: number;
  invalidCount: number;
  suggestedCourseId: number | null;
  rows: BulkImportParsedRow[];
};

// 미리보기 응답 (BE BulkImportPreviewResponse)
export type BulkImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  groups: BulkImportCourseGroup[];
};

// 커밋 요청 행 (BE BulkImportCommitRequest.Item) — 미리보기 후 편집된 행. targetCourseId=null 이면 건너뛰기
export type BulkImportCommitItem = {
  rowNumber: number;
  sourceCourseName: string | null;
  targetCourseId: number | null;
  name: string | null;
  phone: string | null;
  birthYear: number | null;
  applyDate: string | null;
  receptionDate: string | null;
  status: string;
};

// 커밋 리포트 행 (BE BulkImportRowResult)
export type BulkImportRowResult = {
  rowNumber: number;
  name: string | null;
  sourceCourseName: string | null;
  outcome: 'SKIPPED_UNMAPPED' | 'SKIPPED_DUPLICATE' | 'INVALID' | string;
  reason: string | null;
};

// 커밋 결과 (BE BulkImportResultResponse)
export type BulkImportResult = {
  registeredCount: number;
  skippedDuplicateCount: number;
  skippedUnmappedCount: number;
  invalidRowCount: number;
  createdParticipantCount: number;
  reusedParticipantCount: number;
  details: BulkImportRowResult[];
};

// 일괄 등록 미리보기 — XLSX 업로드 후 교육과정명별 그룹 반환(DB 쓰기 없음)
// 권한: ADMIN, HEAD_OFFICE, REGIONAL_MANAGER, PROJECT_MANAGER, PROJECT_LEADER
export function previewBulkImport(file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiClient.post<ApiResponse<BulkImportPreview>>(
    '/api/course-participants/bulk-import/preview',
    form,
    // Content-Type 을 제거해 브라우저가 multipart 경계(boundary)를 자동 설정하게 한다.
    { headers: { 'Content-Type': undefined } },
  );
}

// 일괄 등록 커밋 — 미리보기 후 확인·수정한 행 목록(대상 회차 포함)을 JSON 으로 전송
export function commitBulkImport(items: BulkImportCommitItem[]) {
  return apiClient.post<ApiResponse<BulkImportResult>>(
    '/api/course-participants/bulk-import/commit',
    { items },
  );
}

export type AssignableCounselor = { counselorId: number; name: string | null };

// 배정 가능 상담사 조회 — 해당 수강건 회차에 인력 배치된 상담사
export function getAssignableCounselors(courseParticipantId: number) {
  return apiClient.get<ApiResponse<{ counselors: AssignableCounselor[] }>>(
    `/api/course-participants/${courseParticipantId}/assignable-counselors`,
  );
}

// 단일 슬롯 상담사 지정 — COUNSELOR는 회차 배치 상담사면 사전상담사도 지정 가능(권한 개편),
// 대상은 회차 배치 상담사만(BE 검증). 변경 주체·비고는 필수(변경 이력 저장용)
export function assignSlotCounselor(
  courseParticipantId: number,
  counselingType: CounselingType,
  payload: { counselorId: number } & ChangeMeta,
) {
  return apiClient.patch<
    ApiResponse<{ courseParticipantId: number; counselors: CounselorSummary[] }>
  >(
    `/api/course-participants/${courseParticipantId}/counselors/${counselingType}/counselor`,
    payload,
  );
}

// 상담사/일정 변경 이력 항목 (BE CounselorChangeHistoryResponse.Item과 동일)
export type CounselorChangeHistoryItem = {
  historyId: number;
  courseParticipantId: number;
  courseNumber: number | null;
  regionId: number | null;
  counselingType: CounselingType | string | null;
  changeType: 'COUNSELOR_CHANGE' | 'SCHEDULE_CHANGE' | string;
  oldCounselorId: number | null;
  oldCounselorName: string | null;
  newCounselorId: number | null;
  newCounselorName: string | null;
  changedDate: string | null;
  oldStartedAt: string | null;
  newStartedAt: string | null;
  oldEndedAt: string | null;
  newEndedAt: string | null;
  changedBy: ChangeSubject | string;
  reason: string | null;
  accountUserId: number | null;
  accountUserName: string | null;
  createdAt: string | null;
};

// 상담사/일정 변경 이력 조회 (최신순)
export function getCounselorHistory(courseParticipantId: number) {
  return apiClient.get<ApiResponse<{ histories: CounselorChangeHistoryItem[] }>>(
    `/api/course-participants/${courseParticipantId}/counselor-history`,
  );
}
