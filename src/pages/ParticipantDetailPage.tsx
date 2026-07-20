import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import {
  COUNSELING_TYPE_LABELS,
  CP_STATUS_CHIP,
  CP_STATUS_LABELS,
  getCourseParticipant,
  increaseContactAttempt,
} from '../api/courseParticipants';
import type {
  CounselingType,
  CounselorSummary,
  CourseParticipantDetail,
  CourseParticipantStatus,
} from '../api/courseParticipants';
import {
  getAttendances,
  ATTENDANCE_STATUS_LABELS,
  getCompletionRisk,
  RISK_STATUS_LABELS,
  RISK_STATUS_CHIP,
} from '../api/attendances';
import type { AttendanceListItem, AttendanceStatus, CompletionRiskItem } from '../api/attendances';
import { getParticipantMemos } from '../api/participantMemos';
import type { ParticipantMemoItem } from '../api/participantMemos';
import {
  CounselorEditModal,
  CounselingSessionModal,
  ParticipantMemoModal,
  StatusChangeModal,
} from '../components/ParticipantModals';
import { apiErrorMessage } from '../api/apiError';

const TOTAL_COURSE_DAYS = 5;

type StepState = 'done' | 'current' | 'idle';

// "YYYY-MM-DDTHH:mm:ss" → "MM-DD HH:mm"
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  return `${value.slice(5, 10)} ${value.slice(11, 16)}`;
}

function slotOf(
  counselors: CounselorSummary[],
  type: CounselingType,
): CounselorSummary | undefined {
  return counselors.find((c) => c.status === type);
}

export default function ParticipantDetailPage() {
  const { courseParticipantId } = useParams<{ courseParticipantId: string }>();
  const cpId = Number(courseParticipantId);
  const navigate = useNavigate();
  const { roleConfig } = useRole();
  const { user } = useAuth();
  const currentUserId = user?.userId;
  const isCounselorOnly = roleConfig.role === 'COUNSELOR';

  const [detail, setDetail] = useState<CourseParticipantDetail | null>(null);
  const [attendances, setAttendances] = useState<AttendanceListItem[]>([]);
  const [riskInfo, setRiskInfo] = useState<CompletionRiskItem | null>(null);
  const [memos, setMemos] = useState<ParticipantMemoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<
    'counselor' | 'session' | 'memo' | 'status' | null
  >(null);
  const [sessionType, setSessionType] = useState<CounselingType>('PRE_SESSION');

  const fetchAll = useCallback(() => {
    if (!Number.isFinite(cpId)) {
      setError('잘못된 참여자 상세 경로입니다.');
      return;
    }
    setError(null);
    getCourseParticipant(cpId)
      .then((res) => {
        const d = res.data.data;
        setDetail(d);
        // 출결 기반 수료 위험도 — 회차 단위 조회 후 이 수강건 항목만 추출
        if (d?.courseId != null) {
          getCompletionRisk(d.courseId)
            .then((r) => {
              const items = r.data.data?.items ?? [];
              setRiskInfo(items.find((it) => it.courseParticipantId === cpId) ?? null);
            })
            .catch(() => setRiskInfo(null));
        } else {
          setRiskInfo(null);
        }
      })
      .catch((err) => setError(apiErrorMessage(err, '참여자 정보를 불러오지 못했습니다.')));
    getAttendances({ courseParticipantId: cpId, size: 100 })
      .then((res) => setAttendances(res.data.data?.content ?? []))
      .catch(() => setAttendances([]));
    getParticipantMemos(cpId)
      .then((res) => setMemos(res.data.data?.content ?? []))
      .catch(() => setMemos([]));
  }, [cpId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const attendedDays = useMemo(
    () => attendances.filter((a) => a.status === 'ATTEND' || a.status === 'LATE').length,
    [attendances],
  );

  const journey = useMemo(() => {
    if (!detail) return null;
    const status = detail.status as CourseParticipantStatus;
    const pre = slotOf(detail.counselors, 'PRE_SESSION')?.completed ?? false;
    const post1 = slotOf(detail.counselors, 'POST_SESSION_1')?.completed ?? false;
    const post2 = slotOf(detail.counselors, 'POST_SESSION_2')?.completed ?? false;
    const isSelected = status !== 'APPLIED' && status !== 'CANCELED';
    const isCompleted = status === 'COMPLETED';

    const selection: StepState = isSelected ? 'done' : status === 'APPLIED' ? 'current' : 'idle';
    const preStep: StepState = pre ? 'done' : isSelected ? 'current' : 'idle';
    const education: StepState =
      isCompleted || status === 'INCOMPLETE' ? 'done' : attendedDays > 0 ? 'current' : 'idle';
    const completion: StepState = isCompleted ? 'done' : attendedDays > 0 ? 'current' : 'idle';
    const post1Step: StepState = post1 ? 'done' : isCompleted ? 'current' : 'idle';
    const post2Step: StepState = post2 ? 'done' : post1 ? 'current' : 'idle';

    return { selection, preStep, education, completion, post1Step, post2Step };
  }, [detail, attendedDays]);

  const handleContactAttempt = async () => {
    try {
      await increaseContactAttempt(cpId);
      fetchAll();
    } catch (err) {
      alert(apiErrorMessage(err, '연락 시도 기록에 실패했습니다.'));
    }
  };

  const openSession = (type: CounselingType) => {
    setSessionType(type);
    setActiveModal('session');
  };

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <button className="back" onClick={() => navigate('/participants')}>
          ← 참여자 목록
        </button>
        <h2>{error}</h2>
      </div>
    );
  }

  if (!detail || !journey) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
        불러오는 중…
      </div>
    );
  }

  const status = detail.status as CourseParticipantStatus;
  const statusChip = CP_STATUS_CHIP[status] ?? 'neutral';
  const statusLabel = CP_STATUS_LABELS[status] ?? detail.status;
  const canChangeStatus = roleConfig.can.editP === 1;
  const preSlot = slotOf(detail.counselors, 'PRE_SESSION');
  const post1Slot = slotOf(detail.counselors, 'POST_SESSION_1');
  const post2Slot = slotOf(detail.counselors, 'POST_SESSION_2');
  // 상담 세션 기록 버튼 노출: consult 권한 + (관리 롤이거나 본인 배정 슬롯) — 미배정 슬롯 편집 차단
  const canRecordSlot = (slot?: CounselorSummary) =>
    roleConfig.can.consult === 1 &&
    (!isCounselorOnly || (slot != null && slot.counselorId === currentUserId));
  const roundText = [
    detail.regionName,
    detail.localCourseNumber != null ? `${detail.localCourseNumber}회차` : detail.courseName,
  ]
    .filter(Boolean)
    .join(' · ');

  const attendanceByDay = new Map<number, AttendanceListItem>();
  for (const a of attendances) {
    if (a.dayNo != null) attendanceByDay.set(a.dayNo, a);
  }
  const leaves = attendances.flatMap((a) => a.leaves.map((l) => ({ dayNo: a.dayNo, ...l })));

  return (
    <section className="view active" id="view-participant-detail">
      <button className="back" onClick={() => navigate('/participants')}>
        ← 참여자 목록
      </button>

      <div className="detail-head">
        <div className="pa" id="d-avatar">
          {detail.participantName.charAt(0)}
        </div>
        <div>
          <div className="pn" id="d-name">
            {detail.participantName}
          </div>
          <div className="pm">
            <span>
              <b id="d-region">{roundText || '—'}</b>
            </span>
            <span>
              참여자ID <b id="d-pid">{detail.matchKey ?? '—'}</b>
            </span>
            <span>
              출생연도 <b>{detail.birthYear ?? '—'}</b>
            </span>
            <span>
              연락처 <b>{detail.phone ?? '—'}</b>
            </span>
            <span>
              유입 <b>{detail.inflowType ?? '—'}</b>
            </span>
          </div>
        </div>
        <div className="actions">
          {canChangeStatus && (
            <button className="btn" title="진행상태 변경" onClick={() => setActiveModal('status')}>
              진행상태 변경 · {statusLabel}
            </button>
          )}
          {roleConfig.can.consult === 1 && (
            <button className="btn" id="btn-consult" onClick={() => navigate('/consulting')}>
              상담 관리
            </button>
          )}
          {canChangeStatus && (
            <button
              className="btn primary"
              id="btn-edit-counselor"
              onClick={() => setActiveModal('counselor')}
            >
              상담사 변경
            </button>
          )}
        </div>
      </div>

      {/* Journey Rail — 데이터(상담 완료·출결·진행상태) 파생 표시 */}
      <div className="journey">
        <div className="jh">
          <span className="eyebrow">참여자 여정</span>
          <span className={`chip ${statusChip}`} id="d-status">
            {statusLabel}
          </span>
          {riskInfo && (
            <span
              className={`chip ${RISK_STATUS_CHIP[riskInfo.riskStatus]}`}
              title="출결 기반 수료 위험도 (서버 계산값)"
            >
              출석률 {riskInfo.attendanceRate.toFixed(1)}% ·{' '}
              {RISK_STATUS_LABELS[riskInfo.riskStatus]}
            </span>
          )}
        </div>
        <div className="rail">
          <div className="step done">
            <div className="node">✓</div>
            <div className="sl">접수</div>
            <div className="sd">{detail.receptionDate?.slice(5) ?? '—'}</div>
          </div>
          <div className={`step ${journey.selection}`}>
            <div className="node">
              {journey.selection === 'done' ? '✓' : journey.selection === 'current' ? <i></i> : ''}
            </div>
            <div className="sl">선정</div>
            <div className="sd">소진공 선정</div>
          </div>
          <div className={`step ${journey.preStep}`}>
            <div className="node">
              {journey.preStep === 'done' ? '✓' : journey.preStep === 'current' ? <i></i> : ''}
            </div>
            <div className="sl">사전상담</div>
            <div className="sd">
              {preSlot?.endedAt ? `대면 · ${preSlot.endedAt.slice(5, 10)}` : '대면 1회'}
            </div>
          </div>
          <div className={`step ${journey.education}`}>
            <div className="node">
              {journey.education === 'done' ? '✓' : journey.education === 'current' ? <i></i> : ''}
            </div>
            <div className="sl">현장교육</div>
            <div className="sd">
              {attendedDays}일차 / {TOTAL_COURSE_DAYS}일
            </div>
          </div>
          <div className={`step ${journey.completion}`}>
            <div className="node">
              {journey.completion === 'done' ? (
                '✓'
              ) : journey.completion === 'current' ? (
                <i></i>
              ) : (
                ''
              )}
            </div>
            <div className="sl">수료</div>
            <div className="sd">
              {detail.completionDate
                ? detail.completionDate.slice(5)
                : status === 'INCOMPLETE'
                  ? '미수료'
                  : '예정'}
            </div>
          </div>
          <div className={`step ${journey.post1Step}`}>
            <div className="node">
              {journey.post1Step === 'done' ? '✓' : journey.post1Step === 'current' ? <i></i> : ''}
            </div>
            <div className="sl">사후상담 1차</div>
            <div className="sd">{post1Slot?.endedAt ? post1Slot.endedAt.slice(5, 10) : '대면'}</div>
          </div>
          <div className={`step ${journey.post2Step}`}>
            <div className="node">
              {journey.post2Step === 'done' ? '✓' : journey.post2Step === 'current' ? <i></i> : ''}
            </div>
            <div className="sl">사후상담 2차</div>
            <div className="sd">{post2Slot?.endedAt ? post2Slot.endedAt.slice(5, 10) : '대면'}</div>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h">
              <span className="section-title">유입 · 자격</span>
            </div>
            <div className="card-b">
              <div className="kv">
                <span className="k">유입 경로</span>
                <span className="v">{detail.inflowType ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="k">접수일 / 신청일</span>
                <span className="v">
                  {detail.receptionDate ?? '—'} / {detail.applyDate ?? '—'}
                </span>
              </div>
              <div className="kv">
                <span className="k">기초교육 수료</span>
                <span className="v">
                  <span className={`chip ${detail.basicEducation === 'Y' ? 'ok' : 'warn'}`}>
                    {detail.basicEducation === 'Y'
                      ? '확인 완료'
                      : (detail.basicEducation ?? '확인 필요')}
                  </span>
                </span>
              </div>
              <div className="kv">
                <span className="k">연락 시도</span>
                <span className="v">
                  {detail.contactAttempt ?? 0}회
                  {roleConfig.can.consult === 1 && (
                    <button
                      className="btn"
                      style={{ marginLeft: '8px', padding: '3px 8px', fontSize: '11px' }}
                      onClick={handleContactAttempt}
                    >
                      +1 기록
                    </button>
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <span className="section-title">사전상담 (대면)</span>
              {canRecordSlot(preSlot) && (
                <button
                  className="btn"
                  style={{ marginLeft: 'auto', padding: '5px 11px', fontSize: '12px' }}
                  onClick={() => openSession('PRE_SESSION')}
                >
                  기록
                </button>
              )}
            </div>
            <div className="card-b">
              <div className="kv">
                <span className="k">담당 상담사</span>
                <span className="v">{preSlot?.counselorName ?? '배정 전'}</span>
              </div>
              <div className="kv">
                <span className="k">상담 일시</span>
                <span className="v">
                  {preSlot?.startedAt
                    ? `${formatDateTime(preSlot.startedAt)}${preSlot.endedAt ? ` ~ ${formatDateTime(preSlot.endedAt).slice(-5)}` : ''}`
                    : '미일정'}
                </span>
              </div>
              <div className="kv">
                <span className="k">완료 여부</span>
                <span className="v">
                  <span className={`chip ${preSlot?.completed ? 'ok' : 'neutral'}`}>
                    {preSlot?.completed ? '완료' : '미완료'}
                  </span>
                </span>
              </div>
              {preSlot?.memo && (
                <div className="kv">
                  <span className="k">상담 메모</span>
                  <span className="v">{preSlot.memo}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h">
              <span className="section-title">출결 현황 (일자별)</span>
            </div>
            <div className="card-b">
              <div className="att-grid">
                {Array.from({ length: TOTAL_COURSE_DAYS }, (_, i) => i + 1).map((day) => {
                  const record = attendanceByDay.get(day);
                  const label = record?.status
                    ? (ATTENDANCE_STATUS_LABELS[record.status as AttendanceStatus] ?? record.status)
                    : '—';
                  const cls =
                    record?.status === 'ATTEND'
                      ? 'ok'
                      : record?.status === 'LATE'
                        ? 'warn'
                        : record?.status === 'ABSENT'
                          ? 'danger'
                          : '';
                  return (
                    <div className={`att-day ${cls}`} key={day}>
                      <div className="d">{day}일</div>
                      <div className="s">{label}</div>
                    </div>
                  );
                })}
              </div>
              {leaves.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  {leaves.map((l) => (
                    <div className="kv" key={l.attendanceLeaveId}>
                      <span className="k">{l.dayNo != null ? `${l.dayNo}일차 ` : ''}외출·조퇴</span>
                      <span className="v">
                        {(l.leaveTime ?? '').slice(0, 5)}
                        {l.returnTime ? ` ~ ${l.returnTime.slice(0, 5)}` : ''}
                        {l.reason ? ` (${l.reason})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted" style={{ fontSize: '11.5px', marginTop: '6px' }}>
                · 지각도 출석으로 집계 · 외출·조퇴는 시간 기록으로 관리
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="section-title">수료</span>
            </div>
            <div className="card-b">
              <div className="kv">
                <span className="k">수료 여부</span>
                <span className="v">
                  <span className={`chip ${statusChip}`}>{statusLabel}</span>
                </span>
              </div>
              <div className="kv">
                <span className="k">수료일</span>
                <span className="v">{detail.completionDate ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="k">수료 위험도</span>
                <span className="v">
                  {riskInfo ? (
                    <span className={`chip ${RISK_STATUS_CHIP[riskInfo.riskStatus]}`}>
                      {RISK_STATUS_LABELS[riskInfo.riskStatus]} · 출석률{' '}
                      {riskInfo.attendanceRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="muted">집계 전</span>
                  )}
                </span>
              </div>
              <p className="muted" style={{ fontSize: '11.5px', marginTop: '6px' }}>
                · 수료/미수료 처리는 상단 진행상태 변경으로 반영됩니다. · 위험도는 출결 기준 서버
                판정값입니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">사후상담 (대면 2회)</span>
          {canRecordSlot(post1Slot?.completed ? post2Slot : post1Slot) && (
            <button
              className="btn"
              style={{ marginLeft: 'auto', padding: '5px 11px', fontSize: '12px' }}
              onClick={() =>
                openSession(post1Slot?.completed ? 'POST_SESSION_2' : 'POST_SESSION_1')
              }
            >
              기록
            </button>
          )}
        </div>
        <div className="card-b">
          <div className="detail-grid" style={{ gap: '18px' }}>
            {(
              [
                ['POST_SESSION_1', post1Slot],
                ['POST_SESSION_2', post2Slot],
              ] as const
            ).map(([type, slot]) => (
              <div key={type}>
                <div className="eyebrow" style={{ marginBottom: '8px' }}>
                  {COUNSELING_TYPE_LABELS[type]}
                </div>
                <div className="kv">
                  <span className="k">담당 상담사</span>
                  <span className="v">{slot?.counselorName ?? '배정 전'}</span>
                </div>
                <div className="kv">
                  <span className="k">상담 일시</span>
                  <span className="v">
                    {slot?.startedAt ? formatDateTime(slot.startedAt) : '예정'}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">완료 여부</span>
                  <span className="v">
                    <span className={`chip ${slot?.completed ? 'ok' : 'neutral'}`}>
                      {slot?.completed ? '완료' : '—'}
                    </span>
                  </span>
                </div>
                {slot?.memo && (
                  <div className="kv">
                    <span className="k">상담 메모</span>
                    <span className="v">{slot.memo}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">메모 (비고)</span>
          <span className="chip neutral">지역담당자 · 상담사 · 강사 작성</span>
          {roleConfig.can.memo === 1 && (
            <button
              className="btn"
              id="btn-memo"
              style={{ marginLeft: 'auto', padding: '5px 11px', fontSize: '12px' }}
              onClick={() => setActiveModal('memo')}
            >
              + 메모 추가
            </button>
          )}
        </div>
        <div id="memo-list">
          {memos.map((m) => (
            <div className="memo-item" key={m.memoId}>
              <div className="memo-av">{(m.writerName ?? '?').charAt(0)}</div>
              <div className="memo-body" style={{ flex: 1 }}>
                <div className="memo-head">
                  <b>{m.writerName ?? '알 수 없음'}</b>
                  <span className="memo-date">{formatDateTime(m.createdAt)}</span>
                </div>
                <div className="memo-txt">{m.content}</div>
              </div>
            </div>
          ))}
          {memos.length === 0 && (
            <p className="muted" style={{ padding: '14px', fontSize: '12px' }}>
              등록된 메모가 없습니다.
            </p>
          )}
        </div>
      </div>

      <p className="note">※ 한 참여자의 유입~사후상담 전 과정이 이 한 화면에 모입니다.</p>

      {/* Modals */}
      <CounselorEditModal
        isOpen={activeModal === 'counselor'}
        onClose={() => setActiveModal(null)}
        courseParticipantId={cpId}
        counselors={detail.counselors}
        onSaved={fetchAll}
      />
      <CounselingSessionModal
        isOpen={activeModal === 'session'}
        onClose={() => setActiveModal(null)}
        courseParticipantId={cpId}
        counselors={detail.counselors}
        defaultType={sessionType}
        currentUserId={currentUserId}
        counselorOnly={isCounselorOnly}
        onSaved={fetchAll}
      />
      <ParticipantMemoModal
        isOpen={activeModal === 'memo'}
        onClose={() => setActiveModal(null)}
        courseParticipantId={cpId}
        onSaved={fetchAll}
      />
      <StatusChangeModal
        isOpen={activeModal === 'status'}
        onClose={() => setActiveModal(null)}
        courseParticipantId={cpId}
        currentStatus={detail.status}
        riskStatus={riskInfo?.riskStatus}
        attendanceRate={riskInfo?.attendanceRate}
        onSaved={fetchAll}
      />
    </section>
  );
}
