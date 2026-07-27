import { apiClient } from './client';
import type { ApiResponse } from './courses';

// 회차 배정 역할(StaffRole) — BE enum 과 동일
export type StaffRoleValue =
  'LECTURER' | 'COUNSELOR' | 'STAFF' | 'PROJECT_MANAGER' | 'PROJECT_LEADER' | 'ADMIN_STAFF';

export type SessionTypeValue = 'AM' | 'PM' | 'FULL';

// GET /api/course-daily-staffs?courseId — 회차 날짜별 배정 목록
export type CourseDailyStaffItem = {
  courseDailyStaffId: number;
  scheduleDate: string; // ISO yyyy-MM-dd
  staffRole: StaffRoleValue;
  sessionType: SessionTypeValue;
  userId: number;
  name?: string;
};

export type CourseDailyStaffList = {
  courseId: number;
  assignments: CourseDailyStaffItem[];
};

// PUT /api/course-daily-staffs/bulk — 그리드 저장(전량 교체)
export type CourseDailyStaffEntry = {
  scheduleDate: string;
  staffRole: StaffRoleValue;
  sessionType: SessionTypeValue;
  userId: number;
};

export type SaveCourseDailyStaffPayload = {
  courseId: number;
  entries: CourseDailyStaffEntry[];
  // 타 회차 중복 배정을 확인하고 진행할지(기본 false). false + 충돌 시 409 로 충돌 목록 반환.
  confirmConflicts?: boolean;
};

// 저장 시 타 폐강되지 않은 회차와 겹친 충돌 항목(409 ASSIGN_CONFLICT 응답 data)
export type AssignConflict = {
  userId: number;
  name: string;
  scheduleDate: string;
  sessionType: SessionTypeValue;
  courseId: number;
  courseName: string;
  staffRole: StaffRoleValue;
};

// 저장 시 근무 불가일과 겹쳐 거부된 항목(409 ASSIGN_ON_UNAVAILABLE_DATE 응답 data).
// AssignConflict 와 달리 courseName 이 없다(override 없는 하드 블록) → 409 분기 판별자로 사용.
export type AssignUnavailable = {
  userId: number;
  name: string;
  scheduleDate: string;
  sessionType: SessionTypeValue;
};

// GET /api/course-daily-staffs/candidates?courseId — 역할별·날짜별 가용 후보 직원
export type CandidateAvailability = {
  scheduleDate: string;
  sessionType: SessionTypeValue;
};

// 다른 폐강되지 않은 회차에 이미 배정된 슬롯(중복 방지·경고용)
export type CandidateBusy = {
  scheduleDate: string;
  sessionType: SessionTypeValue;
  courseId: number;
  courseName: string;
  staffRole: StaffRoleValue;
};

export type StaffCandidate = {
  userId: number;
  name: string;
  staffRoles: StaffRoleValue[];
  availability: CandidateAvailability[];
  busy?: CandidateBusy[];
};

export type CourseDailyStaffCandidates = {
  courseId: number;
  dates: string[];
  candidates: StaffCandidate[];
};

export function getCourseDailyStaff(courseId: number) {
  return apiClient.get<ApiResponse<CourseDailyStaffList>>('/api/course-daily-staffs', {
    params: { courseId },
  });
}

export function saveCourseDailyStaff(payload: SaveCourseDailyStaffPayload) {
  return apiClient.put<ApiResponse<{ courseId: number; saved: number }>>(
    '/api/course-daily-staffs/bulk',
    payload,
  );
}

export function getCourseDailyStaffCandidates(courseId: number) {
  return apiClient.get<ApiResponse<CourseDailyStaffCandidates>>(
    '/api/course-daily-staffs/candidates',
    { params: { courseId } },
  );
}
