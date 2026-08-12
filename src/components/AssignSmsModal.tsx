import { useEffect, useMemo, useState } from 'react';
import { euckrByteLength, SMS_MAX_BYTES } from '../utils/smsBytes';
import type {
  SendCourseStaffSmsGroup,
  SendCourseStaffSmsResult,
  StaffNotifyTypeValue,
} from '../api/courseStaffSms';

// 모달에 표시할 변경 인원(성명·전화·역할라벨)
export type AssignSmsStaff = {
  userId: number;
  name: string;
  phone?: string;
  roleLabel?: string;
};

// 인력배정 3종 그룹 키(= BE StaffNotifyType 일부)
type GroupKey = Extract<StaffNotifyTypeValue, 'ASSIGN_NEW' | 'ASSIGN_CHANGED' | 'ASSIGN_REMOVED'>;

type AssignSmsModalProps = {
  open: boolean;
  region?: string;
  round?: number;
  startDate?: string; // 개강일 "M/d" (예: 8/18)
  isFirstAssignment: boolean;
  assignedNew: AssignSmsStaff[]; // 최초배정(ASSIGN_NEW)
  changed: AssignSmsStaff[]; // 배정/변동(ASSIGN_CHANGED)
  removed: AssignSmsStaff[]; // 제외(ASSIGN_REMOVED)
  saving: boolean; // 배정 저장 진행중
  smsSending: boolean; // 문자 발송 진행중
  smsResult: SendCourseStaffSmsResult | null;
  onCancel: () => void;
  onSaveOnly: () => void;
  onSaveAndSend: (groups: SendCourseStaffSmsGroup[]) => void;
};

// 기본 템플릿 — {region}/{round}/{startDate}/{role} 은 서버가 수신자별 치환({startDate}=개강일 M/d)
const DEFAULT_TEMPLATES: Record<GroupKey, string> = {
  ASSIGN_NEW: '[잡모아]\n{region} {round}회차({startDate}~) {role}으로 배정\n전산에서 확인 부탁드립니다',
  ASSIGN_CHANGED: '[잡모아]\n{region} {round}회차({startDate}~) 인력변동\n전산에서 확인 부탁드립니다',
  ASSIGN_REMOVED: '[잡모아]\n{region} {round}회차({startDate}~) 인력 제외\n전산에서 확인 부탁드립니다',
};

const GROUP_LABELS: Record<GroupKey, string> = {
  ASSIGN_NEW: '배정',
  ASSIGN_CHANGED: '배정 · 변동',
  ASSIGN_REMOVED: '제외',
};

// 바이트 미리보기: {region}/{round}/{startDate} 는 실제값, {role} 은 대표 라벨로 근사(서버가 최종 재확정)
function previewBytes(template: string, region?: string, round?: number, startDate?: string): number {
  const filled = template
    .replace(/\{region\}/g, region ?? '')
    .replace(/\{round\}/g, round != null ? String(round) : '')
    .replace(/\{startDate\}/g, startDate ?? '')
    .replace(/\{role\}/g, '상담사');
  return euckrByteLength(filled);
}

export default function AssignSmsModal({
  open,
  region,
  round,
  startDate,
  isFirstAssignment,
  assignedNew,
  changed,
  removed,
  saving,
  smsSending,
  smsResult,
  onCancel,
  onSaveOnly,
  onSaveAndSend,
}: AssignSmsModalProps) {
  // 활성 그룹(인원이 있는 그룹만). 최초배정이면 ASSIGN_NEW 만, 수정이면 변동/제외.
  const groups = useMemo(() => {
    const list: { key: GroupKey; staff: AssignSmsStaff[] }[] = isFirstAssignment
      ? [{ key: 'ASSIGN_NEW', staff: assignedNew }]
      : [
          { key: 'ASSIGN_CHANGED', staff: changed },
          { key: 'ASSIGN_REMOVED', staff: removed },
        ];
    return list.filter((g) => g.staff.length > 0);
  }, [isFirstAssignment, assignedNew, changed, removed]);

  const [templates, setTemplates] = useState<Record<GroupKey, string>>(DEFAULT_TEMPLATES);
  // 이번 발송에만 적용할 전화번호(성명 userId → 번호). 원본 번호로 초기화, 편집 시 갱신.
  const [phoneValues, setPhoneValues] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<Set<number>>(new Set());

  // 열릴 때마다 템플릿·전화번호 초기화
  useEffect(() => {
    if (!open) return;
    setTemplates(DEFAULT_TEMPLATES);
    const seed: Record<number, string> = {};
    [...assignedNew, ...changed, ...removed].forEach((s) => {
      seed[s.userId] = s.phone ?? '';
    });
    setPhoneValues(seed);
    setEditing(new Set());
  }, [open, assignedNew, changed, removed]);

  if (!open) return null;

  const resolvedPhone = (userId: number) => (phoneValues[userId] ?? '').trim();
  const allStaff = [...assignedNew, ...changed, ...removed];
  const missing = allStaff.filter((s) => !resolvedPhone(s.userId));
  const sendableCount = allStaff.filter((s) => resolvedPhone(s.userId)).length;

  const toggleEdit = (userId: number) => {
    setEditing((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const buildGroups = (): SendCourseStaffSmsGroup[] =>
    groups
      .map((g) => {
        const recipients = g.staff
          .filter((s) => resolvedPhone(s.userId))
          .map((s) => {
            const phone = resolvedPhone(s.userId);
            // 원본과 다르면(또는 원본이 비어있었으면) 일회성 override 로 전달
            const override = phone !== (s.phone ?? '').trim() ? phone : undefined;
            return { userId: s.userId, phoneOverride: override };
          });
        return { notifyType: g.key as StaffNotifyTypeValue, content: templates[g.key], recipients };
      })
      .filter((g) => g.recipients.length > 0);

  const busy = saving || smsSending;
  const anyExceeds = groups.some(
    (g) => previewBytes(templates[g.key], region, round, startDate) > 2000,
  );
  const canSend = sendableCount > 0 && !anyExceeds && !busy;

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal" style={{ width: 'min(1080px, 96vw)' }}>
        <div className="modal-h">
          <h3>인력 배정 안내 문자</h3>
          <button className="x" onClick={() => !busy && onCancel()}>
            ✕
          </button>
        </div>
        <div className="modal-b">
          <div style={{ marginBottom: '10px', fontSize: '13px', color: 'var(--muted)' }}>
            {region ?? ''} {round != null ? `${round}회차` : ''}
            {startDate ? `(${startDate}~)` : ''} · 발송 대상 {sendableCount}명
            {missing.length > 0 && (
              <span style={{ color: 'var(--danger)', marginLeft: '8px' }}>
                · 전화번호 없는 {missing.length}명은 발송에서 제외됩니다
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: '14px' }}>
            {/* ── 좌측: 변경 인원 · 전화번호 확인/수정 ── */}
            <div>
              <div className="cell-sub" style={{ marginBottom: '6px' }}>
                변경 인원 · 전화번호
              </div>
              {groups.map((g) => (
                <div key={g.key} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    {GROUP_LABELS[g.key]} ({g.staff.length})
                  </div>
                  {g.staff.map((s) => {
                    const phone = resolvedPhone(s.userId);
                    const isEditing = editing.has(s.userId);
                    return (
                      <div
                        key={s.userId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 0',
                          borderBottom: '1px solid var(--line, #eee)',
                        }}
                      >
                        <span className="pname" style={{ minWidth: '56px' }}>
                          {s.name}
                        </span>
                        {s.roleLabel && (
                          <span className="chip neutral" style={{ fontSize: '11px' }}>
                            {s.roleLabel}
                          </span>
                        )}
                        {isEditing ? (
                          <input
                            type="text"
                            value={phoneValues[s.userId] ?? ''}
                            placeholder="01012345678"
                            onChange={(e) =>
                              setPhoneValues((prev) => ({ ...prev, [s.userId]: e.target.value }))
                            }
                            style={{ flex: 1, fontSize: '12px', padding: '2px 6px' }}
                          />
                        ) : (
                          <span
                            className="cell-sub"
                            style={{ flex: 1, color: phone ? undefined : 'var(--danger)' }}
                          >
                            {phone || '전화번호 없음'}
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => toggleEdit(s.userId)}
                        >
                          {isEditing ? '완료' : '수정'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* ── 가운데: 발송 내용 템플릿 ── */}
            <div>
              <div className="cell-sub" style={{ marginBottom: '6px' }}>
                발송 내용 (수정 가능)
              </div>
              {groups.map((g) => {
                const bytes = previewBytes(templates[g.key], region, round, startDate);
                const format = bytes <= SMS_MAX_BYTES ? 'SMS' : 'LMS';
                return (
                  <div key={g.key} style={{ marginBottom: '12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{GROUP_LABELS[g.key]}</span>
                      <span className={`chip ${format === 'LMS' ? 'warn' : 'info'}`}>{format}</span>
                      <span
                        className="muted"
                        style={{ fontSize: '11px', color: bytes > 2000 ? 'var(--danger)' : undefined }}
                      >
                        {bytes}B
                      </span>
                    </div>
                    <textarea
                      value={templates[g.key]}
                      onChange={(e) =>
                        setTemplates((prev) => ({ ...prev, [g.key]: e.target.value }))
                      }
                      rows={4}
                      style={{ width: '100%', fontSize: '13px', padding: '6px', resize: 'vertical' }}
                    />
                  </div>
                );
              })}
              <p className="note" style={{ fontSize: '11px' }}>
                토큰: <code>{'{region}'}</code> 지역, <code>{'{round}'}</code> 회차,{' '}
                <code>{'{startDate}'}</code> 개강일(M/d)
                {isFirstAssignment && (
                  <>
                    , <code>{'{role}'}</code> 배정 역할
                  </>
                )}{' '}
                — 발송 시 수신자별로 치환됩니다.
              </p>
            </div>

            {/* ── 우측: 발송 결과 확인 ── */}
            <div>
              <div className="cell-sub" style={{ marginBottom: '6px' }}>
                발송 결과
              </div>
              {smsSending && <p className="muted">발송 중…</p>}
              {!smsSending && !smsResult && (
                <p className="muted" style={{ fontSize: '12px' }}>
                  ‘저장 및 발송’ 후 결과가 여기에 표시됩니다.
                </p>
              )}
              {smsResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <div>
                    <span className="chip info">{smsResult.messageFormat}</span>
                  </div>
                  <div>발송 대상 {smsResult.totalCount}명</div>
                  <div style={{ color: 'var(--success, green)' }}>성공 {smsResult.successCount}명</div>
                  {smsResult.failedCount > 0 && (
                    <div style={{ color: 'var(--danger)' }}>실패 {smsResult.failedCount}명</div>
                  )}
                  {smsResult.skipped.length > 0 && (
                    <div style={{ color: 'var(--danger)', fontSize: '12px' }}>
                      전화번호 없어 제외: {smsResult.skipped.map((s) => s.name ?? `#${s.userId}`).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button className="btn" onClick={onSaveOnly} disabled={busy}>
            {saving && smsResult == null ? '저장 중…' : '저장'}
          </button>
          <button
            className="btn primary-btn"
            onClick={() => onSaveAndSend(buildGroups())}
            disabled={!canSend}
            title={anyExceeds ? '본문이 2000바이트를 초과했습니다.' : undefined}
          >
            {smsSending ? '발송 중…' : '저장 및 발송'}
          </button>
        </div>
      </div>
    </div>
  );
}
