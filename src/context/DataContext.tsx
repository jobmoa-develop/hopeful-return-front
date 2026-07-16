import { createContext, useContext, useState, useMemo } from 'react';
import type { ReactNode } from 'react';

export interface TaskItem {
  when: [string, string]; // [label, css_class] e.g. ["오늘", "today"]
  ttl: string;
  meta: string;
  who: [string, string];
}

export interface AlertItem {
  ic: 'danger' | 'warn';
  t: string;
  s: string;
  cnt: number;
}

export interface RegionItem {
  nm: string;
  cnt: number;
  lb: string;
  pills: [string, string][];
}

export interface ParticipantItem {
  nm: string;
  phone: string;
  reg: string;
  rd: string;
  st: [string, string]; // [label, class]
  sang: [string, string];
  att: number;
  su: [string, string];
  guk: [string, string];
  job: [string, string];
  birthYear: string;
  inflow: string;
  applyDate?: string;
  receptionDate?: string;
  basicEducation: '확인필요' | 'Y' | 'N';
  smsSent: boolean;
  counselorName: string;
  attendanceDays: string[]; // size 5, e.g. ["출석", "외출", "출석", "none", "none"]
  attendanceDetails?: string; // e.g. "2일차 외출 14:10~15:00"
  allowancePaid: boolean;
  allowanceDate?: string;
  allowanceAmount?: number;
  allowanceRemark?: string;
  preConsultDate?: string;
  preConsultTime?: string;
  preConsultDocWritten?: boolean;
  post1ConsultDate?: string;
  post1ConsultTime?: string;
  post1Counselor?: string;
  post2ConsultDate?: string;
  post2ConsultTime?: string;
  post2Counselor?: string;
  contactAttempts: number;
}

export interface RoundItem {
  no: string; // e.g. "22회차"
  reg: string;
  date: string; // e.g. "06-23 ~ 06-27"
  cur: number;
  cap: number;
  st: [string, string]; // [label, class]
  gang: string;
  sang: string;
  location?: string;
  recruitStart?: string;
  recruitEnd?: string;
  minCap?: number;
  days?: string[]; // 5 strings
}

export interface AssignmentItem {
  no: string;
  reg: string;
  date: string;
  gang: string[];
  sang: string[];
  jin: string[];
  warn: string;
}

export interface MemoItem {
  who: string;
  role: string;
  date: string;
  txt: string;
}

interface DataContextType {
  tasks: TaskItem[];
  alerts: AlertItem[];
  regions: RegionItem[];
  participants: ParticipantItem[];
  rounds: RoundItem[];
  assignments: AssignmentItem[];
  memos: MemoItem[];
  addParticipant: (p: ParticipantItem) => void;
  updateParticipant: (phone: string, updated: Partial<ParticipantItem>) => void;
  addRound: (r: RoundItem) => void;
  updateRound: (no: string, updated: Partial<RoundItem>) => void;
  addMemo: (m: MemoItem) => void;
  updateAssignment: (no: string, field: 'gang' | 'sang' | 'jin', name: string) => void;
  removeStaffFromAssignment: (no: string, field: 'gang' | 'sang' | 'jin', name: string) => void;
  checkAssignmentWarnings: (assigned: AssignmentItem[]) => AssignmentItem[];
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [tasks, _setTasks] = useState<TaskItem[]>([
    { when: ["오늘", "today"], ttl: "강북 03회차 — 소진공 등록", meta: "D-6주 루틴 · 인력 전원 지정 포함", who: ["한준희 주임", "행정허브"] },
    { when: ["D-1", "soon"], ttl: "양천 24회차 — 수행계획서 제출", meta: "마지노선 D-5주 · 제출 후 1~2일 내 소진공 등록", who: ["이빛나라 선임", "양천 담당"] },
    { when: ["D-2", "soon"], ttl: "인천 18회차 — 교육수당 지급", meta: "내부 목표 5영업일 · 12명 대상", who: ["장두일 팀장", "인천 담당"] },
    { when: ["D-2", "ok"], ttl: "양천 22회차 — 사전상담 완료", meta: "개강 D-2까지 · 3명 미완료", who: ["김상담", "상담사"] },
    { when: ["D-3", "ok"], ttl: "인천 17회차 — 사후상담 1차(대면)", meta: "수료자 대상 · 담당 상담사 배정", who: ["이상담", "상담사"] },
  ]);

  const [alerts, _setAlerts] = useState<AlertItem[]>([
    { ic: "danger", t: "사전상담 연락 두절", s: "5회 연락 실패 · 지역담당자 보고 필요", cnt: 2 },
    { ic: "danger", t: "수료 처리 기한 임박", s: "교육종료 후 처리 마감 D-1", cnt: 1 },
    { ic: "warn", t: "사후관리 2회 무응답", s: "종료 가능 검토 대상", cnt: 4 },
  ]);

  const [regions, _setRegions] = useState<RegionItem[]>([
    { nm: "양천", cnt: 3, lb: "진행 회차", pills: [["모집중", "info"], ["교육중", "ok"]] },
    { nm: "인천", cnt: 2, lb: "진행 회차", pills: [["교육중", "ok"]] },
    { nm: "강북", cnt: 1, lb: "진행 회차", pills: [["모집중", "warn"]] },
    { nm: "의정부", cnt: 1, lb: "준비 중", pills: [["확대예정", "neutral"]] },
    { nm: "천안", cnt: 0, lb: "준비 중", pills: [["확대예정", "neutral"]] },
  ]);

  const [participants, setParticipants] = useState<ParticipantItem[]>([
    {
      nm: "홍길동",
      phone: "01000003201",
      reg: "양천",
      rd: "22회차",
      st: ["교육 중", "info"],
      sang: ["완료", "ok"],
      att: 60,
      su: ["진행중", "neutral"],
      guk: ["대기", "neutral"],
      job: ["—", "neutral"],
      birthYear: "1975",
      inflow: "외부 홍보(당근·벼룩)",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "김상담",
      attendanceDays: ["출석", "외출", "출석", "none", "none"],
      attendanceDetails: "2일차 외출 14:10~15:00",
      allowancePaid: false,
      contactAttempts: 1,
      applyDate: "2026-05-15",
      receptionDate: "2026-05-12",
      preConsultDate: "2026-06-01",
      preConsultTime: "14:00",
      preConsultDocWritten: true,
    },
    {
      nm: "김순자",
      phone: "01000007722",
      reg: "양천",
      rd: "22회차",
      st: ["교육 중", "info"],
      sang: ["완료", "ok"],
      att: 80,
      su: ["진행중", "neutral"],
      guk: ["대기", "neutral"],
      job: ["—", "neutral"],
      birthYear: "1968",
      inflow: "소진공",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "김상담",
      attendanceDays: ["출석", "출석", "출석", "none", "none"],
      allowancePaid: false,
      contactAttempts: 1,
      applyDate: "2026-05-18",
      receptionDate: "2026-05-14",
    },
    {
      nm: "박철수",
      phone: "01000001188",
      reg: "인천",
      rd: "18회차",
      st: ["종료", "neutral"],
      sang: ["완료", "ok"],
      att: 100,
      su: ["수료", "ok"],
      guk: ["참여", "ok"],
      job: ["취업", "ok"],
      birthYear: "1980",
      inflow: "컨설턴트 연계",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "이상담",
      attendanceDays: ["출석", "출석", "출석", "출석", "출석"],
      allowancePaid: true,
      allowanceDate: "2026-06-25",
      allowanceAmount: 250000,
      contactAttempts: 1,
    },
    {
      nm: "이영희",
      phone: "01000004510",
      reg: "인천",
      rd: "18회차",
      st: ["사후관리", "ok"],
      sang: ["완료", "ok"],
      att: 100,
      su: ["수료", "ok"],
      guk: ["신청", "info"],
      job: ["구직중", "warn"],
      birthYear: "1985",
      inflow: "사내 타사업부",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "이상담",
      attendanceDays: ["출석", "출석", "출석", "출석", "출석"],
      allowancePaid: true,
      allowanceDate: "2026-06-25",
      allowanceAmount: 250000,
      contactAttempts: 1,
    },
    {
      nm: "최민호",
      phone: "01000009033",
      reg: "강북",
      rd: "03회차",
      st: ["선정", "info"],
      sang: ["미완료", "warn"],
      att: 0,
      su: ["—", "neutral"],
      guk: ["—", "neutral"],
      job: ["—", "neutral"],
      birthYear: "1979",
      inflow: "외부 홍보(당근·벼룩)",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "배정전",
      attendanceDays: ["none", "none", "none", "none", "none"],
      allowancePaid: false,
      contactAttempts: 0,
    },
    {
      nm: "정다은",
      phone: "01000002247",
      reg: "양천",
      rd: "21회차",
      st: ["미수료", "danger"],
      sang: ["완료", "ok"],
      att: 40,
      su: ["미수료", "danger"],
      guk: ["—", "neutral"],
      job: ["—", "neutral"],
      birthYear: "1992",
      inflow: "소진공",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "김상담",
      attendanceDays: ["출석", "결석", "결석", "출석", "결석"],
      allowancePaid: false,
      contactAttempts: 2,
    },
    {
      nm: "강현우",
      phone: "01000006619",
      reg: "인천",
      rd: "17회차",
      st: ["사후관리", "ok"],
      sang: ["완료", "ok"],
      att: 100,
      su: ["수료", "ok"],
      guk: ["참여", "ok"],
      job: ["구직중", "warn"],
      birthYear: "1973",
      inflow: "컨설턴트 연계",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "이상담",
      attendanceDays: ["출석", "출석", "출석", "출석", "출석"],
      allowancePaid: true,
      allowanceDate: "2026-06-18",
      allowanceAmount: 250000,
      contactAttempts: 1,
    },
    {
      nm: "윤서연",
      phone: "01000008855",
      reg: "양천",
      rd: "22회차",
      st: ["사전상담완료", "info"],
      sang: ["완료", "ok"],
      att: 0,
      su: ["—", "neutral"],
      guk: ["—", "neutral"],
      job: ["—", "neutral"],
      birthYear: "1988",
      inflow: "외부 홍보(당근·벼룩)",
      basicEducation: "Y",
      smsSent: true,
      counselorName: "김상담",
      attendanceDays: ["none", "none", "none", "none", "none"],
      allowancePaid: false,
      contactAttempts: 1,
    },
    {
      nm: "오지훈",
      phone: "01000003344",
      reg: "강북",
      rd: "03회차",
      st: ["접수", "neutral"],
      sang: ["—", "neutral"],
      att: 0,
      su: ["—", "neutral"],
      guk: ["—", "neutral"],
      job: ["—", "neutral"],
      birthYear: "1981",
      inflow: "소진공",
      basicEducation: "확인필요",
      smsSent: false,
      counselorName: "배정전",
      attendanceDays: ["none", "none", "none", "none", "none"],
      allowancePaid: false,
      contactAttempts: 0,
    },
    {
      nm: "한미경",
      phone: "01000005566",
      reg: "인천",
      rd: "18회차",
      st: ["미선정", "neutral"],
      sang: ["—", "neutral"],
      att: 0,
      su: ["—", "neutral"],
      guk: ["—", "neutral"],
      job: ["—", "neutral"],
      birthYear: "1970",
      inflow: "소진공",
      basicEducation: "확인필요",
      smsSent: false,
      counselorName: "배정전",
      attendanceDays: ["none", "none", "none", "none", "none"],
      allowancePaid: false,
      contactAttempts: 0,
    }
  ]);

  const [rounds, setRounds] = useState<RoundItem[]>([
    { no: "24회차", reg: "양천", date: "07-14 ~ 07-18", cur: 8, cap: 15, st: ["모집중", "info"], gang: "심영수", sang: "배정 전", location: "양천 교육장 B" },
    { no: "03회차", reg: "강북", date: "07-21 ~ 07-25", cur: 6, cap: 15, st: ["모집중", "warn"], gang: "미정", sang: "배정 전", location: "강북 교육실 2" },
    { no: "25회차", reg: "천안", date: "07-28 ~ 08-01", cur: 2, cap: 15, st: ["예정", "neutral"], gang: "미정", sang: "배정 전", location: "천안 회의관 A" },
    { no: "22회차", reg: "양천", date: "06-23 ~ 06-27", cur: 14, cap: 15, st: ["개강확정", "ok"], gang: "심영수", sang: "김상담", location: "양천 교육장 A" },
    { no: "18회차", reg: "인천", date: "06-16 ~ 06-20", cur: 13, cap: 15, st: ["교육중", "info"], gang: "박외부", sang: "이상담", location: "인천 지부 강당" },
    { no: "17회차", reg: "인천", date: "06-09 ~ 06-13", cur: 14, cap: 15, st: ["예산집행완료", "ok"], gang: "심영수", sang: "이상담", location: "인천 지부 강당" },
    { no: "21회차", reg: "양천", date: "06-02 ~ 06-06", cur: 12, cap: 15, st: ["수당지급완료", "ok"], gang: "심영수", sang: "김상담", location: "양천 교육장 A" },
    { no: "20회차", reg: "양천", date: "05-19 ~ 05-23", cur: 9, cap: 15, st: ["폐강", "danger"], gang: "—", sang: "—", location: "양천 교육장 A" },
  ]);

  const [assignments, setAssignments] = useState<AssignmentItem[]>([
    { no: "22회차", reg: "양천", date: "06-23 ~ 06-27", gang: ["심영수", "박외부"], sang: ["김상담"], jin: ["이진행"], warn: "" },
    { no: "18회차", reg: "인천", date: "06-16 ~ 06-20", gang: ["박외부"], sang: ["이상담"], jin: ["최진행"], warn: "박외부 — 22회차와 날짜 근접 확인" },
    { no: "24회차", reg: "양천", date: "07-14 ~ 07-18", gang: ["심영수"], sang: [], jin: [], warn: "" },
    { no: "03회차", reg: "강북", date: "07-21 ~ 07-25", gang: [], sang: [], jin: [], warn: "" },
  ]);

  const [memos, setMemos] = useState<MemoItem[]>([
    { who: "한준희 주임", role: "행정", date: "06-02", txt: "외부 유입(당근) — 기초교육 수료 확인 완료. 심화 진행 가능." },
    { who: "김상담", role: "상담사", date: "06-01", txt: "사전상담 시 재취업 의지 높음. 사무·회계 직무 희망, 컴활 자격 보유." },
    { who: "심영수", role: "강사", date: "06-25", txt: "2일차 가정 사정으로 외출(14:10~15:00). 외출 시간 기록함, 수료 기준 영향 없음." },
  ]);

  const addParticipant = (p: ParticipantItem) => {
    setParticipants((prev) => [p, ...prev]);
  };

  const updateParticipant = (phone: string, updated: Partial<ParticipantItem>) => {
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.phone === phone) {
          // If state is being changed, let's recalculate helper labels
          const nextState = { ...p, ...updated };
          if (updated.attendanceDays) {
            const days = updated.attendanceDays;
            const attendedCount = days.filter(d => d === '출석').length;
            const otherAttended = days.filter(d => ['지각', '조퇴', '외출'].includes(d)).length;
            const progressCount = days.filter(d => d !== 'none').length;
            const attPercent = progressCount > 0 
              ? Math.round(((attendedCount + otherAttended * 0.8) / progressCount) * 100) 
              : 0;
            nextState.att = attPercent;
          }
          return nextState;
        }
        return p;
      })
    );
  };

  const addRound = (r: RoundItem) => {
    setRounds((prev) => [r, ...prev]);
    // Also build a blank assignment card for the new round
    setAssignments((prev) => {
      const existing = prev.find(a => a.no === r.no && a.reg === r.reg);
      if (existing) return prev;
      const next = [...prev, { no: r.no, reg: r.reg, date: r.date, gang: [], sang: [], jin: [], warn: "" }];
      return checkAssignmentWarnings(next);
    });
  };

  const updateRound = (no: string, updated: Partial<RoundItem>) => {
    setRounds((prev) =>
      prev.map((r) => (r.no === no ? { ...r, ...updated } : r))
    );
  };

  const addMemo = (m: MemoItem) => {
    setMemos((prev) => [m, ...prev]);
  };

  const checkAssignmentWarnings = (list: AssignmentItem[]): AssignmentItem[] => {
    return list.map((a) => {
      const warnMsg: string[] = [];
      list.forEach((other) => {
        if (other.no === a.no) return;
        // Basic check if date is overlapping or adjacent (mock date strings like "06-23 ~ 06-27" and "06-16 ~ 06-20")
        // Check for common elements in staff arrays
        const sharedGang = a.gang.filter(x => other.gang.includes(x));
        const sharedSang = a.sang.filter(x => other.sang.includes(x));
        const sharedJin = a.jin.filter(x => other.jin.includes(x));
        const allShared = [...sharedGang, ...sharedSang, ...sharedJin];
        
        if (allShared.length > 0) {
          warnMsg.push(`${allShared.join(', ')} — ${other.no}와 날짜 근접/동시 배정 확인`);
        }
      });
      return {
        ...a,
        warn: warnMsg.join(' | ')
      };
    });
  };

  const updateAssignment = (no: string, field: 'gang' | 'sang' | 'jin', name: string) => {
    setAssignments((prev) => {
      const next = prev.map((a) => {
        if (a.no === no) {
          const list = [...a[field]];
          if (!list.includes(name)) {
            list.push(name);
          }
          return { ...a, [field]: list };
        }
        return a;
      });
      return checkAssignmentWarnings(next);
    });
  };

  const removeStaffFromAssignment = (no: string, field: 'gang' | 'sang' | 'jin', name: string) => {
    setAssignments((prev) => {
      const next = prev.map((a) => {
        if (a.no === no) {
          return { ...a, [field]: a[field].filter(n => n !== name) };
        }
        return a;
      });
      return checkAssignmentWarnings(next);
    });
  };

  return (
    <DataContext.Provider
      value={{
        tasks,
        alerts,
        regions,
        participants,
        rounds,
        assignments,
        memos,
        addParticipant,
        updateParticipant,
        addRound,
        updateRound,
        addMemo,
        updateAssignment,
        removeStaffFromAssignment,
        checkAssignmentWarnings,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
