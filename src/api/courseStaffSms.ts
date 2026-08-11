import { apiClient } from './client';
import type { ApiResponse } from './courses';

export type CourseStaffSmsHistoryParams = {
    keyword?: string;
    notifyType?: string;
    sendStatus?: string;
    courseNumber?: number;
    localCourseNumber?: number;
    regionId?: number;
    parentRegionId?: number;
    sentDateFrom?: string;
    sentDateTo?: string;
    page?: number;
    size?: number;
};

export type CourseStaffSmsHistoryPageItem = {
    courseStaffSmsId: number;
    courseId: number;
    regionName?: string;
    courseName?: string;
    courseNumber?: number;
    localCourseNumber?: number;
    userId: number;
    userName?: string;
    userPhone?: string;
    sentBy?: number;
    sentByName?: string;
    notifyType?: string; // STATUS_CHANGE | SCHEDULE_CHANGE
    content?: string;
    sendStatus?: string; // SUCCESS | FAIL
    sentAt?: string;
};

export type CourseStaffSmsHistoryPageData = {
    content: CourseStaffSmsHistoryPageItem[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
};

// 강좌 담당자 안내 문자 발송 내역(전역·페이지) 조회
export function getCourseStaffSmsHistoryPage(params: CourseStaffSmsHistoryParams) {
    return apiClient.get<ApiResponse<CourseStaffSmsHistoryPageData>>('/api/course-staff-sms/history', {
        params,
    });
}