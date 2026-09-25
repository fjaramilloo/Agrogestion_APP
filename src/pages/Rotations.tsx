import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, Plus, Trash2, Edit2, Check, X, Layers, Info, Search, CheckSquare, Square, Calculator, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';

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
    const [calcTarget, setCalcTarget] = useState<'potreros' | 'ocupacion' | 'descanso'>('potreros');
    const [diasDescanso, setDiasDescanso] = useState<number>(28);
    const [diasOcupacion, setDiasOcupacion] = useState<number>(2);
    const [nroPotreros, setNroPotreros] = useState<number>(15);
    const [gruposPastoreo, setGruposPastoreo] = useState<number>(1);

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
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button 
                        type="button"
                        onClick={() => setShowCalculadora(!showCalculadora)} 
                        style={{ 
                            width: 'auto', 
                            padding: '10px 18px', 
                            borderRadius: '100px', 
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: showCalculadora ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: showCalculadora ? 'var(--primary-light)' : 'white',
                            border: '1px solid ' + (showCalculadora ? 'var(--primary-light)' : 'rgba(255, 255, 255, 0.12)'),
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Calculator size={18} color="var(--primary-light)" />
                        <span>Calculadora Voisin</span>
                        {showCalculadora ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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

            {/* CALCULADORA DE ROTACIÓN VOISIN */}
            {(() => {
                if (!showCalculadora) return null;

                const potrerosCalculadosExacto = diasOcupacion > 0 ? (diasDescanso / diasOcupacion) + gruposPastoreo : 0;
                const potrerosCalculadosCeil = Math.ceil(potrerosCalculadosExacto);

                const ocupacionCalculada = nroPotreros > gruposPastoreo 
                    ? diasDescanso / (nroPotreros - gruposPastoreo)
                    : 0;

                const descansoCalculado = Math.max(0, (nroPotreros - gruposPastoreo) * diasOcupacion);

                const effectiveD = calcTarget === 'descanso' ? descansoCalculado : diasDescanso;
                const effectiveO = calcTarget === 'ocupacion' ? ocupacionCalculada : diasOcupacion;

                // Evaluación Zootécnica de Ocupación
                let ocupacionAlert = {
                    type: 'success',
                    title: '✓ Ocupación Óptima (1.5 – 3 días)',
                    desc: 'Permite un pastoreo eficiente sin que el ganado consuma el rebrote de la pastura.'
                };
                if (effectiveO > 3) {
                    ocupacionAlert = {
                        type: 'warning',
                        title: '⚠️ Riesgo de Daño al Rebrote (> 3 días)',
                        desc: `A partir del día 3 a 4, las Brachiarias y pastos tropicales emiten su primer rebrote tierno. Ocupaciones de ${effectiveO.toFixed(1)} días hacen que el animal se coma ese rebrote tierno, agotando las reservas de la raíz y degradando la pradera.`
                    };
                } else if (effectiveO <= 1.5 && effectiveO > 0) {
                    ocupacionAlert = {
                        type: 'success',
                        title: '🌿 Pastoreo Intensivo / Racional (≤ 1.5 días)',
                        desc: 'Cosecha uniforme y máxima protección del rebrote. Excelente para maximizar la ganancia de peso (GDP) y la persistencia del sward.'
                    };
                } else if (effectiveO <= 0) {
                    ocupacionAlert = {
                        type: 'danger',
                        title: '❌ Parámetros Insuficientes',
                        desc: `Se requieren más de ${gruposPastoreo} potreros para rotar ${gruposPastoreo} lote(s).`
                    };
                }

                // Evaluación Zootécnica de Descanso
                let descansoAlert = {
                    type: 'success',
                    title: '✓ Descanso Óptimo en Época Lluviosa (21–32 días)',
                    desc: 'Pico de proteína foliar antes de que comience el proceso de lignificación de la fibra.'
                };
                if (effectiveD < 21) {
                    descansoAlert = {
                        type: 'danger',
                        title: '⚠️ Descanso Crítico (< 21 días)',
                        desc: 'Muy poco reposo para pasturas tropicales. La planta no alcanza a restituir carbohidratos en la raíz ni a desarrollar volumen foliar, llevando a sobrepastoreo.'
                    };
                } else if (effectiveD > 42) {
                    descansoAlert = {
                        type: 'warning',
                        title: '🌾 Riesgo de Lignificación (> 42 días)',
                        desc: 'A menos que estés en pleno verano/época seca prolongada, con más de 42 días la pastura florece, se endurece (sube FDN) y pierde proteína cruda (<6%), reduciendo la digestibilidad.'
                    };
                } else if (effectiveD > 32) {
                    descansoAlert = {
                        type: 'info',
                        title: '☀️ Rango Recomendado para Época Seca (33–42 días)',
                        desc: 'Adecuado para períodos con menor precipitación, donde la tasa de crecimiento del forraje se desacelera.'
                    };
                }

                return (
                    <div className="card" style={{
                        marginBottom: '32px',
                        padding: '24px',
                        background: 'linear-gradient(145deg, rgba(20, 35, 25, 0.95), rgba(13, 23, 17, 0.98))',
                        border: '1px solid rgba(76, 175, 80, 0.3)',
                        borderRadius: '16px',
                        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)'
                    }}>
                        {/* Header Calculadora */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ 
                                        padding: '8px', 
                                        borderRadius: '10px', 
                                        backgroundColor: 'rgba(76, 175, 80, 0.15)', 
                                        color: 'var(--primary-light)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Calculator size={22} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>
                                            Calculadora de Rotación (Leyes de Voisin)
                                        </h3>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            Fórmula universal: <strong>N = (D ÷ O) + G</strong>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDiasDescanso(28);
                                        setDiasOcupacion(2);
                                        setNroPotreros(potreros.length > 0 ? potreros.length : 15);
                                        setGruposPastoreo(1);
                                        setCalcTarget('potreros');
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        color: 'var(--text-muted)',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        width: 'auto',
                                        cursor: 'pointer'
                                    }}
                                    title="Restablecer valores estándar"
                                >
                                    <RotateCcw size={14} /> Valores estándar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCalculadora(false)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        padding: '6px',
                                        width: 'auto',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Selector de Incógnita (Pills) */}
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                ¿QUÉ DESEAS CALCULAR?
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setCalcTarget('potreros')}
                                    style={{
                                        flex: '1 1 200px',
                                        padding: '10px 16px',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        border: calcTarget === 'potreros' ? '1px solid var(--primary-light)' : '1px solid rgba(255, 255, 255, 0.08)',
                                        backgroundColor: calcTarget === 'potreros' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                                        color: calcTarget === 'potreros' ? 'white' : 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    1. Nro de Potreros Necesarios (N)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCalcTarget('ocupacion')}
                                    style={{
                                        flex: '1 1 200px',
                                        padding: '10px 16px',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        border: calcTarget === 'ocupacion' ? '1px solid var(--primary-light)' : '1px solid rgba(255, 255, 255, 0.08)',
                                        backgroundColor: calcTarget === 'ocupacion' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                                        color: calcTarget === 'ocupacion' ? 'white' : 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    2. Días de Ocupación Máxima (O)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCalcTarget('descanso')}
                                    style={{
                                        flex: '1 1 200px',
                                        padding: '10px 16px',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        border: calcTarget === 'descanso' ? '1px solid var(--primary-light)' : '1px solid rgba(255, 255, 255, 0.08)',
                                        backgroundColor: calcTarget === 'descanso' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                                        color: calcTarget === 'descanso' ? 'white' : 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    3. Días de Descanso Resultantes (D)
                                </button>
                            </div>
                        </div>

                        {/* Main Grid: Inputs + Output + Semáforo */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'stretch' }}>
                            
                            {/* Columna Izquierda: Parámetros e Inputs */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                
                                {/* Días de Descanso (D) */}
                                {calcTarget !== 'descanso' ? (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label style={{ margin: 0, fontSize: '0.9rem', color: 'white', fontWeight: 600 }}>
                                                Días de Descanso del Pasto (D)
                                            </label>
                                            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-light)' }}>
                                                {diasDescanso} días
                                            </span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="10" 
                                            max="60" 
                                            step="1"
                                            value={diasDescanso} 
                                            onChange={e => setDiasDescanso(parseInt(e.target.value) || 1)}
                                            style={{ width: '100%', accentColor: 'var(--primary)', marginBottom: '8px' }}
                                        />
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setDiasDescanso(25)}
                                                style={{
                                                    flex: 1,
                                                    padding: '4px 8px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: diasDescanso === 25 ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🌧️ Lluvias (25d)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDiasDescanso(30)}
                                                style={{
                                                    flex: 1,
                                                    padding: '4px 8px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: diasDescanso === 30 ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ⛅ Transición (30d)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDiasDescanso(40)}
                                                style={{
                                                    flex: 1,
                                                    padding: '4px 8px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: diasDescanso === 40 ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ☀️ Verano (40d)
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                {/* Días de Ocupación (O) */}
                                {calcTarget !== 'ocupacion' ? (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label style={{ margin: 0, fontSize: '0.9rem', color: 'white', fontWeight: 600 }}>
                                                Días de Ocupación por Potrero (O)
                                            </label>
                                            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-light)' }}>
                                                {diasOcupacion} {diasOcupacion === 1 ? 'día' : 'días'}
                                            </span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0.5" 
                                            max="7" 
                                            step="0.5"
                                            value={diasOcupacion} 
                                            onChange={e => setDiasOcupacion(parseFloat(e.target.value) || 0.5)}
                                            style={{ width: '100%', accentColor: 'var(--primary)', marginBottom: '8px' }}
                                        />
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setDiasOcupacion(1)}
                                                style={{
                                                    flex: 1,
                                                    padding: '4px 8px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: diasOcupacion === 1 ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                1 día (Intensivo)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDiasOcupacion(2)}
                                                style={{
                                                    flex: 1,
                                                    padding: '4px 8px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: diasOcupacion === 2 ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                2 días (Estándar)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDiasOcupacion(3)}
                                                style={{
                                                    flex: 1,
                                                    padding: '4px 8px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: diasOcupacion === 3 ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: 'var(--text-muted)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                3 días (Tope rebrote)
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                {/* Número de Potreros (N) */}
                                {calcTarget !== 'potreros' ? (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label style={{ margin: 0, fontSize: '0.9rem', color: 'white', fontWeight: 600 }}>
                                                Número de Potreros Disponibles (N)
                                            </label>
                                            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-light)' }}>
                                                {nroPotreros} potreros
                                            </span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="2" 
                                            max="50" 
                                            step="1"
                                            value={nroPotreros} 
                                            onChange={e => setNroPotreros(parseInt(e.target.value) || 2)}
                                            style={{ width: '100%', accentColor: 'var(--primary)', marginBottom: '8px' }}
                                        />
                                        {potreros.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setNroPotreros(potreros.length)}
                                                style={{
                                                    width: '100%',
                                                    padding: '5px 10px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '6px',
                                                    background: nroPotreros === potreros.length ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    color: 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Usar mis potreros totales en la finca ({potreros.length} potreros)
                                            </button>
                                        )}
                                    </div>
                                ) : null}

                                {/* Grupos de Ganado (G) */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        Grupos de Ganado en la Rotación (G)
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setGruposPastoreo(1)}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                fontSize: '0.8rem',
                                                borderRadius: '8px',
                                                fontWeight: 600,
                                                border: gruposPastoreo === 1 ? '1px solid var(--primary-light)' : '1px solid rgba(255,255,255,0.08)',
                                                backgroundColor: gruposPastoreo === 1 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.03)',
                                                color: gruposPastoreo === 1 ? 'white' : 'var(--text-muted)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            1 Lote (Convencional)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setGruposPastoreo(2)}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                fontSize: '0.8rem',
                                                borderRadius: '8px',
                                                fontWeight: 600,
                                                border: gruposPastoreo === 2 ? '1px solid var(--primary-light)' : '1px solid rgba(255,255,255,0.08)',
                                                backgroundColor: gruposPastoreo === 2 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255,255,255,0.03)',
                                                color: gruposPastoreo === 2 ? 'white' : 'var(--text-muted)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            2 Lotes (Punta y Cola)
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Columna Derecha: Resultado Destacado + Semáforo Zootécnico */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                
                                {/* Card del Resultado */}
                                <div style={{ 
                                    padding: '20px', 
                                    borderRadius: '14px', 
                                    backgroundColor: 'rgba(0, 0, 0, 0.4)', 
                                    border: '1px solid rgba(76, 175, 80, 0.3)',
                                    textAlign: 'center'
                                }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                        {calcTarget === 'potreros' && 'Potreros Necesarios'}
                                        {calcTarget === 'ocupacion' && 'Ocupación Máxima Recomendada'}
                                        {calcTarget === 'descanso' && 'Días de Descanso Efectivo'}
                                    </span>

                                    <div style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--primary-light)', margin: '6px 0' }}>
                                        {calcTarget === 'potreros' && `${potrerosCalculadosCeil} potreros`}
                                        {calcTarget === 'ocupacion' && `${ocupacionCalculada > 0 ? ocupacionCalculada.toFixed(1) : '---'} días`}
                                        {calcTarget === 'descanso' && `${descansoCalculado} días`}
                                    </div>

                                    <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.85)', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '6px 12px', borderRadius: '8px', display: 'inline-block' }}>
                                        {calcTarget === 'potreros' && (
                                            <>({diasDescanso}d descanso ÷ {diasOcupacion}d ocupación) + {gruposPastoreo} lote = <strong>{potrerosCalculadosExacto.toFixed(1)}</strong> ({potrerosCalculadosCeil} potreros)</>
                                        )}
                                        {calcTarget === 'ocupacion' && (
                                            <>{diasDescanso}d descanso ÷ ({nroPotreros} potreros - {gruposPastoreo} lote) = <strong>{ocupacionCalculada.toFixed(1)} días/potrero</strong></>
                                        )}
                                        {calcTarget === 'descanso' && (
                                            <>({nroPotreros} potreros - {gruposPastoreo} lote) × {diasOcupacion}d ocupación = <strong>{descansoCalculado} días de descanso</strong></>
                                        )}
                                    </div>
                                </div>

                                {/* Semáforo Zootécnico */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Feedback Ocupación */}
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        backgroundColor: ocupacionAlert.type === 'danger' ? 'rgba(244, 67, 54, 0.12)' : ocupacionAlert.type === 'warning' ? 'rgba(255, 152, 0, 0.12)' : 'rgba(76, 175, 80, 0.12)',
                                        border: `1px solid ${ocupacionAlert.type === 'danger' ? 'rgba(244, 67, 54, 0.3)' : ocupacionAlert.type === 'warning' ? 'rgba(255, 152, 0, 0.3)' : 'rgba(76, 175, 80, 0.3)'}`
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            {ocupacionAlert.type === 'success' ? <CheckCircle2 size={16} color="var(--primary-light)" /> : <AlertTriangle size={16} color={ocupacionAlert.type === 'danger' ? 'var(--error)' : '#ff9800'} />}
                                            <strong style={{ fontSize: '0.85rem', color: ocupacionAlert.type === 'danger' ? 'var(--error)' : ocupacionAlert.type === 'warning' ? '#ff9800' : 'var(--primary-light)' }}>
                                                {ocupacionAlert.title}
                                            </strong>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.4 }}>
                                            {ocupacionAlert.desc}
                                        </p>
                                    </div>

                                    {/* Feedback Descanso */}
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        backgroundColor: descansoAlert.type === 'danger' ? 'rgba(244, 67, 54, 0.12)' : descansoAlert.type === 'warning' ? 'rgba(255, 152, 0, 0.12)' : descansoAlert.type === 'info' ? 'rgba(33, 150, 243, 0.12)' : 'rgba(76, 175, 80, 0.12)',
                                        border: `1px solid ${descansoAlert.type === 'danger' ? 'rgba(244, 67, 54, 0.3)' : descansoAlert.type === 'warning' ? 'rgba(255, 152, 0, 0.3)' : descansoAlert.type === 'info' ? 'rgba(33, 150, 243, 0.3)' : 'rgba(76, 175, 80, 0.3)'}`
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            {descansoAlert.type === 'success' ? <CheckCircle2 size={16} color="var(--primary-light)" /> : <AlertTriangle size={16} color={descansoAlert.type === 'danger' ? 'var(--error)' : descansoAlert.type === 'info' ? '#2196f3' : '#ff9800'} />}
                                            <strong style={{ fontSize: '0.85rem', color: descansoAlert.type === 'danger' ? 'var(--error)' : descansoAlert.type === 'warning' ? '#ff9800' : descansoAlert.type === 'info' ? '#2196f3' : 'var(--primary-light)' }}>
                                                {descansoAlert.title}
                                            </strong>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.4 }}>
                                            {descansoAlert.desc}
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                );
            })()}

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
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setNroPotreros(Math.max(2, rot.pots.length));
                                        setCalcTarget('ocupacion');
                                        setShowCalculadora(true);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    title="Simular rotación de Voisin con los potreros de este grupo"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '3px 10px',
                                        fontSize: '0.75rem',
                                        borderRadius: '100px',
                                        background: 'rgba(76, 175, 80, 0.12)',
                                        color: 'var(--primary-light)',
                                        border: '1px solid rgba(76, 175, 80, 0.25)',
                                        cursor: 'pointer',
                                        width: 'auto'
                                    }}
                                >
                                    <Calculator size={12} /> Simular Voisin
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

