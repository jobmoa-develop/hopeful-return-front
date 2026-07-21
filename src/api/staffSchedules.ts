import { apiClient } from './client';
import type { ApiResponse, PageData } from './courses';

export type SessionType = 'AM' | 'PM' | 'FULL';

export type StaffScheduleItem = {
  staffScheduleId: number;
  userId: number;
  userName: string;
  scheduleDate: string; // "YYYY-MM-DD"
  sessionType: SessionType;
  isAvailable: boolean;
  memo: string | null;
  // 목록 조회(StaffScheduleListResponse.Item)에는 없고,
  // 단건 조회/등록/수정(StaffScheduleResponse)에만 존재
  createdAt?: string;
  updatedAt?: string;
};

export type StaffScheduleListParams = {
  userId?: number;
  fromDate?: string;
  toDate?: string;
  sessionType?: SessionType;
  page?: number;
  size?: number;
};

// 권한: ADMIN, OPERATOR, HEAD_OFFICE, REGIONAL_MANAGER (타인 포함 목록/범위 조회)
export function getStaffSchedules(params: StaffScheduleListParams) {
  return apiClient.get<ApiResponse<PageData<StaffScheduleItem>>>('/api/staff-schedules', { params });
}

// 인증 사용자 본인 일정만 반환.
// StaffScheduleController.findMy → StaffScheduleServiceImpl.findMy 확인 결과,
// findAll과 동일하게 StaffScheduleListResponse(페이지네이션 래퍼)를 반환하며,
// 서비스 내부에서 pageSize = 전체 건수로 넣어 항상 한 페이지에 전체를 담아 준다.
export function getMyStaffSchedules(fromDate?: string, toDate?: string) {
  return apiClient.get<ApiResponse<PageData<StaffScheduleItem>>>('/api/staff-schedules/me', {
    params: { fromDate, toDate },
  });
}

// CreateStaffScheduleRequest 와 1:1 매칭
export type CreateStaffScheduleRequest = {
  userId?: number; // 생략 시 본인, 타인 지정은 ADMIN/OPERATOR만 가능
  scheduleDate: string;
  sessionType: SessionType;
  isAvailable?: boolean; // 생략 시 서비스에서 true로 기본 처리
  memo?: string;
};

export function createStaffSchedule(payload: CreateStaffScheduleRequest) {
  return apiClient.post<ApiResponse<StaffScheduleItem>>('/api/staff-schedules', payload);
}

// UpdateStaffScheduleRequest 와 1:1 매칭
// sessionType: 빈 값이면 서비스가 무시(미변경)
// isAvailable: null이면 미변경
// memo: null이 아니면 반영(빈 문자열로 지우는 것도 가능)
export type UpdateStaffScheduleRequest = {
  sessionType?: SessionType;
  isAvailable?: boolean;
  memo?: string;
};

export function updateStaffSchedule(staffScheduleId: number, payload: UpdateStaffScheduleRequest) {
  return apiClient.put<ApiResponse<StaffScheduleItem>>(`/api/staff-schedules/${staffScheduleId}`, payload);
}

export function deleteStaffSchedule(staffScheduleId: number) {
  return apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/api/staff-schedules/${staffScheduleId}`);
}

// BulkStaffScheduleRequest 와 1:1 매칭
// entries 안에는 userId/staffRole 없음 — 대상은 요청 최상위 userId 하나(선택한 스태프 1명)뿐
export type BulkStaffScheduleEntry = {
  scheduleDate: string;
  sessionType: SessionType;
  isAvailable?: boolean; // 생략 시 서비스에서 true로 기본 처리
  memo?: string;
};

export type BulkCreateStaffScheduleRequest = {
  userId?: number; // 생략 시 본인, 타인 지정은 ADMIN·OPERATOR만 가능
  entries: BulkStaffScheduleEntry[];
};

// BulkStaffScheduleResponse 와 1:1 매칭
export type BulkCreateStaffScheduleResult = {
  registered: number;
  skipped: number;
  message: string;
};

export function createStaffSchedulesBulk(payload: BulkCreateStaffScheduleRequest) {
  return apiClient.post<ApiResponse<BulkCreateStaffScheduleResult>>('/api/staff-schedules/bulk', payload);
}

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  AM: '오전',
  PM: '오후',
  FULL: '종일',
};