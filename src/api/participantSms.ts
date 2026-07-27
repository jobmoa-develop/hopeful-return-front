import { apiClient } from './client';
import type { ApiResponse } from './courses';

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
