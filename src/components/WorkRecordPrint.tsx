import { useEffect } from 'react';
import type { CourseDetail } from '../api/courses';
import type {
  CourseDailyStaffItem,
  SessionTypeValue,
  StaffRoleValue,
} from '../api/courseDailyStaff';
import { sessionTimes, workDescForRole, workRecordRoleLabel } from '../pages/assign/workRecord';
import './WorkRecordPrint.css';

// 근무기록표(예: docs/희리패_근무기록표.png) 인쇄 오버레이.
// 회차의 배정 인력을 교육일자별 표 1장으로 렌더하고 window.print() 로 출력한다.
// targetIso 가 있으면 해당 교육일 1장만, 없으면 전체 교육일을 각각 1장씩 출력한다.

type Props = {
  course: CourseDetail;
  dailyStaff: CourseDailyStaffItem[];
  targetIso?: string;
  onClose: () => void;
};

// 표에 빈 행을 채워 양식처럼 보이게 하는 최소 행 수(예시 양식과 유사)
const MIN_ROWS = 12;

// 역할 정렬 우선순위(예시 양식 순서: PM → PL → 행정 → 진행자 → 강사 → 상담사)
const ROLE_ORDER: Record<StaffRoleValue, number> = {
  PROJECT_MANAGER: 0,
  PROJECT_LEADER: 1,
  ADMIN_STAFF: 2,
  STAFF: 3,
  LECTURER: 4,
  COUNSELOR: 5,
};

// 세션 정렬(오전 → 오후 → 종일)
const SESSION_ORDER: Record<SessionTypeValue, number> = { AM: 0, PM: 1, FULL: 2 };

// 교육일(day1~day5) → { iso, day }[] (값 있는 날짜만)
function educationDates(course: CourseDetail): { iso: string; day: number }[] {
  return [course.day1Date, course.day2Date, course.day3Date, course.day4Date, course.day5Date]
    .map((iso, idx) => ({ iso, day: idx + 1 }))
    .filter((d): d is { iso: string; day: number } => Boolean(d.iso));
}

// ISO(yyyy-MM-dd) → "yyyy.MM.dd" (예시 양식 표기)
function formatWorkDate(iso: string): string {
  return iso.replaceAll('-', '.');
}

function sortAssignments(rows: CourseDailyStaffItem[]): CourseDailyStaffItem[] {
  return [...rows].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.staffRole] ?? 99) - (ROLE_ORDER[b.staffRole] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    const sessionDiff = (SESSION_ORDER[a.sessionType] ?? 9) - (SESSION_ORDER[b.sessionType] ?? 9);
    if (sessionDiff !== 0) return sessionDiff;
    return (a.name ?? '').localeCompare(b.name ?? '', 'ko');
  });
}

export function WorkRecordPrint({ course, dailyStaff, targetIso, onClose }: Props) {
  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allDates = educationDates(course);
  const dates = targetIso ? allDates.filter((d) => d.iso === targetIso) : allDates;

  const regionLabel = course.regionName ?? '';
  const roundLabel = course.localCourseNumber != null ? `${course.localCourseNumber}회차` : '';

  return (
    <div className="wr-overlay" role="dialog" aria-modal="true" aria-label="근무기록표 인쇄">
      <div className="wr-toolbar">
        <span className="wr-toolbar-title">
          근무기록표 미리보기 · {regionLabel} {roundLabel} ({dates.length}장)
        </span>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          인쇄
        </button>
        <button type="button" className="btn" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="wr-print-area">
        {dates.length === 0 ? (
          <p className="wr-empty">교육일자가 없어 출력할 근무기록표가 없습니다.</p>
        ) : (
          dates.map((d) => {
            const rows = sortAssignments(dailyStaff.filter((it) => it.scheduleDate === d.iso));
            const emptyCount = Math.max(0, MIN_ROWS - rows.length);
            return (
              <section className="wr-page" key={d.iso}>
                <div className="wr-attach">[붙임]</div>
                <h1 className="wr-title">근 무 기 록 표</h1>
                <table className="wr-table">
                  <colgroup>
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>성명</th>
                      <th>직책</th>
                      <th>근무일자</th>
                      <th>출근</th>
                      <th>퇴근</th>
                      <th>업무내용</th>
                      <th>본인서명</th>
                      <th>확인서명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it) => {
                      const times = sessionTimes(
                        it.sessionType,
                        course.educationStartTime,
                        course.educationEndTime,
                      );
                      return (
                        <tr key={`${it.userId}-${it.staffRole}-${it.sessionType}`}>
                          <td>{workRecordRoleLabel(it.staffRole)}</td>
                          <td>{it.name ?? ''}</td>
                          <td>{it.position ?? ''}</td>
                          <td>{formatWorkDate(d.iso)}</td>
                          <td>{times.in}</td>
                          <td>{times.out}</td>
                          <td className="wr-desc">{workDescForRole(it.staffRole)}</td>
                          <td />
                          <td />
                        </tr>
                      );
                    })}
                    {Array.from({ length: emptyCount }).map((_, i) => (
                      <tr key={`empty-${i}`} className="wr-empty-row">
                        <td>&nbsp;</td>
                        <td />
                        <td />
                        <td />
                        <td />
                        <td />
                        <td />
                        <td />
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="wr-note">* 근무기록표는 근무일자별로 기재하여야 함</p>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
