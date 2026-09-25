import { useState } from 'react';
import { Leaf, User, Menu, ShieldCheck, UserCog, Eye, Crown, Wifi, WifiOff, RefreshCw, DownloadCloud } from 'lucide-react';
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
        sincronizarTodo,
        prepararFincaOffline
    } = useConnection();

    const [preparando, setPreparando] = useState(false);
    const [msjPreparado, setMsjPreparado] = useState<string | null>(null);

    // Disparar sincronización manual
    const handleSync = async () => {
        if (!fincaId || syncing || !isOnline) return;
        await sincronizarTodo(fincaId);
    };

    // Descargar datos de la finca antes de salir al potrero
    const handlePrepararFinca = async () => {
        if (!fincaId || preparando) return;
        setPreparando(true);
        setMsjPreparado(null);
        try {
            const res = await prepararFincaOffline(fincaId);
            if (res.success) {
                setMsjPreparado(`✅ Finca lista: ${res.animales} animales y ${res.potreros} potreros guardados para campo.`);
            } else {
                setMsjPreparado(`⚠️ ${res.error || 'No se pudo completar la preparación'}`);
            }
        } catch {
            setMsjPreparado('⚠️ Error preparando datos para campo');
        } finally {
            setPreparando(false);
            setTimeout(() => setMsjPreparado(null), 5000);
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
                <button className="topbar-menu-btn" onClick={onToggleSidebar} aria-label="Abrir menú">
                    <Menu size={22} />
                </button>
                <div className="topbar-brand-content">
                    <Leaf size={22} className="topbar-icon" />
                    <span className="topbar-title">AgroGestión</span>
                </div>
            </div>

            <div className="topbar-right">
                {/* Botón interactivo global de Modo Campo */}
                <button
                    onClick={toggleModoCampo}
                    className={`topbar-btn-modo-campo ${modoCampo ? 'modo-campo-active' : isOnline ? 'modo-online' : 'modo-offline'}`}
                    title={modoCampo 
                        ? 'Modo Campo activo: La app opera 100% desconectada de forma rápida y estable. Clic para volver a En Línea.'
                        : 'Clic para activar Modo Campo (trabajar desconectado en potrero)'}
                >
                    {modoCampo ? (
                        <>
                            <span style={{ fontSize: '0.95rem' }}>🚜</span>
                            <span>Modo Campo</span>
                            <span className="topbar-btn-subtext">(Offline)</span>
                        </>
                    ) : isOnline ? (
                        <>
                            <Wifi size={13} />
                            <span>En Línea</span>
                        </>
                    ) : (
                        <>
                            <WifiOff size={13} />
                            <span>Sin Señal</span>
                            <span className="topbar-btn-subtext">(Auto)</span>
                        </>
                    )}
                </button>

                {/* Botón para preparar/descargar la finca antes de salir al potrero */}
                {isOnline && (
                    <button
                        onClick={handlePrepararFinca}
                        disabled={preparando}
                        className="topbar-btn-action topbar-btn-preparar"
                        title="Descargar todos los datos de la finca en el celular para trabajar en el potrero sin conexión"
                    >
                        <DownloadCloud size={15} className={preparando ? 'animate-spin' : ''} />
                        <span className="topbar-btn-label">
                            {preparando ? 'Preparando...' : 'Guardar Finca'}
                        </span>
                    </button>
                )}

                {/* Badge y botón para sincronizar registros pendientes */}
                {conteoPendienteTotal > 0 && (
                    <button
                        onClick={handleSync}
                        disabled={syncing || !isOnline}
                        className={`topbar-btn-action topbar-btn-sync ${isOnline ? 'can-sync' : 'cannot-sync'}`}
                        title={isOnline ? 'Clic para subir todos los registros acumulados' : 'Conéctate a internet para sincronizar'}
                    >
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                        <span className="topbar-sync-badge">{conteoPendienteTotal}</span>
                        <span className="topbar-btn-label">
                            {syncing ? 'Subiendo...' : isOnline ? 'Sincronizar' : 'pendientes'}
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

            {/* Notificación flotante de preparación para campo */}
            {msjPreparado && (
                <div className="topbar-toast">
                    {msjPreparado}
                </div>
            )}
        </header>
    );
}
