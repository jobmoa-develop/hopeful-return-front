import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useRole } from '../context/RoleContext';
import { getParticipants } from '../api/participants';
import type { ParticipantListItem } from '../api/participants';
import { getRegions } from '../api/regions';
import type { RegionSummary } from '../api/regions';
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
  BulkCounselorAssignModal,
  BulkImportModal,
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
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<number | ''>('');
  const [courseNumberQuery, setCourseNumberQuery] = useState('');
  const [courseNumber, setCourseNumber] = useState<number | ''>('');
  const [selectedStatus, setSelectedStatus] = useState('전체');

  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [counselorEditTarget, setCounselorEditTarget] = useState<ParticipantListItem | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'COMPLETED' | 'INCOMPLETE' | null>(null);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const canBulkComplete = roleConfig.can.complete === 1;
  // 상담사 일괄 배정 — editP(참여자 정보 수정) 롤 집합이 BE 일괄 배정 인가와 일치
  const canBulkAssignCounselor = roleConfig.can.editP === 1;
  // 체크박스 선택 UI는 일괄 처리 권한 중 하나라도 있으면 노출
  const canSelect = canBulkComplete || canBulkAssignCounselor;

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    // 지역·회차는 서버 필터(최신 수강건 기준). 상태는 아래 filteredList 에서 클라이언트 필터.
    getParticipants({
      name: searchName || undefined,
      regionId: selectedRegionId === '' ? undefined : selectedRegionId,
      courseNumber: courseNumber === '' ? undefined : courseNumber,
      page,
      size: PAGE_SIZE,
    })
      .then((res) => {
        const data = res.data.data;
        setItems(data?.content ?? []);
        setTotalElements(data?.totalElements ?? 0);
        setTotalPages(data?.totalPages ?? 0);
      })
      .catch((err) => setError(apiErrorMessage(err, '참여자 목록을 불러오지 못했습니다.')))
      .finally(() => setLoading(false));
  }, [searchName, selectedRegionId, courseNumber, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 지역 목록 로드(회차 필터 드롭다운)
  useEffect(() => {
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, []);

  // 검색어 디바운스 — 입력 후 잠시 멈추면 서버 검색(name) 실행
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchName(searchQuery.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 회차번호 디바운스 — 숫자만 반영, 빈 값이면 필터 해제
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = courseNumberQuery.trim();
      setCourseNumber(trimmed === '' ? '' : Number(trimmed));
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [courseNumberQuery]);

  // 진행상태는 현재 페이지 데이터 기준 클라이언트 필터(서버 미지원 — 범위 밖)
  const filteredList = useMemo(() => {
    let list = items;
    if (selectedStatus !== '전체') {
      list = list.filter((p) => statusLabel(p.latestEnrollment?.status) === selectedStatus);
    }
    return list;
  }, [items, selectedStatus]);

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
              value={selectedRegionId}
              onChange={(e) => {
                setSelectedRegionId(e.target.value === '' ? '' : Number(e.target.value));
                setPage(0);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">전체 ▾</option>
              {regions.map((r) => (
                <option key={r.regionId} value={r.regionId}>
                  {r.regionName}
                </option>
              ))}
            </select>
          </div>
          <div className="searchbox" style={{ width: '110px', padding: '4px 10px' }}>
            <input
              type="number"
              min={1}
              placeholder="회차번호"
              value={courseNumberQuery}
              onChange={(e) => setCourseNumberQuery(e.target.value)}
              style={{ fontSize: '12px' }}
            />
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
            className="btn"
            id="btn-bulk-import"
            onClick={() => setIsBulkImportOpen(true)}
            style={{ marginLeft: '10px' }}
          >
            ⬆ 일괄 등록
          </button>
        )}
        {roleConfig.can.register === 1 && (
          <button
            className="btn primary"
            id="btn-add-participant"
            onClick={() => setIsRegisterOpen(true)}
            style={{ marginLeft: '8px' }}
          >
            + 참여자 등록
          </button>
        )}
      </div>

      {canSelect && selectedIds.size > 0 && (
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
          {canBulkComplete && (
            <>
              <button className="btn primary" onClick={() => setBulkStatus('COMPLETED')}>
                일괄 수료
              </button>
              <button className="btn" onClick={() => setBulkStatus('INCOMPLETE')}>
                일괄 미수료
              </button>
            </>
          )}
          {canBulkAssignCounselor && (
            <button className="btn" onClick={() => setIsBulkAssignOpen(true)}>
              상담사 일괄 배정
            </button>
          )}
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
                {canSelect && (
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
                    {canSelect && (
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
                    colSpan={canSelect ? 8 : 7}
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
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
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
      {isBulkAssignOpen && selectedIds.size > 0 && (
        <BulkCounselorAssignModal
          isOpen={true}
          onClose={() => setIsBulkAssignOpen(false)}
          courseParticipantIds={Array.from(selectedIds)}
          sampleCourseParticipantId={Array.from(selectedIds)[0]}
          onSaved={handleBulkSaved}
        />
      )}
    </section>
  );
}
