import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Layers, Plus, Save, Trash2, Info, X, Wifi, WifiOff, UploadCloud } from 'lucide-react';

interface Potrero {
    id: string;
    nombre: string;
    area_hectareas: number;
}

interface RegistroAforo {
    id: string;
    fecha: string;
    promedio_muestras_kg: number;
    viabilidad: number;
    aforo_real_kg: number;
    potrero: { nombre: string };
    animales_presentes?: number;
    id_potrero: string;
    isOffline?: boolean;
}

interface OfflineAforoPayload {
    id_temp: string;
    id_finca: string;
    id_potrero: string;
    fecha: string;
    muestras: number[];
    promedio_muestras_kg: number;
    viabilidad: number;
    aforo_real_kg: number;
    id_potrerada: string | null;
    animales_presentes: number;
    potrero: { nombre: string };
}

export default function Aforos() {
    const { fincaId, role } = useAuth();
    const isAdminOrCowboy = role === 'administrador' || role === 'vaquero';

    const [potreros, setPotreros] = useState<Potrero[]>([]);
    const [selectedPotreroId, setSelectedPotreroId] = useState('');
    const [potreroSearch, setPotreroSearch] = useState('');
    const [consumoBase, setConsumoBase] = useState(50); // Default, from config
    
    // Online / Sync State
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState<OfflineAforoPayload[]>([]);
    const [syncing, setSyncing] = useState(false);
    
    // Potrero Info Context
    const [areaInfo, setAreaInfo] = useState<number | null>(null);
    const [potreradaInfo, setPotreradaInfo] = useState<{ id: string, nombre: string } | null>(null);
    const [animalCount, setAnimalCount] = useState<number>(0);

    // Formulario Aforo
    const [muestras, setMuestras] = useState<string[]>(Array(8).fill('')); // Iniciar con 8 vacias
    const [viabilidad, setViabilidad] = useState('70');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [historial, setHistorial] = useState<RegistroAforo[]>([]);

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Modal Calculadora
    const [modalCalcOpen, setModalCalcOpen] = useState<{ open: boolean, aforo: RegistroAforo | null, diasLleva: string }>({ open: false, aforo: null, diasLleva: '-' });
    const [calcConsumo, setCalcConsumo] = useState('50');
    const [calcAnimales, setCalcAnimales] = useState('0');
    const [calcDias, setCalcDias] = useState('0');

    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); }
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const saved = localStorage.getItem('agrogestion_aforos_offline');
        if (saved) {
            try { setOfflineQueue(JSON.parse(saved)); } catch (e) {}
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!fincaId) return;

        const fetchConfig = async () => {
            if (isOnline) {
                const { data } = await supabase.from('configuracion_kpi').select('consumo_dia_potrero').eq('id_finca', fincaId).single();
                if (data && data.consumo_dia_potrero) {
                    setConsumoBase(data.consumo_dia_potrero);
                    localStorage.setItem(`agrogestion_config_aforo_${fincaId}`, data.consumo_dia_potrero.toString());
                }
            } else {
                const cached = localStorage.getItem(`agrogestion_config_aforo_${fincaId}`);
                if (cached) setConsumoBase(parseFloat(cached));
            }
        };

        fetchConfig();
        fetchPotreros();
        fetchHistorial();
    }, [fincaId, isOnline]);
    
    useEffect(() => {
        if (isOnline && offlineQueue.length > 0) {
            syncOfflineQueue();
        }
    }, [isOnline]);

    useEffect(() => {
        if (!selectedPotreroId) {
            setAreaInfo(null);
            setPotreradaInfo(null);
            setAnimalCount(0);
            return;
        }

        const potrero = potreros.find(p => p.id === selectedPotreroId);
        if (potrero) setAreaInfo(potrero.area_hectareas || 0);

        // Fetch potrerada and animals count logic
        const fetchContext = async () => {
            if (isOnline) {
                // Find current movement that links to this potrero
                const { data: mov } = await supabase
                    .from('movimientos_potreros')
                    .select(`
                        id_potrerada,
                        potreradas (id, nombre)
                    `)
                    .eq('id_potrero', selectedPotreroId)
                    .is('fecha_salida', null)
                    .limit(1)
                    .single();

                if (mov && mov.potreradas) {
                    setPotreradaInfo(mov.potreradas as any);
                    // Get animal count for this potrerada
                    const { count } = await supabase
                        .from('animales')
                        .select('id', { count: 'exact', head: true })
                        .eq('id_potrerada', mov.id_potrerada)
                        .eq('estado', 'activo');
                    setAnimalCount(count || 0);
                    localStorage.setItem(`ctx_aforo_${selectedPotreroId}`, JSON.stringify({ potreradaInfo: mov.potreradas, animalCount: count }));
                } else {
                    setPotreradaInfo(null);
                    setAnimalCount(0);
                    localStorage.removeItem(`ctx_aforo_${selectedPotreroId}`);
                }
            } else {
                const cached = localStorage.getItem(`ctx_aforo_${selectedPotreroId}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setPotreradaInfo(parsed.potreradaInfo);
                    setAnimalCount(parsed.animalCount || 0);
                } else {
                    setPotreradaInfo(null);
                    setAnimalCount(0);
                }
            }
        };
        fetchContext();
    }, [selectedPotreroId, potreros]);

    const fetchPotreros = async () => {
        if (isOnline) {
            const { data } = await supabase
                .from('potreros')
                .select('id, nombre, area_hectareas')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) {
                setPotreros(data);
                localStorage.setItem(`agrogestion_potreros_aforo_${fincaId}`, JSON.stringify(data));
            }
        } else {
            const cached = localStorage.getItem(`agrogestion_potreros_aforo_${fincaId}`);
            if (cached) setPotreros(JSON.parse(cached));
        }
    };

    const syncOfflineQueue = async () => {
        if (!fincaId || offlineQueue.length === 0 || !navigator.onLine) return;
        setSyncing(true);
        let newQueue = [...offlineQueue];
        try {
            for (const payload of offlineQueue) {
                const aforoToInsert = { ...payload };
                delete (aforoToInsert as any).id_temp;
                delete (aforoToInsert as any).potrero;

                const { error } = await supabase.from('registros_aforo').insert(aforoToInsert);
                if (!error) {
                    newQueue = newQueue.filter(item => item.id_temp !== payload.id_temp);
                }
            }
            setOfflineQueue(newQueue);
            localStorage.setItem('agrogestion_aforos_offline', JSON.stringify(newQueue));
            if (offlineQueue.length > 0) setMsjExito('Aforos offline sincronizados exitosamente.');
            fetchHistorial();
        } catch (err) {
            console.error('Error syncing:', err);
        } finally {
            setSyncing(false);
        }
    };

    const fetchHistorial = async () => {
        if (isOnline) {
            const { data } = await supabase
                .from('registros_aforo')
                .select(`
                    id, fecha, promedio_muestras_kg, viabilidad, aforo_real_kg, animales_presentes, id_potrero,
                    potrero:potreros(nombre)
                `)
                .eq('id_finca', fincaId)
                .order('fecha', { ascending: false })
                .limit(50);
            if (data) {
                setHistorial(data as any);
                localStorage.setItem(`agrogestion_aforos_hist_${fincaId}`, JSON.stringify(data));
            }
        } else {
            const cached = localStorage.getItem(`agrogestion_aforos_hist_${fincaId}`);
            if (cached) setHistorial(JSON.parse(cached));
        }
    };

    const updateMuestra = (index: number, val: string) => {
        // Reemplazar comas por puntos de una vez para que sea inteligente
        let cleanVal = val.replace(',', '.');
        
        // No permitir guiones (negativos)
        cleanVal = cleanVal.replace(/-/g, '');

        // Validar que solo sean números y máximo un punto decimal
        if (!/^\d*\.?\d*$/.test(cleanVal) && cleanVal !== '') return;

        const n = [...muestras];
        n[index] = cleanVal;
        setMuestras(n);
    };

    const addMuestra = () => {
        setMuestras([...muestras, '']);
    };

    const deleteMuestra = (idx: number) => {
        if (muestras.length <= 8) return;
        const n = muestras.filter((_, i) => i !== idx);
        setMuestras(n);
    };

    // Cálculos
    const nums = muestras.map(m => parseFloat(m)).filter(n => !isNaN(n) && n > 0);
    const avgMuestra = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const viaValue = parseFloat(viabilidad) || 0;
    
    // Formula: Promedio (kg/m2) * Area (ha -> m2) * (viabilidad%)
    // Area m2 = Area Ha * 10000
    const aforoReal = areaInfo ? avgMuestra * (areaInfo * 10000) * (viaValue / 100) : 0;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsjError('');
        setMsjExito('');
        if (!selectedPotreroId) {
            setMsjError('Selecciona un potrero');
            return;
        }
        if (nums.length < 8) {
            setMsjError('Debes ingresar al menos 8 muestras de peso válidas.');
            return;
        }
        if (!areaInfo) {
            setMsjError('El potrero seleccionado no tiene área configurada. Edita el potrero primero.');
            return;
        }

        if (isOnline) {
            setLoading(true);
            try {
                const { error } = await supabase.from('registros_aforo').insert({
                    id_finca: fincaId,
                    id_potrero: selectedPotreroId,
                    fecha: fecha,
                    muestras: nums, // jsonb
                    promedio_muestras_kg: avgMuestra,
                    viabilidad: viaValue,
                    aforo_real_kg: aforoReal,
                    id_potrerada: potreradaInfo?.id || null,
                    animales_presentes: animalCount
                });
                if (error) throw error;
                
                setMsjExito('Aforo guardado exitosamente.');
                setMuestras(Array(8).fill(''));
                setSelectedPotreroId('');
                setViabilidad('70');
                fetchHistorial();
            } catch (err: any) {
                setMsjError(err.message);
            } finally {
                setLoading(false);
            }
        } else {
            const pNombre = potreros.find(p => p.id === selectedPotreroId)?.nombre || 'Desconocido';
            const newPayload: OfflineAforoPayload = {
                id_temp: 'aforo_' + Math.random().toString(36).substring(7),
                id_finca: fincaId || '',
                id_potrero: selectedPotreroId,
                fecha: fecha,
                muestras: nums,
                promedio_muestras_kg: avgMuestra,
                viabilidad: viaValue,
                aforo_real_kg: aforoReal,
                id_potrerada: potreradaInfo?.id || null,
                animales_presentes: animalCount,
                potrero: { nombre: pNombre }
            };
            const newQueue = [...offlineQueue, newPayload];
            setOfflineQueue(newQueue);
            localStorage.setItem('agrogestion_aforos_offline', JSON.stringify(newQueue));
            
            setMsjExito('Aforo guardado localmente (Offline). Se sincronizará cuando haya conexión.');
            setMuestras(Array(8).fill(''));
            setSelectedPotreroId('');
            setViabilidad('70');
        }
    };

    const openCalculadora = async (aforo: RegistroAforo) => {
        setModalCalcOpen({ open: true, aforo, diasLleva: 'Calculando...' });
        const animales = aforo.animales_presentes || 1;
        const consumo = consumoBase;
        const dias = aforo.aforo_real_kg / (animales * consumo);

        setCalcConsumo(consumo.toString());
        setCalcAnimales(animales.toString());
        setCalcDias(dias.toFixed(1));

        if (isOnline) {
            // Calcular días reales actuales de ocupación basándonos en el movimiento activo
            const { data: mov } = await supabase
                .from('movimientos_potreros')
                .select(`fecha_ingreso`)
                .eq('id_potrero', aforo.id_potrero)
                .is('fecha_salida', null)
                .order('fecha_ingreso', { ascending: false })
                .limit(1)
                .single();

            let diasStr = 'Ninguno';
            if (mov && mov.fecha_ingreso) {
                const ms = new Date().getTime() - new Date(mov.fecha_ingreso).getTime();
                const days = Math.floor(ms / (1000 * 60 * 60 * 24));
                diasStr = `${Math.max(0, days)} días`;
            }

            setModalCalcOpen(prev => ({ ...prev, diasLleva: diasStr }));
            localStorage.setItem(`agrogestion_calc_dias_${aforo.id_potrero}`, diasStr);
        } else {
            const cached = localStorage.getItem(`agrogestion_calc_dias_${aforo.id_potrero}`);
            setModalCalcOpen(prev => ({ ...prev, diasLleva: cached || 'Desconocido (Offline)' }));
        }
    };

    const displayHistorial = [
        ...offlineQueue.map(q => ({
            id: q.id_temp,
            fecha: q.fecha,
            promedio_muestras_kg: q.promedio_muestras_kg,
            viabilidad: q.viabilidad,
            aforo_real_kg: q.aforo_real_kg,
            animales_presentes: q.animales_presentes,
            id_potrero: q.id_potrero,
            potrero: q.potrero,
            isOffline: true
        })), 
        ...historial
    ];

    return (
        <div className="page-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
                <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                    <Layers size={32} /> Aforos de Potreros
                </h1>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px', 
                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold',
                        backgroundColor: isOnline ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                        color: isOnline ? 'var(--success)' : 'var(--error)'
                    }}>
                        {isOnline ? <><Wifi size={18} /> Online</> : <><WifiOff size={18} /> Offline</>}
                    </span>

                    {offlineQueue.length > 0 && isOnline && (
                        <button onClick={syncOfflineQueue} disabled={syncing} style={{ backgroundColor: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px' }}>
                            <UploadCloud size={18} /> {syncing ? 'Sincronizando...' : `Sincronizar (${offlineQueue.length})`}
                        </button>
                    )}
                </div>
            </div>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjError}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                
                {/* FORMULARIO */}
                <div className="card" style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <h2 style={{ margin: 0, color: 'var(--primary-light)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Nuevo Aforo
                    </h2>
                    
                    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Fecha</label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
                        </div>
                        
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Seleccionar Potrero</label>
                            
                            {/* Buscador de Potreros */}
                            <input 
                                type="text" 
                                placeholder="Buscar potrero por nombre..." 
                                value={potreroSearch}
                                onChange={e => setPotreroSearch(e.target.value)}
                                style={{ marginBottom: '8px' }}
                            />
                            
                            <select 
                                value={selectedPotreroId} 
                                onChange={(e) => setSelectedPotreroId(e.target.value)}
                                required
                            >
                                <option value="">-- Seleccione un potrero --</option>
                                {potreros
                                    .filter(p => p.nombre.toLowerCase().includes(potreroSearch.toLowerCase()))
                                    .map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))
                                }
                            </select>
                        </div>

                        {/* CONTEXT INFO BLOCK */}
                        {selectedPotreroId && (
                            <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Área:</span>
                                    <span style={{ fontWeight: 'bold', color: 'white' }}>{areaInfo ? `${areaInfo} Ha` : 'No configurada'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Ocupación Actual:</span>
                                    <span style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                        {potreradaInfo ? potreradaInfo.nombre : 'Vacío'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Animales:</span>
                                    <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>{animalCount} reses</span>
                                </div>
                            </div>
                        )}

                        <div className="sidebar-divider" style={{ margin: '10px 0' }} />

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ color: 'var(--text-muted)', margin: 0 }}>Muestras (Kg en 1 m²)</label>
                                <span style={{ fontSize: '0.8rem', color: muestras.length < 8 ? 'var(--error)' : 'var(--success)' }}>
                                    {muestras.length} muestras
                                </span>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '8px' }}>
                                {muestras.map((m, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '20px' }}>#{idx+1}</span>
                                        <input 
                                            type="text"
                                            inputMode="decimal"
                                            value={m} 
                                            onChange={e => updateMuestra(idx, e.target.value)} 
                                            placeholder="Kg"
                                            style={{ margin: 0, padding: '8px' }}
                                            required={idx < 8} // Primeras 8 son obligatorias por HTML validación
                                        />
                                        {idx >= 8 && (
                                            <button type="button" onClick={() => deleteMuestra(idx)} style={{ padding: '8px', background: 'none', color: 'var(--error)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button type="button" onClick={addMuestra} style={{ marginTop: '12px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--primary-light)', padding: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <Plus size={16} /> Agregar Muestra
                            </button>
                        </div>

                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <label style={{ color: 'var(--text-muted)', margin: 0 }}>% Viabilidad</label>
                                <div title="Porcentaje del pasto que es aprovechable por el animal (restando pisotones, maleza y desperdicio). Usualmente entre 60% y 80%." style={{ cursor: 'help', color: 'var(--primary)' }}>
                                    <Info size={16} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input 
                                    type="text" 
                                    inputMode="numeric"
                                    value={viabilidad} 
                                    onChange={e => {
                                        let v = e.target.value.replace(/\D/g, ''); // Solo números enteros
                                        if (v !== '' && parseInt(v) > 100) v = '100'; // Tope 100%
                                        setViabilidad(v);
                                    }} 
                                    required 
                                    style={{ margin: 0 }} 
                                    placeholder="Ej: 70"
                                />
                                <span style={{ color: 'var(--text-muted)' }}>%</span>
                            </div>
                        </div>

                        {/* LIVE PREVIEW */}
                        <div style={{ backgroundColor: 'rgba(46, 125, 50, 0.1)', border: '1px solid rgba(46, 125, 50, 0.3)', padding: '16px', borderRadius: '12px', marginTop: '12px' }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Muestra Promedio: <strong style={{ color: 'white' }}>{avgMuestra.toFixed(2)} Kg/m²</strong></p>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--primary-light)' }}>Aforo Real Disponible:</p>
                            <h2 style={{ margin: '4px 0 0 0', color: 'var(--success)', fontSize: '2rem' }}>
                                {aforoReal.toLocaleString('es-CO', { maximumFractionDigits: 0 })} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Kg Forraje V.</span>
                            </h2>
                        </div>

                        <button type="submit" disabled={loading || !isAdminOrCowboy} style={{ marginTop: '12px', padding: '14px' }}>
                            {loading ? 'Procesando...' : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Save size={20}/> Guardar Aforo</span>}
                        </button>
                    </form>
                </div>

                {/* HISTORIAL */}
                <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1.2rem' }}>Historial Reciente</h3>
                    
                    {displayHistorial.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <Layers size={48} style={{ opacity: 0.2, margin: '0 auto 16px auto' }} />
                            <p>No hay aforos registrados aún.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {displayHistorial.map((h: any) => (
                                <div 
                                    key={h.id} 
                                    className="card hover-scale" 
                                    style={{ padding: '16px', borderLeft: '4px solid var(--primary)', cursor: 'pointer', transition: 'all 0.2s' }}
                                    onClick={() => openCalculadora(h)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <strong style={{ color: 'white', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {h.potrero?.nombre}
                                            {h.isOffline && <span style={{ fontSize: '0.7rem', backgroundColor: 'var(--error)', padding: '2px 6px', borderRadius: '10px' }}>Pendiente Sync</span>}
                                        </strong>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{h.fecha}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            <p style={{ margin: '0 0 4px 0' }}>Promedio: {h.promedio_muestras_kg.toFixed(2)} Kg/m²</p>
                                            <p style={{ margin: 0 }}>Viabilidad: {h.viabilidad}%</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ display: 'block', fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--success)' }}>
                                                {h.aforo_real_kg.toLocaleString('es-CO', { maximumFractionDigits: 0 })} Kg
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--primary-light)' }}>Forraje Disp.</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            {/* MODAL CALCULADORA */}
            {modalCalcOpen.open && modalCalcOpen.aforo && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px', position: 'relative' }}>
                        <button onClick={() => setModalCalcOpen({ open: false, aforo: null, diasLleva: '-' })} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <X size={24} />
                        </button>
                        
                        <h3 style={{ margin: '0 0 20px 0', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '40px' }}>
                            <Layers size={20} /> 
                            Cálculo de Ocupación
                        </h3>
                        
                        <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Potrero:</span>
                                <strong style={{ color: 'white', fontSize: '0.9rem' }}>{modalCalcOpen.aforo.potrero.nombre}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Aforo Disponible:</span>
                                <strong style={{ color: 'var(--success)', fontSize: '0.9rem' }}>{modalCalcOpen.aforo.aforo_real_kg.toLocaleString('es-CO', { maximumFractionDigits: 0 })} Kg</strong>
                            </div>
                            <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Animales Presentes:</span>
                                <strong style={{ color: 'white', fontSize: '0.9rem' }}>{modalCalcOpen.aforo.animales_presentes || 0} reses</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Tiempo en Potrero:</span>
                                <strong style={{ color: 'white', fontSize: '0.9rem' }}>{modalCalcOpen.diasLleva}</strong>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ gridColumn: 'span 1' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Consumo/Día (Kg)</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={calcConsumo} 
                                    onChange={e => {
                                        let val = e.target.value.replace(',', '.').replace(/-/g, '');
                                        // filter strict numbers
                                        if (!/^\d*\.?\d*$/.test(val) && val !== '') return;
                                        setCalcConsumo(val);
                                        const C = parseFloat(val) || 0;
                                        const A = parseFloat(calcAnimales) || 1;
                                        if (C > 0 && A > 0) {
                                            setCalcDias((modalCalcOpen.aforo!.aforo_real_kg / (A * C)).toFixed(1));
                                        }
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            
                            <div style={{ gridColumn: 'span 1' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nro de animales</label>
                                <input 
                                    type="text" 
                                    inputMode="numeric"
                                    value={calcAnimales} 
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        setCalcAnimales(val);
                                        const A = parseFloat(val) || 0;
                                        const C = parseFloat(calcConsumo) || 1;
                                        if (A > 0 && C > 0) {
                                            setCalcDias((modalCalcOpen.aforo!.aforo_real_kg / (A * C)).toFixed(1));
                                        }
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div style={{ gridColumn: '1 / -1', backgroundColor: 'rgba(46, 125, 50, 0.1)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(46, 125, 50, 0.3)' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--primary-light)', fontSize: '0.9rem', fontWeight: 'bold' }}>Días Ocupación</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={calcDias} 
                                    onChange={e => {
                                        let val = e.target.value.replace(',', '.').replace(/-/g, '');
                                        if (!/^\d*\.?\d*$/.test(val) && val !== '') return;
                                        setCalcDias(val);
                                        const D = parseFloat(val) || 0;
                                        const A = parseFloat(calcAnimales) || 1;
                                        if (D > 0 && A > 0) {
                                            setCalcConsumo((modalCalcOpen.aforo!.aforo_real_kg / (A * D)).toFixed(1));
                                        }
                                    }}
                                    style={{ width: '100%', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}
                                />
                            </div>
                        </div>

                        <button onClick={() => setModalCalcOpen({ open: false, aforo: null, diasLleva: '-' })} style={{ width: '100%' }}>
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

