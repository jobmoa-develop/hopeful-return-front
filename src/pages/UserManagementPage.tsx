import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { useRole } from '../context/RoleContext';
import {
    checkLoginId,
    createUser,
    deleteUser,
    getUser,
    getUsers,
    resetUserPassword,
    roleNameLabel,
    updateUser,
    ROLE_NAME_OPTIONS,
} from '../api/users';
import type {
    CreateUserRequest,
    UpdateUserRequest,
    UserDetail,
    UserListItem,
    UserRoleNameValue,
} from '../api/users';

const PAGE_SIZE = 20;

function getErrorMessage(error: unknown) {
    if (isAxiosError<{ error?: string; message?: string }>(error)) {
        const data = error.response?.data;
        return data?.error ?? data?.message ?? '요청 처리 중 오류가 발생했습니다.';
    }
    return '요청 처리 중 오류가 발생했습니다.';
}

const toggleRole = (list: UserRoleNameValue[], role: UserRoleNameValue): UserRoleNameValue[] =>
    list.includes(role) ? list.filter((r) => r !== role) : [...list, role];

type CreateFormState = {
    loginId: string;
    password: string;
    name: string;
    phone: string;
    email: string;
    roleNames: UserRoleNameValue[];
};

const EMPTY_CREATE_FORM: CreateFormState = {
    loginId: '',
    password: '',
    name: '',
    phone: '',
    email: '',
    roleNames: [],
};

type EditFormState = {
    name: string;
    phone: string;
    email: string;
    roleNames: UserRoleNameValue[];
    enabled: boolean;
    locked: boolean;
};

export default function UserManagementPage() {
    const { roleConfig } = useRole();
    const canWrite = roleConfig.roles.includes('ADMIN');

    const [users, setUsers] = useState<UserListItem[]>([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    const [nameFilter, setNameFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('');

    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState('');
    const [loginIdCheck, setLoginIdCheck] = useState<'idle' | 'checking' | 'ok' | 'dup'>('idle');

    const [editTarget, setEditTarget] = useState<UserDetail | null>(null);
    const [editForm, setEditForm] = useState<EditFormState | null>(null);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');

    const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
    const [deleteSaving, setDeleteSaving] = useState(false);

    const [resetSaving, setResetSaving] = useState(false);
    const [resetError, setResetError] = useState('');
    const [resetResult, setResetResult] = useState<string | null>(null);

    const loadUsers = async () => {
        setIsLoading(true);
        setErrorMessage('');
        try {
            const { data: response } = await getUsers({
                page,
                size: PAGE_SIZE,
                name: nameFilter || undefined,
                roleName: roleFilter || undefined,
                enabled: enabledFilter === '' ? undefined : enabledFilter === 'true',
            });
            const result = response.data;
            setUsers(result?.content ?? []);
            setTotalPages(result?.totalPages ?? 0);
            setTotalElements(result?.totalElements ?? 0);
        } catch (error) {
            setUsers([]);
            setErrorMessage(getErrorMessage(error));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const handleSearch = () => {
        if (page === 0) {
            void loadUsers();
        } else {
            setPage(0);
        }
    };

    const resetFilters = () => {
        setNameFilter('');
        setRoleFilter('');
        setEnabledFilter('');
        if (page === 0) {
            void loadUsers();
        } else {
            setPage(0);
        }
    };

    // ===== 등록 =====
    const openCreate = () => {
        setCreateForm(EMPTY_CREATE_FORM);
        setCreateError('');
        setLoginIdCheck('idle');
        setCreateOpen(true);
    };

    const handleCheckLoginId = async () => {
        if (!createForm.loginId.trim()) return;
        setLoginIdCheck('checking');
        try {
            const { data: response } = await checkLoginId(createForm.loginId.trim());
            setLoginIdCheck(response.data?.duplicate ? 'dup' : 'ok');
        } catch (error) {
            setLoginIdCheck('idle');
            setCreateError(getErrorMessage(error));
        }
    };

    const handleCreateSubmit = async () => {
        setCreateError('');
        if (!createForm.loginId.trim() || !createForm.password || !createForm.name.trim()) {
            setCreateError('로그인 ID, 비밀번호, 이름은 필수입니다.');
            return;
        }
        if (createForm.password.length < 8) {
            setCreateError('비밀번호는 8자 이상이어야 합니다.');
            return;
        }
        if (createForm.roleNames.length === 0) {
            setCreateError('역할을 1개 이상 선택하세요.');
            return;
        }
        if (loginIdCheck === 'dup') {
            setCreateError('이미 사용 중인 로그인 ID입니다.');
            return;
        }
        const payload: CreateUserRequest = {
            loginId: createForm.loginId.trim(),
            password: createForm.password,
            name: createForm.name.trim(),
            phone: createForm.phone.trim() || undefined,
            email: createForm.email.trim() || undefined,
            roleNames: createForm.roleNames,
        };
        setCreateSaving(true);
        try {
            await createUser(payload);
            setCreateOpen(false);
            if (page === 0) {
                void loadUsers();
            } else {
                setPage(0);
            }
        } catch (error) {
            setCreateError(getErrorMessage(error));
        } finally {
            setCreateSaving(false);
        }
    };

    // ===== 수정 =====
    const openEdit = async (userId: number) => {
        setEditError('');
        try {
            const { data: response } = await getUser(userId);
            const detail = response.data;
            if (!detail) return;
            setEditTarget(detail);
            setEditForm({
                name: detail.name,
                phone: detail.phone ?? '',
                email: detail.email ?? '',
                roleNames: detail.roleNames,
                enabled: detail.enabled,
                locked: detail.locked,
            });
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        }
    };

    const closeEdit = () => {
        setEditTarget(null);
        setEditForm(null);
        setEditError('');
        setResetError('');
        setResetResult(null);
    };
    const handleEditSubmit = async () => {
        if (!editTarget || !editForm) return;
        setEditError('');
        if (!editForm.name.trim()) {
            setEditError('이름은 필수입니다.');
            return;
        }
        if (editForm.roleNames.length === 0) {
            setEditError('역할을 1개 이상 선택하세요.');
            return;
        }
        const payload: UpdateUserRequest = {
            name: editForm.name.trim(),
            phone: editForm.phone.trim() || undefined,
            email: editForm.email.trim() || undefined,
            roleNames: editForm.roleNames,
            enabled: editForm.enabled,
            locked: editForm.locked,
        };
        setEditSaving(true);
        try {
            await updateUser(editTarget.userId, payload);
            closeEdit();
            void loadUsers();
        } catch (error) {
            setEditError(getErrorMessage(error));
        } finally {
            setEditSaving(false);
        }
    };

    const handleResetPassword = async () => {
        if (!editTarget) return;
        if (!window.confirm(`${editTarget.name}(${editTarget.loginId}) 계정의 비밀번호를 초기화하시겠습니까?`)) {
            return;
        }
        setResetError('');
        setResetResult(null);
        setResetSaving(true);
        try {
            const { data: response } = await resetUserPassword(editTarget.userId);
            setResetResult(response.data?.tempPassword ?? null);
        } catch (error) {
            setResetError(getErrorMessage(error));
        } finally {
            setResetSaving(false);
        }
    };

    // ===== 삭제 =====
    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleteSaving(true);
        try {
            await deleteUser(deleteTarget.userId);
            setDeleteTarget(null);
            if (users.length === 1 && page > 0) {
                setPage((p) => p - 1);
            } else {
                void loadUsers();
            }
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
            setDeleteTarget(null);
        } finally {
            setDeleteSaving(false);
        }
    };

    return (
        <section className="view active" id="view-user-management">
            <div className="perm-bar">
                <span className="pb-ic">🔐</span>
                직원 관리 · {canWrite ? '등록·수정·삭제 가능' : '조회만 가능 (등록/수정/삭제는 관리자 전용)'}
            </div>

            {errorMessage && (
                <div className="card" style={{ padding: '12px 16px', color: 'var(--danger)' }}>
                    {errorMessage}
                </div>
            )}

            <div className="card">
                <div className="card-h">
                    <span className="section-title">직원 목록</span>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
                        총 {totalElements}명
                    </span>
                    {canWrite && (
                        <button className="btn primary" type="button" onClick={openCreate}>
                            + 직원 등록
                        </button>
                    )}
                </div>

                <div className="card-b" style={{ paddingBottom: 0 }}>
                    <div className="filters">
                        <span className="select" style={{ cursor: 'default' }}>
                            <span className="ico">이름</span>
                            <input
                                value={nameFilter}
                                onChange={(e) => setNameFilter(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="직원명 검색"
                                style={{ border: 'none', outline: 'none', font: 'inherit', width: 110 }}
                            />
                        </span>
                        <span className="select">
                            <span className="ico">역할</span>
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                style={{ border: 'none', background: 'transparent', font: 'inherit', outline: 'none' }}
                            >
                                <option value="">전체</option>
                                {ROLE_NAME_OPTIONS.map((r) => (
                                    <option key={r.value} value={r.value}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </span>
                        <span className="select">
                            <span className="ico">상태</span>
                            <select
                                value={enabledFilter}
                                onChange={(e) => setEnabledFilter(e.target.value as '' | 'true' | 'false')}
                                style={{ border: 'none', background: 'transparent', font: 'inherit', outline: 'none' }}
                            >
                                <option value="">전체</option>
                                <option value="true">활성</option>
                                <option value="false">비활성</option>
                            </select>
                        </span>
                        <button className="btn" type="button" onClick={handleSearch}>
                            검색
                        </button>
                        <button className="btn" type="button" onClick={resetFilters}>
                            초기화
                        </button>
                    </div>
                </div>

                <div className="tbl-wrap">
                    <table className="data">
                        <thead>
                            <tr>
                                <th>로그인 ID</th>
                                <th>이름</th>
                                <th>역할</th>
                                <th>상태</th>
                                {canWrite && <th>관리</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={canWrite ? 5 : 4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                                        불러오는 중…
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={canWrite ? 5 : 4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                                        표시할 직원이 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                users.map((u) => (
                                    <tr key={u.userId} onClick={() => void openEdit(u.userId)}>
                                        <td className="pname">{u.loginId}</td>
                                        <td>{u.name}</td>
                                        <td>
                                            {u.roleNames.map((rn) => (
                                                <span className="chip info" key={rn} style={{ marginRight: 4 }}>
                                                    {roleNameLabel(rn)}
                                                </span>
                                            ))}
                                        </td>
                                        <td>
                                            <span className={`chip ${u.enabled ? 'ok' : 'neutral'}`}>
                                                {u.enabled ? '활성' : '비활성'}
                                            </span>
                                        </td>
                                        {canWrite && (
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <button className="btn tiny" type="button" onClick={() => void openEdit(u.userId)}>
                                                    수정
                                                </button>{' '}
                                                <button
                                                    className="btn tiny"
                                                    type="button"
                                                    style={{ color: 'var(--danger)' }}
                                                    onClick={() => setDeleteTarget(u)}
                                                >
                                                    삭제
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 6,
                            padding: '14px 0',
                        }}
                    >
                        <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                            이전
                        </button>
                        <span className="muted tnum" style={{ alignSelf: 'center', fontSize: 12.5 }}>
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            className="btn"
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            다음
                        </button>
                    </div>
                )}
            </div>

            {/* 등록 모달 */}
            {createOpen && (
                <div className="modal-overlay open">
                    <div className="modal">
                        <div className="modal-h">
                            <h3>직원 등록</h3>
                            <span className="x" onClick={() => setCreateOpen(false)}>
                                ×
                            </span>
                        </div>
                        <div className="modal-b">
                            {createError && <div className="login-error" style={{ marginBottom: 12 }}>{createError}</div>}
                            <div className="form-grid">
                                <div className="field">
                                    <label>
                                        로그인 ID<span className="req">*</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                            value={createForm.loginId}
                                            onChange={(e) => {
                                                setCreateForm((f) => ({ ...f, loginId: e.target.value }));
                                                setLoginIdCheck('idle');
                                            }}
                                            placeholder="operator01"
                                        />
                                        <button className="btn" type="button" onClick={() => void handleCheckLoginId()}>
                                            중복확인
                                        </button>
                                    </div>
                                    {loginIdCheck === 'checking' && <span className="hint">확인 중…</span>}
                                    {loginIdCheck === 'ok' && (
                                        <span className="hint" style={{ color: 'var(--ok)' }}>
                                            사용 가능한 ID입니다.
                                        </span>
                                    )}
                                    {loginIdCheck === 'dup' && (
                                        <span className="hint" style={{ color: 'var(--danger)' }}>
                                            이미 사용 중인 ID입니다.
                                        </span>
                                    )}
                                </div>
                                <div className="field">
                                    <label>
                                        비밀번호<span className="req">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={createForm.password}
                                        onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                                        placeholder="8자 이상"
                                    />
                                </div>
                                <div className="field">
                                    <label>
                                        이름<span className="req">*</span>
                                    </label>
                                    <input
                                        value={createForm.name}
                                        onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                                    />
                                </div>
                                <div className="field">
                                    <label>전화번호</label>
                                    <input
                                        value={createForm.phone}
                                        onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                                        placeholder="0215665011"
                                    />
                                </div>
                                <div className="field">
                                    <label>이메일</label>
                                    <input
                                        value={createForm.email}
                                        onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                                        placeholder="name@jobmoa.com"
                                    />
                                </div>
                                <div className="field full">
                                    <label>
                                        역할<span className="req">*</span>
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>
                                        {ROLE_NAME_OPTIONS.map((r) => (
                                            <label className="chk" key={r.value}>
                                                <input
                                                    type="checkbox"
                                                    checked={createForm.roleNames.includes(r.value)}
                                                    onChange={() =>
                                                        setCreateForm((f) => ({ ...f, roleNames: toggleRole(f.roleNames, r.value) }))
                                                    }
                                                />
                                                {r.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                        </div>
                        <div className="modal-f">
                            <button className="btn" type="button" onClick={() => setCreateOpen(false)} disabled={createSaving}>
                                취소
                            </button>
                            <button className="btn primary" type="button" onClick={() => void handleCreateSubmit()} disabled={createSaving}>
                                {createSaving ? '등록 중…' : '등록'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 수정 모달 */}
            {editTarget && editForm && (
                <div className="modal-overlay open">
                    <div className="modal">
                        <div className="modal-h">
                            <h3>직원 정보</h3>
                            <span className="badge-role">{editTarget.loginId}</span>
                            <span className="x" onClick={closeEdit}>
                                ×
                            </span>
                        </div>
                        <div className="modal-b">
                            {editError && <div className="login-error" style={{ marginBottom: 12 }}>{editError}</div>}
                            <div className="form-grid">
                                <div className="field">
                                    <label>
                                        이름<span className="req">*</span>
                                    </label>
                                    <input
                                        value={editForm.name}
                                        disabled={!canWrite}
                                        onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                                    />
                                </div>
                                <div className="field">
                                    <label>전화번호</label>
                                    <input
                                        value={editForm.phone}
                                        disabled={!canWrite}
                                        onChange={(e) => setEditForm((f) => (f ? { ...f, phone: e.target.value } : f))}
                                    />
                                </div>
                                <div className="field">
                                    <label>이메일</label>
                                    <input
                                        value={editForm.email}
                                        disabled={!canWrite}
                                        onChange={(e) => setEditForm((f) => (f ? { ...f, email: e.target.value } : f))}
                                    />
                                </div>
                                <div className="field">
                                    <label>생성일시</label>
                                    <input value={editTarget.createdAt} disabled />
                                </div>
                                <div className="field full">
                                    <label>역할</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>
                                        {ROLE_NAME_OPTIONS.map((r) => (
                                            <label className="chk" key={r.value}>
                                                <input
                                                    type="checkbox"
                                                    checked={editForm.roleNames.includes(r.value)}
                                                    disabled={!canWrite}
                                                    onChange={() =>
                                                        setEditForm((f) => (f ? { ...f, roleNames: toggleRole(f.roleNames, r.value) } : f))
                                                    }
                                                />
                                                {r.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="field full">
                                    <label>계정 상태</label>
                                    <div style={{ display: 'flex', gap: 16 }}>
                                        <label className="chk">
                                            <input
                                                type="checkbox"
                                                checked={editForm.enabled}
                                                disabled={!canWrite}
                                                onChange={(e) => setEditForm((f) => (f ? { ...f, enabled: e.target.checked } : f))}
                                            />
                                            활성
                                        </label>
                                        <label className="chk">
                                            <input
                                                type="checkbox"
                                                checked={editForm.locked}
                                                disabled={!canWrite}
                                                onChange={(e) => setEditForm((f) => (f ? { ...f, locked: e.target.checked } : f))}
                                            />
                                            잠금
                                        </label>
                                    </div>
                                </div>
                            </div>
                            {canWrite && (
                                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--line)' }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                                        비밀번호 초기화
                                    </label>
                                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                                        사용자가 비밀번호를 잊었을 때 임시 비밀번호를 발급합니다. 발급 후 사용자에게 직접 전달해주세요.
                                    </p>
                                    {resetError && (
                                        <div className="login-error" style={{ marginBottom: 10 }}>
                                            {resetError}
                                        </div>
                                    )}
                                    {resetResult && (
                                        <div
                                            className="chip info"
                                            style={{
                                                display: 'inline-flex',
                                                fontSize: 13,
                                                padding: '8px 12px',
                                                marginBottom: 10,
                                                userSelect: 'all',
                                            }}
                                        >
                                            임시 비밀번호: <b style={{ marginLeft: 6 }}>{resetResult}</b>
                                        </div>
                                    )}
                                    <div>
                                        <button
                                            className="btn"
                                            type="button"
                                            onClick={() => void handleResetPassword()}
                                            disabled={resetSaving}
                                        >
                                            {resetSaving ? '초기화 중…' : '비밀번호 초기화'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>


                        <div className="modal-f">
                            {!canWrite && <span className="modal-note">조회 권한만 있습니다.</span>}
                            <button className="btn" type="button" onClick={closeEdit} disabled={editSaving}>
                                닫기
                            </button>
                            {canWrite && (
                                <button
                                    className="btn primary"
                                    type="button"
                                    onClick={() => void handleEditSubmit()}
                                    disabled={editSaving}
                                >
                                    {editSaving ? '저장 중…' : '저장'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 삭제 확인 모달 */}
            {deleteTarget && (
                <div className="modal-overlay open">
                    <div className="modal" style={{ width: 'min(420px, 100%)' }}>
                        <div className="modal-h">
                            <h3>직원 삭제</h3>
                            <span className="x" onClick={() => setDeleteTarget(null)}>
                                ×
                            </span>
                        </div>
                        <div className="modal-b">
                            <p>
                                <b>{deleteTarget.name}</b>({deleteTarget.loginId}) 직원을 삭제하시겠습니까?
                                <br />이 작업은 되돌릴 수 없습니다.
                            </p>
                        </div>
                        <div className="modal-f">
                            <button className="btn" type="button" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>
                                취소
                            </button>
                            <button
                                className="btn primary"
                                type="button"
                                style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                                onClick={() => void handleDeleteConfirm()}
                                disabled={deleteSaving}
                            >
                                {deleteSaving ? '삭제 중…' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <p className="note">※ 직원 등록·수정·삭제는 시스템 관리자(ADMIN)만 가능합니다.</p>
        </section>
    );
}