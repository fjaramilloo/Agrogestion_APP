import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, ShoppingCart, Activity, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllSupabasePages } from '../lib/supabasePagination';
import { differenceInDays, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
    calcularDiasEntreFechas,
    evaluarLotesParaDespacho,
    normalizarPesajesDesc
} from '../utils/ganancia';
import { getLocalIsoDate, formatLocalDate } from '../utils/dateUtils';
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
    fincaId: string;
    fincaNombre: string;
}

const ALERTS_CACHE_KEY = 'agrogestion_cached_alerts';
const ALERTS_CACHE_TS = 'agrogestion_cached_alerts_ts';
const READ_NOTIFICATIONS_KEY = 'read_notifications_global';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function readStoredDateMap(key: string): Record<string, string> {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function getReadIdsToday(hoyStr: string, legacyFincaId?: string | null): Set<string> {
    const readIds = new Set<string>();
    const globalMap = readStoredDateMap(READ_NOTIFICATIONS_KEY);
    for (const [id, date] of Object.entries(globalMap)) {
        if (date === hoyStr) readIds.add(id);
    }
    // Compatibilidad con lecturas previas guardadas bajo clave por finca
    if (legacyFincaId) {
        const legacyMap = readStoredDateMap(`read_notifications_${legacyFincaId}`);
        for (const [id, date] of Object.entries(legacyMap)) {
            if (date === hoyStr) readIds.add(id);
        }
    }
    return readIds;
}

function persistReadIdsToday(ids: string[], hoyStr: string): void {
    if (ids.length === 0) return;
    try {
        const current = readStoredDateMap(READ_NOTIFICATIONS_KEY);
        const next: Record<string, string> = {};
        for (const [id, date] of Object.entries(current)) {
            if (date === hoyStr) next[id] = date;
        }
        for (const id of ids) {
            next[id] = hoyStr;
        }
        localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(next));
    } catch { /* storage quota */ }
}

function saveAlertsSessionCache(items: Notification[], updateTimestamp = false): void {
    try {
        sessionStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify(items));
        if (updateTimestamp) {
            sessionStorage.setItem(ALERTS_CACHE_TS, String(Date.now()));
        }
    } catch { /* storage quota */ }
}

export default function NotificationCenter() {
    const { role, fincaId, userFincas, licenciaInfo } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>(() => {
        try {
            const raw = sessionStorage.getItem(ALERTS_CACHE_KEY);
            const cached: Notification[] = raw ? JSON.parse(raw) : [];
            const readIds = getReadIdsToday(format(new Date(), 'yyyy-MM-dd'), fincaId);
            return cached.filter(n => !readIds.has(n.id));
        } catch {
            return [];
        }
    });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            // 0. Utilizar las fincas del contexto del usuario
            if (!userFincas || userFincas.length === 0) return;

            const fincaIds = userFincas.map(f => f.id_finca);
            const fincaNamesMap = new Map(userFincas.map(f => [f.id_finca, f.nombre_finca]));

            // 1. Obtener animales de TODAS las fincas (paginado para cuentas > 1,000 animales)
            const { data: animals, error } = await fetchAllSupabasePages((from, to, signal) => {
                const q = supabase
                    .from('animales')
                    .select(`
                        id,
                        numero_chapeta,
                        etapa,
                        fecha_ingreso,
                        peso_ingreso,
                        peso_compra,
                        fecha_ingreso_ceba,
                        peso_ingreso_ceba,
                        id_potrerada,
                        id_finca,
                        registros_pesaje (
                            peso,
                            fecha,
                            etapa,
                            gmp_calculada,
                            is_deleted
                        )
                    `)
                    .in('id_finca', fincaIds)
                    .eq('estado', 'activo')
                    .or('is_deleted.is.null,is_deleted.eq.false')
                    .order('id', { ascending: true })
                    .order('fecha', { foreignTable: 'registros_pesaje', ascending: false })
                    .range(from, to);
                return signal ? q.abortSignal(signal) : q;
            });

            if (error) {
                console.error("Error fetching animals for notifications:", error);
                throw error;
            }

            let potreradasMap: Record<string, string> = {};
            if (animals && animals.length > 0) {
                const potIds = [...new Set(animals.map(a => a.id_potrerada).filter(Boolean))];
                if (potIds.length > 0) {
                    const { data: pots } = await supabase.from('potreradas').select('id, nombre').in('id', potIds);
                    if (pots) {
                        pots.forEach((p: any) => potreradasMap[p.id] = p.nombre);
                    }
                }
            }

            // Obtener umbrales de despacho y preset productivo por finca (o fallback a 530)
            const corteVentaMap = new Map<string, number>();
            const presetMap = new Map<string, string | null>();
            const { data: configs } = await supabase
                .from('configuracion_kpi')
                .select('id_finca, corte_peso_3, preset_peso')
                .in('id_finca', fincaIds);
            if (configs) {
                configs.forEach((c: any) => {
                    corteVentaMap.set(c.id_finca, Number(c.corte_peso_3) || 530);
                    presetMap.set(c.id_finca, c.preset_peso || null);
                });
            }

            const newNotifications: Notification[] = [];
            const hoy = new Date();
            const hoyStr = getLocalIsoDate();
            
            // 1. Procesar alertas por cada Finca
            fincaIds.forEach(fid => {
                const fName = fincaNamesMap.get(fid) || 'Finca';
                const fincaAnimals = animals?.filter(a => a.id_finca === fid) || [];

                // A. Pesajes Vencidos (> 90 días)
                const vencidos = fincaAnimals.filter((a: any) => {
                    const registros = normalizarPesajesDesc(a.registros_pesaje);
                    const ultimaFecha = registros.length > 0 ? registros[0].fecha : a.fecha_ingreso;
                    return calcularDiasEntreFechas(ultimaFecha, hoyStr) > 90;
                });

                if (vencidos.length > 0) {
                    newNotifications.push({
                        id: `pesajes-vencidos-${fid}`,
                        title: 'Pesajes Vencidos',
                        description: `Hay ${vencidos.length} animales que no se han pesado en más de 90 días.`,
                        time: format(hoy, 'HH:mm'),
                        type: 'warning',
                        read: false,
                        roles: ['administrador', 'vaquero'],
                        target: '/inventario',
                        targetState: { filterType: 'vencidos' },
                        fincaId: fid,
                        fincaNombre: fName
                    });
                }

                // B. Detección de Ganancia Negativa (los pesajes limpios ordenados DESC por fecha)
                const conPerdida = fincaAnimals.filter((a: any) => {
                    const registros = normalizarPesajesDesc(a.registros_pesaje);
                    if (registros.length >= 2) {
                        return Number(registros[0].peso) < Number(registros[1].peso);
                    }
                    return false;
                });

                if (conPerdida.length > 0) {
                    newNotifications.push({
                        id: `ganancia-negativa-${fid}`,
                        title: 'Alerta de Salud',
                        description: `${conPerdida.length} animales registraron pérdida de peso en su último control.`,
                        time: format(hoy, 'HH:mm'),
                        type: 'error',
                        read: false,
                        roles: ['administrador'],
                        target: '/inventario',
                        targetState: { filterType: 'perdida' },
                        fincaId: fid,
                        fincaNombre: fName
                    });
                }

                // C. Lotes Listos para Despacho (solo etapa comercial, pesaje <= 150d y modelo acotado)
                const umbralDespacho = corteVentaMap.get(fid) || 530;
                const presetPeso = presetMap.get(fid) || null;
                const fincaAnimalsConNombre = fincaAnimals.map((a: any) => ({
                    ...a,
                    potreradaNombre: a.id_potrerada ? (potreradasMap[a.id_potrerada] || 'Sin nombre') : null
                }));
                const { proximosVigentes, atrasadosPorConfirmar } = evaluarLotesParaDespacho(
                    fincaAnimalsConNombre,
                    umbralDespacho,
                    presetPeso,
                    hoyStr
                );

                proximosVigentes.forEach((lote) => {
                    if (lote.pesoPromedioEstimado >= umbralDespacho || lote.pctListos >= 0.5) {
                        const desc = lote.pesoPromedioEstimado >= umbralDespacho
                            ? `El lote ${lote.nombre} promedia ${Math.round(lote.pesoPromedioEstimado)} kg est. (báscula: ${Math.round(lote.pesoPromedioReal)} kg · meta: ${umbralDespacho} kg).`
                            : `El lote ${lote.nombre} tiene ${lote.listos} de ${lote.cantidad} animales sobre ${umbralDespacho} kg (prom: ${Math.round(lote.pesoPromedioEstimado)} kg est.).`;
                        newNotifications.push({
                            id: `lote-listo-${lote.id}`,
                            title: 'Lote Listo para Despacho',
                            description: desc,
                            time: format(hoy, 'HH:mm'),
                            type: 'success',
                            read: false,
                            roles: ['administrador', 'observador'],
                            target: '/potreradas',
                            targetState: { idPotrerada: lote.id },
                            fincaId: fid,
                            fincaNombre: fName
                        });
                    }
                });

                if (atrasadosPorConfirmar.length > 0) {
                    const nombres = atrasadosPorConfirmar.slice(0, 3).map((l) => l.nombre).join(', ');
                    const extra = atrasadosPorConfirmar.length > 3 ? ` (+${atrasadosPorConfirmar.length - 3})` : '';
                    newNotifications.push({
                        id: `lotes-por-confirmar-${fid}`,
                        title: 'Lotes por Confirmar en Báscula',
                        description: `${atrasadosPorConfirmar.length} ${atrasadosPorConfirmar.length === 1 ? 'lote lleva' : 'lotes llevan'} >150 días sin pesar y podrían estar listos (${nombres}${extra}).`,
                        time: format(hoy, 'HH:mm'),
                        type: 'warning',
                        read: false,
                        roles: ['administrador', 'vaquero'],
                        target: '/potreradas',
                        targetState: { idPotrerada: atrasadosPorConfirmar[0].id },
                        fincaId: fid,
                        fincaNombre: fName
                    });
                }
            });

            // 2. Alerta de Cambio de Potrero (Multi-finca)
            const { data: movimientosActivos } = await supabase
                .from('movimientos_potreros')
                .select(`
                    id,
                    id_potrero,
                    id_potrerada,
                    id_finca,
                    fecha_entrada,
                    potreradas (
                        id,
                        nombre
                    ),
                    potreros (
                        nombre,
                        dias_ocupacion_base,
                        id_rotacion,
                        rotaciones (
                            nombre,
                            potreros ( id )
                        )
                    )
                `)
                .in('id_finca', fincaIds)
                .is('fecha_salida', null);

            // Renombrar para mantener compatibilidad con el código de abajo
            const potreradas = movimientosActivos?.map((m: any) => ({
                id: m.id_potrerada,
                nombre: m.potreradas?.nombre || 'Lote',
                id_potrero: m.id_potrero,
                id_finca: m.id_finca,
                fecha_entrada: m.fecha_entrada,
                potreros: m.potreros,
            }));

            if (potreradas && potreradas.length > 0) {
                const veinteDiasAtras = new Date();
                veinteDiasAtras.setDate(veinteDiasAtras.getDate() - 20);

                const potreroIds = [...new Set(potreradas.map(p => p.id_potrero).filter(Boolean))];
                let aforosMap: Record<string, { dias_pastoreo_estimados: number, fecha: string }> = {};

                if (potreroIds.length > 0) {
                    const { data: aforosData } = await supabase
                        .from('registros_aforo')
                        .select('id_potrero, dias_pastoreo_estimados, fecha')
                        .in('id_potrero', potreroIds)
                        .gte('fecha', veinteDiasAtras.toISOString())
                        .order('fecha', { ascending: false });

                    if (aforosData) {
                        aforosData.forEach((af: any) => {
                            if (!aforosMap[af.id_potrero]) {
                                aforosMap[af.id_potrero] = af;
                            }
                        });
                    }
                }

                for (const p of potreradas) {
                    const potreroData = p.potreros as any;
                    const rotacion = potreroData?.rotaciones;
                    
                    // Solo alertar si el potrero pertenece a una rotación con más de 1 potrero
                    const numPotrerosEnRotacion = rotacion?.potreros?.length || 0;
                    if (numPotrerosEnRotacion <= 1) continue;

                    const diasEnPotrero = Math.max(0, calcularDiasEntreFechas(p.fecha_entrada, getLocalIsoDate()));
                    const aforo = aforosMap[p.id_potrero];

                    // Obtener días base del potrero específico
                    const diasBase = potreroData?.dias_ocupacion_base || 28;

                    let limiteDias = diasBase;
                    let fuente = `regla base del potrero (${diasBase} días)`;

                    if (aforo) {
                        limiteDias = Math.floor(Number(aforo.dias_pastoreo_estimados) || diasBase);
                        fuente = `aforo reciente (${formatLocalDate(aforo.fecha, 'dd/MM')})`;
                    }

                    if (diasEnPotrero >= limiteDias) {
                        newNotifications.push({
                            id: `cambio-potrero-${p.id}`,
                            title: 'Cambio de Potrero Necesario',
                            description: `El lote "${p.nombre}" lleva ${diasEnPotrero} días en "${potreroData?.nombre || 'Potrero'}" (${rotacion?.nombre}). Límite de ${limiteDias} días según ${fuente}.`,
                            type: 'warning',
                            time: format(hoy, 'HH:mm'),
                            read: false,
                            roles: ['administrador', 'vaquero'],
                            target: '/potreradas',
                            targetState: { idPotrerada: p.id },
                            fincaId: p.id_finca,
                            fincaNombre: fincaNamesMap.get(p.id_finca) || 'Finca'
                        });
                    }
                }
            }

            // 3. Alerta de Vencimiento de Suscripción (8 días antes para el Administrador)
            if (licenciaInfo && licenciaInfo.licencia !== 'demo' && licenciaInfo.fechaVencimientoLicencia) {
                const fechaVenc = new Date(licenciaInfo.fechaVencimientoLicencia);
                const diasRestantes = differenceInDays(fechaVenc, hoy);
                const primaryFincaId = fincaId || userFincas[0]?.id_finca || 'global';
                const primaryFincaName = licenciaInfo.organizacionNombre || 'Suscripción';

                if (diasRestantes <= 8 && diasRestantes >= 0) {
                    newNotifications.push({
                        id: `vencimiento-licencia-${licenciaInfo.organizacionId || 'org'}-${format(fechaVenc, 'yyyy-MM-dd')}`,
                        title: diasRestantes === 0 ? '¡Tu suscripción vence hoy!' : `Suscripción por vencer (${diasRestantes} día${diasRestantes === 1 ? '' : 's'})`,
                        description: `Tu plan ${licenciaInfo.licencia.toUpperCase()} vence el ${format(fechaVenc, 'dd/MM/yyyy')}. Renueva a tiempo para mantener el acceso y soporte sin interrupciones.`,
                        type: diasRestantes <= 3 ? 'error' : 'warning',
                        time: format(hoy, 'HH:mm'),
                        read: false,
                        roles: ['administrador'],
                        target: '/suscripcion',
                        fincaId: primaryFincaId,
                        fincaNombre: primaryFincaName
                    });
                } else if (diasRestantes < 0) {
                    newNotifications.push({
                        id: `vencimiento-licencia-expirada-${licenciaInfo.organizacionId || 'org'}-${format(fechaVenc, 'yyyy-MM-dd')}`,
                        title: 'Suscripción Vencida',
                        description: `Tu plan ${licenciaInfo.licencia.toUpperCase()} expiró el ${format(fechaVenc, 'dd/MM/yyyy')}. Renueva tu plan para continuar disfrutando de la plataforma.`,
                        type: 'error',
                        time: format(hoy, 'HH:mm'),
                        read: false,
                        roles: ['administrador'],
                        target: '/suscripcion',
                        fincaId: primaryFincaId,
                        fincaNombre: primaryFincaName
                    });
                }
            }

            const readTodayIds = getReadIdsToday(hoyStr, fincaId);

            // Filtrar las que ya se leyeron hoy
            const finalNotifications = newNotifications.filter(n => !readTodayIds.has(n.id));

            setNotifications(finalNotifications);
            saveAlertsSessionCache(finalNotifications, true);
        } catch (err) {
            console.error("Error calculando alertas:", err);
        } finally {
            setLoading(false);
        }
    };

    // Dependencia estable: solo re-evaluar si cambia la lista real de IDs de fincas
    const fincasKey = (userFincas || []).map(f => f.id_finca).sort().join(',');

    useEffect(() => {
        if (!fincasKey) return;

        // Comprobar si ya tenemos alertas calculadas recientemente en la sesión
        const lastFetch = Number(sessionStorage.getItem(ALERTS_CACHE_TS) || 0);
        const yaValido = Date.now() - lastFetch < CACHE_TTL_MS;

        // DIFERIR: Darle prioridad absoluta a la pantalla principal y al Dashboard durante
        // los primeros 3.5 segundos de arranque para evitar saturar el ancho de banda y la CPU.
        const delayMs = yaValido ? CACHE_TTL_MS - (Date.now() - lastFetch) : 3500;
        const timer = setTimeout(() => {
            fetchAlerts();
        }, delayMs);

        // Recargar periódicamente cada 30 minutos
        const interval = setInterval(fetchAlerts, 30 * 60 * 1000);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        };
    }, [fincasKey]);

    // Filtrar por rol
    const filteredNotifications = useMemo(() => {
        return notifications.filter(n => !n.roles || (role && n.roles.includes(role)));
    }, [notifications, role]);

    const unreadCount = filteredNotifications.filter(n => !n.read).length;

    const toggleDropdown = () => setIsOpen(!isOpen);

    const markAllAsRead = () => {
        const hoyStr = format(new Date(), 'yyyy-MM-dd');
        persistReadIdsToday(notifications.map(n => n.id), hoyStr);

        setNotifications(notifications.map(n => ({ ...n, read: true })));
        saveAlertsSessionCache([]);
    };

    const handleNotificationClick = (n: Notification) => {
        const hoyStr = format(new Date(), 'yyyy-MM-dd');
        persistReadIdsToday([n.id], hoyStr);

        const next = notifications.map(item =>
            item.id === n.id ? { ...item, read: true } : item
        );
        setNotifications(next);
        // Excluir la alerta ya leída del caché de sesión para que no reaparezca al recargar
        saveAlertsSessionCache(next.filter(item => item.id !== n.id && !item.read));

        // Navegar si hay target
        if (n.target) {
            navigate(n.target, { state: n.targetState });
            setIsOpen(false);
        }
    };

    // Cerrar al hacer clic/tocar fuera o pulsar Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: PointerEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

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
            <button
                type="button"
                className="notification-btn"
                onClick={toggleDropdown}
                title="Notificaciones"
                aria-label="Notificaciones"
                aria-expanded={isOpen}
            >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Bell size={20} />}
                {unreadCount > 0 && <span className="notification-badge" />}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notificaciones</h3>
                        {unreadCount > 0 && (
                            <button type="button" className="notification-footer-btn" onClick={markAllAsRead}>
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
                            Object.entries(
                                filteredNotifications.reduce((acc, n) => {
                                    if (!acc[n.fincaNombre]) acc[n.fincaNombre] = [];
                                    acc[n.fincaNombre].push(n);
                                    return acc;
                                }, {} as Record<string, Notification[]>)
                            ).map(([fName, fNotifications]) => (
                                <div key={fName} className="notification-finca-group">
                                    <div className="notification-finca-header">{fName}</div>
                                    {fNotifications.map(n => (
                                        <button
                                            type="button"
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
                                        </button>
                                    ))}
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No hay alertas pendientes
                            </div>
                        )}
                    </div>

                    <div className="notification-footer">
                        <button type="button" className="notification-footer-btn" onClick={fetchAlerts}>Actualizar ahora</button>
                    </div>
                </div>
            )}
        </div>
    );
}

