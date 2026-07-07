import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type RoleKey = 'pl' | 'region' | 'han' | 'counselor' | 'facil' | 'teacher';

export interface Permissions {
  editP: number;      // can edit participant info
  attend: number;     // can enter attendance
  consult: number;    // can enter consultation logs
  memo: number;       // can add memo
  editR: number;      // can edit round info
  complete: number;   // can process completion / allowance
}

export interface RoleConfig {
  nm: string;
  role: string;
  mode: 'admin' | 'field';
  scope: 'all' | 'region' | 'rounds';
  region?: string;
  rounds?: string[];
  phone: boolean;
  perm: string;
  menu: string[];
  can: Permissions;
}

export const ROLES: Record<RoleKey, RoleConfig> = {
  pl: {
    nm: "이인철",
    role: "PL · 사업총괄",
    mode: "admin",
    scope: "all",
    phone: true,
    perm: "전체 조회·수정·승인 가능",
    menu: ["dashboard", "participants", "rounds", "assign", "consulting", "attendance"],
    can: { editP: 1, attend: 1, consult: 1, memo: 1, editR: 1, complete: 1 }
  },
  region: {
    nm: "이빛나라",
    role: "지역담당자 · 양천",
    mode: "admin",
    scope: "region",
    region: "양천",
    phone: true,
    perm: "담당지역(양천) 회차·참여자 입력·수정 가능",
    menu: ["dashboard", "participants", "rounds", "assign", "consulting", "attendance"],
    can: { editP: 1, attend: 1, consult: 1, memo: 1, editR: 1, complete: 1 }
  },
  han: {
    nm: "한준희",
    role: "한준희 주임 · 행정",
    mode: "admin",
    scope: "all",
    phone: true,
    perm: "전체 조회 · 출결/수료/수당 입력 (회차는 조회만)",
    menu: ["dashboard", "participants", "rounds", "assign", "consulting", "attendance"],
    can: { editP: 1, attend: 1, consult: 0, memo: 1, editR: 0, complete: 1 }
  },
  counselor: {
    nm: "김상담",
    role: "상담사",
    mode: "field",
    scope: "rounds",
    rounds: ["22회차", "21회차"],
    phone: true,
    perm: "배정 회차 참여자 조회 · 사전/사후 상담 입력 가능",
    menu: ["dashboard", "participants", "consulting"],
    can: { editP: 0, attend: 0, consult: 1, memo: 1, editR: 0, complete: 0 }
  },
  facil: {
    nm: "이진행",
    role: "진행자",
    mode: "field",
    scope: "rounds",
    rounds: ["22회차"],
    phone: true,
    perm: "배정 회차 참여자 조회 · 출결 입력 가능 (연락처 확인 가능)",
    menu: ["dashboard", "participants", "attendance"],
    can: { editP: 0, attend: 1, consult: 0, memo: 1, editR: 0, complete: 0 }
  },
  teacher: {
    nm: "심영수",
    role: "강사",
    mode: "field",
    scope: "rounds",
    rounds: ["22회차", "21회차", "17회차"],
    phone: false,
    perm: "배정 회차 참여자 조회 · 메모 작성만 (연락처 비공개)",
    menu: ["dashboard", "participants"],
    can: { editP: 0, attend: 0, consult: 0, memo: 1, editR: 0, complete: 0 }
  }
};

interface RoleContextType {
  roleKey: RoleKey;
  roleConfig: RoleConfig;
  setRoleKey: (key: RoleKey) => void;
  maskPhone: (p: string) => string;
  pidLabel: (p: { nm: string; phone: string }) => string;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleKey, setRoleKey] = useState<RoleKey>('pl');
  const roleConfig = ROLES[roleKey];

  const maskPhone = (p: string): string => {
    if (!p) return '';
    // Format: 010-XXXX-YYYY -> 010-****-YYYY
    const digitsOnly = p.replace(/-/g, '');
    if (digitsOnly.length >= 10) {
      return digitsOnly.slice(0, 3) + "****" + digitsOnly.slice(-4);
    }
    return p.slice(0, 3) + "****" + p.slice(-4);
  };

  const pidLabel = (p: { nm: string; phone: string }): string => {
    return p.nm + "_" + (roleConfig.phone ? p.phone.replace(/-/g, '') : maskPhone(p.phone));
  };

  return (
    <RoleContext.Provider value={{ roleKey, roleConfig, setRoleKey, maskPhone, pidLabel }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
