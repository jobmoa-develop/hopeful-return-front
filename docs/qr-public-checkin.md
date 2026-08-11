# QR 공개 입·퇴실 페이지 — FrontEnd

> 브랜치 `feature/fe-qr-public-attendance` · FE 이슈 #119 · BE 대응 #139(PR #140)
> 참여자가 회차별 QR을 스캔해 **로그인 없이** 성명 + 전화번호 뒤 4자리로 본인확인 후, 현재 시각·강의
> 일정에 따라 입실/조퇴·외출/퇴실을 스스로 기록하고 본인 내역을 읽기전용으로 확인한다.
> 진행자는 회차·일정 화면에서 QR을 발급/다운로드한다. BE 계약: 백엔드 `Docs/qr-public-attendance-api.md`.

## 본인확인 입력 = 성명 + 전화번호 **뒤 4자리**

이슈 본문은 "성명+전화번호"로 적혀 있으나 **BE 실제 계약은 `name` + `phoneLast4`(숫자 4자리)** 다.
FE는 뒤 4자리에 맞춘다(입력은 `inputMode="numeric"` `maxLength={4}`, 숫자만 필터).

## 구성 파일

| 파일 | 역할 |
|---|---|
| `src/api/publicQr.ts` | 공개 QR API 클라이언트 + 타입. **인터셉터 없는 전용 axios 인스턴스** |
| `src/pages/QrCheckInPage.tsx` | 공개 페이지(랜딩→verify→상태별 액션→history). 모바일 우선 |
| `src/pages/qr.css` | 공개 페이지 전용 스타일(관리자 Layout 없이 단독 렌더) |
| `src/components/QrModal.tsx` | 회차 QR 표시 + PNG 다운로드 경량 모달 |
| `src/pages/RoundsPage.tsx` | 회차 테이블에 `QR` 컬럼·버튼 추가 → `QrModal` |
| `src/routes/AppRoutes.tsx` | `ProtectedRoute` **바깥** 공개 라우트 `/qr/:courseId` |

## 인증 격리 (중요)

공용 `apiClient`(`src/api/client.ts`)는 401 응답 시 자동 리프레시 후 **`/login` 으로 강제 리다이렉트**한다.
로그인하지 않은 참여자가 쓰는 공개 페이지에서 이 동작이 일어나면 안 되므로, `publicQr.ts` 는
**별도 axios 인스턴스**(인터셉터·`withCredentials` 없음, 토큰/쿠키 미사용)를 만들어 사용한다.
공개 엔드포인트는 BE `SecurityConfig` 에서 `permitAll` 이라 401 이 발생하지 않는다(라이브 검증 완료).

## 공개 페이지 흐름 (`/qr/:courseId`)

1. **랜딩** — `GET /api/public/qr/courses/{courseId}` 로 회차명·지역·오늘 dayNo·교육시간 표시.
   `dayNo == null`(비강의일)이면 "오늘은 교육일이 아닙니다" 안내.
2. **본인확인** — 성명 + 뒤 4자리 → `POST …/verify`. 성공 시 `QrStatus` 보관 +
   `name/phoneLast4` 를 `localStorage`(`qr-verify-{courseId}`)에 저장(세션 중 재확인·history 편의).
3. **상태별 액션** — `QrStatus` 플래그로 렌더:
   - `canCheckIn` → **입실하기** (`…/check-in`). 교육시작 10분 초과 시 BE가 `LATE` + 자동 외출 생성.
   - `canLeave` → **토글 액션 버튼**: 복귀 안 한 외출(미복귀 건)이 없으면 **"외출하기"**(`…/leave`, 시각 미전송),
     외출 중이면 **"복귀하기 (HH:mm 외출 중)"**(`…/leave/return` + 해당 `attendanceLeaveId`, 시각 미전송) 로
     바뀌어 현재 외출 상태를 버튼으로 바로 확인·복귀할 수 있다. 외출 내역 리스트는 읽기전용(복귀 전/복귀 시각).
   - `canCheckOut` → **퇴실하기** (`…/check-out`). 교육 종료 시각 이후에만 노출.
   - 각 액션은 반환된 `QrStatus` 로 화면 즉시 갱신. 퇴실 후에는 조퇴·외출 UI가 사라진다(BE 잠금).
4. **입퇴실 확인** — 상단 버튼 → `POST …/history` → 일차별 입·퇴실·외출 내역 **읽기전용** 뷰.

**시각은 버튼 클릭 = 서버 현재시각**: 입실·퇴실과 동일하게 외출·복귀도 FE가 시각을 보내지 않고
(`leaveTime`/`returnTime` 생략) BE가 `LocalTime.now(clock)` 으로 기록한다. 표시는 `"HH:mm"` 으로
자른다(`hm`). 오류는 BE `error` 메시지를 그대로 노출.

## QR 발급 모달 (RoundsPage)

- 회차 목록 각 행 우측 **`QR` 버튼**(행 클릭 내비게이션과 겹치지 않게 `e.stopPropagation()`).
- 모달: `qrcode.react` 의 `QRCodeCanvas` 로 **`${window.location.origin}/qr/{courseId}`** 인코딩.
  RoundsPage 가 열린 origin 이 곧 참여자 접속 origin 이므로 배포/개발 환경 모두 자동 정합.
- **이미지 다운로드**: canvas `toDataURL('image/png')` → `<a download="qr-course-{courseId}.png">`.
- 링크 복사 버튼(클립보드) 제공.

## 의존성

- `qrcode.react@^4`(React 19 호환) 신규 추가. **의존성 변경이므로 `package-lock.json` 동반 커밋**
  (평소 "의존성 무변경 시 lock 커밋 금지" 규칙의 반대 케이스).

## 검증 (2026-08-11 완료)

- `npm run build`(tsc + vite) 통과, `npm run lint`(oxlint) exit 0 — 신규 파일 경고 0.
- 로컬 docker DB + BE(`feature/be-qr-public-attendance`, 3434) 라이브 Playwright E2E:
  랜딩 → verify(박진선/뒤4자리) → 입실(LATE+자동외출) → 조퇴/외출 → 복귀 → 입퇴실 확인(history)
  → 퇴실 → 퇴실 후 조퇴 UI 사라짐. 잘못된 뒤4자리 → 본인확인 실패 메시지. `/login` 리다이렉트 없음.
  RoundsPage QR 모달 열기 → QR 캔버스(220×220 PNG) → `qr-course-1.png` 다운로드 확인.
  검증용 회차 day1_date/종료시각 임시 조정분은 **모두 원복**.
