// MOCK: 인력 배정 시연용 임시 데이터.
// 실제 API(getCourses / getStaffSchedules / getCourseDailyStaffCandidates) 준비 시
// 이 파일을 제거하고 useAssignData 훅에서 API 호출로 교체한다. (BE #36, FE #13)
import type { StaffRoleValue } from '../../api/courseDailyStaff';

// 회차(강좌) — 실제로는 GET /api/courses 로 대체
export type AssignCourse = {
  courseId: number;
  year: number;
  regionName: string;
  localCourseNumber: number; // 지역별 회차 번호
  courseNumber: number; // 전체 기수
  status: string;
  dates: string[]; // day1~day5 (ISO yyyy-MM-dd)
};

export const MOCK_COURSES: AssignCourse[] = [
  {
    courseId: 22,
    year: 2026,
    regionName: '양천',
    localCourseNumber: 2,
    courseNumber: 22,
    status: '개강확정',
    dates: ['2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27'],
  },
  {
    courseId: 24,
    year: 2026,
    regionName: '양천',
    localCourseNumber: 3,
    courseNumber: 24,
    status: '모집중',
    dates: ['2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18'],
  },
  {
    courseId: 18,
    year: 2026,
    regionName: '인천',
    localCourseNumber: 4,
    courseNumber: 18,
    status: '교육중',
    dates: ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20'],
  },
  {
    courseId: 15,
    year: 2025,
    regionName: '인천',
    localCourseNumber: 3,
    courseNumber: 15,
    status: '종료',
    dates: ['2025-11-10', '2025-11-11', '2025-11-12', '2025-11-13', '2025-11-14'],
  },
];

// 후보 직원 — 실제로는 GET /api/course-daily-staffs/candidates + staff_schedule 로 대체.
// unavailable: 캘린더에서 근무 불가로 지정된 날짜(ISO). 해당 날짜 셀 후보에서 제외된다.
export type AssignStaff = {
  userId: number;
  name: string;
  staffRoles: StaffRoleValue[];
  unavailable: string[];
};

export const MOCK_STAFF: AssignStaff[] = [
  { userId: 1, name: '심영수', staffRoles: ['LECTURER'], unavailable: [] },
  // 박외부: 6/24 근무 불가 → 양천 2회차 2일차 후보에서 제외되어야 함
  { userId: 2, name: '박외부', staffRoles: ['LECTURER'], unavailable: ['2026-06-24'] },
  { userId: 3, name: '정강사', staffRoles: ['LECTURER'], unavailable: ['2026-06-26'] },
  { userId: 4, name: '김상담', staffRoles: ['COUNSELOR'], unavailable: [] },
  { userId: 5, name: '이상담', staffRoles: ['COUNSELOR'], unavailable: ['2026-06-25'] },
  { userId: 6, name: '한상담', staffRoles: ['COUNSELOR'], unavailable: [] },
  { userId: 7, name: '이진행', staffRoles: ['STAFF'], unavailable: [] },
  { userId: 8, name: '최진행', staffRoles: ['STAFF'], unavailable: [] },
  { userId: 9, name: '한준희', staffRoles: ['ADMIN_STAFF'], unavailable: [] },
  { userId: 10, name: '장두일', staffRoles: ['PROJECT_MANAGER'], unavailable: [] },
  { userId: 11, name: '이빛나', staffRoles: ['PROJECT_LEADER'], unavailable: [] },
  // 겸직 예시: 강사 + PM
  { userId: 12, name: '조겸직', staffRoles: ['LECTURER', 'PROJECT_MANAGER'], unavailable: [] },
];

// 특정 역할·날짜에 배정 가능한 후보(불가일 제외). 실제 API의 candidates 응답을 대신한다.
export function mockCandidatesFor(
  staffRole: StaffRoleValue,
  dateISO: string,
  staff: AssignStaff[] = MOCK_STAFF,
): AssignStaff[] {
  return staff.filter(
    (s) => s.staffRoles.includes(staffRole) && !s.unavailable.includes(dateISO),
  );
}
