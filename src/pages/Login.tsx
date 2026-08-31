import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Leaf, Check, X, Eye, EyeOff, Sparkles, ArrowLeft } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot';

export default function Login() {
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    // Campos para registro demo
    const [nombre, setNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [orgName, setOrgName] = useState('');
    const [fincaName, setFincaName] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const { user } = useAuth();

    if (user) {
        return <Navigate to="/" replace />;
    }

    // Reglas de validación de contraseña
    const passwordRequirements = {
        minLength: password.length >= 8,
        hasUpper: /[A-Z]/.test(password),
        hasLower: /[a-z]/.test(password),
        hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    };

    const isPasswordValid = 
        passwordRequirements.minLength &&
        passwordRequirements.hasUpper &&
        passwordRequirements.hasLower &&
        passwordRequirements.hasSpecial;

    const resetFormStatus = () => {
        setError(null);
        setMessage(null);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        resetFormStatus();
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });
            if (signInError) {
                setError(signInError.message);
            }
        } catch (err: any) {
            setError(err.message || "Ocurrió un error al intentar iniciar sesión");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        resetFormStatus();

        if (!nombre.trim() || !apellido.trim()) {
            setError('Por favor ingresa tu nombre y apellido completo.');
            return;
        }

        if (!isPasswordValid) {
            setError('La contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, una minúscula y un carácter especial.');
            return;
        }

        if (!orgName.trim()) {
            setError('Por favor ingresa el nombre de tu ganadería u organización.');
            return;
        }

        if (!fincaName.trim()) {
            setError('Por favor ingresa el nombre de tu finca inicial.');
            return;
        }

        setLoading(true);
        try {
            const { data, error: signUpError } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    data: {
                        nombre: nombre.trim(),
                        apellido: apellido.trim(),
                        nombre_organizacion: orgName.trim(),
                        nombre_finca: fincaName.trim(),
                    }
                }
            });

            if (signUpError) {
                setError(signUpError.message);
            } else if (data.session) {
                setMessage('¡Cuenta demo creada con éxito! Ingresando a tu panel...');
            } else if (data.user) {
                setMessage('¡Cuenta demo creada con éxito! Si tu cuenta requiere confirmación, revisa tu correo electrónico para activarla.');
                setMode('login');
            }
        } catch (err: any) {
            setError(err.message || "Ocurrió un error al crear la cuenta demo.");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        resetFormStatus();
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/update-password`,
            });
            if (resetError) {
                setError(resetError.message);
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
            <div 
                className="auth-box glass-panel" 
                style={{ 
                    maxWidth: mode === 'register' ? '480px' : '400px', 
                    transition: 'all 0.3s ease',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)'
                }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: mode === 'register' ? '20px' : '24px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        background: 'rgba(96, 173, 94, 0.12)',
                        border: '1px solid rgba(96, 173, 94, 0.3)',
                        marginBottom: '8px'
                    }}>
                        <Leaf size={32} color="var(--primary-light)" />
                    </div>
                    <h1 className="title" style={{ marginBottom: '4px', marginTop: '8px', fontSize: '1.85rem' }}>AgroGestión</h1>
                    
                    {mode === 'register' ? (
                        <div style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            background: 'rgba(46, 125, 50, 0.2)', 
                            border: '1px solid rgba(96, 173, 94, 0.35)',
                            color: 'var(--primary-light)', 
                            padding: '4px 12px', 
                            borderRadius: '20px', 
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            marginTop: '6px'
                        }}>
                            <Sparkles size={14} />
                            <span>Crear Cuenta Demo (Gratis)</span>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0 }}>
                            {mode === 'forgot' ? 'Recuperación de Contraseña' : 'Panel de Control Ganadero'}
                        </p>
                    )}
                </div>

                {/* Mensajes de error / éxito */}
                {error && <div className="error-message text-center">{error}</div>}
                {message && (
                    <div style={{ 
                        color: 'var(--success)', 
                        backgroundColor: 'rgba(76, 175, 80, 0.15)', 
                        border: '1px solid rgba(76, 175, 80, 0.3)',
                        padding: '12px', 
                        borderRadius: '8px', 
                        textAlign: 'center', 
                        marginBottom: '16px',
                        fontSize: '0.9rem'
                    }}>
                        {message}
                    </div>
                )}

                {/* ==================================================== */}
                {/* 1. MODO INICIO DE SESIÓN */}
                {/* ==================================================== */}
                {mode === 'login' && (
                    <form onSubmit={handleLogin}>
                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Correo Electrónico</label>
                            <input
                                type="email"
                                autoComplete="email"
                                placeholder="ejemplo@finca.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500 }}>Contraseña</label>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        setMode('forgot');
                                        resetFormStatus();
                                    }} 
                                    style={{ 
                                        background: 'none', 
                                        border: 'none', 
                                        color: 'var(--primary-light)', 
                                        padding: 0, 
                                        fontSize: '0.8rem',
                                        textDecoration: 'underline',
                                        cursor: 'pointer',
                                        width: 'auto',
                                        letterSpacing: 'normal',
                                        textTransform: 'none'
                                    }}
                                >
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    style={{ paddingRight: '42px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '14px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        width: 'auto',
                                        padding: 0,
                                        cursor: 'pointer'
                                    }}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" disabled={loading} style={{ marginTop: '8px' }}>
                            {loading ? 'Ingresando...' : 'Ingresar'}
                        </button>

                        {/* Separador y botón para registrarse */}
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            margin: '22px 0 16px', 
                            color: 'rgba(255,255,255,0.2)' 
                        }}>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                            <span style={{ padding: '0 12px', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                ¿Aún no tienes cuenta?
                            </span>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                        </div>

                        <button 
                            type="button"
                            onClick={() => {
                                setMode('register');
                                resetFormStatus();
                            }}
                            style={{
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(96, 173, 94, 0.4)',
                                color: 'var(--primary-light)',
                                width: '100%',
                                transition: 'all 0.25s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(96, 173, 94, 0.12)';
                                e.currentTarget.style.borderColor = 'var(--primary-light)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                e.currentTarget.style.borderColor = 'rgba(96, 173, 94, 0.4)';
                            }}
                        >
                            <Sparkles size={16} />
                            <span>Crear Cuenta Demo Gratis</span>
                        </button>
                    </form>
                )}

                {/* ==================================================== */}
                {/* 2. MODO REGISTRO DEMO */}
                {/* ==================================================== */}
                {mode === 'register' && (
                    <form onSubmit={handleRegister}>
                        {/* Nombre y Apellido en 2 columnas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Nombre</label>
                                <input
                                    type="text"
                                    placeholder="Juan"
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
                                    required
                                    style={{ marginBottom: '14px' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Apellido</label>
                                <input
                                    type="text"
                                    placeholder="Pérez"
                                    value={apellido}
                                    onChange={(e) => setApellido(e.target.value)}
                                    required
                                    style={{ marginBottom: '14px' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Correo Electrónico</label>
                            <input
                                type="email"
                                autoComplete="email"
                                placeholder="tuemail@ganaderia.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={{ marginBottom: '14px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    style={{ paddingRight: '42px', marginBottom: '8px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '14px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        width: 'auto',
                                        padding: 0,
                                        cursor: 'pointer'
                                    }}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>

                            {/* Indicadores en vivo de requisitos de contraseña */}
                            {password.length > 0 && (
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: '1fr 1fr', 
                                    gap: '6px', 
                                    background: 'rgba(0,0,0,0.25)', 
                                    padding: '8px 10px', 
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    marginBottom: '14px'
                                }}>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.minLength ? '#4caf50' : 'var(--text-muted)' 
                                    }}>
                                        {passwordRequirements.minLength ? <Check size={13} /> : <X size={13} />}
                                        <span>Mín. 8 caracteres</span>
                                    </div>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.hasUpper ? '#4caf50' : 'var(--text-muted)' 
                                    }}>
                                        {passwordRequirements.hasUpper ? <Check size={13} /> : <X size={13} />}
                                        <span>Una mayúscula</span>
                                    </div>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.hasLower ? '#4caf50' : 'var(--text-muted)' 
                                    }}>
                                        {passwordRequirements.hasLower ? <Check size={13} /> : <X size={13} />}
                                        <span>Una minúscula</span>
                                    </div>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.hasSpecial ? '#4caf50' : 'var(--text-muted)' 
                                    }}>
                                        {passwordRequirements.hasSpecial ? <Check size={13} /> : <X size={13} />}
                                        <span>Carácter especial</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Nombre de la Ganadería u Organización</label>
                            <input
                                type="text"
                                placeholder="Ej. Ganadería Santa María"
                                value={orgName}
                                onChange={(e) => setOrgName(e.target.value)}
                                required
                                style={{ marginBottom: '14px' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Nombre de la Finca Inicial</label>
                            <input
                                type="text"
                                placeholder="Ej. Finca Principal"
                                value={fincaName}
                                onChange={(e) => setFincaName(e.target.value)}
                                required
                                style={{ marginBottom: '18px' }}
                            />
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading || (password.length > 0 && !isPasswordValid)} 
                            style={{ marginTop: '4px' }}
                        >
                            {loading ? 'Creando Cuenta Demo...' : 'Registrarse y Comenzar'}
                        </button>

                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setMode('login');
                                    resetFormStatus();
                                }} 
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'var(--primary-light)', 
                                    padding: 0, 
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    width: 'auto',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    textTransform: 'none',
                                    letterSpacing: 'normal'
                                }}
                            >
                                <ArrowLeft size={16} />
                                <span>¿Ya tienes cuenta? Inicia sesión aquí</span>
                            </button>
                        </div>
                    </form>
                )}

                {/* ==================================================== */}
                {/* 3. MODO RECUPERAR CONTRASEÑA */}
                {/* ==================================================== */}
                {mode === 'forgot' && (
                    <form onSubmit={handleResetPassword}>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px', textAlign: 'center' }}>
                            Ingresa tu correo registrado y te enviaremos un enlace seguro para restablecer tu contraseña.
                        </p>

                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Correo Electrónico</label>
                            <input
                                type="email"
                                autoComplete="email"
                                placeholder="ejemplo@finca.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <button type="submit" disabled={loading} style={{ marginTop: '8px' }}>
                            {loading ? 'Enviando...' : 'Enviar Enlace de Recuperación'}
                        </button>
                        
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setMode('login');
                                    resetFormStatus();
                                }} 
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'var(--primary-light)', 
                                    padding: 0, 
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    width: 'auto',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    textTransform: 'none',
                                    letterSpacing: 'normal'
                                }}
                            >
                                <ArrowLeft size={16} />
                                <span>Volver al inicio de sesión</span>
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
