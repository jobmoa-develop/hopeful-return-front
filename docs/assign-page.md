# 인력 배정(assign) 페이지

> 회차별 인력을 **날짜 × 역할** 단위로 배정하는 화면. 출결·현황 페이지 패턴(년도/회차 select + 표)을 차용.
> 관련: FE 이슈 **#13** / PR **#14**, BE 이슈 **#36** / PR **#37**. (리디자인+실 API 연동을 각 PR에 함께 담음)
> 상태: **실 API 연동 완료**(2026-07-10). mock 제거, `getCourses`/`getCourseDailyStaff(Candidates)`/`saveCourseDailyStaff` 실호출.

## 화면 구성

1. **회차 선택 툴바** — `년도` select + `회차` select(`{지역} {지역회차}회차 ({상태})`). 년도는 회차들의 교육일 연도에서 distinct.
2. **일괄 적용 카드** — 역할별(오전강사/오후강사/PM/PL/진행자/행정인력/상담사) 직원 1명씩 선택 후 카드 하단의 **단일 `일괄 적용` 버튼**으로 선택된 모든 역할을 표의 전체 날짜 셀에 한 번에 채움(불가일 자동 제외). (역할별 개별 적용 버튼은 제거됨)
3. **날짜별 배정 표** — 행=역할, 열=회차 교육일(day1~day5의 실제 날짜, `MM-DD(요일)`), 셀=직원 `<select>`.
   - 셀 후보는 **해당 날짜에 근무 가능한 직원만** 표시(캘린더 불가일 제외).
   - **상담사는 다중 행**(+ 상담사 / − 삭제).
4. **배정 저장/수정** — 그리드를 `saveCourseDailyStaff` 페이로드로 변환해 `PUT /bulk` 호출, "저장 완료: N건" 표시 후 재조회. 저장 영역에 안내문 **"인원 일괄 적용 후 저장해야 강의회차에 정상 배정됩니다."** 표시. 기존 배정이 있는 회차는 버튼이 **`배정 저장` → `배정 수정`**으로 바뀜(`hasExistingAssignments`).

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

- `src/pages/AssignPage.tsx` — 화면/상태 + 실 API 연동(로드·역피벗·저장).
- `src/pages/assign/roles.ts` — 역할 상수 + 날짜 포맷 유틸.
- `src/api/courses.ts` — `localCourseNumber`·`year`·`day1~day5` (년도/회차/교육일 소스).
- `src/api/staffSchedules.ts` — `GET /api/staff-schedules`(가용/불가 확인).
- `src/api/courseDailyStaff.ts` — 조회/저장/후보 조회 3종.
- `src/index.css` — `.assign-bulk-grid`, `.assign-select`, `.assign-table`, `.btn.tiny` 등.
- ~~`src/pages/assign/assignMock.ts`~~ — **삭제됨**(실 API 연동 완료).

## API 연동 (완료)

- 회차/년도/교육일 → `getCourses` (`year`(=day1Date 연도)·`day1~day5`·`localCourseNumber`). BE `CourseListResponse.Item`에 `year`·`day1~day5` 추가(#37).
- 셀 후보 + 불가일 → `getCourseDailyStaffCandidates`(`candidates[].availability` 로 날짜별 가용 판별). 캘린더 등록 UI는 실습생 담당.
- 저장/조회 → `saveCourseDailyStaff`(PUT /bulk) / `getCourseDailyStaff`(기존 배정 → 그리드 역피벗, 상담사 다중 행 복원).

## 권한
- 라우팅: assign 메뉴 = `ADMIN, REGIONAL_MANAGER, OPERATOR`.
- 편집 가능(`canEdit`)도 위 3역할. 그 외는 조회만(모든 select/button disabled).
