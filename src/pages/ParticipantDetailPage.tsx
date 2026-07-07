import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';
import { ParticipantModal, AttendanceModal, ConsultingModal, CompletionModal, MemoModal } from '../components/Modal';

export default function ParticipantDetailPage() {
  const { phone } = useParams<{ phone: string }>();
  const navigate = useNavigate();
  const { roleConfig, pidLabel } = useRole();
  const { participants, memos } = useData();

  const [activeModal, setActiveModal] = useState<'participant' | 'attend' | 'consult' | 'complete' | 'memo' | null>(null);

  const p = participants.find(x => x.phone === phone);

  if (!p) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <button className="back" onClick={() => navigate('/participants')}>← 참여자 목록</button>
        <h2>참여자를 찾을 수 없습니다.</h2>
      </div>
    );
  }

  // Helper logic for Journey Rail classes
  const getStepStatus = (step: string): 'done' | 'current' | 'idle' => {
    const status = p.st[0];
    // Custom check for selection / pre-consultation state transitions
    if (step === "접수") return 'done';
    if (step === "선정") {
      if (status === "접수" || status === "미선정") return 'idle';
      if (status === "선정") return 'current';
      return 'done';
    }
    if (step === "사전상담") {
      if (["접수", "선정", "미선정"].includes(status)) return 'idle';
      if (status === "사전상담완료") return 'done';
      if (p.preConsultDate) return 'done';
      return 'idle';
    }
    if (step === "현장교육") {
      if (["교육중"].includes(status)) return 'current';
      if (["수료", "미수료", "사후관리", "종료"].includes(status)) return 'done';
      return 'idle';
    }
    if (step === "수료") {
      if (["수료"].includes(status)) return 'current';
      if (["사후관리", "종료"].includes(status)) return 'done';
      return 'idle';
    }
    if (step === "사후관리") {
      if (["사후관리"].includes(status)) return 'current';
      if (["종료"].includes(status)) return 'done';
      return 'idle';
    }
    return 'idle';
  };

  const getAttDayClass = (day: string) => {
    if (day === '출석') return 'ok';
    if (['지각', '외출', '조퇴'].includes(day)) return 'warn';
    if (day === '결석') return 'danger';
    return '';
  };

  const completedDays = p.attendanceDays.filter(d => d !== 'none').length;

  return (
    <section className="view active" id="view-participant-detail">
      <button className="back" onClick={() => navigate('/participants')}>← 참여자 목록</button>
      
      <div className="detail-head">
        <div className="pa" id="d-avatar">{p.nm.charAt(0)}</div>
        <div>
          <div className="pn" id="d-name">{p.nm}</div>
          <div className="pm">
            <span><b id="d-region">{p.reg}</b> · <b id="d-round">{p.rd}</b></span>
            <span>참여자ID <b id="d-pid">{pidLabel(p)}</b></span>
            <span>출생연도 <b>{p.birthYear}</b></span>
            <span>유입 <b>{p.inflow}</b></span>
          </div>
        </div>
        <div className="actions">
          {roleConfig.can.attend === 1 && (
            <button className="btn" id="btn-attend" onClick={() => setActiveModal('attend')}>출결 입력</button>
          )}
          {roleConfig.can.consult === 1 && (
            <button className="btn" id="btn-consult" onClick={() => setActiveModal('consult')}>상담 입력</button>
          )}
          {roleConfig.can.complete === 1 && (
            <button className="btn" id="btn-complete" onClick={() => setActiveModal('complete')}>수료·수당</button>
          )}
          {roleConfig.can.editP === 1 && (
            <button className="btn primary" id="btn-edit-participant" onClick={() => setActiveModal('participant')}>정보 수정</button>
          )}
        </div>
      </div>

      {/* Journey Rail */}
      <div className="journey">
        <div className="jh">
          <span className="eyebrow">참여자 여정</span>
          <span className={`chip ${p.st[1]}`} id="d-status">{p.st[0]}</span>
        </div>
        <div className="rail">
          <div className={`step ${getStepStatus("접수")}`}>
            <div className="node">{getStepStatus("접수") === 'done' ? '✓' : ''}</div>
            <div className="sl">접수</div>
            <div className="sd">{p.receptionDate ? p.receptionDate.slice(5) : '05-12'}</div>
          </div>
          <div className={`step ${getStepStatus("선정")}`}>
            <div className="node">{getStepStatus("선정") === 'done' ? '✓' : (getStepStatus("선정") === 'current' ? <i></i> : '')}</div>
            <div className="sl">선정</div>
            <div className="sd">소진공 선정</div>
          </div>
          <div className={`step ${getStepStatus("사전상담")}`}>
            <div className="node">{getStepStatus("사전상담") === 'done' ? '✓' : ''}</div>
            <div className="sl">사전상담</div>
            <div className="sd">
              {p.preConsultDate ? `대면 · ${p.preConsultDate.slice(5)}` : '대면 1회'}
            </div>
          </div>
          <div className={`step ${getStepStatus("현장교육")}`}>
            <div className="node">
              {getStepStatus("현장교육") === 'done' ? '✓' : (getStepStatus("현장교육") === 'current' ? <i></i> : '')}
            </div>
            <div className="sl">현장교육</div>
            <div className="sd">{completedDays}일차 / 5일</div>
          </div>
          <div className={`step ${getStepStatus("수료")}`}>
            <div className="node">
              {getStepStatus("수료") === 'done' ? '✓' : (getStepStatus("수료") === 'current' ? <i></i> : '')}
            </div>
            <div className="sl">수료</div>
            <div className="sd">{p.su[0] === '수료' ? '수료 완료' : '예정 06-27'}</div>
          </div>
          <div className={`step ${getStepStatus("사후관리")}`}>
            <div className="node">
              {getStepStatus("사후관리") === 'done' ? '✓' : (getStepStatus("사후관리") === 'current' ? <i></i> : '')}
            </div>
            <div className="sl">사후관리</div>
            <div className="sd">대면2·비대면6</div>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h"><span className="section-title">유입 · 자격</span></div>
            <div className="card-b">
              <div className="kv"><span className="k">유입 경로</span><span className="v">{p.inflow}</span></div>
              <div className="kv"><span className="k">접수일 / 신청일</span><span className="v">{(p.receptionDate || '05-12').slice(5)} / {(p.applyDate || '05-15').slice(5)}</span></div>
              <div className="kv">
                <span className="k">기초교육 수료</span>
                <span className="v">
                  <span className={`chip ${p.basicEducation === 'Y' ? 'ok' : 'warn'}`}>
                    {p.basicEducation === 'Y' ? '확인 완료' : (p.basicEducation === '확인필요' ? '확인 필요' : '미수료')}
                  </span>
                </span>
              </div>
              <div className="kv">
                <span className="k">안내문자 발송</span>
                <span className="v">{p.smsSent ? '✓ 선정 후 발송' : '발송 전'}</span>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><span className="section-title">사전상담 (대면)</span></div>
            <div className="card-b">
              <div className="kv"><span className="k">담당 상담사</span><span className="v">{p.counselorName} <span className="muted" style={{ fontWeight: 500 }}>(사후 디폴트·변경가능)</span></span></div>
              <div className="kv">
                <span className="k">사전상담 일시</span>
                <span className="v">
                  {p.preConsultDate ? `대면 1회 · ${p.preConsultDate.slice(5)} ${p.preConsultTime || ''}` : '미일정'}
                </span>
              </div>
              <div className="kv">
                <span className="k">상담일지</span>
                <span className="v">
                  <span className={`chip ${p.preConsultDocWritten ? 'ok' : 'neutral'}`}>
                    {p.preConsultDocWritten ? '작성 완료' : '—'}
                  </span>
                </span>
              </div>
              <div className="kv"><span className="k">연락 시도</span><span className="v">{p.contactAttempts || (p.sang[0] === '완료' ? '1회 (성공)' : '0회')}</span></div>
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: '18px' }}>
          <div className="card">
            <div className="card-h">
              <span className="section-title">출결 현황 (일자별)</span>
              {p.attendanceDetails && <span className="chip warn">{p.attendanceDetails.split(' ')[0]} {p.attendanceDetails.split(' ')[1]}</span>}
            </div>
            <div className="card-b">
              <div className="att-grid">
                {p.attendanceDays.map((d, index) => (
                  <div className={`att-day ${getAttDayClass(d)}`} key={index}>
                    <div className="d">{index + 1}일</div>
                    <div className="s">{d === 'none' ? '—' : d}</div>
                  </div>
                ))}
              </div>
              {p.attendanceDetails && (
                <div className="kv" style={{ marginTop: '10px' }}>
                  <span className="k">외출·조퇴 시간 기록</span>
                  <span className="v">{p.attendanceDetails}</span>
                </div>
              )}
              <p className="muted" style={{ fontSize: '11.5px', marginTop: '6px' }}>
                · 외출·조퇴는 시간 기록 · 수료 기준(전 시간 이수) 충족 가능
              </p>
            </div>
          </div>
          
          <div className="card">
            <div className="card-h"><span className="section-title">수료 · 수당</span></div>
            <div className="card-b">
              <div className="kv">
                <span className="k">수료 여부</span>
                <span className="v">
                  {p.su[0] !== '—' ? <span className={`chip ${p.su[1]}`}>{p.su[0]}</span> : <span className="muted">진행 상태로 확인 ({p.st[0]})</span>}
                </span>
              </div>
              {p.st[0] === '미수료' && (
                <div className="kv">
                  <span className="k">미수료 사유</span>
                  <span className="v" style={{ color: 'var(--danger)' }}>교육시간 미충족</span>
                </div>
              )}
              <div className="kv">
                <span className="k">수당 지급 여부</span>
                <span className="v">
                  {p.allowancePaid ? <span className="chip ok">지급 완료</span> : <span className="chip neutral">미지급 (수료 대기)</span>}
                </span>
              </div>
              {p.allowancePaid && (
                <>
                  <div className="kv"><span className="k">수당 지급일</span><span className="v">{p.allowanceDate || '2026-06-25'}</span></div>
                  <div className="kv"><span className="k">지급 금액 / 은행</span><span className="v">{p.allowanceAmount?.toLocaleString() || '250,000'}원 {p.allowanceRemark ? `(${p.allowanceRemark})` : ''}</span></div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">사후상담 (대면 2회) · 사후관리 (비대면 6개월)</span>
          <span className="chip neutral">{['사후관리', '종료'].includes(p.st[0]) ? '진행 중' : '수료 후 시작'}</span>
        </div>
        <div className="card-b">
          <div className="detail-grid" style={{ gap: '18px', marginBottom: '16px' }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: '8px' }}>사후상담 · 대면 2회 (담당 상담사)</div>
              <div className="kv">
                <span className="k">사후상담 1차</span>
                <span className="v">
                  {p.post1ConsultDate ? `${p.post1Counselor} · ${p.post1ConsultDate} ${p.post1ConsultTime || ''}` : <span className="muted">예정</span>}
                </span>
              </div>
              <div className="kv">
                <span className="k">사후상담 2차</span>
                <span className="v">
                  {p.post2ConsultDate ? `${p.post2Counselor} · ${p.post2ConsultDate} ${p.post2ConsultTime || ''}` : <span className="muted">예정</span>}
                </span>
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: '8px' }}>사후관리 · 비대면 문자·유선 (월 1회)</div>
              <div className="months">
                {[1, 2, 3, 4, 5, 6].map(m => {
                  const isDone = ['사후관리', '종료'].includes(p.st[0]) && m === 1; // Month 1 check for follow-up mock
                  return (
                    <div className="mo" key={m}>
                      <div className={`mc ${isDone ? 'done' : 'idle'}`}>{isDone ? '✓' : '—'}</div>
                      <div className="ml">{m}월</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="detail-grid" style={{ gap: '14px' }}>
            <div className="kv">
              <span className="k">국취 연계</span>
              <span className="v">
                {p.guk[0] !== '—' ? <span className={`chip ${p.guk[1]}`}>{p.guk[0]}</span> : <span className="muted">미신청</span>}
              </span>
            </div>
            <div className="kv">
              <span className="k">취업 여부 / 취업일</span>
              <span className="v">
                {p.job[0] !== '—' ? <span className={`chip ${p.job[1]}`}>{p.job[0]}</span> : <span className="muted">추적 대기</span>}
              </span>
            </div>
            <div className="kv">
              <span className="k">숲체험 참여 / 참여일</span>
              <span className="v">
                <span className="chip ok">신청함</span> · 07-08 예정
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '18px' }}>
        <div className="card-h">
          <span className="section-title">메모 (비고)</span>
          <span className="chip neutral">지역담당자 · 상담사 · 강사 작성</span>
          {roleConfig.can.memo === 1 && (
            <button className="btn" id="btn-memo" style={{ marginLeft: 'auto', padding: '5px 11px', fontSize: '12px' }} onClick={() => setActiveModal('memo')}>
              + 메모 추가
            </button>
          )}
        </div>
        <div id="memo-list">
          {memos.map((m, idx) => (
            <div className="memo-item" key={idx}>
              <div className="memo-av">{m.who[0]}</div>
              <div className="memo-body" style={{ flex: 1 }}>
                <div className="memo-head">
                  <b>{m.who}</b>
                  <span className="chip neutral" style={{ fontSize: '10.5px', marginLeft: '6px' }}>{m.role}</span>
                  <span className="memo-date">{m.date}</span>
                </div>
                <div className="memo-txt">{m.txt}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <p className="note">※ 한 참여자의 유입~취업 전 과정이 이 한 화면에 모입니다. (운영 설계 7-4 참여자 통합 총괄표)</p>

      {/* Modals */}
      <ParticipantModal 
        isOpen={activeModal === 'participant'} 
        onClose={() => setActiveModal(null)} 
        phone={p.phone} 
      />
      <AttendanceModal 
        isOpen={activeModal === 'attend'} 
        onClose={() => setActiveModal(null)} 
        phone={p.phone} 
      />
      <ConsultingModal 
        isOpen={activeModal === 'consult'} 
        onClose={() => setActiveModal(null)} 
        phone={p.phone} 
      />
      <CompletionModal 
        isOpen={activeModal === 'complete'} 
        onClose={() => setActiveModal(null)} 
        phone={p.phone} 
      />
      <MemoModal 
        isOpen={activeModal === 'memo'} 
        onClose={() => setActiveModal(null)} 
      />
    </section>
  );
}
