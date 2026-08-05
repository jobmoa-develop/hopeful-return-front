import { useEffect, useMemo, useState } from 'react';
import { getCounselingSchedules } from '../api/counselingSchedules';
import type { CounselingScheduleItem } from '../api/counselingSchedules';
import { COUNSELING_TYPE_LABELS } from '../api/courseParticipants';
import type { CounselingType } from '../api/courseParticipants';
import { getRegions, groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { RegionSelect } from '../components/RegionSelect';
import type { RegionFilterValue } from '../components/RegionSelect';
import { useRole } from '../context/RoleContext';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 상담사명 → 고정 색상 팔레트
const COLOR_PALETTE = [
  '#dbeafe', '#dcfce7', '#fef9c3', '#fde2e2', '#ede9fe',
  '#ffe4e6', '#e0f2fe', '#fef3c7', '#d1fae5', '#e2e8f0',
];

function colorForName(name?: string | null) {
  if (!name) return '#f1f4f8';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function startOfWeek(d: Date) {
  return addDays(d, -d.getDay());
}
function hourOf(startedAt: string | null): number | null {
  if (!startedAt || startedAt.length < 13) return null;
  const h = Number(startedAt.slice(11, 13));
  return Number.isNaN(h) ? null : h;
}
function hhmm(startedAt: string | null) {
  return startedAt && startedAt.length >= 16 ? startedAt.slice(11, 16) : '';
}
function typeLabel(t: CounselingType | string | null) {
  if (!t) return '';
  return COUNSELING_TYPE_LABELS[t as CounselingType] ?? String(t);
}

type ViewMode = 'month' | 'week' | 'day';

const DEFAULT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

type CounselorCol = { id: number; name: string };

// 일자별 표 — 헤더=상담사, 좌축=시간
function DayScheduleTable({
  dayItems,
  counselors,
  hours,
}: {
  dayItems: CounselingScheduleItem[];
  counselors: CounselorCol[];
  hours: number[];
}) {
  if (counselors.length === 0) {
    return <p className="muted" style={{ fontSize: '12.5px', padding: '8px 2px' }}>해당 조건의 상담 일정이 없습니다.</p>;
  }
  return (
    <table className="data" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th style={{ width: '56px' }}>시간</th>
          {counselors.map((c) => (
            <th key={c.id} style={{ background: colorForName(c.name) }}>
              {c.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {hours.map((h) => (
          <tr key={h}>
            <td style={{ fontWeight: 600, color: '#69768a' }}>{String(h).padStart(2, '0')}:00</td>
            {counselors.map((c) => {
              const cell = dayItems.filter(
                (it) => it.counselorId === c.id && hourOf(it.startedAt) === h,
              );
              return (
                <td key={c.id} style={{ verticalAlign: 'top' }}>
                  {cell.map((it) => (
                    <div
                      key={it.courseParticipantCounselorId}
                      className="chip"
                      style={{ display: 'block', margin: '2px 0', background: colorForName(c.name) }}
                      title={`${typeLabel(it.counselingType)} · ${it.regionName ?? ''} ${it.courseNumber ?? ''}회`}
                    >
                      {hhmm(it.startedAt)} {it.participantName ?? ''}
                      <small style={{ display: 'block', color: '#69768a' }}>
                        {it.regionName ?? '-'} · {it.courseNumber ?? '-'}회 · {typeLabel(it.counselingType)}
                        {it.completed ? ' · 완료' : ''}
                      </small>
                    </div>
                  ))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CounselorScheduleCalendarPage() {
  const { roleConfig } = useRole();
  // 지역 목록(GET /api/regions)은 COUNSELOR 권한 밖 — ConsultingPage 와 동일하게 상담사는 지역 필터 생략
  const canFilterRegion = roleConfig.role !== 'COUNSELOR';

  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const regionGroups = useMemo(() => groupRegionsByParent(regions), [regions]);
  // 지역 필터 — 상위(서울)=parentRegionId, 하위(양천)=regionId, 전체={}. 참여자관리와 동일.
  const [regionFilter, setRegionFilter] = useState<RegionFilterValue>({});
  const [courseNumber, setCourseNumber] = useState('');
  const [counselorName, setCounselorName] = useState('');
  const [items, setItems] = useState<CounselingScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!canFilterRegion) return;
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, [canFilterRegion]);

  const range = useMemo(() => {
    if (view === 'day') {
      const s = ymd(cursor);
      return { from: s, to: s };
    }
    if (view === 'week') {
      const s = startOfWeek(cursor);
      return { from: ymd(s), to: ymd(addDays(s, 6)) };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    return { from: ymd(gridStart), to: ymd(addDays(gridStart, 41)) };
  }, [view, cursor]);

  useEffect(() => {
    setLoading(true);
    const params: {
      from: string;
      to: string;
      regionId?: number;
      parentRegionId?: number;
      courseNumber?: number;
      counselorName?: string;
    } = {
      from: range.from,
      to: range.to,
    };
    if (regionFilter.regionId != null) params.regionId = regionFilter.regionId;
    if (regionFilter.parentRegionId != null) params.parentRegionId = regionFilter.parentRegionId;
    if (courseNumber.trim()) params.courseNumber = Number(courseNumber);
    if (counselorName.trim()) params.counselorName = counselorName.trim();
    getCounselingSchedules(params)
      .then(({ data: res }) => setItems(res.data?.schedules ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [range.from, range.to, regionFilter.regionId, regionFilter.parentRegionId, courseNumber, counselorName]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CounselingScheduleItem[]>();
    for (const it of items) {
      if (!it.date) continue;
      const list = map.get(it.date) ?? [];
      list.push(it);
      map.set(it.date, list);
    }
    return map;
  }, [items]);

  // 표 뷰(주/일)용: 전체 범위의 상담사 컬럼·시간 행
  const counselors = useMemo<CounselorCol[]>(() => {
    const map = new Map<number, string>();
    for (const it of items) {
      if (it.counselorId != null) map.set(it.counselorId, it.counselorName ?? `#${it.counselorId}`);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const hours = useMemo<number[]>(() => {
    const present = new Set<number>();
    for (const it of items) {
      const h = hourOf(it.startedAt);
      if (h != null) present.add(h);
    }
    if (present.size === 0) return DEFAULT_HOURS;
    const min = Math.min(...present);
    const max = Math.max(...present);
    const out: number[] = [];
    for (let h = min; h <= max; h++) out.push(h);
    return out;
  }, [items]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const weeks = useMemo(() => {
    const first = new Date(year, month, 1);
    const gridStart = addDays(first, -first.getDay());
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));
    const result: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [year, month]);

  const today = ymd(new Date());

  const navPrev = () =>
    setCursor((c) =>
      view === 'month' ? new Date(c.getFullYear(), c.getMonth() - 1, 1) : addDays(c, view === 'week' ? -7 : -1),
    );
  const navNext = () =>
    setCursor((c) =>
      view === 'month' ? new Date(c.getFullYear(), c.getMonth() + 1, 1) : addDays(c, view === 'week' ? 7 : 1),
    );
  const navToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
    setSelectedDate(null);
  };

  const periodLabel = useMemo(() => {
    if (view === 'day') return `${cursor.getFullYear()}. ${cursor.getMonth() + 1}. ${cursor.getDate()} (${WEEKDAYS[cursor.getDay()]})`;
    if (view === 'week') {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.getFullYear()}. ${s.getMonth() + 1}. ${s.getDate()} ~ ${e.getMonth() + 1}. ${e.getDate()}`;
    }
    return `${year}. ${month + 1}`;
  }, [view, cursor, year, month]);

  const selectedItems = selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];
  const weekDays = useMemo(() => {
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  return (
    <div>
      <div className="section-title">상담사 캘린더</div>

      <div className="card" style={{ marginBottom: '14px' }}>
        <div
          className="card-b"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}
        >
          <div className="seg" style={{ display: 'flex', gap: '4px' }}>
            {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
              <button
                key={v}
                className={`btn ${view === v ? 'primary' : ''}`}
                onClick={() => setView(v)}
              >
                {v === 'month' ? '월' : v === 'week' ? '주' : '일'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button className="btn" onClick={navPrev}>◀</button>
            <button className="btn" onClick={navToday}>오늘</button>
            <button className="btn" onClick={navNext}>▶</button>
          </div>
          <strong style={{ fontSize: '15px' }}>{periodLabel}</strong>
          <div style={{ flex: 1 }} />
          {canFilterRegion && (
            <RegionSelect
              groups={regionGroups}
              value={regionFilter}
              onChange={setRegionFilter}
              allowParentSelect
              allLabel="전체 지역"
            />
          )}
          <input
            className="input"
            style={{ width: '110px' }}
            type="number"
            placeholder="회차"
            value={courseNumber}
            onChange={(e) => setCourseNumber(e.target.value)}
          />
          <input
            className="input"
            style={{ width: '150px' }}
            placeholder="상담사명 검색"
            value={counselorName}
            onChange={(e) => setCounselorName(e.target.value)}
          />
          {loading && <span className="muted" style={{ fontSize: '12px' }}>불러오는 중…</span>}
        </div>
      </div>

      {view === 'month' && (
        <div className="card">
          <div className="card-b">
            <div className="cal-grid">
              {WEEKDAYS.map((w) => (
                <div key={w} className="cal-weekday">{w}</div>
              ))}
              {weeks.flat().map((d) => {
                const key = ymd(d);
                const inMonth = d.getMonth() === month;
                const dayItems = itemsByDate.get(key) ?? [];
                return (
                  <div
                    key={key}
                    className={`cal-cell ${!inMonth ? 'cal-cell-muted' : ''} ${key === today ? 'cal-cell-today' : ''}`}
                    onClick={() => setSelectedDate(key === selectedDate ? null : key)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{d.getDate()}</div>
                    {dayItems.slice(0, 2).map((it) => (
                      <div
                        key={it.courseParticipantCounselorId}
                        className="cal-event"
                        style={{ background: colorForName(it.counselorName) }}
                        title={`${it.counselorName ?? ''} · ${it.participantName ?? ''} · ${typeLabel(it.counselingType)}`}
                      >
                        {hhmm(it.startedAt)} {it.counselorName ?? ''}·{it.participantName ?? ''}
                      </div>
                    ))}
                    {dayItems.length > 2 && (
                      <div className="cal-event cal-event-more">+{dayItems.length - 2}건</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {view === 'month' && selectedDate && (
        <div className="card" style={{ marginTop: '14px' }}>
          <div className="card-h">
            <strong>{selectedDate} 상담 일정 ({selectedItems.length}건)</strong>
          </div>
          <div className="card-b">
            {selectedItems.length === 0 ? (
              <p className="muted" style={{ fontSize: '12.5px' }}>해당 날짜의 상담 일정이 없습니다.</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>시간</th><th>상담사</th><th>참여자</th><th>지역</th><th>회차</th><th>상담 구분</th><th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems
                    .slice()
                    .sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))
                    .map((it) => (
                      <tr key={it.courseParticipantCounselorId}>
                        <td>{hhmm(it.startedAt)}</td>
                        <td>
                          <span className="chip" style={{ background: colorForName(it.counselorName) }}>
                            {it.counselorName ?? '-'}
                          </span>
                        </td>
                        <td>{it.participantName ?? '-'}</td>
                        <td>{it.regionName ?? '-'}</td>
                        <td>{it.courseNumber ?? '-'}회</td>
                        <td>{typeLabel(it.counselingType)}</td>
                        <td>{it.completed ? '완료' : '진행'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {view === 'day' && (
        <div className="card">
          <div className="card-b">
            <DayScheduleTable
              dayItems={itemsByDate.get(ymd(cursor)) ?? []}
              counselors={counselors}
              hours={hours}
            />
          </div>
        </div>
      )}

      {view === 'week' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {weekDays.map((d) => {
            const key = ymd(d);
            const dayItems = itemsByDate.get(key) ?? [];
            return (
              <div key={key} className="card">
                <div className="card-h">
                  <strong>
                    {d.getMonth() + 1}. {d.getDate()} ({WEEKDAYS[d.getDay()]}) · {dayItems.length}건
                  </strong>
                </div>
                <div className="card-b">
                  <DayScheduleTable dayItems={dayItems} counselors={counselors} hours={hours} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
