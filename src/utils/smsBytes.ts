// 문자 바이트 계산 및 형식 판별 (EUC-KR 근사)
// 백엔드(ParticipantSmsService)와 동일 규칙: ASCII 1바이트, 그 외(한글 등) 2바이트.
// 형식 판별은 표시용이며, 실제 발송 형식은 서버가 {name} 치환 후 방어적으로 재확정한다.

import type { MessageFormat } from '../api/participantSms';

// 바이트 상한 (백엔드 계약 §3)
export const SMS_MAX_BYTES = 90;
export const LMS_MAX_BYTES = 2000;
export const TITLE_MAX_BYTES = 40; // LMS/MMS 제목

// EUC-KR 근사 바이트 길이 — 코드포인트 < 128(ASCII) 1바이트, 그 외 2바이트
export function euckrByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    // 코드포인트 기준. ASCII 범위만 1바이트로 계산한다.
    bytes += (ch.codePointAt(0) ?? 0) < 128 ? 1 : 2;
  }
  return bytes;
}

// 본문·이미지 유무로 발송 형식 판별
// - 이미지 있으면 MMS
// - 없으면 바이트 ≤ SMS 상한이면 SMS, 그 외 LMS (초과분은 resolveByteState 로 별도 경고)
export function resolveMessageFormat(content: string, hasImage: boolean): MessageFormat {
  if (hasImage) return 'MMS';
  return euckrByteLength(content) <= SMS_MAX_BYTES ? 'SMS' : 'LMS';
}

export type ByteState = {
  bytes: number;
  format: MessageFormat;
  // 본문이 LMS 상한(2000B)을 초과하여 발송 불가한 상태
  exceedsMax: boolean;
};

export function resolveByteState(content: string, hasImage: boolean): ByteState {
  const bytes = euckrByteLength(content);
  return {
    bytes,
    format: resolveMessageFormat(content, hasImage),
    exceedsMax: bytes > LMS_MAX_BYTES,
  };
}
