import type { LicenciaInfo } from '../contexts/AuthContext';

export function getLicenseBlockState(
    licenciaInfo: LicenciaInfo | null | undefined,
    blockAtLimit = false
) {
    const isVencida = Boolean(licenciaInfo?.isVencida);
    const isSobrecupo = Boolean(
        licenciaInfo &&
            (licenciaInfo.isSobrecupo ||
                (blockAtLimit
                    ? licenciaInfo.totalAnimalesOrganizacion >= licenciaInfo.limiteAnimales
                    : licenciaInfo.totalAnimalesOrganizacion > licenciaInfo.limiteAnimales))
    );
    return {
        isVencida,
        isSobrecupo,
        isBloqueado: isVencida || isSobrecupo,
    };
}
