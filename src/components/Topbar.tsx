import { Leaf, User, Menu, ShieldCheck, UserCog, Eye, Crown, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConnection } from '../contexts/ConnectionContext';
import NotificationCenter from './NotificationCenter';
import './Topbar.css';

interface TopbarProps {
    onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
    const { role, isSuperAdmin, profile, fincaId } = useAuth();
    const {
        modoCampo,
        toggleModoCampo,
        isOnline,
        syncing,
        conteoPendienteTotal,
        sincronizarTodo
    } = useConnection();

    // Disparar sincronización manual
    const handleSync = async () => {
        if (!fincaId || syncing || !isOnline) return;
        await sincronizarTodo(fincaId);
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
                <button className="topbar-menu-btn" onClick={onToggleSidebar} aria-label="Abrir menú">
                    <Menu size={22} />
                </button>
                <div className="topbar-brand-content">
                    <Leaf size={22} className="topbar-icon" />
                    <span className="topbar-title">AgroGestión</span>
                </div>
            </div>

            <div className="topbar-right">
                {/* Solo se muestra si no hay señal o si se activó Modo Campo forzado (Silencio visual en línea) */}
                {(!isOnline || modoCampo) && (
                    <div
                        className={`topbar-btn-modo-campo ${modoCampo ? 'modo-campo-active' : 'modo-offline'}`}
                        title={modoCampo ? 'Modo Campo forzado: Clic para volver a detección automática' : 'Sin señal de internet: la app está guardando los datos en la memoria del celular de forma segura'}
                        style={{ cursor: modoCampo ? 'pointer' : 'default' }}
                        onClick={modoCampo ? toggleModoCampo : undefined}
                    >
                        {modoCampo ? (
                            <>
                                <span style={{ fontSize: '0.95rem' }}>🚜</span>
                                <span>Modo Campo</span>
                                <span className="topbar-btn-subtext">(Forzado)</span>
                            </>
                        ) : (
                            <>
                                <WifiOff size={13} />
                                <span>Sin Señal</span>
                                <span className="topbar-btn-subtext">(En cel)</span>
                            </>
                        )}
                    </div>
                )}

                {/* Badge y botón para sincronizar registros pendientes */}
                {conteoPendienteTotal > 0 && (
                    <button
                        onClick={handleSync}
                        disabled={syncing || !isOnline}
                        className={`topbar-btn-action topbar-btn-sync ${isOnline ? 'can-sync' : 'cannot-sync'}`}
                        title={isOnline ? 'Clic para subir todos los registros acumulados' : 'Se sincronizarán automáticamente al recuperar la señal'}
                    >
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                        <span className="topbar-sync-badge">{conteoPendienteTotal}</span>
                        <span className="topbar-btn-label">
                            {syncing ? 'Subiendo...' : isOnline ? 'Sincronizar' : 'en celular'}
                        </span>
                    </button>
                )}

                <NotificationCenter />

                <div className="topbar-user">
                    <div className="topbar-avatar" title={getUserDisplay()}>
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
