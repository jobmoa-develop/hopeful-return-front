import { BrowserRouter } from 'react-router';
import AppRoutes from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { RoleProvider } from './context/RoleContext';
import { DataProvider } from './context/DataContext';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoleProvider>
          <DataProvider>
            <AppRoutes />
          </DataProvider>
        </RoleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
