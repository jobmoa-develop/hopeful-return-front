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

// 수료 위험도 표시용 라벨/칩 색상 — BE 계산값(riskStatus)을 그대로 표시(프론트 재계산 없음)
export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  PASS: '수료 완료',
  SAFE: '수료 가능',
  WARNING: '주의',
  DANGER: '위험',
  FAIL: '수료 불가',
  UNKNOWN: '미집계',
};

export const RISK_STATUS_CHIP: Record<RiskStatus, string> = {
  PASS: 'ok',
  SAFE: 'ok',
  WARNING: 'warn',
  DANGER: 'danger',
  FAIL: 'danger',
  UNKNOWN: 'neutral',
};

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

// ─── 일차별 출석 일괄 등록 ───
export type BulkAttendanceItem = {
  courseParticipantId: number;
  checkInTime?: string;   // "HH:mm:ss"
  checkOutTime?: string;  // "HH:mm:ss"
};

export type BulkAttendanceRequest = {
  courseId: number;
  dayNo: number;
  attendances: BulkAttendanceItem[];
};

export type BulkAttendanceResponse = {
  savedCount: number;
  dayNo: number;
  courseId: number;
  message: string;
};

export function createAttendanceBulk(payload: BulkAttendanceRequest) {
  return apiClient.post<ApiResponse<BulkAttendanceResponse>>('/api/attendances/bulk', payload);
}