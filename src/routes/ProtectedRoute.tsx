import { Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { AppRole } from '../context/RoleContext';

type ProtectedRouteProps = {
  allowedRoles?: AppRole[];
  requireSmsPermission?: boolean;
  children: ReactNode;
};

export default function ProtectedRoute({ allowedRoles, requireSmsPermission, children }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles) {
    const userRoles = user?.roles ?? [];
    const hasAccess = userRoles.some((r) => allowedRoles.includes(r as AppRole));
    if (!hasAccess) {
      return (
        <section className="card ph">
          <h2>권한이 없습니다.</h2>
        </section>
      );
    }
  }

  if (requireSmsPermission && !user?.canSendSms) {
    return (
      <section className="card ph" style={{ padding: '40px 32px' }}>
        <h2 style={{ marginBottom: '8px' }}>문자 발송 권한이 없습니다.</h2>
        <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
          문자 발송 내역을 조회하려면 관리자에게 권한을 요청하세요.
        </p>
      </section>
    );
  }

  return children;
}