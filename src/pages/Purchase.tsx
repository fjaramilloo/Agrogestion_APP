import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useConnection } from '../contexts/ConnectionContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useIsMobile } from '../hooks/useIsMobile';
import ModalUpsell from '../components/ModalUpsell';
import { LicenseBlockedBanner } from '../components/LicenseBlockedBanner';
import { getLicenseBlockState } from '../utils/licenseUtils';
import { ShoppingCart, Plus, Trash2, CheckCircle2, Calendar, Wifi, WifiOff, UploadCloud, Info, X } from 'lucide-react';
import PurchaseReport from '../components/PurchaseReport';
import PurchaseReportSimple from '../components/PurchaseReportSimple';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../utils/decimalInput';
import { useModalDialog } from '../hooks/useModalDialog';
import './TradeOperations.css';

interface OfflinePurchasePayload {
    id: string;
    fechaIngreso: string;
    animales: AnimalCompra[];
    selectedProveedor: string;
    observaciones: string;
    incluirPesoCompra: boolean;
    pesoCompraTotal: string;
    selectedPotrerada: string;
}

interface AnimalCompra {
    numero_chapeta: string;
    peso_ingreso: string;
    peso_compra?: string;
    propietario: string;
    id_potrerada?: string;
    sexo?: string;
    tipo_macho?: 'novillo' | 'toro';
    etapa?: string;
}

export default function Purchase() {
    const { fincaId, role, userFincas, licenciaInfo, refreshLicencia } = useAuth();
    const { modoCampo, toggleModoCampo, isOnline } = useConnection();
    const { confirmAction } = useFeedback();
    const isMobile = useIsMobile();
    const { isBloqueado } = getLicenseBlockState(licenciaInfo, true);
    const [showUpsellModal, setShowUpsellModal] = useState(false);
    const [cantidad, setCantidad] = useState('1');
    const [fechaIngreso, setFechaIngreso] = useState(getLocalIsoDate());
    const [animales, setAnimales] = useState<AnimalCompra[]>([]);
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);
    const [proveedores, setProveedores] = useState<{ id: string, nombre: string }[]>([]);
    const [selectedProveedor, setSelectedProveedor] = useState('');
    const [selectedPropietario, setSelectedPropietario] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [incluirPesoCompra, setIncluirPesoCompra] = useState(false);
    const [pesoCompraTotal, setPesoCompraTotal] = useState('');
    const [potreradas, setPotreradas] = useState<{ id: string, nombre: string }[]>([]);
    const [selectedPotrerada, setSelectedPotrerada] = useState('');

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Offline / Sync State
    const [offlineQueue, setOfflineQueue] = useState<OfflinePurchasePayload[]>([]);
    const [syncing, setSyncing] = useState(false);

    // Reporte
    const [showReport, setShowReport] = useState(false);
    const [reportData, setReportData] = useState<{ fechaIngreso: string, animales: AnimalCompra[], pesoCompraTotal?: number } | null>(null);
    const [lastTags, setLastTags] = useState<{ owner: string, tag: string }[]>([]);
    const [existingTags, setExistingTags] = useState<Set<string>>(new Set());
    const [showLastTags, setShowLastTags] = useState(false);

    // Compra Rápida (Volátil — NO guarda en DB)
    const [showQuickModal, setShowQuickModal] = useState(false);
    const [quickProveedor, setQuickProveedor] = useState('');
    const [quickKgComprados, setQuickKgComprados] = useState('');
    const [quickAnimalCount, setQuickAnimalCount] = useState('1');
    const [quickWeights, setQuickWeights] = useState<string[]>(['']);
    const [quickError, setQuickError] = useState('');
    const [showQuickReport, setShowQuickReport] = useState(false);
    const [quickReportData, setQuickReportData] = useState<{ proveedor: string; fecha: string; animales: { numero_chapeta: string; peso_ingreso: number }[]; pesoCompraTotal: number } | null>(null);

    useEffect(() => {
        const loadQueue = () => {
            const saved = localStorage.getItem('agrogestion_compras_offline');
            if (saved) {
                try { setOfflineQueue(JSON.parse(saved)); } catch {}
            } else {
                setOfflineQueue([]);
            }
        };
        loadQueue();
        window.addEventListener('offline-queue-changed', loadQueue);
        return () => window.removeEventListener('offline-queue-changed', loadQueue);
    }, []);

    useEffect(() => {
        if (!fincaId) return;
        const fetchPropietarios = async () => {
            const { data } = await supabase
                .from('propietarios')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setPropietarios(data);

            const { data: provData } = await supabase
                .from('proveedores')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (provData) setProveedores(provData);

            const { data: potData } = await supabase
                .from('potreradas')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (potData) setPotreradas(potData);

            // Fetch last tags logic
            await fetchLastTags();
        };
        fetchPropietarios();
    }, [fincaId]);

    const fetchLastTags = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('animales')
            .select('numero_chapeta, nombre_propietario, fecha_ingreso')
            .eq('id_finca', fincaId)
            .eq('estado', 'activo');

        if (error || !data) return;

        const owners = Array.from(new Set(data.map(a => a.nombre_propietario)));
        
        const latest = owners.map(owner => {
            const ownerAnimals = data.filter(d => d.nombre_propietario === owner);
            if (ownerAnimals.length === 0) return { owner: owner || 'Sin dueño', tag: 'N/A' };

            // 1. Encontrar la fecha de ingreso más reciente para este propietario
            const maxDateStr = ownerAnimals.reduce((max, curr) => {
                const fCurr = curr.fecha_ingreso || '';
                return fCurr > max ? fCurr : max;
            }, '');

            // 2. Filtrar solo los animales que entraron en esa última fecha
            const latestBatch = ownerAnimals.filter(d => (d.fecha_ingreso || '') === maxDateStr);

            // 3. Extraer el primer número que aparezca en la chapeta y encontrar el mayor
            const extractNum = (str: string) => {
                const match = str.match(/\d+/);
                return match ? parseInt(match[0], 10) : 0;
            };

            const topAnimal = latestBatch.reduce((maxAnimal, currAnimal) => {
                const maxNum = extractNum(maxAnimal.numero_chapeta || '');
                const currNum = extractNum(currAnimal.numero_chapeta || '');
                return currNum > maxNum ? currAnimal : maxAnimal;
            }, latestBatch[0]);

            return { owner: owner || 'Sin dueño', tag: topAnimal.numero_chapeta || 'N/A' };
        });

        setLastTags(latest);
        setExistingTags(new Set(data.map(a => a.numero_chapeta?.trim().toUpperCase() || '')));
    };

    const generarFilas = (e: React.FormEvent) => {
        e.preventDefault();
        const dateError = getGanadoDateError(fechaIngreso, 'La fecha de entrada');
        if (dateError) {
            setMsjError(dateError);
            return;
        }
        const num = parseInt(cantidad);
        if (isNaN(num) || num <= 0) return;

        const nuevasFilas: AnimalCompra[] = Array.from({ length: num }, () => ({
            numero_chapeta: '',
            peso_ingreso: '',
            propietario: selectedPropietario
        }));
        setAnimales(nuevasFilas);
        setMsjExito('');
        setMsjError('');
    };

    const updateAnimal = (index: number, field: keyof AnimalCompra, value: string) => {
        const newAnimales = [...animales];
        newAnimales[index] = { ...newAnimales[index], [field]: value };
        setAnimales(newAnimales);
    };

    const removeFila = (index: number) => {
        setAnimales(animales.filter((_, i) => i !== index));
    };

    const [showConfirm, setShowConfirm] = useState(false);
    const confirmDialogProps = useModalDialog(showConfirm, () => setShowConfirm(false), true);
    const quickDialogProps = useModalDialog(showQuickModal, () => setShowQuickModal(false), true);

    const handleIngresarCompra = async () => {
        if (!fincaId || animales.length === 0) return;

        if (isBloqueado || (licenciaInfo && (licenciaInfo.totalAnimalesOrganizacion + animales.length) > licenciaInfo.limiteAnimales)) {
            setShowUpsellModal(true);
            return;
        }

        setLoading(true);
        setMsjError('');

        // Validar conexión: respeta Modo Campo forzado o conexión activa
        const effectiveOnline = isOnline;

        try {
            const dateError = getGanadoDateError(fechaIngreso, 'La fecha de entrada');
            if (dateError) throw new Error(dateError);
            if (!selectedProveedor) throw new Error("Debe seleccionar un Vendedor/Proveedor para la compra.");

            const chapetas = animales.map(a => a.numero_chapeta.trim().toUpperCase());
            if (chapetas.some(c => !c)) throw new Error("Todas las chapetas son obligatorias.");
            
            // Validar duplicados internos (insensible a mayúsculas)
            if (new Set(chapetas).size !== chapetas.length) {
                const duplicados = chapetas.filter((item, index) => chapetas.indexOf(item) !== index);
                throw new Error(`Hay chapetas repetidas en la lista actual: ${Array.from(new Set(duplicados)).join(', ')}`);
            }

            animales.forEach(a => {
                const peso = parseDecimalInput(a.peso_ingreso);
                if (isNaN(peso) || peso <= 0) throw new Error(`Peso inválido para ${a.numero_chapeta}`);
                if (!a.propietario) throw new Error(`Falta propietario para ${a.numero_chapeta}`);
            });

            // Registro de chapetas existentes en la base de datos (sólo si hay conexión efectiva)
            if (effectiveOnline) {
                const { data: existentes, error: checkError } = await supabase
                    .from('animales')
                    .select('numero_chapeta')
                    .eq('id_finca', fincaId)
                    .in('numero_chapeta', chapetas);

                if (checkError) throw checkError;

                if (existentes && existentes.length > 0) {
                    const caps = existentes.map(e => e.numero_chapeta).join(', ');
                    throw new Error(`Las siguientes chapetas ya están registradas en esta finca: ${caps}`);
                }
            }

            setShowConfirm(true);
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const confirmAndInsert = async () => {
        setLoading(true);
        setMsjError('');
        setMsjExito('');
        setShowConfirm(false);

        // Validación de conexión efectiva
        const effectiveOnline = isOnline;

        console.log("Iniciando proceso de guardado en base de datos. Estado:", effectiveOnline ? "Online" : "Offline / Modo Campo");

        try {
            if (!fincaId) throw new Error("No se pudo identificar la finca activa.");
            if (animales.length === 0) throw new Error("La lista de animales está vacía.");

            if (!effectiveOnline) {
                console.log("Modo offline detectado. Guardando en cola local.");
                const newPayload: OfflinePurchasePayload = {
                    id: Date.now().toString(),
                    fechaIngreso,
                    animales: [...animales],
                    selectedProveedor,
                    observaciones,
                    incluirPesoCompra,
                    pesoCompraTotal,
                    selectedPotrerada
                };
                const newQueue = [...offlineQueue, newPayload];
                setOfflineQueue(newQueue);
                localStorage.setItem('agrogestion_compras_offline', JSON.stringify(newQueue));
                window.dispatchEvent(new CustomEvent('offline-queue-changed'));
                
                setMsjExito(`¡Guardado localmente! Lote de ${animales.length} animales guardado en la cola offline.`);
                handleReset();
                setLoading(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            // Sanitización de propietarios (trim)
            const uniquePropietarios = Array.from(new Set(animales.map(a => a.propietario.trim())));
            
            const potreradasPayload = uniquePropietarios.map(prop => ({
                id_finca: fincaId,
                nombre: `Levante ${prop}`,
                etapa: 'levante'
            }));
            
            console.log("Creando/Actualizando potreradas...", potreradasPayload);
            const { data: potreradasCreadas, error: potError } = await supabase
                .from('potreradas')
                .upsert(potreradasPayload, { onConflict: 'id_finca,nombre' })
                .select('id, nombre');
                
            if (potError) throw potError;
            
            const potreradaIdPorPropietario = new Map();
            if (potreradasCreadas) {
                potreradasCreadas.forEach((p: any) => {
                    const propMatch = uniquePropietarios.find(prop => p.nombre === `Levante ${prop}`);
                    if (propMatch) {
                        potreradaIdPorPropietario.set(propMatch, p.id);
                    }
                });
            }

            const parsedPesoCompraTotal = parseDecimalInput(pesoCompraTotal);
            const pesoCompTotalNum = incluirPesoCompra && !isNaN(parsedPesoCompraTotal) ? parsedPesoCompraTotal : 0;
            const totalPesoIngresoLote = animales.reduce((acc, a) => acc + (parseDecimalInput(a.peso_ingreso) || 0), 0);
            const ratioPesoCompra = (incluirPesoCompra && pesoCompTotalNum > 0 && totalPesoIngresoLote > 0) 
                ? (pesoCompTotalNum / totalPesoIngresoLote) 
                : 1;

            const records = animales.map(a => {
                const propTrim = a.propietario.trim();
                const pesoIngresoNum = parseDecimalInput(a.peso_ingreso);
                return {
                    id_finca: fincaId,
                    numero_chapeta: a.numero_chapeta.trim().toUpperCase(),
                    nombre_propietario: propTrim,
                    id_potrerada: selectedPotrerada ? selectedPotrerada : (potreradaIdPorPropietario.get(propTrim) || null),
                    peso_ingreso: Math.round(pesoIngresoNum),
                    peso_compra: incluirPesoCompra ? Math.round(pesoIngresoNum * ratioPesoCompra) : null,
                    fecha_ingreso: fechaIngreso,
                    proveedor_compra: selectedProveedor,
                    observaciones_compra: observaciones,
                    etapa: 'levante',
                    especie: 'bovino',
                    sexo: 'M',
                    estado: 'activo'
                };
            });

            console.log("Insertando animales en DB...", records);
            const { error } = await supabase.from('animales').insert(records);
            if (error) throw error;

            setMsjExito(`¡Éxito! Se crearon ${records.length} animales correctamente.`);
            
            // Actualizar últimas chapetas informativas
            await fetchLastTags();

            // Guardar para el reporte antes de limpiar
            setReportData({
                fechaIngreso: fechaIngreso,
                animales: [...animales],
                pesoCompraTotal: incluirPesoCompra && pesoCompTotalNum > 0 ? pesoCompTotalNum : undefined
            });
            setShowReport(true);
            if (refreshLicencia) await refreshLicencia();

            setAnimales([]);
            setCantidad('1');
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err: any) {
            console.error("Error al registrar compra:", err);
            setMsjError(err.message || "Ocurrió un error inesperado al guardar los datos.");
            setLoading(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setLoading(false);
        }

    };

    const handleReset = () => {
        setAnimales([]);
        setCantidad('1');
        setMsjError('');
        setMsjExito('');
        setSelectedProveedor('');
        setSelectedPropietario('');
        setObservaciones('');
        setIncluirPesoCompra(false);
        setPesoCompraTotal('');
    };

    if (role === 'observador') {
        return <div className="page-container text-center">Acceso denegado.</div>;
    }

    const syncOfflineQueue = async () => {
        if (!fincaId || offlineQueue.length === 0 || !isOnline) return;
        setSyncing(true);
        setMsjError('');
        setMsjExito('');
        let syncedCount = 0;
        let newQueue = [...offlineQueue];

        try {
            for (const payload of offlineQueue) {
                const chapetas = payload.animales.map(a => a.numero_chapeta.trim().toUpperCase());
                
                // Validar duplicados internos en el lote offline
                if (new Set(chapetas).size !== chapetas.length) {
                    const duplicados = chapetas.filter((item, index) => chapetas.indexOf(item) !== index);
                    throw new Error(`Lote offline del ${payload.fechaIngreso}: Tiene chapetas duplicadas internamente (${Array.from(new Set(duplicados)).join(', ')}).`);
                }

                const { data: existentes } = await supabase
                    .from('animales')
                    .select('numero_chapeta')
                    .eq('id_finca', fincaId)
                    .in('numero_chapeta', chapetas);
                
                if (existentes && existentes.length > 0) {
                    throw new Error(`Lote offline del ${payload.fechaIngreso}: Estas chapetas ya existen en la base de datos (${existentes.map(e => e.numero_chapeta).join(', ')}).`);
                }

                const uniquePropietarios = Array.from(new Set(payload.animales.map(a => a.propietario)));
                
                const potreradasPayload = uniquePropietarios.map(prop => ({
                    id_finca: fincaId,
                    nombre: `Levante ${prop}`,
                    etapa: 'levante'
                }));
                
                const { data: potreradasCreadas, error: potError } = await supabase
                    .from('potreradas')
                    .upsert(potreradasPayload, { onConflict: 'id_finca,nombre' })
                    .select('id, nombre');
                if (potError) throw potError;
                
                const potreradaIdPorPropietario = new Map();
                if (potreradasCreadas) {
                    potreradasCreadas.forEach((p: any) => {
                        const propMatch = uniquePropietarios.find(prop => p.nombre === `Levante ${prop}`);
                        if (propMatch) potreradaIdPorPropietario.set(propMatch, p.id);
                    });
                }

                const parsedPesoCompraTotal = parseDecimalInput(payload.pesoCompraTotal);
                const pesoCompTotalNum = payload.incluirPesoCompra && !isNaN(parsedPesoCompraTotal) ? parsedPesoCompraTotal : 0;
                const totalPesoIngresoLote = payload.animales.reduce((acc, a) => acc + (parseDecimalInput(a.peso_ingreso) || 0), 0);
                const ratioPesoCompra = (payload.incluirPesoCompra && pesoCompTotalNum > 0 && totalPesoIngresoLote > 0) 
                    ? (pesoCompTotalNum / totalPesoIngresoLote) 
                    : 1;

                const records = payload.animales.map(a => {
                    const pesoIngresoNum = parseDecimalInput(a.peso_ingreso);
                    return {
                        id_finca: fincaId,
                        numero_chapeta: a.numero_chapeta.trim().toUpperCase(),
                        nombre_propietario: a.propietario,
                        id_potrerada: payload.selectedPotrerada ? payload.selectedPotrerada : (potreradaIdPorPropietario.get(a.propietario) || null),
                        peso_ingreso: Math.round(pesoIngresoNum),
                        peso_compra: payload.incluirPesoCompra ? Math.round(pesoIngresoNum * ratioPesoCompra) : null,
                        fecha_ingreso: payload.fechaIngreso,
                        proveedor_compra: payload.selectedProveedor,
                        observaciones_compra: payload.observaciones,
                        etapa: 'levante',
                        especie: 'bovino',
                        sexo: 'M',
                        estado: 'activo'
                    };
                });

                const { error } = await supabase.from('animales').insert(records);
                if (error) throw error;

                syncedCount++;
                newQueue = newQueue.filter(q => q.id !== payload.id);
            }

            if (syncedCount > 0) {
                setOfflineQueue(newQueue);
                localStorage.setItem('agrogestion_compras_offline', JSON.stringify(newQueue));
                setMsjExito(`¡Sincronización completa! Se subieron ${syncedCount} lotes.`);
            }

        } catch (err: any) {
            setOfflineQueue(newQueue);
            localStorage.setItem('agrogestion_compras_offline', JSON.stringify(newQueue));
            setMsjError('Error al sincronizar cola: ' + err.message);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="page-container trade-page purchase-page">
            {/* Modal nativo de Confirmación */}
            <dialog
                {...confirmDialogProps}
                aria-labelledby="purchase-confirm-title"
                className="trade-dialog"
            >
                {showConfirm && (
                    <div className="trade-dialog-confirm-body">
                        <ShoppingCart size={40} color="var(--primary)" aria-hidden="true" style={{ marginBottom: '16px' }} />
                        <h2 id="purchase-confirm-title" style={{ marginBottom: '12px' }}>Validar Información</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                            ¿Estás seguro de ingresar estos <b>{animales.length} animales</b>? <br />
                            Fecha de entrada: <b>{fechaIngreso}</b>
                        </p>
                        <div className="trade-dialog-confirm-actions">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => setShowConfirm(false)}
                                className="trade-dialog-cancel-btn"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmAndInsert}
                                style={{ backgroundColor: 'var(--primary)' }}
                            >
                                Sí, ingresar ahora
                            </button>
                        </div>
                    </div>
                )}
            </dialog>

            <div className="trade-header">
                <div className="trade-header-main">
                    <h1 className="title">
                        <ShoppingCart size={32} aria-hidden="true" /> Registrar Compra
                    </h1>
                    <p className="trade-subtitle">Módulo para el registro masivo de animales nuevos.</p>
                </div>

                <div className="trade-header-actions">
                    <button
                        type="button"
                        onClick={toggleModoCampo}
                        title="Clic para cambiar entre Modo Campo (Offline) y En Línea"
                        className="trade-status-pill"
                        style={{
                            backgroundColor: modoCampo ? 'var(--secondary-soft-bg)' : isOnline ? 'var(--success-soft-bg)' : 'var(--warning-soft-bg)',
                            color: modoCampo ? 'var(--secondary)' : isOnline ? 'var(--success)' : 'var(--warning)',
                            border: modoCampo ? '1px solid var(--secondary-soft-border)' : '1px solid var(--border-subtle)',
                        }}
                    >
                        {modoCampo ? <>🚜 Modo Campo</> : isOnline ? <><Wifi size={14} aria-hidden="true" /> Online</> : <><WifiOff size={14} aria-hidden="true" /> Offline</>}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setQuickProveedor('');
                            setQuickKgComprados('');
                            setQuickAnimalCount('1');
                            setQuickWeights(['']);
                            setQuickError('');
                            setShowQuickModal(true);
                        }}
                        className="trade-quick-btn"
                    >
                        <ShoppingCart size={15} aria-hidden="true" /> Compra Rápida
                    </button>

                    {offlineQueue.length > 0 && isOnline && (
                        <div className="trade-queue-actions">
                            <button
                                type="button"
                                onClick={syncOfflineQueue}
                                disabled={syncing}
                                className="trade-sync-btn trade-sync-btn--primary"
                            >
                                <UploadCloud size={15} aria-hidden="true" /> {syncing ? 'Subiendo...' : `Subir (${offlineQueue.length})`}
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const confirmed = await confirmAction('¿Estás seguro de limpiar la cola de pendientes? Esto borrará los lotes que no se han subido.', {
                                        title: 'Limpiar cola offline',
                                        confirmLabel: 'Sí, limpiar',
                                        destructive: true,
                                    });
                                    if (confirmed) {
                                        setOfflineQueue([]);
                                        localStorage.removeItem('agrogestion_compras_offline');
                                        setMsjExito('Cola de pendientes limpiada correctamente.');
                                    }
                                }}
                                className="trade-clear-queue-btn"
                                title="Limpiar todos los pendientes"
                                aria-label="Limpiar cola de compras pendientes"
                            >
                                <Trash2 size={18} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <LicenseBlockedBanner
                licenciaInfo={licenciaInfo}
                onUpgradeClick={() => setShowUpsellModal(true)}
                blockAtLimit
                overLimitTitle="Capacidad del Plan Superada:"
                expiredDetail="Para registrar nuevas compras e ingresar ganado al hato, renueva tu suscripción."
                overLimitDetail="Para registrar nuevas compras e ingresar ganado al hato, actualiza tu suscripción."
            />

            {/* MODAL NATIVO COMPRA RÁPIDA (completamente volátil, no guarda en DB) */}
            <dialog
                {...quickDialogProps}
                aria-labelledby="purchase-quick-title"
                className="trade-dialog trade-dialog--wide trade-dialog--info"
            >
                {showQuickModal && (() => {
                    const totalRecibido = quickWeights.reduce((acc, w) => acc + (parseDecimalInput(w) || 0), 0);
                    const kgCompradosNum = parseDecimalInput(quickKgComprados) || 0;
                    const mermaPorc = (kgCompradosNum > 0 && totalRecibido > 0) ? ((kgCompradosNum - totalRecibido) / kgCompradosNum * 100) : 0;
                    const countNum = parseInt(quickAnimalCount) || 1;

                    return (
                        <div className="trade-dialog-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px' }}>
                                <h2 id="purchase-quick-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.2rem' }}>
                                    <ShoppingCart size={22} color="var(--info)" aria-hidden="true" style={{ flexShrink: 0 }} /> Compra Rápida — Calculadora de Merma
                                </h2>
                                <button
                                    type="button"
                                    aria-label="Cerrar calculadora de merma"
                                    onClick={() => setShowQuickModal(false)}
                                    className="trade-dialog-close-btn"
                                >
                                    <X size={24} aria-hidden="true" />
                                </button>
                            </div>

                            {quickError && (
                                <div role="alert" className="trade-feedback trade-feedback--error" style={{ marginBottom: '16px' }}>
                                    {quickError}
                                </div>
                            )}

                            <div className="purchase-quick-fields">
                                <div>
                                    <label htmlFor="quick-proveedor">Vendedor / Proveedor</label>
                                    <select
                                        id="quick-proveedor"
                                        autoFocus={!isMobile}
                                        value={quickProveedor}
                                        onChange={e => {
                                            setQuickProveedor(e.target.value);
                                            if (quickError) setQuickError('');
                                        }}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="quick-kg-comprados">Kg Comprados (Origen / Báscula Proveedor)</label>
                                    <input
                                        id="quick-kg-comprados"
                                        type="text"
                                        inputMode="decimal"
                                        value={quickKgComprados}
                                        onChange={e => {
                                            setQuickKgComprados(sanitizeDecimalInput(e.target.value));
                                            if (quickError) setQuickError('');
                                        }}
                                        placeholder="Ej. 6216"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="quick-animal-count">Nro. de Animales</label>
                                    <input
                                        id="quick-animal-count"
                                        type="number"
                                        min="1"
                                        max="100"
                                        inputMode="numeric"
                                        value={quickAnimalCount}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setQuickAnimalCount(val);
                                            const num = parseInt(val) || 0;
                                            if (num > 0 && num <= 100) {
                                                setQuickWeights(prev => {
                                                    const next = [...prev];
                                                    if (num > next.length) for (let i = next.length; i < num; i++) next.push('');
                                                    else next.splice(num);
                                                    return next;
                                                });
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Indicador de Merma en vivo */}
                            <div className="purchase-merma-grid">
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kg Comprados</div>
                                    <div className="purchase-merma-value">{kgCompradosNum.toLocaleString()} <small style={{ fontSize: '0.85rem' }}>kg</small></div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kg Recibidos</div>
                                    <div className="purchase-merma-value">{totalRecibido.toLocaleString()} <small style={{ fontSize: '0.85rem' }}>kg</small></div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>% Merma</div>
                                    <div className="purchase-merma-pct" style={{ color: mermaPorc > 0 ? 'var(--error)' : 'var(--success)' }}>
                                        {mermaPorc.toFixed(2)}%
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Peso Promedio</div>
                                    <div className="purchase-merma-value">{(totalRecibido / countNum).toFixed(1)} <small style={{ fontSize: '0.85rem' }}>kg</small></div>
                                </div>
                            </div>

                            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                                <legend style={{ marginBottom: '10px', fontWeight: 'bold', padding: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Pesos Individuales — Báscula Finca (kg)</legend>
                                <div className="purchase-quick-weights">
                                    {quickWeights.map((w, i) => (
                                        <div key={i} style={{ position: 'relative' }}>
                                            <span aria-hidden="true" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: 'var(--text-muted)', pointerEvents: 'none' }}>{i + 1}</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                aria-label={`Peso animal ${i + 1} en kilogramos`}
                                                value={w}
                                                onChange={e => {
                                                    const newW = [...quickWeights];
                                                    newW[i] = sanitizeDecimalInput(e.target.value);
                                                    setQuickWeights(newW);
                                                }}
                                                style={{ paddingLeft: '24px', textAlign: 'right', marginBottom: 0, fontSize: '1rem' }}
                                                placeholder="0,0"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </fieldset>

                            <div className="purchase-quick-footer">
                                <button
                                    type="button"
                                    onClick={() => setShowQuickModal(false)}
                                    className="trade-dialog-cancel-btn"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const kgCompradosParsed = parseDecimalInput(quickKgComprados);
                                        if (!quickProveedor || !quickKgComprados || isNaN(kgCompradosParsed) || kgCompradosParsed <= 0) {
                                            setQuickError('Selecciona el proveedor y los Kg comprados.');
                                            return;
                                        }
                                        const animalsForReport = quickWeights.map((w, idx) => ({ numero_chapeta: `A${idx + 1}`, peso_ingreso: parseDecimalInput(w) || 0 }));
                                        setQuickReportData({
                                            proveedor: quickProveedor,
                                            fecha: getLocalIsoDate(),
                                            animales: animalsForReport,
                                            pesoCompraTotal: kgCompradosParsed
                                        });
                                        setShowQuickModal(false);
                                        setShowQuickReport(true);
                                    }}
                                    style={{ backgroundColor: 'var(--info)', color: 'var(--on-primary)' }}
                                >
                                    <CheckCircle2 size={18} aria-hidden="true" /> Generar Reporte de Merma
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </dialog>

            {msjExito && <div role="status" aria-live="polite" className="trade-feedback trade-feedback--success">{msjExito}</div>}
            {msjError && <div role="alert" aria-live="assertive" className="trade-feedback trade-feedback--error">{msjError}</div>}

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <button
                    type="button"
                    aria-expanded={showLastTags}
                    aria-controls="purchase-last-tags-panel"
                    onClick={() => setShowLastTags(!showLastTags)}
                    className="purchase-last-tags-btn"
                    style={{
                        backgroundColor: showLastTags ? '#f59e0b' : 'var(--secondary-soft-bg)',
                        color: showLastTags ? '#111812' : 'var(--secondary)',
                    }}
                >
                    <Info size={18} color={showLastTags ? '#111812' : 'var(--secondary)'} aria-hidden="true" /> {showLastTags ? 'Ocultar últimas chapetas' : 'Ver últimas chapetas por dueño'}
                </button>
            </div>

            {showLastTags && (
                <div id="purchase-last-tags-panel" className="card" style={{ marginBottom: '24px', border: '1px solid var(--primary)', animation: 'fadeIn 0.3s ease' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Info size={18} color="var(--primary)" aria-hidden="true" /> Últimas Chapetas Registradas
                    </h3>
                    <div className="purchase-last-tags-grid">
                        {lastTags.length > 0 ? lastTags.map((lt, idx) => (
                            <div key={idx} style={{ padding: '12px', backgroundColor: 'var(--surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lt.owner}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{lt.tag}</div>
                            </div>
                        )) : (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay datos suficientes para calcular las últimas chapetas.</p>
                        )}
                    </div>
                </div>
            )}

            <div className="card trade-form-card">
                <form onSubmit={generarFilas} className="trade-form">
                    <div className="trade-form-row">
                        <div className="trade-field">
                            <label htmlFor="purchase-fecha">Fecha de Entrada</label>
                            <div className="trade-date-wrap">
                                <Calendar size={18} aria-hidden="true" className="trade-date-icon" />
                                <input
                                    id="purchase-fecha"
                                    type="date"
                                    min={MIN_GANADO_DATE}
                                    value={fechaIngreso}
                                    onChange={e => setFechaIngreso(e.target.value)}
                                    className="trade-date-input"
                                    disabled={loading || animales.length > 0}
                                />
                            </div>
                        </div>

                        <div className="trade-field--wide">
                            <label htmlFor="purchase-proveedor">Vendedor / Proveedor</label>
                            <select
                                id="purchase-proveedor"
                                value={selectedProveedor}
                                onChange={e => setSelectedProveedor(e.target.value)}
                                disabled={loading || animales.length > 0}
                                required
                            >
                                <option value="">Seleccione un Proveedor...</option>
                                {proveedores.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="trade-field--wide">
                            <label htmlFor="purchase-propietario">Propietario (General)</label>
                            <select
                                id="purchase-propietario"
                                value={selectedPropietario}
                                onChange={e => {
                                    const val = e.target.value;
                                    setSelectedPropietario(val);
                                    // Si ya hay animales en la lista, los actualizamos todos con este dueño
                                    if (animales.length > 0 && val) {
                                        setAnimales(prev => prev.map(a => ({ ...a, propietario: val })));
                                    }
                                }}
                                disabled={loading}
                            >
                                <option value="">Dueños compartidos / Varios...</option>
                                {propietarios.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="trade-field--wide">
                            <label htmlFor="purchase-potrerada">Potrerada Destino</label>
                            <select
                                id="purchase-potrerada"
                                value={selectedPotrerada}
                                onChange={e => setSelectedPotrerada(e.target.value)}
                                disabled={loading || animales.length > 0}
                            >
                                <option value="">Auto: "Levante [Propietario]"</option>
                                {potreradas.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="trade-form-row">
                        <div className="trade-field--full">
                            <label htmlFor="purchase-observaciones">Observaciones de la Compra</label>
                            <input
                                id="purchase-observaciones"
                                type="text"
                                placeholder="Ej: Lote comprado en subasta, buena genética..."
                                value={observaciones}
                                onChange={e => setObservaciones(e.target.value)}
                                disabled={loading || animales.length > 0}
                            />
                        </div>
                    </div>

                    <div className="purchase-checkbox-box">
                        <label htmlFor="checkPesoCompra" className="purchase-checkbox-label">
                            <input
                                type="checkbox"
                                id="checkPesoCompra"
                                checked={incluirPesoCompra}
                                onChange={e => setIncluirPesoCompra(e.target.checked)}
                                className="purchase-checkbox-input"
                                disabled={loading || animales.length > 0}
                            />
                            <span>¿Incluir Peso de Compra del lote?</span>
                        </label>

                        {incluirPesoCompra && (
                            <div style={{ maxWidth: '300px' }}>
                                <label htmlFor="purchase-peso-total">Peso Total de Compra (kg)</label>
                                <input
                                    id="purchase-peso-total"
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Peso total pagado..."
                                    value={pesoCompraTotal}
                                    onChange={e => setPesoCompraTotal(sanitizeDecimalInput(e.target.value))}
                                    disabled={loading || animales.length > 0}
                                    style={{ marginBottom: 0 }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="trade-submit-row">
                        <div className="trade-field--count">
                            <label htmlFor="purchase-cantidad">Cantidad de Animales</label>
                            <input
                                id="purchase-cantidad"
                                type="number"
                                min="1"
                                max="100"
                                inputMode="numeric"
                                value={cantidad}
                                onChange={e => setCantidad(e.target.value)}
                                disabled={loading || animales.length > 0}
                            />
                        </div>

                        {animales.length === 0 ? (
                            <button type="submit" className="trade-primary-btn" disabled={loading}>
                                <Plus size={18} aria-hidden="true" /> Preparar Lista
                            </button>
                        ) : (
                            <button type="button" onClick={handleReset} className="trade-reset-btn">
                                <Trash2 size={18} aria-hidden="true" /> Cancelar / Reiniciar
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {animales.length > 0 && (
                <div className="glass-panel trade-table-panel">
                    <table className="trade-table purchase-table">
                        <thead>
                            <tr>
                                <th style={{ width: '60px' }}>Item</th>
                                <th>Nro. Chapeta</th>
                                <th>Peso Entrada (kg)</th>
                                <th>Propietario</th>
                                <th style={{ width: '50px' }}><span className="trade-visually-hidden">Eliminar</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {animales.map((a, index) => {
                                const tagTrimmed = a.numero_chapeta.trim().toUpperCase();
                                const isDuplicateInList = tagTrimmed !== '' && animales.filter(item => item.numero_chapeta.trim().toUpperCase() === tagTrimmed).length > 1;
                                const isDuplicateInDB = tagTrimmed !== '' && existingTags.has(tagTrimmed);
                                const hasError = isDuplicateInList || isDuplicateInDB;

                                return (
                                    <tr key={index}>
                                        <td className="trade-col-item" style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            <span className="mobile-hide">{index + 1}</span>
                                            <span className="trade-cell-label-tag">Animal #{index + 1}</span>
                                        </td>
                                        <td className="purchase-col-chapeta" style={{ padding: '8px 16px' }}>
                                            <label htmlFor={`purchase-chapeta-${index}`} className="trade-cell-label">Nro. Chapeta</label>
                                            <input
                                                id={`purchase-chapeta-${index}`}
                                                type="text"
                                                placeholder="Ej. 1024"
                                                value={a.numero_chapeta}
                                                onChange={e => updateAnimal(index, 'numero_chapeta', e.target.value)}
                                                autoCorrect="off"
                                                autoCapitalize="characters"
                                                spellCheck={false}
                                                enterKeyHint="next"
                                                aria-invalid={hasError || undefined}
                                                style={{
                                                    marginBottom: 0,
                                                    padding: '10px',
                                                    border: hasError ? '2px solid var(--error)' : '1px solid var(--border-input)',
                                                    backgroundColor: hasError ? 'var(--error-soft-bg)' : 'var(--bg-input)'
                                                }}
                                            />
                                            {isDuplicateInList && <div role="alert" style={{ color: 'var(--error)', fontSize: '0.72rem', marginTop: '4px' }}>Repetido en la lista</div>}
                                            {isDuplicateInDB && <div role="alert" style={{ color: 'var(--error)', fontSize: '0.72rem', marginTop: '4px' }}>Ya existe en inventario</div>}
                                        </td>
                                        <td className="purchase-col-peso" style={{ padding: '8px 16px' }}>
                                            <label htmlFor={`purchase-peso-${index}`} className="trade-cell-label">Peso Entrada (kg)</label>
                                            <input
                                                id={`purchase-peso-${index}`}
                                                type="text"
                                                inputMode="decimal"
                                                enterKeyHint="next"
                                                placeholder="Ej. 250"
                                                value={a.peso_ingreso}
                                                onChange={e => updateAnimal(index, 'peso_ingreso', sanitizeDecimalInput(e.target.value))}
                                                style={{ marginBottom: 0, padding: '10px' }}
                                            />
                                        </td>
                                        <td className="purchase-col-prop" style={{ padding: '8px 16px' }}>
                                            <label htmlFor={`purchase-prop-${index}`} className="trade-cell-label">Propietario</label>
                                            <select
                                                id={`purchase-prop-${index}`}
                                                value={a.propietario}
                                                onChange={e => updateAnimal(index, 'propietario', e.target.value)}
                                                style={{ marginBottom: 0, padding: '10px' }}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {propietarios.map(p => (
                                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="trade-col-actions" style={{ padding: '16px' }}>
                                            <button
                                                type="button"
                                                onClick={() => removeFila(index)}
                                                aria-label={`Eliminar fila ${index + 1}`}
                                                className="trade-remove-btn"
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="trade-confirm-wrap">
                        <button
                            type="button"
                            onClick={handleIngresarCompra}
                            disabled={loading}
                            className="trade-confirm-btn"
                        >
                            {loading ? 'Procesando Ingreso...' : (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <CheckCircle2 size={22} aria-hidden="true" /> Confirmar Ingreso de {animales.length} Animales
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {showReport && reportData && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, overflowY: 'auto' }}>
                    <PurchaseReport
                        fincaNombre={userFincas?.find((f: any) => f.id_finca === fincaId)?.nombre_finca || ''}
                        fechaIngreso={reportData.fechaIngreso}
                        animales={reportData.animales}
                        pesoCompraTotal={reportData.pesoCompraTotal}
                        onClose={() => {
                            setShowReport(false);
                            setReportData(null);
                        }}
                    />
                </div>
            )}

            {/* Reporte Compra Rápida (PDF volátil, sin guardar en DB) */}
            {showQuickReport && quickReportData && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, overflowY: 'auto' }}>
                    <PurchaseReportSimple
                        fincaNombre={userFincas?.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                        fechaCompra={quickReportData.fecha}
                        animales={quickReportData.animales}
                        proveedor={quickReportData.proveedor}
                        pesoCompraTotal={quickReportData.pesoCompraTotal}
                        onClose={() => { setShowQuickReport(false); setQuickReportData(null); }}
                    />
                </div>
            )}

            <ModalUpsell
                isOpen={showUpsellModal}
                onClose={() => setShowUpsellModal(false)}
                licenciaInfo={licenciaInfo}
            />
        </div>
    );
}
