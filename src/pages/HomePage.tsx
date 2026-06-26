import { useNavigate } from 'react-router-dom';
import { tokenStore } from '../auth/token';

export default function HomePage() {
  const navigate = useNavigate();

  const handleLogout = () => {
    tokenStore.clear();
    navigate('/login');
  };

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>hopeful-return</h1>
      <p>로그인에 성공했습니다.</p>
      <button onClick={handleLogout} style={{ padding: 10 }}>로그아웃</button>
    </div>
  );
}
