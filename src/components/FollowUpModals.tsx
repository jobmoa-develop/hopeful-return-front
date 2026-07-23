import { useCallback, useEffect, useState } from 'react';
import { useRole } from '../context/RoleContext';
import { createFollowUp, updateFollowUp, NATIONAL_PROGRAM_BRANCHES } from '../api/followUps';
import type { FollowUpListItem } from '../api/followUps';
import {
  getCounsels,
  createCounsel,
  updateCounsel,
  deleteCounsel,
  COUNSEL_STATUS_LABELS,
  COUNSEL_STATUSES,
} from '../api/followUpCounsels';
import type { CounselStatus, FollowUpCounsel } from '../api/followUpCounsels';
import { apiErrorMessage } from '../api/apiError';

const READONLY = { background: '#f4f6f9', color: '#69768a' } as const;
const SMALL_BTN = { padding: '3px 8px', fontSize: '11px', marginRight: '4px' } as const;

interface FollowUpDetailModalProps {
  item: FollowUpListItem;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void; // 목록(상담수 등) 갱신용
}

// 사후관리 상세 모달 — 상단(참여자 정보) · 중단(기본정보 편집) · 하단(상담 히스토리)
export function FollowUpDetailModal({ item, canEdit, onClose, onSaved }: FollowUpDetailModalProps) {
  const { roleConfig } = useRole();

  // 중단: 사후관리 기본정보
  const [employmentDate, setEmploymentDate] = useState(item.employmentDate ?? '');
  const [forestProgramDate, setForestProgramDate] = useState(item.forestProgramDate ?? '');
  const [nationalProgramDate, setNationalProgramDate] = useState(item.nationalProgramDate ?? '');
  const [nationalProgramBranch, setNationalProgramBranch] = useState(
    item.nationalProgramBranch ?? '',
  );
  const [savingBase, setSavingBase] = useState(false);

  // 하단: 상담 히스토리
  const [counsels, setCounsels] = useState<FollowUpCounsel[]>([]);
  const [loadingCounsels, setLoadingCounsels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 상담 추가 폼
  const [newDate, setNewDate] = useState('');
  const [newStatus, setNewStatus] = useState<CounselStatus>('landline');
  const [newMemo, setNewMemo] = useState('');
  const [addingCounsel, setAddingCounsel] = useState(false);

  // 상담 수정(인라인)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStatus, setEditStatus] = useState<CounselStatus>('landline');
  const [editMemo, setEditMemo] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadCounsels = useCallback(() => {
    setLoadingCounsels(true);
    setError(null);
    getCounsels(item.courseParticipantId)
      .then((res) => setCounsels(res.data.data ?? []))
      .catch((err) => setError(apiErrorMessage(err, '상담 로그를 불러오지 못했습니다.')))
      .finally(() => setLoadingCounsels(false));
  }, [item.courseParticipantId]);

  useEffect(() => {
    loadCounsels();
  }, [loadCounsels]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nextCounselNumber = counsels.reduce((m, c) => Math.max(m, c.counselNumber ?? 0), 0) + 1;

  const handleSaveBase = async () => {
    setSavingBase(true);
    try {
      const payload = {
        employmentDate: employmentDate || null,
        forestProgramDate: forestProgramDate || null,
        nationalProgramDate: nationalProgramDate || null,
        nationalProgramBranch: nationalProgramBranch || null,
      };
      // 스냅샷이 없던 수료자는 생성(POST), 있으면 수정(PUT)
      if (item.followUpId == null) {
        await createFollowUp({ courseParticipantId: item.courseParticipantId, ...payload });
      } else {
        await updateFollowUp(item.followUpId, payload);
      }
      onSaved();
      alert('기본정보가 저장되었습니다.');
    } catch (err) {
      alert(apiErrorMessage(err, '기본정보 저장에 실패했습니다.'));
    } finally {
      setSavingBase(false);
    }
  };

  const handleAddCounsel = async () => {
    if (!newDate) {
      alert('상담일을 선택하세요.');
      return;
    }
    setAddingCounsel(true);
    try {
      await createCounsel({
        courseParticipantId: item.courseParticipantId,
        counselNumber: nextCounselNumber,
        counselDate: newDate,
        counselStatus: newStatus,
        counselMemo: newMemo.trim() || null,
      });
      setNewDate('');
      setNewStatus('landline');
      setNewMemo('');
      loadCounsels();
      onSaved();
    } catch (err) {
      alert(apiErrorMessage(err, '상담 등록에 실패했습니다.'));
    } finally {
      setAddingCounsel(false);
    }
  };

  const startEdit = (c: FollowUpCounsel) => {
    setEditingId(c.followUpCounselId);
    setEditDate(c.counselDate ?? '');
    setEditStatus(c.counselStatus ?? 'landline');
    setEditMemo(c.counselMemo ?? '');
  };

  const handleSaveEdit = async (id: number) => {
    setSavingEdit(true);
    try {
      await updateCounsel(id, {
        counselDate: editDate || null,
        counselStatus: editStatus,
        counselMemo: editMemo.trim() || null,
      });
      setEditingId(null);
      loadCounsels();
    } catch (err) {
      alert(apiErrorMessage(err, '상담 수정에 실패했습니다.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('이 상담 기록을 삭제할까요?')) return;
    try {
      await deleteCounsel(id);
      loadCounsels();
      onSaved();
    } catch (err) {
      alert(apiErrorMessage(err, '상담 삭제에 실패했습니다.'));
    }
  };

  const roundText = `${item.regionName ?? '—'}${
    item.localCourseNumber != null ? ` · ${item.localCourseNumber}회차` : ''
  }`;

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '680px' }}>
        <div className="modal-h">
          <h3>사후관리 · {item.name}</h3>
          <span className="badge-role">
            {roleConfig.nm} · {roleConfig.role}
          </span>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-b">
          {/* 상단: 참여자 정보(읽기 전용) */}
          <div className="form-grid">
            <div className="form-section">참여자 정보</div>
            <div className="field">
              <label>성명</label>
              <input value={item.name} disabled style={READONLY} />
            </div>
            <div className="field">
              <label>지역 / 회차</label>
              <input value={roundText} disabled style={READONLY} />
            </div>
            <div className="field">
              <label>수료일</label>
              <input value={item.completionDate ?? '—'} disabled style={READONLY} />
            </div>
          </div>

          {/* 중단: 사후관리 기본정보(편집) */}
          <div className="form-grid" style={{ marginTop: '14px' }}>
            <div className="form-section">사후관리 정보</div>
            <div className="field">
              <label>취업일</label>
              <input
                type="date"
                value={employmentDate}
                disabled={!canEdit}
                onChange={(e) => setEmploymentDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>숲체험 방문(예정)일</label>
              <input
                type="date"
                value={forestProgramDate}
                disabled={!canEdit}
                onChange={(e) => setForestProgramDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>국취 연계일</label>
              <input
                type="date"
                value={nationalProgramDate}
                disabled={!canEdit}
                onChange={(e) => setNationalProgramDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>국취 연계지점</label>
              <select
                value={nationalProgramBranch}
                disabled={!canEdit}
                onChange={(e) => setNationalProgramBranch(e.target.value)}
              >
                <option value="">선택 안 함</option>
                {NATIONAL_PROGRAM_BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button className="btn primary" onClick={handleSaveBase} disabled={savingBase}>
                {savingBase ? '저장 중…' : '기본정보 저장'}
              </button>
            </div>
          )}

          {/* 하단: 상담 히스토리 */}
          <div className="form-section" style={{ marginTop: '18px' }}>
            상담 히스토리
          </div>
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '8px' }}>
              {error}
            </div>
          )}

          <div className="tbl-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: '48px' }}>회차</th>
                  <th style={{ width: '128px' }}>상담일</th>
                  <th style={{ width: '84px' }}>방식</th>
                  <th>메모</th>
                  {canEdit && <th style={{ width: '104px' }}>관리</th>}
                </tr>
              </thead>
              <tbody>
                {counsels.map((c) =>
                  editingId === c.followUpCounselId ? (
                    <tr key={c.followUpCounselId}>
                      <td>{c.counselNumber ?? '—'}</td>
                      <td>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          style={{ fontSize: '12px' }}
                        />
                      </td>
                      <td>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as CounselStatus)}
                          style={{ fontSize: '12px' }}
                        >
                          {COUNSEL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {COUNSEL_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                          style={{ fontSize: '12px', width: '100%' }}
                        />
                      </td>
                      <td>
                        <button
                          className="btn primary"
                          style={SMALL_BTN}
                          disabled={savingEdit}
                          onClick={() => handleSaveEdit(c.followUpCounselId)}
                        >
                          저장
                        </button>
                        <button
                          className="btn"
                          style={SMALL_BTN}
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.followUpCounselId}>
                      <td>{c.counselNumber ?? '—'}</td>
                      <td>{c.counselDate ?? '—'}</td>
                      <td>
                        <span className="chip neutral">
                          {c.counselStatus ? COUNSEL_STATUS_LABELS[c.counselStatus] : '—'}
                        </span>
                      </td>
                      <td>{c.counselMemo ?? '—'}</td>
                      {canEdit && (
                        <td>
                          <button className="btn" style={SMALL_BTN} onClick={() => startEdit(c)}>
                            수정
                          </button>
                          <button
                            className="btn"
                            style={SMALL_BTN}
                            onClick={() => handleDelete(c.followUpCounselId)}
                          >
                            삭제
                          </button>
                        </td>
                      )}
                    </tr>
                  ),
                )}
                {!loadingCounsels && counsels.length === 0 && (
                  <tr>
                    <td
                      colSpan={canEdit ? 5 : 4}
                      style={{ textAlign: 'center', padding: '18px', color: 'var(--muted)' }}
                    >
                      등록된 상담 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 상담 추가 폼 */}
          {canEdit && (
            <div className="card" style={{ padding: '12px', marginTop: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                새 상담 등록 (회차 {nextCounselNumber})
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  style={{ fontSize: '12px' }}
                />
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as CounselStatus)}
                  style={{ fontSize: '12px' }}
                >
                  {COUNSEL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {COUNSEL_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <input
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  placeholder="메모"
                  style={{ fontSize: '12px', flex: 1, minWidth: '160px' }}
                />
                <button className="btn primary" onClick={handleAddCounsel} disabled={addingCounsel}>
                  {addingCounsel ? '등록 중…' : '+ 추가'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
