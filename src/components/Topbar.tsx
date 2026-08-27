import { useState, useEffect } from 'react';
import { Leaf, User, Menu, ShieldCheck, UserCog, Eye, Crown, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationCenter from './NotificationCenter';
import {
  obtenerConteoPendienteOffline,
  procesarSincronizacionOffline,
  sincronizarCacheFinca
} from '../lib/offlineService';
import './Topbar.css';

interface TopbarProps {
    onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
    const { role, isSuperAdmin, profile, fincaId } = useAuth();
    const [conteoPendiente, setConteoPendiente] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // 1. Monitorear estado de red y conteo de registros offline pendientes
    useEffect(() => {
        const handleOnlineStatus = () => {
            const online = navigator.onLine;
            setIsOnline(online);
            if (online && fincaId) {
                // Al volver a estar online, sincronizar caché local y procesar la cola pendiente
                sincronizarCacheFinca(fincaId);
                ejecutarSync();
            }
        };

        window.addEventListener('online', handleOnlineStatus);
        window.addEventListener('offline', handleOnlineStatus);

        return () => {
            window.removeEventListener('online', handleOnlineStatus);
            window.removeEventListener('offline', handleOnlineStatus);
        };
    }, [fincaId]);

    // 2. Verificar conteo de cola offline periódicamente
    const actualizarConteo = async () => {
        if (!fincaId) return;
        const res = await obtenerConteoPendienteOffline(fincaId);
        setConteoPendiente(res.total);
    };

    useEffect(() => {
        actualizarConteo();
        const interval = setInterval(actualizarConteo, 5000);
        return () => clearInterval(interval);
    }, [fincaId]);

    // 3. Disparar sincronización por lotes a Supabase
    const ejecutarSync = async () => {
        if (!fincaId || syncing || !navigator.onLine) return;
        setSyncing(true);
        try {
            await procesarSincronizacionOffline(fincaId);
            await actualizarConteo();
        } catch (e) {
            console.error('Error al sincronizar cola offline:', e);
        } finally {
            setSyncing(false);
        }
    };

    const getUserDisplay = () => {
        if (profile?.nombre) {
            return `${profile.nombre} ${profile.apellido || ''}`.trim();
        }
        if (isSuperAdmin) return 'Super Admin';
        if (role === 'administrador') return 'Administrador';
        if (role === 'vaquero') return 'Vaquero';
        if (role === 'observador') return 'Observador';
        return 'Usuario';
    };

    const getRoleIcon = () => {
        if (isSuperAdmin) return <Crown size={18} />;
        if (role === 'administrador') return <ShieldCheck size={18} />;
        if (role === 'vaquero') return <UserCog size={18} />;
        if (role === 'observador') return <Eye size={18} />;
        return <User size={18} />;
    };

    return (
        <header className="topbar">
            <div className="topbar-brand">
                <button className="topbar-menu-btn" onClick={onToggleSidebar}>
                    <Menu size={24} />
                </button>
                <Leaf size={26} className="topbar-icon" />
                <span className="topbar-title">AgroGestión</span>
            </div>

            <div className="topbar-right">
                {/* Badge Offline / Conteo de registros pendientes */}
                {!isOnline && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'rgba(255, 152, 0, 0.2)', color: '#ffb74d',
                        padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
                        border: '1px solid rgba(255, 152, 0, 0.3)'
                    }}>
                        <WifiOff size={14} /> Modo Offline
                    </div>
                )}

                {conteoPendiente > 0 && (
                    <button
                        onClick={ejecutarSync}
                        disabled={syncing || !isOnline}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(76, 175, 80, 0.2)', color: '#81c784',
                            border: '1px solid rgba(76, 175, 80, 0.3)',
                            padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem',
                            cursor: isOnline ? 'pointer' : 'default', fontWeight: 'bold'
                        }}
                    >
                        <RefreshCw size={14} className={syncing ? 'spin-icon' : ''} />
                        {conteoPendiente} pendientes {syncing ? '(Subiendo...)' : '(Sincronizar)'}
                    </button>
                )}

                <NotificationCenter />
                <div className="topbar-user">
                    <div className="topbar-avatar">
                        {getRoleIcon()}
                    </div>
                    <div className="topbar-user-info">
                        <span className="topbar-user-role">{getUserDisplay()}</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
