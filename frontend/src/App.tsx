import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useSetupStatus } from './hooks/useSetupStatus';
import SetupWizard from './components/setup/SetupWizard';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import ReservationsPage from './pages/ReservationsPage';
import TablesPage from './pages/TablesPage';
import HoursPage from './pages/HoursPage';
import SpecialHoursPage from './pages/SpecialHoursPage';
import SettingsPage from './pages/SettingsPage';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** Redirect to /login if not authenticated */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRouter() {
  const { token } = useAuth();
  const { isLoading, needsSetup } = useSetupStatus();

  // Don't run setup queries until authenticated
  if (!token) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading Rezzy…</span>
        </div>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <SetupWizard
        onComplete={() => {
          qc.invalidateQueries();
          window.location.reload();
        }}
      />
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/reservations" replace />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="hours" element={<HoursPage />} />
        <Route path="special-hours" element={<SpecialHoursPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppRouter />
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
