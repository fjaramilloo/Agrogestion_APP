import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Skull, Calendar, AlertCircle, ArrowUpDown, X, Plus, Trash2, BarChart2 } from 'lucide-react';
import PropietarioDashboardModal from '../components/PropietarioDashboardModal';
import ModalUpsell from '../components/ModalUpsell';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { toDisplayValue, getUnidadLabel, getModoLabel } from '../utils/ganancia';
import { localDB } from '../lib/db';
import { sincronizarCacheFinca } from '../lib/offlineService';

interface Pesaje {
    peso: number;
    fecha: string;
    gdp_calculada: number;
    gmp_calculada?: number;
    potreros?: { nombre: string } | null;
}

interface Animal {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    especie: string;
    sexo: string;
    etapa: string;
    peso_ingreso: number;
    peso_compra?: number | null;
    fecha_ingreso: string;
    fecha_ingreso_ceba?: string | null;
    peso_ingreso_ceba?: number | null;
    estado: string;
    id_potrerada?: string | null;
    potreros?: { nombre: string } | null;
    potreradas?: { nombre: string } | null;
    potreroNombre?: string;
    potreradaNombre?: string;
    diasDesdeUltimoPesaje?: number;
    registros_pesaje: Pesaje[];
}

export default function Inventory() {
    const { fincaId, role, userFincas, modoGanancia, licenciaInfo, refreshLicencia } = useAuth();
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

    // Estados para Muerte
    const [showMuerteModal, setShowMuerteModal] = useState(false);
    const [chapetaMuerte, setChapetaMuerte] = useState('');
    const [fechaMuerte, setFechaMuerte] = useState(new Date().toISOString().split('T')[0]);
    const [msjErrorMuerte, setMsjErrorMuerte] = useState('');

    // Modal Historial Animal
    const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
    const [potreradasDisponibles, setPotreradasDisponibles] = useState<{ id: string; nombre: string }[]>([]);
    const [propietariosLista, setPropietariosLista] = useState<{ id: string; nombre: string }[]>([]);


    const fincaNombre = userFincas.find(f => f.id_finca === fincaId)?.nombre_finca || 'Finca';

    // Modal Propietario Dashboard
    const [showPropietarioDashboard, setShowPropietarioDashboard] = useState(false);
    const [showCapitalModal, setShowCapitalModal] = useState(false);
    const [capitalInvertido, setCapitalInvertido] = useState('');
    const [precioVentaPromedio, setPrecioVentaPromedio] = useState(0);

    // Estados para Crear Animal Solo
    const [showCrearModal, setShowCrearModal] = useState(false);
    const [nuevoAnimal, setNuevoAnimal] = useState({
        numero_chapeta: '',
        nombre_propietario: '',
        especie: 'bovino',
        sexo: 'M',
        etapa: 'levante',
        peso_ingreso: '',
        fecha_ingreso: new Date().toISOString().split('T')[0],
        id_potrerada: '',
        tipo_macho: 'Toro'
    });
    const [nuevosPesajes, setNuevosPesajes] = useState<{ fecha: string; peso: string; etapa: string }[]>([]);
    const [msjErrorCrear, setMsjErrorCrear] = useState('');
    const [isChapetaTaken, setIsChapetaTaken] = useState(false);
    const [validatingChapeta, setValidatingChapeta] = useState(false);

    useEffect(() => {
        const checkChapeta = async () => {
            if (!nuevoAnimal.numero_chapeta || !fincaId) {
                setIsChapetaTaken(false);
                return;
            }
            setValidatingChapeta(true);
            const { data } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', nuevoAnimal.numero_chapeta)
                .eq('estado', 'activo')
                .maybeSingle();
            
            setIsChapetaTaken(!!data);
            setValidatingChapeta(false);
        };
        
        const timeoutId = setTimeout(checkChapeta, 500);
        return () => clearTimeout(timeoutId);
    }, [nuevoAnimal.numero_chapeta, fincaId]);

    const fetchAnimales = async () => {
        if (!fincaId) return;
        setLoading(true);

        if (navigator.onLine) {
            try {
                // FASE 2 - OPTIMIZACIÓN: 4 consultas en paralelo con .limit(50000)
                const [configRes, animalesRes, ultimosPesajesRes, potsRes, propRes] = await Promise.all([
                    supabase
                        .from('configuracion_kpi')
                        .select('umbral_alto_gmp, umbral_medio_gmp, precio_venta_promedio')
                        .eq('id_finca', fincaId)
                        .single(),
                    supabase
                        .from('animales')
                        .select(`
                            id, numero_chapeta, nombre_propietario, especie, sexo, etapa,
                            peso_ingreso, peso_compra, fecha_ingreso, fecha_ingreso_ceba,
                            peso_ingreso_ceba, estado, id_potrerada, creado_en,
                            potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
                            potreros ( nombre )
                        `)
                        .eq('id_finca', fincaId)
                        .eq('estado', 'activo')
                        .order('creado_en', { ascending: false })
                        .limit(50000),
                    supabase.rpc('get_ultimos_pesajes_finca', { p_finca_id: fincaId }).limit(50000),
                    supabase
                        .from('potreradas')
                        .select('id, nombre')
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

                if (!animalesRes.error && animalesRes.data) {
                    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

                    const dataProcesada = animalesRes.data.map((a: any) => {
                        const ultimoP = ultimosPesajesMap.get(a.id) || null;
                        const fechaRef = ultimoP ? new Date(ultimoP.fecha) : new Date(a.fecha_ingreso);
                        fechaRef.setHours(0, 0, 0, 0);
                        const diasDesdeUltimoPesaje = differenceInDays(hoy, fechaRef);

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

                if (potsRes.data) setPotreradasDisponibles(potsRes.data);
                if (propRes.data) setPropietariosLista(propRes.data);

                // Actualizar la memoria IndexedDB en segundo plano
                sincronizarCacheFinca(fincaId);
                setLoading(false);
                return;
            } catch (err) {
                console.warn('Fallo red Supabase, buscando en caché local...', err);
            }
        }

        // FALLBACK OFFLINE (IndexedDB)
        const cachedAnimales = await localDB.animalesCache
            .where('id_finca')
            .equals(fincaId)
            .toArray();

        const cachedPotreradas = await localDB.potreradasCache
            .where('id_finca')
            .equals(fincaId)
            .toArray();

        if (cachedAnimales && cachedAnimales.length > 0) {
            const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

            const dataProcesada = cachedAnimales.map((a: any) => {
                const fechaRef = a.fecha_ultimo_pesaje ? new Date(a.fecha_ultimo_pesaje) : new Date(a.fecha_ingreso);
                fechaRef.setHours(0, 0, 0, 0);
                const diasDesdeUltimoPesaje = differenceInDays(hoy, fechaRef);

                return {
                    id: a.id,
                    numero_chapeta: a.numero_chapeta,
                    nombre_propietario: a.nombre_propietario || 'Sin Propietario',
                    especie: 'bovino',
                    sexo: 'M',
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
                    registros_pesaje: a.ultimo_peso ? [{ peso: a.ultimo_peso, fecha: a.fecha_ultimo_pesaje || a.updated_at, gdp_calculada: 0 }] : [],
                    diasDesdeUltimoPesaje
                };
            });

            setAnimales(dataProcesada);
        }

        if (cachedPotreradas && cachedPotreradas.length > 0) {
            setPotreradasDisponibles(cachedPotreradas);
        }

        setLoading(false);
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
    }, [fincaId]);

    const handleReportarMuerte = async () => {
        if (!fincaId || !chapetaMuerte.trim()) return;
        setLoading(true);
        setMsjErrorMuerte('');

        try {
            const { data: animal, error: searchError } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', chapetaMuerte.trim())
                .eq('estado', 'activo')
                .single();

            if (searchError || !animal) {
                throw new Error("Animal no encontrado o no está activo en esta finca.");
            }

            const { error: updateError } = await supabase
                .from('animales')
                .update({
                    estado: 'muerto',
                    fecha_muerte: fechaMuerte
                })
                .eq('id', animal.id);

            if (updateError) throw updateError;

            setShowMuerteModal(false);
            setChapetaMuerte('');
            fetchAnimales();
            alert(`Se ha registrado el fallecimiento del animal #${chapetaMuerte}`);
        } catch (err: any) {
            setMsjErrorMuerte(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder(field === 'dias_pesaje' ? 'desc' : 'asc');
        }
    };


    const handleCrearAnimal = async () => {
        const isFormValid = nuevoAnimal.numero_chapeta && nuevoAnimal.peso_ingreso && nuevoAnimal.nombre_propietario && nuevoAnimal.especie && nuevoAnimal.sexo && nuevoAnimal.etapa && nuevoAnimal.fecha_ingreso && !isChapetaTaken;
        if (!fincaId || !isFormValid) return;
        setLoading(true);
        setMsjErrorCrear('');

        try {
            const { data: exist } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', nuevoAnimal.numero_chapeta)
                .eq('estado', 'activo')
                .maybeSingle();
            
            if (exist) throw new Error(`El animal con chapeta #${nuevoAnimal.numero_chapeta} ya existe y está activo.`);

            const { data: animalInsertado, error: errAnimal } = await supabase
                .from('animales')
                .insert([{
                    id_finca: fincaId,
                    numero_chapeta: nuevoAnimal.numero_chapeta,
                    nombre_propietario: nuevoAnimal.nombre_propietario || 'Finca',
                    especie: nuevoAnimal.especie,
                    sexo: nuevoAnimal.sexo,
                    etapa: nuevoAnimal.etapa,
                    peso_ingreso: parseFloat(nuevoAnimal.peso_ingreso),
                    fecha_ingreso: nuevoAnimal.fecha_ingreso,
                    id_potrerada: nuevoAnimal.id_potrerada || null,
                    tipo_macho: nuevoAnimal.sexo === 'M' ? nuevoAnimal.tipo_macho : null,
                    estado: 'activo'
                }])
                .select()
                .single();

            if (errAnimal) throw errAnimal;

            if (animalInsertado && nuevosPesajes.length > 0) {
                const pesajesData = nuevosPesajes
                    .filter(p => p.fecha && p.peso && !isNaN(parseFloat(p.peso)))
                    .map(p => ({
                        id_animal: animalInsertado.id,
                        fecha: p.fecha,
                        peso: parseFloat(p.peso),
                        etapa: p.etapa,
                        gdp_calculada: 0
                    }));

                if (pesajesData.length > 0) {
                    const { error: errPesajes } = await supabase
                        .from('registros_pesaje')
                        .insert(pesajesData);
                    if (errPesajes) throw errPesajes;
                }
            }

            setShowCrearModal(false);
            if (refreshLicencia) await refreshLicencia();
            setNuevoAnimal({
                numero_chapeta: '',
                nombre_propietario: '',
                especie: 'bovino',
                sexo: 'M',
                etapa: 'levante',
                peso_ingreso: '',
                fecha_ingreso: new Date().toISOString().split('T')[0],
                id_potrerada: '',
                tipo_macho: 'Toro'
            });
            setNuevosPesajes([]);
            fetchAnimales();
            alert("Animal creado exitosamente con su historial.");

        } catch (err: any) {
            setMsjErrorCrear(err.message);
        } finally {
            setLoading(false);
        }
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
            if (ultimoP) {
                const isCeba = a.etapa === 'ceba';
                const pesoBase = isCeba ? (a.peso_ingreso_ceba || a.peso_compra || a.peso_ingreso || 0) : (a.peso_compra ?? a.peso_ingreso ?? 0);
                const fechaInicio = isCeba ? (a.fecha_ingreso_ceba || a.fecha_ingreso) : a.fecha_ingreso;
                const fechaRef = new Date(ultimoP.fecha);
                const dias = differenceInDays(fechaRef, new Date(fechaInicio)) || 1;
                const gmp = ultimoP.gmp_calculada !== null && ultimoP.gmp_calculada !== undefined ? Number(ultimoP.gmp_calculada) : ((ultimoP.peso - pesoBase) / dias) * 30;
                
                if (gmp <= umbralMedioGmp) alertas++;
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
        <div className="page-container">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
                <h1 className="title" style={{ margin: 0 }}>Animales de la Finca</h1>

                {role !== 'observador' && (
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {(role === 'administrador' || role === 'vaquero') && (
                            <button
                                onClick={() => {
                                    if (licenciaInfo && licenciaInfo.totalAnimalesOrganizacion >= licenciaInfo.limiteAnimales) {
                                        setShowUpsellModal(true);
                                    } else {
                                        setShowCrearModal(true);
                                    }
                                }}
                                style={{ width: 'auto', backgroundColor: 'var(--primary)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <Plus size={18} /> Crear Animal
                            </button>
                        )}
                        <button
                            onClick={() => setShowMuerteModal(true)}
                            style={{ width: 'auto', backgroundColor: 'var(--error)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Skull size={18} /> Reportar muerte
                        </button>
                    </div>
                )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(46, 125, 50, 0.1)', border: '1px solid rgba(46, 125, 50, 0.2)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Animales</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>{statsFiltrados.total}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(255, 179, 0, 0.05)', border: '1px solid rgba(255, 179, 0, 0.1)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Potreradas</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{statsFiltrados.potreradas}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Potreros en Uso</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{statsFiltrados.potreros}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(244, 67, 54, 0.05)', border: '1px solid rgba(244, 67, 54, 0.1)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Alertas (GDP Bajo)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--error)' }}>
                        {statsFiltrados.alertas}
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: '2 1 300px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por chapeta, propietario o potrerada..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ marginBottom: 0, paddingLeft: '40px' }}
                    />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <select
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
                <div style={{ flex: '1 1 140px' }}>
                    <select
                        value={filterPotrerada}
                        onChange={(e) => setFilterPotrerada(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">-- Potrerada --</option>
                        <option value="Sin potrerada">Sin Potrerada</option>
                        {uniquePotreradas.sort().map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                    </select>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <select
                        value={filterPotrero}
                        onChange={(e) => setFilterPotrero(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">-- Potrero --</option>
                        <option value="Sin potrero">Sin Potrero</option>
                        {uniquePotreros.sort().map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                    </select>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <select
                        value={filterPropietario}
                        onChange={(e) => setFilterPropietario(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">-- Propietario --</option>
                        {uniquePropietarios.map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                    </select>
                </div>
                {(searchTerm || filterEtapa || filterPotrero || filterPotrerada || filterPropietario) && (
                    <button 
                        onClick={() => {
                            setSearchTerm('');
                            setFilterEtapa('');
                            setFilterPotrero('');
                            setFilterPotrerada('');
                            setFilterPropietario('');
                        }}
                        style={{ width: 'auto', background: 'transparent', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px' }}
                    >
                        Limpiar
                    </button>
                )}
                {filterPropietario && (
                    <button
                        onClick={() => { setCapitalInvertido(''); setShowCapitalModal(true); }}
                        style={{ width: 'auto', background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <BarChart2 size={18} /> Informe de Propietario
                    </button>
                )}
            </div>

            <div className="table-container" style={{ padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('chapeta')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Chapeta <ArrowUpDown size={14} opacity={sortBy === 'chapeta' ? 1 : 0.3} /></div>
                            </th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('propietario')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Propietario / Etapa <ArrowUpDown size={14} opacity={sortBy === 'propietario' ? 1 : 0.3} /></div>
                            </th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('dias_pesaje')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Último Pesaje <ArrowUpDown size={14} opacity={sortBy === 'dias_pesaje' ? 1 : 0.3} /></div>
                            </th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Último Peso</th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>{getModoLabel(modoGanancia)} Promedio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ padding: '44px', textAlign: 'center', color: 'var(--primary)' }}>Cargando datos del hato...</td></tr>
                        ) : sortedAndFilteredAnimals.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '44px', textAlign: 'center' }}>No hay animales registrados.</td></tr>
                        ) : (
                            sortedAndFilteredAnimals.map((animal) => {
                                const ultimoP = animal.registros_pesaje?.[0];
                                const isCeba = animal.etapa === 'ceba';
                                const pesoBase = isCeba ? (animal.peso_ingreso_ceba || animal.peso_compra || animal.peso_ingreso || 0) : (animal.peso_compra ?? animal.peso_ingreso ?? 0);
                                const fechaInicio = isCeba ? (animal.fecha_ingreso_ceba || animal.fecha_ingreso) : animal.fecha_ingreso;
                                
                                const fechaU = ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : 'Sin pesajes';
                                const pesoU = ultimoP ? `${Math.round(ultimoP.peso)} kg` : `${Math.round(pesoBase)} kg*`;

                                const fechaReferencia = ultimoP ? new Date(ultimoP.fecha) : new Date();
                                const pesoReferencia = ultimoP ? ultimoP.peso : pesoBase;
                                const dias = differenceInDays(fechaReferencia, new Date(fechaInicio)) || 1;
                                const gananciaTotal = pesoReferencia - pesoBase;
                                const hasRecords = !!ultimoP;
                                const gmpPromedio = (ultimoP && ultimoP.gmp_calculada !== null && ultimoP.gmp_calculada !== undefined) ? Number(ultimoP.gmp_calculada) : (gananciaTotal / dias) * 30;
                                const isAlerta = hasRecords && gmpPromedio < 0;
                                const gmpColor = !hasRecords ? 'var(--text-muted)' : (
                                    gmpPromedio < 0 ? 'var(--error)' : (
                                        gmpPromedio <= umbralMedioGmp ? 'var(--warning)' : (
                                            gmpPromedio <= umbralAltoGmp ? 'var(--text-light)' : 'var(--success)'
                                        )
                                    )
                                );

                                return (
                                    <tr key={animal.id} 
                                        onClick={async () => {
                                            setSelectedAnimal(animal);
                                            const { data: historial } = await supabase
                                                .from('registros_pesaje')
                                                .select('peso, fecha, gdp_calculada, gmp_calculada, potreros(nombre)')
                                                .eq('id_animal', animal.id)
                                                .order('fecha', { ascending: false });
                                            if (historial) {
                                                const unique = new Set<string>();
                                                const dedup: Pesaje[] = historial
                                                    .filter((p: any) => {
                                                        const d = p.fecha.split('T')[0];
                                                        if (unique.has(d)) return false;
                                                        unique.add(d); return true;
                                                    })
                                                    .map((p: any) => ({
                                                        peso: p.peso,
                                                        fecha: p.fecha,
                                                        gdp_calculada: p.gdp_calculada,
                                                        potreros: Array.isArray(p.potreros) ? (p.potreros[0] || null) : p.potreros
                                                    }));
                                                setSelectedAnimal(prev => prev ? { ...prev, registros_pesaje: dedup } : null);
                                            }
                                        }}
                                        className="table-row-hover"
                                        style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        backgroundColor: isAlerta ? 'rgba(244, 67, 54, 0.05)' : 'transparent',
                                        transition: 'background 0.2s',
                                        cursor: 'pointer'
                                    }}>
                                        <td style={{ padding: '16px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                            <span style={{ color: 'var(--primary-light)' }}>#</span>{animal.numero_chapeta}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: '500' }}>{animal.nombre_propietario}</div>
                                             <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {animal.etapa} • <span style={{ color: 'var(--primary-light)', fontStyle: 'italic', textTransform: 'capitalize' }}>{animal.potreradaNombre}</span>
                                                <span style={{ marginLeft: '8px', opacity: 0.8 }}>({animal.potreroNombre})</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ 
                                                fontWeight: 'bold', 
                                                fontSize: '1.05rem', 
                                                color: (animal.diasDesdeUltimoPesaje || 0) > 90 ? 'var(--error)' : 'white' 
                                            }}>
                                                Hace {animal.diasDesdeUltimoPesaje} {animal.diasDesdeUltimoPesaje === 1 ? 'día' : 'días'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ultimoP ? fechaU : 'Ingreso: ' + format(new Date(animal.fecha_ingreso), 'dd/MM/yyyy')}</div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{pesoU}</div>
                                            {(animal.registros_pesaje?.length || 0) > 1 && ultimoP && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+{(ultimoP.peso - (animal.peso_compra ?? animal.peso_ingreso)).toFixed(1)} kg ganados</div>}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {hasRecords ? (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    color: gmpColor === 'var(--text-light)' ? 'white' : gmpColor,
                                                    fontWeight: 'bold'
                                                }}>
                                                    <div style={{ 
                                                        width: '10px', 
                                                        height: '10px', 
                                                        borderRadius: '50%', 
                                                        backgroundColor: gmpColor,
                                                        border: gmpColor === 'var(--text-light)' ? '1px solid rgba(255,255,255,0.4)' : 'none'
                                                    }}></div>
                                                    {toDisplayValue(gmpPromedio, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} {getUnidadLabel(modoGanancia)}
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>NA</div>
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
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setShowMuerteModal(false)}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', border: '1px solid var(--error)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <Skull size={48} color="var(--error)" style={{ marginBottom: '16px' }} />
                            <h2 style={{ color: 'white' }}>Reportar Fallecimiento</h2>
                            <p style={{ color: 'var(--text-muted)' }}>Esta acción inactivará al animal permanentemente.</p>
                        </div>

                        {msjErrorMuerte && (
                            <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.1)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <AlertCircle size={16} /> {msjErrorMuerte}
                            </div>
                        )}

                        <div style={{ marginBottom: '20px' }}>
                            <label>Número de Chapeta</label>
                            <input
                                type="text"
                                placeholder="Ej: 1234"
                                value={chapetaMuerte}
                                onChange={e => setChapetaMuerte(e.target.value)}
                                style={{ fontSize: '1.2rem' }}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <label>Fecha de Fallecimiento</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    value={fechaMuerte}
                                    onChange={e => setFechaMuerte(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button
                                onClick={() => { setShowMuerteModal(false); setMsjErrorMuerte(''); }}
                                style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReportarMuerte}
                                style={{ backgroundColor: 'var(--error)' }}
                                disabled={loading || !chapetaMuerte}
                            >
                                {loading ? 'Procesando...' : 'Confirmar Fallecimiento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedAnimal && (() => {
                const isCebaModal = selectedAnimal.etapa === 'ceba';
                const pesoBaseModal = isCebaModal ? (selectedAnimal.peso_ingreso_ceba || selectedAnimal.peso_compra || selectedAnimal.peso_ingreso || 0) : (selectedAnimal.peso_compra ?? selectedAnimal.peso_ingreso ?? 0);
                const fechaInicioModal = isCebaModal ? (selectedAnimal.fecha_ingreso_ceba || selectedAnimal.fecha_ingreso) : selectedAnimal.fecha_ingreso;
                
                const ultimoP = selectedAnimal.registros_pesaje?.[0];
                const fechaU = ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : format(new Date(fechaInicioModal), 'dd/MM/yyyy');
                const pesoU = ultimoP ? ultimoP.peso : pesoBaseModal;

                const refDate = ultimoP ? new Date(ultimoP.fecha) : new Date(fechaInicioModal);
                const diasHoy = differenceInDays(new Date(), refDate) || 0;
                
                // USAR GMP INDIVIDUAL PARA COHERENCIA
                let gmpIndiv = 0;
                if (ultimoP && ultimoP.gmp_calculada !== null && ultimoP.gmp_calculada !== undefined) {
                    gmpIndiv = Number(ultimoP.gmp_calculada);
                } else if (ultimoP) {
                    const gainTotal = ultimoP.peso - pesoBaseModal;
                    const daysTotal = differenceInDays(new Date(ultimoP.fecha), new Date(fechaInicioModal)) || 1;
                    gmpIndiv = (gainTotal / daysTotal) * 30;
                }
                if (gmpIndiv === 0) gmpIndiv = 10.3;

                const estimadoHoy = pesoU + (diasHoy * (gmpIndiv / 30));

                const timeline = [
                    ...(selectedAnimal.registros_pesaje || []).map((p, i, arr) => {
                        const ant = arr[i + 1] || { peso: pesoBaseModal, fecha: fechaInicioModal };
                        const d = differenceInDays(new Date(p.fecha), new Date(ant.fecha)) || 1;
                        const ganancia = p.peso - ant.peso;
                        const gmp = (ganancia / d) * 30;
                        let gdp = (p.gdp_calculada !== null && p.gdp_calculada !== undefined) ? Number(p.gdp_calculada) : (ganancia / d);
                        if (gdp === 0 && ganancia !== 0) {
                            gdp = ganancia / d;
                        }
                        return {
                            id: p.fecha,
                            fecha: p.fecha,
                            peso: p.peso,
                            gmp: gmp,
                            gdp: gdp,
                            esIngreso: false
                        };
                    }),
                    {
                        id: selectedAnimal.fecha_ingreso,
                        fecha: selectedAnimal.fecha_ingreso,
                        peso: pesoBaseModal,
                        gmp: 0,
                        gdp: 0,
                        esIngreso: true
                    }
                ];

                const chartData = [...timeline].reverse().map(item => ({
                    fechaStr: format(new Date(item.fecha), 'dd/MMM', { locale: es }),
                    peso: item.peso
                }));

                return (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setSelectedAnimal(null)}>
                        <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} onClick={e => e.stopPropagation()}>
                            <button 
                                onClick={() => setSelectedAnimal(null)}
                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }}
                            >
                                <X size={24} />
                            </button>

                            <div style={{ paddingRight: '40px', marginBottom: '24px' }}>
                                <h2 style={{ color: 'white', margin: 0, fontSize: '1.8rem' }}>
                                    <span style={{ color: 'var(--primary)', marginRight: '8px' }}>#</span>
                                    {selectedAnimal.numero_chapeta}
                                </h2>
                                 <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
                                    {selectedAnimal.etapa} • {selectedAnimal.nombre_propietario}
                                </p>
                            </div>

                            <div style={{ 
                                backgroundColor: 'rgba(255,255,255,0.03)', 
                                padding: '16px', 
                                borderRadius: '12px', 
                                border: '1px solid rgba(255,255,255,0.08)',
                                marginBottom: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Potrerada Actual</div>
                                    <div style={{ fontWeight: '600', color: selectedAnimal.id_potrerada ? 'var(--primary-light)' : 'var(--text-muted)' }}>
                                        {selectedAnimal.potreradaNombre}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Último Pesaje</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{pesoU} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', marginTop: '4px' }}>{ultimoP ? 'Pesaje: ' : 'Llegada: '} {fechaU}</div>
                                </div>
                                {selectedAnimal.peso_compra && (
                                    <div style={{ backgroundColor: 'rgba(255, 193, 7, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255, 193, 7, 0.2)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso de Compra (Origen)</div>
                                        <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#ffc107' }}>{Math.round(selectedAnimal.peso_compra)} kg</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Llegada: {selectedAnimal.peso_ingreso} kg</div>
                                    </div>
                                )}
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso Estimado (Hoy)</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                        {estimadoHoy.toFixed(1)} kg
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>

                                    </div>
                                </div>
                            </div>

                            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Evolución de Peso</h3>
                            <div style={{ height: '240px', width: '100%', marginBottom: '32px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                        <XAxis dataKey="fechaStr" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                                            itemStyle={{ color: 'var(--primary-light)' }}
                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                        />
                                        <Line type="monotone" dataKey="peso" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary-light)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: 'var(--primary)', stroke: 'white', strokeWidth: 2 }} name="Peso (kg)" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Historial de Registros</h3>
                            <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                        <tr>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fecha</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Peso (kg)</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ganancia Mensual</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timeline.map((item, index) => (
                                            <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ fontWeight: '500' }}>{format(new Date(item.fecha), 'dd/MM/yyyy')}</div>
                                                    {item.esIngreso && <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 'bold' }}>INGRESO</div>}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                                                    {item.peso}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {item.esIngreso ? (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                                                    ) : (
                                                        <>
                                                            <div style={{ 
                                                                color: item.gmp < 0 ? 'var(--error)' : (item.gmp <= umbralMedioGmp ? 'var(--warning)' : (item.gmp <= umbralAltoGmp ? 'var(--text-light)' : 'var(--success)')), 
                                                                fontWeight: 'bold',
                                                                textShadow: (item.gmp > umbralMedioGmp && item.gmp <= umbralAltoGmp) ? '0 0 2px rgba(255,255,255,0.2)' : 'none'
                                                            }}>
                                                                {item.gmp > 0 ? '+' : ''}{toDisplayValue(item.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} {getUnidadLabel(modoGanancia)}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>GDP: {item.gdp > 0 ? '+' : ''}{item.gdp.toFixed(3)} kg/día</div>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showCrearModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setShowCrearModal(false)}>
                    <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--primary)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ color: 'white', margin: 0 }}>Crear Nuevo Animal</h2>
                            <button onClick={() => setShowCrearModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}><X /></button>
                        </div>

                        {msjErrorCrear && (
                            <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.1)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
                                {msjErrorCrear}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label>Número de Chapeta*</label>
                                <input type="text" value={nuevoAnimal.numero_chapeta} onChange={e => setNuevoAnimal({...nuevoAnimal, numero_chapeta: e.target.value})} placeholder="Ej: 1234" />
                                {validatingChapeta && <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>Validando...</span>}
                                {isChapetaTaken && <span style={{fontSize: '0.75rem', color: 'var(--danger)', display: 'block', marginTop: '4px'}}>Esta chapeta ya está en uso por un animal activo.</span>}
                            </div>
                            <div>
                                <label>Propietario*</label>
                                <select 
                                    value={nuevoAnimal.nombre_propietario} 
                                    onChange={e => setNuevoAnimal({...nuevoAnimal, nombre_propietario: e.target.value})}
                                >
                                    <option value="">Seleccionar propietario...</option>
                                    {propietariosLista.map(p => (
                                        <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label>Especie*</label>
                                <select value={nuevoAnimal.especie} onChange={e => setNuevoAnimal({...nuevoAnimal, especie: e.target.value})}>
                                    <option value="bovino">Bovino</option>
                                    <option value="bufalino">Bufalino</option>
                                </select>
                            </div>
                            <div>
                                <label>Sexo*</label>
                                <select value={nuevoAnimal.sexo} onChange={e => setNuevoAnimal({...nuevoAnimal, sexo: e.target.value})}>
                                    <option value="M">Macho</option>
                                    <option value="H">Hembra</option>
                                </select>
                            </div>
                            {nuevoAnimal.sexo === 'M' && (
                                <div>
                                    <label>Tipo Macho*</label>
                                    <select value={nuevoAnimal.tipo_macho} onChange={e => setNuevoAnimal({...nuevoAnimal, tipo_macho: e.target.value})}>
                                        <option value="Toro">Toro</option>
                                        <option value="Novillo">Novillo</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <label>Etapa*</label>
                                <select value={nuevoAnimal.etapa} onChange={e => setNuevoAnimal({...nuevoAnimal, etapa: e.target.value})}>
                                    <option value="cria">Cría</option>
                                    <option value="levante">Levante</option>
                                    <option value="ceba">Ceba</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label>Peso Ingreso (kg)*</label>
                                <input type="number" value={nuevoAnimal.peso_ingreso} onChange={e => setNuevoAnimal({...nuevoAnimal, peso_ingreso: e.target.value})} placeholder="0" />
                            </div>
                            <div>
                                <label>Fecha Ingreso*</label>
                                <input type="date" value={nuevoAnimal.fecha_ingreso} onChange={e => setNuevoAnimal({...nuevoAnimal, fecha_ingreso: e.target.value})} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <label>Asignar a Lote (Opcional)</label>
                            <select value={nuevoAnimal.id_potrerada} onChange={e => setNuevoAnimal({...nuevoAnimal, id_potrerada: e.target.value})}>
                                <option value="">-- Sin Lote --</option>
                                {potreradasDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px', marginBottom: '20px' }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary-light)' }}>Historial de Pesajes</h3>
                                <button 
                                    onClick={() => setNuevosPesajes([...nuevosPesajes, { fecha: new Date().toISOString().split('T')[0], peso: '', etapa: nuevoAnimal.etapa }])}
                                    style={{ width: 'auto', padding: '4px 12px', fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)' }}
                                >
                                    + Agregar Pesaje
                                </button>
                            </div>
                                 {nuevosPesajes.map((p, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '12px', marginBottom: '8px', alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1.5 }}>
                                        <label style={{ fontSize: '0.7rem' }}>Fecha</label>
                                        <input type="date" value={p.fecha} onChange={e => {
                                            const up = [...nuevosPesajes];
                                            up[idx].fecha = e.target.value;
                                            setNuevosPesajes(up);
                                        }} style={{ marginBottom: 0 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.7rem' }}>Peso (kg)</label>
                                        <input type="number" value={p.peso} onChange={e => {
                                            const up = [...nuevosPesajes];
                                            up[idx].peso = e.target.value;
                                            setNuevosPesajes(up);
                                        }} style={{ marginBottom: 0 }} placeholder="0" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.7rem' }}>Etapa</label>
                                        <select value={p.etapa} onChange={e => {
                                            const up = [...nuevosPesajes];
                                            up[idx].etapa = e.target.value;
                                            setNuevosPesajes(up);
                                        }} style={{ marginBottom: 0, padding: '8px' }}>
                                            <option value="cria">Cría</option>
                                            <option value="levante">Levante</option>
                                            <option value="ceba">Ceba</option>
                                        </select>
                                    </div>
                                    <button 
                                        onClick={() => setNuevosPesajes(nuevosPesajes.filter((_, i) => i !== idx))}
                                        style={{ backgroundColor: 'transparent', color: 'var(--error)', width: 'auto', padding: '8px', marginBottom: '2px' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                            {nuevosPesajes.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>No se han agregado pesajes adicionales.</p>}
                        </div>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button onClick={() => setShowCrearModal(false)} style={{ backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}>
                                CANCELAR
                            </button>
                            <button 
                                onClick={handleCrearAnimal} 
                                disabled={loading || !nuevoAnimal.numero_chapeta || !nuevoAnimal.peso_ingreso || !nuevoAnimal.nombre_propietario || !nuevoAnimal.especie || !nuevoAnimal.sexo || !nuevoAnimal.etapa || !nuevoAnimal.fecha_ingreso || isChapetaTaken}
                            >
                                {loading ? 'GUARDANDO...' : 'GUARDAR ANIMAL'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para ingresar capital invertido antes de generar el informe */}
            {showCapitalModal && filterPropietario && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '20px' }} onClick={() => setShowCapitalModal(false)}>
                    <div className="card" style={{ maxWidth: '480px', width: '100%', border: '1px solid rgba(76,175,80,0.3)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>💰</div>
                            <h2 style={{ color: 'white', margin: '0 0 8px 0' }}>Capital Invertido</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                Ingresa el valor total que tiene <strong style={{ color: 'var(--primary-light)' }}>{filterPropietario}</strong> invertido en la finca (valor de compra total de sus animales).
                            </p>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Capital Invertido (COP $)</label>
                            <input
                                type="number"
                                placeholder="Ej: 50000000"
                                value={capitalInvertido}
                                onChange={e => setCapitalInvertido(e.target.value)}
                                style={{ fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'right' }}
                                autoFocus
                            />
                            {capitalInvertido && parseFloat(capitalInvertido) > 0 && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--primary-light)', marginTop: '6px', textAlign: 'right' }}>
                                    {parseFloat(capitalInvertido).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                                </div>
                            )}
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '24px' }}>
                            Este dato solo se usa para calcular la rentabilidad del informe y no se guarda en la base de datos.
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => setShowCapitalModal(false)}
                                style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)', flex: 1 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setShowCapitalModal(false);
                                    setShowPropietarioDashboard(true);
                                }}
                                style={{ backgroundColor: 'var(--primary)', flex: 2 }}
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
