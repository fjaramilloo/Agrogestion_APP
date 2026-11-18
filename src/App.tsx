import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConnectionProvider } from './contexts/ConnectionContext';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import VersionNotifier from './components/VersionNotifier';
import SyncSummaryModal from './components/SyncSummaryModal';
import { lazyWithRetry, prefetchWhenIdle } from './utils/lazyWithRetry';

// PANTALLAS OPERATIVAS DE CAMPO (Cargadas de fábrica en memoria):
// Garantiza que en potreros sin señal NUNCA falte un archivo ni aparezca "Cargando..." al navegar.
import Login from './pages/Login';
import UpdatePassword from './pages/UpdatePassword';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Weighing from './pages/Weighing';
import Potreradas from './pages/Potreradas';
import Purchase from './pages/Purchase';
import Sales from './pages/Sales';
import Movements from './pages/Movements';
import Rotations from './pages/Rotations';
import Mercado from './pages/Mercado';
import MercadoGanado from './pages/MercadoGanado';
import Aforos from './pages/Aforos';
import Rainfall from './pages/Rainfall';
import HistorialVentas from './pages/HistorialVentas';
import HistorialCompras from './pages/HistorialCompras';
import Settings from './pages/Settings';

// Módulos secundarios o pesados que se precargan en segundo plano
const loadFarmMap = () => import('./pages/FarmMap').then(m => ({ default: m.FarmMapPage }));
const loadSuscripcion = () => import('./pages/Suscripcion');
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const Suscripcion = lazyWithRetry(loadSuscripcion);
const FarmMapPage = lazyWithRetry(loadFarmMap);
const SuperAdmin = lazyWithRetry(() => import('./pages/SuperAdmin'));
const AgroBot = lazyWithRetry(() => import('./components/AgroBot'));

const PantallaCargando = ({ fullScreen = false }: { fullScreen?: boolean }) => {
  const [mostrarRescate, setMostrarRescate] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setMostrarRescate(true), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '16px',
      height: fullScreen ? '100dvh' : undefined,
      padding: fullScreen ? '24px' : '80px',
      color: 'var(--primary-light)',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>Cargando AgroGestión...</div>
      {mostrarRescate && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', maxWidth: '300px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Detectamos señal débil o nula en el potrero.
          </span>
          <button
            onClick={() => {
              try { localStorage.setItem('agrogestion_modo_campo', 'true'); } catch {}
              window.location.reload();
            }}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid var(--primary)',
              backgroundColor: 'rgba(46, 125, 50, 0.25)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Entrar en Modo Campo (Sin Señal)
          </button>
        </div>
      )}
    </div>
  );
};

const ProtectedRoute = ({ children, allowedRoles, requireSuperAdmin }: { children: React.ReactNode; allowedRoles?: string[]; requireSuperAdmin?: boolean }) => {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = React.useState(window.innerWidth > 1200);

  React.useEffect(() => {
    const handleResize = () => {
      // Si la pantalla es muy pequeña, cerramos el sidebar automáticamente
      if (window.innerWidth <= 1024 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);


  if (loading) return <PantallaCargando fullScreen />;

  if (!user) return <Navigate to="/login" replace />;

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role) && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Topbar onToggleSidebar={toggleSidebar} />
      <div style={{ display: 'flex', flex: 1, paddingTop: 'calc(var(--topbar-height, 64px) + env(safe-area-inset-top, 0px))' }}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className={`main-content-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
          {/* Suspense aquí para que las páginas lazy muestren un loader mientras cargan */}
          <Suspense fallback={<PantallaCargando />}>
            {children}
          </Suspense>
        </main>
      </div>
      <BottomNav
        isSidebarOpen={sidebarOpen}
        onToggleMore={toggleSidebar}
        onNavigate={() => setSidebarOpen(false)}
      />
    </div>
  );
};

// Para la ruta raíz: si ya hay sesión, va al dashboard; si no, ve la landing pública.
// IMPORTANTE: debe estar definido FUERA de AppRoutes. Si se define adentro, cada cambio de la sesión
// (licencia, perfil, renovación de token) crea un componente nuevo y el Dashboard se desmonta y
// vuelve a descargar todos sus datos.
const RootRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <PantallaCargando fullScreen />;
  if (user) {
    return (
      <ProtectedRoute><Dashboard /></ProtectedRoute>
    );
  }
  return <LandingPage />;
};

const AppRoutes = () => {
  const { user } = useAuth();
  const userId = user?.id;

  // Con sesión iniciada, precargar en segundo plano el mapa satelital y suscripción
  // (las demás pantallas operativas ya están cargadas de fábrica en memoria).
  React.useEffect(() => {
    if (!userId) return;
    prefetchWhenIdle([
      loadFarmMap,
      loadSuscripcion
    ]);
  }, [userId]);

  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<Login />} />
      <Route path="/update-password" element={<UpdatePassword />} />
      <Route
        path="/inventario"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <Inventory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rotaciones"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <Rotations />
          </ProtectedRoute>
        }
      />
      <Route
        path="/movimientos"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Movements />
          </ProtectedRoute>
        }
      />
      <Route
        path="/potreradas"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Potreradas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/animales-ceba"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Mercado />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mercado"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <MercadoGanado />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mapa-finca"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <FarmMapPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aforos"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <Aforos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/compra"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Purchase />
          </ProtectedRoute>
        }
      />
      <Route
        path="/venta"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Sales />
          </ProtectedRoute>
        }
      />
      <Route
        path="/historial-ventas"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <HistorialVentas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/historial-compras"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <HistorialCompras />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pesaje"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero']}>
            <Weighing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lluvias"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <Rainfall />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/suscripcion"
        element={
          <ProtectedRoute allowedRoles={['administrador', 'vaquero', 'observador']}>
            <Suscripcion />
          </ProtectedRoute>
        }
      />
      <Route
        path="/superadmin"
        element={
          <ProtectedRoute requireSuperAdmin>
            <SuperAdmin />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// Solo se descarga AgroBot cuando hay sesión (la landing y el login no lo necesitan)
const AgroBotConSesion = () => {
  const { user } = useAuth();
  return user ? <AgroBot /> : null;
};

function App() {
  return (
    <AuthProvider>
      <ConnectionProvider>
        <Router>
          <Suspense fallback={<PantallaCargando fullScreen />}>
            <AppRoutes />
          </Suspense>
          <VersionNotifier />
          <SyncSummaryModal />
          <Suspense fallback={null}>
            <AgroBotConSesion />
          </Suspense>
        </Router>
      </ConnectionProvider>
    </AuthProvider>
  );
}

export default App;
