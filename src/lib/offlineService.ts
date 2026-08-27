import { supabase } from './supabase';
import {
  localDB,
  type AnimalCacheItem,
  type PotreroCacheItem,
  type PotreradaCacheItem,
  type PesajeOfflineQueueItem,
  type AforoOfflineQueueItem
} from './db';

/**
 * 1. Sincroniza la caché local del teléfono/navegador con los animales y potreros de la finca.
 * Debe ejecutarse cuando la app tiene conexión a internet.
 */
export async function sincronizarCacheFinca(fincaId: string): Promise<void> {
  if (!fincaId || !navigator.onLine) return;

  try {
    const [animalesRes, potrerosRes, potreradasRes] = await Promise.all([
      supabase
        .from('animales')
        .select(`
          id, numero_chapeta, nombre_propietario, etapa,
          peso_ingreso, peso_compra, fecha_ingreso, fecha_ingreso_ceba, peso_ingreso_ceba,
          id_potrerada, estado,
          potreros ( nombre ),
          potreradas:potreradas!animales_id_potrerada_fkey ( nombre )
        `)
        .eq('id_finca', fincaId)
        .eq('estado', 'activo')
        .limit(50000),

      supabase
        .from('potreros')
        .select('id, nombre, area_ha, capacidad_maxima')
        .eq('id_finca', fincaId)
        .limit(10000),

      supabase
        .from('potreradas')
        .select('id, nombre')
        .eq('id_finca', fincaId)
        .limit(10000)
    ]);

    if (animalesRes.data) {
      const ahora = new Date().toISOString();
      const animalesCache: AnimalCacheItem[] = animalesRes.data.map((a: any) => ({
        id: a.id,
        id_finca: fincaId,
        numero_chapeta: a.numero_chapeta,
        nombre_propietario: a.nombre_propietario,
        etapa: a.etapa,
        peso_ingreso: a.peso_ingreso,
        peso_compra: a.peso_compra,
        fecha_ingreso: a.fecha_ingreso,
        fecha_ingreso_ceba: a.fecha_ingreso_ceba,
        peso_ingreso_ceba: a.peso_ingreso_ceba,
        id_potrerada: a.id_potrerada,
        potrero_nombre: a.potreros?.nombre || '',
        potrerada_nombre: a.potreradas?.nombre || '',
        updated_at: ahora
      }));

      // Limpiar y reemplazar caché de esta finca
      await localDB.animalesCache.where('id_finca').equals(fincaId).delete();
      await localDB.animalesCache.bulkPut(animalesCache);
    }

    if (potrerosRes.data) {
      const potrerosCache: PotreroCacheItem[] = potrerosRes.data.map((p: any) => ({
        id: p.id,
        id_finca: fincaId,
        nombre: p.nombre,
        area_ha: p.area_ha,
        capacidad_maxima: p.capacidad_maxima
      }));

      await localDB.potrerosCache.where('id_finca').equals(fincaId).delete();
      await localDB.potrerosCache.bulkPut(potrerosCache);
    }

    if (potreradasRes.data) {
      const potreradasCache: PotreradaCacheItem[] = potreradasRes.data.map((p: any) => ({
        id: p.id,
        id_finca: fincaId,
        nombre: p.nombre
      }));

      await localDB.potreradasCache.where('id_finca').equals(fincaId).delete();
      await localDB.potreradasCache.bulkPut(potreradasCache);
    }
  } catch (error) {
    console.warn('[OfflineService] Error al sincronizar caché local:', error);
  }
}

/**
 * 2. Guarda un pesaje en la cola offline de IndexedDB cuando no hay conexión.
 */
export async function guardarPesajeOffline(pesaje: {
  id_finca: string;
  id_animal: string;
  chapeta_ref?: string;
  peso: number;
  fecha: string;
  etapa: string;
  gdp_calculada?: number;
  gmp_calculada?: number;
}): Promise<PesajeOfflineQueueItem> {
  const item: PesajeOfflineQueueItem = {
    id: crypto.randomUUID(),
    ...pesaje,
    creado_en: new Date().toISOString(),
    status_sync: 'pending'
  };

  await localDB.pesajesOfflineQueue.put(item);
  return item;
}

/**
 * 3. Guarda un aforo en la cola offline de IndexedDB cuando no hay conexión.
 */
export async function guardarAforoOffline(aforo: {
  id_finca: string;
  id_potrero: string;
  potrero_nombre_ref?: string;
  fecha: string;
  metodo: string;
  gramos_m2: number;
  muesca_promedio?: number;
}): Promise<AforoOfflineQueueItem> {
  const item: AforoOfflineQueueItem = {
    id: crypto.randomUUID(),
    ...aforo,
    creado_en: new Date().toISOString(),
    status_sync: 'pending'
  };

  await localDB.aforosOfflineQueue.put(item);
  return item;
}

/**
 * 4. Obtiene el recuento de pesajes y aforos pendientes de sincronizar.
 */
export async function obtenerConteoPendienteOffline(fincaId: string): Promise<{ pesajes: number; aforos: number; total: number }> {
  if (!fincaId) return { pesajes: 0, aforos: 0, total: 0 };

  const pesajes = await localDB.pesajesOfflineQueue
    .where('id_finca')
    .equals(fincaId)
    .and((item: PesajeOfflineQueueItem) => item.status_sync === 'pending' || item.status_sync === 'failed')
    .count();

  const aforos = await localDB.aforosOfflineQueue
    .where('id_finca')
    .equals(fincaId)
    .and((item: AforoOfflineQueueItem) => item.status_sync === 'pending' || item.status_sync === 'failed')
    .count();

  return { pesajes, aforos, total: pesajes + aforos };
}

/**
 * 5. Procesa la cola de sincronización offline enviando los datos a Supabase en lotes (batch upsert).
 */
export async function procesarSincronizacionOffline(fincaId: string): Promise<{ procesados: number; errores: number }> {
  if (!fincaId || !navigator.onLine) return { procesados: 0, errores: 0 };

  let procesados = 0;
  let errores = 0;

  // --- Sincronizar Pesajes ---
  const pesajesPendientes = await localDB.pesajesOfflineQueue
    .where('id_finca')
    .equals(fincaId)
    .and((item: PesajeOfflineQueueItem) => item.status_sync === 'pending' || item.status_sync === 'failed')
    .toArray();

  for (const p of pesajesPendientes) {
    try {
      await localDB.pesajesOfflineQueue.update(p.id, { status_sync: 'syncing' });

      const { error } = await supabase.from('registros_pesaje').insert({
        id_animal: p.id_animal,
        peso: p.peso,
        fecha: p.fecha,
        etapa: p.etapa,
        gdp_calculada: p.gdp_calculada,
        gmp_calculada: p.gmp_calculada
      });

      if (error) throw error;

      // Al insertarse con éxito en Supabase, se elimina de la cola local
      await localDB.pesajesOfflineQueue.delete(p.id);
      procesados++;
    } catch (err: any) {
      console.error(`[OfflineSync] Error al sincronizar pesaje ${p.id}:`, err);
      await localDB.pesajesOfflineQueue.update(p.id, {
        status_sync: 'failed',
        error_msg: err.message || 'Error desconocido'
      });
      errores++;
    }
  }

  // --- Sincronizar Aforos ---
  const aforosPendientes = await localDB.aforosOfflineQueue
    .where('id_finca')
    .equals(fincaId)
    .and((item: AforoOfflineQueueItem) => item.status_sync === 'pending' || item.status_sync === 'failed')
    .toArray();

  for (const a of aforosPendientes) {
    try {
      await localDB.aforosOfflineQueue.update(a.id, { status_sync: 'syncing' });

      const { error } = await supabase.from('registros_aforo').insert({
        id_finca: a.id_finca,
        id_potrero: a.id_potrero,
        fecha: a.fecha,
        metodo: a.metodo,
        gramos_m2: a.gramos_m2,
        muesca_promedio: a.muesca_promedio
      });

      if (error) throw error;

      await localDB.aforosOfflineQueue.delete(a.id);
      procesados++;
    } catch (err: any) {
      console.error(`[OfflineSync] Error al sincronizar aforo ${a.id}:`, err);
      await localDB.aforosOfflineQueue.update(a.id, {
        status_sync: 'failed',
        error_msg: err.message || 'Error desconocido'
      });
      errores++;
    }
  }

  return { procesados, errores };
}

