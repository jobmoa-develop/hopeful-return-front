import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounceSearch } from '../hooks/useDebounceSearch';
import { useNavigate } from 'react-router';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { getParticipants, deleteParticipant } from '../api/participants';
import type { ParticipantListItem } from '../api/participants';
import { SmsSendModal } from '../components/SmsModals';
import { getRegions, groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { RegionSelect } from '../components/RegionSelect';
import type { RegionFilterValue } from '../components/RegionSelect';
import { buildRoundParams, roundInputPlaceholder } from '../utils/roundFilter';
import {
  COUNSELING_TYPE_LABELS,
  CP_STATUS_CHIP,
  CP_STATUS_LABELS,
  deleteCourseParticipant,
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
import { useTableSort } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';

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
  const { user } = useAuth();
  const canSendSms = user?.canSendSms ?? false;

  const [items, setItems] = useState<ParticipantListItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchNameInput = useDebounceSearch('', SEARCH_DEBOUNCE_MS);
  const searchName = searchNameInput.debouncedValue.trim();
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const regionGroups = useMemo(() => groupRegionsByParent(regions), [regions]);
  // 지역 필터 — 상위(서울)=parentRegionId, 하위(양천)=regionId, 전체={}.
  const [regionFilter, setRegionFilter] = useState<RegionFilterValue>({});
  const [courseNumberQuery, setCourseNumberQuery] = useState('');
  const [courseNumber, setCourseNumber] = useState<number | ''>('');
  const [selectedStatus, setSelectedStatus] = useState('전체');
  // 전산 등록일 필터(최신 수강건 created_at 기준). 빈 값이면 미적용.
  const [registerDateFrom, setRegisterDateFrom] = useState('');
  const [registerDateTo, setRegisterDateTo] = useState('');

  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [counselorEditTarget, setCounselorEditTarget] = useState<ParticipantListItem | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'COMPLETED' | 'INCOMPLETE' | null>(null);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [isSmsOpen, setIsSmsOpen] = useState(false);
  const [smsRecipients, setSmsRecipients] = useState<ParticipantListItem[]>([]);
  // 회차 등록 취소(수강건 삭제) — 백엔드 DELETE /api/course-participants/{id} 권한(ADMIN·OPERATOR)과 일치
  const canDeleteEnrollment =
    roleConfig.roles.includes('ADMIN') || roleConfig.roles.includes('OPERATOR');
  // 참여자 완전 삭제 — 백엔드 DELETE /api/participants/{id} 권한(ADMIN). 회차 이력 없는(고아) 참여자에만 노출.
  const isAdmin = roleConfig.roles.includes('ADMIN');
  const canBulkComplete = roleConfig.can.complete === 1;
  // 상담사 일괄 배정 — editP(참여자 정보 수정) 롤 집합이 BE 일괄 배정 인가와 일치
  const canBulkAssignCounselor = roleConfig.can.editP === 1;
  // 체크박스 선택 UI는 일괄 처리·문자 발송 권한 중 하나라도 있으면 노출
  const canSelect = canBulkComplete || canBulkAssignCounselor || canSendSms;

  const sort = useTableSort();

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    // 지역·회차는 서버 필터(최신 수강건 기준). 상태는 아래 filteredList 에서 클라이언트 필터.
    getParticipants({
      name: searchName || undefined,
      regionId: regionFilter.regionId,
      parentRegionId: regionFilter.parentRegionId,
      ...buildRoundParams(regionFilter, courseNumber),
      registerDateFrom: registerDateFrom || undefined,
      registerDateTo: registerDateTo || undefined,
      ...sort.params,
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
  }, [
    searchName,
    regionFilter.regionId,
    regionFilter.parentRegionId,
    courseNumber,
    registerDateFrom,
    registerDateTo,
    sort.sortBy,
    sort.sortOrder,
    page,
  ]);

  // 페이지를 리셋시켜야 하는 필터들을 하나의 키로 묶어서, 필터 변경 시
  // page 리셋 + fetch가 각각 별도 effect로 실행되며 API가 2번 호출되는 것을 방지한다.
  const filterKey = useMemo(
    () =>
      JSON.stringify([
        searchName,
        regionFilter.regionId,
        regionFilter.parentRegionId,
        courseNumber,
        registerDateFrom,
        registerDateTo,
        sort.sortBy,
        sort.sortOrder,
      ]),
    [
      searchName,
      regionFilter.regionId,
      regionFilter.parentRegionId,
      courseNumber,
      registerDateFrom,
      registerDateTo,
      sort.sortBy,
      sort.sortOrder,
    ],
  );
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 0) {
        setPage(0);
        return; // page 변경으로 이 effect가 다시 실행되며 fetchList가 호출됨 (중복 방지)
      }
    }
    fetchList();
  }, [filterKey, page, fetchList]);

  // 지역 목록 로드(회차 필터 드롭다운)
  useEffect(() => {
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, []);

  // 회차번호 디바운스 — 숫자만 반영, 빈 값이면 필터 해제 (page 리셋은 위 filterKey effect가 처리)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = courseNumberQuery.trim();
      setCourseNumber(trimmed === '' ? '' : Number(trimmed));
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

  // 최신 회차 등록 취소(수강건 삭제) — 참여자 원본·타 회차 이력은 유지된다.
  const handleDeleteEnrollment = async (e: React.MouseEvent, p: ParticipantListItem) => {
    e.stopPropagation();
    const cpId = p.latestEnrollment?.courseParticipantId;
    if (cpId == null) return;
    if (
      !window.confirm(
        `${p.name} 님의 최신 회차 등록을 취소(삭제)할까요?\n참여자 정보와 다른 회차 이력은 유지됩니다.`,
      )
    )
      return;
    try {
      await deleteCourseParticipant(cpId);
      fetchList();
    } catch (err) {
      alert(apiErrorMessage(err, '회차 등록 취소에 실패했습니다.'));
    }
  };

  // 회차 이력이 없는(고아) 참여자 완전 삭제 — 이력이 있으면 서버가 차단(먼저 회차 취소 필요).
  const handleDeleteParticipant = async (e: React.MouseEvent, p: ParticipantListItem) => {
    e.stopPropagation();
    if (!window.confirm(`${p.name} 참여자를 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteParticipant(p.participantId);
      fetchList();
    } catch (err) {
      alert(apiErrorMessage(err, '참여자 삭제에 실패했습니다.'));
    }
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

  // 선택된(현재 로드된) 참여자 중 수강 이력이 있는 대상으로 문자 모달 열기
  const openSms = () => {
    const recipients = items.filter((p) => {
      const id = p.latestEnrollment?.courseParticipantId;
      return id != null && selectedIds.has(id);
    });
    if (recipients.length === 0) {
      alert('문자를 보낼 참여자를 선택하세요. (수강 이력이 있는 참여자만 발송 가능)');
      return;
    }
    setSmsRecipients(recipients);
    setIsSmsOpen(true);
  };

  const handleSmsSent = () => {
    clearSelection();
  };

  return (
    <section className="view active" id="view-participants">
      <div className="perm-bar" id="perm-participants">
        <span className="pb-ic">🔑</span>
        <span id="perm-participants-txt">{roleConfig.perm}</span>
      </div>

      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <RegionSelect
            groups={regionGroups}
            value={regionFilter}
            onChange={(v) => {
              setRegionFilter(v);
            }}
            allowParentSelect
            allLabel="전체 지역"
          />
          <div className="searchbox" style={{ width: '110px', padding: '4px 10px' }}>
            <input
              type="number"
              min={1}
              placeholder={roundInputPlaceholder(regionFilter)}
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
              {...searchNameInput.inputProps}
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className="select" title="전산 등록일 기준">
            <span className="ico">등록일</span>
            <input
              type="date"
              value={registerDateFrom}
              onChange={(e) => {
                setRegisterDateFrom(e.target.value);
              }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px' }}
            />
            <span className="muted" style={{ fontSize: '12px' }}>
              ~
            </span>
            <input
              type="date"
              value={registerDateTo}
              onChange={(e) => {
                setRegisterDateTo(e.target.value);
              }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px' }}
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
          {canSendSms && (
            <button className="btn primary" onClick={openSms}>
              ✉ 문자 발송
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
                <SortableTh column="name" sortBy={sort.sortBy} sortOrder={sort.sortOrder} onSort={sort.toggle}>
                  참여자
                </SortableTh>
                <SortableTh column="region" sortBy={sort.sortBy} sortOrder={sort.sortOrder} onSort={sort.toggle}>
                  지역 / 회차
                </SortableTh>
                <th>진행상태</th>
                <th>사전상담</th>
                <th>출결</th>
                <th>상담사 (사전 · 사후1 · 사후2)</th>
                <th>수료일</th>
                {canDeleteEnrollment && <th style={{ width: '84px' }}>관리</th>}
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
                    {canDeleteEnrollment && (
                      <td onClick={(ev) => ev.stopPropagation()}>
                        {cpId != null ? (
                          <button
                            className="btn danger"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={(ev) => handleDeleteEnrollment(ev, p)}
                          >
                            회차 취소
                          </button>
                        ) : isAdmin ? (
                          <button
                            className="btn danger"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            title="회차 이력이 없는 참여자 완전 삭제"
                            onClick={(ev) => handleDeleteParticipant(ev, p)}
                          >
                            참여자 삭제
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {!loading && filteredList.length === 0 && (
                <tr>
                  <td
                    colSpan={7 + (canSelect ? 1 : 0) + (canDeleteEnrollment ? 1 : 0)}
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
      {canSendSms && (
        <SmsSendModal
          isOpen={isSmsOpen}
          onClose={() => setIsSmsOpen(false)}
          recipients={smsRecipients}
          currentUserId={user?.userId}
          onSent={handleSmsSent}
        />
      )}
    </section>
  );
}