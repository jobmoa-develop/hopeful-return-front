import { apiClient } from './client';
import type { ApiResponse } from './courses';

export type DashboardRegionStatItem = {
    regionId: number;
    regionName: string;
    plannedCount: number;
    recruitingCount: number;
    inProgressCount: number;
    canceledCount: number;
    completedParticipants: number;
    incompleteParticipants: number;
};

export type DashboardRegionStatsResponse = {
    content: DashboardRegionStatItem[];
    totals: Omit<DashboardRegionStatItem, 'regionId' | 'regionName'>;
};

export function getDashboardRegionStats() {
    return apiClient.get<ApiResponse<DashboardRegionStatsResponse>>('/api/dashboard/region-stats');
}

export type CalendarItemKind = 'TASK' | 'ALERT';
export type CalendarTaskType =
    | 'RECRUIT_START'
    | 'RECRUIT_END'
    | 'PLAN_SUBMIT'
    | 'ATTENDANCE_INPUT'
    | 'COMPLETION_PROCESS'
    | 'REPORT_SUBMIT'
    | null;

export type DashboardCalendarItem = {
    id: string;
    date: string; // "YYYY-MM-DD"
    kind: CalendarItemKind;
    taskType: CalendarTaskType;
    title: string;
    meta: string;
    sourceType: 'COURSE' | 'COURSE_PARTICIPANT_GROUP';
    sourceId: number | null;
    severity: 'danger' | 'warn' | null;
    count: number | null;
};

export type DashboardCalendarResponse = {
    content: DashboardCalendarItem[];
};

export function getDashboardCalendar(year?: number, month?: number) {
    return apiClient.get<ApiResponse<DashboardCalendarResponse>>('/api/dashboard/calendar', {
        params: { year, month },
    });
}


export type DashboardTaskCompletionResponse = {
    completedTaskIds: string[];
};

export function getDashboardTaskCompletions() {
    return apiClient.get<ApiResponse<DashboardTaskCompletionResponse>>('/api/dashboard/task-completions');
}

export function completeDashboardTask(taskId: string) {
    return apiClient.post<ApiResponse<null>>('/api/dashboard/task-completions', { taskId });
}

export function uncompleteDashboardTask(taskId: string) {
    return apiClient.delete<ApiResponse<null>>(`/api/dashboard/task-completions/${encodeURIComponent(taskId)}`);
}