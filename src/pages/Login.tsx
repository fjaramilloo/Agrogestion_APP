import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Leaf } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const { user } = useAuth();

    if (user) {
        return <Navigate to="/" replace />;
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) {
                setError(error.message);
            }
        } catch (err: any) {
            setError(err.message || "Ocurrió un error al intentar iniciar sesión");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/update-password`,
            });
            if (error) {
                setError(error.message);
            } else {
                setMessage('Se ha enviado un enlace de recuperación a tu correo electrónico.');
            }
        } catch (err: any) {
            setError(err.message || "Ocurrió un error al enviar el enlace");
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
                    <p style={{ color: 'var(--text-muted)' }}>Panel de Control Ganadero</p>
                </div>

                {error && <div className="error-message text-center">{error}</div>}
                {message && <div style={{ color: 'var(--success)', backgroundColor: 'rgba(76,175,80,0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center', marginBottom: '16px' }}>{message}</div>}

                <form onSubmit={isForgotPassword ? handleResetPassword : handleLogin}>
                    <label>Correo Electrónico</label>
                    <input
                        type="email"
                        autoComplete="email"
                        placeholder="ejemplo@finca.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    {!isForgotPassword && (
                        <>
                            <label>Contraseña</label>
                            <input
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </>
                    )}

                    <button type="submit" disabled={loading} style={{ marginTop: '16px' }}>
                        {loading 
                            ? 'Cargando...' 
                            : isForgotPassword 
                                ? 'Enviar Enlace de Recuperación' 
                                : 'Ingresar'}
                    </button>
                    
                    <div style={{ textAlign: 'center', marginTop: '16px' }}>
                        <button 
                            type="button" 
                            onClick={() => {
                                setIsForgotPassword(!isForgotPassword);
                                setError(null);
                                setMessage(null);
                            }} 
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
                            {isForgotPassword ? 'Volver al inicio de sesión' : '¿Olvidaste tu contraseña?'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
