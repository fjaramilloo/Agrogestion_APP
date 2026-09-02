import JSZip from 'jszip';
import { kml } from '@tmcw/togeojson';

export interface ParsedKmlFeature {
  id: string;
  name: string;
  description?: string;
  geometry: any;
  type: 'Polygon' | 'MultiPolygon' | 'Point' | 'LineString';
  areaHa: number;
  center: [number, number]; // [lat, lng]
}

export interface ParsedKmlResult {
  fileName: string;
  features: ParsedKmlFeature[];
  polygons: ParsedKmlFeature[];
  center: [number, number]; // [lat, lng]
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
}

/**
 * Calcula el área aproximada en Hectáreas de un polígono GeoJSON (coordenadas [lon, lat])
 * usando la fórmula de área esférica (Geodésica).
 */
export function calculatePolygonAreaHa(coordinates: number[][][]): number {
  if (!coordinates || coordinates.length === 0) return 0;
  const ring = coordinates[0];
  if (ring.length < 3) return 0;

  const EARTH_RADIUS = 6378137; // Radio medio de la Tierra en metros
  let area = 0;

  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[i + 1];

    const lon1 = (p1[0] * Math.PI) / 180;
    const lat1 = (p1[1] * Math.PI) / 180;
    const lon2 = (p2[0] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
  const areaHa = area / 10000; // m² a Hectáreas
  return Math.round(areaHa * 100) / 100; // Redondear a 2 decimales
}

/**
 * Calcula el centroide (latitud, longitud) de un conjunto de coordenadas.
 */
export function calculateCentroid(coordinates: number[][]): [number, number] {
  if (!coordinates || coordinates.length === 0) return [0, 0];
  let sumLat = 0;
  let sumLng = 0;

  for (const pt of coordinates) {
    sumLng += pt[0];
    sumLat += pt[1];
  }

  return [sumLat / coordinates.length, sumLng / coordinates.length];
}

/**
 * Parsea un archivo KMZ o KML y devuelve las características GeoJSON estructuradas.
 */
export async function parseKmzOrKmlFile(file: File): Promise<ParsedKmlResult> {
  let kmlText = '';

  if (file.name.toLowerCase().endsWith('.kmz')) {
    // Archivo compreso KMZ
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);

    // Buscar el archivo .kml principal dentro del zip
    let kmlFileName = Object.keys(zipContent.files).find(
      (name) => name.toLowerCase().endsWith('.kml') && !name.startsWith('__MACOSX')
    );

    if (!kmlFileName) {
      throw new Error('No se encontró ningún archivo .kml dentro del paquete .kmz');
    }

    kmlText = await zipContent.files[kmlFileName].async('string');
  } else if (file.name.toLowerCase().endsWith('.kml')) {
    // Archivo plano KML
    kmlText = await file.text();
  } else {
    throw new Error('Formato de archivo no soportado. Debe ser un archivo .kmz o .kml');
  }

  // Parsear texto XML a DOM
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('El archivo KML contiene un formato XML inválido o corrupto.');
  }

  // Convertir XML a GeoJSON usando toGeoJSON
  const geoJson = kml(xmlDoc);

  const parsedFeatures: ParsedKmlFeature[] = [];
  const polygonsOnly: ParsedKmlFeature[] = [];

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  if (geoJson && geoJson.features) {
    geoJson.features.forEach((feature: any, index: number) => {
      if (!feature.geometry) return;

      const geomType = feature.geometry.type;
      const rawName =
        feature.properties?.name ||
        feature.properties?.Name ||
        `Potrero ${index + 1}`;

      const rawDescription =
        feature.properties?.description || feature.properties?.Description || '';

      let areaHa = 0;
      let center: [number, number] = [0, 0];

      if (geomType === 'Polygon') {
        const ring = feature.geometry.coordinates[0];
        areaHa = calculatePolygonAreaHa(feature.geometry.coordinates);
        center = calculateCentroid(ring);

        // Actualizar límites (bounds)
        ring.forEach(([lng, lat]: [number, number]) => {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        });
      } else if (geomType === 'MultiPolygon') {
        let totalArea = 0;
        const allRings: number[][] = [];

        feature.geometry.coordinates.forEach((polyCoords: number[][][]) => {
          totalArea += calculatePolygonAreaHa(polyCoords);
          if (polyCoords[0]) {
            allRings.push(...polyCoords[0]);
          }
        });

        areaHa = Math.round(totalArea * 100) / 100;
        center = calculateCentroid(allRings);

        allRings.forEach((pt: number[]) => {
          const lng = pt[0];
          const lat = pt[1];
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        });
      } else if (geomType === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        center = [lat, lng];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }

      const parsed: ParsedKmlFeature = {
        id: `kmz_feat_${index}_${Date.now()}`,
        name: rawName.trim(),
        description: rawDescription,
        geometry: feature.geometry,
        type: geomType,
        areaHa,
        center,
      };

      parsedFeatures.push(parsed);

      if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
        polygonsOnly.push(parsed);
      }
    });
  }

  // Si no hay coordenadas válidas, asignar por defecto un centro neutro
  const centerLat = minLat <= maxLat ? (minLat + maxLat) / 2 : 4.5709;
  const centerLng = minLng <= maxLng ? (minLng + maxLng) / 2 : -74.2973;

  return {
    fileName: file.name,
    features: parsedFeatures,
    polygons: polygonsOnly,
    center: [centerLat, centerLng],
    bounds: [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
  };
}
