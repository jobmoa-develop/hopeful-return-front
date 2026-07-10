# 인력 배정(assign) 페이지

> 회차별 인력을 **날짜 × 역할** 단위로 배정하는 화면. 출결·현황 페이지 패턴(년도/회차 select + 표)을 차용.
> 관련: FE 이슈 **#13**, BE 이슈 **#36**.

## 화면 구성

1. **회차 선택 툴바** — `년도` select + `회차` select(`{지역} {지역회차}회차 ({상태})`). 년도는 회차들의 교육일 연도에서 distinct.
2. **일괄 적용 카드** — 역할별(오전강사/오후강사/PM/PL/진행자/행정인력/상담사) 직원 1명 선택 → "적용"으로 표의 전체 날짜 셀을 채움(불가일 자동 제외).
3. **날짜별 배정 표** — 행=역할, 열=회차 교육일(day1~day5의 실제 날짜, `MM-DD(요일)`), 셀=직원 `<select>`.
   - 셀 후보는 **해당 날짜에 근무 가능한 직원만** 표시(캘린더 불가일 제외).
   - **상담사는 다중 행**(+ 상담사 / − 삭제).
4. **배정 저장** — 그리드를 `saveCourseDailyStaff` 페이로드로 변환(현재 시안은 alert).

## 역할 매핑 (`src/pages/assign/roles.ts`, 단일 소스 `ASSIGN_ROLES`)

| 표 행 | staffRole | session | 다중 |
| --- | --- | --- | --- |
| 오전 강사 | LECTURER | AM | X |
| 오후 강사 | LECTURER | PM | X |
| PM | PROJECT_MANAGER | FULL | X |
| PL | PROJECT_LEADER | FULL | X |
| 진행자 | STAFF | FULL | X |
| 행정인력 | ADMIN_STAFF | FULL | X |
| 상담사 | COUNSELOR | FULL | **O** |

## 파일

- `src/pages/AssignPage.tsx` — 화면/상태.
- `src/pages/assign/roles.ts` — 역할 상수 + 날짜 포맷 유틸.
- `src/pages/assign/assignMock.ts` — **MOCK 데이터**(회차/직원/불가일). 실 API 준비 시 제거.
- `src/api/courses.ts` — `localCourseNumber` 추가.
- `src/api/staffSchedules.ts` — `GET /api/staff-schedules`(가용/불가 확인).
- `src/api/courseDailyStaff.ts` — 조회/저장/후보 조회 3종.
- `src/index.css` — `.assign-bulk-grid`, `.assign-select`, `.assign-table`, `.btn.tiny` 등.

## API 연동 계획 (mock → 실 API)

현재는 `assignMock.ts` 로 동작한다(직원 후보/불가일/회차 미구현). 실 API 준비 시 아래로 교체:

- 회차/년도/교육일 → `getCourses` (`day1~day5`, `localCourseNumber`).
- 셀 후보 + 불가일 → `getCourseDailyStaffCandidates`(내부적으로 `staff_schedule.is_available` 반영). 캘린더 등록 UI는 실습생 담당.
- 저장/조회 → `saveCourseDailyStaff` / `getCourseDailyStaff`.

`// MOCK:` 주석이 달린 지점이 교체 대상이다.

## 권한
- 라우팅: assign 메뉴 = `ADMIN, REGIONAL_MANAGER, OPERATOR`.
- 편집 가능(`canEdit`)도 위 3역할. 그 외는 조회만(모든 select/button disabled).
