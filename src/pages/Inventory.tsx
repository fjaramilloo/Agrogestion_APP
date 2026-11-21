import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useConnection } from '../contexts/ConnectionContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { Search, Skull, Calendar, AlertCircle, ArrowUpDown, X, Plus, Trash2, BarChart2, AlertOctagon, Pencil, Check, MapPin } from 'lucide-react';
import PropietarioDashboardModal from '../components/PropietarioDashboardModal';
import ModalUpsell from '../components/ModalUpsell';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import {
    toDisplayValue,
    getUnidadLabel,
    getModoLabel,
    calcularGmpUltimoPeriodo,
    calcularGmpAcumulado,
    esPesajePosteriorAIngreso,
    calcularPesoEstimadoHoy
} from '../utils/ganancia';
import { recalcularHistorialPesajesAnimal } from '../utils/gananciaRecalculator';
import { localDB } from '../lib/db';
import { getLocalIsoDate } from '../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../utils/decimalInput';
import './Inventory.css';

interface Pesaje {
    id?: string;
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
    const { fincaId, role, userFincas, isSuperAdmin, modoGanancia, licenciaInfo, refreshLicencia } = useAuth();
    const { confirmAction, showAlert, toast } = useFeedback();
    const isAdmin = role === 'administrador' || isSuperAdmin;
    const isVencida = Boolean(licenciaInfo?.isVencida);
    const isSobrecupo = Boolean(licenciaInfo && (licenciaInfo.isSobrecupo || licenciaInfo.totalAnimalesOrganizacion > licenciaInfo.limiteAnimales));
    const isBloqueado = isVencida || isSobrecupo;
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
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

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
    const [fechaMuerte, setFechaMuerte] = useState(getLocalIsoDate());
    const [msjErrorMuerte, setMsjErrorMuerte] = useState('');

    // Modal Historial Animal
    const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
    const [potreradasDisponibles, setPotreradasDisponibles] = useState<{ id: string; nombre: string; etapa?: string }[]>([]);
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
        fecha_ingreso: getLocalIsoDate(),
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
                .or('is_deleted.is.null,is_deleted.eq.false')
                .maybeSingle();
            
            setIsChapetaTaken(!!data);
            setValidatingChapeta(false);
        };
        
        const timeoutId = setTimeout(checkChapeta, 500);
        return () => clearTimeout(timeoutId);
    }, [nuevoAnimal.numero_chapeta, fincaId]);

    // Estados y funciones para Edición de Chapeta (Exclusivo Admin)
    const [isEditingChapeta, setIsEditingChapeta] = useState(false);
    const [editChapetaVal, setEditChapetaVal] = useState('');
    const [editChapetaError, setEditChapetaError] = useState('');
    const [validatingEditChapeta, setValidatingEditChapeta] = useState(false);
    const [isEditChapetaTaken, setIsEditChapetaTaken] = useState(false);

    const checkEditChapetaUnica = async (val: string) => {
        const target = val.trim();
        if (!target || !fincaId || target === selectedAnimal?.numero_chapeta) {
            setIsEditChapetaTaken(false);
            setEditChapetaError('');
            return;
        }
        setValidatingEditChapeta(true);
        try {
            const { data } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', target)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .neq('id', selectedAnimal?.id)
                .maybeSingle();

            if (data) {
                setIsEditChapetaTaken(true);
                setEditChapetaError(`La chapeta #${target} ya está en uso por otro animal en la finca.`);
            } else {
                setIsEditChapetaTaken(false);
                setEditChapetaError('');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setValidatingEditChapeta(false);
        }
    };

    const handleGuardarNuevaChapeta = async () => {
        if (!selectedAnimal || !fincaId) return;
        const nueva = editChapetaVal.trim();
        if (!nueva) {
            setEditChapetaError('El número de chapeta no puede estar vacío.');
            return;
        }
        if (nueva === selectedAnimal.numero_chapeta) {
            setIsEditingChapeta(false);
            return;
        }
        setLoading(true);
        try {
            const { data: existente } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', nueva)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .neq('id', selectedAnimal.id)
                .maybeSingle();

            if (existente) {
                setEditChapetaError(`¡Error! Ya existe otro animal con la chapeta #${nueva}.`);
                setLoading(false);
                return;
            }

            const { error: errUpd } = await supabase
                .from('animales')
                .update({ numero_chapeta: nueva })
                .eq('id', selectedAnimal.id);

            if (errUpd) throw errUpd;

            const userResp = await supabase.auth.getUser();
            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'animales',
                id_registro: selectedAnimal.id,
                accion: 'update_chapeta',
                valores_previos: { numero_chapeta: selectedAnimal.numero_chapeta },
                valores_nuevos: { numero_chapeta: nueva },
                usuario_id: userResp.data.user?.id
            });

            setSelectedAnimal(prev => prev ? { ...prev, numero_chapeta: nueva } : null);
            setAnimales(prev => prev.map(a => a.id === selectedAnimal.id ? { ...a, numero_chapeta: nueva } : a));

            try {
                if (localDB?.animalesCache) {
                    await localDB.animalesCache.update(selectedAnimal.id, { numero_chapeta: nueva });
                }
            } catch (eCache) {}

            setIsEditingChapeta(false);
            setEditChapetaError('');
        } catch (err: any) {
            setEditChapetaError('Error al guardar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEliminarAnimalPorError = async () => {
        if (!selectedAnimal || !fincaId) return;
        const confirmed = await confirmAction(
            `¿Está seguro de eliminar permanentemente el animal #${selectedAnimal.numero_chapeta} del inventario?\n\n⚠️ Esta acción es para corregir errores de digitación. Si el animal murió o se vendió, use las opciones correspondientes.`,
            { title: 'Eliminar animal', confirmLabel: 'Sí, eliminar', destructive: true }
        );
        if (!confirmed) return;

        setLoading(true);
        try {
            const userResp = await supabase.auth.getUser();
            const userId = userResp.data.user?.id;

            const { error: errAnim } = await supabase
                .from('animales')
                .update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString(),
                    deleted_by: userId
                })
                .eq('id', selectedAnimal.id);

            if (errAnim) throw errAnim;

            await supabase
                .from('registros_pesaje')
                .update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString(),
                    deleted_by: userId
                })
                .eq('id_animal', selectedAnimal.id);

            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'animales',
                id_registro: selectedAnimal.id,
                accion: 'delete_animal_error',
                valores_previos: { numero_chapeta: selectedAnimal.numero_chapeta },
                usuario_id: userId
            });

            try {
                if (localDB?.animalesCache) {
                    await localDB.animalesCache.delete(selectedAnimal.id);
                }
            } catch (eCache) {}

            setAnimales(prev => prev.filter(a => a.id !== selectedAnimal.id));
            setSelectedAnimal(null);
            await refreshLicencia();
            toast('Animal eliminado del inventario.', 'success');
        } catch (err: any) {
            await showAlert('Error al eliminar animal: ' + (err.message || err), { title: 'Error', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Estados y funciones para Edición de Pesajes del Animal
    const [editingPesaje, setEditingPesaje] = useState<{ id: string; fecha: string; peso: string } | null>(null);

    const recargarHistorialAnimal = async (animalId: string) => {
        const { data: historial } = await supabase
            .from('registros_pesaje')
            .select('id, peso, fecha, gdp_calculada, gmp_calculada, potreros(nombre)')
            .eq('id_animal', animalId)
            .or('is_deleted.is.null,is_deleted.eq.false')
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
                    id: p.id,
                    peso: p.peso,
                    fecha: p.fecha,
                    gdp_calculada: p.gdp_calculada,
                    gmp_calculada: p.gmp_calculada,
                    potreros: Array.isArray(p.potreros) ? (p.potreros[0] || null) : p.potreros
                }));

            setSelectedAnimal(prev => prev ? { ...prev, registros_pesaje: dedup } : null);
            setAnimales(prev => prev.map(a => a.id === animalId ? { ...a, registros_pesaje: dedup } : a));
        }
    };

    const handleGuardarEdicionPesaje = async () => {
        if (!editingPesaje || !selectedAnimal) return;
        const pesoNum = parseDecimalInput(editingPesaje.peso);
        if (isNaN(pesoNum) || pesoNum <= 0) {
            await showAlert('Por favor ingrese un peso numérico válido mayor a cero.', { title: 'Dato inválido', variant: 'warning' });
            return;
        }
        if (!editingPesaje.fecha) {
            await showAlert('Por favor ingrese una fecha válida.', { title: 'Dato inválido', variant: 'warning' });
            return;
        }

        setLoading(true);
        try {
            const userResp = await supabase.auth.getUser();

            const { error: errUpd } = await supabase
                .from('registros_pesaje')
                .update({
                    peso: pesoNum,
                    fecha: editingPesaje.fecha,
                    modificado_by: userResp.data.user?.id,
                    fecha_modificacion: new Date().toISOString()
                })
                .eq('id', editingPesaje.id);

            if (errUpd) throw errUpd;

            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'registros_pesaje',
                id_registro: editingPesaje.id,
                accion: 'update_pesaje',
                valores_nuevos: { peso: pesoNum, fecha: editingPesaje.fecha },
                usuario_id: userResp.data.user?.id
            });

            // Recalcular en cascada el siguiente pesaje y todos los posteriores
            await recalcularHistorialPesajesAnimal(selectedAnimal.id, supabase);

            // Recargar historial del animal
            await recargarHistorialAnimal(selectedAnimal.id);
            setEditingPesaje(null);
        } catch (err: any) {
            await showAlert('Error al guardar pesaje: ' + (err.message || err), { title: 'Error', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleEliminarPesaje = async (pesajeId: string, fechaPesaje: string) => {
        if (!selectedAnimal) return;
        const confirmed = await confirmAction(
            `¿Está seguro de eliminar el pesaje del ${fechaPesaje}? Las ganancias del siguiente pesaje y todos los posteriores se recalcularán automáticamente.`,
            { title: 'Eliminar pesaje', confirmLabel: 'Sí, eliminar', destructive: true }
        );
        if (!confirmed) return;

        setLoading(true);
        try {
            const userResp = await supabase.auth.getUser();

            const { error: errDel } = await supabase
                .from('registros_pesaje')
                .update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString(),
                    deleted_by: userResp.data.user?.id
                })
                .eq('id', pesajeId);

            if (errDel) throw errDel;

            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'registros_pesaje',
                id_registro: pesajeId,
                accion: 'delete_pesaje',
                usuario_id: userResp.data.user?.id
            });

            // Recalcular en cascada
            await recalcularHistorialPesajesAnimal(selectedAnimal.id, supabase);

            // Recargar historial
            await recargarHistorialAnimal(selectedAnimal.id);
        } catch (err: any) {
            await showAlert('Error al eliminar pesaje: ' + (err.message || err), { title: 'Error', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

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
                // Si ya tenemos animales cargados localmente, apagamos la carga inicial de una vez
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
                    .or('is_deleted.is.null,is_deleted.eq.false')
                    .order('creado_en', { ascending: false })
                    .limit(50000),
                supabase.rpc('get_ultimos_pesajes_finca', { p_finca_id: fincaId }).limit(50000),
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

            if (potsRes.data && potsRes.data.length > 0) setPotreradasDisponibles(potsRes.data);
            if (propRes.data && propRes.data.length > 0) setPropietariosLista(propRes.data);

            // Actualizar la caché local directamente con los datos ya descargados (0 peticiones extra a la red)
            if (!animalesRes.error && animalesRes.data && animalesRes.data.length > 0) {
                const ahoraIso = new Date().toISOString();
                const itemsCache = animalesRes.data.map((a: any) => {
                    const ult = ultimosPesajesMap.get(a.id);
                    return {
                        id: a.id,
                        id_finca: fincaId,
                        numero_chapeta: a.numero_chapeta,
                        nombre_propietario: a.nombre_propietario,
                        etapa: a.etapa,
                        estado: 'activo',
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
                        registros_pesaje: ult ? [ult] : [],
                        updated_at: ahoraIso
                    };
                });
                void localDB.animalesCache.bulkPut(itemsCache).catch(() => {});
            }
        } catch (err) {
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
            toast(`Se ha registrado el fallecimiento del animal #${chapetaMuerte}`, 'success');
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
            const pesoIngresoNum = parseDecimalInput(nuevoAnimal.peso_ingreso);
            if (isNaN(pesoIngresoNum) || pesoIngresoNum <= 0) {
                throw new Error('Por favor ingrese un peso de ingreso numérico válido mayor a cero.');
            }

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
                    peso_ingreso: pesoIngresoNum,
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
                    .filter(p => p.fecha && p.peso && !isNaN(parseDecimalInput(p.peso)))
                    .map(p => ({
                        id_animal: animalInsertado.id,
                        fecha: p.fecha,
                        peso: parseDecimalInput(p.peso),
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
                fecha_ingreso: getLocalIsoDate(),
                id_potrerada: '',
                tipo_macho: 'Toro'
            });
            setNuevosPesajes([]);
            fetchAnimales();
            toast('Animal creado exitosamente con su historial.', 'success');

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
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                            {isVencida ? (
                                <>
                                    <strong>Modo Solo Lectura (Licencia Vencida):</strong> Tu suscripción al Plan <strong style={{ textTransform: 'uppercase' }}>{licenciaInfo?.licencia}</strong> ha expirado. Toda tu información histórica está visible e intacta. Para habilitar nuevos pesajes y operaciones, renueva tu suscripción.
                                </>
                            ) : (
                                <>
                                    <strong>Modo Solo Lectura (Sobrecupo):</strong> Tu organización tiene <strong style={{ color: 'var(--error)' }}>{licenciaInfo?.totalAnimalesOrganizacion} animales</strong> en su hato (capacidad de tu plan: <strong>{licenciaInfo?.limiteAnimales}</strong>). Toda tu información histórica está visible e intacta. Para habilitar nuevos pesajes y compras, actualiza al Plan Finca.
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
                                const fechaU = tienePesajePosterior && ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : 'Sin pesajes';
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
                                        onClick={async () => {
                                            setSelectedAnimal(animal);
                                            setIsEditingChapeta(false);
                                            setEditingPesaje(null);
                                            const { data: historial } = await supabase
                                                .from('registros_pesaje')
                                                .select('id, peso, fecha, gdp_calculada, gmp_calculada, potreros(nombre)')
                                                .eq('id_animal', animal.id)
                                                .or('is_deleted.is.null,is_deleted.eq.false')
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
                                                        id: p.id,
                                                        peso: p.peso,
                                                        fecha: p.fecha,
                                                        gdp_calculada: p.gdp_calculada,
                                                        gmp_calculada: p.gmp_calculada,
                                                        potreros: Array.isArray(p.potreros) ? (p.potreros[0] || null) : p.potreros
                                                    }));
                                                setSelectedAnimal(prev => prev ? { ...prev, registros_pesaje: dedup } : null);
                                            }
                                        }}
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
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tienePesajePosterior ? fechaU : 'Ingreso: ' + format(new Date(animal.fecha_ingreso), 'dd/MM/yyyy')}</div>
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
                <div className="modal-overlay" onClick={() => setShowMuerteModal(false)}>
                    <div className="card inventory-modal-card" style={{ maxWidth: '450px', border: '1px solid var(--error)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <Skull size={48} color="var(--error)" aria-hidden="true" style={{ marginBottom: '12px' }} />
                            <h2 style={{ color: 'var(--text-main)', margin: '0 0 8px 0' }}>Reportar Fallecimiento</h2>
                            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Esta acción inactivará al animal permanentemente.</p>
                        </div>

                        {msjErrorMuerte && (
                            <div role="alert" style={{ backgroundColor: 'var(--error-soft-bg)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <AlertCircle size={16} aria-hidden="true" /> {msjErrorMuerte}
                            </div>
                        )}

                        <div style={{ marginBottom: '18px' }}>
                            <label htmlFor="inventory-muerte-chapeta">Número de Chapeta</label>
                            <input
                                id="inventory-muerte-chapeta"
                                type="text"
                                placeholder="Ej: 1234"
                                value={chapetaMuerte}
                                onChange={e => setChapetaMuerte(e.target.value)}
                                autoCorrect="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                style={{ fontSize: '1.2rem', marginBottom: 0 }}
                            />
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <label htmlFor="inventory-muerte-fecha">Fecha de Fallecimiento</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input
                                    id="inventory-muerte-fecha"
                                    type="date"
                                    value={fechaMuerte}
                                    onChange={e => setFechaMuerte(e.target.value)}
                                    style={{ paddingLeft: '40px', marginBottom: 0 }}
                                />
                            </div>
                        </div>

                        <div className="inventory-modal-actions-row" style={{ display: 'flex', gap: '12px' }}>
                            <button
                                type="button"
                                className="inventory-btn-ghost"
                                onClick={() => { setShowMuerteModal(false); setMsjErrorMuerte(''); }}
                                style={{ flex: 1 }}
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="inventory-header-btn--danger"
                                onClick={handleReportarMuerte}
                                style={{ flex: 2 }}
                                disabled={loading || !chapetaMuerte}
                            >
                                {loading ? 'Procesando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedAnimal && (() => {
                const pesoBaseModal = selectedAnimal.peso_ingreso ?? selectedAnimal.peso_compra ?? 0;
                const fechaInicioModal = selectedAnimal.fecha_ingreso;
                
                const pesajesPosteriores = (selectedAnimal.registros_pesaje || []).filter(p =>
                    esPesajePosteriorAIngreso(p.fecha, fechaInicioModal)
                );
                const ultimoP = pesajesPosteriores[0];
                const penultimoP = pesajesPosteriores[1];
                const fechaU = ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : format(new Date(fechaInicioModal), 'dd/MM/yyyy');
                const pesoU = ultimoP ? ultimoP.peso : pesoBaseModal;

                const gmpUltimoModal = calcularGmpUltimoPeriodo(ultimoP, fechaInicioModal, pesoBaseModal, penultimoP);
                const gmpHistoricoModal = calcularGmpAcumulado(ultimoP?.peso, pesoBaseModal, fechaInicioModal, ultimoP?.fecha);

                const estModal = calcularPesoEstimadoHoy(selectedAnimal);
                const diasHoy = estModal.diasSinPesar;
                const estimadoHoy = estModal.pesoEstimado;
                const confianzaHoy = estModal.confianza;

                interface TimelineItem {
                    id: string;
                    pesajeId?: string;
                    fecha: string;
                    peso: number;
                    gmp: number;
                    gdp: number;
                    esIngreso: boolean;
                }

                const timeline: TimelineItem[] = [
                    ...pesajesPosteriores.map((p, i, arr) => {
                        const ant = arr[i + 1] || { peso: pesoBaseModal, fecha: fechaInicioModal };
                        const d = Math.max(1, differenceInDays(new Date(p.fecha.split('T')[0] + 'T12:00:00'), new Date(ant.fecha.split('T')[0] + 'T12:00:00')));
                        const ganancia = p.peso - ant.peso;
                        const gdp = (p.gdp_calculada !== null && p.gdp_calculada !== undefined && p.gdp_calculada !== 0) ? Number(p.gdp_calculada) : (ganancia / d);
                        const gmp = (p.gmp_calculada !== null && p.gmp_calculada !== undefined && p.gmp_calculada !== 0) ? Number(p.gmp_calculada) : (gdp * 30);
                        return {
                            id: p.id || p.fecha,
                            pesajeId: p.id,
                            fecha: p.fecha,
                            peso: p.peso,
                            gmp: gmp,
                            gdp: gdp,
                            esIngreso: false
                        };
                    }),
                    {
                        id: selectedAnimal.fecha_ingreso,
                        pesajeId: undefined,
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
                    <div className="modal-overlay" onClick={() => setSelectedAnimal(null)}>
                        <div className="card inventory-modal-card" style={{ maxWidth: '640px', backgroundColor: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-popover)' }} onClick={e => e.stopPropagation()}>

                            {/* Modal Header: Title, badges, subtle actions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    {!isEditingChapeta ? (
                                        <h2 style={{
                                            color: 'var(--text-main)',
                                            margin: 0,
                                            fontSize: isMobile ? '1.5rem' : '1.75rem',
                                            fontWeight: 700,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            whiteSpace: 'nowrap',
                                            letterSpacing: '-0.5px'
                                        }}>
                                            <span style={{ color: 'var(--primary)', marginRight: '4px', fontWeight: 800 }}>#</span>
                                            <span style={{ whiteSpace: 'nowrap' }}>{selectedAnimal.numero_chapeta}</span>
                                        </h2>
                                    ) : (
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.4rem' }}>#</span>
                                                <input
                                                    type="text"
                                                    aria-label="Nueva chapeta"
                                                    value={editChapetaVal}
                                                    onChange={e => {
                                                        setEditChapetaVal(e.target.value);
                                                        checkEditChapetaUnica(e.target.value);
                                                    }}
                                                    placeholder="Nueva chapeta"
                                                    autoCorrect="off"
                                                    autoCapitalize="characters"
                                                    spellCheck={false}
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderRadius: '6px',
                                                        border: isEditChapetaTaken ? '1px solid var(--error)' : '1px solid var(--primary)',
                                                        backgroundColor: 'var(--bg-input)',
                                                        color: 'var(--text-main)',
                                                        fontSize: '1.1rem',
                                                        fontWeight: 'bold',
                                                        width: '140px',
                                                        marginBottom: 0
                                                    }}
                                                    autoFocus={!isMobile}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleGuardarNuevaChapeta}
                                                    disabled={loading || validatingEditChapeta || isEditChapetaTaken || !editChapetaVal.trim()}
                                                    style={{
                                                        width: 'auto',
                                                        padding: '8px 12px',
                                                        borderRadius: '6px',
                                                        backgroundColor: 'var(--primary)',
                                                        color: 'var(--on-primary)',
                                                        border: 'none',
                                                        cursor: (loading || validatingEditChapeta || isEditChapetaTaken || !editChapetaVal.trim()) ? 'not-allowed' : 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.82rem',
                                                        fontWeight: 600,
                                                        minHeight: isMobile ? '44px' : undefined
                                                    }}
                                                >
                                                    <Check size={14} aria-hidden="true" />
                                                    <span>Guardar</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inventory-btn-ghost"
                                                    onClick={() => { setIsEditingChapeta(false); setEditChapetaError(''); }}
                                                    style={{
                                                        padding: '8px 10px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.82rem',
                                                        minHeight: isMobile ? '44px' : undefined
                                                    }}
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                            {validatingEditChapeta && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    Validando si la chapeta ya existe...
                                                </div>
                                            )}
                                            {editChapetaError && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '4px', fontWeight: 500 }}>
                                                    {editChapetaError}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Metadata Badges / Info */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        <span style={{
                                            backgroundColor: 'var(--success-soft-bg)',
                                            color: 'var(--success)',
                                            border: '1px solid var(--success-soft-border)',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            {selectedAnimal.etapa}
                                        </span>

                                        <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>•</span>

                                        <span style={{ color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: 500 }}>
                                            {selectedAnimal.nombre_propietario}
                                        </span>

                                        {selectedAnimal.especie && (
                                            <>
                                                <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>•</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                                                    {selectedAnimal.especie} {selectedAnimal.sexo ? `(${selectedAnimal.sexo})` : ''}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Right action buttons: Subtle Edit + Subtle Trash + Close */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                    {isAdmin && !isEditingChapeta && (
                                        <button
                                            type="button"
                                            className="inventory-icon-btn inventory-icon-btn--edit"
                                            onClick={() => {
                                                setIsEditingChapeta(true);
                                                setEditChapetaVal(selectedAnimal.numero_chapeta);
                                                setEditChapetaError('');
                                                setIsEditChapetaTaken(false);
                                            }}
                                            title="Editar número de chapeta"
                                            aria-label="Editar número de chapeta"
                                        >
                                            <Pencil size={16} aria-hidden="true" />
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button
                                            type="button"
                                            className="inventory-icon-btn inventory-icon-btn--delete"
                                            onClick={handleEliminarAnimalPorError}
                                            title="Eliminar animal (por error de digitación)"
                                            aria-label="Eliminar animal"
                                        >
                                            <Trash2 size={16} aria-hidden="true" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="inventory-icon-btn inventory-icon-btn--close"
                                        onClick={() => setSelectedAnimal(null)}
                                        title="Cerrar"
                                        aria-label="Cerrar detalle del animal"
                                    >
                                        <X size={16} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            {/* Location / Potrerada Bar */}
                            <div style={{
                                backgroundColor: 'var(--surface-subtle)',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-subtle)',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Potrerada Actual:</span>
                                    <span style={{ fontWeight: '600', color: selectedAnimal.id_potrerada ? 'var(--primary-light)' : 'var(--text-muted)', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                        <MapPin size={13} style={{ opacity: 0.8 }} aria-hidden="true" />
                                        {selectedAnimal.potreradaNombre || 'Sin potrerada'}
                                    </span>
                                </div>
                                {selectedAnimal.potreroNombre && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Potrero: <strong style={{ color: 'var(--text-main)' }}>{selectedAnimal.potreroNombre}</strong>
                                    </div>
                                )}
                            </div>

                            {/* Metric Cards */}
                            <div className="inventory-detail-metrics" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                gap: '12px',
                                marginBottom: '28px'
                            }}>
                                <div style={{ backgroundColor: 'var(--surface-subtle)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Último Pesaje</div>
                                    <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{pesoU} kg</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--primary-light)', marginTop: '4px' }}>{ultimoP ? 'Pesaje: ' : 'Llegada: '} {fechaU}</div>
                                </div>
                                <div style={{ backgroundColor: 'var(--surface-subtle)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Última {getModoLabel(modoGanancia)}</div>
                                    <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: gmpUltimoModal === null ? 'var(--text-muted)' : (gmpUltimoModal < 0 ? 'var(--error)' : (gmpUltimoModal <= umbralMedioGmp ? 'var(--warning)' : (gmpUltimoModal <= umbralAltoGmp ? 'var(--text-main)' : 'var(--success)'))) }}>
                                        {gmpUltimoModal !== null ? `${toDisplayValue(gmpUltimoModal, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}` : 'Sin pesajes'}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Histórica: <strong style={{ color: gmpHistoricoModal === null ? 'var(--text-muted)' : (gmpHistoricoModal < 0 ? 'var(--error)' : (gmpHistoricoModal <= umbralMedioGmp ? 'var(--warning)' : (gmpHistoricoModal <= umbralAltoGmp ? 'var(--text-main)' : 'var(--success)'))) }}>
                                            {gmpHistoricoModal !== null ? `${toDisplayValue(gmpHistoricoModal, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}` : 'N/A'}
                                        </strong>
                                    </div>
                                </div>
                                {selectedAnimal.peso_compra && (
                                    <div style={{ backgroundColor: 'var(--secondary-soft-bg)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--secondary-soft-border)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Peso de Compra</div>
                                        <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{Math.round(selectedAnimal.peso_compra)} kg</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Llegada: {selectedAnimal.peso_ingreso} kg</div>
                                    </div>
                                )}
                                <div style={{ backgroundColor: 'var(--surface-subtle)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Peso Estimado (Hoy)</div>
                                    <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: confianzaHoy === 'vencida' ? 'var(--warning)' : 'var(--primary-light)' }}>
                                        {estimadoHoy.toFixed(1)} kg
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: confianzaHoy === 'vencida' ? 'var(--warning)' : 'var(--text-muted)', marginTop: '4px' }}>
                                        {confianzaHoy === 'vencida'
                                            ? `⚠️ Congelado (${diasHoy} d sin pesar)`
                                            : (diasHoy > 0 ? `+${(estimadoHoy - pesoU).toFixed(1)} kg (${diasHoy} d)` : 'Calculado a la fecha')}
                                    </div>
                                </div>
                            </div>

                            <h3 style={{ fontSize: '1.05rem', marginBottom: '12px', fontWeight: '600', color: 'var(--text-main)' }}>Evolución de Peso</h3>
                            <div className="inventory-detail-chart" style={{ height: '240px', width: '100%', marginBottom: '28px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                        <XAxis dataKey="fechaStr" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                        <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', boxShadow: 'var(--shadow-popover)', color: 'var(--text-main)' }}
                                            itemStyle={{ color: 'var(--primary-light)' }}
                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                        />
                                        <Line type="monotone" dataKey="peso" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary-light)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: 'var(--primary)', stroke: 'var(--bg-card)', strokeWidth: 2 }} name="Peso (kg)" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <h3 style={{ fontSize: '1.05rem', marginBottom: '12px', fontWeight: '600', color: 'var(--text-main)' }}>Historial de Registros</h3>
                            <div className="inventory-history-wrap" style={{ overflowX: 'auto', backgroundColor: 'var(--surface-inset)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                <table className="inventory-history-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ backgroundColor: 'var(--surface-subtle)' }}>
                                        <tr>
                                            <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fecha</th>
                                            <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Peso (kg)</th>
                                            <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                {modoGanancia === 'GDP' ? 'Ganancia Diaria' : 'Ganancia Mensual'}
                                            </th>
                                            {isAdmin && <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timeline.map((item, index) => {
                                            const isEditingThis = Boolean(editingPesaje && item.pesajeId && editingPesaje.id === item.pesajeId);
                                            if (isEditingThis && editingPesaje) {
                                                return (
                                                    <tr key={index} className="is-editing" style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--success-soft-bg)' }}>
                                                        <td colSpan={4} style={{ padding: '14px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                                                                <div style={{ flex: '1 1 130px' }}>
                                                                    <label htmlFor={`hist-edit-date-${index}`} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Fecha Pesaje</label>
                                                                    <input
                                                                        id={`hist-edit-date-${index}`}
                                                                        type="date"
                                                                        value={editingPesaje.fecha}
                                                                        onChange={e => setEditingPesaje(prev => prev ? { ...prev, fecha: e.target.value } : null)}
                                                                        style={{ padding: '6px 10px', marginBottom: 0, borderRadius: '6px', border: '1px solid var(--primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                                                    />
                                                                </div>
                                                                <div style={{ flex: '1 1 100px' }}>
                                                                    <label htmlFor={`hist-edit-peso-${index}`} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Peso (kg)</label>
                                                                    <input
                                                                        id={`hist-edit-peso-${index}`}
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        value={editingPesaje.peso}
                                                                        onChange={e => setEditingPesaje(prev => prev ? { ...prev, peso: sanitizeDecimalInput(e.target.value) } : null)}
                                                                        style={{ width: isMobile ? '100%' : '100px', marginBottom: 0, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', flex: isMobile ? '1 1 100%' : undefined }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleGuardarEdicionPesaje}
                                                                        disabled={loading}
                                                                        style={{ padding: '7px 14px', minHeight: isMobile ? '44px' : undefined, flex: isMobile ? 1 : undefined, borderRadius: '6px', backgroundColor: 'var(--primary)', border: 'none', color: 'var(--on-primary)', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                                    >
                                                                        <Check size={14} aria-hidden="true" /> Guardar
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="inventory-btn-ghost"
                                                                        onClick={() => setEditingPesaje(null)}
                                                                        style={{ padding: '7px 12px', minHeight: isMobile ? '44px' : undefined, flex: isMobile ? 1 : undefined, borderRadius: '6px', fontSize: '0.82rem' }}
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--primary-light)', marginTop: '8px' }}>
                                                                ℹ️ Al guardar, se recalculará automáticamente la GDP del pesaje siguiente y todos los posteriores.
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            return (
                                                <tr key={index} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <td className="inventory-hist-fecha" style={{ padding: '12px 16px' }}>
                                                        <div style={{ fontWeight: '500' }}>{format(new Date(item.fecha), 'dd/MM/yyyy')}</div>
                                                        {item.esIngreso && <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 'bold' }}>INGRESO</div>}
                                                    </td>
                                                    <td className="inventory-hist-peso" style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                                                        {item.peso}
                                                    </td>
                                                    <td className="inventory-hist-gmp" style={{ padding: '12px 16px' }}>
                                                        {item.esIngreso ? (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                                                        ) : (
                                                            <div style={{
                                                                color: item.gmp < 0 ? 'var(--error)' : (item.gmp <= umbralMedioGmp ? 'var(--warning)' : (item.gmp <= umbralAltoGmp ? 'var(--text-main)' : 'var(--success)')),
                                                                fontWeight: 'bold'
                                                            }}>
                                                                {item.gmp > 0 ? '+' : ''}{toDisplayValue(item.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} {getUnidadLabel(modoGanancia)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    {isAdmin && (
                                                        <td className="inventory-hist-actions" style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                            {item.esIngreso || !item.pesajeId ? (
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>Base</span>
                                                            ) : (
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="inventory-history-action-btn"
                                                                        onClick={() => setEditingPesaje({ id: item.pesajeId!, fecha: item.fecha.split('T')[0], peso: item.peso.toString() })}
                                                                        title="Editar este pesaje"
                                                                        aria-label={`Editar pesaje del ${format(new Date(item.fecha), 'dd/MM/yyyy')}`}
                                                                        style={{ backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-strong)', color: 'var(--primary-light)' }}
                                                                    >
                                                                        <Pencil size={14} aria-hidden="true" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="inventory-history-action-btn"
                                                                        onClick={() => handleEliminarPesaje(item.pesajeId!, format(new Date(item.fecha), 'dd/MM/yyyy'))}
                                                                        title="Eliminar este pesaje"
                                                                        aria-label={`Eliminar pesaje del ${format(new Date(item.fecha), 'dd/MM/yyyy')}`}
                                                                        style={{ backgroundColor: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)' }}
                                                                    >
                                                                        <Trash2 size={14} aria-hidden="true" />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showCrearModal && (
                <div className="modal-overlay" onClick={() => setShowCrearModal(false)}>
                    <div className="card inventory-modal-card" style={{ maxWidth: '600px', border: '1px solid var(--primary)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ color: 'var(--text-main)', margin: 0 }}>Crear Nuevo Animal</h2>
                            <button type="button" aria-label="Cerrar" onClick={() => setShowCrearModal(false)} className="btn-icon" style={{ width: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}><X aria-hidden="true" /></button>
                        </div>

                        {msjErrorCrear && (
                            <div role="alert" style={{ backgroundColor: 'var(--error-soft-bg)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
                                {msjErrorCrear}
                            </div>
                        )}

                        <div className="inventory-create-grid-2">
                            <div>
                                <label htmlFor="inv-new-chapeta">Número de Chapeta*</label>
                                <input id="inv-new-chapeta" type="text" value={nuevoAnimal.numero_chapeta} onChange={e => setNuevoAnimal({...nuevoAnimal, numero_chapeta: e.target.value})} placeholder="Ej: 1234" autoCorrect="off" autoCapitalize="characters" spellCheck={false} />
                                {validatingChapeta && <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>Validando...</span>}
                                {isChapetaTaken && <span style={{fontSize: '0.75rem', color: 'var(--danger)', display: 'block', marginTop: '4px'}}>Esta chapeta ya está en uso por un animal activo.</span>}
                            </div>
                            <div>
                                <label htmlFor="inv-new-prop">Propietario*</label>
                                <select
                                    id="inv-new-prop"
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

                        <div className="inventory-create-grid-3">
                            <div>
                                <label htmlFor="inv-new-especie">Especie*</label>
                                <select id="inv-new-especie" value={nuevoAnimal.especie} onChange={e => setNuevoAnimal({...nuevoAnimal, especie: e.target.value})}>
                                    <option value="bovino">Bovino</option>
                                    <option value="bufalino">Bufalino</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="inv-new-sexo">Sexo*</label>
                                <select id="inv-new-sexo" value={nuevoAnimal.sexo} onChange={e => setNuevoAnimal({...nuevoAnimal, sexo: e.target.value})}>
                                    <option value="M">Macho</option>
                                    <option value="H">Hembra</option>
                                </select>
                            </div>
                            {nuevoAnimal.sexo === 'M' && (
                                <div>
                                    <label htmlFor="inv-new-tipo-macho">Tipo Macho*</label>
                                    <select id="inv-new-tipo-macho" value={nuevoAnimal.tipo_macho} onChange={e => setNuevoAnimal({...nuevoAnimal, tipo_macho: e.target.value})}>
                                        <option value="Toro">Toro</option>
                                        <option value="Novillo">Novillo</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <label htmlFor="inv-new-etapa">Etapa*</label>
                                <select id="inv-new-etapa" value={nuevoAnimal.etapa} onChange={e => setNuevoAnimal({...nuevoAnimal, etapa: e.target.value})}>
                                    <option value="cria">Cría</option>
                                    <option value="levante">Levante</option>
                                    <option value="ceba">Ceba</option>
                                </select>
                            </div>
                        </div>

                        <div className="inventory-create-grid-2">
                            <div>
                                <label htmlFor="inv-new-peso">Peso Ingreso (kg)*</label>
                                <input id="inv-new-peso" type="text" inputMode="decimal" value={nuevoAnimal.peso_ingreso} onChange={e => setNuevoAnimal({...nuevoAnimal, peso_ingreso: sanitizeDecimalInput(e.target.value)})} placeholder="0" />
                            </div>
                            <div>
                                <label htmlFor="inv-new-fecha">Fecha Ingreso*</label>
                                <input id="inv-new-fecha" type="date" value={nuevoAnimal.fecha_ingreso} onChange={e => setNuevoAnimal({...nuevoAnimal, fecha_ingreso: e.target.value})} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label htmlFor="inv-new-lote">Asignar a Lote (Opcional)</label>
                            <select
                                id="inv-new-lote"
                                value={nuevoAnimal.id_potrerada}
                                onChange={e => {
                                    const selectedPotId = e.target.value;
                                    const selectedPot = potreradasDisponibles.find(p => p.id === selectedPotId);
                                    setNuevoAnimal({
                                        ...nuevoAnimal,
                                        id_potrerada: selectedPotId,
                                        ...(selectedPot?.etapa === 'ceba' ? { etapa: 'ceba' } : {})
                                    });
                                }}
                            >
                                <option value="">-- Sin Lote --</option>
                                {potreradasDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.etapa ? ` (${p.etapa.toUpperCase()})` : ''}</option>)}
                            </select>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px', marginBottom: '20px' }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary-light)' }}>Historial de Pesajes</h3>
                                <button
                                    type="button"
                                    className="inventory-btn-add-weighing"
                                    onClick={() => setNuevosPesajes([...nuevosPesajes, { fecha: getLocalIsoDate(), peso: '', etapa: nuevoAnimal.etapa }])}
                                >
                                    + Agregar Pesaje
                                </button>
                            </div>
                                 {nuevosPesajes.map((p, idx) => (
                                <div key={idx} className="inventory-extra-weighing-row">
                                    <div style={{ flex: 1.5 }}>
                                        <label htmlFor={`inv-extra-date-${idx}`} style={{ fontSize: '0.72rem' }}>Fecha</label>
                                        <input id={`inv-extra-date-${idx}`} type="date" value={p.fecha} onChange={e => {
                                            const up = [...nuevosPesajes];
                                            up[idx].fecha = e.target.value;
                                            setNuevosPesajes(up);
                                        }} style={{ marginBottom: 0 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label htmlFor={`inv-extra-peso-${idx}`} style={{ fontSize: '0.72rem' }}>Peso (kg)</label>
                                        <input id={`inv-extra-peso-${idx}`} type="text" inputMode="decimal" value={p.peso} onChange={e => {
                                            const up = [...nuevosPesajes];
                                            up[idx].peso = sanitizeDecimalInput(e.target.value);
                                            setNuevosPesajes(up);
                                        }} style={{ marginBottom: 0 }} placeholder="0" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label htmlFor={`inv-extra-etapa-${idx}`} style={{ fontSize: '0.72rem' }}>Etapa</label>
                                        <select id={`inv-extra-etapa-${idx}`} value={p.etapa} onChange={e => {
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
                                        type="button"
                                        className="inventory-history-action-btn"
                                        aria-label={`Eliminar pesaje adicional ${idx + 1}`}
                                        onClick={() => setNuevosPesajes(nuevosPesajes.filter((_, i) => i !== idx))}
                                        style={{ backgroundColor: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)', padding: '8px', marginBottom: '2px' }}
                                    >
                                        <Trash2 size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            ))}
                            {nuevosPesajes.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>No se han agregado pesajes adicionales.</p>}
                        </div>

                        <div className="inventory-modal-actions-row" style={{ display: 'flex', gap: '12px' }}>
                            <button type="button" className="inventory-btn-ghost" onClick={() => setShowCrearModal(false)} style={{ flex: 1 }}>
                                CANCELAR
                            </button>
                            <button
                                type="button"
                                onClick={handleCrearAnimal}
                                style={{ flex: 2 }}
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
