import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router';
import { isAxiosError } from 'axios';
import {
  deleteCourse,
  getCourse,
  getCourseParticipants,
  getCourseStaffs,
  getCourseStaffSmsHistory,
  updateCourse,
  updateCourseStatus,
} from '../api/courses';
import type {
  CourseDetail,
  CourseParticipant,
  CourseStaff,
  CourseStaffSmsHistoryItem,
  CourseUpdateRequest,
} from '../api/courses';
import { getRegions } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { useRole } from '../context/RoleContext';
import { roleNameLabel } from '../api/userRoles'; // ROLE_NAME_LABELS 매핑만 재사용
import { ParticipantEnrollModal } from '../components/ParticipantModals';
import { notifyCourseScheduleChange } from '../api/courses';
import { CourseChangeNotifyModal } from '../components/CourseChangeNotifyModal';

const STATUS_OPTIONS = ['PLANNED', 'OPEN', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'];

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

// 강좌 수정 시 "변경 감지" 대상 필드 — 이 중 하나라도 원래 값과 달라지면 문자 발송 여부 팝업을 띄운다.
const WATCHED_FIELDS: Array<keyof EditFormState> = [
  'day1Date',
  'day2Date',
  'day3Date',
  'day4Date',
  'day5Date',
  'educationStartTime',
  'educationEndTime',
  'breakMinutes',
  'location',
];

// course(서버에서 불러온 원본)를 editForm과 같은 문자열 형태로 변환해 비교 기준을 만든다.
function watchedValuesFromCourse(c: CourseDetail): Partial<EditFormState> {
  return {
    day1Date: c.day1Date ?? '',
    day2Date: c.day2Date ?? '',
    day3Date: c.day3Date ?? '',
    day4Date: c.day4Date ?? '',
    day5Date: c.day5Date ?? '',
    educationStartTime: normalizeTimeInput(c.educationStartTime),
    educationEndTime: normalizeTimeInput(c.educationEndTime),
    breakMinutes:
      c.breakMinutes === undefined || c.breakMinutes === null ? '' : String(c.breakMinutes),
    location: c.location ?? '',
  };
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    PLANNED: '예정',
    OPEN: '모집중',
    CLOSED: '개강 확정',
    IN_PROGRESS: '교육중',
    COMPLETED: '완료',
    CANCELED: '폐강',
  };
  return status ? labels[status] ?? status : '-';
}

function statusClass(status?: string) {
  if (status === 'OPEN' || status === 'IN_PROGRESS') return 'info';
  if (status === 'COMPLETED') return 'ok';
  if (status === 'CANCELED') return 'danger';
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

// 담당자 안내 문자 종류(STATUS_CHANGE/SCHEDULE_CHANGE) 한글 라벨
function staffSmsNotifyTypeLabel(notifyType?: string) {
  const labels: Record<string, string> = {
    STATUS_CHANGE: '상태 변경',
    SCHEDULE_CHANGE: '일정/장소 변경',
  };
  return notifyType ? labels[notifyType] ?? notifyType : '-';
}

// 담당자 안내 문자 발송 상태(SUCCESS/FAIL) 한글 라벨 + chip 클래스
function staffSmsStatusLabel(sendStatus?: string) {
  const labels: Record<string, string> = {
    SUCCESS: '발송 성공',
    FAIL: '발송 실패',
  };
  return sendStatus ? labels[sendStatus] ?? sendStatus : '-';
}

function staffSmsStatusClass(sendStatus?: string) {
  if (sendStatus === 'SUCCESS') return 'ok';
  if (sendStatus === 'FAIL') return 'danger';
  return 'neutral';
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

  // 강좌 수정 시 일정/장소 변경 감지 → 문자 발송 여부 확인 팝업
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<CourseUpdateRequest | null>(null);
  const [notifySubmitting, setNotifySubmitting] = useState(false);

  // 강좌 담당자 안내 문자(상태변경·일정변경) 발송 이력
  const [staffSmsHistory, setStaffSmsHistory] = useState<CourseStaffSmsHistoryItem[]>([]);
  const [isStaffSmsHistoryLoading, setIsStaffSmsHistoryLoading] = useState(false);

  // 대표 역할(roleConfig.role) 1개만 보면 다중 역할 계정(예: ADMIN+COUNSELOR)에서
  // 대표 역할이 우연히 COUNSELOR로 뽑힐 경우 ADMIN 권한이 무시된다 → 전체 역할 배열로 판단
  const canEdit = roleConfig.roles.some((r) => ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER'].includes(r));
  const canDelete = roleConfig.roles.includes('ADMIN');
  const canChangeStatus = roleConfig.roles.some((r) => ['ADMIN', 'HEAD_OFFICE'].includes(r));

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

  const loadStaffSmsHistory = async () => {
    if (!Number.isFinite(courseId)) return;

    setIsStaffSmsHistoryLoading(true);
    try {
      const { data: response } = await getCourseStaffSmsHistory(courseId);
      setStaffSmsHistory(response.data.content ?? []);
    } catch {
      setStaffSmsHistory([]);
    } finally {
      setIsStaffSmsHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadCourse();
    void loadStaffs();
    void loadParticipants();
    void loadStaffSmsHistory();
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

    const payload = buildUpdatePayload(editForm);
    const original = watchedValuesFromCourse(course);
    // 비워둔 필드는 buildUpdatePayload에서도 제외되므로 "미변경"으로 간주한다.
    const hasWatchedChange = WATCHED_FIELDS.some((key) => {
      const currentValue = editForm[key];
      if (currentValue === '') return false;
      return currentValue !== original[key];
    });

    if (hasWatchedChange) {
      // 바로 저장하지 않고, 문자 발송 여부를 먼저 확인받는다.
      setPendingPayload(payload);
      setIsNotifyModalOpen(true);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await updateCourse(course.courseId, payload);
      setIsEditOpen(false);
      await loadCourse();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeNotifyModal = () => {
    if (notifySubmitting) return;
    setIsNotifyModalOpen(false);
    setPendingPayload(null);
  };

  const handleSaveOnly = async () => {
    if (!course || !pendingPayload) return;
    setNotifySubmitting(true);
    setErrorMessage('');
    try {
      await updateCourse(course.courseId, pendingPayload);
      setIsNotifyModalOpen(false);
      setPendingPayload(null);
      setIsEditOpen(false);
      await loadCourse();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setNotifySubmitting(false);
    }
  };

  const handleSaveAndNotify = async (userIds: number[]) => {
    if (!course || !pendingPayload) return;
    setNotifySubmitting(true);
    setErrorMessage('');
    try {
      await updateCourse(course.courseId, pendingPayload);
      if (userIds.length > 0) {
        try {
          await notifyCourseScheduleChange(course.courseId, { userIds });
          await loadStaffSmsHistory();
        } catch (notifyError) {
          // 강좌 정보 저장은 이미 성공했으므로, 발송 실패는 별도 안내만 하고 흐름을 막지 않는다.
          setErrorMessage(
            `${getErrorMessage(notifyError)} (강좌 정보 저장은 완료되었습니다. 문자 발송만 실패했습니다.)`,
          );
        }
      }
      setIsNotifyModalOpen(false);
      setPendingPayload(null);
      setIsEditOpen(false);
      await loadCourse();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setNotifySubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!course) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await updateCourseStatus(course.courseId, { status: statusForm });
      await loadCourse();
      // 모집마감/취소 전환 시 서버에서 자동으로 담당자 안내 문자를 보낼 수 있으므로 이력도 함께 갱신한다.
      await loadStaffSmsHistory();
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

            {/* 1~5일차 교육일을 한 행에 나란히 배치 */}
            <div className="field full">
              <label>교육 일정 (1~5일차)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '8px' }}>
                {([
                  ['day1Date', '1일차'],
                  ['day2Date', '2일차'],
                  ['day3Date', '3일차'],
                  ['day4Date', '4일차'],
                  ['day5Date', '5일차'],
                ] as const).map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>{label}</label>
                    <input
                      type="date"
                      value={editForm[key]}
                      onChange={(event) => updateEditForm(key, event.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
              </div>
            </div>

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
          <span className="section-title">담당자 안내 문자 발송 이력</span>
          <button
            className="btn"
            type="button"
            onClick={loadStaffSmsHistory}
            disabled={isStaffSmsHistoryLoading}
            style={{ marginLeft: 'auto' }}
          >
            {isStaffSmsHistoryLoading ? '조회 중...' : '새로고침'}
          </button>
        </div>
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>수신 담당자</th>
                <th>종류</th>
                <th>내용</th>
                <th>발송자</th>
                <th>발송 시각</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {staffSmsHistory.map((row) => (
                <tr key={row.courseStaffSmsId}>
                  <td className="pname">{row.userName ?? `담당자 #${row.userId}`}</td>
                  <td>{staffSmsNotifyTypeLabel(row.notifyType)}</td>
                  <td style={{ whiteSpace: 'pre-line', maxWidth: '320px' }}>{row.content ?? '-'}</td>
                  <td>{row.sentByName ?? (row.sentBy ? `#${row.sentBy}` : '시스템')}</td>
                  <td className="tnum">{row.sentAt ?? '-'}</td>
                  <td>
                    <span className={`chip ${staffSmsStatusClass(row.sendStatus)}`}>
                      {staffSmsStatusLabel(row.sendStatus)}
                    </span>
                  </td>
                </tr>
              ))}
              {staffSmsHistory.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    발송 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
      <CourseChangeNotifyModal
        isOpen={isNotifyModalOpen}
        courseId={courseId}
        onClose={closeNotifyModal}
        onSaveOnly={handleSaveOnly}
        onSaveAndNotify={handleSaveAndNotify}
        submitting={notifySubmitting}
      />
    </section>
  );
}