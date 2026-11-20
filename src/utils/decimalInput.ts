/**
 * Helpers para entrada numérica decimal compatible con teclados iOS/Android
 * en español (donde la tecla decimal es `,`) y teclados con `.`.
 */

/**
 * Conserva solo dígitos `0-9` y un único separador decimal (`,` o `.`),
 * manteniendo intacta la coma o el punto mientras el usuario escribe.
 */
export function sanitizeDecimalInput(raw: string, allowNegative = false): string {
    let result = '';
    let hasSeparator = false;

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch >= '0' && ch <= '9') {
            result += ch;
        } else if ((ch === ',' || ch === '.') && !hasSeparator) {
            hasSeparator = true;
            result += ch;
        } else if (allowNegative && ch === '-' && result.length === 0) {
            result += ch;
        }
    }

    return result;
}

/**
 * Convierte una cadena decimal con `,` o `.` a `number` (o `NaN` si está vacía o inválida).
 */
export function parseDecimalInput(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : NaN;
    }
    if (value === null || value === undefined) {
        return NaN;
    }

    const normalized = String(value).trim().replace(',', '.');
    if (
        normalized === '' ||
        normalized === '.' ||
        normalized === '-' ||
        normalized === '-.'
    ) {
        return NaN;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
}
