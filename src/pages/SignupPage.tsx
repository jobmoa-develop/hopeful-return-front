import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api/authApi';

const inputStyle = { display: 'block', width: '100%', marginBottom: 8, padding: 8 } as const;

export default function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSendCode = async () => {
    setMessage(null);
    try {
      await authApi.sendEmailCode(email);
      setCodeSent(true);
      setMessage('인증 코드를 전송했습니다. 메일을 확인해 주세요.');
    } catch {
      setMessage('인증 코드 전송에 실패했습니다.');
    }
  };

  const handleVerify = async () => {
    setMessage(null);
    try {
      const { data } = await authApi.verifyEmailCode(email, code);
      if (data.success) {
        setVerified(true);
        setMessage('이메일 인증이 완료되었습니다.');
      } else {
        setMessage(data.error ?? '인증 코드가 올바르지 않습니다.');
      }
    } catch {
      setMessage('인증에 실패했습니다.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const { data } = await authApi.signup({ email, password, name });
      if (data.success) {
        navigate('/login');
      } else {
        setMessage(data.error ?? '회원가입에 실패했습니다.');
      }
    } catch {
      setMessage('회원가입에 실패했습니다.');
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '60px auto', fontFamily: 'sans-serif' }}>
      <h1>회원가입</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <button type="button" onClick={handleSendCode}>코드전송</button>
      </div>
      {codeSent && !verified && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="인증코드" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
          <button type="button" onClick={handleVerify}>확인</button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        <input type="password" placeholder="비밀번호(8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={inputStyle} />
        {message && <p style={{ color: 'teal' }}>{message}</p>}
        <button type="submit" disabled={!verified} style={{ width: '100%', padding: 10 }}>회원가입</button>
      </form>
      <p style={{ marginTop: 12 }}>
        이미 계정이 있으신가요? <Link to="/login">로그인</Link>
      </p>
    </div>
  );
}
