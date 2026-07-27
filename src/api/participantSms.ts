import { apiClient } from './client';
import type { ApiResponse, PageData } from './courses';

// 발송 형식 — SMS(≤90B) / LMS(≤2000B) / MMS(이미지 포함)
export type MessageFormat = 'SMS' | 'LMS' | 'MMS';

// POST /api/participant-sms 발송 요청(일괄) — SendSmsRequest 와 동일
// - {name} 은 수신자 성명으로 서버가 치환
// - messageFormat 미지정 시 서버가 본문·이미지로 자동 판별(방어적 재확정)
// - images: MMS 첨부(base64, "data:image/..;base64," 접두어 제거, jpg/jpeg, ≤300KB)
export type SendSmsRequest = {
  courseParticipantIds: number[];
  title?: string;
  content: string;
  messageFormat?: MessageFormat;
  images?: string[];
};

// SendSmsResponse 와 동일
export type SendSmsResult = {
  messageFormat: MessageFormat | string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  statusName: string;
  smsIds: number[];
};

// ParticipantSmsListResponse.Item 과 동일
export type ParticipantSmsHistoryItem = {
  smsId: number;
  messageFormat: MessageFormat | string;
  title: string | null;
  content: string;
  sendStatus: string;
  sentAt: string | null;
  senderName: string | null;
  imageUrls: string[];
};

// 문자 발송(일괄) — 권한: 문자 발송 권한(SMS_SEND)
export function sendParticipantSms(payload: SendSmsRequest) {
  return apiClient.post<ApiResponse<SendSmsResult>>('/api/participant-sms', payload);
}

// 수강생별 발송 이력(최신순)
export function getParticipantSmsHistory(courseParticipantId: number) {
  return apiClient.get<ApiResponse<{ content: ParticipantSmsHistoryItem[] }>>('/api/participant-sms', {
    params: { courseParticipantId },
  });
}

// GET /api/participant-sms/history 항목 (ParticipantSmsPageResponse.Item 과 동일)
export type SmsHistoryPageItem = {
  smsId: number;
  courseParticipantId: number | null;
  participantName: string | null;
  phone: string | null;
  regionName: string | null;
  courseName: string | null;
  courseNumber: number | null;
  messageFormat: MessageFormat | string;
  title: string | null;
  content: string;
  sendStatus: string;
  sentAt: string | null;
  senderName: string | null;
};

export type SmsHistoryParams = {
  keyword?: string;
  sendStatus?: string;
  courseNumber?: number;
  regionId?: number;
  sentDateFrom?: string; // YYYY-MM-DD(포함)
  sentDateTo?: string; // YYYY-MM-DD(포함)
  page?: number;
  size?: number;
};

// 전역 발송내역 조회(페이지·필터) — 역할 스코프는 서버에서 강제(ADMIN/HEAD_OFFICE 전체, 그 외 본인).
export function getSmsHistoryPage(params: SmsHistoryParams) {
  return apiClient.get<ApiResponse<PageData<SmsHistoryPageItem>>>('/api/participant-sms/history', {
    params,
  });
}

// GET /api/participant-sms/{smsId} (ParticipantSmsDetailResponse 와 동일) — 상세 팝오버용
export type ParticipantSmsDetailItem = {
  smsId: number;
  courseParticipantId: number | null;
  messageFormat: MessageFormat | string;
  title: string | null;
  content: string;
  sendStatus: string;
  sentBy: number | null;
  senderName: string | null;
  sentAt: string | null;
  createdAt: string | null;
  imageUrls: string[];
};

export function getParticipantSmsDetail(smsId: number) {
  return apiClient.get<ApiResponse<ParticipantSmsDetailItem>>(`/api/participant-sms/${smsId}`);
}
