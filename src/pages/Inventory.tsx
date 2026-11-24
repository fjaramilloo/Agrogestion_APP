import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchAllSupabasePages } from '../lib/supabasePagination';
import { useAuth } from '../contexts/AuthContext';
import { useConnection } from '../contexts/ConnectionContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { Search, Skull, ArrowUpDown, X, Plus, BarChart2 } from 'lucide-react';
import PropietarioDashboardModal from '../components/PropietarioDashboardModal';
import ModalUpsell from '../components/ModalUpsell';
import { LicenseBlockedBanner } from '../components/LicenseBlockedBanner';
import { getLicenseBlockState } from '../utils/licenseUtils';
import {
    toDisplayValue,
    getUnidadLabel,
    getModoLabel,
    calcularGmpUltimoPeriodo,
    calcularGmpAcumulado,
    esPesajePosteriorAIngreso,
    calcularDiasEntreFechas
} from '../utils/ganancia';
import { formatLocalDate, getLocalIsoDate } from '../utils/dateUtils';
import { localDB } from '../lib/db';
import InventoryDetailModal from './inventory/InventoryDetailModal';
import InventoryCreateAnimalModal from './inventory/InventoryCreateAnimalModal';
import InventoryDeathReportModal from './inventory/InventoryDeathReportModal';
import type { Animal, PotreradaOption, PropietarioOption } from './inventory/types';
import './Inventory.css';

export default function Inventory() {
    const { fincaId, role, userFincas, isSuperAdmin, modoGanancia, licenciaInfo, refreshLicencia } = useAuth();
    const { toast } = useFeedback();
    const isAdmin = role === 'administrador' || isSuperAdmin;
    const { isBloqueado } = getLicenseBlockState(licenciaInfo);
    const location = useLocation();
    const [showUpsellModal, setShowUpsellModal] = useState(false);
    const [animales, setAnimales] = useState<Animal[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterEtapa, setFilterEtapa] = useState('');
    const [filterPotrero, setFilterPotrero] = useState('');
    const [filterPotrerada, setFilterPotrerada] = useState('');
    const [filterPropietario, setFilterPropietario] = useState('');
    const [filterLateWeighing, setFilterLateWeighing] = useState(false);
    const [filterNegativeGain, setFilterNegativeGain] = useState(false);

    // sorting states
    const [sortBy, setSortBy] = useState('dias_pesaje');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [umbralAltoGmp, setUmbralAltoGmp] = useState(20);
    const [umbralMedioGmp, setUmbralMedioGmp] = useState(10);
    const isMobile = useIsMobile();

    // Efecto para capturar filtros desde notificaciones
    useEffect(() => {
        const state = location.state as { filterType?: string };
        if (state?.filterType === 'vencidos') {
            setFilterLateWeighing(true);
            setFilterNegativeGain(false);
            window.history.replaceState({}, document.title);
        } else if (state?.filterType === 'perdida') {
            setFilterNegativeGain(true);
            setFilterLateWeighing(false);
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    // Modales
    const [showMuerteModal, setShowMuerteModal] = useState(false);
    const [showCrearModal, setShowCrearModal] = useState(false);
    const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
    const [potreradasDisponibles, setPotreradasDisponibles] = useState<PotreradaOption[]>([]);
    const [propietariosLista, setPropietariosLista] = useState<PropietarioOption[]>([]);

    const fincaNombre = userFincas.find(f => f.id_finca === fincaId)?.nombre_finca || 'Finca';

    // Modal Propietario Dashboard
    const [showPropietarioDashboard, setShowPropietarioDashboard] = useState(false);
    const [showCapitalModal, setShowCapitalModal] = useState(false);
    const [capitalInvertido, setCapitalInvertido] = useState('');
    const [precioVentaPromedio, setPrecioVentaPromedio] = useState(0);

    const { modoCampo, isOnline } = useConnection();

    const fetchAnimales = async () => {
        if (!fincaId) return;

        // 1. CARGA INMEDIATA DESDE CACHÉ LOCAL (Cache-First, 0 ms)
        try {
            const cachedAnimales = await localDB.animalesCache
                .where('id_finca')
                .equals(fincaId)
                .toArray();

            const cachedPotreradas = await localDB.potreradasCache
                .where('id_finca')
                .equals(fincaId)
                .toArray();

            if (cachedPotreradas && cachedPotreradas.length > 0) {
                setPotreradasDisponibles(cachedPotreradas);
            }

            if (cachedAnimales && cachedAnimales.length > 0) {
                const hoyIso = getLocalIsoDate();
                const activosCache = cachedAnimales.filter((a: any) => !a.estado || a.estado === 'activo');

                const dataProcesada = activosCache.map((a: any) => {
                    const pesajesActivos = Array.isArray(a.registros_pesaje)
                        ? a.registros_pesaje
                            .filter((r: any) => !r.is_deleted)
                            .sort((x: any, y: any) => String(y.fecha || '').localeCompare(String(x.fecha || '')))
                        : [];
                    const fechaUltimo = pesajesActivos[0]?.fecha || a.fecha_ultimo_pesaje || a.fecha_ingreso;
                    const diasDesdeUltimoPesaje = calcularDiasEntreFechas(fechaUltimo, hoyIso);

                    return {
                        id: a.id,
                        numero_chapeta: a.numero_chapeta,
                        nombre_propietario: a.nombre_propietario || 'Sin Propietario',
                        especie: 'bovino',
                        sexo: a.sexo || 'M',
                        tipo_macho: a.tipo_macho,
                        etapa: a.etapa,
                        peso_ingreso: a.peso_ingreso || 0,
                        peso_compra: a.peso_compra,
                        fecha_ingreso: a.fecha_ingreso,
                        fecha_ingreso_ceba: a.fecha_ingreso_ceba,
                        peso_ingreso_ceba: a.peso_ingreso_ceba,
                        estado: 'activo',
                        id_potrerada: a.id_potrerada,
                        potreroNombre: a.potrero_nombre || 'Sin potrero',
                        potreradaNombre: a.potrerada_nombre || 'Sin potrerada',
                        registros_pesaje: pesajesActivos.length > 0
                            ? pesajesActivos
                            : (a.ultimo_peso ? [{ peso: a.ultimo_peso, fecha: a.fecha_ultimo_pesaje || a.updated_at, gdp_calculada: 0 }] : []),
                        diasDesdeUltimoPesaje
                    };
                });

                setAnimales(dataProcesada);
                setLoading(false);
            }
        } catch (cacheErr) {
            console.warn('[Inventario] Error leyendo caché local:', cacheErr);
        }

        // 2. Si estamos en Modo Campo forzado o no hay conexión efectiva, no consultar red
        if (modoCampo || !isOnline) {
            setLoading(false);
            return;
        }

        // 3. REVALIDACIÓN EN SEGUNDO PLANO (Solo si hay conexión real y no estamos en Modo Campo)
        try {
            const [configRes, animalesRes, ultimosPesajesRes, potsRes, propRes] = await Promise.all([
                supabase
                    .from('configuracion_kpi')
                    .select('umbral_alto_gmp, umbral_medio_gmp, precio_venta_promedio')
                    .eq('id_finca', fincaId)
                    .single(),
                fetchAllSupabasePages((from, to, signal) => {
                    const q = supabase
                        .from('animales')
                        .select(`
                            id, numero_chapeta, nombre_propietario, especie, sexo, tipo_macho, etapa,
                            peso_ingreso, peso_compra, fecha_ingreso, fecha_ingreso_ceba,
                            peso_ingreso_ceba, estado, id_potrerada, creado_en,
                            potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
                            potreros ( nombre )
                        `)
                        .eq('id_finca', fincaId)
                        .eq('estado', 'activo')
                        .or('is_deleted.is.null,is_deleted.eq.false')
                        .order('creado_en', { ascending: false })
                        .order('id', { ascending: true })
                        .range(from, to);
                    return signal ? q.abortSignal(signal) : q;
                }),
                fetchAllSupabasePages((from, to, signal) => {
                    const q = supabase
                        .rpc('get_ultimos_pesajes_finca', { p_finca_id: fincaId })
                        .order('id_animal', { ascending: true })
                        .range(from, to);
                    return signal ? q.abortSignal(signal) : q;
                }),
                supabase
                    .from('potreradas')
                    .select('id, nombre, etapa')
                    .eq('id_finca', fincaId)
                    .order('nombre', { ascending: true })
                    .limit(10000),
                supabase
                    .from('propietarios')
                    .select('id, nombre')
                    .eq('id_finca', fincaId)
                    .order('nombre', { ascending: true })
                    .limit(10000)
            ]);

            if (configRes.data) {
                setUmbralAltoGmp(configRes.data.umbral_alto_gmp ?? 20);
                setUmbralMedioGmp(configRes.data.umbral_medio_gmp ?? 10);
                setPrecioVentaPromedio(parseFloat(configRes.data.precio_venta_promedio || 0));
            }

            const ultimosPesajesMap = new Map<string, any>();
            if (ultimosPesajesRes.data) {
                for (const p of ultimosPesajesRes.data) {
                    ultimosPesajesMap.set(p.id_animal, {
                        peso: p.peso,
                        fecha: p.fecha,
                        gdp_calculada: p.gdp_calculada,
                        gmp_calculada: p.gmp_calculada,
                        potreros: p.potrero_nombre ? { nombre: p.potrero_nombre } : null
                    });
                }
            }

            // BLINDAJE: Solo actualizar estado si la nube entregó animales válidos
            if (!animalesRes.error && animalesRes.data && animalesRes.data.length > 0) {
                const hoyIso = getLocalIsoDate();

                const dataProcesada = animalesRes.data.map((a: any) => {
                    const ultimoP = ultimosPesajesMap.get(a.id) || null;
                    const fechaRefStr = ultimoP ? ultimoP.fecha : a.fecha_ingreso;
                    const diasDesdeUltimoPesaje = calcularDiasEntreFechas(fechaRefStr, hoyIso);

                    return {
                        ...a,
                        registros_pesaje: ultimoP ? [ultimoP] : [],
                        potreroNombre: a.potreros?.nombre || 'Sin potrero',
                        potreradaNombre: a.potreradas?.nombre || 'Sin potrerada',
                        diasDesdeUltimoPesaje
                    };
                });
                setAnimales(dataProcesada);
            }

            if (potsRes.data && potsRes.data.length > 0) setPotreradasDisponibles(potsRes.data);
            if (propRes.data && propRes.data.length > 0) setPropietariosLista(propRes.data);

            // Actualizar la caché local solo si no hay escrituras pendientes sin subir, preservando historiales completos
            if (!animalesRes.error && animalesRes.data && animalesRes.data.length > 0) {
                const pendientes = await localDB.httpWriteQueue
                    .filter(op => op.status !== 'failed' && (op.tabla === 'animales' || op.tabla === 'registros_pesaje'))
                    .count();
                if (pendientes === 0) {
                    const prevRows = await localDB.animalesCache.where('id_finca').equals(fincaId).toArray();
                    const prevMap = new Map(prevRows.map(r => [r.id, r]));
                    const ahoraIso = new Date().toISOString();
                    const itemsCache = animalesRes.data.map((a: any) => {
                        const ult = ultimosPesajesMap.get(a.id);
                        const prev = prevMap.get(a.id);
                        const prevPesajes = Array.isArray(prev?.registros_pesaje) ? prev.registros_pesaje : [];
                        return {
                            id: a.id,
                            id_finca: fincaId,
                            numero_chapeta: a.numero_chapeta,
                            nombre_propietario: a.nombre_propietario,
                            etapa: a.etapa,
                            estado: 'activo' as const,
                            peso_ingreso: a.peso_ingreso,
                            peso_compra: a.peso_compra,
                            fecha_ingreso: a.fecha_ingreso,
                            fecha_ingreso_ceba: a.fecha_ingreso_ceba,
                            peso_ingreso_ceba: a.peso_ingreso_ceba,
                            ultimo_peso: ult ? ult.peso : (a.peso_ingreso ?? a.peso_compra),
                            fecha_ultimo_pesaje: ult ? ult.fecha : a.fecha_ingreso,
                            id_potrerada: a.id_potrerada,
                            potrero_nombre: a.potreros?.nombre || '',
                            potrerada_nombre: a.potreradas?.nombre || '',
                            registros_pesaje: prevPesajes.length > 0 ? prevPesajes : (ult ? [ult] : []),
                            updated_at: ahoraIso
                        };
                    });
                    void localDB.animalesCache.bulkPut(itemsCache).catch(() => {});
                }
            }
        } catch {
            console.warn('[Inventario] Revalidación en segundo plano falló por red. Manteniendo datos locales.');
        } finally {
            setLoading(false);
        }
    };

    // Debounce search term to improve performance with 1700+ animals
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        fetchAnimales();
        const tablasInv = new Set(['animales', 'registros_pesaje', 'potreradas', 'potreros']);
        let timerReval: ReturnType<typeof setTimeout> | null = null;
        const refrescar = () => {
            if (timerReval) clearTimeout(timerReval);
            timerReval = setTimeout(() => { void fetchAnimales(); }, 250);
        };
        const onRevalidated = (e: Event) => {
            const tabla = (e as CustomEvent<{ tabla?: string }>).detail?.tabla;
            if (tabla && tablasInv.has(tabla)) refrescar();
        };
        window.addEventListener('offline-sync-completed', refrescar);
        window.addEventListener('offline-cache-revalidated', onRevalidated);
        return () => {
            if (timerReval) clearTimeout(timerReval);
            window.removeEventListener('offline-sync-completed', refrescar);
            window.removeEventListener('offline-cache-revalidated', onRevalidated);
        };
    }, [fincaId]);

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder(field === 'dias_pesaje' ? 'desc' : 'asc');
        }
    };

    const handleAnimalUpdated = (animalId: string, patch: Partial<Animal>) => {
        setSelectedAnimal(prev => (prev && prev.id === animalId) ? { ...prev, ...patch } : prev);
        setAnimales(prev => prev.map(a => a.id === animalId ? { ...a, ...patch } : a));
    };

    const handleAnimalDeleted = async (animalId: string) => {
        setAnimales(prev => prev.filter(a => a.id !== animalId));
        setSelectedAnimal(null);
        await refreshLicencia();
        toast('Animal eliminado del inventario.', 'success');
    };

    const sortedAndFilteredAnimals = useMemo(() => {
        return animales
            .filter(a => {
                const matchesSearch = a.numero_chapeta.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                    a.nombre_propietario.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                    (a.potreradaNombre || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase());
                const matchesEtapa = filterEtapa ? a.etapa === filterEtapa : true;
                const matchesPotrero = filterPotrero ? a.potreroNombre === filterPotrero : true;
                const matchesPotrerada = filterPotrerada ? a.potreradaNombre === filterPotrerada : true;
                const matchesPropietario = filterPropietario ? a.nombre_propietario === filterPropietario : true;

                // Filtros de notificaciones
                const matchesVencidos = filterLateWeighing ? (a.diasDesdeUltimoPesaje || 0) > 90 : true;
                const matchesPerdida = filterNegativeGain ? (() => {
                    const registros = a.registros_pesaje || [];
                    if (registros.length >= 2) {
                        return Number(registros[0].peso) < Number(registros[1].peso);
                    }
                    if (registros.length === 1) {
                        const r = registros[0];
                        return Number(r.gdp_calculada ?? 0) < 0 || Number(r.gmp_calculada ?? 0) < 0;
                    }
                    return false;
                })() : true;

                return matchesSearch && matchesEtapa && matchesPotrero && matchesPotrerada && matchesPropietario && matchesVencidos && matchesPerdida;
            })
            .sort((a, b) => {
                let res = 0;
                if (sortBy === 'chapeta') {
                    res = a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true });
                } else if (sortBy === 'propietario') {
                    res = a.nombre_propietario.localeCompare(b.nombre_propietario);
                } else if (sortBy === 'dias_pesaje') {
                    res = (a.diasDesdeUltimoPesaje || 0) - (b.diasDesdeUltimoPesaje || 0);
                } else if (sortBy === 'potrerada') {
                    res = (a.potreradaNombre || '').localeCompare(b.potreradaNombre || '');
                }
                return sortOrder === 'asc' ? res : -res;
            });
    }, [animales, debouncedSearchTerm, filterEtapa, filterPotrero, filterPotrerada, filterPropietario, filterLateWeighing, filterNegativeGain, sortBy, sortOrder]);

    const { uniquePotreros, uniquePotreradas, uniquePropietarios } = useMemo(() => {
        const potreros = new Set<string>();
        const potreradas = new Set<string>();
        const propietarios = new Set<string>();
        animales.forEach(a => {
            if (a.potreroNombre && a.potreroNombre !== 'Sin potrero') potreros.add(a.potreroNombre);
            if (a.potreradaNombre && a.potreradaNombre !== 'Sin potrerada') potreradas.add(a.potreradaNombre);
            if (a.nombre_propietario) propietarios.add(a.nombre_propietario);
        });
        return {
            uniquePotreros: Array.from(potreros),
            uniquePotreradas: Array.from(potreradas),
            uniquePropietarios: Array.from(propietarios)
        };
    }, [animales]);

    const statsFiltrados = useMemo(() => {
        const potreros = new Set<string>();
        const potreradas = new Set<string>();
        let alertas = 0;

        sortedAndFilteredAnimals.forEach(a => {
            if (a.potreroNombre && a.potreroNombre !== 'Sin potrero') potreros.add(a.potreroNombre);
            if (a.potreradaNombre && a.potreradaNombre !== 'Sin potrerada') potreradas.add(a.potreradaNombre);

            const ultimoP = a.registros_pesaje?.[0];
            const penultimoP = a.registros_pesaje?.[1];
            const pesoBase = a.peso_ingreso ?? a.peso_compra ?? 0;
            const fechaInicio = a.fecha_ingreso;
            const gmpUltimo = calcularGmpUltimoPeriodo(ultimoP, fechaInicio, pesoBase, penultimoP);

            if (gmpUltimo !== null && gmpUltimo <= umbralMedioGmp) {
                alertas++;
            }
        });

        return {
            total: sortedAndFilteredAnimals.length,
            potreros: potreros.size,
            potreradas: potreradas.size,
            alertas
        };
    }, [sortedAndFilteredAnimals, umbralMedioGmp]);

    return (
        <div className="page-container inventory-page">
            <div className="inventory-header">
                <h1 className="title">Inventario</h1>

                {role !== 'observador' && (
                    <div className="inventory-header-actions">
                        {(role === 'administrador' || role === 'vaquero') && (
                            <button
                                type="button"
                                className="inventory-header-btn"
                                onClick={() => {
                                    if (isBloqueado || (licenciaInfo && licenciaInfo.totalAnimalesOrganizacion >= licenciaInfo.limiteAnimales)) {
                                        setShowUpsellModal(true);
                                    } else {
                                        setShowCrearModal(true);
                                    }
                                }}
                                style={{ backgroundColor: 'var(--primary)' }}
                            >
                                <Plus size={18} aria-hidden="true" /> Crear Animal
                            </button>
                        )}
                        <button
                            type="button"
                            className="inventory-header-btn inventory-header-btn--danger"
                            onClick={() => setShowMuerteModal(true)}
                        >
                            <Skull size={18} aria-hidden="true" /> Reportar muerte
                        </button>
                    </div>
                )}
            </div>

            <LicenseBlockedBanner
                licenciaInfo={licenciaInfo}
                onUpgradeClick={() => setShowUpsellModal(true)}
                expiredDetail="Toda tu información histórica está visible e intacta. Para habilitar nuevos pesajes y operaciones, renueva tu suscripción."
                overLimitDetail="Toda tu información histórica está visible e intacta. Para habilitar nuevos pesajes y compras, actualiza tu plan."
            />

            <div className="inventory-kpi-grid">
                <div className="card inventory-kpi-card" style={{ background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)' }}>
                    <div className="inventory-kpi-label">Total Animales</div>
                    <div className="inventory-kpi-value" style={{ color: 'var(--primary-light)' }}>{statsFiltrados.total}</div>
                </div>
                <div className="card inventory-kpi-card" style={{ background: 'var(--secondary-soft-bg)', border: '1px solid var(--secondary-soft-border)' }}>
                    <div className="inventory-kpi-label">Potreradas</div>
                    <div className="inventory-kpi-value" style={{ color: 'var(--secondary)' }}>{statsFiltrados.potreradas}</div>
                </div>
                <div className="card inventory-kpi-card" style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                    <div className="inventory-kpi-label">Potreros en Uso</div>
                    <div className="inventory-kpi-value">{statsFiltrados.potreros}</div>
                </div>
                <div className="card inventory-kpi-card" style={{ background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)' }}>
                    <div className="inventory-kpi-label">Alertas ({getModoLabel(modoGanancia)} Bajo)</div>
                    <div className="inventory-kpi-value" style={{ color: 'var(--error)' }}>
                        {statsFiltrados.alertas}
                    </div>
                </div>
            </div>

            <div className="glass-panel inventory-filters-panel">
                <search className="inventory-search-wrap" role="search">
                    <Search size={18} aria-hidden="true" className="inventory-search-icon" />
                    <input
                        type="search"
                        aria-label="Buscar por chapeta, propietario o potrerada"
                        placeholder="Buscar chapeta, propietario o lote..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="inventory-search-input"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            className="inventory-clear-btn"
                            aria-label="Limpiar búsqueda"
                            onClick={() => setSearchTerm('')}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    )}
                </search>
                <div className="inventory-selects-group">
                    <div className="inventory-filter-field">
                        <select
                            aria-label="Filtrar por etapa"
                            value={filterEtapa}
                            onChange={(e) => setFilterEtapa(e.target.value)}
                            style={{ marginBottom: 0 }}
                        >
                            <option value="">-- Etapa --</option>
                            <option value="cria">Cría</option>
                            <option value="levante">Levante</option>
                            <option value="ceba">Ceba</option>
                        </select>
                    </div>
                    <div className="inventory-filter-field">
                        <select
                            aria-label="Filtrar por potrerada"
                            value={filterPotrerada}
                            onChange={(e) => setFilterPotrerada(e.target.value)}
                            style={{ marginBottom: 0 }}
                        >
                            <option value="">-- Potrerada --</option>
                            <option value="Sin potrerada">Sin Potrerada</option>
                            {uniquePotreradas.sort().map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                        </select>
                    </div>
                    <div className="inventory-filter-field">
                        <select
                            aria-label="Filtrar por potrero"
                            value={filterPotrero}
                            onChange={(e) => setFilterPotrero(e.target.value)}
                            style={{ marginBottom: 0 }}
                        >
                            <option value="">-- Potrero --</option>
                            <option value="Sin potrero">Sin Potrero</option>
                            {uniquePotreros.sort().map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                        </select>
                    </div>
                    <div className="inventory-filter-field">
                        <select
                            aria-label="Filtrar por propietario"
                            value={filterPropietario}
                            onChange={(e) => setFilterPropietario(e.target.value)}
                            style={{ marginBottom: 0 }}
                        >
                            <option value="">-- Propietario --</option>
                            {uniquePropietarios.map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                        </select>
                    </div>
                </div>
                {(searchTerm || filterEtapa || filterPotrero || filterPotrerada || filterPropietario) && (
                    <div className="inventory-filter-actions">
                        {(searchTerm || filterEtapa || filterPotrero || filterPotrerada || filterPropietario) && (
                            <button
                                type="button"
                                className="inventory-btn-ghost"
                                onClick={() => {
                                    setSearchTerm('');
                                    setFilterEtapa('');
                                    setFilterPotrero('');
                                    setFilterPotrerada('');
                                    setFilterPropietario('');
                                }}
                            >
                                Limpiar
                            </button>
                        )}
                        {filterPropietario && (
                            <button
                                type="button"
                                className="inventory-btn-informe"
                                onClick={() => { setCapitalInvertido(''); setShowCapitalModal(true); }}
                            >
                                <BarChart2 size={18} aria-hidden="true" /> Informe de Propietario
                            </button>
                        )}
                    </div>
                )}
            </div>

            {isMobile && !loading && sortedAndFilteredAnimals.length > 0 && (
                <div className="inventory-mobile-sort-bar" aria-label="Ordenar animales">
                    {[
                        { col: 'dias_pesaje', label: 'Último Pesaje' },
                        { col: 'chapeta', label: 'Chapeta' },
                        { col: 'propietario', label: 'Propietario' },
                    ].map(opt => {
                        const active = sortBy === opt.col;
                        return (
                            <button
                                key={opt.col}
                                type="button"
                                className={`inventory-mobile-sort-chip${active ? ' is-active' : ''}`}
                                onClick={() => handleSort(opt.col)}
                            >
                                {opt.label}{active ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="table-container inventory-table-wrap" style={{ padding: 0 }}>
                <table className="inventory-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <th scope="col" aria-sort={sortBy === 'chapeta' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}>
                                <button type="button" className="inventory-sort-btn" onClick={() => handleSort('chapeta')}>
                                    <span>Chapeta</span>
                                    <ArrowUpDown size={14} aria-hidden="true" opacity={sortBy === 'chapeta' ? 1 : 0.3} />
                                </button>
                            </th>
                            <th scope="col" aria-sort={sortBy === 'propietario' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}>
                                <button type="button" className="inventory-sort-btn" onClick={() => handleSort('propietario')}>
                                    <span>Propietario / Etapa</span>
                                    <ArrowUpDown size={14} aria-hidden="true" opacity={sortBy === 'propietario' ? 1 : 0.3} />
                                </button>
                            </th>
                            <th scope="col" aria-sort={sortBy === 'dias_pesaje' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}>
                                <button type="button" className="inventory-sort-btn" onClick={() => handleSort('dias_pesaje')}>
                                    <span>Último Pesaje</span>
                                    <ArrowUpDown size={14} aria-hidden="true" opacity={sortBy === 'dias_pesaje' ? 1 : 0.3} />
                                </button>
                            </th>
                            <th scope="col" style={{ padding: '16px', color: 'var(--text-muted)' }}>Último Peso</th>
                            <th scope="col" style={{ padding: '16px', color: 'var(--text-muted)' }}>{getModoLabel(modoGanancia)} (Últ. / Hist.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr className="is-status-row"><td colSpan={5} style={{ padding: '44px', textAlign: 'center', color: 'var(--primary)' }}>Cargando datos del hato...</td></tr>
                        ) : sortedAndFilteredAnimals.length === 0 ? (
                            <tr className="is-status-row"><td colSpan={5} style={{ padding: '44px', textAlign: 'center' }}>No hay animales registrados.</td></tr>
                        ) : (
                            sortedAndFilteredAnimals.map((animal) => {
                                const ultimoP = animal.registros_pesaje?.[0];
                                const penultimoP = animal.registros_pesaje?.[1];
                                const pesoBase = animal.peso_ingreso ?? animal.peso_compra ?? 0;
                                const fechaInicio = animal.fecha_ingreso;

                                const tienePesajePosterior = Boolean(ultimoP && esPesajePosteriorAIngreso(ultimoP.fecha, fechaInicio));
                                const fechaU = tienePesajePosterior && ultimoP ? formatLocalDate(ultimoP.fecha) : 'Sin pesajes';
                                const pesoU = tienePesajePosterior && ultimoP ? `${Math.round(ultimoP.peso)} kg` : `${Math.round(pesoBase)} kg*`;

                                const gananciaTotal = tienePesajePosterior && ultimoP ? (ultimoP.peso - pesoBase) : 0;
                                const gmpUltimo = calcularGmpUltimoPeriodo(ultimoP, fechaInicio, pesoBase, penultimoP);
                                const gmpHistorico = calcularGmpAcumulado(ultimoP?.peso, pesoBase, fechaInicio, ultimoP?.fecha);
                                const hasRecords = gmpUltimo !== null;
                                const gmpPromedio = gmpUltimo ?? 0;
                                const isAlerta = hasRecords && gmpPromedio < 0;
                                const getColorForGmp = (val: number | null) => {
                                    if (val === null) return 'var(--text-muted)';
                                    if (val < 0) return 'var(--error)';
                                    if (val <= umbralMedioGmp) return 'var(--warning)';
                                    if (val <= umbralAltoGmp) return 'var(--text-light)';
                                    return 'var(--success)';
                                };
                                const gmpColor = getColorForGmp(gmpUltimo);
                                const gmpHistColor = getColorForGmp(gmpHistorico);

                                return (
                                    <tr key={animal.id}
                                        onClick={() => setSelectedAnimal(animal)}
                                        className={`table-row-hover${isAlerta ? ' is-alerta' : ''}`}
                                        style={{
                                            borderBottom: '1px solid var(--border-subtle)',
                                            transition: 'background 0.2s',
                                            cursor: 'pointer'
                                        }}>
                                        <td className="inventory-col-chapeta" style={{ padding: '16px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                            <span style={{ color: 'var(--primary-light)' }}>#</span>{animal.numero_chapeta}
                                            <span className="inventory-mobile-cue">Ver ficha ›</span>
                                        </td>
                                        <td className="inventory-col-meta" style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: '500' }}>{animal.nombre_propietario}</div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {animal.etapa} • <span style={{ color: 'var(--primary-light)', fontStyle: 'italic', textTransform: 'capitalize' }}>{animal.potreradaNombre}</span>
                                                <span style={{ marginLeft: '8px', opacity: 0.85 }}>({animal.potreroNombre})</span>
                                            </div>
                                        </td>
                                        <td className="inventory-col-pesaje" style={{ padding: '16px' }}>
                                            <span className="inventory-cell-prefix">Último pesaje</span>
                                            <div style={{
                                                fontWeight: 'bold',
                                                fontSize: '1.05rem',
                                                color: (animal.diasDesdeUltimoPesaje || 0) > 90 ? 'var(--error)' : 'var(--text-main)'
                                            }}>
                                                Hace {animal.diasDesdeUltimoPesaje} {animal.diasDesdeUltimoPesaje === 1 ? 'día' : 'días'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tienePesajePosterior ? fechaU : 'Ingreso: ' + formatLocalDate(animal.fecha_ingreso)}</div>
                                        </td>
                                        <td className="inventory-col-peso" style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{pesoU}</div>
                                            {tienePesajePosterior && (
                                                <div style={{ fontSize: '0.75rem', color: gananciaTotal >= 0 ? 'var(--text-muted)' : 'var(--error)' }}>
                                                    {gananciaTotal >= 0 ? '+' : ''}{gananciaTotal.toFixed(1)} kg ganados
                                                </div>
                                            )}
                                        </td>
                                        <td className="inventory-col-gmp" style={{ padding: '16px' }}>
                                            <span className="inventory-cell-prefix">Ganancia ({getModoLabel(modoGanancia)})</span>
                                            {hasRecords ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: isMobile ? 'flex-end' : undefined }}>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        color: gmpColor === 'var(--text-light)' ? 'var(--text-main)' : gmpColor,
                                                        fontWeight: 'bold'
                                                    }}>
                                                        <div style={{
                                                            width: '10px',
                                                            height: '10px',
                                                            borderRadius: '50%',
                                                            backgroundColor: gmpColor,
                                                            border: gmpColor === 'var(--text-light)' ? '1px solid var(--border-strong)' : 'none'
                                                        }}></div>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>Últ:</span>
                                                        {toDisplayValue(gmpPromedio, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} {getUnidadLabel(modoGanancia)}
                                                    </div>
                                                    {gmpHistorico !== null && (
                                                        <div style={{ fontSize: '0.76rem', paddingLeft: isMobile ? 0 : '18px', color: 'var(--text-muted)' }}>
                                                            Hist:{' '}
                                                            <span style={{ color: gmpHistColor === 'var(--text-light)' ? 'var(--text-secondary)' : gmpHistColor, fontWeight: 600 }}>
                                                                {toDisplayValue(gmpHistorico, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} {getUnidadLabel(modoGanancia)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)', fontWeight: '500', fontSize: '0.85rem' }}>Sin pesajes</div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {showMuerteModal && (
                <InventoryDeathReportModal
                    fincaId={fincaId}
                    onClose={() => setShowMuerteModal(false)}
                    onReported={() => {
                        if (refreshLicencia) void refreshLicencia();
                        void fetchAnimales();
                    }}
                />
            )}

            {selectedAnimal && (
                <InventoryDetailModal
                    animal={selectedAnimal}
                    fincaId={fincaId}
                    isAdmin={isAdmin}
                    isMobile={isMobile}
                    modoGanancia={modoGanancia}
                    umbralAltoGmp={umbralAltoGmp}
                    umbralMedioGmp={umbralMedioGmp}
                    onClose={() => setSelectedAnimal(null)}
                    onAnimalUpdated={handleAnimalUpdated}
                    onAnimalDeleted={handleAnimalDeleted}
                />
            )}

            {showCrearModal && (
                <InventoryCreateAnimalModal
                    fincaId={fincaId}
                    propietariosLista={propietariosLista}
                    potreradasDisponibles={potreradasDisponibles}
                    onClose={() => setShowCrearModal(false)}
                    onCreated={async () => {
                        if (refreshLicencia) await refreshLicencia();
                        void fetchAnimales();
                    }}
                />
            )}

            {/* Modal para ingresar capital invertido antes de generar el informe */}
            {showCapitalModal && filterPropietario && (
                <div className="modal-overlay" onClick={() => setShowCapitalModal(false)}>
                    <div className="card inventory-modal-card" style={{ maxWidth: '480px', border: '1px solid var(--primary-soft-border)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }} aria-hidden="true">💰</div>
                            <h2 style={{ color: 'var(--text-main)', margin: '0 0 8px 0' }}>Capital Invertido</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                Ingresa el valor total que tiene <strong style={{ color: 'var(--primary-light)' }}>{filterPropietario}</strong> invertido en la finca (valor de compra total de sus animales).
                            </p>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <label htmlFor="inv-capital-invertido" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Capital Invertido (COP $)</label>
                            <input
                                id="inv-capital-invertido"
                                type="number"
                                inputMode="numeric"
                                placeholder="Ej: 50000000"
                                value={capitalInvertido}
                                onChange={e => setCapitalInvertido(e.target.value)}
                                style={{ fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'right' }}
                                autoFocus={!isMobile}
                            />
                            {capitalInvertido && parseFloat(capitalInvertido) > 0 && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--primary-light)', marginTop: '6px', textAlign: 'right' }}>
                                    {parseFloat(capitalInvertido).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                                </div>
                            )}
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '20px' }}>
                            Este dato solo se usa para calcular la rentabilidad del informe y no se guarda en la base de datos.
                        </p>
                        <div className="inventory-modal-actions-row" style={{ display: 'flex', gap: '12px' }}>
                            <button
                                type="button"
                                className="inventory-btn-ghost"
                                onClick={() => setShowCapitalModal(false)}
                                style={{ flex: 1 }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCapitalModal(false);
                                    setShowPropietarioDashboard(true);
                                }}
                                style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', flex: 2 }}
                                disabled={!capitalInvertido || parseFloat(capitalInvertido) <= 0}
                            >
                                Generar Informe
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPropietarioDashboard && filterPropietario && (
                <PropietarioDashboardModal
                    propietario={filterPropietario}
                    fincaNombre={fincaNombre}
                    animales={animales.filter(a => a.nombre_propietario === filterPropietario)}
                    onClose={() => setShowPropietarioDashboard(false)}
                    umbralAlto={umbralAltoGmp}
                    umbralMedio={umbralMedioGmp}
                    capitalInvertido={parseFloat(capitalInvertido) || 0}
                    precioVentaPromedio={precioVentaPromedio}
                    modoGanancia={modoGanancia}
                />
            )}

            <ModalUpsell
                isOpen={showUpsellModal}
                onClose={() => setShowUpsellModal(false)}
                licenciaInfo={licenciaInfo}
            />
        </div>
    );
}
