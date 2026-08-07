import { useState, useEffect, useCallback } from 'react';
import { useRole } from '../context/RoleContext';
import { getCourses, getCourseParticipants } from '../api/courses';
import type { CourseSummary, CourseParticipant } from '../api/courses';
import { getAttendances, getCompletionRisk } from '../api/attendances';
import type { AttendanceListItem, CompletionRiskItem, RiskStatus } from '../api/attendances';
import { AttendanceApiModal, BulkAttendanceModal } from '../components/ParticipantModals';

const STATUS_TO_KOR: Record<string, string> = {
  ATTEND: '출석',
  LATE: '지각',
  ABSENT: '결석',
};

// 회차 드롭다운 표시 라벨 — 지역 + 전체회차(기수) + 지역회차를 함께 보여준다.
// 예: "서울 양천 전체3기 · 2회차 (OPEN)"
// 지역회차(localCourseNumber)가 없으면 courseName으로 대체(기존 로직 유지).
function courseOptionLabel(c: CourseSummary): string {
  const region = c.regionName ?? '';
  const overallRound = c.courseNumber != null ? `전체${c.courseNumber}기` : null;
  const localRound = c.localCourseNumber != null ? `${c.localCourseNumber}회차` : null;
  const roundText = [overallRound, localRound].filter(Boolean).join(' · ') || (c.courseName ?? '');
  const statusText = c.status ? ` (${c.status})` : '';
  return [region, roundText].filter(Boolean).join(' ') + statusText;
}

export default function AttendancePage() {
  const { roleConfig } = useRole();

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseNo, setSelectedCourseNo] = useState<string>('');
  const [courseParticipants, setCourseParticipants] = useState<CourseParticipant[]>([]);
  const [attendancesMap, setAttendancesMap] = useState<Record<string, AttendanceListItem>>({});
  const [riskMap, setRiskMap] = useState<Record<number, CompletionRiskItem>>({});

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
        setCourses(list);
        // 첫 번째 회차를 기본 선택
        if (list.length > 0 && !selectedCourseNo) {
          setSelectedCourseNo(String(list[0].courseId ?? ''));
        }
      })
      .catch((err) => console.error('회차 목록 조회 실패:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        list.forEach(att => {
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
        items.forEach(item => {
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
    const matched = courses.find(
      (c) => String(c.courseId) === selectedCourseNo
    );
    if (!matched) {
      setCourseParticipants([]);
      setAttendancesMap({});
      setRiskMap({});
      return;
    }
    loadDataForCourse(matched.courseId);
  }, [selectedCourseNo, courses, loadDataForCourse]);

  const canEdit = roleConfig.can.attend === 1;

  const handleCellClick = (courseParticipantId: number, participantName: string, dayNo: number, attendanceId?: number) => {
    setSelectedCell({
      courseParticipantId,
      participantName,
      dayNo,
      attendanceId
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
      case 'PASS': return '수료 완료';
      case 'SAFE': return '수료 가능';
      case 'WARNING': return '주의';
      case 'DANGER': return '위험';
      case 'FAIL': return '수료 불가';
      case 'UNKNOWN': return '산정불가';
      default: return '미정';
    }
  };

  const getRiskClass = (status?: RiskStatus) => {
    switch (status) {
      case 'PASS': return 'ok';
      case 'SAFE': return 'ok';
      case 'WARNING': return 'warning';
      case 'DANGER': return 'danger';
      case 'FAIL': return 'danger';
      case 'UNKNOWN': return 'neutral';
      default: return '';
    }
  };

  // 현재 선택된 회차(courseId) — bulk 모달, 저장 후 리로드에 사용
  const matchedCourse = courses.find((c) => String(c.courseId) === selectedCourseNo);

  // bulkDayNo 기준으로 이미 출석 기록이 있는 courseParticipantId 집합 (중복 등록 방지용)
  const alreadyRecordedIds = new Set(
    courseParticipants
      .filter((cp) => attendancesMap[`${cp.courseParticipantId}_${bulkDayNo}`]?.attendanceId != null)
      .map((cp) => cp.courseParticipantId)
  );

  return (
    <section className="view active" id="view-attendance">
      <div className="perm-bar">
        <span className="pb-ic">✅</span>
        <span id="perm-attend-txt">
          {canEdit ? "배정 회차 출결 입력 가능 (진행자)" : "출결 현황 조회만 가능"}
        </span>
      </div>

      <div className="att-tools">
        <span className="select" style={{ position: 'relative' }}>
          <span className="ico">회차</span>
          <select
            value={selectedCourseNo}
            onChange={e => setSelectedCourseNo(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
          >
            {courses.map(c => (
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
                onChange={e => setBulkDayNo(Number(e.target.value))}
                style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
              >
                {[1, 2, 3, 4, 5].map(d => (
                  <option key={d} value={d}>{d}일차 ▾</option>
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

        <span className="muted" style={{ fontSize: '12.5px' }}>
          · 외출·조퇴는 시간까지 기록 · 셀 클릭 시 상세 조회/등록 가능
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
                  const daysData = [1, 2, 3, 4, 5].map(d => attendancesMap[`${cp.courseParticipantId}_${d}`]);
                  const riskInfo = riskMap[cp.courseParticipantId];
                  const rStatus = riskInfo?.riskStatus;

                  return (
                    <tr key={cp.courseParticipantId}>
                      <td className="nm-col">
                        <div className="pname">{displayName}</div>
                      </td>
                      {[1, 2, 3, 4, 5].map((d, dIdx) => {
                        const att = daysData[dIdx];
                        const statusStr = att?.status ? STATUS_TO_KOR[att.status] : '—';
                        const timeDetail = att?.checkInTime || att?.checkOutTime
                          ? `\n입 ${att.checkInTime ? att.checkInTime.substring(0, 5) : '-'} / 퇴 ${att.checkOutTime ? att.checkOutTime.substring(0, 5) : '-'}`
                          : '';
                        const hasLeave = att?.leaves && att.leaves.length > 0;

                        return (
                          <td
                            key={d}
                            onClick={() => handleCellClick(cp.courseParticipantId, displayName, d, att?.attendanceId)}
                            style={{ cursor: 'pointer', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                          >
                            <span className={`att-cell ${getAttDayClass(att?.status)}`}>
                              {statusStr}
                              {timeDetail && <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{timeDetail}</div>}
                              {hasLeave && <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>조퇴/외출</div>}
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
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                      해당 회차에 배정된 참여자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="note">※ 진행자가 당일 출결을 입력 · QR 먹통 시 수기 대체 입력 · 누적 미달 시 수료 위험 경고</p>

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