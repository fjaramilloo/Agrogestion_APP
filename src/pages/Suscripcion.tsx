import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    Award, CheckCircle2, ShieldCheck,
    Building2, Tractor, Calendar, MessageCircle,
    Clock, Sparkles
} from 'lucide-react';

type Periodicidad = 'mensual' | 'semestral' | 'anual';

export default function Suscripcion() {
    const { licenciaInfo } = useAuth();
    const { licencia, limiteAnimales, totalAnimalesOrganizacion, fechaInicioLicencia, fechaVencimientoLicencia, organizacionNombre } = licenciaInfo;

    const [periodicidad, setPeriodicidad] = useState<Periodicidad>('anual');

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

    const getWhatsappLink = (
        planNombre: string,
        actionType: 'renovar' | 'mejora' | 'disminucion',
        periodo: Periodicidad = periodicidad,
        totalTexto?: string
    ) => {
        let textAction = 'activación/renovación';
        if (actionType === 'mejora') textAction = 'mejora (upgrade)';
        if (actionType === 'disminucion') textAction = 'disminución (downgrade)';

        const periodoStr = periodo === 'mensual' ? 'Mensual' : periodo === 'semestral' ? 'Semestral' : 'Anual';
        const detallePeriodo = planNombre.toLowerCase().includes('demo')
            ? 'Modalidad: Gratuito siempre'
            : `Periodicidad: ${periodoStr}${totalTexto ? ` (${totalTexto})` : ''}`;

        const msg = `Hola, deseo solicitar la ${textAction} de mi licencia en AgroGestión.\nOrganización: ${organizacionNombre || 'Mi Empresa'}\nPlan solicitado: ${planNombre}\n${detallePeriodo}`;
        return `https://wa.me/573117424489?text=${encodeURIComponent(msg)}`;
    };

    const generalWhatsappLink = getWhatsappLink(
        'Plan Finca / Hacienda (Premium)',
        'renovar',
        periodicidad,
        periodicidad === 'mensual' ? '$80.000 - $180.000 COP/mes' : periodicidad === 'semestral' ? '$420.000 - $990.000 COP' : '$720.000 - $1.800.000 COP'
    );

    const getProgressColor = () => {
        if (porcentajeUso >= 90) return 'linear-gradient(90deg, #f59e0b, #ef4444)';
        if (porcentajeUso >= 75) return 'linear-gradient(90deg, #3b82f6, #f59e0b)';
        return 'linear-gradient(90deg, #10b981, #3b82f6)';
    };

    const pricingData: Record<string, Record<Periodicidad, { precio: string; subprecio: string; totalTexto: string; ahorroTag?: string }>> = {
        demo: {
            mensual: { precio: 'Gratis', subprecio: 'Prueba sin límite de tiempo', totalTexto: 'Gratis', ahorroTag: undefined },
            semestral: { precio: 'Gratis', subprecio: 'Prueba sin límite de tiempo', totalTexto: 'Gratis', ahorroTag: undefined },
            anual: { precio: 'Gratis', subprecio: 'Prueba sin límite de tiempo', totalTexto: 'Gratis', ahorroTag: undefined },
        },
        finca: {
            mensual: {
                precio: '$80.000 / mes',
                subprecio: '$80.000 COP cobro mensual',
                totalTexto: '$80.000 COP mensual',
                ahorroTag: undefined
            },
            semestral: {
                precio: '$70.000 / mes',
                subprecio: '$420.000 COP cobro cada 6 meses',
                totalTexto: '$420.000 COP semestral',
                ahorroTag: 'Ahorras $60.000'
            },
            anual: {
                precio: '$60.000 / mes',
                subprecio: '$720.000 COP cobro anual',
                totalTexto: '$720.000 COP anual',
                ahorroTag: 'Ahorras $240.000 (25% OFF)'
            }
        },
        premium: {
            mensual: {
                precio: '$180.000 / mes',
                subprecio: '$180.000 COP cobro mensual',
                totalTexto: '$180.000 COP mensual',
                ahorroTag: undefined
            },
            semestral: {
                precio: '$165.000 / mes',
                subprecio: '$990.000 COP cobro cada 6 meses',
                totalTexto: '$990.000 COP semestral',
                ahorroTag: 'Ahorras $90.000'
            },
            anual: {
                precio: '$150.000 / mes',
                subprecio: '$1.800.000 COP cobro anual',
                totalTexto: '$1.800.000 COP anual',
                ahorroTag: 'Ahorras $360.000 (16% OFF)'
            }
        }
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
                'Carga de plano KMZ/KML (Vista previa de potreros y áreas)',
                'Precios de mercado (Nivel Nacional)',
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
                'Acceso a AgroBot (IA Mentora)',
                'Hasta 500 animales activos',
                'Plano interactivo de finca con Lotes, Pesos promedio y Días de ocupación',
                'Traslado rápido de ganado entre potreros desde el mapa',
                'Precios de mercado regionales (Subastas en tiempo real)',
                'Historial y tendencias de precios ganaderos',
                '1 vaquero + 1 observador/visualizador',
                'Cálculo de GDP e indicadores KPI',
                'Exportación de datos a Excel/CSV'
            ]
        },
        {
            id: 'premium',
            nombre: 'Plan Hacienda (Premium)',
            badge: 'Empresarial',
            limite: 'Animales Ilimitados',
            color: '#c084fc',
            border: 'rgba(192, 132, 252, 0.4)',
            bg: 'rgba(192, 132, 252, 0.08)',
            caracteristicas: [
                'Animales activos ilimitados',
                'Geolocalización GPS en campo en tiempo real sobre el plano de la finca',
                'Detección automática de potrero actual con métricas zootécnicas en vivo',
                'Plano satelital y multi-finca interactivo completo',
                'Valoración Patrimonial del Inventario Vivo en tiempo real',
                'Precios de mercado regionales e históricos',
                'Múltiples fincas y rotaciones',
                'Dashboard Consolidado Multi-Finca',
                'Traslados Inter-Fincas con 1 clic',
                'Roles y usuarios ilimitados',
                'AgroBot Empresarial con soporte prioritario'
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

            {/* Comparison Cards Header & Billing Period Selector */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                marginBottom: '26px'
            }}>
                <div>
                    <h3 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 700, color: 'white' }}>
                        Planes Disponibles
                    </h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        Selecciona el nivel y la periodicidad que mejor se adapte a las necesidades de tu hato ganadero
                    </p>
                </div>

                {/* Selector con 3 posiciones: Mensual, Semestral, Anual */}
                <div style={{
                    display: 'inline-flex',
                    background: 'rgba(20, 20, 32, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '14px',
                    padding: '4px',
                    gap: '4px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <button
                        type="button"
                        onClick={() => setPeriodicidad('mensual')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: periodicidad === 'mensual' ? 700 : 500,
                            color: periodicidad === 'mensual' ? '#ffffff' : 'var(--text-muted)',
                            background: periodicidad === 'mensual'
                                ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
                                : 'transparent',
                            boxShadow: periodicidad === 'mensual' ? '0 2px 10px rgba(124, 58, 237, 0.4)' : 'none',
                            transition: 'all 0.2s ease',
                            outline: 'none'
                        }}
                    >
                        <span>Mensual</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPeriodicidad('semestral')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: periodicidad === 'semestral' ? 700 : 500,
                            color: periodicidad === 'semestral' ? '#ffffff' : 'var(--text-muted)',
                            background: periodicidad === 'semestral'
                                ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
                                : 'transparent',
                            boxShadow: periodicidad === 'semestral' ? '0 2px 10px rgba(124, 58, 237, 0.4)' : 'none',
                            transition: 'all 0.2s ease',
                            outline: 'none'
                        }}
                    >
                        <span>Semestral</span>
                        <span style={{
                            fontSize: '0.68rem',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            background: periodicidad === 'semestral' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(56, 189, 248, 0.15)',
                            color: periodicidad === 'semestral' ? '#ffffff' : '#38bdf8',
                            border: periodicidad === 'semestral' ? 'none' : '1px solid rgba(56, 189, 248, 0.3)',
                        }}>
                            Ahorro
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPeriodicidad('anual')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: periodicidad === 'anual' ? 700 : 500,
                            color: periodicidad === 'anual' ? '#ffffff' : 'var(--text-muted)',
                            background: periodicidad === 'anual'
                                ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
                                : 'transparent',
                            boxShadow: periodicidad === 'anual' ? '0 2px 10px rgba(124, 58, 237, 0.4)' : 'none',
                            transition: 'all 0.2s ease',
                            outline: 'none'
                        }}
                    >
                        <span>Anual</span>
                        <span style={{
                            fontSize: '0.68rem',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            fontWeight: 800,
                            background: periodicidad === 'anual' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(16, 185, 129, 0.15)',
                            color: periodicidad === 'anual' ? '#ffffff' : '#34d399',
                            border: periodicidad === 'anual' ? 'none' : '1px solid rgba(16, 185, 129, 0.3)',
                        }}>
                            Hasta 25% OFF
                        </span>
                    </button>
                </div>
            </div>

            {/* Plans Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                {planes.map(plan => {
                    const esPlanActual = licencia === plan.id;
                    const currentPricing = pricingData[plan.id]?.[periodicidad] || { precio: '', subprecio: '', totalTexto: '' };

                    const planRanks: Record<string, number> = { demo: 0, finca: 1, premium: 2 };
                    const currentRank = planRanks[licencia] ?? 0;
                    const cardRank = planRanks[plan.id] ?? 0;

                    let buttonText = 'Renovar Plan';
                    let actionType: 'renovar' | 'mejora' | 'disminucion' = 'renovar';
                    if (!esPlanActual) {
                        if (cardRank > currentRank) {
                            buttonText = 'Solicitar Mejora';
                            actionType = 'mejora';
                        } else {
                            buttonText = 'Solicitar Disminución';
                            actionType = 'disminucion';
                        }
                    }
                    const planWhatsappLink = getWhatsappLink(plan.nombre, actionType, periodicidad, currentPricing.totalTexto);

                    return (
                        <div
                            key={plan.id}
                            style={{
                                background: plan.bg,
                                border: `1.5px solid ${esPlanActual ? '#a78bfa' : plan.border}`,
                                borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column',
                                position: 'relative', boxShadow: esPlanActual ? '0 0 25px rgba(167, 139, 250, 0.2)' : 'none',
                                transition: 'transform 0.2s ease, border-color 0.2s ease'
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

                            <div style={{ marginBottom: '18px' }}>
                                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'white' }}>
                                    {currentPricing.precio}
                                </div>
                                {currentPricing.subprecio && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 500 }}>
                                        {currentPricing.subprecio}
                                    </div>
                                )}
                                {currentPricing.ahorroTag && (
                                    <div style={{ marginTop: '6px' }}>
                                        <span style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            color: '#34d399',
                                            background: 'rgba(16, 185, 129, 0.12)',
                                            border: '1px solid rgba(16, 185, 129, 0.28)',
                                            borderRadius: '6px',
                                            padding: '2px 8px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <Sparkles size={11} />
                                            {currentPricing.ahorroTag}
                                        </span>
                                    </div>
                                )}
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: plan.color, marginTop: '8px' }}>
                                    {plan.limite}
                                </div>
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
                                href={planWhatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    padding: '12px', borderRadius: '10px', textDecoration: 'none', fontWeight: 700,
                                    fontSize: '0.9rem', transition: 'all 0.2s',
                                    background: esPlanActual
                                        ? 'rgba(255,255,255,0.08)'
                                        : actionType === 'mejora'
                                            ? `linear-gradient(135deg, ${plan.color}, #7c3aed)`
                                            : 'rgba(255,255,255,0.04)',
                                    color: actionType === 'disminucion' ? 'var(--text-muted)' : 'white',
                                    border: esPlanActual
                                        ? '1px solid rgba(255,255,255,0.2)'
                                        : actionType === 'disminucion'
                                            ? '1px solid rgba(255,255,255,0.1)'
                                            : 'none'
                                }}
                            >
                                <MessageCircle size={18} />
                                {buttonText}
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
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Elige entre el Plan Finca (500 animales) o Hacienda/Premium (Ilimitado), en modalidad mensual, semestral o anual.</div>
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
                        href={generalWhatsappLink}
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
