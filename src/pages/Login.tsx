import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { evaluatePasswordRequirements, isStrongPassword, PASSWORD_POLICY_ERROR } from '../utils/passwordUtils';
import { Leaf, Check, X, Eye, EyeOff, Sparkles, ArrowLeft, Mail, RefreshCw, ExternalLink } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot' | 'awaiting_confirmation';

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

    // Estados para reenvío de confirmación
    const [resendLoading, setResendLoading] = useState(false);
    const [resendMessage, setResendMessage] = useState<string | null>(null);
    const [resendError, setResendError] = useState<string | null>(null);

    const { user } = useAuth();

    useEffect(() => {
        try {
            localStorage.removeItem('agrogestion_modo_campo');
        } catch {}
    }, []);

    if (user) {
        return <Navigate to="/" replace />;
    }

    // Reglas de validación de contraseña
    const passwordRequirements = evaluatePasswordRequirements(password);
    const isPasswordValid = isStrongPassword(password);

    const resetFormStatus = () => {
        setError(null);
        setMessage(null);
        setResendMessage(null);
        setResendError(null);
    };

    const handleResendConfirmation = async () => {
        if (!email.trim()) return;
        setResendLoading(true);
        setResendMessage(null);
        setResendError(null);
        try {
            const { error: resendErr } = await supabase.auth.resend({
                type: 'signup',
                email: email.trim(),
                options: {
                    emailRedirectTo: `${window.location.origin}`,
                }
            });
            if (resendErr) {
                setResendError(resendErr.message || 'Error al reenviar el correo de activación.');
            } else {
                setResendMessage(`¡Enlace reenviado! Revisa tu bandeja de entrada o spam en ${email.trim()}.`);
            }
        } catch (err: any) {
            setResendError(err.message || 'Error de conexión al reenviar el correo.');
        } finally {
            setResendLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        resetFormStatus();
        try {
            localStorage.removeItem('agrogestion_modo_campo');
        } catch {}

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });
            if (signInError) {
                const msgLower = signInError.message.toLowerCase();
                if (msgLower.includes('email not confirmed') || msgLower.includes('not confirmed') || msgLower.includes('no confirmado')) {
                    setMode('awaiting_confirmation');
                    setError(null);
                    return;
                }
                if (msgLower.includes('invalid login credentials')) {
                    setError('Correo o contraseña incorrectos.');
                } else {
                    setError(signInError.message);
                }
            }
        } catch (err: any) {
            const raw = err?.message || '';
            if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('Load failed')) {
                setError('No se pudo conectar al servidor. Revisa tu conexión a internet.');
            } else {
                setError(raw || "Ocurrió un error al intentar iniciar sesión");
            }
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
            setError(PASSWORD_POLICY_ERROR);
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
                    emailRedirectTo: `${window.location.origin}`,
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
                setMode('awaiting_confirmation');
                resetFormStatus();
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
                    maxWidth: mode === 'register' ? '480px' : mode === 'awaiting_confirmation' ? '450px' : '400px', 
                    transition: 'all 0.3s ease',
                    boxShadow: 'var(--shadow-popover)',
                    border: '1px solid var(--border-subtle)'
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
                        background: 'var(--primary-soft-bg)',
                        border: '1px solid var(--primary-soft-border)',
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
                            background: 'var(--primary-soft-bg)', 
                            border: '1px solid var(--primary-soft-border)',
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
                    ) : mode === 'awaiting_confirmation' ? (
                        <div style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            background: 'var(--success-soft-bg)', 
                            border: '1px solid var(--success-soft-border)',
                            color: 'var(--success)', 
                            padding: '4px 12px', 
                            borderRadius: '20px', 
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            marginTop: '6px'
                        }}>
                            <Mail size={14} />
                            <span>Activación de Cuenta</span>
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
                        backgroundColor: 'var(--success-soft-bg)', 
                        border: '1px solid var(--success-soft-border)',
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
                            color: 'var(--text-faint)' 
                        }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                            <span style={{ padding: '0 12px', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                ¿Aún no tienes cuenta?
                            </span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                        </div>

                        <button 
                            type="button"
                            onClick={() => {
                                setMode('register');
                                resetFormStatus();
                            }}
                            style={{
                                background: 'var(--primary-soft-bg)',
                                border: '1px solid var(--primary-soft-border)',
                                color: 'var(--primary-light)',
                                width: '100%',
                                transition: 'all 0.25s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--surface-subtle-hover)';
                                e.currentTarget.style.borderColor = 'var(--primary-light)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--primary-soft-bg)';
                                e.currentTarget.style.borderColor = 'var(--primary-soft-border)';
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
                                    background: 'var(--surface-inset)', 
                                    padding: '8px 10px', 
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-subtle)',
                                    marginBottom: '14px'
                                }}>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.minLength ? 'var(--success)' : 'var(--text-muted)' 
                                    }}>
                                        {passwordRequirements.minLength ? <Check size={13} /> : <X size={13} />}
                                        <span>Mín. 8 caracteres</span>
                                    </div>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.hasUpper ? 'var(--success)' : 'var(--text-muted)' 
                                    }}>
                                        {passwordRequirements.hasUpper ? <Check size={13} /> : <X size={13} />}
                                        <span>Una mayúscula</span>
                                    </div>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.hasLower ? 'var(--success)' : 'var(--text-muted)' 
                                    }}>
                                        {passwordRequirements.hasLower ? <Check size={13} /> : <X size={13} />}
                                        <span>Una minúscula</span>
                                    </div>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px', 
                                        fontSize: '0.75rem', 
                                        color: passwordRequirements.hasSpecial ? 'var(--success)' : 'var(--text-muted)' 
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

                {/* ==================================================== */}
                {/* 4. MODO ESPERANDO CONFIRMACIÓN DE CORREO */}
                {/* ==================================================== */}
                {mode === 'awaiting_confirmation' && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'var(--success-soft-bg)',
                            border: '2px solid var(--success-soft-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px'
                        }}>
                            <Mail size={32} color="var(--success)" />
                        </div>

                        <h3 style={{ color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 700, margin: '0 0 8px' }}>
                            ¡Revisa tu correo para activar tu cuenta!
                        </h3>

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.5, margin: '0 0 14px' }}>
                            Para garantizar la seguridad de tu ganadería, enviamos un enlace de activación a:
                        </p>

                        <div style={{
                            background: 'var(--surface-subtle)',
                            border: '1px solid var(--success-soft-border)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            marginBottom: '18px',
                            color: 'var(--success)',
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            wordBreak: 'break-all'
                        }}>
                            {email || 'tu correo registrado'}
                        </div>

                        {/* Pasos / Instrucciones */}
                        <div style={{
                            background: 'var(--surface-subtle)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '10px',
                            padding: '14px',
                            textAlign: 'left',
                            fontSize: '0.82rem',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                            marginBottom: '18px'
                        }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <span>1️⃣</span>
                                <span>Abre el correo de <strong>AgroGestión</strong> (asunto <em>Confirm your signup</em>).</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <span>2️⃣</span>
                                <span>Toca el botón verde para activar tu cuenta y entrar de una vez a tu finca.</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', color: 'var(--warning)', fontSize: '0.8rem' }}>
                                <span>💡</span>
                                <span>¿No lo ves en Recibidos? Revisa tu carpeta de <strong>Spam o Correo no deseado</strong>.</span>
                            </div>
                        </div>

                        {/* Botón directo a proveedor de correo */}
                        {email.toLowerCase().includes('@gmail') && (
                            <a
                                href="https://mail.google.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: '#ffffff',
                                    color: '#0f172a',
                                    border: '1px solid var(--border-strong)',
                                    padding: '12px 18px',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    textDecoration: 'none',
                                    marginBottom: '12px',
                                    boxShadow: 'var(--shadow-card)'
                                }}
                            >
                                <Mail size={16} />
                                <span>Abrir mi Gmail</span>
                                <ExternalLink size={14} />
                            </a>
                        )}

                        {(email.toLowerCase().includes('@hotmail') || email.toLowerCase().includes('@outlook')) && (
                            <a
                                href="https://outlook.live.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: '#0078d4',
                                    color: '#ffffff',
                                    padding: '12px 18px',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    textDecoration: 'none',
                                    marginBottom: '12px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                }}
                            >
                                <Mail size={16} />
                                <span>Abrir mi Outlook / Hotmail</span>
                                <ExternalLink size={14} />
                            </a>
                        )}

                        {/* Mensaje de feedback al reenviar */}
                        {resendMessage && (
                            <div style={{
                                color: 'var(--success)',
                                background: 'var(--success-soft-bg)',
                                border: '1px solid var(--success-soft-border)',
                                padding: '10px',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                marginBottom: '12px'
                            }}>
                                {resendMessage}
                            </div>
                        )}

                        {resendError && (
                            <div style={{
                                color: 'var(--error)',
                                background: 'var(--error-soft-bg)',
                                border: '1px solid var(--error-soft-border)',
                                padding: '10px',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                marginBottom: '12px'
                            }}>
                                {resendError}
                            </div>
                        )}

                        {/* Botón Reenviar Correo */}
                        <button
                            type="button"
                            onClick={handleResendConfirmation}
                            disabled={resendLoading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: 'var(--primary-soft-bg)',
                                border: '1px solid var(--primary-soft-border)',
                                color: 'var(--primary-light)',
                                width: '100%',
                                padding: '11px',
                                borderRadius: '10px',
                                fontWeight: 600,
                                fontSize: '0.86rem',
                                cursor: 'pointer',
                                marginBottom: '14px',
                                transition: 'all 0.2s'
                            }}
                        >
                            <RefreshCw size={15} className={resendLoading ? 'animate-spin' : ''} />
                            <span>{resendLoading ? 'Reenviando correo...' : '¿No te llegó? Reenviar enlace de activación'}</span>
                        </button>

                        {/* Opciones de retorno */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setMode('login');
                                    resetFormStatus();
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--primary-light)',
                                    fontSize: '0.86rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: '4px'
                                }}
                            >
                                ← Ya lo confirmé, ir a Iniciar Sesión
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setMode('register');
                                    resetFormStatus();
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.8rem',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    padding: '4px'
                                }}
                            >
                                ¿Escribiste mal tu correo? Volver a registrarte
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
