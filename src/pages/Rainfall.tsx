import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useNavigate } from 'react-router-dom';
import {
    CloudRain, Plus, Calendar, Droplets,
    TrendingUp, Sun, AlertTriangle
} from 'lucide-react';
import './Rainfall.css';
import { format, subDays, parseISO, differenceInDays, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { detectarRegionClimatica, generarRecomendacion } from '../utils/climateRegions';
import {
    type DiagnosticoClimatico,
    obtenerUltimoAnalisisClimatico,
    generarYGuardarAnalisisClimatico,
    leerCacheLocal,
} from '../services/climateAiService';
import {
    type PluviometroFinca,
    type RegistroLluviaRaw,
    consolidarLluviasPorFecha,
} from '../utils/rainfallUtils';
import RainfallChartsSection from './rainfall/RainfallChartsSection';
import RainfallAssistantCard from './rainfall/RainfallAssistantCard';
import RainfallMonthlyTable from './rainfall/RainfallMonthlyTable';
import RainfallRegisterModal from './rainfall/RainfallRegisterModal';

export default function Rainfall() {
    const { fincaId, role, licenciaInfo } = useAuth();
    const { theme } = useTheme();
    const { toast, confirmAction } = useFeedback();
    const accentPurple = theme === 'light' ? '#7c3aed' : '#c084fc';
    const navigate = useNavigate();
    const esDemo = licenciaInfo?.licencia === 'demo';
    const isAdminOrCowboy = role === 'administrador' || role === 'vaquero';
    const isMobile = useIsMobile();

    const [registrosRaw, setRegistrosRaw] = useState<RegistroLluviaRaw[]>([]);
    const [pluviometros, setPluviometros] = useState<PluviometroFinca[]>([]);
    const [filtroPluviometro, setFiltroPluviometro] = useState<string>('todos');
    const [ubicacionFinca, setUbicacionFinca] = useState<string | null>(null);
    const [municipioFinca, setMunicipioFinca] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalInitialFecha, setModalInitialFecha] = useState<string | undefined>(undefined);
    const [deleting, setDeleting] = useState(false);

    // Diagnóstico IA climático
    const [diagnosticoIA, setDiagnosticoIA] = useState<DiagnosticoClimatico | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const [anoSeleccionado, setAnoSeleccionado] = useState<number>(new Date().getFullYear());

    // Pluviómetros activos & consolidación
    const pluviometrosActivos = useMemo(
        () => pluviometros.filter(p => p.activo),
        [pluviometros]
    );

    const pluviometrosMap = useMemo(() => {
        const m = new Map<string, PluviometroFinca>();
        pluviometros.forEach(p => m.set(p.id, p));
        return m;
    }, [pluviometros]);

    const esMultiPluviometro = useMemo(() => {
        if (pluviometrosActivos.length >= 2) return true;
        const idsEnUso = new Set(registrosRaw.map(r => r.id_pluviometro).filter(Boolean));
        return idsEnUso.size >= 2 || (pluviometros.length >= 2);
    }, [pluviometrosActivos, pluviometros, registrosRaw]);

    const registros = useMemo(
        () => consolidarLluviasPorFecha(registrosRaw, filtroPluviometro === 'todos' ? null : filtroPluviometro),
        [registrosRaw, filtroPluviometro]
    );

    const registrosConsolidadosFinca = useMemo(
        () => consolidarLluviasPorFecha(registrosRaw, null),
        [registrosRaw]
    );

    // Región climática
    const perfil = useMemo(() => detectarRegionClimatica(ubicacionFinca), [ubicacionFinca]);

    // KPIs
    const kpis = useMemo(() => {
        if (registros.length === 0) return null;

        const hoy = new Date();
        const inicioMesActual = startOfMonth(hoy);
        const finMesActual = endOfMonth(hoy);
        const inicioMesAnterior = startOfMonth(subDays(inicioMesActual, 1));
        const finMesAnterior = endOfMonth(subDays(inicioMesActual, 1));

        const mesActualReg = registros.filter(r =>
            isWithinInterval(parseISO(r.fecha + 'T12:00:00'), { start: inicioMesActual, end: finMesActual })
        );
        const mesAnteriorReg = registros.filter(r =>
            isWithinInterval(parseISO(r.fecha + 'T12:00:00'), { start: inicioMesAnterior, end: finMesAnterior })
        );

        const mmMesActual = mesActualReg.reduce((s, r) => s + r.milimetros, 0);
        const mmMesAnterior = mesAnteriorReg.reduce((s, r) => s + r.milimetros, 0);
        const variacionMes = mmMesAnterior > 0 ? Math.round(((mmMesActual - mmMesAnterior) / mmMesAnterior) * 100) : null;

        const diasEfectivos = mesActualReg.filter(r => r.milimetros >= perfil.umbralEfectivoMm).length;

        const registrosOrdenados = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha));
        let diasSecos = 0;
        const fechaRef = hoy;

        if (registrosOrdenados.length > 0) {
            const primerReg = parseISO(registrosOrdenados[0].fecha + 'T12:00:00');
            diasSecos = differenceInDays(fechaRef, primerReg);
            if (registrosOrdenados[0].milimetros >= perfil.umbralEfectivoMm) {
                diasSecos = 0;
            } else {
                for (const r of registrosOrdenados) {
                    if (r.milimetros >= perfil.umbralEfectivoMm) {
                        diasSecos = differenceInDays(fechaRef, parseISO(r.fecha + 'T12:00:00'));
                        break;
                    }
                }
            }
        }

        const anoActual = hoy.getFullYear();
        const mmAnual = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00').getFullYear() === anoActual)
            .reduce((s, r) => s + r.milimetros, 0);

        const hace30 = subDays(hoy, 30);
        const mm30dias = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00') >= hace30 && r.milimetros >= perfil.umbralRegistroMm)
            .reduce((s, r) => s + r.milimetros, 0);

        const hace15 = subDays(hoy, 15);
        const mm15dias = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00') >= hace15 && r.milimetros >= perfil.umbralRegistroMm)
            .reduce((s, r) => s + r.milimetros, 0);

        const hace7 = subDays(hoy, 7);
        const mm7dias = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00') >= hace7 && r.milimetros >= perfil.umbralRegistroMm)
            .reduce((s, r) => s + r.milimetros, 0);

        const fechaHoyStr = format(hoy, 'yyyy-MM-dd');
        const registroHoy = registros.find(r => r.fecha === fechaHoyStr);
        const lluviaHoy = registroHoy ? registroHoy.milimetros : 0;

        const uniqueRainyDays = new Set(
            mesActualReg.filter(r => r.milimetros >= perfil.umbralRegistroMm).map(r => r.fecha)
        ).size;
        const diasTranscurridos = hoy.getDate();
        const diasSecosMes = Math.max(0, diasTranscurridos - uniqueRainyDays);
        const nombreMesActual = format(hoy, 'MMMM', { locale: es });

        return {
            mmMesActual: parseFloat(mmMesActual.toFixed(1)),
            mmMesAnterior: parseFloat(mmMesAnterior.toFixed(1)),
            variacionMes,
            diasEfectivos,
            diasSecos,
            mmAnual: parseFloat(mmAnual.toFixed(1)),
            mm30dias,
            mm15dias: parseFloat(mm15dias.toFixed(1)),
            mm7dias: parseFloat(mm7dias.toFixed(1)),
            lluviaHoy: parseFloat(lluviaHoy.toFixed(1)),
            diasSecosMes,
            diasTranscurridos,
            nombreMesActual
        };
    }, [registros, perfil]);

    useEffect(() => { fetchTodo(); }, [fincaId]);

    const openRegistroModal = (fechaInicial?: string) => {
        setModalInitialFecha(fechaInicial);
        setShowModal(true);
    };

    const dispararAnalisisIA = useCallback(async (regs: RegistroLluviaRaw[], ubicacion: string | null, municipio: string | null) => {
        if (!fincaId || esDemo) return;
        setAnalysisLoading(true);
        setAnalysisError(null);
        try {
            const diag = await generarYGuardarAnalisisClimatico(
                fincaId,
                regs.map(r => ({ fecha: r.fecha, milimetros: r.milimetros, id_pluviometro: r.id_pluviometro })),
                ubicacion,
                municipio
            );
            setDiagnosticoIA(diag);
        } catch (err: any) {
            const msg = err?.message || 'Error al analizar. Verifica tu conexión.';
            setAnalysisError(msg);
            console.error('[climateAI] Error:', msg, err);
        } finally {
            setAnalysisLoading(false);
        }
    }, [fincaId, esDemo]);

    const fetchTodo = async () => {
        if (!fincaId) return;
        setLoading(true);

        // Carga instantánea del diagnóstico desde caché local (0 ms, modo offline)
        const cacheLocal = leerCacheLocal(fincaId);
        if (cacheLocal) setDiagnosticoIA(cacheLocal);

        try {
            const [lluviasRes, pluvRes, fincaRes, diagRes] = await Promise.all([
                supabase
                    .from('registros_lluvia')
                    .select('*')
                    .eq('id_finca', fincaId)
                    .order('fecha', { ascending: false }),
                supabase
                    .from('pluviometros_finca')
                    .select('*')
                    .eq('id_finca', fincaId)
                    .order('orden', { ascending: true })
                    .order('creado_en', { ascending: true }),
                supabase
                    .from('fincas')
                    .select('ubicacion, municipio')
                    .eq('id', fincaId)
                    .single(),
                obtenerUltimoAnalisisClimatico(fincaId),
            ]);
            if (lluviasRes.error) throw lluviasRes.error;
            const regs = (lluviasRes.data || []) as RegistroLluviaRaw[];
            const pluvs = (pluvRes.data || []) as PluviometroFinca[];
            const ubicacion = fincaRes.data?.ubicacion || null;
            const municipio = fincaRes.data?.municipio || null;
            setRegistrosRaw(regs);
            setPluviometros(pluvs);
            setUbicacionFinca(ubicacion);
            setMunicipioFinca(municipio);
            if (diagRes) {
                setDiagnosticoIA(diagRes);
            } else if (regs.length > 0 && !cacheLocal) {
                dispararAnalisisIA(regs, ubicacion, municipio);
            }
        } catch (err: any) {
            console.error('Error fetching rainfall:', err);
        } finally {
            setLoading(false);
        }
    };

    const recargarRegistrosYAnalizar = async () => {
        await fetchTodo();
        if (!fincaId) return;
        const regsActualizados = await supabase
            .from('registros_lluvia')
            .select('fecha, milimetros, id_pluviometro')
            .eq('id_finca', fincaId)
            .order('fecha', { ascending: false });
        if (regsActualizados.data) {
            dispararAnalisisIA(regsActualizados.data as any, ubicacionFinca, municipioFinca);
        }
    };

    const requestEliminar = async (id: string, nombreEstacion?: string) => {
        if (deleting) return;
        const confirmed = await confirmAction(
            nombreEstacion
                ? `¿Estás seguro de eliminar el registro de "${nombreEstacion}"?`
                : '¿Estás seguro de eliminar este registro de lluvia?',
            {
                title: 'Eliminar Registro',
                confirmLabel: 'Sí, eliminar',
                cancelLabel: 'Cancelar',
                destructive: true,
            }
        );
        if (!confirmed) return;

        setDeleting(true);
        try {
            const { error: delErr } = await supabase.from('registros_lluvia').delete().eq('id', id);
            if (delErr) throw delErr;
            await recargarRegistrosYAnalizar();
            toast('Registro de lluvia eliminado.', 'success');
        } catch (err: any) {
            toast('Error al eliminar: ' + (err?.message || 'Intenta nuevamente'), 'error');
        } finally {
            setDeleting(false);
        }
    };

    const anosDisponibles = useMemo(() => {
        const set = new Set(registros.map(r => parseISO(r.fecha + 'T12:00:00').getFullYear()));
        return Array.from(set).sort((a, b) => b - a);
    }, [registros]);

    const recomendacion = useMemo(() => {
        if (!kpis) return null;
        return generarRecomendacion(perfil, kpis.diasSecos, kpis.mm30dias, kpis.mm7dias, kpis.mm15dias);
    }, [perfil, kpis]);

    const colorSemaforoSecos = (dias: number) => {
        if (dias >= perfil.diasSecosAlerta) return 'var(--error)';
        if (dias >= perfil.diasSecosAlerta * 0.6) return 'var(--warning)';
        return 'var(--success)';
    };

    return (
        <div className="page-container rainfall-page">
            {/* HEADER */}
            <div className="rainfall-header">
                <div className="rainfall-header-main">
                    <h1 className="title rainfall-title">
                        <CloudRain size={32} color="var(--primary-light)" aria-hidden="true" />
                        Pluviometría
                    </h1>
                    <p className="rainfall-subtitle">
                        Control de pluviosidad diaria por finca (mm)
                    </p>
                    <div className="rainfall-region-pill">
                        <span aria-hidden="true">{perfil.emoji}</span>
                        <span style={{ fontWeight: 600 }}>{municipioFinca ? `${municipioFinca} (${perfil.zona})` : perfil.zona}</span>
                        <span style={{ opacity: 0.6 }} aria-hidden="true">•</span>
                        <span>Lluvia efectiva ≥ {perfil.umbralEfectivoMm} mm</span>
                        {!ubicacionFinca && (
                            <span style={{ color: 'var(--warning)', marginLeft: '4px' }}>
                                · <a
                                    href="/configuracion"
                                    onClick={e => { e.preventDefault(); navigate('/configuracion'); }}
                                    className="rainfall-region-link"
                                >
                                    Configura tu ubicación
                                </a>
                            </span>
                        )}
                    </div>
                </div>
                {isAdminOrCowboy && (
                    <button
                        type="button"
                        className="btn btn-primary rainfall-new-btn"
                        onClick={() => openRegistroModal()}
                    >
                        <Plus size={20} aria-hidden="true" />
                        Nuevo Registro
                    </button>
                )}
            </div>

            {/* Filtro por estación cuando la finca tiene múltiples pluviómetros */}
            {!loading && esMultiPluviometro && (
                <div className="rainfall-filter-bar">
                    <span className="rainfall-filter-label">Vista:</span>
                    <button
                        type="button"
                        aria-pressed={filtroPluviometro === 'todos'}
                        onClick={() => setFiltroPluviometro('todos')}
                        className={`rainfall-chip-btn ${filtroPluviometro === 'todos' ? 'is-active' : ''}`}
                    >
                        📊 Promedio Finca ({pluviometrosActivos.length || pluviometros.length})
                    </button>
                    {pluviometros.map(pluv => (
                        <button
                            key={pluv.id}
                            type="button"
                            aria-pressed={filtroPluviometro === pluv.id}
                            onClick={() => setFiltroPluviometro(pluv.id)}
                            className={`rainfall-chip-btn ${filtroPluviometro === pluv.id ? 'is-active' : ''}`}
                            style={{ opacity: pluv.activo ? 1 : 0.75 }}
                        >
                            📍 {pluv.nombre}{!pluv.activo ? ' (Inactivo)' : ''}
                        </button>
                    ))}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <CloudRain size={40} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p>Cargando registros...</p>
                </div>
            ) : registros.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                    <Droplets size={48} style={{ marginBottom: '16px', opacity: 0.3, color: 'var(--primary-light)' }} />
                    <p style={{ color: 'var(--text-muted)' }}>
                        {filtroPluviometro === 'todos'
                            ? 'No hay registros de lluvia para esta finca.'
                            : 'Este pluviómetro aún no tiene registros.'}
                    </p>
                    {isAdminOrCowboy && (
                        <button className="btn btn-primary" style={{ marginTop: '20px', width: 'auto', padding: '12px 28px' }} onClick={() => openRegistroModal()}>
                            Registrar Primera Lluvia
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* KPI CARDS */}
                    {kpis && (
                        <div className="rainfall-kpi-grid">
                            {/* 1. Lluvia de Hoy */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, var(--info), #0ea5e9)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Lluvia de Hoy</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--info)', margin: '6px 0 4px' }}>{kpis.lluviaHoy}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> mm</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {format(new Date(), "dd 'de' MMMM", { locale: es })}
                                        </span>
                                    </div>
                                    <Droplets size={28} style={{ color: 'var(--info)', opacity: 0.65 }} />
                                </div>
                            </div>

                            {/* 2. Racha Seca */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: colorSemaforoSecos(kpis.diasSecos) }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Racha Seca</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: colorSemaforoSecos(kpis.diasSecos), margin: '6px 0 4px' }}>{kpis.diasSecos}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> días</span></p>
                                        <span style={{ fontSize: '0.8rem', color: kpis.diasSecos >= perfil.diasSecosAlerta ? 'var(--error)' : 'var(--text-muted)' }}>
                                            {recomendacion?.tipo === 'oreo'
                                                ? `🌾 En Oreo (buffer ${perfil.diasBufferPostExceso}d post-lluvia)`
                                                : kpis.diasSecos >= perfil.diasSecosAlerta
                                                ? `⚠️ Alerta: supera ${perfil.diasSecosAlerta} días`
                                                : `Alerta en ${perfil.diasSecosAlerta} días`}
                                        </span>
                                    </div>
                                    {kpis.diasSecos >= perfil.diasSecosAlerta
                                        ? <AlertTriangle size={28} style={{ color: 'var(--error)', opacity: 0.8 }} />
                                        : <Sun size={28} style={{ color: 'var(--warning)', opacity: 0.65 }} />}
                                </div>
                            </div>

                            {/* 3. Lluvia Mes Actual */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #0284c7, var(--info))' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Lluvia Mes Actual</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--info)', margin: '6px 0 4px' }}>{kpis.mmMesActual}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> mm</span></p>
                                        {kpis.variacionMes !== null && (
                                            <span style={{ fontSize: '0.8rem', color: kpis.variacionMes >= 0 ? 'var(--success)' : 'var(--error)' }}>
                                                {kpis.variacionMes >= 0 ? '▲' : '▼'} {Math.abs(kpis.variacionMes)}% vs mes anterior
                                            </span>
                                        )}
                                    </div>
                                    <CloudRain size={28} style={{ color: 'var(--info)', opacity: 0.65 }} />
                                </div>
                            </div>

                            {/* 4. Días Lluvia Efectiva */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, var(--primary), var(--success))' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Días Lluvia Efectiva</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)', margin: '6px 0 4px' }}>{kpis.diasEfectivos}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> días</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>≥ {perfil.umbralEfectivoMm} mm este mes</span>
                                    </div>
                                    <CloudRain size={28} style={{ color: 'var(--success)', opacity: 0.65 }} />
                                </div>
                            </div>

                            {/* 5. Días sin Lluvia (Mes) */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, var(--warning), #d97706)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Días sin Lluvia (Mes)</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--warning)', margin: '6px 0 4px' }}>{kpis.diasSecosMes}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> días</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            En lo que va de {kpis.nombreMesActual}
                                        </span>
                                    </div>
                                    <Calendar size={28} style={{ color: 'var(--warning)', opacity: 0.65 }} />
                                </div>
                            </div>

                            {/* 6. Acumulado Anual */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, #9333ea, ${accentPurple})` }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Acumulado Anual</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: accentPurple, margin: '6px 0 4px' }}>{kpis.mmAnual.toLocaleString('es-CO')}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> mm</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ref. zona: ~{perfil.mmAnualReferencia.toLocaleString('es-CO')} mm/año</span>
                                    </div>
                                    <TrendingUp size={28} style={{ color: accentPurple, opacity: 0.65 }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <RainfallChartsSection
                        registros={registros}
                        anoSeleccionado={anoSeleccionado}
                        anosDisponibles={anosDisponibles}
                        onChangeAno={setAnoSeleccionado}
                        umbralEfectivoMm={perfil.umbralEfectivoMm}
                        accentPurple={accentPurple}
                        theme={theme}
                    />

                    <RainfallAssistantCard
                        esDemo={esDemo}
                        perfil={perfil}
                        accentPurple={accentPurple}
                        diagnosticoIA={diagnosticoIA}
                        recomendacion={recomendacion}
                        kpis={kpis}
                        analysisLoading={analysisLoading}
                        analysisError={analysisError}
                        onReanalizar={() => dispararAnalisisIA(registrosConsolidadosFinca, ubicacionFinca, municipioFinca)}
                    />

                    <RainfallMonthlyTable
                        registros={registros}
                        anoSeleccionado={anoSeleccionado}
                        anosDisponibles={anosDisponibles}
                        onChangeAno={setAnoSeleccionado}
                        pluviometrosMap={pluviometrosMap}
                        pluviometrosActivosCount={pluviometrosActivos.length}
                        esMultiPluviometro={esMultiPluviometro}
                        filtroPluviometro={filtroPluviometro}
                        perfil={perfil}
                        isAdminOrCowboy={isAdminOrCowboy}
                        onEditDate={openRegistroModal}
                        onRequestEliminar={requestEliminar}
                    />
                </>
            )}

            <RainfallRegisterModal
                isOpen={showModal}
                initialFecha={modalInitialFecha}
                fincaId={fincaId}
                pluviometrosActivos={pluviometrosActivos}
                registrosRaw={registrosRaw}
                accentPurple={accentPurple}
                isMobile={isMobile}
                onClose={() => setShowModal(false)}
                onSaved={recargarRegistrosYAnalizar}
            />
        </div>
    );
}
