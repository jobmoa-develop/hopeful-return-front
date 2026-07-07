import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';

export default function DashboardPage() {
  const { tasks, alerts, regions, rounds, participants } = useData();
  const navigate = useNavigate();

  // Dynamic calculations based on mock state
  const activeRoundsCount = rounds.filter(r => ['모집중', '개강확정', '교육중'].includes(r.st[0])).length;
  
  // Calculate warning counts
  const alertCount = alerts.reduce((acc, curr) => acc + curr.cnt, 0);

  // Completed count (adds a baseline of 35 to match the 38 starting value and shifts dynamically)
  const completedBase = participants.filter(p => p.su[0] === '수료').length;
  const completedCount = 35 + completedBase;

  return (
    <section className="view active" id="view-dashboard">
      <div className="kpis">
        <div className="kpi r-navy">
          <div className="rail"></div>
          <div className="lab">진행 중 회차</div>
          <div className="val tnum">{activeRoundsCount}<small>개</small></div>
          <div className="sub muted">모집 3 · 개강확정 1 · 교육중 3</div>
        </div>
        <div className="kpi r-warn">
          <div className="rail"></div>
          <div className="lab">이번 주 마감</div>
          <div className="val tnum">5<small>건</small></div>
          <div className="sub" style={{ color: 'var(--warn)' }}>
            <span className="dot warn"></span>오늘 마감 1건 포함
          </div>
        </div>
        <div className="kpi r-danger">
          <div className="rail"></div>
          <div className="lab">경고 · 위반</div>
          <div className="val tnum">{alertCount}<small>건</small></div>
          <div className="sub" style={{ color: 'var(--danger)' }}>
            <span className="dot danger"></span>즉시 확인 필요
          </div>
        </div>
        <div className="kpi r-ok">
          <div className="rail"></div>
          <div className="lab">이번 달 수료</div>
          <div className="val tnum">{completedCount}<small>명</small></div>
          <div className="sub" style={{ color: 'var(--ok)' }}>수료율 94.2%</div>
        </div>
      </div>

      <div className="dash-cols">
        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h">
              <span className="section-title">오늘 할 일 · 마감 임박</span>
              <span className="chip neutral">D-6주 루틴 포함</span>
            </div>
            <div id="task-list">
              {tasks.map((t, idx) => (
                <div className="task" key={idx}>
                  <div className="when">
                    <span className={`dday ${t.when[1]}`}>{t.when[0]}</span>
                  </div>
                  <div>
                    <div className="ttl">{t.ttl}</div>
                    <div className="meta">{t.meta}</div>
                  </div>
                  <div className="who">
                    <div className="nm">{t.who[0]}</div>
                    <div className="rl">{t.who[1]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="section-title">지역별 회차 현황</span>
              <span className="more" onClick={() => navigate('/rounds')}>전체 보기 →</span>
            </div>
            <div className="card-b" style={{ padding: '14px 16px 18px' }}>
              <div className="regions" id="regions">
                {regions.map((r, idx) => (
                  <div className="region" key={idx}>
                    <div className="rn">{r.nm}</div>
                    <div className="rc tnum">
                      {r.cnt}
                      <span className="rl"> {r.lb}</span>
                    </div>
                    <div className="rb">
                      {r.pills.map((p, pIdx) => (
                        <span className={`pill chip ${p[1]}`} key={pIdx}>
                          {p[0]}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h">
              <span className="section-title">경고 패널</span>
            </div>
            <div id="alert-list">
              {alerts.map((a, idx) => (
                <div className="alert" key={idx}>
                  <div className={`ai ${a.ic}`}>!</div>
                  <div>
                    <div className="at">{a.t}</div>
                    <div className="as">{a.s}</div>
                  </div>
                  <div className="cnt tnum">{a.cnt}</div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="card">
            <div className="card-h">
              <span className="section-title">이번 분기 성과 요약</span>
            </div>
            <div className="card-b">
              <div className="kv">
                <span className="k">국취 연계율</span>
                <span className="v">
                  48% <span className="muted" style={{ fontWeight: 500 }}>/ 만점 50%</span>
                </span>
              </div>
              <div className="kv">
                <span className="k">취업률</span>
                <span className="v">21%</span>
              </div>
              <div className="kv">
                <span className="k">회차 수행도</span>
                <span className="v tnum">12 / 50</span>
              </div>
              <div className="kv">
                <span className="k">사후관리 진행</span>
                <span className="v">112명</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="note">※ 모든 수치·이름은 화면 설명용 가상 데이터입니다. 실제 연동·계산 로직은 개발 단계에서 구현됩니다.</p>
    </section>
  );
}
