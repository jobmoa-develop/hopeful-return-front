import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, getCourseStaffs } from '../api/courses';
import type { CourseSummary } from '../api/courses';
import { useAuth } from '../context/AuthContext';

const DAY_KEYS = ['day1Date', 'day2Date', 'day3Date', 'day4Date', 'day5Date'] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 이 역할들은 본인이 담당자로 배정된 강좌만 캘린더에 노출
const RESTRICTED_ROLES = ['LECTURER', 'STAFF', 'OPERATOR', 'PROJECT_LEADER', 'COUNSELOR'];

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

    const isRestricted = Boolean(user?.role && RESTRICTED_ROLES.includes(user.role));

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

    // 날짜(YYYY-MM-DD) -> 이벤트 목록
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

    // 범례용: 현재 표시 중인 강좌들의 지역 목록(중복 제거)
    const regionLegend = useMemo(() => {
        const names = new Set<string>();
        visibleCourses.forEach((c) => {
            if (c.regionName) names.add(c.regionName);
        });
        return Array.from(names);
    }, [visibleCourses]);

    const year = cursor.getFullYear();
    const month = cursor.getMonth(); // 0-based

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

                        return (
                            <div
                                key={dateStr}
                                className={`cal-cell ${inMonth ? '' : 'cal-cell-muted'} ${dateStr === today ? 'cal-cell-today' : ''}`}
                            >
                                <div className="cal-date">{date.getDate()}</div>
                                <div className="cal-events">
                                    {dayEvents.slice(0, 3).map((ev, idx) => (
                                        <div
                                            key={`${ev.courseId}-${idx}`}
                                            className={`cal-event ${ev.dayIndex === 0 ? 'cal-event-start' : ev.dayIndex === 4 ? 'cal-event-end' : ''}`}
                                            style={{ background: colorForRegion(ev.regionName) }}
                                            title={`${ev.regionName ?? ''} ${ev.courseName} (${ev.courseNumber ?? '-'}기) - ${ev.dayIndex + 1}일차`}
                                            onClick={() => navigate(`/rounds/${ev.courseId}`)}
                                        >
                                            {ev.courseNumber ? `${ev.courseNumber}기 ` : ''}
                                            {ev.courseName} · {ev.dayIndex + 1}일차
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <div className="cal-event-more">+{dayEvents.length - 3}건 더보기</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <p className="note">날짜 칸의 일정을 클릭하면 해당 강좌 상세 화면으로 이동합니다.</p>
        </section>
    );
}