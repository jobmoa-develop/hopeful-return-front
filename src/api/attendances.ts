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
