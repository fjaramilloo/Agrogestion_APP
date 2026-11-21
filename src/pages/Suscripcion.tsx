import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
    Award, CheckCircle2, ShieldCheck,
    Building2, Calendar, MessageCircle,
    Clock, Sparkles, AlertTriangle
} from 'lucide-react';
import { CowIcon } from '../components/CowIcon';
import './Suscripcion.css';

type Periodicidad = 'mensual' | 'semestral' | 'anual';

export default function Suscripcion() {
    const { licenciaInfo } = useAuth();
    const { theme } = useTheme();
    const accentPurple = theme === 'light' ? '#7c3aed' : '#a78bfa';
    const accentPurpleSoft = theme === 'light' ? '#6d28d9' : '#c084fc';
    const { licencia, limiteAnimales, totalAnimalesOrganizacion, fechaInicioLicencia, fechaVencimientoLicencia, organizacionNombre } = licenciaInfo;

    const [periodicidad, setPeriodicidad] = useState<Periodicidad>('anual');

    const porcentajeUso = Math.min(100, Math.round((totalAnimalesOrganizacion / (limiteAnimales || 1)) * 100));

    const diasRestantesVencimiento = (licencia !== 'demo' && fechaVencimientoLicencia)
        ? Math.ceil((new Date(fechaVencimientoLicencia).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        : null;

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
        return `https://wa.me/fedejaramilloo?text=${encodeURIComponent(msg)}`;
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

    const isLight = theme === 'light';
    const planes = [
        {
            id: 'demo',
            nombre: 'Plan Demo',
            badge: 'Gratuito',
            limite: 'Hasta 40 animales',
            color: isLight ? '#b45309' : '#ffb74d',
            border: isLight ? 'rgba(217, 119, 6, 0.35)' : 'rgba(255, 183, 77, 0.3)',
            bg: isLight ? '#fffbeb' : 'rgba(255, 183, 77, 0.05)',
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
            color: isLight ? '#0369a1' : '#38bdf8',
            border: isLight ? 'rgba(2, 132, 199, 0.45)' : 'rgba(56, 189, 248, 0.4)',
            bg: isLight ? '#f0f9ff' : 'rgba(56, 189, 248, 0.08)',
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
            color: accentPurpleSoft,
            border: isLight ? 'rgba(124, 58, 237, 0.4)' : 'rgba(192, 132, 252, 0.4)',
            bg: isLight ? '#faf5ff' : 'rgba(192, 132, 252, 0.08)',
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
        <div className="suscripcion-page">
            {/* Header */}
            <div className="suscripcion-header">
                <div className="suscripcion-header-inner">
                    <div className="suscripcion-header-icon">
                        <Award size={26} color={accentPurple} />
                    </div>
                    <div>
                        <h1 className="suscripcion-title">
                            Estado de Suscripción y Licencia
                        </h1>
                        <p className="suscripcion-subtitle">
                            Consulta los límites de tu plan actual y las opciones para extender tu hato ganadero
                        </p>
                    </div>
                </div>
            </div>

            {/* Current Plan Status Card */}
            <div className="suscripcion-current-card">
                <div className="suscripcion-current-header">
                    <div>
                        <div className="suscripcion-org-meta">
                            <Building2 size={16} color={accentPurple} />
                            <span className="suscripcion-org-name">
                                {organizacionNombre || 'Tu Organización'}
                            </span>
                        </div>
                        <h2 className="suscripcion-current-plan-title">
                            Plan Actual: <span className="suscripcion-current-plan-badge">{licencia}</span>
                        </h2>
                    </div>

                    <div className="suscripcion-status-chips">
                        {/* Inicio de Plan */}
                        <div className="suscripcion-chip">
                            <Clock size={16} color={accentPurple} style={{ flexShrink: 0 }} />
                            <div>
                                <div className="suscripcion-chip-label">Inicio de Plan</div>
                                <div className="suscripcion-chip-value">{formatDate(fechaInicioLicencia)}</div>
                            </div>
                        </div>

                        {/* Fin de Vigencia */}
                        {(licencia === 'demo' || !fechaVencimientoLicencia) ? (
                            <div className="suscripcion-chip" style={{ background: 'var(--success-soft-bg)', borderColor: 'var(--success-soft-border)' }}>
                                <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                                <div>
                                    <div className="suscripcion-chip-label" style={{ color: 'var(--success)' }}>Fin de Vigencia</div>
                                    <div className="suscripcion-chip-value">Indefinida / Sin Límite</div>
                                </div>
                            </div>
                        ) : (
                            <div
                                className="suscripcion-chip"
                                style={{
                                    background: diasRestantesVencimiento !== null && diasRestantesVencimiento <= 8 ? 'var(--error-soft-bg)' : 'var(--info-soft-bg)',
                                    borderColor: diasRestantesVencimiento !== null && diasRestantesVencimiento <= 8 ? 'var(--error-soft-border)' : 'var(--info-soft-border)',
                                }}
                            >
                                <Calendar size={16} color={diasRestantesVencimiento !== null && diasRestantesVencimiento <= 8 ? 'var(--error)' : 'var(--info)'} style={{ flexShrink: 0 }} />
                                <div>
                                    <div
                                        className="suscripcion-chip-label"
                                        style={{ color: diasRestantesVencimiento !== null && diasRestantesVencimiento <= 8 ? 'var(--error)' : 'var(--info)' }}
                                    >
                                        Fin de Vigencia
                                    </div>
                                    <div className="suscripcion-chip-value">
                                        <span>{formatDate(fechaVencimientoLicencia)}</span>
                                        {diasRestantesVencimiento !== null && (
                                            <span style={{
                                                fontSize: '0.68rem',
                                                padding: '2px 6px',
                                                borderRadius: '5px',
                                                fontWeight: 700,
                                                background: diasRestantesVencimiento < 0 ? 'var(--error-soft-bg)' : diasRestantesVencimiento <= 8 ? 'var(--warning-soft-bg)' : 'var(--success-soft-bg)',
                                                color: diasRestantesVencimiento < 0 ? 'var(--error)' : diasRestantesVencimiento <= 8 ? 'var(--warning)' : 'var(--success)'
                                            }}>
                                                {diasRestantesVencimiento < 0
                                                    ? 'Vencida'
                                                    : diasRestantesVencimiento === 0
                                                        ? 'Vence hoy'
                                                        : `${diasRestantesVencimiento} días`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Banner de Aviso de Vencimiento Próximo (8 días o menos) */}
                {diasRestantesVencimiento !== null && diasRestantesVencimiento <= 8 && (
                    <div className="suscripcion-alert-banner expiry">
                        <div className="suscripcion-alert-content">
                            <AlertTriangle size={20} color="var(--error)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div className="suscripcion-alert-title">
                                    {diasRestantesVencimiento < 0
                                        ? '¡Tu suscripción se encuentra vencida!'
                                        : diasRestantesVencimiento === 0
                                            ? '¡Tu suscripción vence el día de hoy!'
                                            : `¡Atención! Tu suscripción vence en ${diasRestantesVencimiento} día${diasRestantesVencimiento === 1 ? '' : 's'}`}
                                </div>
                                <div className="suscripcion-alert-desc">
                                    Renueva tu plan ahora para garantizar la continuidad operativa de tus registros y reportes ganaderos.
                                </div>
                            </div>
                        </div>
                        <a
                            href={getWhatsappLink(licencia === 'premium' ? 'Plan Premium' : 'Plan Finca', 'renovar', periodicidad)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="suscripcion-alert-btn"
                        >
                            <MessageCircle size={15} /> Renovar por WhatsApp
                        </a>
                    </div>
                )}

                {/* Banner de Sobrecupo si totalAnimalesOrganizacion > limiteAnimales */}
                {(totalAnimalesOrganizacion > limiteAnimales) && (
                    <div className="suscripcion-alert-banner overflow">
                        <div className="suscripcion-alert-content">
                            <AlertTriangle size={20} color="var(--error)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div className="suscripcion-alert-title">
                                    ¡Capacidad Excedida - Modo Solo Lectura Activo!
                                </div>
                                <div className="suscripcion-alert-desc">
                                    Tienes {totalAnimalesOrganizacion.toLocaleString('es-CO')} animales registrados, lo cual supera el límite de {limiteAnimales.toLocaleString('es-CO')} de tu plan actual. Para reanudar el registro de pesajes, compras y traslados, adquiere un plan con mayor capacidad.
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Progress bar info */}
                <div className="suscripcion-usage-box">
                    <div className="suscripcion-usage-header">
                        <span className="suscripcion-usage-label">
                            <CowIcon size={18} color="var(--primary-light)" />
                            Capacidad utilizada de animales activos:
                        </span>
                        <div className="suscripcion-usage-stat">
                            <span style={{ color: porcentajeUso >= 90 ? 'var(--error)' : 'var(--text-main)' }}>
                                {totalAnimalesOrganizacion.toLocaleString('es-CO')} / {limiteAnimales >= 999999 ? '∞ (Ilimitado)' : limiteAnimales.toLocaleString('es-CO')}
                            </span>
                            <span
                                className="suscripcion-usage-badge"
                                style={{
                                    color: porcentajeUso >= 90 ? 'var(--error)' : porcentajeUso >= 75 ? 'var(--warning)' : 'var(--success)',
                                    background: porcentajeUso >= 90 ? 'var(--error-soft-bg)' : porcentajeUso >= 75 ? 'var(--warning-soft-bg)' : 'var(--success-soft-bg)',
                                    border: `1px solid ${porcentajeUso >= 90 ? 'var(--error-soft-border)' : porcentajeUso >= 75 ? 'var(--warning-soft-border)' : 'var(--success-soft-border)'}`
                                }}
                            >
                                {porcentajeUso}% usado
                            </span>
                        </div>
                    </div>

                    <div className="suscripcion-progress-track">
                        <div
                            className="suscripcion-progress-fill"
                            style={{
                                width: `${porcentajeUso}%`,
                                background: getProgressColor()
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Header de Planes Disponibles */}
            <div className="suscripcion-section-header">
                <h3 className="suscripcion-section-title">
                    Planes Disponibles
                </h3>
                <p className="suscripcion-section-subtitle">
                    Selecciona el nivel y la periodicidad que mejor se adapte a las necesidades de tu hato ganadero
                </p>
            </div>

            {/* Selector de Periodicidad: 3 columnas responsivas sin desbordamiento */}
            <div className="suscripcion-periodo-wrapper">
                <div className="suscripcion-periodo-pills">
                    <button
                        type="button"
                        onClick={() => setPeriodicidad('mensual')}
                        className={`suscripcion-periodo-btn ${periodicidad === 'mensual' ? 'active' : ''}`}
                    >
                        <span>Mensual</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPeriodicidad('semestral')}
                        className={`suscripcion-periodo-btn ${periodicidad === 'semestral' ? 'active' : ''}`}
                    >
                        <span>Semestral</span>
                        <span className="suscripcion-periodo-badge semestral">
                            Ahorro
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPeriodicidad('anual')}
                        className={`suscripcion-periodo-btn ${periodicidad === 'anual' ? 'active' : ''}`}
                    >
                        <span>Anual</span>
                        <span className="suscripcion-periodo-badge anual">
                            Hasta 25% OFF
                        </span>
                    </button>
                </div>
            </div>

            {/* Grid de Planes */}
            <div className="suscripcion-planes-grid">
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
                            className={`suscripcion-plan-card ${esPlanActual ? 'actual' : ''}`}
                            style={{
                                background: plan.bg,
                                border: `1.5px solid ${esPlanActual ? accentPurple : plan.border}`,
                                boxShadow: isLight ? 'var(--shadow-card)' : undefined,
                            }}
                        >
                            {esPlanActual && (
                                <div className="suscripcion-plan-actual-tag">
                                    Tu Plan Actual
                                </div>
                            )}

                            <div className="suscripcion-plan-top">
                                <h4 className="suscripcion-plan-name" style={{ color: plan.color }}>
                                    {plan.nombre}
                                </h4>
                                <span
                                    className="suscripcion-plan-badge"
                                    style={{
                                        border: `1px solid ${plan.border}`,
                                        color: plan.color
                                    }}
                                >
                                    {plan.badge}
                                </span>
                            </div>

                            <div className="suscripcion-plan-pricing">
                                <div className="suscripcion-plan-price-main">
                                    {currentPricing.precio}
                                </div>
                                {currentPricing.subprecio && (
                                    <div className="suscripcion-plan-subprice">
                                        {currentPricing.subprecio}
                                    </div>
                                )}
                                {currentPricing.ahorroTag && (
                                    <div className="suscripcion-plan-ahorro">
                                        <span className="suscripcion-plan-ahorro-tag">
                                            <Sparkles size={12} />
                                            {currentPricing.ahorroTag}
                                        </span>
                                    </div>
                                )}
                                <div
                                    className="suscripcion-plan-capacity-tag"
                                    style={{ color: plan.color }}
                                >
                                    <CowIcon size={16} color={plan.color} />
                                    <span>{plan.limite}</span>
                                </div>
                            </div>

                            <ul className="suscripcion-feature-list">
                                {plan.caracteristicas.map((carac, idx) => (
                                    <li key={idx} className="suscripcion-feature-item">
                                        <CheckCircle2 size={16} color={plan.color} className="suscripcion-feature-icon" />
                                        <span className="suscripcion-feature-text">{carac}</span>
                                    </li>
                                ))}
                            </ul>

                            <a
                                href={planWhatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="suscripcion-plan-btn"
                                style={{
                                    background: esPlanActual
                                        ? 'var(--surface-subtle)'
                                        : actionType === 'mejora'
                                            ? (isLight
                                                ? (plan.id === 'finca' ? 'linear-gradient(135deg, #0284c7, #6d28d9)' : 'linear-gradient(135deg, #7c3aed, #5b21b6)')
                                                : `linear-gradient(135deg, ${plan.color}, #7c3aed)`)
                                            : 'var(--surface-subtle)',
                                    color: esPlanActual
                                        ? 'var(--text-main)'
                                        : actionType === 'mejora'
                                            ? '#ffffff'
                                            : 'var(--text-muted)',
                                    border: esPlanActual
                                        ? '1px solid var(--border-strong)'
                                        : actionType === 'disminucion'
                                            ? '1px solid var(--border-subtle)'
                                            : 'none'
                                }}
                            >
                                <MessageCircle size={18} />
                                <span>{buttonText}</span>
                            </a>
                        </div>
                    );
                })}
            </div>

            {/* Manual Payment Section */}
            <div className="suscripcion-activacion-card">
                <div className="suscripcion-activacion-header">
                    <ShieldCheck size={22} color={accentPurple} />
                    <h3 className="suscripcion-activacion-title">
                        ¿Cómo realizar la activación de tu plan?
                    </h3>
                </div>

                <p className="suscripcion-activacion-desc">
                    Actualmente gestionamos la activación de licencias mediante <strong>transferencia bancaria directa</strong>. Sigue estos 3 sencillos pasos:
                </p>

                <div className="suscripcion-steps-grid">
                    <div className="suscripcion-step-item">
                        <div className="suscripcion-step-num">1</div>
                        <div className="suscripcion-step-title">Selecciona tu plan</div>
                        <div className="suscripcion-step-desc">Elige entre el Plan Finca (500 animales) o Hacienda/Premium (Ilimitado), en modalidad mensual, semestral o anual.</div>
                    </div>

                    <div className="suscripcion-step-item">
                        <div className="suscripcion-step-num">2</div>
                        <div className="suscripcion-step-title">Realiza la transferencia</div>
                        <div className="suscripcion-step-desc">Realiza el pago a nuestras cuentas bancarias autorizadas.</div>
                    </div>

                    <div className="suscripcion-step-item">
                        <div className="suscripcion-step-num">3</div>
                        <div className="suscripcion-step-title">Envía el comprobante</div>
                        <div className="suscripcion-step-desc">Envíanos el soporte por WhatsApp indicando el nombre de tu empresa u organización.</div>
                    </div>
                </div>

                <div>
                    <a
                        href={generalWhatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="suscripcion-activacion-btn"
                    >
                        <MessageCircle size={18} />
                        <span>Contactar por WhatsApp para Activar</span>
                    </a>
                </div>
            </div>
        </div>
    );
}
