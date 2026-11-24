import { format, type Locale } from 'date-fns';

export const MIN_GANADO_DATE = '2000-01-01';

/**
 * Extrae YYYY-MM-DD de una fecha o timestamp y construye un Date al mediodía local (12:00:00)
 * para evitar desplazamientos de -1 día en zonas horarias negativas como Colombia (UTC-5).
 */
export function parseLocalDate(fecha?: string | null): Date | null {
    if (!fecha) return null;
    const normalized = String(fecha).split('T')[0].trim();
    if (!normalized) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        const d = new Date(`${normalized}T12:00:00`);
        return isNaN(d.getTime()) ? null : d;
    }
    const fallback = new Date(fecha);
    return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Formatea una fecha calendario (YYYY-MM-DD o timestamp) sin desplazamiento UTC.
 */
export function formatLocalDate(
    fecha?: string | null,
    pattern = 'dd/MM/yyyy',
    options?: { locale?: Locale; fallback?: string }
): string {
    const parsed = parseLocalDate(fecha);
    if (!parsed) return options?.fallback ?? '-';
    return options?.locale ? format(parsed, pattern, { locale: options.locale }) : format(parsed, pattern);
}

/**
 * Retorna la fecha local actual en formato YYYY-MM-DD.
 * Previene el salto de día que ocurre al usar toISOString() en zonas horarias como UTC-5.
 */
export function getLocalIsoDate(): string {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
}

/**
 * Valida que una fecha en formato YYYY-MM-DD sea una fecha calendario real
 * y no sea anterior a minDate (por defecto 2000-01-01).
 */
export function isValidGanadoDate(fecha?: string | null, minDate = MIN_GANADO_DATE): boolean {
    if (!fecha) return false;
    const normalized = String(fecha).split('T')[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
    if (normalized < minDate) return false;

    const [year, month, day] = normalized.split('-').map(Number);
    const parsed = new Date(0);
    parsed.setUTCFullYear(year, month - 1, day);
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

/**
 * Retorna un mensaje de error legible si la fecha está vacía, es inválida
 * o es anterior al límite mínimo permitido (2000-01-01); retorna null si es válida.
 */
export function getGanadoDateError(
    fecha?: string | null,
    label = 'La fecha',
    minDate = MIN_GANADO_DATE
): string | null {
    if (!fecha || !String(fecha).trim()) {
        return `${label} es obligatoria.`;
    }
    const normalized = String(fecha).split('T')[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !isValidGanadoDate(normalized, '0001-01-01')) {
        return `${label} no es una fecha válida.`;
    }
    if (normalized < minDate) {
        return `${label} (${normalized}) no puede ser anterior al 1 de enero de 2000 (verifique que el año tenga 4 dígitos, ej. 2025).`;
    }
    return null;
}
