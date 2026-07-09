import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { createCourse, getCourses } from '../api/courses';
import type { CourseCreateRequest, CourseStatus, CourseSummary } from '../api/courses';
import { useRole } from '../context/RoleContext';

const STATUS_OPTIONS = ['PLANNED', 'OPEN', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const EMPTY_FORM: CourseCreateRequest = {
  regionId: 3,
  courseNumber: 1,
  courseName: '',
  recruitStart: '',
  recruitEnd: '',
  day1Date: '',
  day2Date: '',
  day3Date: '',
  day4Date: '',
  day5Date: '',
  educationStartTime: '09:00',
  educationEndTime: '18:00',
  capacity: 40,
  minimumCapacity: 15,
  location: '',
  planSubmitDate: '',
};

function statusLabel(status?: CourseStatus) {
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

function statusClass(status?: CourseStatus) {
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

export default function RoundsPage() {
  const navigate = useNavigate();
  const { roleConfig } = useRole();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [regionId, setRegionId] = useState('');
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<CourseCreateRequest>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreate = ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER'].includes(roleConfig.role);

  const loadCourses = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const { data: response } = await getCourses({
        regionId: regionId ? Number(regionId) : undefined,
        status: status || undefined,
        keyword: keyword || undefined,
        page,
        size,
      });
      setCourses(response.data.content ?? []);
      setTotalPages(response.data.totalPages ?? 0);
      setTotalElements(response.data.totalElements ?? 0);
    } catch (error) {
      setCourses([]);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, [page, size]);

  const handleSearch = () => {
    if (page === 0) {
      void loadCourses();
      return;
    }
    setPage(0);
  };

  const updateForm = (key: keyof CourseCreateRequest, value: string) => {
    const numericKeys: Array<keyof CourseCreateRequest> = ['regionId', 'courseNumber', 'capacity', 'minimumCapacity'];
    setForm((prev) => ({
      ...prev,
      [key]: numericKeys.includes(key) ? Number(value) : value,
    }));
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    if (totalElements === 0) return '등록된 강좌가 없습니다.';
    return `총 ${totalElements.toLocaleString()}개 강좌`;
  }, [totalElements]);

  return (
    <section className="view active" id="view-rounds">
      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
          <div className="select">
            <span className="ico">지역 ID</span>
            <input
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
              inputMode="numeric"
              placeholder="전체"
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '72px' }}
            />
          </div>
          <div className="select">
            <span className="ico">상태</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
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
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="강좌명 검색"
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '140px' }}
            />
          </div>
          <button className="btn" type="button" onClick={handleSearch} disabled={isLoading}>
            검색
          </button>
        </div>

        {canCreate && (
          <button className="btn primary" id="btn-add-round" type="button" onClick={() => setIsCreateOpen((prev) => !prev)}>
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
            <div className="field">
              <label>지역 ID</label>
              <input type="number" value={form.regionId} onChange={(event) => updateForm('regionId', event.target.value)} required />
            </div>
            <div className="field">
              <label>회차 번호</label>
              <input type="number" value={form.courseNumber} onChange={(event) => updateForm('courseNumber', event.target.value)} required />
            </div>
            <div className="field full">
              <label>강좌명</label>
              <input value={form.courseName} onChange={(event) => updateForm('courseName', event.target.value)} required />
            </div>
            <div className="field">
              <label>모집 시작일</label>
              <input type="date" value={form.recruitStart} onChange={(event) => updateForm('recruitStart', event.target.value)} required />
            </div>
            <div className="field">
              <label>모집 종료일</label>
              <input type="date" value={form.recruitEnd} onChange={(event) => updateForm('recruitEnd', event.target.value)} required />
            </div>
            {(['day1Date', 'day2Date', 'day3Date', 'day4Date', 'day5Date'] as const).map((key, index) => (
              <div className="field" key={key}>
                <label>{index + 1}일차 교육일</label>
                <input type="date" value={form[key]} onChange={(event) => updateForm(key, event.target.value)} required />
              </div>
            ))}
            <div className="field">
              <label>교육 시작시간</label>
              <input type="time" value={form.educationStartTime} onChange={(event) => updateForm('educationStartTime', event.target.value)} required />
            </div>
            <div className="field">
              <label>교육 종료시간</label>
              <input type="time" value={form.educationEndTime} onChange={(event) => updateForm('educationEndTime', event.target.value)} required />
            </div>
            <div className="field">
              <label>정원</label>
              <input type="number" value={form.capacity} onChange={(event) => updateForm('capacity', event.target.value)} required />
            </div>
            <div className="field">
              <label>최소 정원</label>
              <input type="number" value={form.minimumCapacity} onChange={(event) => updateForm('minimumCapacity', event.target.value)} required />
            </div>
            <div className="field">
              <label>수행계획서 제출일</label>
              <input type="date" value={form.planSubmitDate} onChange={(event) => updateForm('planSubmitDate', event.target.value)} required />
            </div>
            <div className="field">
              <label>교육장</label>
              <input value={form.location} onChange={(event) => updateForm('location', event.target.value)} required />
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
          <table className="data">
            <thead>
              <tr>
                <th>강좌명</th>
                <th>지역</th>
                <th>회차</th>
                <th>정원</th>
                <th>교육장</th>
                <th>상태</th>
                <th>계획서 제출일</th>
              </tr>
            </thead>
            <tbody id="r-rows">
              {courses.map((course, index) => (
                <tr
                  key={course.courseId ?? index}
                  onClick={() => {
                    if (course.courseId) navigate(`/rounds/${course.courseId}`);
                  }}
                >
                  <td className="pname">{course.courseName ?? `강좌 #${course.courseId}`}</td>
                  <td>{course.regionName ?? course.regionId ?? '-'}</td>
                  <td className="tnum">{course.courseNumber ? `${course.courseNumber}기` : '-'}</td>
                  <td className="tnum">
                    {course.currentParticipants ?? 0}
                    <span className="muted"> / {course.capacity ?? '-'}</span>
                  </td>
                  <td>{course.location ?? '-'}</td>
                  <td>
                    <span className={`chip ${statusClass(course.status)}`}>{statusLabel(course.status)}</span>
                  </td>
                  <td className="tnum">{course.planSubmitDate ?? '-'}</td>
                </tr>
              ))}
              {!isLoading && courses.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    등록된 강좌가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="filters" style={{ marginTop: '14px' }}>
        <button className="btn" type="button" disabled={page <= 0 || isLoading} onClick={() => setPage((prev) => Math.max(0, prev - 1))}>
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
    </section>
  );
}
