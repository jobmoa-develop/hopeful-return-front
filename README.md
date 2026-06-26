# hopeful-return-front

신규 서비스 프론트엔드 (React + Vite + TypeScript).

## 스택
- React 19, Vite, TypeScript
- react-router-dom (라우팅), axios (API)

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

## 구조
```
src/
├── api/        axios 인스턴스(client) + 도메인 API(authApi)
├── auth/       토큰 저장 유틸(token)
├── routes/     AppRoutes, ProtectedRoute
├── pages/      LoginPage, SignupPage, HomePage
├── components/ 공통 컴포넌트
└── types/      공통 타입
```

브랜치 규칙은 [docs/BRANCHING.md](docs/BRANCHING.md) 참고.
