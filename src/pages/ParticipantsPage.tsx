import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';
import { ParticipantModal } from '../components/Modal';

export default function ParticipantsPage() {
  const navigate = useNavigate();
  const { roleConfig, pidLabel } = useRole();
  const { participants } = useData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [selectedRound, setSelectedRound] = useState('전체');
  const [selectedStatus, setSelectedStatus] = useState('전체');
  const [selectedGuk, setSelectedGuk] = useState('전체');
  const [selectedJob, setSelectedJob] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Role Scope Filter
  const getVisibleParticipants = () => {
    let list = [...participants];
    if (roleConfig.scope === 'region') {
      list = list.filter(p => p.reg === roleConfig.region);
    } else if (roleConfig.scope === 'rounds' && roleConfig.rounds) {
      list = list.filter(p => roleConfig.rounds?.includes(p.rd));
    }

    // 2. Dropdown Filter
    if (selectedRegion !== '전체') list = list.filter(p => p.reg === selectedRegion);
    if (selectedRound !== '전체') list = list.filter(p => p.rd === selectedRound);
    if (selectedStatus !== '전체') list = list.filter(p => p.st[0] === selectedStatus);
    if (selectedGuk !== '전체') list = list.filter(p => p.guk[0] === selectedGuk);
    if (selectedJob !== '전체') list = list.filter(p => p.job[0] === selectedJob);

    // 3. Search Query Filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.nm.toLowerCase().includes(q) || p.phone.includes(q));
    }

    return list;
  };

  const filteredList = getVisibleParticipants();

  const REGIONS = ["양천", "인천", "강북", "의정부", "천안"];
  const ROUNDS = ["22회차", "21회차", "18회차", "03회차", "24회차", "17회차"];
  const STATUSES = ["접수", "선정", "미선정", "사전상담완료", "교육중", "수료", "미수료", "사후관리", "종료", "취소"];
  const GUKS = ["대기", "신청", "참여", "—"];
  const JOBS = ["취업", "구직중", "—"];

  return (
    <section className="view active" id="view-participants">
      <div className="perm-bar" id="perm-participants">
        <span className="pb-ic">🔑</span>
        <span id="perm-participants-txt">{roleConfig.perm}</span>
      </div>

      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <div className="select">
            <span className="ico">지역</span>
            <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체 ▾</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="select">
            <span className="ico">회차</span>
            <select value={selectedRound} onChange={e => setSelectedRound(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체 ▾</option>
              {ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="select">
            <span className="ico">진행상태</span>
            <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체 ▾</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="select">
            <span className="ico">국취</span>
            <select value={selectedGuk} onChange={e => setSelectedGuk(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체 ▾</option>
              {GUKS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="select">
            <span className="ico">취업</span>
            <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체 ▾</option>
              {JOBS.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div className="searchbox" style={{ width: '180px', padding: '4px 10px' }}>
            <input 
              type="text" 
              placeholder="참여자 이름 검색..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ fontSize: '12px' }}
            />
          </div>
        </div>

        <span className="count" id="p-count">
          총 {filteredList.length}명 (가상)
        </span>

        {roleConfig.can.editP === 1 && (
          <button 
            className="btn primary" 
            id="btn-add-participant" 
            onClick={() => setIsModalOpen(true)}
            style={{ marginLeft: '10px' }}
          >
            + 참여자 등록
          </button>
        )}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>참여자</th>
                <th>지역 / 회차</th>
                <th>진행상태</th>
                <th>사전상담</th>
                <th>출결</th>
                <th>수료</th>
                <th>국취</th>
                <th>취업</th>
              </tr>
            </thead>
            <tbody id="p-rows">
              {filteredList.map((p, idx) => (
                <tr key={idx} onClick={() => navigate(`/participants/${p.phone}`)}>
                  <td>
                    <div className="pname">{p.nm}</div>
                    <div className="cell-sub">{pidLabel(p)}</div>
                  </td>
                  <td>{p.reg} · {p.rd}</td>
                  <td>
                    <span className={`chip ${p.st[1]}`}>{p.st[0]}</span>
                  </td>
                  <td>
                    <span className={`chip ${p.sang[1]}`}>{p.sang[0]}</span>
                  </td>
                  <td>
                    <div className="mini-prog">
                      <div className="bar">
                        <span style={{ width: `${p.att}%` }}></span>
                      </div>
                      <span className="muted tnum" style={{ fontSize: '11.5px' }}>
                        {p.att}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${p.su[1]}`}>{p.su[0]}</span>
                  </td>
                  <td>
                    <span className={`chip ${p.guk[1]}`}>{p.guk[0]}</span>
                  </td>
                  <td>
                    <span className={`chip ${p.job[1]}`}>{p.job[0]}</span>
                  </td>
                </tr>
              ))}
              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    조건에 일치하는 참여자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">행을 클릭하면 참여자 상세(전체 여정)로 이동합니다.</p>

      {/* Modal */}
      <ParticipantModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}
