import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { tokenStore } from '../auth/token';

const inputStyle = { display: 'block', width: '100%', marginBottom: 8, padding: 8 } as const;

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await authApi.login({ email, password });
      if (data.success && data.data) {
        tokenStore.setTokens(data.data.accessToken, data.data.refreshToken);
        navigate('/');
      } else {
        setError(data.error ?? '로그인에 실패했습니다.');
      }
    } catch {
      setError('로그인에 실패했습니다. 이메일/비밀번호를 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>로그인</h1>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading ? '처리 중...' : '로그인'}
        </button>
      </form>
      <p style={{ marginTop: 12 }}>
        계정이 없으신가요? <Link to="/signup">회원가입</Link>
      </p>
    </div>
  );
}
