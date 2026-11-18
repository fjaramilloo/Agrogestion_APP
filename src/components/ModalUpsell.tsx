import { useNavigate } from 'react-router-dom';
import { Award, Sparkles, ArrowRight, X, AlertOctagon } from 'lucide-react';
import type { LicenciaInfo } from '../contexts/AuthContext';

interface ModalUpsellProps {
    isOpen: boolean;
    onClose: () => void;
    licenciaInfo: LicenciaInfo;
    customTitle?: string;
    customMessage?: string;
}

export default function ModalUpsell({ isOpen, onClose, licenciaInfo, customTitle, customMessage }: ModalUpsellProps) {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const { licencia, limiteAnimales, totalAnimalesOrganizacion, isVencida, isSobrecupo, fechaVencimientoLicencia } = licenciaInfo;
    const isOverQuota = isSobrecupo || (totalAnimalesOrganizacion > limiteAnimales);

    const handleGoToBilling = () => {
        onClose();
        navigate('/suscripcion');
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Fecha no especificada';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const porcentajeUso = Math.round((totalAnimalesOrganizacion / (limiteAnimales || 1)) * 100);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'var(--backdrop-scrim)',
            backdropFilter: 'blur(8px)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
            <div style={{
                background: 'var(--bg-dark-paper)',
                border: (isVencida || isOverQuota) ? '1px solid var(--error-soft-border)' : '1px solid var(--secondary-soft-border)',
                borderRadius: '20px', padding: '32px', maxWidth: '520px', width: '100%',
                boxShadow: 'var(--shadow-popover)', position: 'relative'
            }}>
                {/* Botón cerrar */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '16px', right: '16px',
                        background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)',
                        color: 'var(--text-muted)', borderRadius: '50%', width: '36px', height: '36px', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'none'
                    }}
                >
                    <X size={18} />
                </button>

                {/* Header Icon */}
                <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: (isVencida || isOverQuota) 
                        ? 'var(--error-soft-bg)' 
                        : 'var(--secondary-soft-bg)',
                    border: (isVencida || isOverQuota) ? '1px solid var(--error-soft-border)' : '1px solid var(--secondary-soft-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                }}>
                    {(isVencida || isOverQuota) ? (
                        <AlertOctagon size={32} color="var(--error)" />
                    ) : (
                        <Award size={32} color="var(--secondary)" />
                    )}
                </div>

                <h2 style={{
                    margin: '0 0 8px', textAlign: 'center', color: 'var(--text-main)',
                    fontSize: '1.35rem', fontWeight: 800
                }}>
                    {customTitle || (
                        isVencida
                            ? 'Suscripción Vencida (Modo Solo Lectura)'
                            : isOverQuota
                                ? 'Modo Solo Lectura (Sobrecupo Activo)'
                                : '¡Límite del Plan Alcanzado!'
                    )}
                </h2>

                <p style={{
                    color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 20px',
                    fontSize: '0.9rem', lineHeight: 1.5
                }}>
                    {customMessage || (
                        isVencida ? (
                            <>
                                Tu suscripción al <strong style={{ color: 'var(--error)', textTransform: 'uppercase' }}>Plan {licencia}</strong> venció el <strong style={{ color: 'var(--text-main)' }}>{formatDate(fechaVencimientoLicencia)}</strong>. Tu información zootécnica e inventario están 100% seguros y disponibles para consulta. Para reactivar pesajes, compras y movimientos, renueva tu suscripción.
                            </>
                        ) : isOverQuota ? (
                            <>
                                Tu organización tiene <strong style={{ color: 'var(--error)' }}>{totalAnimalesOrganizacion} animales</strong>, superando el cupo del <strong style={{ color: 'var(--secondary)', textTransform: 'uppercase' }}>{licencia}</strong> ({limiteAnimales} animales). Tus datos están 100% a salvo, pero las operaciones de pesaje, movimientos y nuevos ingresos están pausadas.
                            </>
                        ) : (
                            <>
                                Tu plan actual <strong style={{ color: 'var(--secondary)', textTransform: 'uppercase' }}>{licencia}</strong> te permite registrar hasta <strong style={{ color: 'var(--text-main)' }}>{limiteAnimales}</strong> animales activos.
                            </>
                        )
                    )}
                </p>

                {/* Progress bar (solo si no es vencimiento) */}
                {!isVencida && (
                    <div style={{
                        background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)',
                        borderRadius: '12px', padding: '16px', marginBottom: '20px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Uso actual de tu hato:</span>
                            <span style={{ color: isOverQuota ? 'var(--error)' : 'var(--secondary)', fontWeight: 700 }}>
                                {totalAnimalesOrganizacion} de {limiteAnimales} animales ({porcentajeUso}%)
                            </span>
                        </div>
                        <div style={{
                            width: '100%', height: '8px', background: 'var(--surface-inset)',
                            borderRadius: '4px', overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${Math.min(100, porcentajeUso)}%`, height: '100%',
                                background: isOverQuota ? 'var(--error)' : 'linear-gradient(90deg, var(--warning), var(--error))',
                                borderRadius: '4px'
                            }} />
                        </div>
                    </div>
                )}

                {/* Feature highlight */}
                <div style={{
                    background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)',
                    borderRadius: '12px', padding: '14px 16px', marginBottom: '24px',
                    display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                    <Sparkles size={22} color="var(--primary-light)" style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {isVencida
                            ? <>Renueva tu suscripción para desbloquear de inmediato el registro de pesajes, control de pastoreo y reportes zootécnicos.</>
                            : <>Actualiza a <strong>Plan Finca (hasta 500 animales)</strong> o <strong>Plan Hacienda (ilimitado)</strong> para continuar pesando, rotando y operando tu finca con normalidad.</>
                        }
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button
                        onClick={handleGoToBilling}
                        style={{
                            width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                            background: isVencida 
                                ? 'var(--error)' 
                                : 'linear-gradient(135deg, #6d28d9, #7c3aed)',
                            color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            boxShadow: isVencida 
                                ? '0 4px 14px rgba(185, 28, 28, 0.35)' 
                                : '0 4px 14px rgba(109, 40, 217, 0.35)'
                        }}
                    >
                        <span>{isVencida ? 'Renovar Suscripción Ahora' : 'Actualizar Suscripción'}</span>
                        <ArrowRight size={18} />
                    </button>

                    <button
                        onClick={onClose}
                        style={{
                            width: '100%', padding: '12px', borderRadius: '10px',
                            border: '1px solid var(--border-strong)', background: 'transparent',
                            color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', boxShadow: 'none'
                        }}
                    >
                        Continuar en Solo Lectura
                    </button>
                </div>
            </div>
        </div>
    );
}
