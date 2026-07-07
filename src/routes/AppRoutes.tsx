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

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/participants" element={<ParticipantsPage />} />
        <Route path="/participants/:phone" element={<ParticipantDetailPage />} />
        <Route path="/rounds" element={<RoundsPage />} />
        <Route path="/rounds/:no" element={<RoundDetailPage />} />
        <Route path="/assign" element={<AssignPage />} />
        <Route path="/consulting" element={<ConsultingPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
