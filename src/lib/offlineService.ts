import { supabase } from './supabase';
import {
  localDB,
  type AnimalCacheItem,
  type PotreroCacheItem,
  type PotreradaCacheItem,
  type RotacionCacheItem,
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

  const safe = async <T>(promise: PromiseLike<T>, tag: string): Promise<T | null> => {
    try {
      const res = await promise;
      return res;
    } catch (err) {
      console.warn(`[OfflineService] Query ${tag} omitida:`, err);
      return null;
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
      , // movimientosRes
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
        supabase
          .from('animales')
          .select(`
            id, numero_chapeta, nombre_propietario, etapa, estado,
            peso_ingreso, peso_compra, fecha_ingreso, fecha_ingreso_ceba, peso_ingreso_ceba,
            id_potrerada, id_potrero_actual,
            potreros ( nombre ),
            potreradas:potreradas!animales_id_potrerada_fkey ( nombre ),
            registros_pesaje ( peso, fecha, etapa, gdp_calculada, gmp_calculada, is_deleted )
          `)
          .eq('id_finca', fincaId)
          .eq('estado', 'activo')
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('fecha', { foreignTable: 'registros_pesaje', ascending: false })
          .limit(20000),
        'animales_activos'
      ),

      // 2. Animales completos para Dashboard.tsx (coincidencia exacta de URL)
      safe(
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
          .limit(10000),
        'animales_dashboard'
      ),

      // 3. Animales vendidos completos (para Historial de Ventas)
      safe(
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
          .order('fecha_venta', { ascending: false }),
        'animales_vendidos'
      ),

      // 4. Animales vendidos en lotes (para Gestión de Lotes)
      safe(
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
          .limit(10000),
        'animales_vendidos_lotes'
      ),

      // 5. Animales comprados completos (para Historial de Compras)
      safe(
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
          .order('fecha_ingreso', { ascending: false }),
        'animales_compras'
      ),

      // 6. Potreros (Rotations.tsx exact query)
      safe(
        supabase
          .from('potreros')
          .select('id, nombre, area_hectareas, id_rotacion')
          .eq('id_finca', fincaId)
          .order('nombre'),
        'potreros_rotaciones'
      ),

      // 7. Potreros completos para Mapa
      safe(
        supabase
          .from('potreros')
          .select('id, nombre, area_hectareas, id_rotacion, geojson_geometry, color_mapa, kml_name')
          .eq('id_finca', fincaId)
          .order('nombre')
          .limit(10000),
        'potreros_mapa'
      ),

      // 8. Potreradas / Lotes (Movements.tsx exact query)
      safe(
        supabase
          .from('potreradas')
          .select('id, nombre, id_rotacion')
          .eq('id_finca', fincaId)
          .order('nombre'),
        'potreradas_movements'
      ),

      // 9. Potreradas todas las columnas
      safe(
        supabase
          .from('potreradas')
          .select('*')
          .eq('id_finca', fincaId)
          .order('nombre', { ascending: true })
          .limit(10000),
        'potreradas_todas'
      ),

      // 10. Rotaciones básicas (Rotations.tsx exact query)
      safe(
        supabase
          .from('rotaciones')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre'),
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
          .order('nombre'),
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
          .order('fecha_entrada', { ascending: false }),
        'movimientos_potreros'
      ),

      // 13. Registros de lluvia (Dashboard.tsx exact query)
      safe(
        supabase
          .from('registros_lluvia')
          .select('fecha, milimetros')
          .eq('id_finca', fincaId)
          .order('fecha', { ascending: true })
          .limit(50000),
        'lluvias_dashboard'
      ),

      // 14. Registros de lluvia (Pluviometría module exact query)
      safe(
        supabase
          .from('registros_lluvia')
          .select('*')
          .eq('id_finca', fincaId)
          .order('fecha', { ascending: false })
          .limit(10000),
        'lluvias_pluvio'
      ),

      // 15. Resumen finca (Dashboard.tsx exact query)
      safe(
        supabase
          .from('resumen_finca')
          .select('*')
          .eq('id_finca', fincaId)
          .single(),
        'resumen_finca_single'
      ),

      // 16. Información finca (Dashboard.tsx exact query)
      safe(
        supabase
          .from('fincas')
          .select('nombre, proposito, area_aprovechable, ubicacion, municipio')
          .eq('id', fincaId)
          .single(),
        'finca_dashboard'
      ),

      // 17. Información finca básica
      safe(
        supabase
          .from('fincas')
          .select('id, nombre, ubicacion, municipio, proposito, area_aprovechable')
          .eq('id', fincaId)
          .single(),
        'finca_basica'
      ),

      // 18. Configuración KPI (Dashboard.tsx exact query)
      safe(
        supabase
          .from('configuracion_kpi')
          .select('precio_venta_promedio, costo_mensual_animal, umbral_alto_gmp, umbral_medio_gmp, participacion_utilidad, corte_peso_1, corte_peso_2, corte_peso_3, preset_peso')
          .eq('id_finca', fincaId)
          .single(),
        'config_kpi_dashboard'
      ),

      // 19. Configuración KPI (HistorialVentas.tsx exact query)
      safe(
        supabase
          .from('configuracion_kpi')
          .select('umbral_alto_gmp, umbral_medio_gmp, precio_venta_promedio, costo_mensual_animal, participacion_utilidad')
          .eq('id_finca', fincaId)
          .single(),
        'config_kpi_ventas'
      ),

      // 20. Configuración KPI (HistorialCompras.tsx exact query)
      safe(
        supabase
          .from('configuracion_kpi')
          .select('umbral_alto_gmp, umbral_medio_gmp')
          .eq('id_finca', fincaId)
          .single(),
        'config_kpi_compras'
      ),

      // 21. Compradores
      safe(
        supabase
          .from('compradores')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre'),
        'compradores'
      ),

      // 22. Proveedores
      safe(
        supabase
          .from('proveedores')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre'),
        'proveedores'
      ),

      // 23. Propietarios
      safe(
        supabase
          .from('propietarios')
          .select('id, nombre')
          .eq('id_finca', fincaId)
          .order('nombre'),
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
          .maybeSingle(),
        'diagnostico_climatico'
      ),

      // 25. Mapa KML/KMZ
      safe(
        supabase
          .from('mapas_finca')
          .select('*')
          .eq('id_finca', fincaId)
          .maybeSingle(),
        'mapas_finca'
      ),

      // 26. Precios de mercado
      safe(
        supabase
          .from('vista_precios_mercado')
          .select('*')
          .order('fecha_boletin', { ascending: true }),
        'precios_mercado'
      )
    ]);

    // Guardar diagnóstico climático en localStorage para visualización instantánea 0ms
    if (diagRes?.data) {
      try {
        localStorage.setItem(`agro_diagnostico_climatico_${fincaId}`, JSON.stringify(diagRes.data));
      } catch { /* noop */ }
    }

    // ── GUARDADO BLINDADO EN DEXIE ──

    // 1. ANIMALES (Activos + Vendidos)
    const mapaAnimales = new Map<string, AnimalCacheItem>();
    const ahora = new Date().toISOString();

    if (animalesRes?.data && animalesRes.data.length > 0) {
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
    }

    if (animalesVendidosRes?.data && animalesVendidosRes.data.length > 0) {
      animalesVendidosRes.data.forEach((a: any) => {
        const prev = mapaAnimales.get(a.id);
        const pesajesActivos = (a.registros_pesaje || []).filter((r: any) => !r.is_deleted);
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

    if (animalesComprasRes?.data && animalesComprasRes.data.length > 0) {
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

    if (mapaAnimales.size > 0) {
      try {
        await localDB.animalesCache.where('id_finca').equals(fincaId).delete();
        await localDB.animalesCache.bulkPut(Array.from(mapaAnimales.values()));
      } catch (e) {
        console.warn('[OfflineService] Error guardando animalesCache:', e);
      }
    }

    // 2. POTREROS (Con id_rotacion y geometrías)
    const potsRaw = potrerosMapaRes?.data || potrerosRotationsRes?.data;
    if (potsRaw && potsRaw.length > 0) {
      try {
        const potrerosCache: PotreroCacheItem[] = potsRaw.map((p: any) => ({
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
        await localDB.potrerosCache.bulkPut(potrerosCache);
      } catch (e) {
        console.warn('[OfflineService] Error guardando potrerosCache:', e);
      }
    }

    // 3. POTRERADAS / LOTES (Con id_rotacion)
    const ptsRaw = potreradasMovementsRes?.data || potreradasTodasRes?.data;
    if (ptsRaw && ptsRaw.length > 0) {
      try {
        const potreradasCache: PotreradaCacheItem[] = ptsRaw.map((p: any) => ({
          id: p.id,
          id_finca: fincaId,
          nombre: p.nombre,
          id_rotacion: p.id_rotacion || null
        }));

        await localDB.potreradasCache.where('id_finca').equals(fincaId).delete();
        await localDB.potreradasCache.bulkPut(potreradasCache);
      } catch (e) {
        console.warn('[OfflineService] Error guardando potreradasCache:', e);
      }
    }

    // 4. ROTACIONES
    const rotsRaw = rotacionesRotationsRes?.data || rotacionesMovementsRes?.data;
    if (rotsRaw && rotsRaw.length > 0) {
      try {
        const rotacionesCache: RotacionCacheItem[] = rotsRaw.map((r: any) => ({
          id: r.id,
          id_finca: fincaId,
          nombre: r.nombre
        }));

        await localDB.rotacionesCache.where('id_finca').equals(fincaId).delete();
        await localDB.rotacionesCache.bulkPut(rotacionesCache);
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

    // 7. SNAPSHOT DEL MAPA FINCA
    await guardarSnapshotMapa(fincaId, mapRes?.data);
  } catch (error) {
    console.warn('[OfflineService] Error inesperado en sincronizarCacheFinca:', error);
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
export async function procesarSincronizacionOffline(fincaId: string): Promise<{
  procesados: number;
  errores: number;
  pesajes: number;
  aforos: number;
  compras: number;
  ventas: number;
}> {
  const isModoCampo = typeof window !== 'undefined' && localStorage.getItem('agrogestion_modo_campo') === 'true';
  if (!fincaId || !navigator.onLine || isModoCampo) {
    return { procesados: 0, errores: 0, pesajes: 0, aforos: 0, compras: 0, ventas: 0 };
  }

  let procesados = 0;
  let errores = 0;
  let pesajesOk = 0;
  let aforosOk = 0;
  let comprasOk = 0;
  let ventasOk = 0;

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

  // --- Sincronizar Aforos en localStorage (agrogestion_aforos_offline) ---
  if (typeof window !== 'undefined') {
    try {
      const aforosRaw = localStorage.getItem('agrogestion_aforos_offline');
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
            } catch (err) {
              console.error('[OfflineSync] Error al sincronizar aforo de localStorage:', err);
              errores++;
            }
          }
          localStorage.setItem('agrogestion_aforos_offline', JSON.stringify(remainingAforos));
        }
      }
    } catch (e) {
      console.warn('[OfflineSync] Error leyendo agrogestion_aforos_offline:', e);
    }

    // --- Sincronizar Compras en localStorage (agrogestion_compras_offline) ---
    try {
      const comprasRaw = localStorage.getItem('agrogestion_compras_offline');
      if (comprasRaw) {
        const comprasQueue: any[] = JSON.parse(comprasRaw);
        if (Array.isArray(comprasQueue) && comprasQueue.length > 0) {
          let remainingCompras = [...comprasQueue];
          for (const payload of comprasQueue) {
            try {
              const chapetas = (payload.animales || []).map((a: any) => String(a.numero_chapeta || '').trim().toUpperCase());
              if (new Set(chapetas).size !== chapetas.length) {
                throw new Error(`Chapetas duplicadas en lote de compra del ${payload.fechaIngreso}`);
              }

              const { data: existentes } = await supabase
                .from('animales')
                .select('numero_chapeta')
                .eq('id_finca', fincaId)
                .in('numero_chapeta', chapetas);

              if (existentes && existentes.length > 0) {
                throw new Error(`Chapetas ya existentes: ${existentes.map((e: any) => e.numero_chapeta).join(', ')}`);
              }

              const uniquePropietarios = Array.from(new Set((payload.animales || []).map((a: any) => String(a.propietario || '').trim())));
              const potreradasPayload = uniquePropietarios.map(prop => ({
                id_finca: fincaId,
                nombre: `Levante ${prop}`,
                etapa: 'levante'
              }));

              const { data: potreradasCreadas, error: potError } = await supabase
                .from('potreradas')
                .upsert(potreradasPayload, { onConflict: 'id_finca,nombre' })
                .select('id, nombre');
              if (potError) throw potError;

              const potreradaIdPorPropietario = new Map();
              (potreradasCreadas || []).forEach((p: any) => {
                const propMatch = uniquePropietarios.find(prop => p.nombre === `Levante ${prop}`);
                if (propMatch) potreradaIdPorPropietario.set(propMatch, p.id);
              });

              const pesoCompTotalNum = payload.incluirPesoCompra ? parseFloat(payload.pesoCompraTotal) : 0;
              const totalPesoIngresoLote = (payload.animales || []).reduce((acc: number, a: any) => acc + (parseFloat(a.peso_ingreso) || 0), 0);
              const ratioPesoCompra = (payload.incluirPesoCompra && pesoCompTotalNum > 0 && totalPesoIngresoLote > 0)
                ? (pesoCompTotalNum / totalPesoIngresoLote)
                : 1;

              const records = (payload.animales || []).map((a: any) => {
                const propTrim = String(a.propietario || '').trim();
                return {
                  id_finca: fincaId,
                  numero_chapeta: String(a.numero_chapeta || '').trim().toUpperCase(),
                  nombre_propietario: propTrim,
                  id_potrerada: payload.selectedPotrerada ? payload.selectedPotrerada : (potreradaIdPorPropietario.get(propTrim) || null),
                  peso_ingreso: parseFloat(a.peso_ingreso),
                  peso_compra: payload.incluirPesoCompra ? Math.round(parseFloat(a.peso_ingreso) * ratioPesoCompra) : null,
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

              remainingCompras = remainingCompras.filter(q => q.id !== payload.id);
              procesados++;
              comprasOk++;
            } catch (err) {
              console.error('[OfflineSync] Error al sincronizar compra de localStorage:', err);
              errores++;
            }
          }
          localStorage.setItem('agrogestion_compras_offline', JSON.stringify(remainingCompras));
        }
      }
    } catch (e) {
      console.warn('[OfflineSync] Error leyendo agrogestion_compras_offline:', e);
    }

    // --- Sincronizar Ventas en localStorage (agrogestion_ventas_offline) ---
    try {
      const ventasRaw = localStorage.getItem('agrogestion_ventas_offline');
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

                const pesoSalidaNum = parseFloat(a.peso_salida);
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
                    precio_venta: a.precio_venta ? parseFloat(a.precio_venta) : null
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
            } catch (err) {
              console.error('[OfflineSync] Error al sincronizar venta de localStorage:', err);
              errores++;
            }
          }
          localStorage.setItem('agrogestion_ventas_offline', JSON.stringify(remainingVentas));
        }
      }
    } catch (e) {
      console.warn('[OfflineSync] Error leyendo agrogestion_ventas_offline:', e);
    }
  }

  notificarCambioColaOffline();
  return { procesados, errores, pesajes: pesajesOk, aforos: aforosOk, compras: comprasOk, ventas: ventasOk };
}

