import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getCourses, getCourseStaffs } from '../api/courses';
import type { CourseSummary } from '../api/courses';
import { getCourseDailyStaff } from '../api/courseDailyStaff';
import type { CourseDailyStaffItem, SessionTypeValue } from '../api/courseDailyStaff';
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

// 이 역할들은 원칙적으로 "본인이 담당자로 배정된 회차"만 캘린더에 노출
const RESTRICTED_ROLES = ['LECTURER', 'STAFF', 'OPERATOR', 'PROJECT_LEADER', 'COUNSELOR'];

// 이 역할들 중 하나라도 있으면, RESTRICTED_ROLES를 같이 갖고 있어도 전체 열람이 우선한다.
const UNRESTRICTED_ROLES = ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'PROJECT_MANAGER'];

// 관리자용 근무자 일정 관리 페이지로 이동 가능한 역할
const SCHEDULE_MANAGE_ROLES = ['ADMIN', 'OPERATOR'];

// course_staff.staffRole 중, "회차 전체 일정"이 아니라 "본인이 실제 배정된 날짜"만 캘린더에 노출해야 하는 역할.
// (요청 4번: 진행자·행정인력·PL·강사. 상담사(COUNSELOR)는 기존처럼 회차 전체 기간을 유지한다.)
const DAY_FILTER_STAFF_ROLES = new Set(['LECTURER', 'STAFF', 'ADMIN_STAFF', 'PROJECT_LEADER']);

// course_staff.staffRole → 화면 표시용 라벨
const STAFF_ROLE_LABELS: Record<string, string> = {
    LECTURER: '강사',
    COUNSELOR: '상담사',
    STAFF: '진행요원',
    PROJECT_MANAGER: 'PM',
    PROJECT_LEADER: 'PL',
    ADMIN_STAFF: '행정',
};

// AM/PM/FULL 배지 색상
const SESSION_BADGE_COLOR: Record<SessionTypeValue, string> = {
    AM: '#fde68a',
    PM: '#a5d8ff',
    FULL: '#c3e6cb',
};

function staffRoleLabel(role?: string | null) {
    if (!role) return null;
    return STAFF_ROLE_LABELS[role] ?? role;
}

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
    localCourseNumber?: number;
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

    // 강좌별 "내 배정 역할" — 회차마다 역할이 다를 수 있으므로 courseId 단위로 저장 (getCourseStaffs 기반)
    const [myStaffRoleByCourse, setMyStaffRoleByCourse] = useState<Map<number, string>>(new Map());

    // 내가 배정된 강좌에서: `${courseId}_${scheduleDate}` -> 그 날 내 세션(오전/오후/전체) (getCourseDailyStaff 기반)
    const [mySessionByCourseDate, setMySessionByCourseDate] = useState<Map<string, SessionTypeValue>>(new Map());
    // 내가 배정된 강좌에서: courseId -> 실제 내가 배정된 날짜 집합 (요청 4번 — 일자 단위 필터링용)
    const [myAssignedDatesByCourse, setMyAssignedDatesByCourse] = useState<Map<number, Set<string>>>(new Map());
    // course-daily-staffs 호출이 실패했는지(예: 403) 여부 — 실패 시 화면에 안내를 띄우기 위함
    const [dailyStaffError, setDailyStaffError] = useState<string | null>(null);

    const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

    // 제한 역할을 갖고 있더라도, 전체 열람 역할(ADMIN 등)을 함께 갖고 있으면 제한하지 않는다.
    const isRestricted = Boolean(
        user?.roles?.some((r) => RESTRICTED_ROLES.includes(r)) &&
        !user?.roles?.some((r) => UNRESTRICTED_ROLES.includes(r)),
    );
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

    // 2) 제한 대상 역할이면, 본인이 담당자로 배정된 강좌만 남기도록 필터링.
    //    관리자(ADMIN)는 기존 표시 형식을 그대로 쓰므로 역할 맵이 필요 없다.
    //    그 외(관리자가 아닌 전체 열람 역할 포함)는 새 표시 형식(지역+지역회차+세션)을 위해
    //    같은 응답에서 회차별 내 staffRole도 함께 뽑아둔다(추가 호출 없음).
    useEffect(() => {
        let active = true;

        if (!user) {
            setVisibleCourses(courses);
            setMyStaffRoleByCourse(new Map());
            return;
        }

        if (!isRestricted) {
            setVisibleCourses(courses);
        }

        if (isAdmin) {
            setMyStaffRoleByCourse(new Map());
            return;
        }

        if (courses.length === 0) {
            setVisibleCourses([]);
            setMyStaffRoleByCourse(new Map());
            return;
        }

        setIsFiltering(true);
        Promise.all(
            courses.map((c) =>
                c.courseId
                    ? getCourseStaffs(c.courseId)
                        .then(({ data: res }) => {
                            const mine = (res.data.staffs ?? []).find(
                                (s) => Number(s.userId) === Number(user.userId),
                            );
                            return { courseId: c.courseId as number, mine };
                        })
                        .catch((err) => {
                            console.error(
                                `[CourseCalendar] getCourseStaffs(courseId=${c.courseId}) 실패`,
                                err?.response?.status,
                                err,
                            );
                            return { courseId: c.courseId as number, mine: undefined };
                        })
                    : Promise.resolve({ courseId: c.courseId as number, mine: undefined }),
            ),
        )
            .then((results) => {
                if (!active) return;
                const roleMap = new Map<number, string>();
                const assignedIds = new Set<number>();
                results.forEach(({ courseId, mine }) => {
                    if (mine) {
                        assignedIds.add(courseId);
                        if (mine.staffRole) roleMap.set(courseId, mine.staffRole);
                    }
                });
                setMyStaffRoleByCourse(roleMap);
                if (isRestricted) {
                    setVisibleCourses(courses.filter((c) => c.courseId && assignedIds.has(c.courseId)));
                }
            })
            .finally(() => {
                if (active) setIsFiltering(false);
            });

        return () => {
            active = false;
        };
    }, [courses, isRestricted, user, isAdmin]);

    // 2-1) 내가 course_staff로 배정된 강좌 전체에서: 날짜별 인력 배정(course-daily-staff)에서
    //      내 담당 세션(오전/오후/전체)과, 실제 내가 배정된 날짜 집합을 뽑는다.
    //      - mySessionByCourseDate: 세션 배지 표시용(배정 데이터가 있는 계정만 표시)
    //      - myAssignedDatesByCourse: 요청 4번 — 진행자/행정인력/PL/강사는 이 날짜만 캘린더에 노출
    useEffect(() => {
        let active = true;

        const staffedCourseIds = visibleCourses
            .filter((c) => c.courseId && myStaffRoleByCourse.has(c.courseId))
            .map((c) => c.courseId as number);

        if (isAdmin || !user || staffedCourseIds.length === 0) {
            setMySessionByCourseDate(new Map());
            setMyAssignedDatesByCourse(new Map());
            setDailyStaffError(null);
            return;
        }

        let anyForbidden = false;
        let anyOtherError = false;

        Promise.all(
            staffedCourseIds.map((courseId) =>
                getCourseDailyStaff(courseId)
                    .then(({ data: res }) => ({
                        courseId,
                        assignments: res.data.assignments ?? [],
                    }))
                    .catch((err) => {
                        const status = err?.response?.status;
                        console.error(
                            `[CourseCalendar] getCourseDailyStaff(courseId=${courseId}) 실패`,
                            status,
                            err,
                        );
                        if (status === 403) anyForbidden = true;
                        else anyOtherError = true;
                        return { courseId, assignments: [] as CourseDailyStaffItem[] };
                    }),
            ),
        ).then((results) => {
            if (!active) return;
            const sessionMap = new Map<string, SessionTypeValue>();
            const assignedDates = new Map<number, Set<string>>();
            results.forEach(({ courseId, assignments }) => {
                const myRole = myStaffRoleByCourse.get(courseId);
                assignments.forEach((a) => {
                    if (Number(a.userId) === Number(user.userId) && a.staffRole === myRole) {
                        sessionMap.set(`${courseId}_${a.scheduleDate}`, a.sessionType);
                        const set = assignedDates.get(courseId) ?? new Set<string>();
                        set.add(a.scheduleDate);
                        assignedDates.set(courseId, set);
                    }
                });
            });
            setMySessionByCourseDate(sessionMap);
            setMyAssignedDatesByCourse(assignedDates);

            if (anyForbidden) {
                setDailyStaffError(
                    '날짜별 시간대(오전/오후) 조회 권한이 없어 일부 정보를 표시하지 못했습니다. 관리자에게 권한 확인을 요청해주세요.',
                );
            } else if (anyOtherError) {
                setDailyStaffError('날짜별 시간대 정보를 불러오는 중 오류가 발생했습니다.');
            } else {
                setDailyStaffError(null);
            }
        });

        return () => {
            active = false;
        };
    }, [isAdmin, visibleCourses, myStaffRoleByCourse, user]);

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
    // - 취소된(CANCELED) 강좌는 제외한다(요청 2번).
    // - 진행자/행정인력/PL/강사는 회차 전체 기간이 아니라 실제 배정된 날짜만 노출한다(요청 4번).
    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const c of visibleCourses) {
            if (!c.courseId) continue;
            if (c.status === 'CANCELED') continue;

            const myRole = myStaffRoleByCourse.get(c.courseId);
            const shouldFilterByAssignedDate =
                isRestricted && myRole != null && DAY_FILTER_STAFF_ROLES.has(myRole);
            const assignedDates = shouldFilterByAssignedDate
                ? myAssignedDatesByCourse.get(c.courseId)
                : null;

            DAY_KEYS.forEach((key, dayIndex) => {
                const dateStr = c[key];
                if (!dateStr) return;
                if (shouldFilterByAssignedDate && !(assignedDates && assignedDates.has(dateStr))) {
                    return;
                }
                const list = map.get(dateStr) ?? [];
                list.push({
                    courseId: c.courseId!,
                    courseName: c.courseName ?? `강좌 #${c.courseId}`,
                    courseNumber: c.courseNumber,
                    localCourseNumber: c.localCourseNumber,
                    regionName: c.regionName,
                    dayIndex,
                });
                map.set(dateStr, list);
            });
        }
        return map;
    }, [visibleCourses, myStaffRoleByCourse, isRestricted, myAssignedDatesByCourse]);

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
    const selectedDayEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

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
            {/* 캘린더 카드 + 우측 사이드 패널(선택 날짜 강의 목록)을 나란히 배치 */}
            <div className="cal-page-layout">
                <div className="card" style={{ flex: 1, minWidth: 0 }}>
                    <div className="card-h cal-header">
                        <div className="cal-header-left">
                            <button className="btn" type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>
                                ← 이전달
                            </button>
                            <span className="section-title" style={{ margin: '0 8px' }}>
                                {year}년 {month + 1}월
                            </span>
                            <button className="btn" type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>
                                다음달 →
                            </button>
                            <button className="btn" type="button" onClick={() => setCursor(new Date())}>
                                오늘
                            </button>
                        </div>
                        <div className="cal-header-right">
                            <span className="muted" style={{ fontSize: 12 }}>
                                {isLoading || isFiltering ? '불러오는 중...' : `총 ${visibleCourses.length}개 강좌`}
                                {isRestricted && !isLoading && !isFiltering ? ' (내 담당 강좌만 표시)' : ''}
                            </span>
                            {canManageStaffSchedules && (
                                <button
                                    className="btn"
                                    type="button"
                                    onClick={() => navigate('/staff-schedules')}
                                >
                                    근무자 일정 관리 →
                                </button>
                            )}
                        </div>
                    </div>

                    {dailyStaffError && (
                        <div style={{ padding: '8px 16px', background: '#fdecec', borderBottom: '1px solid var(--line)', fontSize: 12, color: '#c0392b' }}>
                            ⚠ {dailyStaffError}
                        </div>
                    )}

                    {regionLegend.length > 0 && (
                        <div className="cal-legend">
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
                            {!isAdmin && (
                                <span className="cal-legend-right" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, marginLeft: 'auto' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ padding: '1px 6px', borderRadius: 4, background: SESSION_BADGE_COLOR.AM, fontWeight: 700 }}>오전</span>
                                        <span style={{ padding: '1px 6px', borderRadius: 4, background: SESSION_BADGE_COLOR.PM, fontWeight: 700 }}>오후</span>
                                        <span style={{ padding: '1px 6px', borderRadius: 4, background: SESSION_BADGE_COLOR.FULL, fontWeight: 700 }}>전체</span>
                                    </span>
                                    내 배정 시간대
                                </span>
                            )}
                            {isAdmin && (
                                <span className="cal-legend-right" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, marginLeft: 'auto' }}>
                                    <span className="chip ok" style={{ padding: '1px 7px' }}>가능</span>
                                    <span className="chip danger" style={{ padding: '1px 7px' }}>불가</span>
                                    내 근무 가능 여부
                                </span>
                            )}
                        </div>
                    )}

                    <div className="cal-grid-wrapper">
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
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
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
                                        {dayEvents.slice(0, 2).map((ev, idx) => {
                                            // 이 회차에서 내 역할(회차마다 다를 수 있음)
                                            const roleLabel = staffRoleLabel(myStaffRoleByCourse.get(ev.courseId));
                                            // 내가 배정된 회차에서만: 그 날짜 담당 세션(오전/오후/전체)
                                            const mySession = mySessionByCourseDate.get(`${ev.courseId}_${dateStr}`);

                                            // 관리자: 기존 표시 형식(전체회차 · 강좌명 · N일차) 그대로 유지.
                                            // 그 외: 지역 + 지역회차 + (세션 배정 데이터가 있으면) 세션 + N일차.
                                            const eventLabel = isAdmin
                                                ? `${ev.courseNumber ? `${ev.courseNumber}기 ` : ''}${ev.courseName} · ${ev.dayIndex + 1}일차`
                                                : `${ev.regionName ?? ''} ${ev.localCourseNumber ? `${ev.localCourseNumber}회차` : ''} ${ev.dayIndex + 1}일차`.replace(/\s+/g, ' ').trim();

                                            return (
                                                <div
                                                    key={`${ev.courseId}-${idx}`}
                                                    className={`cal-event ${ev.dayIndex === 0 ? 'cal-event-start' : ev.dayIndex === 4 ? 'cal-event-end' : ''}`}
                                                    style={{
                                                        background: colorForRegion(ev.regionName),
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        overflow: 'hidden',
                                                    }}
                                                    title={`${ev.regionName ?? ''} ${ev.courseName} (${ev.courseNumber ?? '-'}기) - ${ev.dayIndex + 1}일차${roleLabel ? ` · ${roleLabel}` : ''}${mySession ? ` · ${SESSION_TYPE_LABELS[mySession]}` : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/rounds/${ev.courseId}`);
                                                    }}
                                                >
                                                    {/* 관리자 화면: 강사는 오전/오후/전체 배지, 그 외 역할은 역할명 배지를 맨 앞에 고정 노출(기존 방식 유지) */}
                                                    {isAdmin && mySession && (
                                                        <span
                                                            style={{
                                                                flexShrink: 0,
                                                                fontSize: 9.5,
                                                                fontWeight: 700,
                                                                padding: '1px 5px',
                                                                borderRadius: 4,
                                                                background: SESSION_BADGE_COLOR[mySession],
                                                                color: '#1a1a1a',
                                                            }}
                                                        >
                                                            {SESSION_TYPE_LABELS[mySession]}
                                                        </span>
                                                    )}
                                                    {isAdmin && roleLabel && !mySession && (
                                                        <span
                                                            style={{
                                                                flexShrink: 0,
                                                                fontSize: 9.5,
                                                                fontWeight: 700,
                                                                padding: '1px 5px',
                                                                borderRadius: 4,
                                                                background: '#e2e8f0',
                                                                color: '#1a1a1a',
                                                            }}
                                                        >
                                                            {roleLabel}
                                                        </span>
                                                    )}
                                                    {/* 관리자 외: 세션 배정 데이터가 있는 계정만 오전/오후/전체 배지 노출 */}
                                                    {!isAdmin && mySession && (
                                                        <span
                                                            style={{
                                                                flexShrink: 0,
                                                                fontSize: 9.5,
                                                                fontWeight: 700,
                                                                padding: '1px 5px',
                                                                borderRadius: 4,
                                                                background: SESSION_BADGE_COLOR[mySession],
                                                                color: '#1a1a1a',
                                                            }}
                                                        >
                                                            {SESSION_TYPE_LABELS[mySession]}
                                                        </span>
                                                    )}
                                                    {/* 텍스트 — 남는 공간만 차지, 넘치면 이 부분만 말줄임 처리 */}
                                                    <span
                                                        style={{
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        {eventLabel}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {dayEvents.length > 2 && <div className="cal-event-more">+{dayEvents.length - 2}건</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </div>
                </div>

                {/* 우측 사이드 패널 — 선택한 날짜의 전체 강의 목록(칸에서 넘쳐 +N건으로 가려진 것 포함). 항상 자리를 차지한다. */}
                <div className="card cal-side-panel">
                    <div className="card-h">
                        <span className="section-title">
                            {selectedDate ? `${selectedDate} 강의 목록` : '날짜를 선택해주세요'}
                        </span>
                        {selectedDate && (
                            <button
                                className="btn"
                                type="button"
                                style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }}
                                onClick={() => setSelectedDate(null)}
                            >
                                선택 해제
                            </button>
                        )}
                    </div>
                    <div className="card-b">
                        {!selectedDate && (
                            <div className="muted" style={{ fontSize: 12 }}>
                                캘린더의 날짜를 클릭하면 그날 예정된 강의 전체 목록이 여기 표시됩니다. (+N건으로 가려진 항목도 모두 포함)
                            </div>
                        )}
                        {selectedDate && selectedDayEvents.length === 0 && (
                            <div className="muted" style={{ fontSize: 12 }}>해당 날짜에 예정된 강의가 없습니다.</div>
                        )}
                        {selectedDate &&
                            selectedDayEvents.map((ev, idx) => {
                                const roleLabel = staffRoleLabel(myStaffRoleByCourse.get(ev.courseId));
                                const mySession = mySessionByCourseDate.get(`${ev.courseId}_${selectedDate}`);
                                return (
                                    <div
                                        key={`${ev.courseId}-${idx}`}
                                        onClick={() => navigate(`/rounds/${ev.courseId}`)}
                                        style={{
                                            padding: '8px 4px',
                                            borderBottom: '1px solid var(--line-soft)',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                                            <span
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: 2,
                                                    background: colorForRegion(ev.regionName),
                                                    display: 'inline-block',
                                                }}
                                            />
                                            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                                                {isAdmin
                                                    ? `${ev.courseNumber ? `${ev.courseNumber}기 ` : ''}${ev.courseName}`
                                                    : `${ev.regionName ?? '-'} ${ev.localCourseNumber ? `${ev.localCourseNumber}회차` : ''}`}
                                            </span>
                                            {mySession && (
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        padding: '1px 5px',
                                                        borderRadius: 4,
                                                        background: SESSION_BADGE_COLOR[mySession],
                                                    }}
                                                >
                                                    {SESSION_TYPE_LABELS[mySession]}
                                                </span>
                                            )}
                                            {roleLabel && (
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        padding: '1px 5px',
                                                        borderRadius: 4,
                                                        background: '#e2e8f0',
                                                    }}
                                                >
                                                    {roleLabel}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            {isAdmin
                                                ? `${ev.dayIndex + 1}일차`
                                                : `${ev.courseNumber ? `${ev.courseNumber}기 ` : ''}${ev.courseName} · ${ev.dayIndex + 1}일차`}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
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

                        <div className="cal-schedule-form">
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
                날짜 칸의 강좌 일정을 클릭하면 해당 강좌 상세 화면으로, 빈 곳을 클릭하면 우측 패널에 그 날짜의 강의 목록이 표시되고 근무 가능 여부도 등록할 수 있습니다.
                취소된 강좌는 캘린더에 표시되지 않습니다.
                {isRestricted ? ' 진행자·행정인력·PL·강사로 배정된 경우, 회차 전체 기간이 아니라 실제 배정된 날짜만 캘린더에 표시됩니다(상담사는 회차 전체 기간이 표시됩니다).' : ''}
                {canManageStaffSchedules ? ' 다른 근무자의 일정은 "근무자 일정 관리"에서 등록할 수 있습니다.' : ''}
            </p>
        </section>
    );
}