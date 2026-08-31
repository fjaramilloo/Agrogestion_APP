
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    CloudRain, Plus, Trash2, Calendar, Droplets,
    ChevronDown, ChevronUp, Lock, TrendingUp, Sun, AlertTriangle, BarChart2
} from 'lucide-react';
import { format, subDays, parseISO, differenceInDays, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, ReferenceLine, Legend
} from 'recharts';
import { detectarRegionClimatica, generarRecomendacion } from '../utils/climateRegions';
import { getLocalIsoDate } from '../utils/dateUtils';

interface RegistroLluvia {
    id: string;
    fecha: string;
    milimetros: number;
    lectura_acumulada?: number;
    notas: string;
    creado_en: string;
}

interface MesGroup {
    key: string; // 'YYYY-MM'
    label: string;
    totalMm: number;
    registros: RegistroLluvia[];
    open: boolean;
}

const COLORES_INTENSIDAD = {
    fuerte: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.5)', text: '#60a5fa', label: 'Fuerte', emoji: '🌊' },
    moderada: { bg: 'rgba(96, 165, 250, 0.10)', border: 'rgba(96, 165, 250, 0.3)', text: '#7dd3fc', label: 'Moderada', emoji: '🔵' },
    leve: { bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.2)', text: '#94a3b8', label: 'Leve/Garúa', emoji: '💧' },
};

function clasificarIntensidad(mm: number, umbral: number) {
    if (mm >= umbral * 4) return COLORES_INTENSIDAD.fuerte;
    if (mm >= umbral) return COLORES_INTENSIDAD.moderada;
    return COLORES_INTENSIDAD.leve;
}

const TAB_MENSUAL = 'mensual';
const TAB_DIARIA = 'diaria';
const TAB_YOY = 'yoy';

export default function Rainfall() {
    const { fincaId, licenciaInfo } = useAuth();
    const navigate = useNavigate();
    const esDemo = licenciaInfo?.licencia === 'demo';

    const [registros, setRegistros] = useState<RegistroLluvia[]>([]);
    const [ubicacionFinca, setUbicacionFinca] = useState<string | null>(null);
    const [municipioFinca, setMunicipioFinca] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [tabGrafica, setTabGrafica] = useState<string>(TAB_MENSUAL);

    // Formulario
    const [fecha, setFecha] = useState(getLocalIsoDate());
    const [lecturaAcumulada, setLecturaAcumulada] = useState('');
    const [notas, setNotas] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Tabla agrupada
    const [anoSeleccionado, setAnoSeleccionado] = useState<number>(new Date().getFullYear());
    const [mesGroups, setMesGroups] = useState<MesGroup[]>([]);

    // ── Región climática ──────────────────────────────────────────────
    const perfil = useMemo(() => detectarRegionClimatica(ubicacionFinca), [ubicacionFinca]);

    // ── KPIs ──────────────────────────────────────────────────────────
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

        // Días secos consecutivos desde hoy hacia atrás
        const registrosOrdenados = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha));
        let diasSecos = 0;
        let fechaRef = hoy;

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

        // mm últimos 30 días para recomendación
        const hace30 = subDays(hoy, 30);
        const mm30dias = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00') >= hace30)
            .reduce((s, r) => s + r.milimetros, 0);

        // Lluvia de hoy
        const fechaHoyStr = format(hoy, 'yyyy-MM-dd');
        const registroHoy = registros.find(r => r.fecha === fechaHoyStr);
        const lluviaHoy = registroHoy ? registroHoy.milimetros : 0;

        // Días sin lluvia (mes actual)
        const diasConLluvia = mesActualReg.filter(r => r.milimetros > 0).length;
        const diasTranscurridos = hoy.getDate();
        const diasSecosMes = Math.max(0, diasTranscurridos - diasConLluvia);

        return {
            mmMesActual: parseFloat(mmMesActual.toFixed(1)),
            mmMesAnterior: parseFloat(mmMesAnterior.toFixed(1)),
            variacionMes,
            diasEfectivos,
            diasSecos,
            mmAnual: parseFloat(mmAnual.toFixed(1)),
            mm30dias,
            lluviaHoy: parseFloat(lluviaHoy.toFixed(1)),
            diasSecosMes,
            diasTranscurridos
        };
    }, [registros, perfil]);

    // ── Datos para gráficas ───────────────────────────────────────────
    const dataMensual = useMemo(() => {
        const map: Record<string, number> = {};
        registros
            .filter(r => parseISO(r.fecha + 'T12:00:00').getFullYear() === anoSeleccionado)
            .forEach(r => {
                const mes = r.fecha.substring(0, 7);
                map[mes] = (map[mes] || 0) + r.milimetros;
            });
        return Object.keys(map).sort().map(k => ({
            name: format(parseISO(k + '-15'), 'MMM', { locale: es }),
            mm: parseFloat(map[k].toFixed(1)),
        }));
    }, [registros, anoSeleccionado]);

    const dataDiaria = useMemo(() => {
        const hoy = new Date();
        const hace30 = subDays(hoy, 30);
        return registros
            .filter(r => {
                const d = parseISO(r.fecha + 'T12:00:00');
                return d >= hace30 && d <= hoy;
            })
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map(r => ({
                name: format(parseISO(r.fecha + 'T12:00:00'), 'dd/MM', { locale: es }),
                mm: r.milimetros,
            }));
    }, [registros]);

    const dataYoY = useMemo(() => {
        const anoActual = new Date().getFullYear();
        const anoAnterior = anoActual - 1;
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return meses.map((m, idx) => {
            const actual = registros
                .filter(r => {
                    const d = parseISO(r.fecha + 'T12:00:00');
                    return d.getFullYear() === anoActual && d.getMonth() === idx;
                })
                .reduce((s, r) => s + r.milimetros, 0);
            const anterior = registros
                .filter(r => {
                    const d = parseISO(r.fecha + 'T12:00:00');
                    return d.getFullYear() === anoAnterior && d.getMonth() === idx;
                })
                .reduce((s, r) => s + r.milimetros, 0);
            return { name: m, [anoActual]: parseFloat(actual.toFixed(1)), [anoAnterior]: parseFloat(anterior.toFixed(1)) };
        });
    }, [registros]);

    // ── Tabla agrupada por mes ────────────────────────────────────────
    useEffect(() => {
        const filtrados = registros.filter(
            r => parseISO(r.fecha + 'T12:00:00').getFullYear() === anoSeleccionado
        );
        const map: Record<string, RegistroLluvia[]> = {};
        filtrados.forEach(r => {
            const key = r.fecha.substring(0, 7);
            if (!map[key]) map[key] = [];
            map[key].push(r);
        });
        const grupos: MesGroup[] = Object.keys(map)
            .sort((a, b) => b.localeCompare(a))
            .map(key => ({
                key,
                label: format(parseISO(key + '-15'), 'MMMM yyyy', { locale: es }),
                totalMm: parseFloat(map[key].reduce((s, r) => s + r.milimetros, 0).toFixed(1)),
                registros: map[key].sort((a, b) => b.fecha.localeCompare(a.fecha)),
                open: key === new Date().toISOString().substring(0, 7),
            }));
        setMesGroups(grupos);
    }, [registros, anoSeleccionado]);

    const toggleMes = (key: string) => {
        setMesGroups(prev => prev.map(g => g.key === key ? { ...g, open: !g.open } : g));
    };

    // ── Fetch ─────────────────────────────────────────────────────────
    useEffect(() => { fetchTodo(); }, [fincaId]);

    const fetchTodo = async () => {
        if (!fincaId) return;
        setLoading(true);
        try {
            const [lluviasRes, fincaRes] = await Promise.all([
                supabase
                    .from('registros_lluvia')
                    .select('*')
                    .eq('id_finca', fincaId)
                    .order('fecha', { ascending: false }),
                supabase
                    .from('fincas')
                    .select('ubicacion, municipio')
                    .eq('id', fincaId)
                    .single(),
            ]);
            if (lluviasRes.error) throw lluviasRes.error;
            setRegistros(lluviasRes.data || []);
            setUbicacionFinca(fincaRes.data?.ubicacion || null);
            setMunicipioFinca(fincaRes.data?.municipio || null);
        } catch (err: any) {
            console.error('Error fetching rainfall:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleGuardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !lecturaAcumulada) return;
        setSaving(true);
        setError('');
        try {
            const nuevaLectura = parseFloat(lecturaAcumulada);
            const registrosAnteriores = registros.filter(r => new Date(r.fecha) < new Date(fecha));
            const ultimoRegistro = registrosAnteriores[0];
            let lecturaAnterior = 764.4;
            if (ultimoRegistro && ultimoRegistro.lectura_acumulada) {
                lecturaAnterior = ultimoRegistro.lectura_acumulada;
            }
            const milimetrosDia = nuevaLectura - lecturaAnterior;
            if (milimetrosDia < 0) {
                throw new Error(`La lectura (${nuevaLectura}) no puede ser menor a la lectura anterior (${lecturaAnterior}).`);
            }
            const { error: insertErr } = await supabase
                .from('registros_lluvia')
                .insert({
                    id_finca: fincaId,
                    fecha,
                    lectura_acumulada: nuevaLectura,
                    milimetros: parseFloat(milimetrosDia.toFixed(1)),
                    notas: notas.trim() || null,
                });
            if (insertErr) throw insertErr;
            setShowModal(false);
            setLecturaAcumulada('');
            setNotas('');
            fetchTodo();
        } catch (err: any) {
            setError(err.message || 'Error al guardar el registro');
        } finally {
            setSaving(false);
        }
    };

    const handleEliminar = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este registro?')) return;
        try {
            const { error } = await supabase.from('registros_lluvia').delete().eq('id', id);
            if (error) throw error;
            fetchTodo();
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        }
    };

    // ── Años disponibles ──────────────────────────────────────────────
    const anosDisponibles = useMemo(() => {
        const set = new Set(registros.map(r => parseISO(r.fecha + 'T12:00:00').getFullYear()));
        return Array.from(set).sort((a, b) => b - a);
    }, [registros]);

    // ── Recomendación ─────────────────────────────────────────────────
    const recomendacion = useMemo(() => {
        if (!kpis) return null;
        return generarRecomendacion(perfil, kpis.diasSecos, kpis.mm30dias);
    }, [perfil, kpis]);

    const colorSemaforoSecos = (dias: number) => {
        if (dias >= perfil.diasSecosAlerta) return '#f44336';
        if (dias >= perfil.diasSecosAlerta * 0.6) return '#ff9800';
        return '#4caf50';
    };

    const tooltipStyle = {
        backgroundColor: '#1e1e1e',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color: 'white',
    };

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div className="page-container">
            {/* ── HEADER ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <CloudRain size={32} color="var(--primary-light)" />
                        Pluviometría
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '6px', marginBottom: '10px' }}>
                        Control de pluviosidad diaria por finca (mm)
                    </p>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '6px 14px', borderRadius: '20px',
                        background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)',
                        fontSize: '0.8rem', color: '#7dd3fc',
                    }}>
                        <span>{perfil.emoji}</span>
                        <span style={{ fontWeight: 600 }}>{municipioFinca ? `${municipioFinca} (${perfil.zona})` : perfil.zona}</span>
                        <span style={{ color: 'rgba(125,211,252,0.6)' }}>•</span>
                        <span>Lluvia efectiva ≥ {perfil.umbralEfectivoMm} mm</span>
                        {!ubicacionFinca && (
                            <span style={{ color: '#ff9800', marginLeft: '4px' }}>· <a href="/configuracion" onClick={e => { e.preventDefault(); navigate('/configuracion'); }} style={{ color: '#ffb74d', textDecoration: 'none' }}>Configura tu ubicación</a></span>
                        )}
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', width: 'auto' }}
                    onClick={() => setShowModal(true)}
                >
                    <Plus size={20} />
                    Nuevo Registro
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <CloudRain size={40} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p>Cargando registros...</p>
                </div>
            ) : registros.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                    <Droplets size={48} style={{ marginBottom: '16px', opacity: 0.3, color: 'var(--primary-light)' }} />
                    <p style={{ color: 'var(--text-muted)' }}>No hay registros de lluvia para esta finca.</p>
                    <button className="btn btn-primary" style={{ marginTop: '20px', width: 'auto', padding: '12px 28px' }} onClick={() => setShowModal(true)}>
                        Registrar Primera Lluvia
                    </button>
                </div>
            ) : (
                <>
                    {/* ── KPI CARDS ── */}
                    {kpis && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                            {/* 1. Lluvia de Hoy */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #38bdf8, #0ea5e9)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Lluvia de Hoy</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: '#38bdf8', margin: '6px 0 4px' }}>{kpis.lluviaHoy}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> mm</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {format(new Date(), "dd 'de' MMMM", { locale: es })}
                                        </span>
                                    </div>
                                    <Droplets size={28} style={{ color: '#38bdf8', opacity: 0.5 }} />
                                </div>
                            </div>

                            {/* 2. Lluvia Mes Actual */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Lluvia Mes Actual</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: '#60a5fa', margin: '6px 0 4px' }}>{kpis.mmMesActual}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> mm</span></p>
                                        {kpis.variacionMes !== null && (
                                            <span style={{ fontSize: '0.8rem', color: kpis.variacionMes >= 0 ? '#4caf50' : '#f44336' }}>
                                                {kpis.variacionMes >= 0 ? '▲' : '▼'} {Math.abs(kpis.variacionMes)}% vs mes anterior
                                            </span>
                                        )}
                                    </div>
                                    <CloudRain size={28} style={{ color: '#60a5fa', opacity: 0.5 }} />
                                </div>
                            </div>

                            {/* 3. Acumulado Anual */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #a855f7, #c084fc)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Acumulado Anual</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: '#c084fc', margin: '6px 0 4px' }}>{kpis.mmAnual.toLocaleString('es-CO')}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> mm</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ref. zona: ~{perfil.mmAnualReferencia.toLocaleString('es-CO')} mm/año</span>
                                    </div>
                                    <TrendingUp size={28} style={{ color: '#c084fc', opacity: 0.5 }} />
                                </div>
                            </div>

                            {/* 4. Días Lluvia Efectiva */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #4caf50, #60ad5e)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Días Lluvia Efectiva</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: '#4caf50', margin: '6px 0 4px' }}>{kpis.diasEfectivos}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> días</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>≥ {perfil.umbralEfectivoMm} mm este mes</span>
                                    </div>
                                    <CloudRain size={28} style={{ color: '#4caf50', opacity: 0.5 }} />
                                </div>
                            </div>

                            {/* 5. Racha Seca */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${colorSemaforoSecos(kpis.diasSecos)}, ${colorSemaforoSecos(kpis.diasSecos)}88)` }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Racha Seca</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: colorSemaforoSecos(kpis.diasSecos), margin: '6px 0 4px' }}>{kpis.diasSecos}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> días</span></p>
                                        <span style={{ fontSize: '0.8rem', color: kpis.diasSecos >= perfil.diasSecosAlerta ? '#f44336' : 'var(--text-muted)' }}>
                                            {kpis.diasSecos >= perfil.diasSecosAlerta ? `⚠️ Alerta: supera ${perfil.diasSecosAlerta} días` : `Alerta en ${perfil.diasSecosAlerta} días`}
                                        </span>
                                    </div>
                                    {kpis.diasSecos >= perfil.diasSecosAlerta
                                        ? <AlertTriangle size={28} style={{ color: '#f44336', opacity: 0.7 }} />
                                        : <Sun size={28} style={{ color: '#ff9800', opacity: 0.5 }} />}
                                </div>
                            </div>

                            {/* 6. Días sin Lluvia (Mes) */}
                            <div className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #f59e0b, #d97706)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Días sin Lluvia (Mes)</p>
                                        <p style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b', margin: '6px 0 4px' }}>{kpis.diasSecosMes}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}> días</span></p>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            De {kpis.diasTranscurridos} días transcurridos
                                        </span>
                                    </div>
                                    <Calendar size={28} style={{ color: '#f59e0b', opacity: 0.5 }} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── GRÁFICAS ── */}
                    <div className="card" style={{ padding: '24px', marginBottom: '28px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BarChart2 size={20} color="var(--primary-light)" />
                                Análisis de Precipitación
                            </h3>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { id: TAB_MENSUAL, label: 'Mensual' },
                                    { id: TAB_DIARIA, label: 'Últimos 30 días' },
                                    { id: TAB_YOY, label: 'Año vs Año' },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setTabGrafica(tab.id)}
                                        style={{
                                            padding: '6px 16px', fontSize: '0.85rem', width: 'auto',
                                            background: tabGrafica === tab.id ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${tabGrafica === tab.id ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                            color: tabGrafica === tab.id ? '#7dd3fc' : 'var(--text-muted)',
                                            borderRadius: '8px', textTransform: 'none', letterSpacing: 0, fontWeight: tabGrafica === tab.id ? 600 : 400,
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                                {tabGrafica !== TAB_YOY && (
                                    <select
                                        value={anoSeleccionado}
                                        onChange={e => setAnoSeleccionado(Number(e.target.value))}
                                        style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', marginBottom: 0 }}
                                    >
                                        {anosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                )}
                            </div>
                        </div>

                        {tabGrafica === TAB_MENSUAL && (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={dataMensual} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="name" tick={{ fill: '#aaa', fontSize: 12 }} />
                                    <YAxis tick={{ fill: '#aaa', fontSize: 12 }} unit=" mm" />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`${v ?? 0} mm`, 'Lluvia']} />
                                    <Bar dataKey="mm" name="Lluvia (mm)" radius={[4, 4, 0, 0]}
                                        fill="url(#barGradient)" />
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.9} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.6} />
                                        </linearGradient>
                                    </defs>
                                </BarChart>
                            </ResponsiveContainer>
                        )}

                        {tabGrafica === TAB_DIARIA && (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={dataDiaria} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="name" tick={{ fill: '#aaa', fontSize: 10 }} interval="preserveStartEnd" />
                                    <YAxis tick={{ fill: '#aaa', fontSize: 12 }} unit=" mm" />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`${v ?? 0} mm`, 'Lluvia']} />
                                    <ReferenceLine y={perfil.umbralEfectivoMm} stroke="#4caf50" strokeDasharray="4 4"
                                        label={{ value: `Efectiva (${perfil.umbralEfectivoMm}mm)`, fill: '#4caf50', fontSize: 11 }} />
                                    <Bar dataKey="mm" name="Lluvia (mm)" radius={[3, 3, 0, 0]} fill="#60a5fa" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}

                        {tabGrafica === TAB_YOY && (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={dataYoY} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="name" tick={{ fill: '#aaa', fontSize: 12 }} />
                                    <YAxis tick={{ fill: '#aaa', fontSize: 12 }} unit=" mm" />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Legend wrapperStyle={{ color: '#aaa', fontSize: '0.85rem' }} />
                                    <Line type="monotone" dataKey={String(new Date().getFullYear())} stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3 }} />
                                    <Line type="monotone" dataKey={String(new Date().getFullYear() - 1)} stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#a855f7', r: 3 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* ── ASISTENTE ZOOTÉCNICO ── */}
                    {esDemo ? (
                        <div style={{
                            borderRadius: '12px', marginBottom: '28px', overflow: 'hidden',
                            background: 'rgba(30,30,30,0.7)', backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                            <div style={{
                                padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                textAlign: 'center', gap: '12px',
                                background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(96,165,250,0.08) 100%)',
                            }}>
                                <div style={{ padding: '14px', borderRadius: '50%', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
                                    <Lock size={28} color="#c084fc" />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>Asistente Zootécnico IA</h3>
                                <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: '420px', lineHeight: 1.6 }}>
                                    Recomendaciones de manejo de pasturas y carga animal personalizadas para la <strong style={{ color: '#c084fc' }}>zona {perfil.zona}</strong>, disponibles en los planes <strong>Finca</strong> y <strong>Premium</strong>.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: 'auto', padding: '10px 28px', marginTop: '4px', background: 'linear-gradient(135deg, #a855f7, #60a5fa)' }}
                                    onClick={() => navigate('/suscripcion')}
                                >
                                    Ver Planes
                                </button>
                            </div>
                        </div>
                    ) : recomendacion && (
                        <div style={{
                            borderRadius: '12px', marginBottom: '28px', padding: '20px 24px',
                            background: recomendacion.tipo === 'estres'
                                ? 'rgba(244,67,54,0.08)'
                                : recomendacion.tipo === 'exceso'
                                    ? 'rgba(255,152,0,0.08)'
                                    : recomendacion.tipo === 'transicion'
                                        ? 'rgba(255,179,0,0.08)'
                                        : 'rgba(76,175,80,0.08)',
                            border: `1px solid ${recomendacion.tipo === 'estres' ? 'rgba(244,67,54,0.25)' : recomendacion.tipo === 'exceso' ? 'rgba(255,152,0,0.25)' : recomendacion.tipo === 'transicion' ? 'rgba(255,179,0,0.25)' : 'rgba(76,175,80,0.25)'}`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                                <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                                    {recomendacion.tipo === 'estres' ? '⚠️' : recomendacion.tipo === 'exceso' ? '🌊' : recomendacion.tipo === 'transicion' ? '🌤️' : '✅'}
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'white', fontSize: '0.95rem' }}>
                                        Asistente Zootécnico – {perfil.emoji} {perfil.zona}
                                    </p>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '0.92rem' }}>
                                        {recomendacion.mensaje}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── TABLA AGRUPADA POR MES ── */}
                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        {/* Controles de la tabla */}
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Calendar size={18} color="var(--primary-light)" />
                                Historial de Registros
                            </h3>
                            <select
                                value={anoSeleccionado}
                                onChange={e => setAnoSeleccionado(Number(e.target.value))}
                                style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', marginBottom: 0 }}
                            >
                                {anosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>

                        {mesGroups.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No hay registros para el año {anoSeleccionado}.
                            </div>
                        ) : (
                            mesGroups.map(grupo => (
                                <div key={grupo.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    {/* Cabecera del mes */}
                                    <button
                                        onClick={() => toggleMes(grupo.key)}
                                        style={{
                                            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '14px 24px', background: 'rgba(255,255,255,0.02)',
                                            border: 'none', borderRadius: 0, color: 'white',
                                            fontSize: '0.9rem', letterSpacing: 0, textTransform: 'none', fontWeight: 500,
                                            cursor: 'pointer', transition: 'background 0.2s',
                                        }}
                                        onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'}
                                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{grupo.label}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{grupo.registros.length} registros</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontWeight: 700, color: '#60a5fa' }}>{grupo.totalMm} mm</span>
                                            {grupo.open ? <ChevronUp size={16} color="#aaa" /> : <ChevronDown size={16} color="#aaa" />}
                                        </div>
                                    </button>

                                    {/* Registros del mes */}
                                    {grupo.open && (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                                        {['Fecha', 'Lectura Pluviómetro', 'Lluvia Neta', 'Intensidad', 'Notas', ''].map(h => (
                                                            <th key={h} style={{ padding: '10px 20px', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap' }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {grupo.registros.map(r => {
                                                        const intensidad = clasificarIntensidad(r.milimetros, perfil.umbralEfectivoMm);
                                                        return (
                                                            <tr key={r.id}
                                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}
                                                                onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.015)'}
                                                                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            >
                                                                <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <Calendar size={14} color="var(--primary-light)" />
                                                                        <span style={{ fontWeight: 500 }}>
                                                                            {format(parseISO(r.fecha + 'T12:00:00'), 'dd MMM', { locale: es })}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                                                                    {r.lectura_acumulada ? `${r.lectura_acumulada} mm` : '—'}
                                                                </td>
                                                                <td style={{ padding: '14px 20px' }}>
                                                                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#60a5fa' }}>
                                                                        {r.milimetros > 0 ? '+' : ''}{r.milimetros}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>mm</span>
                                                                </td>
                                                                <td style={{ padding: '14px 20px' }}>
                                                                    <span style={{
                                                                        padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
                                                                        background: intensidad.bg, border: `1px solid ${intensidad.border}`, color: intensidad.text,
                                                                        whiteSpace: 'nowrap',
                                                                    }}>
                                                                        {intensidad.emoji} {intensidad.label}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '14px 20px', color: 'var(--text-muted)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.88rem' }}>
                                                                    {r.notas ? `"${r.notas}"` : '—'}
                                                                </td>
                                                                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                                                    <button
                                                                        onClick={() => handleEliminar(r.id)}
                                                                        style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', opacity: 0.6, padding: '4px', width: 'auto' }}
                                                                        title="Eliminar registro"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {/* ── MODAL REGISTRO ── */}
            {showModal && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '450px', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <CloudRain size={22} color="var(--primary-light)" />
                                Registrar Lluvia Diaria
                            </h2>
                            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', width: 'auto', padding: '4px 8px', fontSize: '1.2rem' }} onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleGuardar}>
                            <div style={{ marginBottom: '18px' }}>
                                <label>Fecha</label>
                                <input type="date" className="input-field" value={fecha} onChange={e => setFecha(e.target.value)} required />
                            </div>
                            <div style={{ marginBottom: '18px' }}>
                                <label>Lectura del Pluviómetro Acumulada (mm)</label>
                                <input
                                    type="number" step="0.1" className="input-field"
                                    placeholder="Ej: 1520.5"
                                    value={lecturaAcumulada}
                                    onChange={e => setLecturaAcumulada(e.target.value)}
                                    required
                                />
                            </div>
                            <div style={{ marginBottom: '24px' }}>
                                <label>Notas (Opcional)</label>
                                <textarea
                                    className="input-field"
                                    placeholder="Ej: Llovió toda la tarde"
                                    value={notas}
                                    onChange={e => setNotas(e.target.value)}
                                    rows={3}
                                    style={{ resize: 'none', marginBottom: 0 }}
                                />
                            </div>
                            {error && <p style={{ color: 'var(--error)', marginBottom: '16px', fontSize: '0.9rem', background: 'rgba(244,67,54,0.1)', padding: '10px', borderRadius: '8px' }}>{error}</p>}
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
