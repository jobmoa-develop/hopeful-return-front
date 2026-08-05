import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { me, updateMyProfile, changePassword } from '../api/auth';
import type { MeResponse } from '../api/auth';
import { apiErrorMessage } from '../api/apiError';
import { roleNamesLabel } from '../api/users';

export default function MyPage() {
    const [profile, setProfile] = useState<MeResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // 프로필 폼 상태
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    // 비밀번호 폼 상태
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { data: response } = await me();
                if (cancelled) return;
                const p = response.data;
                if (!p) {
                    setLoadError('내 정보를 불러오지 못했습니다.');
                    return;
                }
                setProfile(p);
                setPhone(p.phone ?? '');
                setEmail(p.email ?? '');
            } catch (err) {
                if (!cancelled) setLoadError(apiErrorMessage(err, '내 정보를 불러오지 못했습니다.'));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setProfileError('');
        setProfileSuccess('');
        setIsSavingProfile(true);

        try {
            const { data: response } = await updateMyProfile({
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
            });
            if (response.data) {
                setProfile(response.data);
            }
            setProfileSuccess('저장되었습니다.');
        } catch (err) {
            setProfileError(apiErrorMessage(err, '정보 수정에 실패했습니다.'));
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (newPassword.length < 8) {
            setPasswordError('새 비밀번호는 8자 이상이어야 합니다.');
            return;
        }
        if (newPassword !== newPasswordConfirm) {
            setPasswordError('새 비밀번호가 일치하지 않습니다.');
            return;
        }

        setIsSavingPassword(true);
        try {
            await changePassword({ currentPassword, newPassword });
            setPasswordSuccess('비밀번호가 변경되었습니다.');
            setCurrentPassword('');
            setNewPassword('');
            setNewPasswordConfirm('');
        } catch (err) {
            setPasswordError(apiErrorMessage(err, '비밀번호 변경에 실패했습니다.'));
        } finally {
            setIsSavingPassword(false);
        }
    };

    if (isLoading) {
        return (
            <section className="card ph">
                <p className="muted">불러오는 중...</p>
            </section>
        );
    }

    if (loadError || !profile) {
        return (
            <section className="card ph">
                <h2>내 정보를 불러오지 못했습니다.</h2>
                {loadError && <p className="muted">{loadError}</p>}
            </section>
        );
    }

    return (
        <div className="view">
            {/* 기본 정보 */}
            <section className="card" style={{ marginBottom: 18 }}>
                <div className="card-h">
                    <span className="section-title">기본 정보</span>
                </div>
                <div className="card-b">
                    <div className="form-grid" style={{ marginBottom: 16 }}>
                        <div className="field">
                            <label>로그인 ID</label>
                            <input value={profile.loginId} disabled />
                        </div>
                        <div className="field">
                            <label>이름</label>
                            <input value={profile.name} disabled />
                        </div>
                        <div className="field full">
                            <label>역할</label>
                            <div>
                                <span className="chip info">{roleNamesLabel(profile.roleNames)}</span>
                            </div>
                        </div>
                    </div>

                    <form className="form-grid" onSubmit={handleProfileSubmit}>
                        <div className="field">
                            <label htmlFor="phone">전화번호</label>
                            <input
                                id="phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="01012345678"
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="email">이메일</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@jobmoa.com"
                            />
                        </div>

                        {profileError && (
                            <p className="login-error field full" role="alert">
                                {profileError}
                            </p>
                        )}
                        {profileSuccess && (
                            <p className="field full" style={{ color: 'var(--ok)', fontSize: 12.5, fontWeight: 600 }}>
                                {profileSuccess}
                            </p>
                        )}

                        <div className="field full">
                            <button className="btn primary" type="submit" disabled={isSavingProfile}>
                                {isSavingProfile ? '저장 중...' : '저장'}
                            </button>
                        </div>
                    </form>
                </div>
            </section>

            {/* 비밀번호 변경 */}
            <section className="card">
                <div className="card-h">
                    <span className="section-title">비밀번호 변경</span>
                </div>
                <div className="card-b">
                    <form className="form-grid" onSubmit={handlePasswordSubmit}>
                        <div className="field full">
                            <label htmlFor="currentPassword">현재 비밀번호</label>
                            <input
                                id="currentPassword"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="newPassword">새 비밀번호</label>
                            <input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                            <span className="hint">8자 이상</span>
                        </div>
                        <div className="field">
                            <label htmlFor="newPasswordConfirm">새 비밀번호 확인</label>
                            <input
                                id="newPasswordConfirm"
                                type="password"
                                value={newPasswordConfirm}
                                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </div>

                        {passwordError && (
                            <p className="login-error field full" role="alert">
                                {passwordError}
                            </p>
                        )}
                        {passwordSuccess && (
                            <p className="field full" style={{ color: 'var(--ok)', fontSize: 12.5, fontWeight: 600 }}>
                                {passwordSuccess}
                            </p>
                        )}

                        <div className="field full">
                            <button className="btn primary" type="submit" disabled={isSavingPassword}>
                                {isSavingPassword ? '변경 중...' : '비밀번호 변경'}
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        </div>
    );
}