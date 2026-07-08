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
import { useRole } from '../context/RoleContext';

const STATUS_OPTIONS = ['PLANNED', 'OPEN', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

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
  const [editForm, setEditForm] = useState<CourseUpdateRequest>({
    courseName: '',
    capacity: 0,
    minimumCapacity: 0,
    location: '',
  });
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
        courseName: response.data.courseName,
        capacity: response.data.capacity,
        minimumCapacity: response.data.minimumCapacity,
        location: response.data.location,
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
    if (!Number.isFinite(courseId)) return;

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

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!course) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await updateCourse(course.courseId, editForm);
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

  const capacityPercent = course.capacity ? Math.min(100, Math.round(((participants.length || 0) / course.capacity) * 100)) : 0;
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
              <label>강좌명</label>
              <input value={editForm.courseName} onChange={(event) => setEditForm((prev) => ({ ...prev, courseName: event.target.value }))} />
            </div>
            <div className="field">
              <label>정원</label>
              <input
                type="number"
                value={editForm.capacity}
                onChange={(event) => setEditForm((prev) => ({ ...prev, capacity: Number(event.target.value) }))}
              />
            </div>
            <div className="field">
              <label>최소 정원</label>
              <input
                type="number"
                value={editForm.minimumCapacity}
                onChange={(event) => setEditForm((prev) => ({ ...prev, minimumCapacity: Number(event.target.value) }))}
              />
            </div>
            <div className="field full">
              <label>교육장</label>
              <input value={editForm.location} onChange={(event) => setEditForm((prev) => ({ ...prev, location: event.target.value }))} />
            </div>
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
              <span className="k">지역 ID</span>
              <span className="v tnum">{course.regionId}</span>
            </div>
            <div className="kv">
              <span className="k">회차</span>
              <span className="v tnum">{course.courseNumber}기</span>
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
            <span className={`chip ${participants.length >= course.minimumCapacity ? 'ok' : 'warn'}`}>
              {participants.length >= course.minimumCapacity ? '최소 정원 충족' : '모집 보강 필요'}
            </span>
          </div>
          <div className="card-b">
            <div className="capacity">
              <div className="big tnum">
                {participants.length}
                <small> / {course.capacity}명</small>
              </div>
              <div style={{ flex: 1 }}>
                <div className="cap-bar">
                  <span style={{ width: `${capacityPercent}%` }}></span>
                  <div className="thr" style={{ left: `${minPercent}%` }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                  <span>조회된 참여자 {participants.length}명</span>
                  <span style={{ color: 'var(--danger)' }}>최소 정원 {course.minimumCapacity}명</span>
                </div>
              </div>
            </div>
            <button className="btn" type="button" onClick={loadParticipants} disabled={isParticipantsLoading}>
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
              {staffs.map((staff, index) => (
                <div className="assignee" key={staff.staffId ?? staff.courseParticipantId ?? index}>
                  <div className="ra">{(staff.role ?? '담당').slice(0, 2)}</div>
                  <div>
                    <div className="rr">{staff.role ?? staff.status ?? '담당자'}</div>
                    <div className="rnm">{staff.name ?? staff.staffName ?? `담당자 #${staff.staffId ?? staff.courseParticipantId ?? index + 1}`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">강좌 참여자</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
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
    </section>
  );
}
