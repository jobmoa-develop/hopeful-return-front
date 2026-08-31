import type { SessionTypeValue, StaffRoleValue } from '../../api/courseDailyStaff';
import { STAFF_ROLE_LABELS } from '../../utils/staffRole';

// 근무기록표(인쇄) 전용 상수·헬퍼.
// 예시 양식(docs/희리패_근무기록표.png)의 '구분'·'업무내용'·'출근/퇴근'을 채운다.

// 구분(역할) 라벨. 공용 STAFF_ROLE_LABELS 재사용.
// 주의: 예시 양식은 강사를 '내부강사'/'상근강사'로 구분하나, 배정 데이터(course_staff.staff_role)는
// LECTURER 단일값이라 구분 불가 → 모두 '강사'로 표기한다.
export function workRecordRoleLabel(role?: StaffRoleValue | string | null): string {
  if (!role) return '';
  return STAFF_ROLE_LABELS[role as StaffRoleValue] ?? String(role);
}

// 업무내용 — 예시 양식의 역할별 고정 문구. 상담사 등 미정의 역할은 빈 문자열(수기).
export const WORK_DESC_BY_ROLE: Partial<Record<StaffRoleValue, string>> = {
  PROJECT_MANAGER: '심화교육 수행 관련 본 과업의 총 책임자',
  PROJECT_LEADER: '심화교육 수행 관련 본 과업의 총 책임자',
  ADMIN_STAFF: '교육운영과 관련한 예산집행, 행정업무 처리',
  STAFF: '교육 장소에 상주, 교육장 및 교육생 출결관리 등 교육진행 담당',
  LECTURER: '교육과정에 따른 강의 진행',
};

export function workDescForRole(role?: StaffRoleValue | string | null): string {
  if (!role) return '';
  return WORK_DESC_BY_ROLE[role as StaffRoleValue] ?? '';
}

// "HH:mm[:ss]" → "HH:mm" (없으면 빈 문자열)
function hhmm(time?: string | null): string {
  if (!time) return '';
  return time.slice(0, 5);
}

// "HH:mm" → 분(minutes). 파싱 실패 시 NaN.
function toMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

// 분(minutes) → "HH:mm"
function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 세션(FULL/AM/PM) + 회차 교육 시작·종료시간 → 출근/퇴근 시각.
// FULL = 시작~종료, AM = 시작~중간, PM = 중간~종료.
// ⚠️ 중간(midpoint)은 시작·종료의 산술 중앙값이며, 휴게시간(breakMinutes)은 반영하지 않는다.
export function sessionTimes(
  session: SessionTypeValue,
  startTime?: string | null,
  endTime?: string | null,
): { in: string; out: string } {
  const start = hhmm(startTime);
  const end = hhmm(endTime);
  if (session === 'FULL') return { in: start, out: end };

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    // 시간 정보가 없으면 전일 기준으로 폴백(수기 보정 가능)
    return { in: start, out: end };
  }
  const mid = fromMinutes(Math.round((startMin + endMin) / 2));
  return session === 'AM' ? { in: start, out: mid } : { in: mid, out: end };
}
