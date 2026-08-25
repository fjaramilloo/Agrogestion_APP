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
