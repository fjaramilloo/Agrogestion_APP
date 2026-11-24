import { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllSupabasePages } from '../lib/supabasePagination';
import { localDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, BarChart, Bar
} from 'recharts';
import { Timer, TrendingUp, Activity, Scale, Home, MapPin, FileSpreadsheet, ShoppingCart, SlidersHorizontal, ArrowLeftRight, Leaf, CloudRain, Users, ListChecks, ChevronRight } from 'lucide-react';
import { LicenseBlockedBanner } from '../components/LicenseBlockedBanner';
import { getLicenseBlockState } from '../utils/licenseUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    toDisplayValue,
    getUnidadLabel,
    getModoLabel,
    getGmpColor,
    calcularGmpAcumulado,
    calcularFallbackGmpPorEtapa,
    calcularPesoEstimadoHoy,
    evaluarLotesParaDespacho,
    calcularDiasEntreFechas,
    type LoteDespachoEvaluado
} from '../utils/ganancia';
import { getLocalIsoDate } from '../utils/dateUtils';
import { consolidarLluviasPorFecha } from '../utils/rainfallUtils';
import { useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import './Dashboard.css';
// El reporte trae xlsx + jsPDF (pesados): se descarga solo cuando el usuario lo abre
const ReporteInventarioExcel = lazy(() => import('../components/ReporteInventarioExcel'));
import ModalUpsell from '../components/ModalUpsell';
import DashboardPerformanceChart from './dashboard/DashboardPerformanceChart';
import {
    DashboardMuertesModal,
    DashboardGmpDetailModal,
    DashboardRangoModal
} from './dashboard/DashboardModals';
import type { DashboardStats, LluviaItem, SelectedGmpDetail } from './dashboard/types';

export default function Dashboard() {
    const { fincaId, modoGanancia, licenciaInfo, role, isSuperAdmin } = useAuth();
    const isObserverOnly = role === 'observador' && !isSuperAdmin;
    const { isBloqueado } = getLicenseBlockState(licenciaInfo);
    const [showUpsellModal, setShowUpsellModal] = useState(false);
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [loading, setLoading] = useState(true);
    const [muertesModalVisible, setMuertesModalVisible] = useState(false);
    const [muertesData, setMuertesData] = useState<any[]>([]);

    const [stats, setStats] = useState<DashboardStats>({
        totalAnimales: 0,
        promedioLevanteMeses: 0,
        gmpLevante: 0,
        promedioCebaMeses: 0,
        gmpCeba: 0,
        gmpTotal: 0,
        totalMuertosAno: 0,
        produccionCarneHaAno: 0,
        cargaAnimal: 0,
        pesoPromedioEntrada: 360,
        pesoPromedioSalida: 540,
        metaMinima: 0
    });
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);
    const [fincaInfo, setFincaInfo] = useState({
        nombre: '',
        proposito: '',
        area_aprovechable: 0,
        ubicacion: '',
        municipio: ''
    });
    const [evolucionLluvia, setEvolucionLluvia] = useState<LluviaItem[]>([]);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedDetail, setSelectedDetail] = useState<SelectedGmpDetail | null>(null);
    const [rawData, setRawData] = useState<{ animales: any[], pesajes: any[] } | null>(null);
    const [showReporteExcel, setShowReporteExcel] = useState(false);
    const [distribucionPesos, setDistribucionPesos] = useState({
        rango1: 0, // < 430
        rango2: 0, // 431 - 480
        rango3: 0, // 481 - 530
        rango4: 0  // > 530
    });
    const [animalesPorRango, setAnimalesPorRango] = useState<Record<string, any[]>>({
        rango1: [], rango2: [], rango3: [], rango4: []
    });
    const [cortesPeso, setCortesPeso] = useState({
        corte1: 430,
        corte2: 480,
        corte3: 530,
        preset: 'ceba_tradicional'
    });
    const [rangoModalVisible, setRangoModalVisible] = useState(false);
    const [selectedRangoData, setSelectedRangoData] = useState<{
        nombre: string,
        animales: any[]
    } | null>(null);
    const [despachosInfo, setDespachosInfo] = useState<{
        proximosVigentes: LoteDespachoEvaluado[];
        atrasadosPorConfirmar: LoteDespachoEvaluado[];
    }>({ proximosVigentes: [], atrasadosPorConfirmar: [] });

    const handleOpenMuertes = () => {
        setMuertesModalVisible(true);
    };

    useEffect(() => {
        let cancelled = false;
        async function fetchDashboardData() {
            if (!fincaId) return;
            setLoading(true);

            try {
                const safePromise = async (p: any, fallback: any = { data: null, error: null }) => {
                    try {
                        const res = await p;
                        return res || fallback;
                    } catch {
                        return fallback;
                    }
                };

                // RENDIMIENTO: las consultas salen en paralelo
                const pResumen = Promise.all([
                    safePromise(supabase.from('resumen_finca').select('*').eq('id_finca', fincaId).single()),
                    safePromise(supabase.from('fincas').select('nombre, proposito, area_aprovechable, ubicacion, municipio').eq('id', fincaId).single()),
                    safePromise(supabase.from('configuracion_kpi').select('precio_venta_promedio, costo_mensual_animal, umbral_alto_gmp, umbral_medio_gmp, participacion_utilidad, corte_peso_1, corte_peso_2, corte_peso_3, preset_peso').eq('id_finca', fincaId).single())
                ]);

                const pDetalle = Promise.all([
                    safePromise(
                        fetchAllSupabasePages((from, to, signal) => {
                            const q = supabase
                                .from('registros_lluvia')
                                .select('fecha, milimetros, id_pluviometro')
                                .eq('id_finca', fincaId)
                                .order('fecha', { ascending: true })
                                .order('id', { ascending: true })
                                .range(from, to);
                            return signal ? q.abortSignal(signal) : q;
                        }),
                        { data: [], error: null }
                    ),
                    safePromise(
                        fetchAllSupabasePages((from, to, signal) => {
                            const q = supabase
                                .from('animales')
                                .select(`
                                    id, numero_chapeta, etapa, fecha_ingreso, peso_ingreso, peso_compra,
                                    fecha_ingreso_ceba, peso_ingreso_ceba, nombre_propietario, estado,
                                    id_potrerada, fecha_muerte, comprador_venta, fecha_venta, observaciones_venta,
                                    potreros ( nombre ),
                                    potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
                                    registros_pesaje (
                                        id_animal, peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted
                                    )
                                `)
                                .eq('id_finca', fincaId)
                                .or('is_deleted.is.null,is_deleted.eq.false')
                                .order('id', { ascending: true })
                                .range(from, to);
                            return signal ? q.abortSignal(signal) : q;
                        }),
                        { data: [], error: null }
                    )
                ]);

                const [{ data: resumen }, fincaRes, configRes] = await pResumen;

                const finca = fincaRes?.data;
                const configKpi = configRes?.data;

                if (finca) {
                    setFincaInfo({
                        nombre: finca.nombre || 'Mi Finca',
                        proposito: finca.proposito || 'No Definido',
                        area_aprovechable: finca.area_aprovechable || 0,
                        ubicacion: finca.ubicacion || 'Sin ubicación',
                        municipio: finca.municipio || ''
                    });
                }

                let metaMinimaVal = 0;
                if (configKpi) {
                    const precio = parseFloat(configKpi.precio_venta_promedio || 0);
                    const costo = parseFloat(configKpi.costo_mensual_animal || 0);
                    const participacion = parseFloat(configKpi.participacion_utilidad as any) || 0.6;
                    if (precio > 0) metaMinimaVal = (costo / participacion) / precio;
                    if (configKpi.umbral_alto_gmp) setUmbralAlto(configKpi.umbral_alto_gmp);
                    if (configKpi.umbral_medio_gmp) setUmbralMedio(configKpi.umbral_medio_gmp);
                    if (configKpi.corte_peso_1 || configKpi.corte_peso_2 || configKpi.corte_peso_3) {
                        setCortesPeso({
                            corte1: Number(configKpi.corte_peso_1) || 430,
                            corte2: Number(configKpi.corte_peso_2) || 480,
                            corte3: Number(configKpi.corte_peso_3) || 530,
                            preset: configKpi.preset_peso || 'ceba_tradicional'
                        });
                    }
                }

                const [lluviasRes, todosAnimalesRes] = await pDetalle;

                const lluvias = lluviasRes?.data || [];
                let todosAnimales: any[] = todosAnimalesRes?.data || [];

                // Fallback directo a Dexie si no hay animales en respuesta (Modo Campo sin HTTP cache)
                if (todosAnimales.length === 0) {
                    try {
                        const animsCached = await localDB.animalesCache.where('id_finca').equals(fincaId).toArray();
                        if (animsCached.length > 0) {
                            todosAnimales = animsCached.map(a => ({
                                id: a.id,
                                numero_chapeta: a.numero_chapeta,
                                etapa: a.etapa,
                                fecha_ingreso: a.fecha_ingreso,
                                peso_ingreso: a.peso_ingreso,
                                peso_compra: a.peso_compra,
                                fecha_ingreso_ceba: a.fecha_ingreso_ceba,
                                peso_ingreso_ceba: a.peso_ingreso_ceba,
                                nombre_propietario: a.nombre_propietario,
                                estado: a.estado || 'activo',
                                id_potrerada: a.id_potrerada,
                                comprador_venta: a.comprador_venta,
                                fecha_venta: a.fecha_venta,
                                observaciones_venta: a.observaciones_venta,
                                potreros: a.potrero_nombre ? { nombre: a.potrero_nombre } : null,
                                potreradas: a.potrerada_nombre ? { nombre: a.potrerada_nombre } : null,
                                registros_pesaje: Array.isArray(a.registros_pesaje) && a.registros_pesaje.length > 0
                                    ? a.registros_pesaje.map((p: any) => ({ ...p, id_animal: p.id_animal || a.id }))
                                    : (a.ultimo_peso ? [{
                                        id_animal: a.id,
                                        peso: a.ultimo_peso,
                                        fecha: a.fecha_ultimo_pesaje || a.fecha_ingreso,
                                        etapa: a.etapa,
                                        gmp_calculada: null,
                                        gdp_calculada: null
                                    }] : [])
                            }));
                        }
                    } catch (e) {
                        console.warn('[Dashboard] Error cargando animales de Dexie:', e);
                    }
                }

                const animales: any[] = todosAnimales.filter((a: any) => a.estado === 'activo');

                // Construir pesajesMap y pesajesFlat de forma blindada
                const pesajesMap: Record<string, any[]> = {};
                const pesajesFlat: any[] = [];
                todosAnimales.forEach((a: any) => {
                    if (a.registros_pesaje && Array.isArray(a.registros_pesaje)) {
                        const sorted = a.registros_pesaje.sort((x: any, y: any) => new Date(x.fecha || 0).getTime() - new Date(y.fecha || 0).getTime());
                        const uniqueFechas = new Set();
                        const deduplicated = sorted
                            .filter((p: any) => {
                                if (!p || !p.fecha) return false;
                                if (p.is_deleted === true) return false;
                                const dateOnly = typeof p.fecha === 'string' ? p.fecha.split('T')[0] : '';
                                if (!dateOnly || uniqueFechas.has(dateOnly)) return false;
                                uniqueFechas.add(dateOnly);
                                return true;
                            })
                            .map((p: any) => (p.id_animal ? p : { ...p, id_animal: a.id }));
                        pesajesMap[a.id] = deduplicated;
                        pesajesFlat.push(...deduplicated);
                    } else {
                        pesajesMap[a.id] = [];
                    }
                });

                // Mapa de último pesaje por animal activo (para distribución de pesos y despachos)
                const ultPesajesMap = new Map<string, any>();
                animales.forEach((a: any) => {
                    const misPsjs = pesajesMap[a.id] || [];
                    const ult = misPsjs[misPsjs.length - 1];
                    if (ult) {
                        ultPesajesMap.set(a.id, ult);
                    }
                });

                // Cálculos de permanencia
                let totalDiasLevante = 0;
                let countLevante = 0;
                let totalDiasCeba = 0;
                let countCeba = 0;

                const hoyLocalIso = getLocalIsoDate();
                animales.forEach((animal: any) => {
                    if (animal.fecha_ingreso) {
                        const diffHoy = Math.max(0, calcularDiasEntreFechas(animal.fecha_ingreso, hoyLocalIso));
                        if (animal.etapa === 'levante') {
                            totalDiasLevante += diffHoy;
                            countLevante++;
                        } else if (animal.etapa === 'ceba') {
                            totalDiasCeba += diffHoy;
                            countCeba++;
                        }
                    }
                });

                // Recálculo local de métricas si resumen_finca está vacío o no vino
                let gmpSumTotal = 0;
                let gmpCountTotal = 0;
                let gmpSumLevante = 0;
                let gmpCountLevante = 0;
                let gmpSumCeba = 0;
                let gmpCountCeba = 0;
                let pesoEntradaSum = 0;
                let pesoEntradaCount = 0;

                animales.forEach((a: any) => {
                    const ultP = ultPesajesMap.get(a.id);
                    const pesoBase = Number(a.peso_ingreso ?? a.peso_compra ?? 0);
                    const gmpIndiv = calcularGmpAcumulado(ultP?.peso, pesoBase, a.fecha_ingreso, ultP?.fecha);

                    if (gmpIndiv !== null && !isNaN(gmpIndiv)) {
                        gmpSumTotal += gmpIndiv;
                        gmpCountTotal++;
                        if (a.etapa === 'levante') {
                            gmpSumLevante += gmpIndiv;
                            gmpCountLevante++;
                        } else if (a.etapa === 'ceba') {
                            gmpSumCeba += gmpIndiv;
                            gmpCountCeba++;
                        }
                    }
                    if (pesoBase > 0) {
                        pesoEntradaSum += pesoBase;
                        pesoEntradaCount++;
                    }
                });

                const curYearStr = String(new Date().getFullYear());
                const muertesAnoCalculadas = todosAnimales.filter((a: any) => {
                    const isMuerto = a.estado === 'muerto' && a.fecha_muerte?.startsWith(curYearStr);
                    const isCarnicero = a.estado === 'vendido' && a.comprador_venta?.toLowerCase().includes('carnicero') && a.fecha_venta?.startsWith(curYearStr);
                    return isMuerto || isCarnicero;
                }).length;

                const fallbackGmpTotal = gmpCountTotal > 0 ? gmpSumTotal / gmpCountTotal : 0;
                const fallbackGmpLev = gmpCountLevante > 0 ? gmpSumLevante / gmpCountLevante : 0;
                const fallbackGmpCeba = gmpCountCeba > 0 ? gmpSumCeba / gmpCountCeba : 0;
                const fallbackPesoEntrada = pesoEntradaCount > 0 ? pesoEntradaSum / pesoEntradaCount : 360;
                const areaAprov = finca?.area_aprovechable || 0;
                const fallbackCarga = areaAprov > 0 ? animales.length / areaAprov : 0;
                const fallbackCarneHa = areaAprov > 0 ? (animales.length * fallbackGmpTotal * 12) / areaAprov : 0;

                const totalAnimalesFinal = animales.length > 0 ? animales.length : (resumen?.total_animales_activos != null ? Number(resumen.total_animales_activos) : 0);
                const gmpLevFinal = gmpCountLevante > 0 ? fallbackGmpLev : (resumen?.gmp_promedio_levante != null ? parseFloat(resumen.gmp_promedio_levante) : 0);
                const gmpCebaFinal = gmpCountCeba > 0 ? fallbackGmpCeba : (resumen?.gmp_promedio_ceba != null ? parseFloat(resumen.gmp_promedio_ceba) : 0);
                const gmpTotalFinal = gmpCountTotal > 0 ? fallbackGmpTotal : (resumen?.gmp_promedio_total != null ? parseFloat(resumen.gmp_promedio_total) : 0);
                const muertesFinal = resumen?.muertes_anio_actual != null ? Number(resumen.muertes_anio_actual) : muertesAnoCalculadas;
                const cargaFinal = areaAprov > 0 ? fallbackCarga : (resumen?.carga_animal != null ? parseFloat(resumen.carga_animal) : 0);
                const pesoEntradaFinal = pesoEntradaCount > 0 ? fallbackPesoEntrada : (resumen?.peso_promedio_entrada != null ? parseFloat(resumen.peso_promedio_entrada) : 360);
                const pesoSalidaFinal = parseFloat(resumen?.peso_promedio_salida || 540);
                const carneHaFinal = (areaAprov > 0) ? ((totalAnimalesFinal * gmpTotalFinal * 12) / areaAprov) : fallbackCarneHa;

                setStats({
                    totalAnimales: totalAnimalesFinal,
                    gmpLevante: gmpLevFinal,
                    gmpCeba: gmpCebaFinal,
                    gmpTotal: gmpTotalFinal,
                    totalMuertosAno: muertesFinal,
                    cargaAnimal: cargaFinal,
                    pesoPromedioEntrada: pesoEntradaFinal,
                    pesoPromedioSalida: pesoSalidaFinal,
                    produccionCarneHaAno: carneHaFinal,
                    metaMinima: metaMinimaVal,
                    promedioLevanteMeses: countLevante > 0 ? (totalDiasLevante / countLevante) / 30 : 0,
                    promedioCebaMeses: countCeba > 0 ? (totalDiasCeba / countCeba) / 30 : 0,
                });

                setRawData({
                    animales: todosAnimales,
                    pesajes: pesajesFlat
                });

                // --- CALCULAR MUERTES Y VENDIDOS A CARNICERO (modal de detalle) ---
                const muertesCompletas: any[] = [];
                (todosAnimales || []).forEach((a: any) => {
                    const isMuerto = a.estado === 'muerto';
                    const isCarnicero = a.estado === 'vendido' && a.comprador_venta && a.comprador_venta.toLowerCase().includes('carnicero');
                    if (isMuerto || isCarnicero) {
                        const esMuertoReal = isMuerto;
                        const fechaRef = isMuerto ? a.fecha_muerte : a.fecha_venta;
                        muertesCompletas.push({
                            ...a,
                            tipo_baja: esMuertoReal ? 'muerto' : 'carnicero',
                            fecha_baja: fechaRef,
                            observacion: esMuertoReal ? 'Animal registrado como muerto' : a.observaciones_venta
                        });
                    }
                });

                muertesCompletas.sort((a, b) => new Date(b.fecha_baja || 0).getTime() - new Date(a.fecha_baja || 0).getTime());
                setMuertesData(muertesCompletas);

                // Agrupar lluvias por mes (consolidando primero por fecha como promedio diario si hay varios pluviómetros)
                const lluviasConsolidadas = consolidarLluviasPorFecha(lluvias || []);
                const gruposLluvia: Record<string, number> = {};
                lluviasConsolidadas.forEach((r) => {
                    if (r && r.fecha) {
                        const mes = r.fecha.substring(0, 7);
                        gruposLluvia[mes] = (gruposLluvia[mes] || 0) + (Number(r.milimetros) || 0);
                    }
                });

                if (Object.keys(gruposLluvia).length > 0) {
                    const lt: LluviaItem[] = Object.keys(gruposLluvia)
                        .sort()
                        .map(key => {
                            const [anio, mes] = key.split('-');
                            return {
                                fecha: format(new Date(parseInt(anio), parseInt(mes) - 1), 'MMM', { locale: es }),
                                mm: parseFloat(gruposLluvia[key].toFixed(1))
                            };
                        });
                    setEvolucionLluvia(lt);
                } else {
                    setEvolucionLluvia([
                        { fecha: 'Ene', mm: 120 }, { fecha: 'Feb', mm: 150 }, { fecha: 'Mar', mm: 80 }, { fecha: 'Abr', mm: 200 }, { fecha: 'May', mm: 250 }
                    ]);
                }

                // Calcular Distribución de Pesos Estimados con motor zootécnico unificado
                const dist = { rango1: 0, rango2: 0, rango3: 0, rango4: 0 };
                const distAnimales: Record<string, any[]> = { rango1: [], rango2: [], rango3: [], rango4: [] };
                const animalesConPesajes = animales.map((animal: any) => ({
                    ...animal,
                    registros_pesaje: pesajesMap[animal.id] || animal.registros_pesaje || []
                }));
                const fallbackPorEtapa = calcularFallbackGmpPorEtapa(animalesConPesajes);

                const c1 = Number(configKpi?.corte_peso_1) || 430;
                const c2 = Number(configKpi?.corte_peso_2) || 480;
                const c3 = Number(configKpi?.corte_peso_3) || 530;

                animalesConPesajes.forEach((animal: any) => {
                    const estRes = calcularPesoEstimadoHoy(animal, { fallbackGmp: fallbackPorEtapa });
                    const estimado = estRes.pesoEstimado;

                    const objAnimal = {
                        ...animal,
                        ultimoPeso: estRes.pesoActual,
                        pesoEstimado: estimado,
                        diasSinPesar: estRes.diasSinPesar,
                        confianzaPeso: estRes.confianza,
                        potrerada: animal.potreradas?.nombre || animal.potreros?.nombre || 'Sin Ubicación'
                    };

                    if (estimado <= c1) {
                        dist.rango1++;
                        distAnimales.rango1.push(objAnimal);
                    } else if (estimado <= c2) {
                        dist.rango2++;
                        distAnimales.rango2.push(objAnimal);
                    } else if (estimado <= c3) {
                        dist.rango3++;
                        distAnimales.rango3.push(objAnimal);
                    } else {
                        dist.rango4++;
                        distAnimales.rango4.push(objAnimal);
                    }
                });
                setDistribucionPesos(dist);
                setAnimalesPorRango(distAnimales);

                // --- CÁLCULO DE PRÓXIMOS DESPACHOS ---
                const corteMetaDespacho = c3;
                const lotesConNombre = animalesConPesajes.map((a: any) => ({
                    ...a,
                    potreradaNombre: a.potreradas?.nombre || 'Potrerada Desconocida'
                }));
                setDespachosInfo(
                    evaluarLotesParaDespacho(lotesConNombre, corteMetaDespacho, configKpi?.preset_peso)
                );
            } catch (err) {
                console.error('[Dashboard] Error cargando datos del dashboard:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchDashboardData();

        const tablasDashboard = new Set(['animales', 'registros_lluvia', 'resumen_finca', 'configuracion_kpi', 'fincas']);
        let timerReval: ReturnType<typeof setTimeout> | null = null;
        const refrescarSilencioso = () => {
            if (cancelled) return;
            if (timerReval) clearTimeout(timerReval);
            timerReval = setTimeout(() => {
                if (!cancelled) void fetchDashboardData();
            }, 250);
        };
        const onRevalidated = (e: Event) => {
            const tabla = (e as CustomEvent<{ tabla?: string }>).detail?.tabla;
            if (tabla && tablasDashboard.has(tabla)) refrescarSilencioso();
        };
        window.addEventListener('offline-sync-completed', refrescarSilencioso);
        window.addEventListener('offline-cache-revalidated', onRevalidated);
        return () => {
            cancelled = true;
            if (timerReval) clearTimeout(timerReval);
            window.removeEventListener('offline-sync-completed', refrescarSilencioso);
            window.removeEventListener('offline-cache-revalidated', onRevalidated);
        };
    }, [fincaId]);

    const quickFieldActions = isObserverOnly
        ? [
            { to: '/inventario', title: 'Inventario', desc: 'Hato y ganancias', variant: 'green', Icon: ListChecks },
            { to: '/mapa-finca', title: 'Plano GPS', desc: 'Mapa y potreros', variant: 'blue', Icon: MapPin },
            { to: '/lluvias', title: 'Pluviometría', desc: 'Lluvias por finca', variant: 'teal', Icon: CloudRain },
            { to: '/aforos', title: 'Aforos', desc: 'Estado de forraje', variant: 'amber', Icon: Leaf },
        ]
        : [
            { to: '/pesaje', title: 'Pesar Animal', desc: 'Báscula rápida', variant: 'green', Icon: Scale },
            { to: '/movimientos', title: 'Rotar Lote', desc: 'Mover de potrero', variant: 'amber', Icon: ArrowLeftRight },
            { to: '/mapa-finca', title: 'Plano GPS', desc: 'Ver potreros', variant: 'blue', Icon: MapPin },
            { to: '/aforos', title: 'Aforos', desc: 'Medir forraje', variant: 'teal', Icon: Leaf },
        ];

    const secondaryFieldLinks = isObserverOnly
        ? [
            { to: '/rotaciones', label: 'Rotaciones', Icon: ArrowLeftRight },
            { to: '/mercado', label: 'Mercado', Icon: TrendingUp },
        ]
        : [
            { to: '/lluvias', label: 'Pluviometría', Icon: CloudRain },
            { to: '/potreradas', label: 'Lotes', Icon: Users },
        ];

    return (
        <div className="page-container dashboard-page">
            <div className="dashboard-header">
                <div>
                    <h1 className="title dashboard-title">Indicadores de Gestión</h1>
                    <p className="dashboard-subtitle">Análisis integral del rendimiento productivo y financiero de su operación ganadera.</p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        if (licenciaInfo?.licencia === 'demo' || isBloqueado) {
                            setShowUpsellModal(true);
                        } else {
                            setShowReporteExcel(true);
                        }
                    }}
                    className="btn-secondary dashboard-export-btn"
                >
                    <FileSpreadsheet size={isMobile ? 17 : 20} aria-hidden="true" />
                    <span>{isMobile ? 'Informe Excel' : 'Generar Informe Inventario'}</span>
                </button>
            </div>

            {/* Accesos rápidos de campo (solo visible en móvil/tablet <= 1024px) */}
            <nav className="dashboard-quick-actions" aria-label="Acciones rápidas de campo">
                <div className="dashboard-quick-header">
                    <h2 className="dashboard-quick-heading">Trabajo de campo</h2>
                    {fincaInfo.nombre && <span className="dashboard-quick-finca">{fincaInfo.nombre}</span>}
                </div>
                <ul className="dashboard-quick-grid dashboard-quick-grid--4" role="list">
                    {quickFieldActions.map(({ to, title, desc, variant, Icon }) => (
                        <li key={to}>
                            <Link to={to} className="dashboard-quick-link">
                                <article className={`dashboard-quick-card dashboard-quick-card--${variant}`}>
                                    <div className={`dashboard-quick-icon dashboard-quick-icon--${variant}`}>
                                        <Icon size={22} aria-hidden="true" />
                                    </div>
                                    <div className="dashboard-quick-text">
                                        <span className="dashboard-quick-title">{title}</span>
                                        <span className="dashboard-quick-desc">{desc}</span>
                                    </div>
                                </article>
                            </Link>
                        </li>
                    ))}
                </ul>
                <ul className="dashboard-secondary-row" role="list">
                    {secondaryFieldLinks.map(({ to, label, Icon }) => (
                        <li key={to}>
                            <Link to={to} className="dashboard-secondary-link">
                                <span className="dashboard-secondary-link-left">
                                    <Icon size={17} aria-hidden="true" />
                                    <span>{label}</span>
                                </span>
                                <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            <LicenseBlockedBanner
                licenciaInfo={licenciaInfo}
                onUpgradeClick={() => setShowUpsellModal(true)}
                expiredDetail="Tus métricas, reportes históricos e inventario están protegidos y visibles, pero la exportación de informes a Excel y el registro de nuevas operaciones se encuentran bloqueados hasta renovar el plan."
                overLimitDetail="La exportación de datos y la gestión operativa se encuentran bloqueadas hasta actualizar tu plan."
            />

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--primary)' }}>Cargando métricas...</div>
            ) : (
                <>
                    {/* Widget Información de Finca */}
                    <div className="card dashboard-finca-card">
                        <div className="dashboard-finca-icon">
                            <Home size={48} aria-hidden="true" />
                        </div>
                        <div className="dashboard-finca-meta">
                            <h2 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text-main)', marginBottom: '8px' }}>{fincaInfo.nombre}</h2>
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                    <MapPin size={18} aria-hidden="true" /> {fincaInfo.municipio ? `${fincaInfo.municipio} (${fincaInfo.ubicacion})` : fincaInfo.ubicacion}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                    <Activity size={18} aria-hidden="true" /> <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{fincaInfo.proposito}</span>
                                </div>
                            </div>
                        </div>
                        <div className="dashboard-finca-stats">
                            <button
                                type="button"
                                onClick={() => navigate('/inventario')}
                                className="dashboard-finca-stat"
                            >
                                <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Inventario Actual</div>
                                <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                    {stats.totalAnimales} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Cabezas</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenMuertes}
                                className="dashboard-finca-stat dashboard-finca-stat--danger"
                            >
                                <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Muertes Año</div>
                                <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--error)' }}>
                                    {stats.totalMuertosAno}
                                </div>
                            </button>
                            <div className="dashboard-finca-stat">
                                <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Área de Ganado</div>
                                <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                    {fincaInfo.area_aprovechable} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Ha</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* KPI Widgets */}
                    <div className="dashboard-kpi-grid">
                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--warning-soft-bg)', color: 'var(--warning)' }}>
                                <Timer size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>Levante</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tiempo Promedio</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{stats.promedioLevanteMeses.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>meses</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{getModoLabel(modoGanancia)} Lote</span>
                                    <span style={{
                                        fontWeight: 'bold',
                                        fontSize: '1.25rem',
                                        whiteSpace: 'nowrap',
                                        color: getGmpColor(stats.gmpLevante, umbralMedio, umbralAlto)
                                    }}>{toDisplayValue(stats.gmpLevante, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>{getUnidadLabel(modoGanancia)}</span></span>
                                </div>
                                {stats.metaMinima && stats.metaMinima > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.8 }}>
                                        <span style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>Meta Mínima</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{toDisplayValue(stats.metaMinima, modoGanancia).toFixed(1)} <span style={{ fontSize: '0.68rem', fontWeight: 'normal' }}>{getUnidadLabel(modoGanancia)}</span></span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--success-soft-bg)', color: 'var(--success)' }}>
                                <TrendingUp size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>Ceba</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tiempo Promedio</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{stats.promedioCebaMeses.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>meses</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{getModoLabel(modoGanancia)} Lote</span>
                                    <span style={{
                                        fontWeight: 'bold',
                                        fontSize: '1.25rem',
                                        whiteSpace: 'nowrap',
                                        color: getGmpColor(stats.gmpCeba, umbralMedio, umbralAlto)
                                    }}>{toDisplayValue(stats.gmpCeba, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>{getUnidadLabel(modoGanancia)}</span></span>
                                </div>
                                {stats.metaMinima && stats.metaMinima > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.8 }}>
                                        <span style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>Meta Mínima</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{toDisplayValue(stats.metaMinima, modoGanancia).toFixed(1)} <span style={{ fontSize: '0.68rem', fontWeight: 'normal' }}>{getUnidadLabel(modoGanancia)}</span></span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(147, 51, 234, 0.14)', color: '#9333ea' }}>
                                <MapPin size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>Rendimiento Ha</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Kg / Ha / Año</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{Math.round(stats.produccionCarneHaAno)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>kg</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carga Animal Actual</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{stats.cargaAnimal.toFixed(2)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>UG/Ha</span></span>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}>
                                <Scale size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>Pesos Promedio</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Entrada</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{Math.round(stats.pesoPromedioEntrada)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>kg</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Salida / Venta</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{Math.round(stats.pesoPromedioSalida)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.85 }}>kg</span></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Distribución por Rangos de Peso */}
                    <div style={{ marginBottom: '32px' }}>
                        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{
                                padding: '16px 24px',
                                borderBottom: '1px solid var(--border-subtle)',
                                background: 'var(--surface-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <TrendingUp size={18} color="var(--primary)" />
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>Proyección de Animales por Rango de Peso (Estimado Hoy)</h3>
                                </div>
                                <button
                                    type="button"
                                    className="dashboard-range-btn"
                                    onClick={() => navigate('/configuracion')}
                                    title="Personalizar rangos de peso según el modelo de esta finca"
                                    style={{
                                        width: 'auto',
                                        background: 'var(--surface-subtle)',
                                        border: '1px solid var(--border-strong)',
                                        borderRadius: '6px',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.75rem',
                                        padding: '4px 10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer',
                                        boxShadow: 'none'
                                    }}
                                >
                                    <SlidersHorizontal size={13} aria-hidden="true" />
                                    <span>Ajustar Rangos</span>
                                </button>
                            </div>
                            <div className="dashboard-ranges-body">
                                <div className="dashboard-ranges-layout">
                                    <div style={{ flex: '1 1 350px', minWidth: '0' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', borderBottom: '1px solid var(--border-subtle)' }}>Peso Promedio Estimado</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>Nro de Animales</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr
                                                    onClick={() => {
                                                        setSelectedRangoData({ nombre: `< ${cortesPeso.corte1} kg`, animales: animalesPorRango.rango1 });
                                                        setRangoModalVisible(true);
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                    className="table-row-hover"
                                                >
                                                    <td style={{ padding: '12px 12px', fontSize: '1rem' }}>&lt; {cortesPeso.corte1} kg</td>
                                                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-light)' }}>{distribucionPesos.rango1}</td>
                                                </tr>
                                                <tr
                                                    onClick={() => {
                                                        setSelectedRangoData({ nombre: `${cortesPeso.corte1 + 1} - ${cortesPeso.corte2} kg`, animales: animalesPorRango.rango2 });
                                                        setRangoModalVisible(true);
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                    className="table-row-hover"
                                                >
                                                    <td style={{ padding: '12px 12px', fontSize: '1rem' }}>{cortesPeso.corte1 + 1} - {cortesPeso.corte2} kg</td>
                                                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-light)' }}>{distribucionPesos.rango2}</td>
                                                </tr>
                                                <tr
                                                    onClick={() => {
                                                        setSelectedRangoData({ nombre: `${cortesPeso.corte2 + 1} - ${cortesPeso.corte3} kg`, animales: animalesPorRango.rango3 });
                                                        setRangoModalVisible(true);
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                    className="table-row-hover"
                                                >
                                                    <td style={{ padding: '12px 12px', fontSize: '1rem' }}>{cortesPeso.corte2 + 1} - {cortesPeso.corte3} kg</td>
                                                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-light)' }}>{distribucionPesos.rango3}</td>
                                                </tr>
                                                <tr
                                                    onClick={() => {
                                                        setSelectedRangoData({ nombre: `> ${cortesPeso.corte3} kg`, animales: animalesPorRango.rango4 });
                                                        setRangoModalVisible(true);
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                    className="table-row-hover"
                                                >
                                                    <td style={{ padding: '12px 12px', fontSize: '1rem' }}>&gt; {cortesPeso.corte3} kg</td>
                                                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-light)' }}>{distribucionPesos.rango4}</td>
                                                </tr>
                                                <tr style={{ borderTop: '2px solid var(--border-strong)', background: 'var(--surface-subtle)' }}>
                                                    <td style={{ padding: '12px 12px', fontWeight: 'bold', fontSize: '1rem' }}>Total General</td>
                                                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>{stats.totalAnimales}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="dashboard-dispatch-card">
                                        <div style={{ color: 'var(--primary-light)', fontSize: '0.85rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', position: 'relative', zIndex: 1 }}>
                                            <ShoppingCart size={18} /> Alerta de Próximos Despachos
                                        </div>

                                        {despachosInfo.proximosVigentes.length > 0 ? (() => {
                                            const top = despachosInfo.proximosVigentes[0];
                                            const siguientes = despachosInfo.proximosVigentes.slice(1, 3);
                                            const pct = Math.round(top.pctListos * 100);
                                            return (
                                                <div style={{ position: 'relative', zIndex: 1 }}>
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => navigate('/potreradas', { state: { idPotrerada: top.id } })}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/potreradas', { state: { idPotrerada: top.id } }); }}
                                                        style={{ cursor: 'pointer', marginBottom: siguientes.length > 0 ? '14px' : '8px' }}
                                                    >
                                                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '6px', lineHeight: '1.2', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span>Lote #1: <span style={{ color: 'var(--primary-light)' }}>{top.nombre}</span></span>
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                                hace {Math.round(top.diasSinPesarPromedio)} d
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.96rem', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                                                            Tienes <b style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>{top.listos} de {top.cantidad}</b> animales ({pct}%) sobre {cortesPeso.corte3} kg · Prom. <b style={{ color: 'var(--text-main)' }}>{Math.round(top.pesoPromedioEstimado)} kg est.</b> <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>(báscula: {Math.round(top.pesoPromedioReal)} kg)</span>
                                                            <span style={{ display: 'block', marginTop: '10px', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '10px', borderLeft: '4px solid var(--primary)', fontSize: '0.9rem' }}>
                                                                {top.diasFaltantes === 0
                                                                    ? `¡Lote de ${top.cantidad} animales LISTO para despacho!`
                                                                    : `Faltan ~${top.diasFaltantes} días para meta promedio (${toDisplayValue(top.gmpLote, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)} ajustada)`
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {siguientes.length > 0 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                                                            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
                                                                Siguientes en fila
                                                            </div>
                                                            {siguientes.map((l, idx) => (
                                                                <div
                                                                    key={l.id}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={() => navigate('/potreradas', { state: { idPotrerada: l.id } })}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/potreradas', { state: { idPotrerada: l.id } }); }}
                                                                    style={{
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        alignItems: 'center',
                                                                        gap: '8px',
                                                                        padding: '7px 10px',
                                                                        borderRadius: '8px',
                                                                        background: 'var(--bg-card)',
                                                                        border: '1px solid var(--border-subtle)',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.82rem'
                                                                    }}
                                                                >
                                                                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                                                        #{idx + 2} {l.nombre} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({l.cantidad} cab.)</span>
                                                                    </span>
                                                                    <span style={{ color: 'var(--primary-light)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                                        {Math.round(l.pesoPromedioEstimado)} kg est. · {l.diasFaltantes === 0 ? 'Listo' : `~${l.diasFaltantes}d`}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontStyle: 'italic', position: 'relative', zIndex: 1 }}>
                                                No hay lotes vigentes (&le;150 días sin pesar) próximos a meta de venta.
                                            </div>
                                        )}

                                        {despachosInfo.atrasadosPorConfirmar.length > 0 && (
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => navigate('/potreradas', { state: { idPotrerada: despachosInfo.atrasadosPorConfirmar[0].id } })}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/potreradas', { state: { idPotrerada: despachosInfo.atrasadosPorConfirmar[0].id } }); }}
                                                style={{
                                                    marginTop: '12px',
                                                    padding: '8px 10px',
                                                    borderRadius: '8px',
                                                    background: 'var(--warning-soft-bg)',
                                                    border: '1px solid var(--warning-soft-border)',
                                                    fontSize: '0.78rem',
                                                    color: 'var(--text-main)',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    zIndex: 1
                                                }}
                                            >
                                                <strong>⚖️ Por confirmar en báscula (&gt;150d sin pesar):</strong>{' '}
                                                {despachosInfo.atrasadosPorConfirmar.slice(0, 3).map(l => `${l.nombre} (${Math.round(l.diasSinPesarPromedio)}d)`).join(', ')}
                                                {despachosInfo.atrasadosPorConfirmar.length > 3 ? ` (+${despachosInfo.atrasadosPorConfirmar.length - 3})` : ''}
                                            </div>
                                        )}

                                        {/* Decoración visual */}
                                        <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', opacity: 0.05, pointerEvents: 'none' }}>
                                            <ShoppingCart size={120} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Centro de Análisis de Rendimiento (Gráfica Unificada) */}
                    <DashboardPerformanceChart
                        rawData={rawData}
                        cortesPeso={cortesPeso}
                        gmpLevante={stats.gmpLevante}
                        gmpCeba={stats.gmpCeba}
                        modoGanancia={modoGanancia}
                        isMobile={isMobile}
                        onSelectPointDetail={(detail) => {
                            setSelectedDetail(detail);
                            setDetailModalVisible(true);
                        }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
                        <div className="card dashboard-rain-card">
                            <div style={{ marginBottom: isMobile ? '14px' : '24px' }}>
                                <h3 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.2rem', color: 'var(--text-main)' }}>Histórico de Lluvias (Pluviosidad)</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.82rem' : '0.9rem', margin: '4px 0 0' }}>Milímetros de agua registrados mensualmente</p>
                            </div>
                            <div style={{ width: '100%', height: isMobile ? '240px' : '350px', minWidth: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={evolucionLluvia} margin={isMobile ? { top: 10, right: 12, left: -12, bottom: 0 } : { top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                        <XAxis
                                            dataKey="fecha"
                                            stroke="var(--chart-tick)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }}
                                        />
                                        <YAxis
                                            stroke="var(--chart-tick)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }}
                                            width={isMobile ? 42 : undefined}
                                            unit=" mm"
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'var(--info-soft-bg)' }}
                                            contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)', fontSize: isMobile ? '0.8rem' : '1rem' }}
                                            itemStyle={{ color: 'var(--info)' }}
                                        />
                                        <Bar
                                            name="Lluvia (mm)"
                                            dataKey="mm"
                                            fill="var(--info)"
                                            radius={[6, 6, 0, 0]}
                                            barSize={isMobile ? 22 : 40}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {muertesModalVisible && (
                        <DashboardMuertesModal
                            muertesData={muertesData}
                            onClose={() => setMuertesModalVisible(false)}
                        />
                    )}

                    {detailModalVisible && selectedDetail && (
                        <DashboardGmpDetailModal
                            detail={selectedDetail}
                            isMobile={isMobile}
                            modoGanancia={modoGanancia}
                            onClose={() => setDetailModalVisible(false)}
                        />
                    )}

                    {showReporteExcel && (
                        <Suspense fallback={null}>
                            <ReporteInventarioExcel onClose={() => setShowReporteExcel(false)} />
                        </Suspense>
                    )}

                    {rangoModalVisible && selectedRangoData && (
                        <DashboardRangoModal
                            selectedRangoData={selectedRangoData}
                            isMobile={isMobile}
                            onClose={() => setRangoModalVisible(false)}
                        />
                    )}

                    {licenciaInfo && (
                        <ModalUpsell
                            isOpen={showUpsellModal}
                            onClose={() => setShowUpsellModal(false)}
                            licenciaInfo={licenciaInfo}
                            customTitle={!isBloqueado && licenciaInfo.licencia === 'demo' ? 'Exportación a Excel / CSV' : undefined}
                            customMessage={!isBloqueado && licenciaInfo.licencia === 'demo'
                                ? 'La generación y exportación de informes consolidados de inventario en Excel/PDF es una funcionalidad exclusiva para cuentas en Plan Finca o Plan Hacienda.'
                                : undefined}
                        />
                    )}
                </>
            )}
        </div>
    );
}
