import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { localDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { useConnection } from '../contexts/ConnectionContext';
import { Tag, Trash2, CheckCircle2, Calendar, Search, AlertCircle, Plus, Wifi, WifiOff, AlertOctagon, AlertTriangle } from 'lucide-react';
import SalesReport from '../components/SalesReport';
import ModalUpsell from '../components/ModalUpsell';
import { getLocalIsoDate } from '../utils/dateUtils';
import { calcularPesoEstimadoHoy } from '../utils/ganancia';
import { sanitizeDecimalInput, parseDecimalInput } from '../utils/decimalInput';
import { useModalDialog } from '../hooks/useModalDialog';
import './TradeOperations.css';

interface AnimalVenta {
    numero_chapeta: string;
    peso_salida: string;
    propietario: string;
    id_animal?: string;
    validado: boolean;
    error?: string;
    advertencia_fecha?: string;
    // Datos para cálculo de GMP
    ultimo_peso?: number;
    ultima_fecha?: string;
    gmp?: number;
    potreroNombre?: string;
    fecha_ingreso?: string;
    peso_ingreso?: number;
    fecha_inicio_ceba?: string | null;
    peso_inicio_ceba?: number | null;
    precio_venta?: string;
    es_estimado?: boolean;
}

export default function Sales() {
    const { fincaId, role, userFincas, modoGanancia, licenciaInfo } = useAuth();
    const { modoCampo, toggleModoCampo, isOnline } = useConnection();
    const isVencida = Boolean(licenciaInfo?.isVencida);
    const isSobrecupo = Boolean(licenciaInfo && (licenciaInfo.isSobrecupo || licenciaInfo.totalAnimalesOrganizacion > licenciaInfo.limiteAnimales));
    const isBloqueado = isVencida || isSobrecupo;
    const [showUpsellModal, setShowUpsellModal] = useState(false);
    const [cantidad, setCantidad] = useState('1');
    const [fechaVenta, setFechaVenta] = useState(getLocalIsoDate());
    const [animales, setAnimales] = useState<AnimalVenta[]>([]);
    const [compradores, setCompradores] = useState<{ id: string, nombre: string }[]>([]);
    const [selectedComprador, setSelectedComprador] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Reporte
    const [showConfirm, setShowConfirm] = useState(false);
    const confirmDialogProps = useModalDialog(showConfirm, () => setShowConfirm(false), false);

    const [showReport, setShowReport] = useState(false);
    const [reportData, setReportData] = useState<{ fecha: string, animales: AnimalVenta[], comprador: string, observaciones?: string } | null>(null);

    useEffect(() => {
        if (!fincaId) return;

        const fetchConfigAndCompradores = async () => {
            const { data: config } = await supabase
                .from('configuracion_kpi')
                .select('umbral_alto_gmp, umbral_medio_gmp')
                .eq('id_finca', fincaId)
                .single();
            if (config) {
                setUmbralAlto(config.umbral_alto_gmp ?? 20);
                setUmbralMedio(config.umbral_medio_gmp ?? 10);
            }

            const { data } = await supabase
                .from('compradores')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setCompradores(data);
        };
        fetchConfigAndCompradores();
    }, [fincaId]);

    const generarFilas = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(cantidad);
        if (isNaN(num) || num <= 0) return;

        const nuevasFilas: AnimalVenta[] = Array.from({ length: num }, () => ({
            numero_chapeta: '',
            peso_salida: '',
            propietario: '',
            validado: false
        }));
        setAnimales(nuevasFilas);
        setMsjExito('');
        setMsjError('');
    };

    const calculateGMP = (pesoSalida: string, pesoInicial: number, fechaInicial: string, fechaVenta: string) => {
        const pSalida = parseDecimalInput(pesoSalida);
        if (isNaN(pSalida) || pSalida <= 0 || !pesoInicial || !fechaInicial) return 0;
        
        const f1 = new Date(fechaInicial.split('T')[0] + 'T12:00:00');
        const f2 = new Date(fechaVenta.split('T')[0] + 'T12:00:00');
        const dias = Math.max(1, Math.floor((f2.getTime() - f1.getTime()) / (1000 * 60 * 60 * 24)));
        
        const gdp = (pSalida - pesoInicial) / dias;
        return gdp * 30;
    };

    const handleFechaVentaChange = (nuevaFecha: string) => {
        setFechaVenta(nuevaFecha);
        if (animales.length > 0) {
            const fVentaNorm = nuevaFecha.split('T')[0];
            const updated = animales.map(a => {
                if (!a.validado) return a;
                const fUltimaNorm = a.ultima_fecha ? a.ultima_fecha.split('T')[0] : '';
                const fIngresoNorm = a.fecha_ingreso ? a.fecha_ingreso.split('T')[0] : '';
                let advertencia: string | undefined = undefined;

                if (fUltimaNorm && fVentaNorm < fUltimaNorm) {
                    advertencia = `Fecha de salida (${fVentaNorm}) es anterior a su último pesaje registrado (${fUltimaNorm} con ${a.ultimo_peso} kg).`;
                } else if (fIngresoNorm && fVentaNorm < fIngresoNorm) {
                    advertencia = `Fecha de salida (${fVentaNorm}) es anterior a su fecha de ingreso (${fIngresoNorm}).`;
                }

                const nuevoGmp = a.peso_salida && a.peso_ingreso && a.fecha_ingreso
                    ? calculateGMP(a.peso_salida, a.peso_ingreso, a.fecha_ingreso, nuevaFecha)
                    : a.gmp;

                return {
                    ...a,
                    advertencia_fecha: advertencia,
                    gmp: nuevoGmp
                };
            });
            setAnimales(updated);
        }
    };

    const isCarnicero = selectedComprador.toLowerCase().includes('carnicero');

    const formatCurrency = (val: string) => {
        if (!val) return '';
        return Number(val).toLocaleString('es-CO');
    };

    const updateAnimalField = (index: number, field: keyof AnimalVenta, value: string) => {
        const newAnimales = [...animales];
        const a = { ...newAnimales[index], [field]: value };
        
        if (field === 'numero_chapeta') {
            a.validado = false;
            a.error = undefined;
        }

        // Recalcular GMP si cambia el peso
        if (field === 'peso_salida' && a.peso_ingreso && a.fecha_ingreso) {
            a.gmp = calculateGMP(value, a.peso_ingreso, a.fecha_ingreso, fechaVenta);
        }

        newAnimales[index] = a;
        setAnimales(newAnimales);
    };

    const validarAnimal = async (index: number) => {
        const a = animales[index];
        if (!a.numero_chapeta.trim() || !fincaId) return;

        setLoading(true);
        try {
            // Buscamos animal y su último pesaje (gracias a offlineAwareFetch y smartTableFallback, funciona tanto online como en Modo Campo con datos reales)
            const { data } = await supabase
                .from('animales')
                .select(`
                    id, 
                    numero_chapeta, 
                    nombre_propietario,
                    peso_ingreso,
                    peso_compra,
                    fecha_ingreso,
                    etapa,
                    fecha_ingreso_ceba,
                    peso_ingreso_ceba,
                    potreros (nombre),
                    registros_pesaje (
                        peso,
                        fecha,
                        etapa,
                        gdp_calculada,
                        gmp_calculada,
                        is_deleted
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', a.numero_chapeta.trim())
                .eq('estado', 'activo')
                .maybeSingle();

            let animalEncontrado = data;
            if (!animalEncontrado) {
                const cached = await localDB.animalesCache
                    .where('id_finca').equals(fincaId)
                    .filter(an => an.numero_chapeta === a.numero_chapeta.trim())
                    .first();
                if (cached) {
                    animalEncontrado = {
                        id: cached.id,
                        numero_chapeta: cached.numero_chapeta,
                        nombre_propietario: cached.nombre_propietario,
                        peso_ingreso: cached.peso_ingreso,
                        peso_compra: cached.peso_compra,
                        fecha_ingreso: cached.fecha_ingreso,
                        etapa: cached.etapa,
                        fecha_ingreso_ceba: cached.fecha_ingreso_ceba,
                        peso_ingreso_ceba: cached.peso_ingreso_ceba,
                        potreros: [{ nombre: cached.potrero_nombre }] as any,
                        registros_pesaje: []
                    };
                }
            }

            const newAnimales = [...animales];
            if (!animalEncontrado) {
                newAnimales[index] = { ...a, validado: false, error: 'No encontrado o no está activo', id_animal: undefined };
            } else {
                const registrosActivos = (animalEncontrado.registros_pesaje || []).filter((r: any) => !r.is_deleted);
                // Obtener el último peso disponible
                const registros = [...registrosActivos].sort((x: any, y: any) => 
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const pesoBaseIngreso = animalEncontrado.peso_ingreso ?? animalEncontrado.peso_compra;
                const ultimoPeso = registros.length > 0 ? registros[0].peso : pesoBaseIngreso;
                const ultimaFecha = registros.length > 0 ? registros[0].fecha : animalEncontrado.fecha_ingreso;

                // Datos adicionales para reporte solicitado
                const potreroObj = animalEncontrado.potreros as any;
                const potrero = Array.isArray(potreroObj) ? potreroObj[0]?.nombre : potreroObj?.nombre || 'Sin potrero';
                
                // Buscar fecha de inicio en ceba
                const registroCeba = registrosActivos
                    .filter((r: any) => r.etapa === 'ceba')
                    .sort((x: any, y: any) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime())[0];
                
                let fechaInicioCeba = animalEncontrado.fecha_ingreso_ceba || (registroCeba ? registroCeba.fecha : (animalEncontrado.etapa === 'ceba' ? animalEncontrado.fecha_ingreso : null));
                let pesoInicioCeba = animalEncontrado.peso_ingreso_ceba || (registroCeba ? registroCeba.peso : (animalEncontrado.etapa === 'ceba' ? pesoBaseIngreso : null));

                const gmp = a.peso_salida ? calculateGMP(a.peso_salida, pesoBaseIngreso, animalEncontrado.fecha_ingreso, fechaVenta) : 0;

                // Validar si la fecha de venta es anterior al último pesaje o fecha de ingreso
                const fVentaNorm = fechaVenta.split('T')[0];
                const fUltimaNorm = ultimaFecha ? String(ultimaFecha).split('T')[0] : '';
                const fIngresoNorm = animalEncontrado.fecha_ingreso ? String(animalEncontrado.fecha_ingreso).split('T')[0] : '';
                let advertenciaFecha: string | undefined = undefined;

                if (fUltimaNorm && fVentaNorm < fUltimaNorm) {
                    advertenciaFecha = `Fecha de salida (${fVentaNorm}) es anterior a su último pesaje registrado (${fUltimaNorm} con ${ultimoPeso} kg).`;
                } else if (fIngresoNorm && fVentaNorm < fIngresoNorm) {
                    advertenciaFecha = `Fecha de salida (${fVentaNorm}) es anterior a su fecha de ingreso (${fIngresoNorm}).`;
                }

                newAnimales[index] = { 
                    ...a, 
                    validado: true, 
                    error: undefined, 
                    advertencia_fecha: advertenciaFecha,
                    id_animal: animalEncontrado.id, 
                    propietario: animalEncontrado.nombre_propietario,
                    ultimo_peso: ultimoPeso,
                    ultima_fecha: ultimaFecha,
                    gmp: gmp,
                    // Extensiones para el reporte
                    potreroNombre: potrero,
                    fecha_ingreso: animalEncontrado.fecha_ingreso,
                    peso_ingreso: pesoBaseIngreso,
                    fecha_inicio_ceba: fechaInicioCeba,
                    peso_inicio_ceba: pesoInicioCeba
                };

                // Si es Carnicero y no han puesto peso, estimar con el motor zootécnico unificado a fechaVenta
                if (isCarnicero && !newAnimales[index].peso_salida) {
                    const estVenta = calcularPesoEstimadoHoy(animalEncontrado, { fechaObjetivo: fechaVenta });
                    newAnimales[index].peso_salida = estVenta.pesoEstimado.toFixed(1);
                    newAnimales[index].es_estimado = true;
                    newAnimales[index].gmp = estVenta.gmpEfectiva;
                }
            }
            setAnimales(newAnimales);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const removeFila = (index: number) => {
        setAnimales(animales.filter((_, i) => i !== index));
    };

    const handlePreconfirmar = async () => {
        if (isBloqueado) {
            setShowUpsellModal(true);
            return;
        }
        if (!fincaId || animales.length === 0) return;

        setLoading(true);
        setMsjError('');

        try {
            if (!selectedComprador) throw new Error("Debe seleccionar un Comprador para la venta.");
            if (isCarnicero && !observaciones.trim()) throw new Error("Para ventas al Carnicero es obligatorio detallar el motivo en observaciones.");
            
            const chapetas = animales.map(a => a.numero_chapeta.trim().toUpperCase());
            if (new Set(chapetas).size !== chapetas.length) {
                const duplicados = chapetas.filter((item, index) => chapetas.indexOf(item) !== index);
                throw new Error(`Hay chapetas repetidas en la lista actual: ${Array.from(new Set(duplicados)).join(', ')}`);
            }

            if (animales.some(a => !a.validado)) throw new Error("Debe validar todas las chapetas antes de continuar.");
            if (animales.some(a => {
                const p = parseDecimalInput(a.peso_salida);
                return !a.peso_salida || isNaN(p) || p <= 0;
            })) throw new Error("Todos los animales deben tener un peso de salida válido.");
            if (isCarnicero && animales.some(a => !a.precio_venta || parseFloat(a.precio_venta) <= 0)) throw new Error("Para ventas al Carnicero es obligatorio ingresar el valor de venta.");

            setShowConfirm(true);
            setMsjError('');
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            // Libera estado de carga tras validar preconfirmación
            setLoading(false);
        }
    };

    const handleProcesarVenta = async () => {
        setLoading(true);
        setMsjError('');
        setMsjExito('');
        setShowConfirm(false);

        try {
            const registrosInsert = animales.filter(a => a.id_animal).map(a => ({
                id_animal: a.id_animal,
                peso: Math.round(parseDecimalInput(a.peso_salida)),
                fecha: fechaVenta,
                etapa: 'ceba'
            }));

            if (registrosInsert.length > 0) {
                const { error: errorPesaje } = await supabase
                    .from('registros_pesaje')
                    .insert(registrosInsert);
                if (errorPesaje) throw errorPesaje;
            }

            for (const a of animales) {
                if (!a.id_animal) continue;
                const pesoNum = Math.round(parseDecimalInput(a.peso_salida));
                
                // 2. Marcar animal como vendido y guardar datos de venta
                const { error: errorAnimal } = await supabase
                    .from('animales')
                    .update({ 
                        estado: 'vendido',
                        comprador_venta: selectedComprador,
                        fecha_venta: fechaVenta,
                        peso_venta: isNaN(pesoNum) ? null : pesoNum,
                        observaciones_venta: observaciones,
                        es_emergencia: isCarnicero,
                        precio_venta: a.precio_venta ? parseFloat(a.precio_venta) : null
                    })
                    .eq('id', a.id_animal);

                if (errorAnimal) throw errorAnimal;

                // Remover inmediatamente de la memoria local de animales activos
                try {
                    await localDB.animalesCache.delete(a.id_animal);
                } catch { /* noop */ }
            }

            const mensaje = (!isOnline || modoCampo)
                ? `📱 ¡Venta guardada localmente! Se marcaron ${animales.length} animales como vendidos y se sincronizarán al volver la señal.`
                : `¡Venta procesada! Se han marcado ${animales.length} animales como vendidos.`;

            setMsjExito(mensaje);
            
            // Guardar para reporte
            setReportData({
                fecha: fechaVenta,
                animales: [...animales],
                comprador: selectedComprador,
                observaciones: observaciones
            });
            setShowReport(true);

            setAnimales([]);
            setCantidad('1');
            setSelectedComprador('');
            setObservaciones('');
        } catch (err: any) {
            setMsjError('Error al procesar la venta: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setAnimales([]);
        setCantidad('1');
        setMsjError('');
        setMsjExito('');
        setSelectedComprador('');
        setObservaciones('');
    };

    if (role === 'observador') {
        return <div className="page-container text-center">Acceso denegado. Solo administradores y trabajadores pueden registrar ventas.</div>;
    }

    return (
        <div className="page-container trade-page sales-page">
            {/* Modal nativo de Confirmación */}
            <dialog
                {...confirmDialogProps}
                aria-labelledby="sales-confirm-title"
                className="trade-dialog trade-dialog--danger"
            >
                {showConfirm && (
                    <div className="trade-dialog-confirm-body">
                        <Tag size={40} color="var(--error)" aria-hidden="true" style={{ marginBottom: '16px' }} />
                        <h2 id="sales-confirm-title" style={{ marginBottom: '12px' }}>Confirmar Venta</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                            ¿Estás seguro de marcar estos <b>{animales.length} animales</b> como VENDIDOS? <br />
                            Comprador: <b>{selectedComprador}</b><br />
                            Fecha de salida: <b>{fechaVenta}</b><br />
                            Esto creará un registro de pesaje de salida y los quitará del inventario activo.
                        </p>
                        {animales.some(a => a.advertencia_fecha) && (
                            <div style={{ backgroundColor: 'var(--warning-soft-bg)', border: '1px solid var(--warning-soft-border)', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', textAlign: 'left', fontSize: '0.85rem' }}>
                                <div style={{ color: 'var(--warning)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <AlertTriangle size={18} aria-hidden="true" /> Atención: Advertencia de Fechas
                                </div>
                                <div style={{ color: 'var(--text-main)', fontSize: '0.82rem' }}>
                                    Hay <b>{animales.filter(a => a.advertencia_fecha).length} animales</b> con pesajes registrados posteriores al <b>{fechaVenta}</b>. Asegúrate de que la fecha de salida sea la correcta antes de confirmar.
                                </div>
                            </div>
                        )}
                        <div className="trade-dialog-confirm-actions">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => setShowConfirm(false)}
                                className="trade-dialog-cancel-btn"
                            >
                                Regresar
                            </button>
                            <button
                                type="button"
                                onClick={handleProcesarVenta}
                                style={{ backgroundColor: 'var(--error)' }}
                            >
                                Confirmar Venta
                            </button>
                        </div>
                    </div>
                )}
            </dialog>

            <div className="trade-header">
                <div className="trade-header-main">
                    <h1 className="title">
                        <Tag size={32} aria-hidden="true" /> Registrar Venta
                    </h1>
                    <p className="trade-subtitle">Módulo para dar de baja animales vendidos y registrar su peso final.</p>
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
                </div>
            </div>

            {isBloqueado && (
                <div className="trade-upsell-banner">
                    <div className="trade-upsell-text">
                        <AlertOctagon size={24} color="var(--error)" aria-hidden="true" style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {isVencida ? (
                                <>
                                    <strong>Modo Solo Lectura (Licencia Vencida):</strong> Tu suscripción ha vencido. Puedes consultar tu historial y reportes de ventas, pero el registro de nuevas ventas de ganado se encuentra pausado hasta la renovación.
                                </>
                            ) : (
                                <>
                                    <strong>Modo Solo Lectura (Sobrecupo):</strong> Tu organización tiene <strong style={{ color: 'var(--error)' }}>{licenciaInfo?.totalAnimalesOrganizacion} animales</strong> (límite de tu plan: <strong>{licenciaInfo?.limiteAnimales}</strong>). Para registrar operaciones, actualiza tu suscripción.
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowUpsellModal(true)}
                        className="trade-upsell-btn"
                    >
                        {isVencida ? 'Renovar Plan' : 'Ver Planes'}
                    </button>
                </div>
            )}

            {msjExito && <div role="status" aria-live="polite" className="trade-feedback trade-feedback--success">{msjExito}</div>}
            {msjError && <div role="alert" aria-live="assertive" className="trade-feedback trade-feedback--error">{msjError}</div>}

            <div className="card trade-form-card">
                <form onSubmit={generarFilas} className="trade-form">
                    <div className="trade-form-row">
                        <div className="trade-field">
                            <label htmlFor="sales-fecha">Fecha de Salida</label>
                            <div className="trade-date-wrap">
                                <Calendar size={18} aria-hidden="true" className="trade-date-icon" />
                                <input
                                    id="sales-fecha"
                                    type="date"
                                    value={fechaVenta}
                                    onChange={e => handleFechaVentaChange(e.target.value)}
                                    className="trade-date-input"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="trade-field--wide">
                            <label htmlFor="sales-comprador">Comprador</label>
                            <select
                                id="sales-comprador"
                                value={selectedComprador}
                                onChange={e => setSelectedComprador(e.target.value)}
                                disabled={loading || animales.length > 0}
                                required
                            >
                                <option value="">Seleccione un Comprador...</option>
                                {compradores.map(c => (
                                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="trade-form-row">
                        <div className="trade-field--full">
                            <label htmlFor="sales-observaciones">Observaciones de la Venta {isCarnicero && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>(OBLIGATORIO PARA EMERGENCIA)</span>}</label>
                            <input
                                id="sales-observaciones"
                                type="text"
                                placeholder={isCarnicero ? "Especifique el motivo de la emergencia (ej: lesión, enfermedad)..." : "Ej: Venta de lote para ceba, precio por kilo..."}
                                value={observaciones}
                                onChange={e => setObservaciones(e.target.value)}
                                disabled={loading || animales.length > 0}
                                required={isCarnicero}
                            />
                        </div>
                    </div>

                    <div className="trade-submit-row">
                        <div className="trade-field--count">
                            <label htmlFor="sales-cantidad">Cantidad Vendida</label>
                            <input
                                id="sales-cantidad"
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
                                <Trash2 size={18} aria-hidden="true" /> Reiniciar Lista
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {animales.length > 0 && (
                <>
                    {animales.some(a => a.advertencia_fecha) && (
                        <div role="status" className="sales-date-alert">
                            <AlertTriangle size={24} color="var(--warning)" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div style={{ fontWeight: 'bold', color: 'var(--warning)', fontSize: '0.95rem' }}>
                                    ⚠️ Advertencia: Fecha de salida anterior al último pesaje
                                </div>
                                <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', marginTop: '4px', lineHeight: '1.4' }}>
                                    Hay {animales.filter(a => a.advertencia_fecha).length} animal(es) con pesajes o registros posteriores a la fecha de salida (<strong>{fechaVenta}</strong>):
                                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                                        {animales.filter(a => a.advertencia_fecha).map(a => (
                                            <li key={a.numero_chapeta} style={{ color: 'var(--warning)', fontSize: '0.82rem' }}>
                                                Chapeta <strong>{a.numero_chapeta}</strong>: {a.advertencia_fecha}
                                            </li>
                                        ))}
                                    </ul>
                                    <div style={{ marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        Verifica la <strong>Fecha de Salida</strong> en el formulario superior para que los cálculos de ganancia y etapas no se distorsionen.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="glass-panel trade-table-panel">
                        <table className={`trade-table sales-table ${isCarnicero ? 'is-carnicero' : ''}`}>
                            <thead>
                                <tr>
                                    <th style={{ width: '60px' }}>#</th>
                                    <th>Chapeta</th>
                                    <th>Peso Salida (kg)</th>
                                    {isCarnicero && <th style={{ color: 'var(--error)', fontSize: '0.75rem' }}>VALOR VENTA ($)</th>}
                                    <th>Marca</th>
                                    <th style={{ width: '50px' }}><span className="trade-visually-hidden">Eliminar</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {animales.map((a, index) => {
                                    const tagTrimmed = a.numero_chapeta.trim().toUpperCase();
                                    const isDuplicateInList = tagTrimmed !== '' && animales.filter(item => item.numero_chapeta.trim().toUpperCase() === tagTrimmed).length > 1;
                                    const finalError = isDuplicateInList ? 'Repetido en la lista' : a.error;

                                    return (
                                        <tr key={index}>
                                            <td className="trade-col-item" style={{ padding: '16px', color: 'var(--text-muted)' }}>
                                                <span className="mobile-hide">{index + 1}</span>
                                                <span className="trade-cell-label-tag">Animal #{index + 1}</span>
                                            </td>
                                            <td className="sales-col-chapeta" style={{ padding: '8px 16px' }}>
                                                <label htmlFor={`sales-chapeta-${index}`} className="trade-cell-label">Nro. Chapeta</label>
                                                <div className="sales-chapeta-row">
                                                    <input
                                                        id={`sales-chapeta-${index}`}
                                                        type="text"
                                                        placeholder="Chapeta"
                                                        value={a.numero_chapeta}
                                                        onChange={e => updateAnimalField(index, 'numero_chapeta', e.target.value)}
                                                        onBlur={() => validarAnimal(index)}
                                                        autoCorrect="off"
                                                        autoCapitalize="characters"
                                                        spellCheck={false}
                                                        enterKeyHint="search"
                                                        aria-invalid={Boolean(finalError) || undefined}
                                                        className="sales-chapeta-input"
                                                        style={{
                                                            borderColor: finalError ? 'var(--error)' : (a.advertencia_fecha ? 'var(--warning)' : (a.validado ? 'var(--success)' : '')),
                                                            backgroundColor: isDuplicateInList ? 'var(--error-soft-bg)' : 'var(--bg-input)'
                                                        }}
                                                    />
                                                    {a.validado && !isDuplicateInList && !a.advertencia_fecha && (
                                                        <CheckCircle2 size={20} color="var(--success)" aria-label="Chapeta validada" style={{ flexShrink: 0 }} />
                                                    )}
                                                    {a.validado && !isDuplicateInList && a.advertencia_fecha && (
                                                        <div style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', flexShrink: 0 }} title={a.advertencia_fecha}>
                                                            <AlertTriangle size={20} aria-hidden="true" />
                                                        </div>
                                                    )}
                                                    {finalError && (
                                                        <div style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', flexShrink: 0 }} title={finalError}>
                                                            <AlertCircle size={20} aria-hidden="true" />
                                                        </div>
                                                    )}
                                                    {!a.validado && !finalError && a.numero_chapeta && (
                                                        <button
                                                            type="button"
                                                            onClick={() => validarAnimal(index)}
                                                            className="btn-icon sales-validate-btn"
                                                            aria-label={`Validar chapeta ${index + 1}`}
                                                            title="Buscar y validar animal"
                                                        >
                                                            <Search size={16} aria-hidden="true" />
                                                        </button>
                                                    )}
                                                </div>
                                                {finalError && (
                                                    <div role="alert" className="sales-field-error">{finalError}</div>
                                                )}
                                                {a.advertencia_fecha && (
                                                    <div className="sales-field-warning">
                                                        ⚠️ Salida &lt; último pesaje ({a.ultima_fecha ? String(a.ultima_fecha).split('T')[0] : ''})
                                                    </div>
                                                )}
                                            </td>
                                            <td className="sales-col-peso" style={{ padding: '8px 16px' }}>
                                                <label htmlFor={`sales-peso-${index}`} className="trade-cell-label">Peso Salida (kg)</label>
                                                <div className="sales-peso-wrap">
                                                    <input
                                                        id={`sales-peso-${index}`}
                                                        type="text"
                                                        inputMode="decimal"
                                                        enterKeyHint="next"
                                                        placeholder="Peso final"
                                                        value={a.peso_salida}
                                                        onChange={e => updateAnimalField(index, 'peso_salida', sanitizeDecimalInput(e.target.value))}
                                                        className={`sales-peso-input ${a.es_estimado ? 'has-estimado' : ''}`}
                                                    />
                                                    {a.es_estimado && (
                                                        <div className="sales-estimado-badge">ESTIMADO</div>
                                                    )}
                                                </div>
                                            </td>
                                            {isCarnicero && (
                                                <td className="sales-col-precio" style={{ padding: '8px 16px' }}>
                                                    <label htmlFor={`sales-precio-${index}`} className="trade-cell-label">Valor Venta ($)</label>
                                                    <div className="sales-price-wrap">
                                                        <span aria-hidden="true" className="sales-price-prefix">$</span>
                                                        <input
                                                            id={`sales-precio-${index}`}
                                                            type="text"
                                                            inputMode="numeric"
                                                            placeholder="Precio Venta"
                                                            value={a.precio_venta ? formatCurrency(a.precio_venta) : ''}
                                                            onChange={e => {
                                                                const clean = e.target.value.replace(/\D/g, '');
                                                                updateAnimalField(index, 'precio_venta', clean);
                                                            }}
                                                            className="sales-price-input"
                                                            required={isCarnicero}
                                                        />
                                                    </div>
                                                </td>
                                            )}
                                            <td className="sales-col-marca" style={{ padding: '16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                <span className="trade-cell-label" style={{ marginBottom: '2px' }}>Marca</span>
                                                <span>{a.propietario || '-'}</span>
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
                                onClick={handlePreconfirmar}
                                disabled={loading}
                                className="trade-confirm-btn trade-confirm-btn--danger"
                            >
                                {loading ? 'Procesando...' : (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={22} aria-hidden="true" /> Confirmar Venta de {animales.length} Animales
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {showReport && reportData && (
                <SalesReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={reportData.fecha}
                    animales={reportData.animales}
                    comprador={reportData.comprador}
                    observaciones={reportData.observaciones}
                    umbralAlto={umbralAlto}
                    umbralMedio={umbralMedio}
                    modoGanancia={modoGanancia}
                    onClose={() => setShowReport(false)}
                />
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
