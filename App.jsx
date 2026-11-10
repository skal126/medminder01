import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import Toaster from './components/Toaster';
import SignIn from './screens/SignIn';
import Today from './screens/Today';
import Schedule from './screens/Schedule';
import Compartment from './screens/Compartment';
import BleControl from './screens/BleControl';
import Connection from './screens/Connection';
import History from './screens/History';
import Settings from './screens/Settings';

/** Keeps the original DoseCompass navigation and shared dashboard shell. */
function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <TopBar />
      <main className="mx-auto w-full max-w-4xl px-4 py-5">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

function RequireAuth() {
  const { auth } = useStore();
  return auth ? <AppShell /> : <Navigate to="/signin" replace />;
}

export default function App() {
  const { auth } = useStore();

  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/" element={<Navigate to={auth ? '/today' : '/signin'} replace />} />
        <Route path="/signin" element={auth ? <Navigate to="/today" replace /> : <SignIn />} />
        <Route element={<RequireAuth />}>
          <Route path="/today" element={<Today />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/compartment/:id" element={<Compartment />} />
          <Route path="/bluetooth" element={<BleControl />} />
          <Route path="/connection" element={<Connection />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to={auth ? '/today' : '/signin'} replace />} />
      </Routes>
    </>
  );
}
