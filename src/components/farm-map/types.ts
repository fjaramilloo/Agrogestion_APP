import type { ConfianzaPeso } from '../../utils/ganancia';

export interface PotreroMapData {
  id: string;
  nombre: string;
  area_hectareas: number;
  geojson_geometry?: any;
  color_mapa?: string;
  potrerada_actual?: {
    id: string;
    nombre: string;
    total_animales: number;
    peso_promedio: number;
    peso_promedio_estimado: number;
    dias_sin_pesar?: number;
    confianza_peso?: ConfianzaPeso;
    dias_en_potrero: number;
    fecha_entrada?: string;
    marcas: string[];
    fecha_ultimo_pesaje?: string | null;
  } | null;
}

export interface ZonaAdicionalMapData {
  id: string;
  nombre: string;
  tipo: 'bosque' | 'reforestacion' | 'reserva' | 'agua' | 'infraestructura' | 'otro';
  area_hectareas: number;
  geojson_geometry: any;
  color?: string;
}

export type MapLayerMode = 'satellite' | 'plain' | 'street';
export type ZoomTier = 'overview' | 'medium' | 'detail';

export interface MapNoticeState {
  id: number;
  type: 'info' | 'warning' | 'error';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const MAP_LAYER_ORDER: MapLayerMode[] = ['satellite', 'plain', 'street'];
export const MAP_LAYER_LABELS: Record<MapLayerMode, string> = {
  satellite: 'Satélite',
  plain: 'Plano',
  street: 'Terreno',
};

export const ZONA_META_BY_TIPO: Record<
  ZonaAdicionalMapData['tipo'],
  { icon: string; shortLabel: string; longLabel: string; defaultColor: string; sunColor: string; themeVar: string }
> = {
  bosque: {
    icon: '🌳',
    shortLabel: 'Bosque',
    longLabel: 'Bosque/Reforestación',
    defaultColor: '#059669',
    sunColor: '#047857',
    themeVar: 'var(--success)',
  },
  reforestacion: {
    icon: '🌳',
    shortLabel: 'Bosque',
    longLabel: 'Bosque/Reforestación',
    defaultColor: '#059669',
    sunColor: '#047857',
    themeVar: 'var(--success)',
  },
  reserva: {
    icon: '🌳',
    shortLabel: 'Bosque',
    longLabel: 'Bosque/Reforestación',
    defaultColor: '#059669',
    sunColor: '#047857',
    themeVar: 'var(--success)',
  },
  agua: {
    icon: '💧',
    shortLabel: 'Agua',
    longLabel: 'Agua',
    defaultColor: '#0284C7',
    sunColor: '#0369A1',
    themeVar: 'var(--info)',
  },
  infraestructura: {
    icon: '🏠',
    shortLabel: 'Infraestructura',
    longLabel: 'Infraestructura',
    defaultColor: '#D97706',
    sunColor: '#B45309',
    themeVar: 'var(--warning)',
  },
  otro: {
    icon: '📍',
    shortLabel: 'Zona Especial',
    longLabel: 'Zona Especial',
    defaultColor: '#8B5CF6',
    sunColor: '#6D28D9',
    themeVar: 'var(--info)',
  },
};
