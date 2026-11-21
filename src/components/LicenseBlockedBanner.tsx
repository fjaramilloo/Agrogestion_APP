import { AlertOctagon } from 'lucide-react';
import type { LicenciaInfo } from '../contexts/AuthContext';
import { getLicenseBlockState } from '../utils/licenseUtils';
import './LicenseBlockedBanner.css';

interface LicenseBlockedBannerProps {
    licenciaInfo: LicenciaInfo | null | undefined;
    onUpgradeClick: () => void;
    expiredDetail: string;
    overLimitDetail: string;
    blockAtLimit?: boolean;
    overLimitTitle?: string;
    compact?: boolean;
}

export function LicenseBlockedBanner({
    licenciaInfo,
    onUpgradeClick,
    expiredDetail,
    overLimitDetail,
    blockAtLimit = false,
    overLimitTitle = 'Modo Solo Lectura (Sobrecupo):',
    compact = false,
}: LicenseBlockedBannerProps) {
    const { isVencida, isBloqueado } = getLicenseBlockState(licenciaInfo, blockAtLimit);
    if (!isBloqueado) return null;

    return (
        <div className={`license-blocked-banner${compact ? ' license-blocked-banner--compact' : ''}`}>
            <div className="license-blocked-banner__content">
                <AlertOctagon
                    size={compact ? 20 : 24}
                    color="var(--error)"
                    style={{ flexShrink: 0 }}
                    aria-hidden="true"
                />
                <div className="license-blocked-banner__text">
                    {isVencida ? (
                        <>
                            <strong>Modo Solo Lectura (Licencia Vencida):</strong> Tu suscripción
                            {licenciaInfo?.licencia ? (
                                <>
                                    {' '}
                                    al Plan <strong style={{ textTransform: 'uppercase' }}>{licenciaInfo.licencia}</strong>
                                </>
                            ) : null}{' '}
                            ha expirado. {expiredDetail}
                        </>
                    ) : (
                        <>
                            <strong>{overLimitTitle}</strong> Tu hato cuenta con{' '}
                            <strong style={{ color: 'var(--error)' }}>
                                {licenciaInfo?.totalAnimalesOrganizacion} animales
                            </strong>{' '}
                            (límite de tu plan: <strong>{licenciaInfo?.limiteAnimales}</strong>). {overLimitDetail}
                        </>
                    )}
                </div>
            </div>
            <button
                type="button"
                className="license-blocked-banner__btn"
                onClick={onUpgradeClick}
            >
                {isVencida ? 'Renovar Plan' : 'Ver Planes'}
            </button>
        </div>
    );
}
