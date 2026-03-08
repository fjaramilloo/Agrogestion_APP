import { Leaf, User, Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Topbar.css';

interface TopbarProps {
    onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
    const { role, isSuperAdmin } = useAuth();

    const getRolLabel = () => {
        if (isSuperAdmin) return 'Super Admin';
        if (role === 'administrador') return 'Administrador';
        if (role === 'vaquero') return 'Vaquero';
        if (role === 'observador') return 'Observador';
        return 'Usuario';
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
                <div className="topbar-user">
                    <div className="topbar-avatar">
                        <User size={18} />
                    </div>
                    <div className="topbar-user-info">
                        <span className="topbar-user-role">{getRolLabel()}</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
