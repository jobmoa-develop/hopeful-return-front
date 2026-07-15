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

// 전화번호 중복 확인
export function checkPhone(phone: string) {
  return apiClient.get<ApiResponse<{ exists: boolean }>>('/api/participants/check-phone', {
    params: { phone },
  });
}
