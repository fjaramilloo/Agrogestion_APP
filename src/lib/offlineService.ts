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
  if (!fincaId) return;

  // Si el usuario tiene activo el Modo Campo forzado o el navegador está offline, no consultar red
  const isModoCampo = typeof window !== 'undefined' && localStorage.getItem('agrogestion_modo_campo') === 'true';
  if (isModoCampo || !navigator.onLine) return;

  try {
    const [animalesRes, potrerosRes, potreradasRes, mapRes, preciosRes] = await Promise.all([
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
        .or('is_deleted.is.null,is_deleted.eq.false')
        .limit(50000),

      supabase
        .from('potreros')
        .select('id, nombre, area_hectareas, geojson_geometry, color_mapa, kml_name')
        .eq('id_finca', fincaId)
        .limit(10000),

      supabase
        .from('potreradas')
        .select('id, nombre')
        .eq('id_finca', fincaId)
        .limit(10000),

      supabase
        .from('mapas_finca')
        .select('*')
        .eq('id_finca', fincaId)
        .maybeSingle(),

      supabase
        .from('vista_precios_mercado')
        .select('*')
        .order('fecha_boletin', { ascending: true })
    ]);

    // BLINDAJE: Solo actualizar caché si la respuesta contiene datos válidos comprobados (evita vaciar la memoria local)
    if (animalesRes.data && animalesRes.data.length > 0) {
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

      // Limpiar y reemplazar caché de esta finca con datos nuevos
      await localDB.animalesCache.where('id_finca').equals(fincaId).delete();
      await localDB.animalesCache.bulkPut(animalesCache);
    }

    if (potrerosRes.data && potrerosRes.data.length > 0) {
      const potrerosCache: PotreroCacheItem[] = potrerosRes.data.map((p: any) => ({
        id: p.id,
        id_finca: fincaId,
        nombre: p.nombre,
        area_ha: p.area_hectareas,
        geojson_geometry: p.geojson_geometry,
        color_mapa: p.color_mapa,
        kml_name: p.kml_name,
        capacidad_maxima: undefined
      }));

      await localDB.potrerosCache.where('id_finca').equals(fincaId).delete();
      await localDB.potrerosCache.bulkPut(potrerosCache);
    }

    if (potreradasRes.data && potreradasRes.data.length > 0) {
      const potreradasCache: PotreradaCacheItem[] = potreradasRes.data.map((p: any) => ({
        id: p.id,
        id_finca: fincaId,
        nombre: p.nombre
      }));

      await localDB.potreradasCache.where('id_finca').equals(fincaId).delete();
      await localDB.potreradasCache.bulkPut(potreradasCache);
    }

    if (mapRes.data) {
      await localDB.mapasFincaCache.put({
        id_finca: fincaId,
        nombre_archivo: mapRes.data.nombre_archivo || 'plano.kmz',
        centro_latitud: mapRes.data.centro_latitud,
        centro_longitud: mapRes.data.centro_longitud,
        zoom_inicial: mapRes.data.zoom_inicial || 16,
        zonas_adicionales: mapRes.data.zonas_adicionales || [],
        actualizado_en: new Date().toISOString()
      });
    }

    if (preciosRes.data && preciosRes.data.length > 0) {
      await localDB.mercadoCache.put({
        id: 'mercado_general',
        precios: preciosRes.data,
        actualizado_en: new Date().toISOString()
      });
    }

    // Snapshot del Mapa Finca (potreros + ganado ubicado en cada uno)
    await guardarSnapshotMapa(fincaId, mapRes.data);
  } catch (error) {
    console.warn('[OfflineService] Error al sincronizar caché local:', error);
  }
}

/**
 * Construye y guarda el snapshot que usa el módulo Mapa Finca offline.
 * Antes solo se guardaba al abrir el mapa con internet, por eso "Descargar información" lo dejaba desactualizado.
 */
async function guardarSnapshotMapa(fincaId: string, mapData: any): Promise<void> {
  try {
    const [potsRes, movsRes, animalesRes] = await Promise.all([
      supabase
        .from('potreros')
        .select('id, nombre, area_hectareas, geojson_geometry, color_mapa, id_rotacion')
        .eq('id_finca', fincaId),
      supabase
        .from('movimientos_potreros')
        .select('id_potrero, id_potrerada, fecha_entrada, potreradas(nombre)')
        .eq('id_finca', fincaId)
        .is('fecha_salida', null),
      supabase
        .from('animales')
        .select('id, id_potrerada, nombre_propietario, peso_ingreso, peso_compra, fecha_ingreso, registros_pesaje (peso, fecha, gdp_calculada, gmp_calculada)')
        .eq('id_finca', fincaId)
        .eq('estado', 'activo')
        .or('is_deleted.is.null,is_deleted.eq.false')
    ]);

    // No sobrescribir un snapshot bueno con una respuesta fallida o vacía
    if (potsRes.error || !potsRes.data || potsRes.data.length === 0) return;

    const diasDesde = (s: string) => {
      if (!s) return 0;
      const t = new Date(s.split('T')[0] + 'T00:00:00');
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return Math.max(0, Math.floor((hoy.getTime() - t.getTime()) / 86400000));
    };

    const porPotrerada = new Map<string, any[]>();
    (animalesRes.data || []).forEach((a: any) => {
      if (!a.id_potrerada) return;
      if (!porPotrerada.has(a.id_potrerada)) porPotrerada.set(a.id_potrerada, []);
      porPotrerada.get(a.id_potrerada)!.push(a);
    });

    const metricas = new Map<string, any>();
    porPotrerada.forEach((animales, idPotrerada) => {
      let sumPeso = 0;
      let sumEst = 0;
      let ultimaFecha: string | null = null;
      const marcas = new Set<string>();

      for (const a of animales) {
        const regs = (a.registros_pesaje || []).sort(
          (x: any, y: any) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
        );
        const last = regs[0];
        const base = Number(a.peso_compra ?? a.peso_ingreso ?? 0);
        const actual = last ? Number(last.peso) : base;
        if (last?.fecha && (!ultimaFecha || new Date(last.fecha).getTime() > new Date(ultimaFecha).getTime())) {
          ultimaFecha = last.fecha;
        }
        sumPeso += actual;
        if (last) {
          const gmp = last.gmp_calculada != null
            ? Number(last.gmp_calculada)
            : (last.gdp_calculada ? Number(last.gdp_calculada) * 30 : 10.3);
          sumEst += actual + diasDesde(last.fecha) * (gmp / 30);
        } else if (a.fecha_ingreso) {
          sumEst += base + diasDesde(a.fecha_ingreso) * (10.3 / 30);
        } else {
          sumEst += actual;
        }
        if (a.nombre_propietario) marcas.add(a.nombre_propietario);
      }

      let fechaTxt: string | null = null;
      if (ultimaFecha) {
        const d = new Date(ultimaFecha.split('T')[0] + 'T00:00:00');
        const dias = diasDesde(ultimaFecha);
        const ds = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
        fechaTxt = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `${ds} (hace ${dias}d)`;
      }

      const n = animales.length;
      metricas.set(idPotrerada, {
        total_animales: n,
        peso_promedio: n > 0 ? Math.round(sumPeso / n) : 0,
        peso_promedio_estimado: n > 0 ? Math.round(sumEst / n) : 0,
        marcas: Array.from(marcas).sort(),
        fecha_ultimo_pesaje: fechaTxt
      });
    });

    const asignacion = new Map<string, any>();
    (movsRes.data || []).forEach((m: any) => {
      if (!m.id_potrero || !m.id_potrerada) return;
      const met = metricas.get(m.id_potrerada) || {
        total_animales: 0, peso_promedio: 0, peso_promedio_estimado: 0, marcas: []
      };
      asignacion.set(m.id_potrero, {
        id: m.id_potrerada,
        nombre: m.potreradas?.nombre || 'Lote Ganado',
        ...met,
        dias_en_potrero: m.fecha_entrada ? diasDesde(m.fecha_entrada) : 0,
        fecha_entrada: m.fecha_entrada
      });
    });

    const potreros = potsRes.data.map((p: any) => ({
      ...p,
      potrerada_actual: asignacion.get(p.id) || null
    }));

    await localDB.mapaSnapshotCache.put({
      id_finca: fincaId,
      actualizado_en: new Date().toISOString(),
      potreros,
      map_meta: mapData ? { lat: mapData.centro_latitud, lng: mapData.centro_longitud } : null,
      zonas_adicionales: mapData?.zonas_adicionales || []
    } as any);
  } catch (err) {
    console.warn('[OfflineService] Error guardando snapshot del mapa:', err);
  }
}

export function notificarCambioColaOffline() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-queue-changed'));
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
  notificarCambioColaOffline();
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
  notificarCambioColaOffline();
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
export async function procesarSincronizacionOffline(fincaId: string): Promise<{ procesados: number; errores: number; pesajes: number; aforos: number }> {
  const isModoCampo = typeof window !== 'undefined' && localStorage.getItem('agrogestion_modo_campo') === 'true';
  if (!fincaId || !navigator.onLine || isModoCampo) return { procesados: 0, errores: 0, pesajes: 0, aforos: 0 };

  let procesados = 0;
  let errores = 0;
  let pesajesOk = 0;
  let aforosOk = 0;

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
      pesajesOk++;
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
      aforosOk++;
    } catch (err: any) {
      console.error(`[OfflineSync] Error al sincronizar aforo ${a.id}:`, err);
      await localDB.aforosOfflineQueue.update(a.id, {
        status_sync: 'failed',
        error_msg: err.message || 'Error desconocido'
      });
      errores++;
    }
  }

  notificarCambioColaOffline();
  return { procesados, errores, pesajes: pesajesOk, aforos: aforosOk };
}

