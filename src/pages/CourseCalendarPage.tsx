import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getCourses, getCourseStaffs } from '../api/courses';
import type { CourseSummary } from '../api/courses';
import { useAuth } from '../context/AuthContext';
import {
    getMyStaffSchedules,
    createStaffSchedule,
    deleteStaffSchedule,
    SESSION_TYPE_LABELS,
} from '../api/staffSchedules';
import type { StaffScheduleItem, SessionType } from '../api/staffSchedules';

const DAY_KEYS = ['day1Date', 'day2Date', 'day3Date', 'day4Date', 'day5Date'] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SESSION_TYPES: SessionType[] = ['AM', 'PM', 'FULL'];

// 이 역할들은 본인이 담당자로 배정된 강좌만 캘린더에 노출
const RESTRICTED_ROLES = ['LECTURER', 'STAFF', 'OPERATOR', 'PROJECT_LEADER', 'COUNSELOR'];

// 관리자용 근무자 일정 관리 페이지로 이동 가능한 역할
const SCHEDULE_MANAGE_ROLES = ['ADMIN', 'OPERATOR'];

// 지역명 -> 고정 색상 팔레트 매핑용
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
    dayIndex: number; // 0=1일차 ... 4=5일차
};

function ymd(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CourseCalendarPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [cursor, setCursor] = useState(() => new Date());
    const [courses, setCourses] = useState<CourseSummary[]>([]);
    const [visibleCourses, setVisibleCourses] = useState<CourseSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFiltering, setIsFiltering] = useState(false);

    // 근무 가능 여부(본인) 관련 state
    const [mySchedules, setMySchedules] = useState<StaffScheduleItem[]>([]);
    const [isScheduleLoading, setIsScheduleLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [sessionType, setSessionType] = useState<SessionType>('FULL');
    const [isAvailable, setIsAvailable] = useState(true);
    const [memo, setMemo] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const isRestricted = Boolean(user?.roles?.some((r) => RESTRICTED_ROLES.includes(r)));
    const canManageStaffSchedules = Boolean(user?.roles?.some((r) => SCHEDULE_MANAGE_ROLES.includes(r)));

    // 1) 강좌는 한 번만 넉넉히 받아와서 클라이언트에서 월별로 필터링
    useEffect(() => {
        let active = true;
        setIsLoading(true);
        getCourses({ size: 1000 })
            .then(({ data: response }) => {
                if (active) setCourses(response.data.content ?? []);
            })
            .catch(() => {
                if (active) setCourses([]);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    // 2) 제한 대상 역할이면, 본인이 담당자로 배정된 강좌만 남기도록 필터링
    useEffect(() => {
        let active = true;

        if (!isRestricted || !user) {
            setVisibleCourses(courses);
            return;
        }

        if (courses.length === 0) {
            setVisibleCourses([]);
            return;
        }

        setIsFiltering(true);
        Promise.all(
            courses.map((c) =>
                c.courseId
                    ? getCourseStaffs(c.courseId)
                        .then(({ data: res }) => (res.data.staffs ?? []).some((s) => s.userId === user.userId))
                        .catch(() => false)
                    : Promise.resolve(false),
            ),
        )
            .then((flags) => {
                if (active) setVisibleCourses(courses.filter((_, idx) => flags[idx]));
            })
            .finally(() => {
                if (active) setIsFiltering(false);
            });

        return () => {
            active = false;
        };
    }, [courses, isRestricted, user]);

    const year = cursor.getFullYear();
    const month = cursor.getMonth(); // 0-based

    // 3) 이 달의 내 근무 가능 여부 일정 조회
    const loadMySchedules = () => {
        const monthStart = ymd(new Date(year, month, 1));
        const monthEnd = ymd(new Date(year, month + 1, 0));
        setIsScheduleLoading(true);
        getMyStaffSchedules(monthStart, monthEnd)
            .then(({ data: res }) => setMySchedules(res.data.content ?? []))
            .catch(() => setMySchedules([]))
            .finally(() => setIsScheduleLoading(false));
    };

    useEffect(() => {
        loadMySchedules();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year, month]);

    // 날짜(YYYY-MM-DD) -> 강좌 이벤트 목록
    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const c of visibleCourses) {
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
    }, [visibleCourses]);

    // 날짜(YYYY-MM-DD) -> 내 근무 가능 여부 일정 목록
    const schedulesByDate = useMemo(() => {
        const map = new Map<string, StaffScheduleItem[]>();
        mySchedules.forEach((s) => {
            const list = map.get(s.scheduleDate) ?? [];
            list.push(s);
            map.set(s.scheduleDate, list);
        });
        return map;
    }, [mySchedules]);

    // 범례용: 현재 표시 중인 강좌들의 지역 목록(중복 제거)
    const regionLegend = useMemo(() => {
        const names = new Set<string>();
        visibleCourses.forEach((c) => {
            if (c.regionName) names.add(c.regionName);
        });
        return Array.from(names);
    }, [visibleCourses]);

    const weeks = useMemo(() => {
        const firstOfMonth = new Date(year, month, 1);
        const startOffset = firstOfMonth.getDay(); // 0=일요일
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
    const selectedSchedules = selectedDate ? schedulesByDate.get(selectedDate) ?? [] : [];

    const handleSelectDate = (dateStr: string) => {
        setSelectedDate(dateStr === selectedDate ? null : dateStr);
        setSessionType('FULL');
        setIsAvailable(true);
        setMemo('');
    };

    const handleSaveSchedule = async () => {
        if (!selectedDate) return;
        setIsSaving(true);
        try {
            await createStaffSchedule({
                scheduleDate: selectedDate,
                sessionType,
                isAvailable,
                memo: memo || undefined,
            });
            setMemo('');
            loadMySchedules();
        } catch (err) {
            alert('일정 등록에 실패했습니다. 같은 날짜·시간대가 이미 등록되어 있는지 확인해주세요.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSchedule = async (staffScheduleId: number) => {
        if (!window.confirm('이 일정을 삭제하시겠습니까?')) return;
        try {
            await deleteStaffSchedule(staffScheduleId);
            loadMySchedules();
        } catch {
            alert('삭제에 실패했습니다.');
        }
    };

    return (
        <section className="view active" id="view-calendar">
            <div className="card">
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
                        {isLoading || isFiltering ? '불러오는 중...' : `총 ${visibleCourses.length}개 강좌`}
                        {isRestricted && !isLoading && !isFiltering ? ' (내 담당 강좌만 표시)' : ''}
                    </span>
                    {canManageStaffSchedules && (
                        <button
                            className="btn"
                            type="button"
                            style={{ marginLeft: 8 }}
                            onClick={() => navigate('/staff-schedules')}
                        >
                            근무자 일정 관리 →
                        </button>
                    )}
                </div>

                {regionLegend.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                        {regionLegend.map((name) => (
                            <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                                <span
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 3,
                                        background: colorForRegion(name),
                                        display: 'inline-block',
                                    }}
                                />
                                {name}
                            </span>
                        ))}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, marginLeft: 'auto' }}>
                            <span className="chip ok" style={{ padding: '1px 7px' }}>가능</span>
                            <span className="chip danger" style={{ padding: '1px 7px' }}>불가</span>
                            내 근무 가능 여부
                        </span>
                    </div>
                )}

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
                        const daySchedules = schedulesByDate.get(dateStr) ?? [];
                        const isSelected = dateStr === selectedDate;

                        return (
                            <div
                                key={dateStr}
                                onClick={() => handleSelectDate(dateStr)}
                                className={`cal-cell ${inMonth ? '' : 'cal-cell-muted'} ${dateStr === today ? 'cal-cell-today' : ''}`}
                                style={{
                                    cursor: 'pointer',
                                    height: 104,
                                    overflow: 'hidden',
                                    outline: isSelected ? '2px solid var(--navy-600)' : 'none',
                                    outlineOffset: '-2px',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div className="cal-date">{date.getDate()}</div>
                                    {daySchedules.length > 0 && (
                                        <span
                                            className={`chip ${daySchedules.some((s) => s.isAvailable) ? 'ok' : 'danger'}`}
                                            style={{ padding: '0 5px', fontSize: 9.5 }}
                                        >
                                            {daySchedules.some((s) => s.isAvailable) ? '가능' : '불가'}
                                        </span>
                                    )}
                                </div>
                                <div className="cal-events" style={{ overflow: 'hidden' }}>
                                    {dayEvents.slice(0, 2).map((ev, idx) => (
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
                                            {ev.courseName} · {ev.dayIndex + 1}일차
                                        </div>
                                    ))}
                                    {dayEvents.length > 2 && <div className="cal-event-more">+{dayEvents.length - 2}건</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 선택한 날짜의 근무 가능 여부 등록 패널 */}
            {selectedDate && (
                <div className="card" style={{ marginTop: 18 }}>
                    <div className="card-h">
                        <span className="section-title">{selectedDate} 근무 가능 여부</span>
                        {isScheduleLoading && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>불러오는 중...</span>}
                    </div>
                    <div className="card-b">
                        {selectedSchedules.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                                {selectedSchedules.map((s) => (
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
                                        <span className={`chip ${s.isAvailable ? 'ok' : 'danger'}`}>
                                            {s.isAvailable ? '가능' : '불가'}
                                        </span>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{SESSION_TYPE_LABELS[s.sessionType]}</span>
                                        {s.memo && <span className="muted" style={{ fontSize: 12 }}>{s.memo}</span>}
                                        <button
                                            className="btn"
                                            style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11 }}
                                            type="button"
                                            onClick={() => handleDeleteSchedule(s.staffScheduleId)}
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
                    </div>
                </div>
            )}

            <p className="note">
                날짜 칸의 강좌 일정을 클릭하면 해당 강좌 상세 화면으로, 빈 곳을 클릭하면 근무 가능 여부를 등록할 수 있습니다.
                {canManageStaffSchedules ? ' 다른 근무자의 일정은 "근무자 일정 관리"에서 등록할 수 있습니다.' : ''}
            </p>
        </section>
    );
}