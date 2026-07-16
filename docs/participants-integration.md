# 참여자 관리 실연동 (front#26)

참여자 메인/상세/상담관리 화면의 실 API 연동 구조 정리. (2026-07-15, 브랜치 `feature-fe-participant-integration`)

## 라우팅

- `/participants` — 참여자 메인 (목록·등록)
- `/participants/:courseParticipantId` — 참여자 상세. **구 `:phone` 라우팅에서 변경.**
  조회 키는 course_participant ID이고, 화면의 "참여자ID"는 표시용 `matchKey`({이니셜}_{생년}_{전화뒤4}).
- `/consulting` — 상담 관리 (슬롯별 완료 현황 + 세션 기록)

## API 모듈 (`src/api/`)

| 모듈 | 엔드포인트 |
|------|------------|
| `participants.ts` | `GET/POST /api/participants`(목록·통합 등록), `GET /api/participants/check-phone` |
| `courseParticipants.ts` | `GET /api/course-participants/{id}`, `PATCH …/status`(#49), `PATCH …/counselor`(3슬롯 전체 교체), `PATCH …/counselors/{counselingType}`(세션 기록), `POST …/cancel`, `PATCH …/completion`, `PATCH …/contact-attempt` |
| `attendances.ts` | `GET /api/attendances?courseParticipantId=`(#50 — 항목에 `leaves[]` 포함) |
| `participantMemos.ts` | `GET/POST /api/participant-memos` (course_participant 단위) |
| `apiError.ts` | axios 오류에서 봉투 `error` 메시지 추출 |

상담 슬롯 값은 **`PRE_SESSION` / `POST_SESSION_1` / `POST_SESSION_2`** (V10) — 구 값 `PRE`/`POST` 전송 시 400.
라벨·칩 색상 상수는 `courseParticipants.ts`의 `COUNSELING_TYPE_LABELS`·`CP_STATUS_LABELS`·`CP_STATUS_CHIP` 사용.

## 통합 등록 규칙 (등록 모달)

- 지역(regions) → 회차(courses?regionId=) 종속 선택. **회차 미선택 시 `enrollment` 생략** →
  참여자만 생성되고 유입·자격/상담사 섹션은 화면에서 숨김.
- 회차 선택 시 진행상태는 **선정(CONFIRMED) 고정**(모달 상단에 고정 표시). 등록 후 변경은
  메인/상세의 진행상태 UI(#49 API)로.
- 상담사 3슬롯은 `GET /api/user-roles`에서 `COUNSELOR` 역할만 필터해 선택(슬롯당 1명, 같은 사람 여러 슬롯 가능).

## 여정 스테퍼 파생 규칙 (상세)

| 단계 | 판정 |
|------|------|
| 접수 | 항상 완료(등록 존재) |
| 선정 | status ∉ {APPLIED, CANCELED} |
| 사전상담 | PRE_SESSION 슬롯 `completed`(= endedAt 존재) |
| 현장교육 | 출결(ATTEND+LATE) > 0 → 진행, COMPLETED/INCOMPLETE → 완료 |
| 수료 | status = COMPLETED |
| 사후상담 1·2차 | POST_SESSION_1/2 슬롯 `completed` |

## 롤 × 기능 매트릭스 (front#28 · backend#51, 2026-07-15)

참여자 화면은 **강사(LECTURER)를 제외한 8롤**이 사용한다. FE 게이트는 `RoleContext`의 `can` 플래그, 보안 경계는 BE `@PreAuthorize`.

| 기능 (FE 게이트) | 허용 롤 |
|---|---|
| 참여자 등록 버튼 (`can.register`) | ADMIN · 본부장 · 지역담당 · PM · PL — **행정(OPERATOR)·상담사·진행요원 불가** |
| 진행상태 변경·상담사 편집 (`can.editP`) | 위 5롤 + 행정 |
| 상담 기록·연락시도 (`can.consult`) | ADMIN · 행정 · 상담사 (PM/PL은 BE는 허용, FE는 후속) |
| 메모 추가 (`can.memo`) | 강사 제외 전 롤 |
| 조회 (메뉴·라우트) | 8롤 (강사는 메뉴 미노출 + 라우트 차단 + BE 403) |

- PM/PL/LECTURER가 `AppRole`에 추가되어 **미등록 롤의 STAFF fallback 버그 해소**.
- 라우트 `allowedRoles`(AppRoutes)와 메뉴 규칙(`ROLE_MENU_RULES.participants`)은 8롤로 동기화.

## 유의사항

- 상담사 편집은 **전체 교체** 방식 — "배정 안 함"으로 저장하면 해당 슬롯 배정(세션 기록 포함)이 삭제됨.
- 세션 기록에서 **종료 일시 입력 = 완료 처리**. null 필드는 기존값 유지.
- `DataContext` 목데이터와 `Modal.tsx`의 구 모달은 대시보드·회차·출결 페이지가 아직 사용 — 참여자 화면은 더 이상 사용하지 않음(단계적 제거 예정).
- 참여자/수강 정보 수정(PUT) UI, 상세 출결 입력은 이번 범위 제외(후속).
