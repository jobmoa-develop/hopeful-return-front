import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getCourses } from '../api/courses';
import type { CourseSummary } from '../api/courses';
import { getUserRoles, buildUserRoleMap } from '../api/userRoles';
import type { UserRoleItem } from '../api/userRoles';
import {
    getStaffSchedules,
    createStaffSchedule,
    updateStaffSchedule,
    deleteStaffSchedule,
    createStaffSchedulesBulk,
    SESSION_TYPE_LABELS,
} from '../api/staffSchedules';
import type { StaffScheduleItem, SessionType } from '../api/staffSchedules';

const DAY_KEYS = ['day1Date', 'day2Date', 'day3Date', 'day4Date', 'day5Date'] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SESSION_TYPES: SessionType[] = ['AM', 'PM', 'FULL'];

const REGION_COLOR_PALETTE = [
    '#dbeafe', '#dcfce7', '#fef9c3', '#fde2e2', '#ede9fe',
    '#ffe4e6', '#e0f2fe', '#fef3c7', '#d1fae5', '#e2e8f0',
];

function colorForRegion(regionName?: string) {
    if (!regionName) return '#f1f4f8';
    let hash = 0;
    for (let i = 0; i < regionName.length; i++) {
        hash = (hash * 31 + regionName.charCodeAt(i)) >>> 0;
    }
    return REGION_COLOR_PALETTE[hash % REGION_COLOR_PALETTE.length];
}

type CalendarEvent = {
    courseId: number;
    courseName: string;
    courseNumber?: number;
    regionName?: string;
    dayIndex: number;
};

type AvailabilitySummary = 'all-available' | 'all-unavailable' | 'mixed' | 'none';

// 사람 단위로 요약한 하루 가용 상태 (같은 사람이 AM 가능/PM 불가처럼 세션이 섞여도 "가능 있음=available"로 취급)
type DayStaffSummary = {
    userId: number;
    userName: string;
    available: boolean;
    entries: StaffScheduleItem[];
};

function ymd(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function summarizeAvailability(list: { available: boolean }[] | StaffScheduleItem[]): AvailabilitySummary {
    if (list.length === 0) return 'none';
    const items = list as any[];
    const hasAvailable = items.some((s) => ('available' in s ? s.available : s.isAvailable));
    const hasUnavailable = items.some((s) => !('available' in s ? s.available : s.isAvailable));
    if (hasAvailable && hasUnavailable) return 'mixed';
    return hasAvailable ? 'all-available' : 'all-unavailable';
}

const CELL_BG: Record<AvailabilitySummary, string> = {
    'all-available': '#eafbf1',
    'all-unavailable': '#fdecec',
    mixed: 'linear-gradient(135deg, #eafbf1 0 50%, #fdecec 50% 100%)',
    none: 'transparent',
};

// 이번 달 전체 근무자 일정을 userId 없이 페이지네이션 순회하며 전부 받아온다 (최대 10페이지=1000건까지)
async function fetchAllMonthSchedules(fromDate: string, toDate: string): Promise<StaffScheduleItem[]> {
    const size = 100;
    const first = await getStaffSchedules({ fromDate, toDate, size, page: 0 });
    let all = first.data.data.content ?? [];
    const totalPages = Math.min(first.data.data.totalPages ?? 1, 10);
    for (let page = 1; page < totalPages; page++) {
        const res = await getStaffSchedules({ fromDate, toDate, size, page });
        all = all.concat(res.data.data.content ?? []);
    }
    return all;
}

export default function StaffScheduleManagePage() {
    const navigate = useNavigate();
    const [cursor, setCursor] = useState(() => new Date());

    // 강좌 (배경 정보)
    const [courses, setCourses] = useState<CourseSummary[]>([]);
    const [isLoadingCourses, setIsLoadingCourses] = useState(false);

    // 대상자 목록
    const [roleItems, setRoleItems] = useState<UserRoleItem[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);

    // 대상자 미선택 시: 이번 달 전 직원 일정
    const [allSchedules, setAllSchedules] = useState<StaffScheduleItem[]>([]);
    const [isLoadingAll, setIsLoadingAll] = useState(false);

    // 대상자 선택 시: 그 사람만의 일정
    const [mySchedules, setMySchedules] = useState<StaffScheduleItem[]>([]);
    const [isLoadingMine, setIsLoadingMine] = useState(false);

    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [sessionType, setSessionType] = useState<SessionType>('FULL');
    const [isAvailable, setIsAvailable] = useState(true);
    const [memo, setMemo] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // 일괄 등록 패널
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkFrom, setBulkFrom] = useState('');
    const [bulkTo, setBulkTo] = useState('');
    const [bulkWeekdays, setBulkWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [bulkSessionType, setBulkSessionType] = useState<SessionType>('FULL');
    const [bulkIsAvailable, setBulkIsAvailable] = useState(true);
    const [bulkMemo, setBulkMemo] = useState('');
    const [isBulkSaving, setIsBulkSaving] = useState(false);
    const [bulkResultMsg, setBulkResultMsg] = useState<string | null>(null);

    // 강좌
    useEffect(() => {
        let active = true;
        setIsLoadingCourses(true);
        getCourses({ size: 1000 })
            .then(({ data: response }) => {
                if (active) setCourses(response.data.content ?? []);
            })
            .catch(() => {
                if (active) setCourses([]);
            })
            .finally(() => {
                if (active) setIsLoadingCourses(false);
            });
        return () => {
            active = false;
        };
    }, []);

    // 대상자 목록
    useEffect(() => {
        setIsLoadingUsers(true);
        getUserRoles()
            .then(({ data }) => setRoleItems(data ?? []))
            .catch(() => setRoleItems([]))
            .finally(() => setIsLoadingUsers(false));
    }, []);

    const users = useMemo(() => {
        const roleMap = buildUserRoleMap(roleItems);
        const map = new Map<number, string>();
        roleItems.forEach((r) => {
            if (!map.has(r.userId)) map.set(r.userId, r.userName);
        });
        return Array.from(map.entries())
            .map(([userId, userName]) => ({ userId, userName, rolesLabel: roleMap.get(userId) ?? '' }))
            .sort((a, b) => a.userName.localeCompare(b.userName, 'ko'));
    }, [roleItems]);

    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthStart = ymd(new Date(year, month, 1));
    const monthEnd = ymd(new Date(year, month + 1, 0));

    // 대상자 미선택 상태일 때만: 이번 달 전 직원 일정 로드
    const loadAllSchedules = () => {
        setIsLoadingAll(true);
        fetchAllMonthSchedules(monthStart, monthEnd)
            .then((list) => setAllSchedules(list))
            .catch(() => setAllSchedules([]))
            .finally(() => setIsLoadingAll(false));
    };

    useEffect(() => {
        if (!selectedUserId) {
            loadAllSchedules();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedUserId, year, month]);

    // 대상자 선택 상태일 때만: 그 사람의 일정 로드
    const loadMySchedules = () => {
        if (!selectedUserId) return;
        setIsLoadingMine(true);
        getStaffSchedules({ userId: selectedUserId, fromDate: monthStart, toDate: monthEnd, size: 100 })
            .then(({ data }) => setMySchedules(data.data.content ?? []))
            .catch(() => setMySchedules([]))
            .finally(() => setIsLoadingMine(false));
    };

    useEffect(() => {
        if (selectedUserId) {
            loadMySchedules();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedUserId, year, month]);

    // 날짜 -> 강좌 이벤트
    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const c of courses) {
            if (!c.courseId) continue;
            DAY_KEYS.forEach((key, dayIndex) => {
                const dateStr = c[key];
                if (!dateStr) return;
                const list = map.get(dateStr) ?? [];
                list.push({
                    courseId: c.courseId!,
                    courseName: c.courseName ?? `강좌 #${c.courseId}`,
                    courseNumber: c.courseNumber,
                    regionName: c.regionName,
                    dayIndex,
                });
                map.set(dateStr, list);
            });
        }
        return map;
    }, [courses]);

    // 날짜 -> 전 직원 요약 (사람 단위로 dedupe)
    const dayStaffByDate = useMemo(() => {
        const grouped = new Map<string, Map<number, DayStaffSummary>>();
        allSchedules.forEach((s) => {
            const dayMap = grouped.get(s.scheduleDate) ?? new Map<number, DayStaffSummary>();
            const existing = dayMap.get(s.userId);
            if (existing) {
                existing.entries.push(s);
                if (s.isAvailable) existing.available = true;
            } else {
                dayMap.set(s.userId, {
                    userId: s.userId,
                    userName: s.userName,
                    available: s.isAvailable,
                    entries: [s],
                });
            }
            grouped.set(s.scheduleDate, dayMap);
        });
        const result = new Map<string, DayStaffSummary[]>();
        grouped.forEach((dayMap, date) => {
            result.set(
                date,
                Array.from(dayMap.values()).sort((a, b) => {
                    if (a.available !== b.available) return a.available ? -1 : 1;
                    return a.userName.localeCompare(b.userName, 'ko');
                }),
            );
        });
        return result;
    }, [allSchedules]);

    // 날짜 -> 선택된 대상자만의 일정
    const mySchedulesByDate = useMemo(() => {
        const map = new Map<string, StaffScheduleItem[]>();
        mySchedules.forEach((s) => {
            const list = map.get(s.scheduleDate) ?? [];
            list.push(s);
            map.set(s.scheduleDate, list);
        });
        return map;
    }, [mySchedules]);

    const weeks = useMemo(() => {
        const firstOfMonth = new Date(year, month, 1);
        const startOffset = firstOfMonth.getDay();
        const gridStart = new Date(year, month, 1 - startOffset);
        const cells: Date[] = [];
        for (let i = 0; i < 42; i++) {
            cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
        }
        const result: Date[][] = [];
        for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
        return result;
    }, [year, month]);

    const today = ymd(new Date());
    const selectedMySchedules = selectedDate && selectedUserId ? mySchedulesByDate.get(selectedDate) ?? [] : [];
    const selectedDayStaff = selectedDate ? dayStaffByDate.get(selectedDate) ?? [] : [];

    const handleSelectDate = (dateStr: string) => {
        setSelectedDate(dateStr === selectedDate ? null : dateStr);
        setSessionType('FULL');
        setIsAvailable(true);
        setMemo('');
    };

    const closeModal = () => setSelectedDate(null);

    // 팝업이 열려 있는 동안 ESC 로 닫기
    useEffect(() => {
        if (!selectedDate) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    // 날짜 패널에서 특정 사람을 눌러 그 사람 관리 모드로 전환
    const handlePickUserFromDay = (userId: number) => {
        setSelectedUserId(userId);
    };

    const handleSaveSchedule = async () => {
        if (!selectedDate || !selectedUserId) return;
        setIsSaving(true);
        try {
            await createStaffSchedule({
                userId: selectedUserId,
                scheduleDate: selectedDate,
                sessionType,
                isAvailable,
                memo: memo || undefined,
            });
            setMemo('');
            loadMySchedules();
            loadAllSchedules();
        } catch {
            alert('일정 등록에 실패했습니다. 같은 날짜·시간대가 이미 등록되어 있는지 확인해주세요.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleAvailable = async (s: StaffScheduleItem) => {
        if (s.staffScheduleId == null) return;
        const staffScheduleId = s.staffScheduleId;
        try {
            await updateStaffSchedule(staffScheduleId, { isAvailable: !s.isAvailable });
            loadMySchedules();
            loadAllSchedules();
        } catch {
            alert('수정에 실패했습니다.');
        }
    };

    const handleDeleteSchedule = async (staffScheduleId: number) => {
        if (!window.confirm('이 일정을 삭제하시겠습니까?')) return;
        try {
            await deleteStaffSchedule(staffScheduleId);
            loadMySchedules();
            loadAllSchedules();
        } catch {
            alert('삭제에 실패했습니다.');
        }
    };

    const toggleBulkWeekday = (d: number) => {
        setBulkWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
    };

    const handleBulkSubmit = async () => {
        if (!selectedUserId || !bulkFrom || !bulkTo) {
            alert('시작일/종료일을 입력해주세요.');
            return;
        }
        const start = new Date(bulkFrom);
        const end = new Date(bulkTo);
        if (start > end) {
            alert('시작일이 종료일보다 늦을 수 없습니다.');
            return;
        }

        const entries: { scheduleDate: string; sessionType: SessionType; isAvailable: boolean; memo?: string }[] = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (bulkWeekdays.includes(d.getDay())) {
                entries.push({
                    scheduleDate: ymd(d),
                    sessionType: bulkSessionType,
                    isAvailable: bulkIsAvailable,
                    memo: bulkMemo || undefined,
                });
            }
        }

        if (entries.length === 0) {
            alert('선택한 조건에 해당하는 날짜가 없습니다.');
            return;
        }

        setIsBulkSaving(true);
        setBulkResultMsg(null);
        try {
            const { data } = await createStaffSchedulesBulk({ userId: selectedUserId, entries });
            setBulkResultMsg(data.data.message);
            loadMySchedules();
            loadAllSchedules();
        } catch {
            alert('일괄 등록에 실패했습니다.');
        } finally {
            setIsBulkSaving(false);
        }
    };

    return (
        <section className="view active" id="view-staff-schedule-manage">
            <div className="card">
                <div className="card-h">
                    <span className="section-title">근무자 일정 관리</span>
                    <button className="btn" type="button" style={{ marginLeft: 12 }} onClick={() => navigate('/calendar')}>
                        ← 전체 강좌 캘린더
                    </button>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                        {isLoadingUsers ? '대상자 불러오는 중...' : `대상자 ${users.length}명`}
                    </span>
                </div>
                <div className="card-b" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="field" style={{ minWidth: 220 }}>
                        <label>대상자 (선택 시 그 사람 등록/수정 모드로 전환)</label>
                        <select
                            value={selectedUserId ?? ''}
                            onChange={(e) => {
                                setSelectedUserId(e.target.value ? Number(e.target.value) : null);
                                setSelectedDate(null);
                                setBulkResultMsg(null);
                            }}
                        >
                            <option value="">전체 보기 (미선택)</option>
                            {users.map((u) => (
                                <option key={u.userId} value={u.userId}>
                                    {u.userName} {u.rolesLabel ? `(${u.rolesLabel})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    {selectedUserId && (
                        <button className="btn" type="button" onClick={() => { setSelectedUserId(null); setSelectedDate(null); }}>
                            전체 보기로 돌아가기
                        </button>
                    )}
                    <button
                        className="btn"
                        type="button"
                        disabled={!selectedUserId}
                        onClick={() => setBulkOpen((v) => !v)}
                    >
                        {bulkOpen ? '일괄 등록 닫기' : '+ 일괄 등록'}
                    </button>
                </div>
            </div>

            {bulkOpen && selectedUserId && (
                <div className="card" style={{ marginTop: 14 }}>
                    <div className="card-h">
                        <span className="section-title">일괄 등록</span>
                        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                            선택한 대상자 1명의 여러 날짜를 한 번에 등록합니다
                        </span>
                    </div>
                    <div className="card-b" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="field">
                            <label>시작일</label>
                            <input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} />
                        </div>
                        <div className="field">
                            <label>종료일</label>
                            <input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} />
                        </div>
                        <div className="field">
                            <label>시간대</label>
                            <select value={bulkSessionType} onChange={(e) => setBulkSessionType(e.target.value as SessionType)}>
                                {SESSION_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {SESSION_TYPE_LABELS[t]}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="field">
                            <label>가능 여부</label>
                            <select value={bulkIsAvailable ? '1' : '0'} onChange={(e) => setBulkIsAvailable(e.target.value === '1')}>
                                <option value="1">가능</option>
                                <option value="0">불가</option>
                            </select>
                        </div>
                        <div className="field" style={{ minWidth: 200 }}>
                            <label>요일</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {WEEKDAYS.map((w, idx) => (
                                    <button
                                        key={w}
                                        type="button"
                                        className={`btn ${bulkWeekdays.includes(idx) ? 'primary' : ''}`}
                                        style={{ padding: '3px 8px', fontSize: 12 }}
                                        onClick={() => toggleBulkWeekday(idx)}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="field" style={{ flex: 1, minWidth: 160 }}>
                            <label>메모 (선택, 전체 동일 적용)</label>
                            <input value={bulkMemo} onChange={(e) => setBulkMemo(e.target.value)} placeholder="예: 정기 근무" />
                        </div>
                        <button className="btn primary" type="button" onClick={handleBulkSubmit} disabled={isBulkSaving}>
                            {isBulkSaving ? '등록 중...' : '일괄 등록 실행'}
                        </button>
                    </div>
                    {bulkResultMsg && (
                        <div className="card-b" style={{ paddingTop: 0 }}>
                            <span className="muted" style={{ fontSize: 12 }}>{bulkResultMsg}</span>
                        </div>
                    )}
                </div>
            )}

            <div className="card" style={{ marginTop: 14 }}>
                <div className="card-h">
                    <button className="btn" type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>
                        ← 이전달
                    </button>
                    <span className="section-title" style={{ margin: '0 12px' }}>
                        {year}년 {month + 1}월
                    </span>
                    <button className="btn" type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>
                        다음달 →
                    </button>
                    <button className="btn" type="button" style={{ marginLeft: 8 }} onClick={() => setCursor(new Date())}>
                        오늘
                    </button>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                        {isLoadingCourses ? '강좌 불러오는 중...' : `강좌 ${courses.length}건`}
                        {selectedUserId
                            ? isLoadingMine
                                ? ' · 일정 불러오는 중...'
                                : ` · ${users.find((u) => u.userId === selectedUserId)?.userName ?? ''} 일정 ${mySchedules.length}건`
                            : isLoadingAll
                                ? ' · 전 직원 일정 불러오는 중...'
                                : ` · 전 직원 일정 ${allSchedules.length}건`}
                    </span>
                </div>

                {/* 범례 */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--line)', fontSize: 11.5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 3, background: CELL_BG['all-available'], border: '1px solid var(--line)', display: 'inline-block' }} />
                        {selectedUserId ? '이 사람 가능' : '가능한 사람 있음'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 3, background: CELL_BG['all-unavailable'], border: '1px solid var(--line)', display: 'inline-block' }} />
                        전체 불가
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 3, background: CELL_BG.mixed, border: '1px solid var(--line)', display: 'inline-block' }} />
                        가능/불가 혼재
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 3, background: '#fff', border: '1px solid var(--line)', display: 'inline-block' }} />
                        미등록
                    </span>
                    {!selectedUserId && (
                        <span className="muted" style={{ marginLeft: 'auto' }}>날짜를 클릭하면 그날 가능한 사람 전체 목록을 팝업으로 볼 수 있어요</span>
                    )}
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
                        const dayStaff = dayStaffByDate.get(dateStr) ?? [];
                        const myDaySchedules = mySchedulesByDate.get(dateStr) ?? [];

                        const availability = selectedUserId
                            ? summarizeAvailability(myDaySchedules)
                            : summarizeAvailability(dayStaff);

                        const isSelected = dateStr === selectedDate;
                        const previewStaff = dayStaff.slice(0, 4);

                        return (
                            <div
                                key={dateStr}
                                onClick={() => handleSelectDate(dateStr)}
                                className={`cal-cell ${inMonth ? '' : 'cal-cell-muted'} ${dateStr === today ? 'cal-cell-today' : ''}`}
                                style={{
                                    cursor: 'pointer',
                                    height: 128,
                                    overflow: 'hidden',
                                    background: inMonth ? CELL_BG[availability] : undefined,
                                    outline: isSelected ? '2px solid var(--navy-600)' : 'none',
                                    outlineOffset: '-2px',
                                }}
                            >
                                <div className="cal-date">{date.getDate()}</div>

                                {/* 강좌 이벤트 */}
                                <div className="cal-events" style={{ overflow: 'hidden' }}>
                                    {dayEvents.slice(0, 1).map((ev, idx) => (
                                        <div
                                            key={`${ev.courseId}-${idx}`}
                                            className={`cal-event ${ev.dayIndex === 0 ? 'cal-event-start' : ev.dayIndex === 4 ? 'cal-event-end' : ''}`}
                                            style={{ background: colorForRegion(ev.regionName) }}
                                            title={`${ev.regionName ?? ''} ${ev.courseName} (${ev.courseNumber ?? '-'}기) - ${ev.dayIndex + 1}일차`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/rounds/${ev.courseId}`);
                                            }}
                                        >
                                            {ev.courseNumber ? `${ev.courseNumber}기 ` : ''}
                                            {ev.courseName}
                                        </div>
                                    ))}
                                    {dayEvents.length > 1 && <div className="cal-event-more">+{dayEvents.length - 1}건</div>}
                                </div>

                                {/* 대상자 미선택: 전 직원 가능/불가 이름 미리보기 */}
                                {!selectedUserId && dayStaff.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                                        {previewStaff.map((s) => (
                                            <span
                                                key={s.userId}
                                                className={`chip ${s.available ? 'ok' : 'danger'}`}
                                                style={{ fontSize: 9, padding: '0 4px' }}
                                            >
                                                {s.userName}
                                            </span>
                                        ))}
                                        {dayStaff.length > previewStaff.length && (
                                            <span className="muted" style={{ fontSize: 9 }}>+{dayStaff.length - previewStaff.length}명</span>
                                        )}
                                    </div>
                                )}

                                {/* 대상자 선택: 그 사람의 세션별 배지 */}
                                {selectedUserId && myDaySchedules.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                                        {myDaySchedules.map((s) => (
                                            <span
                                                key={s.staffScheduleId}
                                                className={`chip ${s.isAvailable ? 'ok' : 'danger'}`}
                                                style={{ fontSize: 9, padding: '0 4px' }}
                                            >
                                                {SESSION_TYPE_LABELS[s.sessionType]}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 날짜 클릭 팝업 (모달) */}
            {selectedDate && (
                <div
                    className="modal-overlay open"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div className="modal" style={{ maxWidth: 640, width: '92%' }}>
                        <div className="modal-h">
                            <h3 style={{ margin: 0 }}>{selectedDate}</h3>
                            {(eventsByDate.get(selectedDate) ?? []).length > 0 && (
                                <span className="muted" style={{ marginLeft: 12, fontSize: 12 }}>
                                    이 날 진행 강좌: {(eventsByDate.get(selectedDate) ?? []).map((e) => e.courseName).join(', ')}
                                </span>
                            )}
                            <button className="x" onClick={closeModal} style={{ marginLeft: 'auto' }}>✕</button>
                        </div>
                        <div className="modal-b" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            {/* 전체 근무자 목록 (항상 표시, 읽기 전용 + 빠른 전환) */}
                            <div style={{ marginBottom: selectedUserId ? 18 : 0 }}>
                                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                                    {isLoadingAll ? '전 직원 일정 불러오는 중...' : `등록된 근무자 ${selectedDayStaff.length}명`}
                                </div>
                                {selectedDayStaff.length === 0 && (
                                    <div className="muted" style={{ fontSize: 12 }}>이 날짜에 등록된 일정이 없습니다.</div>
                                )}
                                {selectedDayStaff.map((s) => (
                                    <div
                                        key={s.userId}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '6px 0',
                                            borderBottom: '1px solid var(--line-soft)',
                                        }}
                                    >
                                        <span className={`chip ${s.available ? 'ok' : 'danger'}`}>{s.available ? '가능' : '불가'}</span>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{s.userName}</span>
                                        <span className="muted" style={{ fontSize: 11.5 }}>
                                            {s.entries.map((e) => `${SESSION_TYPE_LABELS[e.sessionType]}${e.isAvailable ? '' : '(불가)'}`).join(' · ')}
                                        </span>
                                        <button
                                            className="btn"
                                            style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11 }}
                                            type="button"
                                            onClick={() => handlePickUserFromDay(s.userId)}
                                        >
                                            이 사람 관리
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* 대상자 선택 상태일 때만: 등록/수정 폼 */}
                            {selectedUserId && (
                                <>
                                    <div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0 8px' }}>
                                        {users.find((u) => u.userId === selectedUserId)?.userName} 일정 등록/수정
                                    </div>
                                    {selectedMySchedules.length > 0 && (
                                        <div style={{ marginBottom: 14 }}>
                                            {selectedMySchedules.map((s) => (
                                                <div
                                                    key={s.staffScheduleId}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '8px 0',
                                                        borderBottom: '1px solid var(--line-soft)',
                                                    }}
                                                >
                                                    <button
                                                        className={`chip ${s.isAvailable ? 'ok' : 'danger'}`}
                                                        style={{ border: 'none', cursor: 'pointer' }}
                                                        type="button"
                                                        onClick={() => handleToggleAvailable(s)}
                                                        title="클릭해서 가능/불가 전환"
                                                    >
                                                        {s.isAvailable ? '가능' : '불가'}
                                                    </button>
                                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{SESSION_TYPE_LABELS[s.sessionType]}</span>
                                                    {s.memo && <span className="muted" style={{ fontSize: 12 }}>{s.memo}</span>}
                                                    <button
                                                        className="btn"
                                                        style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11 }}
                                                        type="button"
                                                        onClick={() => s.staffScheduleId != null && handleDeleteSchedule(s.staffScheduleId)}
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                        <div className="field">
                                            <label>시간대</label>
                                            <select value={sessionType} onChange={(e) => setSessionType(e.target.value as SessionType)}>
                                                {SESSION_TYPES.map((t) => (
                                                    <option key={t} value={t}>
                                                        {SESSION_TYPE_LABELS[t]}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="field">
                                            <label>가능 여부</label>
                                            <select value={isAvailable ? '1' : '0'} onChange={(e) => setIsAvailable(e.target.value === '1')}>
                                                <option value="1">가능</option>
                                                <option value="0">불가</option>
                                            </select>
                                        </div>
                                        <div className="field" style={{ flex: 1, minWidth: 160 }}>
                                            <label>메모</label>
                                            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 오전만 가능" />
                                        </div>
                                        <button className="btn primary" type="button" onClick={handleSaveSchedule} disabled={isSaving}>
                                            {isSaving ? '저장 중...' : '+ 일정 등록'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {!selectedUserId && (
                                <p className="note" style={{ marginTop: 10 }}>
                                    위 목록에서 "이 사람 관리"를 누르거나, 상단 대상자 선택란에서 직접 골라 일정을 등록/수정할 수 있습니다.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}