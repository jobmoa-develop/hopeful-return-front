import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type AppRole = 'ADMIN' | 'HEAD_OFFICE' | 'REGIONAL_MANAGER' | 'OPERATOR' | 'COUNSELOR' | 'STAFF';

export interface Permissions {
  editP: number;
  attend: number;
  consult: number;
  memo: number;
  editR: number;
  complete: number;
}

export interface RoleConfig {
  nm: string;
  role: AppRole;
  mode: 'admin' | 'field';
  scope: 'all' | 'region' | 'rounds';
  region?: string;
  rounds?: string[];
  phone: boolean;
  perm: string;
  menu: string[];
  can: Permissions;
}

const ALL_ROLES: AppRole[] = ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'OPERATOR', 'COUNSELOR', 'STAFF'];

export const ROLE_MENU_RULES: Record<string, AppRole[]> = {
  dashboard: ALL_ROLES,
  calendar: ALL_ROLES,
  participants: ['ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'OPERATOR', 'COUNSELOR'],
  rounds: ALL_ROLES,
  assign: ['ADMIN', 'REGIONAL_MANAGER', 'OPERATOR'],
  consulting: ['ADMIN', 'OPERATOR', 'COUNSELOR'],
  attendance: ['ADMIN', 'OPERATOR', 'STAFF'],
  followUp: ['ADMIN', 'COUNSELOR'],
  userManagement: ['ADMIN'],
};

// TODO:
// 지역/회차 기반 데이터 권한은
// 추후에 백엔드 Scope 기반 인가 구현 후
// region / rounds 값을 사용하도록 변경 예정. 지금은 사용하지 않는다. 일단 뼈대코드만 작성한것.

const ROLE_PERMISSIONS: Record<AppRole, Omit<RoleConfig, 'nm' | 'role' | 'menu'>> = {
  ADMIN: {
    mode: 'admin',
    scope: 'all',
    phone: true,
    perm: '전체 메뉴 접근 가능',
    can: { editP: 1, attend: 1, consult: 1, memo: 1, editR: 1, complete: 1 },
  },
  HEAD_OFFICE: {
    mode: 'admin',
    scope: 'all',
    phone: true,
    perm: '본사 운영 메뉴 접근 가능',
    can: { editP: 1, attend: 0, consult: 0, memo: 1, editR: 1, complete: 1 },
  },
  REGIONAL_MANAGER: {
    mode: 'admin',
    scope: 'all',
    phone: true,
    perm: '지역 운영 메뉴 접근 가능',
    can: { editP: 1, attend: 0, consult: 0, memo: 1, editR: 1, complete: 0 },
  },
  OPERATOR: {
    mode: 'admin',
    scope: 'all',
    phone: true,
    perm: '운영 담당 메뉴 접근 가능',
    can: { editP: 1, attend: 1, consult: 1, memo: 1, editR: 1, complete: 0 },
  },
  COUNSELOR: {
    mode: 'field',
    scope: 'all',
    phone: true,
    perm: '상담 메뉴 접근 가능',
    can: { editP: 0, attend: 0, consult: 1, memo: 1, editR: 0, complete: 0 },
  },
  STAFF: {
    mode: 'field',
    scope: 'all',
    phone: true,
    perm: '현장 출결 메뉴 접근 가능',
    can: { editP: 0, attend: 1, consult: 0, memo: 1, editR: 0, complete: 0 },
  },
};

export function canAccessMenu(role: string | undefined, menu: string): boolean {
  return ROLE_MENU_RULES[menu]?.includes(role as AppRole) ?? false;
}

function isAppRole(role: string | undefined): role is AppRole {
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
  const role = isAppRole(user?.role) ? user.role : 'STAFF';
  const roleConfig: RoleConfig = {
    ...ROLE_PERMISSIONS[role],
    nm: user?.name ?? '',
    role,
    menu: Object.entries(ROLE_MENU_RULES)
      .filter(([, roles]) => roles.includes(role))
      .map(([menu]) => menu),
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
