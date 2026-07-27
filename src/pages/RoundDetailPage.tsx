import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  deleteCourse,
  getCourse,
  getCourseParticipants,
  getCourseStaffs,
  updateCourse,
  updateCourseStatus,
} from '../api/courses';
import type { CourseDetail, CourseParticipant, CourseStaff, CourseUpdateRequest } from '../api/courses';
import { getRegions } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { useRole } from '../context/RoleContext';
import { roleNameLabel } from '../api/userRoles'; // ROLE_NAME_LABELS 매핑만 재사용
import { ParticipantEnrollModal } from '../components/ParticipantModals';

const STATUS_OPTIONS = ['PLANNED', 'OPEN', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

// 휴게시간 입력용 시간/분 드롭다운 옵션 (실제 저장/전송 값은 이 둘을 합산한 총 분(breakMinutes))
const BREAK_HOUR_OPTIONS = ['0', '1', '2', '3', '4'];
const BREAK_MINUTE_OPTIONS = ['0', '10', '20', '30', '40', '50'];

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

// 휴게시간(분)을 사람이 읽기 좋은 "N시간 N분"으로 표시
function formatBreakMinutesLabel(totalMinutes?: number): string {
  if (totalMinutes === undefined || totalMinutes === null) return '-';
  const { hour, minute } = minutesToParts(totalMinutes);
  const h = Number(hour);
  const m = Number(minute);
  if (h === 0 && m === 0) return '0분';
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  return parts.join(' ');
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    PLANNED: '예정',
    OPEN: '모집중',
    CLOSED: '모집마감',
    IN_PROGRESS: '교육중',
    COMPLETED: '완료',
    CANCELLED: '취소',
  };
  return status ? labels[status] ?? status : '-';
}

function statusClass(status?: string) {
  if (status === 'OPEN' || status === 'IN_PROGRESS') return 'info';
  if (status === 'COMPLETED') return 'ok';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'CLOSED') return 'warn';
  return 'neutral';
}

function getErrorMessage(error: unknown) {
  if (isAxiosError<{ error?: string; message?: string }>(error)) {
    const data = error.response?.data;
    return data?.error ?? data?.message ?? '요청 처리 중 오류가 발생했습니다.';
  }
  return '요청 처리 중 오류가 발생했습니다.';
}

// 입력 컨트롤은 문자열로 다루고, 제출 시 빈 값은 "미변경"으로 간주해 payload에서 제외한다.
// breakMinutes도 다른 숫자 필드와 동일하게 문자열로 들고 있다가 제출 시 숫자로 변환한다.
type EditFormState = {
  regionId: string;
  courseNumber: string;
  localCourseNumber: string;
  courseName: string;
  recruitStart: string;
  recruitEnd: string;
  day1Date: string;
  day2Date: string;
  day3Date: string;
  day4Date: string;
  day5Date: string;
  educationStartTime: string;
  educationEndTime: string;
  breakMinutes: string;
  capacity: string;
  minimumCapacity: string;
  location: string;
  planSubmitDate: string;
};

const EMPTY_EDIT_FORM: EditFormState = {
  regionId: '',
  courseNumber: '',
  localCourseNumber: '',
  courseName: '',
  recruitStart: '',
  recruitEnd: '',
  day1Date: '',
  day2Date: '',
  day3Date: '',
  day4Date: '',
  day5Date: '',
  educationStartTime: '',
  educationEndTime: '',
  breakMinutes: '',
  capacity: '',
  minimumCapacity: '',
  location: '',
  planSubmitDate: '',
};

const NUMERIC_EDIT_FIELDS: Array<keyof EditFormState> = [
  'regionId',
  'courseNumber',
  'localCourseNumber',
  'capacity',
  'minimumCapacity',
  'breakMinutes',
];

// 백엔드 LocalTime이 "HH:mm:ss"로 내려와도 <input type="time">이 기대하는 "HH:mm"으로 맞춰준다.
function normalizeTimeInput(value?: string | null): string {
  if (!value) return '';
  return value.length >= 5 ? value.slice(0, 5) : value;
}

// 빈 값(미입력)은 "수정하지 않음"으로 간주해 payload에서 제외 -> 기존 값이 덮어써지지 않도록 함
function buildUpdatePayload(form: EditFormState): CourseUpdateRequest {
  const payload: CourseUpdateRequest = {};
  (Object.keys(form) as Array<keyof EditFormState>).forEach((key) => {
    const raw = form[key];
    if (raw === '' || raw === undefined) return;

    if (NUMERIC_EDIT_FIELDS.includes(key)) {
      const numeric = Number(raw);
      if (Number.isNaN(numeric)) return;
      (payload as Record<string, unknown>)[key] = numeric;
    } else {
      (payload as Record<string, unknown>)[key] = raw;
    }
  });
  return payload;
}

export default function RoundDetailPage() {
  const { courseId: courseIdParam, no } = useParams<{ courseId?: string; no?: string }>();
  const courseId = Number(courseIdParam ?? no);
  const navigate = useNavigate();
  const { roleConfig } = useRole();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [staffs, setStaffs] = useState<CourseStaff[]>([]);

  const [participants, setParticipants] = useState<CourseParticipant[]>([]);
  const [participantKeyword, setParticipantKeyword] = useState('');
  const [participantStatus, setParticipantStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStaffsLoading, setIsStaffsLoading] = useState(false);
  const [isParticipantsLoading, setIsParticipantsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [expandedParentId, setExpandedParentId] = useState<number | null>(null);
  const [statusForm, setStatusForm] = useState('OPEN');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEdit = ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER'].includes(roleConfig.role);
  const canDelete = roleConfig.role === 'ADMIN';
  const canChangeStatus = ['ADMIN', 'HEAD_OFFICE'].includes(roleConfig.role);

  const loadCourse = async () => {
    if (!Number.isFinite(courseId)) return;

    setIsLoading(true);
    setErrorMessage('');
    try {
      const { data: response } = await getCourse(courseId);
      setCourse(response.data);
      setEditForm({
        ...EMPTY_EDIT_FORM,
        regionId: String(response.data.regionId ?? ''),
        courseNumber: String(response.data.courseNumber ?? ''),
        localCourseNumber: String(response.data.localCourseNumber ?? ''),
        courseName: response.data.courseName ?? '',
        recruitStart: response.data.recruitStart ?? '',
        recruitEnd: response.data.recruitEnd ?? '',
        day1Date: response.data.day1Date ?? '',
        day2Date: response.data.day2Date ?? '',
        day3Date: response.data.day3Date ?? '',
        day4Date: response.data.day4Date ?? '',
        day5Date: response.data.day5Date ?? '',
        educationStartTime: normalizeTimeInput(response.data.educationStartTime),
        educationEndTime: normalizeTimeInput(response.data.educationEndTime),
        breakMinutes:
          response.data.breakMinutes === undefined || response.data.breakMinutes === null
            ? ''
            : String(response.data.breakMinutes),
        capacity: String(response.data.capacity ?? ''),
        minimumCapacity: String(response.data.minimumCapacity ?? ''),
        location: response.data.location ?? '',
        planSubmitDate: response.data.planSubmitDate ?? '',
      });
      setStatusForm(response.data.status);
    } catch (error) {
      setCourse(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const loadStaffs = async () => {
    if (!courseId) return;
    setIsStaffsLoading(true);
    try {
      const { data: response } = await getCourseStaffs(courseId);
      setStaffs(response.data.staffs ?? []);
    } catch {
      setStaffs([]);
    } finally {
      setIsStaffsLoading(false);
    }
  };

  const loadParticipants = async () => {
    if (!Number.isFinite(courseId)) return;

    setIsParticipantsLoading(true);
    try {
      const { data: response } = await getCourseParticipants(courseId, {
        status: participantStatus || undefined,
        keyword: participantKeyword || undefined,
        page: 0,
        size: 20,
      });
      setParticipants(response.data.content ?? []);
    } catch {
      setParticipants([]);
    } finally {
      setIsParticipantsLoading(false);
    }
  };

  useEffect(() => {
    void loadCourse();
    void loadStaffs();
    void loadParticipants();
  }, [courseId]);

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

  const level1Regions = regions.filter((r) => r.level === 'LEVEL1');
  const childrenOf = (parentId: number) => regions.filter((r) => r.parentRegionId === parentId);
  const selectedRegion = regions.find((r) => String(r.regionId) === editForm.regionId);
  const selectedRegionParentName = selectedRegion?.parentRegionId
    ? regions.find((r) => r.regionId === selectedRegion.parentRegionId)?.regionName ?? null
    : null;

  const updateEditForm = (key: keyof EditFormState, value: string) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectEditRegion = (regionId: number) => {
    setEditForm((prev) => ({ ...prev, regionId: String(regionId) }));
  };

  // 휴게시간 시/분 각각 변경 시, 나머지 값은 유지한 채 총 분(breakMinutes)으로 재계산해 저장
  const { hour: editBreakHour, minute: editBreakMinute } = minutesToParts(Number(editForm.breakMinutes) || 0);
  const handleEditBreakHourChange = (hour: string) => {
    updateEditForm('breakMinutes', String(partsToMinutes(hour, editBreakMinute)));
  };
  const handleEditBreakMinuteChange = (minute: string) => {
    updateEditForm('breakMinutes', String(partsToMinutes(editBreakHour, minute)));
  };

  useEffect(() => {
    if (selectedRegion?.parentRegionId) {
      setExpandedParentId(selectedRegion.parentRegionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm.regionId, regions]);

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!course) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await updateCourse(course.courseId, buildUpdatePayload(editForm));
      setIsEditOpen(false);
      await loadCourse();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!course) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await updateCourseStatus(course.courseId, { status: statusForm });
      await loadCourse();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!course || !window.confirm('강좌를 삭제하시겠습니까?')) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await deleteCourse(course.courseId);
      navigate('/rounds', { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!Number.isFinite(courseId)) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <button className="back" onClick={() => navigate('/rounds')}>
          ← 회차 목록
        </button>
        <h2>올바르지 않은 강좌 ID입니다.</h2>
      </div>
    );
  }

  if (isLoading && !course) {
    return (
      <section className="view active" id="view-round-detail">
        <button className="back" onClick={() => navigate('/rounds')}>
          ← 회차 목록
        </button>
        <div className="card ph">강좌 정보를 불러오는 중입니다.</div>
      </section>
    );
  }

  if (!course) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <button className="back" onClick={() => navigate('/rounds')}>
          ← 회차 목록
        </button>
        <h2>강좌 정보를 찾을 수 없습니다.</h2>
        {errorMessage && <p className="login-error">{errorMessage}</p>}
      </div>
    );
  }

  const capacityPercent =
    course.capacity
      ? Math.min(
        100,
        Math.round((course.currentParticipants / course.capacity) * 100)
      )
      : 0;
  const minPercent = course.capacity ? Math.min(100, Math.round((course.minimumCapacity / course.capacity) * 100)) : 0;

  return (
    <section className="view active" id="view-round-detail">
      <button className="back" onClick={() => navigate('/rounds')}>
        ← 회차 목록
      </button>

      {errorMessage && (
        <div className="login-error" role="alert" style={{ marginBottom: '16px' }}>
          {errorMessage}
        </div>
      )}

      <div className="detail-head">
        <div className="pa" style={{ borderRadius: '14px' }}>
          {course.courseNumber}
        </div>
        <div>
          <div className="pn">{course.courseName}</div>
          <div className="pm">
            <span>
              지역 <b>{course.regionName}</b>
            </span>
            <span>
              교육장 <b>{course.location}</b>
            </span>
            <span className={`chip ${statusClass(course.status)}`} style={{ marginTop: '-2px' }}>
              {statusLabel(course.status)}
            </span>
          </div>
        </div>
        <div className="actions">
          {canChangeStatus && (
            <>
              <select className="select" value={statusForm} onChange={(event) => setStatusForm(event.target.value)}>
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
              <button className="btn" type="button" onClick={handleStatusChange} disabled={isSubmitting}>
                상태 변경
              </button>
            </>
          )}
          {canEdit && (
            <button className="btn primary" id="btn-edit-round" type="button" onClick={() => setIsEditOpen((prev) => !prev)}>
              강좌 수정
            </button>
          )}
          {canDelete && (
            <button className="btn" type="button" onClick={handleDelete} disabled={isSubmitting}>
              삭제
            </button>
          )}
        </div>
      </div>

      {isEditOpen && (
        <div className="card" style={{ marginBottom: '18px' }}>
          <div className="card-h">
            <span className="section-title">강좌 수정</span>
          </div>
          <form className="card-b form-grid" onSubmit={handleUpdate}>
            <div className="field full">
              <label>지역</label>
              {regionsLoading ? (
                <span className="muted" style={{ fontSize: '12.5px' }}>지역 목록 불러오는 중...</span>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
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
                  </div>
                  {expandedParentId !== null && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {childrenOf(expandedParentId).map((child) => (
                        <button
                          key={child.regionId}
                          type="button"
                          className={`chip ${editForm.regionId === String(child.regionId) ? 'ok' : 'neutral'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                          onClick={() => handleSelectEditRegion(child.regionId)}
                        >
                          {child.regionName}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: '12px', marginTop: '8px' }}>
                    {selectedRegion
                      ? `선택됨: ${selectedRegionParentName ? `${selectedRegionParentName} · ` : ''}${selectedRegion.regionName}`
                      : '변경하지 않으려면 그대로 두세요.'}
                  </div>
                </>
              )}
            </div>

            <div className="field">
              <label>전체회차 번호</label>
              <input type="number" value={editForm.courseNumber} onChange={(event) => updateEditForm('courseNumber', event.target.value)} />
            </div>
            <div className="field">
              <label>지역회차 번호</label>
              <input type="number" value={editForm.localCourseNumber} onChange={(event) => updateEditForm('localCourseNumber', event.target.value)} />
            </div>

            <div className="field full">
              <label>강좌명</label>
              <input value={editForm.courseName} onChange={(event) => updateEditForm('courseName', event.target.value)} />
            </div>

            <div className="field">
              <label>모집 시작일</label>
              <input type="date" value={editForm.recruitStart} onChange={(event) => updateEditForm('recruitStart', event.target.value)} />
            </div>
            <div className="field">
              <label>모집 종료일</label>
              <input type="date" value={editForm.recruitEnd} onChange={(event) => updateEditForm('recruitEnd', event.target.value)} />
            </div>

            {([
              ['day1Date', '1일차 교육일'],
              ['day2Date', '2일차 교육일'],
              ['day3Date', '3일차 교육일'],
              ['day4Date', '4일차 교육일'],
              ['day5Date', '5일차 교육일'],
            ] as const).map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input type="date" value={editForm[key]} onChange={(event) => updateEditForm(key, event.target.value)} />
              </div>
            ))}

            <div className="field">
              <label>교육 시작시간</label>
              <input type="time" value={editForm.educationStartTime} onChange={(event) => updateEditForm('educationStartTime', event.target.value)} />
            </div>
            <div className="field">
              <label>교육 종료시간</label>
              <input type="time" value={editForm.educationEndTime} onChange={(event) => updateEditForm('educationEndTime', event.target.value)} />
            </div>
            <div className="field">
              <label>휴게시간</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select value={editBreakHour} onChange={(event) => handleEditBreakHourChange(event.target.value)}>
                  {BREAK_HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h}시간
                    </option>
                  ))}
                </select>
                <select value={editBreakMinute} onChange={(event) => handleEditBreakMinuteChange(event.target.value)}>
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
              <input type="number" value={editForm.capacity} onChange={(event) => updateEditForm('capacity', event.target.value)} />
            </div>
            <div className="field">
              <label>최소 정원</label>
              <input type="number" value={editForm.minimumCapacity} onChange={(event) => updateEditForm('minimumCapacity', event.target.value)} />
            </div>
            <div className="field">
              <label>수행계획서 제출일</label>
              <input type="date" value={editForm.planSubmitDate} onChange={(event) => updateEditForm('planSubmitDate', event.target.value)} />
            </div>
            <div className="field full">
              <label>교육장</label>
              <input value={editForm.location} onChange={(event) => updateEditForm('location', event.target.value)} />
            </div>

            <p className="note" style={{ margin: '4px 0 0' }}>※ 값을 비워두면 해당 항목은 수정되지 않고 기존 값이 유지됩니다.</p>

            <div className="field full" style={{ alignItems: 'flex-end' }}>
              <button className="btn primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="detail-grid">
        <div className="card">
          <div className="card-h">
            <span className="section-title">강좌 정보</span>
          </div>
          <div className="card-b">
            <div className="kv">
              <span className="k">강좌 ID</span>
              <span className="v tnum">{course.courseId}</span>
            </div>
            <div className="kv">
              <span className="k">지역</span>
              <span className="v tnum">{course.regionName} ({course.regionId})</span>
            </div>
            <div className="kv">
              <span className="k">전체회차 / 지역회차</span>
              <span className="v tnum">{course.courseNumber}기 / {course.localCourseNumber}회차</span>
            </div>
            <div className="kv">
              <span className="k">모집 기간</span>
              <span className="v tnum">{course.recruitStart ?? '-'} ~ {course.recruitEnd ?? '-'}</span>
            </div>
            <div className="kv">
              <span className="k">교육 일정</span>
              <span className="v tnum">
                {[course.day1Date, course.day2Date, course.day3Date, course.day4Date, course.day5Date]
                  .filter(Boolean)
                  .join(', ') || '-'}
              </span>
            </div>
            <div className="kv">
              <span className="k">교육 시간</span>
              <span className="v tnum">
                {course.educationStartTime ?? '-'} ~ {course.educationEndTime ?? '-'}
              </span>
            </div>
            <div className="kv">
              <span className="k">휴게시간</span>
              <span className="v tnum">{formatBreakMinutesLabel(course.breakMinutes)}</span>
            </div>
            <div className="kv">
              <span className="k">수행계획서 제출일</span>
              <span className="v tnum">{course.planSubmitDate}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <span className="section-title">모집 인원</span>
            <span className={`chip ${course.currentParticipants >= course.minimumCapacity ? 'ok' : 'warn'}`}>
              {course.currentParticipants >= course.minimumCapacity ? '최소 정원 충족' : '모집 보강 필요'}
            </span>
          </div>
          <div className="card-b">
            <div className="capacity">
              <div className="big tnum">
                {course.currentParticipants}
                <small> / {course.capacity}명</small>
              </div>
              <div style={{ flex: 1 }}>
                <div className="cap-bar">
                  <span style={{ width: `${capacityPercent}%` }}></span>
                  <div className="thr" style={{ left: `${minPercent}%` }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                  <span>현재 참여자 {course.currentParticipants}명</span>
                  <span style={{ color: 'var(--danger)' }}>최소 정원 {course.minimumCapacity}명</span>
                </div>
              </div>
            </div>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await loadCourse();
                await loadParticipants();
              }}
              disabled={isParticipantsLoading || isLoading}
            >
              참여자 새로고침
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">강좌 담당자</span>
          <button className="btn" type="button" onClick={loadStaffs} disabled={isStaffsLoading} style={{ marginLeft: 'auto' }}>
            {isStaffsLoading ? '조회 중...' : '담당자 조회'}
          </button>
        </div>
        <div className="card-b">
          {staffs.length === 0 ? (
            <div className="muted">등록된 담당자가 없습니다.</div>
          ) : (
            <div className="detail-grid" style={{ gap: '0 28px' }}>
              {staffs.map((staff, index) => {
                const roleLabel = staff.staffRole ? roleNameLabel(staff.staffRole) : '담당자';

                return (
                  <div className="assignee" key={staff.courseStaffId ?? staff.userId ?? index}>
                    <div className="ra">{roleLabel.slice(0, 2)}</div>
                    <div>
                      <div className="rr">{roleLabel}</div>
                      <div className="rnm">{staff.name ?? `담당자 #${staff.userId ?? index + 1}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">강좌 참여자</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn primary" type="button" onClick={() => setIsEnrollOpen(true)}>
              + 참여자 등록
            </button>
            <input
              value={participantKeyword}
              onChange={(event) => setParticipantKeyword(event.target.value)}
              placeholder="참여자명"
              style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px' }}
            />
            <input
              value={participantStatus}
              onChange={(event) => setParticipantStatus(event.target.value)}
              placeholder="상태"
              style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', width: '96px' }}
            />
            <button className="btn" type="button" onClick={loadParticipants} disabled={isParticipantsLoading}>
              {isParticipantsLoading ? '조회 중...' : '조회'}
            </button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>참여자</th>
                <th>참여 ID</th>
                <th>입실</th>
                <th>퇴실</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant, index) => (
                <tr key={participant.courseParticipantId ?? index}>
                  <td className="pname">{participant.participantName ?? participant.name ?? '-'}</td>
                  <td className="tnum">{participant.courseParticipantId}</td>
                  <td className="tnum">{participant.checkInTime ?? '-'}</td>
                  <td className="tnum">{participant.checkOutTime ?? '-'}</td>
                  <td>
                    <span className="chip neutral">{participant.status ?? '-'}</span>
                  </td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    조회된 참여자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ParticipantEnrollModal
        isOpen={isEnrollOpen}
        onClose={() => setIsEnrollOpen(false)}
        courseId={courseId}
        onSaved={loadParticipants}
      />
    </section>
  );
}