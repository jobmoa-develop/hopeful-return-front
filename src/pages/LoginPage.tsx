import { useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Navigate, useNavigate } from 'react-router';
import { login as requestLogin } from '../api/auth';
import { useAuth } from '../context/AuthContext';

type ErrorResponse = {
  message?: string;
  error?: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const getErrorMessage = (error: unknown) => {
    if (isAxiosError<ErrorResponse>(error)) {
      const data = error.response?.data;
      if (typeof data === 'string') return data;
      return data?.message ?? data?.error ?? '로그인에 실패했습니다.';
    }

    return '로그인에 실패했습니다.';
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const { data: response } = await requestLogin({ loginId, password });
      const { accessToken, user } = response.data;

      login(accessToken, user);
      navigate('/', { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="mark">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 14a7 7 0 1 1 2.5 5.3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5 9v5h5" stroke="#9ec3e6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="eyebrow">희망리턴패키지</p>
            <h1 id="login-title">로그인</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="loginId">로그인 ID</label>
            <input
              id="loginId"
              name="loginId"
              type="text"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {errorMessage && (
            <p className="login-error" role="alert">
              {errorMessage}
            </p>
          )}

          <button className="btn primary login-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </section>
    </main>
  );
}
