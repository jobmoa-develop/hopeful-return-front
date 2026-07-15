import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { getParticipants } from '../api/participants';
import type { ParticipantListItem } from '../api/participants';
import { CP_STATUS_CHIP, CP_STATUS_LABELS } from '../api/courseParticipants';
import type { CounselingType, CourseParticipantStatus } from '../api/courseParticipants';
import { CounselingSessionModal } from '../components/ParticipantModals';
import { apiErrorMessage } from '../api/apiError';

const PAGE_SIZE = 100;
const SLOT_COLUMNS: { type: CounselingType; label: string }[] = [
  { type: 'PRE_SESSION', label: '사전상담' },
  { type: 'POST_SESSION_1', label: '사후 1차' },
  { type: 'POST_SESSION_2', label: '사후 2차' },
];

export default function ConsultingPage() {
  const navigate = useNavigate();
  const { roleConfig } = useRole();

  const [items, setItems] = useState<ParticipantListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionTarget, setSessionTarget] = useState<ParticipantListItem | null>(null);

  const fetchList = useCallback(() => {
    setError(null);
    getParticipants({ page: 0, size: PAGE_SIZE })
      .then((res) => setItems(res.data.data?.content ?? []))
      .catch((err) => setError(apiErrorMessage(err, '상담 대상 목록을 불러오지 못했습니다.')));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 수강 이력이 있고 취소되지 않은 참여자만 상담 대상
  const list = useMemo(
    () => items.filter((p) => p.latestEnrollment && p.latestEnrollment.status !== 'CANCELED'),
    [items],
  );

  const canConsult = roleConfig.can.consult === 1;

  const handleOpenSession = (e: React.MouseEvent, p: ParticipantListItem) => {
    e.stopPropagation();
    setSessionTarget(p);
  };

  return (
    <section className="view active" id="view-consulting">
      <div className="perm-bar">
        <span className="pb-ic">💬</span>
        <span id="perm-consulting-txt">
          {canConsult
            ? '배정 참여자 상담 입력 가능 · 사전(대면1)·사후(대면2)'
            : '상담 현황 조회만 가능'}
        </span>
      </div>

      {error && (
        <div
          className="card"
          style={{ padding: '14px', marginBottom: '12px', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      <div className="card">
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>참여자</th>
                <th>지역 / 회차</th>
                <th>진행상태</th>
                <th>사전상담</th>
                <th>사후 1차</th>
                <th>사후 2차</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody id="consult-rows">
              {list.map((p) => {
                const e = p.latestEnrollment!;
                const status = e.status as CourseParticipantStatus;
                return (
                  <tr
                    key={p.participantId}
                    onClick={() => navigate(`/participants/${e.courseParticipantId}`)}
                  >
                    <td>
                      <div className="pname">{p.name}</div>
                      <div className="cell-sub">{p.matchKey ?? p.phone}</div>
                    </td>
                    <td>
                      {[
                        e.regionName,
                        e.localCourseNumber != null ? `${e.localCourseNumber}회차` : e.courseName,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td>
                      <span className={`chip ${CP_STATUS_CHIP[status] ?? 'neutral'}`}>
                        {CP_STATUS_LABELS[status] ?? e.status ?? '—'}
                      </span>
                    </td>
                    {SLOT_COLUMNS.map(({ type }) => {
                      const slot = e.counselors.find((c) => c.status === type);
                      return (
                        <td key={type}>
                          {slot ? (
                            <>
                              <span className={`chip ${slot.completed ? 'ok' : 'warn'}`}>
                                {slot.completed ? '완료' : '미완료'}
                              </span>
                              <div className="cell-sub">
                                {slot.counselorName ?? `#${slot.counselorId}`}
                              </div>
                            </>
                          ) : (
                            <span className="chip neutral">배정 전</span>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      {canConsult ? (
                        <button
                          className="btn"
                          style={{ padding: '5px 11px', fontSize: '12px' }}
                          onClick={(ev) => handleOpenSession(ev, p)}
                        >
                          상담 입력
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: '11.5px' }}>
                          조회
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
                  >
                    조회된 상담 대상이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">※ 상담 완료 = 종료 일시 입력 기준 · 연락 5회 실패 시 지역담당자 보고</p>

      {sessionTarget?.latestEnrollment && (
        <CounselingSessionModal
          isOpen={true}
          onClose={() => setSessionTarget(null)}
          courseParticipantId={sessionTarget.latestEnrollment.courseParticipantId}
          counselors={sessionTarget.latestEnrollment.counselors}
          onSaved={fetchList}
        />
      )}
    </section>
  );
}
