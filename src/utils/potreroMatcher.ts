import type { ParsedKmlFeature } from './kmlParser';

export interface ExistingPotrero {
  id: string;
  nombre: string;
  area_hectareas: number;
  geojson_geometry?: any;
}

export type MatchStatus =
  | 'exact'
  | 'fuzzy'
  | 'new'
  | 'omit'
  | 'bosque'
  | 'agua'
  | 'infraestructura';

export interface MatchCandidate {
  kmzFeature: ParsedKmlFeature;
  matchedPotreroId: string | null; // ID del potrero existente coincidente, o null si es nuevo/zona
  matchedPotreroName?: string;
  confidence: number; // 0.0 a 1.0
  status: MatchStatus;
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
 * Detecta si el nombre del polígono corresponde a una zona ambiental o infraestructura.
 */
export function detectSpecialZoneType(name: string): 'bosque' | 'agua' | 'infraestructura' | null {
  if (!name) return null;
  const lower = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u06ff]/g, '');

  // Bosques, Reforestaciones, Reservas, Montes, Guaduales
  if (
    /(bosque|reforestaci|reserva|arbol|monte|guadual|selva|vegetaci|proteg|flora|fauna|silvopast)/i.test(lower)
  ) {
    return 'bosque';
  }

  // Cuerpos de agua, Humedales, Ríos, Represas, Pozos, Jagüeyes
  if (
    /(lago|laguna|rio|quebrada|humedal|represa|jaguey|pozo|nacimiento|estero|canada|dique|alberca)/i.test(lower)
  ) {
    return 'agua';
  }

  // Infraestructura, Casas, Corrales, Bodegas, Establo, Campamento
  if (
    /(casa|corral|bodega|establo|kiosko|quiosco|campamento|infraestructura|vaqueria|bascula|brete|orde|manga|taller)/i.test(lower)
  ) {
    return 'infraestructura';
  }

  return null;
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
      // Si no coincide con un potrero existente, revisar si es zona ambiental/infraestructura
      const specialZone = detectSpecialZoneType(feature.name);
      results.push({
        kmzFeature: feature,
        matchedPotreroId: null,
        confidence: specialZone ? 0.8 : 0,
        status: specialZone || 'new',
      });
    }
  }

  return results;
}
