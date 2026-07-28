import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getDashboardRegionStats } from '../api/dashboard';
import type { DashboardRegionStatItem } from '../api/dashboard';
import { getDashboardCalendar } from '../api/dashboard';
import type { DashboardCalendarItem } from '../api/dashboard';
import { useRole } from '../context/RoleContext';
import { getFollowUpStats } from '../api/followUps';
import type { FollowUpStatsResponse } from '../api/followUps';
import { getRegions } from '../api/regions';
import type { RegionSummary } from '../api/regions';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const STATS_DEBOUNCE_MS = 300;

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { roleConfig } = useRole();

  const [cursor, setCursor] = useState(() => new Date());
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const [regionStats, setRegionStats] = useState<DashboardRegionStatItem[]>([]);
  const [totals, setTotals] = useState<DashboardRegionStatItem | null>(null);
  const [calendarItems, setCalendarItems] = useState<DashboardCalendarItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ── 사후관리 집계(취업률 · 숲체험 방문률 · 국취연계률) — ADMIN/HEAD_OFFICE 전용 ──
  const canSeeFollowUpStats = roleConfig.roles.some((r) => r === 'ADMIN' || r === 'HEAD_OFFICE');
  const [statsRegions, setStatsRegions] = useState<RegionSummary[]>([]);
  const [statsRegionId, setStatsRegionId] = useState<number | ''>('');
  const [statsCourseNumberInput, setStatsCourseNumberInput] = useState('');
  const [statsCourseNumber, setStatsCourseNumber] = useState<number | ''>('');
  const [followUpStats, setFollowUpStats] = useState<FollowUpStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-based

  // 지역별 현황은 한 번만 불러오면 됨
  useEffect(() => {
    getDashboardRegionStats()
      .then(({ data: res }) => {
        setRegionStats(res.data.content ?? []);
        setTotals(res.data.totals ? { regionId: 0, regionName: '전체', ...res.data.totals } : null);
      })
      .catch(() => {
        setRegionStats([]);
        setTotals(null);
      });
  }, []);

  // 캘린더는 월이 바뀔 때마다 다시 호출
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getDashboardCalendar(year, month + 1)
      .then(({ data: res }) => {
        if (active) setCalendarItems(res.data.content ?? []);
      })
      .catch(() => {
        if (active) setCalendarItems([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [year, month]);

  // 사후관리 집계 — 지역 목록(필터 드롭다운)은 최초 1회만 로드
  useEffect(() => {
    if (!canSeeFollowUpStats) return;
    getRegions()
      .then((res) => setStatsRegions(res.data.data ?? []))
      .catch(() => setStatsRegions([]));
  }, [canSeeFollowUpStats]);

  // 사후관리 집계 — 회차번호 입력 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = statsCourseNumberInput.trim();
      setStatsCourseNumber(trimmed === '' ? '' : Number(trimmed));
    }, STATS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [statsCourseNumberInput]);

  // 사후관리 집계 — 지역/회차 필터가 바뀌면 재조회(빈 값이면 전체 집계)
  useEffect(() => {
    if (!canSeeFollowUpStats) return;
    let active = true;
    setStatsLoading(true);
    setStatsError(null);
    getFollowUpStats({
      regionId: statsRegionId === '' ? undefined : statsRegionId,
      courseNumber: statsCourseNumber === '' ? undefined : statsCourseNumber,
    })
      .then((res) => {
        if (active) setFollowUpStats(res.data.data);
      })
      .catch(() => {
        if (active) {
          setFollowUpStats(null);
          setStatsError('사후관리 집계를 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canSeeFollowUpStats, statsRegionId, statsCourseNumber]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DashboardCalendarItem[]>();
    calendarItems.forEach((item) => {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    });
    return map;
  }, [calendarItems]);

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    const result: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      result.push(cells.slice(i, i + 7));
    }
    return result;
  }, [year, month]);

  const today = ymd(new Date());

  const monthlyItems = useMemo(() => {
    const todayStart = startOfDay(new Date()).getTime();
    return calendarItems
      .map((item) => {
        const itemDate = new Date(item.date);
        return { ...item, dday: Math.round((startOfDay(itemDate).getTime() - todayStart) / 86400000) };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarItems]);

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ddayLabel = (dday: number) => {
    if (dday === 0) return '오늘';
    if (dday > 0) return `D-${dday}`;
    return `D+${Math.abs(dday)}`;
  };

  const ddayClass = (dday: number) => {
    if (dday <= 0) return 'today';
    if (dday <= 3) return 'soon';
    return 'ok';
  };

  const handleTaskClick = (item: DashboardCalendarItem) => {
    if (item.sourceType === 'COURSE' && item.sourceId) {
      navigate(`/rounds/${item.sourceId}`);
    }
  };

  return (
    <section className="view active" id="view-dashboard">
      {/* 지역별 회차 현황 */}
      <div className="card">
        <div className="card-h">
          <span className="section-title">지역별 회차 현황</span>
          <span className="more" onClick={() => navigate('/rounds')}>
            전체 보기 →
          </span>
        </div>
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>지역</th>
                <th>예정</th>
                <th>모집중</th>
                <th>진행중</th>
                <th>폐강</th>
                <th>수료인원</th>
                <th>비수료인원</th>
              </tr>
            </thead>
            <tbody>
              {regionStats.map((r) => (
                <tr key={r.regionId}>
                  <td className="pname">{r.regionName}</td>
                  <td className="tnum">{r.plannedCount}</td>
                  <td className="tnum">
                    <span className="chip info">{r.recruitingCount}</span>
                  </td>
                  <td className="tnum">
                    <span className="chip ok">{r.inProgressCount}</span>
                  </td>
                  <td className="tnum">
                    <span className="chip danger">{r.canceledCount}</span>
                  </td>
                  <td className="tnum">{r.completedParticipants}</td>
                  <td className="tnum">{r.incompleteParticipants}</td>
                </tr>
              ))}
              {regionStats.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
            {totals && (
              <tfoot>
                <tr>
                  <td className="pname">전체</td>
                  <td className="tnum">{totals.plannedCount}</td>
                  <td className="tnum">{totals.recruitingCount}</td>
                  <td className="tnum">{totals.inProgressCount}</td>
                  <td className="tnum">{totals.canceledCount}</td>
                  <td className="tnum">{totals.completedParticipants}</td>
                  <td className="tnum">{totals.incompleteParticipants}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 사후관리 집계(취업률 · 숲체험 방문률 · 국취연계률) — ADMIN/HEAD_OFFICE 전용 */}
      {canSeeFollowUpStats && (
        <div className="card">
          <div className="card-h">
            <span className="section-title">사후관리 현황 (수료자 기준)</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={statsRegionId}
                onChange={(e) => setStatsRegionId(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ fontSize: 12, padding: '4px 8px' }}
              >
                <option value="">전체 지역</option>
                {statsRegions.map((r) => (
                  <option key={r.regionId} value={r.regionId}>
                    {r.regionName}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                placeholder="회차번호"
                value={statsCourseNumberInput}
                onChange={(e) => setStatsCourseNumberInput(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', width: 90 }}
              />
              {followUpStats && (
                <span className="chip neutral">수료 {followUpStats.totalCompleted}명</span>
              )}
            </span>
          </div>
          <div className="card-b" style={{ padding: '18px 20px' }}>
            {statsError && (
              <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 8 }}>
                {statsError}
              </p>
            )}
            {!statsError && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <FollowUpStatBlock
                  label="취업률"
                  rate={followUpStats?.employmentRate}
                  count={followUpStats?.employedCount}
                  total={followUpStats?.totalCompleted}
                  loading={statsLoading}
                  color="#2563eb"
                  bg="rgba(37, 99, 235, 0.06)"
                />
                <FollowUpStatBlock
                  label="숲체험 방문률"
                  rate={followUpStats?.forestVisitRate}
                  count={followUpStats?.forestVisitCount}
                  total={followUpStats?.totalCompleted}
                  loading={statsLoading}
                  color="#059669"
                  bg="rgba(5, 150, 105, 0.06)"
                />
                <FollowUpStatBlock
                  label="국취연계률"
                  rate={followUpStats?.nationalProgramRate}
                  count={followUpStats?.nationalProgramCount}
                  total={followUpStats?.totalCompleted}
                  loading={statsLoading}
                  color="#7c3aed"
                  bg="rgba(124, 58, 237, 0.06)"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dash-cols">
        {/* 왼쪽: 마감 임박 달력 */}
        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h">
              <span className="section-title">마감 임박 달력</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn" type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>
                  ← 이전달
                </button>
                <span className="muted tnum" style={{ fontSize: 13 }}>
                  {isLoading ? '불러오는 중...' : `${year}.${String(month + 1).padStart(2, '0')}`}
                </span>
                <button className="btn" type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>
                  다음달 →
                </button>
              </span>
            </div>

            <div className="cal-grid">
              {WEEKDAYS.map((w) => (
                <div className="cal-weekday" key={w}>
                  {w}
                </div>
              ))}

              {weeks.flat().map((date) => {
                const dateStr = ymd(date);
                const inMonth = date.getMonth() === month;
                const dayEvents = eventsByDate.get(dateStr) ?? [];
                const isHighlighted = dateStr === highlightDate;

                return (
                  <div
                    key={dateStr}
                    onClick={() => setHighlightDate(dateStr === highlightDate ? null : dateStr)}
                    className={`cal-cell ${inMonth ? '' : 'cal-cell-muted'} ${dateStr === today ? 'cal-cell-today' : ''}`}
                    style={{
                      cursor: 'pointer',
                      height: 104,
                      overflow: 'hidden',
                      outline: isHighlighted ? '2px solid var(--navy-600)' : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    <div className="cal-date">{date.getDate()}</div>
                    <div className="cal-events" style={{ overflow: 'hidden' }}>
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className="cal-event"
                          style={{
                            background:
                              ev.kind === 'ALERT'
                                ? ev.severity === 'danger'
                                  ? 'var(--danger-bg)'
                                  : 'var(--warn-bg)'
                                : undefined,
                            color: ev.kind === 'ALERT' ? (ev.severity === 'danger' ? 'var(--danger)' : 'var(--warn)') : undefined,
                          }}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && <div className="cal-event-more">+{dayEvents.length - 2}건</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 이번 달 전체 일정 리스트 (D-day 임박 순) */}
        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h">
              <span className="section-title">
                {year}.{String(month + 1).padStart(2, '0')} 전체 일정
              </span>
              <span className="chip neutral" style={{ marginLeft: 'auto' }}>
                {monthlyItems.length}건
              </span>
            </div>
            <div className="card-b" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {!isLoading && monthlyItems.length === 0 && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  이번 달 등록된 일정이 없습니다.
                </p>
              )}
              {monthlyItems.map((item) => {
                const isHighlighted = item.date === highlightDate;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleTaskClick(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 4px',
                      borderBottom: '1px solid var(--line-soft)',
                      background: isHighlighted ? 'var(--navy-50)' : 'transparent',
                      borderRadius: 6,
                      cursor: item.sourceType === 'COURSE' ? 'pointer' : 'default',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(item.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleChecked(item.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginTop: 4 }}
                    />
                    <span className={`dday ${ddayClass(item.dday)}`} style={{ flex: 'none', marginTop: 2 }}>
                      {ddayLabel(item.dday)}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        textDecoration: checkedIds.has(item.id) ? 'line-through' : 'none',
                        color: checkedIds.has(item.id) ? 'var(--muted-2)' : 'inherit',
                      }}
                    >
                      <b>{item.title}</b>
                      {item.kind === 'ALERT' && (
                        <span className={`chip ${item.severity === 'danger' ? 'danger' : 'warn'}`} style={{ marginLeft: 8 }}>
                          경고{item.count ? ` ${item.count}건` : ''}
                        </span>
                      )}
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {item.date} · {item.meta}
                      </div>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="note">※ 실시간 API 데이터입니다.</p>
    </section>
  );
}

function FollowUpStatBlock({
  label,
  rate,
  count,
  total,
  loading,
  color = '#2563eb',
  bg = 'rgba(37, 99, 235, 0.06)',
}: {
  label: string;
  rate?: number;
  count?: number;
  total?: number;
  loading?: boolean;
  color?: string;
  bg?: string;
}) {
  const safeRate = Math.min(Math.max(rate ?? 0, 0), 100);

  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 12,
        background: bg,
        border: '1px solid rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 10,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted-2)' }}>{label}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color,
            padding: '2px 8px',
            borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.7)',
            border: `1px solid ${color}33`,
          }}
        >
          {!loading && count != null && total != null ? `${count} / ${total}명` : '—'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: loading ? 'var(--muted)' : 'var(--fg, #1e293b)', lineHeight: 1 }}>
          {loading ? '···' : rate != null ? `${rate}` : '—'}
        </span>
        {!loading && rate != null && (
          <span style={{ fontSize: 16, fontWeight: 700, color: color }}>%</span>
        )}
      </div>

      {/* Progress Bar Visual Indicator */}
      <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            width: loading ? '0%' : `${safeRate}%`,
            height: '100%',
            background: color,
            borderRadius: 999,
            transition: 'width 0.4s ease-in-out',
          }}
        />
      </div>
    </div>
  );
}