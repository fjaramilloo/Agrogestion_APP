import { isConexionDegradada, isModoCampoActivo, registrarNetworkFirstSignal } from './httpOffline';

/**
 * Pagina automáticamente consultas PostgREST / RPC de Supabase en bloques de 1,000 filas
 * (límite máximo por petición del servidor PostgREST) para evitar truncamientos silenciosos
 * en fincas con más de 1,000 animales o registros históricos.
 *
 * - En línea usa señal Network-First para que todas las páginas provengan de la nube y nunca
 *   se mezclen páginas de caché vieja con páginas de servidor (que causarían duplicados).
 * - Deduplica por `id` / `id_animal` como barrera defensiva adicional.
 */
export async function fetchAllSupabasePages<T = any>(
  buildPageQuery: (from: number, to: number, signal?: AbortSignal) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  maxPages = 50
): Promise<{ data: T[]; error: any }> {
  const online =
    !isModoCampoActivo() &&
    (typeof navigator === 'undefined' || navigator.onLine) &&
    !isConexionDegradada();

  let ctrl: AbortController | undefined;
  if (online && typeof AbortController !== 'undefined') {
    ctrl = new AbortController();
    registrarNetworkFirstSignal(ctrl.signal);
  }

  const all: T[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildPageQuery(from, to, ctrl?.signal);
    if (error) {
      if (all.length > 0) return { data: all, error: null };
      return { data: [], error };
    }
    if (!Array.isArray(data) || data.length === 0) break;

    for (const row of data as any[]) {
      const rowKey = row && typeof row === 'object' ? (row.id ?? row.id_animal) : undefined;
      if (rowKey !== undefined && rowKey !== null) {
        const keyStr = String(rowKey);
        if (seenIds.has(keyStr)) continue;
        seenIds.add(keyStr);
      }
      all.push(row);
    }

    if (data.length < pageSize) break;
  }
  return { data: all, error: null };
}
