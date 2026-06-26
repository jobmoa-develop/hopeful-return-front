# hopeful-return-front

신규 서비스 프론트엔드 (React + Vite + TypeScript). **현재는 기본 구조(스켈레톤)** — 인증/화면은 협의 후 추가.

> 레포 상태: **public** · `main`/`develop` 브랜치 보호 적용(PR + 1인 리뷰 승인). 전체 구조 개요: [docs/프로젝트_구조.md](docs/프로젝트_구조.md)

## 스택
- React 19, Vite, TypeScript
- react-router-dom (라우팅), axios (API), oxlint (린트)

## 빠른 시작
```bash
npm install
cp .env.example .env     # VITE_API_BASE_URL 확인 (로컬 백엔드: http://localhost:3434)
npm run dev
```

## 스크립트
- `npm run dev` : 개발 서버
- `npm run build` : 타입체크 + 프로덕션 빌드
- `npm run lint` : oxlint

## 현재 구조 (스켈레톤)
```
src/
├── api/        client.ts (axios 인스턴스 + 토큰 인터셉터)
├── auth/       token.ts  (토큰 저장/조회 유틸)
├── routes/     AppRoutes (라우팅 골격: / → HomePage)
├── pages/      HomePage  (백엔드 /api/ping 연결 확인)
└── types/      api.ts    (ApiResponse 공통 타입)
```
- **없음(확정 후 추가):** 로그인/회원가입 페이지, 인증 API 모듈, 보호 라우트

브랜치 규칙은 [docs/BRANCHING.md](docs/BRANCHING.md) 참고.
