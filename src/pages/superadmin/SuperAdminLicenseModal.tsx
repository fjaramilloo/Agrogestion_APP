import { useEffect, useState } from 'react';
import { Award, Calendar, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';
import {
    calculateVencimiento,
    formatSuperAdminDate,
    type CuentaAdmin,
    type PeriodoLicencia,
    type SuperAdminPalette,
    type TipoLicencia
} from './types';

interface SuperAdminLicenseModalProps {
    cuenta: CuentaAdmin;
    palette: SuperAdminPalette;
    onClose: () => void;
    onSaved: () => Promise<void>;
}

export default function SuperAdminLicenseModal({ cuenta, palette, onClose, onSaved }: SuperAdminLicenseModalProps) {
    const { showAlert, toast } = useFeedback();
    const { accentPurple, accentPurpleSoft, purpleSoftBg, purpleSoftBorder, accentAmber } = palette;

    const [formLicencia, setFormLicencia] = useState<TipoLicencia>(cuenta.licencia);
    const [formLimite, setFormLimite] = useState<number>(cuenta.limiteAnimales);
    const [formFechaInicio, setFormFechaInicio] = useState<string>(
        cuenta.fechaInicioLicencia ? cuenta.fechaInicioLicencia.substring(0, 10) : getLocalIsoDate()
    );
    const [formPeriodo, setFormPeriodo] = useState<PeriodoLicencia>(
        cuenta.licencia === 'demo' || !cuenta.fechaVencimientoLicencia ? 'indefinido' : 'anual'
    );
    const [formVencimiento, setFormVencimiento] = useState<string>(
        cuenta.licencia === 'demo' || !cuenta.fechaVencimientoLicencia ? '' : cuenta.fechaVencimientoLicencia.substring(0, 10)
    );
    const [savingLicencia, setSavingLicencia] = useState(false);

    useEffect(() => {
        setFormLicencia(cuenta.licencia);
        setFormLimite(cuenta.limiteAnimales);
        const inicioStr = cuenta.fechaInicioLicencia ? cuenta.fechaInicioLicencia.substring(0, 10) : getLocalIsoDate();
        setFormFechaInicio(inicioStr);

        if (cuenta.licencia === 'demo' || !cuenta.fechaVencimientoLicencia) {
            setFormPeriodo('indefinido');
            setFormVencimiento('');
        } else {
            setFormVencimiento(cuenta.fechaVencimientoLicencia.substring(0, 10));
            setFormPeriodo('anual');
        }
    }, [cuenta]);

    const handlePeriodoChange = (newPeriodo: PeriodoLicencia) => {
        setFormPeriodo(newPeriodo);
        if (newPeriodo !== 'personalizado') {
            setFormVencimiento(calculateVencimiento(formFechaInicio, newPeriodo));
        }
    };

    const handleFechaInicioChange = (newInicio: string) => {
        setFormFechaInicio(newInicio);
        if (formLicencia !== 'demo' && formPeriodo !== 'personalizado' && formPeriodo !== 'indefinido') {
            setFormVencimiento(calculateVencimiento(newInicio, formPeriodo));
        }
    };

    const handleSelectLicenciaChange = (newLic: TipoLicencia) => {
        setFormLicencia(newLic);
        if (newLic === 'demo') {
            setFormLimite(40);
            setFormPeriodo('indefinido');
            setFormVencimiento('');
        } else if (newLic === 'finca') {
            setFormLimite(500);
            if (formPeriodo === 'indefinido') {
                setFormPeriodo('anual');
                setFormVencimiento(calculateVencimiento(formFechaInicio, 'anual'));
            }
        } else if (newLic === 'premium') {
            setFormLimite(999999);
            if (formPeriodo === 'indefinido') {
                setFormPeriodo('anual');
                setFormVencimiento(calculateVencimiento(formFechaInicio, 'anual'));
            }
        }
    };

    const handleSaveLicencia = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingLicencia(true);
        try {
            const isDemo = formLicencia === 'demo';
            const isIndefinido = isDemo || formPeriodo === 'indefinido' || !formVencimiento;

            const inicioError = getGanadoDateError(formFechaInicio, 'La fecha de inicio');
            if (inicioError) throw new Error(inicioError);
            if (!isIndefinido) {
                const vencError = getGanadoDateError(formVencimiento, 'La fecha de vencimiento');
                if (vencError) throw new Error(vencError);
            }

            const updates: any = {
                licencia: formLicencia,
                limite_animales: formLimite,
                fecha_inicio_licencia: formFechaInicio ? new Date(formFechaInicio + 'T00:00:00').toISOString() : null,
                fecha_vencimiento_licencia: isIndefinido
                    ? null
                    : new Date(formVencimiento + 'T23:59:59').toISOString()
            };

            const { error } = await supabase
                .from('organizaciones')
                .update(updates)
                .eq('id', cuenta.orgId);

            if (error) throw error;

            onClose();
            await onSaved();
            toast('Licencia actualizada correctamente.', 'success');
        } catch (err: any) {
            await showAlert('Error al guardar la licencia: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setSavingLicencia(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--backdrop-scrim)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'var(--surface)', border: `1px solid ${purpleSoftBorder}`, borderRadius: '16px', padding: '28px', maxWidth: '460px', width: '100%', boxShadow: 'var(--shadow-popover)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <Award size={24} color={accentPurple} />
                    <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem' }}>Gestionar Licencia</h3>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 20px' }}>
                    Organización: <strong style={{ color: 'var(--text-main)' }}>{cuenta.orgNombre}</strong>
                </p>

                <form onSubmit={handleSaveLicencia}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                            Tipo de Plan
                        </label>
                        <select
                            value={formLicencia}
                            onChange={e => handleSelectLicenciaChange(e.target.value as TipoLicencia)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                        >
                            <option value="demo">Demo (Máx. 40 animales, 1 finca, 1 vaquero)</option>
                            <option value="finca">Finca (Máx. 500 animales, 1 finca, 1 vaquero + 1 observador)</option>
                            <option value="premium">Premium (Ilimitado animales, fincas y roles)</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                            Límite Máximo de Animales
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={formLimite}
                            onChange={e => setFormLimite(Number(e.target.value))}
                            required
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                            Use 999999 o valor alto para representar animales ilimitados.
                        </span>
                    </div>

                    {/* Fecha de Inicio de Vigencia */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                            Fecha de Inicio de Vigencia
                        </label>
                        <input
                            type="date"
                            min={MIN_GANADO_DATE}
                            value={formFechaInicio}
                            onChange={e => handleFechaInicioChange(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                        />
                    </div>

                    {/* Periodo de Licencia Droplist */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                            Periodo de Licencia
                        </label>
                        <select
                            value={formLicencia === 'demo' ? 'indefinido' : formPeriodo}
                            onChange={e => handlePeriodoChange(e.target.value as PeriodoLicencia)}
                            disabled={formLicencia === 'demo'}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: formLicencia === 'demo' ? 'var(--surface-inset)' : 'var(--bg-input)', border: '1px solid var(--border-input)', color: formLicencia === 'demo' ? 'var(--text-muted)' : 'var(--text-main)', fontSize: '0.9rem', cursor: formLicencia === 'demo' ? 'not-allowed' : 'pointer', marginBottom: 0 }}
                        >
                            <option value="indefinido">Sin vencimiento (Ilimitado / Vitalicio)</option>
                            <option value="mensual">Mensual (+1 Mes)</option>
                            <option value="semestral">Semestral (+6 Meses)</option>
                            <option value="anual">Anual (+1 Año)</option>
                            <option value="personalizado">Personalizado (Fecha manual)</option>
                        </select>
                        {formLicencia === 'demo' && (
                            <span style={{ fontSize: '0.72rem', color: accentAmber, marginTop: '4px', display: 'block' }}>
                                ℹ️ Las cuentas Demo siempre tienen vigencia indefinida (sin fecha de vencimiento).
                            </span>
                        )}
                    </div>

                    {/* Preview / Input de Fecha de Vencimiento */}
                    {formLicencia !== 'demo' && formPeriodo === 'personalizado' ? (
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                Fecha de Vencimiento Manual
                            </label>
                            <input
                                type="date"
                                min={MIN_GANADO_DATE}
                                value={formVencimiento}
                                onChange={e => setFormVencimiento(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                            />
                        </div>
                    ) : (formLicencia === 'demo' || formPeriodo === 'indefinido') ? (
                        <div style={{ marginBottom: '24px', background: 'var(--success-soft-bg)', border: '1px solid var(--success-soft-border)', padding: '12px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontSize: '0.82rem', fontWeight: 600 }}>
                            <CheckCircle2 size={16} />
                            <span>Plan activo sin fecha límite de expiración (Vigencia Indefinida).</span>
                        </div>
                    ) : (
                        <div style={{ marginBottom: '24px', background: purpleSoftBg, border: `1px solid ${purpleSoftBorder}`, padding: '12px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentPurpleSoft }}>
                                <Calendar size={16} />
                                <span>Fecha de Vencimiento Calculada:</span>
                            </div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                {formatSuperAdminDate(formVencimiento)}
                            </strong>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={savingLicencia}
                            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={savingLicencia}
                            style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#7c3aed', color: 'white', cursor: savingLicencia ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {savingLicencia ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
