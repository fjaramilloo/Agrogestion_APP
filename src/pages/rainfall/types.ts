import type { RegistroLluviaConsolidado } from '../../utils/rainfallUtils';

export type RegistroLluvia = RegistroLluviaConsolidado;

export interface MesGroup {
    key: string; // 'YYYY-MM'
    label: string;
    totalMm: number;
    registros: RegistroLluvia[];
    open: boolean;
}

export const COLORES_INTENSIDAD = {
    fuerte:   { bg: 'var(--info-soft-bg)',    border: 'var(--info-soft-border)', text: 'var(--info)',           label: 'Fuerte',            emoji: '🌊' },
    moderada: { bg: 'var(--primary-soft-bg)', border: 'var(--primary-soft-border)', text: 'var(--primary-light)', label: 'Moderada (Efectiva)', emoji: '🔵' },
    leve:     { bg: 'var(--surface-subtle)',  border: 'var(--border-subtle)',    text: 'var(--text-secondary)', label: 'Leve',               emoji: '💧' },
    trazas:   { bg: 'var(--surface-inset)',   border: 'var(--border-subtle)',    text: 'var(--text-muted)',     label: 'Trazas',             emoji: '·' },
};

// Clasifica la intensidad de un registro de lluvia en 4 niveles
export function clasificarIntensidad(mm: number, umbralRegistro: number, umbralEfectivo: number) {
    if (mm < umbralRegistro)    return COLORES_INTENSIDAD.trazas;
    if (mm >= umbralEfectivo * 4) return COLORES_INTENSIDAD.fuerte;
    if (mm >= umbralEfectivo)   return COLORES_INTENSIDAD.moderada;
    return COLORES_INTENSIDAD.leve;
}

export const TAB_MENSUAL = 'mensual';
export const TAB_DIARIA = 'diaria';
export const TAB_YOY = 'yoy';
