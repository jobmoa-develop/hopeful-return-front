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

export type UserDetail = {
    userId: number;
    loginId: string;
    name: string;
    phone: string | null;
    email: string | null;
    roleNames: UserRoleNameValue[];
    enabled: boolean;
    locked: boolean;
    createdAt: string;
    canSendSms: boolean;
    canSendEmail: boolean;
};

export type UserListItem = {
    userId: number;
    loginId: string;
    name: string;
    roleNames: UserRoleNameValue[];
    enabled: boolean;
    canSendSms: boolean;
    canSendEmail: boolean;
};

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

export type CreateUserRequest = {
    loginId: string;
    password: string;
    name: string;
    phone?: string;
    email?: string;
    roleNames: string[];
};

export type UpdateUserRequest = {
    name: string;
    phone?: string;
    email?: string;
    roleNames: string[];
    enabled: boolean;
    locked: boolean;
};

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

// PATCH /api/users/{userId}/sms-permission - 문자 발송 권한 변경 (권한: ADMIN, HEAD_OFFICE)
export function updateSmsPermission(userId: number, payload: { canSendSms: boolean }) {
    return apiClient.patch<ApiResponse<{ userId: number; canSendSms: boolean }>>(
        `/api/users/${userId}/sms-permission`,
        payload
    );
}

// PATCH /api/users/{userId}/email-permission - 메일 발송(근무불가 알림 수신) 권한 변경 (권한: ADMIN, HEAD_OFFICE)
export function updateEmailPermission(userId: number, payload: { canSendEmail: boolean }) {
    return apiClient.patch<ApiResponse<{ userId: number; canSendEmail: boolean }>>(
        `/api/users/${userId}/email-permission`,
        payload
    );
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

export function roleNamesLabel(roleNames: string[]): string {
    return roleNames.map(roleNameLabel).join(' · ');
}

// PATCH /api/users/{userId}/reset-password - 비밀번호 초기화 (권한: ADMIN)
export function resetUserPassword(userId: number) {
    return apiClient.patch<ApiResponse<{ message: string; tempPassword: string }>>(
        `/api/users/${userId}/reset-password`
    );
}