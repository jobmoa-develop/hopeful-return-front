import { useState } from 'react';
import { useRole } from '../context/RoleContext';
import { useData } from '../context/DataContext';

export default function AssignPage() {
  const { roleConfig } = useRole();
  const { 
    assignments, 
    updateAssignment, 
    removeStaffFromAssignment 
  } = useData();

  // Local state for inline staff input
  const [addingTo, setAddingTo] = useState<{ no: string; field: 'gang' | 'sang' | 'jin' } | null>(null);
  const [newStaffName, setNewStaffName] = useState('');

  // 1. Role Scope Filter
  const getVisibleAssignments = () => {
    let list = [...assignments];
    if (roleConfig.scope === 'region') {
      list = list.filter(a => a.reg === roleConfig.region);
    } else if (roleConfig.scope === 'rounds' && roleConfig.rounds) {
      list = list.filter(a => roleConfig.rounds?.includes(a.no));
    }
    return list;
  };

  const filteredList = getVisibleAssignments();

  const handleAddClick = (no: string, field: 'gang' | 'sang' | 'jin') => {
    setAddingTo({ no, field });
    setNewStaffName('');
  };

  const handleSaveStaff = (no: string, field: 'gang' | 'sang' | 'jin') => {
    if (!newStaffName.trim()) return;
    updateAssignment(no, field, newStaffName.trim());
    setAddingTo(null);
    setNewStaffName('');
  };

  const handleRemoveStaff = (no: string, field: 'gang' | 'sang' | 'jin', name: string) => {
    removeStaffFromAssignment(no, field, name);
  };

  const renderTagList = (arr: string[], no: string, field: 'gang' | 'sang' | 'jin', label: string) => {
    const isAddingThis = addingTo && addingTo.no === no && addingTo.field === field;

    return (
      <div className="assign-col">
        <div className="acl">{label} ({arr.length}/5)</div>
        
        {arr.map(name => (
          <span className="assign-tag" key={name}>
            {name}
            <span className="rm" onClick={() => handleRemoveStaff(no, field, name)}>✕</span>
          </span>
        ))}

        {isAddingThis ? (
          <div style={{ display: 'flex', gap: '4px', margin: '4px 0' }}>
            <input 
              type="text" 
              placeholder="이름 입력..." 
              value={newStaffName} 
              onChange={e => setNewStaffName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveStaff(no, field);
                else if (e.key === 'Escape') setAddingTo(null);
              }}
              style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '6px', width: '100px' }}
              autoFocus
            />
            <button className="btn" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => handleSaveStaff(no, field)}>추가</button>
            <button className="btn" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => setAddingTo(null)}>취소</button>
          </div>
        ) : (
          arr.length < 5 && (
            <span className="assign-empty" onClick={() => handleAddClick(no, field)}>
              + {label} 배정
            </span>
          )
        )}
      </div>
    );
  };

  return (
    <section className="view active" id="view-assign">
      <div className="perm-bar">
        <span className="pb-ic">🧩</span>
        회차별 강사·상담사·진행자 배정 현황 (각 1~5명) · 중복 배정 시 자동 경고
      </div>

      <div className="assign-board" id="assign-board">
        {filteredList.map((a, idx) => (
          <div className="assign-card" key={idx}>
            <div className="ac-h">
              <span className="rno">{a.reg} {a.no}</span>
              <span className="muted tnum" style={{ fontSize: '12.5px' }}>{a.date}</span>
              {a.warn ? (
                <span className="chip warn" style={{ marginLeft: 'auto' }}>⚠ {a.warn}</span>
              ) : (
                <span className="chip ok" style={{ marginLeft: 'auto' }}>충돌 없음</span>
              )}
            </div>
            <div className="ac-b">
              {renderTagList(a.gang, a.no, 'gang', '강사')}
              {renderTagList(a.sang, a.no, 'sang', '상담사')}
              {renderTagList(a.jin, a.no, 'jin', '진행자')}
            </div>
          </div>
        ))}
        {filteredList.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
            배정 대상 회차가 없습니다.
          </div>
        )}
      </div>
      <p className="note">※ 같은 인력이 겹치는 날짜 회차에 동시 배정되면 경고가 표시됩니다.</p>
    </section>
  );
}
