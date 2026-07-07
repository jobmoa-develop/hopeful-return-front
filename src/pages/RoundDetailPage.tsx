import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';
import { RoundModal } from '../components/Modal';

export default function RoundDetailPage() {
  const { no } = useParams<{ no: string }>();
  const navigate = useNavigate();
  const { roleConfig } = useRole();
  const { rounds, assignments } = useData();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const r = rounds.find(x => x.no === no);
  const assign = assignments.find(a => a.no === no);

  if (!r) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <button className="back" onClick={() => navigate('/rounds')}>← 회차 목록</button>
        <h2>회차 정보를 찾을 수 없습니다.</h2>
      </div>
    );
  }

  // Calculate capacities
  const curPercent = Math.min(100, Math.round((r.cur / r.cap) * 100));
  const minPercent = r.minCap ? Math.round((r.minCap / r.cap) * 100) : 80;

  // Render staff badges
  const renderStaffSection = () => {
    const list: React.ReactNode[] = [];

    const addStaffRow = (name: string, label: string, roleCode: string) => (
      <div className="assignee" key={name + roleCode}>
        <div className="ra">{roleCode}</div>
        <div>
          <div className="rr">{label}</div>
          <div className="rnm">{name}</div>
        </div>
        <span className="chip ok" style={{ marginLeft: 'auto' }}>확정</span>
      </div>
    );

    if (assign) {
      assign.gang.forEach(g => list.push(addStaffRow(g, "강사", "강")));
      assign.sang.forEach(s => list.push(addStaffRow(s, "상담사", "상")));
      assign.jin.forEach(j => list.push(addStaffRow(j, "진행자", "진")));
    } else {
      // Fallback to basic details on Round item
      if (r.gang && r.gang !== '미정' && r.gang !== '—') list.push(addStaffRow(r.gang, "강사", "강"));
      if (r.sang && r.sang !== '배정 전' && r.sang !== '—') list.push(addStaffRow(r.sang, "상담사", "상"));
    }

    if (list.length === 0) {
      return <div className="muted" style={{ padding: '10px 0' }}>배정된 인력이 없습니다.</div>;
    }

    // Wrap in two columns if multiple
    const half = Math.ceil(list.length / 2);
    const leftCol = list.slice(0, half);
    const rightCol = list.slice(half);

    return (
      <div className="detail-grid" style={{ gap: '0 28px' }}>
        <div>{leftCol}</div>
        <div>
          {rightCol}
          {list.length < 10 && (
            <div className="assignee" style={{ opacity: 0.5 }}>
              <div className="ra" style={{ background: '#eef1f5', color: '#97a2b3' }}>+</div>
              <div>
                <div className="rr">배정 추가</div>
                <div className="rnm muted">미배정 (인력배정 탭 활용)</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="view active" id="view-round-detail">
      <button className="back" onClick={() => navigate('/rounds')}>← 회차 목록</button>
      
      <div className="detail-head">
        <div className="pa" style={{ borderRadius: '14px' }}>
          {r.no.replace('회차', '')}
        </div>
        <div>
          <div className="pn">{r.reg} {r.no}</div>
          <div className="pm">
            <span>교육 <b>{r.date}</b> (5일 30시간)</span>
            <span>교육장 <b>{r.location || '양천 교육장 A'}</b></span>
            <span className={`chip ${r.st[1]}`} style={{ marginTop: '-2px' }}>{r.st[0]}</span>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => alert('수행계획서 인쇄/다운로드 시안')}>수행계획서</button>
          {roleConfig.can.editR === 1 && (
            <button className="btn primary" id="btn-edit-round" onClick={() => setIsModalOpen(true)}>회차 수정</button>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <div className="card-h">
            <span className="section-title">회차 등록 진행</span>
            <span className="chip ok">정상 진행</span>
          </div>
          <div className="card-b">
            <div className="checklist">
              <div className="ci">
                <div className="cb done">✓</div>
                <div>
                  <div className="ct">수행계획서 제출</div>
                  <div className="cs">지역담당자 → 본부장 · 목 오전</div>
                </div>
                <div className="cw"><span className="dday ok">완료</span></div>
              </div>
              <div className="ci">
                <div className="cb done">✓</div>
                <div>
                  <div className="ct">소진공 등록</div>
                  <div className="cs">제출 후 1~2일 내 처리 (당일~익일)</div>
                </div>
                <div className="cw"><span className="dday ok">완료</span></div>
              </div>
              <div className="ci">
                <div className="cb done">✓</div>
                <div>
                  <div className="ct">모집 시작</div>
                  <div className="cs">모집 기간 06-09 ~ 06-20</div>
                </div>
                <div className="cw"><span className="dday ok">진행</span></div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: '11.5px', marginTop: '12px' }}>· 마지노선 D-5주 준수</p>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <span className="section-title">모집 인원</span>
            <span className={`chip ${r.cur >= (r.minCap || 12) ? 'ok' : 'warn'}`}>
              {r.cur >= (r.minCap || 12) ? '개강 기준 충족' : '모집 보강 필요'}
            </span>
          </div>
          <div className="card-b">
            <div className="capacity">
              <div className="big tnum">{r.cur}<small> / {r.cap}명</small></div>
              <div style={{ flex: 1 }}>
                <div className="cap-bar">
                  <span style={{ width: `${curPercent}%` }}></span>
                  <div className="thr" style={{ left: `${minPercent}%` }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                  <span>신청 {r.cur}명</span>
                  <span style={{ color: 'var(--danger)' }}>↑ 개강기준 {r.minCap || 12}명</span>
                </div>
              </div>
            </div>
            <div className="kv">
              <span className="k">사전상담 완료</span>
              <span className="v">{r.cur > 3 ? `${r.cur - 3} / ${r.cur}명` : '0명'}</span>
            </div>
            <div className="kv">
              <span className="k">연락 두절</span>
              <span className="v">
                <span className="chip warn">1명 (3회 시도)</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">배정 인력 (역할별 1~5명)</span>
          <span className="chip neutral">충돌 없음</span>
        </div>
        <div className="card-b">
          {renderStaffSection()}
        </div>
      </div>
      
      <p className="note">※ 강사·상담사·진행자 각 1~5명 배정. 마스터 엑셀 선점 입력이 이 배정표로 전환되며, 중복 배정 시 자동 경고.</p>

      {/* Modal */}
      <RoundModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        roundNo={r.no}
      />
    </section>
  );
}
