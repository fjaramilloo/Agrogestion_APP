import { useEffect, useState } from 'react';
import { X, Trash2, Pencil, Check, MapPin } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../lib/supabase';
import { localDB } from '../../lib/db';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { recalcularHistorialPesajesAnimal } from '../../utils/gananciaRecalculator';
import { MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../../utils/decimalInput';
import {
    toDisplayValue,
    getUnidadLabel,
    getModoLabel,
    getGmpColor,
    calcularGmpUltimoPeriodo,
    calcularGmpAcumulado,
    esPesajePosteriorAIngreso,
    calcularPesoEstimadoHoy,
    type ModoGanancia
} from '../../utils/ganancia';
import type { Animal, Pesaje } from './types';

interface InventoryDetailModalProps {
    animal: Animal;
    fincaId: string | null;
    isAdmin: boolean;
    isMobile: boolean;
    modoGanancia: ModoGanancia;
    umbralAltoGmp: number;
    umbralMedioGmp: number;
    onClose: () => void;
    onAnimalUpdated: (animalId: string, patch: Partial<Animal>) => void;
    onAnimalDeleted: (animalId: string) => void;
}

interface TimelineItem {
    id: string;
    pesajeId?: string;
    fecha: string;
    peso: number;
    gmp: number;
    gdp: number;
    esIngreso: boolean;
}

export default function InventoryDetailModal({
    animal,
    fincaId,
    isAdmin,
    isMobile,
    modoGanancia,
    umbralAltoGmp,
    umbralMedioGmp,
    onClose,
    onAnimalUpdated,
    onAnimalDeleted
}: InventoryDetailModalProps) {
    const { confirmAction, showAlert } = useFeedback();
    const [saving, setSaving] = useState(false);

    // Edición de chapeta (Exclusivo Admin)
    const [isEditingChapeta, setIsEditingChapeta] = useState(false);
    const [editChapetaVal, setEditChapetaVal] = useState('');
    const [editChapetaError, setEditChapetaError] = useState('');
    const [validatingEditChapeta, setValidatingEditChapeta] = useState(false);
    const [isEditChapetaTaken, setIsEditChapetaTaken] = useState(false);

    // Edición de pesajes
    const [editingPesaje, setEditingPesaje] = useState<{ id: string; fecha: string; peso: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsEditingChapeta(false);
        setEditingPesaje(null);
        setEditChapetaError('');

        const fetchFullHistory = async () => {
            try {
                const { data: historial } = await supabase
                    .from('registros_pesaje')
                    .select('id, peso, fecha, gdp_calculada, gmp_calculada, potreros(nombre)')
                    .eq('id_animal', animal.id)
                    .or('is_deleted.is.null,is_deleted.eq.false')
                    .order('fecha', { ascending: false });

                if (!cancelled && historial) {
                    const unique = new Set<string>();
                    const dedup: Pesaje[] = historial
                        .filter((p: any) => {
                            const d = p.fecha.split('T')[0];
                            if (unique.has(d)) return false;
                            unique.add(d);
                            return true;
                        })
                        .map((p: any) => ({
                            id: p.id,
                            peso: p.peso,
                            fecha: p.fecha,
                            gdp_calculada: p.gdp_calculada,
                            gmp_calculada: p.gmp_calculada,
                            potreros: Array.isArray(p.potreros) ? (p.potreros[0] || null) : p.potreros
                        }));
                    onAnimalUpdated(animal.id, { registros_pesaje: dedup });
                }
            } catch {
                // Silencioso en modo offline; se mantiene el historial cacheado
            }
        };

        void fetchFullHistory();
        return () => {
            cancelled = true;
        };
    }, [animal.id]);

    const checkEditChapetaUnica = async (val: string) => {
        const target = val.trim();
        if (!target || !fincaId || target === animal.numero_chapeta) {
            setIsEditChapetaTaken(false);
            setEditChapetaError('');
            return;
        }
        setValidatingEditChapeta(true);
        try {
            const { data } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', target)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .neq('id', animal.id)
                .maybeSingle();

            if (data) {
                setIsEditChapetaTaken(true);
                setEditChapetaError(`La chapeta #${target} ya está en uso por otro animal en la finca.`);
            } else {
                setIsEditChapetaTaken(false);
                setEditChapetaError('');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setValidatingEditChapeta(false);
        }
    };

    const handleGuardarNuevaChapeta = async () => {
        if (!fincaId) return;
        const nueva = editChapetaVal.trim();
        if (!nueva) {
            setEditChapetaError('El número de chapeta no puede estar vacío.');
            return;
        }
        if (nueva === animal.numero_chapeta) {
            setIsEditingChapeta(false);
            return;
        }
        setSaving(true);
        try {
            const { data: existente } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', nueva)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .neq('id', animal.id)
                .maybeSingle();

            if (existente) {
                setEditChapetaError(`¡Error! Ya existe otro animal con la chapeta #${nueva}.`);
                setSaving(false);
                return;
            }

            const { error: errUpd } = await supabase
                .from('animales')
                .update({ numero_chapeta: nueva })
                .eq('id', animal.id);

            if (errUpd) throw errUpd;

            const userResp = await supabase.auth.getUser();
            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'animales',
                id_registro: animal.id,
                accion: 'update_chapeta',
                valores_previos: { numero_chapeta: animal.numero_chapeta },
                valores_nuevos: { numero_chapeta: nueva },
                usuario_id: userResp.data.user?.id
            });

            onAnimalUpdated(animal.id, { numero_chapeta: nueva });

            try {
                if (localDB?.animalesCache) {
                    await localDB.animalesCache.update(animal.id, { numero_chapeta: nueva });
                }
            } catch {}

            setIsEditingChapeta(false);
            setEditChapetaError('');
        } catch (err: any) {
            setEditChapetaError('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleEliminarAnimalPorError = async () => {
        if (!fincaId) return;
        const confirmed = await confirmAction(
            `¿Está seguro de eliminar permanentemente el animal #${animal.numero_chapeta} del inventario?\n\n⚠️ Esta acción es para corregir errores de digitación. Si el animal murió o se vendió, use las opciones correspondientes.`,
            { title: 'Eliminar animal', confirmLabel: 'Sí, eliminar', destructive: true }
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            const userResp = await supabase.auth.getUser();
            const userId = userResp.data.user?.id;

            const { error: errAnim } = await supabase
                .from('animales')
                .update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString(),
                    deleted_by: userId
                })
                .eq('id', animal.id);

            if (errAnim) throw errAnim;

            await supabase
                .from('registros_pesaje')
                .update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString(),
                    deleted_by: userId
                })
                .eq('id_animal', animal.id);

            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'animales',
                id_registro: animal.id,
                accion: 'delete_animal_error',
                valores_previos: { numero_chapeta: animal.numero_chapeta },
                usuario_id: userId
            });

            try {
                if (localDB?.animalesCache) {
                    await localDB.animalesCache.delete(animal.id);
                }
            } catch {}

            onAnimalDeleted(animal.id);
        } catch (err: any) {
            await showAlert('Error al eliminar animal: ' + (err.message || err), { title: 'Error', variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const recargarHistorialAnimal = async (animalId: string) => {
        const { data: historial } = await supabase
            .from('registros_pesaje')
            .select('id, peso, fecha, gdp_calculada, gmp_calculada, potreros(nombre)')
            .eq('id_animal', animalId)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .order('fecha', { ascending: false });

        if (historial) {
            const unique = new Set<string>();
            const dedup: Pesaje[] = historial
                .filter((p: any) => {
                    const d = p.fecha.split('T')[0];
                    if (unique.has(d)) return false;
                    unique.add(d);
                    return true;
                })
                .map((p: any) => ({
                    id: p.id,
                    peso: p.peso,
                    fecha: p.fecha,
                    gdp_calculada: p.gdp_calculada,
                    gmp_calculada: p.gmp_calculada,
                    potreros: Array.isArray(p.potreros) ? (p.potreros[0] || null) : p.potreros
                }));

            onAnimalUpdated(animalId, { registros_pesaje: dedup });
        }
    };

    const handleGuardarEdicionPesaje = async () => {
        if (!editingPesaje) return;
        const pesoNum = parseDecimalInput(editingPesaje.peso);
        if (isNaN(pesoNum) || pesoNum <= 0) {
            await showAlert('Por favor ingrese un peso numérico válido mayor a cero.', { title: 'Dato inválido', variant: 'warning' });
            return;
        }
        const fechaErr = getGanadoDateError(editingPesaje.fecha, 'La fecha del pesaje');
        if (fechaErr) {
            await showAlert(fechaErr, { title: 'Dato inválido', variant: 'warning' });
            return;
        }

        setSaving(true);
        try {
            const userResp = await supabase.auth.getUser();

            const { error: errUpd } = await supabase
                .from('registros_pesaje')
                .update({
                    peso: pesoNum,
                    fecha: editingPesaje.fecha,
                    modificado_by: userResp.data.user?.id,
                    fecha_modificacion: new Date().toISOString()
                })
                .eq('id', editingPesaje.id);

            if (errUpd) throw errUpd;

            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'registros_pesaje',
                id_registro: editingPesaje.id,
                accion: 'update_pesaje',
                valores_nuevos: { peso: pesoNum, fecha: editingPesaje.fecha },
                usuario_id: userResp.data.user?.id
            });

            await recalcularHistorialPesajesAnimal(animal.id, supabase);
            await recargarHistorialAnimal(animal.id);
            setEditingPesaje(null);
        } catch (err: any) {
            await showAlert('Error al guardar pesaje: ' + (err.message || err), { title: 'Error', variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleEliminarPesaje = async (pesajeId: string, fechaPesaje: string) => {
        const confirmed = await confirmAction(
            `¿Está seguro de eliminar el pesaje del ${fechaPesaje}? Las ganancias del siguiente pesaje y todos los posteriores se recalcularán automáticamente.`,
            { title: 'Eliminar pesaje', confirmLabel: 'Sí, eliminar', destructive: true }
        );
        if (!confirmed) return;

        setSaving(true);
        try {
            const userResp = await supabase.auth.getUser();

            const { error: errDel } = await supabase
                .from('registros_pesaje')
                .update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString(),
                    deleted_by: userResp.data.user?.id
                })
                .eq('id', pesajeId);

            if (errDel) throw errDel;

            await supabase.from('auditoria_cambios').insert({
                id_finca: fincaId,
                tabla: 'registros_pesaje',
                id_registro: pesajeId,
                accion: 'delete_pesaje',
                usuario_id: userResp.data.user?.id
            });

            await recalcularHistorialPesajesAnimal(animal.id, supabase);
            await recargarHistorialAnimal(animal.id);
        } catch (err: any) {
            await showAlert('Error al eliminar pesaje: ' + (err.message || err), { title: 'Error', variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const pesoBaseModal = animal.peso_ingreso ?? animal.peso_compra ?? 0;
    const fechaInicioModal = animal.fecha_ingreso;

    const pesajesPosteriores = (animal.registros_pesaje || []).filter(p =>
        esPesajePosteriorAIngreso(p.fecha, fechaInicioModal)
    );
    const ultimoP = pesajesPosteriores[0];
    const penultimoP = pesajesPosteriores[1];
    const fechaU = ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : format(new Date(fechaInicioModal), 'dd/MM/yyyy');
    const pesoU = ultimoP ? ultimoP.peso : pesoBaseModal;

    const gmpUltimoModal = calcularGmpUltimoPeriodo(ultimoP, fechaInicioModal, pesoBaseModal, penultimoP);
    const gmpHistoricoModal = calcularGmpAcumulado(ultimoP?.peso, pesoBaseModal, fechaInicioModal, ultimoP?.fecha);

    const estModal = calcularPesoEstimadoHoy(animal);
    const diasHoy = estModal.diasSinPesar;
    const estimadoHoy = estModal.pesoEstimado;
    const confianzaHoy = estModal.confianza;

    const timeline: TimelineItem[] = [
        ...pesajesPosteriores.map((p, i, arr) => {
            const ant = arr[i + 1] || { peso: pesoBaseModal, fecha: fechaInicioModal };
            const d = Math.max(1, differenceInDays(new Date(p.fecha.split('T')[0] + 'T12:00:00'), new Date(ant.fecha.split('T')[0] + 'T12:00:00')));
            const ganancia = p.peso - ant.peso;
            const gdp = (p.gdp_calculada !== null && p.gdp_calculada !== undefined && p.gdp_calculada !== 0) ? Number(p.gdp_calculada) : (ganancia / d);
            const gmp = (p.gmp_calculada !== null && p.gmp_calculada !== undefined && p.gmp_calculada !== 0) ? Number(p.gmp_calculada) : (gdp * 30);
            return {
                id: p.id || p.fecha,
                pesajeId: p.id,
                fecha: p.fecha,
                peso: p.peso,
                gmp: gmp,
                gdp: gdp,
                esIngreso: false
            };
        }),
        {
            id: animal.fecha_ingreso,
            pesajeId: undefined,
            fecha: animal.fecha_ingreso,
            peso: pesoBaseModal,
            gmp: 0,
            gdp: 0,
            esIngreso: true
        }
    ];

    const chartData = [...timeline].reverse().map(item => ({
        fechaStr: format(new Date(item.fecha), 'dd/MMM', { locale: es }),
        peso: item.peso
    }));

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card inventory-modal-card" style={{ maxWidth: '640px', backgroundColor: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-popover)' }} onClick={e => e.stopPropagation()}>

                {/* Modal Header: Title, badges, subtle actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        {!isEditingChapeta ? (
                            <h2 style={{
                                color: 'var(--text-main)',
                                margin: 0,
                                fontSize: isMobile ? '1.5rem' : '1.75rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                whiteSpace: 'nowrap',
                                letterSpacing: '-0.5px'
                            }}>
                                <span style={{ color: 'var(--primary)', marginRight: '4px', fontWeight: 800 }}>#</span>
                                <span style={{ whiteSpace: 'nowrap' }}>{animal.numero_chapeta}</span>
                            </h2>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.4rem' }}>#</span>
                                    <input
                                        type="text"
                                        aria-label="Nueva chapeta"
                                        value={editChapetaVal}
                                        onChange={e => {
                                            setEditChapetaVal(e.target.value);
                                            checkEditChapetaUnica(e.target.value);
                                        }}
                                        placeholder="Nueva chapeta"
                                        autoCorrect="off"
                                        autoCapitalize="characters"
                                        spellCheck={false}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '6px',
                                            border: isEditChapetaTaken ? '1px solid var(--error)' : '1px solid var(--primary)',
                                            backgroundColor: 'var(--bg-input)',
                                            color: 'var(--text-main)',
                                            fontSize: '1.1rem',
                                            fontWeight: 'bold',
                                            width: '140px',
                                            marginBottom: 0
                                        }}
                                        autoFocus={!isMobile}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleGuardarNuevaChapeta}
                                        disabled={saving || validatingEditChapeta || isEditChapetaTaken || !editChapetaVal.trim()}
                                        style={{
                                            width: 'auto',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            backgroundColor: 'var(--primary)',
                                            color: 'var(--on-primary)',
                                            border: 'none',
                                            cursor: (saving || validatingEditChapeta || isEditChapetaTaken || !editChapetaVal.trim()) ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.82rem',
                                            fontWeight: 600,
                                            minHeight: isMobile ? '44px' : undefined
                                        }}
                                    >
                                        <Check size={14} aria-hidden="true" />
                                        <span>Guardar</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="inventory-btn-ghost"
                                        onClick={() => { setIsEditingChapeta(false); setEditChapetaError(''); }}
                                        style={{
                                            padding: '8px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.82rem',
                                            minHeight: isMobile ? '44px' : undefined
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                                {validatingEditChapeta && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Validando si la chapeta ya existe...
                                    </div>
                                )}
                                {editChapetaError && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '4px', fontWeight: 500 }}>
                                        {editChapetaError}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Metadata Badges / Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                                backgroundColor: 'var(--success-soft-bg)',
                                color: 'var(--success)',
                                border: '1px solid var(--success-soft-border)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                {animal.etapa}
                            </span>

                            <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>•</span>

                            <span style={{ color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: 500 }}>
                                {animal.nombre_propietario}
                            </span>

                            {animal.especie && (
                                <>
                                    <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>•</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                                        {animal.especie} {animal.sexo ? `(${animal.sexo})` : ''}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right action buttons: Subtle Edit + Subtle Trash + Close */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {isAdmin && !isEditingChapeta && (
                            <button
                                type="button"
                                className="inventory-icon-btn inventory-icon-btn--edit"
                                onClick={() => {
                                    setIsEditingChapeta(true);
                                    setEditChapetaVal(animal.numero_chapeta);
                                    setEditChapetaError('');
                                    setIsEditChapetaTaken(false);
                                }}
                                title="Editar número de chapeta"
                                aria-label="Editar número de chapeta"
                            >
                                <Pencil size={16} aria-hidden="true" />
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                type="button"
                                className="inventory-icon-btn inventory-icon-btn--delete"
                                onClick={handleEliminarAnimalPorError}
                                title="Eliminar animal (por error de digitación)"
                                aria-label="Eliminar animal"
                            >
                                <Trash2 size={16} aria-hidden="true" />
                            </button>
                        )}
                        <button
                            type="button"
                            className="inventory-icon-btn inventory-icon-btn--close"
                            onClick={onClose}
                            title="Cerrar"
                            aria-label="Cerrar detalle del animal"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Location / Potrerada Bar */}
                <div style={{
                    backgroundColor: 'var(--surface-subtle)',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Potrerada Actual:</span>
                        <span style={{ fontWeight: '600', color: animal.id_potrerada ? 'var(--primary-light)' : 'var(--text-muted)', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <MapPin size={13} style={{ opacity: 0.8 }} aria-hidden="true" />
                            {animal.potreradaNombre || 'Sin potrerada'}
                        </span>
                    </div>
                    {animal.potreroNombre && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Potrero: <strong style={{ color: 'var(--text-main)' }}>{animal.potreroNombre}</strong>
                        </div>
                    )}
                </div>

                {/* Metric Cards */}
                <div className="inventory-detail-metrics" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px',
                    marginBottom: '28px'
                }}>
                    <div style={{ backgroundColor: 'var(--surface-subtle)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Último Pesaje</div>
                        <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{pesoU} kg</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--primary-light)', marginTop: '4px' }}>{ultimoP ? 'Pesaje: ' : 'Llegada: '} {fechaU}</div>
                    </div>
                    <div style={{ backgroundColor: 'var(--surface-subtle)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Última {getModoLabel(modoGanancia)}</div>
                        <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: getGmpColor(gmpUltimoModal, umbralMedioGmp, umbralAltoGmp) }}>
                            {gmpUltimoModal !== null ? `${toDisplayValue(gmpUltimoModal, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}` : 'Sin pesajes'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Histórica: <strong style={{ color: getGmpColor(gmpHistoricoModal, umbralMedioGmp, umbralAltoGmp) }}>
                                {gmpHistoricoModal !== null ? `${toDisplayValue(gmpHistoricoModal, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}` : 'N/A'}
                            </strong>
                        </div>
                    </div>
                    {animal.peso_compra && (
                        <div style={{ backgroundColor: 'var(--secondary-soft-bg)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--secondary-soft-border)' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Peso de Compra</div>
                            <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{Math.round(animal.peso_compra)} kg</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Llegada: {animal.peso_ingreso} kg</div>
                        </div>
                    )}
                    <div style={{ backgroundColor: 'var(--surface-subtle)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Peso Estimado (Hoy)</div>
                        <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', color: confianzaHoy === 'vencida' ? 'var(--warning)' : 'var(--primary-light)' }}>
                            {estimadoHoy.toFixed(1)} kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: confianzaHoy === 'vencida' ? 'var(--warning)' : 'var(--text-muted)', marginTop: '4px' }}>
                            {confianzaHoy === 'vencida'
                                ? `⚠️ Congelado (${diasHoy} d sin pesar)`
                                : (diasHoy > 0 ? `+${(estimadoHoy - pesoU).toFixed(1)} kg (${diasHoy} d)` : 'Calculado a la fecha')}
                        </div>
                    </div>
                </div>

                <h3 style={{ fontSize: '1.05rem', marginBottom: '12px', fontWeight: '600', color: 'var(--text-main)' }}>Evolución de Peso</h3>
                <div className="inventory-detail-chart" style={{ height: '240px', width: '100%', marginBottom: '28px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="fechaStr" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                            <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                            <RechartsTooltip
                                contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', boxShadow: 'var(--shadow-popover)', color: 'var(--text-main)' }}
                                itemStyle={{ color: 'var(--primary-light)' }}
                                labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                            />
                            <Line type="monotone" dataKey="peso" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary-light)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: 'var(--primary)', stroke: 'var(--bg-card)', strokeWidth: 2 }} name="Peso (kg)" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <h3 style={{ fontSize: '1.05rem', marginBottom: '12px', fontWeight: '600', color: 'var(--text-main)' }}>Historial de Registros</h3>
                <div className="inventory-history-wrap" style={{ overflowX: 'auto', backgroundColor: 'var(--surface-inset)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <table className="inventory-history-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: 'var(--surface-subtle)' }}>
                            <tr>
                                <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fecha</th>
                                <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Peso (kg)</th>
                                <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {modoGanancia === 'GDP' ? 'Ganancia Diaria' : 'Ganancia Mensual'}
                                </th>
                                {isAdmin && <th scope="col" style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {timeline.map((item, index) => {
                                const isEditingThis = Boolean(editingPesaje && item.pesajeId && editingPesaje.id === item.pesajeId);
                                if (isEditingThis && editingPesaje) {
                                    return (
                                        <tr key={index} className="is-editing" style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--success-soft-bg)' }}>
                                            <td colSpan={4} style={{ padding: '14px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                                                    <div style={{ flex: '1 1 130px' }}>
                                                        <label htmlFor={`hist-edit-date-${index}`} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Fecha Pesaje</label>
                                                        <input
                                                            id={`hist-edit-date-${index}`}
                                                            type="date"
                                                            min={MIN_GANADO_DATE}
                                                            value={editingPesaje.fecha}
                                                            onChange={e => setEditingPesaje(prev => prev ? { ...prev, fecha: e.target.value } : null)}
                                                            style={{ padding: '6px 10px', marginBottom: 0, borderRadius: '6px', border: '1px solid var(--primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                                        />
                                                    </div>
                                                    <div style={{ flex: '1 1 100px' }}>
                                                        <label htmlFor={`hist-edit-peso-${index}`} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Peso (kg)</label>
                                                        <input
                                                            id={`hist-edit-peso-${index}`}
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={editingPesaje.peso}
                                                            onChange={e => setEditingPesaje(prev => prev ? { ...prev, peso: sanitizeDecimalInput(e.target.value) } : null)}
                                                            style={{ width: isMobile ? '100%' : '100px', marginBottom: 0, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px', flex: isMobile ? '1 1 100%' : undefined }}>
                                                        <button
                                                            type="button"
                                                            onClick={handleGuardarEdicionPesaje}
                                                            disabled={saving}
                                                            style={{ padding: '7px 14px', minHeight: isMobile ? '44px' : undefined, flex: isMobile ? 1 : undefined, borderRadius: '6px', backgroundColor: 'var(--primary)', border: 'none', color: 'var(--on-primary)', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                        >
                                                            <Check size={14} aria-hidden="true" /> Guardar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inventory-btn-ghost"
                                                            onClick={() => setEditingPesaje(null)}
                                                            style={{ padding: '7px 12px', minHeight: isMobile ? '44px' : undefined, flex: isMobile ? 1 : undefined, borderRadius: '6px', fontSize: '0.82rem' }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--primary-light)', marginTop: '8px' }}>
                                                    ℹ️ Al guardar, se recalculará automáticamente la GDP del pesaje siguiente y todos los posteriores.
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={index} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="inventory-hist-fecha" style={{ padding: '12px 16px' }}>
                                            <div style={{ fontWeight: '500' }}>{format(new Date(item.fecha), 'dd/MM/yyyy')}</div>
                                            {item.esIngreso && <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 'bold' }}>INGRESO</div>}
                                        </td>
                                        <td className="inventory-hist-peso" style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                                            {item.peso}
                                        </td>
                                        <td className="inventory-hist-gmp" style={{ padding: '12px 16px' }}>
                                            {item.esIngreso ? (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                                            ) : (
                                                <div style={{
                                                    color: getGmpColor(item.gmp, umbralMedioGmp, umbralAltoGmp),
                                                    fontWeight: 'bold'
                                                }}>
                                                    {item.gmp > 0 ? '+' : ''}{toDisplayValue(item.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} {getUnidadLabel(modoGanancia)}
                                                </div>
                                            )}
                                        </td>
                                        {isAdmin && (
                                            <td className="inventory-hist-actions" style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                {item.esIngreso || !item.pesajeId ? (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>Base</span>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                        <button
                                                            type="button"
                                                            className="inventory-history-action-btn"
                                                            onClick={() => setEditingPesaje({ id: item.pesajeId!, fecha: item.fecha.split('T')[0], peso: item.peso.toString() })}
                                                            title="Editar este pesaje"
                                                            aria-label={`Editar pesaje del ${format(new Date(item.fecha), 'dd/MM/yyyy')}`}
                                                            style={{ backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-strong)', color: 'var(--primary-light)' }}
                                                        >
                                                            <Pencil size={14} aria-hidden="true" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inventory-history-action-btn"
                                                            onClick={() => handleEliminarPesaje(item.pesajeId!, format(new Date(item.fecha), 'dd/MM/yyyy'))}
                                                            title="Eliminar este pesaje"
                                                            aria-label={`Eliminar pesaje del ${format(new Date(item.fecha), 'dd/MM/yyyy')}`}
                                                            style={{ backgroundColor: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)' }}
                                                        >
                                                            <Trash2 size={14} aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
