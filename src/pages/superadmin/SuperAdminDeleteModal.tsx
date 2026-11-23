import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import type { ConfirmDeleteTarget } from './types';

interface SuperAdminDeleteModalProps {
    target: ConfirmDeleteTarget;
    onClose: () => void;
    onDeleted: (type: 'org' | 'finca') => Promise<void>;
}

export default function SuperAdminDeleteModal({ target, onClose, onDeleted }: SuperAdminDeleteModalProps) {
    const { showAlert, toast } = useFeedback();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDeleteFinca = async (fincaId: string) => {
        setDeletingId(fincaId);
        try {
            await supabase.from('registros_pesaje').delete().in('id_animal',
                (await supabase.from('animales').select('id').eq('id_finca', fincaId)).data?.map((a: any) => a.id) || []
            );
            await supabase.from('animales').delete().eq('id_finca', fincaId);
            await supabase.from('potreradas').delete().eq('id_finca', fincaId);
            await supabase.from('potreros').delete().eq('id_finca', fincaId);
            await supabase.from('permisos_finca').delete().eq('id_finca', fincaId);
            await supabase.from('configuracion_kpi').delete().eq('id_finca', fincaId);
            const { error } = await supabase.from('fincas').delete().eq('id', fincaId);
            if (error) throw error;
            onClose();
            await onDeleted('finca');
            toast('Finca eliminada.', 'success');
        } catch (err: any) {
            await showAlert('Error eliminando finca: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setDeletingId(null);
        }
    };

    const handleDeleteOrg = async (orgId: string, idDueño?: string) => {
        setDeletingId(orgId);
        try {
            const isRealOrg = orgId && orgId.length > 20 && !orgId.startsWith('dummy');
            const { error } = await supabase.rpc('eliminar_cuenta_completa_superadmin', {
                p_org_id: isRealOrg ? orgId : null,
                p_user_id: idDueño || null
            });
            if (error) throw error;
            onClose();
            await onDeleted('org');
            toast('Cuenta eliminada.', 'success');
        } catch (err: any) {
            await showAlert('Error eliminando cuenta: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--backdrop-scrim)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'var(--surface)', border: `1px solid ${target.esInactiva ? 'var(--error)' : 'var(--error-soft-border)'}`, borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-popover)' }}>
                <div style={{ background: 'var(--error-soft-bg)', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <AlertTriangle size={28} color="var(--error)" />
                </div>
                <h3 style={{ margin: '0 0 8px', color: 'var(--text-main)', fontSize: '1.2rem' }}>
                    {target.esInactiva
                        ? '¿Inactivar / Eliminar cuenta demo?'
                        : `¿Eliminar ${target.type === 'org' ? 'organización' : 'finca'}?`}
                </h3>
                <p style={{ color: 'var(--text-muted)', margin: '0 0 4px', fontSize: '1rem' }}>
                    <strong style={{ color: 'var(--text-main)' }}>{target.nombre}</strong>
                </p>
                {target.email && (
                    <p style={{ color: 'var(--text-muted)', margin: '0 0 14px', fontSize: '0.85rem' }}>
                        {target.email}
                    </p>
                )}
                <p style={{ color: 'var(--error)', margin: '0 0 24px', fontSize: '0.85rem', background: 'var(--error-soft-bg)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--error-soft-border)', textAlign: 'left', lineHeight: 1.5 }}>
                    {target.esInactiva ? (
                        <>
                            ⚠️ <strong>Cuenta demo inactiva (+30 días sin animales):</strong> Se eliminarán la organización, sus datos y el acceso de autenticación del usuario. Esta operación <strong>no se puede deshacer</strong>.
                        </>
                    ) : (
                        <>
                            ⚠️ Esta acción eliminará {target.type === 'org' ? 'todas las fincas, animales, pesajes y accesos asociados' : 'todos los animales, pesajes y datos de esta finca'}. Esta operación <strong>no se puede deshacer</strong>.
                        </>
                    )}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                        onClick={onClose}
                        disabled={!!deletingId}
                        style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600 }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => target.type === 'org' ? handleDeleteOrg(target.id, target.idDueño) : handleDeleteFinca(target.id)}
                        disabled={!!deletingId}
                        style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--error)', color: 'white', cursor: deletingId ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', opacity: deletingId ? 0.6 : 1 }}
                    >
                        <Trash2 size={16} />
                        {deletingId ? 'Eliminando...' : target.esInactiva ? 'Sí, inactivar cuenta' : 'Sí, eliminar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
