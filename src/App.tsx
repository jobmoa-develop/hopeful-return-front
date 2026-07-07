import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { RoleProvider } from './context/RoleContext';
import { DataProvider } from './context/DataContext';

export default function App() {
  return (
    <BrowserRouter>
      <RoleProvider>
        <DataProvider>
          <AppRoutes />
        </DataProvider>
      </RoleProvider>
    </BrowserRouter>
  );
}
