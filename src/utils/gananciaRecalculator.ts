import { localDB } from '../lib/db';
import { calcularDiasEntreFechas, normalizeDateStr } from './ganancia';
import { isConexionDegradada, isModoCampoActivo } from '../lib/httpOffline';

export interface PesajeCalculado {
    id: string;
    id_animal: string;
    fecha: string;
    peso: number;
    gdp_calculada: number;
    gmp_calculada: number;
    peso_anterior?: number;
}

export interface PesajeEntradaRecalculo {
    id: string;
    fecha: string;
    peso: number;
    creado_en?: string | null;
}

/**
 * Calcula en memoria la cadena cronológica de peso_anterior, gdp_calculada y gmp_calculada
 * partiendo del peso y fecha base de ingreso.
 */
export function calculateWeighingHistoryChain(
    pesoBaseInicial: number,
    fechaBaseInicial: string | null | undefined,
    pesajes: PesajeEntradaRecalculo[]
): PesajeCalculado[] {
    const ordenados = [...pesajes].sort((a, b) => {
        const fa = normalizeDateStr(a.fecha) || '';
        const fb = normalizeDateStr(b.fecha) || '';
        if (fa !== fb) return fa.localeCompare(fb);
        const ca = String(a.creado_en || '');
        const cb = String(b.creado_en || '');
        if (ca !== cb) return ca.localeCompare(cb);
        return String(a.id).localeCompare(String(b.id));
    });

    const pesajesRecalculados: PesajeCalculado[] = [];
    let pesoAnterior = Number(pesoBaseInicial || 0);
    let fechaAnterior = normalizeDateStr(fechaBaseInicial) || '';

    for (const p of ordenados) {
        const pesoActual = Math.round(Number(p.peso));
        const fechaActual = normalizeDateStr(p.fecha) || p.fecha;
        const diasDiff = fechaAnterior ? calcularDiasEntreFechas(fechaAnterior, fechaActual) : 0;
        const gananciaKilos = pesoActual - pesoAnterior;

        const gdp = (diasDiff > 0 && pesoAnterior > 0)
            ? parseFloat((gananciaKilos / diasDiff).toFixed(4))
            : 0;
        const gmp = parseFloat((gdp * 30).toFixed(4));

        pesajesRecalculados.push({
            id: p.id,
            id_animal: '',
            fecha: p.fecha,
            peso: pesoActual,
            peso_anterior: pesoAnterior,
            gdp_calculada: gdp,
            gmp_calculada: gmp
        });

        pesoAnterior = pesoActual;
        fechaAnterior = fechaActual;
    }

    return pesajesRecalculados;
}

async function syncAnimalCacheAfterRecalc(
    animalId: string,
    latest: { peso: number; fecha: string; gmp_calculada?: number; gdp_calculada?: number } | null,
    fallbackPesoBase: number,
    fallbackFechaBase: string,
    supabaseClient: any
) {
    try {
        if (!localDB?.animalesCache) return;
        const cached = await localDB.animalesCache.get(animalId);
        if (!cached) return;

        let nextRegs = cached.registros_pesaje;
        try {
            const { data: freshRegs } = await supabaseClient
                .from('registros_pesaje')
                .select('id, id_animal, peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted')
                .eq('id_animal', animalId)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .order('fecha', { ascending: false });
            if (Array.isArray(freshRegs)) {
                nextRegs = freshRegs;
            }
        } catch {
            // Keep existing cache array if offline query fails
        }

        await localDB.animalesCache.update(animalId, {
            ultimo_peso: latest ? latest.peso : fallbackPesoBase,
            fecha_ultimo_pesaje: latest ? latest.fecha : fallbackFechaBase,
            ...(Array.isArray(nextRegs) ? { registros_pesaje: nextRegs } : {}),
            updated_at: new Date().toISOString()
        }).catch(() => {});
    } catch (e) {
        console.warn('Advertencia al actualizar caché local de animal:', e);
    }
}

/**
 * Recalcula en cascada la GDP y GMP para todos los pesajes de un animal
 * ordenados cronológicamente desde el peso base de ingreso.
 */
export async function recalcularHistorialPesajesAnimal(
    animalId: string,
    supabaseClient: any
): Promise<{ success: boolean; pesajes: PesajeCalculado[]; error?: string }> {
    try {
        const offline = typeof navigator !== 'undefined' && (!navigator.onLine || isModoCampoActivo() || isConexionDegradada());

        // Ejecución nativa en PostgreSQL cuando hay conexión estable
        if (!offline) {
            try {
                const { error: rpcError } = await supabaseClient.rpc('recalcular_historial_pesajes_animal', { p_id_animal: animalId });
                if (!rpcError) {
                    const { data: freshRegs } = await supabaseClient
                        .from('registros_pesaje')
                        .select('id, id_animal, peso, fecha, gdp_calculada, gmp_calculada')
                        .eq('id_animal', animalId)
                        .or('is_deleted.is.null,is_deleted.eq.false')
                        .order('fecha', { ascending: false })
                        .limit(1);

                    const { data: animBase } = await supabaseClient
                        .from('animales')
                        .select('peso_ingreso, peso_compra, fecha_ingreso')
                        .eq('id', animalId)
                        .maybeSingle();

                    const latest = freshRegs?.[0] || null;
                    await syncAnimalCacheAfterRecalc(
                        animalId,
                        latest,
                        Number(animBase?.peso_ingreso ?? animBase?.peso_compra ?? 0),
                        String(animBase?.fecha_ingreso || ''),
                        supabaseClient
                    );
                    return { success: true, pesajes: [] };
                }
            } catch (eRpc) {
                console.warn('RPC recalcular_historial_pesajes_animal falló, usando recálculo local:', eRpc);
            }
        }

        // 1. Obtener datos maestros del animal (Fallback / offline)
        const { data: animal, error: animError } = await supabaseClient
            .from('animales')
            .select('id, id_finca, etapa, peso_ingreso, peso_compra, fecha_ingreso, peso_ingreso_ceba, fecha_ingreso_ceba')
            .eq('id', animalId)
            .single();

        if (animError || !animal) {
            throw new Error(animError?.message || 'Animal no encontrado');
        }

        // 2. Obtener todos los pesajes no eliminados ordenados cronológicamente
        const { data: pesajes, error: pesajesError } = await supabaseClient
            .from('registros_pesaje')
            .select('id, id_animal, fecha, peso, etapa, id_potrero, creado_en')
            .eq('id_animal', animalId)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .order('fecha', { ascending: true })
            .order('id', { ascending: true });

        if (pesajesError) {
            throw new Error(pesajesError.message);
        }

        const pesoBaseInicial = Number(animal.peso_ingreso ?? animal.peso_compra ?? 0);
        const fechaBaseInicial = String(animal.fecha_ingreso || '');

        if (!pesajes || pesajes.length === 0) {
            await syncAnimalCacheAfterRecalc(animalId, null, pesoBaseInicial, fechaBaseInicial, supabaseClient);
            return { success: true, pesajes: [] };
        }

        // 3. Recalcular secuencialmente cada pesaje
        const pesajesRecalculados = calculateWeighingHistoryChain(pesoBaseInicial, fechaBaseInicial, pesajes).map(
            item => ({ ...item, id_animal: animalId })
        );

        // 4. Actualizar en Supabase en batch/secuencia verificando errores
        for (const item of pesajesRecalculados) {
            const { error: updErr } = await supabaseClient
                .from('registros_pesaje')
                .update({
                    peso_anterior: item.peso_anterior,
                    gdp_calculada: item.gdp_calculada,
                    gmp_calculada: item.gmp_calculada,
                    fecha_modificacion: new Date().toISOString()
                })
                .eq('id', item.id);
            if (updErr) {
                throw new Error(updErr.message);
            }
        }

        // 5. Actualizar en caché local (IndexedDB) si existe
        const ultimoPesaje = pesajesRecalculados[pesajesRecalculados.length - 1] || null;
        await syncAnimalCacheAfterRecalc(animalId, ultimoPesaje, pesoBaseInicial, fechaBaseInicial, supabaseClient);

        return { success: true, pesajes: pesajesRecalculados };
    } catch (err: any) {
        console.error('Error al recalcular historial de pesajes:', err);
        return { success: false, pesajes: [], error: err.message || 'Error desconocido' };
    }
}
