import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Upload, FileText, UserPlus, Users, CheckSquare, Square, Trash2, Plus, CheckCircle2, MapPin, Maximize, Home, Lock, Briefcase, Truck, ShoppingCart, Target, Scale, DollarSign, Coins, CreditCard, Leaf, Award, CloudRain, AlertTriangle, X, Eye, EyeOff } from 'lucide-react';
import PushNotificationsCard from '../components/PushNotificationsCard';
import './Settings.css';
import { toDisplayValue, toStorageValue, getUnidadLabel, getModoLabel, type ModoGanancia } from '../utils/ganancia';
import { type PluviometroFinca, type TipoMedicionPluviometro } from '../utils/rainfallUtils';
import { recalcularHistorialPesajesAnimal } from '../utils/gananciaRecalculator';
// @ts-ignore type definitions for papaparse are throwing a false positive in the IDE
import Papa from 'papaparse';
import { getLocalIsoDate } from '../utils/dateUtils';

interface CargaMasivaItem {
    id: string;
    tipo: 'animales' | 'pesajes';
    nombre_archivo: string;
    total_registros: number;
    fecha_carga: string;
    creado_en: string;
    estado: string;
}

export const PRESETS_RANGOS_PESO = [
    { 
        id: 'ceba_tradicional', 
        nombre: 'Ceba Tradicional (430 - 530+ kg)', 
        corte1: 430, 
        corte2: 480, 
        corte3: 530, 
        descripcion: 'Para engorde pesado de novillos (Palmola, Alejandría). Meta de despacho: 530 kg.' 
    },
    { 
        id: 'levante_preceba', 
        nombre: 'Levante / Pre-ceba (230 - 380 kg)', 
        corte1: 280, 
        corte2: 330, 
        corte3: 380, 
        descripcion: 'Para levante o ceba liviana (La Gerencia). Meta de despacho: 380 kg.' 
    },
    { 
        id: 'ceba_liviana', 
        nombre: 'Ceba Liviana / Exportación (340 - 440 kg)', 
        corte1: 340, 
        corte2: 390, 
        corte3: 440, 
        descripcion: 'Para exportación en pie o ceba de ciclo corto. Meta de despacho: 440 kg.' 
    },
    { 
        id: 'destete_cria', 
        nombre: 'Destete / Cría (140 - 220 kg)', 
        corte1: 140, 
        corte2: 180, 
        corte3: 220, 
        descripcion: 'Para terneros de destete temprano y cría. Meta de despacho: 220 kg.' 
    },
    { 
        id: 'personalizado', 
        nombre: 'Personalizado (Manual)', 
        corte1: 0, 
        corte2: 0, 
        corte3: 0, 
        descripcion: 'Ajusta manualmente los 3 umbrales según tus requerimientos específicos.' 
    }
];

const parseFechaCol = (fechaStr: string) => {
    if (!fechaStr) return null;
    let s = fechaStr.toString().trim();
    // Quitar parte de hora si existe
    if (s.includes(' ')) {
        s = s.split(' ')[0];
    }
    if (s.includes('T')) {
        s = s.split('T')[0];
    }
    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
            let d = parts[0].trim(), m = parts[1].trim(), y = parts[2].trim();
            // Si viene en formato YYYY/MM/DD
            if (d.length === 4) {
                return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}`;
            }
            if (y.length === 2) y = '20' + y;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    } else if (s.includes('-')) {
        const parts = s.split('-');
        if (parts.length === 3) {
            let p1 = parts[0].trim(), p2 = parts[1].trim(), p3 = parts[2].trim();
            // Si viene en formato YYYY-MM-DD
            if (p1.length === 4) {
                return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
            }
            // Si viene en formato DD-MM-YYYY o similar
            if (p3.length === 2) p3 = '20' + p3;
            if (p3.length === 4) {
                return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
            }
        }
    }
    return s;
};


// MEJORA: Limpiador automático de números (borra espacios, letras, $, etc)
const cleanNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    // Mantiene solo números y el punto decimal
    const str = val.toString().replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
};

export default function Settings() {
    const navigate = useNavigate();
    const { fincaId, role, userFincas, isSuperAdmin, modoGanancia, setModoGanancia, licenciaInfo, refreshLicencia } = useAuth();
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const accentPurple = isLight ? '#7c3aed' : '#c084fc';
    const [umbral, setUmbral] = useState('0.434');
    const [participacionUtilidad, setParticipacionUtilidad] = useState('60');
    // Umbrales: siempre en la unidad seleccionada para display; se convierten a kg/mes al guardar
    const [umbralMedioDisplay, setUmbralMedioDisplay] = useState('10');
    const [umbralAltoDisplay, setUmbralAltoDisplay] = useState('20');
    const [modoLocal, setModoLocal] = useState<ModoGanancia>(modoGanancia);
    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');
    const [showExitoModal, setShowExitoModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);
    const [showConfirmPwd, setShowConfirmPwd] = useState(false);
    const [inlineFeedbackSection, setInlineFeedbackSection] = useState<string | null>(null);
    const [toastPaused, setToastPaused] = useState(false);

    interface ConfirmDialogState {
        title: string;
        message: string;
        confirmLabel: string;
        cancelLabel?: string;
        variant?: 'danger' | 'primary';
        resolve: (accepted: boolean) => void;
    }
    const [confirmModal, setConfirmModal] = useState<ConfirmDialogState | null>(null);

    const exitoDialogRef = useRef<HTMLDialogElement>(null);
    const errorDialogRef = useRef<HTMLDialogElement>(null);
    const confirmDialogRef = useRef<HTMLDialogElement>(null);
    const toastRef = useRef<HTMLDivElement>(null);
    const sectionPanelRef = useRef<HTMLDivElement>(null);

    const canManageFarm = role === 'administrador' || isSuperAdmin;

    const askConfirmation = (opts: Omit<ConfirmDialogState, 'resolve'>): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmModal({ ...opts, resolve });
        });
    };

    const resolveConfirmation = (accepted: boolean) => {
        const current = confirmModal;
        setConfirmModal(null);
        current?.resolve(accepted);
    };

    useEffect(() => {
        const dlg = exitoDialogRef.current;
        if (!dlg) return;
        if (showExitoModal) {
            if (!dlg.open) dlg.showModal();
        } else if (dlg.open) {
            dlg.close();
        }
    }, [showExitoModal]);

    useEffect(() => {
        const dlg = errorDialogRef.current;
        if (!dlg) return;
        if (showErrorModal) {
            if (!dlg.open) dlg.showModal();
        } else if (dlg.open) {
            dlg.close();
        }
    }, [showErrorModal]);

    useEffect(() => {
        const dlg = confirmDialogRef.current;
        if (!dlg) return;
        if (confirmModal) {
            if (!dlg.open) dlg.showModal();
        } else if (dlg.open) {
            dlg.close();
        }
    }, [confirmModal]);

    const activeToastText = (!showExitoModal && !showErrorModal && !confirmModal) ? (msjError || msjExito) : '';
    const activeToastType: 'success' | 'error' | null = activeToastText ? (msjError ? 'error' : 'success') : null;

    useEffect(() => {
        const el = toastRef.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
        if (!el || typeof el.showPopover !== 'function') return;
        if (activeToastText) {
            try {
                if (!el.matches(':popover-open')) el.showPopover();
            } catch {
                // fallback CSS handled automatically
            }
        } else {
            try {
                if (el.matches(':popover-open')) el.hidePopover();
            } catch {
                // ignore
            }
        }
    }, [activeToastText]);

    useEffect(() => {
        if (!activeToastText || toastPaused) return;
        const timer = window.setTimeout(() => {
            setMsjExito('');
            setMsjError('');
        }, 6000);
        return () => window.clearTimeout(timer);
    }, [activeToastText, toastPaused]);
    const [reporteCarga, setReporteCarga] = useState<{
        tipo: 'animales' | 'pesajes';
        creados: number;
        actualizados: number;
        omitidos: number;
        omitidosList: string[];
    } | null>(null);
    const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null);
    const [cargasMasivasHoy, setCargasMasivasHoy] = useState<CargaMasivaItem[]>([]);

    // Estados para Cambio de Contraseña
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [newUserNombre, setNewUserNombre] = useState('');
    const [newUserApellido, setNewUserApellido] = useState('');
    const [newUserRole, setNewUserRole] = useState<'vaquero' | 'observador'>('vaquero');
    const [selectedFincas, setSelectedFincas] = useState<string[]>([]);
    const [userFormMsg, setUserFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Estados para secciones colapsables
    const [collapsed, setCollapsed] = useState({
        seguridad: true,
        datosTecnicos: true, 
        usuarios: true,
        contactosNegocio: true,
        cargasMasivas: true
    });

    const toggleSection = (section: keyof typeof collapsed) => {
        const nextState = !collapsed[section];
        setCollapsed({
            seguridad: true,
            datosTecnicos: true,
            usuarios: true,
            contactosNegocio: true,
            cargasMasivas: true,
            [section]: nextState
        });
        if (section === 'cargasMasivas' && nextState) {
            fetchCargasMasivasHoy();
        }
        if (nextState && typeof window !== 'undefined' && window.innerWidth <= 768) {
            window.requestAnimationFrame(() => {
                sectionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    };

    const renderInlineStatus = (sectionKey: string) => {
        if (inlineFeedbackSection !== sectionKey || showExitoModal || showErrorModal) return null;
        if (!msjError && !msjExito) return null;
        const isErr = Boolean(msjError);
        return (
            <div
                role={isErr ? 'alert' : 'status'}
                className={`settings-inline-status ${isErr ? 'settings-inline-status--error' : 'settings-inline-status--success'}`}
            >
                <span>{isErr ? msjError : msjExito}</span>
                <button
                    type="button"
                    className="settings-toast-close"
                    onClick={() => { setMsjError(''); setMsjExito(''); }}
                    aria-label="Cerrar aviso"
                >
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
        );
    };

    // Estados para creación de usuario

    // Estados para Propietarios
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoPropietario, setNuevoPropietario] = useState('');

    // Estados para Proveedores
    const [proveedores, setProveedores] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoProveedor, setNuevoProveedor] = useState('');

    // Estados para Compradores
    const [compradores, setCompradores] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoComprador, setNuevoComprador] = useState('');

    // Estados para Pluviómetros de la Finca
    const [pluviometros, setPluviometros] = useState<PluviometroFinca[]>([]);
    const [nuevoPluvNombre, setNuevoPluvNombre] = useState('');
    const [nuevoPluvModo, setNuevoPluvModo] = useState<TipoMedicionPluviometro>('diaria');
    const [savingPluv, setSavingPluv] = useState(false);

    // Estados para Potreradas (Movidos a Potreradas.tsx)

    // Estados para Rotaciones y Potreros (Eliminados, movidos a Rotations.tsx)

    // Estados para Información de la Finca
    const [farmInfo, setFarmInfo] = useState({
        area_total: '',
        area_aprovechable: '',
        ubicacion: '',
        municipio: '',
        proposito: '',
        precio_venta_promedio: '',
        precio_compra_promedio: '',
        costo_mensual_animal: '',
        peso_entrada_ceba: '380',
        consumo_dia_potrero: '50',
        corte_peso_1: '430',
        corte_peso_2: '480',
        corte_peso_3: '530',
        preset_peso: 'ceba_tradicional'
    });



    const formatNumber = (val: string) => {
        if (!val) return '';
        const clean = val.toString().replace(/\D/g, '');
        return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const unformatNumber = (val: string) => {
        return val.replace(/\D/g, '');
    };

    // Filtrar fincas donde el usuario es administrador
    const fincasAdmin = userFincas.filter((f: any) => f.rol === 'administrador' || isSuperAdmin);

    const fetchConfig = async () => {
        if (!fincaId) return;
        const { data } = await supabase
            .from('configuracion_kpi')
            .select('umbral_bajo_gdp, umbral_medio_gmp, umbral_alto_gmp, modo_ganancia')
            .eq('id_finca', fincaId)
            .single();

        if (data) {
            const modo: ModoGanancia = (data.modo_ganancia as ModoGanancia) || 'GMP';
            setModoLocal(modo);
            const bajoKgMes = data.umbral_bajo_gdp ?? 0.434;
            setUmbral(toDisplayValue(bajoKgMes, modo).toFixed(modo === 'GDP' ? 0 : 3));
            const medioKgMes = data.umbral_medio_gmp ?? 10;
            const altoKgMes = data.umbral_alto_gmp ?? 20;
            setUmbralMedioDisplay(toDisplayValue(medioKgMes, modo).toFixed(modo === 'GDP' ? 0 : 1));
            setUmbralAltoDisplay(toDisplayValue(altoKgMes, modo).toFixed(modo === 'GDP' ? 0 : 1));
        }
    };

    const fetchPropietarios = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('propietarios')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setPropietarios(data);
    };

    const fetchProveedores = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('proveedores')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setProveedores(data);
    };

    const fetchCompradores = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('compradores')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setCompradores(data);
    };

    const fetchPluviometros = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('pluviometros_finca')
            .select('*')
            .eq('id_finca', fincaId)
            .order('orden', { ascending: true })
            .order('creado_en', { ascending: true });

        if (!error && data) setPluviometros(data as PluviometroFinca[]);
    };

    const fetchCargasMasivasHoy = async () => {
        if (!fincaId) return;
        const hoy = getLocalIsoDate();
        const { data, error } = await supabase
            .from('cargas_masivas')
            .select('id, tipo, nombre_archivo, total_registros, fecha_carga, creado_en, estado')
            .eq('id_finca', fincaId)
            .eq('fecha_carga', hoy)
            .eq('estado', 'activa')
            .order('creado_en', { ascending: false });

        if (!error && data) {
            setCargasMasivasHoy(data as CargaMasivaItem[]);
        }
    };

    const handleRevertirCargaMasiva = async (carga: CargaMasivaItem) => {
        const tipoLabel = carga.tipo === 'animales' ? 'animales' : 'pesajes';
        const confirmed = await askConfirmation({
            title: '¿Revertir carga masiva?',
            message: `Se revertirá la carga de ${tipoLabel} "${carga.nombre_archivo || 'archivo CSV'}" (${carga.total_registros} registros) y se eliminarán los datos cargados en esta importación.`,
            confirmLabel: 'Sí, revertir carga',
            cancelLabel: 'Cancelar',
            variant: 'danger'
        });
        if (!confirmed) return;

        setLoading(true);
        setMsjError('');
        setMsjExito('');

        try {
            if (carga.tipo === 'animales') {
                // 1. Validar que ninguno de los animales importados tenga ventas
                const { data: animalesCarga, error: errCheck } = await supabase
                    .from('animales')
                    .select('id, numero_chapeta, fecha_venta')
                    .eq('id_carga_masiva', carga.id);

                if (errCheck) throw errCheck;

                const conVenta = animalesCarga?.filter((a: any) => a.fecha_venta) || [];
                if (conVenta.length > 0) {
                    throw new Error(`No se puede deshacer la carga: ${conVenta.length} animal(es) ya tienen ventas registradas (ej. #${conVenta[0].numero_chapeta}).`);
                }

                const animalIds = animalesCarga?.map((a: any) => a.id) || [];
                if (animalIds.length > 0) {
                    // Eliminar pesajes asociados a estos animales
                    await supabase
                        .from('registros_pesaje')
                        .delete()
                        .in('id_animal', animalIds);

                    // Eliminar animales cargados en esta sesión
                    await supabase
                        .from('animales')
                        .delete()
                        .eq('id_carga_masiva', carga.id);
                }

                // Marcar carga como revertida
                await supabase
                    .from('cargas_masivas')
                    .update({ estado: 'revertida' })
                    .eq('id', carga.id);

                await refreshLicencia();
                setMsjExito(`Carga de animales "${carga.nombre_archivo}" revertida con éxito.`);
                setShowExitoModal(true);
            } else if (carga.tipo === 'pesajes') {
                // 1. Obtener los pesajes para identificar qué animales se ven afectados
                const { data: pesajesABorrar, error: errGetP } = await supabase
                    .from('registros_pesaje')
                    .select('id, id_animal')
                    .eq('id_carga_masiva', carga.id);

                if (errGetP) throw errGetP;

                const animalesAfectados = Array.from(new Set(pesajesABorrar?.map((p: any) => p.id_animal).filter(Boolean))) as string[];

                // 2. Eliminar los pesajes cargados
                const { error: errDel } = await supabase
                    .from('registros_pesaje')
                    .delete()
                    .eq('id_carga_masiva', carga.id);

                if (errDel) throw errDel;

                // 3. Marcar carga como revertida
                await supabase
                    .from('cargas_masivas')
                    .update({ estado: 'revertida' })
                    .eq('id', carga.id);

                // 4. Recalcular en cascada las ganancias de cada animal afectado (Ultra rápido en PostgreSQL)
                if (animalesAfectados.length > 0) {
                    const { error: rpcErr } = await supabase.rpc('recalcular_historial_pesajes_animales', { p_id_animales: animalesAfectados });
                    if (rpcErr) {
                        for (const aId of animalesAfectados) {
                            await recalcularHistorialPesajesAnimal(aId, supabase);
                        }
                    }
                }

                setMsjExito(`Carga de pesajes "${carga.nombre_archivo}" revertida y ganancias recalculadas con éxito.`);
                setShowExitoModal(true);
            }

            await fetchCargasMasivasHoy();
        } catch (err: any) {
            setMsjError('Error al revertir la carga: ' + (err.message || err));
            setShowErrorModal(true);
        } finally {
            setLoading(false);
        }
    };

    // fetchPotreradas movido a Potreradas.tsx


    const fetchFincaInfo = async () => {
        if (!fincaId) return;
        
        // Datos generales de la finca
        const { data: finca, error: fincaErr } = await supabase
            .from('fincas')
            .select('area_total, area_aprovechable, ubicacion, municipio, proposito')
            .eq('id', fincaId)
            .single();

        // Precio de venta y umbral ceba desde configuracion_kpi
        const { data: config } = await supabase
            .from('configuracion_kpi')
            .select('precio_venta_promedio, precio_compra_promedio, costo_mensual_animal, peso_entrada_ceba, consumo_dia_potrero, participacion_utilidad, corte_peso_1, corte_peso_2, corte_peso_3, preset_peso')
            .eq('id_finca', fincaId)
            .single();

        if (!fincaErr && finca) {
            setFarmInfo({
                area_total: finca.area_total?.toString() || '',
                area_aprovechable: finca.area_aprovechable?.toString() || '',
                ubicacion: finca.ubicacion || '',
                municipio: finca.municipio || '',
                proposito: finca.proposito || '',
                precio_venta_promedio: config?.precio_venta_promedio?.toString() || '0',
                precio_compra_promedio: config?.precio_compra_promedio?.toString() || '0',
                costo_mensual_animal: config?.costo_mensual_animal?.toString() || '0',
                peso_entrada_ceba: config?.peso_entrada_ceba?.toString() || '380',
                consumo_dia_potrero: config?.consumo_dia_potrero?.toString() || '50',
                corte_peso_1: config?.corte_peso_1?.toString() || '430',
                corte_peso_2: config?.corte_peso_2?.toString() || '480',
                corte_peso_3: config?.corte_peso_3?.toString() || '530',
                preset_peso: config?.preset_peso || 'ceba_tradicional'
            });
            // Cargar participación de utilidad (guardar como % entero para el display)
            const partDecimal = config?.participacion_utilidad ?? 0.6;
            setParticipacionUtilidad(Math.round(partDecimal * 100).toString());
        }
    };

    useEffect(() => {
        if (!fincaId) return;
        fetchConfig();
        fetchPropietarios();
        fetchProveedores();
        fetchCompradores();
        fetchPluviometros();
        fetchFincaInfo();
        fetchCargasMasivasHoy();

        if (fincaId && selectedFincas.length === 0) {
            setSelectedFincas([fincaId]);
        }
    }, [fincaId]);

    const toggleFincaSelection = (id: string) => {
        setSelectedFincas(prev =>
            prev.includes(id)
                ? prev.filter(f => f !== id)
                : [...prev, id]
        );
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setInlineFeedbackSection('seguridad');
        if (newPassword !== confirmPassword) {
            setMsjExito('');
            setMsjError('Las contraseñas no coinciden.');
            return;
        }
        if (newPassword.length < 6) {
            setMsjExito('');
            setMsjError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        setLoading(true);
        setMsjError('');
        setMsjExito('');
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setMsjError('Error al actualizar contraseña: ' + error.message);
        } else {
            setMsjExito('Contraseña actualizada correctamente.');
            setNewPassword('');
            setConfirmPassword('');
        }
        setLoading(false);
    };

    const guardarConfiguracionYFinca = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;

        setInlineFeedbackSection('datosTecnicos');
        setLoading(true);
        setMsjExito('');
        setMsjError('');

        try {
            // 1. Guardar configuracion_kpi (umbrales y precios)
            // Convert display values back to kg/mes for storage
            const valorBajoGMP = toStorageValue(parseFloat(umbral) || 0.434, modoLocal);
            const valorMedioGMP = toStorageValue(parseFloat(umbralMedioDisplay) || 10, modoLocal);
            const valorAltoGMP = toStorageValue(parseFloat(umbralAltoDisplay) || 20, modoLocal);
            const precioVenta = parseFloat(farmInfo.precio_venta_promedio) || 0;
            const precioCompra = parseFloat(farmInfo.precio_compra_promedio) || 0;
            const costoMensual = parseFloat(farmInfo.costo_mensual_animal) || 0;
            const pesoCeba = parseFloat(farmInfo.peso_entrada_ceba) || 380;
            const consumoDia = parseFloat(farmInfo.consumo_dia_potrero) || 50;
            // Convertir el porcentaje ingresado (ej. 60) a decimal (ej. 0.60)
            const partPct = Math.min(99, Math.max(1, parseInt(participacionUtilidad) || 60));
            const participacionDecimal = partPct / 100;
            const c1 = parseFloat(farmInfo.corte_peso_1) || 430;
            const c2 = parseFloat(farmInfo.corte_peso_2) || 480;
            const c3 = parseFloat(farmInfo.corte_peso_3) || 530;

            const { error: kpiError } = await supabase
                .from('configuracion_kpi')
                .upsert({ 
                    id_finca: fincaId, 
                    umbral_bajo_gdp: valorBajoGMP,
                    umbral_medio_gmp: valorMedioGMP,
                    umbral_alto_gmp: valorAltoGMP,
                    precio_venta_promedio: precioVenta,
                    precio_compra_promedio: precioCompra,
                    costo_mensual_animal: costoMensual,
                    peso_entrada_ceba: pesoCeba,
                    consumo_dia_potrero: consumoDia,
                    modo_ganancia: modoLocal,
                    participacion_utilidad: participacionDecimal,
                    corte_peso_1: c1,
                    corte_peso_2: c2,
                    corte_peso_3: c3,
                    preset_peso: farmInfo.preset_peso || 'ceba_tradicional'
                }, { onConflict: 'id_finca' });

            if (kpiError) throw kpiError;

            // Sync modoGanancia globally
            setModoGanancia(modoLocal);

            // 2. Guardar información de la finca
            // Build payload dynamically to avoid sending empty string to enum column
            const fincaPayload: Record<string, any> = {
                area_total: farmInfo.area_total ? parseFloat(farmInfo.area_total) : null,
                area_aprovechable: farmInfo.area_aprovechable ? parseFloat(farmInfo.area_aprovechable) : null,
                ubicacion: farmInfo.ubicacion || null,
                municipio: farmInfo.municipio || null,
            };
            if (farmInfo.proposito) {
                fincaPayload.proposito = farmInfo.proposito;
            }

            const { error: fincaError } = await supabase
                .from('fincas')
                .update(fincaPayload)
                .eq('id', fincaId);

            if (fincaError) throw new Error('Error finca: ' + fincaError.message);

            setMsjExito('Información y parámetros actualizados exitosamente.');
        } catch (err: any) {
            setMsjError('Error al guardar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setUserFormMsg(null);

        if (selectedFincas.length === 0) {
            setUserFormMsg({ type: 'error', text: 'Debe seleccionar al menos una finca para asignar al usuario.' });
            return;
        }
        if (!newUserEmail || !newUserPass) {
            setUserFormMsg({ type: 'error', text: 'El correo y la contraseña son obligatorios.' });
            return;
        }

        setLoading(true);

        try {
            const { error } = await supabase.rpc('crear_trabajador_finca', {
                p_email: newUserEmail,
                p_password: newUserPass,
                p_finca_ids: selectedFincas,
                p_rol: newUserRole,
                p_nombre: newUserNombre || null,
                p_apellido: newUserApellido || null
            });

            if (error) throw error;

            // Obtener nombres de las fincas asignadas para el correo de bienvenida
            const nombresFincas = fincasAdmin
                .filter((f: any) => selectedFincas.includes(f.id_finca))
                .map((f: any) => f.nombre_finca);

            // Enviar correo de bienvenida con credenciales e instructivo de instalación (PWA)
            let emailEnviado = false;
            try {
                const { error: fnErr } = await supabase.functions.invoke('notify-worker-invite', {
                    body: {
                        email: newUserEmail.trim(),
                        nombre: newUserNombre.trim(),
                        apellido: newUserApellido.trim(),
                        password: newUserPass,
                        rol: newUserRole,
                        fincas: nombresFincas
                    }
                });
                if (!fnErr) {
                    emailEnviado = true;
                } else {
                    console.warn('[handleCreateUser] Error al enviar email de bienvenida:', fnErr);
                }
            } catch (fnEx) {
                console.warn('[handleCreateUser] Excepción al invocar función de email:', fnEx);
            }

            const successText = emailEnviado
                ? `✓ Usuario ${newUserEmail} creado y asignado exitosamente. Se ha enviado un correo con sus credenciales y guía de instalación móvil.`
                : `✓ Usuario ${newUserEmail} creado y asignado a ${selectedFincas.length} finca(s) exitosamente.`;

            setUserFormMsg({ type: 'success', text: successText });
            setNewUserEmail('');
            setNewUserPass('');
            setNewUserNombre('');
            setNewUserApellido('');
            setSelectedFincas([fincaId || '']);
        } catch (err: any) {
            const msg = err?.message || 'Error desconocido al crear el usuario.';
            setUserFormMsg({ type: 'error', text: '✗ ' + msg });
        } finally {
            setLoading(false);
        }
    };

    const handleAddPropietario = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoPropietario.trim()) return;

        setInlineFeedbackSection('contactosNegocio');
        setMsjExito('');
        setMsjError('');
        setLoading(true);
        try {
            const { error } = await supabase
                .from('propietarios')
                .insert({ id_finca: fincaId, nombre: nuevoPropietario.trim() });

            if (error) throw error;

            setNuevoPropietario('');
            fetchPropietarios();
            setMsjExito('Propietario agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar propietario: ' + (err.code === '23505' ? 'Ya existe un propietario con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removePropietario = async (id: string, nombre?: string) => {
        const confirmed = await askConfirmation({
            title: '¿Eliminar propietario?',
            message: nombre
                ? `Se eliminará "${nombre}" de la lista de propietarios de la finca.`
                : '¿Está seguro de eliminar este propietario?',
            confirmLabel: 'Eliminar',
            cancelLabel: 'Cancelar',
            variant: 'danger'
        });
        if (!confirmed) return;
        setInlineFeedbackSection('contactosNegocio');
        setMsjExito('');
        setMsjError('');
        setLoading(true);
        try {
            const { error } = await supabase.from('propietarios').delete().eq('id', id);
            if (error) throw error;
            fetchPropietarios();
            setMsjExito('Propietario eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddProveedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoProveedor.trim()) return;

        setInlineFeedbackSection('contactosNegocio');
        setMsjExito('');
        setMsjError('');
        setLoading(true);
        try {
            const { error } = await supabase
                .from('proveedores')
                .insert({ id_finca: fincaId, nombre: nuevoProveedor.trim() });

            if (error) throw error;

            setNuevoProveedor('');
            fetchProveedores();
            setMsjExito('Proveedor agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar proveedor: ' + (err.code === '23505' ? 'Ya existe un proveedor con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeProveedor = async (id: string, nombre?: string) => {
        const confirmed = await askConfirmation({
            title: '¿Eliminar proveedor?',
            message: nombre
                ? `Se eliminará "${nombre}" de la lista de proveedores.`
                : '¿Está seguro de eliminar este proveedor?',
            confirmLabel: 'Eliminar',
            cancelLabel: 'Cancelar',
            variant: 'danger'
        });
        if (!confirmed) return;
        setInlineFeedbackSection('contactosNegocio');
        setMsjExito('');
        setMsjError('');
        setLoading(true);
        try {
            const { error } = await supabase.from('proveedores').delete().eq('id', id);
            if (error) throw error;
            fetchProveedores();
            setMsjExito('Proveedor eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddComprador = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoComprador.trim()) return;

        setInlineFeedbackSection('contactosNegocio');
        setMsjExito('');
        setMsjError('');
        setLoading(true);
        try {
            const { error } = await supabase
                .from('compradores')
                .insert({ id_finca: fincaId, nombre: nuevoComprador.trim() });

            if (error) throw error;

            setNuevoComprador('');
            fetchCompradores();
            setMsjExito('Comprador agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar comprador: ' + (err.code === '23505' ? 'Ya existe un comprador con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeComprador = async (id: string, nombre?: string) => {
        const confirmed = await askConfirmation({
            title: '¿Eliminar comprador?',
            message: nombre
                ? `Se eliminará "${nombre}" de la lista de compradores.`
                : '¿Está seguro de eliminar este comprador?',
            confirmLabel: 'Eliminar',
            cancelLabel: 'Cancelar',
            variant: 'danger'
        });
        if (!confirmed) return;
        setInlineFeedbackSection('contactosNegocio');
        setMsjExito('');
        setMsjError('');
        setLoading(true);
        try {
            const { error } = await supabase.from('compradores').delete().eq('id', id);
            if (error) throw error;
            fetchCompradores();
            setMsjExito('Comprador eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPluviometro = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoPluvNombre.trim()) return;
        setInlineFeedbackSection('pluviometros');
        setSavingPluv(true);
        setMsjError('');
        setMsjExito('');
        try {
            const nextOrden = pluviometros.length > 0
                ? Math.max(...pluviometros.map(p => p.orden || 0)) + 1
                : 0;
            const { error } = await supabase
                .from('pluviometros_finca')
                .insert({
                    id_finca: fincaId,
                    nombre: nuevoPluvNombre.trim(),
                    tipo_medicion: nuevoPluvModo,
                    activo: true,
                    orden: nextOrden,
                });
            if (error) throw error;
            setNuevoPluvNombre('');
            setNuevoPluvModo('diaria');
            await fetchPluviometros();
            setMsjExito('Pluviómetro agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar pluviómetro: ' + (err.code === '23505' ? 'Ya existe un pluviómetro con ese nombre en la finca.' : err.message));
        } finally {
            setSavingPluv(false);
        }
    };

    const handleUpdatePluviometro = async (id: string, changes: Partial<Pick<PluviometroFinca, 'nombre' | 'tipo_medicion' | 'activo'>>) => {
        setInlineFeedbackSection('pluviometros');
        setSavingPluv(true);
        setMsjError('');
        setMsjExito('');
        try {
            const { error } = await supabase
                .from('pluviometros_finca')
                .update(changes)
                .eq('id', id);
            if (error) throw error;
            await fetchPluviometros();
            setMsjExito('Pluviómetro actualizado. Los registros históricos permanecen intactos.');
        } catch (err: any) {
            setMsjError('Error al actualizar pluviómetro: ' + (err.code === '23505' ? 'Ya existe otro pluviómetro con ese nombre.' : err.message));
        } finally {
            setSavingPluv(false);
        }
    };

    const handleRemovePluviometro = async (pluv: PluviometroFinca) => {
        setInlineFeedbackSection('pluviometros');
        setSavingPluv(true);
        setMsjError('');
        setMsjExito('');
        try {
            const { count } = await supabase
                .from('registros_lluvia')
                .select('id', { count: 'exact', head: true })
                .eq('id_pluviometro', pluv.id);

            setSavingPluv(false);

            if ((count || 0) > 0) {
                const desactivar = await askConfirmation({
                    title: '¿Desactivar pluviómetro?',
                    message: `"${pluv.nombre}" tiene ${count} registros históricos de lluvia. Desactivarlo evita perder ese historial y dejará de aparecer en nuevos registros.`,
                    confirmLabel: 'Sí, desactivar',
                    cancelLabel: 'Cancelar',
                    variant: 'primary'
                });
                if (desactivar) {
                    await handleUpdatePluviometro(pluv.id, { activo: false });
                }
                return;
            }

            const confirmed = await askConfirmation({
                title: '¿Eliminar pluviómetro?',
                message: `Se eliminará "${pluv.nombre}" de la finca.`,
                confirmLabel: 'Eliminar',
                cancelLabel: 'Cancelar',
                variant: 'danger'
            });
            if (!confirmed) return;
            setSavingPluv(true);
            const { error } = await supabase.from('pluviometros_finca').delete().eq('id', pluv.id);
            if (error) throw error;
            await fetchPluviometros();
            setMsjExito('Pluviómetro eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar pluviómetro: ' + err.message);
        } finally {
            setSavingPluv(false);
        }
    };

    // handleAddPotrerada y removePotrerada movidos a Potreradas.tsx


    const handleBulkAnimalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['numero_chapeta', 'propietario', 'peso_ingreso', 'fecha_ingreso'];
                    const isWeighingFile = headers.includes('peso') && !headers.includes('peso_ingreso');
                    const isRotationFile = headers.includes('nombre_rotacion') || headers.includes('nombre_potrero');

                    if (isWeighingFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de SEGUIMIENTO DE PESAJES en la sección de INVENTARIO. Por favor, use la sección correcta.');
                    }
                    if (isRotationFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de ROTACIONES en la sección de INVENTARIO.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Inventario. Faltan columnas: ${missing.join(', ')}`);
                    }
                    // 1. Obtener mapeos de potreradas y potreros existentes
                    const { data: pds } = await supabase.from('potreradas').select('id, nombre').eq('id_finca', fincaId);
                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);

                    const mapPotreradas = new Map(pds?.map((p: any) => [p.nombre.toLowerCase().trim(), p.id]));
                    const mapPotreros = new Map(pts?.map((p: any) => [p.nombre.toLowerCase().trim(), p.id]));

                    // VALIDACIÓN PREVENTIVA: Revisar si los potreros del CSV existen
                    const potrerosNoReconocidos = new Set<string>();
                    results.data.forEach((row: any) => {
                        const pNombre = row.potrero?.toString().trim();
                        if (pNombre && !mapPotreros.has(pNombre.toLowerCase())) {
                            potrerosNoReconocidos.add(pNombre);
                        }
                    });

                    if (potrerosNoReconocidos.size > 0) {
                        const lista = Array.from(potrerosNoReconocidos).join(', ');
                        throw new Error(`¡ERROR DE UBICACIÓN! Los siguientes potreros en tu Excel NO existen en la App: [${lista}]. Por favor, créalos en la sección de Potreros o corrige sus nombres en el Excel para que coincidan exactamente (ej. 'Iracales' vs 'Iracales 1').`);
                    }

                    // 2. Detectar potreradas nuevas que vengan en el CSV y crearlas
                    //    Usamos la etapa del animal para la potrerada
                    const potreradasNuevas = new Map<string, string>(); // nombre_lower -> etapa
                    results.data.forEach((row: any) => {
                        const nombre = row.potrerada?.toString().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';
                        if (nombre && !mapPotreradas.has(nombre.toLowerCase())) {
                            potreradasNuevas.set(nombre.toLowerCase(), etapa);
                        }
                    });

                    if (potreradasNuevas.size > 0) {
                        // Obtener nombre original (con capitalización) del CSV para insertar
                        const inserts = results.data.reduce((acc: any[], row: any) => {
                            const nombre = row.potrerada?.toString().trim();
                            const nombreLower = nombre?.toLowerCase();
                            if (nombre && potreradasNuevas.has(nombreLower) && !acc.find(a => a.nombre.toLowerCase() === nombreLower)) {
                                acc.push({
                                    id_finca: fincaId,
                                    nombre: nombre,
                                    etapa: row.etapa?.toLowerCase() || 'levante'
                                });
                            }
                            return acc;
                        }, []);

                        const { data: creadas, error: errCreate } = await supabase
                            .from('potreradas')
                            .insert(inserts)
                            .select('id, nombre');

                        if (errCreate) throw new Error(`Error al crear potreradas: ${errCreate.message}`);

                        // Agregar al mapa las recién creadas
                        creadas?.forEach((p: any) => mapPotreradas.set(p.nombre.toLowerCase().trim(), p.id));
                    }

                    // 3. Construir filas de animales con IDs resueltos
                    const rows = results.data.map((row: any) => {
                        const potreradaNombre = row.potrerada?.toString().toLowerCase().trim();
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';
                        
                        // Mapeo flexible de fechas
                        const rawFecha = row.fecha_ingreso || row['fecha_ingreso(Año-Mes-Día)'] || row.fecha_ingreso_ceba || row.fecha || row.Fecha;
                        const fechaFinal = parseFechaCol(rawFecha) || getLocalIsoDate();
                        const pesoIngreso = cleanNumber(row.peso_ingreso);

                        const sexoFinal = row.sexo?.toUpperCase() || 'M';
                        const tipoMachoCSV = row.tipo_macho?.toString().toLowerCase().trim();
                        const tipoMachoFinal = sexoFinal === 'M'
                            ? (tipoMachoCSV === 'novillo' ? 'novillo' : 'toro')
                            : null;

                        return {
                            id_finca: fincaId,
                            numero_chapeta: row.numero_chapeta?.toString().trim(),
                            nombre_propietario: row.propietario || 'Sin Datos',
                            especie: row.especie?.toLowerCase() || 'bovino',
                            sexo: sexoFinal,
                            etapa: etapa,
                            fecha_ingreso: fechaFinal,
                            peso_ingreso: pesoIngreso,
                            id_potrerada: potreradaNombre ? (mapPotreradas.get(potreradaNombre) ?? null) : null,
                            id_potrero_actual: potreroNombre ? (mapPotreros.get(potreroNombre) ?? null) : null,
                            estado: 'activo',
                            // Nuevos campos para trazabilidad de ceba
                            fecha_ingreso_ceba: etapa === 'ceba' ? fechaFinal : null,
                            peso_ingreso_ceba: etapa === 'ceba' ? pesoIngreso : null,
                            ok_ceba: false,
                            // Tipo de macho (toro o novillo)
                            tipo_macho: tipoMachoFinal,
                            // Campos opcionales de compra
                            proveedor_compra: row.proveedor || row.proveedor_compra || null,
                            observaciones_compra: row.observaciones || row.observaciones_compra || null
                        };
                    });

                    const chapetas = rows.map((r: any) => r.numero_chapeta);
                    if (chapetas.some((c: any) => !c)) throw new Error("Todas las filas deben tener un número de chapeta.");
                    
                    const omitidosList: string[] = [];
                    const rowsUnicos: any[] = [];
                    const chapetasVistas = new Set<string>();

                    for (const r of rows) {
                        if (chapetasVistas.has(r.numero_chapeta)) {
                            omitidosList.push(`${r.numero_chapeta} (Duplicado en CSV)`);
                        } else {
                            chapetasVistas.add(r.numero_chapeta);
                            rowsUnicos.push(r);
                        }
                    }

                    // 4. Identificar animales existentes en la base de datos (MEJORA: EN BATCH de 200)
                    const chapetasUnicas = Array.from(chapetasVistas);
                    const existentes: any[] = [];
                    
                    for (let i = 0; i < chapetasUnicas.length; i += 200) {
                        const batch = chapetasUnicas.slice(i, i + 200);
                        const { data: batchData, error: checkError } = await supabase
                            .from('animales')
                            .select('id, numero_chapeta')
                            .eq('id_finca', fincaId)
                            .in('numero_chapeta', batch);
                        
                        if (checkError) throw checkError;
                        if (batchData) existentes.push(...batchData);
                        setImportProgress({ current: i + batch.length, total: chapetasUnicas.length });
                    }

                    const existentesMap = new Map(existentes.map(e => [e.numero_chapeta, e.id]));
                    
                    // Lógica solicitada: OMITIR los que ya existen
                    const rowsNuevos = rowsUnicos.filter((r: any) => {
                        if (existentesMap.has(r.numero_chapeta)) {
                            omitidosList.push(`${r.numero_chapeta} (Ya existe)`);
                            return false;
                        }
                        return true;
                    });

                    // 5. Insertar animales nuevos
                    let insertados = 0;
                    if (rowsNuevos.length > 0) {
                        // Crear registro de carga masiva
                        let idCargaMasiva: string | null = null;
                        try {
                            const userResp = await supabase.auth.getUser();
                            const { data: cargaReg, error: errCarga } = await supabase
                                .from('cargas_masivas')
                                .insert({
                                    id_finca: fincaId,
                                    usuario_id: userResp.data.user?.id,
                                    tipo: 'animales',
                                    nombre_archivo: file.name,
                                    total_registros: rowsNuevos.length,
                                    fecha_carga: getLocalIsoDate(),
                                    estado: 'activa'
                                })
                                .select('id')
                                .single();
                            if (!errCarga && cargaReg) {
                                idCargaMasiva = cargaReg.id;
                            }
                        } catch (eCarga) {
                            console.warn("No se pudo registrar en cargas_masivas:", eCarga);
                        }

                        if (idCargaMasiva) {
                            rowsNuevos.forEach((r: any) => {
                                r.id_carga_masiva = idCargaMasiva;
                            });
                        }

                        const { data: nuevosAnimales, error: errIns } = await supabase
                            .from('animales')
                            .insert(rowsNuevos)
                            .select();
                        if (errIns) throw errIns;
                        insertados = nuevosAnimales?.length ?? 0;

                        // Insertar pesaje inicial en registros_pesaje para cada animal creado
                        if (nuevosAnimales && nuevosAnimales.length > 0) {
                            const pesajesIniciales = nuevosAnimales.map((animal: any) => ({
                                id_animal: animal.id,
                                peso: animal.peso_ingreso,
                                fecha: animal.fecha_ingreso,
                                etapa: animal.etapa,
                                id_potrero: animal.id_potrero_actual,
                                gdp_calculada: 0,
                                id_carga_masiva: idCargaMasiva
                            }));

                            const { error: errPesajesInit } = await supabase
                                .from('registros_pesaje')
                                .insert(pesajesIniciales);

                            if (errPesajesInit) {
                                console.error("Error al crear pesajes iniciales para animales nuevos:", errPesajesInit);
                            }
                        }

                        await fetchCargasMasivasHoy();
                    }

                    // 6. Preparar reporte detallado
                    setReporteCarga({
                        tipo: 'animales',
                        creados: insertados,
                        actualizados: 0,
                        omitidos: omitidosList.length,
                        omitidosList: omitidosList
                    });

                    const msgPotreradas = potreradasNuevas.size > 0
                        ? ` Además, se crearon ${potreradasNuevas.size} potrerada(s) nueva(s).`
                        : '';
                    
                    setMsjExito(`¡Proceso completado!${msgPotreradas}`);
                    setShowExitoModal(true);
                } catch (err: any) {
                    setMsjError('Error en carga de animales: ' + err.message);
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    setImportProgress(null);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkPesajeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['numero_chapeta', 'peso', 'fecha'];
                    const isInventoryFile = headers.includes('peso_ingreso') || headers.includes('propietario');
                    const isRotationFile = headers.includes('nombre_rotacion') || headers.includes('nombre_potrero');

                    if (isInventoryFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de INVENTARIO en la sección de PESAJES. Por favor, use la sección correcta.');
                    }
                    if (isRotationFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de ROTACIONES en la sección de PESAJES.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Seguimiento de Pesajes. Faltan columnas: ${missing.join(', ')}`);
                    }

                    // 1. Obtener animales existentes, pero solo los que vengan en el CSV para no superar el límite de 1000 de Supabase.
                    const chapetasCrudas = results.data
                        .map((r: any) => r.numero_chapeta?.toString().trim())
                        .filter(Boolean);
                    const chapetasEnCSVUnicas = Array.from(new Set(chapetasCrudas));

                    const animalesData: any[] = [];
                    for (let i = 0; i < chapetasEnCSVUnicas.length; i += 200) {
                        const batch = chapetasEnCSVUnicas.slice(i, i + 200);
                        const { data, error: animError } = await supabase
                            .from('animales')
                            .select('id, numero_chapeta, etapa, fecha_ingreso, peso_ingreso, fecha_ingreso_ceba, peso_ingreso_ceba')
                            .eq('id_finca', fincaId)
                            .in('numero_chapeta', batch);

                        if (animError) throw new Error("No se pudieron cargar los datos de los animales");
                        if (data) animalesData.push(...data);
                    }

                    let mapAnimales = new Map(animalesData.map(a => [
                        a.numero_chapeta.toString().trim().toLowerCase(),
                        { 
                            id: a.id, 
                            etapa: a.etapa, 
                            fecha_ingreso: a.fecha_ingreso, 
                            peso_ingreso: a.peso_ingreso,
                            fecha_ingreso_ceba: a.fecha_ingreso_ceba,
                        }
                    ]));

                    // 2. Identificar cuáles animales del CSV NO existen en la base de datos
                    const omitidosNoExistentes: string[] = [];
                    const chapetasEnCSV = new Set<string>();
                    
                    results.data.forEach((row: any) => {
                        const chapeta = row.numero_chapeta?.toString().trim();
                        if (chapeta) {
                            chapetasEnCSV.add(chapeta);
                            if (!mapAnimales.has(chapeta.toLowerCase())) {
                                if (!omitidosNoExistentes.includes(chapeta)) {
                                    omitidosNoExistentes.push(chapeta);
                                }
                            }
                        }
                    });

                    // 3. Obtener pesajes existentes para evitar duplicados (POR LOTES de 200 para evitar Bad Request por URL larga)
                    const idsAnimalesEnCSV = Array.from(mapAnimales.values()).map(a => a.id);
                    const pesajesExistentes: any[] = [];
                    const batchSize = 200;

                    for (let i = 0; i < idsAnimalesEnCSV.length; i += batchSize) {
                        const batch = idsAnimalesEnCSV.slice(i, i + batchSize);
                        const { data: batchData, error: errPesajes } = await supabase
                            .from('registros_pesaje')
                            .select('id_animal, fecha, peso')
                            .in('id_animal', batch);
                        
                        if (errPesajes) throw new Error(`Error verificando duplicados de pesaje: ${errPesajes.message}`);
                        if (batchData) pesajesExistentes.push(...batchData);
                    }

                    const setDuplicados = new Set(pesajesExistentes?.map((p: any) => `${p.id_animal}|${p.fecha}|${p.peso}`));

                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);
                    const mapPotreros = new Map(pts?.map((p: any) => [p.nombre.toLowerCase().trim(), p.id]));

                    // VALIDACIÓN PREVENTIVA: Revisar si los potreros del CSV de pesajes existen
                    const potrerosNoReconocidos = new Set<string>();
                    results.data.forEach((row: any) => {
                        const pNombre = row.potrero?.toString().trim();
                        if (pNombre && !mapPotreros.has(pNombre.toLowerCase())) {
                            potrerosNoReconocidos.add(pNombre);
                        }
                    });

                    if (potrerosNoReconocidos.size > 0) {
                        const lista = Array.from(potrerosNoReconocidos).join(', ');
                        throw new Error(`¡ERROR DE UBICACIÓN EN PESAJES! Los siguientes potreros en tu Excel de PESAJES NO existen en la App: [${lista}]. Por favor, créalos o corrige sus nombres en el Excel.`);
                    }

                    const recordsInsert: any[] = [];
                    const errores: string[] = [];
                    const cebaUpdates = new Map<string, { fecha: string, peso: number }>();
                    const ingresoAActualizar = new Map<string, { fecha: string; peso: number }>();

                    let omitidosDuplicados = 0;

                    results.data.forEach((row: any, index: number) => {
                        const chapeta = row.numero_chapeta?.toString().trim();
                        if (!chapeta) return;

                        const anim = mapAnimales.get(chapeta.toLowerCase());
                        if (!anim) return; // Ya debería existir

                        const peso = cleanNumber(row.peso);
                        const rawFecha = row.fecha || row['fecha(Año-Mes-Día)'] || row['Fecha'];
                        const fecha = parseFechaCol(rawFecha) || getLocalIsoDate();
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();

                        if (isNaN(peso) || peso <= 0) {
                            errores.push(`Fila ${index + 2}: Peso inválido.`);
                            return;
                        }

                        // VALIDACIÓN DE DUPLICADOS (Idempotencia)
                        const key = `${anim.id}|${fecha}|${peso}`;
                        if (setDuplicados.has(key)) {
                            omitidosDuplicados++;
                            return;
                        }

                        // Evitar duplicados dentro del mismo archivo (Intra-CSV)
                        setDuplicados.add(key);

                        const etapaCSV = row.etapa?.toString().toLowerCase().trim();
                        let etapaFinal = (etapaCSV === 'cria' || etapaCSV === 'levante' || etapaCSV === 'ceba') 
                            ? etapaCSV 
                            : anim.etapa;

                        recordsInsert.push({
                            id_animal: anim.id,
                            peso,
                            fecha,
                            etapa: etapaFinal,
                            id_potrero: potreroNombre ? mapPotreros.get(potreroNombre) : null
                        });

                        // Lógica de actualización de fechas de ingreso (Ingreso antiguo)
                        if (fecha < anim.fecha_ingreso) {
                            const actualUpdate = ingresoAActualizar.get(anim.id);
                            if (!actualUpdate || fecha < actualUpdate.fecha) {
                                ingresoAActualizar.set(anim.id, { fecha, peso });
                            }
                        }

                        // Lógica de paso a ceba
                        if (etapaFinal === 'ceba') {
                            const fechaDB = anim.fecha_ingreso_ceba;
                            const actualBuffer = cebaUpdates.get(anim.id);
                            if (!fechaDB || fecha < fechaDB) {
                                if (!actualBuffer || fecha < actualBuffer.fecha) {
                                    cebaUpdates.set(anim.id, { fecha, peso });
                                }
                            }
                        }
                    });

                    if (recordsInsert.length === 0 && omitidosDuplicados === 0) {
                        throw new Error("El archivo no contenía datos válidos.");
                    }

                    // 4. Ejecutar actualizaciones de animales (Ingreso y Ceba) - MEJORA: AHORA EN BATCH
                    let animalesIngresoActualizados = 0;
                    if (ingresoAActualizar.size > 0 || cebaUpdates.size > 0) {
                        const allIds = Array.from(new Set([...ingresoAActualizar.keys(), ...cebaUpdates.keys()]));
                        animalesIngresoActualizados = allIds.length;
                        
                        // Procesar actualizaciones en lotes de 100 para ser ultra seguros
                        for (let i = 0; i < allIds.length; i += 100) {
                            const batchIds = allIds.slice(i, i + 100);
                            const updatePromises = batchIds.map(id => {
                                const ingreso = ingresoAActualizar.get(id);
                                const ceba = cebaUpdates.get(id);
                                const up: any = {};
                                if (ingreso) {
                                    up.fecha_ingreso = ingreso.fecha;
                                    up.peso_ingreso = ingreso.peso;
                                }
                                if (ceba) {
                                    up.etapa = 'ceba';
                                    up.ok_ceba = true;
                                    up.fecha_ingreso_ceba = ceba.fecha;
                                    up.peso_ingreso_ceba = ceba.peso;
                                }
                                return supabase
                                    .from('animales')
                                    .update(up)
                                    .eq('id', id);
                            });

                            const results = await Promise.all(updatePromises);
                            const errors = results.filter(r => r.error);
                            if (errors.length > 0) {
                                console.error("Error al actualizar animales durante la recalibración:", errors);
                            }
                            setImportProgress({ current: i + batchIds.length, total: allIds.length });
                        }
                    }

                    // 5. Insertar los nuevos pesajes - MEJORA: AHORA EN BATCH DE 200
                    let pesajesInsertados = 0;
                    if (recordsInsert.length > 0) {
                        let idCargaMasiva: string | null = null;
                        try {
                            const userResp = await supabase.auth.getUser();
                            const { data: cargaReg, error: errCarga } = await supabase
                                .from('cargas_masivas')
                                .insert({
                                    id_finca: fincaId,
                                    usuario_id: userResp.data.user?.id,
                                    tipo: 'pesajes',
                                    nombre_archivo: file.name,
                                    total_registros: recordsInsert.length,
                                    fecha_carga: getLocalIsoDate(),
                                    estado: 'activa'
                                })
                                .select('id')
                                .single();
                            if (!errCarga && cargaReg) {
                                idCargaMasiva = cargaReg.id;
                            }
                        } catch (eCarga) {
                            console.warn("No se pudo registrar en cargas_masivas:", eCarga);
                        }

                        if (idCargaMasiva) {
                            recordsInsert.forEach((r: any) => {
                                r.id_carga_masiva = idCargaMasiva;
                            });
                        }

                        for (let i = 0; i < recordsInsert.length; i += 200) {
                            const batch = recordsInsert.slice(i, i + 200);
                            const { error: insertError } = await supabase.from('registros_pesaje').insert(batch);
                            if (insertError) throw insertError;
                            pesajesInsertados += batch.length;
                            setImportProgress({ current: i + batch.length, total: recordsInsert.length });
                        }

                        // Recalcular en cascada las ganancias para los animales pesados (Ultra rápido en PostgreSQL)
                        const animalesPesados = Array.from(new Set(recordsInsert.map((r: any) => r.id_animal).filter(Boolean))) as string[];
                        if (animalesPesados.length > 0) {
                            const { error: rpcErr } = await supabase.rpc('recalcular_historial_pesajes_animales', { p_id_animales: animalesPesados });
                            if (rpcErr) {
                                for (const aId of animalesPesados) {
                                    await recalcularHistorialPesajesAnimal(aId, supabase);
                                }
                            }
                        }

                        await fetchCargasMasivasHoy();
                    }

                    // 6. Mensaje de éxito detallado
                    let msg = `¡Carga estricta completada!`;
                    const resultados = [];
                    if (pesajesInsertados > 0) resultados.push(`se registraron ${pesajesInsertados} pesajes`);
                    if (omitidosDuplicados > 0) resultados.push(`se omitieron ${omitidosDuplicados} duplicados`);
                    if (omitidosNoExistentes.length > 0) resultados.push(`se ignoraron registros de ${omitidosNoExistentes.length} animales que no existen`);
                    
                    if (resultados.length > 0) {
                        msg += ` Resultados: ${resultados.join(', ')}.`;
                    }
                    if (animalesIngresoActualizados > 0) {
                        msg += ` Además, se recalibró el ingreso de ${animalesIngresoActualizados} animales.`;
                    }

                    // Reporte detallado para pesajes
                    setReporteCarga({
                        tipo: 'pesajes',
                        creados: pesajesInsertados,
                        actualizados: animalesIngresoActualizados,
                        omitidos: omitidosDuplicados + omitidosNoExistentes.length,
                        omitidosList: omitidosNoExistentes // Mostramos los animales que faltan en el inventario
                    });

                    setMsjExito(msg);
                    setShowExitoModal(true);
                    if (errores.length > 0) {
                        setMsjError(`Inconsistencias omitidas:\n${errores.join('\n')}`);
                        setShowErrorModal(true);
                    }
                } catch (err: any) {
                    setMsjError(err.message || 'Error procesando el archivo CSV.');
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkRotacionesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['nombre_rotacion', 'nombre_potrero', 'area_hectareas'];
                    const isInventoryFile = headers.includes('peso_ingreso') || headers.includes('numero_chapeta');
                    const isWeighingFile = headers.includes('peso') && !headers.includes('area_hectareas');

                    if (isInventoryFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de INVENTARIO en la sección de ROTACIONES.');
                    }
                    if (isWeighingFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de PESAJES en la sección de ROTACIONES.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Rotaciones y Potreros. Faltan columnas: ${missing.join(', ')}`);
                    }

                    // 1. Obtener datos existentes
                    const { data: exRot } = await supabase.from('rotaciones').select('id, nombre').eq('id_finca', fincaId);
                    const { data: exPot } = await supabase.from('potreros').select('id, nombre, id_rotacion').eq('id_finca', fincaId);

                    const mapRotaciones = new Map(exRot?.map((r: any) => [r.nombre.toLowerCase().trim(), r.id]));
                    const mapPotreros = new Map<string, { id: string; id_rotacion: string | null }>(exPot?.map((p: any) => [p.nombre.toLowerCase().trim(), { id: p.id, id_rotacion: p.id_rotacion }]));

                    // 2. Identificar rotaciones nuevas
                    const rotacionesNuevas = new Map<string, string>(); // nombre_lower -> original
                    (results.data as any[]).forEach((row: any) => {
                        const rotName = row.nombre_rotacion?.toString().trim();
                        if (rotName && !mapRotaciones.has(rotName.toLowerCase())) {
                            rotacionesNuevas.set(rotName.toLowerCase(), rotName);
                        }
                    });

                    if (rotacionesNuevas.size > 0) {
                        const inserts = Array.from(rotacionesNuevas.values()).map(nombre => ({
                            id_finca: fincaId,
                            nombre: nombre
                        }));
                        const { data: creadas, error: rotErr } = await supabase.from('rotaciones').insert(inserts).select();
                        if (rotErr) throw rotErr;
                        creadas?.forEach((r: any) => mapRotaciones.set(r.nombre.toLowerCase().trim(), r.id));
                    }

                    // 3. Procesar potreros
                    const recordsPotreros: any[] = [];
                    let updatesPotrerosCnt = 0;

                    for (const row of results.data as any[]) {
                        const potName = row.nombre_potrero?.toString().trim();
                        const rotName = row.nombre_rotacion?.toString().trim();
                        const area = parseFloat(row.area_hectareas) || 0;
                        const diasBase = parseInt(row.dias_ocupacion_base) || 1;
                        const rotId = rotName ? mapRotaciones.get(rotName.toLowerCase()) : null;

                        if (!potName) continue;

                        const existingPot = mapPotreros.get(potName.toLowerCase());
                        if (existingPot) {
                            // Si el potrero ya existe, actualizamos su área. 
                            // Y solo cambiamos la rotación si se proporcionó una nueva.
                            const updateData: any = { area_hectareas: area, dias_ocupacion_base: diasBase };
                            if (rotId) {
                                updateData.id_rotacion = rotId;
                            }
                            
                            const { error: potUpdErr } = await supabase
                                .from('potreros')
                                .update(updateData)
                                .eq('id', existingPot.id);
                            if (potUpdErr) throw potUpdErr;
                            updatesPotrerosCnt++;
                        } else {
                            recordsPotreros.push({
                                id_finca: fincaId,
                                nombre: potName,
                                area_hectareas: area,
                                id_rotacion: rotId,
                                dias_ocupacion_base: diasBase
                            });
                        }
                    }

                    if (recordsPotreros.length > 0) {
                        const { error: potInsErr } = await supabase.from('potreros').insert(recordsPotreros);
                        if (potInsErr) throw potInsErr;
                    }

                    setMsjExito(`¡Carga exitosa! Se crearon ${recordsPotreros.length} potreros nuevos y se actualizaron ${updatesPotrerosCnt} existentes.`);
                    setShowExitoModal(true);
                } catch (err: any) {
                    setMsjError(err.message || 'Error procesando el archivo CSV.');
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    if (e.target) e.target.value = '';
                }
            }
        });
    };

    const sectionCards = [
        { id: 'seguridad', label: 'Seguridad', icon: <Lock size={28} />, desc: 'Cuenta y notificaciones' },
        { id: 'datosTecnicos', label: 'Parámetros', icon: <Home size={28} />, desc: 'KPIs y Finca' },
        { id: 'usuarios', label: 'Personal', icon: <Users size={28} />, desc: 'Gestión de equipo' },
        { id: 'contactosNegocio', label: 'Negocios', icon: <Briefcase size={28} />, desc: 'Contactos y socios' },
        { id: 'cargasMasivas', label: 'Carga Masiva', icon: <Upload size={28} />, desc: 'Importar CSV/Excel' },
        { id: 'suscripcion', label: 'Suscripción', icon: <Award size={28} />, desc: 'Plan y Licencia', isLink: true }
    ];


    const supportsNativePopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
    const isSeguridadOpen = !canManageFarm || !collapsed.seguridad;

    return (
        <div className="page-container settings-page">
            <h1 className="title settings-title">
                <SettingsIcon size={30} aria-hidden="true" />
                <span>{canManageFarm ? 'Ajustes y Gestión de la Finca' : 'Mi Perfil y Seguridad'}</span>
            </h1>

            {/* Región persistente de notificaciones toast (popover manual con respaldo inline) */}
            <div role="region" aria-label="Notificaciones de configuración" className="settings-toast-region">
                <div
                    ref={toastRef}
                    {...(supportsNativePopover ? ({ popover: 'manual' } as React.HTMLAttributes<HTMLDivElement>) : {})}
                    role={activeToastType === 'error' ? 'alert' : 'status'}
                    aria-live={activeToastType === 'error' ? 'assertive' : 'polite'}
                    hidden={!activeToastText}
                    onMouseEnter={() => setToastPaused(true)}
                    onMouseLeave={() => setToastPaused(false)}
                    onFocus={() => setToastPaused(true)}
                    onBlur={() => setToastPaused(false)}
                    className={`settings-toast ${activeToastText && !supportsNativePopover ? 'settings-toast--fallback' : ''} ${activeToastType === 'error' ? 'settings-toast--error' : 'settings-toast--success'}`}
                >
                    <span>{activeToastText}</span>
                    {activeToastText && (
                        <button
                            type="button"
                            className="settings-toast-close"
                            onClick={() => { setMsjExito(''); setMsjError(''); }}
                            aria-label="Cerrar notificación"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            {/* Modal nativo de Éxito para Cargas Masivas */}
            <dialog
                ref={exitoDialogRef}
                className="settings-dialog"
                aria-labelledby="settings-exito-title"
                onClose={() => { setShowExitoModal(false); setMsjExito(''); setReporteCarga(null); }}
            >
                <div className="card settings-dialog-card" style={{ textAlign: 'center', border: '1px solid var(--primary)', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                        <div style={{ backgroundColor: 'var(--success-soft-bg)', padding: '16px', borderRadius: '50%' }}>
                            <CheckCircle2 size={44} color="var(--primary)" aria-hidden="true" />
                        </div>
                    </div>
                    <h2 id="settings-exito-title" style={{ marginBottom: '8px', color: 'var(--text-main)' }}>¡Importación Finalizada!</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                        {msjExito}
                    </p>

                    {reporteCarga && (
                        <div style={{ textAlign: 'left', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
                            <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '14px', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Resumen de Operación</h3>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-main)', fontSize: '1.35rem', fontWeight: 'bold' }}>{reporteCarga.creados}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>CREADOS</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-main)', fontSize: '1.35rem', fontWeight: 'bold' }}>{reporteCarga.actualizados}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>ACTUALIZADOS</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--error)', fontSize: '1.35rem', fontWeight: 'bold' }}>{reporteCarga.omitidos}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>OMITIDOS</div>
                                </div>
                            </div>

                            {reporteCarga.omitidosList.length > 0 && (
                                <>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px' }}>
                                        Chapetas omitidas (por duplicidad):
                                    </div>
                                    <div style={{ 
                                        backgroundColor: 'var(--error-soft-bg)',
                                        border: '1px solid var(--error-soft-border)',
                                        padding: '10px', 
                                        borderRadius: '8px', 
                                        fontSize: '0.85rem', 
                                        color: 'var(--error)',
                                        maxHeight: '100px',
                                        overflowY: 'auto',
                                        wordBreak: 'break-all',
                                        lineHeight: '1.4'
                                    }}>
                                        {reporteCarga.omitidosList.join(', ')}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        autoFocus
                        onClick={() => { setShowExitoModal(false); setMsjExito(''); setReporteCarga(null); }}
                        style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', padding: '12px 24px', fontSize: '1rem', width: '100%' }}
                    >
                        Cerrar Reporte
                    </button>
                </div>
            </dialog>

            {/* Modal nativo de Error para Cargas Masivas / Errores Críticos */}
            <dialog
                ref={errorDialogRef}
                className="settings-dialog"
                aria-labelledby="settings-error-title"
                onClose={() => { setShowErrorModal(false); setMsjError(''); }}
            >
                <div className="card settings-dialog-card" style={{ textAlign: 'center', border: '1px solid var(--error)', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                        <div style={{ backgroundColor: 'var(--error-soft-bg)', padding: '16px', borderRadius: '50%' }}>
                            <Upload size={44} color="var(--error)" aria-hidden="true" />
                        </div>
                    </div>
                    <h2 id="settings-error-title" style={{ marginBottom: '14px', color: 'var(--text-main)' }}>Error en la Carga</h2>
                    <div style={{ 
                        backgroundColor: 'var(--error-soft-bg)', 
                        padding: '16px', 
                        borderRadius: '12px', 
                        marginBottom: '20px',
                        border: '1px solid var(--error-soft-border)',
                        maxHeight: '220px',
                        overflowY: 'auto'
                    }}>
                        <p style={{ color: 'var(--error)', fontSize: '0.98rem', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-line' }}>
                            {msjError}
                        </p>
                    </div>
                    <button
                        type="button"
                        autoFocus
                        onClick={() => { setShowErrorModal(false); setMsjError(''); }}
                        className="settings-btn-danger"
                        style={{ padding: '12px 24px', fontSize: '1rem', width: '100%' }}
                    >
                        Corregir Archivo
                    </button>
                </div>
            </dialog>

            {/* Modal nativo de Confirmación PWA (reemplaza window.confirm) */}
            <dialog
                ref={confirmDialogRef}
                className="settings-dialog"
                aria-labelledby="settings-confirm-title"
                aria-describedby="settings-confirm-msg"
                onClose={() => {
                    if (confirmModal) resolveConfirmation(false);
                }}
            >
                {confirmModal && (
                    <div className="card settings-dialog-card" style={{ border: `1px solid ${confirmModal.variant === 'danger' ? 'var(--error)' : 'var(--primary)'}`, padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <div style={{
                                backgroundColor: confirmModal.variant === 'danger' ? 'var(--error-soft-bg)' : 'var(--warning-soft-bg)',
                                padding: '10px',
                                borderRadius: '50%',
                                display: 'flex'
                            }}>
                                <AlertTriangle size={22} color={confirmModal.variant === 'danger' ? 'var(--error)' : 'var(--warning)'} aria-hidden="true" />
                            </div>
                            <h2 id="settings-confirm-title" style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                                {confirmModal.title}
                            </h2>
                        </div>
                        <p id="settings-confirm-msg" style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {confirmModal.message}
                        </p>
                        <div className="settings-dialog-actions">
                            <button
                                type="button"
                                autoFocus
                                className="settings-btn-secondary"
                                style={{ width: 'auto' }}
                                onClick={() => resolveConfirmation(false)}
                            >
                                {confirmModal.cancelLabel || 'Cancelar'}
                            </button>
                            <button
                                type="button"
                                className={confirmModal.variant === 'danger' ? 'settings-btn-danger' : ''}
                                style={{ width: 'auto' }}
                                onClick={() => resolveConfirmation(true)}
                            >
                                {confirmModal.confirmLabel}
                            </button>
                        </div>
                    </div>
                )}
            </dialog>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {canManageFarm && (
                    <nav aria-label="Secciones de configuración">
                        <div className="settings-menu-grid">
                            {sectionCards.map(section => {
                                if (section.isLink) {
                                    return (
                                        <button
                                            type="button"
                                            key={section.id}
                                            onClick={() => navigate('/suscripcion')}
                                            className="settings-menu-card settings-menu-card--link"
                                        >
                                            <span className="settings-menu-card-icon" style={{ color: accentPurple }} aria-hidden="true">
                                                {section.icon}
                                            </span>
                                            <span style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    <span className="settings-menu-card-title">{section.label}</span>
                                                    <span
                                                        className="settings-plan-badge"
                                                        style={{
                                                            background: licenciaInfo?.licencia === 'premium' ? (isLight ? '#f3e8ff' : 'rgba(168, 85, 247, 0.25)') : licenciaInfo?.licencia === 'finca' ? 'var(--info-soft-bg)' : 'var(--warning-soft-bg)',
                                                            color: licenciaInfo?.licencia === 'premium' ? accentPurple : licenciaInfo?.licencia === 'finca' ? 'var(--info)' : 'var(--warning)'
                                                        }}
                                                    >
                                                        {licenciaInfo?.licencia || 'demo'}
                                                    </span>
                                                </span>
                                                <small className="settings-menu-card-desc">{section.desc}</small>
                                            </span>
                                        </button>
                                    );
                                }
                                const isActive = !collapsed[section.id as keyof typeof collapsed];
                                return (
                                    <button
                                        type="button"
                                        key={section.id}
                                        onClick={() => toggleSection(section.id as keyof typeof collapsed)}
                                        aria-expanded={isActive}
                                        aria-controls={`settings-panel-${section.id}`}
                                        className={`settings-menu-card ${isActive ? 'settings-menu-card--active' : ''}`}
                                    >
                                        <span className="settings-menu-card-icon" aria-hidden="true">
                                            {section.icon}
                                        </span>
                                        <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                                            <span className="settings-menu-card-title">{section.label}</span>
                                            <small className="settings-menu-card-desc">{section.desc}</small>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </nav>
                )}

                {!canManageFarm && (
                    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '16px' }}>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>
                                Perfil activo
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                                {role === 'vaquero' ? 'Trabajador / Vaquero' : 'Visualizador / Observador'}
                            </div>
                        </div>
                        <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '10px', background: 'var(--primary-soft-bg)', color: 'var(--primary)', border: '1px solid var(--primary-soft-border)', fontWeight: 600 }}>
                            Acceso de campo
                        </span>
                    </div>
                )}

                {/* Contenido de las Secciones */}
                <div ref={sectionPanelRef} className="settings-section-anchor" style={{ position: 'relative' }}>
                    {/* Seguridad (Disponible para todos los roles) */}
                    {isSeguridadOpen && (
                        <section id="settings-panel-seguridad" aria-labelledby="settings-heading-seguridad" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                            <h2 id="settings-heading-seguridad" className="settings-section-heading">
                                <Lock size={20} color="var(--primary)" aria-hidden="true" /> Seguridad de la Cuenta
                            </h2>
                            <form onSubmit={handleUpdatePassword} aria-labelledby="settings-heading-seguridad">
                                {renderInlineStatus('seguridad')}
                                <div className="settings-form-grid-wide" style={{ marginBottom: '20px' }}>
                                    <div className="settings-field">
                                        <label htmlFor="settings-new-password">Nueva Contraseña</label>
                                        <div className="settings-input-affix-wrap" style={{ marginBottom: 0 }}>
                                            <input
                                                id="settings-new-password"
                                                name="new_password"
                                                type={showNewPwd ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                minLength={6}
                                                enterKeyHint="next"
                                                placeholder="Mínimo 6 caracteres"
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                style={{ paddingRight: '52px' }}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPwd(prev => !prev)}
                                                aria-pressed={showNewPwd}
                                                aria-label={showNewPwd ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                                                className="settings-toast-close"
                                                style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                                            >
                                                {showNewPwd ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="settings-field">
                                        <label htmlFor="settings-confirm-password">Confirmar Contraseña</label>
                                        <div className="settings-input-affix-wrap" style={{ marginBottom: 0 }}>
                                            <input
                                                id="settings-confirm-password"
                                                name="confirm_password"
                                                type={showConfirmPwd ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                minLength={6}
                                                enterKeyHint="done"
                                                placeholder="Repite la nueva contraseña"
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                                style={{ paddingRight: '52px' }}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPwd(prev => !prev)}
                                                aria-pressed={showConfirmPwd}
                                                aria-label={showConfirmPwd ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'}
                                                className="settings-toast-close"
                                                style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                                            >
                                                {showConfirmPwd ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button type="submit" disabled={loading}>
                                    {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
                                </button>
                            </form>
                            <PushNotificationsCard />
                        </section>
                    )}

                    {canManageFarm && (
                        <>

                            {/* Datos Técnicos y Parámetros */}
                            {!collapsed.datosTecnicos && (
                                <section id="settings-panel-datosTecnicos" aria-labelledby="settings-heading-parametros" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h2 id="settings-heading-parametros" className="settings-section-heading">
                                        <Home size={20} color="var(--primary)" aria-hidden="true" /> Datos Técnicos y Parámetros
                                    </h2>
                                    <form onSubmit={guardarConfiguracionYFinca} aria-labelledby="settings-heading-parametros">
                                        {renderInlineStatus('datosTecnicos')}

                                        <fieldset className="settings-fieldset">
                                            <legend className="settings-legend">Información de la Finca y Costos</legend>
                                            <div className="settings-form-grid">
                                                <div className="settings-field">
                                                    <label htmlFor="settings-area-total"><Maximize size={16} aria-hidden="true" /> Área Total (Ha)</label>
                                                    <input id="settings-area-total" name="area_total" type="number" step="0.01" inputMode="decimal" enterKeyHint="next" value={farmInfo.area_total} onChange={e => setFarmInfo({ ...farmInfo, area_total: e.target.value })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-area-aprovechable"><CheckCircle2 size={16} aria-hidden="true" /> Área Aprovechable (Ha)</label>
                                                    <input id="settings-area-aprovechable" name="area_aprovechable" type="number" step="0.01" inputMode="decimal" enterKeyHint="next" value={farmInfo.area_aprovechable} onChange={e => setFarmInfo({ ...farmInfo, area_aprovechable: e.target.value })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-ubicacion"><MapPin size={16} aria-hidden="true" /> Región Climática</label>
                                                    <select id="settings-ubicacion" name="ubicacion" value={farmInfo.ubicacion} onChange={e => setFarmInfo({ ...farmInfo, ubicacion: e.target.value })}>
                                                        <option value="">Seleccione Región...</option>
                                                        <option value="Costa Caribe">Costa Caribe</option>
                                                        <option value="Magdalena Medio">Magdalena Medio</option>
                                                        <option value="Llanos Orientales / Orinoquía">Llanos Orientales</option>
                                                        <option value="Zona Andina / Trópico Alto">Trópico Alto (Zona Andina)</option>
                                                    </select>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-municipio"><MapPin size={16} aria-hidden="true" /> Municipio / Ciudad</label>
                                                    <input id="settings-municipio" name="municipio" type="text" enterKeyHint="next" placeholder="Ej. Montería, Córdoba" value={farmInfo.municipio} onChange={e => setFarmInfo({ ...farmInfo, municipio: e.target.value })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-proposito"><Target size={16} aria-hidden="true" /> Propósito</label>
                                                    <select id="settings-proposito" name="proposito" value={farmInfo.proposito} onChange={e => setFarmInfo({ ...farmInfo, proposito: e.target.value })}>
                                                        <option value="">Seleccione...</option>
                                                        <option value="Doble propósito">Doble propósito</option>
                                                        <option value="producción de carne">Producción de carne</option>
                                                        <option value="Producción de leche">Producción de leche</option>
                                                        <option value="cría">Cría</option>
                                                        <option value="Levante">Levante</option>
                                                    </select>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-peso-entrada-ceba"><Scale size={16} aria-hidden="true" /> Entrada Ceba (kg)</label>
                                                    <input id="settings-peso-entrada-ceba" name="peso_entrada_ceba" type="number" step="0.5" inputMode="decimal" enterKeyHint="next" value={farmInfo.peso_entrada_ceba} onChange={e => setFarmInfo({ ...farmInfo, peso_entrada_ceba: e.target.value })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-consumo-dia"><Leaf size={16} aria-hidden="true" /> Consumo Pasto (Kg/Día)</label>
                                                    <input id="settings-consumo-dia" name="consumo_dia_potrero" type="number" step="0.1" inputMode="decimal" enterKeyHint="next" value={farmInfo.consumo_dia_potrero} onChange={(e) => setFarmInfo({ ...farmInfo, consumo_dia_potrero: e.target.value })} required />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-precio-compra"><Coins size={16} aria-hidden="true" /> Precio Compra (COP/kg)</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <span className="settings-input-prefix" aria-hidden="true">$</span>
                                                        <input
                                                            id="settings-precio-compra"
                                                            name="precio_compra_promedio"
                                                            type="text"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={formatNumber(farmInfo.precio_compra_promedio)}
                                                            onChange={e => setFarmInfo({ ...farmInfo, precio_compra_promedio: unformatNumber(e.target.value) })}
                                                            style={{ paddingLeft: '32px' }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-precio-venta"><DollarSign size={16} aria-hidden="true" /> Precio Venta (COP/kg)</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <span className="settings-input-prefix" aria-hidden="true">$</span>
                                                        <input
                                                            id="settings-precio-venta"
                                                            name="precio_venta_promedio"
                                                            type="text"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={formatNumber(farmInfo.precio_venta_promedio)}
                                                            onChange={e => setFarmInfo({ ...farmInfo, precio_venta_promedio: unformatNumber(e.target.value) })}
                                                            style={{ paddingLeft: '32px' }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-costo-mensual"><CreditCard size={16} aria-hidden="true" /> Costo Mensual por Animal</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <span className="settings-input-prefix" aria-hidden="true">$</span>
                                                        <input
                                                            id="settings-costo-mensual"
                                                            name="costo_mensual_animal"
                                                            type="text"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={formatNumber(farmInfo.costo_mensual_animal)}
                                                            onChange={e => setFarmInfo({ ...farmInfo, costo_mensual_animal: unformatNumber(e.target.value) })}
                                                            style={{ paddingLeft: '32px' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </fieldset>

                                        {/* % Participación de utilidad — dos campos simples en grilla */}
                                        <fieldset className="settings-fieldset">
                                            <legend className="settings-legend">Participación de Utilidad</legend>
                                            <div className="settings-form-grid">
                                                <div className="settings-field">
                                                    <label htmlFor="settings-part-finca"><Coins size={16} aria-hidden="true" /> % Utilidad Finca / Tenedor</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <input
                                                            id="settings-part-finca"
                                                            name="participacion_utilidad"
                                                            type="number"
                                                            min="1"
                                                            max="99"
                                                            step="1"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={participacionUtilidad}
                                                            onChange={e => setParticipacionUtilidad(e.target.value)}
                                                            style={{ paddingRight: '38px' }}
                                                        />
                                                        <span className="settings-input-suffix" aria-hidden="true">%</span>
                                                    </div>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-part-inversionista"><Coins size={16} aria-hidden="true" /> % Utilidad Inversionista (dueño)</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <input
                                                            id="settings-part-inversionista"
                                                            name="participacion_inversionista"
                                                            type="number"
                                                            readOnly
                                                            value={Math.max(1, 100 - (parseInt(participacionUtilidad) || 60))}
                                                            style={{ paddingRight: '38px', cursor: 'default', opacity: 0.65 }}
                                                        />
                                                        <span className="settings-input-suffix" aria-hidden="true">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </fieldset>

                                        {/* KPI Dinámico de Punto de Equilibrio */}
                                        <div style={{ 
                                            background: 'var(--primary-soft-bg)', 
                                            border: '1px solid var(--primary-soft-border)', 
                                            borderRadius: '12px', 
                                            padding: '18px', 
                                            marginBottom: '24px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            textAlign: 'center',
                                            gap: '8px'
                                        }}>
                                            <div style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                Punto de Equilibrio Estimado
                                            </div>
                                            <div style={{ fontSize: '2.25rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                                {(() => {
                                                    const costo = parseFloat(farmInfo.costo_mensual_animal) || 0;
                                                    const precio = parseFloat(farmInfo.precio_venta_promedio) || 0;
                                                    const partDecimal = (Math.min(99, Math.max(1, parseInt(participacionUtilidad) || 60))) / 100;
                                                    if (precio === 0) return '0.0';
                                                    const peKgMes = (costo / partDecimal) / precio;
                                                    const val = toDisplayValue(peKgMes, modoLocal);
                                                    return val.toFixed(modoLocal === 'GDP' ? 0 : 1);
                                                })()}
                                                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                                    {modoLocal === 'GDP' ? 'Gr/Día' : 'Kg/Mes'}
                                                </span>
                                            </div>
                                            <p className="settings-helper-text" style={{ margin: 0, maxWidth: '400px' }}>
                                                Adelanto {modoLocal === 'GDP' ? 'diario' : 'mensual'} mínimo requerido por animal para cubrir costos directos e indirectos.
                                            </p>
                                        </div>

                                        {/* Rangos de Peso para Dashboard y Despachos */}
                                        <fieldset className="settings-subcard" style={{ borderStyle: 'solid' }}>
                                            <legend className="settings-legend" style={{ marginBottom: '8px', paddingInline: '6px' }}>Rangos de Peso (Dashboard y Despachos)</legend>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                                <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Scale size={18} color="var(--primary)" aria-hidden="true" />
                                                    Cortes de Peso de la Finca
                                                </h3>
                                            </div>
                                            
                                            <p className="settings-helper-text" style={{ marginTop: 0, marginBottom: '16px' }}>
                                                Selecciona el modelo productivo o personaliza los cortes de peso. La tabla del Dashboard y las alertas de despacho se ajustarán automáticamente.
                                            </p>

                                            <div className="settings-form-grid" style={{ marginBottom: '18px' }}>
                                                <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                                                    <label htmlFor="settings-preset-peso">
                                                        <Target size={16} aria-hidden="true" /> Plantilla / Modelo Productivo
                                                    </label>
                                                    <select
                                                        id="settings-preset-peso"
                                                        name="preset_peso"
                                                        value={farmInfo.preset_peso}
                                                        onChange={(e) => {
                                                            const selectedId = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item => item.id === selectedId);
                                                            if (p && selectedId !== 'personalizado') {
                                                                setFarmInfo({
                                                                    ...farmInfo,
                                                                    preset_peso: selectedId,
                                                                    corte_peso_1: p.corte1.toString(),
                                                                    corte_peso_2: p.corte2.toString(),
                                                                    corte_peso_3: p.corte3.toString()
                                                                });
                                                            } else {
                                                                setFarmInfo({ ...farmInfo, preset_peso: 'personalizado' });
                                                            }
                                                        }}
                                                    >
                                                        {PRESETS_RANGOS_PESO.map(pr => (
                                                            <option key={pr.id} value={pr.id}>{pr.nombre}</option>
                                                        ))}
                                                    </select>
                                                    {PRESETS_RANGOS_PESO.find(p => p.id === farmInfo.preset_peso)?.descripcion && (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: '-12px', marginBottom: '8px', display: 'block' }}>
                                                            💡 {PRESETS_RANGOS_PESO.find(p => p.id === farmInfo.preset_peso)?.descripcion}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="settings-field">
                                                    <label htmlFor="settings-corte-1">Corte 1: Adaptación / Inicio (kg)</label>
                                                    <input
                                                        id="settings-corte-1"
                                                        name="corte_peso_1"
                                                        type="number"
                                                        step="1"
                                                        inputMode="numeric"
                                                        enterKeyHint="next"
                                                        value={farmInfo.corte_peso_1}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item => 
                                                                item.id !== 'personalizado' &&
                                                                item.corte1.toString() === val && 
                                                                item.corte2.toString() === farmInfo.corte_peso_2 && 
                                                                item.corte3.toString() === farmInfo.corte_peso_3
                                                            );
                                                            setFarmInfo({
                                                                ...farmInfo,
                                                                corte_peso_1: val,
                                                                preset_peso: p ? p.id : 'personalizado'
                                                            });
                                                        }}
                                                        required
                                                    />
                                                </div>

                                                <div className="settings-field">
                                                    <label htmlFor="settings-corte-2">Corte 2: Desarrollo Medio (kg)</label>
                                                    <input
                                                        id="settings-corte-2"
                                                        name="corte_peso_2"
                                                        type="number"
                                                        step="1"
                                                        inputMode="numeric"
                                                        enterKeyHint="next"
                                                        value={farmInfo.corte_peso_2}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item => 
                                                                item.id !== 'personalizado' &&
                                                                item.corte1.toString() === farmInfo.corte_peso_1 && 
                                                                item.corte2.toString() === val && 
                                                                item.corte3.toString() === farmInfo.corte_peso_3
                                                            );
                                                            setFarmInfo({
                                                                ...farmInfo,
                                                                corte_peso_2: val,
                                                                preset_peso: p ? p.id : 'personalizado'
                                                            });
                                                        }}
                                                        required
                                                    />
                                                </div>

                                                <div className="settings-field">
                                                    <label htmlFor="settings-corte-3" style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                                        Corte 3: Meta Venta / Despacho (kg)
                                                    </label>
                                                    <input
                                                        id="settings-corte-3"
                                                        name="corte_peso_3"
                                                        type="number"
                                                        step="1"
                                                        inputMode="numeric"
                                                        enterKeyHint="next"
                                                        value={farmInfo.corte_peso_3}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item => 
                                                                item.id !== 'personalizado' &&
                                                                item.corte1.toString() === farmInfo.corte_peso_1 && 
                                                                item.corte2.toString() === farmInfo.corte_peso_2 && 
                                                                item.corte3.toString() === val
                                                            );
                                                            setFarmInfo({
                                                                ...farmInfo,
                                                                corte_peso_3: val,
                                                                preset_peso: p ? p.id : 'personalizado'
                                                            });
                                                        }}
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            {/* Vista previa de cómo se verá la tabla */}
                                            <div style={{ background: 'var(--surface-inset)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Vista Previa en Dashboard:
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: '8px' }}>
                                                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fila 1 (Entrada)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>&lt; {farmInfo.corte_peso_1 || 0} kg</div>
                                                    </div>
                                                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fila 2 (Levante)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{(parseFloat(farmInfo.corte_peso_1) || 0) + 1} - {farmInfo.corte_peso_2 || 0} kg</div>
                                                    </div>
                                                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fila 3 (Pre-Salida)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{(parseFloat(farmInfo.corte_peso_2) || 0) + 1} - {farmInfo.corte_peso_3 || 0} kg</div>
                                                    </div>
                                                    <div style={{ background: 'var(--success-soft-bg)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--success-soft-border)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Fila 4 (Despacho 🚚)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--success)', fontSize: '0.9rem' }}>&gt; {farmInfo.corte_peso_3 || 0} kg</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </fieldset>

                                        <fieldset className="settings-fieldset" style={{ marginBottom: 0 }}>
                                            <legend className="settings-legend">Umbrales (Semáforo {getModoLabel(modoLocal)})</legend>

                                            {/* Toggle GDP / GMP */}
                                            <div className="settings-unidad-row">
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unidad de ganancia:</span>
                                                <div className="settings-unidad-toggle" role="group" aria-label="Unidad de ganancia">
                                                    {(['GMP', 'GDP'] as ModoGanancia[]).map(m => (
                                                        <button
                                                            key={m}
                                                            type="button"
                                                            aria-pressed={modoLocal === m}
                                                            className="settings-unidad-btn"
                                                            onClick={() => {
                                                                const medioKgMes = toStorageValue(parseFloat(umbralMedioDisplay) || 10, modoLocal);
                                                                const altoKgMes = toStorageValue(parseFloat(umbralAltoDisplay) || 20, modoLocal);
                                                                setUmbralMedioDisplay(toDisplayValue(medioKgMes, m).toFixed(m === 'GDP' ? 0 : 1));
                                                                setUmbralAltoDisplay(toDisplayValue(altoKgMes, m).toFixed(m === 'GDP' ? 0 : 1));
                                                                setModoLocal(m);
                                                            }}
                                                            style={{
                                                                background: modoLocal === m ? 'var(--primary)' : 'transparent',
                                                                color: modoLocal === m ? 'var(--on-primary)' : 'var(--text-muted)'
                                                            }}
                                                        >
                                                            {m} <span style={{ fontWeight: 400, fontSize: '0.75rem' }}>({m === 'GMP' ? 'kg/mes' : 'gr/día'})</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="settings-form-grid">
                                                <div className="settings-field">
                                                    <label htmlFor="settings-umbral-rojo">Límite Superior Rojo ({getUnidadLabel(modoLocal)})</label>
                                                    <input id="settings-umbral-rojo" name="umbral_medio" type="number" step={modoLocal === 'GDP' ? '1' : '0.1'} inputMode="decimal" enterKeyHint="next" value={umbralMedioDisplay} onChange={(e) => setUmbralMedioDisplay(e.target.value)} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-umbral-amarillo">Límite Superior Amarillo ({getUnidadLabel(modoLocal)})</label>
                                                    <input id="settings-umbral-amarillo" name="umbral_alto" type="number" step={modoLocal === 'GDP' ? '1' : '0.1'} inputMode="decimal" enterKeyHint="done" value={umbralAltoDisplay} onChange={(e) => setUmbralAltoDisplay(e.target.value)} />
                                                </div>
                                            </div>
                                        </fieldset>

                                        <div className="settings-sticky-save-bar">
                                            <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', border: '1px solid var(--primary)' }}>
                                                {loading ? 'Guardando...' : 'Guardar Información'}
                                            </button>
                                        </div>
                                    </form>

                                    {/* Estaciones / Pluviómetros de la Finca */}
                                    <div className="settings-pluv-section">
                                        {renderInlineStatus('pluviometros')}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                            <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <CloudRain size={18} color="var(--info)" aria-hidden="true" />
                                                Pluviómetros de la Finca
                                            </h3>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--info)', background: 'var(--info-soft-bg)', padding: '3px 10px', borderRadius: '12px', border: '1px solid var(--info-soft-border)' }}>
                                                {pluviometros.filter(p => p.activo).length <= 1
                                                    ? 'Modo Estándar (1 pluviómetro)'
                                                    : `Multi-pluviómetro (${pluviometros.filter(p => p.activo).length} activos · Promedio Finca)`}
                                            </span>
                                        </div>
                                        <p className="settings-helper-text" style={{ marginBottom: '16px' }}>
                                            Cada cambio aquí se guarda al instante (es independiente de Guardar Información). Si manejas 2 o más pluviómetros, agrégalos abajo y la app calculará el <strong style={{ color: 'var(--text-main)' }}>promedio diario de la finca</strong> sin alterar registros anteriores.
                                        </p>

                                        <form onSubmit={handleAddPluviometro} className="settings-pluv-form">
                                            <div className="settings-field">
                                                <label htmlFor="settings-pluv-nombre" style={{ fontSize: '0.8rem' }}>Nombre del Pluviómetro</label>
                                                <input
                                                    id="settings-pluv-nombre"
                                                    name="pluv_nombre"
                                                    type="text"
                                                    enterKeyHint="done"
                                                    placeholder="Ej: Casa Principal o Potrero Alto"
                                                    value={nuevoPluvNombre}
                                                    onChange={e => setNuevoPluvNombre(e.target.value)}
                                                    style={{ marginBottom: 0 }}
                                                    required
                                                />
                                            </div>
                                            <div className="settings-field">
                                                <label htmlFor="settings-pluv-modo" style={{ fontSize: '0.8rem' }}>Tipo de Medición</label>
                                                <select
                                                    id="settings-pluv-modo"
                                                    name="pluv_modo"
                                                    value={nuevoPluvModo}
                                                    onChange={e => setNuevoPluvModo(e.target.value as TipoMedicionPluviometro)}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <option value="diaria">💧 Diaria (Probeta / Manual)</option>
                                                    <option value="acumulada">📟 Acumulada Digital</option>
                                                </select>
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={savingPluv || !nuevoPluvNombre.trim()}
                                                className="settings-pluv-submit"
                                            >
                                                <Plus size={16} aria-hidden="true" /> Agregar
                                            </button>
                                        </form>

                                        {pluviometros.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {pluviometros.map(pluv => (
                                                    <div
                                                        key={pluv.id}
                                                        className="settings-pluv-row"
                                                        style={{
                                                            background: pluv.activo ? 'var(--surface)' : 'var(--surface-inset)',
                                                            opacity: pluv.activo ? 1 : 0.72,
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 180px', minWidth: 0 }}>
                                                            <span style={{ fontWeight: 600, color: 'var(--text-main)', overflowWrap: 'break-word' }}>📍 {pluv.nombre}</span>
                                                            {!pluv.activo && (
                                                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                                                                    Inactivo
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="settings-pluv-actions">
                                                            <select
                                                                aria-label={`Tipo de medición para ${pluv.nombre}`}
                                                                value={pluv.tipo_medicion}
                                                                disabled={savingPluv}
                                                                onChange={e => handleUpdatePluviometro(pluv.id, { tipo_medicion: e.target.value as TipoMedicionPluviometro })}
                                                                style={{ width: 'auto', marginBottom: 0, padding: '8px 10px', fontSize: '0.82rem' }}
                                                            >
                                                                <option value="diaria">💧 Diaria (Manual)</option>
                                                                <option value="acumulada">📟 Acumulada Digital</option>
                                                            </select>
                                                            <button
                                                                type="button"
                                                                disabled={savingPluv}
                                                                aria-pressed={pluv.activo}
                                                                onClick={() => handleUpdatePluviometro(pluv.id, { activo: !pluv.activo })}
                                                                className="settings-pluv-status-btn"
                                                                style={{
                                                                    background: pluv.activo ? 'var(--success-soft-bg)' : 'var(--surface-subtle)',
                                                                    border: `1px solid ${pluv.activo ? 'var(--success-soft-border)' : 'var(--border-strong)'}`,
                                                                    color: pluv.activo ? 'var(--success)' : 'var(--text-muted)',
                                                                }}
                                                            >
                                                                {pluv.activo ? 'Activo' : 'Activar'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={savingPluv}
                                                                onClick={() => handleRemovePluviometro(pluv)}
                                                                aria-label={`Eliminar o desactivar pluviómetro ${pluv.nombre}`}
                                                                className="settings-icon-danger-btn"
                                                            >
                                                                <Trash2 size={18} aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* Gestión de Personal */}
                            {!collapsed.usuarios && (
                                <section id="settings-panel-usuarios" aria-labelledby="settings-heading-usuarios" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h2 id="settings-heading-usuarios" className="settings-section-heading">
                                        <Users size={20} color="var(--primary)" aria-hidden="true" /> Gestión de Personal
                                    </h2>
                                    <form onSubmit={handleCreateUser} aria-labelledby="settings-heading-usuarios">
                                        <div className="settings-form-grid-wide" style={{ marginBottom: '20px' }}>
                                            <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                                                <label htmlFor="settings-new-user-email">Correo Electrónico</label>
                                                <input id="settings-new-user-email" name="new_user_email" type="email" autoComplete="email" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="next" placeholder="trabajador@finca.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                                            </div>
                                            <div className="settings-field">
                                                <label htmlFor="settings-new-user-nombre">Nombre</label>
                                                <input id="settings-new-user-nombre" name="new_user_nombre" type="text" autoComplete="given-name" enterKeyHint="next" placeholder="Ej: Juan" value={newUserNombre} onChange={(e) => setNewUserNombre(e.target.value)} required />
                                            </div>
                                            <div className="settings-field">
                                                <label htmlFor="settings-new-user-apellido">Apellido</label>
                                                <input id="settings-new-user-apellido" name="new_user_apellido" type="text" autoComplete="family-name" enterKeyHint="next" placeholder="Ej: Pérez" value={newUserApellido} onChange={(e) => setNewUserApellido(e.target.value)} required />
                                            </div>
                                            <div className="settings-field">
                                                <label htmlFor="settings-new-user-pass">Contraseña Temporal</label>
                                                <input id="settings-new-user-pass" name="new_user_pass" type="text" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="next" aria-describedby="settings-user-pass-hint" value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} required />
                                                <span id="settings-user-pass-hint" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '-12px', marginBottom: '8px' }}>
                                                    ✉️ Se enviará automáticamente al correo junto con la guía de instalación.
                                                </span>
                                            </div>
                                            <div className="settings-field">
                                                <label htmlFor="settings-new-user-role">Perfil / Rol</label>
                                                <select id="settings-new-user-role" name="new_user_role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'vaquero' | 'observador')}>
                                                    <option value="vaquero">Trabajador / Vaquero</option>
                                                    <option value="observador">Visualizador / Observador</option>
                                                </select>
                                            </div>
                                        </div>

                                        <fieldset className="settings-fieldset" style={{ marginBottom: '20px' }}>
                                            <legend className="settings-legend" style={{ marginBottom: '10px' }}>Asignar a Fincas:</legend>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: '10px', padding: '14px', backgroundColor: 'var(--surface-inset)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                                                {fincasAdmin.map((f: any) => {
                                                    const isSelected = selectedFincas.includes(f.id_finca);
                                                    return (
                                                        <button
                                                            key={f.id_finca}
                                                            type="button"
                                                            aria-pressed={isSelected}
                                                            onClick={() => toggleFincaSelection(f.id_finca)}
                                                            className="settings-finca-option"
                                                            style={{
                                                                backgroundColor: isSelected ? 'var(--primary-soft-bg)' : 'var(--surface)',
                                                                color: 'var(--text-main)',
                                                                border: '1px solid',
                                                                borderColor: isSelected ? 'var(--primary)' : 'var(--border-subtle)'
                                                            }}
                                                        >
                                                            {isSelected ? <CheckSquare size={18} color="var(--primary)" aria-hidden="true" /> : <Square size={18} color="var(--text-muted)" aria-hidden="true" />}
                                                            <span style={{ fontSize: '0.88rem' }}>{f.nombre_finca}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </fieldset>
                                        <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', opacity: loading ? 0.65 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                                            <UserPlus size={18} aria-hidden="true" /> {loading ? 'Creando Usuario...' : 'Crear Usuario'}
                                        </button>
                                        {userFormMsg && (
                                            <div role={userFormMsg.type === 'error' ? 'alert' : 'status'} style={{
                                                marginTop: '16px',
                                                padding: '14px 16px',
                                                borderRadius: '10px',
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                backgroundColor: userFormMsg.type === 'success' ? 'var(--success-soft-bg)' : 'var(--error-soft-bg)',
                                                border: `1px solid ${userFormMsg.type === 'success' ? 'var(--success-soft-border)' : 'var(--error-soft-border)'}`,
                                                color: userFormMsg.type === 'success' ? 'var(--success)' : 'var(--error)'
                                            }}>
                                                {userFormMsg.text}
                                            </div>
                                        )}
                                    </form>
                                </section>
                            )}

                            {/* Contactos de Negocio */}
                            {!collapsed.contactosNegocio && (
                                <section id="settings-panel-contactosNegocio" aria-labelledby="settings-heading-negocios" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h2 id="settings-heading-negocios" className="settings-section-heading">
                                        <Briefcase size={20} color="var(--primary)" aria-hidden="true" /> Contactos de Negocios
                                    </h2>
                                    {renderInlineStatus('contactosNegocio')}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                                        <div>
                                            <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16} aria-hidden="true" /> Propietarios</h3>
                                            <form onSubmit={handleAddPropietario} className="settings-inline-add-form">
                                                <label htmlFor="settings-nuevo-propietario" className="settings-visually-hidden">Nombre de nuevo propietario</label>
                                                <input id="settings-nuevo-propietario" name="nuevo_propietario" type="text" enterKeyHint="done" placeholder="Nuevo Propietario" value={nuevoPropietario} onChange={e => setNuevoPropietario(e.target.value)} />
                                                <button type="submit" className="settings-inline-add-btn" disabled={loading} aria-label="Agregar propietario">
                                                    <Plus size={20} aria-hidden="true" />
                                                </button>
                                            </form>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: '10px' }}>
                                                {propietarios.map(p => (
                                                    <div key={p.id} className="settings-contact-chip">
                                                        <span className="settings-contact-name">{p.nombre}</span>
                                                        <button
                                                            type="button"
                                                            className="settings-icon-danger-btn"
                                                            onClick={() => removePropietario(p.id, p.nombre)}
                                                            aria-label={`Eliminar propietario ${p.nombre}`}
                                                        >
                                                            <Trash2 size={18} aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="settings-form-grid-wide" style={{ gap: '24px' }}>
                                            <div>
                                                <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Truck size={16} aria-hidden="true" /> Proveedores</h3>
                                                <form onSubmit={handleAddProveedor} className="settings-inline-add-form">
                                                    <label htmlFor="settings-nuevo-proveedor" className="settings-visually-hidden">Nombre de nuevo proveedor</label>
                                                    <input id="settings-nuevo-proveedor" name="nuevo_proveedor" type="text" enterKeyHint="done" placeholder="Nuevo Proveedor" value={nuevoProveedor} onChange={e => setNuevoProveedor(e.target.value)} />
                                                    <button type="submit" className="settings-inline-add-btn" disabled={loading} aria-label="Agregar proveedor">
                                                        <Plus size={20} aria-hidden="true" />
                                                    </button>
                                                </form>
                                                {proveedores.map(p => (
                                                    <div key={p.id} className="settings-contact-list-row">
                                                        <span className="settings-contact-name">{p.nombre}</span>
                                                        <button
                                                            type="button"
                                                            className="settings-icon-danger-btn"
                                                            onClick={() => removeProveedor(p.id, p.nombre)}
                                                            aria-label={`Eliminar proveedor ${p.nombre}`}
                                                        >
                                                            <Trash2 size={18} aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div>
                                                <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><ShoppingCart size={16} aria-hidden="true" /> Compradores</h3>
                                                <form onSubmit={handleAddComprador} className="settings-inline-add-form">
                                                    <label htmlFor="settings-nuevo-comprador" className="settings-visually-hidden">Nombre de nuevo comprador</label>
                                                    <input id="settings-nuevo-comprador" name="nuevo_comprador" type="text" enterKeyHint="done" placeholder="Nuevo Comprador" value={nuevoComprador} onChange={e => setNuevoComprador(e.target.value)} />
                                                    <button type="submit" className="settings-inline-add-btn" disabled={loading} aria-label="Agregar comprador">
                                                        <Plus size={20} aria-hidden="true" />
                                                    </button>
                                                </form>
                                                {compradores.map(c => (
                                                    <div key={c.id} className="settings-contact-list-row">
                                                        <span className="settings-contact-name">{c.nombre}</span>
                                                        <button
                                                            type="button"
                                                            className="settings-icon-danger-btn"
                                                            onClick={() => removeComprador(c.id, c.nombre)}
                                                            aria-label={`Eliminar comprador ${c.nombre}`}
                                                        >
                                                            <Trash2 size={18} aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Cargas Masivas */}
                            {!collapsed.cargasMasivas && (
                                <section id="settings-panel-cargasMasivas" aria-labelledby="settings-heading-cargas" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h2 id="settings-heading-cargas" className="settings-section-heading">
                                        <Upload size={20} color="var(--primary)" aria-hidden="true" /> Carga Masiva (CSV)
                                    </h2>
                                    <div className="settings-form-grid">
                                        <div style={{ padding: '18px', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                                            <FileText size={24} color="var(--primary)" aria-hidden="true" />
                                            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Inventario</h3>
                                            <button type="button" onClick={() => document.getElementById('bulkAnimalSettings')?.click()} style={{ width: '100%' }}>Subir CSV</button>
                                            <a href="/plantilla_animales.csv" download className="settings-plantilla-link">Descargar Plantilla</a>
                                            <input type="file" id="bulkAnimalSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkAnimalUpload} />
                                        </div>
                                        <div style={{ padding: '18px', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                                            <Maximize size={24} color="var(--primary)" aria-hidden="true" />
                                            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Pesajes</h3>
                                            <button type="button" onClick={() => document.getElementById('bulkPesajeSettings')?.click()} style={{ width: '100%' }}>Subir CSV</button>
                                            <a href="/plantilla_pesajes.csv" download className="settings-plantilla-link">Descargar Plantilla</a>
                                            <input type="file" id="bulkPesajeSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkPesajeUpload} />
                                        </div>
                                        <div style={{ padding: '18px', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                                            <Upload size={24} color="var(--primary)" aria-hidden="true" />
                                            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Rotaciones</h3>
                                            <button type="button" onClick={() => document.getElementById('bulkRotacionSettings')?.click()} style={{ width: '100%' }}>Subir CSV</button>
                                            <a href="/plantilla_rotaciones_potreros.csv" download className="settings-plantilla-link">Descargar Plantilla</a>
                                            <input type="file" id="bulkRotacionSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkRotacionesUpload} />
                                        </div>
                                    </div>

                                    {/* Tabla de Cargas Masivas de Hoy */}
                                    <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <h3 id="cargas-hoy-heading" style={{ fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                                <span>Cargas Masivas Realizadas Hoy</span>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                                                    {cargasMasivasHoy.length}
                                                </span>
                                            </h3>
                                        </div>
                                        <p className="settings-helper-text" style={{ marginBottom: '14px' }}>
                                            Si cometiste un error al cargar datos hoy, puedes revertir la carga. Esta opción está disponible únicamente durante el día de la carga (a medianoche se cierra por seguridad).
                                        </p>
                                        {cargasMasivasHoy.length === 0 ? (
                                            <div style={{ padding: '18px', textAlign: 'center', backgroundColor: 'var(--surface-inset)', borderRadius: '8px', border: '1px dashed var(--border-strong)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                No se han realizado cargas masivas el día de hoy.
                                            </div>
                                        ) : (
                                            <div tabIndex={0} role="region" aria-labelledby="cargas-hoy-heading" className="settings-table-wrapper">
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">Tipo</th>
                                                            <th scope="col">Archivo</th>
                                                            <th scope="col">Registros</th>
                                                            <th scope="col">Hora</th>
                                                            <th scope="col" style={{ textAlign: 'right' }}>Deshacer</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {cargasMasivasHoy.map(c => (
                                                            <tr key={c.id}>
                                                                <td data-label="Tipo">
                                                                    <span style={{
                                                                        padding: '3px 8px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 'bold',
                                                                        backgroundColor: c.tipo === 'animales' ? 'var(--success-soft-bg)' : 'var(--info-soft-bg)',
                                                                        color: c.tipo === 'animales' ? 'var(--success)' : 'var(--info)',
                                                                        border: `1px solid ${c.tipo === 'animales' ? 'var(--success-soft-border)' : 'var(--info-soft-border)'}`
                                                                    }}>
                                                                        {c.tipo === 'animales' ? 'Inventario' : 'Pesajes'}
                                                                    </span>
                                                                </td>
                                                                <td data-label="Archivo" style={{ fontWeight: '500', overflowWrap: 'anywhere' }}>{c.nombre_archivo || 'Archivo CSV'}</td>
                                                                <td data-label="Registros">{c.total_registros}</td>
                                                                <td data-label="Hora" style={{ color: 'var(--text-muted)' }}>
                                                                    {new Date(c.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </td>
                                                                <td className="settings-table-actions" style={{ textAlign: 'right' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRevertirCargaMasiva(c)}
                                                                        aria-label={`Deshacer carga masiva ${c.nombre_archivo || 'Archivo CSV'}`}
                                                                        className="settings-revert-btn"
                                                                    >
                                                                        <Trash2 size={16} aria-hidden="true" />
                                                                        <span>Deshacer</span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </div>

            {loading && (
                <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[3000] p-4" style={{ backgroundColor: 'var(--backdrop-scrim)' }}>
                    <div className="rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}>
                        <div className="relative w-20 h-20 mx-auto mb-6">
                            <div className="absolute inset-0 border-4 rounded-full" style={{ borderColor: 'var(--primary-soft-border)' }}></div>
                            <div className="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}></div>
                        </div>
                        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-main)' }}>Procesando...</h3>
                        <p className="mb-6" style={{ color: 'var(--text-muted)' }}>Por favor espera un momento mientras guardamos los datos.</p>
                        
                        {importProgress && (
                            <div className="w-full rounded-full h-3 mb-2 overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                                <div 
                                    className="h-full transition-all duration-300 ease-out"
                                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%`, backgroundColor: 'var(--primary)' }}
                                ></div>
                            </div>
                        )}
                        {importProgress && (
                            <p className="text-sm font-medium" style={{ color: 'var(--primary-light)' }}>
                                {importProgress.current} de {importProgress.total} registros
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
