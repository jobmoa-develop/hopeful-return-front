import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';
import type { ParticipantItem, RoundItem } from '../context/DataContext';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSave: () => void;
  children: ReactNode;
}

export function BaseModal({ isOpen, onClose, title, onSave, children }: BaseModalProps) {
  const { roleConfig } = useRole();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-h">
          <h3>{title}</h3>
          <span className="badge-role">{roleConfig.nm} · {roleConfig.role}</span>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-b">
          {children}
        </div>
        <div className="modal-f">
          <span className="modal-note">※ 디자인 시안 — 실제 저장은 상태 관리에 반영됩니다</span>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 1. Participant Form Modal (Register & Edit)
interface ParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone?: string; // Edit mode if phone exists
}

export function ParticipantModal({ isOpen, onClose, phone }: ParticipantModalProps) {
  const { participants, addParticipant, updateParticipant } = useData();
  
  const [nm, setNm] = useState('');
  const [inputPhone, setInputPhone] = useState('');
  const [birthYear, setBirthYear] = useState('1975');
  const [reg, setReg] = useState('양천');
  const [rd, setRd] = useState('22회차');
  const [inflow, setInflow] = useState('외부 홍보(당근·벼룩)');
  const [basicEducation, setBasicEducation] = useState<'확인필요' | 'Y' | 'N'>('Y');
  const [st, setSt] = useState<[string, string]>(['교육중', 'info']);
  const [counselorName, setCounselorName] = useState('김상담');
  const [applyDate, setApplyDate] = useState('');
  const [receptionDate, setReceptionDate] = useState('');
  const [smsSent, setSmsSent] = useState(true);

  const REGIONS = ["양천", "인천", "강북", "의정부", "천안"];
  const INFLOW_OPTS = ["소진공", "컨설턴트 연계", "사내 타사업부", "외부 홍보(당근·벼룩)"];
  
  const STATUS_OPTS: Record<string, string> = {
    "접수": "neutral",
    "선정": "info",
    "미선정": "neutral",
    "사전상담완료": "info",
    "교육중": "info",
    "수료": "ok",
    "미수료": "danger",
    "사후관리": "ok",
    "종료": "neutral",
    "취소": "neutral"
  };

  useEffect(() => {
    if (phone) {
      const p = participants.find(x => x.phone === phone);
      if (p) {
        setNm(p.nm);
        setInputPhone(p.phone);
        setBirthYear(p.birthYear);
        setReg(p.reg);
        setRd(p.rd);
        setInflow(p.inflow);
        setBasicEducation(p.basicEducation);
        setSt(p.st);
        setCounselorName(p.counselorName);
        setApplyDate(p.applyDate || '');
        setReceptionDate(p.receptionDate || '');
        setSmsSent(p.smsSent);
      }
    } else {
      // Reset for creation
      setNm('');
      setInputPhone('');
      setBirthYear('1975');
      setReg('양천');
      setRd('22회차');
      setInflow('외부 홍보(당근·벼룩)');
      setBasicEducation('Y');
      setSt(['교육중', 'info']);
      setCounselorName('김상담');
      setApplyDate('');
      setReceptionDate('');
      setSmsSent(true);
    }
  }, [phone, participants, isOpen]);

  const handleSave = () => {
    if (!nm || !inputPhone) {
      alert('이름과 연락처는 필수항목입니다.');
      return;
    }

    const payload: Partial<ParticipantItem> = {
      nm,
      phone: inputPhone,
      reg,
      rd,
      inflow,
      birthYear,
      basicEducation,
      st,
      counselorName,
      applyDate: applyDate || undefined,
      receptionDate: receptionDate || undefined,
      smsSent
    };

    if (phone) {
      updateParticipant(phone, payload);
    } else {
      addParticipant({
        ...payload,
        att: 0,
        su: ["—", "neutral"],
        guk: ["—", "neutral"],
        job: ["—", "neutral"],
        attendanceDays: ["none", "none", "none", "none", "none"],
        allowancePaid: false,
        contactAttempts: 0
      } as ParticipantItem);
    }
    onClose();
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const label = e.target.value;
    const color = STATUS_OPTS[label] || "neutral";
    setSt([label, color]);
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="참여자 등록 / 수정" onSave={handleSave}>
      <div className="form-grid">
        <div className="form-section">기본 정보</div>
        <div className="field">
          <label>이름<span className="req">*</span></label>
          <input value={nm} onChange={e => setNm(e.target.value)} placeholder="홍길동" />
        </div>
        <div className="field">
          <label>연락처<span className="req">*</span></label>
          <input value={inputPhone} onChange={e => setInputPhone(e.target.value)} placeholder="010-0000-0000" disabled={!!phone} />
        </div>
        <div className="field">
          <label>출생연도</label>
          <input value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="1975" />
        </div>
        <div className="field">
          <label>참여자ID (이름_연락처 · 자동)</label>
          <input value={nm && inputPhone ? `${nm}_${inputPhone.replace(/-/g, '')}` : ''} disabled style={{ background: '#f4f6f9', color: '#69768a' }} />
        </div>
        <div className="field">
          <label>지역<span className="req">*</span></label>
          <select value={reg} onChange={e => setReg(e.target.value)}>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field">
          <label>회차<span className="req">*</span></label>
          <select value={rd} onChange={e => setRd(e.target.value)}>
            {["22회차", "21회차", "18회차", "03회차", "24회차", "17회차"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        
        <div className="form-section">유입 · 자격</div>
        <div className="field">
          <label>유입 경로<span className="req">*</span></label>
          <select value={inflow} onChange={e => setInflow(e.target.value)}>
            {INFLOW_OPTS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div className="field">
          <label>기초교육 수료<span className="req">*</span></label>
          <select value={basicEducation} onChange={e => setBasicEducation(e.target.value as any)}>
            <option value="확인필요">확인필요</option>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </select>
        </div>
        <div className="field">
          <label>접수일</label>
          <input type="date" value={receptionDate} onChange={e => setReceptionDate(e.target.value)} />
        </div>
        <div className="field">
          <label>신청일</label>
          <input type="date" value={applyDate} onChange={e => setApplyDate(e.target.value)} />
        </div>
        <div className="field full">
          <label>안내문자 발송</label>
          <label className="chk">
            <input type="checkbox" checked={smsSent} onChange={e => setSmsSent(e.target.checked)} />
            선정 후 발송함
          </label>
        </div>

        <div className="form-section">진행 · 상담</div>
        <div className="field">
          <label>진행 상태<span className="req">*</span></label>
          <select value={st[0]} onChange={handleStatusChange}>
            {Object.keys(STATUS_OPTS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>담당 상담사</label>
          <input value={counselorName} onChange={e => setCounselorName(e.target.value)} placeholder="김상담" />
        </div>
      </div>
    </BaseModal>
  );
}

// 2. Attendance Modal
interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
}

export function AttendanceModal({ isOpen, onClose, phone }: AttendanceModalProps) {
  const { participants, updateParticipant } = useData();
  const [participant, setParticipant] = useState<ParticipantItem | null>(null);
  const [days, setDays] = useState<string[]>(['none', 'none', 'none', 'none', 'none']);
  const [details, setDetails] = useState('');
  const [teacherJournalWritten, setTeacherJournalWritten] = useState(false);

  useEffect(() => {
    const p = participants.find(x => x.phone === phone);
    if (p) {
      setParticipant(p);
      setDays([...p.attendanceDays]);
      setDetails(p.attendanceDetails || '');
    }
  }, [phone, participants, isOpen]);

  const handleSave = () => {
    if (participant) {
      updateParticipant(phone, {
        attendanceDays: days,
        attendanceDetails: details || undefined
      });
    }
    onClose();
  };

  const handleDayChange = (index: number, val: string) => {
    const nextDays = [...days];
    nextDays[index] = val;
    setDays(nextDays);
  };

  if (!participant) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="출결 입력 (일자별)" onSave={handleSave}>
      <p className="muted" style={{ fontSize: '12.5px', marginBottom: '14px' }}>
        {participant.nm} · {participant.reg} {participant.rd} · 외출·조퇴는 시간까지 기록
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[1, 2, 3, 4, 5].map((d, index) => (
          <div className="att-row" key={d}>
            <span className="dlab">{d}일차</span>
            <select value={days[index]} onChange={e => handleDayChange(index, e.target.value)}>
              <option value="none">—</option>
              <option value="출석">출석</option>
              <option value="지각">지각</option>
              <option value="외출">외출</option>
              <option value="조퇴">조퇴</option>
              <option value="결석">결석</option>
            </select>
            <input 
              placeholder="외출·조퇴 시간 (예: 14:10~15:00)" 
              value={index === 1 && days[index] === '외출' && details ? details.replace('2일차 외출 ', '') : ''} 
              onChange={e => {
                if (index === 1) {
                  setDetails(e.target.value ? `2일차 외출 ${e.target.value}` : '');
                }
              }}
            />
          </div>
        ))}
      </div>
      <div className="field full" style={{ marginTop: '14px' }}>
        <label>강사 일지 작성</label>
        <label className="chk">
          <input type="checkbox" checked={teacherJournalWritten} onChange={e => setTeacherJournalWritten(e.target.checked)} />
          작성 완료
        </label>
      </div>
    </BaseModal>
  );
}

// 3. Consulting Modal
interface ConsultingModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
}

export function ConsultingModal({ isOpen, onClose, phone }: ConsultingModalProps) {
  const { participants, updateParticipant } = useData();
  const [p, setP] = useState<ParticipantItem | null>(null);

  const [preCoun, setPreCoun] = useState('김상담');
  const [preDate, setPreDate] = useState('');
  const [preTime, setPreTime] = useState('');
  const [preDocWritten, setPreDocWritten] = useState(true);

  const [p1Coun, setP1Coun] = useState('김상담');
  const [p1Date, setP1Date] = useState('');
  const [p1Time, setP1Time] = useState('');

  const [p2Coun, setP2Coun] = useState('김상담');
  const [p2Date, setP2Date] = useState('');
  const [p2Time, setP2Time] = useState('');

  useEffect(() => {
    const found = participants.find(x => x.phone === phone);
    if (found) {
      setP(found);
      setPreCoun(found.counselorName || '김상담');
      setPreDate(found.preConsultDate || '');
      setPreTime(found.preConsultTime || '');
      setPreDocWritten(found.preConsultDocWritten ?? true);
      
      setP1Coun(found.post1Counselor || '김상담');
      setP1Date(found.post1ConsultDate || '');
      setP1Time(found.post1ConsultTime || '');
      
      setP2Coun(found.post2Counselor || '김상담');
      setP2Date(found.post2ConsultDate || '');
      setP2Time(found.post2ConsultTime || '');
    }
  }, [phone, participants, isOpen]);

  const handleSave = () => {
    if (p) {
      const isCompleted = preDate && preDocWritten;
      updateParticipant(phone, {
        counselorName: preCoun,
        preConsultDate: preDate || undefined,
        preConsultTime: preTime || undefined,
        preConsultDocWritten: preDocWritten,
        sang: isCompleted ? ["완료", "ok"] : ["미완료", "warn"],
        post1Counselor: p1Coun || undefined,
        post1ConsultDate: p1Date || undefined,
        post1ConsultTime: p1Time || undefined,
        post2Counselor: p2Coun || undefined,
        post2ConsultDate: p2Date || undefined,
        post2ConsultTime: p2Time || undefined,
      });
    }
    onClose();
  };

  if (!p) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="상담 일시 입력" onSave={handleSave}>
      <div className="form-grid">
        <div className="form-section">사전상담 (대면 1회)</div>
        <div className="field">
          <label>담당 상담사</label>
          <input value={preCoun} onChange={e => setPreCoun(e.target.value)} />
        </div>
        <div className="field">
          <label>사전상담 일자</label>
          <input type="date" value={preDate} onChange={e => setPreDate(e.target.value)} />
        </div>
        <div className="field">
          <label>사전상담 시간</label>
          <input type="time" value={preTime} onChange={e => setPreTime(e.target.value)} />
        </div>
        <div className="field full">
          <label>상담일지 작성</label>
          <label className="chk">
            <input type="checkbox" checked={preDocWritten} onChange={e => setPreDocWritten(e.target.checked)} />
            작성 완료
          </label>
        </div>

        <div className="form-section">사후상담 (대면 2회 · 상담사 변경 가능)</div>
        <div className="field">
          <label>사후 1차 상담사</label>
          <input value={p1Coun} onChange={e => setP1Coun(e.target.value)} />
        </div>
        <div className="field">
          <label>사후 1차 일자</label>
          <input type="date" value={p1Date} onChange={e => setP1Date(e.target.value)} />
        </div>
        <div className="field">
          <label>사후 1차 시간</label>
          <input type="time" value={p1Time} onChange={e => setP1Time(e.target.value)} />
        </div>
        <div style={{ gridColumn: 'span 1' }}></div>
        <div className="field">
          <label>사후 2차 상담사</label>
          <input value={p2Coun} onChange={e => setP2Coun(e.target.value)} />
        </div>
        <div className="field">
          <label>사후 2차 일자</label>
          <input type="date" value={p2Date} onChange={e => setP2Date(e.target.value)} />
        </div>
        <div className="field">
          <label>사후 2차 시간</label>
          <input type="time" value={p2Time} onChange={e => setP2Time(e.target.value)} />
        </div>
      </div>
    </BaseModal>
  );
}

// 4. Memo Modal
interface MemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoModal({ isOpen, onClose }: MemoModalProps) {
  const { roleConfig } = useRole();
  const { addMemo } = useData();
  const [content, setContent] = useState('');

  const handleSave = () => {
    if (!content) {
      alert('내용을 입력하세요.');
      return;
    }
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    addMemo({
      who: roleConfig.nm,
      role: roleConfig.role.split(' · ')[0],
      date: `${mm}-${dd}`,
      txt: content
    });
    setContent('');
    onClose();
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="메모(비고) 추가" onSave={handleSave}>
      <div className="form-grid">
        <div className="field full">
          <label>작성자 (로그인 역할 자동)</label>
          <input value={`${roleConfig.nm} (${roleConfig.role})`} disabled style={{ background: '#f4f6f9', color: '#69768a' }} />
        </div>
        <div className="field full">
          <label>내용<span className="req">*</span></label>
          <textarea 
            placeholder="특이사항을 입력하세요. (예: 다음 회차 이월 — 건강상 사유)" 
            value={content} 
            onChange={e => setContent(e.target.value)}
          />
        </div>
      </div>
      <p className="muted" style={{ fontSize: '11.5px', marginTop: '10px' }}>
        · 작성한 메모는 지역담당자·본부 전원이 공유하고 열람합니다.
      </p>
    </BaseModal>
  );
}

// 5. Round Modal
interface RoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  roundNo?: string;
}

export function RoundModal({ isOpen, onClose, roundNo }: RoundModalProps) {
  const { rounds, addRound, updateRound } = useData();

  const [reg, setReg] = useState('양천');
  const [no, setNo] = useState('');
  const [recruitStart, setRecruitStart] = useState('');
  const [recruitEnd, setRecruitEnd] = useState('');
  const [cap, setCap] = useState(15);
  const [minCap, setMinCap] = useState(12);
  const [location, setLocation] = useState('양천 교육장 A');
  const [st, setSt] = useState<[string, string]>(['개강확정', 'ok']);
  const [days, setDays] = useState<string[]>(['', '', '', '', '']);

  // Assign staff states (init mock strings for creation)
  const [gang, setGang] = useState('심영수');
  const [sang, setSang] = useState('김상담');
  const [jin, setJin] = useState('이진행');

  const REGIONS = ["양천", "인천", "강북", "의정부", "천안"];
  const R_STATUS_OPTS: Record<string, string> = {
    "예정": "neutral",
    "모집중": "info",
    "개강확정": "ok",
    "교육중": "info",
    "수료": "ok",
    "수당지급완료": "ok",
    "예산집행완료": "ok",
    "수행보고서 제출완료": "ok",
    "폐강": "danger"
  };

  useEffect(() => {
    if (roundNo) {
      const r = rounds.find(x => x.no === roundNo);
      if (r) {
        setReg(r.reg);
        setNo(r.no.replace('회차', ''));
        setCap(r.cap);
        setMinCap(r.minCap || 12);
        setLocation(r.location || '');
        setSt(r.st);
        setDays(r.days || ['', '', '', '', '']);
        setGang(r.gang);
        setSang(r.sang);
      }
    } else {
      setReg('양천');
      setNo('');
      setCap(15);
      setMinCap(12);
      setLocation('양천 교육장 A');
      setSt(['개강확정', 'ok']);
      setDays(['', '', '', '', '']);
      setGang('심영수');
      setSang('김상담');
      setJin('이진행');
    }
  }, [roundNo, rounds, isOpen]);

  const handleSave = () => {
    if (!no) {
      alert('회차 번호를 입력하세요.');
      return;
    }
    const finalNo = no.endsWith('회차') ? no : `${no}회차`;
    
    // Pick date range from days
    const validDays = days.filter(Boolean);
    const dateRange = validDays.length > 1 
      ? `${validDays[0].slice(5)} ~ ${validDays[validDays.length-1].slice(5)}` 
      : '06-23 ~ 06-27';

    const payload: Partial<RoundItem> = {
      reg,
      no: finalNo,
      cap,
      minCap,
      location,
      st,
      date: dateRange,
      days,
      gang,
      sang,
    };

    if (roundNo) {
      updateRound(roundNo, payload);
    } else {
      addRound({
        ...payload,
        cur: 0,
      } as RoundItem);
    }
    onClose();
  };

  return (
    BaseModal({
      isOpen,
      onClose,
      title: "회차 등록 / 수정",
      onSave: handleSave,
      children: (
        <div className="form-grid">
          <div className="form-section">기본 정보</div>
          <div className="field">
            <label>지역<span className="req">*</span></label>
            <select value={reg} onChange={e => setReg(e.target.value)}>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>회차 번호<span className="req">*</span></label>
            <input value={no} onChange={e => setNo(e.target.value)} placeholder="22" disabled={!!roundNo} />
          </div>
          <div className="field full">
            <label>회차명 (자동 생성)</label>
            <input value={no ? `${reg} ${no}회차` : ''} disabled style={{ background: '#f4f6f9', color: '#69768a' }} />
          </div>
          <div className="field">
            <label>모집 시작일</label>
            <input type="date" value={recruitStart} onChange={e => setRecruitStart(e.target.value)} />
          </div>
          <div className="field">
            <label>모집 마감일</label>
            <input type="date" value={recruitEnd} onChange={e => setRecruitEnd(e.target.value)} />
          </div>
          <div className="field">
            <label>정원<span className="req">*</span></label>
            <input type="number" value={cap} onChange={e => setCap(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>개강 최소인원<span className="req">*</span></label>
            <input type="number" value={minCap} onChange={e => setMinCap(Number(e.target.value))} />
          </div>
          <div className="field full">
            <label>교육장</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="양천 교육장 A" />
          </div>

          <div className="form-section">교육일 (1~5일차)</div>
          {days.map((d, index) => (
            <div className="field" key={index}>
              <label>{index + 1}일차</label>
              <input 
                type="date" 
                value={d} 
                onChange={e => {
                  const nextDays = [...days];
                  nextDays[index] = e.target.value;
                  setDays(nextDays);
                }} 
              />
            </div>
          ))}

          <div className="form-section">회차 상태</div>
          <div className="field full">
            <label>상태</label>
            <select value={st[0]} onChange={e => setSt([e.target.value, R_STATUS_OPTS[e.target.value] || 'neutral'])}>
              {Object.keys(R_STATUS_OPTS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {!roundNo && (
            <>
              <div className="form-section" style={{ marginTop: '16px' }}>배정 인력 (역할별 1~5명)</div>
              <div className="assign-rows">
                <div className="ar">
                  <span className="role-lab">강사</span>
                  <input value={gang} onChange={e => setGang(e.target.value)} />
                  <button className="btn-add-sm" onClick={e => e.preventDefault()}>+ 추가</button>
                </div>
                <div className="ar">
                  <span className="role-lab">상담사</span>
                  <input value={sang} onChange={e => setSang(e.target.value)} />
                  <button className="btn-add-sm" onClick={e => e.preventDefault()}>+ 추가</button>
                </div>
                <div className="ar">
                  <span className="role-lab">진행자</span>
                  <input value={jin} onChange={e => setJin(e.target.value)} />
                  <button className="btn-add-sm" onClick={e => e.preventDefault()}>+ 추가</button>
                </div>
              </div>
            </>
          )}
        </div>
      )
    })
  );
}

// 6. Completion & Allowance Modal
interface CompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
}

export function CompletionModal({ isOpen, onClose, phone }: CompletionModalProps) {
  const { participants, updateParticipant } = useData();
  const [p, setP] = useState<ParticipantItem | null>(null);

  const [suLabel, setSuLabel] = useState('진행중');
  const [incompleteReason, setIncompleteReason] = useState('—');
  const [completionDate, setCompletionDate] = useState('');
  const [allowancePaid, setAllowancePaid] = useState(false);
  const [allowanceDate, setAllowanceDate] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState(250000);
  const [allowanceRemark, setAllowanceRemark] = useState('');

  const FAIL_OPTS = ["—", "연락두절", "교육시간 미충족"];

  useEffect(() => {
    const found = participants.find(x => x.phone === phone);
    if (found) {
      setP(found);
      setSuLabel(found.su[0]);
      setIncompleteReason('—');
      setCompletionDate(found.allowanceDate || ''); // approximation
      setAllowancePaid(found.allowancePaid || false);
      setAllowanceDate(found.allowanceDate || '');
      setAllowanceAmount(found.allowanceAmount || 250000);
      setAllowanceRemark(found.allowanceRemark || '');
    }
  }, [phone, participants, isOpen]);

  const handleSave = () => {
    if (p) {
      const isFailed = incompleteReason !== '—';
      const finalSu: [string, string] = isFailed 
        ? ["미수료", "danger"] 
        : (suLabel === '진행중' ? ["수료", "ok"] : [suLabel, "ok"]);

      updateParticipant(phone, {
        su: finalSu,
        st: isFailed ? ["미수료", "danger"] : ["사후관리", "ok"],
        allowancePaid,
        allowanceDate: allowanceDate || undefined,
        allowanceAmount,
        allowanceRemark: allowanceRemark || undefined,
      });
    }
    onClose();
  };

  if (!p) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="수료 · 수당 처리" onSave={handleSave}>
      <div className="form-grid">
        <div className="field full">
          <label>수료 여부</label>
          <input value={`진행 상태로 확인 (현재: ${p.st[0]})`} disabled style={{ background: '#f4f6f9', color: '#69768a' }} />
        </div>
        <div className="field">
          <label>미수료 사유</label>
          <select value={incompleteReason} onChange={e => setIncompleteReason(e.target.value)}>
            {FAIL_OPTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="field">
          <label>수료 처리일</label>
          <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} />
        </div>

        <div className="form-section">수당 (행정 처리)</div>
        <div className="field">
          <label>수당 지급 여부</label>
          <label className="chk">
            <input type="checkbox" checked={allowancePaid} onChange={e => setAllowancePaid(e.target.checked)} />
            지급 완료
          </label>
        </div>
        <div className="field">
          <label>수당 지급일</label>
          <input type="date" value={allowanceDate} onChange={e => setAllowanceDate(e.target.value)} />
        </div>
        <div className="field">
          <label>수당 지급액 (원)</label>
          <input type="number" value={allowanceAmount} onChange={e => setAllowanceAmount(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>비고 (은행, 예산 구분 등)</label>
          <input value={allowanceRemark} onChange={e => setAllowanceRemark(e.target.value)} placeholder="국민은행 지급" />
        </div>
      </div>
      <p className="muted" style={{ fontSize: '11.5px', marginTop: '10px' }}>
        · 수료 판정은 출결 충족 후 수료 전환 처리됩니다. 계좌 번호 등 민감정보는 입력하지 않습니다.
      </p>
    </BaseModal>
  );
}
