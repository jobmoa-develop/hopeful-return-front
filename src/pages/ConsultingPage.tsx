import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounceSearch } from '../hooks/useDebounceSearch';
import { useNavigate } from 'react-router';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { getCourseParticipants, CP_STATUS_CHIP, CP_STATUS_LABELS } from '../api/courseParticipants';
import type {
  CourseParticipantListItem,
  CounselingType,
  CourseParticipantStatus,
} from '../api/courseParticipants';
import { getRegions, groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { RegionSelect } from '../components/RegionSelect';
import type { RegionFilterValue } from '../components/RegionSelect';
import { buildRoundParams, roundInputPlaceholder } from '../utils/roundFilter';
import { CounselingSessionModal, SlotCounselorAssignModal } from '../components/ParticipantModals';
import { apiErrorMessage } from '../api/apiError';

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;
const SLOT_COLUMNS: { type: CounselingType; label: string }[] = [
  { type: 'PRE_SESSION', label: '사전상담' },
  { type: 'POST_SESSION_1', label: '사후 1차' },
  { type: 'POST_SESSION_2', label: '사후 2차' },
];

export default function ConsultingPage() {
  const navigate = useNavigate();
  const { roleConfig } = useRole();
  const { user } = useAuth();
  const currentUserId = user?.userId;
  const isCounselorOnly = roleConfig.role === 'COUNSELOR';

  const [items, setItems] = useState<CourseParticipantListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionTarget, setSessionTarget] = useState<CourseParticipantListItem | null>(null);
  const [assignTarget, setAssignTarget] = useState<CourseParticipantListItem | null>(null);

  // 검색 필터 (서버측)
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const searchNameInput = useDebounceSearch('', SEARCH_DEBOUNCE_MS);
  const searchName = searchNameInput.debouncedValue.trim();
  const [regionFilter, setRegionFilter] = useState<RegionFilterValue>({});
  const [courseNumber, setCourseNumber] = useState('');
  const [status, setStatus] = useState('');

  const regionGroups = useMemo(() => groupRegionsByParent(regions), [regions]);
  const canConsult = roleConfig.can.consult === 1;
  const canAssign = canConsult || roleConfig.can.editP === 1;
  // 지역 목록(GET /api/regions)은 COUNSELOR 권한 밖 — 상담사는 어차피 본인 배정건만 조회하므로 지역 필터 생략
  const canFilterRegion = roleConfig.role !== 'COUNSELOR';

  useEffect(() => {
    if (!canFilterRegion) return;
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, [canFilterRegion]);

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    // 지역 정렬(양천 → 강북 → 천안 → 의정부...) + 이름 가나다순 정렬은 서버가 처리한다.
    getCourseParticipants({
      keyword: searchName || undefined,
      regionId: regionFilter.regionId,
      parentRegionId: regionFilter.parentRegionId,
      ...buildRoundParams(regionFilter, courseNumber),
      status: status || undefined,
      page: 0,
      size: PAGE_SIZE,
    })
      .then((res) => setItems(res.data.data?.content ?? []))
      .catch((err) => setError(apiErrorMessage(err, '상담 대상 목록을 불러오지 못했습니다.')))
      .finally(() => setLoading(false));
  }, [searchName, regionFilter.regionId, regionFilter.parentRegionId, courseNumber, status]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const roundText = (p: CourseParticipantListItem) =>
    [p.regionName, p.localCourseNumber != null ? `${p.localCourseNumber}회차` : p.courseName]
      .filter(Boolean)
      .join(' · ') || '—';

  return (
    <section className="view active" id="view-consulting">
      <div className="perm-bar">
        <span className="pb-ic">💬</span>
        <span id="perm-consulting-txt">
          {canConsult
            ? '배정 참여자 상담 입력·상담사 지정 가능 · 사전(대면1)·사후(대면2)'
            : '상담 현황 조회만 가능'}
        </span>
      </div>

      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <div className="searchbox" style={{ width: '170px', padding: '4px 10px' }}>
            <input
              type="text"
              placeholder="이름·전화 검색..."
              {...searchNameInput.inputProps}
              style={{ fontSize: '12px' }}
            />
          </div>
          {canFilterRegion && (
            <RegionSelect
              value={regionFilter}
              onChange={setRegionFilter}
              groups={regionGroups}
              allowParentSelect
              allLabel="전체 지역"
            />
          )}
          <div className="searchbox" style={{ width: '110px', padding: '4px 10px' }}>
            <input
              type="number"
              min={1}
              value={courseNumber}
              onChange={(e) => setCourseNumber(e.target.value)}
              placeholder={roundInputPlaceholder(regionFilter)}
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className="select">
            <span className="ico">진행상태</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">전체</option>
              {(Object.keys(CP_STATUS_LABELS) as CourseParticipantStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CP_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span className="count">
          총 {items.length}건{loading ? ' · 불러오는 중…' : ''}
        </span>
      </div>

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
                <th>참여자</th>
                <th>지역 / 회차</th>
                <th>진행상태</th>
                <th>사전상담</th>
                <th>사후 1차</th>
                <th>사후 2차</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody id="consult-rows">
              {items.map((p) => {
                const st = p.status as CourseParticipantStatus;
                return (
                  <tr
                    key={p.courseParticipantId}
                    onClick={() => navigate(`/participants/${p.courseParticipantId}`)}
                  >
                    <td>
                      <div className="pname">{p.participantName}</div>
                      <div className="cell-sub">{p.matchKey ?? p.phone}</div>
                    </td>
                    <td>{roundText(p)}</td>
                    <td>
                      <span className={`chip ${CP_STATUS_CHIP[st] ?? 'neutral'}`}>
                        {CP_STATUS_LABELS[st] ?? p.status ?? '—'}
                      </span>
                    </td>
                    {SLOT_COLUMNS.map(({ type }) => {
                      const slot = p.counselors.find((c) => c.status === type);
                      return (
                        <td key={type}>
                          {slot ? (
                            <>
                              <span className={`chip ${slot.completed ? 'ok' : 'warn'}`}>
                                {slot.completed ? '완료' : '미완료'}
                              </span>
                              <div className="cell-sub">
                                {slot.counselorName ?? `#${slot.counselorId}`}
                              </div>
                            </>
                          ) : (
                            <span className="chip neutral">배정 전</span>
                          )}
                        </td>
                      );
                    })}
                    <td onClick={(ev) => ev.stopPropagation()}>
                      {canConsult ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            className="btn"
                            style={{ padding: '5px 11px', fontSize: '12px' }}
                            onClick={() => setSessionTarget(p)}
                          >
                            상담 입력
                          </button>
                          {canAssign && (
                            <button
                              className="btn"
                              style={{ padding: '5px 11px', fontSize: '12px' }}
                              onClick={() => setAssignTarget(p)}
                            >
                              상담사 지정
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '11.5px' }}>
                          조회
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
                  >
                    조회된 상담 대상이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">
        ※ 상담 완료 = 종료 일시 입력 기준 · 상담사는 본인 배정 참여자만 조회됩니다 · 상담사 지정은
        해당 회차 배치 상담사만 가능
      </p>

      {sessionTarget && (
        <CounselingSessionModal
          isOpen={true}
          onClose={() => setSessionTarget(null)}
          courseParticipantId={sessionTarget.courseParticipantId}
          counselors={sessionTarget.counselors}
          currentUserId={currentUserId}
          counselorOnly={isCounselorOnly}
          onSaved={fetchList}
        />
      )}
      {assignTarget && (
        <SlotCounselorAssignModal
          isOpen={true}
          onClose={() => setAssignTarget(null)}
          courseParticipantId={assignTarget.courseParticipantId}
          counselors={assignTarget.counselors}
          currentUserId={currentUserId}
          counselorOnly={isCounselorOnly}
          onSaved={fetchList}
        />
      )}
    </section>
  );
}