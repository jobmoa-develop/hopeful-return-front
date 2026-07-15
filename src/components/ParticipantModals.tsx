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
  changeCounselors,
  recordCounselingSession,
} from '../api/courseParticipants';
import type { CounselingType, CounselorSummary } from '../api/courseParticipants';
import { createParticipantMemo } from '../api/participantMemos';
import { apiErrorMessage } from '../api/apiError';

const COUNSELING_TYPES: CounselingType[] = ['PRE_SESSION', 'POST_SESSION_1', 'POST_SESSION_2'];
const INFLOW_OPTS = ['소진공', '워크넷', '컨설턴트 연계', '사내 타사업부', '외부 홍보(당근·벼룩)'];

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
  onSaved: () => void;
}

export function CounselingSessionModal({
  isOpen,
  onClose,
  courseParticipantId,
  counselors,
  defaultType,
  onSaved,
}: CounselingSessionModalProps) {
  const assignedTypes = useMemo(
    () => COUNSELING_TYPES.filter((type) => counselors.some((c) => c.status === type)),
    [counselors],
  );
  const [counselingType, setCounselingType] = useState<CounselingType>('PRE_SESSION');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCounselingType(defaultType ?? assignedTypes[0] ?? 'PRE_SESSION');
  }, [isOpen, defaultType, assignedTypes]);

  useEffect(() => {
    if (!isOpen) return;
    const current = counselors.find((c) => c.status === counselingType);
    setStartedAt(toInputDateTime(current?.startedAt ?? null));
    setEndedAt(toInputDateTime(current?.endedAt ?? null));
    setMemo(current?.memo ?? '');
  }, [isOpen, counselingType, counselors]);

  const currentCounselor = counselors.find((c) => c.status === counselingType);

  const handleSave = async () => {
    if (!currentCounselor) {
      alert('해당 상담 구분에 배정된 상담사가 없습니다. 상담사 배정을 먼저 진행하세요.');
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
            {COUNSELING_TYPES.map((type) => (
              <option key={type} value={type} disabled={!assignedTypes.includes(type)}>
                {COUNSELING_TYPE_LABELS[type]}
                {!assignedTypes.includes(type) ? ' (배정 없음)' : ''}
              </option>
            ))}
          </select>
        </div>
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
          />
        </div>
        <div className="field">
          <label>상담 종료 일시</label>
          <input
            type="datetime-local"
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
          />
        </div>
        <div className="field full">
          <label>상담 메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="상담 내용을 입력하세요."
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
