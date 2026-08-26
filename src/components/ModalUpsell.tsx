import { useNavigate } from 'react-router-dom';
import { Award, Sparkles, ArrowRight, X } from 'lucide-react';
import type { LicenciaInfo } from '../contexts/AuthContext';

interface ModalUpsellProps {
    isOpen: boolean;
    onClose: () => void;
    licenciaInfo: LicenciaInfo;
}

export default function ModalUpsell({ isOpen, onClose, licenciaInfo }: ModalUpsellProps) {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const { licencia, limiteAnimales, totalAnimalesOrganizacion } = licenciaInfo;

    const handleGoToBilling = () => {
        onClose();
        navigate('/suscripcion');
    };

    const porcentajeUso = Math.min(100, Math.round((totalAnimalesOrganizacion / (limiteAnimales || 1)) * 100));

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(6px)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
            <div style={{
                background: 'linear-gradient(145deg, #1e1e2f, #141423)',
                border: '1px solid rgba(255, 179, 0, 0.4)',
                borderRadius: '20px', padding: '32px', maxWidth: '520px', width: '100%',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)', position: 'relative'
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
                    background: 'linear-gradient(135deg, rgba(255, 179, 0, 0.2), rgba(255, 152, 0, 0.1))',
                    border: '1px solid rgba(255, 179, 0, 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
                }}>
                    <Award size={32} color="#ffb74d" />
                </div>

                <h2 style={{
                    margin: '0 0 8px', textAlign: 'center', color: 'white',
                    fontSize: '1.4rem', fontWeight: 800
                }}>
                    ¡Límite del Plan Alcanzado!
                </h2>

                <p style={{
                    color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 24px',
                    fontSize: '0.92rem', lineHeight: 1.5
                }}>
                    Tu plan actual <strong style={{ color: '#ffb74d', textTransform: 'uppercase' }}>{licencia}</strong> le permite registrar hasta <strong style={{ color: 'white' }}>{limiteAnimales}</strong> animales activos.
                </p>

                {/* Progress bar */}
                <div style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '16px', marginBottom: '24px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Uso actual de tu hato:</span>
                        <span style={{ color: '#f87171', fontWeight: 700 }}>
                            {totalAnimalesOrganizacion} de {limiteAnimales} animales ({porcentajeUso}%)
                        </span>
                    </div>
                    <div style={{
                        width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)',
                        borderRadius: '4px', overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${porcentajeUso}%`, height: '100%',
                            background: 'linear-gradient(90deg, #ffb74d, #f44336)',
                            borderRadius: '4px'
                        }} />
                    </div>
                </div>

                {/* Feature highlight */}
                <div style={{
                    background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.25)',
                    borderRadius: '12px', padding: '16px', marginBottom: '28px',
                    display: 'flex', alignItems: 'center', gap: '14px'
                }}>
                    <Sparkles size={24} color="#a78bfa" style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
                        Actualiza a <strong>Plan Finca (hasta 500 animales)</strong> o <strong>Plan Premium (sin límites)</strong> para continuar midiendo la rentabilidad y pesaje de tu ganado.
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button
                        onClick={handleGoToBilling}
                        style={{
                            width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                            color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)'
                        }}
                    >
                        <span>Ver Opciones de Actualización</span>
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
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
