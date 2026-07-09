import { apiClient } from './client';

export type CourseStatus = 'PLANNED' | 'OPEN' | 'CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | string;

export type CourseSummary = {
  courseId: number;
  regionId?: number;
  regionName?: string;
  courseNumber?: number;
  courseName?: string;
  status?: CourseStatus;
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
  currentParticipants?: number;
};

export type CourseDetail = CourseSummary & {
  courseId: number;
  regionId: number;
  regionName: string;
  courseNumber: number;
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
  status?: string;
  keyword?: string;
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
  capacity: number;
  minimumCapacity: number;
  location: string;
  planSubmitDate: string;
};

export type CourseUpdateRequest = {
  courseName: string;
  capacity: number;
  minimumCapacity: number;
  location: string;
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
  courseParticipantId?: number;
  staffId?: number;
  name?: string;
  staffName?: string;
  role?: string;
  status?: string;
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
  return apiClient.put<ApiResponse<{ courseId: number; updated: boolean }>>(`/api/courses/${courseId}`, payload);
}

export function deleteCourse(courseId: number) {
  return apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/api/courses/${courseId}`);
}

export function updateCourseStatus(courseId: number, payload: CourseStatusRequest) {
  return apiClient.patch<ApiResponse<{ courseId: number; status: string }>>(`/api/courses/${courseId}/status`, payload);
}

export function getCourseStaffs(courseId: number) {
  return apiClient.get<ApiResponse<{ staffs: CourseStaff[] }>>(`/api/courses/${courseId}/staffs`);
}

export function getCourseParticipants(courseId: number, params?: { status?: string; keyword?: string; page?: number; size?: number }) {
  return apiClient.get<ApiResponse<PageData<CourseParticipant>>>(`/api/courses/${courseId}/participants`, { params });
}
