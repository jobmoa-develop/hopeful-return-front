import { useEffect, useRef, useState } from 'react';
import { useDebounceSearch } from '../hooks/useDebounceSearch';
import { isAxiosError } from 'axios';
import { useRole } from '../context/RoleContext';
import { getUsers, updateSmsPermission, roleNameLabel, ROLE_NAME_OPTIONS } from '../api/users';
import type { UserListItem } from '../api/users';

const PAGE_SIZE = 20;

function getErrorMessage(error: unknown) {
    if (isAxiosError<{ error?: string; message?: string }>(error)) {
        const data = error.response?.data;
        return data?.error ?? data?.message ?? '요청 처리 중 오류가 발생했습니다.';
    }
    return '요청 처리 중 오류가 발생했습니다.';
}

export default function SmsPermissionPage() {
    const { roleConfig } = useRole();
    const canManageSms = roleConfig.roles.some(r => r === 'ADMIN' || r === 'HEAD_OFFICE');

    const [users, setUsers] = useState<UserListItem[]>([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    const nameFilterInput = useDebounceSearch('', 300);
    const nameFilter = nameFilterInput.debouncedValue.trim();
    const [roleFilter, setRoleFilter] = useState('');
    const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('');

    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

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

    // 직원명 검색 디바운스 적용 후 자동 검색.
    // 마운트 시점은 위 [page] effect가 이미 loadUsers를 호출하므로,
    // 여기서는 스킵(didMount 가드)해 페이지 진입 시 API가 2번 호출되는 것을 막는다.
    const nameFilterDidMountRef = useRef(false);
    useEffect(() => {
        if (!nameFilterDidMountRef.current) {
            nameFilterDidMountRef.current = true;
            return;
        }
        if (page === 0) {
            void loadUsers();
        } else {
            setPage(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nameFilter]);

    const resetFilters = () => {
        nameFilterInput.clear();
        setRoleFilter('');
        setEnabledFilter('');
        if (page === 0) {
            void loadUsers();
        } else {
            setPage(0);
        }
    };

    const handleToggleSms = async (user: UserListItem, checked: boolean) => {
        if (!canManageSms) return;
        
        // Optimistic update
        setUsers(prev => prev.map(u => u.userId === user.userId ? { ...u, canSendSms: checked } : u));
        
        try {
            await updateSmsPermission(user.userId, { canSendSms: checked });
            alert('문자 발송 권한이 변경되었습니다.\n※ 대상 계정은 재로그인 후 변경 권한이 적용됩니다.');
        } catch (error) {
            // Revert on error
            setUsers(prev => prev.map(u => u.userId === user.userId ? { ...u, canSendSms: !checked } : u));
            alert(getErrorMessage(error));
        }
    };

    return (
        <section className="view active" id="view-sms-permission">
            <div className="perm-bar">
                <span className="pb-ic">✉</span>
                문자 발송 권한 관리 · {canManageSms ? '문자 발송 권한 부여 및 회수 가능' : '조회만 가능 (관리자/본사 전용)'}
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
                </div>

                <div className="card-b" style={{ paddingBottom: 0 }}>
                    <div className="filters">
                        <span className="select" style={{ cursor: 'default' }}>
                            <span className="ico">이름</span>
                            <input
                                {...nameFilterInput.inputProps}
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
                                <th>문자 발송 권한</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                                        불러오는 중…
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                                        표시할 직원이 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                users.map((u) => {
                                    const targetIsAlwaysPermitted = u.roleNames.some(r => r === 'ADMIN' || r === 'HEAD_OFFICE');
                                    const isChecked = targetIsAlwaysPermitted || u.canSendSms;

                                    return (
                                        <tr key={u.userId}>
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
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <label className="chk">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            disabled={!canManageSms || targetIsAlwaysPermitted}
                                                            onChange={(e) => void handleToggleSms(u, e.target.checked)}
                                                        />
                                                        {isChecked ? '발송 가능' : '불가'}
                                                    </label>
                                                    {targetIsAlwaysPermitted && (
                                                        <span className="hint" style={{ color: 'var(--muted)', fontSize: '12.5px' }}>
                                                            ※ 항상 보유 (ADMIN / HEAD_OFFICE)
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
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
            <p className="note">※ 문자 발송 권한 부여 및 회수는 관리자(ADMIN) 및 본사(HEAD_OFFICE) 계정만 가능합니다.</p>
        </section>
    );
}
