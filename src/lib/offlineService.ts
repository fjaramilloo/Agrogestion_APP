import { supabase } from './supabase';
import { isConexionDegradada, isModoCampoActivo, registrarNetworkFirstSignal } from './httpOffline';
import { fetchAllSupabasePages } from './supabasePagination';
import { contarEscriturasPendientes } from './syncService';
import { calcularMetricasMapaPotreradas } from '../utils/ganancia';
import { parseDecimalInput } from '../utils/decimalInput';
import {
  localDB,
  type AnimalCacheItem,
  type PotreroCacheItem,
  type PotreradaCacheItem,
  type RotacionCacheItem,
  type PesajeOfflineQueueItem,
  type AforoOfflineQueueItem,
  type CompraOfflineQueueItem
} from './db';

async function contarPendientesParaPrecache(fincaId?: string): Promise<number> {
  let total = await contarEscriturasPendientes();
  const filtarFinca = <T extends { status_sync: string; id_finca: string }>(item: T) =>
    (item.status_sync === 'pending' || item.status_sync === 'syncing') &&
    (!fincaId || item.id_finca === fincaId);

  total += await localDB.pesajesOfflineQueue.filter(filtarFinca).count();
  total += await localDB.aforosOfflineQueue.filter(filtarFinca).count();
  total += await localDB.comprasOfflineQueue.filter(filtarFinca).count();
  return total;
}

/**
 * 1. Sincroniza la caché local del teléfono/navegador con los animales y potreros de la finca.
 * Usa Network-First explícito para no dejar que respuestas de caché de 350ms sobrescriban
 * las tablas locales, y respeta cualquier escritura local pendiente por subir.
 */
export async function sincronizarCacheFinca(fincaId: string): Promise<void> {
  if (!fincaId) return;

  // Si el usuario tiene activo el Modo Campo forzado o el navegador está offline, no consultar red
  if (isModoCampoActivo() || !navigator.onLine || isConexionDegradada()) return;

  // Nunca descargar sobre cambios locales pendientes sin subir
  if ((await contarPendientesParaPrecache(fincaId)) > 0) return;

  const syncCtrl = new AbortController();
  registrarNetworkFirstSignal(syncCtrl.signal);

  // Semáforo de máximo 2 consultas en paralelo: deja siempre 4 canales libres para el uso interactivo (Pesaje, Inventario, etc.)
  let enVuelo = 0;
  const MAX_CONCURRENCIA = 2;
  const esperaCola: Array<() => void> = [];

  const adquirirTurno = (): Promise<void> => {
    if (enVuelo < MAX_CONCURRENCIA) {
      enVuelo++;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => esperaCola.push(() => { enVuelo++; resolve(); }));
  };

  const liberarTurno = () => {
    enVuelo--;
    const sig = esperaCola.shift();
    if (sig) sig();
  };

  const safe = async <T>(promise: PromiseLike<T>, tag: string): Promise<T | null> => {
    await adquirirTurno();
    try {
      if (isModoCampoActivo() || !navigator.onLine || isConexionDegradada()) {
        return null;
      }
      const res = await promise;
      return res;
    } catch (err) {
      console.warn(`[OfflineService] Query ${tag} omitida:`, err);
      return null;
    } finally {
      liberarTurno();
    }
  };

  try {
    const [
      animalesRes,
      , // animalesDashboardRes
      animalesVendidosRes,
      , // animalesVendidosLotesRes
      animalesComprasRes,
      potrerosRotationsRes,
      potrerosMapaRes,
      potreradasMovementsRes,
      potreradasTodasRes,
      rotacionesRotationsRes,
      rotacionesMovementsRes,
      movimientosRes,
      , // lluviasDashboardRes
      , // lluviasPluvioRes
      , // resumenFincaDashboardRes
      , // fincaDashboardRes
      , // fincaBasicaRes
      , // configKpiDashboardRes
      , // configKpiVentasRes
      , // configKpiComprasRes
      , // compradoresRes
      , // proveedoresRes
      , // propietariosRes
      diagRes,
      mapRes,
      preciosRes
    ] = await Promise.all([
      // 1. Animales activos con pesajes completos (para Inventario, Potreradas, Pesajes)
      safe(
        fetchAllSupabasePages((from, to) =>
          supabase
            .from('animales')
            .select(`
              id, numero_chapeta, nombre_propietario, etapa, estado,
              ok_ceba, sexo, tipo_macho, fecha_castracion,
              peso_ingreso, peso_compra, fecha_ingreso, fecha_ingreso_ceba, peso_ingreso_ceba,
              id_potrerada, id_potrero_actual,
              potreros ( nombre ),
              potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
              registros_pesaje ( id, id_animal, peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted )
            `)
            .eq('id_finca', fincaId)
            .eq('estado', 'activo')
            .or('is_deleted.is.null,is_deleted.eq.false')
            .order('id', { ascending: true })
            .order('fecha', { foreignTable: 'registros_pesaje', ascending: false })
            .range(from, to)
            .abortSignal(syncCtrl.signal)
        ),
        'animales_activos'
      ),

      // 2. Animales completos para Dashboard.tsx (coincidencia exacta de URL paginada)
      safe(
        fetchAllSupabasePages((from, to) =>
          supabase
            .from('animales')
            .select(`
              id, numero_chapeta, etapa, fecha_ingreso, peso_ingreso, peso_compra,
              fecha_ingreso_ceba, peso_ingreso_ceba, nombre_propietario, estado,
              id_potrerada, fecha_muerte, comprador_venta, fecha_venta, observaciones_venta,
              potreros ( nombre ),
              potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
              registros_pesaje (
                  id_animal, peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted
              )
            `)
            .eq('id_finca', fincaId)
            .or('is_deleted.is.null,is_deleted.eq.false')
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(syncCtrl.signal)
        ),
        'animales_dashboard'
      ),

      // 3. Animales vendidos completos (para Historial de Ventas)
      safe(
        fetchAllSupabasePages((from, to) =>
          supabase
            .from('animales')
            .select(`
              id, 
              numero_chapeta, 
              nombre_propietario,
              comprador_venta,
              fecha_venta,
              peso_venta,
              peso_ingreso,
              peso_compra,
              fecha_ingreso,
              etapa,
              fecha_ingreso_ceba,
              peso_ingreso_ceba,
              es_emergencia,
              precio_venta,
              observaciones_venta,
              potreros (nombre),
              registros_pesaje (
                  peso,
                  fecha,
                  etapa,
                  gdp_calculada,
                  is_deleted
              )
            `)
            .eq('id_finca', fincaId)
            .eq('estado', 'vendido')
            .order('fecha_venta', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(syncCtrl.signal)
        ),
        'animales_vendidos'
      ),

      // 4. Animales vendidos en lotes (para Gestión de Lotes)
      safe(
        fetchAllSupabasePages((from, to) =>
          supabase
            .from('animales')
            .select(`
              id, numero_chapeta, nombre_propietario, id_potrerada,
              peso_ingreso, peso_compra, fecha_ingreso, etapa, estado,
              potreradas:potreradas!animales_id_potrerada_fkey ( nombre )
            `)
            .eq('id_finca', fincaId)
            .eq('estado', 'vendido')
            .not('id_potrerada', 'is', null)
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(syncCtrl.signal)
        ),
        'animales_vendidos_lotes'
      ),

      // 5. Animales comprados completos (para Historial de Compras)
      safe(
        fetchAllSupabasePages((from, to) =>
          supabase
            .from('animales')
            .select(`
              id, 
              numero_chapeta, 
              nombre_propietario,
              potreros(nombre),
              proveedor_compra,
              fecha_ingreso,
              peso_ingreso,
              peso_compra,
              etapa,
              registros_pesaje (
                  peso,
                  fecha,
                  gdp_calculada,
                  is_deleted
              )
            `)
            .eq('id_finca', fincaId)
            .not('proveedor_compra', 'is', null)
            .order('fecha_ingreso', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(syncCtrl.signal)
        ),
        'animales_compras'
      ),

      // 6. Potreros (Rotations.tsx exact query)
      safe(
        supabase
          .from('potreros')
          .select('id, nombre, area_hectareas, id_rotacion')
          .eq('id_finca', fincaId)
          .order('nombre')
          .abortSignal(syncCtrl.signal),
        'potreros_rotaciones'
      ),

      // 7. Potreros completos para Mapa
      safe(
        supabase
          .from('potreros')
          .select('id, nombre, area_hectareas, id_rotacion, geojson_geometry, color_mapa, kml_name')
          .eq('id_finca', fincaId)
          .order('nombre')
          .limit(10000)
          .abortSignal(syncCtrl.signal),
        'potreros_mapa'
      ),

      // 8. Potreradas / Lotes (Movements.tsx exact query)
      safe(
        supabase
          .from('potreradas')
          .select('id, nombre, id_rotacion')
          .eq('id_finca', fincaId)
          .order('nombre')
          .abortSignal(syncCtrl.signal),
        'potreradas_movements'
      ),

      // 9. Potreradas todas las columnas
      safe(
        supabase
          .from('potreradas')
          .select('*')
          .eq('id_finca', fincaId)
          .order('nombre', { ascending: true })
          .limit(10000)
          .abortSignal(syncCtrl.signal),
        'potreradas_todas'
      ),

      // 10. Rotaciones básicas (Rotations.tsx exact query)
      safe(
        supabase
          .from('rotaciones')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre')
          .abortSignal(syncCtrl.signal),
        'rotaciones_basicas'
      ),

      // 11. Rotaciones con potreros (Movements.tsx exact query)
      safe(
        supabase
          .from('rotaciones')
          .select(`
            id, 
            nombre,
            potreros (id, nombre)
          `)
          .eq('id_finca', fincaId)
          .order('nombre')
          .abortSignal(syncCtrl.signal),
        'rotaciones_con_potreros'
      ),

      // 12. Movimientos activos de potreros
      safe(
        supabase
          .from('movimientos_potreros')
          .select(`
            id, id_potrerada, id_potrero, fecha_entrada, fecha_salida,
            potreros (id, nombre, id_rotacion),
            potreradas (nombre)
          `)
          .eq('id_finca', fincaId)
          .is('fecha_salida', null)
          .order('fecha_entrada', { ascending: false })
          .abortSignal(syncCtrl.signal),
        'movimientos_potreros'
      ),

      // 13. Registros de lluvia (Dashboard.tsx exact query paginada)
      safe(
        fetchAllSupabasePages((from, to) =>
          supabase
            .from('registros_lluvia')
            .select('fecha, milimetros, id_pluviometro')
            .eq('id_finca', fincaId)
            .order('fecha', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(syncCtrl.signal)
        ),
        'lluvias_dashboard'
      ),

      // 14. Pluviómetros de la finca y registros (Pluviometría module exact queries)
      safe(
        supabase
          .from('pluviometros_finca')
          .select('*')
          .eq('id_finca', fincaId)
          .order('orden', { ascending: true })
          .order('creado_en', { ascending: true })
          .abortSignal(syncCtrl.signal),
        'pluviometros_finca'
      ),
      safe(
        fetchAllSupabasePages((from, to) =>
          supabase
            .from('registros_lluvia')
            .select('*')
            .eq('id_finca', fincaId)
            .order('fecha', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to)
            .abortSignal(syncCtrl.signal)
        ),
        'lluvias_pluvio'
      ),

      // 15. Resumen finca (Dashboard.tsx exact query)
      safe(
        supabase
          .from('resumen_finca')
          .select('*')
          .eq('id_finca', fincaId)
          .abortSignal(syncCtrl.signal)
          .single(),
        'resumen_finca_single'
      ),

      // 16. Información finca (Dashboard.tsx exact query)
      safe(
        supabase
          .from('fincas')
          .select('nombre, proposito, area_aprovechable, ubicacion, municipio')
          .eq('id', fincaId)
          .abortSignal(syncCtrl.signal)
          .single(),
        'finca_dashboard'
      ),

      // 17. Información finca básica
      safe(
        supabase
          .from('fincas')
          .select('id, nombre, ubicacion, municipio, proposito, area_aprovechable')
          .eq('id', fincaId)
          .abortSignal(syncCtrl.signal)
          .single(),
        'finca_basica'
      ),

      // 18. Configuración KPI (Dashboard.tsx exact query)
      safe(
        supabase
          .from('configuracion_kpi')
          .select('precio_venta_promedio, costo_mensual_animal, umbral_alto_gmp, umbral_medio_gmp, participacion_utilidad, corte_peso_1, corte_peso_2, corte_peso_3, preset_peso')
          .eq('id_finca', fincaId)
          .abortSignal(syncCtrl.signal)
          .single(),
        'config_kpi_dashboard'
      ),

      // 19. Configuración KPI (HistorialVentas.tsx exact query)
      safe(
        supabase
          .from('configuracion_kpi')
          .select('umbral_alto_gmp, umbral_medio_gmp, precio_venta_promedio, costo_mensual_animal, participacion_utilidad')
          .eq('id_finca', fincaId)
          .abortSignal(syncCtrl.signal)
          .single(),
        'config_kpi_ventas'
      ),

      // 20. Configuración KPI (HistorialCompras.tsx exact query)
      safe(
        supabase
          .from('configuracion_kpi')
          .select('umbral_alto_gmp, umbral_medio_gmp')
          .eq('id_finca', fincaId)
          .abortSignal(syncCtrl.signal)
          .single(),
        'config_kpi_compras'
      ),

      // 21. Compradores
      safe(
        supabase
          .from('compradores')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre')
          .abortSignal(syncCtrl.signal),
        'compradores'
      ),

      // 22. Proveedores
      safe(
        supabase
          .from('proveedores')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre')
          .abortSignal(syncCtrl.signal),
        'proveedores'
      ),

      // 23. Propietarios
      safe(
        supabase
          .from('propietarios')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre')
          .abortSignal(syncCtrl.signal),
        'propietarios'
      ),

      // 24. Diagnóstico climático
      safe(
        supabase
          .from('analisis_climatico_finca')
          .select('*')
          .eq('id_finca', fincaId)
          .order('fecha_analisis', { ascending: false })
          .limit(1)
          .abortSignal(syncCtrl.signal)
          .maybeSingle(),
        'diagnostico_climatico'
      ),

      // 25. Mapa KML/KMZ
      safe(
        supabase
          .from('mapas_finca')
          .select('*')
          .eq('id_finca', fincaId)
          .abortSignal(syncCtrl.signal)
          .maybeSingle(),
        'mapas_finca'
      ),

      // 26. Precios de mercado
      safe(
        supabase
          .from('vista_precios_mercado')
          .select('*')
          .order('fecha_boletin', { ascending: true })
          .abortSignal(syncCtrl.signal),
        'precios_mercado'
      )
    ]);

    // Si mientras descargábamos entraron escrituras offline pendientes, no pisar lo local
    if ((await contarPendientesParaPrecache(fincaId)) > 0) return;

    // Guardar diagnóstico climático en localStorage para visualización instantánea 0ms
    if (diagRes?.data) {
      try {
        localStorage.setItem(`agro_diagnostico_climatico_${fincaId}`, JSON.stringify(diagRes.data));
      } catch { /* noop */ }
    }

    // ── GUARDADO BLINDADO EN DEXIE ──

    // 1. ANIMALES (Activos + Vendidos) — solo si la consulta principal de activos respondió sin error
    if (animalesRes && !animalesRes.error && Array.isArray(animalesRes.data)) {
      const mapaAnimales = new Map<string, AnimalCacheItem>();
      const ahora = new Date().toISOString();

      animalesRes.data.forEach((a: any) => {
        const pesajesActivos = (a.registros_pesaje || []).filter((r: any) => !r.is_deleted);
        const ultP = [...pesajesActivos].sort((x: any, y: any) => new Date(y.fecha || 0).getTime() - new Date(x.fecha || 0).getTime())[0];
        mapaAnimales.set(a.id, {
          id: a.id,
          id_finca: fincaId,
          numero_chapeta: a.numero_chapeta,
          nombre_propietario: a.nombre_propietario,
          etapa: a.etapa,
          estado: 'activo',
          ok_ceba: Boolean(a.ok_ceba),
          sexo: a.sexo,
          tipo_macho: a.tipo_macho,
          fecha_castracion: a.fecha_castracion,
          peso_ingreso: a.peso_ingreso,
          peso_compra: a.peso_compra,
          fecha_ingreso: a.fecha_ingreso,
          fecha_ingreso_ceba: a.fecha_ingreso_ceba,
          peso_ingreso_ceba: a.peso_ingreso_ceba,
          ultimo_peso: ultP ? ultP.peso : (a.peso_ingreso ?? a.peso_compra),
          fecha_ultimo_pesaje: ultP ? ultP.fecha : a.fecha_ingreso,
          id_potrerada: a.id_potrerada,
          potrero_nombre: a.potreros?.nombre || '',
          potrerada_nombre: a.potreradas?.nombre || '',
          registros_pesaje: pesajesActivos,
          updated_at: ahora
        });
      });

      if (animalesVendidosRes && !animalesVendidosRes.error && Array.isArray(animalesVendidosRes.data)) {
        animalesVendidosRes.data.forEach((a: any) => {
          const prev = mapaAnimales.get(a.id);
          const pesajesActivos = (a.registros_pesaje || []).filter((r: any) => !r.is_deleted);
          const ultP = [...pesajesActivos].sort((x: any, y: any) => new Date(y.fecha || 0).getTime() - new Date(x.fecha || 0).getTime())[0];
          mapaAnimales.set(a.id, {
            id: a.id,
            id_finca: fincaId,
            numero_chapeta: a.numero_chapeta,
            nombre_propietario: a.nombre_propietario,
            etapa: a.etapa,
            estado: 'vendido',
            peso_ingreso: a.peso_ingreso,
            peso_compra: a.peso_compra,
            fecha_ingreso: a.fecha_ingreso,
            fecha_ingreso_ceba: a.fecha_ingreso_ceba,
            peso_ingreso_ceba: a.peso_ingreso_ceba,
            id_potrerada: prev?.id_potrerada,
            potrero_nombre: a.potreros?.nombre || prev?.potrero_nombre || '',
            potrerada_nombre: prev?.potrerada_nombre || '',
            ultimo_peso: ultP ? ultP.peso : prev?.ultimo_peso,
            fecha_ultimo_pesaje: ultP ? ultP.fecha : prev?.fecha_ultimo_pesaje,
            peso_venta: a.peso_venta,
            fecha_venta: a.fecha_venta,
            comprador_venta: a.comprador_venta,
            observaciones_venta: a.observaciones_venta,
            precio_venta: a.precio_venta,
            registros_pesaje: pesajesActivos,
            updated_at: ahora
          });
        });
      }

      if (animalesComprasRes && !animalesComprasRes.error && Array.isArray(animalesComprasRes.data)) {
        animalesComprasRes.data.forEach((a: any) => {
          const prev = mapaAnimales.get(a.id);
          const pesajesActivos = (a.registros_pesaje || []).filter((r: any) => !r.is_deleted);
          mapaAnimales.set(a.id, {
            ...(prev || {}),
            id: a.id,
            id_finca: fincaId,
            numero_chapeta: a.numero_chapeta,
            nombre_propietario: a.nombre_propietario || prev?.nombre_propietario,
            etapa: a.etapa || prev?.etapa || 'ceba',
            estado: prev?.estado || 'activo',
            peso_ingreso: a.peso_ingreso ?? prev?.peso_ingreso,
            peso_compra: a.peso_compra ?? prev?.peso_compra,
            fecha_ingreso: a.fecha_ingreso || prev?.fecha_ingreso,
            proveedor_compra: a.proveedor_compra,
            potrero_nombre: a.potreros?.nombre || prev?.potrero_nombre || '',
            registros_pesaje: pesajesActivos.length > 0 ? pesajesActivos : (prev?.registros_pesaje || []),
            updated_at: ahora
          });
        });
      }

      try {
        await localDB.animalesCache.where('id_finca').equals(fincaId).delete();
        if (mapaAnimales.size > 0) {
          await localDB.animalesCache.bulkPut(Array.from(mapaAnimales.values()));
        }
      } catch (e) {
        console.warn('[OfflineService] Error guardando animalesCache:', e);
      }
    }

    // 2. POTREROS (Con id_rotacion y geometrías)
    const potsFuente = (potrerosMapaRes && !potrerosMapaRes.error && Array.isArray(potrerosMapaRes.data))
      ? potrerosMapaRes.data
      : (potrerosRotationsRes && !potrerosRotationsRes.error && Array.isArray(potrerosRotationsRes.data))
        ? potrerosRotationsRes.data
        : null;
    if (potsFuente !== null) {
      try {
        const potrerosCache: PotreroCacheItem[] = potsFuente.map((p: any) => ({
          id: p.id,
          id_finca: fincaId,
          nombre: p.nombre,
          area_ha: p.area_hectareas,
          id_rotacion: p.id_rotacion || null,
          geojson_geometry: p.geojson_geometry,
          color_mapa: p.color_mapa,
          kml_name: p.kml_name,
          capacidad_maxima: undefined
        }));

        await localDB.potrerosCache.where('id_finca').equals(fincaId).delete();
        if (potrerosCache.length > 0) {
          await localDB.potrerosCache.bulkPut(potrerosCache);
        }
      } catch (e) {
        console.warn('[OfflineService] Error guardando potrerosCache:', e);
      }
    }

    // 3. POTRERADAS / LOTES (Con id_rotacion)
    const ptsFuente = (potreradasMovementsRes && !potreradasMovementsRes.error && Array.isArray(potreradasMovementsRes.data))
      ? potreradasMovementsRes.data
      : (potreradasTodasRes && !potreradasTodasRes.error && Array.isArray(potreradasTodasRes.data))
        ? potreradasTodasRes.data
        : null;
    if (ptsFuente !== null) {
      try {
        const potreradasCache: PotreradaCacheItem[] = ptsFuente.map((p: any) => ({
          id: p.id,
          id_finca: fincaId,
          nombre: p.nombre,
          id_rotacion: p.id_rotacion || null
        }));

        await localDB.potreradasCache.where('id_finca').equals(fincaId).delete();
        if (potreradasCache.length > 0) {
          await localDB.potreradasCache.bulkPut(potreradasCache);
        }
      } catch (e) {
        console.warn('[OfflineService] Error guardando potreradasCache:', e);
      }
    }

    // 4. ROTACIONES
    const rotsFuente = (rotacionesRotationsRes && !rotacionesRotationsRes.error && Array.isArray(rotacionesRotationsRes.data))
      ? rotacionesRotationsRes.data
      : (rotacionesMovementsRes && !rotacionesMovementsRes.error && Array.isArray(rotacionesMovementsRes.data))
        ? rotacionesMovementsRes.data
        : null;
    if (rotsFuente !== null) {
      try {
        const rotacionesCache: RotacionCacheItem[] = rotsFuente.map((r: any) => ({
          id: r.id,
          id_finca: fincaId,
          nombre: r.nombre
        }));

        await localDB.rotacionesCache.where('id_finca').equals(fincaId).delete();
        if (rotacionesCache.length > 0) {
          await localDB.rotacionesCache.bulkPut(rotacionesCache);
        }
      } catch (e) {
        console.warn('[OfflineService] Error guardando rotacionesCache:', e);
      }
    }

    // 5. MAPAS FINCA
    if (mapRes?.data) {
      try {
        await localDB.mapasFincaCache.put({
          id_finca: fincaId,
          nombre_archivo: mapRes.data.nombre_archivo || 'plano.kmz',
          centro_latitud: mapRes.data.centro_latitud,
          centro_longitud: mapRes.data.centro_longitud,
          zoom_inicial: mapRes.data.zoom_inicial || 16,
          zonas_adicionales: mapRes.data.zonas_adicionales || [],
          actualizado_en: new Date().toISOString()
        });
      } catch (e) {
        console.warn('[OfflineService] Error guardando mapasFincaCache:', e);
      }
    }

    // 6. PRECIOS DE MERCADO
    if (preciosRes?.data && preciosRes.data.length > 0) {
      try {
        await localDB.mercadoCache.put({
          id: 'mercado_general',
          precios: preciosRes.data,
          actualizado_en: new Date().toISOString()
        });
      } catch (e) {
        console.warn('[OfflineService] Error guardando mercadoCache:', e);
      }
    }

    // 7. SNAPSHOT DEL MAPA FINCA (reutilizando los datos ya descargados para no duplicar peticiones)
    await guardarSnapshotMapa(
      fincaId,
      mapRes?.data,
      potrerosMapaRes && !potrerosMapaRes.error ? potrerosMapaRes.data : null,
      movimientosRes && !movimientosRes.error ? movimientosRes.data : null,
      animalesRes && !animalesRes.error ? animalesRes.data : null
    );
  } catch (error) {
    console.warn('[OfflineService] Error inesperado en sincronizarCacheFinca:', error);
  }
}

/**
 * Construye y guarda el snapshot que usa el módulo Mapa Finca offline.
 * Reutiliza los arrays ya descargados por sincronizarCacheFinca cuando están disponibles.
 */
async function guardarSnapshotMapa(
  fincaId: string,
  mapData: any,
  potsPrefetch: any[] | null = null,
  movsPrefetch: any[] | null = null,
  animalesPrefetch: any[] | null = null
): Promise<void> {
  try {
    let potsData = potsPrefetch;
    let movsData = movsPrefetch;
    let animalesData = animalesPrefetch;

    if (!potsData || !movsData || !animalesData) {
      const ctrl = new AbortController();
      registrarNetworkFirstSignal(ctrl.signal);
      const [potsRes, movsRes, animalesRes] = await Promise.all([
        potsData
          ? Promise.resolve({ data: potsData, error: null })
          : supabase
              .from('potreros')
              .select('id, nombre, area_hectareas, geojson_geometry, color_mapa, id_rotacion')
              .eq('id_finca', fincaId)
              .abortSignal(ctrl.signal),
        movsData
          ? Promise.resolve({ data: movsData, error: null })
          : supabase
              .from('movimientos_potreros')
              .select('id_potrero, id_potrerada, fecha_entrada, potreradas(nombre)')
              .eq('id_finca', fincaId)
              .is('fecha_salida', null)
              .abortSignal(ctrl.signal),
        animalesData
          ? Promise.resolve({ data: animalesData, error: null })
          : supabase
              .from('animales')
              .select('id, id_potrerada, nombre_propietario, etapa, peso_ingreso, peso_compra, fecha_ingreso, fecha_ingreso_ceba, peso_ingreso_ceba, registros_pesaje (peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted)')
              .eq('id_finca', fincaId)
              .eq('estado', 'activo')
              .or('is_deleted.is.null,is_deleted.eq.false')
              .abortSignal(ctrl.signal)
      ]);
      if (potsRes.error || !potsRes.data || potsRes.data.length === 0) return;
      potsData = potsRes.data;
      movsData = movsRes.data || [];
      animalesData = animalesRes.data || [];
    }

    // No sobrescribir un snapshot bueno con una respuesta vacía
    if (!potsData || potsData.length === 0) return;

    const diasDesde = (s: string) => {
      if (!s) return 0;
      const t = new Date(s.split('T')[0] + 'T00:00:00');
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      return Math.max(0, Math.floor((hoy.getTime() - t.getTime()) / 86400000));
    };

    const metricas = calcularMetricasMapaPotreradas(animalesData || []);

    const asignacion = new Map<string, any>();
    (movsData || []).forEach((m: any) => {
      if (!m.id_potrero || !m.id_potrerada) return;
      const met = metricas.get(m.id_potrerada) || {
        total_animales: 0,
        peso_promedio: 0,
        peso_promedio_estimado: 0,
        dias_sin_pesar: 0,
        confianza_peso: 'alta',
        marcas: [],
        fecha_ultimo_pesaje: null
      };
      asignacion.set(m.id_potrero, {
        id: m.id_potrerada,
        nombre: m.potreradas?.nombre || 'Lote Ganado',
        ...met,
        dias_en_potrero: m.fecha_entrada ? diasDesde(m.fecha_entrada) : 0,
        fecha_entrada: m.fecha_entrada
      });
    });

    const potreros = potsData.map((p: any) => ({
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

export interface CompraOfflineAnimalInput {
  numero_chapeta: string;
  peso_ingreso: string;
  propietario: string;
}

const LEGACY_COMPRAS_KEY = 'agrogestion_compras_offline';
const LEGACY_AFOROS_KEY = 'agrogestion_aforos_offline';
const LEGACY_VENTAS_KEY = 'agrogestion_ventas_offline';

function esConflictoPkDuplicado(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  const details = String(err?.details || '');
  return code === '23505' && (msg.includes('_pkey') || details.includes('Key (id)='));
}

/**
 * Migra lotes de compra antiguos guardados en localStorage hacia Dexie scoped por id_finca.
 */
export async function migrarComprasLegacyLocalStorage(fincaId: string): Promise<void> {
  if (typeof window === 'undefined' || !fincaId) return;
  try {
    const raw = localStorage.getItem(LEGACY_COMPRAS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const ahora = new Date().toISOString();
      const baseTs = Date.now();
      const items: CompraOfflineQueueItem[] = parsed.map((p: any, idx: number) => ({
        id: String(p.id || crypto.randomUUID()),
        id_finca: String(p.id_finca || fincaId),
        fechaIngreso: String(p.fechaIngreso || ''),
        animales: Array.isArray(p.animales) ? p.animales : [],
        selectedProveedor: String(p.selectedProveedor || ''),
        observaciones: String(p.observaciones || ''),
        incluirPesoCompra: Boolean(p.incluirPesoCompra),
        pesoCompraTotal: String(p.pesoCompraTotal || ''),
        selectedPotrerada: String(p.selectedPotrerada || ''),
        creado_en: String(p.creado_en || ahora),
        ts: Number(p.ts) || baseTs + idx,
        status_sync: 'pending'
      }));
      await localDB.comprasOfflineQueue.bulkPut(items);
    }
    localStorage.removeItem(LEGACY_COMPRAS_KEY);
    notificarCambioColaOffline();
  } catch (e) {
    console.warn('[OfflineService] Error migrando compras legacy de localStorage:', e);
  }
}

export async function listarComprasOffline(fincaId: string): Promise<CompraOfflineQueueItem[]> {
  if (!fincaId) return [];
  await migrarComprasLegacyLocalStorage(fincaId);
  return localDB.comprasOfflineQueue.where('id_finca').equals(fincaId).sortBy('ts');
}

export async function guardarCompraOffline(payload: {
  id_finca: string;
  fechaIngreso: string;
  animales: CompraOfflineAnimalInput[];
  selectedProveedor: string;
  observaciones: string;
  incluirPesoCompra: boolean;
  pesoCompraTotal: string;
  selectedPotrerada: string;
  potreradaNombreRef?: string;
}): Promise<CompraOfflineQueueItem> {
  const ahora = new Date().toISOString();
  const item: CompraOfflineQueueItem = {
    id: crypto.randomUUID(),
    id_finca: payload.id_finca,
    fechaIngreso: payload.fechaIngreso,
    animales: payload.animales.map(a => ({
      numero_chapeta: a.numero_chapeta,
      peso_ingreso: a.peso_ingreso,
      propietario: a.propietario
    })),
    selectedProveedor: payload.selectedProveedor,
    observaciones: payload.observaciones,
    incluirPesoCompra: payload.incluirPesoCompra,
    pesoCompraTotal: payload.pesoCompraTotal,
    selectedPotrerada: payload.selectedPotrerada,
    creado_en: ahora,
    ts: Date.now(),
    status_sync: 'pending'
  };

  await localDB.comprasOfflineQueue.put(item);

  // Reflejar optimísticamente los animales en animalesCache para chapetas duplicadas e inventario offline
  try {
    const pesoTotalRaw = payload.incluirPesoCompra ? parseDecimalInput(payload.pesoCompraTotal) : 0;
    const pesoTotalNum = Number.isFinite(pesoTotalRaw) && pesoTotalRaw > 0 ? pesoTotalRaw : 0;
    const totalPesoIngreso = payload.animales.reduce((acc, a) => {
      const p = parseDecimalInput(a.peso_ingreso);
      return acc + (Number.isFinite(p) && p > 0 ? p : 0);
    }, 0);
    const ratio = payload.incluirPesoCompra && pesoTotalNum > 0 && totalPesoIngreso > 0
      ? pesoTotalNum / totalPesoIngreso
      : 1;

    const optimisticAnimals: AnimalCacheItem[] = payload.animales.map((a, idx) => {
      const parsedPeso = parseDecimalInput(a.peso_ingreso);
      const pesoNum = Number.isFinite(parsedPeso) ? Math.round(parsedPeso) : 0;
      const chapeta = String(a.numero_chapeta || '').trim().toUpperCase();
      const prop = String(a.propietario || '').trim();
      return {
        id: `offline_compra_${item.id}_${idx}`,
        id_finca: payload.id_finca,
        numero_chapeta: chapeta,
        nombre_propietario: prop,
        etapa: 'levante',
        estado: 'activo',
        peso_ingreso: pesoNum,
        peso_compra: payload.incluirPesoCompra ? Math.round(pesoNum * ratio) : undefined,
        fecha_ingreso: payload.fechaIngreso,
        proveedor_compra: payload.selectedProveedor,
        ultimo_peso: pesoNum,
        fecha_ultimo_pesaje: payload.fechaIngreso,
        id_potrerada: payload.selectedPotrerada || undefined,
        potrero_nombre: '',
        potrerada_nombre: payload.potreradaNombreRef || (prop ? `Levante ${prop}` : ''),
        registros_pesaje: [],
        updated_at: ahora
      };
    });
    if (optimisticAnimals.length > 0) {
      await localDB.animalesCache.bulkPut(optimisticAnimals);
    }
  } catch (e) {
    console.warn('[OfflineService] Error reflejando compra en animalesCache:', e);
  }

  notificarCambioColaOffline();
  return item;
}

export async function limpiarComprasOffline(fincaId: string): Promise<number> {
  if (!fincaId) return 0;
  const items = await localDB.comprasOfflineQueue.where('id_finca').equals(fincaId).toArray();
  const ids = items.map(i => i.id);
  if (ids.length > 0) {
    await localDB.comprasOfflineQueue.bulkDelete(ids);
    const prefixos = ids.map(id => `offline_compra_${id}_`);
    try {
      await localDB.animalesCache
        .where('id_finca')
        .equals(fincaId)
        .filter(a => prefixos.some(p => a.id.startsWith(p)))
        .delete();
    } catch { /* noop */ }
  }
  try { localStorage.removeItem(LEGACY_COMPRAS_KEY); } catch { /* noop */ }
  notificarCambioColaOffline();
  return ids.length;
}

/**
 * Resetea elementos que quedaron atrapados en 'syncing' si la app se cerró a mitad de una subida.
 */
export async function normalizarColasAtascadas(): Promise<void> {
  const fix = async (tabla: typeof localDB.pesajesOfflineQueue | typeof localDB.aforosOfflineQueue | typeof localDB.comprasOfflineQueue) => {
    const stuck = await (tabla as any).where('status_sync').equals('syncing').toArray();
    for (const item of stuck) {
      await (tabla as any).update(item.id, { status_sync: 'pending' });
    }
  };
  await Promise.all([
    fix(localDB.pesajesOfflineQueue),
    fix(localDB.aforosOfflineQueue),
    fix(localDB.comprasOfflineQueue)
  ]);
}

function leerArrayLegacyCount(key: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export async function contarColasOfflineDedicadas(): Promise<{ pending: number; failed: number }> {
  const contar = async (tabla: typeof localDB.pesajesOfflineQueue | typeof localDB.aforosOfflineQueue | typeof localDB.comprasOfflineQueue) => {
    const [pending, failed] = await Promise.all([
      (tabla as any).filter((x: any) => x.status_sync === 'pending' || x.status_sync === 'syncing').count(),
      (tabla as any).where('status_sync').equals('failed').count()
    ]);
    return { pending, failed };
  };

  const [p, a, c] = await Promise.all([
    contar(localDB.pesajesOfflineQueue),
    contar(localDB.aforosOfflineQueue),
    contar(localDB.comprasOfflineQueue)
  ]);

  const legacyPending =
    leerArrayLegacyCount(LEGACY_COMPRAS_KEY) +
    leerArrayLegacyCount(LEGACY_VENTAS_KEY) +
    leerArrayLegacyCount(LEGACY_AFOROS_KEY);

  return {
    pending: p.pending + a.pending + c.pending + legacyPending,
    failed: p.failed + a.failed + c.failed
  };
}

export async function reintentarColasOfflineFallidas(fincaId?: string): Promise<number> {
  let total = 0;
  const reset = async (tabla: typeof localDB.pesajesOfflineQueue | typeof localDB.aforosOfflineQueue | typeof localDB.comprasOfflineQueue) => {
    const fallidos = await (tabla as any)
      .filter((x: any) => x.status_sync === 'failed' && (!fincaId || x.id_finca === fincaId))
      .toArray();
    for (const item of fallidos) {
      await (tabla as any).update(item.id, { status_sync: 'pending', error_msg: undefined });
      total++;
    }
  };
  await Promise.all([
    reset(localDB.pesajesOfflineQueue),
    reset(localDB.aforosOfflineQueue),
    reset(localDB.comprasOfflineQueue)
  ]);
  if (total > 0) notificarCambioColaOffline();
  return total;
}

export async function descartarColasOfflineFallidas(fincaId?: string): Promise<number> {
  let total = 0;
  const limpiar = async (tabla: typeof localDB.pesajesOfflineQueue | typeof localDB.aforosOfflineQueue | typeof localDB.comprasOfflineQueue, cleanupCache = false) => {
    const fallidos = await (tabla as any)
      .filter((x: any) => x.status_sync === 'failed' && (!fincaId || x.id_finca === fincaId))
      .toArray();
    for (const item of fallidos) {
      await (tabla as any).delete(item.id);
      if (cleanupCache) {
        try {
          await localDB.animalesCache
            .filter(a => a.id.startsWith(`offline_compra_${item.id}_`))
            .delete();
        } catch { /* noop */ }
      }
      total++;
    }
  };
  await Promise.all([
    limpiar(localDB.pesajesOfflineQueue),
    limpiar(localDB.aforosOfflineQueue),
    limpiar(localDB.comprasOfflineQueue, true)
  ]);
  if (total > 0) notificarCambioColaOffline();
  return total;
}

function esErrorTransitorioOAuth(err: any): { transitorio: boolean; auth: boolean } {
  const status = Number(err?.status || err?.statusCode || 0);
  const msg = String(err?.message || '').toLowerCase();
  const auth = status === 401 || /jwt|expired|not authenticated|unauthorized|invalid claim/.test(msg);
  const transitorio =
    auth ||
    status >= 500 ||
    err instanceof TypeError ||
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    /failed to fetch|network|timeout|load failed/.test(msg);
  return { transitorio, auth };
}

/**
 * 2. Procesa las colas dedicadas offline pendientes ('pending'), dejando intactas las fallidas ('failed')
 * para que el usuario decida si reintentar o descartar desde la UI (sin ciclos infinitos cada 30s).
 */
export async function procesarSincronizacionOffline(fincaId: string): Promise<{
  procesados: number;
  errores: number;
  pesajes: number;
  aforos: number;
  compras: number;
  ventas: number;
  mensajesError: string[];
  authRequired?: boolean;
}> {
  if (!navigator.onLine || isModoCampoActivo() || isConexionDegradada()) {
    return { procesados: 0, errores: 0, pesajes: 0, aforos: 0, compras: 0, ventas: 0, mensajesError: [] };
  }

  await normalizarColasAtascadas();
  if (fincaId) await migrarComprasLegacyLocalStorage(fincaId);

  let procesados = 0;
  let errores = 0;
  let pesajesOk = 0;
  let aforosOk = 0;
  let comprasOk = 0;
  let ventasOk = 0;
  let authRequired = false;
  const mensajesError: string[] = [];

  const ordenarFincaActualPrimero = <T extends { id_finca: string }>(arr: T[]) =>
    fincaId
      ? [...arr].sort((a, b) => (a.id_finca === fincaId ? 0 : 1) - (b.id_finca === fincaId ? 0 : 1))
      : arr;

  // --- Sincronizar Pesajes pendientes (legacy / transición) ---
  const pesajesPendientes = ordenarFincaActualPrimero(
    await localDB.pesajesOfflineQueue
      .filter((item: PesajeOfflineQueueItem) => item.status_sync === 'pending')
      .toArray()
  );

  for (const p of pesajesPendientes) {
    try {
      await localDB.pesajesOfflineQueue.update(p.id, { status_sync: 'syncing' });

      const { error } = await supabase.from('registros_pesaje').insert({
        id: p.id,
        id_animal: p.id_animal,
        peso: p.peso,
        fecha: p.fecha,
        etapa: p.etapa,
        gdp_calculada: p.gdp_calculada,
        gmp_calculada: p.gmp_calculada
      });

      if (error && !esConflictoPkDuplicado(error)) throw error;

      await localDB.pesajesOfflineQueue.delete(p.id);
      procesados++;
      pesajesOk++;
    } catch (err: any) {
      const { transitorio, auth } = esErrorTransitorioOAuth(err);
      if (transitorio) {
        if (auth) authRequired = true;
        await localDB.pesajesOfflineQueue.update(p.id, { status_sync: 'pending' });
        break;
      }
      const msg = err?.message || 'Error desconocido';
      console.error(`[OfflineSync] Error al sincronizar pesaje ${p.id}:`, err);
      await localDB.pesajesOfflineQueue.update(p.id, {
        status_sync: 'failed',
        error_msg: msg
      });
      errores++;
      mensajesError.push(`Pesaje ${p.chapeta_ref || ''}: ${msg}`.trim());
    }
  }

  // --- Sincronizar Aforos pendientes (legacy / transición) ---
  const aforosPendientes = ordenarFincaActualPrimero(
    await localDB.aforosOfflineQueue
      .filter((item: AforoOfflineQueueItem) => item.status_sync === 'pending')
      .toArray()
  );

  for (const a of aforosPendientes) {
    try {
      await localDB.aforosOfflineQueue.update(a.id, { status_sync: 'syncing' });

      const kgM2 = Number(((a.gramos_m2 || 0) / 1000).toFixed(3));
      const { error } = await supabase.from('registros_aforo').insert({
        id: a.id,
        id_finca: a.id_finca || fincaId,
        id_potrero: a.id_potrero,
        fecha: a.fecha,
        muestras: [kgM2],
        promedio_muestras_kg: kgM2,
        viabilidad: 100,
        aforo_real_kg: kgM2
      });

      if (error && !esConflictoPkDuplicado(error)) throw error;

      await localDB.aforosOfflineQueue.delete(a.id);
      procesados++;
      aforosOk++;
    } catch (err: any) {
      const { transitorio, auth } = esErrorTransitorioOAuth(err);
      if (transitorio) {
        if (auth) authRequired = true;
        await localDB.aforosOfflineQueue.update(a.id, { status_sync: 'pending' });
        break;
      }
      const msg = err?.message || 'Error desconocido';
      console.error(`[OfflineSync] Error al sincronizar aforo ${a.id}:`, err);
      await localDB.aforosOfflineQueue.update(a.id, {
        status_sync: 'failed',
        error_msg: msg
      });
      errores++;
      mensajesError.push(`Aforo ${a.potrero_nombre_ref || ''}: ${msg}`.trim());
    }
  }

  // --- Sincronizar Compras en Dexie (respetando el id_finca propio de cada compra) ---
  const comprasPendientes = ordenarFincaActualPrimero(
    await localDB.comprasOfflineQueue
      .filter((item: CompraOfflineQueueItem) => item.status_sync === 'pending')
      .sortBy('ts')
  );

  for (const payload of comprasPendientes) {
    const compraFincaId = payload.id_finca || fincaId;
    if (!compraFincaId) continue;
    try {
      await localDB.comprasOfflineQueue.update(payload.id, { status_sync: 'syncing' });

      const chapetas = (payload.animales || []).map(a => String(a.numero_chapeta || '').trim().toUpperCase());
      if (chapetas.length === 0) {
        throw new Error(`El lote de compra del ${payload.fechaIngreso} no tiene animales.`);
      }
      if (new Set(chapetas).size !== chapetas.length) {
        throw new Error(`Chapetas duplicadas en lote de compra del ${payload.fechaIngreso}.`);
      }

      const { data: existentes, error: existErr } = await supabase
        .from('animales')
        .select('numero_chapeta')
        .eq('id_finca', compraFincaId)
        .in('numero_chapeta', chapetas);

      if (existErr) throw existErr;

      if (existentes && existentes.length > 0) {
        throw new Error(`Chapetas ya existentes: ${existentes.map((e: any) => e.numero_chapeta).join(', ')}`);
      }

      const uniquePropietarios = Array.from(new Set((payload.animales || []).map(a => String(a.propietario || '').trim()).filter(Boolean)));
      const potreradasPayload = uniquePropietarios.map(prop => ({
        id_finca: compraFincaId,
        nombre: `Levante ${prop}`,
        etapa: 'levante'
      }));

      const potreradaIdPorPropietario = new Map<string, string>();
      if (potreradasPayload.length > 0 && !payload.selectedPotrerada) {
        const { data: potreradasCreadas, error: potError } = await supabase
          .from('potreradas')
          .upsert(potreradasPayload, { onConflict: 'id_finca,nombre' })
          .select('id, nombre');
        if (potError) throw potError;

        (potreradasCreadas || []).forEach((p: any) => {
          const propMatch = uniquePropietarios.find(prop => p.nombre === `Levante ${prop}`);
          if (propMatch) potreradaIdPorPropietario.set(propMatch, p.id);
        });
      }

      const pesoTotalRaw = payload.incluirPesoCompra ? parseDecimalInput(payload.pesoCompraTotal) : 0;
      const pesoCompTotalNum = Number.isFinite(pesoTotalRaw) && pesoTotalRaw > 0 ? pesoTotalRaw : 0;
      const totalPesoIngresoLote = (payload.animales || []).reduce((acc, a) => {
        const p = parseDecimalInput(a.peso_ingreso);
        return acc + (Number.isFinite(p) && p > 0 ? p : 0);
      }, 0);
      const ratioPesoCompra = (payload.incluirPesoCompra && pesoCompTotalNum > 0 && totalPesoIngresoLote > 0)
        ? (pesoCompTotalNum / totalPesoIngresoLote)
        : 1;

      const records = (payload.animales || []).map(a => {
        const propTrim = String(a.propietario || '').trim();
        const pesoParsed = parseDecimalInput(a.peso_ingreso);
        if (!Number.isFinite(pesoParsed) || pesoParsed <= 0) {
          throw new Error(`Peso inválido para chapeta ${a.numero_chapeta}`);
        }
        const pesoRedondeado = Math.round(pesoParsed);
        return {
          id_finca: compraFincaId,
          numero_chapeta: String(a.numero_chapeta || '').trim().toUpperCase(),
          nombre_propietario: propTrim,
          id_potrerada: payload.selectedPotrerada ? payload.selectedPotrerada : (potreradaIdPorPropietario.get(propTrim) || null),
          peso_ingreso: pesoRedondeado,
          peso_compra: payload.incluirPesoCompra ? Math.round(pesoParsed * ratioPesoCompra) : null,
          fecha_ingreso: payload.fechaIngreso,
          proveedor_compra: payload.selectedProveedor,
          observaciones_compra: payload.observaciones,
          etapa: 'levante',
          especie: 'bovino',
          sexo: 'M',
          estado: 'activo'
        };
      });

      const { error: insErr } = await supabase.from('animales').insert(records);
      if (insErr) throw insErr;

      await localDB.comprasOfflineQueue.delete(payload.id);
      try {
        await localDB.animalesCache
          .where('id_finca')
          .equals(compraFincaId)
          .filter(a => a.id.startsWith(`offline_compra_${payload.id}_`))
          .delete();
      } catch { /* noop */ }

      procesados++;
      comprasOk++;
    } catch (err: any) {
      const { transitorio, auth } = esErrorTransitorioOAuth(err);
      if (transitorio) {
        if (auth) authRequired = true;
        await localDB.comprasOfflineQueue.update(payload.id, { status_sync: 'pending' });
        break;
      }
      const msg = err?.message || 'Error desconocido';
      console.error(`[OfflineSync] Error al sincronizar compra ${payload.id}:`, err);
      await localDB.comprasOfflineQueue.update(payload.id, {
        status_sync: 'failed',
        error_msg: msg
      });
      errores++;
      mensajesError.push(`Compra (${payload.fechaIngreso}): ${msg}`);
    }
  }

  // --- Drenar colas legacy si aún existieran en localStorage ---
  if (typeof window !== 'undefined') {
    try {
      const aforosRaw = localStorage.getItem(LEGACY_AFOROS_KEY);
      if (aforosRaw) {
        const aforosQueue: any[] = JSON.parse(aforosRaw);
        if (Array.isArray(aforosQueue) && aforosQueue.length > 0) {
          let remainingAforos = [...aforosQueue];
          for (const payload of aforosQueue) {
            try {
              const aforoToInsert = { ...payload };
              delete aforoToInsert.id_temp;
              delete aforoToInsert.potrero;
              const { error } = await supabase.from('registros_aforo').insert(aforoToInsert);
              if (error) throw error;
              remainingAforos = remainingAforos.filter(item => item.id_temp !== payload.id_temp);
              procesados++;
              aforosOk++;
            } catch (err: any) {
              console.error('[OfflineSync] Error al sincronizar aforo de localStorage:', err);
              errores++;
              mensajesError.push(`Aforo legacy: ${err?.message || 'Error al subir'}`);
            }
          }
          if (remainingAforos.length === 0) {
            localStorage.removeItem(LEGACY_AFOROS_KEY);
          } else {
            localStorage.setItem(LEGACY_AFOROS_KEY, JSON.stringify(remainingAforos));
          }
        } else {
          localStorage.removeItem(LEGACY_AFOROS_KEY);
        }
      }
    } catch (e) {
      console.warn('[OfflineSync] Error leyendo agrogestion_aforos_offline:', e);
    }

    try {
      const ventasRaw = localStorage.getItem(LEGACY_VENTAS_KEY);
      if (ventasRaw) {
        const ventasQueue: any[] = JSON.parse(ventasRaw);
        if (Array.isArray(ventasQueue) && ventasQueue.length > 0) {
          let remainingVentas = [...ventasQueue];
          for (const payload of ventasQueue) {
            try {
              const registrosInsert: any[] = [];
              for (const a of (payload.animales || [])) {
                const { data, error } = await supabase
                  .from('animales')
                  .select('id, etapa')
                  .eq('id_finca', fincaId)
                  .eq('numero_chapeta', String(a.numero_chapeta || '').trim())
                  .eq('estado', 'activo')
                  .single();

                if (error || !data) {
                  throw new Error(`Animal ${a.numero_chapeta} en venta del ${payload.fechaVenta} no encontrado o inactivo.`);
                }

                const pesoSalidaParsed = parseDecimalInput(a.peso_salida);
                const pesoSalidaNum = Number.isFinite(pesoSalidaParsed) ? pesoSalidaParsed : 0;
                const precioVentaParsed = a.precio_venta ? parseDecimalInput(a.precio_venta) : NaN;
                registrosInsert.push({
                  id_animal: data.id,
                  peso: pesoSalidaNum,
                  fecha: payload.fechaVenta,
                  etapa: data.etapa || 'ceba'
                });

                const { error: errorAnimal } = await supabase
                  .from('animales')
                  .update({
                    estado: 'vendido',
                    comprador_venta: payload.selectedComprador,
                    fecha_venta: payload.fechaVenta,
                    peso_venta: pesoSalidaNum,
                    observaciones_venta: payload.observaciones,
                    es_emergencia: String(payload.selectedComprador || '').toLowerCase().includes('carnicero'),
                    precio_venta: Number.isFinite(precioVentaParsed) ? precioVentaParsed : null
                  })
                  .eq('id', data.id);

                if (errorAnimal) throw errorAnimal;

                try {
                  await localDB.animalesCache.delete(data.id);
                } catch { /* noop */ }
              }

              if (registrosInsert.length > 0) {
                const { error: errorPesaje } = await supabase.from('registros_pesaje').insert(registrosInsert);
                if (errorPesaje) throw errorPesaje;
              }

              remainingVentas = remainingVentas.filter(q => q.id !== payload.id);
              procesados++;
              ventasOk++;
            } catch (err: any) {
              console.error('[OfflineSync] Error al sincronizar venta de localStorage:', err);
              errores++;
              mensajesError.push(`Venta legacy: ${err?.message || 'Error al subir'}`);
            }
          }
          if (remainingVentas.length === 0) {
            localStorage.removeItem(LEGACY_VENTAS_KEY);
          } else {
            localStorage.setItem(LEGACY_VENTAS_KEY, JSON.stringify(remainingVentas));
          }
        } else {
          localStorage.removeItem(LEGACY_VENTAS_KEY);
        }
      }
    } catch (e) {
      console.warn('[OfflineSync] Error leyendo agrogestion_ventas_offline:', e);
    }
  }

  notificarCambioColaOffline();
  return { procesados, errores, pesajes: pesajesOk, aforos: aforosOk, compras: comprasOk, ventas: ventasOk, mensajesError, authRequired };
}

