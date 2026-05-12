import { Leaf, User, Menu, ShieldCheck, UserCog, Eye, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationCenter from './NotificationCenter';
import './Topbar.css';

interface TopbarProps {
    onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
    const { role, isSuperAdmin, profile } = useAuth();

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
