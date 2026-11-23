import L from 'leaflet';
import {
  ZONA_META_BY_TIPO,
  type MapLayerMode,
  type PotreroMapData,
  type ZonaAdicionalMapData,
  type ZoomTier,
} from './types';

export function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getPotreroStyle(
  isSelected: boolean,
  hasCattle: boolean,
  isDemo: boolean,
  mapType: MapLayerMode,
  isSunMode: boolean
): L.PathOptions {
  const highContrastLight = isSunMode && mapType !== 'satellite';
  const baseStroke = isDemo
    ? highContrastLight ? '#047857' : '#10B981'
    : hasCattle
    ? highContrastLight ? '#1D4ED8' : '#38BDF8'
    : highContrastLight ? '#047857' : '#10B981';
  const baseFill = isDemo
    ? '#10B981'
    : hasCattle
    ? highContrastLight ? '#2563EB' : '#475569'
    : '#10B981';

  return {
    color: isSelected ? (highContrastLight ? '#B45309' : '#F59E0B') : baseStroke,
    weight: isSelected ? 4 : mapType === 'plain' ? 2.5 : 2,
    opacity: isSelected ? 1 : 0.92,
    fillColor: baseFill,
    fillOpacity: isSelected ? 0.38 : mapType === 'plain' ? 0.24 : 0.22,
  };
}

export function getZonaMeta(z: ZonaAdicionalMapData, isSunMode: boolean, mapType: MapLayerMode) {
  const meta = ZONA_META_BY_TIPO[z.tipo] || ZONA_META_BY_TIPO.otro;
  const highContrastLight = isSunMode && mapType !== 'satellite';
  const baseColor = z.color || (highContrastLight ? meta.sunColor : meta.defaultColor);
  return { ...meta, baseColor };
}

export function buildPotreroBadgeHtml(
  p: PotreroMapData,
  tier: ZoomTier,
  isSelected: boolean,
  hasCattle: boolean,
  isMobile: boolean
): string {
  const stateClasses = [
    'farm-map-badge',
    `farm-map-badge--${tier}`,
    hasCattle ? 'farm-map-badge--occupied' : '',
    isSelected ? 'farm-map-badge--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const nombre = escapeHtml(p.nombre);
  const loteNombreRaw = p.potrerada_actual?.nombre || 'Lote';
  const loteCorto = escapeHtml(
    loteNombreRaw.length > 14 ? `${loteNombreRaw.substring(0, 12)}…` : loteNombreRaw
  );
  const cabezas = p.potrerada_actual?.total_animales || 0;

  if (tier === 'overview') {
    if (isSelected) {
      return `<div class="${stateClasses}"><span class="farm-map-badge-title">${nombre}</span><span class="farm-map-badge-area">(${p.area_hectareas} Ha)</span></div>`;
    }
    return `
      <div class="${stateClasses}">
        <span aria-hidden="true">🐮</span>
        <span class="farm-map-badge-title">${loteCorto}</span>
        ${cabezas > 0 ? `<span class="farm-map-badge-count">${cabezas}</span>` : ''}
      </div>
    `;
  }

  if (tier === 'medium') {
    const nombreDisplay = escapeHtml(
      isMobile && p.nombre.length > 12 ? `${p.nombre.substring(0, 11)}…` : p.nombre
    );
    return `
      <div class="${stateClasses}">
        <div class="farm-map-badge-row">
          <span class="farm-map-badge-title">${nombreDisplay}</span>
          <span class="farm-map-badge-area">${p.area_hectareas} Ha</span>
        </div>
        ${
          hasCattle
            ? `<div class="farm-map-badge-lot">🐮 ${loteCorto} (${cabezas} cbs)</div>`
            : ''
        }
      </div>
    `;
  }

  return `
    <div class="${stateClasses}">
      <div class="farm-map-badge-title">${nombre}</div>
      <div class="farm-map-badge-area">${p.area_hectareas} Ha</div>
      ${
        hasCattle
          ? `<div class="farm-map-badge-lot">🐮 ${escapeHtml(loteNombreRaw)} (${cabezas} cbs &bull; ${p.potrerada_actual?.peso_promedio ?? 0} kg)</div>`
          : ''
      }
    </div>
  `;
}

export function buildZonaBadgeHtml(
  z: ZonaAdicionalMapData,
  tier: ZoomTier,
  isSelected: boolean,
  isMobile: boolean,
  icon: string,
  shortLabel: string,
  baseColor: string
): string {
  const stateClasses = [
    'farm-map-badge',
    `farm-map-badge--${tier}`,
    isSelected ? 'farm-map-badge--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const borderStyle = isSelected ? '' : `border-color: ${escapeHtml(baseColor)};`;

  if (tier === 'overview') {
    return `<div class="${stateClasses}" style="${borderStyle}">${icon} ${escapeHtml(z.nombre)}</div>`;
  }

  if (tier === 'medium') {
    const nombreDisplay = escapeHtml(
      isMobile && z.nombre.length > 12 ? `${z.nombre.substring(0, 11)}…` : z.nombre
    );
    return `
      <div class="${stateClasses}" style="${borderStyle}">
        <div class="farm-map-badge-row">
          <span class="farm-map-badge-title">${icon} ${nombreDisplay}</span>
          <span class="farm-map-badge-area">${z.area_hectareas} Ha</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="${stateClasses}" style="${borderStyle}">
      <div class="farm-map-badge-title">${icon} ${escapeHtml(z.nombre)}</div>
      <div class="farm-map-badge-area">${z.area_hectareas} Ha &bull; ${escapeHtml(shortLabel)}</div>
    </div>
  `;
}

export function createBadgeMarker(center: L.LatLng, html: string, onClick: () => void): L.Marker {
  const customIcon = L.divIcon({
    html,
    className: 'farm-map-div-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
  const marker = L.marker(center, { icon: customIcon });
  marker.on('click', onClick);
  return marker;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
