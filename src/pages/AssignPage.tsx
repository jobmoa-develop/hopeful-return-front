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
import type {
  AssignConflict,
  AssignUnavailable,
  CandidateBusy,
  CourseDailyStaffItem,
  SessionTypeValue,
  StaffCandidate,
} from '../api/courseDailyStaff';

// 배정 그리드: { rowKey: { dateISO: userId } }
type Grid = Record<string, Record<string, number | undefined>>;

// select 옵션의 최소 형태(후보/기존 선택 공통)
type StaffOption = { userId: number; name: string };

// 일괄 적용 시 그리드에 채울 셀 1건(충돌이면 conflict 에 타 회차 배정 정보)
type BulkFill = {
  rowKey: string;
  dateISO: string;
  userId: number;
  conflict?: CandidateBusy;
};

const ASSIGN_EDIT_ROLES = ['ADMIN', 'REGIONAL_MANAGER', 'OPERATOR'];
const PM_ROLE = 'PROJECT_MANAGER';

// 상담사 행 키: counselor-0, counselor-1 ...
const counselorRowKey = (idx: number) => `counselor-${idx}`;

// 시간대 겹침: FULL 은 모든 세션과, 그 외에는 동일 세션일 때만 겹친다.
const sessionsOverlap = (a: SessionTypeValue, b: SessionTypeValue) =>
  a === 'FULL' || b === 'FULL' || a === b;

// 세션 코드 → 표시 라벨
const sessionLabel = (s: SessionTypeValue): string =>
  s === 'AM' ? '오전' : s === 'PM' ? '오후' : '종일';

// 후보가 해당 날짜·세션에 타 회차 배정(busy)으로 겹치는지 → 겹치는 busy 반환
const busyConflictOf = (
  candidate: StaffCandidate | undefined,
  dateISO: string,
  session: SessionTypeValue,
): CandidateBusy | undefined =>
  candidate?.busy?.find(
    (b) => b.scheduleDate === dateISO && sessionsOverlap(session, b.sessionType),
  );

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
  [c?.day1Date, c?.day2Date, c?.day3Date, c?.day4Date, c?.day5Date].filter((d): d is string =>
    Boolean(d),
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
  const canEdit = roleConfig.roles.some((r) => ASSIGN_EDIT_ROLES.includes(r));

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [candidates, setCandidates] = useState<StaffCandidate[]>([]);
  const [nameById, setNameById] = useState<Record<number, string>>({});

  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>();

  const [counselorCount, setCounselorCount] = useState(1);
  const [grid, setGrid] = useState<Grid>({});
  // 일괄 적용 선택값: 단일 역할(role.key→userId) + 상담사 다중(인덱스별 userId)
  const [bulk, setBulk] = useState<Record<string, number | ''>>({});
  const [bulkCounselors, setBulkCounselors] = useState<(number | '')[]>(['']);
  const [hasExistingAssignments, setHasExistingAssignments] = useState(false);

  // 일괄 적용 중복 경고 모달 / 저장 중복 확인 모달 / 근무 불가일 차단(하드 블록) 모달
  const [bulkConflict, setBulkConflict] = useState<BulkFill[] | null>(null);
  const [saveConflict, setSaveConflict] = useState<AssignConflict[] | null>(null);
  const [unavailableBlock, setUnavailableBlock] = useState<AssignUnavailable[] | null>(null);

  // 신규/수정 셀 구분 표기용 — 로드 시점 그리드 스냅샷(깊은 복사)
  const [originalGrid, setOriginalGrid] = useState<Grid>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  // PM 후보(박문순) — PM 은 이 인력으로 전 날짜 고정, 편집 불가
  const pmCandidate = useMemo(
    () => candidates.find((c) => c.staffRoles.includes(PM_ROLE)),
    [candidates],
  );

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
      const assignRes = await getCourseDailyStaff(courseId);
      const assignments = assignRes.data.data.assignments ?? [];

      let candidateList: StaffCandidate[] = [];
      try {
        candidateList = (await getCourseDailyStaffCandidates(courseId)).data.data.candidates ?? [];
      } catch {
        candidateList = [];
      }

      const {
        grid: nextGrid,
        counselorCount: nextCount,
        nameById: assignNames,
      } = buildGridFromAssignments(assignments);
      const candNames: Record<number, string> = {};
      candidateList.forEach((c) => {
        candNames[c.userId] = c.name;
      });

      setCandidates(candidateList);
      setNameById({ ...candNames, ...assignNames });
      setGrid(nextGrid);
      setOriginalGrid(structuredClone(nextGrid)); // 신규/수정 비교 기준 스냅샷
      setCounselorCount(nextCount);
      setBulk({});
      setBulkCounselors(Array.from({ length: nextCount }, () => '' as const));
      setBulkConflict(null);
      setSaveConflict(null);
      setUnavailableBlock(null);
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
    setOriginalGrid({});
    setBulk({});
    setBulkCounselors(['']);
    setCounselorCount(1);
    setBulkConflict(null);
    setSaveConflict(null);
    setUnavailableBlock(null);
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
      (a) =>
        a.scheduleDate === dateISO && (a.sessionType === 'FULL' || a.sessionType === role.session),
    );
  };

  // 상담사 추가/삭제 — counselorCount 를 일괄/일자별이 공유하므로 양쪽이 함께 늘고 준다.
  const addCounselor = () => {
    setCounselorCount((n) => n + 1);
    setBulkCounselors((b) => [...b, '']);
  };
  const removeCounselor = (idx: number) => {
    setCounselorCount((n) => Math.max(1, n - 1));
    setBulkCounselors((b) => (b.length > 1 ? b.slice(0, -1) : b));
    setGrid((prev) => {
      const next = { ...prev };
      delete next[counselorRowKey(idx)];
      return next;
    });
  };

  // 일괄 적용 대상 셀 계산(역할별 선택 인력 × 전 날짜, 불가일 제외). PM 은 고정이라 제외.
  const computeBulkFills = (): BulkFill[] => {
    const fills: BulkFill[] = [];
    const pushFor = (rowKey: string, userId: number, role: AssignRole) => {
      const c = candidates.find((x) => x.userId === userId);
      dates.forEach((d) => {
        if (!isCandidateAvailable(userId, role, d)) return;
        fills.push({ rowKey, dateISO: d, userId, conflict: busyConflictOf(c, d, role.session) });
      });
    };
    ASSIGN_ROLES.forEach((role) => {
      if (role.staffRole === PM_ROLE) return;
      if (role.multi) {
        bulkCounselors.forEach((uid, i) => {
          if (uid) pushFor(counselorRowKey(i), uid, role);
        });
      } else {
        const uid = bulk[role.key];
        if (uid) pushFor(role.key, uid, role);
      }
    });
    return fills;
  };

  const applyFills = (fills: BulkFill[], includeConflicts: boolean) => {
    setGrid((prev) => {
      const next = { ...prev };
      fills.forEach((f) => {
        if (!includeConflicts && f.conflict) return;
        next[f.rowKey] = { ...next[f.rowKey], [f.dateISO]: f.userId };
      });
      return next;
    });
  };

  // 일괄 적용: 중복(타 회차 배정)이 있으면 경고 모달, 없으면 즉시 적용.
  const onApplyBulk = () => {
    const fills = computeBulkFills();
    if (fills.some((f) => f.conflict)) {
      setBulkConflict(fills);
    } else {
      applyFills(fills, true);
    }
  };

  // 해당 역할·날짜·세션에 실제 배정 가능한 후보(불가일 + 타 회차 중복 제외). 현재 선택자 주입 없음
  // → 셀 가용 인원 수/불가 표기 계산에 사용. PM 은 busy 검사 면제(전 날짜 고정).
  const availableCandidatesForCell = (role: AssignRole, dateISO: string): StaffCandidate[] => {
    const isPm = role.staffRole === PM_ROLE;
    return candidates.filter(
      (c) =>
        c.staffRoles.includes(role.staffRole) &&
        c.availability.some(
          (a) =>
            a.scheduleDate === dateISO &&
            (a.sessionType === 'FULL' || a.sessionType === role.session),
        ) &&
        (isPm || !busyConflictOf(c, dateISO, role.session)),
    );
  };

  // 셀 옵션: 가용 후보 + 현재 선택자(가용 목록에 없더라도 유지 표시). PM 은 박문순 고정.
  const cellOptions = (
    role: AssignRole,
    dateISO: string,
    selectedId: number | undefined,
  ): StaffOption[] => {
    const options: StaffOption[] = availableCandidatesForCell(role, dateISO).map((c) => ({
      userId: c.userId,
      name: c.name,
    }));
    if (selectedId && !options.some((o) => o.userId === selectedId)) {
      return [{ userId: selectedId, name: nameById[selectedId] ?? `#${selectedId}` }, ...options];
    }
    return options;
  };

  // 로드 시점 대비 셀 상태: 'new'(빈→채움) | 'modified'(값 변경·해제) | 'same'
  const cellDiff = (rowKey: string, dateISO: string): 'new' | 'modified' | 'same' => {
    const orig = originalGrid[rowKey]?.[dateISO];
    const cur = grid[rowKey]?.[dateISO];
    if (cur === orig) return 'same';
    return orig == null ? 'new' : 'modified';
  };

  // 일괄 적용 후보(역할 전체, 날짜 무관). PM 은 별도 고정 처리.
  const bulkOptions = (role: AssignRole): StaffOption[] =>
    candidates
      .filter((c) => c.staffRoles.includes(role.staffRole))
      .map((c) => ({ userId: c.userId, name: c.name }));

  const buildEntries = () =>
    ASSIGN_ROLES.flatMap((role) => {
      // PM 은 박문순 고정 — grid 와 무관하게 전 교육일에 생성
      if (role.staffRole === PM_ROLE) {
        if (!pmCandidate) return [];
        return dates.map((d) => ({
          scheduleDate: d,
          staffRole: role.staffRole,
          sessionType: role.session,
          userId: pmCandidate.userId,
        }));
      }
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

  const doSave = async (confirmConflicts: boolean) => {
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
        confirmConflicts,
      });
      setSaveConflict(null);
      setUnavailableBlock(null);
      await loadCourseAssignment(selectedCourseId);
      setSaveMessage(`${wasEditing ? '수정' : '저장'} 완료: ${response.data.saved}건`);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        const items = (error.response.data?.data as (AssignConflict | AssignUnavailable)[]) ?? [];
        // 불가일 하드 블록(ASSIGN_ON_UNAVAILABLE_DATE)은 courseName 이 없어 중복 충돌과 구분된다.
        // override 없이 메시지만 노출(confirmConflicts 재요청 없음).
        const isUnavailable = items.length > 0 && (items[0] as AssignConflict).courseName == null;
        if (isUnavailable) {
          setUnavailableBlock(items as AssignUnavailable[]);
          setErrorMessage(getErrorMessage(error));
          return;
        }
        setSaveConflict(items as AssignConflict[]);
        return;
      }
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => void doSave(false);
  const confirmSaveMove = () => void doSave(true);

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
  const pmLabel = pmCandidate?.name ?? '박문순';

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
            style={{
              border: 'none',
              background: 'transparent',
              fontWeight: 'inherit',
              outline: 'none',
              cursor: 'pointer',
            }}
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
            style={{
              border: 'none',
              background: 'transparent',
              fontWeight: 'inherit',
              outline: 'none',
              cursor: 'pointer',
            }}
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
        <div
          className="card"
          style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
        >
          불러오는 중…
        </div>
      ) : !selectedCourse || dates.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
        >
          {courses.length === 0
            ? '표시할 회차가 없습니다.'
            : '선택한 년도에 회차가 없거나 교육일이 지정되지 않았습니다.'}
        </div>
      ) : (
        <>
          {/* 일괄 적용 카드 */}
          <div className="card">
            <div className="card-h">
              <b>일괄 적용</b>
              <span className="muted" style={{ fontSize: '12px' }}>
                역할별 직원을 선택해 전체 날짜에 한 번에 적용 (불가일·타 회차 중복은 확인 후 처리)
              </span>
            </div>
            <div className="card-b">
              <div className="assign-bulk-grid">
                {ASSIGN_ROLES.map((role) => {
                  // PM 은 박문순 고정(편집 불가)
                  if (role.staffRole === PM_ROLE) {
                    return (
                      <div className="assign-bulk-item" key={role.key}>
                        <label>{role.label}</label>
                        <select
                          className="assign-select"
                          value={pmCandidate?.userId ?? ''}
                          disabled
                        >
                          <option value={pmCandidate?.userId ?? ''}>{pmLabel} (고정)</option>
                        </select>
                      </div>
                    );
                  }
                  // 상담사: counselorCount 만큼 다중 셀렉트(일자별과 수 공유)
                  if (role.multi) {
                    return Array.from({ length: counselorCount }, (_, i) => (
                      <div className="assign-bulk-item" key={`${role.key}-${i}`}>
                        <label>{counselorCount > 1 ? `${role.label} ${i + 1}` : role.label}</label>
                        <select
                          className="assign-select"
                          value={bulkCounselors[i] ?? ''}
                          disabled={controlsDisabled}
                          onChange={(e) =>
                            setBulkCounselors((prev) => {
                              const next = [...prev];
                              next[i] = e.target.value ? Number(e.target.value) : '';
                              return next;
                            })
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
                    ));
                  }
                  // 단일 역할
                  return (
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
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button className="btn primary" disabled={controlsDisabled} onClick={onApplyBulk}>
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
                    {rowDefs.map(({ role, rowKey, label, counselorIdx }) => {
                      const isPm = role.staffRole === PM_ROLE;
                      return (
                        <tr key={rowKey}>
                          <td className="nm-col">
                            <div className="pname">{label}</div>
                            {role.multi && counselorIdx === counselorCount - 1 && canEdit && (
                              <div className="assign-counselor-actions">
                                <button
                                  className="btn tiny"
                                  disabled={isSaving}
                                  onClick={addCounselor}
                                >
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
                            // PM 셀은 박문순 고정(편집 불가)
                            if (isPm) {
                              return (
                                <td key={d}>
                                  <select
                                    className="assign-select"
                                    value={pmCandidate?.userId ?? ''}
                                    disabled
                                  >
                                    <option value={pmCandidate?.userId ?? ''}>{pmLabel}</option>
                                  </select>
                                </td>
                              );
                            }
                            const avail = availableCandidatesForCell(role, d);
                            // 가용 후보 0 + 현재 선택 없음 → 배정 불가일(세션) → 셀 비활성·불가 표기
                            const blocked = avail.length === 0 && !selectedId;
                            const diff = cellDiff(rowKey, d);
                            const tdClass = [
                              blocked ? 'assign-cell--unavailable' : '',
                              diff === 'new' ? 'assign-cell--new' : '',
                              diff === 'modified' ? 'assign-cell--modified' : '',
                            ]
                              .filter(Boolean)
                              .join(' ');
                            return (
                              <td
                                key={d}
                                className={tdClass || undefined}
                                title={
                                  diff === 'new'
                                    ? '신규 배정'
                                    : diff === 'modified'
                                      ? '수정됨'
                                      : undefined
                                }
                              >
                                <select
                                  className="assign-select"
                                  value={selectedId ?? ''}
                                  disabled={controlsDisabled || blocked}
                                  onChange={(e) =>
                                    setCell(
                                      rowKey,
                                      d,
                                      e.target.value ? Number(e.target.value) : undefined,
                                    )
                                  }
                                >
                                  <option value="">{blocked ? '불가' : '—'}</option>
                                  {cellOptions(role, d, selectedId).map((s) => (
                                    <option key={s.userId} value={s.userId}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                                <span
                                  className={`assign-cell__count${avail.length === 0 ? ' is-zero' : ''}`}
                                >
                                  {avail.length === 0 ? '불가' : `가용 ${avail.length}`}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginTop: '10px',
            }}
          >
            <span className="muted" style={{ fontSize: '12.5px' }}>
              인원 일괄 적용 후 저장해야 강의회차에 정상 배정됩니다.
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {saveMessage && (
                <span className="muted" style={{ fontSize: '13px', color: 'var(--ok, #2a7)' }}>
                  {saveMessage}
                </span>
              )}
              <button className="btn primary" disabled={controlsDisabled} onClick={handleSave}>
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

      {/* 일괄 적용 중복 경고 모달 */}
      {bulkConflict && (
        <ConflictModal
          title="타 회차 중복 배정 경고"
          description="아래 날짜의 인력이 폐강되지 않은 다른 회차에 이미 배정되어 있습니다."
          rows={bulkConflict
            .filter((f) => f.conflict)
            .map((f) => ({
              date: f.dateISO,
              name: nameById[f.userId] ?? `#${f.userId}`,
              detail: `${f.conflict!.courseName} · ${f.conflict!.staffRole}`,
            }))}
          actions={[
            {
              label: '중복 포함 적용',
              primary: true,
              onClick: () => {
                applyFills(bulkConflict, true);
                setBulkConflict(null);
              },
            },
            {
              label: '중복 일자만 제외',
              onClick: () => {
                applyFills(bulkConflict, false);
                setBulkConflict(null);
              },
            },
            { label: '취소', onClick: () => setBulkConflict(null) },
          ]}
        />
      )}

      {/* 저장 시 중복 최종 확인 모달 */}
      {saveConflict && (
        <ConflictModal
          title="저장 중복 확인"
          description="아래 배정이 다른 회차와 중복됩니다. 현재 회차로 이동하여 저장하시겠습니까?"
          rows={saveConflict.map((c) => ({
            date: c.scheduleDate,
            name: c.name,
            detail: `${c.courseName} · ${c.staffRole}`,
          }))}
          actions={[
            {
              label: '현재 회차로 이동 저장',
              primary: true,
              onClick: () => {
                setSaveConflict(null);
                confirmSaveMove();
              },
            },
            { label: '취소', onClick: () => setSaveConflict(null) },
          ]}
        />
      )}

      {/* 근무 불가일 배정 불가(하드 블록) — override 없이 확인만 */}
      {unavailableBlock && (
        <ConflictModal
          title="근무 불가일 배정 불가"
          description="아래 인력은 해당 날짜·시간대에 근무 불가로 등록되어 배정할 수 없습니다. 배정을 수정한 뒤 다시 저장하세요."
          detailHeader="시간대"
          rows={unavailableBlock.map((u) => ({
            date: u.scheduleDate,
            name: u.name,
            detail: sessionLabel(u.sessionType),
          }))}
          actions={[{ label: '확인', primary: true, onClick: () => setUnavailableBlock(null) }]}
        />
      )}

      <p className="note">
        ※ 셀 선택지는 해당 날짜에 근무 가능하고 다른 회차에 중복되지 않는 직원만 표시됩니다.
        상담사는 1명 이상 등록할 수 있으며 일괄 적용과 수가 연동됩니다. PM은 {pmLabel}으로
        고정됩니다.
      </p>
    </section>
  );
}

type ConflictRow = { date: string; name: string; detail: string };
type ConflictAction = { label: string; onClick: () => void; primary?: boolean };

function ConflictModal({
  title,
  description,
  rows,
  actions,
  detailHeader = '기존 배정(회차 · 역할)',
}: {
  title: string;
  description: string;
  rows: ConflictRow[];
  actions: ConflictAction[];
  detailHeader?: string;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '520px',
          width: '92%',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '18px 20px',
        }}
      >
        <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
        <p className="muted" style={{ fontSize: '13px', marginTop: 0 }}>
          {description}
        </p>
        <div className="tbl-wrap" style={{ margin: '8px 0 14px' }}>
          <table className="att-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>인력</th>
                <th>{detailHeader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.date}-${r.name}-${i}`}>
                  <td>{formatDateCol(r.date)}</td>
                  <td>{r.name}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {actions.map((a) => (
            <button key={a.label} className={a.primary ? 'btn primary' : 'btn'} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
