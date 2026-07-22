import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type AppRole =
  | 'ADMIN'
  | 'HEAD_OFFICE'
  | 'REGIONAL_MANAGER'
  | 'OPERATOR'
  | 'COUNSELOR'
  | 'STAFF'
  | 'LECTURER'
  | 'PROJECT_MANAGER'
  | 'PROJECT_LEADER';

export interface Permissions {
  register: number;
  editP: number;
  attend: number;
  consult: number;
  memo: number;
  editR: number;
  complete: number;
}

export interface RoleConfig {
  nm: string;
  role: AppRole;       // 대표 역할(기존 코드 호환용, roles[0])
  roles: AppRole[];    // 보유한 전체 역할
  mode: 'admin' | 'field';
  scope: 'all' | 'region' | 'rounds';
  region?: string;
  rounds?: string[];
  phone: boolean;
  perm: string;
  menu: string[];
  can: Permissions;
}

const ALL_ROLES: AppRole[] = [
  'ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'OPERATOR', 'COUNSELOR', 'STAFF',
  'LECTURER', 'PROJECT_MANAGER', 'PROJECT_LEADER',
];

export const ROLE_MENU_RULES: Record<string, AppRole[]> = {
  dashboard: ALL_ROLES,
  calendar: ALL_ROLES,
  participants: [
    'ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'OPERATOR', 'COUNSELOR', 'STAFF',
    'PROJECT_MANAGER', 'PROJECT_LEADER',
  ],
  rounds: ALL_ROLES,
  assign: ['ADMIN', 'REGIONAL_MANAGER', 'OPERATOR'],
  consulting: ['ADMIN', 'OPERATOR', 'COUNSELOR'],
  attendance: ['ADMIN', 'OPERATOR', 'STAFF'],
  followUp: ['ADMIN', 'COUNSELOR'],
  userManagement: ['ADMIN', 'HEAD_OFFICE'],
};

const ROLE_PERMISSIONS: Record<AppRole, Omit<RoleConfig, 'nm' | 'role' | 'roles' | 'menu'>> = {
  ADMIN: {
    mode: 'admin', scope: 'all', phone: true, perm: '전체 메뉴 접근 가능',
    can: { register: 1, editP: 1, attend: 1, consult: 1, memo: 1, editR: 1, complete: 1 },
  },
  HEAD_OFFICE: {
    mode: 'admin', scope: 'all', phone: true, perm: '본사 운영 메뉴 접근 가능',
    can: { register: 1, editP: 1, attend: 0, consult: 0, memo: 1, editR: 1, complete: 1 },
  },
  REGIONAL_MANAGER: {
    mode: 'admin', scope: 'all', phone: true, perm: '지역 운영 메뉴 접근 가능',
    can: { register: 1, editP: 1, attend: 0, consult: 0, memo: 1, editR: 1, complete: 0 },
  },
  OPERATOR: {
    mode: 'admin', scope: 'all', phone: true, perm: '운영 담당 메뉴 접근 가능 (참여자 등록 제외)',
    can: { register: 0, editP: 1, attend: 1, consult: 1, memo: 1, editR: 1, complete: 0 },
  },
  COUNSELOR: {
    mode: 'field', scope: 'all', phone: true, perm: '상담 메뉴 접근 가능',
    can: { register: 0, editP: 0, attend: 0, consult: 1, memo: 1, editR: 0, complete: 0 },
  },
  STAFF: {
    mode: 'field', scope: 'all', phone: true, perm: '현장 출결 메뉴 접근 가능 · 참여자 조회',
    can: { register: 0, editP: 0, attend: 1, consult: 0, memo: 1, editR: 0, complete: 0 },
  },
  LECTURER: {
    mode: 'field', scope: 'all', phone: false, perm: '강의 일정 조회 가능',
    can: { register: 0, editP: 0, attend: 0, consult: 0, memo: 0, editR: 0, complete: 0 },
  },
  PROJECT_MANAGER: {
    mode: 'admin', scope: 'all', phone: true, perm: '총괄(PM) 메뉴 접근 가능',
    can: { register: 1, editP: 1, attend: 0, consult: 0, memo: 1, editR: 1, complete: 1 },
  },
  PROJECT_LEADER: {
    mode: 'admin', scope: 'all', phone: true, perm: '리더(PL) 메뉴 접근 가능',
    can: { register: 1, editP: 1, attend: 0, consult: 0, memo: 1, editR: 1, complete: 0 },
  },
};

export function canAccessMenu(roles: string[] | undefined, menu: string): boolean {
  const allowed = ROLE_MENU_RULES[menu] ?? [];
  return (roles ?? []).some((r) => allowed.includes(r as AppRole));
}

function isAppRole(role: string): role is AppRole {
  return ALL_ROLES.includes(role as AppRole);
}

interface RoleContextType {
  roleConfig: RoleConfig;
  maskPhone: (p: string) => string;
  pidLabel: (p: { nm: string; phone: string }) => string;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const ownedRoles = (user?.roles ?? []).filter(isAppRole);
  const roles: AppRole[] = ownedRoles.length > 0 ? ownedRoles : ['STAFF'];

  // 보유한 모든 역할의 메뉴를 합집합으로 노출
  const menu = Array.from(
    new Set(
      Object.entries(ROLE_MENU_RULES)
        .filter(([, allowed]) => roles.some((r) => allowed.includes(r)))
        .map(([key]) => key),
    ),
  );

  // 권한(can)은 역할 중 하나라도 가능하면 가능으로 처리(OR)
  const can = roles.reduce<Permissions>(
    (acc, r) => {
      const p = ROLE_PERMISSIONS[r].can;
      return {
        register: Math.max(acc.register, p.register),
        editP: Math.max(acc.editP, p.editP),
        attend: Math.max(acc.attend, p.attend),
        consult: Math.max(acc.consult, p.consult),
        memo: Math.max(acc.memo, p.memo),
        editR: Math.max(acc.editR, p.editR),
        complete: Math.max(acc.complete, p.complete),
      };
    },
    { register: 0, editP: 0, attend: 0, consult: 0, memo: 0, editR: 0, complete: 0 },
  );

  const mode: 'admin' | 'field' = roles.some((r) => ROLE_PERMISSIONS[r].mode === 'admin')
    ? 'admin'
    : 'field';
  const phone = roles.some((r) => ROLE_PERMISSIONS[r].phone);
  const perm = Array.from(new Set(roles.map((r) => ROLE_PERMISSIONS[r].perm))).join(' / ');

  const roleConfig: RoleConfig = {
    ...ROLE_PERMISSIONS[roles[0]],
    mode,
    phone,
    perm,
    can,
    nm: user?.name ?? '',
    role: roles[0],
    roles,
    menu,
  };

  const maskPhone = (p: string): string => {
    if (!p) return '';
    const digitsOnly = p.replace(/-/g, '');
    if (digitsOnly.length >= 10) {
      return digitsOnly.slice(0, 3) + '****' + digitsOnly.slice(-4);
    }
    return p.slice(0, 3) + '****' + p.slice(-4);
  };

  const pidLabel = (p: { nm: string; phone: string }): string => {
    return p.nm + '_' + (roleConfig.phone ? p.phone.replace(/-/g, '') : maskPhone(p.phone));
  };

  return <RoleContext.Provider value={{ roleConfig, maskPhone, pidLabel }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}