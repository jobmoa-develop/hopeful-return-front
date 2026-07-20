import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRole } from '../context/RoleContext';
import { getRegions } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { getCourses } from '../api/courses';
import type { CourseSummary } from '../api/courses';
import { getUserRoles } from '../api/userRoles';
import { createParticipant } from '../api/participants';
import {
  COUNSELING_TYPE_LABELS,
  CP_STATUS_LABELS,
  assignSlotCounselor,
  bulkCompleteCourseParticipants,
  changeCounselors,
  changeCourseParticipantStatus,
  completeCourseParticipant,
  getAssignableCounselors,
  recordCounselingSession,
} from '../api/courseParticipants';
import type {
  AssignableCounselor,
  CounselingType,
  CounselorSummary,
  CourseParticipantStatus,
} from '../api/courseParticipants';
import { createParticipantMemo } from '../api/participantMemos';
import { apiErrorMessage } from '../api/apiError';
import { getParticipants } from '../api/participants';
import type { ParticipantListItem } from '../api/participants';
import { enrollParticipant } from '../api/courseParticipants';
import type { RiskStatus } from '../api/attendances';

const COUNSELING_TYPES: CounselingType[] = ['PRE_SESSION', 'POST_SESSION_1', 'POST_SESSION_2'];
const INFLOW_OPTS = ['소진공', '워크넷', '컨설턴트 연계', '사내 타사업부', '외부 홍보(당근·벼룩)'];

// 상담 단계 체인의 "직전 슬롯" — 다음 상담사 지정 권한 판정용(PRE는 직전 없음 → 상담사 지정 불가)
const PREDECESSOR_SLOT: Partial<Record<CounselingType, CounselingType>> = {
  POST_SESSION_1: 'PRE_SESSION',
  POST_SESSION_2: 'POST_SESSION_1',
};

// 이 사용자가 해당 슬롯의 세션(일시·메모)을 기록할 수 있는가 — COUNSELOR는 본인 배정 슬롯만
function canRecordSlot(
  counselors: CounselorSummary[],
  type: CounselingType,
  counselorOnly: boolean,
  currentUserId?: number,
): boolean {
  const slot = counselors.find((c) => c.status === type);
  if (!slot) return false;
  return !counselorOnly || slot.counselorId === currentUserId;
}

// 이 사용자가 해당 슬롯의 상담사를 지정할 수 있는가 — COUNSELOR는 직전 슬롯 배정자만(체인)
function canAssignSlot(
  counselors: CounselorSummary[],
  type: CounselingType,
  counselorOnly: boolean,
  currentUserId?: number,
): boolean {
  if (!counselorOnly) return true;
  const predecessor = PREDECESSOR_SLOT[type];
  if (!predecessor) return false;
  return counselors.find((c) => c.status === predecessor)?.counselorId === currentUserId;
}

type CounselorOption = { userId: number; userName: string };

// 상담사 역할 사용자 목록 (userId 기준 중복 제거)
function useCounselorOptions(isOpen: boolean): CounselorOption[] {
  const [options, setOptions] = useState<CounselorOption[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    getUserRoles()
      .then((res) => {
        const seen = new Set<number>();
        const counselors: CounselorOption[] = [];
        for (const item of res.data) {
          if (item.roleName === 'COUNSELOR' && !seen.has(item.userId)) {
            seen.add(item.userId);
            counselors.push({ userId: item.userId, userName: item.userName });
          }
        }
        setOptions(counselors);
      })
      .catch(() => setOptions([]));
  }, [isOpen]);

  return options;
}

interface ApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSave: () => void;
  saving: boolean;
  note?: string;
  children: ReactNode;
}

// API 저장용 모달 셸 — 기존 BaseModal과 동일한 마크업, 저장 중 상태·문구만 다름
function ApiModal({ isOpen, onClose, title, onSave, saving, note, children }: ApiModalProps) {
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
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-h">
          <h3>{title}</h3>
          <span className="badge-role">
            {roleConfig.nm} · {roleConfig.role}
          </span>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-b">{children}</div>
        <div className="modal-f">
          <span className="modal-note">{note ?? '※ 저장 시 서버에 반영됩니다'}</span>
          <button className="btn" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// datetime-local 값("YYYY-MM-DDTHH:mm") → BE LocalDateTime("YYYY-MM-DDTHH:mm:ss")
function toLocalDateTime(value: string): string | null {
  if (!value) return null;
  return value.length === 16 ? `${value}:00` : value;
}

// BE LocalDateTime → datetime-local 입력값
function toInputDateTime(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 16);
}

// 1. 참여자 등록 모달 (통합 등록 — 지역·회차 선택 시 수강까지 한 번에)
interface ParticipantRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ParticipantRegisterModal({
  isOpen,
  onClose,
  onSaved,
}: ParticipantRegisterModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [regionId, setRegionId] = useState<number | ''>('');
  const [courseId, setCourseId] = useState<number | ''>('');
  const [inflowType, setInflowType] = useState('');
  const [basicEducation, setBasicEducation] = useState('확인필요');
  const [applyDate, setApplyDate] = useState('');
  const [receptionDate, setReceptionDate] = useState('');
  const [slots, setSlots] = useState<Record<CounselingType, number | ''>>({
    PRE_SESSION: '',
    POST_SESSION_1: '',
    POST_SESSION_2: '',
  });
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const counselorOptions = useCounselorOptions(isOpen);

  const hasEnrollment = courseId !== '';

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setPhone('');
    setBirthYear('');
    setRegionId('');
    setCourseId('');
    setInflowType('');
    setBasicEducation('확인필요');
    setApplyDate('');
    setReceptionDate('');
    setSlots({ PRE_SESSION: '', POST_SESSION_1: '', POST_SESSION_2: '' });
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, [isOpen]);

  useEffect(() => {
    setCourseId('');
    if (regionId === '') {
      setCourses([]);
      return;
    }
    getCourses({ regionId: Number(regionId), size: 100 })
      .then((res) => setCourses(res.data.data?.content ?? []))
      .catch(() => setCourses([]));
  }, [regionId]);

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      alert('이름과 연락처는 필수항목입니다.');
      return;
    }
    setSaving(true);
    try {
      const counselors = COUNSELING_TYPES.filter((type) => slots[type] !== '').map((type) => ({
        counselorId: Number(slots[type]),
        status: type,
      }));
      await createParticipant({
        name: name.trim(),
        phone: phone.trim(),
        birthYear: birthYear ? Number(birthYear) : undefined,
        enrollment: hasEnrollment
          ? {
              courseId: Number(courseId),
              inflowType: inflowType || undefined,
              applyDate: applyDate || undefined,
              receptionDate: receptionDate || undefined,
              basicEducation,
              counselors: counselors.length > 0 ? counselors : undefined,
            }
          : undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '참여자 등록에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="참여자 등록"
      onSave={handleSave}
      saving={saving}
      note="※ 지역·회차 미선택 시 참여자만 등록됩니다"
    >
      <div className="form-grid">
        <div className="form-section">진행 상태</div>
        <div className="field full">
          <label>진행 상태 (등록 시 고정 · 등록 후 변경 가능)</label>
          <input
            value={
              hasEnrollment
                ? '선정 (CONFIRMED)'
                : '수강 등록 없음 — 지역·회차 선택 시 선정으로 등록'
            }
            disabled
            style={{ background: '#f4f6f9', color: '#69768a' }}
          />
        </div>

        <div className="form-section">기본 정보</div>
        <div className="field">
          <label>
            이름<span className="req">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
        </div>
        <div className="field">
          <label>
            연락처<span className="req">*</span>
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
          />
        </div>
        <div className="field">
          <label>출생연도</label>
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ''))}
            placeholder="1975"
          />
        </div>
        <div className="field">
          <label>참여자ID (등록 시 자동 생성)</label>
          <input
            value=""
            placeholder="{이니셜}_{생년}_{전화뒤4}"
            disabled
            style={{ background: '#f4f6f9', color: '#69768a' }}
          />
        </div>
        <div className="field">
          <label>지역</label>
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">선택 안 함</option>
            {regions.map((r) => (
              <option key={r.regionId} value={r.regionId}>
                {r.regionName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>회차</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={regionId === ''}
          >
            <option value="">선택 안 함</option>
            {courses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.localCourseNumber != null ? `${c.localCourseNumber}회차` : ''}{' '}
                {c.courseName ?? ''}
              </option>
            ))}
          </select>
        </div>

        {hasEnrollment && (
          <>
            <div className="form-section">유입 · 자격</div>
            <div className="field">
              <label>유입 경로</label>
              <select value={inflowType} onChange={(e) => setInflowType(e.target.value)}>
                <option value="">선택 안 함</option>
                {INFLOW_OPTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>기초교육 수료</label>
              <select value={basicEducation} onChange={(e) => setBasicEducation(e.target.value)}>
                <option value="확인필요">확인필요</option>
                <option value="Y">Y</option>
                <option value="N">N</option>
              </select>
            </div>
            <div className="field">
              <label>접수일</label>
              <input
                type="date"
                value={receptionDate}
                onChange={(e) => setReceptionDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>신청일</label>
              <input type="date" value={applyDate} onChange={(e) => setApplyDate(e.target.value)} />
            </div>

            <div className="form-section">상담사 배정 (슬롯당 1명)</div>
            {COUNSELING_TYPES.map((type) => (
              <div className="field" key={type}>
                <label>{COUNSELING_TYPE_LABELS[type]}</label>
                <select
                  value={slots[type]}
                  onChange={(e) =>
                    setSlots((prev) => ({
                      ...prev,
                      [type]: e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">배정 안 함</option>
                  {counselorOptions.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.userName}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </>
        )}
      </div>
    </ApiModal>
  );
}

// 2. 상담사 3슬롯 편집 모달 (전체 교체)
interface CounselorEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseParticipantId: number;
  counselors: CounselorSummary[];
  onSaved: () => void;
}

export function CounselorEditModal({
  isOpen,
  onClose,
  courseParticipantId,
  counselors,
  onSaved,
}: CounselorEditModalProps) {
  const [slots, setSlots] = useState<Record<CounselingType, number | ''>>({
    PRE_SESSION: '',
    POST_SESSION_1: '',
    POST_SESSION_2: '',
  });
  const [saving, setSaving] = useState(false);
  const counselorOptions = useCounselorOptions(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<CounselingType, number | ''> = {
      PRE_SESSION: '',
      POST_SESSION_1: '',
      POST_SESSION_2: '',
    };
    for (const c of counselors) {
      if (COUNSELING_TYPES.includes(c.status as CounselingType)) {
        next[c.status as CounselingType] = c.counselorId;
      }
    }
    setSlots(next);
  }, [isOpen, counselors]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = COUNSELING_TYPES.filter((type) => slots[type] !== '').map((type) => ({
        counselorId: Number(slots[type]),
        status: type,
      }));
      await changeCounselors(courseParticipantId, payload);
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '상담사 변경에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="상담사 배정 변경"
      onSave={handleSave}
      saving={saving}
      note="※ 저장 시 3개 슬롯이 선택한 값으로 전체 교체됩니다"
    >
      <div className="form-grid">
        {COUNSELING_TYPES.map((type) => (
          <div className="field full" key={type}>
            <label>{COUNSELING_TYPE_LABELS[type]}</label>
            <select
              value={slots[type]}
              onChange={(e) =>
                setSlots((prev) => ({
                  ...prev,
                  [type]: e.target.value === '' ? '' : Number(e.target.value),
                }))
              }
            >
              <option value="">배정 안 함</option>
              {counselorOptions.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.userName}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: '11.5px', marginTop: '10px' }}>
        · 같은 상담사가 여러 슬롯을 맡을 수 있습니다. 슬롯을 "배정 안 함"으로 저장하면 해당
        배정(세션 기록 포함)이 제거됩니다.
      </p>
    </ApiModal>
  );
}

// 3. 상담 세션 기록 모달 — 종료 일시 입력 시 해당 상담 완료 처리
interface CounselingSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseParticipantId: number;
  counselors: CounselorSummary[];
  defaultType?: CounselingType;
  currentUserId?: number;
  counselorOnly?: boolean;
  onSaved: () => void;
}

export function CounselingSessionModal({
  isOpen,
  onClose,
  courseParticipantId,
  counselors,
  defaultType,
  currentUserId,
  counselorOnly = false,
  onSaved,
}: CounselingSessionModalProps) {
  const assignedTypes = useMemo(
    () => COUNSELING_TYPES.filter((type) => counselors.some((c) => c.status === type)),
    [counselors],
  );
  // COUNSELOR는 본인 배정 슬롯만 기록 가능(관리 롤은 배정된 전 슬롯).
  const editableTypes = useMemo(
    () =>
      assignedTypes.filter((type) => canRecordSlot(counselors, type, counselorOnly, currentUserId)),
    [assignedTypes, counselors, counselorOnly, currentUserId],
  );
  const [counselingType, setCounselingType] = useState<CounselingType>('PRE_SESSION');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const preferred =
      defaultType && editableTypes.includes(defaultType) ? defaultType : editableTypes[0];
    setCounselingType(preferred ?? defaultType ?? assignedTypes[0] ?? 'PRE_SESSION');
  }, [isOpen, defaultType, editableTypes, assignedTypes]);

  useEffect(() => {
    if (!isOpen) return;
    const current = counselors.find((c) => c.status === counselingType);
    setStartedAt(toInputDateTime(current?.startedAt ?? null));
    setEndedAt(toInputDateTime(current?.endedAt ?? null));
    setMemo(current?.memo ?? '');
  }, [isOpen, counselingType, counselors]);

  const currentCounselor = counselors.find((c) => c.status === counselingType);
  // 현재 선택 슬롯을 이 사용자가 편집할 수 있는가(권한 게이트)
  const canEditCurrent = canRecordSlot(counselors, counselingType, counselorOnly, currentUserId);

  const handleSave = async () => {
    if (!currentCounselor) {
      alert('해당 상담 구분에 배정된 상담사가 없습니다. 상담사 배정을 먼저 진행하세요.');
      return;
    }
    if (!canEditCurrent) {
      alert('본인에게 배정된 상담만 기록할 수 있습니다.');
      return;
    }
    setSaving(true);
    try {
      await recordCounselingSession(courseParticipantId, counselingType, {
        startedAt: toLocalDateTime(startedAt),
        endedAt: toLocalDateTime(endedAt),
        memo: memo || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '상담 기록 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="상담 일시 · 메모 기록"
      onSave={handleSave}
      saving={saving}
      note="※ 종료 일시를 입력하면 해당 상담은 완료 처리됩니다"
    >
      <div className="form-grid">
        <div className="field full">
          <label>상담 구분</label>
          <select
            value={counselingType}
            onChange={(e) => setCounselingType(e.target.value as CounselingType)}
          >
            {COUNSELING_TYPES.map((type) => {
              const isEditable = editableTypes.includes(type);
              const isAssigned = assignedTypes.includes(type);
              return (
                <option key={type} value={type} disabled={!isEditable}>
                  {COUNSELING_TYPE_LABELS[type]}
                  {!isAssigned ? ' (배정 없음)' : !isEditable ? ' (권한 없음)' : ''}
                </option>
              );
            })}
          </select>
        </div>
        {!canEditCurrent && (
          <div className="field full" style={{ color: 'var(--danger)', fontSize: '12.5px' }}>
            본인에게 배정된 상담만 기록할 수 있습니다.
          </div>
        )}
        <div className="field full">
          <label>담당 상담사</label>
          <input
            value={currentCounselor?.counselorName ?? '배정 없음'}
            disabled
            style={{ background: '#f4f6f9', color: '#69768a' }}
          />
        </div>
        <div className="field">
          <label>상담 시작 일시</label>
          <input
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            disabled={!canEditCurrent}
          />
        </div>
        <div className="field">
          <label>상담 종료 일시</label>
          <input
            type="datetime-local"
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
            disabled={!canEditCurrent}
          />
        </div>
        <div className="field full">
          <label>상담 메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="상담 내용을 입력하세요."
            disabled={!canEditCurrent}
          />
        </div>
      </div>
    </ApiModal>
  );
}

// 4. 참여자 메모 등록 모달 (course_participant 단위)
interface ParticipantMemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseParticipantId: number;
  onSaved: () => void;
}

export function ParticipantMemoModal({
  isOpen,
  onClose,
  courseParticipantId,
  onSaved,
}: ParticipantMemoModalProps) {
  const { roleConfig } = useRole();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setContent('');
  }, [isOpen]);

  const handleSave = async () => {
    if (!content.trim()) {
      alert('내용을 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      await createParticipantMemo(courseParticipantId, content.trim());
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '메모 등록에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="메모(비고) 추가"
      onSave={handleSave}
      saving={saving}
    >
      <div className="form-grid">
        <div className="field full">
          <label>작성자 (로그인 계정 자동)</label>
          <input
            value={`${roleConfig.nm} (${roleConfig.role})`}
            disabled
            style={{ background: '#f4f6f9', color: '#69768a' }}
          />
        </div>
        <div className="field full">
          <label>
            내용<span className="req">*</span>
          </label>
          <textarea
            placeholder="특이사항을 입력하세요."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
      </div>
    </ApiModal>
  );
}

interface ParticipantEnrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: number;
  onSaved: () => void;
}

export function ParticipantEnrollModal({
  isOpen,
  onClose,
  courseId,
  onSaved,
}: ParticipantEnrollModalProps) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<ParticipantListItem[]>([]);
  const [selected, setSelected] = useState<ParticipantListItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setKeyword('');
    setResults([]);
    setSelected(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      getParticipants({ name: keyword.trim() || undefined, page: 0, size: 30 })
        .then((res) => setResults(res.data.data?.content ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [isOpen, keyword]);

  const handleSave = async () => {
    if (!selected) {
      alert('배정할 참여자를 선택하세요.');
      return;
    }
    setSaving(true);
    try {
      await enrollParticipant({ courseId, participantId: selected.participantId });
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '참여자 배정에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="강좌 참여자 배정"
      onSave={handleSave}
      saving={saving}
      note="※ 기존에 등록된 참여자를 검색해서 이 강좌에 배정합니다"
    >
      <div className="form-grid">
        <div className="field full">
          <label>참여자 이름 검색</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름 입력"
          />
        </div>
        <div className="field full">
          {searching && <span className="muted">검색 중...</span>}
          {!searching && keyword.trim() && results.length === 0 && (
            <span className="muted">검색 결과가 없습니다.</span>
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {results.map((p) => (
              <div
                key={p.participantId}
                onClick={() => setSelected(p)}
                style={{
                  padding: '8px 10px',
                  border: `1px solid ${selected?.participantId === p.participantId ? 'var(--primary, #2563eb)' : 'var(--line)'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  background:
                    selected?.participantId === p.participantId ? '#eef4ff' : 'transparent',
                }}
              >
                <b>{p.name}</b>
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  {p.matchKey ?? p.phone}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ApiModal>
  );
}

// 한국시간(KST) 기준 오늘 날짜("YYYY-MM-DD")
function kstToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

// 5. 일괄 수료/미수료 처리 모달 (참여자 관리 메인)
interface BulkCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseParticipantIds: number[];
  status: 'COMPLETED' | 'INCOMPLETE';
  onSaved: () => void;
}

export function BulkCompletionModal({
  isOpen,
  onClose,
  courseParticipantIds,
  status,
  onSaved,
}: BulkCompletionModalProps) {
  const [completionDate, setCompletionDate] = useState('');
  const [incompleteReason, setIncompleteReason] = useState('');
  const [saving, setSaving] = useState(false);
  const isComplete = status === 'COMPLETED';

  useEffect(() => {
    if (!isOpen) return;
    setCompletionDate(kstToday());
    setIncompleteReason('');
  }, [isOpen]);

  const handleSave = async () => {
    if (isComplete && !completionDate) {
      alert('수료일을 입력하세요.');
      return;
    }
    if (!isComplete && !incompleteReason.trim()) {
      alert('미수료 사유를 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      await bulkCompleteCourseParticipants({
        courseParticipantIds,
        status,
        completionDate: isComplete ? completionDate : undefined,
        incompleteReason: isComplete ? undefined : incompleteReason.trim(),
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '일괄 처리에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title={isComplete ? '일괄 수료 처리' : '일괄 미수료 처리'}
      onSave={handleSave}
      saving={saving}
      note={`※ 선택한 ${courseParticipantIds.length}건에 동일하게 반영됩니다`}
    >
      <div className="form-grid">
        {isComplete && (
          <div className="field full" style={{ color: 'var(--danger)', fontSize: '12.5px' }}>
            수료기준 미달시 진짜 수료로 변경하시겠습니까?
          </div>
        )}
        <div className="field full">
          <label>대상 건수</label>
          <input
            value={`${courseParticipantIds.length}건`}
            disabled
            style={{ background: '#f4f6f9', color: '#69768a' }}
          />
        </div>
        {isComplete ? (
          <div className="field full">
            <label>
              수료일<span className="req">*</span>
            </label>
            <input
              type="date"
              value={completionDate}
              onChange={(e) => setCompletionDate(e.target.value)}
            />
          </div>
        ) : (
          <div className="field full">
            <label>
              미수료 사유<span className="req">*</span>
            </label>
            <input
              value={incompleteReason}
              onChange={(e) => setIncompleteReason(e.target.value)}
              placeholder="예: 출석 기준 미달"
            />
          </div>
        )}
      </div>
    </ApiModal>
  );
}

// 6. 진행상태 변경 모달 (참여자 상세) — 수료 시 수료일, 미수료 시 사유 입력
interface StatusChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseParticipantId: number;
  currentStatus: CourseParticipantStatus | string;
  riskStatus?: RiskStatus;
  attendanceRate?: number;
  onSaved: () => void;
}

const STATUS_OPTIONS: CourseParticipantStatus[] = [
  'APPLIED',
  'CONFIRMED',
  'COMPLETED',
  'INCOMPLETE',
  'CANCELED',
];

export function StatusChangeModal({
  isOpen,
  onClose,
  courseParticipantId,
  currentStatus,
  riskStatus,
  attendanceRate,
  onSaved,
}: StatusChangeModalProps) {
  const [nextStatus, setNextStatus] = useState<CourseParticipantStatus>('CONFIRMED');
  const [completionDate, setCompletionDate] = useState('');
  const [incompleteReason, setIncompleteReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNextStatus((currentStatus as CourseParticipantStatus) ?? 'CONFIRMED');
    setCompletionDate(kstToday());
    setIncompleteReason('');
  }, [isOpen, currentStatus]);

  // 수료 기준 미달 경고: 출결 위험도가 PASS(기준 충족)가 아닐 때만 노출.
  // riskStatus 미조회/UNKNOWN이면 정보 부재이므로 안전하게 경고 유지.
  const showCompletionWarning = nextStatus === 'COMPLETED' && riskStatus !== 'PASS';

  const handleSave = async () => {
    if (nextStatus === (currentStatus as CourseParticipantStatus)) {
      onClose();
      return;
    }
    if (nextStatus === 'COMPLETED' && !completionDate) {
      alert('수료일을 입력하세요.');
      return;
    }
    if (nextStatus === 'INCOMPLETE' && !incompleteReason.trim()) {
      alert('미수료 사유를 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      if (nextStatus === 'COMPLETED' || nextStatus === 'INCOMPLETE') {
        await completeCourseParticipant(courseParticipantId, {
          status: nextStatus,
          completionDate: nextStatus === 'COMPLETED' ? completionDate : undefined,
          incompleteReason: nextStatus === 'INCOMPLETE' ? incompleteReason.trim() : undefined,
        });
      } else {
        await changeCourseParticipantStatus(courseParticipantId, nextStatus);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '진행상태 변경에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="진행상태 변경"
      onSave={handleSave}
      saving={saving}
    >
      <div className="form-grid">
        <div className="field full">
          <label>진행상태</label>
          <select
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as CourseParticipantStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        {nextStatus === 'COMPLETED' && (
          <>
            {showCompletionWarning && (
              <div className="field full" style={{ color: 'var(--danger)', fontSize: '12.5px' }}>
                {typeof attendanceRate === 'number'
                  ? `출석률 ${attendanceRate.toFixed(1)}% — 수료기준 미달 상태입니다. 진짜 수료로 변경하시겠습니까?`
                  : '수료기준 미달시 진짜 수료로 변경하시겠습니까?'}
              </div>
            )}
            <div className="field full">
              <label>
                수료일<span className="req">*</span>
              </label>
              <input
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
              />
            </div>
          </>
        )}
        {nextStatus === 'INCOMPLETE' && (
          <div className="field full">
            <label>
              미수료 사유<span className="req">*</span>
            </label>
            <input
              value={incompleteReason}
              onChange={(e) => setIncompleteReason(e.target.value)}
              placeholder="예: 출석 기준 미달"
            />
          </div>
        )}
      </div>
    </ApiModal>
  );
}

// --- 3. 출결/조퇴·외출 관리 모달 (AttendanceApiModal) ---
import {
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  createAttendanceLeave,
  updateAttendanceLeave,
  deleteAttendanceLeave,
} from '../api/attendances';

interface AttendanceApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  courseParticipantId: number;
  participantName: string;
  dayNo: number;
  initialAttendanceId?: number; // 있으면 해당 ID로 GET 요청해서 폼 채움
}

export function AttendanceApiModal({
  isOpen,
  onClose,
  onSaved,
  courseParticipantId,
  participantName,
  dayNo,
  initialAttendanceId,
}: AttendanceApiModalProps) {
  const { roleConfig } = useRole();
  const canEdit = roleConfig.can.attend === 1; // OPERATOR, STAFF 권한 체크
  const isAdmin = roleConfig.role.includes('ADMIN'); // 하드 삭제 권한 체크

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // 현재 모달에서 관리 중인 출석 정보
  const [attendanceId, setAttendanceId] = useState<number | null>(null);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [currentStatus, setCurrentStatus] = useState(''); // 읽기 전용 (서버에서 계산된 상태)

  // 조퇴/외출 정보 (첫 번째 요소만 사용)
  const [leaveId, setLeaveId] = useState<number | null>(null);
  const [leaveTime, setLeaveTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [leaveReason, setLeaveReason] = useState('');

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'ATTEND' | 'LEAVE'>('ATTEND');

  // 데이터 초기 로딩
  useEffect(() => {
    if (!isOpen) return;

    // 모달 열릴 때 상태 초기화
    setAttendanceId(null);
    setCheckInTime('');
    setCheckOutTime('');
    setCurrentStatus('');
    setLeaveId(null);
    setLeaveTime('');
    setReturnTime('');
    setLeaveReason('');
    setActiveTab('ATTEND');

    if (initialAttendanceId) {
      setLoading(true);
      getAttendance(initialAttendanceId)
        .then((res) => {
          const data = res.data.data;
          if (data) {
            setAttendanceId(data.attendanceId);
            setCheckInTime(data.checkInTime || '');
            setCheckOutTime(data.checkOutTime || '');
            setCurrentStatus(data.status || '');

            if (data.leaves && data.leaves.length > 0) {
              const lv = data.leaves[0];
              setLeaveId(lv.attendanceLeaveId);
              setLeaveTime(lv.leaveTime || '');
              setReturnTime(lv.returnTime || '');
              setLeaveReason(lv.reason || '');
            }
          }
        })
        .catch((err) => console.error('출석 정보 불러오기 실패', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, initialAttendanceId]);

  const handleSaveAttendance = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload = {
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
      };

      if (attendanceId) {
        await updateAttendance(attendanceId, payload);
      } else {
        await createAttendance({
          courseParticipantId,
          dayNo,
          ...payload,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '출석 정보 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLeave = async () => {
    if (!canEdit) return;
    if (!attendanceId) {
      alert('출석 정보가 먼저 등록되어야 조퇴/외출 기록을 남길 수 있습니다.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        leaveTime: leaveTime || undefined,
        returnTime: returnTime || undefined,
        reason: leaveReason || undefined,
      };

      if (leaveId) {
        await updateAttendanceLeave(leaveId, payload);
      } else {
        await createAttendanceLeave({
          attendanceId,
          ...payload,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '조퇴/외출 정보 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttendance = async () => {
    if (!isAdmin || !attendanceId) return;
    if (!window.confirm('정말 삭제하시겠습니까? 관련 조퇴/외출 기록도 모두 삭제될 수 있습니다.'))
      return;
    setSaving(true);
    try {
      await deleteAttendance(attendanceId);
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '출석 정보 삭제에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLeave = async () => {
    if (!isAdmin || !leaveId) return;
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    setSaving(true);
    try {
      await deleteAttendanceLeave(leaveId);
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '조퇴/외출 정보 삭제에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${participantName} - ${dayNo}일차 출결`}
      onSave={activeTab === 'ATTEND' ? handleSaveAttendance : handleSaveLeave}
      saving={saving || loading}
      note={!canEdit ? '※ 조회 권한만 있습니다.' : undefined}
    >
      <div className="tabs" style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button
          className={`btn ${activeTab === 'ATTEND' ? 'primary' : ''}`}
          onClick={() => setActiveTab('ATTEND')}
        >
          출결 관리
        </button>
        <button
          className={`btn ${activeTab === 'LEAVE' ? 'primary' : ''}`}
          onClick={() => setActiveTab('LEAVE')}
        >
          조퇴·외출 관리
        </button>
      </div>

      {loading && <div>로딩 중...</div>}

      {!loading && activeTab === 'ATTEND' && (
        <div className="form-grid">
          {attendanceId && (
            <div className="field full">
              <label>현재 출결 상태 (자동 판정)</label>
              <input
                value={currentStatus}
                disabled
                style={{ background: '#f4f6f9', color: '#69768a' }}
              />
            </div>
          )}
          <div className="field">
            <label>입실 시간 (HH:mm:ss)</label>
            <input
              type="time"
              step="1"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="field">
            <label>퇴실 시간 (HH:mm:ss)</label>
            <input
              type="time"
              step="1"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          {isAdmin && attendanceId && (
            <div className="field full" style={{ marginTop: '16px', textAlign: 'right' }}>
              <button className="btn danger" onClick={handleDeleteAttendance} disabled={saving}>
                출결 기록 삭제
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'LEAVE' && (
        <div className="form-grid">
          {!attendanceId ? (
            <div className="field full" style={{ color: 'var(--danger)' }}>
              출결 기록이 존재해야 조퇴/외출 기록을 남길 수 있습니다.
            </div>
          ) : (
            <>
              <div className="field">
                <label>조퇴·외출 시간 (HH:mm:ss)</label>
                <input
                  type="time"
                  step="1"
                  value={leaveTime}
                  onChange={(e) => setLeaveTime(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="field">
                <label>복귀 시간 (HH:mm:ss)</label>
                <input
                  type="time"
                  step="1"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="field full">
                <label>사유</label>
                <input
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="사유를 입력하세요"
                  disabled={!canEdit}
                />
              </div>
              {isAdmin && leaveId && (
                <div className="field full" style={{ marginTop: '16px', textAlign: 'right' }}>
                  <button className="btn danger" onClick={handleDeleteLeave} disabled={saving}>
                    조퇴·외출 기록 삭제
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </ApiModal>
  );
}

// 7. 상담 슬롯 상담사 지정 모달 (상담 관리) — 회차 배치 상담사만 선택 가능
interface SlotCounselorAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseParticipantId: number;
  counselors: CounselorSummary[];
  currentUserId?: number;
  counselorOnly?: boolean;
  onSaved: () => void;
}

export function SlotCounselorAssignModal({
  isOpen,
  onClose,
  courseParticipantId,
  counselors,
  currentUserId,
  counselorOnly = false,
  onSaved,
}: SlotCounselorAssignModalProps) {
  const [options, setOptions] = useState<AssignableCounselor[]>([]);
  const [slots, setSlots] = useState<Record<CounselingType, number | ''>>({
    PRE_SESSION: '',
    POST_SESSION_1: '',
    POST_SESSION_2: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<CounselingType, number | ''> = {
      PRE_SESSION: '',
      POST_SESSION_1: '',
      POST_SESSION_2: '',
    };
    for (const c of counselors) {
      if (COUNSELING_TYPES.includes(c.status as CounselingType)) {
        next[c.status as CounselingType] = c.counselorId;
      }
    }
    setSlots(next);
    getAssignableCounselors(courseParticipantId)
      .then((res) => setOptions(res.data.data?.counselors ?? []))
      .catch(() => setOptions([]));
  }, [isOpen, courseParticipantId, counselors]);

  const currentByType = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const c of counselors) map[c.status] = c.counselorId;
    return map;
  }, [counselors]);

  const handleSave = async () => {
    // 값이 있고 기존과 다르며, 이 사용자가 지정 권한을 가진(체인) 슬롯만 반영한다.
    const changed = COUNSELING_TYPES.filter(
      (type) =>
        slots[type] !== '' &&
        Number(slots[type]) !== currentByType[type] &&
        canAssignSlot(counselors, type, counselorOnly, currentUserId),
    );
    if (changed.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      for (const type of changed) {
        await assignSlotCounselor(courseParticipantId, type, { counselorId: Number(slots[type]) });
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '상담사 지정에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="상담사 지정"
      onSave={handleSave}
      saving={saving}
      note="※ 변경한 슬롯의 상담사만 지정됩니다"
    >
      <div className="form-grid">
        {options.length === 0 && (
          <div className="field full muted" style={{ fontSize: '12px' }}>
            이 회차에 인력 배치된 상담사가 없습니다. 인력배정에서 상담사를 먼저 배치하세요.
          </div>
        )}
        {COUNSELING_TYPES.map((type) => {
          const assignable = canAssignSlot(counselors, type, counselorOnly, currentUserId);
          return (
            <div className="field full" key={type}>
              <label>
                {COUNSELING_TYPE_LABELS[type]}
                {counselorOnly && !assignable ? ' (지정 권한 없음)' : ''}
              </label>
              <select
                value={slots[type]}
                disabled={!assignable}
                onChange={(e) =>
                  setSlots((prev) => ({
                    ...prev,
                    [type]: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
              >
                <option value="">배정 안 함</option>
                {options.map((c) => (
                  <option key={c.counselorId} value={c.counselorId}>
                    {c.name ?? `#${c.counselorId}`}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: '11.5px', marginTop: '10px' }}>
        · 지정 대상은 해당 회차에 배치된 상담사만 선택할 수 있습니다. 상담사 교체 시 이전 세션
        기록은 초기화됩니다.
        {counselorOnly ? ' · 상담사는 본인 담당 다음 단계의 상담사만 지정할 수 있습니다.' : ''}
      </p>
    </ApiModal>
  );
}
