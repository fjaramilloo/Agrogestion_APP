import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConnectionProvider } from './contexts/ConnectionContext';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import VersionNotifier from './components/VersionNotifier';
import SyncSummaryModal from './components/SyncSummaryModal';
import { lazyWithRetry, prefetchWhenIdle } from './utils/lazyWithRetry';

// RENDIMIENTO: todas las pantallas se cargan bajo demanda. Antes se descargaba y procesaba
// TODO el código de la app (~2.5 MB) antes de mostrar algo; ahora el arranque solo carga el
// "esqueleto" (sesión, barra superior y menú) y la pantalla que se va a ver.
const loadDashboard = () => import('./pages/Dashboard');
const loadInventory = () => import('./pages/Inventory');
const loadWeighing = () => import('./pages/Weighing');
const loadPotreradas = () => import('./pages/Potreradas');

const Login = lazyWithRetry(() => import('./pages/Login'));
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const UpdatePassword = lazyWithRetry(() => import('./pages/UpdatePassword'));
const Dashboard = lazyWithRetry(loadDashboard);
const Inventory = lazyWithRetry(loadInventory);
const Weighing = lazyWithRetry(loadWeighing);
const Potreradas = lazyWithRetry(loadPotreradas);
const Purchase = lazyWithRetry(() => import('./pages/Purchase'));
const Sales = lazyWithRetry(() => import('./pages/Sales'));
const Movements = lazyWithRetry(() => import('./pages/Movements'));
const Rotations = lazyWithRetry(() => import('./pages/Rotations'));
const Mercado = lazyWithRetry(() => import('./pages/Mercado'));
const MercadoGanado = lazyWithRetry(() => import('./pages/MercadoGanado'));
const Aforos = lazyWithRetry(() => import('./pages/Aforos'));
const Rainfall = lazyWithRetry(() => import('./pages/Rainfall'));
const Suscripcion = lazyWithRetry(() => import('./pages/Suscripcion'));
const FarmMapPage = lazyWithRetry(() => import('./pages/FarmMap').then(m => ({ default: m.FarmMapPage })));
const HistorialVentas = lazyWithRetry(() => import('./pages/HistorialVentas'));
const HistorialCompras = lazyWithRetry(() => import('./pages/HistorialCompras'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const SuperAdmin = lazyWithRetry(() => import('./pages/SuperAdmin'));
// AgroBot trae librerías de markdown pesadas: se carga después de mostrar la pantalla
const AgroBot = lazyWithRetry(() => import('./components/AgroBot'));

const PantallaCargando = ({ fullScreen = false }: { fullScreen?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: fullScreen ? '100vh' : undefined, padding: fullScreen ? undefined : '80px', color: 'var(--primary-light)' }}>
    Cargando...
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user, role, loading } = useAuth();
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

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Topbar onToggleSidebar={toggleSidebar} />
      <div style={{ display: 'flex', flex: 1, paddingTop: '64px' }}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className={`main-content-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
          {/* Suspense aquí para que las páginas lazy muestren un loader mientras cargan */}
          <Suspense fallback={<PantallaCargando />}>
            {children}
          </Suspense>
        </main>
      </div>
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

  // Con sesión iniciada, descargar en segundo plano las pantallas de campo más usadas
  // para que abrirlas sea instantáneo (y queden disponibles sin señal).
  React.useEffect(() => {
    if (!userId) return;
    prefetchWhenIdle([loadDashboard, loadInventory, loadWeighing, loadPotreradas]);
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
          <ProtectedRoute>
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
