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
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const rotacionesRef = useRef(rotaciones);
    rotacionesRef.current = rotaciones;

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        if (!showOptions) return;

        const handlePointerDown = (e: PointerEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowOptions(false);
                setSearchTerm('');
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowOptions(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showOptions]);

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

    return (
        <div className="page-container movements-page">
            <h1 className="title movements-title">
                <ArrowLeftRight size={isMobile ? 26 : 32} aria-hidden="true" /> Rotación de Lotes
            </h1>

            {isBloqueado && (
                <div style={{
                    background: 'var(--error-soft-bg)',
                    border: '1px solid var(--error-soft-border)',
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
                        <AlertOctagon size={24} color="var(--error)" style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {isVencida ? (
                                <>
                                    <strong>Modo Solo Lectura (Licencia Vencida):</strong> Tu suscripción al Plan <strong style={{ textTransform: 'uppercase' }}>{licenciaInfo?.licencia}</strong> ha expirado. Para registrar rotaciones y movimientos de potrero, renueva tu suscripción.
                                </>
                            ) : (
                                <>
                                    <strong>Modo Solo Lectura (Sobrecupo):</strong> Tu hato cuenta con <strong style={{ color: 'var(--error)' }}>{licenciaInfo?.totalAnimalesOrganizacion} animales</strong> (límite del plan: <strong>{licenciaInfo?.limiteAnimales}</strong>). Para registrar rotaciones de potrero, actualiza tu suscripción.
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
                            backgroundColor: 'var(--error)',
                            color: 'var(--on-primary)',
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
                <form onSubmit={handleSaveMovement} className="movements-form">
                    <div ref={dropdownRef} className="movements-field-group">
                        <label htmlFor="movements-lot-trigger" className="movements-field-label">
                            Seleccionar Lote *
                        </label>

                        <div style={{ position: 'relative' }}>
                            <button
                                id="movements-lot-trigger"
                                type="button"
                                className="movements-dropdown-trigger"
                                aria-expanded={showOptions}
                                aria-haspopup="listbox"
                                aria-controls="movements-lot-listbox"
                                onClick={() => setShowOptions(prev => !prev)}
                            >
                                <span style={{ color: selectedPotreradaId ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedLotObj ? selectedLotObj.nombre : '-- Seleccione --'}
                                </span>
                                <ChevronDown
                                    size={20}
                                    aria-hidden="true"
                                    style={{
                                        transform: showOptions ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 0.2s',
                                        color: 'var(--text-muted)',
                                        flexShrink: 0
                                    }}
                                />
                            </button>

                            {showOptions && (
                                <div className="movements-dropdown-panel">
                                    <search className="movements-dropdown-search" role="search">
                                        <Search size={16} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                        <input
                                            type="search"
                                            className="movements-dropdown-search-input"
                                            placeholder="Buscar lote..."
                                            aria-label="Buscar lote"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            autoFocus={!isMobile}
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
                                                <X size={16} aria-hidden="true" />
                                            </button>
                                        )}
                                    </search>

                                    <div id="movements-lot-listbox" role="listbox" className="movements-dropdown-list">
                                        {filteredPotreradas.map(p => {
                                            const isSelected = selectedPotreradaId === p.id;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    role="option"
                                                    aria-selected={isSelected}
                                                    className={`movements-dropdown-option${isSelected ? ' is-selected' : ''}`}
                                                    onClick={() => {
                                                        setSelectedPotreradaId(p.id);
                                                        setShowOptions(false);
                                                        setSearchTerm('');
                                                    }}
                                                >
                                                    <span>{p.nombre}</span>
                                                    {isSelected && <Check size={16} color="var(--primary)" aria-hidden="true" />}
                                                </button>
                                            );
                                        })}
                                        {filteredPotreradas.length === 0 && (
                                            <div className="movements-dropdown-empty">
                                                No se encontraron resultados
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {!isAdminOrCowboy && (
                            <p style={{ fontSize: '0.84rem', color: 'var(--error)', marginTop: '8px', marginBottom: 0 }}>
                                No tienes permisos para realizar movimientos.
                            </p>
                        )}
                    </div>

                    {selectedPotreradaId && (
                        <>
                            <div className="movements-status-card">
                                <div className="movements-status-row">
                                    <div>
                                        <p className="movements-status-eyebrow">Ubicación Actual</p>
                                        <p className="movements-status-potrero">
                                            {currentPotrero ? currentPotrero.nombre : 'Sin potrero asignado'}
                                        </p>
                                        {hasAssignedRotation && rotacionMode !== 'cambiar' && targetRotacion && (
                                            <p className="movements-status-rot">
                                                Rotación: {targetRotacion.nombre}
                                            </p>
                                        )}
                                    </div>
                                    {hasAssignedRotation && rotaciones.length > 1 && (
                                        <button
                                            type="button"
                                            className="movements-alt-rot-btn"
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
                                    <label htmlFor="movements-rot" className="movements-field-label">
                                        Seleccionar Rotación *
                                    </label>
                                    <select
                                        id="movements-rot"
                                        name="id_rotacion"
                                        className="movements-select"
                                        value={selectedTargetRotacionId}
                                        onChange={(e) => handleSelectTargetRotacion(e.target.value)}
                                        required
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
                                    <label htmlFor="movements-potrero" className="movements-field-label">
                                        Potrero Destino *
                                    </label>
                                    <select
                                        id="movements-potrero"
                                        name="id_potrero"
                                        className="movements-select"
                                        value={selectedTargetPotreroId}
                                        onChange={(e) => setSelectedTargetPotreroId(e.target.value)}
                                        required
                                        disabled={!targetRotacion || availableTargetPotreros.length === 0}
                                    >
                                        <option value="">
                                            {availableTargetPotreros.length === 0
                                                ? '-- No hay otros potreros disponibles --'
                                                : '-- Seleccione Potrero Destino --'}
                                        </option>
                                        {availableTargetPotreros.map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {selectedTargetPotreroId && (
                                <>
                                    <div>
                                        <label htmlFor="movements-fecha" className="movements-field-label">
                                            Fecha de Movimiento
                                        </label>
                                        <input
                                            id="movements-fecha"
                                            name="fecha_entrada"
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
