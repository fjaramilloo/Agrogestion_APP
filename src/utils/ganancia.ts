// Utilidad centralizada para manejo de unidades de ganancia de peso
// BD siempre almacena en kg/mes (GMP). Solo el display cambia según el modo.

export type ModoGanancia = 'GMP' | 'GDP';

export function toDisplayValue(valorKgMes: number, modo: ModoGanancia): number {
    if (modo === 'GDP') return valorKgMes * (1000 / 30);
    return valorKgMes;
}

export function toStorageValue(valorDisplay: number, modo: ModoGanancia): number {
    if (modo === 'GDP') return valorDisplay * (30 / 1000);
    return valorDisplay;
}

export function getUnidadLabel(modo: ModoGanancia): string {
    return modo === 'GDP' ? 'gr/día' : 'kg/mes';
}

export function getModoLabel(modo: ModoGanancia): string {
    return modo === 'GDP' ? 'GDP' : 'GMP';
}

export function formatGanancia(valorKgMes: number, modo: ModoGanancia, decimales?: number): string {
    const display = toDisplayValue(valorKgMes, modo);
    const dec = decimales !== undefined ? decimales : (modo === 'GDP' ? 0 : 1);
    const signo = valorKgMes > 0 ? '+' : '';
    return signo + display.toFixed(dec) + ' ' + getUnidadLabel(modo);
}

export function formatGananciaNeutral(valorKgMes: number, modo: ModoGanancia, decimales?: number): string {
    const display = toDisplayValue(valorKgMes, modo);
    const dec = decimales !== undefined ? decimales : (modo === 'GDP' ? 0 : 1);
    return display.toFixed(dec) + ' ' + getUnidadLabel(modo);
}

/**
 * Normaliza una fecha ISO o timestamp a YYYY-MM-DD
 */
export function normalizeDateStr(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    return String(dateStr).split('T')[0].trim() || null;
}

/**
 * Calcula los días calendario exactos entre dos fechas (YYYY-MM-DD)
 */
export function calcularDiasEntreFechas(fechaInicioStr?: string | null, fechaFinStr?: string | null): number {
    const f1 = normalizeDateStr(fechaInicioStr);
    const f2 = normalizeDateStr(fechaFinStr);
    if (!f1 || !f2) return 0;
    const d1 = new Date(`${f1}T12:00:00`);
    const d2 = new Date(`${f2}T12:00:00`);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Verifica si un pesaje ocurrió en una fecha estrictamente posterior a la fecha base de ingreso.
 * Los pesajes del mismo día de ingreso tienen 0 días de evolución y no deben promediarse como GMP = 0.
 */
export function esPesajePosteriorAIngreso(fechaPesaje?: string | null, fechaIngreso?: string | null): boolean {
    if (!fechaPesaje) return false;
    if (!fechaIngreso) return true;
    return calcularDiasEntreFechas(fechaIngreso, fechaPesaje) > 0;
}

/**
 * Calcula la GMP del último período (entre el penúltimo y el último pesaje, o desde peso_ingreso si es el 1er pesaje posterior al ingreso).
 * Retorna null si el animal solo tiene el pesaje del día de ingreso o no tiene pesajes.
 */
export function calcularGmpUltimoPeriodo(
    ultimoPesaje: any,
    fechaIngreso?: string | null,
    pesoIngreso?: number | null,
    penultimoPesaje?: any
): number | null {
    if (!ultimoPesaje || !ultimoPesaje.fecha) return null;
    if (fechaIngreso && !esPesajePosteriorAIngreso(ultimoPesaje.fecha, fechaIngreso)) {
        return null;
    }

    if (penultimoPesaje && penultimoPesaje.fecha && esPesajePosteriorAIngreso(ultimoPesaje.fecha, penultimoPesaje.fecha)) {
        const diasTramo = calcularDiasEntreFechas(penultimoPesaje.fecha, ultimoPesaje.fecha);
        if (diasTramo > 0 && Number(penultimoPesaje.peso) > 0) {
            if (ultimoPesaje.gmp_calculada !== null && ultimoPesaje.gmp_calculada !== undefined) {
                return Number(ultimoPesaje.gmp_calculada);
            }
            return ((Number(ultimoPesaje.peso) - Number(penultimoPesaje.peso)) / diasTramo) * 30;
        }
    }

    if (ultimoPesaje.gmp_calculada !== null && ultimoPesaje.gmp_calculada !== undefined) {
        return Number(ultimoPesaje.gmp_calculada);
    }
    if (ultimoPesaje.gdp_calculada !== null && ultimoPesaje.gdp_calculada !== undefined) {
        return Number(ultimoPesaje.gdp_calculada) * 30;
    }

    if (fechaIngreso && pesoIngreso && Number(pesoIngreso) > 0) {
        const dias = calcularDiasEntreFechas(fechaIngreso, ultimoPesaje.fecha);
        if (dias > 0) {
            return ((Number(ultimoPesaje.peso) - Number(pesoIngreso)) / dias) * 30;
        }
    }

    return null;
}

/**
 * Calcula la GMP Histórica Acumulada en finca desde el peso/fecha base de ingreso hasta el último pesaje.
 * Retorna null si no hay pesaje posterior a la fecha de ingreso (días <= 0).
 */
export function calcularGmpAcumulado(
    pesoActual?: number | null,
    pesoBaseIngreso?: number | null,
    fechaInicioStr?: string | null,
    fechaUltimoPesajeStr?: string | null
): number | null {
    const pesoAct = Number(pesoActual || 0);
    const pesoBase = Number(pesoBaseIngreso || 0);
    if (!fechaInicioStr || !fechaUltimoPesajeStr || pesoAct <= 0 || pesoBase <= 0) return null;

    const diffDias = calcularDiasEntreFechas(fechaInicioStr, fechaUltimoPesajeStr);
    if (diffDias <= 0) return null;

    const gananciaKilos = pesoAct - pesoBase;
    return (gananciaKilos / diffDias) * 30;
}

