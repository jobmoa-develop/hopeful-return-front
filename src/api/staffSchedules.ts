import { apiClient } from './client';
import type { ApiResponse, PageData } from './courses';

// 스태프 가용 일정 항목 (GET /api/staff-schedules)
export type StaffScheduleItem = {
  staffScheduleId: number;
  userId: number;
  userName?: string;
  scheduleDate: string; // ISO yyyy-MM-dd
  sessionType: string; // AM | PM | FULL
  isAvailable: boolean;
  memo?: string;
};

export type StaffScheduleListParams = {
  userId?: number;
  fromDate?: string;
  toDate?: string;
  sessionType?: string;
  page?: number;
  size?: number;
};

// 스태프 일정 목록/범위 조회 — 회차 배정 시 가용/불가 확인용
// 권한: ADMIN, OPERATOR, HEAD_OFFICE, REGIONAL_MANAGER
export function getStaffSchedules(params: StaffScheduleListParams) {
  return apiClient.get<ApiResponse<PageData<StaffScheduleItem>>>('/api/staff-schedules', { params });
}
