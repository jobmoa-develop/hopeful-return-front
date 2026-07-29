# hopeful-return-front

희망리턴 서비스 프론트엔드 (React + Vite + TypeScript). 로그인·참여자관리·출결·상담·문자(SMS)
발송 등 운영 화면을 제공한다.

> 레포 상태: **public** · `main`/`develop` 브랜치 보호(PR + 1인 리뷰 승인).
> 스택·화면·구조는 아래 섹션 참고.

## 스택
- React 19, Vite 8, TypeScript 6
- **react-router 8**(라우팅), axios(API 클라이언트·토큰 인터셉터), oxlint(린트)

## 빠른 시작
```bash
npm install
cp .env.example .env     # VITE_API_BASE_URL 확인 (로컬 백엔드: http://localhost:3434)
npm run dev
```

## 스크립트
- `npm run dev` : 개발 서버
- `npm run build` : 타입체크(tsc) + 프로덕션 빌드(vite)
- `npm run lint` : oxlint
- `npm run preview` : 빌드 결과 미리보기

## 인증 · 라우팅
- **로그인**: `LoginPage` → `POST /api/auth/login`. AccessToken은 localStorage에 저장,
  axios **요청 인터셉터**가 `Authorization: Bearer` 자동 첨부.
- **세션 갱신**: 응답 인터셉터가 401 시 쿠키 기반 `refresh`로 재발급·원요청 재시도, 실패 시 로그아웃.
- **보호 라우트**: `ProtectedRoute`가 인증 + 역할(`allowedRoles`) + SMS 권한(`requireSmsPermission`) 검사.
- 전역 상태: `AuthContext`(토큰·사용자), `RoleContext`(역할별 메뉴·접근 규칙).

## 화면 (약 16개 페이지, `src/pages/`)
- 로그인 `LoginPage`, 대시보드 `DashboardPage`
- 참여자 `ParticipantsPage`·`ParticipantDetailPage`, 회차 `RoundsPage`·`RoundDetailPage`
- 배정 `AssignPage`, 상담 `ConsultingPage`, 출결 `AttendancePage`, 일정 `CourseCalendarPage`
- 사후관리 `FollowUpPage`
- 문자 발송내역 `SmsHistoryPage`, 문자 권한 관리 `SmsPermissionPage`
- 사용자 관리 `UserManagementPage`, 진행자 일정 `StaffScheduleManagePage`

## 구조
```
src/
├── api/        client.ts(axios·토큰 인터셉터) + 도메인별 API 모듈 (auth, participants, courses,
│               attendances, participantSms, smsTemplates, dashboard 등)
├── auth/       token.ts(토큰·사용자 저장), sessionEvents.ts(세션 이벤트 버스)
├── context/    AuthContext, RoleContext, DataContext
├── routes/     AppRoutes(라우트 정의), ProtectedRoute(인증·역할·SMS 권한 가드)
├── pages/      운영 화면 (위 목록)
├── components/ Layout, Modal, 참여자/사후관리/SMS 모달
├── utils/      imageBase64, smsBytes
└── types/      api.ts (ApiResponse 공통 타입)
```

## 문서
- 프론트 화면·기능 문서: [docs/](docs/) (예: [participant-sms-ui.md](docs/participant-sms-ui.md),
  [participants-integration.md](docs/participants-integration.md))
- 브랜치 규칙: [docs/BRANCHING.md](docs/BRANCHING.md)
- 초기 UI 시안(일회성 확인용): `design.html` (레포 루트, 정식 스타일 정본 아님)
- 공통 문서(ERD·개발일지·운영)는 상위 저장소 루트 `docs/` 참고.
