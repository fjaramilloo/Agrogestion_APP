import { useEffect, useState } from 'react';
import { Users, CheckSquare, Square, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SettingsUsersSectionProps {
    fincaId: string | null;
    fincasAdmin: any[];
    loading: boolean;
    onSetLoading: (val: boolean) => void;
}

export default function SettingsUsersSection({
    fincaId,
    fincasAdmin,
    loading,
    onSetLoading
}: SettingsUsersSectionProps) {
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [newUserNombre, setNewUserNombre] = useState('');
    const [newUserApellido, setNewUserApellido] = useState('');
    const [newUserRole, setNewUserRole] = useState<'vaquero' | 'observador'>('vaquero');
    const [selectedFincas, setSelectedFincas] = useState<string[]>(() => (fincaId ? [fincaId] : []));
    const [userFormMsg, setUserFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (fincaId && selectedFincas.length === 0) {
            setSelectedFincas([fincaId]);
        }
    }, [fincaId, selectedFincas.length]);

    const toggleFincaSelection = (id: string) => {
        setSelectedFincas(prev =>
            prev.includes(id)
                ? prev.filter(f => f !== id)
                : [...prev, id]
        );
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setUserFormMsg(null);

        if (selectedFincas.length === 0) {
            setUserFormMsg({ type: 'error', text: 'Debe seleccionar al menos una finca para asignar al usuario.' });
            return;
        }
        if (!newUserEmail || !newUserPass) {
            setUserFormMsg({ type: 'error', text: 'El correo y la contraseña son obligatorios.' });
            return;
        }

        onSetLoading(true);

        try {
            const { error } = await supabase.rpc('crear_trabajador_finca', {
                p_email: newUserEmail,
                p_password: newUserPass,
                p_finca_ids: selectedFincas,
                p_rol: newUserRole,
                p_nombre: newUserNombre || null,
                p_apellido: newUserApellido || null
            });

            if (error) throw error;

            const nombresFincas = fincasAdmin
                .filter((f: any) => selectedFincas.includes(f.id_finca))
                .map((f: any) => f.nombre_finca);

            let emailEnviado = false;
            try {
                const { error: fnErr } = await supabase.functions.invoke('notify-worker-invite', {
                    body: {
                        email: newUserEmail.trim(),
                        nombre: newUserNombre.trim(),
                        apellido: newUserApellido.trim(),
                        password: newUserPass,
                        rol: newUserRole,
                        fincas: nombresFincas
                    }
                });
                if (!fnErr) {
                    emailEnviado = true;
                } else {
                    console.warn('[handleCreateUser] Error al enviar email de bienvenida:', fnErr);
                }
            } catch (fnEx) {
                console.warn('[handleCreateUser] Excepción al invocar función de email:', fnEx);
            }

            const successText = emailEnviado
                ? `✓ Usuario ${newUserEmail} creado y asignado exitosamente. Se ha enviado un correo con sus credenciales y guía de instalación móvil.`
                : `✓ Usuario ${newUserEmail} creado y asignado a ${selectedFincas.length} finca(s) exitosamente.`;

            setUserFormMsg({ type: 'success', text: successText });
            setNewUserEmail('');
            setNewUserPass('');
            setNewUserNombre('');
            setNewUserApellido('');
            setSelectedFincas([fincaId || '']);
        } catch (err: any) {
            const msg = err?.message || 'Error desconocido al crear el usuario.';
            setUserFormMsg({ type: 'error', text: '✗ ' + msg });
        } finally {
            onSetLoading(false);
        }
    };

    return (
        <section id="settings-panel-usuarios" aria-labelledby="settings-heading-usuarios" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <h2 id="settings-heading-usuarios" className="settings-section-heading">
                <Users size={20} color="var(--primary)" aria-hidden="true" /> Gestión de Personal
            </h2>
            <form onSubmit={handleCreateUser} aria-labelledby="settings-heading-usuarios">
                <div className="settings-form-grid-wide" style={{ marginBottom: '20px' }}>
                    <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="settings-new-user-email">Correo Electrónico</label>
                        <input id="settings-new-user-email" name="new_user_email" type="email" autoComplete="email" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="next" placeholder="trabajador@finca.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="settings-new-user-nombre">Nombre</label>
                        <input id="settings-new-user-nombre" name="new_user_nombre" type="text" autoComplete="given-name" enterKeyHint="next" placeholder="Ej: Juan" value={newUserNombre} onChange={(e) => setNewUserNombre(e.target.value)} required />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="settings-new-user-apellido">Apellido</label>
                        <input id="settings-new-user-apellido" name="new_user_apellido" type="text" autoComplete="family-name" enterKeyHint="next" placeholder="Ej: Pérez" value={newUserApellido} onChange={(e) => setNewUserApellido(e.target.value)} required />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="settings-new-user-pass">Contraseña Temporal</label>
                        <input id="settings-new-user-pass" name="new_user_pass" type="text" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="next" aria-describedby="settings-user-pass-hint" value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} required />
                        <span id="settings-user-pass-hint" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '-12px', marginBottom: '8px' }}>
                            ✉️ Se enviará automáticamente al correo junto con la guía de instalación.
                        </span>
                    </div>
                    <div className="settings-field">
                        <label htmlFor="settings-new-user-role">Perfil / Rol</label>
                        <select id="settings-new-user-role" name="new_user_role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'vaquero' | 'observador')}>
                            <option value="vaquero">Trabajador / Vaquero</option>
                            <option value="observador">Visualizador / Observador</option>
                        </select>
                    </div>
                </div>

                <fieldset className="settings-fieldset" style={{ marginBottom: '20px' }}>
                    <legend className="settings-legend" style={{ marginBottom: '10px' }}>Asignar a Fincas:</legend>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: '10px', padding: '14px', backgroundColor: 'var(--surface-inset)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                        {fincasAdmin.map((f: any) => {
                            const isSelected = selectedFincas.includes(f.id_finca);
                            return (
                                <button
                                    key={f.id_finca}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => toggleFincaSelection(f.id_finca)}
                                    className="settings-finca-option"
                                    style={{
                                        backgroundColor: isSelected ? 'var(--primary-soft-bg)' : 'var(--surface)',
                                        color: 'var(--text-main)',
                                        border: '1px solid',
                                        borderColor: isSelected ? 'var(--primary)' : 'var(--border-subtle)'
                                    }}
                                >
                                    {isSelected ? <CheckSquare size={18} color="var(--primary)" aria-hidden="true" /> : <Square size={18} color="var(--text-muted)" aria-hidden="true" />}
                                    <span style={{ fontSize: '0.88rem' }}>{f.nombre_finca}</span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>
                <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', opacity: loading ? 0.65 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                    <UserPlus size={18} aria-hidden="true" /> {loading ? 'Creando Usuario...' : 'Crear Usuario'}
                </button>
                {userFormMsg && (
                    <div role={userFormMsg.type === 'error' ? 'alert' : 'status'} style={{
                        marginTop: '16px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        backgroundColor: userFormMsg.type === 'success' ? 'var(--success-soft-bg)' : 'var(--error-soft-bg)',
                        border: `1px solid ${userFormMsg.type === 'success' ? 'var(--success-soft-border)' : 'var(--error-soft-border)'}`,
                        color: userFormMsg.type === 'success' ? 'var(--success)' : 'var(--error)'
                    }}>
                        {userFormMsg.text}
                    </div>
                )}
            </form>
        </section>
    );
}
