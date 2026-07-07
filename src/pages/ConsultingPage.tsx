import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';
import { ConsultingModal } from '../components/Modal';

export default function ConsultingPage() {
  const navigate = useNavigate();
  const { roleConfig, pidLabel } = useRole();
  const { participants } = useData();

  const [activePhone, setActivePhone] = useState<string | null>(null);

  const getVisibleParticipants = () => {
    let list = [...participants];
    if (roleConfig.scope === 'region') {
      list = list.filter(p => p.reg === roleConfig.region);
    } else if (roleConfig.scope === 'rounds' && roleConfig.rounds) {
      list = list.filter(p => roleConfig.rounds?.includes(p.rd));
    }

    // Exclude basic registry states
    return list.filter(p => !['접수', '미선정', '취소'].includes(p.st[0]));
  };

  const list = getVisibleParticipants();
  const canConsult = roleConfig.can.consult === 1;

  const handleOpenConsult = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    setActivePhone(phone);
  };

  return (
    <section className="view active" id="view-consulting">
      <div className="perm-bar">
        <span className="pb-ic">💬</span>
        <span id="perm-consulting-txt">
          {canConsult 
            ? "배정 참여자 상담 입력 가능 · 사전(대면1)·사후(대면2)" 
            : "상담 현황 조회만 가능"
          }
        </span>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>참여자</th>
                <th>회차</th>
                <th>담당 상담사</th>
                <th>사전상담</th>
                <th>사후 1차</th>
                <th>사후 2차</th>
                <th>연락시도</th>
                <th>상담일지</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody id="consult-rows">
              {list.map((p, idx) => {
                const done = p.sang[0] === '완료';
                return (
                  <tr key={idx} onClick={() => navigate(`/participants/${p.phone}`)}>
                    <td>
                      <div className="pname">{p.nm}</div>
                      <div className="cell-sub">{pidLabel(p)}</div>
                    </td>
                    <td>{p.rd}</td>
                    <td>{p.counselorName || '김상담'}</td>
                    <td>
                      <span className={`chip ${done ? 'ok' : 'warn'}`}>
                        {done ? '완료' : '미완료'}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${['사후관리', '종료'].includes(p.st[0]) ? 'ok' : 'neutral'}`}>
                        {['사후관리', '종료'].includes(p.st[0]) ? '완료' : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${p.st[0] === '종료' ? 'ok' : 'neutral'}`}>
                        {p.st[0] === '종료' ? '완료' : '—'}
                      </span>
                    </td>
                    <td className="tnum">{done ? '1회' : `${p.contactAttempts || 3}회`}</td>
                    <td>
                      <span className={`chip ${p.preConsultDocWritten ? 'ok' : 'neutral'}`}>
                        {p.preConsultDocWritten ? '작성' : '—'}
                      </span>
                    </td>
                    <td>
                      {canConsult ? (
                        <button 
                          className="btn" 
                          style={{ padding: '5px 11px', fontSize: '12px' }}
                          onClick={(e) => handleOpenConsult(e, p.phone)}
                        >
                          상담 입력
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: '11.5px' }}>조회</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    조회된 상담 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="note">※ 사전=사후 동일 상담사 디폴트(변경 가능) · 연락 5회 실패 시 지역담당자 보고</p>

      {/* Modal */}
      {activePhone && (
        <ConsultingModal 
          isOpen={true}
          onClose={() => setActivePhone(null)}
          phone={activePhone}
        />
      )}
    </section>
  );
}
