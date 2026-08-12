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

// 알림 종류(BE StaffNotifyType). 인력배정 3종 + 기존 강좌 상태/일정 2종.
export type StaffNotifyTypeValue =
    | 'ASSIGN_NEW'
    | 'ASSIGN_CHANGED'
    | 'ASSIGN_REMOVED'
    | 'STATUS_CHANGE'
    | 'SCHEDULE_CHANGE';

export type SendCourseStaffSmsRecipient = {
    userId: number;
    // 이번 발송에만 적용할 전화번호(미지정 시 users.phone 사용)
    phoneOverride?: string;
};

export type SendCourseStaffSmsGroup = {
    notifyType: StaffNotifyTypeValue;
    content: string; // {region}/{round}/{role} 토큰은 서버가 수신자별 치환
    recipients: SendCourseStaffSmsRecipient[];
};

export type SendCourseStaffSmsPayload = {
    courseId: number;
    groups: SendCourseStaffSmsGroup[];
};

export type SendCourseStaffSmsResult = {
    messageFormat: string; // SMS | LMS
    totalCount: number;
    successCount: number;
    failedCount: number;
    skipped: { userId: number; name?: string }[]; // 전화번호 없어 제외된 인원
};

// 강좌 담당자 인력배정 안내 문자 발송(배정/변동/제외 그룹)
export function sendCourseStaffSms(payload: SendCourseStaffSmsPayload) {
    return apiClient.post<ApiResponse<SendCourseStaffSmsResult>>('/api/course-staff-sms/send', payload);
}