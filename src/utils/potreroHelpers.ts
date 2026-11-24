import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Obtiene el id del potrero actualmente ocupado por una potrerada (movimiento abierto).
 * Retorna null si el lote no tiene un movimiento activo o si ocurre un error de red.
 */
export async function getActivePotreroIdForPotrerada(
    client: SupabaseClient,
    potreradaId: string | null | undefined
): Promise<string | null> {
    if (!potreradaId) return null;
    try {
        const { data, error } = await client
            .from('movimientos_potreros')
            .select('id_potrero')
            .eq('id_potrerada', potreradaId)
            .is('fecha_salida', null)
            .order('fecha_entrada', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) return null;
        return data?.id_potrero ?? null;
    } catch {
        return null;
    }
}

/**
 * Obtiene en bloque el mapa potreradaId -> id_potrero activo para múltiples lotes.
 */
export async function getActivePotrerosMapForPotreradas(
    client: SupabaseClient,
    potreradaIds: string[]
): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    const uniqueIds = [...new Set(potreradaIds.filter(Boolean))];
    if (uniqueIds.length === 0) return result;
    try {
        const { data, error } = await client
            .from('movimientos_potreros')
            .select('id_potrerada, id_potrero, fecha_entrada')
            .in('id_potrerada', uniqueIds)
            .is('fecha_salida', null)
            .order('fecha_entrada', { ascending: false });
        if (error || !data) return result;
        for (const row of data) {
            if (row.id_potrerada && !result.has(row.id_potrerada)) {
                result.set(row.id_potrerada, row.id_potrero ?? null);
            }
        }
    } catch {
        // Fallback seguro: retornar mapa parcial o vacío
    }
    return result;
}
