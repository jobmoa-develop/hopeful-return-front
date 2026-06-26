import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { tokenStore } from '../auth/token';

interface ProtectedRouteProps {
  children: ReactNode;
}

// 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!tokenStore.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
