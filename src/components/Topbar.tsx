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
                <button className="topbar-menu-btn" onClick={onToggleSidebar}>
                    <Menu size={24} />
                </button>
                <Leaf size={26} className="topbar-icon" />
                <span className="topbar-title">AgroGestión</span>
            </div>

            <div className="topbar-right">
                {/* Botón interactivo global de Modo Campo / Conexión */}
                <button
                    onClick={toggleModoCampo}
                    title={modoCampo 
                        ? 'Modo Campo activo: La app opera 100% desconectada de forma rápida y estable. Clic para volver a En Línea.'
                        : 'Clic para activar Modo Campo (trabajar desconectado sin que la señal inestable interrumpa la app)'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        border: modoCampo 
                            ? '1px solid rgba(245, 158, 11, 0.6)'
                            : isOnline 
                                ? '1px solid rgba(76, 175, 80, 0.4)' 
                                : '1px solid rgba(239, 68, 68, 0.4)',
                        backgroundColor: modoCampo 
                            ? 'rgba(245, 158, 11, 0.2)' 
                            : isOnline 
                                ? 'rgba(76, 175, 80, 0.15)' 
                                : 'rgba(239, 68, 68, 0.15)',
                        color: modoCampo 
                            ? '#fbbf24' 
                            : isOnline 
                                ? '#4ade80' 
                                : '#f87171',
                        transition: 'all 0.2s ease',
                        userSelect: 'none'
                    }}
                >
                    {modoCampo ? (
                        <>🚜 Modo Campo (Offline)</>
                    ) : isOnline ? (
                        <><Wifi size={14} /> En Línea</>
                    ) : (
                        <><WifiOff size={14} /> Sin Señal (Auto)</>
                    )}
                </button>

                {/* Botón para preparar/descargar la finca antes de salir al potrero (solo si hay conexión y no estamos en modo campo) */}
                {isOnline && (
                    <button
                        onClick={handlePrepararFinca}
                        disabled={preparando}
                        title="Descargar todos los datos de la finca en el celular para trabajar en el potrero sin conexión"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            padding: '6px 12px',
                            borderRadius: '12px',
                            fontSize: '0.78rem',
                            cursor: preparando ? 'wait' : 'pointer',
                            fontWeight: 600
                        }}
                    >
                        <DownloadCloud size={14} className={preparando ? 'animate-spin' : ''} />
                        <span className="hide-on-mobile">{preparando ? 'Preparando...' : 'Guardar para Campo'}</span>
                    </button>
                )}

                {/* Badge y botón para sincronizar registros pendientes de pesajes, aforos, compras o ventas */}
                {conteoPendienteTotal > 0 && (
                    <button
                        onClick={handleSync}
                        disabled={syncing || !isOnline}
                        title={isOnline ? 'Clic para subir todos los registros acumulados' : 'Conéctate a internet para sincronizar'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: isOnline ? 'rgba(76, 175, 80, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                            color: isOnline ? '#81c784' : '#94a3b8',
                            border: `1px solid ${isOnline ? 'rgba(76, 175, 80, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
                            padding: '6px 12px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            cursor: isOnline ? 'pointer' : 'default',
                            fontWeight: 'bold'
                        }}
                    >
                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                        {conteoPendienteTotal} pendientes {syncing ? '(Subiendo...)' : isOnline ? '(Sincronizar)' : ''}
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

            {/* Notificación flotante de preparación para campo */}
            {msjPreparado && (
                <div style={{
                    position: 'absolute',
                    top: '70px',
                    right: '24px',
                    background: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #3b82f6',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 9999,
                    maxWidth: '380px'
                }}>
                    {msjPreparado}
                </div>
            )}
        </header>
    );
}
