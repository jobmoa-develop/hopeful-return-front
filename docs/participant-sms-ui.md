# 참여자관리 문자(SMS) 발송 UI — FrontEnd

> 브랜치 `feature-fe-participant-sms` · FE 이슈 #56 · BE 대응 #81
> 참여자관리에서 선택 참여자에게 SMS/LMS/MMS를 일괄 발송한다. BE 계약: 백엔드 `docs/participant-sms-api.md`.

## 접근 권한

- 문자 기능은 **계정 단위 플래그 `canSendSms`** 보유 계정만 사용(역할 무관).
- 로그인 응답 `user.canSendSms` → `AuthUser.canSendSms`(`auth/token.ts`)에 저장.
- 화면 게이팅: `const { user } = useAuth(); const canSendSms = user?.canSendSms ?? false;`
  - 참여자 선택 액션 바의 "문자 발송" 버튼은 `canSendSms`일 때만 노출.
  - 체크박스 선택(`canSelect`)도 `canSendSms` 포함(문자 전용 계정도 선택 가능).
- 권한 부여는 관리자(ADMIN)가 `PATCH /api/users/{id}/sms-permission`으로 수행(부여 UI는 이번 범위 밖).

## 진입 흐름

1. 참여자관리(`/participants`)에서 참여자 체크 → 선택 액션 바에 "✉ 문자 발송".
2. 클릭 시 3단 레이어 모달(`components/SmsModals.tsx`의 `SmsSendModal`) 오픈.
   대상 = 현재 로드된 목록 중 선택된(`courseParticipantId` 보유) 참여자.

## 3단 레이어 모달

| 영역 | 내용 |
|---|---|
| 좌 | 선택 인원(성명 / 전화번호 / 지역·회차). 개별 제외 가능 |
| 중 | 제목(LMS/MMS 전용), 본문(`{name}` 삽입 버튼), 형식 배지+바이트 카운터, MMS 이미지 업로드(미리보기) |
| 우 | 공용/개인 템플릿 목록(클릭 로드) + CRUD(현재 내용 저장·수정·삭제) |

- **형식 판별**(`utils/smsBytes.ts`, 표시용): 이미지 있으면 MMS, 없으면 EUC-KR 바이트 ≤90 SMS / ≤2000 LMS / 초과 경고.
  `{name}` 치환은 수신자별로 달라지므로 **실제 형식은 서버가 재확정**(안내 문구 노출).
- **MMS 이미지**(`utils/imageBase64.ts`): jpg/jpeg · ≤300KB · ≤1500×1440. File→base64(접두어 제거) 후 발송 `images[]`.
- **템플릿 관리**: 개인(PERSONAL)은 소유 계정만 수정·삭제, 공용(SHARED)은 문자 권한 계정 공용(BE 검증). 소유 아닌 항목은 관리 버튼 숨김.

## 발송

- `POST /api/participant-sms` — `{ courseParticipantIds, title?, content, messageFormat, images? }`.
- 응답 `{ messageFormat, totalCount, successCount, failedCount, statusName, smsIds }` → 성공/실패 요약 alert 후 선택 해제.
- FE 사전 검증: 대상 0명·본문 공백·본문 2000바이트 초과·제목 40바이트 초과 시 차단.

## 등록일(전산 등록일) 필터

- 참여자관리 목록 필터에 등록일 시작/종료(date) 추가 → `getParticipants({ registerDateFrom, registerDateTo })`.
- 기준 = 최신 수강건 `course_participant.created_at`(포함 범위). BE `/api/participants`에 파라미터 추가(동반 작업).

## 관련 파일

- API: `api/smsTemplates.ts`, `api/participantSms.ts`, `api/participants.ts`(등록일 파라미터)
- 유틸: `utils/smsBytes.ts`, `utils/imageBase64.ts`
- 컴포넌트: `components/SmsModals.tsx`
- 페이지: `pages/ParticipantsPage.tsx`
- 인증: `auth/token.ts`(AuthUser.canSendSms)
- 스타일: `index.css`(`.sms-modal`, `.sms-grid`, `.sms-*`)
