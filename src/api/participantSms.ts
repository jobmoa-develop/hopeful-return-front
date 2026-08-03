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
  // 예약 발송 시각(yyyy-MM-dd HH:mm, Asia/Seoul). 미지정 시 즉시 발송
  reserveTime?: string;
};

// SendSmsResponse 와 동일
export type SendSmsResult = {
  messageFormat: MessageFormat | string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  statusName: string;
  smsIds: number[];
  // 예약 발송 시 SENS 예약 batch ID(예약 취소 단위). 즉시 발송은 null
  reserveId: string | null;
};

// ParticipantSmsListResponse.Item 과 동일
export type ParticipantSmsHistoryItem = {
  smsId: number;
  messageFormat: MessageFormat | string;
  title: string | null;
  content: string;
  sendStatus: string;
  // 발송결과(V15/#93): PENDING 은 전달 확인 중, messageId 는 메시지 검색용, resultMessage 는 실패 사유
  messageId: string | null;
  resultCode: string | null;
  resultMessage: string | null;
  completeTime: string | null;
  sentAt: string | null;
  // 예약 발송(V16): 예약건은 sentAt=null, reserveTime=예정시각, reserveId=예약 batch ID
  reserveTime: string | null;
  reserveId: string | null;
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
  messageId: string | null;
  resultCode: string | null;
  resultMessage: string | null;
  completeTime: string | null;
  sentAt: string | null;
  reserveTime: string | null;
  reserveId: string | null;
  senderName: string | null;
};

export type SmsHistoryParams = {
  keyword?: string;
  sendStatus?: string;
  courseNumber?: number;
  regionId?: number; // 하위 지역
  parentRegionId?: number; // 상위 지역(서울 등) — 산하 하위 지역 전체 포함 조회
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
  messageId: string | null;
  resultCode: string | null;
  resultMessage: string | null;
  completeTime: string | null;
  sentBy: number | null;
  senderName: string | null;
  sentAt: string | null;
  reserveTime: string | null;
  reserveId: string | null;
  createdAt: string | null;
  imageUrls: string[];
};

export function getParticipantSmsDetail(smsId: number) {
  return apiClient.get<ApiResponse<ParticipantSmsDetailItem>>(`/api/participant-sms/${smsId}`);
}

// 발송결과 재조회(수동) — SENS 결과조회로 상태·messageId·결과를 갱신한 상세 반환. 권한: SMS_SEND
export function refreshParticipantSmsStatus(smsId: number) {
  return apiClient.post<ApiResponse<ParticipantSmsDetailItem>>(`/api/participant-sms/${smsId}/refresh`);
}

// 예약 취소 사전 확인 — reserveId 로 함께 취소될(예약중) 대상 인원·수신자명을 반환. 권한: SMS_SEND
export type ReservationCancelPreview = {
  reserveId: string;
  targetCount: number;
  reserveTime: string | null;
  recipientNames: string[];
};

export function getReservationCancelPreview(reserveId: string) {
  return apiClient.get<ApiResponse<ReservationCancelPreview>>(
    `/api/participant-sms/reservations/${reserveId}/cancel-preview`,
  );
}

// 예약 발송 취소 — reserveId(예약 batch) 단위. 묶인 전 수신자가 함께 취소됨. 권한: SMS_SEND
export function cancelSmsReservation(reserveId: string) {
  return apiClient.delete<ApiResponse<number>>(`/api/participant-sms/reservations/${reserveId}`);
}
