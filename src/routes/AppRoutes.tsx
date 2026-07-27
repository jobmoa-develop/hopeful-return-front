import { Routes, Route, Navigate } from 'react-router';
import HomePage from '../pages/HomePage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
