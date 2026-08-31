import type { StaffRoleValue } from '../api/courseDailyStaff';

// 배정 역할(course_staff.staff_role enum) → 한글 라벨. RoundDetailPage / CourseCalendarPage /
// StaffScheduleManagePage 공용(중복 정의 통합). STAFF='진행자', ADMIN_STAFF='행정인력'로 표기 통일
// (assign/roles.ts·BE StaffRole enum 주석과 일치).
export const STAFF_ROLE_LABELS: Record<StaffRoleValue, string> = {
  LECTURER: '강사',
  COUNSELOR: '상담사',
  STAFF: '진행자',
  PROJECT_MANAGER: 'PM',
  PROJECT_LEADER: 'PL',
  ADMIN_STAFF: '행정인력',
};

// enum명(문자열)을 한글 라벨로 변환. 미배정·알 수 없는 값이면 원본 문자열 또는 '-'.
export function staffRoleLabel(role?: string | null): string {
  if (!role) return '-';
  return STAFF_ROLE_LABELS[role as StaffRoleValue] ?? role;
}
