import { useAuth } from '../contexts/AuthContext';
import {
    Award, CheckCircle2, ShieldCheck,
    Building2, Tractor, Calendar, MessageCircle,
    Clock
} from 'lucide-react';

export default function Suscripcion() {
    const { licenciaInfo } = useAuth();
    const { licencia, limiteAnimales, totalAnimalesOrganizacion, fechaInicioLicencia, fechaVencimientoLicencia, organizacionNombre } = licenciaInfo;

    const porcentajeUso = Math.min(100, Math.round((totalAnimalesOrganizacion / (limiteAnimales || 1)) * 100));

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Sin fecha';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch {
            return 'Sin fecha';
        }
    };

    const whatsappMessage = encodeURIComponent(
        `Hola, deseo solicitar la activación/renovación de mi licencia en AgroGestión.\nOrganización: ${organizacionNombre || 'Mi Empresa'}\nPlan deseado: Plan Finca / Premium`
    );
    const whatsappLink = `https://wa.me/573000000000?text=${whatsappMessage}`;

    const getProgressColor = () => {
        if (porcentajeUso >= 90) return 'linear-gradient(90deg, #f59e0b, #ef4444)';
        if (porcentajeUso >= 75) return 'linear-gradient(90deg, #3b82f6, #f59e0b)';
        return 'linear-gradient(90deg, #10b981, #3b82f6)';
    };

    const planes = [
        {
            id: 'demo',
            nombre: 'Plan Demo',
            badge: 'Gratuito',
            limite: 'Hasta 40 animales',
            color: '#ffb74d',
            border: 'rgba(255, 183, 77, 0.3)',
            bg: 'rgba(255, 183, 77, 0.05)',
            caracteristicas: [
                'Hasta 40 animales activos',
                '1 finca autorizada',
                '1 usuario vaquero adicional',
                'Pesaje y control de pastoreo',
                'Reportes zootécnicos básicos'
            ]
        },
        {
            id: 'finca',
            nombre: 'Plan Finca',
            badge: 'Más Popular',
            limite: 'Hasta 500 animales',
            color: '#38bdf8',
            border: 'rgba(56, 189, 248, 0.4)',
            bg: 'rgba(56, 189, 248, 0.08)',
            popular: true,
            caracteristicas: [
                'Hasta 500 animales activos',
                '1 finca (posibilidad de agregar más)',
                '1 vaquero + 1 observador/visualizador',
                'Cálculo de GDP e indicadores KPI',
                'Historial de compras y ventas',
                'Exportación de datos a Excel/CSV'
            ]
        },
        {
            id: 'premium',
            nombre: 'Plan Premium',
            badge: 'Empresarial',
            limite: 'Animales Ilimitados',
            color: '#c084fc',
            border: 'rgba(192, 132, 252, 0.4)',
            bg: 'rgba(192, 132, 252, 0.08)',
            caracteristicas: [
                'Animales activos ilimitados',
                'Múltiples fincas y rotaciones',
                'Roles y usuarios ilimitados',
                'Reportes avanzados de rentabilidad',
                'Atención y soporte personalizado'
            ]
        }
    ];

    return (
        <div className="page-container">
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
                    <div style={{ background: 'rgba(124, 58, 237, 0.15)', border: '1px solid rgba(124, 58, 237, 0.4)', borderRadius: '12px', padding: '10px', display: 'flex' }}>
                        <Award size={28} color="#a78bfa" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Estado de Suscripción y Licencia
                        </h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Consulta los límites de tu plan actual y las opciones para extender tu hato
                        </p>
                    </div>
                </div>
            </div>

            {/* Current Plan Status Card */}
            <div style={{ background: 'linear-gradient(145deg, rgba(30,30,45,0.8), rgba(20,20,35,0.9))', border: '1px solid rgba(124, 58, 237, 0.3)', borderRadius: '16px', padding: '24px', marginBottom: '32px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <Building2 size={18} color="#a78bfa" />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700 }}>
                                {organizacionNombre || 'Tu Organización'}
                            </span>
                        </div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            Plan Actual: <span style={{ color: '#a78bfa', textTransform: 'uppercase' }}>{licencia}</span>
                        </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={16} color="#a78bfa" />
                            <div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inicio de Plan</div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'white' }}>{formatDate(fechaInicioLicencia)}</div>
                            </div>
                        </div>

                        {fechaVencimientoLicencia && (
                            <div style={{ background: 'rgba(244,67,54,0.08)', border: '1px solid rgba(244,67,54,0.2)', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Calendar size={16} color="#f87171" />
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#f87171', textTransform: 'uppercase' }}>Vencimiento</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'white' }}>{formatDate(fechaVencimientoLicencia)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress bar info */}
                <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Tractor size={18} color="var(--primary-light)" />
                            Capacidad utilizada de animales activos:
                        </span>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: porcentajeUso >= 90 ? '#f87171' : 'white' }}>
                            {totalAnimalesOrganizacion} / {limiteAnimales >= 999999 ? '∞ (Ilimitado)' : limiteAnimales} animales ({porcentajeUso}%)
                        </span>
                    </div>

                    <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${porcentajeUso}%`, height: '100%', background: getProgressColor(), borderRadius: '5px', transition: 'width 0.4s ease' }} />
                    </div>
                </div>
            </div>

            {/* Comparison Cards Header */}
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>
                    Planes Disponibles
                </h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    Selecciona el nivel que mejor se adapte a las necesidades de tu hato ganadero
                </p>
            </div>

            {/* Plans Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                {planes.map(plan => {
                    const esPlanActual = licencia === plan.id;

                    return (
                        <div
                            key={plan.id}
                            style={{
                                background: plan.bg,
                                border: `1.5px solid ${esPlanActual ? '#a78bfa' : plan.border}`,
                                borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column',
                                position: 'relative', boxShadow: esPlanActual ? '0 0 25px rgba(167, 139, 250, 0.2)' : 'none'
                            }}
                        >
                            {esPlanActual && (
                                <div style={{ position: 'absolute', top: '-12px', right: '20px', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: 'white', padding: '3px 12px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Tu Plan Actual
                                </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: plan.color }}>
                                    {plan.nombre}
                                </h4>
                                <span style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${plan.border}`, color: plan.color, padding: '3px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                                    {plan.badge}
                                </span>
                            </div>

                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', marginBottom: '20px' }}>
                                {plan.limite}
                            </div>

                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {plan.caracteristicas.map((carac, idx) => (
                                    <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>
                                        <CheckCircle2 size={16} color={plan.color} style={{ flexShrink: 0 }} />
                                        <span>{carac}</span>
                                    </li>
                                ))}
                            </ul>

                            <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    padding: '12px', borderRadius: '10px', textDecoration: 'none', fontWeight: 700,
                                    fontSize: '0.9rem', transition: 'all 0.2s',
                                    background: esPlanActual ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg, ${plan.color}, #7c3aed)`,
                                    color: esPlanActual ? 'white' : 'white',
                                    border: esPlanActual ? '1px solid rgba(255,255,255,0.2)' : 'none'
                                }}
                            >
                                <MessageCircle size={18} />
                                {esPlanActual ? 'Renovar Plan' : 'Solicitar Upgrade'}
                            </a>
                        </div>
                    );
                })}
            </div>

            {/* Manual Payment Section */}
            <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <ShieldCheck size={22} color="#a78bfa" />
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>
                        ¿Cómo realizar la activación de tu plan?
                    </h3>
                </div>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                    Actualmente gestionamos la activación de licencias mediante **transferencia bancaria directa**. Sigue estos 3 sencillos pasos:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(124, 58, 237, 0.2)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', marginBottom: '10px' }}>1</div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white', marginBottom: '4px' }}>Selecciona tu plan</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Elige entre el Plan Finca (500 animales) o Premium (Ilimitado).</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(124, 58, 237, 0.2)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', marginBottom: '10px' }}>2</div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white', marginBottom: '4px' }}>Realiza la transferencia</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Realiza el pago a nuestras cuentas bancarias autorizadas.</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(124, 58, 237, 0.2)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', marginBottom: '10px' }}>3</div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white', marginBottom: '4px' }}>Envía el comprobante</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Envíanos el soporte por WhatsApp indicando el nombre de tu empresa.</div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: '#25D366', color: 'white', padding: '12px 24px', borderRadius: '10px',
                            textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)'
                        }}
                    >
                        <MessageCircle size={18} />
                        Contactar por WhatsApp para Activar
                    </a>
                </div>
            </div>
        </div>
    );
}
