import { useState } from 'react';
import { apiClient } from '../api/client';
import type { ApiResponse } from '../types/api';

export default function HomePage() {
  const [status, setStatus] = useState<string>('');

  const checkBackend = async () => {
    setStatus('확인 중...');
    try {
      const { data } = await apiClient.get<ApiResponse<string>>('/api/ping');
      setStatus(`백엔드 응답: ${data.data ?? '(empty)'}`);
    } catch {
      setStatus('백엔드 연결 실패 — 서버(3434)가 실행 중인지 확인하세요.');
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>hopeful-return</h1>
      <p>기본 구조(스켈레톤) 단계입니다. 도메인/화면은 협의 후 추가합니다.</p>
      <button onClick={checkBackend} style={{ padding: 10 }}>
        백엔드 연결 확인 (/api/ping)
      </button>
      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </div>
  );
}
