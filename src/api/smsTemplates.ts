import { apiClient } from './client';
import type { ApiResponse } from './courses';

// 문자 템플릿 공개 범위 — PERSONAL(개인 전용) / SHARED(공용)
export type SmsTemplateScope = 'PERSONAL' | 'SHARED';

// GET /api/sms-templates 목록 항목 — SmsTemplateListResponse.Item 과 동일
// userId: 개인 템플릿 소유 계정(공용은 null). 수정/삭제 권한 판정에 사용.
export type SmsTemplateItem = {
  smsTemplateId: number;
  scope: SmsTemplateScope | string;
  userId: number | null;
  title: string | null;
  content: string;
  updatedAt: string; // LocalDateTime "YYYY-MM-DDTHH:mm:ss"
};

// GET /api/sms-templates/{id} 상세 — SmsTemplateDetailResponse 와 동일
export type SmsTemplateDetail = {
  smsTemplateId: number;
  scope: SmsTemplateScope | string;
  userId: number | null;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateSmsTemplateRequest = {
  scope: SmsTemplateScope;
  title?: string; // 최대 100자
  content: string; // 최대 2000자, {name} 성명 치환 가능
};

export type UpdateSmsTemplateRequest = {
  title?: string;
  content: string;
};

// 목록(공용 전체 + 본인 개인) — 권한: 문자 발송 권한(SMS_SEND)
export function getSmsTemplates() {
  return apiClient.get<ApiResponse<{ content: SmsTemplateItem[] }>>('/api/sms-templates');
}

export function getSmsTemplate(smsTemplateId: number) {
  return apiClient.get<ApiResponse<SmsTemplateDetail>>(`/api/sms-templates/${smsTemplateId}`);
}

// 등록 — scope=SHARED 는 userId 미지정(공용), PERSONAL 은 본인 소유로 저장
export function createSmsTemplate(payload: CreateSmsTemplateRequest) {
  return apiClient.post<ApiResponse<{ smsTemplateId: number }>>('/api/sms-templates', payload);
}

// 수정 — 개인 템플릿은 소유 계정만, 공용은 문자 권한 계정 공용(BE assertOwner)
export function updateSmsTemplate(smsTemplateId: number, payload: UpdateSmsTemplateRequest) {
  return apiClient.put<ApiResponse<{ smsTemplateId: number; updated: boolean }>>(
    `/api/sms-templates/${smsTemplateId}`,
    payload,
  );
}

export function deleteSmsTemplate(smsTemplateId: number) {
  return apiClient.delete<ApiResponse<{ message: string }>>(`/api/sms-templates/${smsTemplateId}`);
}
