import { useCallback, useEffect, useState } from 'react';
import { CloudRain, Droplets, TrendingUp, CheckCircle2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { useModalDialog } from '../../hooks/useModalDialog';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../../utils/decimalInput';
import {
    calcularMilimetrosRegistro,
    obtenerUltimaLecturaAcumulada,
    type PluviometroFinca,
    type RegistroLluviaRaw
} from '../../utils/rainfallUtils';

interface RainfallRegisterModalProps {
    isOpen: boolean;
    initialFecha?: string;
    fincaId: string | null;
    pluviometrosActivos: PluviometroFinca[];
    registrosRaw: RegistroLluviaRaw[];
    accentPurple: string;
    isMobile: boolean;
    onClose: () => void;
    onSaved: () => Promise<void>;
}

export default function RainfallRegisterModal({
    isOpen,
    initialFecha,
    fincaId,
    pluviometrosActivos,
    registrosRaw,
    accentPurple,
    isMobile,
    onClose,
    onSaved
}: RainfallRegisterModalProps) {
    const { toast } = useFeedback();

    const [fecha, setFecha] = useState(getLocalIsoDate());
    const [modoEntrada, setModoEntrada] = useState<'diaria' | 'acumulada'>('diaria');
    const [valorEntrada, setValorEntrada] = useState('');
    const [reiniciarLegacy, setReiniciarLegacy] = useState(false);
    const [valoresPorPluv, setValoresPorPluv] = useState<Record<string, string>>({});
    const [editandoPluv, setEditandoPluv] = useState<Record<string, boolean>>({});
    const [reiniciarPorPluv, setReiniciarPorPluv] = useState<Record<string, boolean>>({});
    const [notas, setNotas] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setFecha(initialFecha || getLocalIsoDate());
        setValorEntrada('');
        setReiniciarLegacy(false);
        setValoresPorPluv({});
        setEditandoPluv({});
        setReiniciarPorPluv({});
        setNotas('');
        setError('');
    }, [isOpen, initialFecha]);

    const closeRegistroModal = useCallback(() => {
        if (!saving) onClose();
    }, [saving, onClose]);

    const registroDialogProps = useModalDialog(isOpen, closeRegistroModal, true, saving);

    const handleChangeFechaModal = (nuevaFecha: string) => {
        setFecha(nuevaFecha);
        setValoresPorPluv({});
        setEditandoPluv({});
        setReiniciarPorPluv({});
        setError('');
    };

    const handleGuardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;
        setSaving(true);
        setError('');
        try {
            const dateError = getGanadoDateError(fecha, 'La fecha del registro');
            if (dateError) {
                throw new Error(dateError);
            }
            const notasFinal = notas.trim() || null;

            if (pluviometrosActivos.length === 0) {
                const valorNum = parseDecimalInput(valorEntrada);
                if (!valorEntrada.trim() || isNaN(valorNum)) {
                    throw new Error('Ingresa una lectura numérica válida de lluvia.');
                }
                const calc = calcularMilimetrosRegistro({
                    modo: modoEntrada,
                    valorNum,
                    fecha,
                    registros: registrosRaw,
                    idPluviometro: null,
                    reiniciarContador: reiniciarLegacy,
                });

                const { error: insertErr } = await supabase
                    .from('registros_lluvia')
                    .insert({
                        id_finca: fincaId,
                        fecha,
                        lectura_acumulada: calc.lectura_acumulada,
                        milimetros: calc.milimetros,
                        tipo_medicion: calc.tipo_medicion,
                        notas: notasFinal,
                    });
                if (insertErr) throw insertErr;
            } else {
                const inserts: any[] = [];
                const updates: { id: string; payload: any }[] = [];

                for (const pluv of pluviometrosActivos) {
                    const existente = registrosRaw.find(
                        r => String(r.fecha).split('T')[0] === fecha && r.id_pluviometro === pluv.id
                    );
                    const enEdicion = Boolean(editandoPluv[pluv.id]);
                    if (existente && !enEdicion) continue;

                    const valStr = (valoresPorPluv[pluv.id] || '').trim();
                    if (!valStr) continue;

                    const valorNum = parseDecimalInput(valStr);
                    if (isNaN(valorNum)) {
                        throw new Error(`Ingresa una lectura numérica válida para ${pluv.nombre}.`);
                    }
                    const calc = calcularMilimetrosRegistro({
                        modo: pluv.tipo_medicion,
                        valorNum,
                        fecha,
                        registros: registrosRaw,
                        idPluviometro: pluv.id,
                        excluirId: existente?.id ?? null,
                        reiniciarContador: Boolean(reiniciarPorPluv[pluv.id]),
                    });

                    if (existente?.id) {
                        updates.push({
                            id: existente.id,
                            payload: {
                                lectura_acumulada: calc.lectura_acumulada,
                                milimetros: calc.milimetros,
                                tipo_medicion: calc.tipo_medicion,
                                ...(notasFinal !== null ? { notas: notasFinal } : {}),
                            },
                        });
                    } else {
                        inserts.push({
                            id_finca: fincaId,
                            id_pluviometro: pluv.id,
                            fecha,
                            lectura_acumulada: calc.lectura_acumulada,
                            milimetros: calc.milimetros,
                            tipo_medicion: calc.tipo_medicion,
                            notas: notasFinal,
                        });
                    }
                }

                if (inserts.length === 0 && updates.length === 0) {
                    throw new Error('Ingresa al menos una lectura para guardar.');
                }

                if (inserts.length > 0) {
                    const { error: insertErr } = await supabase
                        .from('registros_lluvia')
                        .insert(inserts);
                    if (insertErr) throw insertErr;
                }

                for (const upd of updates) {
                    const { error: updErr } = await supabase
                        .from('registros_lluvia')
                        .update(upd.payload)
                        .eq('id', upd.id);
                    if (updErr) throw updErr;
                }
            }

            onClose();
            setValorEntrada('');
            setValoresPorPluv({});
            setEditandoPluv({});
            setReiniciarPorPluv({});
            setReiniciarLegacy(false);
            setNotas('');

            await onSaved();
            toast('Registro de lluvia guardado.', 'success');
        } catch (err: any) {
            setError(err.message || 'Error al guardar el registro');
        } finally {
            setSaving(false);
        }
    };

    return (
        <dialog
            {...registroDialogProps}
            className={`rainfall-dialog ${pluviometrosActivos.length < 2 ? 'rainfall-dialog--narrow' : ''}`}
            aria-labelledby="rainfall-registro-title"
        >
            {isOpen && (
                <div className="card rainfall-dialog-card">
                    <div className="rainfall-dialog-header">
                        <h2 id="rainfall-registro-title" style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <CloudRain size={22} color="var(--primary-light)" aria-hidden="true" />
                            Registrar Lluvia
                        </h2>
                        <button
                            type="button"
                            className="rainfall-dialog-close"
                            aria-label="Cerrar formulario de lluvia"
                            onClick={closeRegistroModal}
                            disabled={saving}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                    <form onSubmit={handleGuardar}>
                        {/* Fecha */}
                        <div style={{ marginBottom: '16px' }}>
                            <label htmlFor="rainfall-fecha-input" style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Fecha</label>
                            <input id="rainfall-fecha-input" type="date" min={MIN_GANADO_DATE} className="input-field" value={fecha} onChange={e => handleChangeFechaModal(e.target.value)} required />
                        </div>

                        {pluviometrosActivos.length === 0 ? (
                            <>
                                {/* Modo clásico sin pluviómetros configurados en Ajustes */}
                                <div style={{ marginBottom: '18px' }}>
                                    <span id="rainfall-tipo-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Tipo de Medición
                                    </span>
                                    <div role="group" aria-labelledby="rainfall-tipo-label" className="rainfall-mode-switch">
                                        <button
                                            type="button"
                                            aria-pressed={modoEntrada === 'diaria'}
                                            onClick={() => { setModoEntrada('diaria'); setError(''); }}
                                            className="rainfall-mode-btn"
                                            style={{
                                                border: modoEntrada === 'diaria' ? '1px solid var(--info)' : '1px solid transparent',
                                                background: modoEntrada === 'diaria' ? 'var(--info-soft-bg)' : 'transparent',
                                                color: modoEntrada === 'diaria' ? 'var(--info)' : 'var(--text-muted)',
                                                fontWeight: modoEntrada === 'diaria' ? 600 : 400,
                                            }}
                                        >
                                            <Droplets size={15} color={modoEntrada === 'diaria' ? 'var(--info)' : 'var(--text-muted)'} aria-hidden="true" />
                                            Lluvia del Día
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={modoEntrada === 'acumulada'}
                                            onClick={() => { setModoEntrada('acumulada'); setError(''); }}
                                            className="rainfall-mode-btn"
                                            style={{
                                                border: modoEntrada === 'acumulada' ? `1px solid ${accentPurple}` : '1px solid transparent',
                                                background: modoEntrada === 'acumulada' ? 'rgba(168,85,247,0.14)' : 'transparent',
                                                color: modoEntrada === 'acumulada' ? accentPurple : 'var(--text-muted)',
                                                fontWeight: modoEntrada === 'acumulada' ? 600 : 400,
                                            }}
                                        >
                                            <TrendingUp size={15} color={modoEntrada === 'acumulada' ? accentPurple : 'var(--text-muted)'} aria-hidden="true" />
                                            Acumulada Digital
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '18px' }}>
                                    <label htmlFor="rainfall-valor-input" style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>
                                        {modoEntrada === 'diaria' ? 'Lluvia caída hoy (mm)' : 'Lectura acumulada del pluviómetro (mm)'}
                                    </label>
                                    <input
                                        id="rainfall-valor-input"
                                        type="text"
                                        inputMode="decimal"
                                        className="input-field"
                                        placeholder={modoEntrada === 'diaria' ? "Ej: 18,5" : "Ej: 1520,5"}
                                        value={valorEntrada}
                                        onChange={e => setValorEntrada(sanitizeDecimalInput(e.target.value))}
                                        required
                                        autoFocus={!isMobile}
                                    />
                                    <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                        {modoEntrada === 'diaria'
                                            ? '💧 Pluviómetro manual / probeta: ingresa directamente los mm caídos.'
                                            : (() => {
                                                const prev = obtenerUltimaLecturaAcumulada(registrosRaw, fecha, null);
                                                return prev !== null
                                                    ? `📟 Última lectura acumulada: ${prev} mm. El sistema calculará la diferencia.`
                                                    : '📟 Pluviómetro digital: ingresa la lectura acumulada actual.';
                                            })()}
                                    </p>
                                    {modoEntrada === 'acumulada' && obtenerUltimaLecturaAcumulada(registrosRaw, fecha, null) !== null && (
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={reiniciarLegacy}
                                                onChange={e => setReiniciarLegacy(e.target.checked)}
                                                style={{ width: 'auto', margin: 0 }}
                                            />
                                            El pluviómetro se reinició a 0 desde la última lectura
                                        </label>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Opción A: Tarjetas juntas por cada pluviómetro configurado por el admin */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                                {pluviometrosActivos.length >= 2 && (
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                        Puedes registrar ambos ahora o llenar uno y dejar el otro pendiente para más tarde.
                                    </p>
                                )}
                                {pluviometrosActivos.map((pluv, idx) => {
                                    const existente = registrosRaw.find(
                                        r => String(r.fecha).split('T')[0] === fecha && r.id_pluviometro === pluv.id
                                    );
                                    const enEdicion = Boolean(editandoPluv[pluv.id]);
                                    const esAcum = pluv.tipo_medicion === 'acumulada';
                                    const prevAcum = esAcum
                                        ? obtenerUltimaLecturaAcumulada(registrosRaw, fecha, pluv.id, existente?.id ?? null)
                                        : null;

                                    return (
                                        <div
                                            key={pluv.id}
                                            style={{
                                                padding: '14px',
                                                borderRadius: '10px',
                                                background: existente && !enEdicion ? 'var(--success-soft-bg)' : 'var(--surface-subtle)',
                                                border: `1px solid ${existente && !enEdicion ? 'var(--success-soft-border)' : 'var(--border-subtle)'}`,
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: existente && !enEdicion ? '8px' : '10px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.92rem' }}>
                                                    📍 {pluv.nombre}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    background: esAcum ? 'rgba(168,85,247,0.14)' : 'var(--info-soft-bg)',
                                                    color: esAcum ? accentPurple : 'var(--info)',
                                                    border: `1px solid ${esAcum ? 'rgba(168,85,247,0.35)' : 'var(--info-soft-border)'}`,
                                                }}>
                                                    {esAcum ? '📟 Acumulada Digital' : '💧 Lluvia del Día'}
                                                </span>
                                            </div>

                                            {existente && !enEdicion ? (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>
                                                        <CheckCircle2 size={16} aria-hidden="true" />
                                                        <span>
                                                            Ya registrado: {existente.milimetros} mm
                                                            {existente.lectura_acumulada != null ? ` (lectura: ${existente.lectura_acumulada} mm)` : ''}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditandoPluv(prev => ({ ...prev, [pluv.id]: true }));
                                                            const valorPrevio = esAcum && existente.lectura_acumulada != null
                                                                ? String(existente.lectura_acumulada)
                                                                : String(existente.milimetros);
                                                            setValoresPorPluv(prev => ({ ...prev, [pluv.id]: valorPrevio }));
                                                            if (!notas && existente.notas) setNotas(existente.notas);
                                                        }}
                                                        className="rainfall-pluv-edit-btn"
                                                    >
                                                        Editar
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="input-field"
                                                        aria-label={`Lectura para ${pluv.nombre}`}
                                                        placeholder={esAcum ? 'Lectura acumulada (ej: 1520,5)' : 'Milímetros caídos (ej: 18,5)'}
                                                        value={valoresPorPluv[pluv.id] || ''}
                                                        onChange={e => setValoresPorPluv(prev => ({ ...prev, [pluv.id]: sanitizeDecimalInput(e.target.value) }))}
                                                        style={{ marginBottom: '6px' }}
                                                        autoFocus={!isMobile && idx === 0}
                                                    />
                                                    {esAcum && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                                {prevAcum !== null
                                                                    ? `Última lectura anterior: ${prevAcum} mm`
                                                                    : 'Primera lectura acumulada de este pluviómetro'}
                                                            </p>
                                                            {prevAcum !== null && (
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={Boolean(reiniciarPorPluv[pluv.id])}
                                                                        onChange={e => setReiniciarPorPluv(prev => ({ ...prev, [pluv.id]: e.target.checked }))}
                                                                        style={{ width: 'auto', margin: 0 }}
                                                                    />
                                                                    Contador reiniciado a 0
                                                                </label>
                                                            )}
                                                        </div>
                                                    )}
                                                    {enEdicion && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditandoPluv(prev => ({ ...prev, [pluv.id]: false }));
                                                                setValoresPorPluv(prev => ({ ...prev, [pluv.id]: '' }));
                                                            }}
                                                            className="rainfall-pluv-cancel-btn"
                                                        >
                                                            Cancelar edición
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Notas */}
                        <div style={{ marginBottom: '20px' }}>
                            <label htmlFor="rainfall-notas-input" style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Notas (Opcional)</label>
                            <textarea
                                id="rainfall-notas-input"
                                className="input-field"
                                placeholder="Ej: Aguacero fuerte en la tarde"
                                value={notas}
                                onChange={e => setNotas(e.target.value)}
                                rows={2}
                                style={{ resize: 'none', marginBottom: 0 }}
                            />
                        </div>

                        {error && (
                            <p role="alert" style={{ color: 'var(--error)', marginBottom: '16px', fontSize: '0.9rem', background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', padding: '10px', borderRadius: '8px' }}>
                                {error}
                            </p>
                        )}
                        <div className="rainfall-dialog-actions">
                            <button type="button" className="rainfall-btn-secondary" onClick={closeRegistroModal} disabled={saving}>
                                Cancelar
                            </button>
                            <button type="submit" className="btn btn-primary rainfall-btn-primary" disabled={saving}>
                                {saving ? 'Guardando...' : 'Guardar Registro'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </dialog>
    );
}
