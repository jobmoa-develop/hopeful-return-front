import { apiClient } from './client';
import type { ApiResponse } from './courses';

export type UserRoleNameValue =
    | 'ADMIN'
    | 'HEAD_OFFICE'
    | 'REGIONAL_MANAGER'
    | 'OPERATOR'
    | 'COUNSELOR'
    | 'STAFF'
    | 'LECTURER'
    | 'PROJECT_MANAGER'
    | 'PROJECT_LEADER';

// GET /api/users/{userId} 응답 (UserResponse.java 대응)
export type UserDetail = {
    userId: number;
    loginId: string;
    name: string;
    phone: string | null;
    email: string | null;
    roleName: UserRoleNameValue;
    enabled: boolean;
    locked: boolean;
    createdAt: string;
};

// GET /api/users 목록 항목 (UserListResponse.Item 대응)
export type UserListItem = {
    userId: number;
    loginId: string;
    name: string;
    roleName: UserRoleNameValue;
    enabled: boolean;
};

// GET /api/users 응답 (UserListResponse 대응)
export type UserListResponse = {
    content: UserListItem[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
};

export type UserListParams = {
    page?: number;
    size?: number;
    name?: string;
    roleName?: string;
    enabled?: boolean;
};

// POST /api/users 요청 (CreateUserRequest.java 대응)
export type CreateUserRequest = {
    loginId: string;
    password: string;
    name: string;
    phone?: string;
    email?: string;
    roleName: string;
};

// PUT /api/users/{userId} 요청 (UpdateUserRequest.java 대응)
export type UpdateUserRequest = {
    name: string;
    phone?: string;
    email?: string;
    roleName: string;
    enabled: boolean;
    locked: boolean;
};

// GET /api/users/check-login-id 응답 (CheckLoginIdResponse.java 대응)
export type CheckLoginIdResponse = {
    duplicate: boolean;
};

// GET /api/users - 직원 목록 조회 (권한: ADMIN, HEAD_OFFICE)
export function getUsers(params: UserListParams = {}) {
    return apiClient.get<ApiResponse<UserListResponse>>('/api/users', { params });
}

// GET /api/users/{userId} - 직원 상세 조회 (권한: ADMIN, HEAD_OFFICE)
export function getUser(userId: number) {
    return apiClient.get<ApiResponse<UserDetail>>(`/api/users/${userId}`);
}

// POST /api/users - 직원 등록 (권한: ADMIN)
export function createUser(payload: CreateUserRequest) {
    return apiClient.post<ApiResponse<UserDetail>>('/api/users', payload);
}

// PUT /api/users/{userId} - 직원 수정 (권한: ADMIN)
export function updateUser(userId: number, payload: UpdateUserRequest) {
    return apiClient.put<ApiResponse<UserDetail>>(`/api/users/${userId}`, payload);
}

// DELETE /api/users/{userId} - 직원 삭제 (권한: ADMIN)
export function deleteUser(userId: number) {
    return apiClient.delete<ApiResponse<unknown>>(`/api/users/${userId}`);
}

// GET /api/users/check-login-id - 로그인 ID 중복 확인 (권한: ADMIN)
export function checkLoginId(loginId: string) {
    return apiClient.get<ApiResponse<CheckLoginIdResponse>>('/api/users/check-login-id', {
        params: { loginId },
    });
}

export const ROLE_NAME_OPTIONS: { value: UserRoleNameValue; label: string }[] = [
    { value: 'ADMIN', label: '시스템 관리자' },
    { value: 'HEAD_OFFICE', label: '본부장' },
    { value: 'REGIONAL_MANAGER', label: '지역담당자' },
    { value: 'OPERATOR', label: '행정허브' },
    { value: 'COUNSELOR', label: '상담사' },
    { value: 'STAFF', label: '진행요원' },
    { value: 'LECTURER', label: '강사' },
    { value: 'PROJECT_MANAGER', label: 'PM' },
    { value: 'PROJECT_LEADER', label: 'PL' },
];

export function roleNameLabel(roleName: string): string {
    return ROLE_NAME_OPTIONS.find((r) => r.value === roleName)?.label ?? roleName;
}