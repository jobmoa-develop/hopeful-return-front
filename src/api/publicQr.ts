import axios from 'axios';
import type { ApiResponse } from './courses';

// 공개 QR 출결 API 전용 클라이언트.
// apiClient(client.ts)는 401 시 자동 리프레시 후 /login 으로 강제 리다이렉트하므로,
// 로그인하지 않은 참여자가 쓰는 공개 페이지에서는 절대 재사용하지 않는다.
// 토큰/쿠키를 쓰지 않으므로 인터셉터도, withCredentials 도 붙이지 않는다.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3434';

const publicClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const QR_BASE = '/api/public/qr/courses';

// ─── 본인확인 입력 (성명 + 전화번호 뒤 4자리) ───
export type QrVerifyRequest = {
  name: string;
  phoneLast4: string; // 정확히 4자리 숫자
};

// ─── 랜딩(비-PII) ───
export type QrLanding = {
  courseId: number;
  courseName: string;
  regionName: string;
  courseNumber: number;
  localCourseNumber: number;
  dayNo: number | null; // 오늘이 강의일이 아니면 null
  educationStartTime: string; // "HH:mm:ss"
  educationEndTime: string;
};

// ─── 조퇴·외출 기록 (leaveTime만=조퇴, leaveTime+returnTime=외출) ───
export type QrLeaveItem = {
  attendanceLeaveId: number;
  leaveTime: string | null; // "HH:mm:ss"
  returnTime: string | null;
  reason: string | null;
};

// ─── 본인확인 후 현재 출결 상태 + 가능한 액션 플래그 ───
export type QrStatus = {
  participantName: string;
  dayNo: number | null;
  checkInTime: string | null; // "HH:mm:ss"
  checkOutTime: string | null;
  status: string | null; // ATTEND / LATE 등
  leaves: QrLeaveItem[];
  canCheckIn: boolean;
  canLeave: boolean;
  canCheckOut: boolean;
};

// ─── 읽기전용 내역 ───
export type QrHistoryDay = {
  dayNo: number;
  date: string; // "yyyy-MM-dd"
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string | null;
  leaves: QrLeaveItem[];
};

export type QrHistory = {
  participantName: string;
  days: QrHistoryDay[];
};

export type QrLeaveRequest = QrVerifyRequest & {
  leaveTime?: string; // "HH:mm:ss" — 미지정 시 서버 현재시각
};

export type QrLeaveReturnRequest = QrVerifyRequest & {
  attendanceLeaveId?: number | null;
  returnTime?: string; // "HH:mm:ss" — 미지정 시 서버 현재시각
};

// 랜딩: 회차/오늘 dayNo/교육시간 (본인확인 불필요)
export function getQrLanding(courseId: number) {
  return publicClient.get<ApiResponse<QrLanding>>(`${QR_BASE}/${courseId}`);
}

export function verifyQr(courseId: number, payload: QrVerifyRequest) {
  return publicClient.post<ApiResponse<QrStatus>>(`${QR_BASE}/${courseId}/verify`, payload);
}

export function qrCheckIn(courseId: number, payload: QrVerifyRequest) {
  return publicClient.post<ApiResponse<QrStatus>>(`${QR_BASE}/${courseId}/check-in`, payload);
}

export function qrLeave(courseId: number, payload: QrLeaveRequest) {
  return publicClient.post<ApiResponse<QrStatus>>(`${QR_BASE}/${courseId}/leave`, payload);
}

export function qrLeaveReturn(courseId: number, payload: QrLeaveReturnRequest) {
  return publicClient.post<ApiResponse<QrStatus>>(`${QR_BASE}/${courseId}/leave/return`, payload);
}

export function qrCheckOut(courseId: number, payload: QrVerifyRequest) {
  return publicClient.post<ApiResponse<QrStatus>>(`${QR_BASE}/${courseId}/check-out`, payload);
}

export function getQrHistory(courseId: number, payload: QrVerifyRequest) {
  return publicClient.post<ApiResponse<QrHistory>>(`${QR_BASE}/${courseId}/history`, payload);
}
