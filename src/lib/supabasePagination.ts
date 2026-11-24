/**
 * Pagina automáticamente consultas PostgREST / RPC de Supabase en bloques de 1,000 filas
 * (límite máximo por petición del servidor PostgREST) para evitar truncamientos silenciosos
 * en fincas con más de 1,000 animales o registros históricos.
 *
 * IMPORTANTE: la consulta dentro de `buildPageQuery` debe incluir un `.order(...)` determinístico
 * (por ejemplo `.order('id', { ascending: true })`) para evitar duplicados o saltos entre páginas.
 */
export async function fetchAllSupabasePages<T = any>(
  buildPageQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  maxPages = 50
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildPageQuery(from, to);
    if (error) {
      if (all.length > 0) return { data: all, error: null };
      return { data: [], error };
    }
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return { data: all, error: null };
}
