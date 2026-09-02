import Dexie, { type Table } from 'dexie';

export interface AnimalCacheItem {
  id: string;
  id_finca: string;
  numero_chapeta: string;
  nombre_propietario?: string;
  etapa: string;
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
  updated_at: string;
}

export interface PotreroCacheItem {
  id: string;
  id_finca: string;
  nombre: string;
  area_ha?: number;
  capacidad_maxima?: number;
  geojson_geometry?: any;
  color_mapa?: string;
  kml_name?: string;
}

export interface MapaFincaCacheItem {
  id_finca: string;
  nombre_archivo: string;
  centro_latitud?: number;
  centro_longitud?: number;
  zoom_inicial?: number;
  actualizado_en: string;
}

export interface PotreradaCacheItem {
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

export class AgrogestionDB extends Dexie {
  animalesCache!: Table<AnimalCacheItem, string>;
  potrerosCache!: Table<PotreroCacheItem, string>;
  potreradasCache!: Table<PotreradaCacheItem, string>;
  pesajesOfflineQueue!: Table<PesajeOfflineQueueItem, string>;
  aforosOfflineQueue!: Table<AforoOfflineQueueItem, string>;
  mapasFincaCache!: Table<MapaFincaCacheItem, string>;

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
  }
}

export const localDB = new AgrogestionDB();
