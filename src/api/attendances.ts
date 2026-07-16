import { apiClient } from './client';
import type { ApiResponse, PageData } from './courses';

// BE AttendanceStatus enum과 동일
export type AttendanceStatus = 'ATTEND' | 'LATE' | 'ABSENT';

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  ATTEND: '출석',
  LATE: '지각',
  ABSENT: '결석',
};

// 출석 항목의 조퇴·외출 기록 (backend#50 확장)
export type AttendanceLeaveItem = {
  attendanceLeaveId: number;
  leaveTime: string | null; // "HH:mm:ss"
  returnTime: string | null;
  reason: string | null;
};

export type AttendanceListItem = {
  attendanceId: number;
  courseParticipantId: number | null;
  participantName: string | null;
  dayNo: number | null;
  checkInTime: string | null; // "HH:mm:ss"
  checkOutTime: string | null;
  status: AttendanceStatus | string | null;
  leaves: AttendanceLeaveItem[];
};

export type AttendanceListParams = {
  courseId?: number;
  courseParticipantId?: number;
  dayNo?: number;
  status?: string;
  page?: number;
  size?: number;
};

export function getAttendances(params: AttendanceListParams) {
  return apiClient.get<ApiResponse<PageData<AttendanceListItem>>>('/api/attendances', { params });
}

export function getAttendance(attendanceId: number) {
  return apiClient.get<ApiResponse<AttendanceListItem>>(`/api/attendances/${attendanceId}`);
}

export type CreateAttendanceRequest = {
  courseParticipantId: number;
  dayNo: number;
  checkInTime?: string;
  checkOutTime?: string;
};

export function createAttendance(payload: CreateAttendanceRequest) {
  return apiClient.post<ApiResponse<AttendanceListItem>>('/api/attendances', payload);
}

export type UpdateAttendanceRequest = {
  checkInTime?: string;
  checkOutTime?: string;
};

export function updateAttendance(attendanceId: number, payload: UpdateAttendanceRequest) {
  return apiClient.put<ApiResponse<{ attendanceId: number; status: string; updatedAt: string }>>(
    `/api/attendances/${attendanceId}`,
    payload
  );
}

export function deleteAttendance(attendanceId: number) {
  return apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/api/attendances/${attendanceId}`);
}

export type CreateAttendanceLeaveRequest = {
  attendanceId: number;
  leaveTime?: string;
  returnTime?: string;
  reason?: string;
};

export function createAttendanceLeave(payload: CreateAttendanceLeaveRequest) {
  return apiClient.post<ApiResponse<AttendanceLeaveItem>>('/api/attendance-leaves', payload);
}

export type UpdateAttendanceLeaveRequest = {
  leaveTime?: string;
  returnTime?: string;
  reason?: string;
};

export function updateAttendanceLeave(attendanceLeaveId: number, payload: UpdateAttendanceLeaveRequest) {
  return apiClient.put<ApiResponse<{ attendanceLeaveId: number; updatedAt: string }>>(
    `/api/attendance-leaves/${attendanceLeaveId}`,
    payload
  );
}

export function deleteAttendanceLeave(attendanceLeaveId: number) {
  return apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/api/attendance-leaves/${attendanceLeaveId}`);
}

export type RiskStatus = 'PASS' | 'SAFE' | 'WARNING' | 'DANGER' | 'FAIL' | 'UNKNOWN';

export type CompletionRiskItem = {
  courseParticipantId: number;
  participantName: string;
  attendedMinutes: number;
  requiredMinutes: number;
  attendanceRate: number;
  riskStatus: RiskStatus;
};

export type CompletionRiskResponse = {
  items: CompletionRiskItem[];
};

export function getCompletionRisk(courseId: number) {
  return apiClient.get<ApiResponse<CompletionRiskResponse>>(`/api/attendances/courses/${courseId}/completion-risk`);
}
