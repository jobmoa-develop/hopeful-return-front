import { apiClient } from './client';

export type CourseStatus =
  'PLANNED' | 'OPEN' | 'CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | string;

export type CourseSummary = {
  courseId: number;
  regionId?: number;
  regionName?: string;
  courseNumber?: number;
  localCourseNumber?: number;
  courseName?: string;
  status?: CourseStatus;
  year?: number;
  capacity?: number;
  minimumCapacity?: number;
  location?: string;
  planSubmitDate?: string;
  recruitStart?: string;
  recruitEnd?: string;
  day1Date?: string;
  day2Date?: string;
  day3Date?: string;
  day4Date?: string;
  day5Date?: string;
  educationStartTime?: string;
  educationEndTime?: string;
  // 휴게시간(분 단위). 예: 60 = 1시간, 30 = 30분.
  breakMinutes?: number;
  currentParticipants?: number;
};

export type CourseDetail = CourseSummary & {
  courseId: number;
  regionId: number;
  regionName: string;
  courseNumber: number;
  localCourseNumber: number;
  courseName: string;
  status: CourseStatus;
  capacity: number;
  minimumCapacity: number;
  currentParticipants: number;
  location: string;
  planSubmitDate: string;
};

export type CourseListParams = {
  regionId?: number;
  parentRegionId?: number;
  status?: string;
  keyword?: string;
  courseNumber?: number; // 전체회차(기수) 검색 — 지역 미선택 시 사용
  localCourseNumber?: number; // 지역회차 검색 — 지역 선택 시 사용
  sortBy?: string; // 정렬 키(courseName/regionName/courseNumber/localCourseNumber/capacity/status/day1Date/planSubmitDate)
  sortOrder?: 'asc' | 'desc'; // 정렬 방향(기본 asc)
  page?: number;
  size?: number;
};

export type PageData<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type CourseCreateRequest = {
  regionId: number;
  courseNumber: number;
  localCourseNumber: number;
  courseName: string;
  recruitStart: string;
  recruitEnd: string;
  day1Date: string;
  day2Date: string;
  day3Date: string;
  day4Date: string;
  day5Date: string;
  educationStartTime: string;
  educationEndTime: string;
  // 휴게시간(분 단위). 예: 60 = 1시간, 30 = 30분.
  breakMinutes: number;
  capacity: number;
  minimumCapacity: number;
  location: string;
  planSubmitDate: string;
};

export type CourseUpdateRequest = {
  regionId?: number;
  courseNumber?: number;
  localCourseNumber?: number;
  courseName?: string;
  recruitStart?: string;
  recruitEnd?: string;
  day1Date?: string;
  day2Date?: string;
  day3Date?: string;
  day4Date?: string;
  day5Date?: string;
  educationStartTime?: string;
  educationEndTime?: string;
  // 휴게시간(분 단위). 예: 60 = 1시간, 30 = 30분.
  breakMinutes?: number;
  capacity?: number;
  minimumCapacity?: number;
  location?: string;
  planSubmitDate?: string;
  // 교육일 이동으로 배정 인력이 타 회차/근무불가일과 겹칠 때, 확인 후 재전송하면 true.
  // 미확인(null/false)에 충돌이 있으면 409(ASSIGN_CONFLICT)로 충돌 목록을 반환한다.
  // true면 겹친 인력을 해당 교육일 배정에서 제외하고 진행한다.
  confirmConflicts?: boolean;
};

export type CourseStatusRequest = {
  status: string;
};

export type CourseParticipant = {
  courseParticipantId: number;
  checkInTime?: string;
  checkOutTime?: string;
  status?: string;
  participantName?: string;
  name?: string;
};

export type CourseStaff = {
  courseStaffId?: number;
  userId?: number;
  name?: string;
  staffRole?: string; // 'LECTURER' | 'COUNSELOR' | 'STAFF' | ...
  sessionType?: string;
  checkInTime?: string;
  checkOutTime?: string;
};

export function getCourses(params: CourseListParams) {
  return apiClient.get<ApiResponse<PageData<CourseSummary>>>('/api/courses', { params });
}

export function getCourse(courseId: number) {
  return apiClient.get<ApiResponse<CourseDetail>>(`/api/courses/${courseId}`);
}

export function createCourse(payload: CourseCreateRequest) {
  return apiClient.post<ApiResponse<{ courseId: number; status: string }>>('/api/courses', payload);
}

export function updateCourse(courseId: number, payload: CourseUpdateRequest) {
  return apiClient.put<
    ApiResponse<{ courseId: number; localCourseNumber: number; updated: boolean }>
  >(`/api/courses/${courseId}`, payload);
}

export function deleteCourse(courseId: number) {
  return apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/api/courses/${courseId}`);
}

export function updateCourseStatus(courseId: number, payload: CourseStatusRequest) {
  return apiClient.patch<ApiResponse<{ courseId: number; status: string }>>(
    `/api/courses/${courseId}/status`,
    payload,
  );
}

export function getCourseStaffs(courseId: number) {
  return apiClient.get<ApiResponse<{ staffs: CourseStaff[] }>>(`/api/courses/${courseId}/staffs`);
}

export function getCourseParticipants(
  courseId: number,
  params?: { status?: string; keyword?: string; page?: number; size?: number },
) {
  return apiClient.get<ApiResponse<PageData<CourseParticipant>>>(
    `/api/courses/${courseId}/participants`,
    { params },
  );
}

export type NotifyCourseChangeRequest = {
  userIds: number[];
};

export type NotifyCourseChangeResponse = {
  notifiedCount: number;
};

// 강좌 일정/장소 변경 안내 문자 발송 — 선택 담당자(PM 제외) 대상
export function notifyCourseScheduleChange(courseId: number, payload: NotifyCourseChangeRequest) {
  return apiClient.post<ApiResponse<NotifyCourseChangeResponse>>(
    `/api/courses/${courseId}/notify-schedule-change`,
    payload,
  );
}

// 강좌 담당자 안내 문자(상태변경/일정변경) 발송 종류
export type CourseStaffSmsNotifyType = 'STATUS_CHANGE' | 'SCHEDULE_CHANGE' | string;

// 강좌 담당자 안내 문자 발송 상태
export type CourseStaffSmsSendStatus = 'SUCCESS' | 'FAIL' | string;

export type CourseStaffSmsHistoryItem = {
  courseStaffSmsId: number;
  userId: number;
  userName?: string;
  sentBy?: number;
  sentByName?: string;
  notifyType?: CourseStaffSmsNotifyType;
  content?: string;
  sendStatus?: CourseStaffSmsSendStatus;
  sentAt?: string;
};

export type CourseStaffSmsHistoryResponse = {
  content: CourseStaffSmsHistoryItem[];
};

// 강좌 담당자 안내 문자(상태변경·일정변경) 발송 이력 조회
export function getCourseStaffSmsHistory(courseId: number) {
  return apiClient.get<ApiResponse<CourseStaffSmsHistoryResponse>>(
    `/api/courses/${courseId}/staff-sms-history`,
  );
}
