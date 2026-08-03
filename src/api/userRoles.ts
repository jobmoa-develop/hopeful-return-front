import { apiClient } from './client';

export type UserRoleName =
    | 'HEAD_OFFICE'
    | 'REGIONAL_MANAGER'
    | 'OPERATOR'
    | 'COUNSELOR'
    | 'LECTURER'
    | 'STAFF'
    | 'ADMIN'
    | 'PROJECT_MANAGER'
    | 'PROJECT_LEADER'
    | string;

export type UserRoleItem = {
    userId: number;
    userName: string;
    roleId: number;
    roleName: UserRoleName;
    description: string;
};

// GET /api/user-roles - 전체 사용자 권한 조회 (동일 userId가 여러 건 반환될 수 있음)
export function getUserRoles() {
    return apiClient.get<UserRoleItem[]>('/api/user-roles');
}

// GET /api/user-roles/{userId} - 특정 사용자 권한 조회
export function getUserRole(userId: number) {
    return apiClient.get<UserRoleItem[]>(`/api/user-roles/${userId}`);
}

// roleName(enum) -> 한글 라벨
export const ROLE_NAME_LABELS: Record<string, string> = {
    HEAD_OFFICE: '본부장',
    REGIONAL_MANAGER: '지역담당자',
    OPERATOR: '행정허브',
    COUNSELOR: '상담사',
    LECTURER: '강사',
    STAFF: '진행요원',
    ADMIN: '시스템 관리자',
    PROJECT_MANAGER: 'PM',
    PROJECT_LEADER: 'PL',
};

export function roleNameLabel(roleName: string): string {
    return ROLE_NAME_LABELS[roleName] ?? roleName;
}

// userId 기준으로 그룹핑해서 "강사 · 상담사" 같은 문자열로 만들어주는 헬퍼
export function buildUserRoleMap(items: UserRoleItem[]): Map<number, string> {
    const grouped = new Map<number, string[]>();
    for (const item of items) {
        const list = grouped.get(item.userId) ?? [];
        list.push(roleNameLabel(item.roleName));
        grouped.set(item.userId, list);
    }

    const result = new Map<number, string>();
    grouped.forEach((labels, userId) => {
        result.set(userId, Array.from(new Set(labels)).join(' · '));
    });
    return result;
}