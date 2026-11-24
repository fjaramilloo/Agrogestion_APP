import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { localDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useModalDialog } from '../hooks/useModalDialog';
import { sanitizeDecimalInput, parseDecimalInput } from '../utils/decimalInput';
import { MapPin, Plus, Trash2, Edit2, Check, X, Layers, Info, Search, CheckSquare, Square, Calculator, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import './Rotations.css';

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
    const { confirmAction, toast } = useFeedback();
    const isMobile = useIsMobile();
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

    const nuevaRotDialogProps = useModalDialog(showNuevaRotacion, () => setShowNuevaRotacion(false), true);
    const nuevoPotDialogProps = useModalDialog(showNuevoPotrero !== null, () => setShowNuevoPotrero(null), true);

    // Calculadora Voisin
    const [showCalculadora, setShowCalculadora] = useState(false);
    const [calcModo, setCalcModo] = useState<'potreros' | 'ocupacion' | 'descanso'>('potreros');
    const [calcDescanso, setCalcDescanso] = useState<number>(28);
    const [calcOcupacion, setCalcOcupacion] = useState<number>(2);
    const [calcOcupacionStr, setCalcOcupacionStr] = useState<string>('2');
    const [calcPotreros, setCalcPotreros] = useState<number>(15);

    const isAdmin = role === 'administrador' || role === 'vaquero';

    const fetchData = async () => {
        if (!fincaId) return;
        try {
            const { data: rotData, error: rotErr } = await supabase
                .from('rotaciones')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');

            const { data: potData, error: potErr } = await supabase
                .from('potreros')
                .select('id, nombre, area_hectareas, id_rotacion')
                .eq('id_finca', fincaId)
                .order('nombre');

            if (!rotErr && rotData) {
                setRotaciones(rotData);
            } else {
                const rots = await localDB.rotacionesCache.where('id_finca').equals(fincaId).toArray();
                if (rots.length > 0) setRotaciones(rots.map(r => ({ id: r.id, nombre: r.nombre })));
            }

            if (!potErr && potData) {
                setPotreros(potData);
            } else {
                const pots = await localDB.potrerosCache.where('id_finca').equals(fincaId).toArray();
                if (pots.length > 0) {
                    setPotreros(pots.map(p => ({
                        id: p.id,
                        nombre: p.nombre,
                        area_hectareas: p.area_ha || 0,
                        id_rotacion: (p as any).id_rotacion || null
                    })));
                }
            }
        } catch (err) {
            console.warn('[Rotations] Error fetching data:', err);
            try {
                const [rots, pots] = await Promise.all([
                    localDB.rotacionesCache.where('id_finca').equals(fincaId).toArray(),
                    localDB.potrerosCache.where('id_finca').equals(fincaId).toArray()
                ]);
                if (rots.length > 0) setRotaciones(rots.map(r => ({ id: r.id, nombre: r.nombre })));
                if (pots.length > 0) {
                    setPotreros(pots.map(p => ({
                        id: p.id,
                        nombre: p.nombre,
                        area_hectareas: p.area_ha || 0,
                        id_rotacion: (p as any).id_rotacion || null
                    })));
                }
            } catch {}
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
                    area_hectareas: parseDecimalInput(editPotForm.area) || 0,
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
                area_hectareas: parseDecimalInput(nuevoPotForm.area) || 0,
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
        if (!isAdmin) return;
        const confirmed = await confirmAction('¿Eliminar potrero?', {
            title: 'Eliminar potrero',
            confirmLabel: 'Sí, eliminar',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            const { error } = await supabase.from('potreros').delete().eq('id', id);
            if (error) throw error;
            fetchData();
            toast('Potrero eliminado.', 'success');
        } catch (err: any) {
            console.error(err);
            setMsjError(err?.message || 'Error al eliminar potrero');
            toast(err?.message || 'Error al eliminar potrero', 'error');
        }
    };

    const deleteRotacion = async (id: string) => {
        if (!isAdmin) return;
        const confirmed = await confirmAction('¿Eliminar rotación? Los potreros quedarán sin rotación.', {
            title: 'Eliminar rotación',
            confirmLabel: 'Sí, eliminar',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            const { error } = await supabase.from('rotaciones').delete().eq('id', id);
            if (error) throw error;
            fetchData();
            toast('Rotación eliminada.', 'success');
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
        <div className="page-container rotations-page">
            <div className="rotations-header">
                <div>
                    <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                        <MapPin size={32} aria-hidden="true" /> Rotaciones
                    </h1>
                    <div className="rotations-stats">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <Layers size={16} aria-hidden="true" /> <strong style={{ color: 'var(--text-main)' }}>{rotaciones.length}</strong> Rotaciones
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <MapPin size={16} aria-hidden="true" /> <strong style={{ color: 'var(--text-main)' }}>{potreros.length}</strong> Potreros
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <strong style={{ color: 'var(--primary-light)' }}>{areaFinca.toFixed(2)}</strong> Ha Totales
                        </div>
                    </div>
                </div>
                <div className="rotations-header-actions">
                    <button
                        onClick={() => setShowCalculadora(prev => !prev)}
                        type="button"
                        aria-expanded={showCalculadora}
                        className="rotations-calc-toggle"
                        style={{
                            backgroundColor: showCalculadora ? 'var(--primary-soft-bg)' : 'var(--surface-subtle)',
                            border: `1px solid ${showCalculadora ? 'var(--primary-light)' : 'var(--border-strong)'}`,
                            color: showCalculadora ? 'var(--primary-light)' : 'var(--text-main)',
                        }}
                    >
                        <Calculator size={18} aria-hidden="true" /> Calculadora Voisin {showCalculadora ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                    </button>

                    {isAdmin && (
                        <button
                            type="button"
                            onClick={() => setShowNuevaRotacion(true)}
                            className="rotations-new-btn"
                        >
                            <Plus size={20} aria-hidden="true" /> Nueva Rotación
                        </button>
                    )}
                </div>
            </div>

            {msjError && <div role="alert" style={{ backgroundColor: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>{msjError}</div>}

            <dialog
                {...nuevaRotDialogProps}
                className="rotations-dialog"
                aria-labelledby="rotations-new-title"
            >
                {showNuevaRotacion && (
                    <div className="card rotations-dialog-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <h2 id="rotations-new-title" style={{ margin: 0 }}>Nueva Rotación</h2>
                            <button
                                type="button"
                                className="rotations-inline-icon-btn"
                                aria-label="Cerrar"
                                onClick={() => setShowNuevaRotacion(false)}
                            >
                                <X size={20} aria-hidden="true" />
                            </button>
                        </div>
                        <form onSubmit={handleAddRotacion} style={{ marginTop: '20px' }}>
                            <label htmlFor="rotations-new-name-input">Nombre de la Rotación</label>
                            <input
                                id="rotations-new-name-input"
                                autoFocus={!isMobile}
                                type="text"
                                value={nuevaRotNombre}
                                onChange={e => setNuevaRotNombre(e.target.value)}
                                placeholder="Ej: Rotación Norte"
                                required
                            />
                            <div className="rotations-dialog-actions">
                                <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => setShowNuevaRotacion(false)}>Cancelar</button>
                                <button type="submit" style={{ width: 'auto' }}>Crear</button>
                            </div>
                        </form>
                    </div>
                )}
            </dialog>

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
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: 'var(--shadow-card)',
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
                                        backgroundColor: 'var(--primary-soft-bg)',
                                        color: 'var(--primary-light)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Calculator size={18} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', fontWeight: 600 }}>
                                        Calculadora de Rotación (Fórmula de Voisin)
                                    </h3>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        backgroundColor: 'var(--surface-inset)',
                                        border: '1px solid var(--border-subtle)',
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
                                className="rotations-inline-icon-btn"
                                title="Cerrar calculadora"
                                aria-label="Cerrar calculadora"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>

                        {/* Selector de Incógnita / Objetivo */}
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginBottom: '20px',
                            flexWrap: 'wrap',
                            borderBottom: '1px solid var(--border-subtle)',
                            paddingBottom: '14px'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '8px' }}>
                                ¿Qué deseas calcular?:
                            </span>
                            <button
                                type="button"
                                aria-pressed={calcModo === 'potreros'}
                                onClick={() => setCalcModo('potreros')}
                                className="rotations-voisin-tab"
                                style={{
                                    border: '1px solid',
                                    backgroundColor: calcModo === 'potreros' ? 'var(--primary-soft-bg)' : 'transparent',
                                    borderColor: calcModo === 'potreros' ? 'var(--primary-light)' : 'var(--border-strong)',
                                    color: calcModo === 'potreros' ? 'var(--primary-light)' : 'var(--text-muted)'
                                }}
                            >
                                📐 Potreros Necesarios (N)
                            </button>
                            <button
                                type="button"
                                aria-pressed={calcModo === 'ocupacion'}
                                onClick={() => setCalcModo('ocupacion')}
                                className="rotations-voisin-tab"
                                style={{
                                    border: '1px solid',
                                    backgroundColor: calcModo === 'ocupacion' ? 'var(--primary-soft-bg)' : 'transparent',
                                    borderColor: calcModo === 'ocupacion' ? 'var(--primary-light)' : 'var(--border-strong)',
                                    color: calcModo === 'ocupacion' ? 'var(--primary-light)' : 'var(--text-muted)'
                                }}
                            >
                                ⏱️ Días de Ocupación (O)
                            </button>
                            <button
                                type="button"
                                aria-pressed={calcModo === 'descanso'}
                                onClick={() => setCalcModo('descanso')}
                                className="rotations-voisin-tab"
                                style={{
                                    border: '1px solid',
                                    backgroundColor: calcModo === 'descanso' ? 'var(--primary-soft-bg)' : 'transparent',
                                    borderColor: calcModo === 'descanso' ? 'var(--primary-light)' : 'var(--border-strong)',
                                    color: calcModo === 'descanso' ? 'var(--primary-light)' : 'var(--text-muted)'
                                }}
                            >
                                🌿 Días de Descanso (D)
                            </button>
                        </div>

                        {/* Grid de Inputs y Resultado */}
                        <div className="rotations-voisin-grid">
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
                                                <span style={{ fontSize: '0.75rem', color: calcOcupacion > 3 ? 'var(--warning)' : 'var(--success)' }}>
                                                    {calcOcupacion <= 3 ? 'Ideal ≤ 3 días' : '⚠️ > 3 días daña rebrote'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={calcOcupacionStr}
                                                    onChange={e => {
                                                        const cleaned = sanitizeDecimalInput(e.target.value);
                                                        setCalcOcupacionStr(cleaned);
                                                        const parsed = parseDecimalInput(cleaned);
                                                        if (!isNaN(parsed) && parsed > 0) {
                                                            setCalcOcupacion(Math.min(30, Math.max(0.5, parsed)));
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        const parsed = parseDecimalInput(calcOcupacionStr);
                                                        const clamped = !isNaN(parsed) && parsed > 0 ? Math.min(30, Math.max(0.5, parsed)) : 0.5;
                                                        setCalcOcupacion(clamped);
                                                        setCalcOcupacionStr(String(clamped));
                                                    }}
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
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cargar de:</span>
                                                    {groupedData.map(r => (
                                                        <button
                                                            key={r.id}
                                                            type="button"
                                                            className="rotations-preset-btn"
                                                            onClick={() => setCalcPotreros(r.pots.length || 2)}
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
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cargar de:</span>
                                                    {groupedData.map(r => (
                                                        <button
                                                            key={r.id}
                                                            type="button"
                                                            className="rotations-preset-btn"
                                                            onClick={() => setCalcPotreros(r.pots.length || 2)}
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
                                                <span style={{ fontSize: '0.75rem', color: calcOcupacion > 3 ? 'var(--warning)' : 'var(--success)' }}>
                                                    {calcOcupacion <= 3 ? 'Ideal ≤ 3 días' : '⚠️ > 3 días daña rebrote'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={calcOcupacionStr}
                                                    onChange={e => {
                                                        const cleaned = sanitizeDecimalInput(e.target.value);
                                                        setCalcOcupacionStr(cleaned);
                                                        const parsed = parseDecimalInput(cleaned);
                                                        if (!isNaN(parsed) && parsed > 0) {
                                                            setCalcOcupacion(Math.min(30, Math.max(0.5, parsed)));
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        const parsed = parseDecimalInput(calcOcupacionStr);
                                                        const clamped = !isNaN(parsed) && parsed > 0 ? Math.min(30, Math.max(0.5, parsed)) : 0.5;
                                                        setCalcOcupacion(clamped);
                                                        setCalcOcupacionStr(String(clamped));
                                                    }}
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
                                backgroundColor: 'var(--surface-subtle)',
                                border: `1px solid ${res.alerta ? 'var(--warning-soft-border)' : 'var(--success-soft-border)'}`,
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
                                    <h2 style={{ margin: 0, fontSize: '2.4rem', color: res.alerta ? 'var(--warning)' : 'var(--success)', fontWeight: 'bold' }}>
                                        {res.valorPrincipal}
                                    </h2>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', display: 'block', marginTop: '6px' }}>
                                        {res.formulaDetalle}
                                    </span>
                                </div>

                                <div style={{
                                    backgroundColor: res.alerta ? 'var(--warning-soft-bg)' : 'var(--success-soft-bg)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'flex-start'
                                }}>
                                    {res.alerta ? (
                                        <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    ) : (
                                        <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    )}
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.45' }}>
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
                    <div key={rot.id} className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                        {/* Header de la Rotación */}
                        <div className="rotations-group-header">
                            <div className="rotations-group-title-wrap">
                                <Layers size={20} color="var(--primary-light)" aria-hidden="true" />
                                {editingRot === rot.id ? (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <input
                                            autoFocus={!isMobile}
                                            aria-label="Nuevo nombre de rotación"
                                            style={{ margin: 0, padding: '6px 10px', fontSize: '1rem', width: 'auto', minWidth: '160px' }}
                                            value={editRotNombre}
                                            onChange={e => setEditRotNombre(e.target.value)}
                                        />
                                        <button type="button" onClick={() => handleUpdateRotacion(rot.id)} className="rotations-inline-icon-btn rotations-inline-icon-btn--success" aria-label="Guardar nombre">
                                            <Check size={18} aria-hidden="true" />
                                        </button>
                                        <button type="button" onClick={() => setEditingRot(null)} className="rotations-inline-icon-btn" aria-label="Cancelar edición">
                                            <X size={18} aria-hidden="true" />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <h3 style={{ margin: 0, color: 'var(--text-main)', fontWeight: 600 }}>{rot.nombre}</h3>
                                        {isAdmin && (
                                            <button
                                                type="button"
                                                className="rotations-inline-icon-btn"
                                                aria-label={`Renombrar rotación ${rot.nombre}`}
                                                onClick={() => { setEditingRot(rot.id); setEditRotNombre(rot.nombre); }}
                                            >
                                                <Edit2 size={15} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                )}
                                <span style={{ fontSize: '0.8rem', backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '2px 10px', borderRadius: '100px', color: 'var(--text-muted)' }}>
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
                                        minHeight: '36px',
                                        padding: '4px 12px',
                                        fontSize: '0.78rem',
                                        borderRadius: '100px',
                                        backgroundColor: 'var(--primary-soft-bg)',
                                        border: '1px solid var(--primary-soft-border)',
                                        color: 'var(--primary-light)',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Calculator size={13} aria-hidden="true" /> Evaluar Voisin
                                </button>
                            </div>
                            {isAdmin && (
                                <div className="rotations-group-actions">
                                    <button
                                        type="button"
                                        onClick={() => openModalForRotation(rot.id)}
                                        style={{
                                            width: 'auto',
                                            minHeight: '40px',
                                            padding: '8px 16px',
                                            fontSize: '0.82rem',
                                            borderRadius: '100px',
                                            backgroundColor: 'var(--primary)',
                                            color: 'var(--on-primary)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            border: 'none',
                                            boxShadow: 'var(--shadow-card)'
                                        }}
                                    >
                                        <Plus size={15} aria-hidden="true" /> Potrero
                                    </button>
                                    {role === 'administrador' && (
                                        <button
                                            type="button"
                                            onClick={() => deleteRotacion(rot.id)}
                                            className="rotations-inline-icon-btn rotations-inline-icon-btn--danger"
                                            title="Eliminar Rotación"
                                            aria-label={`Eliminar rotación ${rot.nombre}`}
                                        >
                                            <Trash2 size={17} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Tabla de Potreros dentro de la Rotación */}
                        <div tabIndex={0} role="region" aria-label={`Potreros en ${rot.nombre}`} className="rotations-table-wrapper">
                            <table className="rotations-table">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <th scope="col" style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Potrero</th>
                                        <th scope="col" className="rotations-area-cell" style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Área (Ha)</th>
                                        {isAdmin && <th scope="col" style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', width: '110px' }}>Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rot.pots.length === 0 ? (
                                        <tr><td colSpan={isAdmin ? 3 : 2} style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay potreros asignados.</td></tr>
                                    ) : (
                                        rot.pots.map(p => (
                                            <tr key={p.id}>
                                                <td data-label="Potrero">
                                                    {editingPot === p.id ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                                                            <input style={{ margin: 0, padding: '8px 10px' }} value={editPotForm.nombre} onChange={e => setEditPotForm({ ...editPotForm, nombre: e.target.value })} placeholder="Nombre" aria-label="Nombre del potrero" />
                                                            <select
                                                                aria-label="Rotación asignada"
                                                                style={{ margin: 0, padding: '8px 10px', fontSize: '0.85rem' }}
                                                                value={editPotForm.id_rotacion}
                                                                onChange={e => setEditPotForm({ ...editPotForm, id_rotacion: e.target.value })}
                                                            >
                                                                <option value="">Sin Rotación</option>
                                                                {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{p.nombre}</span>
                                                    )}
                                                </td>
                                                <td data-label="Área (Ha)" className="rotations-area-cell">
                                                    {editingPot === p.id ? (
                                                        <input aria-label="Área en hectáreas" style={{ margin: 0, padding: '8px 10px', textAlign: 'right', width: '100%' }} type="text" inputMode="decimal" value={editPotForm.area} onChange={e => setEditPotForm({ ...editPotForm, area: sanitizeDecimalInput(e.target.value) })} />
                                                    ) : (
                                                        <span style={{ color: 'var(--primary-light)', fontFamily: 'monospace', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.area_hectareas?.toFixed(2)}</span>
                                                    )}
                                                </td>
                                                {isAdmin && (
                                                    <td className="rotations-actions-cell">
                                                        <div className="rotations-row-actions">
                                                            {editingPot === p.id ? (
                                                                <>
                                                                    <button type="button" onClick={() => handleUpdatePotrero(p.id)} className="rotations-inline-icon-btn rotations-inline-icon-btn--row rotations-inline-icon-btn--success" aria-label={`Guardar cambios de ${p.nombre}`}>
                                                                        <Check size={18} aria-hidden="true" />
                                                                        <span className="rotations-btn-mobile-label">Guardar</span>
                                                                    </button>
                                                                    <button type="button" onClick={() => setEditingPot(null)} className="rotations-inline-icon-btn rotations-inline-icon-btn--row" aria-label="Cancelar edición">
                                                                        <X size={18} aria-hidden="true" />
                                                                        <span className="rotations-btn-mobile-label">Cancelar</span>
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button type="button" onClick={() => { setEditingPot(p.id); setEditPotForm({ nombre: p.nombre, area: p.area_hectareas.toString(), id_rotacion: p.id_rotacion || '' }); }} className="rotations-inline-icon-btn rotations-inline-icon-btn--row" aria-label={`Editar potrero ${p.nombre}`}>
                                                                        <Edit2 size={16} aria-hidden="true" />
                                                                        <span className="rotations-btn-mobile-label">Editar</span>
                                                                    </button>
                                                                    {role === 'administrador' && (
                                                                        <button type="button" onClick={() => deletePotrero(p.id)} className="rotations-inline-icon-btn rotations-inline-icon-btn--row rotations-inline-icon-btn--danger" aria-label={`Eliminar potrero ${p.nombre}`}>
                                                                            <Trash2 size={16} aria-hidden="true" />
                                                                            <span className="rotations-btn-mobile-label">Eliminar</span>
                                                                        </button>
                                                                    )}
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
                    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px dashed var(--border-strong)' }}>
                        <div className="rotations-group-header">
                            <div className="rotations-group-title-wrap">
                                <Info size={20} color="var(--text-muted)" aria-hidden="true" />
                                <h3 style={{ margin: 0, color: 'var(--text-secondary)' }}>Sin Rotación Asignada</h3>
                                <span style={{ fontSize: '0.8rem', backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '2px 10px', borderRadius: '100px', color: 'var(--text-muted)' }}>
                                    {filteredSinRotacion.length} potreros • {areaTotalSin.toFixed(2)} Ha
                                </span>
                            </div>
                            {isAdmin && (
                                <div className="rotations-group-actions">
                                    <button
                                        type="button"
                                        onClick={() => openModalForRotation('none')}
                                        style={{
                                            width: 'auto',
                                            minHeight: '40px',
                                            padding: '8px 16px',
                                            fontSize: '0.82rem',
                                            borderRadius: '100px',
                                            backgroundColor: 'var(--surface-inset)',
                                            border: '1px solid var(--border-strong)',
                                            color: 'var(--text-main)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            textTransform: 'none',
                                            fontWeight: 600
                                        }}
                                    >
                                        <Plus size={15} aria-hidden="true" /> Potrero
                                    </button>
                                </div>
                            )}
                        </div>
                        <div tabIndex={0} role="region" aria-label="Potreros sin rotación asignada" className="rotations-table-wrapper">
                            <table className="rotations-table">
                                <tbody>
                                    {filteredSinRotacion.map(p => (
                                        <tr key={p.id}>
                                            <td data-label="Potrero">
                                                {editingPot === p.id ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                                                        <input style={{ margin: 0, padding: '8px 10px' }} value={editPotForm.nombre} onChange={e => setEditPotForm({ ...editPotForm, nombre: e.target.value })} placeholder="Nombre" aria-label="Nombre del potrero" />
                                                        <select
                                                            aria-label="Rotación asignada"
                                                            style={{ margin: 0, padding: '8px 10px', fontSize: '0.85rem' }}
                                                            value={editPotForm.id_rotacion}
                                                            onChange={e => setEditPotForm({ ...editPotForm, id_rotacion: e.target.value })}
                                                        >
                                                            <option value="">Sin Rotación</option>
                                                            {rotaciones.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>{p.nombre}</span>
                                                )}
                                            </td>
                                            <td data-label="Área (Ha)" className="rotations-area-cell">
                                                {editingPot === p.id ? (
                                                    <input aria-label="Área en hectáreas" style={{ margin: 0, padding: '8px 10px', textAlign: 'right', width: '100%' }} type="text" inputMode="decimal" value={editPotForm.area} onChange={e => setEditPotForm({ ...editPotForm, area: sanitizeDecimalInput(e.target.value) })} />
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.area_hectareas?.toFixed(2)}</span>
                                                )}
                                            </td>
                                            {isAdmin && (
                                                <td className="rotations-actions-cell">
                                                    <div className="rotations-row-actions">
                                                        {editingPot === p.id ? (
                                                            <>
                                                                <button type="button" onClick={() => handleUpdatePotrero(p.id)} className="rotations-inline-icon-btn rotations-inline-icon-btn--row rotations-inline-icon-btn--success" aria-label={`Guardar cambios de ${p.nombre}`}>
                                                                    <Check size={18} aria-hidden="true" />
                                                                    <span className="rotations-btn-mobile-label">Guardar</span>
                                                                </button>
                                                                <button type="button" onClick={() => setEditingPot(null)} className="rotations-inline-icon-btn rotations-inline-icon-btn--row" aria-label="Cancelar edición">
                                                                    <X size={18} aria-hidden="true" />
                                                                    <span className="rotations-btn-mobile-label">Cancelar</span>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button type="button" onClick={() => { setEditingPot(p.id); setEditPotForm({ nombre: p.nombre, area: p.area_hectareas.toString(), id_rotacion: '' }); }} className="rotations-inline-icon-btn rotations-inline-icon-btn--row" aria-label={`Editar potrero ${p.nombre}`}>
                                                                    <Edit2 size={16} aria-hidden="true" />
                                                                    <span className="rotations-btn-mobile-label">Editar</span>
                                                                </button>
                                                                {role === 'administrador' && (
                                                                    <button type="button" onClick={() => deletePotrero(p.id)} className="rotations-inline-icon-btn rotations-inline-icon-btn--row rotations-inline-icon-btn--danger" aria-label={`Eliminar potrero ${p.nombre}`}>
                                                                        <Trash2 size={16} aria-hidden="true" />
                                                                        <span className="rotations-btn-mobile-label">Eliminar</span>
                                                                    </button>
                                                                )}
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
            <dialog
                {...nuevoPotDialogProps}
                className="rotations-dialog rotations-dialog--wide"
                aria-labelledby="rotations-potrero-title"
            >
                {showNuevoPotrero && (
                    <div className="card rotations-dialog-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
                            <div>
                                <h2 id="rotations-potrero-title" style={{ margin: 0, fontSize: '1.3rem' }}>
                                    {currentTargetRot ? `Añadir a ${currentTargetRot.nombre}` : 'Añadir Potrero'}
                                </h2>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {showNuevoPotrero === 'none'
                                        ? 'Crea un potrero sin rotación asignada'
                                        : 'Selecciona potreros existentes o crea uno nuevo'}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="Cerrar"
                                onClick={() => setShowNuevoPotrero(null)}
                                className="rotations-inline-icon-btn"
                            >
                                <X size={20} aria-hidden="true" />
                            </button>
                        </div>

                        {/* Segmented Tabs */}
                        {showNuevoPotrero !== 'none' && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                backgroundColor: 'var(--surface-inset)',
                                border: '1px solid var(--border-subtle)',
                                padding: '4px',
                                borderRadius: '10px',
                                marginBottom: '20px',
                                gap: '4px'
                            }}>
                                <button
                                    type="button"
                                    aria-pressed={potreroModalTab === 'existente'}
                                    onClick={() => setPotreroModalTab('existente')}
                                    style={{
                                        padding: '10px 12px',
                                        minHeight: '44px',
                                        fontSize: '0.85rem',
                                        borderRadius: '8px',
                                        backgroundColor: potreroModalTab === 'existente' ? 'var(--primary)' : 'transparent',
                                        color: potreroModalTab === 'existente' ? 'var(--on-primary)' : 'var(--text-muted)',
                                        border: 'none',
                                        boxShadow: potreroModalTab === 'existente' ? 'var(--shadow-card)' : 'none',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <CheckSquare size={16} aria-hidden="true" /> Seleccionar Existente
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={potreroModalTab === 'nuevo'}
                                    onClick={() => setPotreroModalTab('nuevo')}
                                    style={{
                                        padding: '10px 12px',
                                        minHeight: '44px',
                                        fontSize: '0.85rem',
                                        borderRadius: '8px',
                                        backgroundColor: potreroModalTab === 'nuevo' ? 'var(--primary)' : 'transparent',
                                        color: potreroModalTab === 'nuevo' ? 'var(--on-primary)' : 'var(--text-muted)',
                                        border: 'none',
                                        boxShadow: potreroModalTab === 'nuevo' ? 'var(--shadow-card)' : 'none',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Plus size={16} aria-hidden="true" /> Crear Nuevo
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
                                        <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} aria-hidden="true" />
                                        <input
                                            type="text"
                                            aria-label="Buscar potrero disponible"
                                            placeholder="Buscar potrero disponible..."
                                            value={existingSearchTerm}
                                            onChange={(e) => setExistingSearchTerm(e.target.value)}
                                            style={{ paddingLeft: '36px', marginBottom: 0, minHeight: '44px', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                )}

                                <div style={{
                                    overflowY: 'auto',
                                    maxHeight: '300px',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '8px',
                                    padding: '6px',
                                    marginBottom: '16px',
                                    backgroundColor: 'var(--surface-inset)'
                                }}>
                                    {availableExistingPotreros.length === 0 ? (
                                        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            No hay otros potreros registrados en esta finca.
                                            <div style={{ marginTop: '12px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setPotreroModalTab('nuevo')}
                                                    style={{ width: 'auto', padding: '8px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                >
                                                    <Plus size={14} aria-hidden="true" /> Crear Nuevo Potrero
                                                </button>
                                            </div>
                                        </div>
                                    ) : filteredAvailablePotreros.length === 0 ? (
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No se encontraron potreros que coincidan con la búsqueda.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {filteredAvailablePotreros.map(p => {
                                                const isSelected = selectedExistingIds.includes(p.id);
                                                const isUnassigned = !p.id_rotacion;
                                                const currentRotName = p.id_rotacion ? rotacionMap.get(p.id_rotacion) : null;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={p.id}
                                                        aria-pressed={isSelected}
                                                        onClick={() => toggleSelectExisting(p.id)}
                                                        className="rotations-existing-item"
                                                        style={{
                                                            backgroundColor: isSelected ? 'var(--primary-soft-bg)' : 'var(--surface-subtle)',
                                                            border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                            {isSelected ? (
                                                                <CheckSquare size={18} color="var(--primary-light)" aria-hidden="true" />
                                                            ) : (
                                                                <Square size={18} color="var(--text-muted)" aria-hidden="true" />
                                                            )}
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: 500, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                                                    {p.nombre}
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: isUnassigned ? 'var(--primary-light)' : 'var(--text-muted)' }}>
                                                                    {isUnassigned ? '✦ Sin Rotación' : `Rotación: ${currentRotName || 'Otra'}`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                            <span style={{
                                                                fontSize: '0.85rem',
                                                                fontWeight: 600,
                                                                color: 'var(--primary-light)',
                                                                fontFamily: 'monospace'
                                                            }}>
                                                                {p.area_hectareas ? p.area_hectareas.toFixed(2) : '0.00'} Ha
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="rotations-dialog-actions" style={{ justifyContent: 'space-between', marginTop: 'auto' }}>
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
                                <label htmlFor="rotations-new-potrero-name">Nombre del Potrero</label>
                                <input
                                    id="rotations-new-potrero-name"
                                    autoFocus={!isMobile}
                                    type="text"
                                    value={nuevoPotForm.nombre}
                                    onChange={e => setNuevoPotForm({ ...nuevoPotForm, nombre: e.target.value })}
                                    placeholder="Ej: Lote 1, Potrero Norte..."
                                    required
                                />
                                <label htmlFor="rotations-new-potrero-area">Área (Hectáreas)</label>
                                <input
                                    id="rotations-new-potrero-area"
                                    type="text"
                                    inputMode="decimal"
                                    value={nuevoPotForm.area}
                                    onChange={e => setNuevoPotForm({ ...nuevoPotForm, area: sanitizeDecimalInput(e.target.value) })}
                                    placeholder="0,00"
                                    required
                                />
                                <div className="rotations-dialog-actions">
                                    <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => setShowNuevoPotrero(null)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" style={{ width: 'auto' }} disabled={isSaving}>
                                        {isSaving ? 'Guardando...' : 'Crear Potrero'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </dialog>
        </div>
    );
}

