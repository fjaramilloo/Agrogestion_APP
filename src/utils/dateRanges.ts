/**
 * Utilidad para calcular rangos de fechas predefinidos para filtros de historial.
 */

export type DateRangeOption = 'mes_actual' | 'semestre_actual' | 'semestre_anterior' | 'anio_actual' | 'todos';

export interface DateRange {
    start: string | null; // YYYY-MM-DD o null para ver todo el histórico
    end: string | null;   // YYYY-MM-DD o null para ver todo el histórico
}

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
    'mes_actual',
    'semestre_actual',
    'semestre_anterior',
    'anio_actual',
    'todos',
];

export const DATE_RANGE_LABELS: Record<DateRangeOption, string> = {
    mes_actual: 'Este mes',
    semestre_actual: 'Este semestre',
    semestre_anterior: 'Semestre anterior',
    anio_actual: 'Año actual',
    todos: 'Total',
};

/**
 * Dado el año y mes actuales, determina cuál es el semestre actual.
 * Semestre 1: Enero - Junio (meses 0-5 en JS)
 * Semestre 2: Julio - Diciembre (meses 6-11 en JS)
 */
function getSemestre(year: number, month: number): { semestre: 1 | 2; year: number } {
    return { semestre: month < 6 ? 1 : 2, year };
}

function padZero(n: number) {
    return String(n).padStart(2, '0');
}

/** Último día de un mes dado (1-indexed month) */
function lastDayOfMonth(year: number, month1indexed: number): string {
    const d = new Date(year, month1indexed, 0); // day 0 = last day of prev month
    return `${year}-${padZero(month1indexed)}-${padZero(d.getDate())}`;
}

export function getDateRange(option: DateRangeOption): DateRange {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    switch (option) {
        case 'mes_actual': {
            const m1 = month + 1; // 1-indexed
            return {
                start: `${year}-${padZero(m1)}-01`,
                end: lastDayOfMonth(year, m1),
            };
        }

        case 'semestre_actual': {
            const { semestre } = getSemestre(year, month);
            if (semestre === 1) {
                return { start: `${year}-01-01`, end: `${year}-06-30` };
            } else {
                return { start: `${year}-07-01`, end: `${year}-12-31` };
            }
        }

        case 'semestre_anterior': {
            const { semestre } = getSemestre(year, month);
            if (semestre === 1) {
                // El semestre anterior es S2 del año pasado
                return { start: `${year - 1}-07-01`, end: `${year - 1}-12-31` };
            } else {
                // El semestre anterior es S1 de este año
                return { start: `${year}-01-01`, end: `${year}-06-30` };
            }
        }

        case 'anio_actual': {
            return { start: `${year}-01-01`, end: `${year}-12-31` };
        }

        case 'todos': {
            return { start: null, end: null };
        }

        default:
            return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
}
