import type { SessionTypeValue, StaffRoleValue } from '../../api/courseDailyStaff';

// 인력 배정 표의 역할 행 정의(단일 소스). BE StaffRole/SessionType 과 매핑된다.
export type AssignRole = {
  key: string; // 행 식별자
  label: string; // 표시명
  staffRole: StaffRoleValue;
  session: SessionTypeValue;
  multi: boolean; // 상담사처럼 여러 명 배정 가능한지
};

export const ASSIGN_ROLES: AssignRole[] = [
  { key: 'lecturerAM', label: '오전 강사', staffRole: 'LECTURER', session: 'AM', multi: false },
  { key: 'lecturerPM', label: '오후 강사', staffRole: 'LECTURER', session: 'PM', multi: false },
  { key: 'pm', label: 'PM', staffRole: 'PROJECT_MANAGER', session: 'FULL', multi: false },
  { key: 'pl', label: 'PL', staffRole: 'PROJECT_LEADER', session: 'FULL', multi: false },
  { key: 'host', label: '진행자', staffRole: 'STAFF', session: 'FULL', multi: false },
  { key: 'admin', label: '행정인력', staffRole: 'ADMIN_STAFF', session: 'FULL', multi: false },
  { key: 'counselor', label: '상담사', staffRole: 'COUNSELOR', session: 'FULL', multi: true },
];

// 요일 라벨
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ISO 날짜(yyyy-MM-dd) → "MM-DD(요일)" 표시
export function formatDateCol(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}(${WEEKDAYS[d.getDay()]})`;
}
