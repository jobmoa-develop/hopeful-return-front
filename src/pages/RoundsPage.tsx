import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';
import { RoundModal } from '../components/Modal';

export default function RoundsPage() {
  const navigate = useNavigate();
  const { roleConfig } = useRole();
  const { rounds } = useData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [selectedStatus, setSelectedStatus] = useState('전체');

  // 1. Role Scope Filter
  const getVisibleRounds = () => {
    let list = [...rounds];
    if (roleConfig.scope === 'region') {
      list = list.filter(r => r.reg === roleConfig.region);
    } else if (roleConfig.scope === 'rounds' && roleConfig.rounds) {
      list = list.filter(r => roleConfig.rounds?.includes(r.no));
    }

    // 2. Dropdown Filter
    if (selectedRegion !== '전체') list = list.filter(r => r.reg === selectedRegion);
    if (selectedStatus !== '전체') list = list.filter(r => r.st[0] === selectedStatus);

    return list;
  };

  const filteredList = getVisibleRounds();

  const REGIONS = ["양천", "인천", "강북", "의정부", "천안"];
  const STATUSES = ["예정", "모집중", "개강확정", "교육중", "수료", "수당지급완료", "예산집행완료", "수행보고서 제출완료", "폐강"];

  return (
    <section className="view active" id="view-rounds">
      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
          <div className="select">
            <span className="ico">지역</span>
            <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체 ▾</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="select">
            <span className="ico">상태</span>
            <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체 ▾</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {roleConfig.can.editR === 1 && (
          <button 
            className="btn primary" 
            id="btn-add-round" 
            onClick={() => setIsModalOpen(true)}
          >
            + 새 회차 등록
          </button>
        )}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>회차</th>
                <th>지역</th>
                <th>교육 일정</th>
                <th>신청 / 정원</th>
                <th>상태</th>
                <th>강사</th>
                <th>상담사</th>
              </tr>
            </thead>
            <tbody id="r-rows">
              {filteredList.map((r, idx) => {
                const okCap = r.cur >= 12;
                return (
                  <tr key={idx} onClick={() => navigate(`/rounds/${r.no}`)}>
                    <td className="pname">{r.no}</td>
                    <td>{r.reg}</td>
                    <td className="tnum">{r.date}</td>
                    <td>
                      <span 
                        className="tnum" 
                        style={{ fontWeight: 600, color: okCap ? 'var(--ink)' : 'var(--warn)' }}
                      >
                        {r.cur}
                      </span>
                      <span className="muted tnum"> / {r.cap}</span>
                    </td>
                    <td>
                      <span className={`chip ${r.st[1]}`}>{r.st[0]}</span>
                    </td>
                    <td>{r.gang}</td>
                    <td>{r.sang}</td>
                  </tr>
                );
              })}
              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    등록된 회차가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">행을 클릭하면 회차 상세(D-6주 등록 체크 · 인원 · 배정 인력)로 이동합니다.</p>

      {/* Modal */}
      <RoundModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}
