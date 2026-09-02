import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useRole } from '../context/RoleContext';
import { getCourses, getCourseParticipants } from '../api/courses';
import type { CourseSummary, CourseParticipant } from '../api/courses';
import { getAttendances, getCompletionRisk } from '../api/attendances';
import type { AttendanceListItem, CompletionRiskItem, RiskStatus } from '../api/attendances';
import { getCourseParticipant } from '../api/courseParticipants';
import type { CourseParticipantDetail } from '../api/courseParticipants';
import { getMyStaffSchedules } from '../api/staffSchedules';
import { AttendanceApiModal, BulkAttendanceModal } from '../components/ParticipantModals';
import { statusLabel, compareCourseStatusOngoingFirst } from '../utils/courseStatus';

const STATUS_TO_KOR: Record<string, string> = {
  ATTEND: '출석',
  LATE: '지각',
  ABSENT: '결석',
};

// 오늘 날짜(로컬 기준) "YYYY-MM-DD" — 진행자/PL 당일 배정 회차 자동선택에 사용.
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// 회차 드롭다운 표시 라벨 — 지역 + 전체회차(기수) + 지역회차를 함께 보여준다.
// 예: "서울 양천 전체3기 · 2회차 (교육중)"
// 지역회차(localCourseNumber)가 없으면 courseName으로 대체(기존 로직 유지).
function courseOptionLabel(c: CourseSummary): string {
  const region = c.regionName ?? '';
  const overallRound = c.courseNumber != null ? `전체${c.courseNumber}기` : null;
  const localRound = c.localCourseNumber != null ? `${c.localCourseNumber}회차` : null;
  const roundText = [overallRound, localRound].filter(Boolean).join(' · ') || (c.courseName ?? '');
  const statusText = c.status ? ` (${statusLabel(c.status)})` : '';
  return [region, roundText].filter(Boolean).join(' ') + statusText;
}

export default function AttendancePage() {
  const { roleConfig } = useRole();
  const navigate = useNavigate();

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseNo, setSelectedCourseNo] = useState<string>('');
  const [courseParticipants, setCourseParticipants] = useState<CourseParticipant[]>([]);
  const [attendancesMap, setAttendancesMap] = useState<Record<string, AttendanceListItem>>({});
  const [riskMap, setRiskMap] = useState<Record<number, CompletionRiskItem>>({});

  // 참여자 간단정보 모달 상태
  const [infoTargetId, setInfoTargetId] = useState<number | null>(null);
  const [infoDetail, setInfoDetail] = useState<CourseParticipantDetail | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  // 진행자/PL 당일 배정 회차 자동선택은 최초 1회만 수행(이후 수동 선택을 덮어쓰지 않음)
  const autoSelectedRef = useRef(false);

  const openParticipantInfo = (courseParticipantId: number) => {
    setInfoTargetId(courseParticipantId);
    setInfoDetail(null);
    setInfoLoading(true);
    getCourseParticipant(courseParticipantId)
      .then((res) => setInfoDetail(res.data?.data ?? null))
      .catch((err) => console.error('참여자 정보 조회 실패:', err))
      .finally(() => setInfoLoading(false));
  };

  // 모달 상태 (개별 셀 상세)
  const [selectedCell, setSelectedCell] = useState<{
    courseParticipantId: number;
    participantName: string;
    dayNo: number;
    attendanceId?: number;
  } | null>(null);

  // 일차별 일괄 출석 모달 상태
  const [bulkDayNo, setBulkDayNo] = useState<number>(1);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // 실제 API에서 개설된 회차(courses) 목록 조회
  useEffect(() => {
    getCourses({ size: 100 })
      .then((res) => {
        const list = res.data?.data?.content ?? [];
        // 교육중(진행 중) 회차를 먼저 확인하도록 정렬 — 1차 상태(교육중 우선), 2차 전체회차 오름차순.
        // 원본 불변 유지 위해 새 배열로 정렬.
        const sorted = [...list].sort((a, b) => {
          const byStatus = compareCourseStatusOngoingFirst(a.status, b.status);
          if (byStatus !== 0) return byStatus;
          return (a.courseNumber ?? 0) - (b.courseNumber ?? 0);
        });
        setCourses(sorted);
        // 첫 번째(정렬 후 교육중 우선) 회차를 기본 선택
        if (sorted.length > 0 && !selectedCourseNo) {
          setSelectedCourseNo(String(sorted[0].courseId ?? ''));
        }
      })
      .catch((err) => console.error('회차 목록 조회 실패:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 진행자(STAFF)/PL(PROJECT_LEADER)은 당일 인력배정된 회차가 있으면 그 회차로 selectbox 자동 전환.
  // 최초 회차 목록 로드 후 1회만 시도하고, 이후 사용자의 수동 선택은 덮어쓰지 않는다.
  useEffect(() => {
    if (autoSelectedRef.current || courses.length === 0) return;
    const isFieldStaff = roleConfig.roles.some(
      (r) => r === 'STAFF' || r === 'PROJECT_LEADER',
    );
    if (!isFieldStaff) return;
    autoSelectedRef.current = true;
    const today = todayIso();
    getMyStaffSchedules(today, today)
      .then((res) => {
        const items = res.data?.data?.content ?? [];
        // 당일·배정(courseStaffId!=null)·courseId 존재 + 현재 회차 목록에 포함된 첫 배정 회차.
        const assigned = items.find(
          (it) =>
            it.scheduleDate === today &&
            it.courseStaffId != null &&
            it.courseId != null &&
            courses.some((c) => c.courseId === it.courseId),
        );
        if (assigned?.courseId != null) {
          setSelectedCourseNo(String(assigned.courseId));
        }
      })
      .catch((err) => console.error('당일 배정 회차 조회 실패:', err));
  }, [courses, roleConfig.roles]);

  const loadDataForCourse = useCallback((courseId: number) => {
    // 참여자 목록 조회
    getCourseParticipants(courseId, { size: 200 })
      .then((res) => {
        setCourseParticipants(res.data?.data?.content ?? []);
      })
      .catch((err) => console.error('참여자 조회 실패:', err));

    // 출결 목록 조회
    getAttendances({ courseId, size: 1000 })
      .then((res) => {
        const list = res.data?.data?.content ?? [];
        const map: Record<string, AttendanceListItem> = {};
        list.forEach((att) => {
          if (att.courseParticipantId != null && att.dayNo != null) {
            map[`${att.courseParticipantId}_${att.dayNo}`] = att;
          }
        });
        setAttendancesMap(map);
      })
      .catch((err) => console.error('출결 조회 실패:', err));

    // 수료 위험도 조회
    getCompletionRisk(courseId)
      .then((res) => {
        let items: CompletionRiskItem[] = [];
        const resData: any = res.data;

        if (Array.isArray(resData)) {
          items = resData;
        } else if (resData?.data?.items) {
          items = resData.data.items;
        } else if (resData?.items) {
          items = resData.items;
        } else if (Array.isArray(resData?.data)) {
          items = resData.data;
        }

        const map: Record<number, CompletionRiskItem> = {};
        items.forEach((item) => {
          map[item.courseParticipantId] = item;
        });
        setRiskMap(map);
      })
      .catch((err) => console.error('수료 위험도 조회 실패:', err));
  }, []);

  // 회차 선택이 변경되면 해당 courseId로 참여자 및 출결 목록 조회
  useEffect(() => {
    if (!selectedCourseNo || courses.length === 0) {
      setCourseParticipants([]);
      setAttendancesMap({});
      setRiskMap({});
      return;
    }
    const matched = courses.find((c) => String(c.courseId) === selectedCourseNo);
    if (!matched) {
      setCourseParticipants([]);
      setAttendancesMap({});
      setRiskMap({});
      return;
    }
    loadDataForCourse(matched.courseId);
  }, [selectedCourseNo, courses, loadDataForCourse]);

  const canEdit = roleConfig.can.attend === 1;

  const handleCellClick = (
    courseParticipantId: number,
    participantName: string,
    dayNo: number,
    attendanceId?: number,
  ) => {
    setSelectedCell({
      courseParticipantId,
      participantName,
      dayNo,
      attendanceId,
    });
  };

  const getAttDayClass = (status?: string | null) => {
    if (status === 'ATTEND') return '출석';
    if (status === 'LATE') return '지각';
    if (status === 'ABSENT') return '결석';
    return 'none';
  };

  const getRiskLabel = (status?: RiskStatus) => {
    switch (status) {
      case 'PASS':
        return '수료 완료';
      case 'SAFE':
        return '수료 가능';
      case 'WARNING':
        return '주의';
      case 'DANGER':
        return '위험';
      case 'FAIL':
        return '수료 불가';
      case 'UNKNOWN':
        return '산정불가';
      default:
        return '미정';
    }
  };

  const getRiskClass = (status?: RiskStatus) => {
    switch (status) {
      case 'PASS':
        return 'ok';
      case 'SAFE':
        return 'ok';
      case 'WARNING':
        return 'warning';
      case 'DANGER':
        return 'danger';
      case 'FAIL':
        return 'danger';
      case 'UNKNOWN':
        return 'neutral';
      default:
        return '';
    }
  };

  // 현재 선택된 회차(courseId) — bulk 모달, 저장 후 리로드에 사용
  const matchedCourse = courses.find((c) => String(c.courseId) === selectedCourseNo);

  // bulkDayNo 기준으로 이미 출석 기록이 있는 courseParticipantId 집합 (중복 등록 방지용)
  const alreadyRecordedIds = new Set(
    courseParticipants
      .filter(
        (cp) => attendancesMap[`${cp.courseParticipantId}_${bulkDayNo}`]?.attendanceId != null,
      )
      .map((cp) => cp.courseParticipantId),
  );

  return (
    <section className="view active" id="view-attendance">
      <div className="perm-bar">
        <span className="pb-ic">✅</span>
        <span id="perm-attend-txt">
          {canEdit ? '배정 회차 출결 입력 가능 (진행자)' : '출결 현황 조회만 가능'}
        </span>
      </div>

      <div className="att-tools">
        <span className="select" style={{ position: 'relative' }}>
          <span className="ico">회차</span>
          <select
            value={selectedCourseNo}
            onChange={(e) => setSelectedCourseNo(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              fontWeight: 'inherit',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {courses.map((c) => (
              <option key={c.courseId} value={String(c.courseId)}>
                {courseOptionLabel(c)} ▾
              </option>
            ))}
          </select>
        </span>

        {canEdit && (
          <>
            <span className="select" style={{ position: 'relative' }}>
              <span className="ico">일차</span>
              <select
                value={bulkDayNo}
                onChange={(e) => setBulkDayNo(Number(e.target.value))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 'inherit',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d}일차 ▾
                  </option>
                ))}
              </select>
            </span>
            <button
              className="btn primary"
              style={{ fontSize: '13px' }}
              onClick={() => setBulkModalOpen(true)}
              disabled={courseParticipants.length === 0}
            >
              선택 일차 일괄 출석
            </button>
          </>
        )}

        <button
          className="btn"
          style={{ fontSize: '13px' }}
          onClick={() => {
            if (matchedCourse) loadDataForCourse(matchedCourse.courseId);
          }}
          disabled={!matchedCourse}
          title="출결·수료 데이터를 다시 불러옵니다"
        >
          ↻ 출결 데이터 새로고침
        </button>

        <span className="muted" style={{ fontSize: '12.5px' }}>
          · 외출·조퇴는 시간까지 기록 · 셀 클릭 시 상세 조회/등록 가능 · 이름 클릭 시 참여자 정보
        </span>
      </div>

      <div className="card">
        <div className="card-b" style={{ padding: '6px 0' }}>
          <div className="tbl-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th className="nm-col">참여자</th>
                  <th>1일차</th>
                  <th>2일차</th>
                  <th>3일차</th>
                  <th>4일차</th>
                  <th>5일차</th>
                  <th>수료 가능</th>
                </tr>
              </thead>
              <tbody id="attend-rows">
                {courseParticipants.map((cp) => {
                  const displayName = cp.participantName ?? cp.name ?? '이름없음';
                  const daysData = [1, 2, 3, 4, 5].map(
                    (d) => attendancesMap[`${cp.courseParticipantId}_${d}`],
                  );
                  const riskInfo = riskMap[cp.courseParticipantId];
                  const rStatus = riskInfo?.riskStatus;

                  return (
                    <tr key={cp.courseParticipantId}>
                      <td className="nm-col">
                        <button
                          type="button"
                          className="pname"
                          onClick={() => openParticipantInfo(cp.courseParticipantId)}
                          title="참여자 정보 보기"
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            font: 'inherit',
                            color: 'var(--primary, #2563eb)',
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                            cursor: 'pointer',
                          }}
                        >
                          {displayName}
                        </button>
                      </td>
                      {[1, 2, 3, 4, 5].map((d, dIdx) => {
                        const att = daysData[dIdx];
                        const statusStr = att?.status ? STATUS_TO_KOR[att.status] : '—';
                        const timeDetail =
                          att?.checkInTime || att?.checkOutTime
                            ? `\n입 ${att.checkInTime ? att.checkInTime.substring(0, 5) : '-'} / 퇴 ${att.checkOutTime ? att.checkOutTime.substring(0, 5) : '-'}`
                            : '';
                        const hasLeave = att?.leaves && att.leaves.length > 0;

                        return (
                          <td
                            key={d}
                            onClick={() =>
                              handleCellClick(
                                cp.courseParticipantId,
                                displayName,
                                d,
                                att?.attendanceId,
                              )
                            }
                            style={{ cursor: 'pointer', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                          >
                            <span className={`att-cell ${getAttDayClass(att?.status)}`}>
                              {statusStr}
                              {timeDetail && (
                                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                  {timeDetail}
                                </div>
                              )}
                              {hasLeave && (
                                <div
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--danger)',
                                    marginTop: '2px',
                                  }}
                                >
                                  조퇴/외출
                                </div>
                              )}
                            </span>
                          </td>
                        );
                      })}
                      <td>
                        <span className={`chip ${getRiskClass(rStatus)}`}>
                          {getRiskLabel(rStatus)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {courseParticipants.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}
                    >
                      해당 회차에 배정된 참여자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="note">
        ※ 진행자가 당일 출결을 입력 · QR 먹통 시 수기 대체 입력 · 누적 미달 시 수료 위험 경고
      </p>

      {/* 참여자 간단정보 모달 */}
      {infoTargetId != null && (
        <div
          className="modal-overlay open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInfoTargetId(null);
          }}
        >
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-h">
              <h3>참여자 정보</h3>
              <button className="x" onClick={() => setInfoTargetId(null)}>
                ✕
              </button>
            </div>
            <div className="modal-b">
              {infoLoading ? (
                <div>불러오는 중...</div>
              ) : infoDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <span className="muted">이름</span> <b>{infoDetail.participantName}</b>
                  </div>
                  <div>
                    <span className="muted">참여자ID</span>{' '}
                    <b>
                      {infoDetail.participantId}
                      {infoDetail.matchKey ? ` (${infoDetail.matchKey})` : ''}
                    </b>
                  </div>
                  <div>
                    <span className="muted">생년</span> <b>{infoDetail.birthYear ?? '—'}</b>
                  </div>
                  <div>
                    <span className="muted">연락처</span> <b>{infoDetail.phone ?? '—'}</b>
                  </div>
                </div>
              ) : (
                <div>정보를 불러오지 못했습니다.</div>
              )}
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setInfoTargetId(null)}>
                닫기
              </button>
              <button
                className="btn primary"
                onClick={() => navigate(`/participants/${infoTargetId}`)}
              >
                상세정보 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 개별 셀 상세 모달 */}
      {selectedCell && (
        <AttendanceApiModal
          isOpen={true}
          onClose={() => setSelectedCell(null)}
          onSaved={() => {
            if (selectedCourseNo) {
              const matched = courses.find((c) => String(c.courseId) === selectedCourseNo);
              if (matched) loadDataForCourse(matched.courseId);
            }
          }}
          courseParticipantId={selectedCell.courseParticipantId}
          participantName={selectedCell.participantName}
          dayNo={selectedCell.dayNo}
          initialAttendanceId={selectedCell.attendanceId}
        />
      )}

      {/* 일차별 일괄 출석 모달 */}
      {bulkModalOpen && matchedCourse && (
        <BulkAttendanceModal
          isOpen={true}
          onClose={() => setBulkModalOpen(false)}
          courseId={matchedCourse.courseId}
          dayNo={bulkDayNo}
          participants={courseParticipants.map((cp) => ({
            courseParticipantId: cp.courseParticipantId,
            name: cp.participantName ?? cp.name ?? '이름없음',
          }))}
          alreadyRecordedIds={alreadyRecordedIds}
          onSaved={() => loadDataForCourse(matchedCourse.courseId)}
        />
      )}
    </section>
  );
}
