import { useEffect, useMemo, useRef, useState } from 'react';
import { DateInput } from './DateInput';
import type { ChangeEvent } from 'react';
import type { ParticipantListItem } from '../api/participants';
import { apiErrorMessage } from '../api/apiError';
import {
  createSmsTemplate,
  deleteSmsTemplate,
  getSmsTemplates,
  updateSmsTemplate,
} from '../api/smsTemplates';
import type { SmsTemplateItem, SmsTemplateScope } from '../api/smsTemplates';
import { sendParticipantSms, getParticipantSmsHistory } from '../api/participantSms';
import type { ParticipantSmsHistoryItem } from '../api/participantSms';
import { prepareMmsImage } from '../utils/imageBase64';
import type { PreparedMmsImage } from '../utils/imageBase64';
import {
  LMS_MAX_BYTES,
  SMS_MAX_BYTES,
  TITLE_MAX_BYTES,
  euckrByteLength,
  resolveByteState,
} from '../utils/smsBytes';

const NAME_PLACEHOLDER = '{name}';
const REGION_PLACEHOLDER = '{region}';
const ROUND_PLACEHOLDER = '{round}';

// 발송 상태·형식 칩(전송내역 표시용)
const SMS_STATUS_LABELS: Record<string, string> = { SUCCESS: '성공', FAIL: '실패', PENDING: '대기' };
function smsStatusLabel(status: string): string {
  return SMS_STATUS_LABELS[status] ?? status;
}
function smsStatusChip(status: string): string {
  if (status === 'SUCCESS') return 'ok';
  if (status === 'FAIL') return 'warn';
  return 'neutral';
}
function smsFormatChip(format: string): string {
  if (format === 'MMS') return 'ok';
  if (format === 'LMS') return 'warn';
  return 'info';
}
function fmtDateTime(iso: string | null): string {
  return iso ? iso.replace('T', ' ').slice(0, 16) : '—';
}

interface SmsSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 선택된 참여자 — latestEnrollment.courseParticipantId 로 발송 대상 구성
  recipients: ParticipantListItem[];
  // 현재 로그인 사용자 ID — 개인 템플릿 소유 판정용
  currentUserId: number | undefined;
  onSent: () => void;
}

// 지역·회차 라벨
function roundLabel(item: ParticipantListItem): string {
  const e = item.latestEnrollment;
  if (!e) return '-';
  const region = e.regionName ?? '';
  const round = e.localCourseNumber != null ? `${e.localCourseNumber}회차` : '';
  return [region, round].filter(Boolean).join(' ') || '-';
}

type TemplateForm = {
  id: number | null; // null = 신규
  scope: SmsTemplateScope;
  title: string;
  content: string;
};

export function SmsSendModal({ isOpen, onClose, recipients, currentUserId, onSent }: SmsSendModalProps) {
  const [targets, setTargets] = useState<ParticipantListItem[]>(recipients);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PreparedMmsImage[]>([]);
  const [sending, setSending] = useState(false);

  // 예약 발송(V16) — 토글 + 날짜/시간. 두 값을 합쳐 "yyyy-MM-dd HH:mm" 으로 전송
  const [reserveEnabled, setReserveEnabled] = useState(false);
  const [reserveDate, setReserveDate] = useState('');
  const [reserveClock, setReserveClock] = useState('');

  const [templates, setTemplates] = useState<SmsTemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateForm | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  // 선택자 전송내역(4번째 컬럼) — 좌측 수신자 클릭 시 해당 참여자 이력 조회
  const [selectedCpId, setSelectedCpId] = useState<number | null>(null);
  const [history, setHistory] = useState<ParticipantSmsHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  // 모달 열릴 때 선택 인원·입력 초기화
  useEffect(() => {
    if (!isOpen) return;
    setTargets(recipients);
    setTitle('');
    setContent('');
    setImages([]);
    setReserveEnabled(false);
    setReserveDate('');
    setReserveClock('');
    setTemplateForm(null);
    setSelectedCpId(null);
    setHistory([]);
  }, [isOpen, recipients]);

  // 선택자 전송내역 조회 — 좌측 수신자 클릭 시(모든 SMS_SEND 사용자에게 전체 이력 노출)
  useEffect(() => {
    if (!isOpen || selectedCpId == null) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    getParticipantSmsHistory(selectedCpId)
      .then((res) => setHistory(res.data.data?.content ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [isOpen, selectedCpId]);

  // 템플릿 목록 로드
  useEffect(() => {
    if (!isOpen) return;
    setTemplatesLoading(true);
    getSmsTemplates()
      .then((res) => setTemplates(res.data.data?.content ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [isOpen]);

  // Esc 로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const hasImage = images.length > 0;
  const byteState = useMemo(() => resolveByteState(content, hasImage), [content, hasImage]);
  const titleBytes = euckrByteLength(title);

  const courseParticipantIds = useMemo(
    () =>
      targets
        .map((t) => t.latestEnrollment?.courseParticipantId)
        .filter((id): id is number => typeof id === 'number'),
    [targets],
  );

  if (!isOpen) return null;

  const insertPlaceholder = (token: string) => {
    const el = contentRef.current;
    if (!el) {
      setContent((c) => c + token);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + token + content.slice(end);
    setContent(next);
    // 커서를 삽입 뒤로 이동
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const removeTarget = (participantId: number) => {
    setTargets((list) => list.filter((t) => t.participantId !== participantId));
  };

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일 재선택 허용
    for (const file of files) {
      try {
        const prepared = await prepareMmsImage(file);
        setImages((list) => [...list, prepared]);
      } catch (err) {
        alert(err instanceof Error ? err.message : '이미지를 첨부하지 못했습니다.');
      }
    }
  };

  const removeImage = (index: number) => {
    setImages((list) => list.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (courseParticipantIds.length === 0) {
      alert('발송 대상이 없습니다. 참여자를 선택하세요.');
      return;
    }
    if (!content.trim()) {
      alert('본문 내용을 입력하세요.');
      return;
    }
    if (byteState.exceedsMax) {
      alert(`본문이 최대 ${LMS_MAX_BYTES}바이트를 초과했습니다. 내용을 줄여주세요.`);
      return;
    }
    if (title.trim() && titleBytes > TITLE_MAX_BYTES) {
      alert(`제목은 최대 ${TITLE_MAX_BYTES}바이트까지 가능합니다.`);
      return;
    }
    // 예약 발송: 날짜·시간 입력 및 미래 시각 검증
    let reserveTime: string | undefined;
    if (reserveEnabled) {
      if (!reserveDate || !reserveClock) {
        alert('예약 발송 날짜와 시간을 모두 입력하세요.');
        return;
      }
      const when = new Date(`${reserveDate}T${reserveClock}`);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        alert('예약 발송 시각은 현재 이후여야 합니다.');
        return;
      }
      reserveTime = `${reserveDate} ${reserveClock}`;
    }

    setSending(true);
    try {
      const res = await sendParticipantSms({
        courseParticipantIds,
        title: title.trim() || undefined,
        content,
        messageFormat: byteState.format,
        images: hasImage ? images.map((img) => img.base64) : undefined,
        reserveTime,
      });
      const result = res.data.data;
      if (reserveTime) {
        alert(
          `문자 예약 완료 (${result?.messageFormat ?? byteState.format})\n` +
            `예정 시각: ${reserveTime}\n대상 ${result?.successCount ?? 0}건`,
        );
      } else {
        alert(
          `문자 발송 완료 (${result?.messageFormat ?? byteState.format})\n` +
            `성공 ${result?.successCount ?? 0}건 / 실패 ${result?.failedCount ?? 0}건`,
        );
      }
      onSent();
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, '문자 발송에 실패했습니다.'));
    } finally {
      setSending(false);
    }
  };

  // ── 템플릿 ─────────────────────────────────────────────
  const canManageTemplate = (t: SmsTemplateItem): boolean =>
    t.scope === 'SHARED' || (currentUserId != null && t.userId === currentUserId);

  const loadTemplate = (t: SmsTemplateItem) => {
    setTitle(t.title ?? '');
    setContent(t.content);
  };

  const startCreateTemplate = () => {
    setTemplateForm({ id: null, scope: 'PERSONAL', title: title.trim(), content });
  };

  const startEditTemplate = (t: SmsTemplateItem) => {
    setTemplateForm({
      id: t.smsTemplateId,
      scope: (t.scope as SmsTemplateScope) ?? 'PERSONAL',
      title: t.title ?? '',
      content: t.content,
    });
  };

  const refreshTemplates = () =>
    getSmsTemplates()
      .then((res) => setTemplates(res.data.data?.content ?? []))
      .catch(() => undefined);

  const saveTemplate = async () => {
    if (!templateForm) return;
    if (!templateForm.content.trim()) {
      alert('템플릿 내용을 입력하세요.');
      return;
    }
    setTemplateSaving(true);
    try {
      if (templateForm.id == null) {
        await createSmsTemplate({
          scope: templateForm.scope,
          title: templateForm.title.trim() || undefined,
          content: templateForm.content,
        });
      } else {
        await updateSmsTemplate(templateForm.id, {
          title: templateForm.title.trim() || undefined,
          content: templateForm.content,
        });
      }
      await refreshTemplates();
      setTemplateForm(null);
    } catch (err) {
      alert(apiErrorMessage(err, '템플릿 저장에 실패했습니다.'));
    } finally {
      setTemplateSaving(false);
    }
  };

  const removeTemplate = async (t: SmsTemplateItem) => {
    if (!confirm(`템플릿을 삭제하시겠습니까?\n"${t.title ?? t.content.slice(0, 20)}"`)) return;
    try {
      await deleteSmsTemplate(t.smsTemplateId);
      await refreshTemplates();
    } catch (err) {
      alert(apiErrorMessage(err, '템플릿 삭제에 실패했습니다.'));
    }
  };

  const formatChipClass =
    byteState.format === 'SMS' ? 'info' : byteState.format === 'LMS' ? 'warn' : 'ok';

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal sms-modal">
        <div className="modal-h">
          <h3>문자 발송</h3>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-b">
          <div className="sms-grid">
            {/* 좌: 선택 인원 */}
            <section className="sms-col">
              <div className="sms-col-h">
                수신 대상 <span className="chip info">{targets.length}명</span>
              </div>
              <div className="sms-recipient-list">
                {targets.length === 0 && <p className="muted">선택된 참여자가 없습니다.</p>}
                {targets.map((t) => {
                  const cpId = t.latestEnrollment?.courseParticipantId ?? null;
                  const selected = cpId != null && cpId === selectedCpId;
                  return (
                    <div key={t.participantId} className={`sms-recipient${selected ? ' selected' : ''}`}>
                      <div
                        className="sms-recipient-info"
                        style={{ cursor: cpId != null ? 'pointer' : 'default' }}
                        title={cpId != null ? '전송내역 보기' : ''}
                        onClick={() => cpId != null && setSelectedCpId(cpId)}
                      >
                        <b>{t.name}</b>
                        <span className="muted">{t.phone}</span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {roundLabel(t)}
                        </span>
                      </div>
                      <button
                        className="x-sm"
                        title="대상에서 제외"
                        onClick={() => removeTarget(t.participantId)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 중: 작성 */}
            <section className="sms-col">
              <div className="field">
                <label>
                  제목 <span className="muted">(LMS/MMS 전용 · {titleBytes}/{TITLE_MAX_BYTES}B)</span>
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예) 수료 안내"
                />
              </div>

              <div className="field">
                <label>
                  본문{' '}
                  <button type="button" className="btn tiny" onClick={() => insertPlaceholder(NAME_PLACEHOLDER)}>
                    {NAME_PLACEHOLDER} 삽입
                  </button>{' '}
                  <button type="button" className="btn tiny" onClick={() => insertPlaceholder(REGION_PLACEHOLDER)}>
                    {REGION_PLACEHOLDER} 지역
                  </button>{' '}
                  <button type="button" className="btn tiny" onClick={() => insertPlaceholder(ROUND_PLACEHOLDER)}>
                    {ROUND_PLACEHOLDER} 회차
                  </button>
                </label>
                <textarea
                  ref={contentRef}
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="{name}님, 안녕하세요."
                />
              </div>

              <div className="sms-meta">
                <span className={`chip ${formatChipClass}`}>{byteState.format}</span>
                <span className={byteState.exceedsMax ? 'danger' : 'muted'}>
                  {byteState.bytes}B / {byteState.format === 'SMS' ? SMS_MAX_BYTES : LMS_MAX_BYTES}B
                </span>
                {byteState.exceedsMax && <span className="danger">본문 초과</span>}
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                ※ {NAME_PLACEHOLDER}=성명, {REGION_PLACEHOLDER}=지역, {ROUND_PLACEHOLDER}=회차 로 수신자별 치환됩니다.
                치환 결과에 따라 길이가 달라질 수 있으며, 실제 발송 형식은 서버가 재확정합니다.
              </p>

              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={reserveEnabled}
                    onChange={(e) => setReserveEnabled(e.target.checked)}
                  />{' '}
                  예약 발송
                </label>
                {reserveEnabled && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <DateInput
                      value={reserveDate}
                      onChange={(e) => setReserveDate(e.target.value)}
                    />
                    <input
                      type="time"
                      value={reserveClock}
                      onChange={(e) => setReserveClock(e.target.value)}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      (현재 이후 시각)
                    </span>
                  </div>
                )}
              </div>

              <div className="field">
                <label>이미지 첨부 (MMS · jpg/jpeg · ≤300KB · ≤1500×1440)</label>
                <input type="file" accept="image/jpeg" multiple onChange={handleImageChange} />
                {hasImage && (
                  <div className="sms-thumbs">
                    {images.map((img, i) => (
                      <div key={i} className="sms-thumb">
                        <img src={img.dataUrl} alt={img.fileName} />
                        <button className="x-sm" onClick={() => removeImage(i)} title="이미지 제거">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* 우: 템플릿 */}
            <section className="sms-col">
              <div className="sms-col-h">
                템플릿
                <button type="button" className="btn tiny" onClick={startCreateTemplate}>
                  + 현재 내용 저장
                </button>
              </div>

              {templateForm && (
                <div className="sms-tpl-form">
                  <div className="sms-tpl-form-h">
                    {templateForm.id == null ? '새 템플릿' : '템플릿 수정'}
                  </div>
                  {templateForm.id == null && (
                    <div className="sms-scope">
                      <label>
                        <input
                          type="radio"
                          checked={templateForm.scope === 'PERSONAL'}
                          onChange={() => setTemplateForm((f) => (f ? { ...f, scope: 'PERSONAL' } : f))}
                        />
                        개인
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={templateForm.scope === 'SHARED'}
                          onChange={() => setTemplateForm((f) => (f ? { ...f, scope: 'SHARED' } : f))}
                        />
                        공용
                      </label>
                    </div>
                  )}
                  <input
                    placeholder="제목"
                    value={templateForm.title}
                    onChange={(e) => setTemplateForm((f) => (f ? { ...f, title: e.target.value } : f))}
                  />
                  <textarea
                    rows={4}
                    placeholder="내용"
                    value={templateForm.content}
                    onChange={(e) =>
                      setTemplateForm((f) => (f ? { ...f, content: e.target.value } : f))
                    }
                  />
                  <div className="sms-tpl-form-f">
                    <button className="btn tiny" onClick={() => setTemplateForm(null)} disabled={templateSaving}>
                      취소
                    </button>
                    <button className="btn tiny primary" onClick={saveTemplate} disabled={templateSaving}>
                      {templateSaving ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </div>
              )}

              <div className="sms-tpl-list">
                {templatesLoading && <p className="muted">불러오는 중…</p>}
                {!templatesLoading && templates.length === 0 && (
                  <p className="muted">저장된 템플릿이 없습니다.</p>
                )}
                {templates.map((t) => (
                  <div key={t.smsTemplateId} className="sms-tpl-item">
                    <button className="sms-tpl-load" onClick={() => loadTemplate(t)} title="내용 불러오기">
                      <span className={`chip ${t.scope === 'SHARED' ? 'ok' : 'neutral'}`}>
                        {t.scope === 'SHARED' ? '공용' : '개인'}
                      </span>
                      <b>{t.title || '(제목 없음)'}</b>
                      <span className="muted sms-tpl-preview">{t.content}</span>
                    </button>
                    {canManageTemplate(t) && (
                      <div className="sms-tpl-actions">
                        <button className="btn tiny" onClick={() => startEditTemplate(t)}>
                          수정
                        </button>
                        <button className="btn tiny danger-btn" onClick={() => removeTemplate(t)}>
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 우: 선택자 전송내역 */}
            <section className="sms-col">
              <div className="sms-col-h">선택자 전송내역</div>
              {selectedCpId == null ? (
                <p className="muted">좌측에서 수신자를 클릭하면 전송내역이 표시됩니다.</p>
              ) : historyLoading ? (
                <p className="muted">불러오는 중…</p>
              ) : history.length === 0 ? (
                <p className="muted">발송 내역이 없습니다.</p>
              ) : (
                <div className="sms-history-list">
                  {history.map((h) => (
                    <div key={h.smsId} className="sms-history-item">
                      <div className="sms-history-meta">
                        <span className={`chip ${smsFormatChip(h.messageFormat)}`}>{h.messageFormat}</span>
                        <span className={`chip ${smsStatusChip(h.sendStatus)}`}>
                          {smsStatusLabel(h.sendStatus)}
                        </span>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {fmtDateTime(h.sentAt)}
                        </span>
                      </div>
                      {h.title && <b style={{ fontSize: 12 }}>{h.title}</b>}
                      <div className="muted sms-history-content">{h.content}</div>
                      {h.sendStatus === 'FAIL' && h.resultMessage && (
                        <div style={{ fontSize: 11, color: 'var(--danger)' }}>
                          실패 사유: {h.resultMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="modal-f">
          <span className="modal-note">
            {reserveEnabled
              ? '※ 예약 시각에 SENS 를 통해 발송됩니다'
              : '※ 발송 시 SENS 를 통해 즉시 전송됩니다'}
          </span>
          <button className="btn" onClick={onClose} disabled={sending}>
            취소
          </button>
          <button
            className="btn primary"
            onClick={handleSend}
            disabled={sending || courseParticipantIds.length === 0 || byteState.exceedsMax}
          >
            {sending
              ? reserveEnabled
                ? '예약 중…'
                : '발송 중…'
              : reserveEnabled
                ? `문자 예약 (${courseParticipantIds.length}명)`
                : `문자 발송 (${courseParticipantIds.length}명)`}
          </button>
        </div>
      </div>
    </div>
  );
}
