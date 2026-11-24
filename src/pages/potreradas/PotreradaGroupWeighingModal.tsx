import { useState } from 'react';
import { Scale, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../../utils/decimalInput';
import { calcularDiasEntreFechas } from '../../utils/ganancia';
import { recalcularHistorialPesajesAnimal } from '../../utils/gananciaRecalculator';
import type { PotreradaDetailData } from './types';

interface PotreradaGroupWeighingModalProps {
    detailData: PotreradaDetailData;
    pesoEntradaCeba: number;
    isMobile: boolean;
    isBloqueado: boolean;
    onShowUpsell: () => void;
    onClose: () => void;
    onSaved: () => Promise<void>;
}

export default function PotreradaGroupWeighingModal({
    detailData,
    pesoEntradaCeba,
    isMobile,
    isBloqueado,
    onShowUpsell,
    onClose,
    onSaved
}: PotreradaGroupWeighingModalProps) {
    const { showAlert, toast } = useFeedback();
    const [weighingData, setWeighingData] = useState<{ [animalId: string]: string }>(() => {
        const initial: { [id: string]: string } = {};
        detailData.animales.forEach(a => { initial[a.id] = ''; });
        return initial;
    });
    const [savingWeighings, setSavingWeighings] = useState(false);
    const [weighingDate, setWeighingDate] = useState(getLocalIsoDate());

    const handleSaveWeighings = async () => {
        const dateError = getGanadoDateError(weighingDate, 'La fecha del pesaje');
        if (dateError) {
            await showAlert(dateError, { title: 'Dato inválido', variant: 'warning' });
            return;
        }
        const etapa = detailData.potrerada.etapa === 'cría' ? 'cria' : detailData.potrerada.etapa;
        const idsOkCeba: string[] = [];
        const backdatedIds: string[] = [];
        const duplicatedTags: string[] = [];

        const activosLote = detailData.animales.filter(a => !a.estado || a.estado === 'activo');
        for (const a of activosLote) {
            const val = parseDecimalInput(weighingData[a.id]);
            if (!isNaN(val) && val > 0 && a.fechaUltimoPesaje) {
                const fUlt = a.fechaUltimoPesaje.split('T')[0];
                if (fUlt === weighingDate) {
                    duplicatedTags.push(`#${a.numero_chapeta}`);
                }
            }
        }
        if (duplicatedTags.length > 0) {
            await showAlert(
                `Ya existe un pesaje registrado en la fecha ${weighingDate} para: ${duplicatedTags.join(', ')}.`,
                { title: 'Pesaje duplicado', variant: 'warning' }
            );
            return;
        }

        const registros = activosLote
            .filter(a => {
                const val = parseDecimalInput(weighingData[a.id]);
                return !isNaN(val) && val > 0;
            })
            .map(a => {
                const newPeso = Math.round(parseDecimalInput(weighingData[a.id]));
                let gdp: number | null = null;
                let gmp: number | null = null;

                if (a.pesoActual && a.fechaUltimoPesaje) {
                    const days = calcularDiasEntreFechas(a.fechaUltimoPesaje, weighingDate);

                    if (days > 0) {
                        gdp = (newPeso - a.pesoActual) / days;
                        gmp = gdp * 30;
                    } else if (days < 0) {
                        backdatedIds.push(a.id);
                    }
                }

                if (etapa === 'levante' && newPeso >= pesoEntradaCeba) {
                    idsOkCeba.push(a.id);
                }

                return {
                    id_animal: a.id,
                    peso: newPeso,
                    fecha: weighingDate,
                    etapa,
                    id_potrero: null,
                    gdp_calculada: gdp,
                    gmp_calculada: gmp
                };
            });

        if (registros.length === 0) {
            await showAlert('Ingresa al menos un peso para guardar.', { title: 'Sin datos', variant: 'warning' });
            return;
        }

        if (isBloqueado) {
            onShowUpsell();
            return;
        }

        setSavingWeighings(true);
        try {
            const { error } = await supabase
                .from('registros_pesaje')
                .insert(registros);

            if (error) throw error;

            if (idsOkCeba.length > 0) {
                const { error: errCeba } = await supabase
                    .from('animales')
                    .update({ ok_ceba: true })
                    .in('id', idsOkCeba);
                if (errCeba) throw errCeba;
            }

            if (backdatedIds.length > 0) {
                for (const animId of backdatedIds) {
                    await recalcularHistorialPesajesAnimal(animId, supabase);
                }
            }

            await onSaved();
            toast(
                `✅ ${registros.length} pesaje(s) guardado(s) correctamente.${idsOkCeba.length > 0 ? ` ${idsOkCeba.length} animal(es) pasaron al Mercado de Ceba.` : ''}`,
                'success'
            );
        } catch (err: any) {
            await showAlert('Error al guardar pesajes: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setSavingWeighings(false);
        }
    };

    const filled = Object.values(weighingData).filter(v => {
        const n = parseDecimalInput(v);
        return !isNaN(n) && n > 0;
    }).length;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card modal-content" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
                <div className="potreradas-modal-header">
                    <div className="potreradas-modal-header-top">
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{ margin: '0 0 6px 0', color: 'var(--primary-light)', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Scale size={20} aria-hidden="true" /> Nuevo Pesaje
                            </h2>
                            <div className="potreradas-weighing-meta">
                                <span>{detailData.potrerada.nombre}</span>
                                <span aria-hidden="true">·</span>
                                <label htmlFor="potreradas-group-weighing-date" style={{ marginBottom: 0, display: 'inline' }}>Fecha:</label>
                                <input
                                    id="potreradas-group-weighing-date"
                                    type="date"
                                    min={MIN_GANADO_DATE}
                                    value={weighingDate}
                                    onChange={(e) => setWeighingDate(e.target.value)}
                                    className="potreradas-weighing-date-input"
                                />
                            </div>
                        </div>
                        <button type="button" aria-label="Cerrar pesaje grupal" onClick={onClose} className="btn-icon" style={{ flexShrink: 0 }}>
                            <X size={20} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="potreradas-weighing-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 0, marginBottom: '12px' }}>
                        Ingresa el nuevo peso de cada animal. Puedes dejar en blanco los que no se pesaron.
                    </p>
                    <div className="potreradas-weighing-wrap" style={{ background: 'var(--surface-inset)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                        <table className="potreradas-weighing-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Chapeta</th>
                                    <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Propietario</th>
                                    <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Peso Actual</th>
                                    <th scope="col" style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '25%' }}>Nuevo Peso (kg)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detailData.animales
                                    .filter(a => !a.estado || a.estado === 'activo')
                                    .slice()
                                    .sort((a, b) => a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true, sensitivity: 'base' }))
                                    .map((a, idx) => {
                                        const newVal = weighingData[a.id] ?? '';
                                        const parsedNewVal = parseDecimalInput(newVal);
                                        const hasWeight = newVal !== '' && !isNaN(parsedNewVal) && parsedNewVal > 0;
                                        return (
                                            <tr key={a.id} style={{
                                                borderBottom: idx < detailData.animales.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                                background: hasWeight ? 'var(--success-soft-bg)' : undefined
                                            }}>
                                                <td className="potreradas-w-chapeta" style={{ padding: '10px 16px', fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</td>
                                                <td className="potreradas-w-prop" style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{a.nombre_propietario}</td>
                                                <td className="potreradas-w-actual" style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                    {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                </td>
                                                <td className="potreradas-w-input-cell" style={{ padding: '8px 12px' }}>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        aria-label={`Nuevo peso en kg para #${a.numero_chapeta}`}
                                                        placeholder={isMobile ? 'Peso (kg)' : 'ej: 320'}
                                                        value={newVal}
                                                        onChange={e => setWeighingData(prev => ({ ...prev, [a.id]: sanitizeDecimalInput(e.target.value) }))}
                                                        className="potreradas-w-input"
                                                        style={{
                                                            width: '100%', padding: '7px 10px', fontSize: '0.9rem',
                                                            marginBottom: 0,
                                                            background: hasWeight ? 'var(--success-soft-bg)' : 'var(--bg-input)',
                                                            border: hasWeight ? '1px solid var(--success)' : '1px solid var(--border-input)',
                                                            borderRadius: '8px', color: 'var(--text)'
                                                        }}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>

                    {filled > 0 && (
                        <div style={{ marginTop: '12px', padding: '10px 16px', background: 'var(--success-soft-bg)', border: '1px solid var(--success-soft-border)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--success)' }}>
                            ✅ {filled} de {detailData.animales.length} animales con peso ingresado.
                        </div>
                    )}
                </div>

                <div className="potreradas-modal-footer">
                    <button
                        type="button"
                        onClick={onClose}
                        className="potreradas-modal-cancel-btn"
                        style={{ width: 'auto', padding: '9px 20px', borderRadius: '8px' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveWeighings}
                        disabled={savingWeighings}
                        style={{ width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '9px 24px' }}
                    >
                        {savingWeighings ? 'Guardando...' : <><Save size={16} aria-hidden="true" /> Guardar Pesajes</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
