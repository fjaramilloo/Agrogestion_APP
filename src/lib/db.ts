import Dexie, { type Table } from 'dexie';

export interface AnimalCacheItem {
  id: string;
  id_finca: string;
  numero_chapeta: string;
  nombre_propietario?: string;
  etapa: string;
  estado?: string;
  peso_ingreso?: number;
  peso_compra?: number;
  fecha_ingreso: string;
  fecha_ingreso_ceba?: string;
  peso_ingreso_ceba?: number;
  id_potrerada?: string;
  potrero_nombre?: string;
  potrerada_nombre?: string;
  ultimo_peso?: number;
  fecha_ultimo_pesaje?: string;
  peso_venta?: number;
  fecha_venta?: string;
  comprador_venta?: string;
  observaciones_venta?: string;
  precio_venta?: number;
  proveedor_compra?: string;
  registros_pesaje?: any[];
  updated_at: string;
}

export interface PotreroCacheItem {
  id: string;
  id_finca: string;
  nombre: string;
  area_ha?: number;
  id_rotacion?: string | null;
  capacidad_maxima?: number;
  geojson_geometry?: any;
  color_mapa?: string;
  kml_name?: string;
}

export interface ZonaAdicionalItem {
  id: string;
  nombre: string;
  tipo: 'bosque' | 'reforestacion' | 'reserva' | 'agua' | 'infraestructura' | 'otro';
  area_hectareas: number;
  geojson_geometry: any;
  color?: string;
}

export interface MapaFincaCacheItem {
  id_finca: string;
  nombre_archivo: string;
  centro_latitud?: number;
  centro_longitud?: number;
  zoom_inicial?: number;
  zonas_adicionales?: ZonaAdicionalItem[];
  actualizado_en: string;
}

export interface PotreradaCacheItem {
  id: string;
  id_finca: string;
  nombre: string;
  id_rotacion?: string | null;
}

export interface RotacionCacheItem {
  id: string;
  id_finca: string;
  nombre: string;
}

export interface PesajeOfflineQueueItem {
  id: string; // UUID local
  id_finca: string;
  id_animal: string;
  chapeta_ref?: string;
  peso: number;
  fecha: string;
  etapa: string;
  gdp_calculada?: number;
  gmp_calculada?: number;
  creado_en: string;
  status_sync: 'pending' | 'syncing' | 'failed';
  error_msg?: string;
}

export interface AforoOfflineQueueItem {
  id: string; // UUID local
  id_finca: string;
  id_potrero: string;
  potrero_nombre_ref?: string;
  fecha: string;
  metodo: string;
  gramos_m2: number;
  muesca_promedio?: number;
  creado_en: string;
  status_sync: 'pending' | 'syncing' | 'failed';
  error_msg?: string;
}

export interface PotreroMapSnapshotItem {
  id_finca: string;
  actualizado_en: string;
  potreros: any[];
  map_meta?: { lat?: number; lng?: number } | null;
  zonas_adicionales?: ZonaAdicionalItem[];
}

export interface MercadoCacheItem {
  id: string; // 'mercado_general'
  precios: any[];
  animales?: any[];
  actualizado_en: string;
}

/** Respuesta GET/RPC de lectura guardada para poder usarla sin internet (cualquier módulo). */
export interface HttpReadCacheItem {
  key: string;
  tabla: string;
  url: string;
  method: string;
  reqBody?: string | null;
  reqHeaders: Record<string, string>;
  status: number;
  contentType: string;
  contentRange?: string;
  body: string;
  ts: number;
}

/** Escritura (insert/update/delete) hecha sin internet, pendiente de subir a la nube. */
export interface HttpWriteQueueItem {
  id: string;
  ts: number;
  method: string;
  url: string;
  tabla: string;
  headers: Record<string, string>;
  body: string | null;
  filas: number;
}

export class AgrogestionDB extends Dexie {
  httpReadCache!: Table<HttpReadCacheItem, string>;
  httpWriteQueue!: Table<HttpWriteQueueItem, string>;
  animalesCache!: Table<AnimalCacheItem, string>;
  potrerosCache!: Table<PotreroCacheItem, string>;
  potreradasCache!: Table<PotreradaCacheItem, string>;
  rotacionesCache!: Table<RotacionCacheItem, string>;
  pesajesOfflineQueue!: Table<PesajeOfflineQueueItem, string>;
  aforosOfflineQueue!: Table<AforoOfflineQueueItem, string>;
  mapasFincaCache!: Table<MapaFincaCacheItem, string>;
  mapaSnapshotCache!: Table<PotreroMapSnapshotItem, string>;
  mercadoCache!: Table<MercadoCacheItem, string>;

  constructor() {
    super('AgrogestionLocalDB');

    // Esquema de tablas para IndexedDB v1
    this.version(1).stores({
      animalesCache: 'id, id_finca, numero_chapeta, etapa',
      potrerosCache: 'id, id_finca, nombre',
      potreradasCache: 'id, id_finca, nombre',
      pesajesOfflineQueue: 'id, id_finca, id_animal, status_sync, fecha',
      aforosOfflineQueue: 'id, id_finca, id_potrero, status_sync, fecha'
    });

    // Esquema v2 con mapas
    this.version(2).stores({
      animalesCache: 'id, id_finca, numero_chapeta, etapa',
      potrerosCache: 'id, id_finca, nombre',
      potreradasCache: 'id, id_finca, nombre',
      pesajesOfflineQueue: 'id, id_finca, id_animal, status_sync, fecha',
      aforosOfflineQueue: 'id, id_finca, id_potrero, status_sync, fecha',
      mapasFincaCache: 'id_finca'
    });

    // Esquema v3 con snapshot de potreros para mapa offline y caché de mercado
    this.version(3).stores({
      animalesCache: 'id, id_finca, numero_chapeta, etapa',
      potrerosCache: 'id, id_finca, nombre',
      potreradasCache: 'id, id_finca, nombre',
      pesajesOfflineQueue: 'id, id_finca, id_animal, status_sync, fecha',
      aforosOfflineQueue: 'id, id_finca, id_potrero, status_sync, fecha',
      mapasFincaCache: 'id_finca',
      mapaSnapshotCache: 'id_finca',
      mercadoCache: 'id'
    });

    // Esquema v4: caché HTTP de lecturas + cola genérica de escrituras (modo sin conexión total)
    this.version(4).stores({
      animalesCache: 'id, id_finca, numero_chapeta, etapa',
      potrerosCache: 'id, id_finca, nombre',
      potreradasCache: 'id, id_finca, nombre',
      pesajesOfflineQueue: 'id, id_finca, id_animal, status_sync, fecha',
      aforosOfflineQueue: 'id, id_finca, id_potrero, status_sync, fecha',
      mapasFincaCache: 'id_finca',
      mapaSnapshotCache: 'id_finca',
      mercadoCache: 'id',
      httpReadCache: 'key, tabla, ts',
      httpWriteQueue: 'id, ts'
    });

    // Esquema v5: tabla dedicada de rotaciones offline
    this.version(5).stores({
      animalesCache: 'id, id_finca, numero_chapeta, etapa',
      potrerosCache: 'id, id_finca, nombre',
      potreradasCache: 'id, id_finca, nombre',
      rotacionesCache: 'id, id_finca, nombre',
      pesajesOfflineQueue: 'id, id_finca, id_animal, status_sync, fecha',
      aforosOfflineQueue: 'id, id_finca, id_potrero, status_sync, fecha',
      mapasFincaCache: 'id_finca',
      mapaSnapshotCache: 'id_finca',
      mercadoCache: 'id',
      httpReadCache: 'key, tabla, ts',
      httpWriteQueue: 'id, ts'
    });
  }
}

export const localDB = new AgrogestionDB();

