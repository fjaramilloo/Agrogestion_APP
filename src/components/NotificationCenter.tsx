import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, ShoppingCart, Activity, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { differenceInDays, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import './NotificationCenter.css';

interface Notification {
    id: string;
    title: string;
    description: string;
    time: string;
    type: 'success' | 'warning' | 'error' | 'info';
    read: boolean;
    roles?: string[];
    target?: string;
    targetState?: any;
}

export default function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const { role, fincaId } = useAuth();
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const fetchAlerts = async () => {
        if (!fincaId) return;
        setLoading(true);
        try {
            // OPTIMIZACIÓN: Traer solo las columnas estrictamente necesarias para las alertas
            const { data: animals, error } = await supabase
                .from('animales')
                .select(`
                    id,
                    numero_chapeta,
                    fecha_ingreso,
                    peso_ingreso,
                    peso_compra,
                    id_potrerada,
                    potreradas (nombre),
                    registros_pesaje (
                        peso,
                        fecha,
                        gmp_calculada
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('estado', 'activo')
                .order('fecha', { foreignTable: 'registros_pesaje', ascending: false });

            if (error) throw error;

            const newNotifications: Notification[] = [];
            const hoy = new Date();
            
            // 1. Detección de Pesajes Vencidos (> 90 días)
            const vencidos = animals?.filter((a: any) => {
                const registros = a.registros_pesaje || [];
                const ultimaFecha = registros.length > 0 ? new Date(registros[0].fecha) : new Date(a.fecha_ingreso);
                return differenceInDays(hoy, ultimaFecha) > 90;
            }) || [];

            if (vencidos.length > 0) {
                newNotifications.push({
                    id: 'pesajes-vencidos',
                    title: 'Pesajes Vencidos',
                    description: `Hay ${vencidos.length} animales que no se han pesado en más de 90 días.`,
                    time: format(hoy, 'HH:mm'),
                    type: 'warning',
                    read: false,
                    roles: ['administrador', 'vaquero'],
                    target: '/inventario',
                    targetState: { filterType: 'vencidos' }
                });
            }

            // 2. Detección de Ganancia Negativa (Pérdida de peso)
            const conPerdida = animals?.filter((a: any) => {
                const registros = a.registros_pesaje || [];
                if (registros.length >= 2) {
                    const sorted = [...registros].sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );
                    return Number(sorted[0].peso) < Number(sorted[1].peso);
                }
                return false;
            }) || [];

            if (conPerdida.length > 0) {
                newNotifications.push({
                    id: 'ganancia-negativa',
                    title: 'Alerta de Salud',
                    description: `${conPerdida.length} animales registraron pérdida de peso en su último control.`,
                    time: format(hoy, 'HH:mm'),
                    type: 'error',
                    read: false,
                    roles: ['administrador'],
                    target: '/inventario',
                    targetState: { filterType: 'perdida' }
                });
            }

            // 3. Lotes Listos para Despacho (> 530kg promedio estimado)
            const potsMap: Record<string, { nombre: string, pesos: number[] }> = {};
            animals?.forEach((a: any) => {
                if (!a.id_potrerada) return;
                const potName = a.potreradas?.nombre || 'Sin nombre';
                if (!potsMap[a.id_potrerada]) potsMap[a.id_potrerada] = { nombre: potName, pesos: [] };
                
                const registros = a.registros_pesaje || [];
                const ultimoP = registros[0];
                const pesoRef = ultimoP ? ultimoP.peso : (a.peso_compra ?? a.peso_ingreso);
                const fechaRef = ultimoP ? new Date(ultimoP.fecha) : new Date(a.fecha_ingreso);
                const dias = differenceInDays(hoy, fechaRef) || 0;
                const gmp = (ultimoP?.gmp_calculada !== null && ultimoP?.gmp_calculada !== undefined) 
                    ? Number(ultimoP.gmp_calculada) : 10.3;
                
                const estimado = pesoRef + (dias * (gmp / 30));
                potsMap[a.id_potrerada].pesos.push(estimado);
            });

            Object.entries(potsMap).forEach(([id, data]) => {
                const avg = data.pesos.reduce((a, b) => a + b, 0) / data.pesos.length;
                if (avg >= 530) {
                    newNotifications.push({
                        id: `lote-listo-${id}`,
                        title: 'Lote Listo para Despacho',
                        description: `El lote ${data.nombre} promedia ${Math.round(avg)} kg estimado hoy.`,
                        time: format(hoy, 'HH:mm'),
                        type: 'success',
                        read: false,
                        roles: ['administrador', 'observador'],
                        target: '/potreradas',
                        targetState: { idPotrerada: id }
                    });
                }
            });

            setNotifications(newNotifications);
        } catch (err) {
            console.error("Error calculando alertas:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
        // Recargar cada 30 minutos
        const interval = setInterval(fetchAlerts, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fincaId]);

    // Filtrar por rol
    const filteredNotifications = useMemo(() => {
        return notifications.filter(n => !n.roles || (role && n.roles.includes(role)));
    }, [notifications, role]);

    const unreadCount = filteredNotifications.filter(n => !n.read).length;

    const toggleDropdown = () => setIsOpen(!isOpen);

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const handleNotificationClick = (n: Notification) => {
        // Marcar como leída
        setNotifications(notifications.map(item => 
            item.id === n.id ? { ...item, read: true } : item
        ));
        
        // Navegar si hay target
        if (n.target) {
            navigate(n.target, { state: n.targetState });
            setIsOpen(false);
        }
    };

    // Cerrar al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <ShoppingCart size={18} />;
            case 'warning': return <Activity size={18} />;
            case 'error': return <AlertTriangle size={18} />;
            default: return <CheckCircle size={18} />;
        }
    };

    return (
        <div className="notification-center" ref={dropdownRef}>
            <button className="notification-btn" onClick={toggleDropdown} title="Notificaciones">
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Bell size={20} />}
                {unreadCount > 0 && <span className="notification-badge" />}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notificaciones</h3>
                        {unreadCount > 0 && (
                            <button className="notification-footer-btn" onClick={markAllAsRead}>
                                Marcar todo como leído
                            </button>
                        )}
                    </div>

                    <div className="notification-list">
                        {loading ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                                Analizando datos...
                            </div>
                        ) : filteredNotifications.length > 0 ? (
                            filteredNotifications.map(n => (
                                <div 
                                    key={n.id} 
                                    className={`notification-item ${!n.read ? 'unread' : ''}`}
                                    onClick={() => handleNotificationClick(n)}
                                >
                                    <div className={`notification-icon-wrapper notification-${n.type}`}>
                                        {getIcon(n.type)}
                                    </div>
                                    <div className="notification-content">
                                        <div className="notification-title">{n.title}</div>
                                        <div className="notification-desc">{n.description}</div>
                                        <span className="notification-time">{n.time}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No hay alertas pendientes
                            </div>
                        )}
                    </div>

                    <div className="notification-footer">
                        <button className="notification-footer-btn" onClick={fetchAlerts}>Actualizar ahora</button>
                    </div>
                </div>
            )}
        </div>
    );
}

