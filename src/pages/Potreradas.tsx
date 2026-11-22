import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useIsMobile } from '../hooks/useIsMobile';
import ModalUpsell from '../components/ModalUpsell';
import { LicenseBlockedBanner } from '../components/LicenseBlockedBanner';
import { getLicenseBlockState } from '../utils/licenseUtils';
import { Users, Edit2, Calendar, Save, X, Plus, Trash2, Search, MapPin, TrendingUp, Info, Scale, Activity, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, Loader2 } from 'lucide-react';
import { captureElementCanvas } from '../utils/exportPdf';
import {
    toDisplayValue,
    getUnidadLabel,
    getModoLabel,
    getGmpColor as resolveGmpColor,
    getGmpRgb,
    calcularGmpUltimoPeriodo,
    calcularGmpAcumulado,
    esPesajePosteriorAIngreso,
    calcularFallbackGmpPorEtapa,
    calcularPesoEstimadoHoy,
    getConfianzaPeso,
    normalizarPesajesDesc,
    type ConfianzaPeso
} from '../utils/ganancia';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../utils/decimalInput';
import './Potreradas.css';

interface Potrerada {
    id: string;
    nombre: string;
    etapa: string;
    animalCount: number;
    vendidoCount: number;
    loteListoParaLimpiar: boolean;
    pesoPromedio: number;
    pesoEstimadoPromedio: number;
    confianzaPeso?: ConfianzaPeso;
    gmpPromedio: number;
    gmpAcumulado: number | null;
    diasPesajePromedio: number;
    marcas: { nombre: string; count: number }[];
    id_rotacion: string | null;
    rotacionNombre: string | null;
    potreroActualNombre: string | null;
    cargaGlobal: number;
}

interface AnimalPotrero {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    id_potrerada: string | null;
    potreradaNombre?: string;
    pesoActual: number;
    estado?: string;
    gdp?: number;
    gmp?: number;
    gmpAcumulado?: number | null;
    fechaIngresoEtapa?: string | null;
    pesoIngresoEtapa?: number | null;
    peso_compra?: number | null;
    peso_ingreso?: number | null;
    pesajesFiltrados?: { [fecha: string]: number };
    hasCalculatedGmp?: boolean;
    etapa?: string;
    fechaUltimoPesaje?: string | null;
}

interface ChartData {
    fecha: string;
    pesoPromedio: number;
    gmpPromedio: number | null;
}

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
    
    // Estado para nueva potrerada
    const [showAddModal, setShowAddModal] = useState(false);
    const [nuevaPotreradaNombre, setNuevaPotreradaNombre] = useState('');
    const [nuevaPotreradaEtapa, setNuevaPotreradaEtapa] = useState('levante');
    const [nuevaPotreradaRotacion, setNuevaPotreradaRotacion] = useState('');
    const [rotaciones, setRotaciones] = useState<{id: string, nombre: string}[]>([]);
    const [editRotacion, setEditRotacion] = useState<string | null>(null);
    
    // Umbrales GMP
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);
    const [pesoEntradaCeba, setPesoEntradaCeba] = useState(380);
    
    // Estados para búsqueda y gestión
    const [potreradaSearch, setPotreradaSearch] = useState('');
    const [managingPotrerada, setManagingPotrerada] = useState<Potrerada | null>(null);
    const [animalesFinca, setAnimalesFinca] = useState<AnimalPotrero[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchTermEnLote, setSearchTermEnLote] = useState('');
    const [filterPropietario, setFilterPropietario] = useState('');
    const [filterPotreradaActual, setFilterPotreradaActual] = useState('');
    const [updatingAnimal, setUpdatingAnimal] = useState<string | null>(null);

    // Estados para el detalle de la potrerada
    const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailData, setDetailData] = useState<{
        potrerada: Potrerada;
        potreroActual: string;
        animales: AnimalPotrero[];
        fechasColumnas: string[];
        gmpPromedioGrupo: number;
        history: ChartData[];
        diasPotreroActual: number | null;
        areaPotreroActual: number | null;
        areaTotalSistema: number | null;
        fincaNombre: string;
    } | null>(null);

    // Estado para ordenamiento en el detalle
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'numero_chapeta', direction: 'asc' });

    // Estado para historial completo
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [rawDetailData, setRawDetailData] = useState<{
        potrerada: Potrerada;
        animals: any[];
        fincaNombre: string;
        diasPotreroActual: number | null;
        areaTotalSistema: number | null;
        movsResData: any | null;
    } | null>(null);

    // Estado para el formulario de pesaje grupal
    const [weighingData, setWeighingData] = useState<{ [animalId: string]: string }>({});
    const [savingWeighings, setSavingWeighings] = useState(false);
    const [showWeighingForm, setShowWeighingForm] = useState(false);
    const [weighingDate, setWeighingDate] = useState(getLocalIsoDate());
    
    // Pdf ref & loader
    const chartsRef = useRef<HTMLDivElement>(null);
    const [exportingPdf, setExportingPdf] = useState(false);

    // Estado para modal de mover animales
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [selectedAnimalsToMove, setSelectedAnimalsToMove] = useState<Set<string>>(new Set());
    const [targetPotreradaId, setTargetPotreradaId] = useState<string>('');
    const [movingAnimals, setMovingAnimals] = useState(false);
    const [searchMoveAnimals, setSearchMoveAnimals] = useState('');
    const [moveDate, setMoveDate] = useState(getLocalIsoDate());
    const [manageTab, setManageTab] = useState<'en-lote' | 'agregar'>('en-lote');
    const isMobile = useIsMobile();

    useEffect(() => {
        if (managingPotrerada) {
            setManageTab('en-lote');
        }
    }, [managingPotrerada?.id]);

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

            // Agrupar animales por potrerada en un Map para consultas O(1)
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

            // [NUEVO] Agregar potrerada virtual para animales sin asignar
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

                // Solo promediar sobre animales activos (excluir vendidos que aún conserven id_potrerada)
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

                    // 1. GMP Último Periodo (excluyendo pesajes del mismo día de ingreso)
                    if (tienePesajePosterior && lastP) {
                        const gmpLast = calcularGmpUltimoPeriodo(lastP, a.fecha_ingreso, pesoBase, penultimoP);
                        if (gmpLast !== null) {
                            totalGmpLast += Number(gmpLast);
                            validGmpLastCount++;
                        }

                        // 2. GMP Acumulada Histórica: desde ingreso en finca (peso_ingreso) hasta último pesaje
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

    // Efecto para abrir potrerada desde el Dashboard
    useEffect(() => {
        const state = location.state as { idPotrerada?: string };
        if (state?.idPotrerada && potreradas.length > 0) {
            const pot = potreradas.find(p => p.id === state.idPotrerada);
            if (pot) {
                handleOpenDetail(pot);
                // Limpiar el estado para que no se reabra al recargar o navegar
                window.history.replaceState({}, document.title);
            }
        }
    }, [location, potreradas]);

    useEffect(() => {
        fetchPotreradasData();
    }, [fincaId]);

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
            fetchPotreradasData();
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
            fetchPotreradasData();
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
            // Liberar a los animales de la potrerada actual y del historial de última potrerada
            await supabase.from('animales').update({ id_potrerada: null }).eq('id_potrerada', id);
            await supabase.from('animales').update({ ultima_potrerada_id: null }).eq('ultima_potrerada_id', id);

            const { error } = await supabase.from('potreradas').delete().eq('id', id);
            if (error) throw error;
            fetchPotreradasData();
            toast('Potrerada eliminada.', 'success');
        } catch (err: any) {
            await showAlert('Error al eliminar potrerada: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleAddAnimal = async (animalId: string) => {
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        if (!managingPotrerada) return;
        setUpdatingAnimal(animalId);
        try {
            const updatePayload: any = { id_potrerada: managingPotrerada.id };
            if (managingPotrerada.etapa === 'ceba') {
                updatePayload.etapa = 'ceba';
                updatePayload.ok_ceba = false;
            }
            const { error } = await supabase
                .from('animales')
                .update(updatePayload)
                .eq('id', animalId);
            
            if (error) throw error;
            await fetchPotreradasData();
        } catch (error: any) {
            await showAlert('Error al agregar animal: ' + error.message, { title: 'Error', variant: 'error' });
        } finally {
            setUpdatingAnimal(null);
        }
    };

    const handleRemoveAnimal = async (animalId: string) => {
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        setUpdatingAnimal(animalId);
        try {
            const { error } = await supabase
                .from('animales')
                .update({ id_potrerada: null })
                .eq('id', animalId);
            
            if (error) throw error;
            await fetchPotreradasData();
        } catch (error: any) {
            await showAlert('Error al eliminar animal: ' + error.message, { title: 'Error', variant: 'error' });
        } finally {
            setUpdatingAnimal(null);
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
            // 1. Guardar sello histórico en ultima_potrerada_id
            const { error: stampError } = await supabase
                .from('animales')
                .update({ ultima_potrerada_id: potreradaId })
                .eq('id_potrerada', potreradaId)
                .eq('estado', 'vendido');
            if (stampError) throw stampError;

            // 2. Desasociar de la potrerada
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

    const resetManagementSearch = () => {
        setSearchTerm('');
        setSearchTermEnLote('');
        setFilterPropietario('');
        setFilterPotreradaActual('');
    };

    const filteredAnimalesFinca = animalesFinca.filter(a => {
        const matchesSearch = a.numero_chapeta.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             a.nombre_propietario.toLowerCase().includes(searchTerm.toLowerCase());
        const isNotAlreadyInThisPot = a.id_potrerada !== managingPotrerada?.id;
        const isActivo = a.estado === 'activo';
        const matchesPropietario = !filterPropietario || a.nombre_propietario === filterPropietario;
        const matchesPotrerada = !filterPotreradaActual || 
            (filterPotreradaActual === '__sin_lote__' ? !a.id_potrerada : a.potreradaNombre === filterPotreradaActual);
        return matchesSearch && isNotAlreadyInThisPot && isActivo && matchesPropietario && matchesPotrerada;
    });

    const propietariosOptions = [...new Set(
        animalesFinca.filter(a => a.estado === 'activo' && a.id_potrerada !== managingPotrerada?.id)
            .map(a => a.nombre_propietario).filter(Boolean)
    )].sort();

    const potreradasOptions = [...new Set(
        animalesFinca.filter(a => a.estado === 'activo' && a.id_potrerada !== managingPotrerada?.id)
            .map(a => a.potreradaNombre || '')
    )].sort();



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

            // MEJORA 3: Consultas de detalle en paralelo
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
        if (!rawDetailData) return;
        const { potrerada: p, animals, fincaNombre, diasPotreroActual, areaTotalSistema } = rawDetailData;
        const firstAnimal = animals.length > 0 ? (animals[0] as any) : null;
        const potreroName = firstAnimal?.potreros?.nombre || 'Sin potrero asignado';
        const potreroArea = firstAnimal?.potreros?.area_hectareas || null;

        // 3. Procesar animales y sus métricas
        const processedAnimals: AnimalPotrero[] = (animals || []).map((a: any) => {
            const registros = normalizarPesajesDesc(a.registros_pesaje);

            const registrosEtapa = showFullHistory
                ? [...registros].reverse()
                : registros
                    .filter((r: any) => r.etapa?.toLowerCase() === p.etapa.toLowerCase())
                    .reverse();

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
                // Para levante y cría, el ingreso a la etapa es siempre el ingreso a la finca real (no la compra)
                fechaIngresoEtapa = a.fecha_ingreso;
                pesoIngresoEtapa = a.peso_ingreso;
            }

            const pesajesMap: Record<string, number> = {};
            registrosEtapa.forEach((r: any) => {
                // Normalizar siempre a YYYY-MM-DD para evitar problemas con timestamps
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
                gdp: gdp,
                gmp: gmp,
                gmpAcumulado: gmpAcumulado,
                fechaIngresoEtapa: fechaIngresoEtapa,
                pesoIngresoEtapa: pesoIngresoEtapa,
                peso_ingreso: a.peso_ingreso,
                peso_compra: a.peso_compra,
                pesajesFiltrados: pesajesMap,
                hasCalculatedGmp: hasCalculatedGmp,
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
        const fechasColumnas = Array.from(fechasRegistradasSet).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());

        // 4. Preparar datos para las gráficas (agrupar pesajes por fecha)
        const allWeighings: { fecha: string; peso: number; gdp: number; isAnchor?: boolean }[] = [];
        animals?.forEach(a => {
            let entryDateForChart: string | null = null;
            let entryWeightForChart: number | null = null;
            // Inyectar el peso inicial como punto de anclaje (no aporta GMP=0 a la curva de ganancia)
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

            // Calcular GDP secuencial desde el punto de anclaje para consistencia total en la gráfica
            let prevFechaChart: Date | null = entryDateForChart ? new Date(entryDateForChart + 'T12:00:00') : null;
            let prevPesoChart: number | null = entryWeightForChart !== null && entryWeightForChart > 0 ? entryWeightForChart : null;

            registrosEtapaChrono.forEach((r: any) => {
                const fecha = r.fecha.split('T')[0];
                const peso = Number(r.peso);
                let gdp = 0;
                if (prevFechaChart !== null && prevPesoChart !== null) {
                    const currDate = new Date(fecha + 'T12:00:00');
                    const days = differenceInDays(currDate, prevFechaChart);
                    if (days > 0) {
                        gdp = (peso - prevPesoChart) / days;
                    } else {
                        gdp = Number(r.gdp_calculada || 0);
                    }
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
            fechasColumnas: fechasColumnas,
            gmpPromedioGrupo: avgGmp,
            history,
            diasPotreroActual,
            areaPotreroActual: potreroArea,
            areaTotalSistema,
            fincaNombre
        });

    }, [rawDetailData, showFullHistory]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAnimals = useMemo(() => {
        if (!detailData?.animales) return [];
        
        return [...detailData.animales].sort((a: any, b: any) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            
            let valA = a[key];
            let valB = b[key];

            // Manejo especial para chapeta (alfanumérico)
            if (key === 'numero_chapeta') {
                return direction === 'asc' 
                    ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
                    : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [detailData?.animales, sortConfig]);

    const handleOpenWeighingForm = () => {
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        if (!detailData) return;
        // Precargar con chapeta de cada animal, peso en blanco
        const initial: { [id: string]: string } = {};
        detailData.animales.forEach(a => { initial[a.id] = ''; });
        setWeighingData(initial);
        setWeighingDate(getLocalIsoDate());
        setShowWeighingForm(true);
    };

    const handleExportPDF = async () => {
        if (!detailData) return;
        setExportingPdf(true);
        try {
            const doc = new jsPDF('l', 'mm', 'letter');

            // 0. Obtener configuración para el Punto de Equilibrio
            const { data: configKpi } = await supabase
                .from('configuracion_kpi')
                .select('precio_venta_promedio, costo_mensual_animal, participacion_utilidad')
                .eq('id_finca', fincaId)
                .single();

            const precioVenta = parseFloat(configKpi?.precio_venta_promedio as any) || 0;
            const costoMensual = parseFloat(configKpi?.costo_mensual_animal as any) || 0;
            const participacion = parseFloat(configKpi?.participacion_utilidad as any) || 0.6;
            const peKgMes = precioVenta > 0 ? (costoMensual / participacion) / precioVenta : 0;

            const p = detailData.potrerada;
            const fechaDoc = format(new Date(), 'dd/MM/yyyy');
            const marginX = 14;
            let currentY = 18;

            // --- HEADER ORGANIZATION (Encased in a Card) ---
            const etapaStr = p.etapa || 'N/A';
            const headerBoxW = doc.internal.pageSize.width - (marginX * 2);
            const headerBoxH = 20;
            
            // Draw Background Card for Header
            doc.setFillColor(252, 253, 254);
            doc.setDrawColor(220, 224, 228);
            doc.setLineWidth(0.3);
            doc.roundedRect(marginX, currentY - 6, headerBoxW, headerBoxH, 2, 2, 'FD');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(60, 60, 60);
            
            // Texto dentro del card
            const textPadding = 6;
            const topRowY = currentY + 1;
            const bottomRowY = currentY + 9;

            // Línea 1 (Finca y Fecha)
            doc.setFont('helvetica', 'bold');
            doc.text('Finca:', marginX + textPadding, topRowY);
            doc.setFont('helvetica', 'normal');
            doc.text(detailData.fincaNombre, marginX + textPadding + 13, topRowY);

            doc.setFont('helvetica', 'bold');
            doc.text('Fecha:', doc.internal.pageSize.width - marginX - textPadding - 35, topRowY);
            doc.setFont('helvetica', 'normal');
            doc.text(fechaDoc, doc.internal.pageSize.width - marginX - textPadding, topRowY, { align: 'right' });
            
            // Línea 2 (Lote y Etapa)
            doc.setFont('helvetica', 'bold');
            doc.text('Lote:', marginX + textPadding, bottomRowY);
            doc.setFont('helvetica', 'normal');
            doc.text(p.nombre, marginX + textPadding + 11, bottomRowY);

            doc.setFont('helvetica', 'bold');
            doc.text('Etapa:', doc.internal.pageSize.width - marginX - textPadding - 35, bottomRowY);
            doc.setFont('helvetica', 'normal');
            doc.text(etapaStr, doc.internal.pageSize.width - marginX - textPadding, bottomRowY, { align: 'right' });

            currentY += 22;

            // --- 6 INDEPENDENT BOXES (2 ROWS OF 3) ---
            const boxesPerRow = 3;
            const boxWidth = 78;
            const boxHeight = 22;
            const rowGap = 5;
            const totalWidthAvailable = doc.internal.pageSize.width - (marginX * 2);
            const colGap = (totalWidthAvailable - (boxWidth * boxesPerRow)) / (boxesPerRow - 1);

            const drawBox = (x: number, y: number, title: string, value: string, subtitle: string, valueColor: number[]) => {
                // Box background & border
                doc.setFillColor(252, 253, 254);
                doc.setDrawColor(220, 224, 228);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, y, boxWidth, boxHeight, 2, 2, 'FD');

                // Titulillo
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(130);
                doc.text(title.toUpperCase(), x + boxWidth / 2, y + 6, { align: 'center' });

                // Valor Grande
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
                doc.text(value, x + boxWidth / 2, y + 15, { align: 'center' });

                // Subtitulillo
                if (subtitle) {
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(150);
                    doc.text(subtitle, x + boxWidth / 2, y + 19, { align: 'center' });
                }
            };

            // Colores Semáforo dinámicos
            const ultimoGmpLote = detailData.gmpPromedioGrupo;
            const historicoGmpLote = p.gmpAcumulado ?? detailData.gmpPromedioGrupo;

            const lastGmpColor = getGmpRgb(ultimoGmpLote, umbralMedio, umbralAlto);
            const acumGmpColor = getGmpRgb(historicoGmpLote, umbralMedio, umbralAlto);

            // FILA 1
            let xPos = marginX;
            // Caja 1: Animales
            drawBox(xPos, currentY, 'TOTAL ANIMALES', `${detailData.animales.length} Cabezas`, 'Población actual', [40, 40, 40]);
            xPos += boxWidth + colGap;

            // Caja 2: Tiempo en Potrero
            const diasTxt = detailData.diasPotreroActual !== null ? `${detailData.diasPotreroActual} Días` : '-';
            drawBox(xPos, currentY, 'TIEMPO EN POTRERO', diasTxt, detailData.potreroActual, [40, 40, 40]);
            xPos += boxWidth + colGap;

            // Caja 3: Productividad (Kilos/Ha/Mes)
            const numAnimales = detailData.animales.length;
            const avgGmp = ultimoGmpLote;
            const areaSistema = detailData.areaTotalSistema || 1;
            
            const kilosHaMes = (numAnimales * avgGmp) / areaSistema;
            const cargaGlobalStr = (numAnimales / areaSistema).toFixed(2);
            
            drawBox(xPos, currentY, 'PRODUCTIVIDAD', `${kilosHaMes.toFixed(1)} kg/Ha/Mes`, `Carga: ${cargaGlobalStr} Cab/Ha`, [40, 40, 40]);

            currentY += boxHeight + rowGap;

            // FILA 2
            xPos = marginX;
            // Caja 4: GMP Histórico
            drawBox(xPos, currentY, `${getModoLabel(modoGanancia)} HISTÓRICO LOTE`, `${toDisplayValue(historicoGmpLote, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, 'ACUMULADO', acumGmpColor);
            xPos += boxWidth + colGap;

            // Caja 5: Último GMP
            drawBox(xPos, currentY, `ÚLTIMO ${getModoLabel(modoGanancia)}`, `${toDisplayValue(ultimoGmpLote, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, 'Muestra más reciente', lastGmpColor);
            xPos += boxWidth + colGap;

            // Caja 6: Punto de Equilibrio
            drawBox(xPos, currentY, 'PUNTO DE EQUILIBRIO', `${toDisplayValue(peKgMes, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, `${getModoLabel(modoGanancia)} por animal`, [40, 40, 40]);

            currentY += boxHeight + 12;

            // Añadir las gráficas si existen y se pueden capturar
            if (chartsRef.current && detailData.history.length > 1) {
                const exportBg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#1E1E1E';
                const { canvas, imgData } = await captureElementCanvas(chartsRef.current, {
                    backgroundColor: exportBg,
                });
                
                const imgWidth = 250;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                
                // Si la imagen no cabe en la primera hoja (poco probable, pero por si acaso)
                if (currentY + imgHeight > 200) {
                    doc.addPage();
                    currentY = 20;
                }
                
                doc.addImage(imgData, 'PNG', marginX, currentY, imgWidth, imgHeight);
                currentY += imgHeight + 15;
            }

            // Datos tabla
            // Datos tabla
            const tableHead: any[][] = [];
            if (p.etapa === 'levante') {
                const fechaIngreso = sortedAnimals[0]?.fechaIngresoEtapa
                    ? format(new Date(sortedAnimals[0].fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy')
                    : '';
                tableHead.push(['#', 'Chapeta', 'Propietario', `Peso Compra\n${fechaIngreso}`, `Peso Ingreso\n${fechaIngreso}`, 'Peso Actual']);
            } else {
                const fechaIngreso = sortedAnimals[0]?.fechaIngresoEtapa
                    ? format(new Date(sortedAnimals[0].fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy')
                    : '';
                tableHead.push(['#', 'Chapeta', 'Propietario', `Peso Ingreso\n${fechaIngreso}`, 'Peso Actual']);
            }

            // Filtrar fechas que no sean la fecha de ingreso (igual que en la tabla visual)
            const ingresoFecha = sortedAnimals[0]?.fechaIngresoEtapa || null;
            const activeSortedDates = [...detailData.fechasColumnas]
                .sort((a,b) => new Date(a).getTime() - new Date(b).getTime())
                .filter(fecha => fecha !== ingresoFecha && detailData.animales.some(a => a.pesajesFiltrados && a.pesajesFiltrados[fecha] && a.fechaIngresoEtapa !== fecha));
            
            activeSortedDates.forEach(fecha => {
                tableHead[0].push(`Pesaje ${format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}`);
            });
            tableHead[0].push(`${getModoLabel(modoGanancia)} Prom. (${getUnidadLabel(modoGanancia)})`);

            const tableBody = sortedAnimals.map((a, idx) => {
                const row: any[] = [
                    idx + 1,
                    `${a.numero_chapeta}${a.estado === 'vendido' ? ' (Vendido)' : ''}`,
                    a.nombre_propietario || '-',
                ];

                if (p.etapa === 'levante') {
                    row.push(a.peso_compra ? `${Math.round(a.peso_compra)} kg` : '-');
                }

                row.push(a.pesoIngresoEtapa ? `${Math.round(a.pesoIngresoEtapa)} kg` : '-');
                row.push(a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-');

                activeSortedDates.forEach(fecha => {
                    const isEntryDate = a.fechaIngresoEtapa === fecha;
                    row.push(a.pesajesFiltrados?.[fecha] && !isEntryDate ? `${Math.round(a.pesajesFiltrados[fecha])} kg` : '-');
                });
                
                row.push(a.gmp ? toDisplayValue(a.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1) : '-');
                return row;
            });

            // Footer - TOTALES row
            const colCount = tableHead[0].length;
            const rowTotales = Array(colCount).fill('');
            rowTotales[2] = 'TOTALES:';

            let colIdx = 3;
            if (p.etapa === 'levante') {
                const totalCompra = detailData.animales.reduce((sum, a) => sum + (a.peso_compra || 0), 0);
                rowTotales[colIdx] = totalCompra > 0 ? `${Math.round(totalCompra).toLocaleString('es-CO')} kg` : '-';
                colIdx++;
            }
            const totalIngreso = detailData.animales.reduce((sum, a) => sum + (a.pesoIngresoEtapa || 0), 0);
            rowTotales[colIdx] = totalIngreso > 0 ? `${Math.round(totalIngreso).toLocaleString('es-CO')} kg` : '-';
            colIdx++;
            const totalActual = detailData.animales.reduce((sum, a) => sum + (a.pesoActual || 0), 0);
            rowTotales[colIdx] = totalActual > 0 ? `${Math.round(totalActual).toLocaleString('es-CO')} kg` : '-';
            colIdx++;
            activeSortedDates.forEach(fecha => {
                const total = detailData.animales.reduce((acc, a) => acc + (a.pesajesFiltrados?.[fecha] || 0), 0);
                rowTotales[colIdx] = total > 0 ? `${Math.round(total).toLocaleString('es-CO')} kg` : '-';
                colIdx++;
            });

            // Footer - PROMEDIOS row
            const rowPromedios = Array(colCount).fill('');
            rowPromedios[2] = 'PROMEDIOS:';
            let promIdx = 3;
            if (p.etapa === 'levante') {
                const valid = detailData.animales.filter(a => a.peso_compra);
                const prom = valid.length > 0 ? valid.reduce((s, a) => s + (a.peso_compra || 0), 0) / valid.length : 0;
                rowPromedios[promIdx] = prom > 0 ? `${Math.round(prom)} kg` : '-';
                promIdx++;
            }
            const validIng = detailData.animales.filter(a => a.pesoIngresoEtapa);
            const promIng = validIng.length > 0 ? validIng.reduce((s, a) => s + (a.pesoIngresoEtapa || 0), 0) / validIng.length : 0;
            rowPromedios[promIdx] = promIng > 0 ? `${Math.round(promIng)} kg` : '-';
            promIdx++;
            const promActual = detailData.animales.length > 0 ? totalActual / detailData.animales.length : 0;
            rowPromedios[promIdx] = promActual > 0 ? `${Math.round(promActual)} kg` : '-';
            promIdx++;
            activeSortedDates.forEach(fecha => {
                const validAnimals = detailData.animales.filter(a => a.pesajesFiltrados?.[fecha]);
                const total = validAnimals.reduce((acc, a) => acc + (a.pesajesFiltrados![fecha] || 0), 0);
                const avg = validAnimals.length > 0 ? total / validAnimals.length : 0;
                rowPromedios[promIdx] = avg > 0 ? `${Math.round(avg)} kg` : '-';
                promIdx++;
            });

            // Forzar nueva página para la tabla de animales si la primera página ya tiene mucho contenido
            doc.addPage();
            currentY = 20;

            autoTable(doc, {
                startY: currentY,
                head: tableHead,
                body: tableBody,
                foot: [rowTotales, rowPromedios],
                theme: 'striped',
                headStyles: { fillColor: [46, 125, 50], fontSize: 8, halign: 'center' },
                footStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40], fontSize: 8, fontStyle: 'bold' },
                styles: { fontSize: 7, halign: 'center', valign: 'middle' },
                columnStyles: {
                    0: { cellWidth: 10 },
                    1: { halign: 'left', fontStyle: 'bold' },
                    2: { halign: 'left' }
                },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.index === tableHead[0].length - 1) {
                        const val = parseFloat(data.cell.raw as string);
                        if (!isNaN(val)) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.textColor = getGmpRgb(val, umbralMedio, umbralAlto);
                        }
                    }
                    // Fila PROMEDIOS: fondo verde suave y texto verde
                    if (data.section === 'foot' && data.row.index === 1) {
                        data.cell.styles.fillColor = [232, 245, 233];
                        data.cell.styles.textColor = [46, 125, 50];
                    }
                }
            });

            const finalY = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Agrogestión v3.0 - Página 1`, 260, finalY, { align: 'right' });

            doc.save(`Informe_Lote_${p.nombre.replace(/\s+/g, '_')}_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
        } catch (error) {
            console.error("Error al generar PDF:", error);
            await showAlert('Hubo un error al exportar el informe.', { title: 'Error al exportar', variant: 'error' });
        } finally {
            setExportingPdf(false);
        }
    };

    // Mover animales de potrerada
    const handleOpenMoveModal = () => {
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        setSelectedAnimalsToMove(new Set());
        setTargetPotreradaId('');
        setSearchMoveAnimals('');
        setMoveDate(getLocalIsoDate());
        setShowMoveModal(true);
    };

    const handleToggleAnimalMove = (animalId: string) => {
        setSelectedAnimalsToMove(prev => {
            const next = new Set(prev);
            if (next.has(animalId)) next.delete(animalId);
            else next.add(animalId);
            return next;
        });
    };

    const handleSelectAllAnimals = () => {
        if (!detailData) return;
        const term = searchMoveAnimals.toLowerCase().trim();
        const visibleAnimals = detailData.animales.filter(a =>
            !term ||
            a.numero_chapeta.toLowerCase().includes(term) ||
            (a.nombre_propietario || '').toLowerCase().includes(term)
        );
        const allVisibleSelected = visibleAnimals.every(a => selectedAnimalsToMove.has(a.id));
        setSelectedAnimalsToMove(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleAnimals.forEach(a => next.delete(a.id));
            } else {
                visibleAnimals.forEach(a => next.add(a.id));
            }
            return next;
        });
    };

    const handleConfirmMoveAnimals = async () => {
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        if (!detailData || selectedAnimalsToMove.size === 0 || !targetPotreradaId) return;
        const targetPotCheck = potreradas.find(p => p.id === targetPotreradaId);
        if (targetPotCheck?.etapa === 'ceba' && detailData.potrerada.etapa !== 'ceba') {
            const dateError = getGanadoDateError(moveDate, 'La fecha de movimiento');
            if (dateError) {
                await showAlert(dateError, { title: 'Dato inválido', variant: 'warning' });
                return;
            }
        }
        setMovingAnimals(true);
        try {
            const ids = Array.from(selectedAnimalsToMove);
            const targetPot = potreradas.find(p => p.id === targetPotreradaId);
            
            if (targetPot) {
                const updates = ids.map(id => {
                    const animal = detailData.animales.find(a => a.id === id);
                    const payload: any = { 
                        id_potrerada: targetPotreradaId,
                        etapa: targetPot.etapa 
                    };
                    
                    if (targetPot.etapa === 'ceba' && detailData.potrerada.etapa !== 'ceba') {
                        payload.fecha_ingreso_ceba = moveDate;
                        payload.peso_ingreso_ceba = animal?.pesoActual || animal?.peso_compra || animal?.peso_ingreso || null;
                    }
                    
                    return supabase.from('animales').update(payload).eq('id', id);
                });
                
                const results = await Promise.all(updates);
                const errors = results.filter(r => r.error);
                if (errors.length > 0) throw errors[0].error;
            } else {
                const { error } = await supabase
                    .from('animales')
                    .update({ id_potrerada: targetPotreradaId })
                    .in('id', ids);
                if (error) throw error;
            }

            setShowMoveModal(false);
            setSelectedAnimalsToMove(new Set());
            setTargetPotreradaId('');
            // Refrescar detalle y lista
            await fetchPotreradasData();
            await handleOpenDetail(detailData.potrerada);
        } catch (err) {
            console.error('Error moviendo animales:', err);
            await showAlert('Ocurrió un error al mover los animales. Intenta de nuevo.', { title: 'Error', variant: 'error' });
        } finally {
            setMovingAnimals(false);
        }
    };

    const handleSaveWeighings = async () => {
        if (!detailData) return;
        const dateError = getGanadoDateError(weighingDate, 'La fecha del pesaje');
        if (dateError) {
            await showAlert(dateError, { title: 'Dato inválido', variant: 'warning' });
            return;
        }
        const etapa = detailData.potrerada.etapa;
        const idsOkCeba: string[] = [];

        // Filtrar solo los que tienen peso ingresado
        const registros = detailData.animales
            .filter(a => {
                const val = parseDecimalInput(weighingData[a.id]);
                return !isNaN(val) && val > 0;
            })
            .map(a => {
                const newPeso = parseDecimalInput(weighingData[a.id]);
                let gdp: number | null = null;
                let gmp: number | null = null;

                if (a.pesoActual && a.fechaUltimoPesaje) {
                    const prevDate = new Date(a.fechaUltimoPesaje + 'T12:00:00');
                    const currDate = new Date(weighingDate + 'T12:00:00');
                    const days = differenceInDays(currDate, prevDate);
                    
                    if (days > 0) {
                        gdp = (newPeso - a.pesoActual) / days;
                        gmp = gdp * 30;
                    }
                }

                // Si están en levante y superan el umbral, se marcan para mercado
                if (etapa === 'levante' && newPeso >= pesoEntradaCeba) {
                    idsOkCeba.push(a.id);
                }

                return {
                    id_animal: a.id,
                    peso: newPeso,
                    fecha: weighingDate,
                    etapa: etapa,
                    id_potrero: null,
                    gdp_calculada: gdp,
                    gmp_calculada: gmp
                };
            });

        if (registros.length === 0) {
            await showAlert('Ingresa al menos un peso para guardar.', { title: 'Sin datos', variant: 'warning' });
            return;
        }

        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }

        setSavingWeighings(true);
        try {
            const { error } = await supabase
                .from('registros_pesaje')
                .insert(registros);

            if (error) throw error;

            // Actualizar animales que alcanzaron el umbral
            if (idsOkCeba.length > 0) {
                await supabase
                    .from('animales')
                    .update({ ok_ceba: true })
                    .in('id', idsOkCeba);
            }

            setShowWeighingForm(false);
            setWeighingData({});
            // Refrescar la tarjeta de detalle
            await handleOpenDetail(detailData.potrerada);
            toast(
                `✅ ${registros.length} pesaje(s) guardado(s) correctamente.${idsOkCeba.length > 0 ? ` ${idsOkCeba.length} animal(es) pasaron al Mercado de Ceba.` : ''}`,
                'success'
            );
        } catch (err: any) {
            await showAlert('Error al guardar pesajes: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setSavingWeighings(false);
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
                                                <span style={{
                                                    color: resolveGmpColor(p.gmpPromedio, umbralMedio, umbralAlto),
                                                    fontWeight: 'bold'
                                                }}>
                                                    {toDisplayValue(p.gmpPromedio, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Acum:</span>
                                                <span style={{
                                                    color: resolveGmpColor(p.gmpAcumulado, umbralMedio, umbralAlto),
                                                    fontWeight: '500'
                                                }}>
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

            {managingPotrerada && (() => {
                const animalesEnLoteCount = animalesFinca.filter(a => a.id_potrerada === managingPotrerada.id).length;
                return (
                <div className="modal-overlay" onClick={() => { setManagingPotrerada(null); resetManagementSearch(); }}>
                    <div className="card modal-content" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="potreradas-modal-header">
                            <div className="potreradas-modal-header-top" style={{ marginBottom: '6px' }}>
                                <h2 style={{ margin: 0, color: 'var(--primary-light)', fontSize: isMobile ? '1.15rem' : '1.4rem' }}>
                                    Gestionar: {managingPotrerada.nombre}
                                </h2>
                                <button type="button" aria-label="Cerrar" onClick={() => { setManagingPotrerada(null); resetManagementSearch(); }} className="btn-icon" style={{ width: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                                    <X size={20} aria-hidden="true" />
                                </button>
                            </div>
                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>
                                {managingPotrerada.etapa.toUpperCase()} | {animalesEnLoteCount} animales
                            </p>
                        </div>

                        {isMobile && (
                            <div role="tablist" aria-label="Gestionar animales del lote" className="potreradas-tablist">
                                <button
                                    type="button"
                                    role="tab"
                                    id="potreradas-tab-en-lote"
                                    aria-selected={manageTab === 'en-lote'}
                                    className="potreradas-tab-btn"
                                    onClick={() => setManageTab('en-lote')}
                                >
                                    En este lote ({animalesEnLoteCount})
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    id="potreradas-tab-agregar"
                                    aria-selected={manageTab === 'agregar'}
                                    className="potreradas-tab-btn"
                                    onClick={() => setManageTab('agregar')}
                                >
                                    Agregar otros ({filteredAnimalesFinca.length})
                                </button>
                            </div>
                        )}

                        {/* Content Area */}
                        <div className="responsive-grid" style={{ flex: 1, gap: '1px', background: 'var(--border-subtle)', overflow: 'hidden', minHeight: 0, display: isMobile ? 'flex' : undefined, flexDirection: isMobile ? 'column' : undefined }}>

                            {/* Current Animals Column */}
                            <div
                                className="potreradas-manage-panel"
                                role={isMobile ? 'tabpanel' : undefined}
                                aria-labelledby={isMobile ? 'potreradas-tab-en-lote' : undefined}
                                hidden={isMobile && manageTab !== 'en-lote'}
                                style={{ background: 'var(--bg-dark-paper)', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}
                            >
                                {!isMobile && (
                                    <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Users size={16} color="var(--primary-light)" aria-hidden="true" /> En este lote
                                    </h3>
                                )}

                                <search style={{ position: 'relative', marginBottom: '12px', display: 'block' }} role="search">
                                    <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                    <input
                                        type="search"
                                        aria-label="Buscar animales en este lote"
                                        placeholder="Buscar en lote..."
                                        value={searchTermEnLote}
                                        onChange={e => setSearchTermEnLote(e.target.value)}
                                        className="potreradas-modal-search-input"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        style={{ padding: '8px 36px 8px 32px', fontSize: isMobile ? '1rem' : '0.85rem', marginBottom: 0 }}
                                    />
                                    {searchTermEnLote && (
                                        <button
                                            type="button"
                                            className="potreradas-clear-btn"
                                            aria-label="Limpiar búsqueda en lote"
                                            onClick={() => setSearchTermEnLote('')}
                                        >
                                            <X size={15} aria-hidden="true" />
                                        </button>
                                    )}
                                </search>

                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(() => {
                                        const filtrados = animalesFinca.filter(a =>
                                            a.id_potrerada === managingPotrerada?.id &&
                                            (a.numero_chapeta.toLowerCase().includes(searchTermEnLote.toLowerCase()) ||
                                             a.nombre_propietario.toLowerCase().includes(searchTermEnLote.toLowerCase()))
                                        );

                                        if (filtrados.length === 0) {
                                            return (
                                                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border-strong)', borderRadius: '12px' }}>
                                                    {searchTermEnLote ? 'No se encontraron resultados' : 'Vacío'}
                                                </div>
                                            );
                                        }

                                        return filtrados.map(a => {
                                            const esVendido = a.estado === 'vendido';
                                            return (
                                                <div key={a.id} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', background: esVendido ? 'var(--warning-soft-bg)' : 'var(--surface-subtle)', opacity: esVendido ? 0.78 : 1 }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', textDecoration: esVendido ? 'line-through' : 'none', color: esVendido ? 'var(--text-muted)' : 'inherit' }}>#{a.numero_chapeta}</div>
                                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre_propietario}</div>
                                                        {esVendido && (
                                                            <div style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--warning)', background: 'var(--warning-soft-bg)', padding: '1px 5px', borderRadius: '6px', display: 'inline-block', marginTop: '2px' }}>VENDIDO</div>
                                                        )}
                                                    </div>
                                                    {!esVendido && (
                                                        <button
                                                            type="button"
                                                            disabled={updatingAnimal === a.id}
                                                            onClick={() => handleRemoveAnimal(a.id)}
                                                            aria-label={`Quitar animal #${a.numero_chapeta} del lote`}
                                                            className="btn-icon potreradas-manage-action-btn"
                                                            style={{ color: 'var(--error)', padding: '6px', flexShrink: 0 }}
                                                        >
                                                            {updatingAnimal === a.id ? '...' : <Trash2 size={16} aria-hidden="true" />}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            {/* Add Animals Column */}
                            <div
                                className="potreradas-manage-panel"
                                role={isMobile ? 'tabpanel' : undefined}
                                aria-labelledby={isMobile ? 'potreradas-tab-agregar' : undefined}
                                hidden={isMobile && manageTab !== 'agregar'}
                                style={{ background: 'var(--bg-dark-paper)', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}
                            >
                                {!isMobile && (
                                    <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Plus size={16} color="var(--success)" aria-hidden="true" /> Agregar Otros
                                    </h3>
                                )}

                                <search style={{ position: 'relative', marginBottom: '8px', display: 'block' }} role="search">
                                    <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                    <input
                                        type="search"
                                        aria-label="Buscar animales para agregar al lote"
                                        placeholder="Buscar por chapeta o marca..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="potreradas-modal-search-input"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        style={{ padding: '8px 36px 8px 32px', fontSize: isMobile ? '1rem' : '0.85rem', marginBottom: 0 }}
                                    />
                                    {searchTerm && (
                                        <button
                                            type="button"
                                            className="potreradas-clear-btn"
                                            aria-label="Limpiar búsqueda de animales"
                                            onClick={() => setSearchTerm('')}
                                        >
                                            <X size={15} aria-hidden="true" />
                                        </button>
                                    )}
                                </search>

                                <div className="potreradas-manage-filters">
                                    <select
                                        aria-label="Filtrar por propietario"
                                        value={filterPropietario}
                                        onChange={e => setFilterPropietario(e.target.value)}
                                        className="potreradas-manage-select"
                                        style={{ color: filterPropietario ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        <option value="">Todos propietarios</option>
                                        {propietariosOptions.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                    <select
                                        aria-label="Filtrar por potrerada actual"
                                        value={filterPotreradaActual}
                                        onChange={e => setFilterPotreradaActual(e.target.value)}
                                        className="potreradas-manage-select"
                                        style={{ color: filterPotreradaActual ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        <option value="">Todas potreradas</option>
                                        <option value="__sin_lote__">Sin lote</option>
                                        {potreradasOptions.filter(Boolean).map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {filteredAnimalesFinca.map(a => (
                                        <div key={a.id} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>#{a.numero_chapeta}</div>
                                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {a.nombre_propietario}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', fontWeight: 'bold', marginTop: '2px', color: a.id_potrerada ? 'var(--primary-light)' : 'var(--text-muted)' }}>
                                                    {a.id_potrerada ? `Lote: ${a.potreradaNombre}` : 'Sin lote'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={updatingAnimal === a.id}
                                                onClick={() => handleAddAnimal(a.id)}
                                                aria-label={`Agregar animal #${a.numero_chapeta} al lote`}
                                                className="btn-icon potreradas-manage-action-btn"
                                                style={{ color: 'var(--success)', padding: '6px', flexShrink: 0 }}
                                            >
                                                {updatingAnimal === a.id ? '...' : <Plus size={16} aria-hidden="true" />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="potreradas-modal-footer">
                            <button type="button" onClick={() => { setManagingPotrerada(null); resetManagementSearch(); }} className="potreradas-btn-close-footer">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {selectedDetailId && (
                <div className="modal-overlay" onClick={() => setSelectedDetailId(null)}>
                    <div className="card modal-content" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
                        {detailLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--primary)' }}>
                                Cargando información...
                            </div>
                        ) : detailData ? (() => {
                            const activeFechasColumnas = detailData.fechasColumnas.filter(fecha =>
                                detailData.animales.some(a => a.pesajesFiltrados && a.pesajesFiltrados[fecha] && a.fechaIngresoEtapa !== fecha)
                            );
                            const validCompra = detailData.animales.filter(a => a.peso_compra);
                            const totalCompra = validCompra.reduce((sum, a) => sum + (a.peso_compra || 0), 0);
                            const promCompra = validCompra.length > 0 ? totalCompra / validCompra.length : 0;

                            const validIngreso = detailData.animales.filter(a => a.pesoIngresoEtapa);
                            const totalIngreso = validIngreso.reduce((sum, a) => sum + (a.pesoIngresoEtapa || 0), 0);
                            const promIngreso = validIngreso.length > 0 ? totalIngreso / validIngreso.length : 0;

                            const validActual = detailData.animales.filter(a => a.pesoActual);
                            const totalActual = validActual.reduce((sum, a) => sum + (a.pesoActual || 0), 0);
                            const promActual = validActual.length > 0 ? totalActual / validActual.length : 0;

                            const getGmpColor = (val: number) =>
                                resolveGmpColor(val, umbralMedio, umbralAlto);

                            const getSortAria = (key: string): 'ascending' | 'descending' | undefined =>
                                sortConfig?.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined;

                            return (
                            <>
                                {/* Header */}
                                <div className="potreradas-modal-header">
                                    <div className="potreradas-modal-header-top" style={{ flexWrap: 'wrap' }}>
                                        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                                            <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary-light)', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>
                                                {detailData.potrerada.nombre}
                                            </h2>
                                            <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    <MapPin size={14} color="var(--primary)" aria-hidden="true" /> <span className="mobile-hide">Potrero:</span> <strong style={{color: 'var(--text)'}}>{detailData.potreroActual}</strong>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    <TrendingUp size={14} color={getGmpColor(detailData.gmpPromedioGrupo)} aria-hidden="true" />
                                                    <span className="mobile-hide">{getModoLabel(modoGanancia)} Últ:</span>
                                                    <strong style={{ color: getGmpColor(detailData.gmpPromedioGrupo) }}>
                                                        {toDisplayValue(detailData.gmpPromedioGrupo, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                    </strong>
                                                    {detailData.potrerada.gmpAcumulado !== null && detailData.potrerada.gmpAcumulado !== undefined && (
                                                        <span style={{ marginLeft: '4px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                            (Hist: <strong style={{ color: getGmpColor(detailData.potrerada.gmpAcumulado) }}>
                                                                {toDisplayValue(detailData.potrerada.gmpAcumulado, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                            </strong>)
                                                        </span>
                                                    )}
                                                </div>
                                                {(() => {
                                                    const productivity = (detailData.animales.length * detailData.potrerada.gmpPromedio) / (detailData.areaTotalSistema || 1);
                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                            <Activity size={14} color="var(--primary-light)" aria-hidden="true" /> <span className="mobile-hide">Prod:</span> <strong style={{color: 'var(--primary-light)'}}>{productivity.toFixed(1)} kg/Ha/Mes</strong>
                                                        </div>
                                                    );
                                                })()}
                                                {detailData.areaTotalSistema && detailData.areaTotalSistema > 0 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                        <Scale size={14} color="var(--warning)" aria-hidden="true" /> <span className="mobile-hide">Carga:</span> <strong style={{color: 'var(--text)'}}>{(detailData.animales.length / detailData.areaTotalSistema).toFixed(2)} C/Ha</strong>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="potreradas-detail-controls">
                                            <label className="potreradas-history-switch">
                                                <input
                                                    type="checkbox"
                                                    role="switch"
                                                    aria-checked={showFullHistory}
                                                    className="potreradas-visually-hidden potreradas-history-input"
                                                    checked={showFullHistory}
                                                    onChange={e => setShowFullHistory(e.target.checked)}
                                                />
                                                <span className={`potreradas-history-track${showFullHistory ? ' is-on' : ''}`} aria-hidden="true">
                                                    <span className="potreradas-history-thumb" />
                                                </span>
                                                <span>Historial</span>
                                            </label>
                                            <div className="potreradas-detail-divider" style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }}></div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {role !== 'observador' && (
                                                    <>
                                                    <button
                                                        type="button"
                                                        onClick={handleOpenMoveModal}
                                                        className="icon-btn-tooltip potreradas-detail-action-btn"
                                                        data-tooltip="Mover Animales"
                                                        aria-label="Mover animales a otro lote"
                                                        style={{
                                                            background: 'var(--secondary-soft-bg)',
                                                            color: 'var(--secondary)',
                                                            border: '1px solid var(--secondary-soft-border)',
                                                        }}
                                                    >
                                                        <Users size={16} color="var(--secondary)" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleOpenWeighingForm}
                                                        className="icon-btn-tooltip potreradas-detail-action-btn"
                                                        data-tooltip="Nuevo Pesaje"
                                                        aria-label="Registrar nuevo pesaje grupal"
                                                        style={{
                                                            background: 'var(--success-soft-bg)',
                                                            color: 'var(--success)',
                                                            border: '1px solid var(--success-soft-border)',
                                                        }}
                                                    >
                                                        <Scale size={16} color="var(--success)" aria-hidden="true" />
                                                    </button>
                                                    </>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={handleExportPDF}
                                                    disabled={exportingPdf}
                                                    className="icon-btn-tooltip potreradas-detail-action-btn"
                                                    data-tooltip="Descargar PDF"
                                                    aria-label="Descargar reporte PDF del lote"
                                                    style={{
                                                        background: 'var(--surface-subtle)',
                                                        color: 'var(--text-main)',
                                                        border: '1px solid var(--border-strong)',
                                                    }}
                                                >
                                                    {exportingPdf ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Download size={16} color="var(--text-main)" aria-hidden="true" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDetailId(null)}
                                                    className="icon-btn-tooltip potreradas-detail-action-btn"
                                                    data-tooltip="Cerrar detalle"
                                                    aria-label="Cerrar detalle"
                                                    style={{
                                                        margin: 0,
                                                        background: 'var(--surface-subtle)',
                                                        color: 'var(--text-main)',
                                                        border: '1px solid var(--border-strong)',
                                                    }}
                                                >
                                                    <X size={18} color="var(--text-main)" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Main Content Scrollable */}
                                <div className="potreradas-detail-body" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                                    {/* Gráficas Responsive */}
                                    <div className="responsive-grid potreradas-charts-grid" style={{ marginBottom: '24px' }} ref={chartsRef}>
                                        <div className="glass-panel" style={{ padding: '16px', height: '280px' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</h4>
                                            {detailData.history.length > 1 ? (
                                                <ResponsiveContainer width="100%" height="85%">
                                                    <LineChart data={detailData.history}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                                        <XAxis dataKey="fecha" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                        <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)' }} />
                                                        <Line type="monotone" dataKey="pesoPromedio" name="Peso (kg)" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary)', r: 4 }} activeDot={{ r: 6 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0 20px' }}>Información insuficiente para generar la gráfica</div>
                                            )}
                                        </div>

                                        <div className="glass-panel" style={{ padding: '16px', height: '280px' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{getModoLabel(modoGanancia)} Promedio</h4>
                                            {detailData.history.some(d => d.gmpPromedio !== null) ? (
                                                <ResponsiveContainer width="100%" height="85%">
                                                    <LineChart data={detailData.history.filter(d => d.gmpPromedio !== null)}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                                        <XAxis dataKey="fecha" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                        <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)' }} formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]} />
                                                        <Line type="monotone" dataKey="gmpPromedio" name={`${getModoLabel(modoGanancia)}`} stroke="var(--success)" strokeWidth={3} dot={{ fill: 'var(--success)', r: 4 }} activeDot={{ r: 6 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0 20px' }}>Información insuficiente para generar la gráfica</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Lista de Animales */}
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Info size={14} aria-hidden="true" /> Detalle por Animal ({sortedAnimals.length})
                                    </h4>

                                    {isMobile ? (
                                        <>
                                            {detailData.animales.length > 0 && (
                                                <div className="potreradas-detail-summary">
                                                    <div className="potreradas-summary-pill">
                                                        <div className="potreradas-summary-label">Peso Actual</div>
                                                        <div className="potreradas-summary-val">{totalActual > 0 ? `${Math.round(totalActual).toLocaleString('es-CO')} kg` : '-'}</div>
                                                        <div className="potreradas-summary-sub">Prom: {promActual > 0 ? `${Math.round(promActual).toLocaleString('es-CO')} kg` : '-'}</div>
                                                    </div>
                                                    <div className="potreradas-summary-pill">
                                                        <div className="potreradas-summary-label">Peso Ingreso</div>
                                                        <div className="potreradas-summary-val">{totalIngreso > 0 ? `${Math.round(totalIngreso).toLocaleString('es-CO')} kg` : '-'}</div>
                                                        <div className="potreradas-summary-sub">Prom: {promIngreso > 0 ? `${Math.round(promIngreso).toLocaleString('es-CO')} kg` : '-'}</div>
                                                    </div>
                                                    {detailData.potrerada.etapa === 'levante' && totalCompra > 0 && (
                                                        <div className="potreradas-summary-pill" style={{ gridColumn: '1 / -1' }}>
                                                            <div className="potreradas-summary-label">Peso Compra</div>
                                                            <div className="potreradas-summary-val">
                                                                {Math.round(totalCompra).toLocaleString('es-CO')} kg{' '}
                                                                <span className="potreradas-summary-sub">(Prom: {Math.round(promCompra).toLocaleString('es-CO')} kg)</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {sortedAnimals.length > 0 && (
                                                <div className="potreradas-mobile-sort-bar" aria-label="Ordenar animales">
                                                    {[
                                                        { key: 'numero_chapeta', label: 'Chapeta' },
                                                        { key: 'pesoActual', label: 'Peso actual' },
                                                        { key: 'pesoIngresoEtapa', label: 'Ingreso' },
                                                        { key: 'gmp', label: getModoLabel(modoGanancia) },
                                                    ].map(opt => {
                                                        const active = sortConfig?.key === opt.key;
                                                        return (
                                                            <button
                                                                key={opt.key}
                                                                type="button"
                                                                className={`potreradas-mobile-sort-chip${active ? ' is-active' : ''}`}
                                                                onClick={() => handleSort(opt.key)}
                                                            >
                                                                {opt.label}{active ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {sortedAnimals.length === 0 ? (
                                                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                    Esta potrerada no tiene animales activos.
                                                </div>
                                            ) : (
                                                <div className="potreradas-animal-cards">
                                                    {sortedAnimals.map(a => (
                                                        <div key={a.id} className="potreradas-animal-card">
                                                            <div className="potreradas-animal-card-top">
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                        <strong style={{ fontSize: '1.05rem', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</strong>
                                                                        {a.estado === 'vendido' && (
                                                                            <span style={{ background: 'var(--error-soft-bg)', color: 'var(--error)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', border: '1px solid var(--error-soft-border)', fontWeight: 'bold' }}>Vendido</span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.nombre_propietario}</div>
                                                                </div>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                                                        {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                                    </div>
                                                                    {a.hasCalculatedGmp && (
                                                                        <div style={{ fontSize: '0.78rem', fontWeight: '700', color: getGmpColor(a.gmp || 0) }}>
                                                                            Últ: {toDisplayValue(a.gmp || 0, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                            {a.gmpAcumulado !== undefined && a.gmpAcumulado !== null && (
                                                                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                                                                                    {' · Hist: '}
                                                                                    <span style={{ color: getGmpColor(a.gmpAcumulado) }}>
                                                                                        {toDisplayValue(a.gmpAcumulado, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                                    </span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="potreradas-animal-metrics">
                                                                <span>
                                                                    Ingreso: <strong>{a.pesoIngresoEtapa ? `${Math.round(a.pesoIngresoEtapa)} kg` : '-'}</strong>
                                                                    {a.fechaIngresoEtapa ? ` (${format(new Date(a.fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy')})` : ''}
                                                                </span>
                                                                {detailData.potrerada.etapa === 'levante' && (
                                                                    <span>Compra: <strong>{a.peso_compra ? `${Math.round(a.peso_compra)} kg` : '-'}</strong></span>
                                                                )}
                                                            </div>

                                                            {activeFechasColumnas.length > 0 && (
                                                                <div className="potreradas-animal-dates">
                                                                    {activeFechasColumnas.map(fecha => {
                                                                        const isEntryDate = a.fechaIngresoEtapa === fecha;
                                                                        const val = a.pesajesFiltrados && a.pesajesFiltrados[fecha] && !isEntryDate ? Math.round(a.pesajesFiltrados[fecha]) : null;
                                                                        if (val === null) return null;
                                                                        return (
                                                                            <span key={fecha} className="potreradas-date-chip">
                                                                                {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}: <strong>{val} kg</strong>
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="table-container">
                                            <table className="potreradas-detail-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                                                        <th scope="col" aria-sort={getSortAria('numero_chapeta')}>
                                                            <button type="button" onClick={() => handleSort('numero_chapeta')} className="potreradas-sort-btn">
                                                                <span>CHAPETA</span>
                                                                {sortConfig?.key === 'numero_chapeta' && (
                                                                    <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                                )}
                                                            </button>
                                                        </th>
                                                        <th scope="col" style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PROPIETARIO</th>
                                                        {detailData.potrerada.etapa === 'levante' && (
                                                            <th scope="col" style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PESO COMPRA</th>
                                                        )}
                                                        <th scope="col" aria-sort={getSortAria('pesoIngresoEtapa')}>
                                                            <button type="button" onClick={() => handleSort('pesoIngresoEtapa')} className="potreradas-sort-btn potreradas-sort-btn--center">
                                                                <span>PESO INGRESO</span>
                                                                {sortConfig?.key === 'pesoIngresoEtapa' && (
                                                                    <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                                )}
                                                            </button>
                                                        </th>
                                                        <th scope="col" aria-sort={getSortAria('pesoActual')}>
                                                            <button type="button" onClick={() => handleSort('pesoActual')} className="potreradas-sort-btn potreradas-sort-btn--center">
                                                                <span>PESO ACTUAL</span>
                                                                {sortConfig?.key === 'pesoActual' && (
                                                                    <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                                )}
                                                            </button>
                                                        </th>
                                                        {activeFechasColumnas.map(fecha => (
                                                            <th key={fecha} scope="col" style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PESAJE {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}</th>
                                                        ))}
                                                        <th scope="col" aria-sort={getSortAria('gmp')}>
                                                            <button type="button" onClick={() => handleSort('gmp')} className="potreradas-sort-btn potreradas-sort-btn--right">
                                                                <span>{getModoLabel(modoGanancia)}</span>
                                                                {sortConfig?.key === 'gmp' && (
                                                                    <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                                )}
                                                            </button>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedAnimals.map((a, idx) => (
                                                        <tr key={a.id} style={{ borderBottom: idx < sortedAnimals.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span>#{a.numero_chapeta}</span>
                                                                    {a.estado === 'vendido' && (
                                                                        <span style={{ background: 'var(--error-soft-bg)', color: 'var(--error)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', border: '1px solid var(--error-soft-border)', fontWeight: 'bold' }}>Vendido</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{a.nombre_propietario}</td>
                                                            {detailData.potrerada.etapa === 'levante' && (
                                                                <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                    <div style={{ fontWeight: 'bold' }}>{a.peso_compra ? `${Math.round(a.peso_compra)} kg` : '-'}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.fechaIngresoEtapa ? format(new Date(a.fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy') : '-'}</div>
                                                                </td>
                                                            )}
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                <div style={{ fontWeight: 'bold' }}>{a.pesoIngresoEtapa ? `${Math.round(a.pesoIngresoEtapa)} kg` : '-'}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.fechaIngresoEtapa ? format(new Date(a.fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy') : '-'}</div>
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                            </td>
                                                            {activeFechasColumnas.map(fecha => {
                                                                const isEntryDate = a.fechaIngresoEtapa === fecha;
                                                                return (
                                                                    <td key={fecha} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                        {a.pesajesFiltrados && a.pesajesFiltrados[fecha] && !isEntryDate ? `${Math.round(a.pesajesFiltrados[fecha])} kg` : '-'}
                                                                    </td>
                                                                );
                                                            })}
                                                            <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                {a.hasCalculatedGmp ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                                        <div>
                                                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginRight: '4px' }}>Últ:</span>
                                                                            <span style={{
                                                                                color: getGmpColor(a.gmp || 0),
                                                                                fontWeight: 'bold'
                                                                            }}>
                                                                                {toDisplayValue(a.gmp || 0, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                            </span>
                                                                        </div>
                                                                        {a.gmpAcumulado !== undefined && a.gmpAcumulado !== null && (
                                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                                Hist:{' '}
                                                                                <span style={{
                                                                                    color: getGmpColor(a.gmpAcumulado),
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {toDisplayValue(a.gmpAcumulado, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {sortedAnimals.length === 0 && (
                                                        <tr>
                                                            <td colSpan={4 + activeFechasColumnas.length + 1} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                                Esta potrerada no tiene animales activos.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                                {detailData.animales.length > 0 && (
                                                    <tfoot>
                                                        <tr style={{ borderTop: '2px solid var(--border-strong)', background: 'var(--surface-subtle)' }}>
                                                            <td colSpan={2} style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>TOTALES:</td>
                                                            {detailData.potrerada.etapa === 'levante' && (
                                                                <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                    {totalCompra > 0 ? `${Math.round(totalCompra).toLocaleString('es-CO')} kg` : '-'}
                                                                </td>
                                                            )}
                                                            <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                {totalIngreso > 0 ? `${Math.round(totalIngreso).toLocaleString('es-CO')} kg` : '-'}
                                                            </td>
                                                            <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                {totalActual > 0 ? `${Math.round(totalActual).toLocaleString('es-CO')} kg` : '-'}
                                                            </td>
                                                            {activeFechasColumnas.map(fecha => {
                                                                const total = detailData.animales.reduce((acc, a) => acc + (a.pesajesFiltrados && a.pesajesFiltrados[fecha] ? a.pesajesFiltrados[fecha] : 0), 0);
                                                                return (
                                                                    <td key={fecha} style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                        {total > 0 ? `${Math.round(total).toLocaleString('es-CO')} kg` : '-'}
                                                                    </td>
                                                                );
                                                            })}
                                                            <td></td>
                                                        </tr>
                                                        <tr style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
                                                            <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.7rem' }}>PROMEDIOS:</td>
                                                            {detailData.potrerada.etapa === 'levante' && (
                                                                <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                                    {promCompra > 0 ? `${Math.round(promCompra).toLocaleString('es-CO')} kg` : '-'}
                                                                </td>
                                                            )}
                                                            <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                                {promIngreso > 0 ? `${Math.round(promIngreso).toLocaleString('es-CO')} kg` : '-'}
                                                            </td>
                                                            <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                                {promActual > 0 ? `${Math.round(promActual).toLocaleString('es-CO')} kg` : '-'}
                                                            </td>
                                                            {activeFechasColumnas.map(fecha => {
                                                                const validAnimals = detailData.animales.filter(a => a.pesajesFiltrados && a.pesajesFiltrados[fecha]);
                                                                const total = validAnimals.reduce((acc, a) => acc + (a.pesajesFiltrados![fecha] || 0), 0);
                                                                const avg = validAnimals.length > 0 ? total / validAnimals.length : 0;
                                                                return (
                                                                    <td key={fecha} style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                                        {avg > 0 ? `${Math.round(avg).toLocaleString('es-CO')} kg` : '-'}
                                                                    </td>
                                                                );
                                                            })}
                                                            <td></td>
                                                        </tr>
                                                    </tfoot>
                                                )}
                                            </table>
                                        </div>
                                    )}
                                </div>

                        {/* Footer */}
                        <div className="potreradas-modal-footer">
                            <button type="button" onClick={() => setSelectedDetailId(null)} className="potreradas-btn-close-footer">
                                Cerrar
                            </button>
                        </div>
                            </>
                            );
                        })() : (
                            <div style={{ padding: '40px', textAlign: 'center' }}>No se pudo cargar la información.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal: Mover Animales */}
            {showMoveModal && detailData && (
                <div className="modal-overlay" onClick={() => { if (!movingAnimals) setShowMoveModal(false); }}>
                    <div className="card modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="potreradas-modal-header">
                            <div className="potreradas-modal-header-top">
                                <div>
                                    <h2 style={{ margin: '0 0 4px 0', color: 'var(--secondary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Users size={20} aria-hidden="true" /> Mover Animales de Potrerada
                                    </h2>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                        Desde: <strong style={{ color: 'var(--text)' }}>{detailData.potrerada.nombre}</strong>
                                    </p>
                                </div>
                                <button type="button" aria-label="Cerrar" onClick={() => setShowMoveModal(false)} className="btn-icon" disabled={movingAnimals}>
                                    <X size={20} aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        {/* Destino */}
                        <div style={{ padding: isMobile ? '12px 16px' : '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <label htmlFor="potreradas-move-target" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
                                Potrerada destino
                            </label>
                            <select
                                id="potreradas-move-target"
                                value={targetPotreradaId}
                                onChange={e => setTargetPotreradaId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    marginBottom: 0,
                                    background: 'var(--bg-input)',
                                    border: `1px solid ${targetPotreradaId ? 'var(--secondary)' : 'var(--border-input)'}`,
                                    borderRadius: '8px',
                                    color: 'var(--text)',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                }}
                            >
                                <option value="">— Seleccionar potrerada —</option>
                                {(() => {
                                    const stageLevels: Record<string, number> = { 'cría': 1, 'cria': 1, 'levante': 2, 'ceba': 3 };
                                    const currentLevel = stageLevels[detailData.potrerada.etapa.toLowerCase()] || 0;

                                    return potreradas
                                        .filter(p => {
                                            if (p.id === detailData.potrerada.id) return false;
                                            const targetLevel = stageLevels[p.etapa.toLowerCase()] || 0;
                                            return targetLevel >= currentLevel;
                                        })
                                        .map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.nombre} ({p.etapa}) — {p.animalCount} animales
                                            </option>
                                        ));
                                })()}
                            </select>
                        </div>

                        {/* Fecha de Movimiento */}
                        <div style={{ padding: isMobile ? '12px 16px' : '12px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <label htmlFor="potreradas-move-date" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
                                Fecha de movimiento
                            </label>
                            <input
                                id="potreradas-move-date"
                                type="date"
                                min={MIN_GANADO_DATE}
                                value={moveDate}
                                onChange={e => setMoveDate(e.target.value)}
                                style={{
                                    width: '100%',
                                    marginBottom: 0,
                                    padding: '10px 14px',
                                    background: 'var(--bg-input)',
                                    border: '1px solid var(--border-input)',
                                    borderRadius: '8px',
                                    color: 'var(--text)',
                                    fontSize: '0.9rem'
                                }}
                            />
                        </div>

                        {/* Lista de animales con checklist */}
                        <div style={{ padding: isMobile ? '12px 16px 4px' : '12px 24px 4px' }}>
                            {/* Buscador */}
                            <search style={{ position: 'relative', marginBottom: '10px', display: 'block' }} role="search">
                                <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input
                                    type="search"
                                    aria-label="Buscar animal para mover"
                                    placeholder="Buscar por chapeta o propietario..."
                                    value={searchMoveAnimals}
                                    onChange={e => setSearchMoveAnimals(e.target.value)}
                                    className="potreradas-modal-search-input"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    style={{
                                        width: '100%',
                                        marginBottom: 0,
                                        padding: '8px 36px 8px 32px',
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border-input)',
                                        borderRadius: '8px',
                                        color: 'var(--text)',
                                        fontSize: isMobile ? '1rem' : '0.85rem',
                                        boxSizing: 'border-box',
                                    }}
                                />
                                {searchMoveAnimals && (
                                    <button
                                        type="button"
                                        aria-label="Limpiar búsqueda"
                                        onClick={() => setSearchMoveAnimals('')}
                                        className="potreradas-clear-btn"
                                    >
                                        <X size={15} aria-hidden="true" />
                                    </button>
                                )}
                            </search>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                                    Animales ({selectedAnimalsToMove.size} seleccionados)
                                </span>
                                <button
                                    type="button"
                                    onClick={handleSelectAllAnimals}
                                    className="potreradas-select-all-btn"
                                    style={{
                                        width: 'auto',
                                        background: 'var(--secondary-soft-bg)',
                                        border: '1px solid var(--secondary-soft-border)',
                                        borderRadius: '6px',
                                        color: 'var(--secondary)',
                                        fontSize: '0.78rem',
                                        padding: '4px 10px',
                                        textTransform: 'none',
                                        letterSpacing: 'normal',
                                        fontWeight: '600',
                                    }}
                                >
                                    {selectedAnimalsToMove.size === detailData.animales.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1, maxHeight: isMobile ? undefined : '280px', overflowY: 'auto', padding: isMobile ? '0 16px 12px' : '0 24px 16px' }}>
                            {detailData.animales.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '0.9rem' }}>
                                    Esta potrerada no tiene animales.
                                </div>
                            ) : (() => {
                                const term = searchMoveAnimals.toLowerCase().trim();
                                const filtered = detailData.animales
                                    .slice()
                                    .sort((a, b) => a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true }))
                                    .filter(a =>
                                        !term ||
                                        a.numero_chapeta.toLowerCase().includes(term) ||
                                        (a.nombre_propietario || '').toLowerCase().includes(term)
                                    );
                                if (filtered.length === 0) return (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '0.85rem' }}>
                                        Sin resultados para "<strong>{searchMoveAnimals}</strong>"
                                    </div>
                                );
                                return filtered.map(animal => {
                                        const checked = selectedAnimalsToMove.has(animal.id);
                                        return (
                                            <button
                                                type="button"
                                                key={animal.id}
                                                onClick={() => handleToggleAnimalMove(animal.id)}
                                                className="potreradas-move-row"
                                                style={{
                                                    width: '100%',
                                                    textAlign: 'left',
                                                    textTransform: 'none',
                                                    letterSpacing: 'normal',
                                                    fontWeight: '400',
                                                    color: 'var(--text)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-start',
                                                    gap: '12px',
                                                    padding: '10px 12px',
                                                    marginBottom: '6px',
                                                    borderRadius: '8px',
                                                    background: checked ? 'var(--secondary-soft-bg)' : 'var(--surface-subtle)',
                                                    border: `1px solid ${checked ? 'var(--secondary-soft-border)' : 'var(--border-subtle)'}`,
                                                    boxShadow: 'none',
                                                }}
                                            >
                                                <div style={{
                                                    width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                                                    background: checked ? '#fbbf24' : 'transparent',
                                                    border: `2px solid ${checked ? '#fbbf24' : 'var(--border-strong)'}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {checked && <span style={{ color: '#111812', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>#{animal.numero_chapeta}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{animal.nombre_propietario}</div>
                                                </div>
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <div style={{ fontSize: '0.82rem', color: 'var(--primary-light)', fontWeight: '600' }}>
                                                        {animal.pesoActual ? `${Math.round(animal.pesoActual)} kg` : '-'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    });
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="potreradas-modal-footer">
                            <button
                                type="button"
                                onClick={() => setShowMoveModal(false)}
                                disabled={movingAnimals}
                                className="potreradas-modal-cancel-btn"
                                style={{
                                    width: 'auto',
                                    borderRadius: '8px', padding: '9px 20px',
                                    fontSize: '0.88rem',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmMoveAnimals}
                                disabled={movingAnimals || selectedAnimalsToMove.size === 0 || !targetPotreradaId}
                                style={{
                                    width: 'auto',
                                    background: selectedAnimalsToMove.size > 0 && targetPotreradaId ? '#fbbf24' : 'var(--surface-subtle)',
                                    border: selectedAnimalsToMove.size > 0 && targetPotreradaId ? 'none' : '1px solid var(--border-subtle)',
                                    borderRadius: '8px', padding: '9px 20px',
                                    color: selectedAnimalsToMove.size > 0 && targetPotreradaId ? '#111812' : 'var(--text-faint)',
                                    cursor: selectedAnimalsToMove.size > 0 && targetPotreradaId ? 'pointer' : 'not-allowed',
                                    fontSize: '0.88rem', fontWeight: '700',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                }}
                            >
                                {movingAnimals ? (
                                    <><Loader2 size={15} className="spin" aria-hidden="true" /> Moviendo...</>
                                ) : (
                                    <><Users size={15} aria-hidden="true" /> Mover {selectedAnimalsToMove.size > 0 ? `${selectedAnimalsToMove.size} animal${selectedAnimalsToMove.size !== 1 ? 'es' : ''}` : 'animales'}</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Formulario de Pesaje Grupal */}
            {showWeighingForm && detailData && (
                <div className="modal-overlay" onClick={() => { setShowWeighingForm(false); setWeighingData({}); }}>
                    <div className="card modal-content" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="potreradas-modal-header">
                            <div className="potreradas-modal-header-top">
                                <div style={{ minWidth: 0 }}>
                                    <h2 style={{ margin: '0 0 6px 0', color: 'var(--primary-light)', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Scale size={20} aria-hidden="true" /> Nuevo Pesaje
                                    </h2>
                                    <div className="potreradas-weighing-meta">
                                        <span>{detailData.potrerada.nombre}</span>
                                        <span aria-hidden="true">·</span>
                                        <label htmlFor="potreradas-group-weighing-date" style={{ marginBottom: 0, display: 'inline' }}>Fecha:</label>
                                        <input
                                            id="potreradas-group-weighing-date"
                                            type="date"
                                            min={MIN_GANADO_DATE}
                                            value={weighingDate}
                                            onChange={(e) => setWeighingDate(e.target.value)}
                                            className="potreradas-weighing-date-input"
                                        />
                                    </div>
                                </div>
                                <button type="button" aria-label="Cerrar pesaje grupal" onClick={() => { setShowWeighingForm(false); setWeighingData({}); }} className="btn-icon" style={{ flexShrink: 0 }}>
                                    <X size={20} aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="potreradas-weighing-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 0, marginBottom: '12px' }}>
                                Ingresa el nuevo peso de cada animal. Puedes dejar en blanco los que no se pesaron.
                            </p>
                            <div className="potreradas-weighing-wrap" style={{ background: 'var(--surface-inset)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                                <table className="potreradas-weighing-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                                            <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Chapeta</th>
                                            <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Propietario</th>
                                            <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Peso Actual</th>
                                            <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Nuevo Peso (kg)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detailData.animales
                                            .slice()
                                            .sort((a, b) => a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true, sensitivity: 'base' }))
                                            .map((a, idx) => {
                                                const newVal = weighingData[a.id] ?? '';
                                                const parsedNewVal = parseDecimalInput(newVal);
                                                const hasWeight = newVal !== '' && !isNaN(parsedNewVal) && parsedNewVal > 0;
                                                return (
                                                    <tr key={a.id} style={{
                                                        borderBottom: idx < detailData.animales.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                                        background: hasWeight ? 'var(--success-soft-bg)' : undefined
                                                    }}>
                                                        <td className="potreradas-w-chapeta" style={{ padding: '10px 16px', fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</td>
                                                        <td className="potreradas-w-prop" style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{a.nombre_propietario}</td>
                                                        <td className="potreradas-w-actual" style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                            {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                        </td>
                                                        <td className="potreradas-w-input-cell" style={{ padding: '8px 12px' }}>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                aria-label={`Nuevo peso en kg para #${a.numero_chapeta}`}
                                                                placeholder={isMobile ? 'Peso (kg)' : 'ej: 320'}
                                                                value={newVal}
                                                                onChange={e => setWeighingData(prev => ({ ...prev, [a.id]: sanitizeDecimalInput(e.target.value) }))}
                                                                className="potreradas-w-input"
                                                                style={{
                                                                    width: '100%', padding: '7px 10px', fontSize: '0.9rem',
                                                                    marginBottom: 0,
                                                                    background: hasWeight ? 'var(--success-soft-bg)' : 'var(--bg-input)',
                                                                    border: hasWeight ? '1px solid var(--success)' : '1px solid var(--border-input)',
                                                                    borderRadius: '8px', color: 'var(--text)'
                                                                }}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        }
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary bar */}
                            {(() => {
                                const filled = Object.values(weighingData).filter(v => {
                                    const n = parseDecimalInput(v);
                                    return !isNaN(n) && n > 0;
                                }).length;
                                return filled > 0 ? (
                                    <div style={{ marginTop: '12px', padding: '10px 16px', background: 'var(--success-soft-bg)', border: '1px solid var(--success-soft-border)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--success)' }}>
                                        ✅ {filled} de {detailData.animales.length} animales con peso ingresado.
                                    </div>
                                ) : null;
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="potreradas-modal-footer">
                            <button
                                type="button"
                                onClick={() => { setShowWeighingForm(false); setWeighingData({}); }}
                                className="potreradas-modal-cancel-btn"
                                style={{ width: 'auto', padding: '9px 20px', borderRadius: '8px' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveWeighings}
                                disabled={savingWeighings}
                                style={{ width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '9px 24px' }}
                            >
                                {savingWeighings ? 'Guardando...' : <><Save size={16} aria-hidden="true" /> Guardar Pesajes</>}
                            </button>
                        </div>
                    </div>
                </div>
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

                        <form onSubmit={e => { e.preventDefault(); handleUpdateName(); }}>
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
