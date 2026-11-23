import { useState } from 'react';
import { Building2, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SuperAdminPalette, TipoLicencia } from './types';

interface SuperAdminCreateAccountTabProps {
    palette: SuperAdminPalette;
    onAccountCreated: () => Promise<void>;
}

export default function SuperAdminCreateAccountTab({ palette, onAccountCreated }: SuperAdminCreateAccountTabProps) {
    const { accentPurple, purpleSoftBorder } = palette;

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [org, setOrg] = useState('');
    const [finca, setFinca] = useState('');
    const [ubicacion, setUbicacion] = useState('');
    const [licenciaInicial, setLicenciaInicial] = useState<TipoLicencia>('demo');
    const [loadingForm, setLoadingForm] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    const crearAdministrador = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingForm(true);
        setMsjExito('');
        setMsjError('');
        try {
            if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
            const { error } = await supabase.rpc('crear_dueno_finca', {
                p_email: email, p_password: password,
                p_nombre_organizacion: org, p_nombre_finca: finca, p_ubicacion_finca: ubicacion
            });
            if (error) throw new Error(error.message);

            if (licenciaInicial !== 'demo') {
                const { data: createdOrg } = await supabase
                    .from('organizaciones')
                    .select('id')
                    .eq('nombre', org)
                    .order('creado_en', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (createdOrg) {
                    let limitVal = 40;
                    if (licenciaInicial === 'finca') limitVal = 500;
                    else if (licenciaInicial === 'premium') limitVal = 999999;

                    await supabase
                        .from('organizaciones')
                        .update({ licencia: licenciaInicial, limite_animales: limitVal })
                        .eq('id', createdOrg.id);
                }
            }

            setMsjExito(`¡Cuenta ${email} creada correctamente con plan ${licenciaInicial.toUpperCase()}!`);
            setEmail(''); setPassword(''); setOrg(''); setFinca(''); setUbicacion(''); setLicenciaInicial('demo');
            await onAccountCreated();
        } catch (err: any) {
            setMsjError(err.message || 'Error no controlado');
        } finally {
            setLoadingForm(false);
        }
    };

    return (
        <div style={{ maxWidth: '780px' }}>
            <div style={{ background: 'var(--bg-card)', border: `1px solid ${purpleSoftBorder}`, borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <UserPlus size={18} color={accentPurple} />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Crear Nueva Cuenta de Administrador</h3>
                </div>
                <div style={{ padding: '28px 24px' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', marginTop: 0, fontSize: '0.9rem' }}>
                        El sistema creará automáticamente el usuario, su empresa y su primera finca.
                    </p>

                    {msjExito && (
                        <div style={{ background: 'var(--success-soft-bg)', border: '1px solid var(--success-soft-border)', color: 'var(--success)', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', fontWeight: 600 }}>
                            {msjExito}
                        </div>
                    )}
                    {msjError && (
                        <div style={{ background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', fontWeight: 600 }}>
                            {msjError}
                        </div>
                    )}

                    <form onSubmit={crearAdministrador}>
                        <div className="superadmin-form-grid">
                            <div>
                                <h4 style={{ color: accentPurple, marginBottom: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <UserPlus size={15} /> Datos del Usuario
                                </h4>
                                <label>Correo Electrónico</label>
                                <input type="email" placeholder="admin@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={loadingForm} />
                                <label>Contraseña Temporal</label>
                                <input type="text" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} disabled={loadingForm} />
                            </div>
                            <div className="superadmin-form-right-col">
                                <h4 style={{ color: accentPurple, marginBottom: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <Building2 size={15} /> Datos de la Empresa y Licencia
                                </h4>
                                <label>Nombre de la Organización</label>
                                <input type="text" placeholder="Ej. Inversiones Agropecuarias S.A." value={org} onChange={e => setOrg(e.target.value)} required disabled={loadingForm} />
                                <label>Nombre de la Primera Finca</label>
                                <input type="text" placeholder="Ej. Hacienda La Esperanza" value={finca} onChange={e => setFinca(e.target.value)} required disabled={loadingForm} />
                                <label>Ubicación (opcional)</label>
                                <input type="text" placeholder="Ej. Colombia, Antioquia" value={ubicacion} onChange={e => setUbicacion(e.target.value)} disabled={loadingForm} />

                                <label style={{ marginTop: '12px' }}>Licencia Asignada Inicial</label>
                                <select
                                    value={licenciaInicial}
                                    onChange={e => setLicenciaInicial(e.target.value as TipoLicencia)}
                                    disabled={loadingForm}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                                >
                                    <option value="demo">Demo (40 animales)</option>
                                    <option value="finca">Finca (500 animales)</option>
                                    <option value="premium">Premium (Ilimitado)</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ marginTop: '16px' }}>
                            <button
                                type="submit"
                                disabled={loadingForm}
                                style={{ background: '#7c3aed', border: '1px solid #6d28d9', color: 'white', padding: '13px 28px', borderRadius: '10px', cursor: loadingForm ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', width: 'auto' }}
                            >
                                <UserPlus size={18} />
                                {loadingForm ? 'Procesando...' : 'Crear Cuenta'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
