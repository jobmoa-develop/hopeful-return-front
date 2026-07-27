import { Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { AppRole } from '../context/RoleContext';

type ProtectedRouteProps = {
  allowedRoles?: AppRole[];
  children: ReactNode;
};

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
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

  return children;
}