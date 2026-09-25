import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, Plus, Trash2, Edit2, Check, X, Layers, Info, Search, CheckSquare, Square, Calculator, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
    const [msjError, setMsjError] = useState('');

    const [rotaciones, setRotaciones] = useState<Rotacion[]>([]);
    const [potreros, setPotreros] = useState<Potrero[]>([]);
    
    // Estados de edición
    const [editingRot, setEditingRot] = useState<string | null>(null);
    const [editRotNombre, setEditRotNombre] = useState('');

    const [editingPot, setEditingPot] = useState<string | null>(null);
    const [editPotForm, setEditPotForm] = useState({ nombre: '', area: '', id_rotacion: '' });

    const [showNuevaRotacion, setShowNuevaRotacion] = useState(false);
    const [nuevaRotNombre, setNuevaRotNombre] = useState('');
    
    // Modal Añadir Potrero
    const [showNuevoPotrero, setShowNuevoPotrero] = useState<string | null>(null); // null, 'none' o id_rotacion
    const [potreroModalTab, setPotreroModalTab] = useState<'existente' | 'nuevo'>('existente');
    const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);
    const [existingSearchTerm, setExistingSearchTerm] = useState('');
    const [nuevoPotForm, setNuevoPotForm] = useState({ nombre: '', area: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Calculadora Voisin
    const [showCalculadora, setShowCalculadora] = useState(false);
    const [calcModo, setCalcModo] = useState<'potreros' | 'ocupacion' | 'descanso'>('potreros');
    const [calcDescanso, setCalcDescanso] = useState<number>(28);
    const [calcOcupacion, setCalcOcupacion] = useState<number>(2);
    const [calcPotreros, setCalcPotreros] = useState<number>(15);

    const isAdmin = role === 'administrador' || role === 'vaquero';

    const fetchData = async () => {
        if (!fincaId) return;
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
            // fetchData fin
        }
    };

    useEffect(() => {
        fetchData();
    }, [fincaId]);

    const handleUpdateRotacion = async (id: string) => {
        if (!isAdmin || !editRotNombre.trim()) return;
        try {
            const { error } = await supabase
                .from('rotaciones')
                .update({ nombre: editRotNombre.trim() })
                .eq('id', id);
            if (error) throw error;
            setEditingRot(null);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleUpdatePotrero = async (id: string) => {
        if (!isAdmin || !editPotForm.nombre.trim()) return;
        try {
            const { error } = await supabase
                .from('potreros')
                .update({
                    nombre: editPotForm.nombre.trim(),
                    area_hectareas: parseFloat(editPotForm.area) || 0,
                    id_rotacion: editPotForm.id_rotacion || null
                })
                .eq('id', id);
            if (error) throw error;
            setEditingPot(null);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleAddRotacion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nuevaRotNombre.trim() || !fincaId) return;
        try {
            const { error } = await supabase.from('rotaciones').insert({ id_finca: fincaId, nombre: nuevaRotNombre.trim() });
            if (error) throw error;
            setNuevaRotNombre('');
            setShowNuevaRotacion(false);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleAddPotrero = async (e: React.FormEvent, rotId: string | null) => {
        e.preventDefault();
        if (!nuevoPotForm.nombre.trim() || !fincaId) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.from('potreros').insert({
                id_finca: fincaId,
                nombre: nuevoPotForm.nombre.trim(),
                area_hectareas: parseFloat(nuevoPotForm.area) || 0,
                id_rotacion: rotId
            });
            if (error) throw error;
            setNuevoPotForm({ nombre: '', area: '' });
            setShowNuevoPotrero(null);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAssignExistingPotreros = async (e: React.FormEvent, rotId: string | null) => {
        e.preventDefault();
        if (selectedExistingIds.length === 0) return;
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('potreros')
                .update({ id_rotacion: rotId })
                .in('id', selectedExistingIds);
            if (error) throw error;
            setSelectedExistingIds([]);
            setShowNuevoPotrero(null);
            fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const openModalForRotation = (rotId: string) => {
        setShowNuevoPotrero(rotId);
        setSelectedExistingIds([]);
        setExistingSearchTerm('');
        setNuevoPotForm({ nombre: '', area: '' });

        if (rotId === 'none') {
            setPotreroModalTab('nuevo');
        } else {
            // Check if there are available existing potreros
            const availableCount = potreros.filter(p => p.id_rotacion !== rotId).length;
            setPotreroModalTab(availableCount > 0 ? 'existente' : 'nuevo');
        }
    };

    const toggleSelectExisting = (id: string) => {
        setSelectedExistingIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const deletePotrero = async (id: string) => {
        if (!isAdmin || !confirm('¿Eliminar potrero?')) return;
        try {
            await supabase.from('potreros').delete().eq('id', id);
            fetchData();
        } catch (err: any) { console.error(err); }
    };

    const deleteRotacion = async (id: string) => {
        if (!isAdmin || !confirm('¿Eliminar rotación? Los potreros quedarán sin rotación.')) return;
        try {
            await supabase.from('rotaciones').delete().eq('id', id);
            fetchData();
        } catch (err: any) { console.error(err); }
    };

    // Agrupar
    const groupedData = rotaciones.map(r => {
        const pots = potreros.filter(p => p.id_rotacion === r.id);
        const areaTotal = pots.reduce((sum, p) => sum + (p.area_hectareas || 0), 0);
        return { ...r, pots, areaTotal };
    });

    const sinRotacion = potreros.filter(p => !p.id_rotacion);
    const areaTotalSin = sinRotacion.reduce((sum, p) => sum + (p.area_hectareas || 0), 0);
    const areaFinca = potreros.reduce((sum, p) => sum + (p.area_hectareas || 0), 0);

    const filteredGroupedData = groupedData.filter(rot => {
        const matchesRot = rot.nombre.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPot = rot.pots.some(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesRot || matchesPot;
    }).map(rot => {
        // Si la rotación coincide con el nombre, mostramos todos sus potreros
        // Si no, filtramos los potreros que coincidan con la búsqueda
        if (rot.nombre.toLowerCase().includes(searchTerm.toLowerCase())) return rot;
        return {
            ...rot,
            pots: rot.pots.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
        };
    });

    const filteredSinRotacion = sinRotacion.filter(p => 
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Potreros disponibles para asignar a la rotación seleccionada
    const currentTargetRot = showNuevoPotrero && showNuevoPotrero !== 'none'
        ? rotaciones.find(r => r.id === showNuevoPotrero)
        : null;

    const availableExistingPotreros = showNuevoPotrero
        ? potreros.filter(p => {
            if (showNuevoPotrero === 'none') return p.id_rotacion !== null;
            return p.id_rotacion !== showNuevoPotrero;
        })
        : [];

    const filteredAvailablePotreros = availableExistingPotreros.filter(p =>
        p.nombre.toLowerCase().includes(existingSearchTerm.toLowerCase())
    );

    const rotacionMap = new Map(rotaciones.map(r => [r.id, r.nombre]));

    return (
        <div className="page-container" style={{ maxWidth: '1000px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <MapPin size={32} /> Rotaciones
                    </h1>
                    <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <Layers size={16} /> <strong style={{ color: 'white' }}>{rotaciones.length}</strong> Rotaciones
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <MapPin size={16} /> <strong style={{ color: 'white' }}>{potreros.length}</strong> Potreros
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <strong style={{ color: 'var(--primary-light)' }}>{areaFinca.toFixed(2)}</strong> Ha Totales
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button 
                        onClick={() => setShowCalculadora(prev => !prev)}
                        type="button"
                        style={{ 
                            width: 'auto', 
                            padding: '10px 20px', 
                            borderRadius: '100px', 
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: showCalculadora ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${showCalculadora ? 'var(--primary-light)' : 'rgba(255, 255, 255, 0.12)'}`,
                            color: showCalculadora ? 'var(--primary-light)' : 'white',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Calculator size={18} /> Calculadora Voisin {showCalculadora ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {isAdmin && (
                        <button 
                            onClick={() => setShowNuevaRotacion(true)} 
                            style={{ 
                                width: 'auto', 
                                padding: '10px 24px', 
                                borderRadius: '100px', 
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                boxShadow: '0 4px 15px rgba(46, 125, 50, 0.3)'
                            }}
                        >
                            <Plus size={20} /> Nueva Rotación
                        </button>
                    )}
                </div>
            </div>

            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>{msjError}</div>}

            {showNuevaRotacion && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
                        <h2>Nueva Rotación</h2>
                        <form onSubmit={handleAddRotacion} style={{ marginTop: '20px' }}>
                            <label>Nombre de la Rotación</label>
                            <input autoFocus type="text" value={nuevaRotNombre} onChange={e => setNuevaRotNombre(e.target.value)} placeholder="Ej: Rotación Norte" required />
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setShowNuevaRotacion(false)}>Cancelar</button>
                                <button type="submit">Crear</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CALCULADORA DE ROTACIÓN VOISIN */}
            {showCalculadora && (() => {
                const calcularResultado = () => {
                    if (calcModo === 'potreros') {
                        const ocup = calcOcupacion > 0 ? calcOcupacion : 1;
                        const nExacto = (calcDescanso / ocup) + 1;
                        const nEntero = Math.ceil(nExacto);
                        const alertaRebrote = calcOcupacion > 3;
                        return {
                            etiqueta: 'Potreros Necesarios (N)',
                            valorPrincipal: `${nEntero} Potreros`,
                            formulaDetalle: `(${calcDescanso} d descanso / ${calcOcupacion} d ocupación) + 1 = ${nExacto.toFixed(1)}`,
                            alerta: alertaRebrote,
                            mensajeZootecnico: alertaRebrote
                                ? `Con ${calcOcupacion} días de ocupación hay riesgo de sobrepastoreo del rebrote (aparece a partir del día 4). Si reduces a 2 días de ocupación, necesitarías ${Math.ceil(calcDescanso / 2 + 1)} potreros.`
                                : `Excelente diseño: con ${calcOcupacion} días de ocupación las reses no tocan el rebrote y garantizas ${calcDescanso} días de descanso para las pasturas.`
                        };
                    } else if (calcModo === 'ocupacion') {
                        const pot = calcPotreros > 1 ? calcPotreros : 2;
                        const oExacto = calcDescanso / (pot - 1);
                        const alertaRebrote = oExacto > 3;
                        return {
                            etiqueta: 'Días de Ocupación Máximos (O)',
                            valorPrincipal: `${oExacto.toFixed(1)} Días`,
                            formulaDetalle: `${calcDescanso} d descanso / (${pot} - 1 potreros) = ${oExacto.toFixed(1)} días`,
                            alerta: alertaRebrote,
                            mensajeZootecnico: alertaRebrote
                                ? `⚠️ Alerta de rebrote: ${oExacto.toFixed(1)} días es demasiado tiempo continuo por potrero. Las reses comerán el rebrote tierno. Para no superar 2 días de ocupación necesitarías subdividir hasta tener ${Math.ceil(calcDescanso / 2 + 1)} potreros.`
                                : `✅ Ocupación favorable: El ganado desocupará cada potrero a tiempo para no lastimar los meristemos de rebrote de la pastura.`
                        };
                    } else {
                        const pot = calcPotreros > 1 ? calcPotreros : 2;
                        const dExacto = (pot - 1) * calcOcupacion;
                        const descansoCorto = dExacto < 21;
                        const descansoLargo = dExacto > 40;
                        return {
                            etiqueta: 'Días de Descanso Resultantes (D)',
                            valorPrincipal: `${Math.round(dExacto)} Días`,
                            formulaDetalle: `(${pot} - 1 potreros) × ${calcOcupacion} d ocupación = ${Math.round(dExacto)} días`,
                            alerta: descansoCorto,
                            mensajeZootecnico: descansoCorto
                                ? `⚠️ Descanso insuficiente: ${Math.round(dExacto)} días no da tiempo a que las Brachiarias acumulen biomasa foliar y reservas energéticas en la raíz.`
                                : descansoLargo
                                ? `🌾 Descanso prolongado: Típico de verano seco; en invierno lluvioso cuida que la pastura no se espigue ni pierda digestibilidad.`
                                : `🌱 Descanso óptimo: Rango equilibrado (21–40 días) para sostener buena tasa de rebrote y calidad proteica.`
                        };
                    }
                };

                const res = calcularResultado();

                return (
                    <div style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '24px',
                        marginBottom: '32px'
                    }}>
                        {/* Header de la Calculadora */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        backgroundColor: 'rgba(76, 175, 80, 0.15)',
                                        color: 'var(--primary-light)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Calculator size={18} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white', fontWeight: 600 }}>
                                        Calculadora de Rotación (Fórmula de Voisin)
                                    </h3>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        backgroundColor: 'rgba(255,255,255,0.06)',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        color: 'var(--text-muted)',
                                        fontFamily: 'monospace'
                                    }}>
                                        N = (Descanso / Ocupación) + 1
                                    </span>
                                </div>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Ajusta cualquiera de las variables para equilibrar los días de descanso y evitar el sobrepastoreo del rebrote.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCalculadora(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    width: 'auto'
                                }}
                                title="Cerrar calculadora"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Selector de Incógnita / Objetivo */}
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginBottom: '20px',
                            flexWrap: 'wrap',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                            paddingBottom: '14px'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '8px' }}>
                                ¿Qué deseas calcular?:
                            </span>
                            <button
                                type="button"
                                onClick={() => setCalcModo('potreros')}
                                style={{
                                    width: 'auto',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    backgroundColor: calcModo === 'potreros' ? 'rgba(76, 175, 80, 0.2)' : 'transparent',
                                    borderColor: calcModo === 'potreros' ? 'var(--primary-light)' : 'rgba(255,255,255,0.1)',
                                    color: calcModo === 'potreros' ? 'var(--primary-light)' : 'var(--text-muted)'
                                }}
                            >
                                📐 Potreros Necesarios (N)
                            </button>
                            <button
                                type="button"
                                onClick={() => setCalcModo('ocupacion')}
                                style={{
                                    width: 'auto',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    backgroundColor: calcModo === 'ocupacion' ? 'rgba(76, 175, 80, 0.2)' : 'transparent',
                                    borderColor: calcModo === 'ocupacion' ? 'var(--primary-light)' : 'rgba(255,255,255,0.1)',
                                    color: calcModo === 'ocupacion' ? 'var(--primary-light)' : 'var(--text-muted)'
                                }}
                            >
                                ⏱️ Días de Ocupación (O)
                            </button>
                            <button
                                type="button"
                                onClick={() => setCalcModo('descanso')}
                                style={{
                                    width: 'auto',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    backgroundColor: calcModo === 'descanso' ? 'rgba(76, 175, 80, 0.2)' : 'transparent',
                                    borderColor: calcModo === 'descanso' ? 'var(--primary-light)' : 'rgba(255,255,255,0.1)',
                                    color: calcModo === 'descanso' ? 'var(--primary-light)' : 'var(--text-muted)'
                                }}
                            >
                                🌿 Días de Descanso (D)
                            </button>
                        </div>

                        {/* Grid de Inputs y Resultado */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
                            {/* Columna Izquierda: Inputs según el modo */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
                                {calcModo === 'potreros' && (
                                    <>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                    Días de Descanso deseados (D)
                                                </label>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--primary-light)' }}>
                                                    Sugerido: 24–35 días
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="120"
                                                    value={calcDescanso || ''}
                                                    onChange={e => setCalcDescanso(Math.max(1, parseInt(e.target.value) || 0))}
                                                    style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}
                                                />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', minWidth: '40px' }}>días</span>
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                    Días de Ocupación por potrero (O)
                                                </label>
                                                <span style={{ fontSize: '0.75rem', color: calcOcupacion > 3 ? '#ff9800' : 'var(--success)' }}>
                                                    {calcOcupacion <= 3 ? 'Ideal ≤ 3 días' : '⚠️ > 3 días daña rebrote'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0.5"
                                                    max="30"
                                                    value={calcOcupacion || ''}
                                                    onChange={e => setCalcOcupacion(Math.max(0.5, parseFloat(e.target.value) || 0))}
                                                    style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}
                                                />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', minWidth: '40px' }}>días</span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {calcModo === 'ocupacion' && (
                                    <>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                    Número de Potreros disponibles (N)
                                                </label>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    min="2"
                                                    max="100"
                                                    value={calcPotreros || ''}
                                                    onChange={e => setCalcPotreros(Math.max(2, parseInt(e.target.value) || 0))}
                                                    style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}
                                                />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', minWidth: '40px' }}>potreros</span>
                                            </div>
                                            {groupedData.length > 0 && (
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cargar de:</span>
                                                    {groupedData.map(r => (
                                                        <button
                                                            key={r.id}
                                                            type="button"
                                                            onClick={() => setCalcPotreros(r.pots.length || 2)}
                                                            style={{
                                                                padding: '1px 8px',
                                                                fontSize: '0.75rem',
                                                                background: 'rgba(255,255,255,0.05)',
                                                                border: '1px solid rgba(255,255,255,0.1)',
                                                                borderRadius: '4px',
                                                                color: 'var(--text-muted)',
                                                                cursor: 'pointer',
                                                                width: 'auto'
                                                            }}
                                                        >
                                                            {r.nombre} ({r.pots.length})
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                    Días de Descanso deseados (D)
                                                </label>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--primary-light)' }}>
                                                    Recuperación del forraje
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="120"
                                                    value={calcDescanso || ''}
                                                    onChange={e => setCalcDescanso(Math.max(1, parseInt(e.target.value) || 0))}
                                                    style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}
                                                />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', minWidth: '40px' }}>días</span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {calcModo === 'descanso' && (
                                    <>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                    Número de Potreros disponibles (N)
                                                </label>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    min="2"
                                                    max="100"
                                                    value={calcPotreros || ''}
                                                    onChange={e => setCalcPotreros(Math.max(2, parseInt(e.target.value) || 0))}
                                                    style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}
                                                />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', minWidth: '40px' }}>potreros</span>
                                            </div>
                                            {groupedData.length > 0 && (
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cargar de:</span>
                                                    {groupedData.map(r => (
                                                        <button
                                                            key={r.id}
                                                            type="button"
                                                            onClick={() => setCalcPotreros(r.pots.length || 2)}
                                                            style={{
                                                                padding: '1px 8px',
                                                                fontSize: '0.75rem',
                                                                background: 'rgba(255,255,255,0.05)',
                                                                border: '1px solid rgba(255,255,255,0.1)',
                                                                borderRadius: '4px',
                                                                color: 'var(--text-muted)',
                                                                cursor: 'pointer',
                                                                width: 'auto'
                                                            }}
                                                        >
                                                            {r.nombre} ({r.pots.length})
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                                    Días de Ocupación actuales (O)
                                                </label>
                                                <span style={{ fontSize: '0.75rem', color: calcOcupacion > 3 ? '#ff9800' : 'var(--success)' }}>
                                                    {calcOcupacion <= 3 ? 'Ideal ≤ 3 días' : '⚠️ > 3 días daña rebrote'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0.5"
                                                    max="30"
                                                    value={calcOcupacion || ''}
                                                    onChange={e => setCalcOcupacion(Math.max(0.5, parseFloat(e.target.value) || 0))}
                                                    style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold' }}
                                                />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', minWidth: '40px' }}>días</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Columna Derecha: Tarjeta de Resultado Sobrio */}
                            <div style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                border: `1px solid ${res.alerta ? 'rgba(255, 152, 0, 0.3)' : 'rgba(76, 175, 80, 0.3)'}`,
                                borderRadius: '12px',
                                padding: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '12px'
                            }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                                        {res.etiqueta}
                                    </span>
                                    <h2 style={{ margin: 0, fontSize: '2.4rem', color: res.alerta ? '#ff9800' : 'var(--success)', fontWeight: 'bold' }}>
                                        {res.valorPrincipal}
                                    </h2>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', display: 'block', marginTop: '6px' }}>
                                        {res.formulaDetalle}
                                    </span>
                                </div>

                                <div style={{
                                    backgroundColor: res.alerta ? 'rgba(255, 152, 0, 0.08)' : 'rgba(76, 175, 80, 0.08)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'flex-start'
                                }}>
                                    {res.alerta ? (
                                        <AlertTriangle size={18} color="#ff9800" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    ) : (
                                        <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    )}
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.45' }}>
                                        {res.mensajeZootecnico}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div style={{ marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={20} />
                    <input 
                        type="text" 
                        placeholder="Buscar rotación o potrero..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ paddingLeft: '44px', margin: 0, height: '48px', fontSize: '1rem' }}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {filteredGroupedData.map(rot => (
                    <div key={rot.id} className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {/* Header de la Rotación */}
                        <div style={{ 
                            padding: '16px 24px', 
                            backgroundColor: 'rgba(255,255,255,0.02)', 
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                <Layers size={20} color="var(--primary-light)" />
                                {editingRot === rot.id ? (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input 
                                            autoFocus
                                            style={{ margin: 0, padding: '4px 8px', fontSize: '1rem' }} 
                                            value={editRotNombre} 
                                            onChange={e => setEditRotNombre(e.target.value)}
                                        />
                                        <button onClick={() => handleUpdateRotacion(rot.id)} style={{ width: 'auto', padding: '4px', background: 'none' }}><Check size={18} color="var(--success)" /></button>
                                        <button onClick={() => setEditingRot(null)} style={{ width: 'auto', padding: '4px', background: 'none' }}><X size={18} color="var(--text-muted)" /></button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: 0, color: 'white', fontWeight: 600 }}>{rot.nombre}</h3>
                                        {isAdmin && <Edit2 size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setEditingRot(rot.id); setEditRotNombre(rot.nombre); }} />}
                                    </div>
                                )}
                                <span style={{ fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: '100px', color: 'var(--text-muted)' }}>
                                    {rot.pots.length} potreros • {rot.areaTotal.toFixed(2)} Ha
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCalcModo('ocupacion');
                                        setCalcPotreros(rot.pots.length || 2);
                                        setShowCalculadora(true);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    title="Calcular rotación Voisin para este grupo de potreros"
                                    style={{
                                        width: 'auto',
                                        padding: '2px 10px',
                                        fontSize: '0.75rem',
                                        borderRadius: '100px',
                                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                        border: '1px solid rgba(76, 175, 80, 0.25)',
                                        color: 'var(--primary-light)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Calculator size={12} /> Evaluar Voisin
                                </button>
                            </div>
                            {isAdmin && (
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button 
                                        onClick={() => openModalForRotation(rot.id)} 
                                        style={{ 
                                            width: 'auto', 
                                            padding: '6px 16px', 
                                            fontSize: '0.8rem', 
                                            borderRadius: '100px',
                                            backgroundColor: 'var(--primary)',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            border: 'none',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                        }}
                                    >
                                        <Plus size={14} /> Potrero
                                    </button>
                                    {role === 'administrador' && (
                                        <button onClick={() => deleteRotacion(rot.id)} style={{ width: 'auto', padding: '6px', background: 'none', color: 'rgba(244, 67, 54, 0.4)' }} title="Eliminar Rotación">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Tabla de Potreros dentro de la Rotación */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <th style={{ padding: '12px 24px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Potrero</th>
                                        <th style={{ padding: '12px 24px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', width: '120px' }}>Área (Ha)</th>
                                        {isAdmin && <th style={{ padding: '12px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', width: '100px' }}></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rot.pots.length === 0 ? (
                                        <tr><td colSpan={isAdmin ? 3 : 2} style={{ padding: '20px 24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay potreros asignados.</td></tr>
                                    ) : (
                                        rot.pots.map(p => (
                                             <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '12px 24px' }}>
                                                    {editingPot === p.id ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <input style={{ margin: 0, padding: '4px 8px' }} value={editPotForm.nombre} onChange={e => setEditPotForm({...editPotForm, nombre: e.target.value})} placeholder="Nombre" />
                                                            <select 
                                                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}
                                                                value={editPotForm.id_rotacion}
                                                                onChange={e => setEditPotForm({...editPotForm, id_rotacion: e.target.value})}
                                                            >
                                                                <option value="">Sin Rotación</option>
                                                                {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontWeight: 500, color: 'white' }}>{p.nombre}</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 24px', textAlign: 'right', width: '120px' }}>
                                                    {editingPot === p.id ? (
                                                        <input style={{ margin: 0, padding: '4px 8px', textAlign: 'right', width: '100%' }} type="number" step="0.01" value={editPotForm.area} onChange={e => setEditPotForm({...editPotForm, area: e.target.value})} />
                                                    ) : (
                                                        <span style={{ color: 'var(--primary-light)', fontFamily: 'monospace', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.area_hectareas?.toFixed(2)}</span>
                                                    )}
                                                </td>
                                                {isAdmin && (
                                                    <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                            {editingPot === p.id ? (
                                                                <>
                                                                    <button onClick={() => handleUpdatePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none' }}><Check size={18} color="var(--success)" /></button>
                                                                    <button onClick={() => setEditingPot(null)} style={{ width: 'auto', padding: '4px', background: 'none' }}><X size={18} color="var(--text-muted)" /></button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button onClick={() => { setEditingPot(p.id); setEditPotForm({ nombre: p.nombre, area: p.area_hectareas.toString(), id_rotacion: p.id_rotacion || '' }); }} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.2)' }}><Edit2 size={16} /></button>
                                                                    {role === 'administrador' && <button onClick={() => deletePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.1)' }}><Trash2 size={16} /></button>}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

                {/* Potreros Sin Rotación */}
                {filteredSinRotacion.length > 0 && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        <div style={{ padding: '16px 24px', backgroundColor: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Info size={20} color="var(--text-muted)" />
                                <h3 style={{ margin: 0, color: 'var(--text-muted)' }}>Sin Rotación Asignada</h3>
                                <span style={{ fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: '100px', color: 'var(--text-muted)' }}>
                                    {filteredSinRotacion.length} potreros • {areaTotalSin.toFixed(2)} Ha
                                </span>
                            </div>
                            {isAdmin && (
                                <button 
                                    onClick={() => openModalForRotation('none')} 
                                    style={{ 
                                        width: 'auto', 
                                        padding: '6px 16px', 
                                        fontSize: '0.8rem', 
                                        borderRadius: '100px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        textTransform: 'none',
                                        fontWeight: 600
                                    }}
                                >
                                    <Plus size={14} /> Potrero
                                </button>
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {filteredSinRotacion.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '12px 24px' }}>
                                                {editingPot === p.id ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <input style={{ margin: 0, padding: '4px 8px' }} value={editPotForm.nombre} onChange={e => setEditPotForm({...editPotForm, nombre: e.target.value})} placeholder="Nombre" />
                                                        <select 
                                                            style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}
                                                            value={editPotForm.id_rotacion}
                                                            onChange={e => setEditPotForm({...editPotForm, id_rotacion: e.target.value})}
                                                        >
                                                            <option value="">Sin Rotación</option>
                                                            {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>{p.nombre}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 24px', textAlign: 'right', width: '120px' }}>
                                                {editingPot === p.id ? (
                                                    <input style={{ margin: 0, padding: '4px 8px', textAlign: 'right', width: '100%' }} type="number" step="0.01" value={editPotForm.area} onChange={e => setEditPotForm({...editPotForm, area: e.target.value})} />
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.area_hectareas?.toFixed(2)}</span>
                                                )}
                                            </td>
                                            {isAdmin && (
                                                <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        {editingPot === p.id ? (
                                                            <>
                                                                <button onClick={() => handleUpdatePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none' }}><Check size={18} color="var(--success)" /></button>
                                                                <button onClick={() => setEditingPot(null)} style={{ width: 'auto', padding: '4px', background: 'none' }}><X size={18} color="var(--text-muted)" /></button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => { setEditingPot(p.id); setEditPotForm({ nombre: p.nombre, area: p.area_hectareas.toString(), id_rotacion: '' }); }} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.2)' }}><Edit2 size={16} /></button>
                                                                {role === 'administrador' && <button onClick={() => deletePotrero(p.id)} style={{ width: 'auto', padding: '4px', background: 'none', color: 'rgba(255,255,255,0.1)' }}><Trash2 size={16} /></button>}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Añadir / Asignar Potrero */}
            {showNuevoPotrero && (
                <div style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.85)', 
                    backdropFilter: 'blur(6px)', 
                    zIndex: 1000, 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    padding: '20px' 
                }}>
                    <div className="card" style={{ maxWidth: '480px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.3rem' }}>
                                    {currentTargetRot ? `Añadir a ${currentTargetRot.nombre}` : 'Añadir Potrero'}
                                </h2>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {showNuevoPotrero === 'none' 
                                        ? 'Crea un potrero sin rotación asignada' 
                                        : 'Selecciona potreros existentes o crea uno nuevo'}
                                </p>
                            </div>
                            <button 
                                onClick={() => setShowNuevoPotrero(null)} 
                                style={{ width: 'auto', padding: '4px', background: 'none', color: 'var(--text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Segmented Tabs */}
                        {showNuevoPotrero !== 'none' && (
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1fr 1fr', 
                                backgroundColor: 'rgba(255,255,255,0.05)', 
                                padding: '4px', 
                                borderRadius: '10px', 
                                marginBottom: '20px' 
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setPotreroModalTab('existente')}
                                    style={{
                                        padding: '8px 12px',
                                        fontSize: '0.85rem',
                                        borderRadius: '8px',
                                        backgroundColor: potreroModalTab === 'existente' ? 'var(--primary)' : 'transparent',
                                        color: potreroModalTab === 'existente' ? 'white' : 'var(--text-muted)',
                                        border: 'none',
                                        boxShadow: potreroModalTab === 'existente' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <CheckSquare size={16} /> Seleccionar Existente
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPotreroModalTab('nuevo')}
                                    style={{
                                        padding: '8px 12px',
                                        fontSize: '0.85rem',
                                        borderRadius: '8px',
                                        backgroundColor: potreroModalTab === 'nuevo' ? 'var(--primary)' : 'transparent',
                                        color: potreroModalTab === 'nuevo' ? 'white' : 'var(--text-muted)',
                                        border: 'none',
                                        boxShadow: potreroModalTab === 'nuevo' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Plus size={16} /> Crear Nuevo
                                </button>
                            </div>
                        )}

                        {/* TAB: SELECCIONAR EXISTENTE */}
                        {potreroModalTab === 'existente' && showNuevoPotrero !== 'none' ? (
                            <form 
                                onSubmit={(e) => handleAssignExistingPotreros(e, showNuevoPotrero)} 
                                style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                            >
                                {availableExistingPotreros.length > 5 && (
                                    <div style={{ position: 'relative', marginBottom: '12px' }}>
                                        <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
                                        <input 
                                            type="text"
                                            placeholder="Buscar potrero disponible..."
                                            value={existingSearchTerm}
                                            onChange={(e) => setExistingSearchTerm(e.target.value)}
                                            style={{ paddingLeft: '36px', marginBottom: 0, height: '38px', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                )}

                                <div style={{ 
                                    overflowY: 'auto', 
                                    maxHeight: '320px', 
                                    border: '1px solid rgba(255,255,255,0.08)', 
                                    borderRadius: '8px', 
                                    padding: '6px',
                                    marginBottom: '16px',
                                    backgroundColor: 'rgba(0,0,0,0.2)'
                                }}>
                                    {availableExistingPotreros.length === 0 ? (
                                        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            No hay otros potreros registrados en esta finca.
                                            <div style={{ marginTop: '12px' }}>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setPotreroModalTab('nuevo')}
                                                    style={{ width: 'auto', padding: '6px 16px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                >
                                                    <Plus size={14} /> Crear Nuevo Potrero
                                                </button>
                                            </div>
                                        </div>
                                    ) : filteredAvailablePotreros.length === 0 ? (
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No se encontraron potreros que coincidan con la búsqueda.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {filteredAvailablePotreros.map(p => {
                                                const isSelected = selectedExistingIds.includes(p.id);
                                                const isUnassigned = !p.id_rotacion;
                                                const currentRotName = p.id_rotacion ? rotacionMap.get(p.id_rotacion) : null;

                                                return (
                                                    <div 
                                                        key={p.id}
                                                        onClick={() => toggleSelectExisting(p.id)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '10px 12px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            backgroundColor: isSelected ? 'rgba(46, 125, 50, 0.2)' : 'rgba(255,255,255,0.02)',
                                                            border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            {isSelected ? (
                                                                <CheckSquare size={18} color="var(--primary-light)" />
                                                            ) : (
                                                                <Square size={18} color="var(--text-muted)" />
                                                            )}
                                                            <div>
                                                                <div style={{ fontWeight: 500, color: 'white', fontSize: '0.9rem' }}>
                                                                    {p.nombre}
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: isUnassigned ? 'var(--primary-light)' : 'var(--text-muted)' }}>
                                                                    {isUnassigned ? '✦ Sin Rotación' : `Rotación: ${currentRotName || 'Otra'}`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <span style={{ 
                                                                fontSize: '0.85rem', 
                                                                fontWeight: 600, 
                                                                color: 'var(--primary-light)',
                                                                fontFamily: 'monospace' 
                                                            }}>
                                                                {p.area_hectareas ? p.area_hectareas.toFixed(2) : '0.00'} Ha
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', gap: '12px' }}>
                                    <button 
                                        type="button" 
                                        className="btn-secondary" 
                                        onClick={() => setShowNuevoPotrero(null)}
                                        style={{ width: 'auto', padding: '10px 18px' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={selectedExistingIds.length === 0 || isSaving}
                                        style={{ 
                                            width: 'auto', 
                                            padding: '10px 20px',
                                            opacity: selectedExistingIds.length === 0 || isSaving ? 0.5 : 1,
                                            cursor: selectedExistingIds.length === 0 || isSaving ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {isSaving 
                                            ? 'Guardando...' 
                                            : `Asignar ${selectedExistingIds.length > 0 ? `(${selectedExistingIds.length})` : ''}`}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            /* TAB: CREAR NUEVO */
                            <form 
                                onSubmit={(e) => handleAddPotrero(e, showNuevoPotrero === 'none' ? null : showNuevoPotrero)} 
                                style={{ marginTop: '8px' }}
                            >
                                <label>Nombre del Potrero</label>
                                <input 
                                    autoFocus 
                                    type="text" 
                                    value={nuevoPotForm.nombre} 
                                    onChange={e => setNuevoPotForm({...nuevoPotForm, nombre: e.target.value})} 
                                    placeholder="Ej: Lote 1, Potrero Norte..." 
                                    required 
                                />
                                <label>Área (Hectáreas)</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={nuevoPotForm.area} 
                                    onChange={e => setNuevoPotForm({...nuevoPotForm, area: e.target.value})} 
                                    placeholder="0.00" 
                                    required 
                                />
                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button type="button" className="btn-secondary" onClick={() => setShowNuevoPotrero(null)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={isSaving}>
                                        {isSaving ? 'Guardando...' : 'Crear Potrero'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

