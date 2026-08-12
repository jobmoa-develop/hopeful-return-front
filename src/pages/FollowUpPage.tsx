import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounceSearch } from '../hooks/useDebounceSearch';
import { useRole } from '../context/RoleContext';
import { getFollowUpList } from '../api/followUps';
import type { FollowUpListItem } from '../api/followUps';
import { getRegions, groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { RegionSelect } from '../components/RegionSelect';
import type { RegionFilterValue } from '../components/RegionSelect';
import { buildRoundParams, roundInputPlaceholder } from '../utils/roundFilter';
import { apiErrorMessage } from '../api/apiError';
import { FollowUpDetailModal } from '../components/FollowUpModals';
import { useTableSort } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

// 지역·회차 라벨 — 참여자관리와 동일 톤("남부 · 3회차")
function roundLabel(it: FollowUpListItem): string {
  const region = it.regionName ?? '';
  const round = it.localCourseNumber != null ? `${it.localCourseNumber}회차` : '';
  return `${region} · ${round}`.replace(/^ · /, '').replace(/ · $/, '');
}

export default function FollowUpPage() {
  const { roleConfig } = useRole();

  const [items, setItems] = useState<FollowUpListItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchNameInput = useDebounceSearch('', SEARCH_DEBOUNCE_MS);
  const searchName = searchNameInput.debouncedValue.trim();
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [regionFilter, setRegionFilter] = useState<RegionFilterValue>({});
  const [courseNumberQuery, setCourseNumberQuery] = useState('');
  const [courseNumber, setCourseNumber] = useState<number | ''>('');
  const [employment, setEmployment] = useState<'전체' | '취업' | '미취업'>('전체');
  const [detailItem, setDetailItem] = useState<FollowUpListItem | null>(null);
  const canEdit = roleConfig.can.consult === 1;

  // 상위(서울/충청남도/경기도)는 optgroup 라벨로만 표시(선택 불가), 하위 지역만 실제 옵션
  const regionGroups = useMemo(() => groupRegionsByParent(regions), [regions]);

  const sort = useTableSort();

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    getFollowUpList({
      name: searchName || undefined,
      regionId: regionFilter.regionId,
      parentRegionId: regionFilter.parentRegionId,
      ...buildRoundParams(regionFilter, courseNumber),
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
      .catch((err) => setError(apiErrorMessage(err, '사후관리 목록을 불러오지 못했습니다.')))
      .finally(() => setLoading(false));
  }, [searchName, regionFilter.regionId, regionFilter.parentRegionId, courseNumber, sort.sortBy, sort.sortOrder, page]);

  // 페이지를 리셋시켜야 하는 필터들을 하나의 키로 묶어서 API 중복 호출 방지
  const filterKey = useMemo(
    () =>
      JSON.stringify([
        searchName,
        regionFilter.regionId,
        regionFilter.parentRegionId,
        courseNumber,
        sort.sortBy,
        sort.sortOrder,
      ]),
    [searchName, regionFilter.regionId, regionFilter.parentRegionId, courseNumber, sort.sortBy, sort.sortOrder],
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

  // 취업여부는 현재 페이지 데이터 기준 클라이언트 필터(BE 미지원 — 범위 밖)
  const filteredList = useMemo(() => {
    if (employment === '전체') return items;
    const wantEmployed = employment === '취업';
    return items.filter((it) => (it.employmentDate != null) === wantEmployed);
  }, [items, employment]);

  return (
    <section className="view active" id="view-followup">
      <div className="perm-bar" id="perm-followup">
        <span className="pb-ic">🔑</span>
        <span id="perm-followup-txt">{roleConfig.perm}</span>
      </div>

      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <RegionSelect
            value={regionFilter}
            onChange={(val) => {
              setRegionFilter(val);
            }}
            groups={regionGroups}
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
            <span className="ico">취업여부</span>
            <select
              value={employment}
              onChange={(e) => setEmployment(e.target.value as '전체' | '취업' | '미취업')}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 'inherit',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="전체">전체 ▾</option>
              <option value="취업">취업</option>
              <option value="미취업">미취업</option>
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
        </div>

        <span className="count" id="f-count">
          총 {totalElements}명{loading ? ' · 불러오는 중…' : ''}
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
                <SortableTh column="participantName" sortBy={sort.sortBy} sortOrder={sort.sortOrder} onSort={sort.toggle}>
                  참여자
                </SortableTh>
                <SortableTh column="region" sortBy={sort.sortBy} sortOrder={sort.sortOrder} onSort={sort.toggle}>
                  지역 / 회차
                </SortableTh>
                <SortableTh column="completionDate" sortBy={sort.sortBy} sortOrder={sort.sortOrder} onSort={sort.toggle}>
                  수료일
                </SortableTh>
                <th>취업</th>
                <th>숲체험</th>
                <th>국취 연계</th>
                <th>상담</th>
              </tr>
            </thead>
            <tbody id="f-rows">
              {filteredList.map((it) => (
                <tr
                  key={it.courseParticipantId}
                  onClick={() => setDetailItem(it)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="pname">{it.name}</div>
                    <div className="cell-sub">{it.matchKey ?? '—'}</div>
                  </td>
                  <td>{roundLabel(it)}</td>
                  <td>{it.completionDate ?? '—'}</td>
                  <td>
                    {it.employmentDate ? (
                      <span className="chip ok">취업 · {it.employmentDate}</span>
                    ) : (
                      <span className="chip warn">미취업</span>
                    )}
                  </td>
                  <td>
                    {it.forestProgramDate ? (
                      <span className="chip info">{it.forestProgramDate}</span>
                    ) : (
                      <span className="chip neutral">—</span>
                    )}
                  </td>
                  <td>
                    {it.nationalProgramDate ? (
                      <span className="chip info">
                        {it.nationalProgramDate}
                        {it.nationalProgramBranch ? ` · ${it.nationalProgramBranch}` : ''}
                      </span>
                    ) : (
                      <span className="chip neutral">—</span>
                    )}
                  </td>
                  <td>
                    {it.counselCount > 0 ? (
                      <span className="muted tnum" style={{ fontSize: '12px' }}>
                        {it.counselCount}회{it.lastCounselDate ? ` · ${it.lastCounselDate}` : ''}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && filteredList.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
                  >
                    조건에 일치하는 사후관리 대상이 없습니다.
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
        행을 클릭하면 사후관리 상세(취업 · 숲체험 · 국취연계 등록, 상담 히스토리)가 모달로 열립니다.
        상담사는 본인에게 배정된 수료 참여자만 조회됩니다.
      </p>

      {detailItem && (
        <FollowUpDetailModal
          item={detailItem}
          canEdit={canEdit}
          onClose={() => setDetailItem(null)}
          onSaved={fetchList}
        />
      )}
    </section>
  );
}