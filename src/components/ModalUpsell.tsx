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
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
            <div style={{
                background: 'linear-gradient(145deg, #1e1e2f, #141423)',
                border: (isVencida || isOverQuota) ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 179, 0, 0.4)',
                borderRadius: '20px', padding: '32px', maxWidth: '520px', width: '100%',
                boxShadow: (isVencida || isOverQuota) ? '0 20px 50px rgba(239, 68, 68, 0.2)' : '0 20px 50px rgba(0,0,0,0.6)', position: 'relative'
            }}>
                {/* Botón cerrar */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '16px', right: '16px',
                        background: 'rgba(255,255,255,0.06)', border: 'none',
                        color: 'var(--text-muted)', borderRadius: '50%', width: '32px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                    }}
                >
                    <X size={18} />
                </button>

                {/* Header Icon */}
                <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: (isVencida || isOverQuota) 
                        ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.1))' 
                        : 'linear-gradient(135deg, rgba(255, 179, 0, 0.2), rgba(255, 152, 0, 0.1))',
                    border: (isVencida || isOverQuota) ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 179, 0, 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                }}>
                    {(isVencida || isOverQuota) ? (
                        <AlertOctagon size={32} color="#f87171" />
                    ) : (
                        <Award size={32} color="#ffb74d" />
                    )}
                </div>

                <h2 style={{
                    margin: '0 0 8px', textAlign: 'center', color: 'white',
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
                                Tu suscripción al <strong style={{ color: '#f87171', textTransform: 'uppercase' }}>Plan {licencia}</strong> venció el <strong style={{ color: 'white' }}>{formatDate(fechaVencimientoLicencia)}</strong>. Tu información zootécnica e inventario están 100% seguros y disponibles para consulta. Para reactivar pesajes, compras y movimientos, renueva tu suscripción.
                            </>
                        ) : isOverQuota ? (
                            <>
                                Tu organización tiene <strong style={{ color: '#f87171' }}>{totalAnimalesOrganizacion} animales</strong>, superando el cupo del <strong style={{ color: '#ffb74d', textTransform: 'uppercase' }}>{licencia}</strong> ({limiteAnimales} animales). Tus datos están 100% a salvo, pero las operaciones de pesaje, movimientos y nuevos ingresos están pausadas.
                            </>
                        ) : (
                            <>
                                Tu plan actual <strong style={{ color: '#ffb74d', textTransform: 'uppercase' }}>{licencia}</strong> te permite registrar hasta <strong style={{ color: 'white' }}>{limiteAnimales}</strong> animales activos.
                            </>
                        )
                    )}
                </p>

                {/* Progress bar (solo si no es vencimiento) */}
                {!isVencida && (
                    <div style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px', padding: '16px', marginBottom: '20px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Uso actual de tu hato:</span>
                            <span style={{ color: isOverQuota ? '#f87171' : '#ffb74d', fontWeight: 700 }}>
                                {totalAnimalesOrganizacion} de {limiteAnimales} animales ({porcentajeUso}%)
                            </span>
                        </div>
                        <div style={{
                            width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)',
                            borderRadius: '4px', overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${Math.min(100, porcentajeUso)}%`, height: '100%',
                                background: isOverQuota ? '#ef4444' : 'linear-gradient(90deg, #ffb74d, #f44336)',
                                borderRadius: '4px'
                            }} />
                        </div>
                    </div>
                )}

                {/* Feature highlight */}
                <div style={{
                    background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.25)',
                    borderRadius: '12px', padding: '14px 16px', marginBottom: '24px',
                    display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                    <Sparkles size={22} color="#a78bfa" style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
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
                                ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                                : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                            color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            boxShadow: isVencida 
                                ? '0 4px 14px rgba(239, 68, 68, 0.4)' 
                                : '0 4px 14px rgba(124, 58, 237, 0.4)'
                        }}
                    >
                        <span>{isVencida ? 'Renovar Suscripción Ahora' : 'Actualizar Suscripción'}</span>
                        <ArrowRight size={18} />
                    </button>

                    <button
                        onClick={onClose}
                        style={{
                            width: '100%', padding: '12px', borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                            color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
                        }}
                    >
                        Continuar en Solo Lectura
                    </button>
                </div>
            </div>
        </div>
    );
}
