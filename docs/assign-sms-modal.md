# 인력 배정 안내 문자 모달 — 프런트

> 브랜치 `feature/fe-assign-sms-modal` · 이슈 #131 (선행 BE: #147 발송 API, #146 notify_type)
> 인력 배정(`/assign`) 저장·수정 시 3단 모달을 띄워 변경 인원을 확인하고 배정/변동/제외 안내 문자를 발송한다.

## 흐름

1. `배정 저장`/`배정 수정` 버튼 클릭 → 곧바로 저장하지 않고 **`AssignSmsModal` 오픈**(`openSmsFlow`).
   - `grid`(현재) vs `originalGrid`(로드 시점) 를 비교.
   - 최초 배정(`hasExistingAssignments === false`): 전 인원 → **배정(ASSIGN_NEW)**.
   - 수정:
     - **제외(ASSIGN_REMOVED)** = 회차에서 **완전히 빠진** 인원(어느 날짜에도 없음). `[...before].filter(uid ⇒ !after.has(uid))`.
     - **변동(ASSIGN_CHANGED)** = **변경된 셀(slot)에 연루**됐고 여전히 배정된 인원 = 신규 추가 + **일부 날짜만 교체돼 자리를 잃었지만 다른 날짜엔 남은 이전 담당자**. `collectChangedInvolved`(변경 셀의 old·new 담당자) ∩ afterSet.
     - ⚠️ 초기 구현은 인물 단위(변동=신규 추가만)라 **일부 날짜만 교체 시 이전 담당자가 누락**됐다. 사용자 요청("바뀐 날짜가 있으면 제외 말고 인력변동")대로 slot 단위로 교정.
   - PM(박문순 고정)은 그리드 값이 불변이라 자연히 제외.
2. 모달 하단 3버튼:
   - **취소**: 저장·발송 모두 안 함(모달만 닫음).
   - **저장**: SMS 없이 배정만 저장(`doSave`). 성공 시 모달 닫힘.
   - **저장 및 발송**: `doSave` 성공 후 `sendCourseStaffSms()` 호출, 결과를 우측 패널에 표시.
   - 저장 후처리는 setState 즉시 미반영 문제로 `smsActionRef`(ref)로 `doSave`에 전달. 저장 중복 충돌(409)이
     나면 기존 `ConflictModal`이 위에 뜨고, 확인(`confirmSaveMove`) 후 이어서 발송된다.

## 모달 3단 구성 (`AssignSmsModal.tsx`)

- **좌측**: 변경 인원(그룹별) 성명·역할칩·전화번호. `[수정]` 버튼으로 전화번호 **일회성 편집**(users 미변경 →
  원본과 다르면 `phoneOverride`로 전달). 전화번호 없는 인원은 붉게 표시 + 상단에 "N명 발송 제외" 안내.
- **가운데**: 그룹별 템플릿 textarea + byte 카운터/SMS·LMS 배지(`utils/smsBytes.ts`). `{region}`/`{round}`/`{startDate}`(개강일 M/d)
  (+최초배정 `{role}`) 토큰 안내 — 서버가 수신자별 치환. 2000B 초과 시 발송 버튼 비활성.
- 기본 템플릿: 배정 `{region} {round}회차({startDate}~) {role}으로 배정 / 전산에서 확인 부탁드립니다`,
  변동 `…({startDate}~) 인력변동 / 전산에서…`, 제외 `…({startDate}~) 인력 제외 / 전산에서…`.
- **우측**: 발송 후 형식·성공/실패 수·전화번호 없어 제외된 인원.

## API (`api/courseStaffSms.ts`)

- `sendCourseStaffSms({ courseId, groups })` → `POST /api/course-staff-sms/send`.
- `groups[].recipients[]` = `{ userId, phoneOverride? }`. 전화번호 없는 인원은 FE에서 제외(서버도 방어).

## 문자발송내역 반영 (`SmsHistoryPage.tsx`)

- "담당자에게 보낸 안내 문자" 탭의 `종류` 라벨/필터에 **배정 / 배정 변동 / 배정 제외** 3종 추가.

## 담당자 문자 이력 상세 모달 (운영 > 문자 발송 내역 담당자 탭) — front #132

- **별도 페이지로 분리하지 않음**(사용자 요청): 담당자(인력배정) 문자 이력은 **원래대로 운영 탭의 "문자 발송 내역"**(`/participants/sms-history`) 안 "담당자에게 보낸 안내 문자" 탭에서 확인. 단계관리 하위 전용 페이지·나브·라우트는 추가하지 않음(초안은 되돌림).
- `StaffSmsHistorySection`에 **행 클릭 상세 모달**만 추가(참여자 발송내역처럼 상태·본문 확인) — 목록 항목 데이터로 렌더, 추가 API 불필요(course_staff_sms는 이미지·폴링·예약 없음). 발송일시·수신담당자(성명/전화)·지역/회차·종류·상태 칩·발송자·본문(pre-wrap)·닫기.
- `send_status` 값은 **`SUCCESS`/`FAIL` 2종만**(담당자 SMS는 결과 폴링 없음; SENS 202 접수 성공→SUCCESS, 발송 실패→FAIL).

## BE 의존 데이터

- 모달 좌측 전화번호는 `GET /api/course-daily-staffs`(`assignments[].phone`) + `.../candidates`(`candidates[].phone`)
  응답에 추가된 `phone`으로 채운다(`phoneById`).
