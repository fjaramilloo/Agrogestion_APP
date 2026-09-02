import type { ParsedKmlFeature } from './kmlParser';

export interface ExistingPotrero {
  id: string;
  nombre: string;
  area_hectareas: number;
  geojson_geometry?: any;
}

export interface MatchCandidate {
  kmzFeature: ParsedKmlFeature;
  matchedPotreroId: string | null; // ID del potrero existente coincidente, o null si es nuevo
  matchedPotreroName?: string;
  confidence: number; // 0.0 a 1.0
  status: 'exact' | 'fuzzy' | 'new'; // 'exact' = coincidencia exacta, 'fuzzy' = sugerido, 'new' = se creará como nuevo
}

/**
 * Normaliza una cadena de texto para facilitar la comparación de nombres de potreros.
 * Ejemplo: "POTRERO #1" -> "1", "Potrero El Paraiso" -> "elparaiso"
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u06ff]/g, '') // Quitar tildes y diacríticos
    .replace(/^(potrero|potreros|pot|lote|p-)\s*/i, '') // Eliminar prefijos comunes
    .replace(/[^a-z0-9]/g, '') // Dejar solo letras y números
    .trim();
}

/**
 * Calcula una puntuación de similitud entre dos nombres (0 a 1).
 */
export function calculateSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;

  // Si uno está contenido en el otro de forma clara
  if (norm1.length > 2 && norm2.length > 2) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return 0.85;
    }
  }

  // Comparación por número final (ej: "Potrero 12" y "P-12")
  const num1 = norm1.match(/\d+$/)?.[0];
  const num2 = norm2.match(/\d+$/)?.[0];
  if (num1 && num2 && num1 === num2) {
    return 0.75;
  }

  return 0;
}

/**
 * Realiza la vinculación automática (Auto-Match) entre los polígonos del KMZ y los potreros de la base de datos.
 */
export function matchKmzWithExistingPotreros(
  kmzPolygons: ParsedKmlFeature[],
  existingPotreros: ExistingPotrero[]
): MatchCandidate[] {
  const results: MatchCandidate[] = [];
  const usedPotreroIds = new Set<string>();

  for (const feature of kmzPolygons) {
    let bestMatch: ExistingPotrero | null = null;
    let highestScore = 0;

    for (const potrero of existingPotreros) {
      if (usedPotreroIds.has(potrero.id)) continue;

      const score = calculateSimilarity(feature.name, potrero.nombre);

      if (score > highestScore) {
        highestScore = score;
        bestMatch = potrero;
      }
    }

    if (bestMatch && highestScore >= 0.7) {
      usedPotreroIds.add(bestMatch.id);
      results.push({
        kmzFeature: feature,
        matchedPotreroId: bestMatch.id,
        matchedPotreroName: bestMatch.nombre,
        confidence: highestScore,
        status: highestScore >= 0.95 ? 'exact' : 'fuzzy',
      });
    } else {
      results.push({
        kmzFeature: feature,
        matchedPotreroId: null,
        confidence: 0,
        status: 'new',
      });
    }
  }

  return results;
}
