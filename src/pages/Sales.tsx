import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { differenceInDays } from 'date-fns';
import { Tag, Trash2, CheckCircle2, Calendar, Search, AlertCircle, Plus, Wifi, WifiOff, UploadCloud } from 'lucide-react';
import SalesReport from '../components/SalesReport';

interface OfflineSalesPayload {
    id: string;
    fechaVenta: string;
    animales: AnimalVenta[];
    selectedComprador: string;
    observaciones: string;
}

interface AnimalVenta {
    numero_chapeta: string;
    peso_salida: string;
    propietario: string;
    id_animal?: string;
    validado: boolean;
    error?: string;
    // Datos para cálculo de GMP
    ultimo_peso?: number;
    ultima_fecha?: string;
    gmp?: number;
    potreroNombre?: string;
    fecha_ingreso?: string;
    fecha_inicio_ceba?: string | null;
    precio_venta?: string;
    es_estimado?: boolean;
}

export default function Sales() {
    const { fincaId, role, userFincas } = useAuth();
    const [cantidad, setCantidad] = useState('1');
    const [fechaVenta, setFechaVenta] = useState(new Date().toISOString().split('T')[0]);
    const [animales, setAnimales] = useState<AnimalVenta[]>([]);
    const [compradores, setCompradores] = useState<{ id: string, nombre: string }[]>([]);
    const [selectedComprador, setSelectedComprador] = useState('');
    const [observaciones, setObservaciones] = useState('');

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Offline / Sync State
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState<OfflineSalesPayload[]>([]);
    const [syncing, setSyncing] = useState(false);

    // Reporte
    const [showConfirm, setShowConfirm] = useState(false);

    // Reporte
    const [showReport, setShowReport] = useState(false);
    const [reportData, setReportData] = useState<{ fecha: string, animales: AnimalVenta[], comprador: string, observaciones?: string } | null>(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const saved = localStorage.getItem('agrogestion_ventas_offline');
        if (saved) {
            try { setOfflineQueue(JSON.parse(saved)); } catch (e) {}
        }

        if (!fincaId) return;

        const fetchCompradores = async () => {
            const { data } = await supabase
                .from('compradores')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setCompradores(data);
        };
        fetchCompradores();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
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

    const calculateGMP = (pesoSalida: string, ultimoPeso: number, ultimaFecha: string, fechaVenta: string) => {
        const pSalida = parseFloat(pesoSalida);
        if (isNaN(pSalida) || pSalida <= 0 || !ultimoPeso || !ultimaFecha) return 0;
        
        const f1 = new Date(ultimaFecha + 'T12:00:00');
        const f2 = new Date(fechaVenta + 'T12:00:00');
        const dias = Math.max(1, Math.floor((f2.getTime() - f1.getTime()) / (1000 * 60 * 60 * 24)));
        
        const gdp = (pSalida - ultimoPeso) / dias;
        return gdp * 30;
    };

    const isCarnicero = selectedComprador.toLowerCase().includes('carnicero');

    const updateAnimalField = (index: number, field: keyof AnimalVenta, value: string) => {
        const newAnimales = [...animales];
        const a = { ...newAnimales[index], [field]: value };
        
        if (field === 'numero_chapeta') {
            a.validado = false;
            a.error = undefined;
        }

        // Recalcular GMP si cambia el peso
        if (field === 'peso_salida' && a.ultimo_peso && a.ultima_fecha) {
            a.gmp = calculateGMP(value, a.ultimo_peso, a.ultima_fecha, fechaVenta);
        }

        newAnimales[index] = a;
        setAnimales(newAnimales);
    };

    const validarAnimal = async (index: number) => {
        const a = animales[index];
        if (!a.numero_chapeta.trim() || !fincaId) return;

        setLoading(true);
        try {
            if (!isOnline) {
                const newAnimales = [...animales];
                newAnimales[index] = { 
                    ...a, 
                    validado: true, 
                    error: 'Validación Offline (Se verificará al sincronizar)', 
                    id_animal: 'offline_id_' + Math.random().toString(36).substring(7),
                    ultimo_peso: 0,
                    ultima_fecha: fechaVenta,
                    gmp: 0,
                    potreroNombre: 'Sincronizar',
                    fecha_ingreso: fechaVenta,
                    fecha_inicio_ceba: fechaVenta,
                    propietario: '-'
                };
                setAnimales(newAnimales);
                return;
            }

            // Buscamos animal y su último pesaje
            const { data, error } = await supabase
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
                        etapa
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', a.numero_chapeta.trim())
                .eq('estado', 'activo')
                .single();

            const newAnimales = [...animales];
            if (error || !data) {
                newAnimales[index] = { ...a, validado: false, error: 'No encontrado o no está activo', id_animal: undefined };
            } else {
                // Obtener el último peso disponible
                const registros = (data.registros_pesaje || []).sort((x: any, y: any) => 
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const ultimoPeso = registros.length > 0 ? registros[0].peso : (data.peso_compra ?? data.peso_ingreso);
                const ultimaFecha = registros.length > 0 ? registros[0].fecha : data.fecha_ingreso;

                // Datos adicionales para reporte solicitado
                const potreroObj = data.potreros as any;
                const potrero = Array.isArray(potreroObj) ? potreroObj[0]?.nombre : potreroObj?.nombre || 'Sin potrero';
                const fechaIngreso = data.fecha_ingreso;
                
                // Buscar fecha de inicio en ceba
                const registroCeba = (data.registros_pesaje || [])
                    .filter((r: any) => r.etapa === 'ceba')
                    .sort((x: any, y: any) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime())[0];
                
                let fechaInicioCeba = data.fecha_ingreso_ceba || (registroCeba ? registroCeba.fecha : (data.etapa === 'ceba' ? data.fecha_ingreso : null));

                const gmp = a.peso_salida ? calculateGMP(a.peso_salida, ultimoPeso, ultimaFecha, fechaVenta) : 0;

                newAnimales[index] = { 
                    ...a, 
                    validado: true, 
                    error: undefined, 
                    id_animal: data.id, 
                    propietario: data.nombre_propietario,
                    ultimo_peso: ultimoPeso,
                    ultima_fecha: ultimaFecha,
                    gmp: gmp,
                    // Extensiones para el reporte
                    potreroNombre: potrero,
                    fecha_ingreso: fechaIngreso,
                    fecha_inicio_ceba: fechaInicioCeba
                };

                // Si es Carnicero y no han puesto peso, estimar basado en GMP
                if (isCarnicero && !newAnimales[index].peso_salida) {
                    // Calculamos GMP histórico (ciclo actual)
                    let gmpCalculado = 12.5; // Default razonable si no hay datos
                    const registrosGmp = (data.registros_pesaje || []).sort((x: any, y: any) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());
                    if (registrosGmp.length >= 2) {
                        const r1 = registrosGmp[0];
                        const r2 = registrosGmp[registrosGmp.length - 1];
                        const dGmp = differenceInDays(new Date(r2.fecha), new Date(r1.fecha));
                        if (dGmp > 0) {
                            gmpCalculado = ((r2.peso - r1.peso) / dGmp) * 30;
                        }
                    } else if (registrosGmp.length === 1) {
                         const r1 = registrosGmp[0];
                         const dGmp = differenceInDays(new Date(r1.fecha), new Date(data.fecha_ingreso));
                         if (dGmp > 0) {
                             gmpCalculado = ((r1.peso - (data.peso_compra ?? data.peso_ingreso)) / dGmp) * 30;
                         }
                    }

                    const diasDesdeUltimo = differenceInDays(new Date(fechaVenta), new Date(ultimaFecha));
                    const estWeight = Number(ultimoPeso) + (diasDesdeUltimo * (gmpCalculado / 30));
                    
                    newAnimales[index].peso_salida = estWeight.toFixed(1);
                    newAnimales[index].es_estimado = true;
                    newAnimales[index].gmp = gmpCalculado;
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

    const handlePreconfirmar = () => {
        if (!fincaId || animales.length === 0) return;

        try {
            if (!selectedComprador) throw new Error("Debe seleccionar un Comprador para la venta.");
            if (isCarnicero && !observaciones.trim()) throw new Error("Para ventas al Carnicero es obligatorio detallar el motivo en observaciones.");
            if (animales.some(a => !a.validado)) throw new Error("Debe validar todas las chapetas antes de continuar.");
            if (animales.some(a => !a.peso_salida || parseFloat(a.peso_salida) <= 0)) throw new Error("Todos los animales deben tener un peso de salida válido.");
            if (isCarnicero && animales.some(a => !a.precio_venta || parseFloat(a.precio_venta) <= 0)) throw new Error("Para ventas al Carnicero es obligatorio ingresar el valor de venta.");

            setShowConfirm(true);
            setMsjError('');
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleProcesarVenta = async () => {
        setLoading(true);
        setMsjError('');
        setShowConfirm(false);

        try {
            if (!isOnline) {
                const newPayload: OfflineSalesPayload = {
                    id: Date.now().toString(),
                    fechaVenta,
                    animales: [...animales],
                    selectedComprador,
                    observaciones
                };
                const newQueue = [...offlineQueue, newPayload];
                setOfflineQueue(newQueue);
                localStorage.setItem('agrogestion_ventas_offline', JSON.stringify(newQueue));
                
                setMsjExito(`¡Sin conexión! Lote de ${animales.length} ventas guardado en la cola local.`);
                handleReset();
                setLoading(false);
                return;
            }

            const registrosInsert = animales.filter(a => a.id_animal && !a.id_animal.startsWith('offline_id_')).map(a => ({
                id_animal: a.id_animal,
                peso: parseFloat(a.peso_salida),
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
                const pesoFloat = parseFloat(a.peso_salida);
                
                // 2. Marcar animal como vendido y guardar datos de venta
                const { error: errorAnimal } = await supabase
                    .from('animales')
                    .update({ 
                        estado: 'vendido',
                        comprador_venta: selectedComprador,
                        fecha_venta: fechaVenta,
                        peso_venta: pesoFloat,
                        observaciones_venta: observaciones,
                        es_emergencia: isCarnicero,
                        precio_venta: a.precio_venta ? parseFloat(a.precio_venta) : null
                    })
                    .eq('id', a.id_animal);

                if (errorAnimal) throw errorAnimal;
            }

            setMsjExito(`¡Venta procesada! Se han marcado ${animales.length} animales como vendidos.`);
            
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

    const syncOfflineQueue = async () => {
        if (!fincaId || offlineQueue.length === 0 || !isOnline) return;
        setSyncing(true);
        setMsjError('');
        setMsjExito('');
        let syncedCount = 0;
        let newQueue = [...offlineQueue];

        try {
            for (const payload of offlineQueue) {
                const animalesProcesados: AnimalVenta[] = [];
                const registrosInsert = [];

                for (const a of payload.animales) {
                    // Validar animal primero en BD
                    const { data, error } = await supabase
                        .from('animales')
                        .select('id, nombre_propietario, peso_ingreso, peso_compra, fecha_ingreso, etapa, fecha_ingreso_ceba, peso_ingreso_ceba, potreros(nombre), registros_pesaje(peso,fecha,etapa)')
                        .eq('id_finca', fincaId)
                        .eq('numero_chapeta', a.numero_chapeta.trim())
                        .eq('estado', 'activo')
                        .single();

                    if (error || !data) {
                        throw new Error(`Animal ${a.numero_chapeta} en lote del ${payload.fechaVenta} no encontrado o inactivo.`);
                    }

                    const dbId = data.id;
                    const ceba = parseFloat(a.peso_salida);
                    
                    registrosInsert.push({
                        id_animal: dbId,
                        peso: ceba,
                        fecha: payload.fechaVenta,
                        etapa: 'ceba'
                    });

                    // Update en base de datos 
                    const { error: errorAnimal } = await supabase
                        .from('animales')
                        .update({ 
                            estado: 'vendido',
                            comprador_venta: payload.selectedComprador,
                            fecha_venta: payload.fechaVenta,
                            peso_venta: ceba,
                            observaciones_venta: payload.observaciones,
                            es_emergencia: payload.selectedComprador.toLowerCase().includes('carnicero'),
                            precio_venta: a.precio_venta ? parseFloat(a.precio_venta) : null
                        })
                        .eq('id', dbId);
                    
                    if (errorAnimal) throw errorAnimal;

                    // Datos para el reporte si se desea (opcional)
                    const registros = (data.registros_pesaje || []).sort((x: any, y: any) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime());
                    const ultimoPeso = registros.length > 0 ? registros[0].peso : (data.peso_compra ?? data.peso_ingreso);
                    const ultimaFecha = registros.length > 0 ? registros[0].fecha : data.fecha_ingreso;
                    
                    const gmp = calculateGMP(a.peso_salida, ultimoPeso, ultimaFecha, payload.fechaVenta);
                    
                    animalesProcesados.push({...a, id_animal: dbId, propietario: data.nombre_propietario, gmp});
                }

                // Batch insert records
                if (registrosInsert.length > 0) {
                    const { error: errorPesaje } = await supabase.from('registros_pesaje').insert(registrosInsert);
                    if (errorPesaje) throw errorPesaje;
                }

                syncedCount++;
                newQueue = newQueue.filter(q => q.id !== payload.id);
            }

            if (syncedCount > 0) {
                setOfflineQueue(newQueue);
                localStorage.setItem('agrogestion_ventas_offline', JSON.stringify(newQueue));
                setMsjExito(`¡Sincronización completa! Se subieron y validaron ${syncedCount} ventas.`);
            }

        } catch (err: any) {
            setOfflineQueue(newQueue);
            localStorage.setItem('agrogestion_ventas_offline', JSON.stringify(newQueue));
            setMsjError('Error al sincronizar cola: ' + err.message);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="page-container">
            {/* Modal de Confirmación */}
            {showConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', border: '1px solid var(--error)' }}>
                        <Tag size={40} color="var(--error)" style={{ marginBottom: '16px' }} />
                        <h2 style={{ marginBottom: '12px' }}>Confirmar Venta</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                            ¿Estás seguro de marcar estos <b>{animales.length} animales</b> como VENDIDOS? <br />
                            Comprador: <b>{selectedComprador}</b><br />
                            Esto creará un registro de pesaje de salida y los quitará del inventario activo.
                        </p>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button onClick={() => setShowConfirm(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}>
                                Regresar
                            </button>
                            <button onClick={handleProcesarVenta} style={{ backgroundColor: 'var(--error)' }}>
                                Confirmar Venta
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <Tag size={32} /> Registro de Venta
                    </h1>
                    <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0' }}>Módulo para dar de baja animales vendidos y registrar su peso final.</p>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', backgroundColor: isOnline ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)', color: isOnline ? 'var(--success)' : '#ff9800', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {isOnline ? <><Wifi size={18} /> Online</> : <><WifiOff size={18} /> Offline</>}
                    </div>
                    {offlineQueue.length > 0 && isOnline && (
                        <button onClick={syncOfflineQueue} disabled={syncing} style={{ backgroundColor: 'var(--error)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UploadCloud size={18} /> {syncing ? 'Validando...' : `Sincronizar Ventas (${offlineQueue.length})`}
                        </button>
                    )}
                </div>
            </div>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjError}</div>}

            <div className="card" style={{ marginBottom: '32px' }}>
                <form onSubmit={generarFilas} style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label>Fecha de Salida</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    value={fechaVenta}
                                    onChange={e => setFechaVenta(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                    disabled={loading || animales.length > 0}
                                />
                            </div>
                        </div>

                        <div style={{ flex: '1 1 250px' }}>
                            <label>Comprador</label>
                            <select
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

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 100%' }}>
                            <label>Observaciones de la Venta {isCarnicero && <span style={{ color: 'var(--error)', fontSize: '0.7rem' }}>(OBLIGATORIO PARA EMERGENCIA)</span>}</label>
                            <input
                                type="text"
                                placeholder={isCarnicero ? "Especifique el motivo de la emergencia (ej: lesión, enfermedad)..." : "Ej: Venta de lote para ceba, precio por kilo..."}
                                value={observaciones}
                                onChange={e => setObservaciones(e.target.value)}
                                disabled={loading || animales.length > 0}
                                required={isCarnicero}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 150px' }}>
                            <label>Cantidad Vendida</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={cantidad}
                                onChange={e => setCantidad(e.target.value)}
                                disabled={loading || animales.length > 0}
                            />
                        </div>
                        {animales.length === 0 ? (
                            <button type="submit" style={{ width: 'auto', padding: '0 32px' }} disabled={loading}>
                                <Plus size={18} /> Preparar Lista
                            </button>
                        ) : (
                            <button type="button" onClick={handleReset} style={{ width: 'auto', backgroundColor: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', padding: '0 32px' }}>
                                <Trash2 size={18} /> Reiniciar Lista
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {animales.length > 0 && (
                <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '16px', color: 'var(--text-muted)', width: '60px' }}>#</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Chapeta</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Peso Salida (kg)</th>
                                {isCarnicero && <th style={{ padding: '16px', color: 'var(--error)', fontSize: '0.7rem' }}>VALOR VENTA ($)</th>}
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Marca</th>
                                <th style={{ padding: '16px', width: '50px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {animales.map((a, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{index + 1}</td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                placeholder="Chapeta"
                                                value={a.numero_chapeta}
                                                onChange={e => updateAnimalField(index, 'numero_chapeta', e.target.value)}
                                                onBlur={() => validarAnimal(index)}
                                                style={{ marginBottom: 0, padding: '10px', width: '120px', borderColor: a.error ? 'var(--error)' : (a.validado ? 'var(--success)' : '') }}
                                            />
                                            {a.validado && <CheckCircle2 size={18} color="var(--success)" />}
                                            {a.error && <div style={{ color: 'var(--error)', fontSize: '0.7rem' }} title={a.error}><AlertCircle size={18} /></div>}
                                            {!a.validado && !a.error && a.numero_chapeta && <button onClick={() => validarAnimal(index)} className="btn-icon" style={{ width: 'auto' }}><Search size={14} /></button>}
                                        </div>
                                    </td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="number"
                                                step="0.1"
                                                placeholder="Peso final"
                                                value={a.peso_salida}
                                                onChange={e => updateAnimalField(index, 'peso_salida', e.target.value)}
                                                style={{ marginBottom: 0, padding: '10px' }}
                                            />
                                            {a.es_estimado && (
                                                <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: 'var(--primary-light)', fontWeight: 'bold', background: 'rgba(76, 175, 80, 0.1)', padding: '2px 4px', borderRadius: '4px' }}>
                                                    ESTIMADO
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    {isCarnicero && (
                                        <td style={{ padding: '8px 16px' }}>
                                            <input
                                                type="number"
                                                placeholder="Precio Venta"
                                                value={a.precio_venta || ''}
                                                onChange={e => updateAnimalField(index, 'precio_venta', e.target.value)}
                                                style={{ marginBottom: 0, padding: '10px', border: '1px solid var(--error)' }}
                                                required={isCarnicero}
                                            />
                                        </td>
                                    )}
                                    <td style={{ padding: '16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        {a.propietario || '-'}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button
                                            onClick={() => removeFila(index)}
                                            className="btn-icon"
                                            style={{ color: 'rgba(255,255,255,0.2)' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={handlePreconfirmar}
                            disabled={loading}
                            style={{ backgroundColor: 'var(--error)', maxWidth: '400px', fontSize: '1.2rem', padding: '16px 48px' }}
                        >
                            {loading ? 'Procesando...' : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CheckCircle2 size={24} /> Confirmar Venta de {animales.length} Animales
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {showReport && reportData && (
                <SalesReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={reportData.fecha}
                    animales={reportData.animales}
                    comprador={reportData.comprador}
                    observaciones={reportData.observaciones}
                    onClose={() => setShowReport(false)}
                />
            )}
        </div>
    );
}
