import { apiClient } from './client';
import type { ApiResponse } from './courses';

// 회차 배정 역할(StaffRole) — BE enum 과 동일
export type StaffRoleValue =
  | 'LECTURER'
  | 'COUNSELOR'
  | 'STAFF'
  | 'PROJECT_MANAGER'
  | 'PROJECT_LEADER'
  | 'ADMIN_STAFF';

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
};

// GET /api/course-daily-staffs/candidates?courseId — 역할별·날짜별 가용 후보 직원
export type CandidateAvailability = {
  scheduleDate: string;
  sessionType: SessionTypeValue;
};

export type StaffCandidate = {
  userId: number;
  name: string;
  staffRoles: StaffRoleValue[];
  availability: CandidateAvailability[];
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
