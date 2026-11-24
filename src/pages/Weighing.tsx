import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllSupabasePages } from '../lib/supabasePagination';
import { useAuth } from '../contexts/AuthContext';
import { useConnection } from '../contexts/ConnectionContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useIsMobile } from '../hooks/useIsMobile';
import ModalUpsell from '../components/ModalUpsell';
import { LicenseBlockedBanner } from '../components/LicenseBlockedBanner';
import { getLicenseBlockState } from '../utils/licenseUtils';
import { Search, Save, PlusCircle, CheckCircle2, AlertTriangle, Pencil, Trash2, X, Check } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toDisplayValue, getUnidadLabel, getModoLabel, getGmpColor, resolverResumenUltimoPesaje } from '../utils/ganancia';
import { localDB } from '../lib/db';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../utils/decimalInput';
import './Weighing.css';

interface AnimalPreview {
    id: string;
    numero_chapeta: string;
    peso_ingreso: number;
    peso_compra?: number;
    fecha_ingreso: string;
    etapa: string;
    ultimo_peso?: number;
    fecha_ultimo_peso?: string;
    gmp?: number;
    ok_ceba?: boolean;
    sexo?: 'M' | 'H';
    tipo_macho?: 'novillo' | 'toro' | 'torete';
    fecha_castracion?: string | null;
    nombre_propietario?: string;
    potrerada_nombre?: string;
    id_potrerada?: string | null;
}

const collatorHoy = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export default function Weighing() {
    const { fincaId, modoGanancia, licenciaInfo, refreshLicencia } = useAuth();
    const { modoCampo, isOnline } = useConnection();
    const { confirmAction, toast } = useFeedback();
    const { isVencida, isBloqueado } = getLicenseBlockState(licenciaInfo);
    const [showUpsellModal, setShowUpsellModal] = useState(false);
    const [chapeta, setChapeta] = useState('');
    const [animal, setAnimal] = useState<AnimalPreview | null>(null);
    const [nuevoPeso, setNuevoPeso] = useState('');
    const [fechaPesaje, setFechaPesaje] = useState(getLocalIsoDate());
    const [castrarHoy, setCastrarHoy] = useState(false);

    // Referencias para enfoque instantáneo en báscula (Chapeta -> Peso -> Chapeta)
    const chapetaInputRef = useRef<HTMLInputElement | null>(null);
    const pesoInputRef = useRef<HTMLInputElement | null>(null);

    // Diccionario en memoria RAM de todos los animales activos de la finca para búsqueda en 0.001s
    const animalesRamRef = useRef<Map<string, AnimalPreview>>(new Map());

    // Estados para la creación
    const [animalNoEncontrado, setAnimalNoEncontrado] = useState(false);
    const [showCrearAnimal, setShowCrearAnimal] = useState(false);
    const [propietarioNuevo, setPropietarioNuevo] = useState('');
    const [fechaIngresoNueva, setFechaIngresoNueva] = useState(getLocalIsoDate());
    const [pesoIngresoNuevo, setPesoIngresoNuevo] = useState('');

    // Lista de propietarios cargados desde la base de datos
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);

    // Peso umbral para marcar ok_ceba
    const [pesoEntradaCeba, setPesoEntradaCeba] = useState(380);
    // Bandera si el último pesaje guardado marcó ok_ceba
    const [marcadoCeba, setMarcadoCeba] = useState(false);

    const [loading, setLoading] = useState(false);
    const [msjError, setMsjError] = useState('');
    const [msjExito, setMsjExito] = useState('');
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);

    // --- Pesajes de Hoy (Corrección) ---
    const [pesajesHoy, setPesajesHoy] = useState<{ id: string; peso: number; fecha: string; numero_chapeta: string; nombre_propietario: string; potrerada_nombre: string }[]>([]);
    const [editingPesajeId, setEditingPesajeId] = useState<string | null>(null);
    const [editPeso, setEditPeso] = useState('');
    const [sortColHoy, setSortColHoy] = useState<'chapeta' | 'marca' | 'potrerada' | 'peso'>('chapeta');
    const [sortDirHoy, setSortDirHoy] = useState<'asc' | 'desc'>('asc');
    const isMobile = useIsMobile();

    // 1. Precargar el hato activo en memoria RAM desde IndexedDB (en 5ms) y actualizar en silencio desde la nube
    const cargarHatoEnRam = useCallback(async () => {
        if (!fincaId) return;
        try {
            const [cachedAnimales, cachedPots] = await Promise.all([
                localDB.animalesCache.where('id_finca').equals(fincaId).toArray(),
                localDB.potreradasCache.where('id_finca').equals(fincaId).toArray()
            ]);
            const potsMap = new Map<string, string>();
            cachedPots.forEach(p => potsMap.set(p.id, p.nombre));

            const nuevoMapa = new Map<string, AnimalPreview>();
            for (const a of cachedAnimales) {
                if (a.estado && a.estado !== 'activo') continue;
                const pesoBase = a.peso_ingreso || a.peso_compra || 0;
                const fechaBase = a.fecha_ingreso;
                const { ultimoPeso, fechaUltimoPeso, gmp } = resolverResumenUltimoPesaje(
                    a.registros_pesaje,
                    pesoBase,
                    fechaBase,
                    a.ultimo_peso,
                    a.fecha_ultimo_pesaje
                );
                const potNombre = a.potrerada_nombre || (a.id_potrerada ? potsMap.get(a.id_potrerada) : undefined);
                const preview: AnimalPreview = {
                    id: a.id,
                    numero_chapeta: a.numero_chapeta,
                    peso_ingreso: pesoBase,
                    peso_compra: a.peso_compra,
                    fecha_ingreso: fechaBase,
                    etapa: a.etapa,
                    ultimo_peso: ultimoPeso,
                    fecha_ultimo_peso: fechaUltimoPeso,
                    gmp,
                    nombre_propietario: a.nombre_propietario,
                    potrerada_nombre: potNombre || undefined,
                    id_potrerada: a.id_potrerada
                };
                nuevoMapa.set(a.numero_chapeta.trim().toLowerCase(), preview);
            }
            if (nuevoMapa.size > 0) {
                animalesRamRef.current = nuevoMapa;
            }
        } catch { /* noop */ }

        // Si hay conexión, refrescar el diccionario en memoria en paralelo paginado (>1000 animales)
        if (isOnline && !modoCampo) {
            try {
                const [animRes, ultRes] = await Promise.all([
                    fetchAllSupabasePages((from, to, signal) => {
                        const q = supabase
                            .from('animales')
                            .select('id, numero_chapeta, peso_ingreso, peso_compra, fecha_ingreso, etapa, ok_ceba, sexo, tipo_macho, fecha_castracion, nombre_propietario, id_potrerada, potreradas:potreradas!animales_id_potrerada_fkey(nombre, etapa)')
                            .eq('id_finca', fincaId)
                            .eq('estado', 'activo')
                            .or('is_deleted.is.null,is_deleted.eq.false')
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
                    })
                ]);

                if (animRes.data && animRes.data.length > 0) {
                    const ultMap = new Map<string, any>();
                    if (ultRes.data) {
                        for (const u of ultRes.data) ultMap.set(u.id_animal, u);
                    }
                    const mapaFresco = new Map<string, AnimalPreview>();
                    for (const a of animRes.data as any[]) {
                        const ult = ultMap.get(a.id);
                        const pesoBase = a.peso_ingreso || a.peso_compra || 0;
                        const fechaBase = a.fecha_ingreso;
                        const ultimoPeso = ult?.peso ?? pesoBase;
                        const fechaUltimoPeso = ult?.fecha ?? fechaBase;
                        let gmp = 0;
                        if (ult?.gmp_calculada != null) gmp = Number(ult.gmp_calculada);
                        else if (ult?.gdp_calculada != null) gmp = Number(ult.gdp_calculada) * 30;
                        else if (ultimoPeso && fechaUltimoPeso && fechaBase && fechaUltimoPeso !== fechaBase) {
                            const d = differenceInDays(
                                new Date(String(fechaUltimoPeso).split('T')[0] + 'T12:00:00'),
                                new Date(String(fechaBase).split('T')[0] + 'T12:00:00')
                            );
                            if (d > 0) gmp = ((ultimoPeso - pesoBase) / d) * 30;
                        }
                        const potObj = Array.isArray(a.potreradas) ? a.potreradas[0] : a.potreradas;
                        const preview: AnimalPreview = {
                            id: a.id,
                            numero_chapeta: a.numero_chapeta,
                            peso_ingreso: pesoBase,
                            peso_compra: a.peso_compra,
                            fecha_ingreso: fechaBase,
                            etapa: potObj?.etapa || a.etapa,
                            ultimo_peso: ultimoPeso,
                            fecha_ultimo_peso: fechaUltimoPeso,
                            gmp,
                            ok_ceba: a.ok_ceba,
                            sexo: a.sexo,
                            tipo_macho: a.tipo_macho,
                            fecha_castracion: a.fecha_castracion,
                            nombre_propietario: a.nombre_propietario,
                            potrerada_nombre: potObj?.nombre || undefined,
                            id_potrerada: a.id_potrerada
                        };
                        mapaFresco.set(String(a.numero_chapeta).trim().toLowerCase(), preview);
                    }
                    animalesRamRef.current = mapaFresco;
                }
            } catch { /* noop */ }
        }
    }, [fincaId, isOnline, modoCampo]);

    useEffect(() => {
        void cargarHatoEnRam();
    }, [cargarHatoEnRam]);

    useEffect(() => {
        if (!fincaId) return;
        const fetchConfig = async () => {
            const [configRes, propRes] = await Promise.all([
                supabase
                    .from('configuracion_kpi')
                    .select('peso_entrada_ceba, umbral_alto_gmp, umbral_medio_gmp')
                    .eq('id_finca', fincaId)
                    .single(),
                supabase
                    .from('propietarios')
                    .select('id, nombre')
                    .eq('id_finca', fincaId)
                    .order('nombre')
            ]);
            if (configRes.data?.peso_entrada_ceba) setPesoEntradaCeba(configRes.data.peso_entrada_ceba);
            if (configRes.data?.umbral_alto_gmp) setUmbralAlto(configRes.data.umbral_alto_gmp);
            if (configRes.data?.umbral_medio_gmp) setUmbralMedio(configRes.data.umbral_medio_gmp);
            if (propRes.data) setPropietarios(propRes.data);
        };
        fetchConfig();
    }, [fincaId]);

    const fetchPesajesHoy = useCallback(async () => {
        if (!fincaId) return;
        const hoy = getLocalIsoDate();
        const { data, error } = await supabase
            .from('registros_pesaje')
            .select(`
                id, peso, fecha,
                animales!inner(
                    numero_chapeta,
                    nombre_propietario,
                    id_finca,
                    potreradas:potreradas!animales_id_potrerada_fkey(nombre)
                )
            `)
            .eq('animales.id_finca', fincaId)
            .eq('fecha', hoy)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .order('id', { ascending: false })
            .limit(50);

        if (error) {
            console.error("Error fetching pesajes hoy:", error);
            return;
        }

        if (data) {
            setPesajesHoy(data.map((p: any) => ({
                id: p.id,
                peso: p.peso,
                fecha: p.fecha,
                numero_chapeta: p.animales?.numero_chapeta || '-',
                nombre_propietario: p.animales?.nombre_propietario || '-',
                potrerada_nombre: p.animales?.potreradas?.nombre || 'Sin lote'
            })));
        }
    }, [fincaId]);

    useEffect(() => {
        fetchPesajesHoy();
    }, [fetchPesajesHoy]);

    useEffect(() => {
        const onSyncCompleted = () => {
            void cargarHatoEnRam();
            void fetchPesajesHoy();
        };
        window.addEventListener('offline-sync-completed', onSyncCompleted);
        return () => window.removeEventListener('offline-sync-completed', onSyncCompleted);
    }, [cargarHatoEnRam, fetchPesajesHoy]);

    const buscarAnimal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !chapeta.trim()) return;

        setMsjError('');
        setMsjExito('');
        setAnimalNoEncontrado(false);
        setShowCrearAnimal(false);
        setMarcadoCeba(false);
        setCastrarHoy(false);
        setFechaPesaje(getLocalIsoDate());

        const targetChapeta = chapeta.trim();
        const keyChapeta = targetChapeta.toLowerCase();

        // PASO 1: Búsqueda instantánea en RAM (0.001 segundos, cero esperas de red)
        const enRam = animalesRamRef.current.get(keyChapeta);
        if (enRam) {
            setAnimal(enRam);
            setTimeout(() => pesoInputRef.current?.focus(), 20);
            return;
        }

        // PASO 2: Búsqueda en IndexedDB local (<10ms)
        setLoading(true);
        try {
            const cached = await localDB.animalesCache
                .where('id_finca').equals(fincaId)
                .filter(a => a.numero_chapeta?.trim().toLowerCase() === keyChapeta && a.estado !== 'vendido' && a.estado !== 'muerto')
                .first();

            if (cached) {
                const pesoBase = cached.peso_ingreso || cached.peso_compra || 0;
                const fechaBase = cached.fecha_ingreso;
                const { ultimoPeso, fechaUltimoPeso, gmp } = resolverResumenUltimoPesaje(
                    cached.registros_pesaje,
                    pesoBase,
                    fechaBase,
                    cached.ultimo_peso,
                    cached.fecha_ultimo_pesaje
                );
                let potNombre = cached.potrerada_nombre || undefined;
                if (!potNombre && cached.id_potrerada) {
                    const potCached = await localDB.potreradasCache.get(cached.id_potrerada);
                    potNombre = potCached?.nombre || undefined;
                }
                const encontrado: AnimalPreview = {
                    id: cached.id,
                    numero_chapeta: cached.numero_chapeta,
                    peso_ingreso: pesoBase,
                    peso_compra: cached.peso_compra,
                    fecha_ingreso: fechaBase,
                    etapa: cached.etapa,
                    ultimo_peso: ultimoPeso,
                    fecha_ultimo_peso: fechaUltimoPeso,
                    gmp,
                    nombre_propietario: cached.nombre_propietario,
                    potrerada_nombre: potNombre,
                    id_potrerada: cached.id_potrerada
                };
                animalesRamRef.current.set(keyChapeta, encontrado);
                setAnimal(encontrado);
                setLoading(false);
                setTimeout(() => pesoInputRef.current?.focus(), 20);
                return;
            }

            // PASO 3: Si no estaba en caché local y hay señal, hacer UNA SOLA consulta unificada (con joins)
            if (!modoCampo && isOnline) {
                const { data } = await supabase
                    .from('animales')
                    .select(`
                        id, numero_chapeta, peso_ingreso, peso_compra, fecha_ingreso, etapa, ok_ceba,
                        fecha_ingreso_ceba, peso_ingreso_ceba, sexo, tipo_macho, fecha_castracion,
                        nombre_propietario, id_potrerada,
                        potreradas:potreradas!animales_id_potrerada_fkey(nombre, etapa),
                        registros_pesaje(peso, fecha, gmp_calculada, gdp_calculada, is_deleted)
                    `)
                    .eq('id_finca', fincaId)
                    .eq('numero_chapeta', targetChapeta)
                    .eq('estado', 'activo')
                    .or('is_deleted.is.null,is_deleted.eq.false')
                    .maybeSingle();

                if (data) {
                    const pesoBase = data.peso_ingreso || data.peso_compra || 0;
                    const fechaBase = data.fecha_ingreso;
                    const { ultimoPeso, fechaUltimoPeso, gmp } = resolverResumenUltimoPesaje(
                        (data as any).registros_pesaje,
                        pesoBase,
                        fechaBase
                    );
                    const potObj = Array.isArray((data as any).potreradas) ? (data as any).potreradas[0] : (data as any).potreradas;
                    const encontrado: AnimalPreview = {
                        id: data.id,
                        numero_chapeta: data.numero_chapeta,
                        peso_ingreso: pesoBase,
                        peso_compra: data.peso_compra,
                        fecha_ingreso: fechaBase,
                        etapa: potObj?.etapa || data.etapa,
                        ultimo_peso: ultimoPeso,
                        fecha_ultimo_peso: fechaUltimoPeso,
                        gmp,
                        ok_ceba: data.ok_ceba,
                        sexo: data.sexo as any,
                        tipo_macho: data.tipo_macho as any,
                        fecha_castracion: data.fecha_castracion,
                        nombre_propietario: data.nombre_propietario,
                        potrerada_nombre: potObj?.nombre || undefined,
                        id_potrerada: data.id_potrerada
                    };
                    animalesRamRef.current.set(keyChapeta, encontrado);
                    setAnimal(encontrado);
                    setLoading(false);
                    setTimeout(() => pesoInputRef.current?.focus(), 20);
                    return;
                }
            }

            setAnimal(null);
            setAnimalNoEncontrado(true);
            setMsjError('Animal no encontrado. Puede revisar la chapeta o crear uno nuevo.');
        } catch {
            setAnimal(null);
            setAnimalNoEncontrado(true);
            setMsjError('Animal no encontrado en la memoria local.');
        } finally {
            setLoading(false);
        }
    };

    const crearRegistroAnimal = async () => {
        if (!fincaId || !chapeta.trim() || !propietarioNuevo || !pesoIngresoNuevo) return;
        setLoading(true);
        setMsjError('');

        try {
            const dateError = getGanadoDateError(fechaIngresoNueva, 'La fecha de ingreso');
            if (dateError) {
                throw new Error(dateError);
            }
            const pesoFloat = Math.round(parseDecimalInput(pesoIngresoNuevo));
            if (isNaN(pesoFloat) || pesoFloat <= 0) {
                throw new Error('El peso inicial debe ser mayor a 0');
            }

            const insertData = {
                id_finca: fincaId,
                numero_chapeta: chapeta.trim(),
                nombre_propietario: propietarioNuevo,
                especie: 'bovino',
                sexo: 'M',
                tipo_macho: 'toro',
                etapa: 'levante',
                fecha_ingreso: fechaIngresoNueva,
                peso_ingreso: pesoFloat,
                estado: 'activo'
            };

            const { data, error } = await supabase.from('animales').insert(insertData).select().single();

            if (error) throw error;

            setMsjExito(`¡Animal #${chapeta} creado exitosamente con peso inicial de ${data.peso_ingreso} kg! Ingrese un nuevo peso si desea registrar un pesaje de hoy.`);

            const nuevoPreview: AnimalPreview = {
                id: data.id,
                numero_chapeta: data.numero_chapeta,
                peso_ingreso: data.peso_ingreso,
                fecha_ingreso: data.fecha_ingreso,
                etapa: data.etapa,
                ultimo_peso: data.peso_ingreso,
                fecha_ultimo_peso: data.fecha_ingreso,
                gmp: 0,
                nombre_propietario: propietarioNuevo
            };
            animalesRamRef.current.set(String(data.numero_chapeta).trim().toLowerCase(), nuevoPreview);
            setAnimal(nuevoPreview);
            setAnimalNoEncontrado(false);
            setShowCrearAnimal(false);
            if (refreshLicencia) void refreshLicencia();
            setNuevoPeso('');
            setTimeout(() => pesoInputRef.current?.focus(), 20);

        } catch (err: any) {
            setMsjError(err.message || 'Error al crear el animal.');
        } finally {
            setLoading(false);
        }
    };

    const guardarPesaje = async () => {
        if (!animal || !fincaId || !nuevoPeso) return;

        if (isBloqueado) {
            setShowUpsellModal(true);
            if (isVencida) {
                setMsjError(`Tu suscripción al Plan ${licenciaInfo?.licencia?.toUpperCase()} está vencida. Renueva tu suscripción para registrar nuevos pesajes.`);
            } else {
                setMsjError(`Tu cuenta tiene ${licenciaInfo?.totalAnimalesOrganizacion} animales y supera el cupo de ${licenciaInfo?.limiteAnimales} del Plan ${licenciaInfo?.licencia?.toUpperCase()}. Actualiza tu plan para registrar pesajes.`);
            }
            return;
        }

        setMsjError('');
        setMarcadoCeba(false);

        const dateError = getGanadoDateError(fechaPesaje, 'La fecha del pesaje');
        if (dateError) {
            setMsjError(dateError);
            return;
        }

        const pesoFloat = Math.round(parseDecimalInput(nuevoPeso));
        if (isNaN(pesoFloat) || pesoFloat <= 0) {
            setMsjError('El peso debe ser un número mayor a 0');
            return;
        }

        let gdpCalculada = 0;
        if (animal.ultimo_peso && animal.fecha_ultimo_peso) {
            const fechaUltimo = animal.fecha_ultimo_peso.split('T')[0];
            if (fechaPesaje === fechaUltimo) {
                setMsjError(`Este animal ya tiene un pesaje registrado para la fecha ${fechaPesaje}.`);
                return;
            }
            const diffDias = differenceInDays(new Date(fechaPesaje + 'T12:00:00'), new Date(fechaUltimo + 'T12:00:00'));
            if (diffDias > 0) {
                gdpCalculada = (pesoFloat - animal.ultimo_peso) / diffDias;
            }
        }

        // Verificar si el peso supera el umbral de entrada a ceba o castración
        let marcaOkCeba = false;
        const updateAnimalData: any = {};

        if (animal.etapa === 'levante' && pesoFloat >= pesoEntradaCeba) {
            marcaOkCeba = true;
            updateAnimalData.ok_ceba = true;
            setMarcadoCeba(true);
        }

        if (castrarHoy) {
            updateAnimalData.tipo_macho = 'novillo';
            updateAnimalData.fecha_castracion = fechaPesaje;
        }

        const msgCeba = marcaOkCeba
            ? ` 🟢 Marcado para pasar a Ceba (${pesoFloat}kg ≥ ${pesoEntradaCeba}kg).`
            : '';
        const msgCastrado = castrarHoy ? ` ✂️ Registrado como Novillo.` : '';

        // ── GUARDADO INSTANTÁNEO EN PANTALLA (OPTIMISTIC UI: 0.01 SEGUNDOS) ──
        // Actualizamos en el acto la memoria RAM, la lista de Pesajes de Hoy y limpiamos la casilla
        // para que el mayordomo pueda pesar el siguiente animal sin esperar ni un milisegundo a la red.
        const animalSnapshot = { ...animal };
        const fechaSnapshot = fechaPesaje;
        const pesajeId = crypto.randomUUID();
        const keyChapeta = animalSnapshot.numero_chapeta.trim().toLowerCase();

        animalesRamRef.current.set(keyChapeta, {
            ...animalSnapshot,
            ultimo_peso: pesoFloat,
            fecha_ultimo_peso: fechaSnapshot,
            gmp: gdpCalculada * 30,
            ...(marcaOkCeba ? { ok_ceba: true } : {}),
            ...(castrarHoy ? { tipo_macho: 'novillo', fecha_castracion: fechaSnapshot } : {})
        });

        const hoyIso = getLocalIsoDate();
        if (fechaSnapshot === hoyIso) {
            setPesajesHoy(prev => [
                {
                    id: pesajeId,
                    peso: pesoFloat,
                    fecha: fechaSnapshot,
                    numero_chapeta: animalSnapshot.numero_chapeta,
                    nombre_propietario: animalSnapshot.nombre_propietario || '-',
                    potrerada_nombre: animalSnapshot.potrerada_nombre || 'Sin lote'
                },
                ...prev.filter(p => p.numero_chapeta !== animalSnapshot.numero_chapeta)
            ]);
        }

        setMsjExito(
            modoCampo || !isOnline
                ? `📱 Pesaje de ${pesoFloat}kg guardado para #${animalSnapshot.numero_chapeta}.${msgCeba}${msgCastrado}`
                : `¡Pesaje de ${pesoFloat}kg guardado para la chapeta #${animalSnapshot.numero_chapeta}!${msgCeba}${msgCastrado}`
        );
        setAnimal(null);
        setChapeta('');
        setNuevoPeso('');
        setCastrarHoy(false);
        setFechaPesaje(hoyIso);
        setTimeout(() => chapetaInputRef.current?.focus(), 20);

        // ── PERSISTENCIA EN SEGUNDO PLANO (VÍA ÚNICA HTTP + INDEXEDDB) ──
        void (async () => {
            try {
                const { error } = await supabase.from('registros_pesaje').insert({
                    id: pesajeId,
                    id_animal: animalSnapshot.id,
                    peso: pesoFloat,
                    fecha: fechaSnapshot,
                    etapa: animalSnapshot.etapa,
                    gdp_calculada: gdpCalculada,
                    gmp_calculada: gdpCalculada * 30
                });
                if (error) {
                    console.warn('[Weighing] Error al guardar pesaje:', error);
                }

                if (Object.keys(updateAnimalData).length > 0) {
                    const { error: errAnimal } = await supabase
                        .from('animales')
                        .update(updateAnimalData)
                        .eq('id', animalSnapshot.id);
                    if (errAnimal) {
                        console.warn('[Weighing] Error actualizando animal tras pesaje:', errAnimal);
                    }
                }
            } catch (err) {
                console.warn('[Weighing] Error inesperado guardando pesaje:', err);
            }
        })();
    };

    const handleEliminarPesaje = async (pesaje: typeof pesajesHoy[0]) => {
        const confirmed = await confirmAction(
            `¿Eliminar el pesaje de ${pesaje.peso}kg del animal #${pesaje.numero_chapeta}?`,
            { title: 'Eliminar pesaje', confirmLabel: 'Sí, eliminar', destructive: true }
        );
        if (!confirmed) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('registros_pesaje').delete().eq('id', pesaje.id);
            if (error) throw error;
            setPesajesHoy(prev => prev.filter(p => p.id !== pesaje.id));
            void cargarHatoEnRam();
            void fetchPesajesHoy();
            toast('Pesaje eliminado.', 'success');
        } catch (err: any) {
            toast('Error al eliminar: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleGuardarEdicion = async (pesaje: typeof pesajesHoy[0]) => {
        const nuevoPesoFloat = parseDecimalInput(editPeso);
        if (isNaN(nuevoPesoFloat) || nuevoPesoFloat <= 0) {
            toast('Ingresa un peso válido mayor a 0.', 'error');
            return;
        }
        if (nuevoPesoFloat === pesaje.peso) { setEditingPesajeId(null); return; }
        setLoading(true);
        try {
            const { error } = await supabase
                .from('registros_pesaje')
                .update({ peso: nuevoPesoFloat, peso_anterior: pesaje.peso, fecha_modificacion: new Date().toISOString() })
                .eq('id', pesaje.id);
            if (error) throw error;
            setEditingPesajeId(null);
            setEditPeso('');
            setPesajesHoy(prev => prev.map(p => (p.id === pesaje.id ? { ...p, peso: nuevoPesoFloat } : p)));
            void cargarHatoEnRam();
            void fetchPesajesHoy();
            toast('Pesaje actualizado.', 'success');
        } catch (err: any) {
            toast('Error al editar: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container weighing-page">
            <h1 className="title text-center weighing-title">Control de Pesaje</h1>
            <p className="text-center weighing-subtitle">Busque al animal para registrar el peso actual.</p>
            <p className="text-center weighing-threshold">
                Umbral entrada a ceba: <strong style={{ color: 'var(--primary-light)' }}>{pesoEntradaCeba} kg</strong>
            </p>

            <LicenseBlockedBanner
                licenciaInfo={licenciaInfo}
                onUpgradeClick={() => setShowUpsellModal(true)}
                expiredDetail="Tu información histórica está disponible, pero el registro de nuevos pesajes y cálculos de GDP está pausado."
                overLimitDetail="Para registrar nuevos pesajes y GDP, actualiza tu suscripción."
            />

            {msjExito && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`weighing-feedback-success${marcadoCeba ? ' weighing-feedback-success--ceba' : ''}`}
                >
                    {marcadoCeba && <CheckCircle2 size={22} aria-hidden="true" />}
                    <span>{msjExito}</span>
                </div>
            )}
            {msjError && (
                <div role="alert" aria-live="assertive" className="error-message text-center" style={{ fontWeight: 'bold' }}>
                    {msjError}
                </div>
            )}

            <div className="card weighing-main-card">
                <search>
                    <form
                        onSubmit={buscarAnimal}
                        className={`weighing-search-form${animal || showCrearAnimal ? ' weighing-search-form--has-body' : ''}`}
                    >
                        <div className="weighing-chapeta-wrap">
                            <label htmlFor="weighing-chapeta" className="weighing-visually-hidden">
                                Número de chapeta
                            </label>
                            <Search size={22} aria-hidden="true" className="weighing-chapeta-icon" />
                            <input
                                id="weighing-chapeta"
                                ref={chapetaInputRef}
                                type="text"
                                placeholder="Nro. Chapeta"
                                value={chapeta}
                                onChange={(e) => setChapeta(e.target.value)}
                                className="weighing-chapeta-input"
                                disabled={loading || showCrearAnimal}
                                autoFocus={!isMobile}
                                autoCorrect="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                enterKeyHint="search"
                            />
                            {chapeta && !loading && !showCrearAnimal && (
                                <button
                                    type="button"
                                    className="weighing-chapeta-clear"
                                    aria-label="Limpiar chapeta"
                                    onClick={() => {
                                        setChapeta('');
                                        setAnimal(null);
                                        setAnimalNoEncontrado(false);
                                        setMsjError('');
                                        chapetaInputRef.current?.focus();
                                    }}
                                >
                                    <X size={18} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        <button type="submit" disabled={loading || showCrearAnimal} className="weighing-search-btn">
                            Buscar
                        </button>
                    </form>
                </search>

                {animalNoEncontrado && !showCrearAnimal && !animal && (
                    <div className="weighing-not-found-box">
                        <p style={{ color: 'var(--text-main)', marginBottom: '16px', fontWeight: 500 }}>El animal no está en la base de datos.</p>
                        <button
                            type="button"
                            className="weighing-btn-warning"
                            onClick={() => {
                                if (isBloqueado || (licenciaInfo && licenciaInfo.totalAnimalesOrganizacion >= licenciaInfo.limiteAnimales)) {
                                    setShowUpsellModal(true);
                                } else {
                                    setShowCrearAnimal(true);
                                    setMsjError('');
                                }
                            }}
                        >
                            <PlusCircle size={20} aria-hidden="true" /> Crear Animal Ahora
                        </button>
                    </div>
                )}

                {showCrearAnimal && !animal && (
                    <div className="weighing-create-section">
                        <h3 style={{ color: 'var(--warning)', marginBottom: '16px', fontSize: '1.2rem' }}>Registro Rápido: #{chapeta}</h3>

                        <label htmlFor="weighing-prop-select">Seleccionar Propietario</label>
                        {propietarios.length > 0 ? (
                            <select
                                id="weighing-prop-select"
                                value={propietarioNuevo}
                                onChange={e => setPropietarioNuevo(e.target.value)}
                                required
                            >
                                <option value="">-- Elija un propietario --</option>
                                {propietarios.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        ) : (
                            <div style={{ padding: '12px', marginBottom: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-subtle)', fontSize: '0.9rem', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                                No hay propietarios configurados en esta finca. Vaya a <b>Ajustes</b> para crearlos.
                                <input
                                    type="text"
                                    placeholder="Nombre del propietario (Manual)"
                                    value={propietarioNuevo}
                                    style={{ marginTop: '12px' }}
                                    onChange={e => setPropietarioNuevo(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="weighing-create-row">
                            <div className="weighing-create-field">
                                <label htmlFor="weighing-fecha-ingreso">Fecha de Ingreso</label>
                                <input
                                    id="weighing-fecha-ingreso"
                                    type="date"
                                    min={MIN_GANADO_DATE}
                                    value={fechaIngresoNueva}
                                    onChange={e => setFechaIngresoNueva(e.target.value)}
                                />
                            </div>
                            <div className="weighing-create-field">
                                <label htmlFor="weighing-peso-ingreso">Peso de Ingreso (kg)</label>
                                <input
                                    id="weighing-peso-ingreso"
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Ej 180"
                                    value={pesoIngresoNuevo}
                                    onChange={e => setPesoIngresoNuevo(sanitizeDecimalInput(e.target.value))}
                                />
                            </div>
                        </div>

                        <div className="weighing-create-actions">
                            <button type="button" onClick={() => setShowCrearAnimal(false)} className="weighing-btn-secondary">
                                Cancelar
                            </button>
                            <button type="button" onClick={crearRegistroAnimal} disabled={!propietarioNuevo || !pesoIngresoNuevo || loading}>
                                {loading ? 'Creando...' : 'Crear y Continuar'}
                            </button>
                        </div>
                    </div>
                )}

                {animal && (
                    <div className="weighing-animal-section">
                        <div className="weighing-animal-header">
                            <div>
                                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Animal Encontrado</div>
                                <div className="weighing-chapeta-badge">#{animal.numero_chapeta}</div>
                                {animal.nombre_propietario && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                                        Marca/Propietario: <span style={{ color: 'var(--text-light)' }}>{animal.nombre_propietario}</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Última {getModoLabel(modoGanancia)}</div>
                                <div style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 'bold',
                                    color: getGmpColor(animal.gmp || 0, umbralMedio, umbralAlto),
                                }}>
                                    {animal.gmp ? toDisplayValue(animal.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1) : '0'} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getUnidadLabel(modoGanancia)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="weighing-kpi-grid">
                            <div className="weighing-kpi-card">
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Último Pesaje</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{animal.ultimo_peso} kg</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{animal.fecha_ultimo_peso ? format(new Date(animal.fecha_ultimo_peso), 'dd/MM/yyyy') : '-'}</div>
                            </div>
                            <div className="weighing-kpi-card">
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Etapa</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'capitalize' }}>{animal.etapa}</div>
                                {animal.potrerada_nombre && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', overflowWrap: 'break-word' }}>{animal.potrerada_nombre}</div>
                                )}
                            </div>
                        </div>

                        {/* Tarjeta de tipo de animal (solo machos) */}
                        {animal.sexo === 'M' && (
                            <div style={{ marginBottom: '14px' }}>
                                {animal.tipo_macho === 'novillo' ? (
                                    <div style={{ padding: '12px 16px', background: 'var(--info-soft-bg)', border: '1px solid var(--info-soft-border)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--info)', fontSize: '0.9rem' }}>
                                        <span style={{ fontSize: '1.2rem' }} aria-hidden="true">✂️</span>
                                        <div>
                                            <strong>Novillo</strong> (castrado)
                                            {animal.fecha_castracion && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Castrado el {format(new Date(animal.fecha_castracion + 'T12:00:00'), 'dd/MM/yyyy')}</div>}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '12px 14px', background: 'var(--warning-soft-bg)', border: `1px solid ${castrarHoy ? 'var(--info)' : 'var(--warning-soft-border)'}`, borderRadius: '10px', transition: 'border-color 0.2s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                <span style={{ fontSize: '1.1rem' }} aria-hidden="true">🐂</span>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--text-light)', fontSize: '0.95rem' }}>Toro (sin castrar)</div>
                                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>¿Se castró hoy? Marcar como Novillo</div>
                                                </div>
                                            </div>
                                            <label className="weighing-switch-label" aria-label="Marcar como castrado hoy (Novillo)">
                                                <input
                                                    type="checkbox"
                                                    role="switch"
                                                    aria-checked={castrarHoy}
                                                    checked={castrarHoy}
                                                    onChange={e => setCastrarHoy(e.target.checked)}
                                                    className="weighing-visually-hidden weighing-switch-input"
                                                />
                                                <span className={`weighing-switch-track${castrarHoy ? ' is-checked' : ''}`} aria-hidden="true">
                                                    <span className="weighing-switch-thumb" />
                                                </span>
                                            </label>
                                        </div>
                                        {castrarHoy && (
                                            <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--info-soft-bg)', borderRadius: '6px', color: 'var(--info)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <AlertTriangle size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
                                                Al guardar el pesaje, este animal quedará registrado como <strong>Novillo</strong> para siempre.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Indicador si ya tiene marca ok_ceba - Solo mostrar si está en levante */}
                        {animal.ok_ceba && animal.etapa === 'levante' && (
                            <div style={{ padding: '10px 14px', background: 'var(--success-soft-bg)', border: '1px solid var(--success-soft-border)', borderRadius: '8px', marginBottom: '12px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                                <CheckCircle2 size={18} aria-hidden="true" style={{ flexShrink: 0 }} /> Este animal ya está marcado para pasar a Ceba
                            </div>
                        )}

                        {/* Indicador del umbral - Solo mostrar si está en levante */}
                        {animal.etapa === 'levante' && (
                            <div style={{ padding: '10px 14px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '8px', marginBottom: '14px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                                Si el nuevo peso ≥ <strong style={{ color: 'var(--primary-light)' }}>{pesoEntradaCeba} kg</strong>, el animal quedará marcado para pasar a Ceba.
                            </div>
                        )}

                        {/* Indicador de peso repetido el mismo día */}
                        {animal.fecha_ultimo_peso && animal.fecha_ultimo_peso.split('T')[0] === fechaPesaje && (
                            <div style={{ padding: '10px 14px', background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', borderRadius: '8px', marginBottom: '14px', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                                <AlertTriangle size={18} style={{ flexShrink: 0 }} aria-hidden="true" /> Este animal ya tiene un pesaje registrado en esta fecha.
                            </div>
                        )}

                        <label htmlFor="weighing-nuevo-peso" className="weighing-weight-section-label">
                            Nuevo Peso (kg)
                        </label>
                        <div className="weighing-weight-controls">
                            <div className="weighing-date-field">
                                <label htmlFor="weighing-fecha-pesaje" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                                    Fecha del pesaje
                                </label>
                                <input
                                    id="weighing-fecha-pesaje"
                                    type="date"
                                    min={MIN_GANADO_DATE}
                                    value={fechaPesaje}
                                    onChange={(e) => setFechaPesaje(e.target.value)}
                                    style={{ marginBottom: 0 }}
                                    disabled={loading}
                                />
                            </div>
                            <div className="weighing-weight-action-row">
                                <input
                                    id="weighing-nuevo-peso"
                                    ref={pesoInputRef}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Ej. 350,5"
                                    value={nuevoPeso}
                                    onChange={(e) => setNuevoPeso(sanitizeDecimalInput(e.target.value))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && nuevoPeso && animal.fecha_ultimo_peso?.split('T')[0] !== fechaPesaje) {
                                            e.preventDefault();
                                            void guardarPesaje();
                                        }
                                    }}
                                    className="weighing-weight-input"
                                    disabled={loading}
                                    enterKeyHint="done"
                                />
                                <button
                                    type="button"
                                    onClick={guardarPesaje}
                                    disabled={loading || !nuevoPeso || (animal.fecha_ultimo_peso?.split('T')[0] === fechaPesaje)}
                                    className="weighing-save-btn"
                                >
                                    <Save size={isMobile ? 20 : 28} aria-hidden="true" />
                                    <span>Guardar</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Panel: Pesajes de Hoy */}
            {pesajesHoy.length > 0 && (() => {
                const toggleSort = (col: typeof sortColHoy) => {
                    if (sortColHoy === col) setSortDirHoy(d => d === 'asc' ? 'desc' : 'asc');
                    else { setSortColHoy(col); setSortDirHoy('asc'); }
                };
                const sorted = [...pesajesHoy].sort((a, b) => {
                    let res = 0;
                    if (sortColHoy === 'chapeta') res = collatorHoy.compare(a.numero_chapeta, b.numero_chapeta);
                    else if (sortColHoy === 'marca') res = collatorHoy.compare(a.nombre_propietario, b.nombre_propietario);
                    else if (sortColHoy === 'potrerada') res = collatorHoy.compare(a.potrerada_nombre, b.potrerada_nombre);
                    else if (sortColHoy === 'peso') res = a.peso - b.peso;
                    return sortDirHoy === 'asc' ? res : -res;
                });
                const arrow = (col: typeof sortColHoy) => sortColHoy === col ? (sortDirHoy === 'asc' ? ' ↑' : ' ↓') : ' ↕';
                const getAriaSort = (col: typeof sortColHoy): 'ascending' | 'descending' | undefined =>
                    sortColHoy === col ? (sortDirHoy === 'asc' ? 'ascending' : 'descending') : undefined;

                return (
                    <div className="weighing-today-outer">
                        <div className="card weighing-today-card">
                            <h3 id="weighing-today-heading" style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span aria-hidden="true">✏️</span> Pesajes ingresados hoy ({pesajesHoy.length})
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(solo puedes corregir los de hoy)</span>
                            </h3>
                            <div
                                tabIndex={0}
                                role="region"
                                aria-labelledby="weighing-today-heading"
                                className="weighing-today-scroll"
                            >
                                <table className="weighing-today-table">
                                    <caption className="weighing-visually-hidden">Pesajes ingresados hoy</caption>
                                    <thead>
                                        <tr>
                                            <th scope="col" aria-sort={getAriaSort('chapeta')}>
                                                <button type="button" className="weighing-sort-btn" onClick={() => toggleSort('chapeta')}>
                                                    Chapeta <span aria-hidden="true">{arrow('chapeta')}</span>
                                                </button>
                                            </th>
                                            <th scope="col" aria-sort={getAriaSort('marca')}>
                                                <button type="button" className="weighing-sort-btn" onClick={() => toggleSort('marca')}>
                                                    Marca <span aria-hidden="true">{arrow('marca')}</span>
                                                </button>
                                            </th>
                                            <th scope="col" aria-sort={getAriaSort('potrerada')}>
                                                <button type="button" className="weighing-sort-btn" onClick={() => toggleSort('potrerada')}>
                                                    Potrerada <span aria-hidden="true">{arrow('potrerada')}</span>
                                                </button>
                                            </th>
                                            <th scope="col" aria-sort={getAriaSort('peso')}>
                                                <button type="button" className="weighing-sort-btn weighing-sort-btn--right" onClick={() => toggleSort('peso')}>
                                                    Peso <span aria-hidden="true">{arrow('peso')}</span>
                                                </button>
                                            </th>
                                            <th scope="col" style={{ textAlign: 'center' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sorted.map(p => (
                                            <tr key={p.id} className={editingPesajeId === p.id ? 'is-editing' : undefined}>
                                                <th scope="row" className="weighing-cell-chapeta">
                                                    #{p.numero_chapeta}
                                                </th>
                                                <td className="weighing-cell-marca">{p.nombre_propietario}</td>
                                                <td className="weighing-cell-lote">{p.potrerada_nombre}</td>
                                                <td className="weighing-cell-peso">
                                                    {editingPesajeId === p.id ? (
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={editPeso}
                                                            aria-label={`Editar peso de #${p.numero_chapeta}`}
                                                            onChange={e => setEditPeso(sanitizeDecimalInput(e.target.value))}
                                                            className="weighing-edit-input"
                                                            autoFocus={!isMobile}
                                                        />
                                                    ) : (
                                                        <>{p.peso} kg</>
                                                    )}
                                                </td>
                                                <td className="weighing-actions-cell">
                                                    <div className="weighing-actions-row">
                                                        {editingPesajeId === p.id ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleGuardarEdicion(p)}
                                                                    disabled={loading}
                                                                    className="weighing-action-btn weighing-action-btn--confirm"
                                                                    aria-label={`Guardar nuevo peso de #${p.numero_chapeta}`}
                                                                >
                                                                    <Check size={14} aria-hidden="true" /> OK
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setEditingPesajeId(null); setEditPeso(''); }}
                                                                    className="weighing-action-btn weighing-action-btn--cancel"
                                                                    aria-label={`Cancelar edición de #${p.numero_chapeta}`}
                                                                >
                                                                    <X size={14} aria-hidden="true" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setEditingPesajeId(p.id); setEditPeso(String(p.peso)); }}
                                                                    title="Editar"
                                                                    aria-label={`Editar pesaje de #${p.numero_chapeta}`}
                                                                    className="weighing-action-btn weighing-action-btn--edit"
                                                                >
                                                                    <Pencil size={15} aria-hidden="true" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEliminarPesaje(p)}
                                                                    title="Eliminar"
                                                                    aria-label={`Eliminar pesaje de #${p.numero_chapeta}`}
                                                                    className="weighing-action-btn weighing-action-btn--delete"
                                                                >
                                                                    <Trash2 size={15} aria-hidden="true" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
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

            <ModalUpsell
                isOpen={showUpsellModal}
                onClose={() => setShowUpsellModal(false)}
                licenciaInfo={licenciaInfo}
            />
        </div>
    );
}
