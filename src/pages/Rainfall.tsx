
import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import {
    CloudRain, Plus, Trash2, Calendar, Droplets,
    ChevronDown, ChevronUp, Lock, TrendingUp, Sun, AlertTriangle, BarChart2, RefreshCw, Pencil, CheckCircle2
} from 'lucide-react';
import { format, subDays, parseISO, differenceInDays, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, ReferenceLine, Legend
} from 'recharts';
import { detectarRegionClimatica, generarRecomendacion } from '../utils/climateRegions';
import { getLocalIsoDate } from '../utils/dateUtils';
import {
    type DiagnosticoClimatico,
    obtenerUltimoAnalisisClimatico,
    generarYGuardarAnalisisClimatico,
    leerCacheLocal,
} from '../services/climateAiService';
import {
    type PluviometroFinca,
    type RegistroLluviaRaw,
    type RegistroLluviaConsolidado,
    consolidarLluviasPorFecha,
    calcularMilimetrosRegistro,
    obtenerUltimaLecturaAcumulada,
} from '../utils/rainfallUtils';

type RegistroLluvia = RegistroLluviaConsolidado;

interface MesGroup {
    key: string; // 'YYYY-MM'
    label: string;
    totalMm: number;
    registros: RegistroLluvia[];
    open: boolean;
}

const COLORES_INTENSIDAD = {
    fuerte:   { bg: 'var(--info-soft-bg)',    border: 'var(--info-soft-border)', text: 'var(--info)',           label: 'Fuerte',            emoji: '🌊' },
    moderada: { bg: 'var(--primary-soft-bg)', border: 'var(--primary-soft-border)', text: 'var(--primary-light)', label: 'Moderada (Efectiva)', emoji: '🔵' },
    leve:     { bg: 'var(--surface-subtle)',  border: 'var(--border-subtle)',    text: 'var(--text-secondary)', label: 'Leve',               emoji: '💧' },
    trazas:   { bg: 'var(--surface-inset)',   border: 'var(--border-subtle)',    text: 'var(--text-muted)',     label: 'Trazas',             emoji: '·' },
};

// Clasifica la intensidad de un registro de lluvia en 4 niveles:
//   trazas   → < umbralRegistroMm (< 1.0 mm): margen de error del pluviómetro, no cuenta como lluvia
//   leve     → ≥ umbralRegistroMm y < umbralEfectivoMm: lluvia real pero no recarga el forraje
//   moderada → ≥ umbralEfectivoMm: lluvia efectiva para el rebrote
//   fuerte   → ≥ umbralEfectivoMm × 4: lluvia intensa
function clasificarIntensidad(mm: number, umbralRegistro: number, umbralEfectivo: number) {
    if (mm < umbralRegistro)    return COLORES_INTENSIDAD.trazas;
    if (mm >= umbralEfectivo * 4) return COLORES_INTENSIDAD.fuerte;
    if (mm >= umbralEfectivo)   return COLORES_INTENSIDAD.moderada;
    return COLORES_INTENSIDAD.leve;
}

const TAB_MENSUAL = 'mensual';
const TAB_DIARIA = 'diaria';
const TAB_YOY = 'yoy';

export default function Rainfall() {
    const { fincaId, role, licenciaInfo } = useAuth();
    const { theme } = useTheme();
    const accentPurple = theme === 'light' ? '#7c3aed' : '#c084fc';
    const navigate = useNavigate();
    const esDemo = licenciaInfo?.licencia === 'demo';
    const isAdminOrCowboy = role === 'administrador' || role === 'vaquero';

    const [registrosRaw, setRegistrosRaw] = useState<RegistroLluviaRaw[]>([]);
    const [pluviometros, setPluviometros] = useState<PluviometroFinca[]>([]);
    const [filtroPluviometro, setFiltroPluviometro] = useState<string>('todos');
    const [ubicacionFinca, setUbicacionFinca] = useState<string | null>(null);
    const [municipioFinca, setMunicipioFinca] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [tabGrafica, setTabGrafica] = useState<string>(TAB_MENSUAL);

    // ── Diagnóstico IA climático ───────────────────────────────────────
    const [diagnosticoIA, setDiagnosticoIA] = useState<DiagnosticoClimatico | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    // Formulario
    const [fecha, setFecha] = useState(getLocalIsoDate());
    const [modoEntrada, setModoEntrada] = useState<'diaria' | 'acumulada'>('diaria');
    const [valorEntrada, setValorEntrada] = useState('');
    const [reiniciarLegacy, setReiniciarLegacy] = useState(false);
    // Entradas por pluviómetro (cuando la finca tiene ≥1 pluviómetro configurado)
    const [valoresPorPluv, setValoresPorPluv] = useState<Record<string, string>>({});
    const [editandoPluv, setEditandoPluv] = useState<Record<string, boolean>>({});
    const [reiniciarPorPluv, setReiniciarPorPluv] = useState<Record<string, boolean>>({});
    const [notas, setNotas] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Tabla agrupada
    const [anoSeleccionado, setAnoSeleccionado] = useState<number>(new Date().getFullYear());
    const [mesGroups, setMesGroups] = useState<MesGroup[]>([]);

    // ── Pluviómetros activos & consolidación ──────────────────────────
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

        // ── Racha seca (días consecutivos sin lluvia EFECTIVA) ────────────────
        // Solo se reinicia con lluvias >= umbralEfectivoMm. Lluvias leves o
        // trazas (< umbralEfectivoMm) no recargan el forraje y no resetean la racha.
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

        // mm últimos 30 días para recomendación (incluye lluvias leves, excluye trazas)
        const hace30 = subDays(hoy, 30);
        const mm30dias = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00') >= hace30 && r.milimetros >= perfil.umbralRegistroMm)
            .reduce((s, r) => s + r.milimetros, 0);

        // mm últimos 15 días – Balance Hídrico Quincenal (BH15)
        const hace15 = subDays(hoy, 15);
        const mm15dias = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00') >= hace15 && r.milimetros >= perfil.umbralRegistroMm)
            .reduce((s, r) => s + r.milimetros, 0);

        // mm últimos 7 días – ventana crítica de exceso hídrico a corto plazo
        // (choque concentrado: anoxia radicular + daño por pisoteo)
        const hace7 = subDays(hoy, 7);
        const mm7dias = registros
            .filter(r => parseISO(r.fecha + 'T12:00:00') >= hace7 && r.milimetros >= perfil.umbralRegistroMm)
            .reduce((s, r) => s + r.milimetros, 0);

        // Lluvia de hoy
        const fechaHoyStr = format(hoy, 'yyyy-MM-dd');
        const registroHoy = registros.find(r => r.fecha === fechaHoyStr);
        const lluviaHoy = registroHoy ? registroHoy.milimetros : 0;

        // ── Días sin lluvia en el mes ─────────────────────────────────────────
        // Usa umbralRegistroMm (≥ 1.0 mm según norma OMM) para distinguir
        // lluvia real de trazas / margen de error del pluviómetro.
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

    const openRegistroModal = (fechaInicial?: string) => {
        setFecha(fechaInicial || getLocalIsoDate());
        setValorEntrada('');
        setReiniciarLegacy(false);
        setValoresPorPluv({});
        setEditandoPluv({});
        setReiniciarPorPluv({});
        setNotas('');
        setError('');
        setShowModal(true);
    };

    const handleChangeFechaModal = (nuevaFecha: string) => {
        setFecha(nuevaFecha);
        setValoresPorPluv({});
        setEditandoPluv({});
        setReiniciarPorPluv({});
        setError('');
    };

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
                // Cargar último diagnóstico persistido desde Supabase
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
            // Preferir diagnóstico de Supabase sobre caché local
            if (diagRes) {
                setDiagnosticoIA(diagRes);
            } else if (regs.length > 0 && !cacheLocal) {
                // Sin diagnóstico previo: generar uno de arranque
                dispararAnalisisIA(regs, ubicacion, municipio);
            }
        } catch (err: any) {
            console.error('Error fetching rainfall:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleGuardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;
        setSaving(true);
        setError('');
        try {
            const notasFinal = notas.trim() || null;

            if (pluviometrosActivos.length === 0) {
                if (!valorEntrada) {
                    throw new Error('Ingresa la lectura de lluvia.');
                }
                const valorNum = parseFloat(valorEntrada);
                const calc = calcularMilimetrosRegistro({
                    modo: modoEntrada,
                    valorNum,
                    fecha,
                    registros: registrosRaw,
                    idPluviometro: null,
                    reiniciarContador: reiniciarLegacy,
                });

                const { error: insertErr } = await supabase
                    .from('registros_lluvia')
                    .insert({
                        id_finca: fincaId,
                        fecha,
                        lectura_acumulada: calc.lectura_acumulada,
                        milimetros: calc.milimetros,
                        tipo_medicion: calc.tipo_medicion,
                        notas: notasFinal,
                    });
                if (insertErr) throw insertErr;
            } else {
                const inserts: any[] = [];
                const updates: { id: string; payload: any }[] = [];

                for (const pluv of pluviometrosActivos) {
                    const existente = registrosRaw.find(
                        r => String(r.fecha).split('T')[0] === fecha && r.id_pluviometro === pluv.id
                    );
                    const enEdicion = Boolean(editandoPluv[pluv.id]);
                    if (existente && !enEdicion) continue;

                    const valStr = (valoresPorPluv[pluv.id] || '').trim();
                    if (!valStr) continue;

                    const valorNum = parseFloat(valStr);
                    const calc = calcularMilimetrosRegistro({
                        modo: pluv.tipo_medicion,
                        valorNum,
                        fecha,
                        registros: registrosRaw,
                        idPluviometro: pluv.id,
                        excluirId: existente?.id ?? null,
                        reiniciarContador: Boolean(reiniciarPorPluv[pluv.id]),
                    });

                    if (existente?.id) {
                        updates.push({
                            id: existente.id,
                            payload: {
                                lectura_acumulada: calc.lectura_acumulada,
                                milimetros: calc.milimetros,
                                tipo_medicion: calc.tipo_medicion,
                                ...(notasFinal !== null ? { notas: notasFinal } : {}),
                            },
                        });
                    } else {
                        inserts.push({
                            id_finca: fincaId,
                            id_pluviometro: pluv.id,
                            fecha,
                            lectura_acumulada: calc.lectura_acumulada,
                            milimetros: calc.milimetros,
                            tipo_medicion: calc.tipo_medicion,
                            notas: notasFinal,
                        });
                    }
                }

                if (inserts.length === 0 && updates.length === 0) {
                    throw new Error('Ingresa al menos una lectura para guardar.');
                }

                if (inserts.length > 0) {
                    const { error: insertErr } = await supabase
                        .from('registros_lluvia')
                        .insert(inserts);
                    if (insertErr) throw insertErr;
                }

                for (const upd of updates) {
                    const { error: updErr } = await supabase
                        .from('registros_lluvia')
                        .update(upd.payload)
                        .eq('id', upd.id);
                    if (updErr) throw updErr;
                }
            }

            setShowModal(false);
            setValorEntrada('');
            setValoresPorPluv({});
            setEditandoPluv({});
            setReiniciarPorPluv({});
            setReiniciarLegacy(false);
            setNotas('');

            await fetchTodo();
            const regsActualizados = await supabase
                .from('registros_lluvia')
                .select('fecha, milimetros, id_pluviometro')
                .eq('id_finca', fincaId)
                .order('fecha', { ascending: false });
            if (regsActualizados.data) {
                dispararAnalisisIA(regsActualizados.data as any, ubicacionFinca, municipioFinca);
            }
        } catch (err: any) {
            setError(err.message || 'Error al guardar el registro');
        } finally {
            setSaving(false);
        }
    };

    const handleEliminar = async (id: string, nombreEstacion?: string) => {
        const msg = nombreEstacion
            ? `¿Estás seguro de eliminar el registro de "${nombreEstacion}"?`
            : '¿Estás seguro de eliminar este registro?';
        if (!confirm(msg)) return;
        try {
            const { error } = await supabase.from('registros_lluvia').delete().eq('id', id);
            if (error) throw error;
            await fetchTodo();
            // Disparar análisis IA actualizado tras eliminar
            const regsActualizados = await supabase
                .from('registros_lluvia')
                .select('fecha, milimetros, id_pluviometro')
                .eq('id_finca', fincaId)
                .order('fecha', { ascending: false });
            if (regsActualizados.data) {
                dispararAnalisisIA(regsActualizados.data as any, ubicacionFinca, municipioFinca);
            }
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        }
    };

    // ── Años disponibles ──────────────────────────────────────────────
    const anosDisponibles = useMemo(() => {
        const set = new Set(registros.map(r => parseISO(r.fecha + 'T12:00:00').getFullYear()));
        return Array.from(set).sort((a, b) => b - a);
    }, [registros]);

    // ── Recomendación (motor local calibrado con BH15) ─────────────────
    const recomendacion = useMemo(() => {
        if (!kpis) return null;
        return generarRecomendacion(perfil, kpis.diasSecos, kpis.mm30dias, kpis.mm7dias, kpis.mm15dias);
    }, [perfil, kpis]);

    // ── Disparo asíncrono del análisis IA ─────────────────────────────
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

    const colorSemaforoSecos = (dias: number) => {
        if (dias >= perfil.diasSecosAlerta) return 'var(--error)';
        if (dias >= perfil.diasSecosAlerta * 0.6) return 'var(--warning)';
        return 'var(--success)';
    };

    const tooltipStyle = {
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: '8px',
        color: 'var(--text-main)',
        boxShadow: 'var(--shadow-popover)',
    };

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div className="page-container">
            <style>{`
                .rainfall-kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 16px;
                    margin-bottom: 28px;
                }
                @media (max-width: 1024px) {
                    .rainfall-kpi-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                @media (max-width: 640px) {
                    .rainfall-kpi-grid {
                        grid-template-columns: 1fr;
                    }
                }
                @keyframes spin {
                    0%   { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
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
                        background: 'var(--info-soft-bg)', border: '1px solid var(--info-soft-border)',
                        fontSize: '0.8rem', color: 'var(--info)',
                    }}>
                        <span>{perfil.emoji}</span>
                        <span style={{ fontWeight: 600 }}>{municipioFinca ? `${municipioFinca} (${perfil.zona})` : perfil.zona}</span>
                        <span style={{ opacity: 0.6 }}>•</span>
                        <span>Lluvia efectiva ≥ {perfil.umbralEfectivoMm} mm</span>
                        {!ubicacionFinca && (
                            <span style={{ color: 'var(--warning)', marginLeft: '4px' }}>· <a href="/configuracion" onClick={e => { e.preventDefault(); navigate('/configuracion'); }} style={{ color: 'var(--secondary)', textDecoration: 'underline' }}>Configura tu ubicación</a></span>
                        )}
                    </div>
                </div>
                {isAdminOrCowboy && (
                    <button
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', width: 'auto' }}
                        onClick={() => openRegistroModal()}
                    >
                        <Plus size={20} />
                        Nuevo Registro
                    </button>
                )}
            </div>

            {/* Filtro por estación cuando la finca tiene múltiples pluviómetros */}
            {!loading && esMultiPluviometro && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '4px' }}>Vista:</span>
                    <button
                        type="button"
                        onClick={() => setFiltroPluviometro('todos')}
                        style={{
                            width: 'auto',
                            padding: '6px 14px',
                            borderRadius: '20px',
                            fontSize: '0.82rem',
                            textTransform: 'none',
                            letterSpacing: 0,
                            fontWeight: filtroPluviometro === 'todos' ? 700 : 400,
                            background: filtroPluviometro === 'todos' ? 'var(--info-soft-bg)' : 'var(--surface-subtle)',
                            border: `1px solid ${filtroPluviometro === 'todos' ? 'var(--info)' : 'var(--border-subtle)'}`,
                            color: filtroPluviometro === 'todos' ? 'var(--info)' : 'var(--text-muted)',
                            cursor: 'pointer',
                        }}
                    >
                        📊 Promedio Finca ({pluviometrosActivos.length || pluviometros.length})
                    </button>
                    {pluviometros.map(pluv => (
                        <button
                            key={pluv.id}
                            type="button"
                            onClick={() => setFiltroPluviometro(pluv.id)}
                            style={{
                                width: 'auto',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '0.82rem',
                                textTransform: 'none',
                                letterSpacing: 0,
                                fontWeight: filtroPluviometro === pluv.id ? 700 : 400,
                                background: filtroPluviometro === pluv.id ? 'var(--info-soft-bg)' : 'var(--surface-subtle)',
                                border: `1px solid ${filtroPluviometro === pluv.id ? 'var(--info)' : 'var(--border-subtle)'}`,
                                color: filtroPluviometro === pluv.id ? 'var(--info)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                opacity: pluv.activo ? 1 : 0.7,
                            }}
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
                    {/* ── KPI CARDS ── */}
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
                                            background: tabGrafica === tab.id ? 'var(--info-soft-bg)' : 'var(--surface-subtle)',
                                            border: `1px solid ${tabGrafica === tab.id ? 'var(--info)' : 'var(--border-subtle)'}`,
                                            color: tabGrafica === tab.id ? 'var(--info)' : 'var(--text-muted)',
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
                                        style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-main)', marginBottom: 0 }}
                                    >
                                        {anosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                )}
                            </div>
                        </div>

                        {tabGrafica === TAB_MENSUAL && (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={dataMensual} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                    <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} unit=" mm" />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`${v ?? 0} mm`, 'Lluvia']} />
                                    <Bar dataKey="mm" name="Lluvia (mm)" radius={[4, 4, 0, 0]}
                                        fill="url(#barGradient)" />
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={theme === 'light' ? '#0284c7' : '#60a5fa'} stopOpacity={0.95} />
                                            <stop offset="95%" stopColor={theme === 'light' ? '#0369a1' : '#3b82f6'} stopOpacity={0.7} />
                                        </linearGradient>
                                    </defs>
                                </BarChart>
                            </ResponsiveContainer>
                        )}

                        {tabGrafica === TAB_DIARIA && (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={dataDiaria} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                    <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} interval="preserveStartEnd" />
                                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} unit=" mm" />
                                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`${v ?? 0} mm`, 'Lluvia']} />
                                    <ReferenceLine y={perfil.umbralEfectivoMm} stroke="var(--success)" strokeDasharray="4 4"
                                        label={{ value: `Efectiva (${perfil.umbralEfectivoMm}mm)`, fill: 'var(--success)', fontSize: 11 }} />
                                    <Bar dataKey="mm" name="Lluvia (mm)" radius={[3, 3, 0, 0]} fill={theme === 'light' ? '#0284c7' : '#60a5fa'} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}

                        {tabGrafica === TAB_YOY && (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={dataYoY} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                    <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} unit=" mm" />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Legend wrapperStyle={{ color: 'var(--chart-tick)', fontSize: '0.85rem' }} />
                                    <Line type="monotone" dataKey={String(new Date().getFullYear())} stroke={theme === 'light' ? '#0284c7' : '#60a5fa'} strokeWidth={2} dot={{ fill: theme === 'light' ? '#0284c7' : '#60a5fa', r: 3 }} />
                                    <Line type="monotone" dataKey={String(new Date().getFullYear() - 1)} stroke={accentPurple} strokeWidth={2} strokeDasharray="5 5" dot={{ fill: accentPurple, r: 3 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* ── ASISTENTE ZOOTÉCNICO ── */}
                    {esDemo ? (
                        <div style={{
                            borderRadius: '12px', marginBottom: '28px', overflow: 'hidden',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: 'var(--shadow-card)',
                        }}>
                            <div style={{
                                padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                textAlign: 'center', gap: '12px',
                                background: 'var(--surface-subtle)',
                            }}>
                                <div style={{ padding: '14px', borderRadius: '50%', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
                                    <Lock size={28} color={accentPurple} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Asistente Zootécnico IA</h3>
                                <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: '420px', lineHeight: 1.6 }}>
                                    Recomendaciones de manejo de pasturas y carga animal personalizadas para la <strong style={{ color: accentPurple }}>zona {perfil.zona}</strong>, disponibles en los planes <strong>Finca</strong> y <strong>Premium</strong>.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: 'auto', padding: '10px 28px', marginTop: '4px', background: 'linear-gradient(135deg, #9333ea, #0284c7)', color: '#ffffff' }}
                                    onClick={() => navigate('/suscripcion')}
                                >
                                    Ver Planes
                                </button>
                            </div>
                        </div>
                    ) : (() => {
                        // ── Fuente: IA persistida. El texto siempre viene del campo correcto:
                        // Si diag.resumen_diagnostico está vacío (e.g. caché antiguo), cae al mensaje
                        // del motor local que ya es el texto calibrado para el nivel activo.
                        const diag = diagnosticoIA;
                        const recomLocal = recomendacion;  // motor local con BH15

                        const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                            estres:           { bg: 'var(--error-soft-bg)',     border: 'var(--error-soft-border)',     text: 'var(--error)',     badge: 'var(--surface-subtle)' },
                            excesoCritico:    { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)' },
                            preAlerta:        { bg: 'var(--warning-soft-bg)',   border: 'var(--warning-soft-border)',   text: 'var(--warning)',   badge: 'var(--surface-subtle)' },
                            excesoPreventivo: { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)' },
                            oreo:             { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)' },
                            transicion:       { bg: 'var(--secondary-soft-bg)', border: 'var(--secondary-soft-border)', text: 'var(--secondary)', badge: 'var(--surface-subtle)' },
                            optima:           { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)' },
                        };
                        const LABEL_MAP: Record<string, string> = {
                            estres: 'ALERTA ROJA – SEQUÍA', excesoCritico: 'ANEGAMIENTO CRÍTICO',
                            preAlerta: 'PRE-ALERTA SEQUÍA', excesoPreventivo: 'ENCHARCAMIENTO PREVENTIVO',
                            oreo: 'OREO ACTIVO', transicion: 'TRANSICIÓN', optima: 'CONDICIÓN ÓPTIMA',
                        };

                        // El nivel activo viene de IA si existe, si no del motor local (que ya aplica BH15)
                        const nivelActivo = diag?.nivel_alerta ?? recomLocal?.tipo ?? 'optima';
                        const c = COLOR_MAP[nivelActivo] ?? COLOR_MAP.optima;
                        const emojiActivo = diag?.emoji_estado ?? '✅';

                        // REGLA DE ORO: el resumen siempre es el texto que corresponde al nivel activo.
                        // Si el texto de IA o caché habla de 'ideales' u 'óptimas' pero estamos en déficit/preAlerta,
                        // lo descartamos y usamos la recomendación calibrada real de lluvia aislada.
                        let resumen = (diag?.resumen_diagnostico?.trim()) ? diag.resumen_diagnostico : (recomLocal?.mensaje ?? '');
                        if (nivelActivo !== 'optima' && (resumen.toLowerCase().includes('ideales') || resumen.toLowerCase().includes('condición hídrica óptima'))) {
                            resumen = recomLocal?.mensaje ?? perfil.recomendaciones.lluviaAislada;
                        }

                        const impacto = diag?.impacto_pasturas ?? '';
                        const recRotacion = diag?.recomendacion_rotacion ?? '';
                        const recFertilizacion = diag?.recomendacion_fertilizacion ?? '';
                        const recNutricion = diag?.recomendacion_nutricion ?? '';
                        const estadoHidrico = diag?.estado_hidrico
                            ? diag.estado_hidrico
                            : (recomLocal?.lluviaAislada ? 'Lluvia Aislada – Déficit Hídrico Quincenal Activo' : LABEL_MAP[nivelActivo]);
                        const bh15 = diag?.balance_hidrico_15d
                            ?? (kpis ? parseFloat((kpis.mm15dias - 15 * perfil.et0DiariaNumerica).toFixed(1)) : null);
                        const fuenteLabel = diag?.fuente === 'ia' ? '✨ IA' : '⚡ Motor Local';

                        return (
                            <div style={{
                                borderRadius: '12px', marginBottom: '28px',
                                background: c.bg, border: `1px solid ${c.border}`,
                                overflow: 'hidden',
                            }}>
                                {/* Cabecera compacta */}
                                <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: `1px solid ${c.border}` }}>
                                    <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{emojiActivo}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-main)', fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
                                                Asistente Zootécnico – {perfil.emoji} {perfil.zona}
                                            </p>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: c.badge, border: `1px solid ${c.border}`, color: c.text, whiteSpace: 'nowrap' }}>
                                                {LABEL_MAP[nivelActivo]}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{fuenteLabel}</span>
                                        </div>
                                        {bh15 !== null && (
                                            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {estadoHidrico} · Balance 15d: <span style={{ color: bh15 < 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>{bh15 > 0 ? '+' : ''}{bh15.toFixed(1)} mm</span>
                                                {kpis && <> · {kpis.diasSecosMes}/{kpis.diasTranscurridos} días secos</>}
                                            </p>
                                        )}
                                    </div>
                                    {/* Botón reanalizar + error */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                        <button
                                            onClick={() => dispararAnalisisIA(registrosConsolidadosFinca, ubicacionFinca, municipioFinca)}
                                            disabled={analysisLoading}
                                            title="Solicitar análisis completo a la IA"
                                            style={{
                                                background: 'var(--bg-card)', border: `1px solid ${c.border}`,
                                                borderRadius: '8px', padding: '5px 8px', cursor: 'pointer',
                                                color: c.text, display: 'flex', alignItems: 'center', gap: '4px',
                                                fontSize: '0.7rem', opacity: analysisLoading ? 0.5 : 1,
                                                transition: 'opacity 0.2s',
                                            }}
                                        >
                                            <RefreshCw size={11} style={{ animation: analysisLoading ? 'spin 1s linear infinite' : 'none' }} />
                                            {analysisLoading ? 'Analizando…' : 'Reanalizar'}
                                        </button>
                                        {analysisError && (
                                            <span style={{ fontSize: '0.62rem', color: 'var(--error)', maxWidth: '160px', textAlign: 'right', lineHeight: 1.3 }}>
                                                ⚠️ {analysisError}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Resumen e impacto */}
                                <div style={{ padding: '10px 18px 8px' }}>
                                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                                        {resumen}
                                    </p>
                                    {impacto && (
                                        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.4 }}>
                                            {impacto}
                                        </p>
                                    )}
                                </div>

                                {/* Píldoras de acción */}
                                {(recRotacion || recFertilizacion || recNutricion) && (
                                    <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {recRotacion && (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '7px', padding: '7px 10px' }}>
                                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>🌾</span>
                                                <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                                    <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Rotación:</strong> {recRotacion}
                                                </p>
                                            </div>
                                        )}
                                        {recFertilizacion && (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '7px', padding: '7px 10px' }}>
                                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>⛔</span>
                                                <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                                    <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Fertilización:</strong> {recFertilizacion}
                                                </p>
                                            </div>
                                        )}
                                        {recNutricion && (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '7px', padding: '7px 10px' }}>
                                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>🧂</span>
                                                <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                                    <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Nutrición:</strong> {recNutricion}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* ── Fallback: render del motor local cuando no hay diagnóstico IA todavía ── */}
                    {!diagnosticoIA && !esDemo && recomendacion && (() => {
                        // ── Paleta de color por estado (7 estados) ───────────────────────────
                        const colorMap: Record<string, { bg: string; border: string; text: string; badge: string; emoji: string; label: string }> = {
                            estres:           { bg: 'var(--error-soft-bg)',     border: 'var(--error-soft-border)',     text: 'var(--error)',     badge: 'var(--surface-subtle)', emoji: '🔴', label: 'ALERTA ROJA – SEQUÍA' },
                            excesoCritico:    { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)', emoji: '🌊', label: 'ANEGAMIENTO CRÍTICO' },
                            preAlerta:        { bg: 'var(--warning-soft-bg)',   border: 'var(--warning-soft-border)',   text: 'var(--warning)',   badge: 'var(--surface-subtle)', emoji: '🟡', label: 'PRE-ALERTA SEQUÍA' },
                            excesoPreventivo: { bg: 'var(--info-soft-bg)',      border: 'var(--info-soft-border)',      text: 'var(--info)',      badge: 'var(--surface-subtle)', emoji: '💧', label: 'ENCHARCAMIENTO PREVENTIVO' },
                            oreo:             { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)', emoji: '🌾', label: 'OREO ACTIVO – MANEJO TOPOGRÁFICO' },
                            transicion:       { bg: 'var(--secondary-soft-bg)', border: 'var(--secondary-soft-border)', text: 'var(--secondary)', badge: 'var(--surface-subtle)', emoji: '🌤️', label: 'TRANSICIÓN' },
                            optima:           { bg: 'var(--success-soft-bg)',   border: 'var(--success-soft-border)',   text: 'var(--success)',   badge: 'var(--surface-subtle)', emoji: '✅', label: 'CONDICIÓN ÓPTIMA' },
                        };
                        const c = colorMap[recomendacion.tipo] ?? colorMap.optima;

                        // ── Contexto numérico dinámico según estado ──────────────────────────
                        const esExceso = recomendacion.tipo === 'excesoCritico' || recomendacion.tipo === 'excesoPreventivo';
                        const esOreo = recomendacion.tipo === 'oreo';

                        return (
                            <div style={{
                                borderRadius: '12px', marginBottom: '28px', padding: '20px 24px',
                                background: c.bg, border: `1px solid ${c.border}`,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                                    <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{c.emoji}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                                                Asistente Zootécnico – {perfil.emoji} {perfil.zona}
                                            </p>
                                            {/* Badge de estado */}
                                            <span style={{
                                                fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px',
                                                borderRadius: '20px', letterSpacing: '0.5px',
                                                background: c.badge, border: `1px solid ${c.border}`, color: c.text,
                                            }}>
                                                {c.label}
                                            </span>
                                        </div>
                                        {/* Contexto numérico */}
                                        {kpis && (
                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                                {esOreo ? (
                                                    <>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                                                            🌾 Día {kpis.diasSecos} de {perfil.diasBufferPostExceso} de amortiguación hídrica
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            Lluvia previa: {kpis.mm7dias.toFixed(1)} mm (7d) / {kpis.mm30dias.toFixed(1)} mm (30d)
                                                            {' · '}Estrés computado: 0 días (humedad retenida)
                                                        </span>
                                                    </>
                                                ) : esExceso ? (
                                                    <>
                                                        <span style={{ fontSize: '0.75rem', color: c.text, fontWeight: 600 }}>
                                                            🌧 {kpis.mm7dias.toFixed(1)} mm en 7 días
                                                            {recomendacion.tipo === 'excesoCritico'
                                                                ? ` · Umbral crítico: ≥ ${perfil.exceso7dRoja} mm`
                                                                : ` · Umbral alerta: ≥ ${perfil.exceso7dAmarilla} mm`}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            {kpis.mm30dias.toFixed(1)} mm en 30 días · Umbral mensual: {perfil.exceso30d} mm
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {kpis.diasSecos > 0 ? `${kpis.diasSecos} días sin lluvia efectiva` : 'Lluvia efectiva reciente'}
                                                        {' · '}{kpis.mm30dias.toFixed(1)} mm últimos 30 días
                                                        {' · '}{kpis.mm7dias.toFixed(1)} mm últimos 7 días
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '0.92rem' }}>
                                            {recomendacion.mensaje}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── TABLA AGRUPADA POR MES ── */}
                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        {/* Controles de la tabla */}
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Calendar size={18} color="var(--primary-light)" />
                                Historial de Registros
                            </h3>
                            <select
                                value={anoSeleccionado}
                                onChange={e => setAnoSeleccionado(Number(e.target.value))}
                                style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-main)', marginBottom: 0 }}
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
                                <div key={grupo.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    {/* Cabecera del mes */}
                                    <button
                                        onClick={() => toggleMes(grupo.key)}
                                        style={{
                                            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '14px 24px', background: 'var(--surface-subtle)',
                                            border: 'none', borderRadius: 0, color: 'var(--text-main)',
                                            fontSize: '0.9rem', letterSpacing: 0, textTransform: 'none', fontWeight: 500,
                                            cursor: 'pointer', transition: 'background 0.2s', boxShadow: 'none',
                                        }}
                                        onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-subtle-hover)'}
                                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'var(--surface-subtle)'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{grupo.label}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{grupo.registros.length} registros</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--info)' }}>{grupo.totalMm} mm</span>
                                            {grupo.open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                                        </div>
                                    </button>

                                    {/* Registros del mes */}
                                    {grupo.open && (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: 'var(--surface-inset)' }}>
                                                        {['Fecha', 'Lectura Pluviómetro', 'Lluvia Neta', 'Intensidad', 'Notas', ''].map(h => (
                                                            <th key={h} style={{ padding: '10px 20px', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap' }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {grupo.registros.map(r => {
                                                        const intensidad = clasificarIntensidad(r.milimetros, perfil.umbralRegistroMm, perfil.umbralEfectivoMm);
                                                        const detalles = r.detalles || [];
                                                        const esPromedioMulti = filtroPluviometro === 'todos' && detalles.length > 1;
                                                        return (
                                                            <tr key={r.id}
                                                                style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }}
                                                                onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-subtle)'}
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
                                                                    {esPromedioMulti ? (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                            {detalles.map((d, idx) => {
                                                                                const pluvNombre = d.id_pluviometro ? (pluviometrosMap.get(d.id_pluviometro)?.nombre || 'Estación') : 'General';
                                                                                return (
                                                                                    <span
                                                                                        key={d.id || idx}
                                                                                        style={{
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '6px',
                                                                                            padding: '2px 8px',
                                                                                            borderRadius: '10px',
                                                                                            fontSize: '0.75rem',
                                                                                            background: 'var(--surface-subtle)',
                                                                                            border: '1px solid var(--border-subtle)',
                                                                                            color: 'var(--text-secondary)',
                                                                                        }}
                                                                                    >
                                                                                        <span>{pluvNombre}: <strong>{d.milimetros} mm</strong></span>
                                                                                        {isAdminOrCowboy && d.id && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleEliminar(d.id!, pluvNombre)}
                                                                                                title={`Eliminar lectura de ${pluvNombre}`}
                                                                                                style={{ background: 'none', border: 'none', color: 'var(--error)', opacity: 0.75, padding: 0, width: 'auto', cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1 }}
                                                                                            >
                                                                                                ✕
                                                                                            </button>
                                                                                        )}
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ) : (
                                                                        <div>
                                                                            <span>{r.lectura_acumulada ? `${r.lectura_acumulada} mm` : '—'}</span>
                                                                            {esMultiPluviometro && filtroPluviometro === 'todos' && (
                                                                                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                                    📍 {r.id_pluviometro ? (pluviometrosMap.get(r.id_pluviometro)?.nombre || 'Estación') : 'Registro general'}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '14px 20px' }}>
                                                                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--info)' }}>
                                                                        {r.milimetros > 0 ? '+' : ''}{r.milimetros}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>mm</span>
                                                                    {esPromedioMulti && (
                                                                        <div style={{ fontSize: '0.7rem', color: 'var(--info)' }}>
                                                                            Prom. ({detalles.length} est.)
                                                                        </div>
                                                                    )}
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
                                                                <td style={{ padding: '14px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                    {isAdminOrCowboy && (
                                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                            {pluviometrosActivos.length >= 1 && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => openRegistroModal(r.fecha)}
                                                                                    style={{ background: 'none', border: 'none', color: 'var(--info)', cursor: 'pointer', opacity: 0.8, padding: '4px', width: 'auto' }}
                                                                                    title="Completar o editar lecturas de este día"
                                                                                >
                                                                                    <Pencil size={15} />
                                                                                </button>
                                                                            )}
                                                                            {!esPromedioMulti && detalles[0]?.id && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleEliminar(detalles[0].id!)}
                                                                                    style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', opacity: 0.6, padding: '4px', width: 'auto' }}
                                                                                    title="Eliminar registro"
                                                                                >
                                                                                    <Trash2 size={16} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
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
                    <div className="card" style={{ width: '100%', maxWidth: pluviometrosActivos.length >= 2 ? '520px' : '460px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <CloudRain size={22} color="var(--primary-light)" />
                                Registrar Lluvia
                            </h2>
                            <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', width: 'auto', padding: '4px 8px', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleGuardar}>
                            {/* Fecha */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Fecha</label>
                                <input type="date" className="input-field" value={fecha} onChange={e => handleChangeFechaModal(e.target.value)} required />
                            </div>

                            {pluviometrosActivos.length === 0 ? (
                                <>
                                    {/* Modo clásico sin pluviómetros configurados en Ajustes */}
                                    <div style={{ marginBottom: '18px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            Tipo de Medición
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--surface-inset)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                                            <button
                                                type="button"
                                                onClick={() => { setModoEntrada('diaria'); setError(''); }}
                                                style={{
                                                    padding: '9px 10px',
                                                    fontSize: '0.82rem',
                                                    borderRadius: '8px',
                                                    border: modoEntrada === 'diaria' ? '1px solid var(--info)' : '1px solid transparent',
                                                    background: modoEntrada === 'diaria' ? 'var(--info-soft-bg)' : 'transparent',
                                                    color: modoEntrada === 'diaria' ? 'var(--info)' : 'var(--text-muted)',
                                                    fontWeight: modoEntrada === 'diaria' ? 600 : 400,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    cursor: 'pointer', transition: 'all 0.2s', width: '100%', textTransform: 'none', letterSpacing: 0,
                                                }}
                                            >
                                                <Droplets size={15} color={modoEntrada === 'diaria' ? 'var(--info)' : 'var(--text-muted)'} />
                                                Lluvia del Día
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setModoEntrada('acumulada'); setError(''); }}
                                                style={{
                                                    padding: '9px 10px',
                                                    fontSize: '0.82rem',
                                                    borderRadius: '8px',
                                                    border: modoEntrada === 'acumulada' ? `1px solid ${accentPurple}` : '1px solid transparent',
                                                    background: modoEntrada === 'acumulada' ? 'rgba(168,85,247,0.14)' : 'transparent',
                                                    color: modoEntrada === 'acumulada' ? accentPurple : 'var(--text-muted)',
                                                    fontWeight: modoEntrada === 'acumulada' ? 600 : 400,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    cursor: 'pointer', transition: 'all 0.2s', width: '100%', textTransform: 'none', letterSpacing: 0,
                                                }}
                                            >
                                                <TrendingUp size={15} color={modoEntrada === 'acumulada' ? accentPurple : 'var(--text-muted)'} />
                                                Acumulada Digital
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '18px' }}>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>
                                            {modoEntrada === 'diaria' ? 'Lluvia caída hoy (mm)' : 'Lectura acumulada del pluviómetro (mm)'}
                                        </label>
                                        <input
                                            type="number" step="0.1" min="0" className="input-field"
                                            placeholder={modoEntrada === 'diaria' ? "Ej: 18.5" : "Ej: 1520.5"}
                                            value={valorEntrada}
                                            onChange={e => setValorEntrada(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                        <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                            {modoEntrada === 'diaria'
                                                ? '💧 Pluviómetro manual / probeta: ingresa directamente los mm caídos.'
                                                : (() => {
                                                    const prev = obtenerUltimaLecturaAcumulada(registrosRaw, fecha, null);
                                                    return prev !== null
                                                        ? `📟 Última lectura acumulada: ${prev} mm. El sistema calculará la diferencia.`
                                                        : '📟 Pluviómetro digital: ingresa la lectura acumulada actual.';
                                                })()}
                                        </p>
                                        {modoEntrada === 'acumulada' && obtenerUltimaLecturaAcumulada(registrosRaw, fecha, null) !== null && (
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '0.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={reiniciarLegacy}
                                                    onChange={e => setReiniciarLegacy(e.target.checked)}
                                                    style={{ width: 'auto', margin: 0 }}
                                                />
                                                El pluviómetro se reinició a 0 desde la última lectura
                                            </label>
                                        )}
                                    </div>
                                </>
                            ) : (
                                /* Opción A: Tarjetas juntas por cada pluviómetro configurado por el admin */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                                    {pluviometrosActivos.length >= 2 && (
                                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                            Puedes registrar ambos ahora o llenar uno y dejar el otro pendiente para más tarde.
                                        </p>
                                    )}
                                    {pluviometrosActivos.map((pluv, idx) => {
                                        const existente = registrosRaw.find(
                                            r => String(r.fecha).split('T')[0] === fecha && r.id_pluviometro === pluv.id
                                        );
                                        const enEdicion = Boolean(editandoPluv[pluv.id]);
                                        const esAcum = pluv.tipo_medicion === 'acumulada';
                                        const prevAcum = esAcum
                                            ? obtenerUltimaLecturaAcumulada(registrosRaw, fecha, pluv.id, existente?.id ?? null)
                                            : null;

                                        return (
                                            <div
                                                key={pluv.id}
                                                style={{
                                                    padding: '14px',
                                                    borderRadius: '10px',
                                                    background: existente && !enEdicion ? 'var(--success-soft-bg)' : 'var(--surface-subtle)',
                                                    border: `1px solid ${existente && !enEdicion ? 'var(--success-soft-border)' : 'var(--border-subtle)'}`,
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: existente && !enEdicion ? '6px' : '10px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.92rem' }}>
                                                        📍 {pluv.nombre}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        background: esAcum ? 'rgba(168,85,247,0.14)' : 'var(--info-soft-bg)',
                                                        color: esAcum ? accentPurple : 'var(--info)',
                                                        border: `1px solid ${esAcum ? 'rgba(168,85,247,0.35)' : 'var(--info-soft-border)'}`,
                                                    }}>
                                                        {esAcum ? '📟 Acumulada Digital' : '💧 Lluvia del Día'}
                                                    </span>
                                                </div>

                                                {existente && !enEdicion ? (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '0.84rem', fontWeight: 600 }}>
                                                            <CheckCircle2 size={16} />
                                                            <span>
                                                                Ya registrado: {existente.milimetros} mm
                                                                {existente.lectura_acumulada != null ? ` (lectura: ${existente.lectura_acumulada} mm)` : ''}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditandoPluv(prev => ({ ...prev, [pluv.id]: true }));
                                                                const valorPrevio = esAcum && existente.lectura_acumulada != null
                                                                    ? String(existente.lectura_acumulada)
                                                                    : String(existente.milimetros);
                                                                setValoresPorPluv(prev => ({ ...prev, [pluv.id]: valorPrevio }));
                                                                if (!notas && existente.notas) setNotas(existente.notas);
                                                            }}
                                                            style={{
                                                                width: 'auto',
                                                                padding: '4px 10px',
                                                                fontSize: '0.75rem',
                                                                background: 'var(--surface-inset)',
                                                                border: '1px solid var(--border-strong)',
                                                                color: 'var(--text-main)',
                                                                borderRadius: '8px',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            Editar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min="0"
                                                            className="input-field"
                                                            placeholder={esAcum ? 'Lectura acumulada (ej: 1520.5)' : 'Milímetros caídos (ej: 18.5)'}
                                                            value={valoresPorPluv[pluv.id] || ''}
                                                            onChange={e => setValoresPorPluv(prev => ({ ...prev, [pluv.id]: e.target.value }))}
                                                            style={{ marginBottom: '6px' }}
                                                            autoFocus={idx === 0}
                                                        />
                                                        {esAcum && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                                    {prevAcum !== null
                                                                        ? `Última lectura anterior: ${prevAcum} mm`
                                                                        : 'Primera lectura acumulada de este pluviómetro'}
                                                                </p>
                                                                {prevAcum !== null && (
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={Boolean(reiniciarPorPluv[pluv.id])}
                                                                            onChange={e => setReiniciarPorPluv(prev => ({ ...prev, [pluv.id]: e.target.checked }))}
                                                                            style={{ width: 'auto', margin: 0 }}
                                                                        />
                                                                        Contador reiniciado a 0
                                                                    </label>
                                                                )}
                                                            </div>
                                                        )}
                                                        {enEdicion && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditandoPluv(prev => ({ ...prev, [pluv.id]: false }));
                                                                    setValoresPorPluv(prev => ({ ...prev, [pluv.id]: '' }));
                                                                }}
                                                                style={{ width: 'auto', padding: '2px 8px', fontSize: '0.72rem', marginTop: '4px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                            >
                                                                Cancelar edición
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Notas */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Notas (Opcional)</label>
                                <textarea
                                    className="input-field"
                                    placeholder="Ej: Aguacero fuerte en la tarde"
                                    value={notas}
                                    onChange={e => setNotas(e.target.value)}
                                    rows={2}
                                    style={{ resize: 'none', marginBottom: 0 }}
                                />
                            </div>

                            {error && <p style={{ color: 'var(--error)', marginBottom: '16px', fontSize: '0.9rem', background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', padding: '10px', borderRadius: '8px' }}>{error}</p>}
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" style={{ flex: 1, backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-strong)', color: 'var(--text-main)' }} onClick={() => setShowModal(false)}>Cancelar</button>
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
