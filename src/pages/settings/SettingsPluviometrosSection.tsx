import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CloudRain, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import type { PluviometroFinca, TipoMedicionPluviometro } from '../../utils/rainfallUtils';

interface SettingsPluviometrosSectionProps {
    fincaId: string | null;
    renderInlineStatus: (sectionKey: string) => ReactNode;
    onFeedback: (section: string, type: 'success' | 'error', text: string) => void;
    onClearInlineStatus: () => void;
}

export default function SettingsPluviometrosSection({
    fincaId,
    renderInlineStatus,
    onFeedback,
    onClearInlineStatus
}: SettingsPluviometrosSectionProps) {
    const { confirmAction } = useFeedback();
    const [pluviometros, setPluviometros] = useState<PluviometroFinca[]>([]);
    const [nuevoPluvNombre, setNuevoPluvNombre] = useState('');
    const [nuevoPluvModo, setNuevoPluvModo] = useState<TipoMedicionPluviometro>('diaria');
    const [savingPluv, setSavingPluv] = useState(false);

    const fetchPluviometros = useCallback(async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('pluviometros_finca')
            .select('*')
            .eq('id_finca', fincaId)
            .order('orden', { ascending: true })
            .order('creado_en', { ascending: true });

        if (!error && data) setPluviometros(data as PluviometroFinca[]);
    }, [fincaId]);

    useEffect(() => {
        void fetchPluviometros();
    }, [fetchPluviometros]);

    const handleAddPluviometro = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoPluvNombre.trim()) return;
        onClearInlineStatus();
        setSavingPluv(true);
        try {
            const nextOrden = pluviometros.length > 0
                ? Math.max(...pluviometros.map(p => p.orden || 0)) + 1
                : 0;
            const { error } = await supabase
                .from('pluviometros_finca')
                .insert({
                    id_finca: fincaId,
                    nombre: nuevoPluvNombre.trim(),
                    tipo_medicion: nuevoPluvModo,
                    activo: true,
                    orden: nextOrden,
                });
            if (error) throw error;
            setNuevoPluvNombre('');
            setNuevoPluvModo('diaria');
            await fetchPluviometros();
            onFeedback('pluviometros', 'success', 'Pluviómetro agregado correctamente.');
        } catch (err: any) {
            onFeedback('pluviometros', 'error', 'Error al agregar pluviómetro: ' + (err.code === '23505' ? 'Ya existe un pluviómetro con ese nombre en la finca.' : err.message));
        } finally {
            setSavingPluv(false);
        }
    };

    const handleUpdatePluviometro = async (id: string, changes: Partial<Pick<PluviometroFinca, 'nombre' | 'tipo_medicion' | 'activo'>>) => {
        onClearInlineStatus();
        setSavingPluv(true);
        try {
            const { error } = await supabase
                .from('pluviometros_finca')
                .update(changes)
                .eq('id', id);
            if (error) throw error;
            await fetchPluviometros();
            onFeedback('pluviometros', 'success', 'Pluviómetro actualizado. Los registros históricos permanecen intactos.');
        } catch (err: any) {
            onFeedback('pluviometros', 'error', 'Error al actualizar pluviómetro: ' + (err.code === '23505' ? 'Ya existe otro pluviómetro con ese nombre.' : err.message));
        } finally {
            setSavingPluv(false);
        }
    };

    const handleRemovePluviometro = async (pluv: PluviometroFinca) => {
        onClearInlineStatus();
        setSavingPluv(true);
        try {
            const { count } = await supabase
                .from('registros_lluvia')
                .select('id', { count: 'exact', head: true })
                .eq('id_pluviometro', pluv.id);

            setSavingPluv(false);

            if ((count || 0) > 0) {
                const desactivar = await confirmAction(
                    `"${pluv.nombre}" tiene ${count} registros históricos de lluvia. Desactivarlo evita perder ese historial y dejará de aparecer en nuevos registros.`,
                    {
                        title: '¿Desactivar pluviómetro?',
                        confirmLabel: 'Sí, desactivar',
                        cancelLabel: 'Cancelar',
                    }
                );
                if (desactivar) {
                    await handleUpdatePluviometro(pluv.id, { activo: false });
                }
                return;
            }

            const confirmed = await confirmAction(
                `Se eliminará "${pluv.nombre}" de la finca.`,
                {
                    title: '¿Eliminar pluviómetro?',
                    confirmLabel: 'Eliminar',
                    cancelLabel: 'Cancelar',
                    destructive: true,
                }
            );
            if (!confirmed) return;
            setSavingPluv(true);
            const { error } = await supabase.from('pluviometros_finca').delete().eq('id', pluv.id);
            if (error) throw error;
            await fetchPluviometros();
            onFeedback('pluviometros', 'success', 'Pluviómetro eliminado.');
        } catch (err: any) {
            onFeedback('pluviometros', 'error', 'Error al eliminar pluviómetro: ' + err.message);
        } finally {
            setSavingPluv(false);
        }
    };

    return (
        <div className="settings-pluv-section">
            {renderInlineStatus('pluviometros')}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CloudRain size={18} color="var(--info)" aria-hidden="true" />
                    Pluviómetros de la Finca
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--info)', background: 'var(--info-soft-bg)', padding: '3px 10px', borderRadius: '12px', border: '1px solid var(--info-soft-border)' }}>
                    {pluviometros.filter(p => p.activo).length <= 1
                        ? 'Modo Estándar (1 pluviómetro)'
                        : `Multi-pluviómetro (${pluviometros.filter(p => p.activo).length} activos · Promedio Finca)`}
                </span>
            </div>
            <p className="settings-helper-text" style={{ marginBottom: '16px' }}>
                Cada cambio aquí se guarda al instante (es independiente de Guardar Información). Si manejas 2 o más pluviómetros, agrégalos abajo y la app calculará el <strong style={{ color: 'var(--text-main)' }}>promedio diario de la finca</strong> sin alterar registros anteriores.
            </p>

            <form onSubmit={handleAddPluviometro} className="settings-pluv-form">
                <div className="settings-field">
                    <label htmlFor="settings-pluv-nombre" style={{ fontSize: '0.8rem' }}>Nombre del Pluviómetro</label>
                    <input
                        id="settings-pluv-nombre"
                        name="pluv_nombre"
                        type="text"
                        enterKeyHint="done"
                        placeholder="Ej: Casa Principal o Potrero Alto"
                        value={nuevoPluvNombre}
                        onChange={e => setNuevoPluvNombre(e.target.value)}
                        style={{ marginBottom: 0 }}
                        required
                    />
                </div>
                <div className="settings-field">
                    <label htmlFor="settings-pluv-modo" style={{ fontSize: '0.8rem' }}>Tipo de Medición</label>
                    <select
                        id="settings-pluv-modo"
                        name="pluv_modo"
                        value={nuevoPluvModo}
                        onChange={e => setNuevoPluvModo(e.target.value as TipoMedicionPluviometro)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="diaria">💧 Diaria (Probeta / Manual)</option>
                        <option value="acumulada">📟 Acumulada Digital</option>
                    </select>
                </div>
                <button
                    type="submit"
                    disabled={savingPluv || !nuevoPluvNombre.trim()}
                    className="settings-pluv-submit"
                >
                    <Plus size={16} aria-hidden="true" /> Agregar
                </button>
            </form>

            {pluviometros.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {pluviometros.map(pluv => (
                        <div
                            key={pluv.id}
                            className="settings-pluv-row"
                            style={{
                                background: pluv.activo ? 'var(--surface)' : 'var(--surface-inset)',
                                opacity: pluv.activo ? 1 : 0.72,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 180px', minWidth: 0 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-main)', overflowWrap: 'break-word' }}>📍 {pluv.nombre}</span>
                                {!pluv.activo && (
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                                        Inactivo
                                    </span>
                                )}
                            </div>
                            <div className="settings-pluv-actions">
                                <select
                                    aria-label={`Tipo de medición para ${pluv.nombre}`}
                                    value={pluv.tipo_medicion}
                                    disabled={savingPluv}
                                    onChange={e => handleUpdatePluviometro(pluv.id, { tipo_medicion: e.target.value as TipoMedicionPluviometro })}
                                    style={{ width: 'auto', marginBottom: 0, padding: '8px 10px', fontSize: '0.82rem' }}
                                >
                                    <option value="diaria">💧 Diaria (Manual)</option>
                                    <option value="acumulada">📟 Acumulada Digital</option>
                                </select>
                                <button
                                    type="button"
                                    disabled={savingPluv}
                                    aria-pressed={pluv.activo}
                                    onClick={() => handleUpdatePluviometro(pluv.id, { activo: !pluv.activo })}
                                    className="settings-pluv-status-btn"
                                    style={{
                                        background: pluv.activo ? 'var(--success-soft-bg)' : 'var(--surface-subtle)',
                                        border: `1px solid ${pluv.activo ? 'var(--success-soft-border)' : 'var(--border-strong)'}`,
                                        color: pluv.activo ? 'var(--success)' : 'var(--text-muted)',
                                    }}
                                >
                                    {pluv.activo ? 'Activo' : 'Activar'}
                                </button>
                                <button
                                    type="button"
                                    disabled={savingPluv}
                                    onClick={() => handleRemovePluviometro(pluv)}
                                    aria-label={`Eliminar o desactivar pluviómetro ${pluv.nombre}`}
                                    className="settings-icon-danger-btn"
                                >
                                    <Trash2 size={18} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
