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
 * Calcula la ganancia del último período (entre el pesaje más reciente y el inmediatamente anterior).
 */
export function calcularGmpUltimoPeriodo(ultimoPesaje: any): number | null {
    if (!ultimoPesaje) return null;
    if (ultimoPesaje.gmp_calculada !== null && ultimoPesaje.gmp_calculada !== undefined) {
        return Number(ultimoPesaje.gmp_calculada);
    }
    if (ultimoPesaje.gdp_calculada !== null && ultimoPesaje.gdp_calculada !== undefined) {
        return Number(ultimoPesaje.gdp_calculada) * 30;
    }
    return null;
}

/**
 * Calcula la ganancia promedio acumulada histórica desde la fecha/peso base hasta el pesaje más reciente.
 * Para animales comprados, el peso base oficial es peso_compra ?? peso_ingreso.
 */
export function calcularGmpAcumulado(
    pesoActual: number,
    pesoBase: number,
    fechaInicioStr: string | null | undefined,
    fechaActualStr: string | null | undefined
): number | null {
    if (!fechaInicioStr || !fechaActualStr || pesoBase <= 0 || pesoActual <= 0) return null;
    const d1 = new Date(fechaInicioStr.split('T')[0] + 'T12:00:00');
    const d2 = new Date(fechaActualStr.split('T')[0] + 'T12:00:00');
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;

    const diffMs = d2.getTime() - d1.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDias <= 0) return 0;

    const gananciaKilos = pesoActual - pesoBase;
    return (gananciaKilos / diffDias) * 30;
}

export interface EstadoRecuperacionMerma {
    estado: 'sin_merma' | 'recuperado' | 'en_recuperacion' | 'no_aplica';
    dias: number | null;
    fecha: string | null;
    mermaKg: number;
    porcentajeMerma: number;
    kgFaltantes: number;
    kilosFaltantes: number;
}

/**
 * Evalúa el estado de adaptación y recuperación de merma de compra de un animal.
 */
export function evaluarEstadoRecuperacionMerma(animal: any, pesoActual?: number): EstadoRecuperacionMerma {
    const pesoCompra = Number(animal?.peso_compra || 0);
    const pesoIngreso = Number(animal?.peso_ingreso || 0);
    const pesoEvaluar = pesoActual !== undefined ? pesoActual : Number(animal?.ultimo_peso || pesoIngreso);

    if (pesoCompra <= 0) {
        return { estado: 'no_aplica', dias: null, fecha: null, mermaKg: 0, porcentajeMerma: 0, kgFaltantes: 0, kilosFaltantes: 0 };
    }

    const mermaKg = Math.max(0, pesoCompra - pesoIngreso);
    const porcentajeMerma = pesoCompra > 0 ? (mermaKg / pesoCompra) * 100 : 0;

    if (mermaKg === 0) {
        return { estado: 'sin_merma', dias: 0, fecha: animal?.fecha_ingreso || null, mermaKg: 0, porcentajeMerma: 0, kgFaltantes: 0, kilosFaltantes: 0 };
    }

    // Si ya tiene el KPI registrado en BD
    if (animal?.dias_recuperacion_merma !== null && animal?.dias_recuperacion_merma !== undefined) {
        return {
            estado: 'recuperado',
            dias: Number(animal.dias_recuperacion_merma),
            fecha: animal.fecha_recuperacion_merma || null,
            mermaKg,
            porcentajeMerma,
            kgFaltantes: 0,
            kilosFaltantes: 0
        };
    }

    // Si el peso actual ya alcanzó el peso de compra
    if (pesoEvaluar >= pesoCompra) {
        return {
            estado: 'recuperado',
            dias: animal?.dias_recuperacion_merma ?? null,
            fecha: animal?.fecha_recuperacion_merma ?? null,
            mermaKg,
            porcentajeMerma,
            kgFaltantes: 0,
            kilosFaltantes: 0
        };
    }

    // Sigue en recuperación
    const kgFaltantes = Math.max(0, pesoCompra - pesoEvaluar);
    return {
        estado: 'en_recuperacion',
        dias: null,
        fecha: null,
        mermaKg,
        porcentajeMerma,
        kgFaltantes,
        kilosFaltantes: kgFaltantes
    };
}
