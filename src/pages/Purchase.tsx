import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingCart, Plus, Trash2, CheckCircle2, Calendar, Wifi, WifiOff, UploadCloud, Info, X } from 'lucide-react';
import PurchaseReport from '../components/PurchaseReport';
import PurchaseReportSimple from '../components/PurchaseReportSimple';

interface OfflinePurchasePayload {
    id: string;
    fechaIngreso: string;
    animales: AnimalCompra[];
    selectedProveedor: string;
    observaciones: string;
    incluirPesoCompra: boolean;
    pesoCompraTotal: string;
}

interface AnimalCompra {
    numero_chapeta: string;
    peso_ingreso: string;
    propietario: string;
}

export default function Purchase() {
    const { fincaId, role, userFincas } = useAuth();
    const [cantidad, setCantidad] = useState('1');
    const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().split('T')[0]);
    const [animales, setAnimales] = useState<AnimalCompra[]>([]);
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);
    const [proveedores, setProveedores] = useState<{ id: string, nombre: string }[]>([]);
    const [selectedProveedor, setSelectedProveedor] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [incluirPesoCompra, setIncluirPesoCompra] = useState(false);
    const [pesoCompraTotal, setPesoCompraTotal] = useState('');

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Offline / Sync State
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState<OfflinePurchasePayload[]>([]);
    const [syncing, setSyncing] = useState(false);

    // Reporte
    const [showReport, setShowReport] = useState(false);
    const [reportData, setReportData] = useState<{ fecha: string, animales: AnimalCompra[], pesoCompraTotal?: number } | null>(null);
    const [lastTags, setLastTags] = useState<{ owner: string, tag: string }[]>([]);
    const [existingTags, setExistingTags] = useState<Set<string>>(new Set());
    const [showLastTags, setShowLastTags] = useState(false);

    // Compra Rápida (Volátil — NO guarda en DB)
    const [showQuickModal, setShowQuickModal] = useState(false);
    const [quickProveedor, setQuickProveedor] = useState('');
    const [quickKgComprados, setQuickKgComprados] = useState('');
    const [quickAnimalCount, setQuickAnimalCount] = useState('1');
    const [quickWeights, setQuickWeights] = useState<string[]>(['']);
    const [showQuickReport, setShowQuickReport] = useState(false);
    const [quickReportData, setQuickReportData] = useState<{ proveedor: string; fecha: string; animales: { numero_chapeta: string; peso_ingreso: number }[]; pesoCompraTotal: number } | null>(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const saved = localStorage.getItem('agrogestion_compras_offline');
        if (saved) {
            try { setOfflineQueue(JSON.parse(saved)); } catch (e) {}
        }

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

            // Fetch last tags logic
            await fetchLastTags();
        };
        fetchPropietarios();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
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
        setExistingTags(new Set(data.map(a => a.numero_chapeta?.trim() || '')));
    };

    const generarFilas = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(cantidad);
        if (isNaN(num) || num <= 0) return;

        const nuevasFilas: AnimalCompra[] = Array.from({ length: num }, () => ({
            numero_chapeta: '',
            peso_ingreso: '',
            propietario: ''
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

    const handleIngresarCompra = async () => {
        if (!fincaId || animales.length === 0) return;

        setLoading(true);
        setMsjError('');

        try {
            if (!selectedProveedor) throw new Error("Debe seleccionar un Vendedor/Proveedor para la compra.");

            const chapetas = animales.map(a => a.numero_chapeta.trim());
            if (chapetas.some(c => !c)) throw new Error("Todas las chapetas son obligatorias.");
            if (new Set(chapetas).size !== chapetas.length) throw new Error("No puede haber chapetas duplicadas en la lista actual.");

            animales.forEach(a => {
                const peso = parseFloat(a.peso_ingreso);
                if (isNaN(peso) || peso <= 0) throw new Error(`Peso inválido para ${a.numero_chapeta}`);
                if (!a.propietario) throw new Error(`Falta propietario para ${a.numero_chapeta}`);
            });

            // Registro de chapetas existentes en la base de datos (sólo si hay conexión)
            if (isOnline) {
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
        setShowConfirm(false);

        try {
            if (!isOnline) {
                const newPayload: OfflinePurchasePayload = {
                    id: Date.now().toString(),
                    fechaIngreso,
                    animales: [...animales],
                    selectedProveedor,
                    observaciones,
                    incluirPesoCompra,
                    pesoCompraTotal
                };
                const newQueue = [...offlineQueue, newPayload];
                setOfflineQueue(newQueue);
                localStorage.setItem('agrogestion_compras_offline', JSON.stringify(newQueue));
                
                setMsjExito(`¡Sin conexión! Lote de ${animales.length} animales guardado en la cola local.`);
                handleReset();
                setLoading(false);
                return;
            }

            const [, month, day] = fechaIngreso.split('-');
            const dateStr = `${day}/${month}`;
            
            const uniquePropietarios = Array.from(new Set(animales.map(a => a.propietario)));
            
            const potreradasPayload = uniquePropietarios.map(prop => ({
                id_finca: fincaId,
                nombre: `Compra ${dateStr} ${prop}`,
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
                    const propMatch = uniquePropietarios.find(prop => p.nombre === `Compra ${dateStr} ${prop}`);
                    if (propMatch) {
                        potreradaIdPorPropietario.set(propMatch, p.id);
                    }
                });
            }

            const pesoCompTotalNum = incluirPesoCompra ? parseFloat(pesoCompraTotal) : 0;
            const totalPesoIngresoLote = animales.reduce((acc, a) => acc + (parseFloat(a.peso_ingreso) || 0), 0);
            const ratioPesoCompra = (incluirPesoCompra && pesoCompTotalNum > 0 && totalPesoIngresoLote > 0) 
                ? (pesoCompTotalNum / totalPesoIngresoLote) 
                : 1;

            const records = animales.map(a => ({
                id_finca: fincaId,
                numero_chapeta: a.numero_chapeta.trim(),
                nombre_propietario: a.propietario,
                id_potrerada: potreradaIdPorPropietario.get(a.propietario) || null,
                peso_ingreso: parseFloat(a.peso_ingreso),
                peso_compra: incluirPesoCompra ? Math.round(parseFloat(a.peso_ingreso) * ratioPesoCompra) : null,
                fecha_ingreso: fechaIngreso,
                proveedor_compra: selectedProveedor,
                observaciones_compra: observaciones,
                etapa: 'levante',
                especie: 'bovino',
                sexo: 'M',
                estado: 'activo'
            }));

            const { error } = await supabase.from('animales').insert(records);
            if (error) throw error;

            setMsjExito(`¡Éxito! Se crearon ${records.length} animales correctamente.`);
            
            // Actualizar últimas chapetas informativas
            await fetchLastTags();

            // Guardar para el reporte antes de limpiar
            setReportData({
                fecha: fechaIngreso,
                animales: [...animales],
                pesoCompraTotal: incluirPesoCompra ? parseFloat(pesoCompraTotal) : undefined
            });
            setShowReport(true);

            setAnimales([]);
            setCantidad('1');
        } catch (err: any) {
            setMsjError(err.message);
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
                const chapetas = payload.animales.map(a => a.numero_chapeta.trim());
                const { data: existentes } = await supabase
                    .from('animales')
                    .select('numero_chapeta')
                    .eq('id_finca', fincaId)
                    .in('numero_chapeta', chapetas);
                
                if (existentes && existentes.length > 0) {
                    throw new Error(`Lote offline del ${payload.fechaIngreso}: Chapetas duplicadas encontradas (${existentes.map(e => e.numero_chapeta).join(', ')}). Datos saltados.`);
                }

                const [, month, day] = payload.fechaIngreso.split('-');
                const dateStr = `${day}/${month}`;
                const uniquePropietarios = Array.from(new Set(payload.animales.map(a => a.propietario)));
                
                const potreradasPayload = uniquePropietarios.map(prop => ({
                    id_finca: fincaId,
                    nombre: `Compra ${dateStr} ${prop}`,
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
                        const propMatch = uniquePropietarios.find(prop => p.nombre === `Compra ${dateStr} ${prop}`);
                        if (propMatch) potreradaIdPorPropietario.set(propMatch, p.id);
                    });
                }

                const pesoCompTotalNum = payload.incluirPesoCompra ? parseFloat(payload.pesoCompraTotal) : 0;
                const totalPesoIngresoLote = payload.animales.reduce((acc, a) => acc + (parseFloat(a.peso_ingreso) || 0), 0);
                const ratioPesoCompra = (payload.incluirPesoCompra && pesoCompTotalNum > 0 && totalPesoIngresoLote > 0) 
                    ? (pesoCompTotalNum / totalPesoIngresoLote) 
                    : 1;

                const records = payload.animales.map(a => ({
                    id_finca: fincaId,
                    numero_chapeta: a.numero_chapeta.trim(),
                    nombre_propietario: a.propietario,
                    id_potrerada: potreradaIdPorPropietario.get(a.propietario) || null,
                    peso_ingreso: parseFloat(a.peso_ingreso),
                    peso_compra: payload.incluirPesoCompra ? Math.round(parseFloat(a.peso_ingreso) * ratioPesoCompra) : null,
                    fecha_ingreso: payload.fechaIngreso,
                    proveedor_compra: payload.selectedProveedor,
                    observaciones_compra: payload.observaciones,
                    etapa: 'levante',
                    especie: 'bovino',
                    sexo: 'M',
                    estado: 'activo'
                }));

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
        <div className="page-container">
            {/* Modal de Confirmación */}
            {showConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setShowConfirm(false)}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', border: '1px solid var(--primary)' }} onClick={e => e.stopPropagation()}>
                        <ShoppingCart size={40} color="var(--primary)" style={{ marginBottom: '16px' }} />
                        <h2 style={{ marginBottom: '12px' }}>Validar Información</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                            ¿Estás seguro de ingresar estos <b>{animales.length} animales</b>? <br />
                            Fecha de entrada: <b>{fechaIngreso}</b>
                        </p>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button onClick={() => setShowConfirm(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}>
                                Cancelar
                            </button>
                            <button onClick={confirmAndInsert} style={{ backgroundColor: 'var(--primary)' }}>
                                Sí, ingresar ahora
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <ShoppingCart size={32} /> Ingreso de Compra
                    </h1>
                    <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0' }}>Módulo para el registro masivo de animales nuevos.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', backgroundColor: isOnline ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)', color: isOnline ? 'var(--success)' : '#ff9800', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {isOnline ? <><Wifi size={18} /> Online</> : <><WifiOff size={18} /> Offline</>}
                    </div>
                    
                    <button 
                        onClick={() => {
                            setQuickProveedor('');
                            setQuickKgComprados('');
                            setQuickAnimalCount('1');
                            setQuickWeights(['']);
                            setShowQuickModal(true);
                        }}
                        style={{ 
                            backgroundColor: 'rgba(52, 152, 219, 0.1)', 
                            color: '#3498db', 
                            border: '1px solid #3498db',
                            padding: '6px 16px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            width: 'auto',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <ShoppingCart size={16} /> Compra Rápida
                    </button>

                    {offlineQueue.length > 0 && isOnline && (
                        <button onClick={syncOfflineQueue} disabled={syncing} style={{ backgroundColor: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UploadCloud size={18} /> {syncing ? 'Sincronizando...' : `Subir Pendientes (${offlineQueue.length})`}
                        </button>
                    )}
                </div>
            </div>

            {/* MODAL COMPRA RÁPIDA (completamente volátil, no guarda en DB) */}
            {showQuickModal && (() => {
                const totalRecibido = quickWeights.reduce((acc, w) => acc + (parseFloat(w) || 0), 0);
                const kgCompradosNum = parseFloat(quickKgComprados) || 0;
                const mermaPorc = (kgCompradosNum > 0 && totalRecibido > 0) ? ((kgCompradosNum - totalRecibido) / kgCompradosNum * 100) : 0;
                const countNum = parseInt(quickAnimalCount) || 1;

                return (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 1500, padding: '20px', overflowY: 'auto' }} onClick={() => setShowQuickModal(false)}>
                        <div className="card" style={{ maxWidth: '900px', width: '100%', border: '1px solid #3498db', marginTop: '20px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                                    <ShoppingCart size={24} color="#3498db" /> Compra Rápida — Calculadora de Merma
                                </h2>
                                <button onClick={() => setShowQuickModal(false)} style={{ backgroundColor: 'transparent', padding: '8px', color: 'var(--text-muted)', width: 'auto' }}><X size={24} /></button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                                <div>
                                    <label>Vendedor / Proveedor</label>
                                    <select value={quickProveedor} onChange={e => setQuickProveedor(e.target.value)}>
                                        <option value="">Seleccionar...</option>
                                        {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label>Kg Comprados (Origen / Báscula Proveedor)</label>
                                    <input type="number" step="0.1" value={quickKgComprados} onChange={e => setQuickKgComprados(e.target.value)} placeholder="Ej. 6216" />
                                </div>
                                <div>
                                    <label>Nro. de Animales</label>
                                    <input type="number" min="1" max="100" value={quickAnimalCount} onChange={e => {
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
                                    }} />
                                </div>
                            </div>

                            {/* Indicador de Merma en vivo */}
                            <div style={{ display: 'flex', gap: '20px', backgroundColor: 'rgba(52,152,219,0.05)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(52,152,219,0.2)', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kg Comprados</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{kgCompradosNum.toLocaleString()} <small style={{ fontSize: '0.9rem' }}>kg</small></div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kg Recibidos</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{totalRecibido.toLocaleString()} <small style={{ fontSize: '0.9rem' }}>kg</small></div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>% Merma</div>
                                    <div style={{ fontSize: '3rem', fontWeight: '900', color: mermaPorc > 0 ? '#e53935' : 'var(--success)', lineHeight: 1 }}>
                                        {mermaPorc.toFixed(2)}%
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Peso Promedio</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{(totalRecibido / countNum).toFixed(1)} <small style={{ fontSize: '0.9rem' }}>kg</small></div>
                                </div>
                            </div>

                            <label style={{ marginBottom: '12px', display: 'block', fontWeight: 'bold' }}>Pesos Individuales — Báscula Finca (kg)</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginBottom: '32px' }}>
                                {quickWeights.map((w, i) => (
                                    <div key={i} style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: 'var(--text-muted)', pointerEvents: 'none' }}>{i + 1}</span>
                                        <input 
                                            type="number" step="0.1" value={w}
                                            onChange={e => {
                                                const newW = [...quickWeights];
                                                newW[i] = e.target.value;
                                                setQuickWeights(newW);
                                            }}
                                            style={{ paddingLeft: '22px', textAlign: 'right', marginBottom: 0, fontSize: '1rem' }}
                                            placeholder="0.0"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowQuickModal(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)', width: 'auto', padding: '0 24px' }}>Cancelar</button>
                                <button 
                                    onClick={() => {
                                        if (!quickProveedor || !quickKgComprados) { alert('Selecciona el proveedor y los Kg comprados.'); return; }
                                        const animalsForReport = quickWeights.map((w, idx) => ({ numero_chapeta: `A${idx + 1}`, peso_ingreso: parseFloat(w) || 0 }));
                                        setQuickReportData({
                                            proveedor: quickProveedor,
                                            fecha: new Date().toISOString().split('T')[0],
                                            animales: animalsForReport,
                                            pesoCompraTotal: parseFloat(quickKgComprados)
                                        });
                                        setShowQuickModal(false);
                                        setShowQuickReport(true);
                                    }}
                                    style={{ backgroundColor: '#3498db', width: 'auto', padding: '0 32px' }}
                                >
                                    <CheckCircle2 size={18} /> Generar Reporte de Merma
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjError}</div>}

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <button 
                    onClick={() => setShowLastTags(!showLastTags)}
                    style={{ 
                        backgroundColor: showLastTags ? '#ffc107' : 'rgba(255, 193, 7, 0.1)', 
                        color: showLastTags ? '#000' : '#ffc107',
                        padding: '10px 20px',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        width: 'auto',
                        border: '1px solid #ffc107',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: '8px',
                        transition: 'all 0.3s ease'
                    }}
                >
                    <Info size={18} color={showLastTags ? '#000' : '#ffc107'} /> {showLastTags ? 'Ocultar últimas chapetas' : 'Ver últimas chapetas por dueño'}
                </button>
            </div>

            {showLastTags && (
                <div className="card" style={{ marginBottom: '24px', border: '1px solid var(--primary)', animation: 'fadeIn 0.3s ease' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Info size={18} color="var(--primary)" /> Últimas Chapetas Registradas
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        {lastTags.length > 0 ? lastTags.map((lt, idx) => (
                            <div key={idx} style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lt.owner}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>{lt.tag}</div>
                            </div>
                        )) : (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay datos suficientes para calcular las últimas chapetas.</p>
                        )}
                    </div>
                </div>
            )}

            <div className="card" style={{ marginBottom: '32px' }}>
                <form onSubmit={generarFilas} style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label>Fecha de Entrada</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    value={fechaIngreso}
                                    onChange={e => setFechaIngreso(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                    disabled={loading || animales.length > 0}
                                />
                            </div>
                        </div>

                        <div style={{ flex: '1 1 250px' }}>
                            <label>Vendedor / Proveedor</label>
                            <select
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
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 100%' }}>
                            <label>Observaciones de la Compra</label>
                            <input
                                type="text"
                                placeholder="Ej: Lote comprado en subasta, buena genética..."
                                value={observaciones}
                                onChange={e => setObservaciones(e.target.value)}
                                disabled={loading || animales.length > 0}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input 
                                type="checkbox" 
                                id="checkPesoCompra"
                                checked={incluirPesoCompra}
                                onChange={e => setIncluirPesoCompra(e.target.checked)}
                                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                disabled={loading || animales.length > 0}
                            />
                            <label htmlFor="checkPesoCompra" style={{ cursor: 'pointer', margin: 0 }}>¿Incluir Peso de Compra del lote?</label>
                        </div>

                        {incluirPesoCompra && (
                            <div style={{ maxWidth: '300px' }}>
                                <label>Peso Total de Compra (kg)</label>
                                <input 
                                    type="number" 
                                    step="0.1"
                                    placeholder="Peso total pagado..."
                                    value={pesoCompraTotal}
                                    onChange={e => setPesoCompraTotal(e.target.value)}
                                    disabled={loading || animales.length > 0}
                                />
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 150px' }}>
                            <label>Cantidad de Animales</label>
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
                                <Trash2 size={18} /> Cancelar / Reiniciar
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
                                <th style={{ padding: '16px', color: 'var(--text-muted)', width: '60px' }}>Item</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Nro. Chapeta</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Peso Entrada (kg)</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Propietario</th>
                                <th style={{ padding: '16px', width: '50px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {animales.map((a, index) => {
                                    const tagTrimmed = a.numero_chapeta.trim();
                                    const isDuplicateInList = tagTrimmed !== '' && animales.filter(item => item.numero_chapeta.trim() === tagTrimmed).length > 1;
                                    const isDuplicateInDB = tagTrimmed !== '' && existingTags.has(tagTrimmed);
                                    const hasError = isDuplicateInList || isDuplicateInDB;

                                    return (
                                        <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{index + 1}</td>
                                            <td style={{ padding: '8px 16px' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Ej. 1024"
                                                    value={a.numero_chapeta}
                                                    onChange={e => updateAnimal(index, 'numero_chapeta', e.target.value)}
                                                    style={{ 
                                                        marginBottom: 0, 
                                                        padding: '10px',
                                                        border: hasError ? '2px solid var(--error)' : '1px solid rgba(255,255,255,0.1)',
                                                        backgroundColor: hasError ? 'rgba(244, 67, 54, 0.05)' : 'transparent'
                                                    }}
                                                />
                                                {isDuplicateInList && <div style={{ color: 'var(--error)', fontSize: '0.7rem', marginTop: '4px' }}>Repetido en la lista</div>}
                                                {isDuplicateInDB && <div style={{ color: 'var(--error)', fontSize: '0.7rem', marginTop: '4px' }}>Ya existe en inventario</div>}
                                            </td>
                                            <td style={{ padding: '8px 16px' }}>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    placeholder="Ej. 250"
                                                    value={a.peso_ingreso}
                                                    onChange={e => updateAnimal(index, 'peso_ingreso', e.target.value)}
                                                    style={{ marginBottom: 0, padding: '10px' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 16px' }}>
                                                <select
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
                                            <td style={{ padding: '16px' }}>
                                                <button
                                                    onClick={() => removeFila(index)}
                                                    style={{ backgroundColor: 'transparent', padding: '4px', color: 'rgba(255,255,255,0.2)', width: 'auto' }}
                                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>

                    <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={handleIngresarCompra}
                            disabled={loading}
                            style={{ maxWidth: '400px', fontSize: '1.2rem', padding: '16px 48px' }}
                        >
                            {loading ? 'Procesando Ingreso...' : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CheckCircle2 size={24} /> Confirmar Ingreso de {animales.length} Animales
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
                        fechaIngreso={reportData.fecha}
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
        </div>
    );
}
