import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { getParticipants } from '../api/participants';
import type { ParticipantListItem } from '../api/participants';
import {
  COUNSELING_TYPE_LABELS,
  CP_STATUS_CHIP,
  CP_STATUS_LABELS,
} from '../api/courseParticipants';
import type { CounselingType, CourseParticipantStatus } from '../api/courseParticipants';
import {
  ParticipantRegisterModal,
  CounselorEditModal,
  BulkCompletionModal,
} from '../components/ParticipantModals';
import { apiErrorMessage } from '../api/apiError';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const COUNSELING_TYPES: CounselingType[] = ['PRE_SESSION', 'POST_SESSION_1', 'POST_SESSION_2'];

function statusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return CP_STATUS_LABELS[status as CourseParticipantStatus] ?? status;
}

function statusChipClass(status: string | null | undefined): string {
  if (!status) return 'neutral';
  return CP_STATUS_CHIP[status as CourseParticipantStatus] ?? 'neutral';
}

function roundLabel(p: ParticipantListItem): string {
  const e = p.latestEnrollment;
  if (!e) return '—';
  const region = e.regionName ?? '';
  const round = e.localCourseNumber != null ? `${e.localCourseNumber}회차` : (e.courseName ?? '');
  return `${region} · ${round}`.replace(/^ · /, '');
}

function attendancePercent(p: ParticipantListItem): number | null {
  const e = p.latestEnrollment;
  if (!e || !e.totalCourseDays || e.totalCourseDays === 0 || e.attendedDays == null) return null;
  return Math.round((e.attendedDays / e.totalCourseDays) * 100);
}

export default function ParticipantsPage() {
  const navigate = useNavigate();
  const { roleConfig } = useRole();

  const [items, setItems] = useState<ParticipantListItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchName, setSearchName] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [selectedStatus, setSelectedStatus] = useState('전체');

  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [counselorEditTarget, setCounselorEditTarget] = useState<ParticipantListItem | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'COMPLETED' | 'INCOMPLETE' | null>(null);
  const canBulkComplete = roleConfig.can.complete === 1;

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    getParticipants({ name: searchName || undefined, page, size: PAGE_SIZE })
      .then((res) => {
        const data = res.data.data;
        setItems(data?.content ?? []);
        setTotalElements(data?.totalElements ?? 0);
        setTotalPages(data?.totalPages ?? 0);
      })
      .catch((err) => setError(apiErrorMessage(err, '참여자 목록을 불러오지 못했습니다.')))
      .finally(() => setLoading(false));
  }, [searchName, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 검색어 디바운스 — 입력 후 잠시 멈추면 서버 검색(name) 실행
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchName(searchQuery.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const regionOptions = useMemo(() => {
    const names = new Set<string>();
    for (const p of items) {
      if (p.latestEnrollment?.regionName) names.add(p.latestEnrollment.regionName);
    }
    return Array.from(names);
  }, [items]);

  // 지역·진행상태는 현재 페이지 데이터 기준 클라이언트 필터
  const filteredList = useMemo(() => {
    let list = items;
    if (selectedRegion !== '전체') {
      list = list.filter((p) => p.latestEnrollment?.regionName === selectedRegion);
    }
    if (selectedStatus !== '전체') {
      list = list.filter((p) => statusLabel(p.latestEnrollment?.status) === selectedStatus);
    }
    return list;
  }, [items, selectedRegion, selectedStatus]);

  const handleRowClick = (p: ParticipantListItem) => {
    if (!p.latestEnrollment) {
      alert('수강 이력이 없는 참여자입니다. 지역·회차 등록 후 상세를 확인할 수 있습니다.');
      return;
    }
    navigate(`/participants/${p.latestEnrollment.courseParticipantId}`);
  };

  const handleCounselorEdit = (e: React.MouseEvent, p: ParticipantListItem) => {
    e.stopPropagation();
    setCounselorEditTarget(p);
  };

  // 선택 가능한(수강 이력이 있는) 행의 courseParticipantId 목록
  const selectableIds = useMemo(
    () =>
      filteredList
        .map((p) => p.latestEnrollment?.courseParticipantId)
        .filter((id): id is number => id != null),
    [filteredList],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectableIds.every((id) => next.has(id))) {
        selectableIds.forEach((id) => next.delete(id));
      } else {
        selectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectRow = (cpId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cpId)) next.delete(cpId);
      else next.add(cpId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkSaved = () => {
    clearSelection();
    setBulkStatus(null);
    fetchList();
  };

  return (
    <section className="view active" id="view-participants">
      <div className="perm-bar" id="perm-participants">
        <span className="pb-ic">🔑</span>
        <span id="perm-participants-txt">{roleConfig.perm}</span>
      </div>

      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <div className="select">
            <span className="ico">지역</span>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="전체">전체 ▾</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="select">
            <span className="ico">진행상태</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="전체">전체 ▾</option>
              {Object.values(CP_STATUS_LABELS).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="searchbox" style={{ width: '180px', padding: '4px 10px' }}>
            <input
              type="text"
              placeholder="참여자 이름 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '12px' }}
            />
          </div>
        </div>

        <span className="count" id="p-count">
          총 {totalElements}명{loading ? ' · 불러오는 중…' : ''}
        </span>

        {roleConfig.can.register === 1 && (
          <button
            className="btn primary"
            id="btn-add-participant"
            onClick={() => setIsRegisterOpen(true)}
            style={{ marginLeft: '10px' }}
          >
            + 참여자 등록
          </button>
        )}
      </div>

      {canBulkComplete && selectedIds.size > 0 && (
        <div
          className="card"
          style={{
            padding: '10px 14px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <strong style={{ fontSize: '13px' }}>{selectedIds.size}건 선택됨</strong>
          <button className="btn primary" onClick={() => setBulkStatus('COMPLETED')}>
            일괄 수료
          </button>
          <button className="btn" onClick={() => setBulkStatus('INCOMPLETE')}>
            일괄 미수료
          </button>
          <button className="btn" onClick={clearSelection} style={{ marginLeft: 'auto' }}>
            선택 해제
          </button>
        </div>
      )}

      {error && (
        <div
          className="card"
          style={{ padding: '14px', marginBottom: '12px', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      <div className="card">
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                {canBulkComplete && (
                  <th style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="전체 선택"
                    />
                  </th>
                )}
                <th>참여자</th>
                <th>지역 / 회차</th>
                <th>진행상태</th>
                <th>사전상담</th>
                <th>출결</th>
                <th>상담사 (사전 · 사후1 · 사후2)</th>
                <th>수료일</th>
              </tr>
            </thead>
            <tbody id="p-rows">
              {filteredList.map((p) => {
                const e = p.latestEnrollment;
                const att = attendancePercent(p);
                const cpId = e?.courseParticipantId;
                return (
                  <tr key={p.participantId} onClick={() => handleRowClick(p)}>
                    {canBulkComplete && (
                      <td onClick={(ev) => ev.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={cpId != null && selectedIds.has(cpId)}
                          disabled={cpId == null}
                          onChange={() => cpId != null && toggleSelectRow(cpId)}
                          aria-label={`${p.name} 선택`}
                        />
                      </td>
                    )}
                    <td>
                      <div className="pname">{p.name}</div>
                      <div className="cell-sub">{p.matchKey ?? p.phone}</div>
                    </td>
                    <td>{roundLabel(p)}</td>
                    <td>
                      <span className={`chip ${statusChipClass(e?.status)}`}>
                        {statusLabel(e?.status)}
                      </span>
                    </td>
                    <td>
                      {e ? (
                        <span className={`chip ${e.preCounselingCompleted ? 'ok' : 'warn'}`}>
                          {e.preCounselingCompleted ? '완료' : '미완료'}
                        </span>
                      ) : (
                        <span className="chip neutral">—</span>
                      )}
                    </td>
                    <td>
                      {att != null ? (
                        <div className="mini-prog">
                          <div className="bar">
                            <span style={{ width: `${att}%` }}></span>
                          </div>
                          <span className="muted tnum" style={{ fontSize: '11.5px' }}>
                            {e?.attendedDays}/{e?.totalCourseDays}일 ({att}%)
                          </span>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {e ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {COUNSELING_TYPES.map((type) => {
                            const slot = e.counselors.find((c) => c.status === type);
                            return (
                              <span
                                key={type}
                                className={`chip ${slot?.completed ? 'ok' : 'neutral'}`}
                                title={COUNSELING_TYPE_LABELS[type]}
                              >
                                {slot ? (slot.counselorName ?? `#${slot.counselorId}`) : '—'}
                              </span>
                            );
                          })}
                          {roleConfig.can.editP === 1 && (
                            <button
                              className="btn"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={(ev) => handleCounselorEdit(ev, p)}
                            >
                              편집
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{e?.completionDate ?? '—'}</td>
                  </tr>
                );
              })}
              {!loading && filteredList.length === 0 && (
                <tr>
                  <td
                    colSpan={canBulkComplete ? 8 : 7}
                    style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
                  >
                    조건에 일치하는 참여자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            marginTop: '12px',
          }}
        >
          <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            이전
          </button>
          <span className="muted" style={{ fontSize: '12px' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            className="btn"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </button>
        </div>
      )}

      <p className="note">
        행을 클릭하면 참여자 상세(전체 여정)로 이동합니다. 수강 이력이 없는 참여자는 상세가 제공되지
        않습니다.
      </p>

      <ParticipantRegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSaved={fetchList}
      />
      {counselorEditTarget?.latestEnrollment && (
        <CounselorEditModal
          isOpen={true}
          onClose={() => setCounselorEditTarget(null)}
          courseParticipantId={counselorEditTarget.latestEnrollment.courseParticipantId}
          counselors={counselorEditTarget.latestEnrollment.counselors}
          onSaved={fetchList}
        />
      )}
      {bulkStatus && (
        <BulkCompletionModal
          isOpen={true}
          onClose={() => setBulkStatus(null)}
          courseParticipantIds={Array.from(selectedIds)}
          status={bulkStatus}
          onSaved={handleBulkSaved}
        />
      )}
    </section>
  );
}
