import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useRole } from '../context/RoleContext';
import { ASSIGN_ROLES, formatDateCol } from './assign/roles';
import type { AssignRole } from './assign/roles';
import { getCourses } from '../api/courses';
import type { CourseSummary } from '../api/courses';
import {
  getCourseDailyStaff,
  getCourseDailyStaffCandidates,
  saveCourseDailyStaff,
} from '../api/courseDailyStaff';
import type { CourseDailyStaffItem, StaffCandidate } from '../api/courseDailyStaff';

// 배정 그리드: { rowKey: { dateISO: userId } }
type Grid = Record<string, Record<string, number | undefined>>;

// select 옵션의 최소 형태(후보/기존 선택 공통)
type StaffOption = { userId: number; name: string };

const ASSIGN_EDIT_ROLES = ['ADMIN', 'REGIONAL_MANAGER', 'OPERATOR'];

// 상담사 행 키: counselor-0, counselor-1 ...
const counselorRowKey = (idx: number) => `counselor-${idx}`;

function getErrorMessage(error: unknown) {
  if (isAxiosError<{ error?: string; message?: string }>(error)) {
    const data = error.response?.data;
    return data?.error ?? data?.message ?? '요청 처리 중 오류가 발생했습니다.';
  }
  return '요청 처리 중 오류가 발생했습니다.';
}

// 강좌의 교육 연도(BE year 필드 우선, 없으면 day1Date 앞 4자리에서 파생)
const yearOf = (c: CourseSummary): number | undefined =>
  c.year ?? (c.day1Date ? Number(c.day1Date.slice(0, 4)) : undefined);

// 강좌의 교육일(day1~day5) → ISO 배열(빈 값 제외)
const courseDates = (c?: CourseSummary): string[] =>
  [c?.day1Date, c?.day2Date, c?.day3Date, c?.day4Date, c?.day5Date].filter(
    (d): d is string => Boolean(d),
  );

// 기존 배정 목록 → 그리드 역피벗(상담사는 날짜별 다중 → counselor-0,1,… 확장)
function buildGridFromAssignments(assignments: CourseDailyStaffItem[]): {
  grid: Grid;
  counselorCount: number;
  nameById: Record<number, string>;
} {
  const grid: Grid = {};
  const nameById: Record<number, string> = {};
  const counselorByDate: Record<string, number[]> = {};

  assignments.forEach((a) => {
    if (a.name) nameById[a.userId] = a.name;
    const role = ASSIGN_ROLES.find(
      (r) => r.staffRole === a.staffRole && r.session === a.sessionType,
    );
    if (!role) return;
    if (role.multi) {
      (counselorByDate[a.scheduleDate] ??= []).push(a.userId);
    } else {
      grid[role.key] = { ...(grid[role.key] ?? {}), [a.scheduleDate]: a.userId };
    }
  });

  let counselorCount = 1;
  Object.entries(counselorByDate).forEach(([date, ids]) => {
    ids.forEach((uid, idx) => {
      const rk = counselorRowKey(idx);
      grid[rk] = { ...(grid[rk] ?? {}), [date]: uid };
    });
    counselorCount = Math.max(counselorCount, ids.length);
  });

  return { grid, counselorCount, nameById };
}

export default function AssignPage() {
  const { roleConfig } = useRole();
  const canEdit = ASSIGN_EDIT_ROLES.includes(roleConfig.role);

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [candidates, setCandidates] = useState<StaffCandidate[]>([]);
  const [nameById, setNameById] = useState<Record<number, string>>({});

  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>();

  const [counselorCount, setCounselorCount] = useState(1);
  const [grid, setGrid] = useState<Grid>({});
  const [bulk, setBulk] = useState<Record<string, number | ''>>({});
  const [hasExistingAssignments, setHasExistingAssignments] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const years = useMemo(() => {
    const set = new Set<number>();
    courses.forEach((c) => {
      const y = yearOf(c);
      if (y !== undefined) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [courses]);

  const coursesInYear = useMemo(
    () => courses.filter((c) => yearOf(c) === selectedYear),
    [courses, selectedYear],
  );

  const selectedCourse = useMemo(
    () => courses.find((c) => c.courseId === selectedCourseId),
    [courses, selectedCourseId],
  );
  const dates = courseDates(selectedCourse);

  // 최초 진입: 강좌 목록 로드 후 기본 년도/회차 선택
  useEffect(() => {
    const loadCourses = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const { data: response } = await getCourses({ page: 0, size: 200 });
        const list = response.data.content ?? [];
        setCourses(list);
        const firstYear = list
          .map(yearOf)
          .filter((y): y is number => y !== undefined)
          .sort((a, b) => b - a)[0];
        if (firstYear !== undefined) {
          setSelectedYear(firstYear);
          setSelectedCourseId(list.find((c) => yearOf(c) === firstYear)?.courseId);
        }
      } catch (error) {
        setCourses([]);
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    };
    void loadCourses();
  }, []);

  // 회차(강좌) 선택 시: 후보 + 기존 배정 로드
  useEffect(() => {
    if (!selectedCourseId) {
      resetBoard();
      setCandidates([]);
      return;
    }
    void loadCourseAssignment(selectedCourseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId]);

  const loadCourseAssignment = async (courseId: number) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      // 기존 배정(조회 권한만 필요)
      const assignRes = await getCourseDailyStaff(courseId);
      const assignments = assignRes.data.data.assignments ?? [];

      // 후보(편집 권한 필요 — 조회 전용 사용자는 403 → 후보만 비움)
      let candidateList: StaffCandidate[] = [];
      try {
        candidateList = (await getCourseDailyStaffCandidates(courseId)).data.data.candidates ?? [];
      } catch {
        candidateList = [];
      }

      const { grid: nextGrid, counselorCount: nextCount, nameById: assignNames } =
        buildGridFromAssignments(assignments);
      const candNames: Record<number, string> = {};
      candidateList.forEach((c) => {
        candNames[c.userId] = c.name;
      });

      setCandidates(candidateList);
      setNameById({ ...candNames, ...assignNames });
      setGrid(nextGrid);
      setCounselorCount(nextCount);
      setBulk({});
      setHasExistingAssignments(assignments.length > 0);
    } catch (error) {
      resetBoard();
      setCandidates([]);
      setHasExistingAssignments(false);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const resetBoard = () => {
    setGrid({});
    setBulk({});
    setCounselorCount(1);
    setHasExistingAssignments(false);
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    setSaveMessage('');
    setSelectedCourseId(courses.find((c) => yearOf(c) === year)?.courseId);
  };

  const handleCourseChange = (courseId: number) => {
    setSaveMessage('');
    setSelectedCourseId(courseId);
  };

  const setCell = (rowKey: string, dateISO: string, userId: number | undefined) => {
    setGrid((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [dateISO]: userId },
    }));
  };

  // 해당 유저가 역할·날짜에 배정 가능한지(후보 목록 + 가용일 기준)
  const isCandidateAvailable = (userId: number, role: AssignRole, dateISO: string): boolean => {
    const c = candidates.find((x) => x.userId === userId);
    if (!c || !c.staffRoles.includes(role.staffRole)) return false;
    return c.availability.some(
      (a) => a.scheduleDate === dateISO && (a.sessionType === 'FULL' || a.sessionType === role.session),
    );
  };

  // 일괄 적용: 선택된 모든 역할을 각 행의 전체 날짜에 한 번에 채운다(불가일은 건너뜀).
  const applyAllBulk = () => {
    setGrid((prev) => {
      const next = { ...prev };
      ASSIGN_ROLES.forEach((role) => {
        const userId = bulk[role.key];
        if (!userId) return;
        const rowKey = role.multi ? counselorRowKey(0) : role.key;
        const row = { ...next[rowKey] };
        dates.forEach((d) => {
          if (isCandidateAvailable(userId, role, d)) row[d] = userId;
        });
        next[rowKey] = row;
      });
      return next;
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

  // 셀 옵션: 해당 역할·날짜 후보(불가일 제외). 이미 선택된 직원이 후보에서 빠졌다면 유지 표시.
  const cellOptions = (
    role: AssignRole,
    dateISO: string,
    selectedId: number | undefined,
  ): StaffOption[] => {
    const options: StaffOption[] = candidates
      .filter(
        (c) =>
          c.staffRoles.includes(role.staffRole) &&
          c.availability.some(
            (a) =>
              a.scheduleDate === dateISO &&
              (a.sessionType === 'FULL' || a.sessionType === role.session),
          ),
      )
      .map((c) => ({ userId: c.userId, name: c.name }));
    if (selectedId && !options.some((o) => o.userId === selectedId)) {
      return [{ userId: selectedId, name: nameById[selectedId] ?? `#${selectedId}` }, ...options];
    }
    return options;
  };

  // 일괄 적용 후보(역할 전체, 날짜 무관)
  const bulkOptions = (role: AssignRole): StaffOption[] =>
    candidates
      .filter((c) => c.staffRoles.includes(role.staffRole))
      .map((c) => ({ userId: c.userId, name: c.name }));

  const buildEntries = () =>
    ASSIGN_ROLES.flatMap((role) => {
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

  const handleSave = async () => {
    if (!selectedCourse || !selectedCourseId) return;
    const wasEditing = hasExistingAssignments;
    const entries = buildEntries();
    setIsSaving(true);
    setErrorMessage('');
    setSaveMessage('');
    try {
      const { data: response } = await saveCourseDailyStaff({
        courseId: selectedCourseId,
        entries,
      });
      await loadCourseAssignment(selectedCourseId);
      setSaveMessage(`${wasEditing ? '수정' : '저장'} 완료: ${response.data.saved}건`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
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

  const controlsDisabled = !canEdit || isLoading || isSaving;

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
            value={selectedYear ?? ''}
            disabled={isLoading || years.length === 0}
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
            disabled={isLoading || coursesInYear.length === 0}
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
        {selectedCourse && dates.length > 0 && (
          <span className="muted" style={{ fontSize: '12.5px' }}>
            · 전체 {selectedCourse.courseNumber}기 · 교육 {dates[0]} ~ {dates[dates.length - 1]}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="card" style={{ padding: '12px 16px', color: 'var(--danger, #d33)' }}>
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
          불러오는 중…
        </div>
      ) : !selectedCourse || dates.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
          {courses.length === 0 ? '표시할 회차가 없습니다.' : '선택한 년도에 회차가 없거나 교육일이 지정되지 않았습니다.'}
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
                    <select
                      className="assign-select"
                      value={bulk[role.key] ?? ''}
                      disabled={controlsDisabled}
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
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button className="btn primary" disabled={controlsDisabled} onClick={applyAllBulk}>
                  일괄 적용
                </button>
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
                              <button className="btn tiny" disabled={isSaving} onClick={addCounselor}>
                                + 상담사
                              </button>
                              {counselorCount > 1 && (
                                <button
                                  className="btn tiny"
                                  disabled={isSaving}
                                  onClick={() => removeCounselor(counselorIdx)}
                                >
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
                                disabled={controlsDisabled}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
            <span className="muted" style={{ fontSize: '12.5px' }}>
              인원 일괄 적용 후 저장해야 강의회차에 정상 배정됩니다.
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {saveMessage && (
                <span className="muted" style={{ fontSize: '13px', color: 'var(--ok, #2a7)' }}>
                  {saveMessage}
                </span>
              )}
              <button className="btn primary" disabled={controlsDisabled} onClick={() => void handleSave()}>
                {isSaving
                  ? hasExistingAssignments
                    ? '수정 중…'
                    : '저장 중…'
                  : hasExistingAssignments
                    ? '배정 수정'
                    : '배정 저장'}
              </button>
            </div>
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
