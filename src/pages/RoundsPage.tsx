import { useEffect, useMemo, useRef, useState } from 'react';
import { DateInput } from '../components/DateInput';
import { MapLink } from '../components/MapLink';
import { useDebounceSearch } from '../hooks/useDebounceSearch';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { isAxiosError } from 'axios';
import { createCourse, getCourses, getCourseStaffs } from '../api/courses';
import type { CourseCreateRequest, CourseStatus, CourseSummary } from '../api/courses';
import { getRegions } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { statusChipClass } from '../utils/courseStatus';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import QrModal from '../components/QrModal';
import { useTableSort } from '../hooks/useTableSort';
import type { SortOrder } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';
import { useLatestRequest } from '../hooks/useLatestRequest';
import { buildRoundParams, roundInputPlaceholder } from '../utils/roundFilter';
import type { RegionFilterValue } from '../components/RegionSelect';
import {
  readListState,
  useShouldRestoreListState,
  usePersistListState,
} from '../hooks/useListStatePersistence';

const STATUS_OPTIONS = ['PLANNED', 'OPEN', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'];

const LIST_STATE_KEY = 'rounds';

// 상세 진입 후 뒤로가기 시 복원할 목록 검색/필터/페이지 스냅샷
type RoundsListSnapshot = {
  searchInput: string;
  filterParentRegionId: string;
  regionId: string;
  status: string;
  courseNumberInput: string;
  sortBy: string;
  sortOrder: SortOrder;
  page: number;
};

// 이 역할들은 본인이 담당자로 배정된 회차만 목록에 노출
const RESTRICTED_ROLES = ['LECTURER', 'STAFF', 'OPERATOR', 'PROJECT_LEADER', 'COUNSELOR'];

// 이 역할들 중 하나라도 있으면, RESTRICTED_ROLES를 같이 갖고 있어도 전체 열람이 우선한다.
// 예: ADMIN + COUNSELOR 다중 역할 계정 → 전체 열람
const UNRESTRICTED_ROLES = ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'PROJECT_MANAGER'];

// 휴게시간 입력용 시간/분 드롭다운 옵션 (실제 저장/전송 값은 이 둘을 합산한 총 분(breakMinutes))
const BREAK_HOUR_OPTIONS = ['0', '1', '2', '3', '4'];
const BREAK_MINUTE_OPTIONS = ['0', '10', '20', '30', '40', '50'];

const EMPTY_FORM: CourseCreateRequest = {
  regionId: 0,
  courseNumber: 1,
  localCourseNumber: 1,
  courseName: '',
  recruitStart: '',
  recruitEnd: '',
  day1Date: '',
  day2Date: '',
  day3Date: '',
  day4Date: '',
  day5Date: '',
  educationStartTime: '10:00',
  educationEndTime: '17:00',
  breakMinutes: 30,
  capacity: 15,
  minimumCapacity: 12,
  location: '',
  planSubmitDate: '',
};

function statusLabel(status?: CourseStatus) {
  const labels: Record<string, string> = {
    PLANNED: '예정',
    OPEN: '모집중',
    CLOSED: '개강 확정',
    IN_PROGRESS: '교육중',
    COMPLETED: '완료',
    CANCELED: '폐강',
  };
  return status ? (labels[status] ?? status) : '-';
}

// day1~day5 중 실제 값이 있는 날짜로 개강일정(시작~종료) 문자열 생성
function formatCourseSchedule(course: CourseSummary): string {
  const days = [
    course.day1Date,
    course.day2Date,
    course.day3Date,
    course.day4Date,
    course.day5Date,
  ].filter((d): d is string => Boolean(d));
  if (days.length === 0) return '-';
  const start = days[0];
  const end = days[days.length - 1];
  if (start === end) return start; // 단일 일정
  return `${start} ~ ${end.slice(5)}`; // 예: 2026-06-23 ~ 06-27
}

function getErrorMessage(error: unknown) {
  if (isAxiosError<{ error?: string; message?: string }>(error)) {
    const data = error.response?.data;
    return data?.error ?? data?.message ?? '요청 처리 중 오류가 발생했습니다.';
  }
  return '요청 처리 중 오류가 발생했습니다.';
}

// 총 분(breakMinutes) <-> {hour, minute} 문자열 상호 변환 헬퍼
function minutesToParts(totalMinutes: number): { hour: string; minute: string } {
  const safe = Number.isFinite(totalMinutes) && totalMinutes >= 0 ? totalMinutes : 0;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return {
    hour: BREAK_HOUR_OPTIONS.includes(String(hour)) ? String(hour) : '0',
    minute: BREAK_MINUTE_OPTIONS.includes(String(minute)) ? String(minute) : '0',
  };
}

function partsToMinutes(hour: string, minute: string): number {
  return Number(hour) * 60 + Number(minute);
}

export default function RoundsPage() {
  const navigate = useNavigate();
  const { roleConfig } = useRole();
  const { user } = useAuth();

  // 상세 진입 후 뒤로가기일 때만 마지막 목록 상태를 1회 복원(메뉴 새 진입은 기본값).
  const shouldRestore = useShouldRestoreListState();
  const [restored] = useState<RoundsListSnapshot | null>(() =>
    shouldRestore ? readListState<RoundsListSnapshot>(LIST_STATE_KEY) : null,
  );

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [regionId, setRegionId] = useState(restored?.regionId ?? '');
  const [filterParentRegionId, setFilterParentRegionId] = useState(
    restored?.filterParentRegionId ?? '',
  );
  const [status, setStatus] = useState(restored?.status ?? '');
  const keywordInput = useDebounceSearch(restored?.searchInput ?? '', 300);
  const keyword = keywordInput.debouncedValue.trim();
  // 회차번호 검색: 지역 미선택이면 전체회차, 지역(상위/하위) 선택이면 지역회차로 검색(검색 버튼/Enter로 적용).
  const [courseNumberInput, setCourseNumberInput] = useState(restored?.courseNumberInput ?? '');
  const sort = useTableSort(restored?.sortBy ?? '', restored?.sortOrder ?? 'asc');
  // 느린 이전 응답이 최신 검색 결과를 덮어쓰지 않도록 최신 응답 우선 가드.
  const { next: nextRequest, isStale } = useLatestRequest();
  const [page, setPage] = useState(restored?.page ?? 0);
  const [size] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<CourseCreateRequest>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [expandedParentId, setExpandedParentId] = useState<number | null>(null);
  const [qrCourse, setQrCourse] = useState<CourseSummary | null>(null);

  // 현재 검색/필터/페이지를 스냅샷으로 저장 → 상세 왕복 시 뒤로가기로 복원된다.
  const listSnapshot = useMemo<RoundsListSnapshot>(
    () => ({
      searchInput: keywordInput.inputValue,
      filterParentRegionId,
      regionId,
      status,
      courseNumberInput,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      page,
    }),
    [
      keywordInput.inputValue,
      filterParentRegionId,
      regionId,
      status,
      courseNumberInput,
      sort.sortBy,
      sort.sortOrder,
      page,
    ],
  );
  usePersistListState(LIST_STATE_KEY, listSnapshot);

  // 대표 역할(roleConfig.role) 1개만 보면 다중 역할 계정(예: ADMIN+COUNSELOR)에서
  // 대표 역할이 우연히 COUNSELOR로 뽑힐 경우 ADMIN 권한이 무시된다 → 전체 역할 배열로 판단
  const canCreate = roleConfig.roles.some((r) =>
    ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER'].includes(r),
  );

  // 제한 역할을 갖고 있더라도, 전체 열람 역할(ADMIN 등)을 함께 갖고 있으면 제한하지 않는다.
  const isRestricted = Boolean(
    user?.roles?.some((r) => RESTRICTED_ROLES.includes(r)) &&
    !user?.roles?.some((r) => UNRESTRICTED_ROLES.includes(r)),
  );

  // 담당자로 배정된 회차만 남기는 필터 (제한 대상 역할 전용)
  const filterToMyCourses = async (list: CourseSummary[]): Promise<CourseSummary[]> => {
    if (!user) return [];
    const flags = await Promise.all(
      list.map((c) =>
        c.courseId
          ? getCourseStaffs(c.courseId)
              .then(({ data: res }) =>
                (res.data.staffs ?? []).some((s) => Number(s.userId) === Number(user.userId)),
              )
              .catch(() => false)
          : Promise.resolve(false),
      ),
    );
    return list.filter((_, idx) => flags[idx]);
  };

  // 상위지역/지역 선택 상태 → 회차번호 검색 파라미터(전체회차/지역회차) 분기용 값.
  const regionFilterValue: RegionFilterValue = {
    regionId: regionId ? Number(regionId) : undefined,
    parentRegionId: filterParentRegionId ? Number(filterParentRegionId) : undefined,
  };

  const loadCourses = async () => {
    const token = nextRequest();
    setIsLoading(true);
    setErrorMessage('');
    try {
      const commonParams = {
        regionId: regionId ? Number(regionId) : undefined,
        // 하위지역까지 선택했으면 regionId가 우선 적용되므로, 상위지역만 선택("전체")된 경우에만 parentRegionId 전달
        parentRegionId:
          !regionId && filterParentRegionId ? Number(filterParentRegionId) : undefined,
        status: status || undefined,
        keyword: keyword || undefined,
        ...buildRoundParams(regionFilterValue, courseNumberInput),
        ...sort.params,
      };

      if (isRestricted) {
        // 제한 대상 역할: 전체(필터 적용) 목록을 넉넉히 받아와 담당 회차만 골라낸 뒤 클라이언트에서 페이지네이션
        const { data: response } = await getCourses({ ...commonParams, page: 0, size: 1000 });
        const myList = await filterToMyCourses(response.data.content ?? []);

        if (isStale(token)) return; // 낡은 응답이면 최신 결과를 덮어쓰지 않는다.
        setTotalElements(myList.length);
        setTotalPages(Math.max(1, Math.ceil(myList.length / size)));
        setCourses(myList.slice(page * size, page * size + size));
      } else {
        // 그 외 역할: 기존 서버 사이드 페이지네이션 그대로
        const { data: response } = await getCourses({ ...commonParams, page, size });
        if (isStale(token)) return;
        setCourses(response.data.content ?? []);
        setTotalPages(response.data.totalPages ?? 0);
        setTotalElements(response.data.totalElements ?? 0);
      }
    } catch (error) {
      if (isStale(token)) return;
      setCourses([]);
      setErrorMessage(getErrorMessage(error));
    } finally {
      if (!isStale(token)) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size, isRestricted]);

  useEffect(() => {
    let active = true;
    setRegionsLoading(true);
    getRegions()
      .then(({ data: response }) => {
        if (active) setRegions(response.data ?? []);
      })
      .catch(() => {
        if (active) setRegions([]);
      })
      .finally(() => {
        if (active) setRegionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const level1Regions = useMemo(() => regions.filter((r) => r.level === 'LEVEL1'), [regions]);
  const childrenOf = (parentId: number) => regions.filter((r) => r.parentRegionId === parentId);
  const selectedRegion = useMemo(
    () => regions.find((r) => r.regionId === form.regionId),
    [regions, form.regionId],
  );
  const selectedRegionParentName = useMemo(() => {
    if (!selectedRegion?.parentRegionId) return null;
    return regions.find((r) => r.regionId === selectedRegion.parentRegionId)?.regionName ?? null;
  }, [regions, selectedRegion]);

  const handleSelectRegion = (nextRegionId: number) => {
    setForm((prev) => ({ ...prev, regionId: nextRegionId }));
  };

  const handleSearch = () => {
    if (page === 0) {
      void loadCourses();
      return;
    }
    setPage(0);
  };

  // 강좌명 검색 디바운스 적용 후 자동 검색.
  // 마운트 시점은 위 [page,size,isRestricted] effect가 이미 loadCourses를 호출하므로,
  // 여기서는 스킵(didMount 가드)해 페이지 진입 시 API가 2번 호출되는 것을 막는다.
  const keywordDidMountRef = useRef(false);
  useEffect(() => {
    if (!keywordDidMountRef.current) {
      keywordDidMountRef.current = true;
      return;
    }
    if (page === 0) {
      void loadCourses();
    } else {
      setPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  // 컬럼 헤더 클릭 정렬 변경 시 재조회(마운트 시점은 위 초기 effect가 이미 처리하므로 스킵).
  const sortDidMountRef = useRef(false);
  useEffect(() => {
    if (!sortDidMountRef.current) {
      sortDidMountRef.current = true;
      return;
    }
    if (page === 0) {
      void loadCourses();
    } else {
      setPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort.sortBy, sort.sortOrder]);

  const updateForm = (key: keyof CourseCreateRequest, value: string) => {
    const numericKeys: Array<keyof CourseCreateRequest> = [
      'regionId',
      'courseNumber',
      'localCourseNumber',
      'capacity',
      'minimumCapacity',
    ];
    setForm((prev) => ({
      ...prev,
      [key]: numericKeys.includes(key) ? Number(value) : value,
    }));
  };

  // 휴게시간 시/분 각각 변경 시, 나머지 값은 유지한 채 총 분(breakMinutes)으로 재계산해 저장
  const { hour: breakHour, minute: breakMinute } = minutesToParts(form.breakMinutes);
  const handleBreakHourChange = (hour: string) => {
    setForm((prev) => ({ ...prev, breakMinutes: partsToMinutes(hour, breakMinute) }));
  };
  const handleBreakMinuteChange = (minute: string) => {
    setForm((prev) => ({ ...prev, breakMinutes: partsToMinutes(breakHour, minute) }));
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.regionId) {
      setErrorMessage('지역을 선택해주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await createCourse(form);
      setForm(EMPTY_FORM);
      setIsCreateOpen(false);
      setPage(0);
      await loadCourses();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const pageSummary = useMemo(() => {
    if (totalElements === 0)
      return isRestricted ? '담당 중인 회차가 없습니다.' : '등록된 강좌가 없습니다.';
    return `총 ${totalElements.toLocaleString()}개 강좌${isRestricted ? ' (내 담당 회차만 표시)' : ''}`;
  }, [totalElements, isRestricted]);

  return (
    <section className="view active" id="view-rounds">
      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
          <div className="select">
            <span className="ico">상위지역</span>
            <select
              value={filterParentRegionId}
              onChange={(event) => {
                setFilterParentRegionId(event.target.value);
                setRegionId('');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">전체</option>
              {level1Regions.map((region) => (
                <option key={region.regionId} value={region.regionId}>
                  {region.regionName}
                </option>
              ))}
            </select>
          </div>
          <div className="select">
            <span className="ico">지역</span>
            <select
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
              disabled={!filterParentRegionId}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 'inherit',
                outline: 'none',
                cursor: filterParentRegionId ? 'pointer' : 'not-allowed',
              }}
            >
              <option value="">전체</option>
              {childrenOf(Number(filterParentRegionId)).map((child) => (
                <option key={child.regionId} value={child.regionId}>
                  {child.regionName}
                </option>
              ))}
            </select>
          </div>
          <div className="select">
            <span className="ico">상태</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">전체</option>
              {STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {statusLabel(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="select" style={{ minWidth: '220px' }}>
            <span className="ico">검색</span>
            <input
              {...keywordInput.inputProps}
              placeholder="강좌명 검색"
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '140px' }}
            />
          </div>
          <div className="select" style={{ width: '120px' }}>
            <span className="ico">회차</span>
            <input
              type="number"
              min={1}
              value={courseNumberInput}
              onChange={(event) => setCourseNumberInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
              placeholder={roundInputPlaceholder(regionFilterValue)}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '70px' }}
            />
          </div>
          <button className="btn" type="button" onClick={handleSearch} disabled={isLoading}>
            검색
          </button>
        </div>

        {canCreate && (
          <button
            className="btn primary"
            id="btn-add-round"
            type="button"
            onClick={() => setIsCreateOpen((prev) => !prev)}
          >
            + 새 회차등록
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="login-error" role="alert" style={{ marginBottom: '16px' }}>
          {errorMessage}
        </div>
      )}

      {isCreateOpen && (
        <div className="card" style={{ marginBottom: '18px' }}>
          <div className="card-h">
            <span className="section-title">새 회차등록</span>
          </div>
          <form className="card-b form-grid" onSubmit={handleCreate}>
            <div className="field full">
              <label>지역</label>
              {regionsLoading ? (
                <span className="muted" style={{ fontSize: '12.5px' }}>
                  지역 목록 불러오는 중...
                </span>
              ) : (
                <>
                  <div
                    style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}
                  >
                    {level1Regions.map((region) => (
                      <button
                        key={region.regionId}
                        type="button"
                        className={`chip ${expandedParentId === region.regionId ? 'info' : 'neutral'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        onClick={() => setExpandedParentId(region.regionId)}
                      >
                        {region.regionName}
                      </button>
                    ))}
                    {level1Regions.length === 0 && (
                      <span className="muted" style={{ fontSize: '12px' }}>
                        등록된 지역이 없습니다.
                      </span>
                    )}
                  </div>

                  {expandedParentId !== null && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {childrenOf(expandedParentId).map((child) => (
                        <button
                          key={child.regionId}
                          type="button"
                          className={`chip ${form.regionId === child.regionId ? 'ok' : 'neutral'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                          onClick={() => handleSelectRegion(child.regionId)}
                        >
                          {child.regionName}
                        </button>
                      ))}
                      {childrenOf(expandedParentId).length === 0 && (
                        <span className="muted" style={{ fontSize: '12px' }}>
                          하위 지역이 없습니다.
                        </span>
                      )}
                    </div>
                  )}

                  <div className="muted" style={{ fontSize: '12px', marginTop: '8px' }}>
                    {selectedRegion
                      ? `선택됨: ${selectedRegionParentName ? `${selectedRegionParentName} · ` : ''}${selectedRegion.regionName}`
                      : '상위 지역을 클릭한 뒤 하위 지역을 선택해주세요.'}
                  </div>
                </>
              )}
            </div>
            <div className="field">
              <label>전체회차 번호</label>
              <input
                type="number"
                value={form.courseNumber}
                onChange={(event) => updateForm('courseNumber', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>지역회차 번호</label>
              <input
                type="number"
                value={form.localCourseNumber}
                onChange={(event) => updateForm('localCourseNumber', event.target.value)}
                required
              />
            </div>
            <div className="field full">
              <label>강좌명</label>
              <input
                value={form.courseName}
                onChange={(event) => updateForm('courseName', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>모집 시작일</label>
              <DateInput
                value={form.recruitStart}
                onChange={(event) => updateForm('recruitStart', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>모집 종료일</label>
              <DateInput
                value={form.recruitEnd}
                onChange={(event) => updateForm('recruitEnd', event.target.value)}
                required
              />
            </div>

            {/* 1~5일차 교육일을 한 행에 나란히 배치 */}
            <div className="field full">
              <label>교육 일정 (1~5일차)</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  gap: '8px',
                }}
              >
                {(['day1Date', 'day2Date', 'day3Date', 'day4Date', 'day5Date'] as const).map(
                  (key, index) => (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                        {index + 1}일차
                      </label>
                      <DateInput
                        value={form[key]}
                        onChange={(event) => updateForm(key, event.target.value)}
                        required
                        style={{ width: '100%' }}
                      />
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="field">
              <label>교육 시작시간</label>
              <input
                type="time"
                value={form.educationStartTime}
                onChange={(event) => updateForm('educationStartTime', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>교육 종료시간</label>
              <input
                type="time"
                value={form.educationEndTime}
                onChange={(event) => updateForm('educationEndTime', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>휴게시간</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select
                  value={breakHour}
                  onChange={(event) => handleBreakHourChange(event.target.value)}
                >
                  {BREAK_HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h}시간
                    </option>
                  ))}
                </select>
                <select
                  value={breakMinute}
                  onChange={(event) => handleBreakMinuteChange(event.target.value)}
                >
                  {BREAK_MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}분
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>정원</label>
              <input
                type="number"
                value={form.capacity}
                onChange={(event) => updateForm('capacity', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>최소 정원</label>
              <input
                type="number"
                value={form.minimumCapacity}
                onChange={(event) => updateForm('minimumCapacity', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>수행계획서 제출일</label>
              <DateInput
                value={form.planSubmitDate}
                onChange={(event) => updateForm('planSubmitDate', event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>교육장</label>
              <input
                value={form.location}
                onChange={(event) => updateForm('location', event.target.value)}
                required
              />
            </div>
            <div className="field full" style={{ alignItems: 'flex-end' }}>
              <button className="btn primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? '등록 중...' : '등록'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <span className="section-title">강좌 목록</span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: '12px' }}>
            {isLoading ? '불러오는 중...' : pageSummary}
          </span>
        </div>
        <div className="tbl-wrap">
          <table className="data cards">
            <thead>
              <tr>
                <SortableTh
                  column="courseName"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  강좌명
                </SortableTh>
                <SortableTh
                  column="regionName"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  지역
                </SortableTh>
                <SortableTh
                  column="courseNumber"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  전체회차
                </SortableTh>
                <SortableTh
                  column="localCourseNumber"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  지역회차
                </SortableTh>
                <SortableTh
                  column="capacity"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  정원
                </SortableTh>
                <th>교육장</th>
                <SortableTh
                  column="status"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  상태
                </SortableTh>
                <SortableTh
                  column="day1Date"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  개강일정
                </SortableTh>
                <SortableTh
                  column="planSubmitDate"
                  sortBy={sort.sortBy}
                  sortOrder={sort.sortOrder}
                  onSort={sort.toggle}
                >
                  계획서 제출일
                </SortableTh>
                <th>QR</th>
              </tr>
            </thead>
            <tbody id="r-rows">
              {courses.map((course, index) => (
                <tr
                  key={course.courseId ?? index}
                  onClick={() => {
                    if (course.courseId)
                      navigate(`/rounds/${course.courseId}`, { state: { from: '/rounds' } });
                  }}
                >
                  <td className="pname" data-label="강좌명">
                    {course.courseName ?? `강좌 #${course.courseId}`}
                  </td>
                  <td data-label="지역">{course.regionName ?? course.regionId ?? '-'}</td>
                  <td className="tnum" data-label="전체회차">
                    {course.courseNumber ? `${course.courseNumber}기` : '-'}
                  </td>
                  <td className="tnum" data-label="지역회차">
                    {course.localCourseNumber ? `${course.localCourseNumber}회차` : '-'}
                  </td>
                  <td className="tnum" data-label="정원">
                    {course.currentParticipants ?? 0}
                    <span className="muted"> / {course.capacity ?? '-'}</span>
                  </td>
                  <td data-label="교육장">
                    <MapLink address={course.location} fallback="-" />
                  </td>
                  <td data-label="상태">
                    <span className={`chip ${statusChipClass(course.status)}`}>
                      {statusLabel(course.status)}
                    </span>
                  </td>
                  <td className="tnum" data-label="개강일정">
                    {formatCourseSchedule(course)}
                  </td>
                  <td className="tnum" data-label="계획서 제출일">
                    {course.planSubmitDate ?? '-'}
                  </td>
                  <td className="cell-actions" data-label="QR">
                    <button
                      className="btn"
                      type="button"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      disabled={!course.courseId}
                      onClick={(e) => {
                        e.stopPropagation();
                        setQrCourse(course);
                      }}
                    >
                      QR
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && courses.length === 0 && (
                <tr>
                  <td
                    className="no-label"
                    colSpan={10}
                    style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
                  >
                    {isRestricted ? '담당 중인 회차가 없습니다.' : '등록된 강좌가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="filters" style={{ marginTop: '14px' }}>
        <button
          className="btn"
          type="button"
          disabled={page <= 0 || isLoading}
          onClick={() => setPage((prev) => Math.max(0, prev - 1))}
        >
          이전
        </button>
        <span className="muted tnum">
          {page + 1} / {Math.max(totalPages, 1)}
        </span>
        <button
          className="btn"
          type="button"
          disabled={isLoading || page + 1 >= totalPages}
          onClick={() => setPage((prev) => prev + 1)}
        >
          다음
        </button>
      </div>
      <p className="note">행을 클릭하면 강좌 상세, 담당자, 참여자 정보를 확인할 수 있습니다.</p>

      {qrCourse?.courseId && (
        <QrModal
          isOpen={Boolean(qrCourse)}
          onClose={() => setQrCourse(null)}
          courseId={qrCourse.courseId}
          courseName={qrCourse.courseName}
          regionName={qrCourse.regionName}
        />
      )}
    </section>
  );
}
