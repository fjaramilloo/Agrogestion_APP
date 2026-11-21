import { useEffect, useState, useMemo, Fragment, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { localDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid, Legend, BarChart, Bar, ReferenceLine
} from 'recharts';
import { Timer, TrendingUp, Activity, Scale, Home, MapPin, FileSpreadsheet, ShoppingCart, X, AlertOctagon, SlidersHorizontal, ArrowLeftRight, Leaf, CloudRain, Users, ListChecks, ChevronRight } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    toDisplayValue,
    getUnidadLabel,
    getModoLabel,
    calcularGmpAcumulado,
    calcularFallbackGmpPorEtapa,
    calcularPesoEstimadoHoy,
    evaluarLotesParaDespacho,
    type LoteDespachoEvaluado
} from '../utils/ganancia';
import { consolidarLluviasPorFecha } from '../utils/rainfallUtils';
import { useNavigate, Link } from 'react-router-dom';
import './Dashboard.css';
// El reporte trae xlsx + jsPDF (pesados): se descarga solo cuando el usuario lo abre
const ReporteInventarioExcel = lazy(() => import('../components/ReporteInventarioExcel'));
import ModalUpsell from '../components/ModalUpsell';

// Hook para detectar pantalla móvil (<= 768px)
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return isMobile;
}

interface DashboardStats {
    totalAnimales: number;
    promedioLevanteMeses: number;
    gmpLevante: number; 
    promedioCebaMeses: number;
    gmpCeba: number;
    gmpTotal: number;
    totalMuertosAno: number;
    produccionCarneHaAno: number;
    cargaAnimal: number;
    pesoPromedioEntrada: number;
    pesoPromedioSalida: number;
    metaMinima?: number;
}

interface EvolucionItem {
    numero: number;
    label: string;
    gmpLevante?: number;
    gmpCeba?: number;
}

interface GmpDetailItem {
    id_animal: string;
    chapeta: string;
    propietario: string;
    potrerada: string;
    fechaAnterior: string;
    pesoAnterior: number;
    fechaActual: string;
    pesoActual: number;
    gmp: number;
}

interface LluviaItem {
    fecha: string;
    mm: number;
}

export default function Dashboard() {
    const { fincaId, modoGanancia, licenciaInfo, role, isSuperAdmin } = useAuth();
    const isObserverOnly = role === 'observador' && !isSuperAdmin;
    const isVencida = Boolean(licenciaInfo?.isVencida);
    const isSobrecupo = Boolean(licenciaInfo && (licenciaInfo.isSobrecupo || licenciaInfo.totalAnimalesOrganizacion > licenciaInfo.limiteAnimales));
    const isBloqueado = isVencida || isSobrecupo;
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
    const [vistaGrafica, setVistaGrafica] = useState<'mensual' | 'pesaje' | 'rango'>('mensual');
    const [evolucionLluvia, setEvolucionLluvia] = useState<LluviaItem[]>([]);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedDetail, setSelectedDetail] = useState<{
        label: string,
        etapa: string,
        items: GmpDetailItem[]
    } | null>(null);
    const [sortCol, setSortCol] = useState<'chapeta' | 'propietario' | 'potrerada' | 'gmp'>('gmp');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [filterTipo, setFilterTipo] = useState<'historico' | 'actual'>('actual');
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

    const muertesByYear = muertesData.reduce((acc, animal) => {
        const year = animal.fecha_baja ? animal.fecha_baja.substring(0, 4) : 'Desconocido';
        if (!acc[year]) acc[year] = [];
        acc[year].push(animal);
        return acc;
    }, {} as Record<string, any[]>);

    useEffect(() => {
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
                    safePromise(supabase.from('registros_lluvia').select('fecha, milimetros, id_pluviometro').eq('id_finca', fincaId).order('fecha', { ascending: true }).limit(50000), { data: [], error: null }),
                    safePromise(supabase.from('animales').select(`
                        id, numero_chapeta, etapa, fecha_ingreso, peso_ingreso, peso_compra,
                        fecha_ingreso_ceba, peso_ingreso_ceba, nombre_propietario, estado,
                        id_potrerada, fecha_muerte, comprador_venta, fecha_venta, observaciones_venta,
                        potreros ( nombre ),
                        potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
                        registros_pesaje (
                            id_animal, peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted
                        )
                    `).eq('id_finca', fincaId).or('is_deleted.is.null,is_deleted.eq.false').limit(10000), { data: [], error: null })
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
                                registros_pesaje: a.ultimo_peso ? [{
                                    id_animal: a.id,
                                    peso: a.ultimo_peso,
                                    fecha: a.fecha_ultimo_pesaje || a.fecha_ingreso,
                                    etapa: a.etapa,
                                    gmp_calculada: null,
                                    gdp_calculada: null
                                }] : []
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
                        const deduplicated = sorted.filter((p: any) => {
                            if (!p || !p.fecha) return false;
                            if (p.is_deleted === true) return false;
                            const dateOnly = typeof p.fecha === 'string' ? p.fecha.split('T')[0] : '';
                            if (!dateOnly || uniqueFechas.has(dateOnly)) return false;
                            uniqueFechas.add(dateOnly);
                            return true;
                        });
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

                animales.forEach((animal: any) => {
                    if (animal.fecha_ingreso) {
                        const diffHoy = differenceInDays(new Date(), new Date(animal.fecha_ingreso)) || 0;
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
                setLoading(false);
            }
        }
        fetchDashboardData();
    }, [fincaId]);

    // Memo para procesar la evolución GMP según el filtro de forma instantánea sin re-renders adicionales
    const { evolucionGmp, evolucionPorPesaje, evolucionPorRango, detallesGmpAgrupados } = useMemo(() => {
        if (!rawData) {
            return {
                evolucionGmp: [] as EvolucionItem[],
                evolucionPorPesaje: [] as any[],
                evolucionPorRango: [] as any[],
                detallesGmpAgrupados: { levante: {}, ceba: {} } as {
                    levante: Record<number, GmpDetailItem[]>;
                    ceba: Record<number, GmpDetailItem[]>;
                }
            };
        }

        const { animales, pesajes } = rawData;
        const animalesFiltrados = filterTipo === 'actual' 
            ? animales.filter(a => a.estado === 'activo')
            : animales;

        // Agrupar pesajes por animal
        const pesajesPorAnimal: Record<string, any[]> = {};
        pesajes.forEach((p: any) => {
            if (!pesajesPorAnimal[p.id_animal]) {
                pesajesPorAnimal[p.id_animal] = [];
            }
            pesajesPorAnimal[p.id_animal].push(p);
        });

        // Agrupar por Mes/Año del pesaje
        const agrupadoPorMes: Record<string, {
            sortIndex: string;
            label: string;
            levanteSum: number;
            levanteCount: number;
            cebaSum: number;
            cebaCount: number;
            levanteDetalles: GmpDetailItem[];
            cebaDetalles: GmpDetailItem[];
        }> = {};

        // Agrupar por Rango de Peso
        const agrupadoPorRango: Record<string, { sum: number, count: number, sumDias: number }> = {
            'rango1': { sum: 0, count: 0, sumDias: 0 }, // < 400
            'rango2': { sum: 0, count: 0, sumDias: 0 }, // 401 - 480
            'rango3': { sum: 0, count: 0, sumDias: 0 }, // 481 - 530
            'rango4': { sum: 0, count: 0, sumDias: 0 }, // > 531
        };

        // Agrupar por Número de Pesaje (2, 3, 4...)
        const agrupadoPorNum: Record<number, {
            sumLevante: number,
            countLevante: number,
            sumCeba: number,
            countCeba: number,
            sumDiasLevante: number,
            sumDiasCeba: number
        }> = {};

        animalesFiltrados.forEach(animal => {
            const misPesajes = pesajesPorAnimal[animal.id];
            if (!misPesajes || misPesajes.length === 0) return;

            // Ordenar pesajes cronológicamente
            const ordenados = [...misPesajes].sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
            
            let prevWeight = parseFloat(animal.peso_ingreso ?? animal.peso_compra ?? 0);
            let prevDate = new Date(`${animal.fecha_ingreso}T01:00:00`);
            let validWeighingCounter = 1;
            
            ordenados.forEach((p: any) => {
                const currentWeight = parseFloat(p.peso); 
                const currentDateStr = p.fecha as string;
                const currentDate = new Date(`${currentDateStr}T01:00:00`);
                const diffDias = differenceInDays(currentDate, prevDate);
                
                if (diffDias > 0) {
                    validWeighingCounter++;
                    const numPesaje = validWeighingCounter;
                    const ganancia = currentWeight - prevWeight;
                    let gdp = (p.gdp_calculada !== null && p.gdp_calculada !== undefined && p.gdp_calculada !== 0) ? Number(p.gdp_calculada) : (ganancia / diffDias);
                    if (gdp === 0 && ganancia !== 0) {
                        gdp = ganancia / diffDias;
                    }
                    const gmpVal = gdp * 30;

                    // 1. Agrupar para gráfica Mensual
                    const sortKey = currentDateStr.substring(0, 7); // YYYY-MM
                    const labelMes = format(currentDate, 'MMM yy', { locale: es }).replace(/^\w/, c => c.toUpperCase());
                    
                    if (!agrupadoPorMes[sortKey]) {
                        agrupadoPorMes[sortKey] = {
                            sortIndex: sortKey,
                            label: labelMes,
                            levanteSum: 0, levanteCount: 0,
                            cebaSum: 0, cebaCount: 0,
                            levanteDetalles: [], cebaDetalles: []
                        };
                    }

                    // 2. Agrupar para gráfica por Número de Pesaje
                    if (!agrupadoPorNum[numPesaje]) {
                        agrupadoPorNum[numPesaje] = { sumLevante: 0, countLevante: 0, sumCeba: 0, countCeba: 0, sumDiasLevante: 0, sumDiasCeba: 0 };
                    }

                    const detail: GmpDetailItem = {
                        id_animal: animal.id,
                        chapeta: animal.numero_chapeta || 'N/A',
                        propietario: animal.nombre_propietario || 'Sin Propietario',
                        potrerada: animal.potreradas?.nombre || 'Sin lote',
                        fechaAnterior: format(prevDate, 'dd/MM/yyyy'),
                        pesoAnterior: prevWeight,
                        fechaActual: format(currentDate, 'dd/MM/yyyy'),
                        pesoActual: currentWeight,
                        gmp: parseFloat(gmpVal.toFixed(1))
                    };

                    if (p.etapa === 'levante') {
                        agrupadoPorMes[sortKey].levanteSum += gmpVal;
                        agrupadoPorMes[sortKey].levanteCount++;
                        agrupadoPorMes[sortKey].levanteDetalles.push(detail);
                        
                        agrupadoPorNum[numPesaje].sumLevante += gmpVal;
                        agrupadoPorNum[numPesaje].countLevante++;
                        agrupadoPorNum[numPesaje].sumDiasLevante += diffDias;
                    } else {
                        agrupadoPorMes[sortKey].cebaSum += gmpVal;
                        agrupadoPorMes[sortKey].cebaCount++;
                        agrupadoPorMes[sortKey].cebaDetalles.push(detail);

                        agrupadoPorNum[numPesaje].sumCeba += gmpVal;
                        agrupadoPorNum[numPesaje].countCeba++;
                        agrupadoPorNum[numPesaje].sumDiasCeba += diffDias;
                    }

                    // 3. Agrupar por Rango de Peso (Tomamos el peso al INICIO del intervalo)
                    const pesoRef = prevWeight;
                    const c1 = Number(cortesPeso.corte1) || 430;
                    const c2 = Number(cortesPeso.corte2) || 480;
                    const c3 = Number(cortesPeso.corte3) || 530;

                    let targetRango = '';
                    if (pesoRef <= c1) targetRango = 'rango1';
                    else if (pesoRef <= c2) targetRango = 'rango2';
                    else if (pesoRef <= c3) targetRango = 'rango3';
                    else targetRango = 'rango4';

                    agrupadoPorRango[targetRango].sum += gmpVal;
                    agrupadoPorRango[targetRango].count++;
                    agrupadoPorRango[targetRango].sumDias += diffDias;
                }
                
                prevWeight = currentWeight;
                prevDate = currentDate;
            });
        });

        // Procesar gráfica de Número de Pesaje
        const dataPorNum = Object.keys(agrupadoPorNum)
            .map(k => parseInt(k))
            .sort((a,b) => a - b)
            .map(num => {
                const item = agrupadoPorNum[num];
                const avgMesesLev = item.countLevante > 0 ? (item.sumDiasLevante / item.countLevante) / 30 : 0;
                const avgMesesCeba = item.countCeba > 0 ? (item.sumDiasCeba / item.countCeba) / 30 : 0;
                
                return {
                    name: `P${num}`,
                    levante: item.countLevante > 0 ? parseFloat((item.sumLevante / item.countLevante).toFixed(1)) : 0,
                    ceba: item.countCeba > 0 ? parseFloat((item.sumCeba / item.countCeba).toFixed(1)) : 0,
                    mesesLevante: parseFloat(avgMesesLev.toFixed(1)),
                    mesesCeba: parseFloat(avgMesesCeba.toFixed(1))
                };
            })
            .filter(d => d.levante !== 0 || d.ceba !== 0)
            .slice(0, 15); // Mostrar máximo 15 pesajes para no saturar 

        // 4. Procesar gráfica de Rangos de Peso
        const c1Val = Number(cortesPeso.corte1) || 430;
        const c2Val = Number(cortesPeso.corte2) || 480;
        const c3Val = Number(cortesPeso.corte3) || 530;

        const dataPorRango = [
            { name: `< ${c1Val} kg`, ...agrupadoPorRango.rango1 },
            { name: `${c1Val + 1} - ${c2Val} kg`, ...agrupadoPorRango.rango2 },
            { name: `${c2Val + 1} - ${c3Val} kg`, ...agrupadoPorRango.rango3 },
            { name: `> ${c3Val} kg`, ...agrupadoPorRango.rango4 },
        ].map(r => ({
            name: r.name,
            gmp: r.count > 0 ? parseFloat((r.sum / r.count).toFixed(1)) : 0,
            meses: r.count > 0 ? parseFloat(((r.sumDias / r.count) / 30).toFixed(1)) : 0
        }));

        const sortedKeys = Object.keys(agrupadoPorMes).sort(); // Sorts by YYYY-MM
        
        let dataEvolucion: EvolucionItem[] = [];
        let levDetails: Record<number, GmpDetailItem[]> = {};
        let cebaDetails: Record<number, GmpDetailItem[]> = {};

        if (sortedKeys.length > 0) {
            // Tomar los últimos 15 meses de pesaje maximo para no saturar 
            const recentKeys = sortedKeys.slice(-15);

            recentKeys.forEach((key, index) => {
                const group = agrupadoPorMes[key];
                const item: EvolucionItem = { numero: index, label: group.label };
                if (group.levanteCount > 0) item.gmpLevante = parseFloat((group.levanteSum / group.levanteCount).toFixed(1));
                if (group.cebaCount > 0) item.gmpCeba = parseFloat((group.cebaSum / group.cebaCount).toFixed(1));
                
                dataEvolucion.push(item);
                levDetails[index] = group.levanteDetalles;
                cebaDetails[index] = group.cebaDetalles;
            });
        }

        return {
            evolucionGmp: dataEvolucion,
            evolucionPorPesaje: dataPorNum,
            evolucionPorRango: dataPorRango,
            detallesGmpAgrupados: { levante: levDetails, ceba: cebaDetails }
        };
    }, [filterTipo, rawData, cortesPeso]);

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

            {isBloqueado && (
                <div style={{
                    background: 'var(--error-soft-bg)',
                    border: '1px solid var(--error-soft-border)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 300px' }}>
                        <AlertOctagon size={24} color="var(--error)" style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {isVencida ? (
                                <>
                                    <strong>Modo Solo Lectura (Licencia Vencida):</strong> Tu suscripción a AgroGestión ha vencido. Tus métricas, reportes históricos e inventario están protegidos y visibles, pero la exportación de informes a Excel y el registro de nuevas operaciones se encuentran bloqueados hasta renovar el plan.
                                </>
                            ) : (
                                <>
                                    <strong>Modo Solo Lectura (Sobrecupo):</strong> Tu organización tiene <strong style={{ color: 'var(--error)' }}>{licenciaInfo?.totalAnimalesOrganizacion} animales</strong> (límite de tu plan: <strong>{licenciaInfo?.limiteAnimales}</strong>). La exportación de datos y la gestión operativa se encuentran bloqueadas hasta actualizar tu plan.
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowUpsellModal(true)}
                        style={{
                            width: 'auto',
                            padding: '8px 16px',
                            fontSize: '0.85rem',
                            backgroundColor: 'var(--error)',
                            color: 'var(--on-primary)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isVencida ? 'Renovar Plan' : 'Ver Planes'}
                    </button>
                </div>
            )}

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
                                        color: stats.gmpLevante < 0 ? 'var(--error)' : (stats.gmpLevante <= umbralMedio ? 'var(--warning)' : (stats.gmpLevante <= umbralAlto ? 'var(--text-light)' : 'var(--success)'))
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
                                        color: stats.gmpCeba < 0 ? 'var(--error)' : (stats.gmpCeba <= umbralMedio ? 'var(--warning)' : (stats.gmpCeba <= umbralAlto ? 'var(--text-light)' : 'var(--success)'))
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
                    <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '32px' }}>
                        {/* Cabecera con Selectores */}
                        <div style={{ padding: isMobile ? '16px' : '24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: isMobile ? '12px' : '20px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.4rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <TrendingUp size={isMobile ? 18 : 24} color="var(--primary)" />
                                        {isMobile ? 'Rendimiento Ganadero' : 'Análisis de Rendimiento Ganadero'}
                                    </h3>
                                    {!isMobile && (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                                            {vistaGrafica === 'mensual' && 'Evolución cronológica del promedio de ganancia por mes.'}
                                            {vistaGrafica === 'pesaje' && 'Eficiencia según el número de pesajes realizados al lote.'}
                                            {vistaGrafica === 'rango' && 'Productividad segmentada por rangos de peso fisiológicos.'}
                                        </p>
                                    )}
                                </div>
                                <div className="dashboard-filter-toggle">
                                    <button 
                                        type="button"
                                        onClick={() => setFilterTipo('actual')}
                                        className={`btn-toggle ${filterTipo === 'actual' ? 'active' : ''}`}
                                        style={{ padding: isMobile ? '6px 12px' : '8px 16px', fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                                    >Activos</button>
                                    <button 
                                        type="button"
                                        onClick={() => setFilterTipo('historico')}
                                        className={`btn-toggle ${filterTipo === 'historico' ? 'active' : ''}`}
                                        style={{ padding: isMobile ? '6px 12px' : '8px 16px', fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                                    >Histórico</button>
                                </div>
                            </div>

                            {/* === KPI CARDS RÁPIDAS — SOLO MÓVIL === */}
                            {isMobile && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
                                    {/* Levante */}
                                    <div style={{
                                        background: 'var(--warning-soft-bg)',
                                        border: '1px solid var(--warning-soft-border)',
                                        borderRadius: '12px',
                                        padding: '12px 14px',
                                        display: 'flex', flexDirection: 'column', gap: '4px'
                                    }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--warning)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🐄 Levante</span>
                                        <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--warning)', lineHeight: 1 }}>
                                            {toDisplayValue(stats.gmpLevante, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getUnidadLabel(modoGanancia)}</span>
                                    </div>
                                    {/* Ceba */}
                                    <div style={{
                                        background: 'var(--success-soft-bg)',
                                        border: '1px solid var(--success-soft-border)',
                                        borderRadius: '12px',
                                        padding: '12px 14px',
                                        display: 'flex', flexDirection: 'column', gap: '4px'
                                    }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🐂 Ceba</span>
                                        <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--success)', lineHeight: 1 }}>
                                            {toDisplayValue(stats.gmpCeba, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getUnidadLabel(modoGanancia)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Selector de Tipo de Gráfica (Tabs) */}
                            {isMobile ? (
                                /* === TABS PÍLDORA COMPACTOS — SOLO MÓVIL === */
                                <div style={{
                                    display: 'flex',
                                    gap: '6px',
                                    marginTop: '14px',
                                    background: 'var(--surface-inset)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '10px',
                                    padding: '4px',
                                }}>
                                    {([
                                        { id: 'mensual', icon: '📅', label: 'Mensual' },
                                        { id: 'pesaje', icon: '⚖️', label: 'Pesaje' },
                                        { id: 'rango',  icon: '📊', label: 'Rango' },
                                    ] as const).map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setVistaGrafica(tab.id)}
                                            style={{
                                                flex: 1,
                                                padding: '8px 4px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: vistaGrafica === tab.id
                                                    ? 'var(--primary-soft-bg)'
                                                    : 'transparent',
                                                color: vistaGrafica === tab.id ? 'var(--primary-light)' : 'var(--text-muted)',
                                                cursor: 'pointer',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                                                fontWeight: vistaGrafica === tab.id ? 700 : 400,
                                                fontSize: '0.72rem',
                                                textTransform: 'none',
                                                letterSpacing: 'normal',
                                                boxShadow: 'none',
                                                transition: 'all 0.18s',
                                                outline: vistaGrafica === tab.id ? '1px solid var(--primary-soft-border)' : 'none',
                                            }}
                                        >
                                            <span style={{ fontSize: '1.1rem' }}>{tab.icon}</span>
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                /* === TABS DESKTOP — sin cambios === */
                                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setVistaGrafica('mensual')}
                                        style={{ 
                                            flex: 1, padding: '12px', borderRadius: '10px', transition: 'all 0.2s', boxShadow: 'none',
                                            background: vistaGrafica === 'mensual' ? 'var(--primary-soft-bg)' : 'transparent',
                                            border: '1px solid',
                                            borderColor: vistaGrafica === 'mensual' ? 'var(--primary)' : 'var(--border-subtle)',
                                            color: vistaGrafica === 'mensual' ? 'var(--primary-light)' : 'var(--text-muted)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: vistaGrafica === 'mensual' ? 'bold' : 'normal'
                                        }}
                                    >
                                        📅 Evolución Mensual
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setVistaGrafica('pesaje')}
                                        style={{ 
                                            flex: 1, padding: '12px', borderRadius: '10px', transition: 'all 0.2s', boxShadow: 'none',
                                            background: vistaGrafica === 'pesaje' ? 'var(--primary-soft-bg)' : 'transparent',
                                            border: '1px solid',
                                            borderColor: vistaGrafica === 'pesaje' ? 'var(--primary)' : 'var(--border-subtle)',
                                            color: vistaGrafica === 'pesaje' ? 'var(--primary-light)' : 'var(--text-muted)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: vistaGrafica === 'pesaje' ? 'bold' : 'normal'
                                        }}
                                    >
                                        ⚖️ Por Nro Pesaje
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setVistaGrafica('rango')}
                                        style={{ 
                                            flex: 1, padding: '12px', borderRadius: '10px', transition: 'all 0.2s', boxShadow: 'none',
                                            background: vistaGrafica === 'rango' ? 'var(--primary-soft-bg)' : 'transparent',
                                            border: '1px solid',
                                            borderColor: vistaGrafica === 'rango' ? 'var(--primary)' : 'var(--border-subtle)',
                                            color: vistaGrafica === 'rango' ? 'var(--primary-light)' : 'var(--text-muted)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: vistaGrafica === 'rango' ? 'bold' : 'normal'
                                        }}
                                    >
                                        📊 Por Rango de Peso
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Cuerpo de la Gráfica */}
                        <div style={{ padding: isMobile ? '12px 8px' : '32px', minHeight: isMobile ? '280px' : '400px' }}>
                            {isMobile && vistaGrafica === 'mensual' ? (
                                /* === MÓVIL: SCROLL HORIZONTAL para la vista mensual con muchos puntos === */
                                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                    <div style={{ width: `${Math.max(evolucionGmp.length * 52, 320)}px`, height: '280px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={evolucionGmp} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                                <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                                <XAxis dataKey="label" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                                                <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={42} />
                                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.8rem' }} formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]} />
                                                {/* En móvil: dots pequeños solo en el último punto, línea suavizada */}
                                                <Line 
                                                    type="monotone"
                                                    name={`${getModoLabel(modoGanancia)} Levante`}
                                                    dataKey="gmpLevante"
                                                    stroke="var(--warning)"
                                                    strokeWidth={2.5}
                                                    dot={(props: any) => {
                                                        const isLast = props.index === evolucionGmp.length - 1;
                                                        if (!isLast) return <g key={props.key} />;
                                                        return <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill="var(--warning)" stroke="var(--bg-card)" strokeWidth={2} />;
                                                    }}
                                                    activeDot={{ 
                                                        r: 7, 
                                                        onClick: (_e: any, payload: any) => {
                                                            const num = payload.payload.numero;
                                                            setSelectedDetail({ label: payload.payload.label, etapa: 'Levante', items: detallesGmpAgrupados.levante[num] || [] });
                                                            setDetailModalVisible(true); setSortCol('gmp'); setSortOrder('asc');
                                                        }
                                                    }}
                                                    connectNulls
                                                />
                                                <Line 
                                                    type="monotone"
                                                    name={`${getModoLabel(modoGanancia)} Ceba`}
                                                    dataKey="gmpCeba"
                                                    stroke="var(--success)"
                                                    strokeWidth={2.5}
                                                    dot={(props: any) => {
                                                        const isLast = props.index === evolucionGmp.length - 1;
                                                        if (!isLast) return <g key={props.key} />;
                                                        return <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill="var(--success)" stroke="var(--bg-card)" strokeWidth={2} />;
                                                    }}
                                                    activeDot={{ 
                                                        r: 7, 
                                                        onClick: (_e: any, payload: any) => {
                                                            const num = payload.payload.numero;
                                                            setSelectedDetail({ label: payload.payload.label, etapa: 'Ceba', items: detallesGmpAgrupados.ceba[num] || [] });
                                                            setDetailModalVisible(true); setSortCol('gmp'); setSortOrder('asc');
                                                        }
                                                    }}
                                                    connectNulls
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                    {/* Hint de scroll */}
                                    {evolucionGmp.length > 6 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '6px', opacity: 0.6 }}>
                                            ← Desliza para ver todos los meses →
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* === DESKTOP / TABLET + vistas pesaje/rango en móvil === */
                                <div style={{ width: '100%', height: isMobile ? '260px' : '400px', minWidth: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        {vistaGrafica === 'mensual' ? (
                                            <LineChart data={evolucionGmp} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                                <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                                <XAxis dataKey="label" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)' }} formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]} />
                                                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                                <Line 
                                                    type="monotone" 
                                                    name={`${getModoLabel(modoGanancia)} Levante`} 
                                                    dataKey="gmpLevante" 
                                                    stroke="var(--warning)" 
                                                    strokeWidth={4} 
                                                    dot={{ r: 6, fill: 'var(--warning)', stroke: 'var(--bg-card)', strokeWidth: 2, cursor: 'pointer' }}
                                                    activeDot={{ 
                                                        r: 8, 
                                                        onClick: (_e: any, payload: any) => {
                                                            const num = payload.payload.numero;
                                                            setSelectedDetail({ label: payload.payload.label, etapa: 'Levante', items: detallesGmpAgrupados.levante[num] || [] });
                                                            setDetailModalVisible(true); setSortCol('gmp'); setSortOrder('asc');
                                                        }
                                                    }}
                                                    connectNulls 
                                                />
                                                <Line 
                                                    type="monotone" 
                                                    name={`${getModoLabel(modoGanancia)} Ceba`} 
                                                    dataKey="gmpCeba" 
                                                    stroke="var(--success)" 
                                                    strokeWidth={4} 
                                                    dot={{ r: 6, fill: 'var(--success)', stroke: 'var(--bg-card)', strokeWidth: 2, cursor: 'pointer' }} 
                                                    activeDot={{ 
                                                        r: 8, 
                                                        onClick: (_e: any, payload: any) => {
                                                            const num = payload.payload.numero;
                                                            setSelectedDetail({ label: payload.payload.label, etapa: 'Ceba', items: detallesGmpAgrupados.ceba[num] || [] });
                                                            setDetailModalVisible(true); setSortCol('gmp'); setSortOrder('asc');
                                                        }
                                                    }}
                                                    connectNulls 
                                                />
                                            </LineChart>
                                        ) : vistaGrafica === 'pesaje' ? (
                                            <BarChart data={evolucionPorPesaje} margin={{ top: 10, right: isMobile ? 8 : 30, left: isMobile ? -10 : 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                                <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                                <XAxis dataKey="name" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} />
                                                <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} width={isMobile ? 42 : undefined} />
                                                <Tooltip
                                                    cursor={{ fill: 'var(--surface-subtle)' }}
                                                    contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)', fontSize: isMobile ? '0.8rem' : '1rem' }}
                                                    formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]}
                                                    labelFormatter={(label) => {
                                                        const point = evolucionPorPesaje.find(d => d.name === label);
                                                        return (
                                                            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                                                                <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{label}</div>
                                                                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    {point && point.levante > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>Intervalo Levante: {point.mesesLevante} meses</div>}
                                                                    {point && point.ceba > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Intervalo Ceba: {point.mesesCeba} meses</div>}
                                                                </div>
                                                            </div>
                                                        );
                                                    }}
                                                />
                                                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                                <Bar name="Levante" dataKey="levante" fill="var(--warning)" radius={[4, 4, 0, 0]} barSize={isMobile ? 22 : 35} />
                                                <Bar name="Ceba" dataKey="ceba" fill="var(--success)" radius={[4, 4, 0, 0]} barSize={isMobile ? 22 : 35} />
                                            </BarChart>
                                        ) : (
                                            <BarChart data={evolucionPorRango} margin={{ top: 10, right: isMobile ? 8 : 30, left: isMobile ? -10 : 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                                <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                                <XAxis dataKey="name" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} />
                                                <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} unit=" kg" width={isMobile ? 42 : undefined} />
                                                <Tooltip
                                                    cursor={{ fill: 'var(--surface-subtle)' }}
                                                    contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)', fontSize: isMobile ? '0.8rem' : '1rem' }}
                                                    formatter={(value: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, getModoLabel(modoGanancia)]}
                                                    labelFormatter={(label) => {
                                                        const point = evolucionPorRango.find(d => d.name === label);
                                                        return (
                                                            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                                                                <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>Rango: {label}</div>
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--primary-light)', marginTop: '4px' }}>
                                                                    Intervalo medio: {point?.meses} meses
                                                                </div>
                                                            </div>
                                                        );
                                                    }}
                                                />
                                                <Bar name={getModoLabel(modoGanancia)} dataKey="gmp" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={isMobile ? 30 : 45} label={{ position: 'top', fill: 'var(--text-main)', fontSize: isMobile ? 10 : 12, formatter: (v: any) => toDisplayValue(v, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1) }} />
                                            </BarChart>
                                        )}
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
                        {/* Se eliminaron las gráficas individuales para usar la tarjeta unificada arriba */}

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

                    {/* Modal de Muertes */}
                    {muertesModalVisible && (
                        <div className="modal-overlay" onClick={() => setMuertesModalVisible(false)}>
                            <div
                                className="dashboard-modal-card"
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="dashboard-muertes-title"
                                onClick={e => e.stopPropagation()}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h2 id="dashboard-muertes-title" style={{ margin: 0, color: 'var(--text-main)' }}>Registro de Muertes y Descartes</h2>
                                    <button type="button" aria-label="Cerrar modal de muertes" onClick={() => setMuertesModalVisible(false)} className="btn-icon dashboard-modal-close" style={{ width: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', padding: '0 8px' }}>&times;</button>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
                                    {muertesData.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No hay muertes registradas.</div>
                                    ) : (
                                        Object.keys(muertesByYear).sort((a,b) => b.localeCompare(a)).map(year => (
                                            <div key={year} style={{ marginBottom: '24px' }}>
                                                <h3 style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', color: 'var(--error)', marginTop: 0 }}>
                                                    {year} <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal'}}>({muertesByYear[year].length} animales)</span>
                                                </h3>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {muertesByYear[year].map((m: any, idx: number) => (
                                                        <div key={idx} style={{ 
                                                            background: 'var(--surface-subtle)', 
                                                            padding: '16px', 
                                                            borderRadius: '12px', 
                                                            border: '1px solid var(--border-subtle)',
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            alignItems: 'flex-start',
                                                            gap: '16px'
                                                        }}>
                                                            <div>
                                                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    Chapeta: {m.numero_chapeta || m.chapeta || 'N/A'}
                                                                    {m.tipo_baja === 'carnicero' ? (
                                                                        <span style={{ fontSize: '0.7rem', background: 'var(--warning-soft-bg)', color: 'var(--warning)', border: '1px solid var(--warning-soft-border)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Carnicero</span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.7rem', background: 'var(--error-soft-bg)', color: 'var(--error)', border: '1px solid var(--error-soft-border)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Muerto</span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                                    {m.fecha_baja ? format(new Date(m.fecha_baja), "d 'de' MMMM", { locale: es }) : 'Sin fecha'}
                                                                </div>
                                                            </div>
                                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '50%', textAlign: 'right', fontStyle: 'italic', wordBreak: 'break-word' }}>
                                                                {m.observacion || 'Sin observaciones detalladas'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Modal de Detalle de Animales (GMP por punto) */}
                    {detailModalVisible && selectedDetail && (
                        <div className="modal-overlay" onClick={() => setDetailModalVisible(false)}>
                            <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="dashboard-detail-title" style={{ maxWidth: '900px', height: 'auto', maxHeight: '85dvh' }} onClick={e => e.stopPropagation()}>
                                <div style={{ padding: isMobile ? '16px' : '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                    <div>
                                        <h2 id="dashboard-detail-title" style={{ margin: 0, color: 'var(--text-main)', fontSize: isMobile ? '1.15rem' : undefined }}>Detalle de Pesajes: {selectedDetail.label}</h2>
                                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: isMobile ? '0.82rem' : undefined }}>Etapa: <strong style={{color: selectedDetail.etapa === 'Levante' ? 'var(--warning)' : 'var(--success)'}}>{selectedDetail.etapa}</strong> | {selectedDetail.items.length} animales aportando.</p>
                                    </div>
                                    <button type="button" aria-label="Cerrar detalle de pesajes" onClick={() => setDetailModalVisible(false)} className="btn-icon dashboard-modal-close" style={{fontSize: '1.5rem'}}>&times;</button>
                                </div>
                                <div style={{ padding: isMobile ? '12px' : '24px', overflowY: 'auto' }}>
                                    <div className="table-container">
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th
                                                        onClick={() => {
                                                            if (sortCol === 'chapeta') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                            else { setSortCol('chapeta'); setSortOrder('asc'); }
                                                        }}
                                                        style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        Chapeta {sortCol === 'chapeta' && (sortOrder === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th 
                                                        onClick={() => {
                                                            if (sortCol === 'propietario') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                            else { setSortCol('propietario'); setSortOrder('asc'); }
                                                        }}
                                                        style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        Propietario {sortCol === 'propietario' && (sortOrder === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th 
                                                        onClick={() => {
                                                            if (sortCol === 'potrerada') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                            else { setSortCol('potrerada'); setSortOrder('asc'); }
                                                        }}
                                                        style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        Potrerada {sortCol === 'potrerada' && (sortOrder === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th>Fecha Ant.</th>
                                                    <th>Peso Ant.</th>
                                                    <th>Fecha Actual</th>
                                                    <th>Peso Actual</th>
                                                    <th 
                                                        onClick={() => {
                                                            if (sortCol === 'gmp') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                            else { setSortCol('gmp'); setSortOrder('asc'); }
                                                        }}
                                                        style={{ textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        {getModoLabel(modoGanancia)} ({getUnidadLabel(modoGanancia)}) {sortCol === 'gmp' && (sortOrder === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...selectedDetail.items]
                                                    .sort((a, b) => {
                                                        if (sortCol === 'propietario') {
                                                            const valA = a.propietario.toLowerCase();
                                                            const valB = b.propietario.toLowerCase();
                                                            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                                                        } else if (sortCol === 'potrerada') {
                                                            const valA = a.potrerada.toLowerCase();
                                                            const valB = b.potrerada.toLowerCase();
                                                            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                                                        } else if (sortCol === 'chapeta') {
                                                            const valA = a.chapeta.toLowerCase();
                                                            const valB = b.chapeta.toLowerCase();
                                                            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                                                        } else {
                                                            return sortOrder === 'asc' ? a.gmp - b.gmp : b.gmp - a.gmp;
                                                        }
                                                    })
                                                    .map((item, idx) => (
                                                    <tr key={idx} className="table-row-hover">
                                                        <td style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{item.chapeta}</td>
                                                        <td style={{ fontSize: '0.85rem' }}>{item.propietario}</td>
                                                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.potrerada}</td>
                                                        <td>{item.fechaAnterior}</td>
                                                        <td>{item.pesoAnterior} kg</td>
                                                        <td>{item.fechaActual}</td>
                                                        <td style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.pesoActual} kg</td>
                                                        <td style={{ 
                                                            textAlign: 'right', 
                                                            fontWeight: 'bold', 
                                                            color: item.gmp < 10 ? 'var(--error)' : 'var(--success)' 
                                                        }}>
                                                            {toDisplayValue(item.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {selectedDetail.items.length === 0 && (
                                                    <tr>
                                                        <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                                            No hay datos detallados para este punto (Datos de ejemplo o históricos insuficientes).
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div style={{ padding: '20px 24px', background: 'var(--surface-subtle)', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
                                    <button onClick={() => setDetailModalVisible(false)} style={{ width: 'auto', padding: '10px 24px' }}>Cerrar</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {showReporteExcel && (
                        <Suspense fallback={null}>
                            <ReporteInventarioExcel onClose={() => setShowReporteExcel(false)} />
                        </Suspense>
                    )}

                    {/* Modal Detalle de Pesos por Rango */}
                    {rangoModalVisible && selectedRangoData && (
                        <div className="modal-overlay" onClick={() => setRangoModalVisible(false)}>
                            <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="dashboard-rango-title" style={{ maxWidth: '900px', width: '95%', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                                <div style={{ padding: isMobile ? '16px' : '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                    <div>
                                        <h2 id="dashboard-rango-title" style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.4rem', color: 'var(--text-main)' }}>Animales en Rango: {selectedRangoData.nombre}</h2>
                                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: isMobile ? '0.82rem' : '0.9rem' }}>Lista detallada de animales con peso estimado a hoy.</p>
                                    </div>
                                    <button type="button" aria-label="Cerrar detalle de rango" className="btn-icon dashboard-modal-close" onClick={() => setRangoModalVisible(false)}><X size={24} aria-hidden="true" /></button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                                    <table className="dashboard-modal-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.12)' }}>
                                            <tr>
                                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Potrerada</th>
                                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chapeta</th>
                                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Peso Actual Real</th>
                                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Peso Estimado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const grouped = selectedRangoData.animales.reduce((acc: Record<string, any[]>, a) => {
                                                    const key = a.potrerada || 'Sin Ubicación';
                                                    if (!acc[key]) acc[key] = [];
                                                    acc[key].push(a);
                                                    return acc;
                                                }, {});

                                                return Object.entries(grouped).map(([potrero, animals]) => (
                                                    <Fragment key={potrero}>
                                                        <tr style={{ background: 'var(--primary-soft-bg)', borderLeft: '4px solid var(--primary)' }}>
                                                            <td colSpan={4} style={{ fontWeight: 'bold', color: 'var(--primary-light)', fontSize: '0.95rem' }}>
                                                                📍 Potrerada: {potrero} ({animals.length} animales)
                                                            </td>
                                                        </tr>
                                                        {animals.map((a, idx) => (
                                                            <tr key={`${potrero}-${idx}`} className="table-row-hover">
                                                                <td>
                                                                    <span style={{ 
                                                                        padding: '4px 10px', 
                                                                        borderRadius: '12px', 
                                                                        background: 'var(--surface-subtle)',
                                                                        border: '1px solid var(--border-subtle)',
                                                                        fontSize: '0.8rem',
                                                                        color: 'var(--text-muted)'
                                                                    }}>
                                                                        {a.potrerada}
                                                                    </span>
                                                                </td>
                                                                <td style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</td>
                                                                <td>{Math.round(a.ultimoPeso)} kg</td>
                                                                <td style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                                                                    {Math.round(a.pesoEstimado)} kg
                                                                    {a.confianzaPeso === 'vencida' && (
                                                                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--warning)', fontWeight: 600 }}>
                                                                            ⚠️ {a.diasSinPesar}d
                                                                        </span>
                                                                    )}
                                                                    {a.confianzaPeso === 'media' && (
                                                                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                                                            ({a.diasSinPesar}d)
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </Fragment>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ padding: '20px 24px', background: 'var(--surface-subtle)', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
                                    <button className="btn-secondary" onClick={() => setRangoModalVisible(false)} style={{ width: 'auto', padding: '10px 24px' }}>Cerrar</button>
                                </div>
                            </div>
                        </div>
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
