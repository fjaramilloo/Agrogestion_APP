import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Layers, Plus, Save, Trash2, Info } from 'lucide-react';

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
}

export default function Aforos() {
    const { fincaId, role } = useAuth();
    const isAdminOrCowboy = role === 'administrador' || role === 'vaquero';

    const [potreros, setPotreros] = useState<Potrero[]>([]);
    const [selectedPotreroId, setSelectedPotreroId] = useState('');
    
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

    useEffect(() => {
        if (!fincaId) return;
        fetchPotreros();
        fetchHistorial();
    }, [fincaId]);

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
            } else {
                setPotreradaInfo(null);
                setAnimalCount(0);
            }
        };
        fetchContext();
    }, [selectedPotreroId, potreros]);

    const fetchPotreros = async () => {
        const { data } = await supabase
            .from('potreros')
            .select('id, nombre, area_hectareas')
            .eq('id_finca', fincaId)
            .order('nombre');
        if (data) setPotreros(data);
    };

    const fetchHistorial = async () => {
        const { data } = await supabase
            .from('registros_aforo')
            .select(`
                id, fecha, promedio_muestras_kg, viabilidad, aforo_real_kg,
                potrero:potreros(nombre)
            `)
            .eq('id_finca', fincaId)
            .order('fecha', { ascending: false })
            .limit(50);
        if (data) setHistorial(data as any);
    };

    const updateMuestra = (index: number, val: string) => {
        const n = [...muestras];
        n[index] = val;
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
    };

    return (
        <div className="page-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '32px' }}>
                <Layers size={32} /> Aforos de Potreros
            </h1>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                
                {/* FORMULARIO */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                            <select 
                                value={selectedPotreroId} 
                                onChange={(e) => setSelectedPotreroId(e.target.value)}
                                required
                            >
                                <option value="">-- Seleccione --</option>
                                {potreros.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
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
                                            type="number" 
                                            step="0.01" 
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
                                <input type="number" value={viabilidad} onChange={e => setViabilidad(e.target.value)} required min="1" max="100" style={{ margin: 0 }} />
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1.2rem' }}>Historial Reciente</h3>
                    
                    {historial.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <Layers size={48} style={{ opacity: 0.2, margin: '0 auto 16px auto' }} />
                            <p>No hay aforos registrados aún.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {historial.map(h => (
                                <div key={h.id} className="card" style={{ padding: '16px', borderLeft: '4px solid var(--primary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <strong style={{ color: 'white', fontSize: '1.1rem' }}>{h.potrero?.nombre}</strong>
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
        </div>
    );
}

