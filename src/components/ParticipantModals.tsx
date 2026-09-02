import { Fragment, useEffect, useMemo, useState } from 'react';
import { DateInput } from './DateInput';
import type { ReactNode } from 'react';
import { useRole } from '../context/RoleContext';
import { getRegions, groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { RegionSelect } from './RegionSelect';
import { getCourses } from '../api/courses';
import type { CourseSummary } from '../api/courses';
import { getUserRoles } from '../api/userRoles';
import { createParticipant, updateParticipant } from '../api/participants';
import {
  COUNSELING_TYPE_LABELS,
  CP_STATUS_LABELS,
  assignSlotCounselor,
  bulkAssignCounselors,
  bulkCompleteCourseParticipants,
  changeCounselors,
  changeCourseParticipantStatus,
  commitBulkImport,
  completeCourseParticipant,
  getAssignableCounselors,
  previewBulkImport,
  recordCounselingSession,
  updateCourseParticipant,
} from '../api/courseParticipants';
import type {
  AssignableCounselor,
  BulkImportCommitItem,
  BulkImportParsedRow,
  BulkImportPreview,
  BulkImportResult,
  ChangeSubject,
  CounselingType,
  CounselorSummary,
  CourseParticipantDetail,
  CourseParticipantStatus,
} from '../api/courseParticipants';
import { createParticipantMemo } from '../api/participantMemos';
import { apiErrorMessage } from '../api/apiError';
import { getParticipants } from '../api/participants';
import type { ParticipantListItem } from '../api/participants';
import { enrollParticipant } from '../api/courseParticipants';
import type { RiskStatus } from '../api/attendances';
import { createAttendanceBulk } from '../api/attendances';

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

// 이 사용자가 해당 슬롯의 상담사를 지정할 수 있는가
// - 사전상담(PRE_SESSION): 회차 배치 상담사면 지정·수정 가능(권한 개편). BE가 최종 검증.
// - 사후1/2: COUNSELOR는 직전 슬롯 배정자만(체인).
function canAssignSlot(
  counselors: CounselorSummary[],
  type: CounselingType,
  counselorOnly: boolean,
  currentUserId?: number,
): boolean {
  if (!counselorOnly) return true;
  if (type === 'PRE_SESSION') return true;
  const predecessor = PREDECESSOR_SLOT[type];
  if (!predecessor) return false;
  return counselors.find((c) => c.status === predecessor)?.counselorId === currentUserId;
}

// 변경 주체(빈칸/상담사/참여자, 필수) + 비고(필수) 공통 입력 — 상담사/일정 변경 이력용
function ChangeMetaFields({
  changedBy,
  reason,
  onChangedBy,
  onReason,
  disabled,
}: {
  changedBy: ChangeSubject;
  reason: string;
  onChangedBy: (v: ChangeSubject) => void;
  onReason: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="field full">
        <label>변경 주체 *</label>
        <select
          value={changedBy}
          disabled={disabled}
          onChange={(e) => onChangedBy(e.target.value as ChangeSubject)}
        >
          <option value="NONE">선택 안 함</option>
          <option value="COUNSELOR">상담사</option>
          <option value="PARTICIPANT">참여자</option>
        </select>
      </div>
      <div className="field full">
        <label>변경 비고 *</label>
        <textarea
          value={reason}
          disabled={disabled}
          onChange={(e) => onReason(e.target.value)}
          placeholder="변경 사유를 입력하세요(필수)"
        />
      </div>
    </>
  );
}

// 변경 비고(필수) 검증 — 공백이면 alert 후 false
function validateChangeReason(reason: string): boolean {
  if (!reason.trim()) {
    alert('변경 비고는 필수입니다.');
    return false;
  }
  return true;
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
  onSave?: () => void;
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
          {onSave && (
            <button className="btn primary" onClick={onSave} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
          )}
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

  const regionGroups = useMemo(() => groupRegionsByParent(regions), [regions]);
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
          <RegionSelect
            value={regionId === '' ? {} : { regionId }}
            onChange={(v) => setRegionId(v.regionId ?? '')}
            groups={regionGroups}
            allLabel="선택 안 함"
            placeholder="선택 안 함"
            style={{ width: '100%' }}
            menuPortal
          />
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
              <DateInput
                value={receptionDate}
                onChange={(e) => setReceptionDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>신청일</label>
              <DateInput value={applyDate} onChange={(e) => setApplyDate(e.target.value)} />
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
  const [changedBy, setChangedBy] = useState<ChangeSubject>('NONE');
  const [reason, setReason] = useState('');
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
    setChangedBy('NONE');
    setReason('');
  }, [isOpen, counselors]);

  const handleSave = async () => {
    if (!validateChangeReason(reason)) return;
    setSaving(true);
    try {
      const payload = COUNSELING_TYPES.filter((type) => slots[type] !== '').map((type) => ({
        counselorId: Number(slots[type]),
        status: type,
      }));
      await changeCounselors(courseParticipantId, payload, { changedBy, reason: reason.trim() });
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
        <ChangeMetaFields
          changedBy={changedBy}
          reason={reason}
          onChangedBy={setChangedBy}
          onReason={setReason}
        />
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
  const [changedBy, setChangedBy] = useState<ChangeSubject>('NONE');
  const [reason, setReason] = useState('');
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
    setChangedBy('NONE');
    setReason('');
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
    if (!validateChangeReason(reason)) return;
    setSaving(true);
    try {
      await recordCounselingSession(courseParticipantId, counselingType, {
        startedAt: toLocalDateTime(startedAt),
        endedAt: toLocalDateTime(endedAt),
        memo: memo || null,
        changedBy,
        reason: reason.trim(),
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
          <DateInput type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            disabled={!canEditCurrent}
          />
        </div>
        <div className="field">
          <label>상담 종료 일시</label>
          <DateInput type="datetime-local"
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
        <ChangeMetaFields
          changedBy={changedBy}
          reason={reason}
          onChangedBy={setChangedBy}
          onReason={setReason}
          disabled={!canEditCurrent}
        />
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
            <DateInput
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

// 5-1. 상담사 슬롯 일괄 배정 모달 (참여자 관리 메인) — 선택 수강건들에 동일 슬롯·상담사 지정
interface BulkCounselorAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseParticipantIds: number[];
  // 배정 가능 상담사 옵션을 불러올 대표 수강건(선택 건이 동일 회차라는 가정)
  sampleCourseParticipantId: number;
  onSaved: () => void;
}

export function BulkCounselorAssignModal({
  isOpen,
  onClose,
  courseParticipantIds,
  sampleCourseParticipantId,
  onSaved,
}: BulkCounselorAssignModalProps) {
  const [counselingType, setCounselingType] = useState<CounselingType>('PRE_SESSION');
  const [counselorId, setCounselorId] = useState<number | ''>('');
  const [options, setOptions] = useState<AssignableCounselor[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCounselingType('PRE_SESSION');
    setCounselorId('');
    getAssignableCounselors(sampleCourseParticipantId)
      .then((res) => setOptions(res.data.data?.counselors ?? []))
      .catch(() => setOptions([]));
  }, [isOpen, sampleCourseParticipantId]);

  const handleSave = async () => {
    if (counselorId === '') {
      alert('배정할 상담사를 선택하세요.');
      return;
    }
    setSaving(true);
    try {
      await bulkAssignCounselors({
        courseParticipantIds,
        counselingType,
        counselorId: Number(counselorId),
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '상담사 일괄 배정에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="상담사 일괄 배정"
      onSave={handleSave}
      saving={saving}
      note={`※ 선택한 ${courseParticipantIds.length}건에 동일하게 반영됩니다`}
    >
      <div className="form-grid">
        <div className="field full">
          <label>대상 건수</label>
          <input
            value={`${courseParticipantIds.length}건`}
            disabled
            style={{ background: '#f4f6f9', color: '#69768a' }}
          />
        </div>
        <div className="field full">
          <label>
            상담 구분<span className="req">*</span>
          </label>
          <select
            value={counselingType}
            onChange={(e) => setCounselingType(e.target.value as CounselingType)}
          >
            {COUNSELING_TYPES.map((type) => (
              <option key={type} value={type}>
                {COUNSELING_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>
            상담사<span className="req">*</span>
          </label>
          <select
            value={counselorId}
            onChange={(e) => setCounselorId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">상담사 선택</option>
            {options.map((c) => (
              <option key={c.counselorId} value={c.counselorId}>
                {c.name ?? `#${c.counselorId}`}
              </option>
            ))}
          </select>
        </div>
        {options.length === 0 && (
          <div className="field full muted" style={{ fontSize: '12px' }}>
            대표 수강건 회차에 배치된 상담사가 없습니다. 인력배정에서 상담사를 먼저 배치하세요.
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: '11.5px', marginTop: '10px' }}>
        · 지정 대상은 회차에 배치된 상담사여야 하며, 선택 건 중 배치되지 않은 회차가 있으면 전체가
        반영되지 않습니다. · 상담사 교체 시 이전 세션 기록은 초기화됩니다.
      </p>
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
              <DateInput
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
  const canEdit = roleConfig.can.attend === 1;
  const isAdmin = roleConfig.role.includes('ADMIN');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // 출석 정보
  const [attendanceId, setAttendanceId] = useState<number | null>(null);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');
  // 수기 결석 처리 — 체크 시 입·퇴실 시각 무시하고 결석(ABSENT)으로 저장, 사유 기록
  const [absent, setAbsent] = useState(false);
  const [absenceReason, setAbsenceReason] = useState('');

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'ATTEND' | 'LEAVE'>('ATTEND');

  // 조퇴/외출 — 다중 기록
  type LeaveRow = {
    attendanceLeaveId: number | null; // null = 신규
    leaveTime: string;
    returnTime: string;
    reason: string;
    isEditing: boolean;
    savingRow: boolean;
  };
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newLeave, setNewLeave] = useState({ leaveTime: '', returnTime: '', reason: '' });

  const refreshAttendance = (attId: number) => {
    setLoading(true);
    getAttendance(attId)
      .then((res) => {
        const data = res.data.data;
        if (data) {
          setAttendanceId(data.attendanceId);
          setCheckInTime(data.checkInTime || '');
          setCheckOutTime(data.checkOutTime || '');
          setCurrentStatus(data.status || '');
          setAbsent(data.status === 'ABSENT');
          setAbsenceReason(data.absenceReason || '');
          setLeaves(
            (data.leaves ?? []).map((lv) => ({
              attendanceLeaveId: lv.attendanceLeaveId,
              leaveTime: lv.leaveTime || '',
              returnTime: lv.returnTime || '',
              reason: lv.reason || '',
              isEditing: false,
              savingRow: false,
            }))
          );
        }
      })
      .catch((err) => console.error('출석 정보 불러오기 실패', err))
      .finally(() => setLoading(false));
  };

  // 데이터 초기 로딩
  useEffect(() => {
    if (!isOpen) return;
    setAttendanceId(null);
    setCheckInTime('');
    setCheckOutTime('');
    setCurrentStatus('');
    setAbsent(false);
    setAbsenceReason('');
    setLeaves([]);
    setAddingNew(false);
    setNewLeave({ leaveTime: '', returnTime: '', reason: '' });
    setActiveTab('ATTEND');

    if (initialAttendanceId) {
      refreshAttendance(initialAttendanceId);
    }
  }, [isOpen, initialAttendanceId]);

  // 출결 저장
  const handleSaveAttendance = async () => {
    if (!canEdit) return;
    if (absent && !absenceReason.trim()) {
      alert('결석 사유를 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      // 결석 처리 시 입·퇴실 시각은 보내지 않고 absent/사유만 전송한다(BE에서 시각 클리어 + ABSENT).
      const payload = absent
        ? { absent: true, absenceReason: absenceReason.trim() }
        : {
            absent: false,
            checkInTime: checkInTime || undefined,
            checkOutTime: checkOutTime || undefined,
          };
      if (attendanceId) {
        await updateAttendance(attendanceId, payload);
      } else {
        await createAttendance({ courseParticipantId, dayNo, ...payload });
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '출석 정보 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  // 출결 삭제
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

  // 조퇴/외출 개별 저장 (수정)
  const handleSaveLeaveRow = async (idx: number) => {
    if (!canEdit || !attendanceId) return;
    const row = leaves[idx];
    setLeaves((prev) => prev.map((r, i) => i === idx ? { ...r, savingRow: true } : r));
    try {
      if (row.attendanceLeaveId) {
        await updateAttendanceLeave(row.attendanceLeaveId, {
          leaveTime: row.leaveTime || undefined,
          returnTime: row.returnTime || undefined,
          reason: row.reason || undefined,
        });
      }
      onSaved();
      // 저장 후 목록 새로고침 (모달 유지)
      refreshAttendance(attendanceId);
    } catch (err) {
      alert(apiErrorMessage(err, '조퇴/외출 정보 저장에 실패했습니다.'));
      setLeaves((prev) => prev.map((r, i) => i === idx ? { ...r, savingRow: false } : r));
    }
  };

  // 조퇴/외출 개별 삭제
  const handleDeleteLeaveRow = async (idx: number) => {
    if (!isAdmin) return;
    const row = leaves[idx];
    if (!row.attendanceLeaveId) return;
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    setLeaves((prev) => prev.map((r, i) => i === idx ? { ...r, savingRow: true } : r));
    try {
      await deleteAttendanceLeave(row.attendanceLeaveId);
      onSaved();
      if (attendanceId) refreshAttendance(attendanceId);
    } catch (err) {
      alert(apiErrorMessage(err, '조퇴/외출 정보 삭제에 실패했습니다.'));
      setLeaves((prev) => prev.map((r, i) => i === idx ? { ...r, savingRow: false } : r));
    }
  };

  // 조퇴/외출 신규 추가
  const handleAddNewLeave = async () => {
    if (!canEdit || !attendanceId) return;
    setSaving(true);
    try {
      await createAttendanceLeave({
        attendanceId,
        leaveTime: newLeave.leaveTime || undefined,
        returnTime: newLeave.returnTime || undefined,
        reason: newLeave.reason || undefined,
      });
      onSaved();
      setAddingNew(false);
      setNewLeave({ leaveTime: '', returnTime: '', reason: '' });
      refreshAttendance(attendanceId);
    } catch (err) {
      alert(apiErrorMessage(err, '조퇴/외출 등록에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const updateLeaveField = (idx: number, field: keyof Omit<LeaveRow, 'attendanceLeaveId' | 'isEditing' | 'savingRow'>, value: string) => {
    setLeaves((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const toggleEdit = (idx: number) => {
    setLeaves((prev) => prev.map((r, i) => i === idx ? { ...r, isEditing: !r.isEditing } : r));
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${participantName} - ${dayNo}일차 출결`}
      onSave={activeTab === 'ATTEND' ? handleSaveAttendance : undefined}
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
          {leaves.length > 0 && (
            <span style={{
              marginLeft: '6px',
              background: 'var(--danger, #e53e3e)',
              color: '#fff',
              borderRadius: '10px',
              padding: '0 7px',
              fontSize: '11px',
              fontWeight: 700,
              lineHeight: '18px',
              display: 'inline-block',
              verticalAlign: 'middle',
            }}>{leaves.length}</span>
          )}
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
              disabled={!canEdit || absent}
            />
          </div>
          <div className="field">
            <label>퇴실 시간 (HH:mm:ss)</label>
            <input
              type="time"
              step="1"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              disabled={!canEdit || absent}
            />
          </div>
          {/* 결석 처리 — 입실 시간 아래. 체크 시 입·퇴실 시각을 비우고 결석 사유를 입력받는다. */}
          <div className="field full">
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: canEdit ? 'pointer' : 'default' }}
            >
              <input
                type="checkbox"
                checked={absent}
                disabled={!canEdit}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAbsent(checked);
                  if (checked) {
                    setCheckInTime('');
                    setCheckOutTime('');
                  } else {
                    setAbsenceReason('');
                  }
                }}
                style={{ width: 'auto', margin: 0 }}
              />
              결석 처리
            </label>
            {absent && (
              <input
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                placeholder="결석 사유 (필수)"
                maxLength={255}
                disabled={!canEdit}
                style={{ marginTop: '8px' }}
              />
            )}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!attendanceId ? (
            <div style={{ color: 'var(--danger)', padding: '8px 0' }}>
              출결 기록이 존재해야 조퇴/외출 기록을 남길 수 있습니다.
            </div>
          ) : (
            <>
              {/* 기존 조퇴/외출 기록 목록 */}
              {leaves.length === 0 && !addingNew && (
                <div style={{ color: 'var(--muted, #888)', padding: '8px 0', fontSize: '14px' }}>
                  등록된 조퇴·외출 기록이 없습니다.
                </div>
              )}

              {leaves.map((row, idx) => (
                <div
                  key={row.attendanceLeaveId ?? `new-${idx}`}
                  style={{
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    background: row.isEditing ? 'var(--bg-sub, #f8fafc)' : '#fff',
                    position: 'relative',
                  }}
                >
                  {/* 헤더 행 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: row.isEditing ? '10px' : 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      기록 #{idx + 1}
                      <span style={{ marginLeft: '10px', fontWeight: 400, color: 'var(--muted, #888)', fontSize: '12px' }}>
                        {row.leaveTime ? `외출 ${row.leaveTime.substring(0, 5)}` : '외출시간 미입력'}
                        {row.returnTime ? ` → 복귀 ${row.returnTime.substring(0, 5)}` : ''}
                        {row.reason ? ` · ${row.reason}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {canEdit && (
                        <button
                          className={`btn${row.isEditing ? ' primary' : ''}`}
                          style={{ padding: '3px 10px', fontSize: '12px' }}
                          onClick={() => {
                            if (row.isEditing) {
                              handleSaveLeaveRow(idx);
                            } else {
                              toggleEdit(idx);
                            }
                          }}
                          disabled={row.savingRow || saving}
                        >
                          {row.isEditing ? (row.savingRow ? '저장 중…' : '저장') : '수정'}
                        </button>
                      )}
                      {row.isEditing && (
                        <button
                          className="btn"
                          style={{ padding: '3px 10px', fontSize: '12px' }}
                          onClick={() => toggleEdit(idx)}
                          disabled={row.savingRow}
                        >
                          취소
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          className="btn danger"
                          style={{ padding: '3px 10px', fontSize: '12px' }}
                          onClick={() => handleDeleteLeaveRow(idx)}
                          disabled={row.savingRow || saving}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 수정 폼 */}
                  {row.isEditing && (
                    <div className="form-grid" style={{ marginTop: '4px' }}>
                      <div className="field">
                        <label>조퇴·외출 시간</label>
                        <input
                          type="time"
                          step="1"
                          value={row.leaveTime}
                          onChange={(e) => updateLeaveField(idx, 'leaveTime', e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>복귀 시간</label>
                        <input
                          type="time"
                          step="1"
                          value={row.returnTime}
                          onChange={(e) => updateLeaveField(idx, 'returnTime', e.target.value)}
                        />
                      </div>
                      <div className="field full">
                        <label>사유</label>
                        <input
                          value={row.reason}
                          onChange={(e) => updateLeaveField(idx, 'reason', e.target.value)}
                          placeholder="사유를 입력하세요"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* 신규 추가 폼 */}
              {addingNew && (
                <div style={{
                  border: '1px dashed var(--primary, #4f7df3)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  background: 'var(--bg-sub, #f8fafc)',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: 'var(--primary, #4f7df3)' }}>
                    + 새 기록 추가
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>조퇴·외출 시간</label>
                      <input
                        type="time"
                        step="1"
                        value={newLeave.leaveTime}
                        onChange={(e) => setNewLeave((p) => ({ ...p, leaveTime: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label>복귀 시간</label>
                      <input
                        type="time"
                        step="1"
                        value={newLeave.returnTime}
                        onChange={(e) => setNewLeave((p) => ({ ...p, returnTime: e.target.value }))}
                      />
                    </div>
                    <div className="field full">
                      <label>사유</label>
                      <input
                        value={newLeave.reason}
                        onChange={(e) => setNewLeave((p) => ({ ...p, reason: e.target.value }))}
                        placeholder="사유를 입력하세요"
                      />
                    </div>
                    <div className="field full" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        className="btn"
                        onClick={() => { setAddingNew(false); setNewLeave({ leaveTime: '', returnTime: '', reason: '' }); }}
                        disabled={saving}
                      >
                        취소
                      </button>
                      <button
                        className="btn primary"
                        onClick={handleAddNewLeave}
                        disabled={saving}
                      >
                        {saving ? '등록 중…' : '등록'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 추가 버튼 */}
              {canEdit && !addingNew && (
                <div>
                  <button
                    className="btn"
                    style={{ fontSize: '13px' }}
                    onClick={() => setAddingNew(true)}
                    disabled={saving || loading}
                  >
                    + 조퇴·외출 기록 추가
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
  const [changedBy, setChangedBy] = useState<ChangeSubject>('NONE');
  const [reason, setReason] = useState('');
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
    setChangedBy('NONE');
    setReason('');
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
    if (!validateChangeReason(reason)) return;
    setSaving(true);
    try {
      for (const type of changed) {
        await assignSlotCounselor(courseParticipantId, type, {
          counselorId: Number(slots[type]),
          changedBy,
          reason: reason.trim(),
        });
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
        <ChangeMetaFields
          changedBy={changedBy}
          reason={reason}
          onChangedBy={setChangedBy}
          onReason={setReason}
        />
      </div>
      <p className="muted" style={{ fontSize: '11.5px', marginTop: '10px' }}>
        · 지정 대상은 해당 회차에 배치된 상담사만 선택할 수 있습니다. 상담사 교체 시 이전 세션
        기록은 초기화됩니다.
        {counselorOnly
          ? ' · 상담사는 사전상담사, 그리고 본인 담당 다음 단계의 상담사를 지정할 수 있습니다.'
          : ''}
      </p>
    </ApiModal>
  );
}

// 6-1. 참여자 정보 수정 모달 (참여자 상세) — 기본정보(participant) + 수강/운영정보(course_participant)
interface ParticipantEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  detail: CourseParticipantDetail;
  onSaved: () => void;
}

export function ParticipantEditModal({
  isOpen,
  onClose,
  detail,
  onSaved,
}: ParticipantEditModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [basicEducation, setBasicEducation] = useState('');
  const [inflowType, setInflowType] = useState('');
  const [applyDate, setApplyDate] = useState('');
  const [receptionDate, setReceptionDate] = useState('');
  const [contactAttempt, setContactAttempt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(detail.participantName ?? '');
    setPhone(detail.phone ?? '');
    setBirthYear(detail.birthYear != null ? String(detail.birthYear) : '');
    setBasicEducation(detail.basicEducation ?? '');
    setInflowType(detail.inflowType ?? '');
    setApplyDate(detail.applyDate ?? '');
    setReceptionDate(detail.receptionDate ?? '');
    setContactAttempt(detail.contactAttempt != null ? String(detail.contactAttempt) : '');
  }, [isOpen, detail]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('이름을 입력하세요.');
      return;
    }
    if (!phone.trim()) {
      alert('전화번호를 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      // 기본정보(participant) 수정 — matchKey는 서버가 재생성
      await updateParticipant(detail.participantId, {
        name: name.trim(),
        birthYear: birthYear.trim() === '' ? null : Number(birthYear),
        phone: phone.trim(),
      });
      // 수강/운영정보(course_participant) 수정 — 빈 값은 미변경(undefined)
      await updateCourseParticipant(detail.courseParticipantId, {
        basicEducation: basicEducation === '' ? undefined : basicEducation,
        inflowType: inflowType === '' ? undefined : inflowType,
        applyDate: applyDate === '' ? undefined : applyDate,
        receptionDate: receptionDate === '' ? undefined : receptionDate,
        contactAttempt: contactAttempt.trim() === '' ? undefined : Number(contactAttempt),
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '참여자 정보 수정에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title="참여자 정보 수정"
      onSave={handleSave}
      saving={saving}
    >
      <div className="form-grid">
        <div
          className="field full"
          style={{ fontWeight: 600, fontSize: '12.5px', color: '#69768a' }}
        >
          기본정보
        </div>
        <div className="field">
          <label>
            이름<span className="req">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>
            전화번호<span className="req">*</span>
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
            type="number"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="예: 1978"
          />
        </div>

        <div
          className="field full"
          style={{ fontWeight: 600, fontSize: '12.5px', color: '#69768a', marginTop: '6px' }}
        >
          수강 · 운영정보
        </div>
        <div className="field">
          <label>기초교육</label>
          <select value={basicEducation} onChange={(e) => setBasicEducation(e.target.value)}>
            <option value="">미지정</option>
            {basicEducation !== '' && basicEducation !== 'Y' && basicEducation !== 'N' && (
              <option value={basicEducation}>{basicEducation}</option>
            )}
            <option value="Y">이수(Y)</option>
            <option value="N">미이수(N)</option>
          </select>
        </div>
        <div className="field">
          <label>유입경로</label>
          <select value={inflowType} onChange={(e) => setInflowType(e.target.value)}>
            <option value="">미지정</option>
            {inflowType !== '' && !INFLOW_OPTS.includes(inflowType) && (
              <option value={inflowType}>{inflowType}</option>
            )}
            {INFLOW_OPTS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>신청일</label>
          <DateInput value={applyDate} onChange={(e) => setApplyDate(e.target.value)} />
        </div>
        <div className="field">
          <label>접수일</label>
          <DateInput
            value={receptionDate}
            onChange={(e) => setReceptionDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>연락 시도</label>
          <input
            type="number"
            min={0}
            value={contactAttempt}
            onChange={(e) => setContactAttempt(e.target.value)}
          />
        </div>
      </div>
    </ApiModal>
  );
}

// 7. 참여자 XLSX 일괄 등록 모달 — 업로드 → 과정명별 회차 매핑 → 확정 → 결과 리포트
interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function courseLabel(c: CourseSummary): string {
  const round = c.localCourseNumber ?? c.courseNumber;
  const parts = [c.regionName, c.courseName].filter(Boolean).join(' · ');
  const roundText = round != null ? ` (${round}회차)` : '';
  return `${parts || `#${c.courseId}`}${roundText}`;
}

export function BulkImportModal({ isOpen, onClose, onSaved }: BulkImportModalProps) {
  const { roleConfig } = useRole();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BulkImportPreview | null>(null);
  // 교육과정명 → 대상 courseId(빈 문자열이면 건너뛰기)
  const [mappings, setMappings] = useState<Record<string, number | ''>>({});
  // 그룹별 편집된 행(미리보기 후 확인·수정) + 그룹 펼침 상태
  const [editedRows, setEditedRows] = useState<Record<string, BulkImportParsedRow[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // 그룹별 등록 대상으로 체크된 행 번호 집합 — 기본값은 "선정여부=선정" 행만 체크된다.
  const [included, setIncluded] = useState<Record<string, Set<number>>>({});
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setPreview(null);
    setMappings({});
    setEditedRows({});
    setExpanded({});
    setIncluded({});
    setResult(null);
    setError(null);
    setBusy(false);
    getCourses({ size: 200 })
      .then((res) => setCourses(res.data.data?.content ?? []))
      .catch(() => setCourses([]));
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 회차 드롭다운을 지역별 그룹(optgroup)으로 나눈다.
  const coursesByRegion = useMemo(() => {
    const map = new Map<string, CourseSummary[]>();
    for (const c of courses) {
      const key = c.regionName ?? '기타';
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [courses]);

  // 매핑된 그룹의 등록 예정 인원(오류 없고 체크된 행 기준)
  const plannedCount = useMemo(() => {
    if (!preview) return 0;
    return preview.groups
      .filter((g) => mappings[g.sourceCourseName])
      .reduce((sum, g) => {
        const rows = editedRows[g.sourceCourseName] ?? g.rows;
        const inc = included[g.sourceCourseName];
        return sum + rows.filter((r) => !r.error && inc?.has(r.rowNumber)).length;
      }, 0);
  }, [preview, mappings, editedRows, included]);

  // 행 체크 토글(오류 행은 등록 불가라 체크 대상 아님).
  const toggleRow = (groupKey: string, rowNumber: number) => {
    setIncluded((prev) => {
      const next = new Set(prev[groupKey] ?? []);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return { ...prev, [groupKey]: next };
    });
  };

  // 그룹 전체 선택/해제 — 오류 없는 행 전부가 이미 체크돼 있으면 해제, 아니면 전부 체크.
  const toggleGroupAll = (groupKey: string, rows: BulkImportParsedRow[]) => {
    const selectable = rows.filter((r) => !r.error).map((r) => r.rowNumber);
    setIncluded((prev) => {
      const cur = prev[groupKey] ?? new Set<number>();
      const allChecked = selectable.length > 0 && selectable.every((n) => cur.has(n));
      return { ...prev, [groupKey]: new Set(allChecked ? [] : selectable) };
    });
  };

  const STATUS_OPTIONS: CourseParticipantStatus[] = ['APPLIED', 'CONFIRMED', 'CANCELED'];

  // 편집 행의 한 필드를 갱신한다(빈 문자열은 null, birthYear 는 숫자로).
  const updateRow = (
    groupKey: string,
    index: number,
    field: keyof BulkImportParsedRow,
    value: string,
  ) => {
    setEditedRows((prev) => {
      const rows = (prev[groupKey] ?? []).map((r, i) => {
        if (i !== index) return r;
        if (field === 'birthYear') {
          return { ...r, birthYear: value === '' ? null : Number(value) };
        }
        if (field === 'status') {
          return { ...r, status: value };
        }
        return { ...r, [field]: value === '' ? null : value };
      });
      return { ...prev, [groupKey]: rows };
    });
  };

  const toggleExpand = (groupKey: string) =>
    setExpanded((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file) {
      alert('엑셀(.xlsx) 파일을 선택해주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await previewBulkImport(file);
      const data = res.data.data;
      setPreview(data);
      const init: Record<string, number | ''> = {};
      const rowsByGroup: Record<string, BulkImportParsedRow[]> = {};
      const incByGroup: Record<string, Set<number>> = {};
      for (const g of data.groups) {
        init[g.sourceCourseName] = g.suggestedCourseId ?? '';
        rowsByGroup[g.sourceCourseName] = g.rows.map((r) => ({ ...r }));
        // 기본 체크: 선정여부='선정' 이고 오류 없는 행만. 담당자가 확인 후 조정 가능.
        incByGroup[g.sourceCourseName] = new Set(
          g.rows.filter((r) => !r.error && r.selected === '선정').map((r) => r.rowNumber),
        );
      }
      setMappings(init);
      setEditedRows(rowsByGroup);
      setIncluded(incByGroup);
      setExpanded({});
    } catch (err) {
      setError(apiErrorMessage(err, '미리보기에 실패했습니다. 파일 형식을 확인해주세요.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const items: BulkImportCommitItem[] = [];
      for (const g of preview.groups) {
        const target = mappings[g.sourceCourseName];
        const rows = editedRows[g.sourceCourseName] ?? g.rows;
        const inc = included[g.sourceCourseName];
        // 체크된(선정 대상) 행만 등록한다 — 미선정/미체크 행은 제외.
        for (const r of rows) {
          if (!inc?.has(r.rowNumber)) continue;
          items.push({
            rowNumber: r.rowNumber,
            sourceCourseName: g.sourceCourseName,
            targetCourseId: target === '' || target == null ? null : Number(target),
            name: r.name,
            phone: r.phone,
            birthYear: r.birthYear,
            applyDate: r.applyDate,
            receptionDate: r.receptionDate,
            status: r.status,
          });
        }
      }
      const res = await commitBulkImport(items);
      setResult(res.data.data);
    } catch (err) {
      setError(apiErrorMessage(err, '일괄 등록에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (result) onSaved();
    onClose();
  };

  if (!isOpen) return null;

  const step: 'upload' | 'map' | 'result' = result ? 'result' : preview ? 'map' : 'upload';

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '1120px', width: '95%' }}>
        <div className="modal-h">
          <h3>참여자 일괄 등록</h3>
          <span className="badge-role">
            {roleConfig.nm} · {roleConfig.role}
          </span>
          <button className="x" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="modal-b">
          {error && (
            <div
              className="card"
              style={{ padding: '10px 12px', marginBottom: '10px', color: 'var(--danger)' }}
            >
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div className="form-grid">
              <div className="field full">
                <label>엑셀 파일 (.xlsx)</label>
                <input type="file" accept=".xlsx" onChange={handleFileChange} />
              </div>
              <p className="muted" style={{ fontSize: '12px' }}>
                희망리턴패키지 참여자 엑셀을 업로드한 뒤 미리보기에서 교육과정명별로 등록할 회차를
                지정합니다. 회차를 지정하지 않은 과정과 중복·오류 행은 등록에서 제외됩니다.
              </p>
            </div>
          )}

          {step === 'map' && preview && (
            <>
              <p style={{ fontSize: '13px', marginBottom: '6px' }}>
                총 <strong>{preview.totalRows}</strong>행 · 정상 {preview.validRows} · 오류{' '}
                {preview.invalidRows} — 과정명별로 등록할 회차를 선택하세요.
              </p>
              <p className="muted" style={{ fontSize: '12px', marginBottom: '10px' }}>
                💡 회차를 선택하면 「▸ 확인·수정」을 눌러 업로드된 데이터를 확인하고 수정할 수
                있습니다.
              </p>
              <div className="tbl-wrap" style={{ maxHeight: '380px', overflow: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>교육과정명 (지역 · 회차)</th>
                      <th style={{ width: '60px' }}>인원</th>
                      <th style={{ width: '220px' }}>등록할 회차</th>
                      <th style={{ width: '96px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.groups.map((g) => {
                      const rows = editedRows[g.sourceCourseName] ?? g.rows;
                      const isExpanded = expanded[g.sourceCourseName] ?? false;
                      return (
                        <Fragment key={g.sourceCourseName}>
                          <tr>
                            <td>
                              <div style={{ fontWeight: 600 }}>{g.sourceCourseName}</div>
                              <div className="cell-sub">
                                {[g.sigungu, g.roundNumber != null ? `${g.roundNumber}회차` : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </td>
                            <td>
                              {g.participantCount}
                              {g.invalidCount > 0 && (
                                <span className="muted" style={{ fontSize: '11px' }}>
                                  {' '}
                                  (오류 {g.invalidCount})
                                </span>
                              )}
                            </td>
                            <td>
                              <select
                                value={mappings[g.sourceCourseName] ?? ''}
                                onChange={(e) =>
                                  setMappings((prev) => ({
                                    ...prev,
                                    [g.sourceCourseName]:
                                      e.target.value === '' ? '' : Number(e.target.value),
                                  }))
                                }
                                style={{ width: '100%' }}
                              >
                                <option value="">건너뛰기 (등록 안 함)</option>
                                {coursesByRegion.map(([region, list]) => (
                                  <optgroup key={region} label={region}>
                                    {list.map((c) => (
                                      <option key={c.courseId} value={c.courseId}>
                                        {courseLabel(c)}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                            <td>
                              <button
                                className="btn"
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                                onClick={() => toggleExpand(g.sourceCourseName)}
                              >
                                {isExpanded ? '▾ 접기' : '▸ 확인·수정'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={4} style={{ background: '#f7f9fc', padding: '8px' }}>
                                <div
                                  className="tbl-wrap"
                                  style={{ maxHeight: '220px', overflow: 'auto' }}
                                >
                                  <table className="data" style={{ fontSize: '12px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ width: '34px', textAlign: 'center' }}>
                                          <input
                                            type="checkbox"
                                            aria-label="전체 선택"
                                            checked={(() => {
                                              const selectable = rows.filter((r) => !r.error);
                                              const inc = included[g.sourceCourseName];
                                              return (
                                                selectable.length > 0 &&
                                                selectable.every((r) => inc?.has(r.rowNumber))
                                              );
                                            })()}
                                            onChange={() => toggleGroupAll(g.sourceCourseName, rows)}
                                          />
                                        </th>
                                        <th style={{ width: '38px' }}>행</th>
                                        <th>이름</th>
                                        <th>휴대폰</th>
                                        <th style={{ width: '70px' }}>출생연도</th>
                                        <th style={{ width: '124px' }}>신청일</th>
                                        <th style={{ width: '124px' }}>선정일</th>
                                        <th style={{ width: '60px' }}>선정여부</th>
                                        <th style={{ width: '84px' }}>상태</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map((r, idx) => (
                                        <tr
                                          key={r.rowNumber}
                                          style={r.error ? { background: '#fff2f2' } : undefined}
                                        >
                                          <td style={{ textAlign: 'center' }}>
                                            <input
                                              type="checkbox"
                                              aria-label={`${r.name ?? ''} 등록 대상`}
                                              disabled={!!r.error}
                                              checked={
                                                included[g.sourceCourseName]?.has(r.rowNumber) ?? false
                                              }
                                              onChange={() => toggleRow(g.sourceCourseName, r.rowNumber)}
                                            />
                                          </td>
                                          <td>{r.rowNumber}</td>
                                          <td>
                                            <input
                                              value={r.name ?? ''}
                                              onChange={(e) =>
                                                updateRow(
                                                  g.sourceCourseName,
                                                  idx,
                                                  'name',
                                                  e.target.value,
                                                )
                                              }
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              value={r.phone ?? ''}
                                              onChange={(e) =>
                                                updateRow(
                                                  g.sourceCourseName,
                                                  idx,
                                                  'phone',
                                                  e.target.value,
                                                )
                                              }
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              value={r.birthYear ?? ''}
                                              onChange={(e) =>
                                                updateRow(
                                                  g.sourceCourseName,
                                                  idx,
                                                  'birthYear',
                                                  e.target.value,
                                                )
                                              }
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td>
                                            <DateInput
                                              value={r.applyDate ?? ''}
                                              onChange={(e) =>
                                                updateRow(
                                                  g.sourceCourseName,
                                                  idx,
                                                  'applyDate',
                                                  e.target.value,
                                                )
                                              }
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td>
                                            <DateInput
                                              value={r.receptionDate ?? ''}
                                              onChange={(e) =>
                                                updateRow(
                                                  g.sourceCourseName,
                                                  idx,
                                                  'receptionDate',
                                                  e.target.value,
                                                )
                                              }
                                              style={{ width: '100%' }}
                                            />
                                          </td>
                                          <td style={{ textAlign: 'center' }}>{r.selected ?? '—'}</td>
                                          <td>
                                            <select
                                              value={r.status}
                                              onChange={(e) =>
                                                updateRow(
                                                  g.sourceCourseName,
                                                  idx,
                                                  'status',
                                                  e.target.value,
                                                )
                                              }
                                              style={{ width: '100%' }}
                                            >
                                              {STATUS_OPTIONS.map((s) => (
                                                <option key={s} value={s}>
                                                  {CP_STATUS_LABELS[s]}
                                                </option>
                                              ))}
                                            </select>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {rows.some((r) => r.error) && (
                                  <p
                                    style={{
                                      fontSize: '11px',
                                      marginTop: '6px',
                                      color: 'var(--danger)',
                                    }}
                                  >
                                    빨간 행은 필수값(이름·휴대폰) 오류입니다. 수정하면 등록됩니다.
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '13px', marginTop: '10px' }}>
                등록 예정 <strong>{plannedCount}</strong>명 (체크된 선정 인원만 등록 · 확인·수정에서 조정 가능,
                중복 행은 확정 시 자동 스킵)
              </p>
            </>
          )}

          {step === 'result' && result && (
            <>
              <div className="card" style={{ padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
                  등록 완료 — {result.registeredCount}명
                </div>
                <div className="muted" style={{ fontSize: '12.5px', lineHeight: 1.7 }}>
                  신규 참여자 {result.createdParticipantCount} · 기존 재사용{' '}
                  {result.reusedParticipantCount}
                  <br />
                  중복 스킵 {result.skippedDuplicateCount} · 미매핑 스킵{' '}
                  {result.skippedUnmappedCount} · 오류 {result.invalidRowCount}
                </div>
              </div>
              {result.details.length > 0 && (
                <div className="tbl-wrap" style={{ maxHeight: '260px', overflow: 'auto' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th className="col-row">행</th>
                        <th>이름</th>
                        <th>사유</th>
                      </tr>
                    </thead>
                    <tbody className="participants-list">
                      {result.details.map((d) => (
                        <tr key={`${d.rowNumber}-${d.outcome}`}>
                          <td>{d.rowNumber}</td>
                          <td>{d.name ?? '—'}</td>
                          <td className="muted">
                            {d.reason ?? d.outcome}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-f">
          <span className="modal-note">※ 관리 롤(ADMIN·본부장·지역담당·PM·PL) 전용 기능입니다</span>
          {step === 'upload' && (
            <>
              <button className="btn" onClick={handleClose} disabled={busy}>
                취소
              </button>
              <button className="btn primary" onClick={handlePreview} disabled={busy || !file}>
                {busy ? '분석 중…' : '미리보기'}
              </button>
            </>
          )}
          {step === 'map' && (
            <>
              <button className="btn" onClick={() => setPreview(null)} disabled={busy}>
                다시 선택
              </button>
              <button
                className="btn primary"
                onClick={handleCommit}
                disabled={busy || plannedCount === 0}
              >
                {busy ? '등록 중…' : `${plannedCount}명 등록`}
              </button>
            </>
          )}
          {step === 'result' && (
            <button className="btn primary" onClick={handleClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// 8. 일차별 출석 일괄 등록 모달 — 체크박스로 선택한 참여자에게 동일 입/퇴실 시간 적용
interface BulkAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: number;
  dayNo: number;
  participants: { courseParticipantId: number; name: string }[];
  // 이미 해당 일차 출석 기록이 있는 courseParticipantId 집합 — 체크박스에서 제외
  alreadyRecordedIds: Set<number>;
  onSaved: () => void;
}

export function BulkAttendanceModal({
  isOpen,
  onClose,
  courseId,
  dayNo,
  participants,
  alreadyRecordedIds,
  onSaved,
}: BulkAttendanceModalProps) {
  const [checkInTime, setCheckInTime] = useState('09:00:00');
  const [checkOutTime, setCheckOutTime] = useState('18:00:00');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const selectableParticipants = useMemo(
    () => participants.filter((p) => !alreadyRecordedIds.has(p.courseParticipantId)),
    [participants, alreadyRecordedIds],
  );
  const alreadyRecordedCount = participants.length - selectableParticipants.length;

  useEffect(() => {
    if (!isOpen) return;
    setCheckInTime('09:00:00');
    setCheckOutTime('18:00:00');
    setSelectedIds(new Set());
  }, [isOpen, dayNo]);

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) =>
      prev.size === selectableParticipants.length
        ? new Set()
        : new Set(selectableParticipants.map((p) => p.courseParticipantId)),
    );
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      alert('출석 처리할 참여자를 선택하세요.');
      return;
    }
    if (!checkInTime) {
      alert('입실 시간을 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      await createAttendanceBulk({
        courseId,
        dayNo,
        attendances: Array.from(selectedIds).map((id) => ({
          courseParticipantId: id,
          checkInTime,
          checkOutTime: checkOutTime || undefined,
        })),
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '일괄 출석 처리에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ApiModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${dayNo}일차 출석 일괄 등록`}
      onSave={handleSave}
      saving={saving}
      note={`※ 선택한 ${selectedIds.size}명에게 동일한 입/퇴실 시간이 적용됩니다`}
    >
      <div className="form-grid">
        <div className="field">
          <label>
            입실 시간 (HH:mm:ss)<span className="req">*</span>
          </label>
          <input
            type="time"
            step="1"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
          />
        </div>
        <div className="field">
          <label>퇴실 시간 (HH:mm:ss)</label>
          <input
            type="time"
            step="1"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
          />
        </div>
        {alreadyRecordedCount > 0 && (
          <div className="field full muted" style={{ fontSize: '12px' }}>
            이미 {dayNo}일차 출석이 등록된 {alreadyRecordedCount}명은 목록에서 제외됩니다. (중복
            등록 방지 · 수정은 개별 셀에서 진행)
          </div>
        )}
      </div>

      {/* form-grid/.field 바깥 — 카스케이드 충돌 없이 기존 .chk 클래스 사용 */}
      <div style={{ marginTop: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '4px',
          }}
        >
          <label
            className="chk"
            style={{
              padding: 0,
              cursor: selectableParticipants.length === 0 ? 'default' : 'pointer',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={
                selectableParticipants.length > 0 &&
                selectedIds.size === selectableParticipants.length
              }
              onChange={toggleAll}
              disabled={selectableParticipants.length === 0}
            />
            전체 선택
          </label>
          <span className="muted" style={{ fontSize: '12px' }}>
            {selectedIds.size} / {selectableParticipants.length}명 선택
          </span>
        </div>

        <div
          style={{
            maxHeight: '260px',
            overflowY: 'auto',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '2px 12px',
          }}
        >
          {selectableParticipants.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              {dayNo}일차 출석 처리가 가능한 참여자가 없습니다.
            </div>
          )}
          {selectableParticipants.map((p, idx) => (
            <label
              key={p.courseParticipantId}
              className="chk"
              style={{
                borderBottom:
                  idx < selectableParticipants.length - 1 ? '1px solid var(--line-soft)' : 'none',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(p.courseParticipantId)}
                onChange={() => toggleOne(p.courseParticipantId)}
              />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      </div>
    </ApiModal>
  );
}