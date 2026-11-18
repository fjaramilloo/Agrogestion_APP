import { NavLink } from 'react-router-dom';
import { Home, Scale, ArrowLeftRight, MapPin, Menu, ListChecks, CloudRain } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './BottomNav.css';

interface BottomNavProps {
    isSidebarOpen: boolean;
    onToggleMore: () => void;
    onNavigate: () => void;
}

export default function BottomNav({ isSidebarOpen, onToggleMore, onNavigate }: BottomNavProps) {
    const { role, isSuperAdmin } = useAuth();
    const isObserverOnly = role === 'observador' && !isSuperAdmin;

    return (
        <nav className="mobile-bottom-nav" aria-label="Navegación rápida de campo">
            <NavLink
                to="/"
                end
                onClick={onNavigate}
                className="bottom-nav-item"
            >
                <Home size={21} aria-hidden="true" />
                <span>Inicio</span>
            </NavLink>

            {isObserverOnly ? (
                <NavLink
                    to="/inventario"
                    onClick={onNavigate}
                    className="bottom-nav-item"
                >
                    <ListChecks size={21} aria-hidden="true" />
                    <span>Inventario</span>
                </NavLink>
            ) : (
                <NavLink
                    to="/pesaje"
                    onClick={onNavigate}
                    className="bottom-nav-item"
                >
                    <Scale size={21} aria-hidden="true" />
                    <span>Pesar</span>
                </NavLink>
            )}

            {isObserverOnly ? (
                <NavLink
                    to="/lluvias"
                    onClick={onNavigate}
                    className="bottom-nav-item"
                >
                    <CloudRain size={21} aria-hidden="true" />
                    <span>Lluvias</span>
                </NavLink>
            ) : (
                <NavLink
                    to="/movimientos"
                    onClick={onNavigate}
                    className="bottom-nav-item"
                >
                    <ArrowLeftRight size={21} aria-hidden="true" />
                    <span>Rotar</span>
                </NavLink>
            )}

            <NavLink
                to="/mapa-finca"
                onClick={onNavigate}
                className="bottom-nav-item"
            >
                <MapPin size={21} aria-hidden="true" />
                <span>Mapa</span>
            </NavLink>

            <button
                type="button"
                onClick={onToggleMore}
                className={`bottom-nav-item bottom-nav-btn${isSidebarOpen ? ' bottom-nav-btn--open' : ''}`}
                aria-expanded={isSidebarOpen}
                aria-label="Abrir más módulos"
            >
                <Menu size={21} aria-hidden="true" />
                <span>Más</span>
            </button>
        </nav>
    );
}
