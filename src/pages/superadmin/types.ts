import { getLocalIsoDate } from '../../utils/dateUtils';

export type TipoLicencia = 'demo' | 'finca' | 'premium';
export type PeriodoLicencia = 'mensual' | 'semestral' | 'anual' | 'indefinido' | 'personalizado';
export type EstadoSemaforo = 'activa' | 'reciente' | 'en_riesgo' | 'inactiva_30d' | 'cliente_pago';
export type FiltroCuenta = 'todos' | 'inactiva_30d' | 'en_riesgo' | 'activa' | 'sin_confirmar' | 'cliente_pago';

export interface FincaInfo {
    id: string;
    nombre: string;
    animalesActivos: number;
    vaqueros: { id: string; nombre: string }[];
    observadores: { id: string; nombre: string }[];
}

export interface CuentaAdmin {
    orgId: string;
    orgNombre: string;
    adminNombre: string;
    adminEmail: string;
    emailConfirmado: boolean;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    licencia: TipoLicencia;
    limiteAnimales: number;
    fechaInicioLicencia: string | null;
    fechaVencimientoLicencia: string | null;
    creadoEn: string;
    idDueño: string;
    fincas: FincaInfo[];
    totalFincas: number;
    totalVaqueros: number;
    totalObservadores: number;
    totalAnimales: number;
    diasRegistro: number;
    esHuerfano: boolean;
}

export interface ConfirmDeleteTarget {
    type: 'org' | 'finca';
    id: string;
    idDueño?: string;
    nombre: string;
    email?: string;
    esInactiva?: boolean;
}

export interface SuperAdminPalette {
    accentPurple: string;
    accentPurpleSoft: string;
    purpleSoftBg: string;
    purpleSubtleBg: string;
    purpleSoftBorder: string;
    accentBlue: string;
    accentBlueSoft: string;
    accentBlueBadge: string;
    accentGreen: string;
    accentAmber: string;
    accentYellow: string;
    accentOrange: string;
    accentRed: string;
}

export const getSuperAdminPalette = (isLight: boolean): SuperAdminPalette => ({
    accentPurple: isLight ? '#6d28d9' : '#a78bfa',
    accentPurpleSoft: isLight ? '#7c3aed' : '#c084fc',
    purpleSoftBg: isLight ? '#f3e8ff' : 'rgba(124, 58, 237, 0.14)',
    purpleSubtleBg: isLight ? '#faf5ff' : 'rgba(124, 58, 237, 0.05)',
    purpleSoftBorder: isLight ? '#c084fc' : 'rgba(124, 58, 237, 0.35)',
    accentBlue: isLight ? '#0369a1' : '#38bdf8',
    accentBlueSoft: isLight ? '#1d4ed8' : '#60a5fa',
    accentBlueBadge: isLight ? '#1e40af' : '#93c5fd',
    accentGreen: isLight ? 'var(--success)' : '#4ade80',
    accentAmber: isLight ? '#b45309' : '#ffb74d',
    accentYellow: isLight ? '#a16207' : '#facc15',
    accentOrange: isLight ? '#c2410c' : '#fb923c',
    accentRed: isLight ? 'var(--error)' : '#f87171',
});

// Calcula la fecha de vencimiento sumando el periodo a la fecha de inicio
export const calculateVencimiento = (startDateStr: string, periodo: PeriodoLicencia): string => {
    if (periodo === 'indefinido') return '';
    if (!startDateStr) startDateStr = getLocalIsoDate();

    const [y, m, d] = startDateStr.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);

    if (periodo === 'mensual') {
        date.setMonth(date.getMonth() + 1);
    } else if (periodo === 'semestral') {
        date.setMonth(date.getMonth() + 6);
    } else if (periodo === 'anual') {
        date.setFullYear(date.getFullYear() + 1);
    }

    const resY = date.getFullYear();
    const resM = String(date.getMonth() + 1).padStart(2, '0');
    const resD = String(date.getDate()).padStart(2, '0');
    return `${resY}-${resM}-${resD}`;
};

export const formatSuperAdminDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return 'N/A';
    }
};

// Lógica del semáforo para cuentas demo y licencias
export const getEstadoSemaforo = (cuenta: CuentaAdmin, palette: SuperAdminPalette) => {
    if (cuenta.licencia !== 'demo') {
        return {
            tipo: 'cliente_pago' as EstadoSemaforo,
            label: 'Cliente Pago',
            sublabel: cuenta.licencia === 'premium' ? 'Plan Premium' : 'Plan Finca',
            color: palette.accentPurpleSoft,
            bg: palette.purpleSoftBg,
            border: palette.purpleSoftBorder,
            icon: '💎'
        };
    }

    if (cuenta.totalAnimales > 0) {
        return {
            tipo: 'activa' as EstadoSemaforo,
            label: 'Demo Activa',
            sublabel: `${cuenta.totalAnimales} animales`,
            color: palette.accentGreen,
            bg: 'var(--success-soft-bg)',
            border: 'var(--success-soft-border)',
            icon: '🟢'
        };
    }

    if (cuenta.diasRegistro < 15) {
        return {
            tipo: 'reciente' as EstadoSemaforo,
            label: 'En Prueba',
            sublabel: cuenta.diasRegistro === 0 ? 'Hoy' : `Hace ${cuenta.diasRegistro}d`,
            color: palette.accentYellow,
            bg: 'var(--warning-soft-bg)',
            border: 'var(--warning-soft-border)',
            icon: '🟡'
        };
    }

    if (cuenta.diasRegistro <= 30) {
        const diasRestantes = 30 - cuenta.diasRegistro;
        return {
            tipo: 'en_riesgo' as EstadoSemaforo,
            label: 'En Riesgo',
            sublabel: `${diasRestantes}d restantes`,
            color: palette.accentOrange,
            bg: 'var(--warning-soft-bg)',
            border: 'var(--warning-soft-border)',
            icon: '🟠'
        };
    }

    return {
        tipo: 'inactiva_30d' as EstadoSemaforo,
        label: 'Para Inactivar',
        sublabel: `+${cuenta.diasRegistro}d sin ganado`,
        color: palette.accentRed,
        bg: 'var(--error-soft-bg)',
        border: 'var(--error-soft-border)',
        icon: '🔴'
    };
};
