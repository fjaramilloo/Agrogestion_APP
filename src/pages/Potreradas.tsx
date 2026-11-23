import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useIsMobile } from '../hooks/useIsMobile';
import ModalUpsell from '../components/ModalUpsell';
import { LicenseBlockedBanner } from '../components/LicenseBlockedBanner';
import { getLicenseBlockState } from '../utils/licenseUtils';
import { Users, Edit2, Calendar, X, Plus, Trash2, Search, MapPin, AlertTriangle } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    toDisplayValue,
    getModoLabel,
    getGmpColor as resolveGmpColor,
    calcularGmpUltimoPeriodo,
    calcularGmpAcumulado,
    esPesajePosteriorAIngreso,
    calcularFallbackGmpPorEtapa,
    calcularPesoEstimadoHoy,
    getConfianzaPeso,
    normalizarPesajesDesc
} from '../utils/ganancia';
import { getLocalIsoDate } from '../utils/dateUtils';
import PotreradaManageAnimalsModal from './potreradas/PotreradaManageAnimalsModal';
import PotreradaDetailModal from './potreradas/PotreradaDetailModal';
import PotreradaMoveAnimalsModal from './potreradas/PotreradaMoveAnimalsModal';
import PotreradaGroupWeighingModal from './potreradas/PotreradaGroupWeighingModal';
import type { AnimalPotrero, ChartData, Potrerada, PotreradaDetailData } from './potreradas/types';
import './Potreradas.css';

export default function Potreradas() {
    const { fincaId, role, modoGanancia, licenciaInfo } = useAuth();
    const { confirmAction, showAlert, toast } = useFeedback();
    const { isBloqueado } = getLicenseBlockState(licenciaInfo);
    const [showUpsellModal, setShowUpsellModal] = useState(false);
    const location = useLocation();
    const [potreradas, setPotreradas] = useState<Potrerada[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingPotrerada, setEditingPotrerada] = useState<Potrerada | null>(null);
    const [newName, setNewName] = useState('');
    const [newEtapa, setNewEtapa] = useState('');

    const [showAddModal, setShowAddModal] = useState(false);
    const [nuevaPotreradaNombre, setNuevaPotreradaNombre] = useState('');
    const [nuevaPotreradaEtapa, setNuevaPotreradaEtapa] = useState('levante');
    const [nuevaPotreradaRotacion, setNuevaPotreradaRotacion] = useState('');
    const [rotaciones, setRotaciones] = useState<{ id: string; nombre: string }[]>([]);
    const [editRotacion, setEditRotacion] = useState<string | null>(null);

    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);
    const [pesoEntradaCeba, setPesoEntradaCeba] = useState(380);

    const [potreradaSearch, setPotreradaSearch] = useState('');
    const [managingPotrerada, setManagingPotrerada] = useState<Potrerada | null>(null);
    const [animalesFinca, setAnimalesFinca] = useState<AnimalPotrero[]>([]);

    const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailData, setDetailData] = useState<PotreradaDetailData | null>(null);
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [rawDetailData, setRawDetailData] = useState<{
        potrerada: Potrerada;
        animals: any[];
        fincaNombre: string;
        diasPotreroActual: number | null;
        areaTotalSistema: number | null;
        movsResData: any | null;
    } | null>(null);

    const [showWeighingForm, setShowWeighingForm] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const isMobile = useIsMobile();

    const fetchPotreradasData = async () => {
        if (!fincaId) return;
        setLoading(true);

        try {
            const fetchAllAnimals = async () => {
                const [activosRes, vendidosRes] = await Promise.all([
                    supabase.from('animales').select(`
                        id, numero_chapeta, nombre_propietario, id_potrerada,
                        peso_ingreso, peso_compra, fecha_ingreso, etapa, estado,
                        fecha_ingreso_ceba, peso_ingreso_ceba,
                        potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
                        registros_pesaje ( peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted )
                    `).eq('id_finca', fincaId).eq('estado', 'activo').or('is_deleted.is.null,is_deleted.eq.false').order('fecha', { foreignTable: 'registros_pesaje', ascending: false }),
                    supabase.from('animales').select(`
                        id, numero_chapeta, nombre_propietario, id_potrerada,
                        peso_ingreso, peso_compra, fecha_ingreso, etapa, estado,
                        potreradas:potreradas!animales_id_potrerada_fkey ( nombre )
                    `).eq('id_finca', fincaId).eq('estado', 'vendido').not('id_potrerada', 'is', null)
                ]);

                if (activosRes.error) throw activosRes.error;
                if (vendidosRes.error) throw vendidosRes.error;

                return { data: [...(activosRes.data || []), ...(vendidosRes.data || [])] };
            };

            const [configRes, potsRes, rotsRes, movsRes, potsDataRes, animRes] = await Promise.all([
                supabase.from('configuracion_kpi').select('umbral_alto_gmp, umbral_medio_gmp, peso_entrada_ceba').eq('id_finca', fincaId).single(),
                supabase.from('potreradas').select('*').eq('id_finca', fincaId).order('nombre', { ascending: true }),
                supabase.from('rotaciones').select('id, nombre').eq('id_finca', fincaId).order('nombre', { ascending: true }),
                supabase.from('movimientos_potreros').select('id_potrerada, id_potrero, fecha_entrada, fecha_salida, potreros(nombre)').eq('id_finca', fincaId).is('fecha_salida', null).order('fecha_entrada', { ascending: false }),
                supabase.from('potreros').select('id_rotacion, area_hectareas').eq('id_finca', fincaId),
                fetchAllAnimals()
            ]);

            if (configRes.data) {
                setUmbralAlto(configRes.data.umbral_alto_gmp ?? 20);
                setUmbralMedio(configRes.data.umbral_medio_gmp ?? 10);
                if (configRes.data.peso_entrada_ceba) {
                    setPesoEntradaCeba(configRes.data.peso_entrada_ceba);
                }
            }

            const pots = potsRes.data || [];
            const animals = animRes.data || [];
            const activeAnimalsAll = animals.filter((a: any) => a.estado === 'activo');
            const fallbackPorEtapa = calcularFallbackGmpPorEtapa(activeAnimalsAll);
            setRotaciones(rotsRes.data || []);

            const areaRotacionMap = new Map<string, number>();
            if (potsDataRes.data) {
                potsDataRes.data.forEach(pot => {
                    if (pot.id_rotacion) {
                        const current = areaRotacionMap.get(pot.id_rotacion) || 0;
                        areaRotacionMap.set(pot.id_rotacion, current + (pot.area_hectareas || 0));
                    }
                });
            }

            const potreroActualMap = new Map<string, string>();
            (movsRes.data || []).forEach((m: any) => {
                if (!potreroActualMap.has(m.id_potrerada)) {
                    potreroActualMap.set(m.id_potrerada, m.potreros?.nombre || '');
                }
            });

            const rotacionNombreMap = new Map((rotsRes.data || []).map((r: any) => [r.id, r.nombre]));
            const animalsByPotrerada = new Map<string, any[]>();
            const animalesSinPotrerada: any[] = [];

            const animalesProcesados: AnimalPotrero[] = (animals || []).map((a: any) => {
                const registros = a.registros_pesaje || [];
                const firstReg = registros[0];

                if (!a.id_potrerada && a.estado === 'activo') {
                    animalesSinPotrerada.push(a);
                } else if (a.id_potrerada) {
                    let group = animalsByPotrerada.get(a.id_potrerada);
                    if (!group) {
                        group = [];
                        animalsByPotrerada.set(a.id_potrerada, group);
                    }
                    group.push(a);
                }

                return {
                    id: a.id,
                    numero_chapeta: a.numero_chapeta,
                    nombre_propietario: a.nombre_propietario,
                    id_potrerada: a.id_potrerada,
                    potreradaNombre: a.potreradas?.nombre,
                    pesoActual: firstReg ? firstReg.peso : (a.peso_compra ?? a.peso_ingreso),
                    estado: a.estado
                };
            });

            setAnimalesFinca(animalesProcesados);

            if (animalesSinPotrerada.length > 0) {
                pots.push({
                    id: 'sin-potrerada',
                    nombre: 'Sin Potrerada Asignada',
                    etapa: 'Sin asignar',
                    id_rotacion: null
                });
            }

            const processedPots = pots.map((p: any) => {
                const groupAnimals = p.id === 'sin-potrerada'
                    ? animalesSinPotrerada
                    : (animalsByPotrerada.get(p.id) || []);
                const animalesActivos = groupAnimals.filter((a: any) => a.estado === 'activo');
                const animalesVendidos = groupAnimals.filter((a: any) => a.estado === 'vendido');
                const loteListoParaLimpiar = animalesActivos.length === 0 && animalesVendidos.length > 0;

                let totalPeso = 0;
                let totalPesoEstimado = 0;
                let totalGmpLast = 0;
                let totalGmpAcc = 0;
                let totalDiasPesaje = 0;
                let validWeightCount = 0;
                let validGmpLastCount = 0;
                let validGmpAccCount = 0;
                let validDateCount = 0;

                animalesActivos.forEach((a: any) => {
                    const registros = normalizarPesajesDesc(a.registros_pesaje);
                    const lastP = registros[0];
                    const penultimoP = registros[1];
                    const pesoBase = a.peso_ingreso ?? a.peso_compra ?? 0;
                    const tienePesajePosterior = Boolean(lastP && esPesajePosteriorAIngreso(lastP.fecha, a.fecha_ingreso));

                    const estRes = calcularPesoEstimadoHoy(
                        { ...a, registros_pesaje: registros },
                        { fallbackGmp: fallbackPorEtapa }
                    );

                    totalPeso += estRes.pesoActual;
                    totalPesoEstimado += estRes.pesoEstimado;
                    validWeightCount++;
                    totalDiasPesaje += estRes.diasSinPesar;
                    validDateCount++;

                    if (tienePesajePosterior && lastP) {
                        const gmpLast = calcularGmpUltimoPeriodo(lastP, a.fecha_ingreso, pesoBase, penultimoP);
                        if (gmpLast !== null) {
                            totalGmpLast += Number(gmpLast);
                            validGmpLastCount++;
                        }

                        const gmpIndiv = calcularGmpAcumulado(lastP.peso, pesoBase, a.fecha_ingreso, lastP.fecha);
                        if (gmpIndiv !== null) {
                            totalGmpAcc += gmpIndiv;
                            validGmpAccCount++;
                        }
                    }
                });

                const diasPesajePromedio = validDateCount > 0 ? totalDiasPesaje / validDateCount : 0;
                const marcasFuente = animalesActivos.length > 0 ? animalesActivos : groupAnimals;

                return {
                    id: p.id,
                    nombre: p.nombre,
                    etapa: p.etapa,
                    animalCount: animalesActivos.length,
                    vendidoCount: animalesVendidos.length,
                    loteListoParaLimpiar,
                    pesoPromedio: validWeightCount > 0 ? totalPeso / validWeightCount : 0,
                    pesoEstimadoPromedio: validWeightCount > 0 ? totalPesoEstimado / validWeightCount : 0,
                    confianzaPeso: getConfianzaPeso(diasPesajePromedio),
                    gmpPromedio: validGmpLastCount > 0 ? totalGmpLast / validGmpLastCount : 0,
                    gmpAcumulado: validGmpAccCount > 0 ? totalGmpAcc / validGmpAccCount : null,
                    diasPesajePromedio,
                    marcas: Object.entries(marcasFuente.reduce((acc: Record<string, number>, a: any) => {
                        if (a.nombre_propietario) acc[a.nombre_propietario] = (acc[a.nombre_propietario] || 0) + 1;
                        return acc;
                    }, {})).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
                    id_rotacion: p.id_rotacion,
                    rotacionNombre: p.id_rotacion ? (rotacionNombreMap.get(p.id_rotacion) || null) : null,
                    potreroActualNombre: potreroActualMap.get(p.id) || null,
                    cargaGlobal: (p.id_rotacion && areaRotacionMap.get(p.id_rotacion))
                        ? (animalesActivos.length / (areaRotacionMap.get(p.id_rotacion) || 1))
                        : 0
                };
            });

            setPotreradas(processedPots);
        } catch (error) {
            console.error('Error fetching potreradas:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDetail = async (p: Potrerada) => {
        setSelectedDetailId(p.id);
        setDetailLoading(true);
        try {
            const isSinPotrerada = p.id === 'sin-potrerada';
            const queryAnimales = supabase.from('animales').select(`
                id, numero_chapeta, nombre_propietario, peso_ingreso, peso_compra,
                fecha_ingreso, etapa, estado, fecha_ingreso_ceba, peso_ingreso_ceba,
                id_potrero_actual, potreros (nombre, area_hectareas),
                registros_pesaje (peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted)
            `);

            if (isSinPotrerada) {
                queryAnimales.is('id_potrerada', null).eq('estado', 'activo').or('is_deleted.is.null,is_deleted.eq.false');
            } else {
                queryAnimales.eq('id_potrerada', p.id).in('estado', ['activo', 'vendido']).or('is_deleted.is.null,is_deleted.eq.false');
            }

            const [animRes, fincaRes, movsRes] = await Promise.all([
                queryAnimales,
                supabase.from('fincas').select('nombre').eq('id', fincaId).single(),
                isSinPotrerada ? Promise.resolve({ data: null }) : supabase.from('movimientos_potreros').select('fecha_entrada').eq('id_potrerada', p.id).is('fecha_salida', null).maybeSingle()
            ]);

            if (animRes.error) throw animRes.error;
            const animals = animRes.data || [];
            const fincaNombre = fincaRes.data?.nombre || 'Finca Sin Nombre';

            const firstAnimal = animals.length > 0 ? (animals[0] as any) : null;
            const potreroArea = firstAnimal?.potreros?.area_hectareas || null;

            const diasPotreroActual = movsRes.data?.fecha_entrada
                ? differenceInDays(new Date(), new Date(movsRes.data.fecha_entrada + 'T12:00:00'))
                : null;

            let areaTotalSistema = potreroArea;
            if (p.id_rotacion) {
                const { data: potsRot } = await supabase.from('potreros').select('area_hectareas').eq('id_rotacion', p.id_rotacion);
                if (potsRot && potsRot.length > 0) {
                    areaTotalSistema = potsRot.reduce((sum, pr) => sum + (pr.area_hectareas || 0), 0);
                }
            }

            setRawDetailData({
                potrerada: p,
                animals,
                fincaNombre,
                diasPotreroActual,
                areaTotalSistema,
                movsResData: movsRes.data
            });
        } catch (error: any) {
            await showAlert('Error al cargar detalle: ' + error.message, { title: 'Error', variant: 'error' });
        } finally {
            setDetailLoading(false);
        }
    };

    useEffect(() => {
        const state = location.state as { idPotrerada?: string };
        if (state?.idPotrerada && potreradas.length > 0) {
            const pot = potreradas.find(p => p.id === state.idPotrerada);
            if (pot) {
                void handleOpenDetail(pot);
                window.history.replaceState({}, document.title);
            }
        }
    }, [location, potreradas]);

    useEffect(() => {
        void fetchPotreradasData();
    }, [fincaId]);

    useEffect(() => {
        if (!rawDetailData) return;
        const { potrerada: p, animals, fincaNombre, diasPotreroActual, areaTotalSistema } = rawDetailData;
        const firstAnimal = animals.length > 0 ? (animals[0] as any) : null;
        const potreroName = firstAnimal?.potreros?.nombre || 'Sin potrero asignado';
        const potreroArea = firstAnimal?.potreros?.area_hectareas || null;

        const processedAnimals: AnimalPotrero[] = (animals || []).map((a: any) => {
            const registros = normalizarPesajesDesc(a.registros_pesaje);
            const registrosEtapa = showFullHistory
                ? [...registros].reverse()
                : registros.filter((r: any) => r.etapa?.toLowerCase() === p.etapa.toLowerCase()).reverse();

            let fechaIngresoEtapa = null;
            let pesoIngresoEtapa = null;
            const pesoBase = a.peso_ingreso ?? a.peso_compra;

            if (showFullHistory) {
                fechaIngresoEtapa = a.fecha_ingreso;
                pesoIngresoEtapa = pesoBase;
            } else if (p.etapa === 'ceba') {
                fechaIngresoEtapa = a.fecha_ingreso_ceba || (registrosEtapa[0]?.fecha || (a.etapa === 'ceba' ? a.fecha_ingreso : null));
                pesoIngresoEtapa = a.peso_ingreso_ceba || (registrosEtapa[0]?.peso || (a.etapa === 'ceba' ? pesoBase : null));
            } else {
                fechaIngresoEtapa = a.fecha_ingreso;
                pesoIngresoEtapa = a.peso_ingreso;
            }

            const pesajesMap: Record<string, number> = {};
            registrosEtapa.forEach((r: any) => {
                const fechaNorm = r.fecha ? r.fecha.split('T')[0] : r.fecha;
                pesajesMap[fechaNorm] = Number(r.peso);
            });

            const lastP = registros[0];
            const penultimoP = registros[1];
            const tienePesajePosterior = Boolean(lastP && esPesajePosteriorAIngreso(lastP.fecha, a.fecha_ingreso));
            let gmp = 0;
            let gdp = 0;
            let gmpAcumulado: number | null = null;
            let hasCalculatedGmp = false;

            if (tienePesajePosterior && lastP) {
                const gmpUltimo = calcularGmpUltimoPeriodo(lastP, a.fecha_ingreso, pesoBase, penultimoP);
                gmpAcumulado = calcularGmpAcumulado(
                    lastP.peso,
                    pesoIngresoEtapa || pesoBase,
                    fechaIngresoEtapa || a.fecha_ingreso,
                    lastP.fecha
                );

                if (!showFullHistory && gmpUltimo !== null) {
                    gmp = gmpUltimo;
                    gdp = gmpUltimo / 30;
                    hasCalculatedGmp = true;
                } else if (gmpAcumulado !== null) {
                    gmp = gmpAcumulado;
                    gdp = gmpAcumulado / 30;
                    hasCalculatedGmp = true;
                }
            }

            return {
                id: a.id,
                numero_chapeta: a.numero_chapeta,
                nombre_propietario: a.nombre_propietario,
                id_potrerada: p.id,
                estado: a.estado,
                pesoActual: (tienePesajePosterior && lastP) ? lastP.peso : pesoBase,
                gdp,
                gmp,
                gmpAcumulado,
                fechaIngresoEtapa,
                pesoIngresoEtapa,
                peso_ingreso: a.peso_ingreso,
                peso_compra: a.peso_compra,
                pesajesFiltrados: pesajesMap,
                hasCalculatedGmp,
                fechaUltimoPesaje: (tienePesajePosterior && lastP) ? lastP.fecha : (fechaIngresoEtapa || a.fecha_ingreso || null)
            };
        });

        const validGmpAnimals = processedAnimals.filter(a => a.hasCalculatedGmp);
        const avgGmp = validGmpAnimals.length > 0
            ? validGmpAnimals.reduce((acc, curr) => acc + (curr.gmp || 0), 0) / validGmpAnimals.length
            : 0;
        const validGmpAcumAnimals = processedAnimals.filter(a => a.gmpAcumulado !== null && a.gmpAcumulado !== undefined);
        const avgGmpAcum = validGmpAcumAnimals.length > 0
            ? validGmpAcumAnimals.reduce((acc, curr) => acc + (curr.gmpAcumulado || 0), 0) / validGmpAcumAnimals.length
            : null;

        const fechasRegistradasSet = new Set<string>();
        processedAnimals.forEach(a => {
            if (a.pesajesFiltrados) {
                Object.keys(a.pesajesFiltrados).forEach(f => fechasRegistradasSet.add(f));
            }
        });
        const fechasColumnas = Array.from(fechasRegistradasSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        const allWeighings: { fecha: string; peso: number; gdp: number; isAnchor?: boolean }[] = [];
        animals?.forEach(a => {
            let entryDateForChart: string | null = null;
            let entryWeightForChart: number | null = null;

            if (showFullHistory) {
                const baseW = a.peso_ingreso ?? a.peso_compra;
                if (a.fecha_ingreso && baseW) {
                    const f = String(a.fecha_ingreso).split('T')[0];
                    entryDateForChart = f;
                    entryWeightForChart = Number(baseW);
                    allWeighings.push({ fecha: f, peso: entryWeightForChart, gdp: 0, isAnchor: true });
                }
            } else if (p.etapa === 'ceba') {
                const cebaDate = a.fecha_ingreso_ceba || (a.etapa === 'ceba' ? a.fecha_ingreso : null);
                const cebaWeight = a.peso_ingreso_ceba || (a.etapa === 'ceba' ? (a.peso_ingreso ?? a.peso_compra) : null);
                if (cebaDate && cebaWeight) {
                    const f = String(cebaDate).split('T')[0];
                    entryDateForChart = f;
                    entryWeightForChart = Number(cebaWeight);
                    allWeighings.push({ fecha: f, peso: entryWeightForChart, gdp: 0, isAnchor: true });
                }
            } else {
                const baseW = a.peso_ingreso ?? a.peso_compra;
                if (a.fecha_ingreso && baseW) {
                    const f = String(a.fecha_ingreso).split('T')[0];
                    entryDateForChart = f;
                    entryWeightForChart = Number(baseW);
                    allWeighings.push({ fecha: f, peso: entryWeightForChart, gdp: 0, isAnchor: true });
                }
            }

            const registrosEtapaChrono = (showFullHistory
                ? (a.registros_pesaje || [])
                : (a.registros_pesaje || []).filter((r: any) => r.etapa?.toLowerCase() === p.etapa.toLowerCase())
            )
                .filter((r: any) => r && r.is_deleted !== true && esPesajePosteriorAIngreso(r.fecha, entryDateForChart || a.fecha_ingreso))
                .slice()
                .sort((x: any, y: any) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());

            let prevFechaChart: Date | null = entryDateForChart ? new Date(entryDateForChart + 'T12:00:00') : null;
            let prevPesoChart: number | null = entryWeightForChart !== null && entryWeightForChart > 0 ? entryWeightForChart : null;

            registrosEtapaChrono.forEach((r: any) => {
                const fecha = r.fecha.split('T')[0];
                const peso = Number(r.peso);
                let gdp = 0;
                if (prevFechaChart !== null && prevPesoChart !== null) {
                    const currDate = new Date(fecha + 'T12:00:00');
                    const days = differenceInDays(currDate, prevFechaChart);
                    gdp = days > 0 ? (peso - prevPesoChart) / days : Number(r.gdp_calculada || 0);
                    prevFechaChart = currDate;
                    prevPesoChart = peso;
                } else {
                    gdp = Number(r.gdp_calculada || 0);
                    prevFechaChart = new Date(fecha + 'T12:00:00');
                    prevPesoChart = peso;
                }
                allWeighings.push({ fecha, peso, gdp, isAnchor: false });
            });
        });

        const groupedByDate: { [key: string]: { totalPeso: number; totalGdp: number; countPeso: number; countGdp: number } } = {};
        allWeighings.forEach(w => {
            if (!groupedByDate[w.fecha]) {
                groupedByDate[w.fecha] = { totalPeso: 0, totalGdp: 0, countPeso: 0, countGdp: 0 };
            }
            groupedByDate[w.fecha].totalPeso += w.peso;
            groupedByDate[w.fecha].countPeso += 1;
            if (!w.isAnchor) {
                groupedByDate[w.fecha].totalGdp += w.gdp;
                groupedByDate[w.fecha].countGdp += 1;
            }
        });

        const history: ChartData[] = Object.keys(groupedByDate)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
            .map(date => ({
                fecha: format(new Date(date + 'T12:00:00'), 'dd MMM', { locale: es }),
                pesoPromedio: Math.round(groupedByDate[date].totalPeso / groupedByDate[date].countPeso),
                gmpPromedio: groupedByDate[date].countGdp > 0
                    ? Number(((groupedByDate[date].totalGdp / groupedByDate[date].countGdp) * 30).toFixed(2))
                    : null
            }));

        setDetailData({
            potrerada: { ...p, gmpAcumulado: avgGmpAcum ?? p.gmpAcumulado },
            potreroActual: potreroName,
            animales: processedAnimals,
            fechasColumnas,
            gmpPromedioGrupo: avgGmp,
            history,
            diasPotreroActual,
            areaPotreroActual: potreroArea,
            areaTotalSistema,
            fincaNombre
        });
    }, [rawDetailData, showFullHistory]);

    const handleAddPotrerada = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        if (!fincaId || !nuevaPotreradaNombre.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('potreradas')
                .insert({
                    id_finca: fincaId,
                    nombre: nuevaPotreradaNombre.trim(),
                    etapa: nuevaPotreradaEtapa,
                    id_rotacion: nuevaPotreradaRotacion || null
                });

            if (error) throw error;

            setNuevaPotreradaNombre('');
            setShowAddModal(false);
            void fetchPotreradasData();
        } catch (err: any) {
            await showAlert(
                'Error al agregar potrerada: ' + (err.code === '23505' ? 'Ya existe una potrerada con ese nombre.' : err.message),
                { title: 'Error', variant: 'error' }
            );
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (p: Potrerada) => {
        setEditingPotrerada(p);
        setNewName(p.nombre);
        setNewEtapa(p.etapa);
        setEditRotacion(p.id_rotacion);
    };

    const handleUpdateName = async () => {
        if (!editingPotrerada || !newName.trim() || !newEtapa) return;

        try {
            setLoading(true);
            const { error } = await supabase
                .from('potreradas')
                .update({
                    nombre: newName.trim(),
                    etapa: newEtapa,
                    id_rotacion: editRotacion || null
                })
                .eq('id', editingPotrerada.id);

            if (error) throw error;

            if (newEtapa !== editingPotrerada.etapa) {
                const animalsInPotrerada = animalesFinca.filter(a => a.id_potrerada === editingPotrerada.id);
                if (animalsInPotrerada.length > 0) {
                    const updatePromises = animalsInPotrerada.map(a => {
                        const animalData: any = { etapa: newEtapa, ok_ceba: false };
                        if (newEtapa === 'ceba') {
                            animalData.fecha_ingreso_ceba = getLocalIsoDate();
                            animalData.peso_ingreso_ceba = a.pesoActual;
                        } else if (editingPotrerada.etapa === 'ceba') {
                            animalData.fecha_ingreso_ceba = null;
                            animalData.peso_ingreso_ceba = null;
                        }
                        return supabase.from('animales').update(animalData).eq('id', a.id);
                    });

                    await Promise.all(updatePromises);
                }
            }

            setEditingPotrerada(null);
            void fetchPotreradasData();
        } catch (error: any) {
            await showAlert('Error al actualizar: ' + error.message, { title: 'Error', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const removePotrerada = async (id: string) => {
        const confirmed = await confirmAction(
            '¿Está seguro de eliminar esta potrerada? Tenga en cuenta que los animales perderán su referencia a la misma.',
            { title: 'Eliminar potrerada', confirmLabel: 'Sí, eliminar', destructive: true }
        );
        if (!confirmed) return;
        setLoading(true);
        try {
            await supabase.from('animales').update({ id_potrerada: null }).eq('id_potrerada', id);
            await supabase.from('animales').update({ ultima_potrerada_id: null }).eq('ultima_potrerada_id', id);

            const { error } = await supabase.from('potreradas').delete().eq('id', id);
            if (error) throw error;
            void fetchPotreradasData();
            toast('Potrerada eliminada.', 'success');
        } catch (err: any) {
            await showAlert('Error al eliminar potrerada: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleLimpiarPotrerada = async (potreradaId: string) => {
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        const confirmed = await confirmAction(
            '¿Estás seguro de que deseas limpiar esta potrerada? Los animales vendidos quedarán sin asignación de lote pero el historial se conserva.',
            { title: 'Limpiar potrerada', confirmLabel: 'Sí, limpiar', destructive: true }
        );
        if (!confirmed) return;
        try {
            const { error: stampError } = await supabase
                .from('animales')
                .update({ ultima_potrerada_id: potreradaId })
                .eq('id_potrerada', potreradaId)
                .eq('estado', 'vendido');
            if (stampError) throw stampError;

            const { error: clearError } = await supabase
                .from('animales')
                .update({ id_potrerada: null })
                .eq('id_potrerada', potreradaId)
                .eq('estado', 'vendido');
            if (clearError) throw clearError;

            await fetchPotreradasData();
            toast('Potrerada limpiada correctamente.', 'success');
        } catch (error: any) {
            await showAlert('Error al limpiar potrerada: ' + error.message, { title: 'Error', variant: 'error' });
        }
    };

    return (
        <div className="page-container potreradas-page">
            <div className="potreradas-header">
                <div>
                    <h1 className="title">Gestión de Lotes</h1>
                    <p className="potreradas-subtitle">Métricas y administración de grupos de animales.</p>
                </div>
                {role !== 'observador' && (
                    <button
                        type="button"
                        className="potreradas-add-btn"
                        onClick={() => {
                            if (isBloqueado) {
                                setShowUpsellModal(true);
                            } else {
                                setShowAddModal(true);
                            }
                        }}
                    >
                        <Plus size={20} aria-hidden="true" /> Nuevo Lote
                    </button>
                )}
            </div>

            <LicenseBlockedBanner
                licenciaInfo={licenciaInfo}
                onUpgradeClick={() => setShowUpsellModal(true)}
                expiredDetail="Puedes consultar los lotes, métricas e historial de pesajes, pero la creación de nuevos lotes, pesajes grupales y traslados se encuentran pausados hasta la renovación."
                overLimitDetail="Para registrar pesajes grupales y crear nuevos lotes, actualiza tu suscripción."
            />

            <search className="potreradas-search-wrap" role="search">
                <Search size={18} aria-hidden="true" className="potreradas-search-icon" />
                <input
                    type="search"
                    aria-label="Buscar lote por nombre o marca"
                    placeholder="Buscar por nombre o marca..."
                    value={potreradaSearch}
                    onChange={(e) => setPotreradaSearch(e.target.value)}
                    className="potreradas-search-input"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                />
                {potreradaSearch && (
                    <button
                        type="button"
                        className="potreradas-clear-btn"
                        aria-label="Limpiar búsqueda"
                        onClick={() => setPotreradaSearch('')}
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                )}
            </search>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--primary)' }}>Cargando potreradas...</div>
            ) : (
                <div className="table-container potreradas-list-wrap">
                    <table className="potreradas-main-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nombre Potrerada</th>
                                <th className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rotación / Potrero</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Marcas</th>
                                <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Animales</th>
                                <th className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</th>
                                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ganancias ({getModoLabel(modoGanancia)})</th>
                                <th className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Días Pesaje</th>
                                {(role === 'administrador' || role === 'vaquero') && <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {potreradas
                                .filter(p =>
                                    p.nombre.toLowerCase().includes(potreradaSearch.toLowerCase()) ||
                                    p.marcas.some(m => m.nombre.toLowerCase().includes(potreradaSearch.toLowerCase()))
                                )
                                .map((p, idx) => (
                                    <tr key={p.id} className="table-row-hover" style={{ borderBottom: idx < potreradas.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                        <td className="potreradas-col-name" style={{ padding: '16px 24px' }}>
                                            <button type="button" onClick={() => handleOpenDetail(p)} className="potreradas-name-btn">
                                                <span className="potreradas-name-title">{p.nombre}</span>
                                                <span className="potreradas-name-meta">{p.etapa}</span>
                                                <span className="potreradas-mobile-cue">Ver detalle ›</span>
                                            </button>
                                        </td>
                                        <td className="mobile-hide potreradas-col-loc" style={{ padding: '16px 24px' }}>
                                            {p.rotacionNombre ? (
                                                <div>
                                                    <div style={{ fontWeight: '600', color: 'var(--text)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <MapPin size={12} color="var(--primary)" aria-hidden="true" />
                                                        <span>{p.rotacionNombre}</span>
                                                    </div>
                                                    {p.potreroActualNombre && (
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '16px' }}>
                                                            {p.potreroActualNombre}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Sin potrero asignado</span>
                                            )}
                                        </td>
                                        <td className="potreradas-col-marcas" style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {p.marcas.length > 0 ? (
                                                    <>
                                                        {p.marcas.slice(0, 3).map((m, i) => (
                                                            <span key={i} title={`${m.nombre} (${m.count})`} style={{
                                                                fontSize: '0.7rem',
                                                                background: 'var(--surface-subtle)',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                color: 'var(--text-secondary)',
                                                                border: '1px solid var(--border-subtle)',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {m.nombre} <span style={{ opacity: 0.7 }}>({m.count})</span>
                                                            </span>
                                                        ))}
                                                        {p.marcas.length > 3 && (
                                                            <span title={p.marcas.slice(3).map(m => `${m.nombre} (${m.count})`).join(', ')} style={{
                                                                fontSize: '0.7rem',
                                                                background: 'var(--surface-inset)',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                color: 'var(--text-muted)',
                                                                border: '1px dashed var(--border-strong)',
                                                                cursor: 'help',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                +{p.marcas.length - 3} más
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="potreradas-col-animales" style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Users size={14} className="mobile-hide" aria-hidden="true" />
                                                    <span style={{ fontWeight: '600' }}>{p.animalCount}</span>
                                                    <span className="potreradas-action-label" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>anim.</span>
                                                </div>
                                                {p.vendidoCount > 0 && (
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--warning)', fontWeight: 'bold', marginTop: '2px', background: 'var(--warning-soft-bg)', padding: '1px 6px', borderRadius: '8px' }}>
                                                        {p.vendidoCount} vendido{p.vendidoCount > 1 ? 's' : ''}
                                                    </div>
                                                )}
                                                {p.cargaGlobal > 0 && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                        {p.cargaGlobal.toFixed(2)} C/Ha
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="mobile-hide potreradas-col-peso" style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <span className="potreradas-cell-prefix">Peso prom.</span>
                                            <div style={{ fontWeight: 'bold' }}>
                                                {Math.round(p.pesoEstimadoPromedio)} <span style={{ fontSize: '0.8rem', color: 'var(--primary-light)' }}>kg est.</span>
                                                {p.confianzaPeso === 'vencida' && (
                                                    <span title="Dato vencido (>180 días sin pesar): proyección congelada" style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--warning)', fontWeight: 700 }}>⚠️</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real: {Math.round(p.pesoPromedio)} kg</div>
                                        </td>
                                        <td className="potreradas-col-gmp" style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <span className="potreradas-cell-prefix">Ganancia ({getModoLabel(modoGanancia)})</span>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Últ:</span>
                                                    <span style={{ color: resolveGmpColor(p.gmpPromedio, umbralMedio, umbralAlto), fontWeight: 'bold' }}>
                                                        {toDisplayValue(p.gmpPromedio, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Acum:</span>
                                                    <span style={{ color: resolveGmpColor(p.gmpAcumulado, umbralMedio, umbralAlto), fontWeight: '500' }}>
                                                        {p.gmpAcumulado === null ? 'N/A' : toDisplayValue(p.gmpAcumulado, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="mobile-hide potreradas-col-dias" style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <div style={{
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                background: p.diasPesajePromedio > 60 ? 'var(--warning-soft-bg)' : 'var(--surface-subtle)',
                                                color: p.diasPesajePromedio > 60 ? 'var(--warning)' : 'var(--text)',
                                                fontSize: '0.85rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <Calendar size={12} aria-hidden="true" />
                                                {Math.round(p.diasPesajePromedio)} d
                                            </div>
                                        </td>
                                        {(role === 'administrador' || role === 'vaquero') && (
                                            <td className="potreradas-col-actions" style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                    {p.loteListoParaLimpiar ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleLimpiarPotrerada(p.id)}
                                                            className="potreradas-icon-btn potreradas-icon-btn--clean"
                                                            title="Limpiar Potrerada (todos los animales fueron vendidos)"
                                                        >
                                                            🧹 Limpiar Lote
                                                        </button>
                                                    ) : p.id !== 'sin-potrerada' ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => setManagingPotrerada(p)}
                                                                className="potreradas-icon-btn potreradas-icon-btn--manage"
                                                                title="Gestionar Animales"
                                                                aria-label={`Gestionar animales de ${p.nombre}`}
                                                            >
                                                                <Users size={16} aria-hidden="true" />
                                                                <span className="potreradas-action-label">Animales</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditClick(p)}
                                                                className="potreradas-icon-btn potreradas-icon-btn--edit"
                                                                title="Editar Potrerada"
                                                                aria-label={`Editar lote ${p.nombre}`}
                                                            >
                                                                <Edit2 size={16} aria-hidden="true" />
                                                                <span className="potreradas-action-label">Editar</span>
                                                            </button>
                                                            {role === 'administrador' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removePotrerada(p.id)}
                                                                    className="potreradas-icon-btn potreradas-icon-btn--delete"
                                                                    title="Eliminar Potrerada"
                                                                    aria-label={`Eliminar lote ${p.nombre}`}
                                                                >
                                                                    <Trash2 size={16} aria-hidden="true" />
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : null}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                    {potreradas.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                            No hay potreradas registradas en esta finca.
                        </div>
                    )}
                </div>
            )}

            <PotreradaManageAnimalsModal
                managingPotrerada={managingPotrerada}
                animalesFinca={animalesFinca}
                isMobile={isMobile}
                isBloqueado={isBloqueado}
                onShowUpsell={() => setShowUpsellModal(true)}
                onClose={() => setManagingPotrerada(null)}
                onRefresh={fetchPotreradasData}
            />

            <PotreradaDetailModal
                selectedDetailId={selectedDetailId}
                detailLoading={detailLoading}
                detailData={detailData}
                showFullHistory={showFullHistory}
                onToggleFullHistory={setShowFullHistory}
                fincaId={fincaId}
                role={role}
                modoGanancia={modoGanancia}
                umbralMedio={umbralMedio}
                umbralAlto={umbralAlto}
                isMobile={isMobile}
                onOpenMoveModal={() => {
                    if (isBloqueado) {
                        setShowUpsellModal(true);
                        return;
                    }
                    setShowMoveModal(true);
                }}
                onOpenWeighingForm={() => {
                    if (isBloqueado) {
                        setShowUpsellModal(true);
                        return;
                    }
                    setShowWeighingForm(true);
                }}
                onClose={() => setSelectedDetailId(null)}
            />

            {showMoveModal && detailData && (
                <PotreradaMoveAnimalsModal
                    detailData={detailData}
                    potreradas={potreradas}
                    isMobile={isMobile}
                    isBloqueado={isBloqueado}
                    onShowUpsell={() => setShowUpsellModal(true)}
                    onClose={() => setShowMoveModal(false)}
                    onMoved={async () => {
                        setShowMoveModal(false);
                        await fetchPotreradasData();
                        await handleOpenDetail(detailData.potrerada);
                    }}
                />
            )}

            {showWeighingForm && detailData && (
                <PotreradaGroupWeighingModal
                    detailData={detailData}
                    pesoEntradaCeba={pesoEntradaCeba}
                    isMobile={isMobile}
                    isBloqueado={isBloqueado}
                    onShowUpsell={() => setShowUpsellModal(true)}
                    onClose={() => setShowWeighingForm(false)}
                    onSaved={async () => {
                        setShowWeighingForm(false);
                        await handleOpenDetail(detailData.potrerada);
                    }}
                />
            )}

            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="card potreradas-modal-dialog" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: isMobile ? '1.2rem' : undefined }}>
                                <Plus size={22} color="var(--primary)" aria-hidden="true" /> Nueva Potrerada / Lote
                            </h2>
                            <button type="button" aria-label="Cerrar" onClick={() => setShowAddModal(false)} className="btn-icon" style={{ width: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={handleAddPotrerada}>
                            <div style={{ marginBottom: '18px' }}>
                                <label htmlFor="potreradas-new-name">Nombre de la Potrerada</label>
                                <input
                                    id="potreradas-new-name"
                                    type="text"
                                    placeholder="Ej: Lote 1 - Engorde"
                                    value={nuevaPotreradaNombre}
                                    onChange={e => setNuevaPotreradaNombre(e.target.value)}
                                    autoFocus={!isMobile}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label htmlFor="potreradas-new-etapa">Etapa del Ganado</label>
                                <select
                                    id="potreradas-new-etapa"
                                    value={nuevaPotreradaEtapa}
                                    onChange={e => setNuevaPotreradaEtapa(e.target.value)}
                                    required
                                >
                                    <option value="cria">Cría</option>
                                    <option value="levante">Levante</option>
                                    <option value="ceba">Ceba</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label htmlFor="potreradas-new-rot">Rotación Asignada (Opcional)</label>
                                <select
                                    id="potreradas-new-rot"
                                    value={nuevaPotreradaRotacion}
                                    onChange={e => setNuevaPotreradaRotacion(e.target.value)}
                                >
                                    <option value="">-- Sin Rotación Asignada --</option>
                                    {rotaciones.map(r => (
                                        <option key={r.id} value={r.id}>{r.nombre}</option>
                                    ))}
                                </select>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Vincula permanentemente este grupo a un conjunto de potreros.</p>
                            </div>

                            <div className="potreradas-modal-actions-row" style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} className="potreradas-modal-cancel-btn" style={{ flex: 1 }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={loading} style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    {loading ? 'Creando...' : 'Crear Potrerada'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingPotrerada && (
                <div className="modal-overlay" onClick={() => setEditingPotrerada(null)}>
                    <div className="card potreradas-modal-dialog" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: isMobile ? '1.2rem' : undefined }}>
                                <Edit2 size={22} color="var(--primary)" aria-hidden="true" /> Editar Potrerada
                            </h2>
                            <button type="button" aria-label="Cerrar" onClick={() => setEditingPotrerada(null)} className="btn-icon" style={{ width: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={e => { e.preventDefault(); void handleUpdateName(); }}>
                            <div style={{ marginBottom: '18px' }}>
                                <label htmlFor="potreradas-edit-name">Nuevo Nombre</label>
                                <input
                                    id="potreradas-edit-name"
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    autoFocus={!isMobile}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label htmlFor="potreradas-edit-etapa">Etapa de la Potrerada</label>
                                <select
                                    id="potreradas-edit-etapa"
                                    value={newEtapa}
                                    onChange={e => setNewEtapa(e.target.value)}
                                >
                                    <option value="cría">Cría</option>
                                    <option value="levante">Levante</option>
                                    <option value="ceba">Ceba</option>
                                </select>
                                {newEtapa !== editingPotrerada.etapa && (
                                    <div style={{ marginTop: '8px', padding: '12px', background: 'var(--warning-soft-bg)', color: 'var(--warning)', border: '1px solid var(--warning-soft-border)', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <AlertTriangle size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
                                        <span>
                                            <strong>Atención:</strong> Se cambiará la etapa a todos los animales del lote. Esto afectará el cálculo de sus ganancias de peso y reiniciará su etapa si pasan a Ceba.
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label htmlFor="potreradas-edit-rot">Rotación Asignada</label>
                                <select
                                    id="potreradas-edit-rot"
                                    value={editRotacion || ''}
                                    onChange={e => setEditRotacion(e.target.value || null)}
                                >
                                    <option value="">-- Sin Rotación --</option>
                                    {rotaciones.map(r => (
                                        <option key={r.id} value={r.id}>{r.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="potreradas-modal-actions-row" style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setEditingPotrerada(null)} className="potreradas-modal-cancel-btn" style={{ flex: 1 }}>
                                    Cancelar
                                </button>
                                <button type="submit" style={{ flex: 2 }}>
                                    Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {licenciaInfo && (
                <ModalUpsell
                    isOpen={showUpsellModal}
                    onClose={() => setShowUpsellModal(false)}
                    licenciaInfo={licenciaInfo}
                />
            )}
        </div>
    );
}
