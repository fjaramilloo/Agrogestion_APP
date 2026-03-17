import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, Plus, Trash2, Edit2, Check, X, Layers } from 'lucide-react';

interface Potrero {
    id: string;
    nombre: string;
    area_hectareas: number;
    id_rotacion: string | null;
}

interface Rotacion {
    id: string;
    nombre: string;
}

export default function Rotations() {
    const { fincaId, role } = useAuth();
    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    const [rotaciones, setRotaciones] = useState<Rotacion[]>([]);
    const [potreros, setPotreros] = useState<Potrero[]>([]);
    
    // Estados de edición/creación
    const [nuevaRotacionNombre, setNuevaRotacionNombre] = useState('');
    const [showNuevaRotacion, setShowNuevaRotacion] = useState(false);
    
    const [nuevoPotrero, setNuevoPotrero] = useState({ nombre: '', area: '', id_rotacion: '' });
    const [showNuevoPotrero, setShowNuevoPotrero] = useState(false);
    
    const [editingPotrero, setEditingPotrero] = useState<string | null>(null);
    const [editPotreroForm, setEditPotreroForm] = useState({ nombre: '', area: '', id_rotacion: '' });

    const isAdmin = role === 'administrador';

    const fetchData = async () => {
        if (!fincaId) return;
        setLoading(true);
        try {
            const { data: rotData } = await supabase
                .from('rotaciones')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');

            const { data: potData } = await supabase
                .from('potreros')
                .select('id, nombre, area_hectareas, id_rotacion')
                .eq('id_finca', fincaId)
                .order('nombre');

            if (rotData) setRotaciones(rotData);
            if (potData) setPotreros(potData);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [fincaId]);

    const handleAddRotacion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAdmin || !fincaId || !nuevaRotacionNombre.trim()) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('rotaciones')
                .insert({ id_finca: fincaId, nombre: nuevaRotacionNombre.trim() });
            if (error) throw error;
            setNuevaRotacionNombre('');
            setShowNuevaRotacion(false);
            fetchData();
            setMsjExito('Rotación creada.');
        } catch (err: any) {
            setMsjError('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPotrero = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAdmin || !fincaId || !nuevoPotrero.nombre.trim()) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('potreros')
                .insert({
                    id_finca: fincaId,
                    nombre: nuevoPotrero.nombre.trim(),
                    area_hectareas: parseFloat(nuevoPotrero.area) || 0,
                    id_rotacion: nuevoPotrero.id_rotacion || null
                });
            if (error) throw error;
            setNuevoPotrero({ nombre: '', area: '', id_rotacion: '' });
            setShowNuevoPotrero(false);
            fetchData();
            setMsjExito('Potrero creado.');
        } catch (err: any) {
            setMsjError('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePotrero = async (id: string) => {
        if (!isAdmin) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('potreros')
                .update({
                    nombre: editPotreroForm.nombre.trim(),
                    area_hectareas: parseFloat(editPotreroForm.area) || 0,
                    id_rotacion: editPotreroForm.id_rotacion || null
                })
                .eq('id', id);
            if (error) throw error;
            setEditingPotrero(null);
            fetchData();
            setMsjExito('Potrero actualizado.');
        } catch (err: any) {
            setMsjError('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const removePotrero = async (id: string) => {
        if (!isAdmin || !confirm('¿Eliminar este potrero?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('potreros').delete().eq('id', id);
            if (error) throw error;
            fetchData();
        } finally {
            setLoading(false);
        }
    };

    const removeRotacion = async (id: string) => {
        if (!isAdmin || !confirm('¿Eliminar esta rotación? Los potreros asociados quedarán sin rotación.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('rotaciones').delete().eq('id', id);
            if (error) throw error;
            fetchData();
        } finally {
            setLoading(false);
        }
    };

    const startEditing = (p: Potrero) => {
        setEditingPotrero(p.id);
        setEditPotreroForm({
            nombre: p.nombre,
            area: p.area_hectareas.toString(),
            id_rotacion: p.id_rotacion || ''
        });
    };

    return (
        <div className="page-container" style={{ maxWidth: '1000px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <MapPin size={32} /> Rotaciones y Potreros
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Gestión integral de la infraestructura de la finca.</p>
                </div>
                {isAdmin && (
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => setShowNuevaRotacion(true)} className="btn-secondary" style={{ width: 'auto' }}>
                            <Layers size={18} /> + Rotación
                        </button>
                        <button onClick={() => setShowNuevoPotrero(true)} style={{ width: 'auto' }}>
                            <Plus size={18} /> + Potrero
                        </button>
                    </div>
                )}
            </div>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center' }}>{msjError}</div>}

            {/* Modales / Formularios Rápidos */}
            {isAdmin && (showNuevaRotacion || showNuevoPotrero) && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <h2>{showNuevaRotacion ? 'Nueva Rotación' : 'Nuevo Potrero'}</h2>
                            <button onClick={() => { setShowNuevaRotacion(false); setShowNuevoPotrero(false); }} style={{ background: 'none', width: 'auto', padding: 0 }}><X size={24} /></button>
                        </div>
                        
                        {showNuevaRotacion ? (
                            <form onSubmit={handleAddRotacion}>
                                <label>Nombre de la Rotación</label>
                                <input autoFocus type="text" placeholder="Ej: Rotación Alta" value={nuevaRotacionNombre} onChange={e => setNuevaRotacionNombre(e.target.value)} required />
                                <button type="submit" disabled={loading}>{loading ? 'Creando...' : 'Crear Rotación'}</button>
                            </form>
                        ) : (
                            <form onSubmit={handleAddPotrero}>
                                <label>Nombre del Potrero</label>
                                <input autoFocus type="text" placeholder="Ej: Potrero 1" value={nuevoPotrero.nombre} onChange={e => setNuevoPotrero({...nuevoPotrero, nombre: e.target.value})} required />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label>Área (Ha)</label>
                                        <input type="number" step="0.01" placeholder="0.00" value={nuevoPotrero.area} onChange={e => setNuevoPotrero({...nuevoPotrero, area: e.target.value})} required />
                                    </div>
                                    <div>
                                        <label>Rotación</label>
                                        <select value={nuevoPotrero.id_rotacion} onChange={e => setNuevoPotrero({...nuevoPotrero, id_rotacion: e.target.value})}>
                                            <option value="">Sin Rotación</option>
                                            {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <button type="submit" disabled={loading} style={{ marginTop: '12px' }}>{loading ? 'Guardando...' : 'Guardar Potrero'}</button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Rotación</th>
                                <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Potrero</th>
                                <th style={{ padding: '16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Área (Ha)</th>
                                {isAdmin && <th style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {potreros.length === 0 ? (
                                <tr>
                                    <td colSpan={isAdmin ? 4 : 3} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay potreros registrados.</td>
                                </tr>
                            ) : (
                                potreros.map(p => {
                                    const rotName = rotaciones.find(r => r.id === p.id_rotacion)?.nombre || '---';
                                    const isEditing = editingPotrero === p.id;

                                    return (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }} className="table-row-hover">
                                            <td style={{ padding: '16px' }}>
                                                {isEditing ? (
                                                    <select 
                                                        value={editPotreroForm.id_rotacion} 
                                                        onChange={e => setEditPotreroForm({...editPotreroForm, id_rotacion: e.target.value})}
                                                        style={{ padding: '6px', margin: 0, fontSize: '0.9rem' }}
                                                    >
                                                        <option value="">Sin Rotación</option>
                                                        {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                    </select>
                                                ) : (
                                                    <span style={{ color: rotName === '---' ? 'var(--text-muted)' : 'var(--primary-light)', fontWeight: 500 }}>
                                                        {rotName}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {isEditing ? (
                                                    <input 
                                                        type="text" 
                                                        value={editPotreroForm.nombre} 
                                                        onChange={e => setEditPotreroForm({...editPotreroForm, nombre: e.target.value})}
                                                        style={{ padding: '6px', margin: 0, fontSize: '0.9rem' }}
                                                    />
                                                ) : (
                                                    <span style={{ fontWeight: 'bold' }}>{p.nombre}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                {isEditing ? (
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        value={editPotreroForm.area} 
                                                        onChange={e => setEditPotreroForm({...editPotreroForm, area: e.target.value})}
                                                        style={{ padding: '6px', margin: 0, textAlign: 'right', fontSize: '0.9rem' }}
                                                    />
                                                ) : (
                                                    <span style={{ color: 'white' }}>{p.area_hectareas.toFixed(2)}</span>
                                                )}
                                            </td>
                                            {isAdmin && (
                                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                                        {isEditing ? (
                                                            <>
                                                                <button onClick={() => handleUpdatePotrero(p.id)} style={{ padding: '4px', width: 'auto', background: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', border: 'none' }}>
                                                                    <Check size={18} />
                                                                </button>
                                                                <button onClick={() => setEditingPotrero(null)} style={{ padding: '4px', width: 'auto', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: 'none' }}>
                                                                    <X size={18} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => startEditing(p)} style={{ padding: '4px', width: 'auto', background: 'transparent', color: 'var(--text-muted)', border: 'none' }} className="icon-btn">
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button onClick={() => removePotrero(p.id)} style={{ padding: '4px', width: 'auto', background: 'transparent', color: 'var(--text-muted)', border: 'none' }} className="icon-btn-danger">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Gestión de Rotaciones (Solo Admin) */}
            {isAdmin && rotaciones.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px' }}>Gestión de Rotaciones</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        {rotaciones.map(r => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '8px 16px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Layers size={14} color="var(--primary-light)" />
                                <span style={{ fontWeight: 500 }}>{r.nombre}</span>
                                <button onClick={() => removeRotacion(r.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
