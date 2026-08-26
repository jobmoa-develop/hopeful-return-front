import { formatDateCol } from '../pages/assign/roles';

export type ConflictRow = { date: string; name: string; detail: string };
export type ConflictAction = { label: string; onClick: () => void; primary?: boolean };

// 날짜·인력·세부 내용을 표로 보여주고 하단에 액션 버튼을 배치하는 공용 충돌 확인 모달.
// 인력배정(AssignPage)과 회차 교육일 변경(RoundDetailPage) 등에서 공유한다.
export function ConflictModal({
  title,
  description,
  rows,
  actions,
  detailHeader = '기존 배정(회차 · 역할)',
}: {
  title: string;
  description: string;
  rows: ConflictRow[];
  actions: ConflictAction[];
  detailHeader?: string;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '520px',
          width: '92%',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '18px 20px',
        }}
      >
        <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
        <p className="muted" style={{ fontSize: '13px', marginTop: 0 }}>
          {description}
        </p>
        <div className="tbl-wrap" style={{ margin: '8px 0 14px' }}>
          <table className="att-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>인력</th>
                <th>{detailHeader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.date}-${r.name}-${i}`}>
                  <td>{formatDateCol(r.date)}</td>
                  <td>{r.name}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {actions.map((a) => (
            <button key={a.label} className={a.primary ? 'btn primary' : 'btn'} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
