import { useState } from 'react';
import { Skull, Calendar, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';

interface InventoryDeathReportModalProps {
    fincaId: string | null;
    onClose: () => void;
    onReported: () => void;
}

export default function InventoryDeathReportModal({
    fincaId,
    onClose,
    onReported
}: InventoryDeathReportModalProps) {
    const { toast } = useFeedback();
    const [saving, setSaving] = useState(false);
    const [chapetaMuerte, setChapetaMuerte] = useState('');
    const [fechaMuerte, setFechaMuerte] = useState(getLocalIsoDate());
    const [msjErrorMuerte, setMsjErrorMuerte] = useState('');

    const handleReportarMuerte = async () => {
        if (!fincaId || !chapetaMuerte.trim()) return;
        setSaving(true);
        setMsjErrorMuerte('');

        try {
            const fechaErr = getGanadoDateError(fechaMuerte, 'La fecha de fallecimiento');
            if (fechaErr) {
                throw new Error(fechaErr);
            }

            const { data: animal, error: searchError } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', chapetaMuerte.trim())
                .eq('estado', 'activo')
                .or('is_deleted.is.null,is_deleted.eq.false')
                .single();

            if (searchError || !animal) {
                throw new Error('Animal no encontrado o no está activo en esta finca.');
            }

            const { error: updateError } = await supabase
                .from('animales')
                .update({
                    estado: 'muerto',
                    fecha_muerte: fechaMuerte,
                    id_potrero_actual: null
                })
                .eq('id', animal.id);

            if (updateError) throw updateError;

            const chapeta = chapetaMuerte;
            onReported();
            onClose();
            toast(`Se ha registrado el fallecimiento del animal #${chapeta}`, 'success');
        } catch (err: any) {
            setMsjErrorMuerte(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card inventory-modal-card" style={{ maxWidth: '450px', border: '1px solid var(--error)' }} onClick={e => e.stopPropagation()}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <Skull size={48} color="var(--error)" aria-hidden="true" style={{ marginBottom: '12px' }} />
                    <h2 style={{ color: 'var(--text-main)', margin: '0 0 8px 0' }}>Reportar Fallecimiento</h2>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Esta acción inactivará al animal permanentemente.</p>
                </div>

                {msjErrorMuerte && (
                    <div role="alert" style={{ backgroundColor: 'var(--error-soft-bg)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <AlertCircle size={16} aria-hidden="true" /> {msjErrorMuerte}
                    </div>
                )}

                <div style={{ marginBottom: '18px' }}>
                    <label htmlFor="inventory-muerte-chapeta">Número de Chapeta</label>
                    <input
                        id="inventory-muerte-chapeta"
                        type="text"
                        placeholder="Ej: 1234"
                        value={chapetaMuerte}
                        onChange={e => setChapetaMuerte(e.target.value)}
                        autoCorrect="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        style={{ fontSize: '1.2rem', marginBottom: 0 }}
                    />
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label htmlFor="inventory-muerte-fecha">Fecha de Fallecimiento</label>
                    <div style={{ position: 'relative' }}>
                        <Calendar size={18} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            id="inventory-muerte-fecha"
                            type="date"
                            min={MIN_GANADO_DATE}
                            value={fechaMuerte}
                            onChange={e => setFechaMuerte(e.target.value)}
                            style={{ paddingLeft: '40px', marginBottom: 0 }}
                        />
                    </div>
                </div>

                <div className="inventory-modal-actions-row" style={{ display: 'flex', gap: '12px' }}>
                    <button
                        type="button"
                        className="inventory-btn-ghost"
                        onClick={onClose}
                        style={{ flex: 1 }}
                        disabled={saving}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="inventory-header-btn--danger"
                        onClick={handleReportarMuerte}
                        style={{ flex: 2 }}
                        disabled={saving || !chapetaMuerte}
                    >
                        {saving ? 'Procesando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
