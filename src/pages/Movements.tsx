import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { localDB } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import ModalUpsell from '../components/ModalUpsell';
import { ArrowLeftRight, Save, Search, ChevronDown, Check, AlertOctagon, X } from 'lucide-react';
import { getLocalIsoDate } from '../utils/dateUtils';
import './Movements.css';

export default function Movements() {
    const { fincaId, role, licenciaInfo } = useAuth();
    const isAdminOrCowboy = role === 'administrador' || role === 'vaquero';
    const isVencida = Boolean(licenciaInfo?.isVencida);
    const isSobrecupo = Boolean(licenciaInfo && (licenciaInfo.isSobrecupo || licenciaInfo.totalAnimalesOrganizacion > licenciaInfo.limiteAnimales));
    const isBloqueado = isVencida || isSobrecupo;
    const [showUpsellModal, setShowUpsellModal] = useState(false);

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    const [potreradas, setPotreradas] = useState<{ id: string, nombre: string, id_rotacion: string | null }[]>([]);
    const [rotaciones, setRotaciones] = useState<{ id: string, nombre: string, potreros: { id: string, nombre: string }[] }[]>([]);
    
    // Formulary state
    const [selectedPotreradaId, setSelectedPotreradaId] = useState('');
    const [currentMovementId, setCurrentMovementId] = useState<string | null>(null);
    const [currentPotrero, setCurrentPotrero] = useState<{ id: string, nombre: string, id_rotacion: string | null } | null>(null);
    
    const [selectedTargetRotacionId, setSelectedTargetRotacionId] = useState('');
    const [selectedTargetPotreroId, setSelectedTargetPotreroId] = useState('');
    const [fechaMovimiento, setFechaMovimiento] = useState(getLocalIsoDate());

    const [rotacionMode, setRotacionMode] = useState<'misma' | 'cambiar' | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showOptions, setShowOptions] = useState(false);
    const [mobileEditingLot, setMobileEditingLot] = useState(false);
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

    const rotacionesRef = useRef(rotaciones);
    rotacionesRef.current = rotaciones;

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        if (!fincaId) return;
        fetchData();
        // eslint-disable-next-line
    }, [fincaId]);

    const fetchData = async () => {
        const currentFincaId = fincaId;
        if (!currentFincaId) return;

        try {
            // Fetch potreradas
            const { data: potreradasData } = await supabase
                .from('potreradas')
                .select('id, nombre, id_rotacion')
                .eq('id_finca', currentFincaId)
                .order('nombre');
            
            if (potreradasData && potreradasData.length > 0) {
                setPotreradas(potreradasData);
            } else {
                const pts = await localDB.potreradasCache.where('id_finca').equals(currentFincaId).toArray();
                if (pts.length > 0) {
                    setPotreradas(pts.map(p => ({ id: p.id, nombre: p.nombre, id_rotacion: (p as any).id_rotacion || null })));
                }
            }
        } catch {
            try {
                const pts = await localDB.potreradasCache.where('id_finca').equals(currentFincaId).toArray();
                if (pts.length > 0) {
                    setPotreradas(pts.map(p => ({ id: p.id, nombre: p.nombre, id_rotacion: (p as any).id_rotacion || null })));
                }
            } catch {}
        }

        try {
            // Fetch rotaciones con potreros
            const { data: rotacionesData } = await supabase
                .from('rotaciones')
                .select(`
                    id, 
                    nombre,
                    potreros (id, nombre)
                `)
                .eq('id_finca', currentFincaId)
                .order('nombre');
                
            if (rotacionesData && rotacionesData.length > 0) {
                setRotaciones(rotacionesData as any);
            } else {
                const [rots, pots] = await Promise.all([
                    localDB.rotacionesCache.where('id_finca').equals(currentFincaId).toArray(),
                    localDB.potrerosCache.where('id_finca').equals(currentFincaId).toArray()
                ]);
                if (rots.length > 0) {
                    setRotaciones(rots.map(r => ({
                        id: r.id,
                        nombre: r.nombre,
                        potreros: pots.filter(p => (p as any).id_rotacion === r.id).map(p => ({ id: p.id, nombre: p.nombre }))
                    })));
                }
            }
        } catch {
            try {
                const [rots, pots] = await Promise.all([
                    localDB.rotacionesCache.where('id_finca').equals(currentFincaId).toArray(),
                    localDB.potrerosCache.where('id_finca').equals(currentFincaId).toArray()
                ]);
                if (rots.length > 0) {
                    setRotaciones(rots.map(r => ({
                        id: r.id,
                        nombre: r.nombre,
                        potreros: pots.filter(p => (p as any).id_rotacion === r.id).map(p => ({ id: p.id, nombre: p.nombre }))
                    })));
                }
            } catch {}
        }
    };

    // Cargar estado actual del lote seleccionado
    const fetchCurrentState = useCallback(async (
        potreradaId: string,
        options?: {
            clearMessages?: boolean;
            fallbackPotrero?: { id: string; nombre: string; id_rotacion: string | null };
        }
    ) => {
        if (!potreradaId || !fincaId) return;

        const { data } = await supabase
            .from('movimientos_potreros')
            .select(`
                id, 
                id_potrero,
                fecha_entrada,
                potreros (id, nombre, id_rotacion)
            `)
            .eq('id_potrerada', potreradaId)
            .is('fecha_salida', null)
            .order('fecha_entrada', { ascending: false })
            .limit(1)
            .single();

        const pObj = potreradas.find(p => p.id === potreradaId);
        const currentRots = rotacionesRef.current;

        if (data && data.potreros) {
            const potreroData = data.potreros as any;
            setCurrentMovementId(data.id);
            setCurrentPotrero({
                id: data.id_potrero,
                nombre: potreroData.nombre,
                id_rotacion: potreroData.id_rotacion
            });

            // Si la potrerada tiene rotación asignada, usar esa. Si no, usar la del potrero actual.
            const targetRotId = pObj?.id_rotacion || potreroData.id_rotacion;
            if (targetRotId) {
                setSelectedTargetRotacionId(targetRotId);
                setRotacionMode('misma');
            } else {
                setSelectedTargetRotacionId(currentRots.length === 1 ? currentRots[0].id : '');
                setRotacionMode('cambiar');
            }
        } else {
            setCurrentMovementId(null);
            const fallbackPot = options?.fallbackPotrero || null;
            setCurrentPotrero(fallbackPot);

            const targetRotId = pObj?.id_rotacion || fallbackPot?.id_rotacion;
            if (targetRotId) {
                setSelectedTargetRotacionId(targetRotId);
                setRotacionMode('misma');
            } else {
                setSelectedTargetRotacionId(currentRots.length === 1 ? currentRots[0].id : '');
                setRotacionMode('cambiar');
            }
        }

        setSelectedTargetPotreroId('');
        if (options?.clearMessages !== false) {
            setMsjExito('');
            setMsjError('');
        }
    }, [fincaId, potreradas]);

    // Cuando se selecciona una potrerada, buscar su último movimiento abierto
    useEffect(() => {
        if (!selectedPotreradaId || !fincaId) {
            setCurrentMovementId(null);
            setCurrentPotrero(null);
            setSelectedTargetRotacionId('');
            setSelectedTargetPotreroId('');
            setRotacionMode(null);
            return;
        }

        void fetchCurrentState(selectedPotreradaId, { clearMessages: true });
    }, [selectedPotreradaId, fincaId, fetchCurrentState]);

    const handleSaveMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsjExito('');
        setMsjError('');

        if (isBloqueado) {
            setShowUpsellModal(true);
            if (isVencida) {
                setMsjError(`Tu suscripción al Plan ${licenciaInfo?.licencia?.toUpperCase()} está vencida. Renueva tu suscripción para registrar rotaciones.`);
            } else {
                setMsjError(`Tu cuenta tiene ${licenciaInfo?.totalAnimalesOrganizacion} animales y supera el cupo de ${licenciaInfo?.limiteAnimales} del Plan ${licenciaInfo?.licencia?.toUpperCase()}. Actualiza tu suscripción para registrar rotaciones.`);
            }
            return;
        }

        if (!fincaId || !selectedPotreradaId || !selectedTargetPotreroId || !fechaMovimiento) {
            setMsjError('Por favor complete todos los campos obligatorios.');
            return;
        }

        if (currentPotrero && currentPotrero.id === selectedTargetPotreroId) {
            setMsjError('El potrero destino no puede ser el mismo potrero actual.');
            return;
        }

        setLoading(true);
        try {
            // 1. Si hay un movimiento actual (fecha_salida is null), actualizarlo con la fecha actual como fecha de salida.
            if (currentMovementId) {
                const { error: errUpdate } = await supabase
                    .from('movimientos_potreros')
                    .update({ fecha_salida: fechaMovimiento })
                    .eq('id', currentMovementId);
                
                if (errUpdate) throw errUpdate;
            }

            // 2. Insertar nuevo movimiento
            const { error: errInsert } = await supabase
                .from('movimientos_potreros')
                .insert({
                    id_finca: fincaId,
                    id_potrerada: selectedPotreradaId,
                    id_potrero: selectedTargetPotreroId,
                    fecha_entrada: fechaMovimiento
                });
            
            if (errInsert) throw errInsert;

            // 3. Actualizar el id_potrero_actual de los animales que pertenecen a esta potrerada
            const { error: errAnimals } = await supabase
                .from('animales')
                .update({ id_potrero_actual: selectedTargetPotreroId })
                .eq('id_potrerada', selectedPotreradaId);
            
            if (errAnimals) throw errAnimals;

            const targetRotObj = rotaciones.find(r => r.id === selectedTargetRotacionId);
            const targetPotObj = targetRotObj?.potreros.find(p => p.id === selectedTargetPotreroId);

            setMsjExito(`Potrerada movida exitosamente${targetPotObj ? ` a ${targetPotObj.nombre}` : ''}.`);

            await fetchCurrentState(selectedPotreradaId, {
                clearMessages: false,
                fallbackPotrero: targetPotObj
                    ? {
                        id: targetPotObj.id,
                        nombre: targetPotObj.nombre,
                        id_rotacion: selectedTargetRotacionId || null
                    }
                    : undefined
            });
        } catch (err: any) {
            setMsjError('Error al guardar el movimiento: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const selectedLotObj = potreradas.find(p => p.id === selectedPotreradaId);
    const assignedRotId = selectedLotObj?.id_rotacion || currentPotrero?.id_rotacion || '';
    const hasAssignedRotation = Boolean(assignedRotId);
    const targetRotacion = rotaciones.find(r => r.id === selectedTargetRotacionId);
    const availableTargetPotreros = (targetRotacion ? targetRotacion.potreros : []).filter(
        p => p.id !== currentPotrero?.id
    );
    const filteredPotreradas = potreradas.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelectTargetRotacion = (rotId: string) => {
        setSelectedTargetRotacionId(rotId);
        setSelectedTargetPotreroId('');
    };

    const renderRadioCards = ({
        options,
        name,
        selectedId,
        onSelect,
        singleColumn,
        onSelectedTap,
        emptyMessage,
    }: {
        options: Array<{ id: string; nombre: string }>;
        name: string;
        selectedId: string;
        onSelect: (id: string) => void;
        singleColumn: boolean;
        onSelectedTap?: () => void;
        emptyMessage?: string;
    }) => (
        <div className={`movements-cards-grid${singleColumn ? ' movements-cards-grid--single' : ''}`}>
            {options.map(item => {
                const checked = selectedId === item.id;
                return (
                    <label
                        key={item.id}
                        className="movements-choice-card"
                        onClick={onSelectedTap && checked ? onSelectedTap : undefined}
                    >
                        <input
                            type="radio"
                            name={name}
                            className="movements-choice-input"
                            checked={checked}
                            onChange={() => onSelect(item.id)}
                        />
                        <span className="movements-choice-text">{item.nombre}</span>
                        <span className="movements-choice-check" aria-hidden="true">
                            {checked && <Check size={14} strokeWidth={3} />}
                        </span>
                    </label>
                );
            })}
            {options.length === 0 && emptyMessage && (
                <div style={{ gridColumn: '1 / -1', padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {emptyMessage}
                </div>
            )}
        </div>
    );

    return (
        <div className="page-container movements-page">
            <h1 className="title movements-title">
                <ArrowLeftRight size={isMobile ? 26 : 32} aria-hidden="true" /> Rotación de Lotes
            </h1>

            {isBloqueado && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08))',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 300px' }}>
                        <AlertOctagon size={24} color="#f87171" style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.92)', lineHeight: 1.4 }}>
                            {isVencida ? (
                                <>
                                    <strong>Modo Solo Lectura (Licencia Vencida):</strong> Tu suscripción al Plan <strong style={{ textTransform: 'uppercase' }}>{licenciaInfo?.licencia}</strong> ha expirado. Para registrar rotaciones y movimientos de potrero, renueva tu suscripción.
                                </>
                            ) : (
                                <>
                                    <strong>Modo Solo Lectura (Sobrecupo):</strong> Tu hato cuenta con <strong style={{ color: '#f87171' }}>{licenciaInfo?.totalAnimalesOrganizacion} animales</strong> (límite del plan: <strong>{licenciaInfo?.limiteAnimales}</strong>). Para registrar rotaciones de potrero, actualiza tu suscripción.
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowUpsellModal(true)}
                        style={{
                            width: 'auto',
                            padding: '8px 16px',
                            fontSize: '0.85rem',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isVencida ? 'Renovar Plan' : 'Ver Planes'}
                    </button>
                </div>
            )}

            {msjExito && (
                <div role="status" aria-live="polite" className="movements-feedback movements-feedback--success">
                    {msjExito}
                </div>
            )}
            {msjError && (
                <div role="alert" aria-live="assertive" className="movements-feedback movements-feedback--error">
                    {msjError}
                </div>
            )}

            <div className="card movements-card">
                <form onSubmit={handleSaveMovement} style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '20px' }}>
                    {isMobile ? (
                        /* ==================== VISTA MÓVIL: 3 TOQUES CON UNA MANO ==================== */
                        <>
                            {selectedPotreradaId && !mobileEditingLot ? (
                                <div className="movements-selected-summary">
                                    <div className="movements-selected-meta">
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            1. Lote seleccionado
                                        </div>
                                        <div className="movements-selected-lot">
                                            {selectedLotObj?.nombre || 'Lote'}
                                        </div>
                                        <div className="movements-selected-potrero">
                                            Ubicación actual: {currentPotrero ? currentPotrero.nombre : 'Sin potrero asignado'}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="movements-change-btn"
                                        onClick={() => setMobileEditingLot(true)}
                                    >
                                        Cambiar
                                    </button>
                                </div>
                            ) : (
                                <fieldset className="movements-fieldset">
                                    <legend className="movements-legend">
                                        1. Seleccionar Lote *
                                    </legend>
                                    {selectedPotreradaId && mobileEditingLot && (
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                            <button
                                                type="button"
                                                className="movements-change-btn"
                                                style={{ minHeight: '44px', padding: '6px 12px', fontSize: '0.82rem' }}
                                                onClick={() => {
                                                    setMobileEditingLot(false);
                                                    setSearchTerm('');
                                                }}
                                            >
                                                Listo
                                            </button>
                                        </div>
                                    )}

                                    {potreradas.length > 6 && (
                                        <search className="movements-search-box" role="search">
                                            <Search
                                                size={18}
                                                aria-hidden="true"
                                                style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
                                            />
                                            <input
                                                type="search"
                                                className="movements-search-input"
                                                placeholder="Filtrar lote..."
                                                aria-label="Filtrar lotes"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                autoCorrect="off"
                                                autoCapitalize="none"
                                                spellCheck={false}
                                            />
                                            {searchTerm && (
                                                <button
                                                    type="button"
                                                    className="movements-search-clear"
                                                    aria-label="Limpiar búsqueda"
                                                    onClick={() => setSearchTerm('')}
                                                >
                                                    <X size={18} aria-hidden="true" />
                                                </button>
                                            )}
                                        </search>
                                    )}

                                    {renderRadioCards({
                                        options: filteredPotreradas,
                                        name: 'movements-lot-mobile',
                                        selectedId: selectedPotreradaId,
                                        singleColumn: filteredPotreradas.length <= 2,
                                        onSelect: (id) => {
                                            setSelectedPotreradaId(id);
                                            setMobileEditingLot(false);
                                            setSearchTerm('');
                                        },
                                        onSelectedTap: () => {
                                            setMobileEditingLot(false);
                                            setSearchTerm('');
                                        },
                                        emptyMessage: 'No se encontraron lotes.',
                                    })}
                                </fieldset>
                            )}

                            {!isAdminOrCowboy && (
                                <p style={{ fontSize: '0.84rem', color: 'var(--error)', margin: 0 }}>
                                    No tienes permisos para realizar movimientos.
                                </p>
                            )}

                            {selectedPotreradaId && !mobileEditingLot && (
                                <>
                                    {/* Selector de Rotación: automático si ya tiene una, con opción de cambiar */}
                                    {hasAssignedRotation && rotacionMode !== 'cambiar' ? (
                                        rotaciones.length > 1 && (
                                            <div className="movements-rot-row">
                                                <span className="movements-rot-label">
                                                    Rotación: <strong>{targetRotacion?.nombre || 'Asignada'}</strong>
                                                </span>
                                                <button
                                                    type="button"
                                                    className="movements-alt-rot-btn"
                                                    onClick={() => {
                                                        setRotacionMode('cambiar');
                                                        setSelectedTargetPotreroId('');
                                                    }}
                                                >
                                                    Otra rotación
                                                </button>
                                            </div>
                                        )
                                    ) : (
                                        <fieldset className="movements-fieldset">
                                            <legend className="movements-legend">
                                                Rotación destino *
                                            </legend>
                                            {hasAssignedRotation && (
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                                    <button
                                                        type="button"
                                                        className="movements-alt-rot-btn"
                                                        onClick={() => {
                                                            setRotacionMode('misma');
                                                            handleSelectTargetRotacion(assignedRotId);
                                                        }}
                                                    >
                                                        Volver a su rotación
                                                    </button>
                                                </div>
                                            )}

                                            {rotaciones.length <= 6 ? (
                                                renderRadioCards({
                                                    options: rotaciones,
                                                    name: 'movements-rot-mobile',
                                                    selectedId: selectedTargetRotacionId,
                                                    singleColumn: rotaciones.length === 1,
                                                    onSelect: handleSelectTargetRotacion,
                                                })
                                            ) : (
                                                <select
                                                    id="movements-rot-mobile"
                                                    value={selectedTargetRotacionId}
                                                    onChange={(e) => handleSelectTargetRotacion(e.target.value)}
                                                    required
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <option value="">-- Seleccione Rotación --</option>
                                                    {rotaciones.map(r => (
                                                        <option key={r.id} value={r.id}>{r.nombre}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </fieldset>
                                    )}

                                    {/* Potrero Destino en tarjetas táctiles */}
                                    {selectedTargetRotacionId && (
                                        <fieldset className="movements-fieldset">
                                            <legend className="movements-legend">2. Potrero Destino *</legend>
                                            {availableTargetPotreros.length === 0 ? (
                                                <div style={{ padding: '14px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.16)', color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center' }}>
                                                    No hay otros potreros disponibles en esta rotación.
                                                </div>
                                            ) : availableTargetPotreros.length <= 16 ? (
                                                renderRadioCards({
                                                    options: availableTargetPotreros,
                                                    name: 'movements-potrero-mobile',
                                                    selectedId: selectedTargetPotreroId,
                                                    singleColumn: availableTargetPotreros.length <= 2,
                                                    onSelect: setSelectedTargetPotreroId,
                                                })
                                            ) : (
                                                <select
                                                    id="movements-potrero-mobile"
                                                    value={selectedTargetPotreroId}
                                                    onChange={(e) => setSelectedTargetPotreroId(e.target.value)}
                                                    required
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <option value="">-- Seleccione Potrero Destino --</option>
                                                    {availableTargetPotreros.map(p => (
                                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </fieldset>
                                    )}

                                    {selectedTargetPotreroId && (
                                        <>
                                            <div>
                                                <label htmlFor="movements-fecha" className="movements-field-label">
                                                    3. Fecha de Movimiento
                                                </label>
                                                <input
                                                    id="movements-fecha"
                                                    type="date"
                                                    value={fechaMovimiento}
                                                    onChange={e => setFechaMovimiento(e.target.value)}
                                                    required
                                                    style={{ marginBottom: 0 }}
                                                />
                                            </div>

                                            <button
                                                type="submit"
                                                className="movements-submit-btn"
                                                disabled={loading || !selectedTargetPotreroId || !selectedPotreradaId || !isAdminOrCowboy}
                                            >
                                                {loading ? 'Guardando...' : (
                                                    <>
                                                        <Save size={20} aria-hidden="true" />
                                                        <span>Registrar Movimiento</span>
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    ) : (
                        /* ==================== VISTA ESCRITORIO (> 768px) ==================== */
                        <>
                            <div style={{ position: 'relative' }}>
                                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Seleccionar Lote *</label>

                                {/* Custom Searchable Select */}
                                <div style={{ position: 'relative' }}>
                                    <button
                                        type="button"
                                        aria-expanded={showOptions}
                                        aria-haspopup="listbox"
                                        onClick={() => setShowOptions(!showOptions)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '12px 16px',
                                            backgroundColor: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '8px',
                                            minHeight: '48px',
                                            width: '100%',
                                            textTransform: 'none',
                                            letterSpacing: 'normal',
                                            fontWeight: 400,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <span style={{ color: selectedPotreradaId ? 'var(--text)' : 'var(--text-muted)' }}>
                                            {selectedLotObj ? selectedLotObj.nombre : '-- Seleccione --'}
                                        </span>
                                        <ChevronDown
                                            size={20}
                                            aria-hidden="true"
                                            style={{
                                                transform: showOptions ? 'rotate(180deg)' : 'none',
                                                transition: 'transform 0.2s',
                                                color: 'var(--text-muted)'
                                            }}
                                        />
                                    </button>

                                    {showOptions && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: '110%',
                                                left: 0,
                                                right: 0,
                                                backgroundColor: '#1E1E1E',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '12px',
                                                zIndex: 100,
                                                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                                overflow: 'hidden'
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Search size={16} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar lote..."
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                    autoFocus
                                                    style={{
                                                        backgroundColor: 'transparent',
                                                        border: 'none',
                                                        padding: '4px',
                                                        fontSize: '0.95rem',
                                                        margin: 0,
                                                        width: '100%'
                                                    }}
                                                />
                                            </div>
                                            <div role="listbox" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                {filteredPotreradas.map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={selectedPotreradaId === p.id}
                                                        onClick={() => {
                                                            setSelectedPotreradaId(p.id);
                                                            setShowOptions(false);
                                                            setSearchTerm('');
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            padding: '12px 16px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            border: 'none',
                                                            borderRadius: 0,
                                                            textTransform: 'none',
                                                            letterSpacing: 'normal',
                                                            fontWeight: 400,
                                                            backgroundColor: selectedPotreradaId === p.id ? 'rgba(var(--primary-rgb), 0.14)' : 'transparent',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedPotreradaId === p.id ? 'rgba(var(--primary-rgb), 0.14)' : 'transparent'}
                                                    >
                                                        <span style={{ color: selectedPotreradaId === p.id ? 'var(--primary-light)' : 'var(--text)' }}>{p.nombre}</span>
                                                        {selectedPotreradaId === p.id && <Check size={16} color="var(--primary)" aria-hidden="true" />}
                                                    </button>
                                                ))}
                                                {filteredPotreradas.length === 0 && (
                                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                        No se encontraron resultados
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!isAdminOrCowboy && <p style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '8px' }}>No tienes permisos para realizar movimientos.</p>}
                            </div>

                            {selectedPotreradaId && (
                                <>
                                    <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ubicación Actual</p>
                                                <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', color: 'var(--primary-light)', fontSize: '1.1rem' }}>
                                                    {currentPotrero ? currentPotrero.nombre : 'Sin potrero asignado'}
                                                </p>
                                            </div>
                                            {hasAssignedRotation && rotaciones.length > 1 && (
                                                <button
                                                    type="button"
                                                    className="movements-alt-rot-btn"
                                                    style={{ marginTop: 0 }}
                                                    onClick={() => {
                                                        if (rotacionMode === 'cambiar') {
                                                            setRotacionMode('misma');
                                                            handleSelectTargetRotacion(assignedRotId);
                                                        } else {
                                                            setRotacionMode('cambiar');
                                                            setSelectedTargetPotreroId('');
                                                        }
                                                    }}
                                                >
                                                    {rotacionMode === 'cambiar' ? 'Usar su rotación' : 'Cambiar de rotación'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {(!hasAssignedRotation || rotacionMode === 'cambiar') && (
                                        <div>
                                            <label htmlFor="movements-rot-desktop" className="movements-field-label">Seleccionar Rotación *</label>
                                            <select
                                                id="movements-rot-desktop"
                                                value={selectedTargetRotacionId}
                                                onChange={(e) => handleSelectTargetRotacion(e.target.value)}
                                                required
                                                style={{ marginBottom: 0 }}
                                            >
                                                <option value="">-- Seleccione Rotación --</option>
                                                {rotaciones.map(r => (
                                                    <option key={r.id} value={r.id}>{r.nombre}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {selectedTargetRotacionId && (
                                        <div>
                                            <label htmlFor="movements-potrero-desktop" className="movements-field-label">Potrero Destino *</label>
                                            <select
                                                id="movements-potrero-desktop"
                                                value={selectedTargetPotreroId}
                                                onChange={(e) => setSelectedTargetPotreroId(e.target.value)}
                                                required
                                                disabled={!targetRotacion || availableTargetPotreros.length === 0}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <option value="">-- Seleccione Potrero Destino --</option>
                                                {availableTargetPotreros.map(p => (
                                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {selectedTargetPotreroId && (
                                        <>
                                            <div>
                                                <label htmlFor="movements-fecha" className="movements-field-label">Fecha de Movimiento</label>
                                                <input
                                                    id="movements-fecha"
                                                    type="date"
                                                    value={fechaMovimiento}
                                                    onChange={e => setFechaMovimiento(e.target.value)}
                                                    required
                                                    style={{ marginBottom: 0 }}
                                                />
                                            </div>

                                            <button
                                                type="submit"
                                                disabled={loading || !selectedTargetPotreroId || !selectedPotreradaId || !isAdminOrCowboy}
                                                className="movements-submit-btn"
                                            >
                                                {loading ? 'Guardando...' : (
                                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                        <Save size={20} aria-hidden="true" /> Registrar Movimiento
                                                    </span>
                                                )}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </form>
            </div>

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
