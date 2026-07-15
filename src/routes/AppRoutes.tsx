import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import DashboardPage from '../pages/DashboardPage';
import ParticipantsPage from '../pages/ParticipantsPage';
import ParticipantDetailPage from '../pages/ParticipantDetailPage';
import RoundsPage from '../pages/RoundsPage';
import RoundDetailPage from '../pages/RoundDetailPage';
import AssignPage from '../pages/AssignPage';
import ConsultingPage from '../pages/ConsultingPage';
import AttendancePage from '../pages/AttendancePage';
import LoginPage from '../pages/LoginPage';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import CourseCalendarPage from '../pages/CourseCalendarPage';

function LoginRoute() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <LoginPage />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/participants"
          element={
            <ProtectedRoute
              allowedRoles={[
                'ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'OPERATOR', 'COUNSELOR', 'STAFF',
                'PROJECT_MANAGER', 'PROJECT_LEADER',
              ]}
            >
              <ParticipantsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participants/:courseParticipantId"
          element={
            <ProtectedRoute
              allowedRoles={[
                'ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'OPERATOR', 'COUNSELOR', 'STAFF',
                'PROJECT_MANAGER', 'PROJECT_LEADER',
              ]}
            >
              <ParticipantDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/rounds"
          element={
            <ProtectedRoute>
              <RoundsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rounds/:courseId"
          element={
            <ProtectedRoute>
              <RoundDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/assign"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'REGIONAL_MANAGER', 'OPERATOR']}>
              <AssignPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/consulting"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'OPERATOR', 'COUNSELOR']}>
              <ConsultingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'OPERATOR', 'STAFF']}>
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <CourseCalendarPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
