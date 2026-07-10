import { useMemo, useState } from 'react';
import { useRole } from '../context/RoleContext';
import { ASSIGN_ROLES, formatDateCol } from './assign/roles';
import type { AssignRole } from './assign/roles';
// MOCK: 시연용. 실제 API(getCourses / getStaffSchedules / getCourseDailyStaffCandidates,
// saveCourseDailyStaff) 준비 시 assignMock 제거 후 각 훅을 API 호출로 교체한다. (BE #36, FE #13)
import { MOCK_COURSES, MOCK_STAFF, mockCandidatesFor } from './assign/assignMock';
import type { AssignStaff } from './assign/assignMock';

// 배정 그리드: { rowKey: { dateISO: userId } }
type Grid = Record<string, Record<string, number | undefined>>;

// 상담사 행 키: counselor-0, counselor-1 ...
const counselorRowKey = (idx: number) => `counselor-${idx}`;

const ASSIGN_EDIT_ROLES = ['ADMIN', 'REGIONAL_MANAGER', 'OPERATOR'];

export default function AssignPage() {
  const { roleConfig } = useRole();
  const canEdit = ASSIGN_EDIT_ROLES.includes(roleConfig.role);

  const years = useMemo(
    () => Array.from(new Set(MOCK_COURSES.map((c) => c.year))).sort((a, b) => b - a),
    [],
  );

  const [selectedYear, setSelectedYear] = useState<number>(years[0]);
  const coursesInYear = useMemo(
    () => MOCK_COURSES.filter((c) => c.year === selectedYear),
    [selectedYear],
  );

  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>(coursesInYear[0]?.courseId);
  const selectedCourse = useMemo(
    () => MOCK_COURSES.find((c) => c.courseId === selectedCourseId),
    [selectedCourseId],
  );
  const dates = selectedCourse?.dates ?? [];

  const [counselorCount, setCounselorCount] = useState(1);
  const [grid, setGrid] = useState<Grid>({});
  const [bulk, setBulk] = useState<Record<string, number | ''>>({});

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    const first = MOCK_COURSES.find((c) => c.year === year);
    setSelectedCourseId(first?.courseId);
    resetBoard();
  };

  const handleCourseChange = (courseId: number) => {
    setSelectedCourseId(courseId);
    resetBoard();
  };

  const resetBoard = () => {
    setGrid({});
    setBulk({});
    setCounselorCount(1);
  };

  const setCell = (rowKey: string, dateISO: string, userId: number | undefined) => {
    setGrid((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [dateISO]: userId },
    }));
  };

  // 일괄 적용: 선택 직원을 해당 역할 행의 모든 날짜에 채운다(불가일은 건너뜀).
  const applyBulk = (role: AssignRole) => {
    const userId = bulk[role.key];
    if (!userId) return;
    const rowKey = role.multi ? counselorRowKey(0) : role.key;
    setGrid((prev) => {
      const row = { ...prev[rowKey] };
      dates.forEach((d) => {
        const available = mockCandidatesFor(role.staffRole, d).some((s) => s.userId === userId);
        if (available) row[d] = userId;
      });
      return { ...prev, [rowKey]: row };
    });
  };

  const addCounselor = () => setCounselorCount((n) => n + 1);
  const removeCounselor = (idx: number) => {
    setCounselorCount((n) => Math.max(1, n - 1));
    setGrid((prev) => {
      const next = { ...prev };
      delete next[counselorRowKey(idx)];
      return next;
    });
  };

  // 셀 옵션: 해당 역할·날짜 후보(불가일 제외). 이미 선택된 직원이 불가로 빠졌다면 유지 표시.
  const cellOptions = (
    role: AssignRole,
    dateISO: string,
    selectedId: number | undefined,
  ): AssignStaff[] => {
    const options = mockCandidatesFor(role.staffRole, dateISO);
    if (selectedId && !options.some((s) => s.userId === selectedId)) {
      const picked = MOCK_STAFF.find((s) => s.userId === selectedId);
      if (picked) return [picked, ...options];
    }
    return options;
  };

  // 일괄 적용 후보(역할 전체, 날짜 무관)
  const bulkOptions = (role: AssignRole): AssignStaff[] =>
    MOCK_STAFF.filter((s) => s.staffRoles.includes(role.staffRole));

  const handleSave = () => {
    if (!selectedCourse) return;
    const entries = ASSIGN_ROLES.flatMap((role) => {
      const rowKeys = role.multi
        ? Array.from({ length: counselorCount }, (_, i) => counselorRowKey(i))
        : [role.key];
      return rowKeys.flatMap((rk) =>
        dates
          .map((d) => ({ d, userId: grid[rk]?.[d] }))
          .filter((x): x is { d: string; userId: number } => Boolean(x.userId))
          .map(({ d, userId }) => ({
            scheduleDate: d,
            staffRole: role.staffRole,
            sessionType: role.session,
            userId,
          })),
      );
    });
    // MOCK: 실제로는 saveCourseDailyStaff({ courseId: selectedCourse.courseId, entries }) 호출.
    // eslint-disable-next-line no-alert
    alert(`저장(시안): ${selectedCourse.regionName} ${selectedCourse.localCourseNumber}회차 · ${entries.length}건`);
  };

  // 표에 렌더할 행 목록(상담사는 counselorCount 만큼 확장)
  const rowDefs = ASSIGN_ROLES.flatMap((role) =>
    role.multi
      ? Array.from({ length: counselorCount }, (_, i) => ({
          role,
          rowKey: counselorRowKey(i),
          label: counselorCount > 1 ? `${role.label} ${i + 1}` : role.label,
          counselorIdx: i,
        }))
      : [{ role, rowKey: role.key, label: role.label, counselorIdx: -1 }],
  );

  return (
    <section className="view active" id="view-assign">
      <div className="perm-bar">
        <span className="pb-ic">🧩</span>
        회차별 인력 배정 (역할 × 날짜) · {canEdit ? '배정·수정 가능' : '조회만 가능'}
      </div>

      {/* 회차 선택 */}
      <div className="att-tools">
        <span className="select">
          <span className="ico">년도</span>
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년 ▾
              </option>
            ))}
          </select>
        </span>
        <span className="select">
          <span className="ico">회차</span>
          <select
            value={selectedCourseId ?? ''}
            onChange={(e) => handleCourseChange(Number(e.target.value))}
            style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
          >
            {coursesInYear.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.regionName} {c.localCourseNumber}회차 ({c.status}) ▾
              </option>
            ))}
          </select>
        </span>
        {selectedCourse && (
          <span className="muted" style={{ fontSize: '12.5px' }}>
            · 전체 {selectedCourse.courseNumber}기 · 교육 {dates[0]} ~ {dates[dates.length - 1]}
          </span>
        )}
      </div>

      {!selectedCourse ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
          선택한 년도에 회차가 없습니다.
        </div>
      ) : (
        <>
          {/* 일괄 적용 카드 */}
          <div className="card">
            <div className="card-h">
              <b>일괄 적용</b>
              <span className="muted" style={{ fontSize: '12px' }}>
                역할별 직원을 선택해 전체 날짜에 한 번에 적용 (불가일은 자동 제외)
              </span>
            </div>
            <div className="card-b">
              <div className="assign-bulk-grid">
                {ASSIGN_ROLES.map((role) => (
                  <div className="assign-bulk-item" key={role.key}>
                    <label>{role.label}</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select
                        className="assign-select"
                        value={bulk[role.key] ?? ''}
                        disabled={!canEdit}
                        onChange={(e) =>
                          setBulk((prev) => ({
                            ...prev,
                            [role.key]: e.target.value ? Number(e.target.value) : '',
                          }))
                        }
                      >
                        <option value="">— 선택 —</option>
                        {bulkOptions(role).map((s) => (
                          <option key={s.userId} value={s.userId}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button className="btn" disabled={!canEdit} onClick={() => applyBulk(role)}>
                        적용
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 날짜별 배정 표 */}
          <div className="card" style={{ marginTop: '12px' }}>
            <div className="card-b" style={{ padding: '6px 0' }}>
              <div className="tbl-wrap">
                <table className="att-table assign-table">
                  <thead>
                    <tr>
                      <th className="nm-col">역할</th>
                      {dates.map((d) => (
                        <th key={d}>{formatDateCol(d)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowDefs.map(({ role, rowKey, label, counselorIdx }) => (
                      <tr key={rowKey}>
                        <td className="nm-col">
                          <div className="pname">{label}</div>
                          {role.multi && counselorIdx === counselorCount - 1 && canEdit && (
                            <div className="assign-counselor-actions">
                              <button className="btn tiny" onClick={addCounselor}>
                                + 상담사
                              </button>
                              {counselorCount > 1 && (
                                <button className="btn tiny" onClick={() => removeCounselor(counselorIdx)}>
                                  − 삭제
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        {dates.map((d) => {
                          const selectedId = grid[rowKey]?.[d];
                          return (
                            <td key={d}>
                              <select
                                className="assign-select"
                                value={selectedId ?? ''}
                                disabled={!canEdit}
                                onChange={(e) =>
                                  setCell(rowKey, d, e.target.value ? Number(e.target.value) : undefined)
                                }
                              >
                                <option value="">—</option>
                                {cellOptions(role, d, selectedId).map((s) => (
                                  <option key={s.userId} value={s.userId}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button className="btn primary" disabled={!canEdit} onClick={handleSave}>
              배정 저장
            </button>
          </div>
        </>
      )}

      <p className="note">
        ※ 셀 선택지는 해당 날짜에 근무 가능한 직원만 표시됩니다 (캘린더에서 불가로 지정한 날짜 제외).
        상담사는 1명 이상 등록할 수 있습니다.
      </p>
    </section>
  );
}
