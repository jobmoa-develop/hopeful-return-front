import { useState } from 'react';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';
import { AttendanceModal } from '../components/Modal';

export default function AttendancePage() {
  const { roleConfig } = useRole();
  const { participants, rounds } = useData();

  const [selectedRoundNo, setSelectedRoundNo] = useState('22회차');
  const [activePhone, setActivePhone] = useState<string | null>(null);

  const canEdit = roleConfig.can.attend === 1;

  // Filter participants in the selected round
  const roster = participants.filter(p => p.rd === selectedRoundNo);

  const handleCellClick = (phone: string) => {
    if (canEdit) {
      setActivePhone(phone);
    }
  };

  const getAttDayClass = (day: string) => {
    if (day === '출석') return '출석';
    if (['지각', '외출', '조퇴'].includes(day)) return '지각';
    if (day === '결석') return '결석';
    return 'none';
  };

  const checkRisk = (days: string[]) => {
    // If there is any absent day or if active attendance is low
    const hasAbsent = days.includes('결석');
    return hasAbsent ? '위험' : '가능';
  };

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
            value={selectedRoundNo} 
            onChange={e => setSelectedRoundNo(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
          >
            {rounds.map(r => (
              <option key={r.no} value={r.no}>
                {r.reg} {r.no} ({r.st[0]}) ▾
              </option>
            ))}
          </select>
        </span>
        <span className="muted" style={{ fontSize: '12.5px' }}>
          · 외출·조퇴는 시간까지 기록 · 셀 클릭 시 상태 변경(시안)
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
                {roster.map((r, idx) => {
                  const risk = checkRisk(r.attendanceDays);
                  return (
                    <tr key={idx}>
                      <td className="nm-col">
                        <div className="pname">{r.nm}</div>
                        {r.attendanceDetails && (
                          <div className="att-time">{r.attendanceDetails}</div>
                        )}
                      </td>
                      {r.attendanceDays.map((d, dIdx) => (
                        <td key={dIdx} onClick={() => handleCellClick(r.phone)}>
                          <span className={`att-cell ${getAttDayClass(d)}`}>
                            {d === 'none' ? '—' : d}
                          </span>
                        </td>
                      ))}
                      <td>
                        <span className={`chip ${risk === '위험' ? 'danger' : 'ok'}`}>
                          {risk === '위험' ? '수료 위험' : '가능'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {roster.length === 0 && (
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

      {/* Modal */}
      {activePhone && (
        <AttendanceModal 
          isOpen={true}
          onClose={() => setActivePhone(null)}
          phone={activePhone}
        />
      )}
    </section>
  );
}
