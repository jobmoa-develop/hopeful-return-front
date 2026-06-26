# 브랜치 전략

## 기본 브랜치
- `main` : 운영 배포 (보호). 직접 push 금지.
- `develop` : 통합 개발 (보호). feature PR 의 기본 타겟.

## 작업 브랜치
- `feature/fe-<설명>` : 기능/화면 개발 (`develop` 에서 분기 → `develop` 으로 PR)
  - 예) `feature/fe-login-page`, `feature/fe-signup-page`
- `fix/<설명>` : 버그 수정

## 규칙
1. `main`/`develop` 직접 push 금지 — PR + 1인 리뷰 후 머지.
2. 착수 전 이슈 등록 + 본인 assignee 지정 (작업 겹침 방지).
3. **화면(page) 단위로 담당을 나눈다** — 같은 페이지를 동시에 작업하지 않는다.
4. PR 본문에 `Closes #이슈번호` 포함.
