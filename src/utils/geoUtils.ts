/**
 * Determina si un punto [lat, lng] está dentro de un polígono [lng, lat][] usando el algoritmo de Ray-Casting.
 */
export function isPointInPolygonRing(
  lat: number,
  lng: number,
  ring: number[][] // Array de [lng, lat]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; // lng i
    const yi = ring[i][1]; // lat i
    const xj = ring[j][0]; // lng j
    const yj = ring[j][1]; // lat j

    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Determina si un punto [lat, lng] está dentro de una geometría GeoJSON (Polygon o MultiPolygon).
 */
export function isPointInGeoJsonGeometry(
  lat: number,
  lng: number,
  geometry: any
): boolean {
  if (!geometry || !geometry.type || !geometry.coordinates) return false;

  if (geometry.type === 'Polygon') {
    // ring exterior es coordinates[0]
    return isPointInPolygonRing(lat, lng, geometry.coordinates[0]);
  }

  if (geometry.type === 'MultiPolygon') {
    for (const polyCoords of geometry.coordinates) {
      if (isPointInPolygonRing(lat, lng, polyCoords[0])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Busca qué potrero contiene las coordenadas GPS actuales del usuario.
 */
export function findCurrentPaddockByGps(
  lat: number,
  lng: number,
  potreros: Array<{ id: string; nombre: string; geojson_geometry?: any }>
): { id: string; nombre: string } | null {
  for (const potrero of potreros) {
    if (potrero.geojson_geometry) {
      if (isPointInGeoJsonGeometry(lat, lng, potrero.geojson_geometry)) {
        return { id: potrero.id, nombre: potrero.nombre };
      }
    }
  }
  return null;
}
