import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Edit2, Scale, Calendar, Save, X } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface Potrerada {
    id: string;
    nombre: string;
    etapa: string;
    animalCount: number;
    pesoPromedio: number;
    diasPesajePromedio: number;
}

export default function Potreradas() {
    const { fincaId } = useAuth();
    const [potreradas, setPotreradas] = useState<Potrerada[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingPotrerada, setEditingPotrerada] = useState<Potrerada | null>(null);
    const [newName, setNewName] = useState('');

    const fetchPotreradasData = async () => {
        if (!fincaId) return;
        setLoading(true);

        try {
            // 1. Obtener todas las potreradas de la finca
            const { data: pots, error: potsErr } = await supabase
                .from('potreradas')
                .select('*')
                .eq('id_finca', fincaId)
                .order('nombre', { ascending: true });

            if (potsErr) throw potsErr;

            // 2. Obtener todos los animales activos de la finca para agruparlos
            const { data: animals, error: animErr } = await supabase
                .from('animales')
                .select(`
                    id, 
                    id_potrerada,
                    peso_ingreso,
                    fecha_ingreso,
                    registros_pesaje (
                        peso,
                        fecha
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('estado', 'activo');

            if (animErr) throw animErr;

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            const processedPots = pots.map((p: any) => {
                const groupAnimals = animals?.filter((a: any) => a.id_potrerada === p.id) || [];
                
                let totalPeso = 0;
                let totalDiasPesaje = 0;
                let validWeightCount = 0;
                let validDateCount = 0;

                groupAnimals.forEach((a: any) => {
                    const registros = (a.registros_pesaje || []).sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );
                    const lastP = registros[0];
                    
                    const pesoActual = lastP ? lastP.peso : a.peso_ingreso;
                    totalPeso += Number(pesoActual);
                    validWeightCount++;

                    const fechaRef = lastP ? new Date(lastP.fecha) : new Date(a.fecha_ingreso);
                    fechaRef.setHours(0,0,0,0);
                    const diff = differenceInDays(hoy, fechaRef);
                    totalDiasPesaje += diff;
                    validDateCount++;
                });

                return {
                    id: p.id,
                    nombre: p.nombre,
                    etapa: p.etapa,
                    animalCount: groupAnimals.length,
                    pesoPromedio: validWeightCount > 0 ? totalPeso / validWeightCount : 0,
                    diasPesajePromedio: validDateCount > 0 ? totalDiasPesaje / validDateCount : 0
                };
            });

            setPotreradas(processedPots);
        } catch (error) {
            console.error('Error fetching potreradas:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPotreradasData();
    }, [fincaId]);

    const handleEditClick = (p: Potrerada) => {
        setEditingPotrerada(p);
        setNewName(p.nombre);
    };

    const handleUpdateName = async () => {
        if (!editingPotrerada || !newName.trim()) return;

        try {
            const { error } = await supabase
                .from('potreradas')
                .update({ nombre: newName.trim() })
                .eq('id', editingPotrerada.id);

            if (error) throw error;

            setEditingPotrerada(null);
            fetchPotreradasData();
        } catch (error: any) {
            alert('Error al actualizar: ' + error.message);
        }
    };

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="title">Gestión de Potreradas</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Métricas y administración de grupos de animales.</p>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--primary)' }}>Cargando potreradas...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                    {potreradas.map(p => (
                        <div key={p.id} className="card" style={{ padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--primary-light)' }}>{p.nombre}</h3>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{p.etapa}</span>
                                </div>
                                <button 
                                    onClick={() => handleEditClick(p)}
                                    style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                >
                                    <Edit2 size={16} />
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <Users size={14} /> Animales
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{p.animalCount}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <Scale size={14} /> Peso Prom.
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Math.round(p.pesoPromedio)} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>kg</span></div>
                                </div>
                                <div style={{ gridColumn: '1 / -1', background: 'rgba(255,152,0,0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,152,0,0.1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <Calendar size={14} /> Días desde último pesaje (prom.)
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>{Math.round(p.diasPesajePromedio)} <span style={{ fontSize: '0.9rem' }}>días</span></div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {potreradas.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            No hay potreradas registradas en esta finca.
                        </div>
                    )}
                </div>
            )}

            {editingPotrerada && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0 }}>Editar Nombre</h2>
                            <button onClick={() => setEditingPotrerada(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label>Nombre de la Potrerada</label>
                            <input 
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="Ej: Lote 1 - Engorde"
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setEditingPotrerada(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: 'none' }}>
                                Cancelar
                            </button>
                            <button onClick={handleUpdateName} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Save size={18} /> Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
