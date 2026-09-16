import { differenceInDays } from 'date-fns';
import { localDB } from '../lib/db';

export interface PesajeCalculado {
    id: string;
    id_animal: string;
    fecha: string;
    peso: number;
    gdp_calculada: number;
    gmp_calculada: number;
    peso_anterior?: number;
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
        // Ejecución ultrarrápida nativa en PostgreSQL (Supabase)
        try {
            const { error: rpcError } = await supabaseClient.rpc('recalcular_historial_pesajes_animal', { p_id_animal: animalId });
            if (!rpcError) {
                return { success: true, pesajes: [] };
            }
        } catch (eRpc) {
            console.warn("RPC recalcular_historial_pesajes_animal falló, usando recálculo local:", eRpc);
        }

        // 1. Obtener datos maestros del animal (Fallback local)
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
            .select('id, id_animal, fecha, peso, etapa, id_potrero')
            .eq('id_animal', animalId)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .order('fecha', { ascending: true })
            .order('id', { ascending: true });

        if (pesajesError) {
            throw new Error(pesajesError.message);
        }

        if (!pesajes || pesajes.length === 0) {
            return { success: true, pesajes: [] };
        }

        const isCeba = animal.etapa === 'ceba';
        const pesoBaseInicial = isCeba
            ? (animal.peso_ingreso_ceba || animal.peso_compra || animal.peso_ingreso || 0)
            : (animal.peso_compra ?? animal.peso_ingreso ?? 0);
        const fechaBaseInicial = isCeba
            ? (animal.fecha_ingreso_ceba || animal.fecha_ingreso)
            : animal.fecha_ingreso;

        const pesajesRecalculados: PesajeCalculado[] = [];
        let pesoAnterior = Number(pesoBaseInicial);
        let fechaAnterior = String(fechaBaseInicial);

        // 3. Recalcular secuencialmente cada pesaje
        for (let i = 0; i < pesajes.length; i++) {
            const p = pesajes[i];
            const pesoActual = Number(p.peso);
            const fechaActual = p.fecha.includes('T') ? p.fecha.split('T')[0] : p.fecha;
            const fechaRef = fechaAnterior.includes('T') ? fechaAnterior.split('T')[0] : fechaAnterior;

            const diasDiff = Math.max(1, differenceInDays(new Date(fechaActual), new Date(fechaRef)));
            const gananciaKilos = pesoActual - pesoAnterior;

            // GDP en kg/día, GMP en kg/mes (30 días)
            const gdp = parseFloat((gananciaKilos / diasDiff).toFixed(4));
            const gmp = parseFloat((gdp * 30).toFixed(4));

            pesajesRecalculados.push({
                id: p.id,
                id_animal: animalId,
                fecha: p.fecha,
                peso: pesoActual,
                peso_anterior: pesoAnterior,
                gdp_calculada: gdp,
                gmp_calculada: gmp
            });

            // El pesaje actual se convierte en la base para el siguiente
            pesoAnterior = pesoActual;
            fechaAnterior = fechaActual;
        }

        // 4. Actualizar en Supabase en batch/secuencia
        for (const item of pesajesRecalculados) {
            await supabaseClient
                .from('registros_pesaje')
                .update({
                    peso_anterior: item.peso_anterior,
                    gdp_calculada: item.gdp_calculada,
                    gmp_calculada: item.gmp_calculada,
                    fecha_modificacion: new Date().toISOString()
                })
                .eq('id', item.id);
        }

        // 5. Actualizar en caché local (IndexedDB) si existe
        try {
            if (localDB?.animalesCache && pesajesRecalculados.length > 0) {
                const ultimoPesaje = pesajesRecalculados[pesajesRecalculados.length - 1];
                await localDB.animalesCache.update(animalId, {
                    ultimo_peso: ultimoPesaje.peso,
                    fecha_ultimo_pesaje: ultimoPesaje.fecha,
                    updated_at: new Date().toISOString()
                }).catch(() => {});
            }
        } catch (e) {
            // Error no bloqueante de caché
            console.warn('Advertencia al actualizar caché local de animal:', e);
        }

        return { success: true, pesajes: pesajesRecalculados };
    } catch (err: any) {
        console.error('Error al recalcular historial de pesajes:', err);
        return { success: false, pesajes: [], error: err.message || 'Error desconocido' };
    }
}
