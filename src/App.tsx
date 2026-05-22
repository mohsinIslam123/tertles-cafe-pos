import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useAppStore } from './stores/appStore';
import PinLogin from './screens/PinLogin';
import Dashboard from './screens/Dashboard';
import ItemsScreen from './screens/ItemsScreen';
import NewBill from './screens/NewBill';
import SettingsScreen from './screens/SettingsScreen';
import CustomersScreen from './screens/CustomersScreen';
import BillSearchScreen from './screens/BillSearchScreen';
import BottomNav from './components/BottomNav';
import Placeholder from './screens/Placeholder';
import ReportsScreen from './screens/ReportsScreen';
import DayCloseScreen from './screens/DayCloseScreen';
import { usePrinterStore } from './stores/printerStore';
import { scheduleNightlyBackup } from './services/backup';

// ── Auth guard ────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthStore();
  if (loading) return <AppLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Full-screen loader ────────────────────────────────────────────────────────

function AppLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center text-3xl animate-pulse">
          🐢
        </div>
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    </div>
  );
}

// ── Layout with bottom nav ────────────────────────────────────────────────────

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {children}
      <BottomNav />
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { init: initAuth, isAuthenticated, loading } = useAuthStore();
  const { init: initApp, setOnline } = useAppStore();
  const initPrinter = usePrinterStore(s => s.init);

  // Init all stores on mount
  useEffect(() => {
    initAuth();
    initApp();
    initPrinter();
    // Start nightly 2 AM backup scheduler (no-op if Supabase not configured)
    scheduleNightlyBackup();
  }, []);

  // Online/offline listener
  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOnline]);

  if (loading) return <AppLoader />;

  return (
    <BrowserRouter>
      <Routes>
        {/* ── Auth routes ──────────────────────────────────────────────────── */}
        <Route
          path="/login"
          element={
            isAuthenticated
              ? <Navigate to="/" replace />
              : <PinLogin />
          }
        />

        {/* ── Protected routes ─────────────────────────────────────────────── */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/bill"
          element={
            <RequireAuth>
              {/* No BottomNav on bill screen — full focus */}
              <NewBill />
            </RequireAuth>
          }
        />

        <Route
          path="/items"
          element={
            <RequireAuth>
              <AppLayout>
                <ItemsScreen />
              </AppLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/customers"
          element={
            <RequireAuth>
              <AppLayout>
                <CustomersScreen />
              </AppLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/reports"
          element={
            <RequireAuth>
              <AppLayout>
                <ReportsScreen />
              </AppLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/more"
          element={
            <RequireAuth>
              <AppLayout>
                <SettingsScreen />
              </AppLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/more/bill-search"
          element={
            <RequireAuth>
              <AppLayout>
                <BillSearchScreen />
              </AppLayout>
            </RequireAuth>
          }
        />

        <Route
          path="/more/day-close"
          element={
            <RequireAuth>
              <AppLayout>
                <DayCloseScreen />
              </AppLayout>
            </RequireAuth>
          }
        />

        {/* ── Fallback ─────────────────────────────────────────────────────── */}
        <Route
          path="*"
          element={
            isAuthenticated
              ? <Navigate to="/" replace />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
