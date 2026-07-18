import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Leaf } from 'lucide-react';

export default function UpdatePassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Verificar si hay una sesión activa, si no hay sesión, probablemente el link es inválido o expiró
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // Supabase hash fragment redirection usually establishes a session automatically
                // If there's no session here after a short delay, redirect to login
                setTimeout(async () => {
                    const { data: { session: delayedSession } } = await supabase.auth.getSession();
                    if (!delayedSession) {
                        setError("El enlace de recuperación es inválido o ha expirado. Por favor, solicita uno nuevo.");
                    }
                }, 1000);
            }
        };
        checkSession();
    }, []);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden");
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres");
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) {
                setError(error.message);
            } else {
                setMessage('Tu contraseña ha sido actualizada exitosamente.');
                // Redirigir al dashboard después de unos segundos
                setTimeout(() => {
                    navigate('/');
                }, 3000);
            }
        } catch (err: any) {
            setError(err.message || "Ocurrió un error al actualizar la contraseña");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-box glass-panel">
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <Leaf size={48} color="var(--primary-light)" />
                    <h1 className="title" style={{ marginBottom: 0, marginTop: '16px' }}>AgroGestión</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Actualizar Contraseña</p>
                </div>

                {error && <div className="error-message text-center">{error}</div>}
                {message && <div style={{ color: 'var(--success)', backgroundColor: 'rgba(76,175,80,0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center', marginBottom: '16px' }}>{message}</div>}

                {!message ? (
                    <form onSubmit={handleUpdatePassword}>
                        <label>Nueva Contraseña</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />

                        <label>Confirmar Nueva Contraseña</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />

                        <button type="submit" disabled={loading} style={{ marginTop: '16px' }}>
                            {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
                        </button>
                        
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                            <button 
                                type="button" 
                                onClick={() => navigate('/login')} 
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'var(--primary-light)', 
                                    padding: 0, 
                                    fontSize: '0.9rem',
                                    textDecoration: 'underline',
                                    cursor: 'pointer'
                                }}
                            >
                                Volver al inicio de sesión
                            </button>
                        </div>
                    </form>
                ) : (
                    <div style={{ textAlign: 'center' }}>
                        <button onClick={() => navigate('/')} style={{ marginTop: '16px' }}>
                            Ir al panel de control
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
