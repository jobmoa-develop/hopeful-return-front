import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
  getQrLanding,
  verifyQr,
  qrCheckIn,
  qrLeave,
  qrLeaveReturn,
  qrCheckOut,
  getQrHistory,
} from '../api/publicQr';
import type { QrLanding, QrStatus, QrHistory } from '../api/publicQr';
import { apiErrorMessage } from '../api/apiError';
import './qr.css';

// "HH:mm:ss" → "HH:mm" 표시용
function hm(value: string | null): string {
  if (!value) return '-';
  return value.slice(0, 5);
}

const STATUS_LABELS: Record<string, string> = {
  ATTEND: '출석',
  LATE: '지각',
  ABSENT: '결석',
};

function statusLabel(status: string | null): string {
  if (!status) return '-';
  return STATUS_LABELS[status] ?? status;
}

type VerifyCreds = { name: string; phoneLast4: string };

export default function QrCheckInPage() {
  const { courseId: courseIdParam } = useParams();
  const courseId = Number(courseIdParam);
  const storageKey = `qr-verify-${courseId}`;

  const [landing, setLanding] = useState<QrLanding | null>(null);
  const [landingError, setLandingError] = useState('');
  const [landingLoading, setLandingLoading] = useState(true);

  const [name, setName] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [status, setStatus] = useState<QrStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [history, setHistory] = useState<QrHistory | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const isValidCourse = Number.isFinite(courseId) && courseId > 0;

  // 랜딩 정보 로드 + 저장된 본인확인 값 프리필
  useEffect(() => {
    if (!isValidCourse) {
      setLandingError('잘못된 접근입니다. QR을 다시 확인해주세요.');
      setLandingLoading(false);
      return;
    }
    let active = true;
    setLandingLoading(true);
    getQrLanding(courseId)
      .then(({ data: res }) => {
        if (active) setLanding(res.data);
      })
      .catch((err) => {
        if (active) setLandingError(apiErrorMessage(err, '회차 정보를 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (active) setLandingLoading(false);
      });

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const savedCreds = JSON.parse(saved) as VerifyCreds;
        if (savedCreds?.name) setName(savedCreds.name);
        if (savedCreds?.phoneLast4) setPhoneLast4(savedCreds.phoneLast4);
      }
    } catch {
      // 무시: 저장값이 손상되어도 폼은 빈 채로 진행
    }
    return () => {
      active = false;
    };
  }, [courseId, isValidCourse, storageKey]);

  const creds = useMemo<VerifyCreds>(
    () => ({ name: name.trim(), phoneLast4: phoneLast4.trim() }),
    [name, phoneLast4],
  );

  const persistCreds = () => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(creds));
    } catch {
      // localStorage 불가(사생활 모드 등) 시 무시 — 세션 상태로만 유지
    }
  };

  const isFormValid = creds.name.length > 0 && /^\d{4}$/.test(creds.phoneLast4);

  const handleVerify = async () => {
    if (!isFormValid) {
      setError('성명과 전화번호 뒤 4자리(숫자 4자리)를 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: res } = await verifyQr(courseId, creds);
      setStatus(res.data);
      persistCreds();
    } catch (err) {
      setError(apiErrorMessage(err, '본인 확인에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  // 공통 액션 실행기 — QrStatus를 반환하는 API를 호출하고 상태 갱신
  const runAction = async (
    fn: () => Promise<{ data: { data: QrStatus } }>,
    onDone?: () => void,
  ) => {
    setBusy(true);
    setError('');
    try {
      const { data: res } = await fn();
      setStatus(res.data);
      onDone?.();
    } catch (err) {
      setError(apiErrorMessage(err, '요청 처리 중 오류가 발생했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckIn = () => runAction(() => qrCheckIn(courseId, creds));
  const handleCheckOut = () => runAction(() => qrCheckOut(courseId, creds));

  // 시각은 서버가 현재시각으로 기록 — 버튼 클릭만으로 외출/복귀 처리(입실·퇴실과 동일).
  const handleLeave = () => {
    void runAction(() => qrLeave(courseId, creds));
  };

  const handleReturn = (attendanceLeaveId: number) => {
    void runAction(() => qrLeaveReturn(courseId, { ...creds, attendanceLeaveId }));
  };

  const handleShowHistory = async () => {
    setBusy(true);
    setError('');
    try {
      const { data: res } = await getQrHistory(courseId, creds);
      setHistory(res.data);
      setShowHistory(true);
    } catch (err) {
      setError(apiErrorMessage(err, '내역을 불러오지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setStatus(null);
    setHistory(null);
    setShowHistory(false);
    setError('');
  };

  // ── 렌더 ──
  const header = (
    <div className="qr-head">
      <h1>입·퇴실 확인</h1>
      {landing ? (
        <>
          <div className="qr-sub">
            {[landing.regionName, landing.courseName].filter(Boolean).join(' · ')}
          </div>
          {landing.dayNo ? (
            <span className="qr-daychip">
              {landing.dayNo}일차 · {hm(landing.educationStartTime)}~{hm(landing.educationEndTime)}
            </span>
          ) : (
            <span
              className="qr-daychip"
              style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}
            >
              오늘은 교육일이 아닙니다
            </span>
          )}
        </>
      ) : (
        <div className="qr-sub">{landingLoading ? '회차 정보 불러오는 중…' : '회차 정보 없음'}</div>
      )}
    </div>
  );

  if (!isValidCourse || landingError) {
    return (
      <div className="qr-page">
        <div className="qr-card">
          {header}
          <div className="qr-error">{landingError || '잘못된 접근입니다.'}</div>
        </div>
      </div>
    );
  }

  // 복귀하지 않은 외출(외출 중)이 있으면, 액션 버튼을 "복귀하기"로 바꿔 현재 상태를 알 수 있게 한다.
  const openLeave = status ? (status.leaves.find((lv) => !lv.returnTime) ?? null) : null;

  return (
    <div className="qr-page">
      <div className="qr-card">
        {header}

        {error && <div className="qr-error">{error}</div>}

        {!status ? (
          // 본인확인 폼
          <>
            <div className="qr-field">
              <label htmlFor="qr-name">성명</label>
              <input
                id="qr-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                autoComplete="name"
              />
            </div>
            <div className="qr-field">
              <label htmlFor="qr-phone">전화번호 뒤 4자리</label>
              <input
                id="qr-phone"
                value={phoneLast4}
                onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
              />
            </div>
            <button
              className="qr-btn"
              type="button"
              onClick={handleVerify}
              disabled={busy || !isFormValid}
            >
              {busy ? '확인 중…' : '본인 확인'}
            </button>
          </>
        ) : (
          // 인증 후 화면
          <>
            <div className="qr-topbar">
              <span className="qr-who">{status.participantName} 님</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="qr-linkbtn"
                  type="button"
                  onClick={() => (showHistory ? setShowHistory(false) : void handleShowHistory())}
                  disabled={busy}
                >
                  {showHistory ? '← 돌아가기' : '입퇴실 확인'}
                </button>
                <button className="qr-linkbtn" type="button" onClick={handleReset}>
                  다시 인증
                </button>
              </div>
            </div>

            {showHistory ? (
              <HistoryView history={history} />
            ) : (
              <>
                <div className="qr-status-box">
                  <div className="qr-status-row">
                    <span className="k">일차</span>
                    <span>{status.dayNo ? `${status.dayNo}일차` : '-'}</span>
                  </div>
                  <div className="qr-status-row">
                    <span className="k">입실</span>
                    <span>
                      {hm(status.checkInTime)}
                      {status.status ? ` (${statusLabel(status.status)})` : ''}
                    </span>
                  </div>
                  <div className="qr-status-row">
                    <span className="k">퇴실</span>
                    <span>{hm(status.checkOutTime)}</span>
                  </div>
                </div>

                {status.canCheckIn && (
                  <div className="qr-section">
                    <button
                      className="qr-btn"
                      type="button"
                      onClick={handleCheckIn}
                      disabled={busy}
                    >
                      입실하기
                    </button>
                  </div>
                )}

                {status.canLeave && (
                  <div className="qr-section">
                    <h2>조퇴 · 외출</h2>
                    {openLeave ? (
                      <button
                        className="qr-btn"
                        type="button"
                        onClick={() => handleReturn(openLeave.attendanceLeaveId)}
                        disabled={busy}
                      >
                        복귀하기 ({hm(openLeave.leaveTime)} 외출 중)
                      </button>
                    ) : (
                      <button
                        className="qr-btn"
                        type="button"
                        onClick={handleLeave}
                        disabled={busy}
                      >
                        외출하기
                      </button>
                    )}
                  </div>
                )}

                {status.leaves.length > 0 && (
                  <div className="qr-section">
                    <h2>외출 내역</h2>
                    {status.leaves.map((lv) => (
                      <div className="qr-leave-row" key={lv.attendanceLeaveId}>
                        <span>{hm(lv.leaveTime)} 외출</span>
                        <span style={{ marginLeft: 'auto' }}>
                          {lv.returnTime ? `${hm(lv.returnTime)} 복귀` : '복귀 전'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {status.canCheckOut && (
                  <div className="qr-section">
                    <button
                      className="qr-btn"
                      type="button"
                      onClick={handleCheckOut}
                      disabled={busy}
                    >
                      퇴실하기
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HistoryView({ history }: { history: QrHistory | null }) {
  if (!history) return <div className="qr-muted">내역을 불러오는 중…</div>;
  if (history.days.length === 0) return <div className="qr-muted">입·퇴실 내역이 없습니다.</div>;

  return (
    <div className="qr-section">
      {history.days.map((day) => (
        <div className="qr-history-day" key={day.dayNo}>
          <div className="d-head">
            <span>
              {day.dayNo}일차{' '}
              <span className="qr-muted" style={{ padding: 0 }}>
                ({day.date})
              </span>
            </span>
            <span>{statusLabel(day.status)}</span>
          </div>
          <div className="qr-status-row">
            <span className="k">입실 / 퇴실</span>
            <span>
              {hm(day.checkInTime)} / {hm(day.checkOutTime)}
            </span>
          </div>
          {day.leaves.map((lv) => (
            <div className="qr-status-row" key={lv.attendanceLeaveId}>
              <span className="k">외출</span>
              <span>
                {hm(lv.leaveTime)}
                {lv.returnTime ? ` ~ ${hm(lv.returnTime)}` : ' (미복귀)'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
