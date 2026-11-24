import { localDB, type HttpReadCacheItem, type HttpWriteQueueItem } from './db';

/**
 * CAPA OFFLINE GLOBAL (nivel HTTP)
 * ---------------------------------
 * Se conecta al `fetch` del cliente de Supabase, por lo que aplica a TODOS los módulos sin tocarlos:
 *  - LECTURAS: cada respuesta exitosa se guarda en IndexedDB. Sin internet (o en Modo Campo) se responde desde ahí.
 *  - ESCRITURAS (insert/update/delete): sin internet se guardan en una cola ordenada y se aplican de inmediato
 *    sobre los datos locales, para que la app muestre el cambio. Al volver la señal se suben (ver syncService.ts).
 */

export const isModoCampoActivo = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.location.pathname === '/login') {
      return false;
    }
    return localStorage.getItem('agrogestion_modo_campo') === 'true';
  } catch {
    return false;
  }
};

const MAX_BODY_CHARS = 6_000_000;
const MAX_ENTRADAS_CACHE = 800;
const TIMEOUT_LECTURA_MS = 8000; // Evita abortar consultas grandes (1000+ animales) en 4G/5G normal
const TIMEOUT_PRECACHE_MS = 15_000; // Timeout amplio para sincronización/precarga explícita de caché
const TIMEOUT_ESCRITURA_MS = 8000; // Evita falsos timeouts al guardar con señal móvil real
const TIMEOUT_FUNCTIONS_MS = 60_000; // Edge Functions (Gemini AI AgroBot, invitaciones por correo, tareas de servidor)
const TIMEOUT_STORAGE_MS = 60_000; // Subida y descarga de archivos e imágenes
const TIMEOUT_AUTH_MS = 15_000; // Login manual con correo/contraseña
const TIMEOUT_AUTH_REFRESH_MS = 6000; // Renovación de token en red móvil real sin bloquear indefinidamente
const FAST_CACHE_RACE_MS = 1800; // Espera hasta 1.8s por datos frescos de la nube antes de usar caché local
const SESSION_BACKUP_KEY = 'agrogestion_cached_session_backup';

const NETWORK_FIRST_SIGNALS = new WeakSet<AbortSignal>();

/** Marca un AbortSignal como petición Network-First (omite la carrera contra caché). */
export function registrarNetworkFirstSignal(signal: AbortSignal) {
  NETWORK_FIRST_SIGNALS.add(signal);
}

/**
 * Decodifica el `exp` real del JWT (sin depender de `expires_at` del objeto de sesión,
 * que puede haberse extendido localmente en Modo Campo).
 */
export function jwtEstaExpirado(token: string | null | undefined, margenSegundos = 30): boolean {
  if (!token || typeof token !== 'string') return true;
  const partes = token.split('.');
  if (partes.length < 2) return true;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad));
    if (typeof payload?.exp !== 'number') return false;
    return payload.exp <= Math.floor(Date.now() / 1000) + margenSegundos;
  } catch {
    return false;
  }
}

export interface RefreshTokenResult {
  token: string | null;
  refreshToken?: string | null;
  authInvalid: boolean;
}

let refreshEnVuelo: Promise<RefreshTokenResult> | null = null;
let sesionRefreshRechazada = false;
let refreshCooldownHasta = 0;

/**
 * Intenta renovar el access_token con el refresh_token local sin disparar recursión en offlineAwareFetch.
 * Se deduplica si varias peticiones necesitan renovar al tiempo al volver a cobertura.
 */
export async function refrescarTokenEstado(): Promise<RefreshTokenResult> {
  if (sesionRefreshRechazada) {
    return { token: null, authInvalid: true };
  }
  if (Date.now() < refreshCooldownHasta) {
    return { token: null, authInvalid: false };
  }
  if (refreshEnVuelo) return refreshEnVuelo;
  refreshEnVuelo = (async (): Promise<RefreshTokenResult> => {
    try {
      const sesionLocal = leerSesionLocalSupabase();
      const refreshToken = sesionLocal?.refresh_token;
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      if (!refreshToken || !base || !apikey) {
        return { token: null, authInvalid: false };
      }

      const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey,
          Authorization: `Bearer ${apikey}`
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(TIMEOUT_AUTH_REFRESH_MS) : undefined
      });

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        sesionRefreshRechazada = true;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('offline-auth-required'));
        }
        return { token: null, authInvalid: true };
      }

      if (res.status === 429 || res.status >= 500) {
        refreshCooldownHasta = Date.now() + 15_000;
        return { token: null, authInvalid: false };
      }

      if (!res.ok) return { token: null, authInvalid: false };
      const data = await res.json();
      if (!data?.access_token) return { token: null, authInvalid: false };

      sesionRefreshRechazada = false;
      refreshCooldownHasta = 0;

      // Actualizar almacenamiento local de Supabase y copia de respaldo
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
            localStorage.setItem(k, JSON.stringify(data));
          }
        }
        guardarBackupSesionLocal(data);
      } catch { /* noop */ }

      return {
        token: String(data.access_token),
        refreshToken: data.refresh_token ? String(data.refresh_token) : refreshToken,
        authInvalid: false
      };
    } catch {
      return { token: null, authInvalid: false };
    } finally {
      refreshEnVuelo = null;
    }
  })();
  return refreshEnVuelo;
}

async function refrescarTokenDirecto(): Promise<string | null> {
  const res = await refrescarTokenEstado();
  return res.token;
}

/**
 * Lee sincrónicamente la sesión de Supabase guardada en localStorage (o su copia de respaldo).
 * Permite arrancar en 0ms sin esperar a la red y mantener viva la sesión en el potrero cuando vence la hora del JWT.
 */
export function leerSesionLocalSupabase(): any | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.user && parsed.access_token) {
          return parsed;
        }
      }
    }
    const backupRaw = localStorage.getItem(SESSION_BACKUP_KEY);
    if (backupRaw) {
      const parsed = JSON.parse(backupRaw);
      if (parsed && parsed.user && parsed.access_token) {
        return parsed;
      }
    }
  } catch { /* noop */ }
  return null;
}

export function guardarBackupSesionLocal(sessionObj: any) {
  try {
    if (sessionObj && sessionObj.user && sessionObj.access_token) {
      sesionRefreshRechazada = false;
      refreshCooldownHasta = 0;
      localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(sessionObj));
    }
  } catch { /* noop */ }
}

export function limpiarBackupSesionLocal() {
  try {
    sesionRefreshRechazada = false;
    refreshCooldownHasta = 0;
    localStorage.removeItem(SESSION_BACKUP_KEY);
  } catch { /* noop */ }
}

let isRedDegradada = false;

export const isConexionDegradada = (): boolean => isRedDegradada;

export const setConexionDegradada = (val: boolean) => {
  if (isRedDegradada !== val) {
    isRedDegradada = val;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline-network-status', { detail: { degradada: val } }));
    }
  }
};

// Tablas cuyo `id` es uuid con default: se puede generar en el cliente (hace seguro reintentar un insert)
const TABLAS_CON_ID_UUID = new Set([
  'analisis_climatico_finca', 'animales', 'auditoria_cambios', 'cargas_masivas', 'compradores',
  'configuracion_kpi', 'fincas', 'mapas_finca', 'mediciones_pasto', 'movimientos_potreros',
  'organizaciones', 'permisos_finca', 'pluviometros_finca', 'potreradas', 'potreros', 'precios_mercado_ganado',
  'propietarios', 'proveedores', 'registros_aforo', 'registros_cria', 'registros_lluvia',
  'registros_pesaje', 'rotaciones'
]);

const NOMBRES_TABLA: Record<string, string> = {
  animales: 'animales',
  registros_pesaje: 'pesajes',
  potreros: 'potreros',
  potreradas: 'lotes',
  rotaciones: 'rotaciones',
  movimientos_potreros: 'movimientos de lote',
  registros_aforo: 'aforos',
  pluviometros_finca: 'pluviómetros',
  registros_lluvia: 'registros de lluvia',
  registros_cria: 'registros de cría',
  compradores: 'compradores',
  proveedores: 'proveedores',
  propietarios: 'propietarios',
  mediciones_pasto: 'mediciones de pasto',
  mapas_finca: 'mapas',
  configuracion_kpi: 'configuraciones'
};
const VERBOS: Record<string, string> = { POST: 'Creados', PATCH: 'Actualizados', PUT: 'Actualizados', DELETE: 'Eliminados' };

export const etiquetaOperacion = (method: string, tabla: string): string => {
  if (tabla.startsWith('rpc/')) return 'Recálculos de historial';
  return `${VERBOS[method] || method} · ${NOMBRES_TABLA[tabla] || tabla}`;
};

// ───────────────────────── utilidades ─────────────────────────

function parseRest(url: string) {
  let u: URL;
  try {
    u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
  } catch {
    return null;
  }
  const idx = u.pathname.indexOf('/rest/v1/');
  if (idx < 0) return null;
  const resto = u.pathname.slice(idx + '/rest/v1/'.length);
  const isRpc = resto.startsWith('rpc/');
  return { u, tabla: resto, isRpc, fn: isRpc ? resto.slice(4) : '' };
}

function conTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const hasTimeout = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal;
  if (init.signal && hasTimeout && 'any' in AbortSignal) {
    return fetch(url, { ...init, signal: AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) });
  }
  if (!init.signal && hasTimeout) {
    return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  }
  return fetch(url, init);
}

const esErrorDeRed = (e: any) =>
  e instanceof TypeError || e?.name === 'TimeoutError' || e?.name === 'AbortError';

function pick(headers: Headers, nombres: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  nombres.forEach(n => {
    const v = headers.get(n);
    if (v) out[n] = v;
  });
  return out;
}

let secuencia = 0;
const siguienteTs = () => Date.now() * 1000 + (secuencia++ % 1000);

// ───────────────────────── filtros PostgREST (evaluados en local) ─────────────────────────

interface Filtro { col: string; op: string; val: string; neg: boolean }
const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'and', 'or', 'not', 'count']);
const OPS = new Set(['eq', 'neq', 'is', 'in', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike']);

function parseFiltros(params: URLSearchParams): Filtro[] {
  const out: Filtro[] = [];
  params.forEach((v, k) => {
    if (RESERVADOS.has(k) || k.includes('.')) return;
    let s = v;
    let neg = false;
    if (s.startsWith('not.')) { neg = true; s = s.slice(4); }
    const p = s.indexOf('.');
    if (p < 0) return;
    const op = s.slice(0, p);
    if (!OPS.has(op)) return;
    out.push({ col: k, op, val: s.slice(p + 1), neg });
  });
  return out;
}

const norm = (x: any) => (x === null || x === undefined ? 'null' : String(x));

function evalFiltro(rowVal: any, f: Filtro): boolean {
  let r = true;
  switch (f.op) {
    case 'eq': r = norm(rowVal) === f.val; break;
    case 'neq': r = norm(rowVal) !== f.val; break;
    case 'is':
      r = f.val === 'null' ? rowVal == null : f.val === 'true' ? rowVal === true : f.val === 'false' ? rowVal === false : true;
      break;
    case 'in': {
      const lista = f.val.replace(/^\(|\)$/g, '').split(',').map(x => x.trim().replace(/^"|"$/g, ''));
      r = lista.includes(norm(rowVal));
      break;
    }
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = Number(rowVal), b = Number(f.val);
      const num = rowVal !== null && rowVal !== '' && !isNaN(a) && !isNaN(b);
      if (num) {
        r = f.op === 'gt' ? a > b : f.op === 'gte' ? a >= b : f.op === 'lt' ? a < b : a <= b;
        break;
      }
      // Comparación segura de fechas (ISO / YYYY-MM-DD)
      const isDateA = typeof rowVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rowVal);
      const isDateB = typeof f.val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f.val);
      if (isDateA && isDateB) {
        const tA = new Date(rowVal.length === 10 ? rowVal + 'T12:00:00Z' : rowVal).getTime();
        let tB = new Date(f.val.length === 10 ? f.val + 'T12:00:00Z' : f.val).getTime();
        if (f.op === 'lte' && f.val.length === 10) {
          tB = new Date(f.val + 'T23:59:59.999Z').getTime();
        } else if (f.op === 'gte' && f.val.length === 10) {
          tB = new Date(f.val + 'T00:00:00.000Z').getTime();
        }
        if (!isNaN(tA) && !isNaN(tB)) {
          r = f.op === 'gt' ? tA > tB : f.op === 'gte' ? tA >= tB : f.op === 'lt' ? tA < tB : tA <= tB;
          break;
        }
      }
      const x: any = norm(rowVal);
      const y: any = f.val;
      r = f.op === 'gt' ? x > y : f.op === 'gte' ? x >= y : f.op === 'lt' ? x < y : x <= y;
      break;
    }
    case 'like': case 'ilike': {
      const rx = new RegExp('^' + f.val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', f.op === 'ilike' ? 'i' : '');
      r = rx.test(norm(rowVal));
      break;
    }
  }
  return f.neg ? !r : r;
}

/** Evalúa solo las columnas presentes en la fila (respuestas con `select` parcial). */
function cumple(row: any, filtros: Filtro[], exigirAlMenosUno = false): boolean {
  let evaluados = 0;
  for (const f of filtros) {
    if (f.col in row) {
      evaluados++;
      if (!evalFiltro(row[f.col], f)) return false;
    } else {
      if (f.op === 'is' && f.val === 'null' && !f.neg) {
        evaluados++;
        continue;
      }
      if (f.op === 'is' && f.val === 'null' && f.neg) {
        return false;
      }
      if (f.col === 'estado' && f.op === 'eq' && f.val !== 'activo') {
        return false;
      }
    }
  }
  return exigirAlMenosUno ? evaluados > 0 : true;
}

/**
 * Fallback inteligente por tabla:
 * Si la URL exacta no coincide (por filtros de fechas, orden o selección de columnas),
 * reúne todas las filas cacheadas de esa tabla, evalúa los filtros y devuelve la respuesta sintética.
 */
async function smartTableFallback(
  tabla: string,
  u: URL,
  headers: Headers,
  method: string
): Promise<Response | null> {
  try {
    const pool = new Map<string, any>();
    const idsEliminados = new Set<string>();
    const listSinId: any[] = [];

    // 1. Recoger todas las respuestas cacheadas de esta tabla
    const items = await localDB.httpReadCache.where('tabla').equals(tabla).toArray();
    for (const item of items) {
      if (item.method === 'HEAD' || !item.body) continue;
      try {
        const parsed = JSON.parse(item.body);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const row of arr) {
          if (!row || typeof row !== 'object') continue;
          if (row.id !== undefined && row.id !== null) {
            const idStr = String(row.id);
            if (row.is_deleted === true) idsEliminados.add(idStr);
            const prev = pool.get(idStr);
            if (!prev) {
              pool.set(idStr, { ...row });
            } else {
              const merged = { ...prev, ...row };
              if (
                Array.isArray(prev.registros_pesaje) &&
                prev.registros_pesaje.length > 0 &&
                (!Array.isArray(row.registros_pesaje) || row.registros_pesaje.length === 0)
              ) {
                merged.registros_pesaje = prev.registros_pesaje;
              }
              if (prev.potreros && !row.potreros) merged.potreros = prev.potreros;
              if (prev.potreradas && !row.potreradas) merged.potreradas = prev.potreradas;
              pool.set(idStr, merged);
            }
          } else {
            listSinId.push(row);
          }
        }
      } catch { /* noop */ }
    }

    // 2. Apoyarse en las tablas especializadas de Dexie si no hay datos en el pool
    if (tabla === 'potreros') {
      const pots = await localDB.potrerosCache.toArray();
      for (const p of pots) {
        if (!pool.has(p.id) && !idsEliminados.has(p.id)) {
          pool.set(p.id, {
            id: p.id,
            id_finca: p.id_finca,
            nombre: p.nombre,
            area_hectareas: p.area_ha,
            geojson_geometry: p.geojson_geometry,
            color_mapa: p.color_mapa,
            kml_name: p.kml_name,
            id_rotacion: (p as any).id_rotacion || null
          });
        }
      }
    } else if (tabla === 'potreradas') {
      const pts = await localDB.potreradasCache.toArray();
      for (const pt of pts) {
        if (!pool.has(pt.id) && !idsEliminados.has(pt.id)) {
          pool.set(pt.id, {
            id: pt.id,
            id_finca: pt.id_finca,
            nombre: pt.nombre,
            id_rotacion: (pt as any).id_rotacion || null
          });
        }
      }
    } else if (tabla === 'rotaciones') {
      const rots = await localDB.rotacionesCache.toArray();
      for (const r of rots) {
        if (!pool.has(r.id) && !idsEliminados.has(r.id)) {
          pool.set(r.id, {
            id: r.id,
            id_finca: r.id_finca,
            nombre: r.nombre
          });
        }
      }
    } else if (tabla === 'animales') {
      const anims = await localDB.animalesCache.toArray();
      for (const a of anims) {
        const existing = pool.get(a.id);
        if (!existing && !idsEliminados.has(a.id)) {
          pool.set(a.id, {
            id: a.id,
            id_finca: a.id_finca,
            numero_chapeta: a.numero_chapeta,
            nombre_propietario: a.nombre_propietario,
            etapa: a.etapa,
            estado: a.estado || 'activo',
            peso_ingreso: a.peso_ingreso,
            peso_compra: a.peso_compra,
            fecha_ingreso: a.fecha_ingreso,
            fecha_ingreso_ceba: a.fecha_ingreso_ceba,
            peso_ingreso_ceba: a.peso_ingreso_ceba,
            id_potrerada: a.id_potrerada,
            peso_venta: a.peso_venta,
            fecha_venta: a.fecha_venta,
            comprador_venta: a.comprador_venta,
            observaciones_venta: a.observaciones_venta,
            precio_venta: a.precio_venta,
            potreros: a.potrero_nombre ? { nombre: a.potrero_nombre } : null,
            potreradas: a.potrerada_nombre ? { nombre: a.potrerada_nombre } : null,
            registros_pesaje: a.registros_pesaje || []
          });
        } else if (existing && !Array.isArray(existing.registros_pesaje) && Array.isArray(a.registros_pesaje)) {
          existing.registros_pesaje = a.registros_pesaje;
        }
      }
    } else if (tabla === 'vista_precios_mercado') {
      const m = await localDB.mercadoCache.get('mercado_general');
      if (m?.precios && Array.isArray(m.precios)) {
        m.precios.forEach((p: any) => listSinId.push(p));
      }
    }

    // Nunca mezclar filas sin id (p.ej. proyecciones parciales del Dashboard) cuando ya existen filas completas con id
    let sinIdFinal = pool.size > 0 ? [] : listSinId;
    if (sinIdFinal.length > 0 && tabla === 'registros_lluvia') {
      const dedup = new Map<string, any>();
      for (const r of sinIdFinal) {
        const k = `${r.id_finca || ''}|${String(r.fecha || '').split('T')[0]}|${r.id_pluviometro || ''}`;
        const prev = dedup.get(k);
        if (!prev || (r.id_pluviometro && !prev.id_pluviometro)) {
          dedup.set(k, r);
        }
      }
      sinIdFinal = Array.from(dedup.values());
    }

    const todos = [...pool.values(), ...sinIdFinal];
    if (todos.length === 0) return null;

    const isSingle = headers.get('accept')?.includes('vnd.pgrst.object');
    const isHead = method === 'HEAD';

    // 3. Filtrar
    const filtros = parseFiltros(u.searchParams);
    let filtrados = todos.filter(r => {
      if (r.is_deleted === true) return false;
      return cumple(r, filtros);
    });

    // 4. Ordenar
    ordenar(filtrados, u.searchParams);

    // 5. Paginación
    const limitStr = u.searchParams.get('limit');
    const offsetStr = u.searchParams.get('offset');
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    if (limitStr) {
      const limit = parseInt(limitStr, 10);
      filtrados = filtrados.slice(offset, offset + limit);
    } else if (offset > 0) {
      filtrados = filtrados.slice(offset);
    }

    // 6. Encabezados de respuesta
    const respHeaders: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'x-offline-cache': 'smart-fallback'
    };

    const countParam = u.searchParams.get('count') || headers.get('prefer')?.includes('count=');
    if (countParam || isHead) {
      const total = filtrados.length;
      respHeaders['Content-Range'] = total > 0 ? `0-${total - 1}/${total}` : '*/0';
    }

    if (isHead) {
      return new Response(null, { status: 200, headers: respHeaders });
    }

    if (isSingle) {
      if (filtrados.length === 1) {
        return new Response(JSON.stringify(filtrados[0]), { status: 200, headers: respHeaders });
      }
      if (filtrados.length === 0) {
        if (tabla === 'resumen_finca') {
          return new Response(JSON.stringify({
            id_finca: u.searchParams.get('id_finca') || '',
            total_animales_activos: 0,
            gmp_promedio_total: 0,
            carga_animal: 0
          }), { status: 200, headers: respHeaders });
        }
        if (tabla === 'configuracion_kpi') {
          return new Response(JSON.stringify({
            umbral_alto_gmp: 20,
            umbral_medio_gmp: 10,
            precio_venta_promedio: 0,
            costo_mensual_animal: 0,
            participacion_utilidad: 0.6
          }), { status: 200, headers: respHeaders });
        }
        return new Response(JSON.stringify({
          code: 'PGRST116',
          details: 'The result contains 0 rows',
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned'
        }), { status: 406, headers: respHeaders });
      }
      return new Response(JSON.stringify(filtrados[0]), { status: 200, headers: respHeaders });
    }

    return new Response(JSON.stringify(filtrados), { status: 200, headers: respHeaders });
  } catch (err) {
    console.warn('[OfflineHTTP] Error en smartTableFallback:', err);
    return null;
  }
}

// ───────────────────────── caché de lecturas ─────────────────────────

async function guardarCache(
  key: string,
  url: string,
  method: string,
  reqBody: string | null,
  reqHeaders: Headers,
  res: Response,
  tabla: string
): Promise<boolean> {
  try {
    // Proteger escrituras optimistas pendientes: no pisar la caché de una tabla con cambios aún sin subir
    const hayPendientesTabla = await localDB.httpWriteQueue
      .filter(op => op.status !== 'failed' && op.tabla === tabla)
      .count();
    if (hayPendientesTabla > 0) return false;

    const body = await res.text();
    if (body.length > MAX_BODY_CHARS) return false;
    const prev = await localDB.httpReadCache.get(key);
    const cambio = !prev || prev.body !== body;
    const item: HttpReadCacheItem = {
      key, tabla, url, method, reqBody,
      reqHeaders: pick(reqHeaders, ['accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile', 'content-type']),
      status: res.status,
      contentType: res.headers.get('content-type') || 'application/json',
      contentRange: res.headers.get('content-range') || undefined,
      body,
      ts: Date.now()
    };
    await localDB.httpReadCache.put(item);
    if (Math.random() < 0.04) {
      const total = await localDB.httpReadCache.count();
      if (total > MAX_ENTRADAS_CACHE) {
        const sobrantes = await localDB.httpReadCache.orderBy('ts').limit(total - MAX_ENTRADAS_CACHE).primaryKeys();
        await localDB.httpReadCache.bulkDelete(sobrantes);
      }
    }
    return cambio;
  } catch (e) {
    console.warn('[OfflineHTTP] No se pudo guardar caché:', e);
    return false;
  }
}

function respuestaDesdeCache(c: HttpReadCacheItem): Response {
  const headers: Record<string, string> = { 'Content-Type': c.contentType, 'x-offline-cache': '1' };
  if (c.contentRange) headers['Content-Range'] = c.contentRange;
  return new Response(c.method === 'HEAD' ? null : c.body, { status: c.status, headers });
}

export async function limpiarCacheLecturas() {
  try { await localDB.httpReadCache.clear(); } catch { /* noop */ }
}

// ───────────────────────── escrituras: aplicar en local ─────────────────────────

const candidatosFk = (rel: string) => [
  `id_${rel.replace(/s$/, '')}`,
  `id_${rel.replace(/es$/, '')}`,
  `id_${rel.replace(/ones$/, 'ion')}`
];

function ordenar(lista: any[], params: URLSearchParams) {
  const orden = params.get('order');
  if (!orden) return;
  const criterios = orden.split(',').map(c => {
    const [col, dir] = c.split('.');
    return { col, desc: dir === 'desc' };
  }).filter(c => !c.col.includes('.'));
  if (!criterios.length) return;
  lista.sort((a, b) => {
    for (const { col, desc } of criterios) {
      const x = a[col], y = b[col];
      if (x === y) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : col === 'id'
            ? (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0)
            : String(x).localeCompare(String(y), 'es');
      if (r !== 0) return desc ? -r : r;
    }
    return 0;
  });
}

async function sincronizarTablasEspecializadas(
  tabla: string,
  method: string,
  filtrosReq: Filtro[],
  cuerpo: any
): Promise<void> {
  try {
    const ahora = new Date().toISOString();

    if (tabla === 'animales') {
      if (method === 'POST' && cuerpo) {
        const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
        const items: any[] = [];
        for (const r of filas) {
          if (!r?.id || !r?.id_finca) continue;
          let potNombre = '';
          if (r.id_potrerada) {
            const pt = await localDB.potreradasCache.get(r.id_potrerada);
            if (pt) potNombre = pt.nombre;
          }
          items.push({
            id: r.id,
            id_finca: r.id_finca,
            numero_chapeta: r.numero_chapeta || '',
            nombre_propietario: r.nombre_propietario,
            etapa: r.etapa || 'levante',
            estado: r.estado || 'activo',
            peso_ingreso: r.peso_ingreso,
            peso_compra: r.peso_compra,
            fecha_ingreso: r.fecha_ingreso || ahora.slice(0, 10),
            fecha_ingreso_ceba: r.fecha_ingreso_ceba,
            peso_ingreso_ceba: r.peso_ingreso_ceba,
            id_potrerada: r.id_potrerada,
            potrero_nombre: '',
            potrerada_nombre: potNombre,
            ultimo_peso: r.peso_ingreso ?? r.peso_compra,
            fecha_ultimo_pesaje: r.fecha_ingreso,
            registros_pesaje: [],
            updated_at: ahora
          });
        }
        if (items.length) await localDB.animalesCache.bulkPut(items);
      } else if ((method === 'PATCH' || method === 'PUT') && cuerpo) {
        const todos = await localDB.animalesCache.toArray();
        const actualizados: any[] = [];
        const eliminarIds: string[] = [];
        let potNombreNuevo: string | undefined;
        if (cuerpo.id_potrero_actual) {
          const pot = await localDB.potrerosCache.get(cuerpo.id_potrero_actual);
          if (pot) potNombreNuevo = pot.nombre;
        }
        let lotNombreNuevo: string | undefined;
        if (cuerpo.id_potrerada) {
          const pt = await localDB.potreradasCache.get(cuerpo.id_potrerada);
          if (pt) lotNombreNuevo = pt.nombre;
        }
        for (const row of todos) {
          if (!cumple(row, filtrosReq, true)) continue;
          if (cuerpo.is_deleted === true) {
            eliminarIds.push(row.id);
          } else {
            actualizados.push({
              ...row,
              ...cuerpo,
              ...(potNombreNuevo !== undefined ? { potrero_nombre: potNombreNuevo } : {}),
              ...(lotNombreNuevo !== undefined ? { potrerada_nombre: lotNombreNuevo } : {}),
              updated_at: ahora
            });
          }
        }
        if (eliminarIds.length) await localDB.animalesCache.bulkDelete(eliminarIds);
        if (actualizados.length) await localDB.animalesCache.bulkPut(actualizados);
      } else if (method === 'DELETE') {
        const todos = await localDB.animalesCache.toArray();
        const eliminarIds = todos.filter(r => cumple(r, filtrosReq, true)).map(r => r.id);
        if (eliminarIds.length) await localDB.animalesCache.bulkDelete(eliminarIds);
      }
      return;
    }

    if (tabla === 'registros_pesaje') {
      if (method === 'POST' && cuerpo) {
        const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
        for (const p of filas) {
          if (!p?.id_animal) continue;
          const cached = await localDB.animalesCache.get(p.id_animal);
          if (!cached) continue;
          const prevPesajes = (cached.registros_pesaje || []).filter(
            (x: any) => !x.is_deleted && !(p.id && x.id === p.id)
          );
          const nuevo = {
            id: p.id,
            id_animal: p.id_animal,
            peso: Number(p.peso),
            fecha: p.fecha,
            etapa: p.etapa || cached.etapa,
            gdp_calculada: p.gdp_calculada ?? 0,
            gmp_calculada: p.gmp_calculada ?? (p.gdp_calculada !== undefined ? Number(p.gdp_calculada) * 30 : undefined),
            is_deleted: false
          };
          const ordenados = [nuevo, ...prevPesajes].sort(
            (x: any, y: any) => String(y.fecha || '').localeCompare(String(x.fecha || ''))
          );
          const ult = ordenados[0];
          await localDB.animalesCache.update(p.id_animal, {
            registros_pesaje: ordenados,
            ultimo_peso: ult ? Number(ult.peso) : cached.ultimo_peso,
            fecha_ultimo_pesaje: ult ? ult.fecha : cached.fecha_ultimo_pesaje,
            updated_at: ahora
          });
        }
      } else if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
        const idFiltro = filtrosReq.find(f => f.col === 'id' && f.op === 'eq')?.val;
        const animalFiltro = filtrosReq.find(f => f.col === 'id_animal' && f.op === 'eq')?.val;
        if (!idFiltro && !animalFiltro) return;
        const candidatos = animalFiltro
          ? ([await localDB.animalesCache.get(animalFiltro)].filter(Boolean) as any[])
          : await localDB.animalesCache.toArray();
        for (const cached of candidatos) {
          const lista = cached.registros_pesaje || [];
          let modifico = false;
          const actualizada = lista
            .map((p: any) => {
              const coincide = idFiltro ? p.id === idFiltro : true;
              if (!coincide) return p;
              modifico = true;
              if (method === 'DELETE' || cuerpo?.is_deleted === true) return null;
              return { ...p, ...cuerpo };
            })
            .filter(Boolean)
            .sort((x: any, y: any) => String(y.fecha || '').localeCompare(String(x.fecha || '')));
          if (!modifico) continue;
          const ult = actualizada[0];
          await localDB.animalesCache.update(cached.id, {
            registros_pesaje: actualizada,
            ultimo_peso: ult ? Number(ult.peso) : (cached.peso_ingreso ?? cached.peso_compra),
            fecha_ultimo_pesaje: ult ? ult.fecha : cached.fecha_ingreso,
            updated_at: ahora
          });
        }
      }
      return;
    }

    if (tabla === 'potreros') {
      if (method === 'POST' && cuerpo) {
        const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).filter((r: any) => r?.id && r?.id_finca);
        if (filas.length) {
          await localDB.potrerosCache.bulkPut(
            filas.map((p: any) => ({
              id: p.id,
              id_finca: p.id_finca,
              nombre: p.nombre,
              area_ha: p.area_hectareas,
              id_rotacion: p.id_rotacion || null,
              geojson_geometry: p.geojson_geometry,
              color_mapa: p.color_mapa,
              kml_name: p.kml_name
            }))
          );
        }
      } else if ((method === 'PATCH' || method === 'PUT') && cuerpo) {
        const todos = await localDB.potrerosCache.toArray();
        const mod = todos.filter(r => cumple(r, filtrosReq, true)).map(r => ({
          ...r,
          ...cuerpo,
          ...(cuerpo.area_hectareas !== undefined ? { area_ha: cuerpo.area_hectareas } : {})
        }));
        if (mod.length) await localDB.potrerosCache.bulkPut(mod);
      } else if (method === 'DELETE') {
        const todos = await localDB.potrerosCache.toArray();
        const delIds = todos.filter(r => cumple(r, filtrosReq, true)).map(r => r.id);
        if (delIds.length) await localDB.potrerosCache.bulkDelete(delIds);
      }
      return;
    }

    if (tabla === 'potreradas') {
      if (method === 'POST' && cuerpo) {
        const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).filter((r: any) => r?.id && r?.id_finca);
        if (filas.length) {
          await localDB.potreradasCache.bulkPut(
            filas.map((p: any) => ({ id: p.id, id_finca: p.id_finca, nombre: p.nombre, id_rotacion: p.id_rotacion || null }))
          );
        }
      } else if ((method === 'PATCH' || method === 'PUT') && cuerpo) {
        const todos = await localDB.potreradasCache.toArray();
        const mod = todos.filter(r => cumple(r, filtrosReq, true)).map(r => ({ ...r, ...cuerpo }));
        if (mod.length) await localDB.potreradasCache.bulkPut(mod);
      } else if (method === 'DELETE') {
        const todos = await localDB.potreradasCache.toArray();
        const delIds = todos.filter(r => cumple(r, filtrosReq, true)).map(r => r.id);
        if (delIds.length) await localDB.potreradasCache.bulkDelete(delIds);
      }
      return;
    }

    if (tabla === 'rotaciones') {
      if (method === 'POST' && cuerpo) {
        const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).filter((r: any) => r?.id && r?.id_finca);
        if (filas.length) {
          await localDB.rotacionesCache.bulkPut(
            filas.map((r: any) => ({ id: r.id, id_finca: r.id_finca, nombre: r.nombre }))
          );
        }
      } else if ((method === 'PATCH' || method === 'PUT') && cuerpo) {
        const todos = await localDB.rotacionesCache.toArray();
        const mod = todos.filter(r => cumple(r, filtrosReq, true)).map(r => ({ ...r, ...cuerpo }));
        if (mod.length) await localDB.rotacionesCache.bulkPut(mod);
      } else if (method === 'DELETE') {
        const todos = await localDB.rotacionesCache.toArray();
        const delIds = todos.filter(r => cumple(r, filtrosReq, true)).map(r => r.id);
        if (delIds.length) await localDB.rotacionesCache.bulkDelete(delIds);
      }
    }
  } catch (e) {
    console.warn('[OfflineHTTP] No se pudo sincronizar caché especializada:', e);
  }
}

/** Aplica la escritura sobre todas las respuestas guardadas de esa tabla. Devuelve las filas afectadas. */
async function aplicarEscrituraEnCache(
  tabla: string,
  method: string,
  filtrosReq: Filtro[],
  cuerpo: any
): Promise<any[]> {
  const afectadas = new Map<string, any>();
  try {
    await sincronizarTablasEspecializadas(tabla, method, filtrosReq, cuerpo);
    const items = await localDB.httpReadCache.where('tabla').equals(tabla).toArray();
    const nuevas: any[] = method === 'POST' ? (Array.isArray(cuerpo) ? cuerpo : [cuerpo]) : [];
    const modificados: HttpReadCacheItem[] = [];

    // Filas de otras tablas (para completar datos relacionados, p. ej. potreros(nombre))
    const tablasRel = new Map<string, any[]>();
    const buscarRelacionada = async (rel: string, id: any) => {
      if (!tablasRel.has(rel)) {
        const todas: any[] = [];
        const cacheRel = await localDB.httpReadCache.where('tabla').equals(rel).toArray();
        for (const c of cacheRel) {
          try {
            const d = JSON.parse(c.body);
            (Array.isArray(d) ? d : [d]).forEach(x => x && typeof x === 'object' && todas.push(x));
          } catch { /* noop */ }
        }
        tablasRel.set(rel, todas);
      }
      return tablasRel.get(rel)!.find(x => x.id === id);
    };
    const enriquecer = async (row: any, muestra: any, selectStr: string, soloFk?: string[]) => {
      if (muestra) {
        for (const [k, v] of Object.entries(muestra)) {
          if (Array.isArray(v)) {
            if (row[k] === undefined) row[k] = [];
            continue;
          }
          if (v && typeof v === 'object') {
            const fk = candidatosFk(k).find(c => c in row && (!soloFk || soloFk.includes(c)));
            if (!fk) continue;
            const fila = await buscarRelacionada(k, row[fk]);
            if (fila) {
              const nuevo: any = {};
              Object.keys(v as object).forEach(col => { if (col in fila) nuevo[col] = fila[col]; });
              row[k] = nuevo;
            }
          }
        }
      }

      // Enriquecer relaciones clave aunque la lista en caché estuviera vacía ([])
      if (tabla === 'registros_pesaje' && row.id_animal && !row.animales && selectStr.includes('animales')) {
        const anim = await localDB.animalesCache.get(row.id_animal);
        if (anim) {
          row.animales = {
            numero_chapeta: anim.numero_chapeta,
            nombre_propietario: anim.nombre_propietario,
            id_finca: anim.id_finca,
            potreradas: anim.potrerada_nombre ? { nombre: anim.potrerada_nombre } : null
          };
        }
      }
      if (tabla === 'registros_aforo' && row.id_potrero && !row.potrero && selectStr.includes('potrero')) {
        const pot = await localDB.potrerosCache.get(row.id_potrero);
        if (pot) {
          row.potrero = { nombre: pot.nombre };
        }
      }
    };

    for (const item of items) {
      if (item.method === 'HEAD' || item.method === 'POST') continue;
      let data: any;
      try { data = JSON.parse(item.body); } catch { continue; }
      const esObj = data && !Array.isArray(data) && typeof data === 'object';
      let lista: any[] = esObj ? [data] : data;
      if (!Array.isArray(lista) || lista.some(r => r === null || typeof r !== 'object')) continue;

      let cambio = false;
      const urlCache = new URL(item.url, location.href);
      const filtrosCache = parseFiltros(urlCache.searchParams);
      const selectCache = urlCache.searchParams.get('select') || '';
      const muestra = lista.find(r => Object.values(r).some(v => v && typeof v === 'object')) || null;

      if (method === 'POST') {
        if (esObj) continue;
        for (const r of nuevas) {
          if (cumple(r, filtrosCache) && !lista.some(x => x.id !== undefined && x.id === r.id)) {
            const copia = { ...r };
            await enriquecer(copia, muestra, selectCache);
            lista.push(copia);
            cambio = true;
          }
          afectadas.set(String(r.id ?? Math.random()), r);
        }
      } else if (method === 'PATCH' || method === 'PUT') {
        const resultado: any[] = [];
        for (const row of lista) {
          if (cumple(row, filtrosReq, true)) {
            Object.assign(row, cuerpo);
            await enriquecer(row, muestra, selectCache, Object.keys(cuerpo || {}));
            cambio = true;
            afectadas.set(String(row.id ?? Math.random()), { ...(afectadas.get(String(row.id)) || {}), ...row });
            // si tras el cambio ya no cumple los filtros de esta consulta, sale de la lista
            if (!esObj && !cumple(row, filtrosCache)) continue;
          }
          resultado.push(row);
        }
        lista = resultado;
      } else if (method === 'DELETE') {
        const resultado: any[] = [];
        for (const row of lista) {
          if (cumple(row, filtrosReq, true)) {
            cambio = true;
            afectadas.set(String(row.id ?? Math.random()), row);
            if (esObj) resultado.push(row);
          } else {
            resultado.push(row);
          }
        }
        lista = resultado;
      }

      if (cambio) {
        if (!esObj) ordenar(lista, urlCache.searchParams);
        item.body = JSON.stringify(esObj ? lista[0] ?? data : lista);
        modificados.push(item);
      }
    }
    if (modificados.length) await localDB.httpReadCache.bulkPut(modificados);
  } catch (e) {
    console.warn('[OfflineHTTP] No se pudo aplicar cambio local:', e);
  }
  return Array.from(afectadas.values());
}

function respuestaSintetica(method: string, headers: Headers, filas: any[]): Response {
  const rep = /return=representation/.test(headers.get('prefer') || '');
  const obj = /vnd\.pgrst\.object/.test(headers.get('accept') || '');
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-queued': '1' };
  if (method === 'POST') {
    if (!rep) return new Response(null, { status: 201, headers: h });
    return new Response(JSON.stringify(obj ? filas[0] ?? null : filas), { status: 201, headers: h });
  }
  if (!rep) return new Response(null, { status: 204, headers: h });
  if (obj && filas.length !== 1) {
    return new Response(JSON.stringify({
      code: 'PGRST116', details: `The result contains ${filas.length} rows`, hint: null,
      message: 'JSON object requested, multiple (or no) rows returned'
    }), { status: 406, headers: h });
  }
  return new Response(JSON.stringify(obj ? filas[0] : filas), { status: 200, headers: h });
}

async function encolarEscritura(
  method: string, url: string, tabla: string, u: URL, headers: Headers, body: string | null
): Promise<Response> {
  let cuerpo: any = null;
  try { cuerpo = body ? JSON.parse(body) : null; } catch { cuerpo = null; }

  const afectadas = await aplicarEscrituraEnCache(tabla, method, parseFiltros(u.searchParams), cuerpo);
  const filas = method === 'POST' ? (Array.isArray(cuerpo) ? cuerpo.length : 1) : Math.max(1, afectadas.length);

  const item: HttpWriteQueueItem = {
    id: crypto.randomUUID(),
    ts: siguienteTs(),
    method, url, tabla, body, filas,
    headers: pick(headers, ['prefer', 'content-type', 'accept', 'content-profile', 'accept-profile']),
    status: 'pending'
  };
  await localDB.httpWriteQueue.put(item);
  window.dispatchEvent(new CustomEvent('offline-queue-changed'));

  const filasResp = method === 'POST' ? (Array.isArray(cuerpo) ? cuerpo : [cuerpo]) : afectadas;
  return respuestaSintetica(method, headers, filasResp);
}

// ───────────────────────── fetch principal ─────────────────────────

export async function offlineAwareFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const esRequest = typeof input !== 'string' && !(input instanceof URL);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init.method || (esRequest ? (input as Request).method : 'GET')).toUpperCase();
  const info = parseRest(url);
  const modoCampo = isModoCampoActivo();
  const sinSenalEfectiva = modoCampo || (typeof navigator !== 'undefined' && !navigator.onLine) || isRedDegradada;

  // Auth / Storage / Functions: manejo blindado para campo
  if (!info) {
    if (url.includes('/auth/v1/')) {
      // 1. Renovación automática de token (grant_type=refresh_token):
      // NUNCA debe apagar el Modo Campo ni bloquear el arranque por 15s cuando el celular no tiene señal.
      if (url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token')) {
        const responderRefreshLocal = (): Response | null => {
          const sesionLocal = leerSesionLocalSupabase();
          if (!sesionLocal) return null;
          const extendida = {
            ...sesionLocal,
            expires_in: 300,
            expires_at: Math.floor(Date.now() / 1000) + 300
          };
          return new Response(JSON.stringify(extendida), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-auth': 'refresh-local' }
          });
        };

        if (sinSenalEfectiva) {
          const localResp = responderRefreshLocal();
          if (localResp) return localResp;
        }

        if (sesionRefreshRechazada) {
          return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Session expired' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        try {
          const res = await conTimeout(url, init, TIMEOUT_AUTH_REFRESH_MS);
          if (res.ok) {
            sesionRefreshRechazada = false;
            refreshCooldownHasta = 0;
            setConexionDegradada(false);
            res.clone().json().then(d => guardarBackupSesionLocal(d)).catch(() => {});
            return res;
          }
          if (res.status === 400 || res.status === 401 || res.status === 403) {
            sesionRefreshRechazada = true;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('offline-auth-required'));
            }
            // Si estamos en línea (p. ej. PC), no disfrazar un refresh_token revocado como 200 OK
            return res;
          }
          if (res.status === 429 || res.status >= 500) {
            refreshCooldownHasta = Date.now() + 15_000;
          }
          // Ante caída temporal del servidor (5xx) o rate-limit, conservar sesión local de lectura
          const localResp = responderRefreshLocal();
          if (localResp) return localResp;
          return res;
        } catch (e) {
          if (esErrorDeRed(e)) setConexionDegradada(true);
          const localResp = responderRefreshLocal();
          if (localResp) return localResp;
          throw e;
        }
      }

      // 2. Consulta de usuario actual (/auth/v1/user): responder desde sesión local si no hay señal
      if (url.includes('/auth/v1/user') && method === 'GET') {
        const responderUserLocal = (): Response | null => {
          const sesionLocal = leerSesionLocalSupabase();
          if (!sesionLocal?.user) return null;
          return new Response(JSON.stringify(sesionLocal.user), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-auth': 'user-local' }
          });
        };

        if (sinSenalEfectiva) {
          const localResp = responderUserLocal();
          if (localResp) return localResp;
        }

        try {
          const res = await conTimeout(url, init, TIMEOUT_AUTH_REFRESH_MS);
          if (res.ok) return res;
          const localResp = responderUserLocal();
          if (localResp) return localResp;
          return res;
        } catch (e) {
          if (esErrorDeRed(e)) setConexionDegradada(true);
          const localResp = responderUserLocal();
          if (localResp) return localResp;
          throw e;
        }
      }

      // 3. Cierre de sesión (/auth/v1/logout): no bloquear si está sin señal
      if (url.includes('/auth/v1/logout')) {
        limpiarBackupSesionLocal();
        if (sinSenalEfectiva) return new Response(null, { status: 204 });
        try {
          return await conTimeout(url, init, TIMEOUT_AUTH_REFRESH_MS);
        } catch {
          return new Response(null, { status: 204 });
        }
      }

      // 4. Login explícito con correo/contraseña, registro o recuperación de clave:
      if (url.includes('grant_type=password') || url.includes('/auth/v1/signup') || url.includes('/auth/v1/recover') || url.includes('/auth/v1/otp')) {
        try { localStorage.removeItem('agrogestion_modo_campo'); } catch {}
      }
      const resAuth = await conTimeout(url, init, TIMEOUT_AUTH_MS);
      if (resAuth.ok && url.includes('/auth/v1/token')) {
        resAuth.clone().json().then(d => guardarBackupSesionLocal(d)).catch(() => {});
      }
      return resAuth;
    }

    if (modoCampo) throw new TypeError('Failed to fetch (Modo Campo activo)');

    // Invocaciones a Supabase Edge Functions (AgroBot Gemini AI, notificaciones, etc.)
    if (url.includes('/functions/v1/')) {
      return conTimeout(url, init, TIMEOUT_FUNCTIONS_MS);
    }

    // Almacenamiento Supabase (imágenes, reportes)
    if (url.includes('/storage/v1/')) {
      return conTimeout(url, init, TIMEOUT_STORAGE_MS);
    }

    return conTimeout(url, init, TIMEOUT_ESCRITURA_MS);
  }

  const headers = new Headers(esRequest ? (input as Request).headers : undefined);
  if (init.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }
  const bodyStr = typeof init.body === 'string' ? init.body : null;
  const esLecturaRpc = info.isRpc && method === 'POST' && /^get_/.test(info.fn);
  const esLectura = method === 'GET' || method === 'HEAD' || esLecturaRpc;
  const isNetworkFirst = Boolean(init.signal && NETWORK_FIRST_SIGNALS.has(init.signal));

  const intentarConRefresh401 = async (reqInit: RequestInit, timeoutMs: number): Promise<Response> => {
    let effectiveInit = reqInit;
    const authHeader = headers.get('authorization') || headers.get('Authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const bearer = authHeader.slice(7).trim();
      if (jwtEstaExpirado(bearer, 15)) {
        const nuevoToken = await refrescarTokenDirecto();
        if (nuevoToken) {
          const preHeaders = new Headers(headers);
          preHeaders.set('Authorization', `Bearer ${nuevoToken}`);
          effectiveInit = { ...reqInit, headers: preHeaders };
        }
      }
    }

    let res = await conTimeout(url, effectiveInit, timeoutMs);
    if (res.status === 401) {
      const nuevoToken = await refrescarTokenDirecto();
      if (nuevoToken) {
        const retryHeaders = new Headers(headers);
        retryHeaders.set('Authorization', `Bearer ${nuevoToken}`);
        res = await conTimeout(url, { ...reqInit, headers: retryHeaders }, timeoutMs);
      }
    }
    return res;
  };

  // ── LECTURAS (CACHE-FIRST CON REVALIDACIÓN RÁPIDA O NETWORK-FIRST PARA PRECARGA) ──
  if (esLectura) {
    const key = `${method} ${url}${esLecturaRpc ? ' ' + bodyStr : ''}`;
    const deCache = async (permitirSmartFallback = true) => {
      const c = await localDB.httpReadCache.get(key);
      if (c) return respuestaDesdeCache(c);
      if (permitirSmartFallback && !info.isRpc) {
        const fallback = await smartTableFallback(info.tabla, info.u, headers, method);
        if (fallback) return fallback;
      }
      return null;
    };

    const respuestaSeguraFallback = () => {
      // Blindaje de último recurso para evitar romper páginas con promesas en Modo Campo o sin red
      if (method === 'GET' && !headers.get('accept')?.includes('vnd.pgrst.object')) {
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-cache': 'empty-fallback' }
        });
      }
      if (headers.get('accept')?.includes('vnd.pgrst.object')) {
        if (info.tabla === 'resumen_finca') {
          return new Response(JSON.stringify({
            id_finca: info.u.searchParams.get('id_finca') || '',
            total_animales_activos: 0,
            gmp_promedio_total: 0,
            carga_animal: 0
          }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-cache': 'default-resumen-single' } });
        }
        if (info.tabla === 'configuracion_kpi') {
          return new Response(JSON.stringify({
            umbral_alto_gmp: 20,
            umbral_medio_gmp: 10,
            precio_venta_promedio: 0,
            costo_mensual_animal: 0,
            participacion_utilidad: 0.6
          }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-cache': 'default-kpi-single' } });
        }
        if (info.tabla === 'fincas') {
          return new Response(JSON.stringify({
            id: info.u.searchParams.get('id') || '',
            nombre: 'Mi Finca',
            proposito: 'Ceba y Levante',
            area_aprovechable: 0
          }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-cache': 'default-finca-single' } });
        }
        return new Response(JSON.stringify({
          code: 'PGRST116',
          details: 'The result contains 0 rows',
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned'
        }), { status: 406, headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-offline-cache': 'empty-single-fallback' } });
      }
      return null;
    };

    // Caso A: Modo Campo activo, o navegador sin red, o conexión previamente degradada
    if (sinSenalEfectiva) {
      const r = await deCache();
      if (r) return r;
      const fb = respuestaSeguraFallback();
      if (fb) return fb;
      throw new TypeError('Failed to fetch (Sin conexión ni datos guardados)');
    }

    // Caso B0: Petición explícita Network-First (precarga/sincronización/paginación: nunca mezclar caché vieja)
    if (isNetworkFirst) {
      try {
        const hayPendientesTabla = await localDB.httpWriteQueue
          .filter(op => op.status !== 'failed' && op.tabla === info.tabla)
          .count();
        if (hayPendientesTabla > 0) {
          const exacto = await localDB.httpReadCache.get(key);
          if (exacto) return respuestaDesdeCache(exacto);
        }
      } catch { /* noop */ }

      try {
        const res = await intentarConRefresh401(init, TIMEOUT_PRECACHE_MS);
        if (res.ok) {
          setConexionDegradada(false);
          await guardarCache(key, url, method, bodyStr, headers, res.clone(), info.tabla);
          return res;
        }
        if (res.status >= 500) setConexionDegradada(true);
        if (res.status === 401 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('offline-jwt-expired'));
        }
        const r = await deCache(true);
        if (r) return r;
        return res;
      } catch (e) {
        if (esErrorDeRed(e)) setConexionDegradada(true);
        const r = await deCache(true);
        if (r) return r;
        const fb = respuestaSeguraFallback();
        if (fb) return fb;
        throw e;
      }
    }

    // Caso B: En línea con red — solo usar caché EXACTA en la carrera, nunca smartTableFallback
    const cachedResp = await deCache(false);

    if (cachedResp) {
      // Si la tabla tiene escrituras locales aún pendientes de subir, respetar el estado optimista local
      try {
        const hayPendientesTabla = await localDB.httpWriteQueue
          .filter(op => op.status !== 'failed' && op.tabla === info.tabla)
          .count();
        if (hayPendientesTabla > 0) {
          return cachedResp;
        }
      } catch { /* noop */ }

      let sirvioCache = false;

      // Disparamos la petición a la red y renovamos JWT ante 401; si vence la carrera, revalidamos en segundo plano
      const fetchRed = intentarConRefresh401(init, TIMEOUT_LECTURA_MS)
        .then(async (res) => {
          if (res.ok) {
            setConexionDegradada(false);
            const cambio = await guardarCache(key, url, method, bodyStr, headers, res.clone(), info.tabla);
            if (sirvioCache && cambio && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('offline-cache-revalidated', { detail: { tabla: info.tabla, key } }));
            }
            return res;
          }
          if (res.status >= 500) {
            setConexionDegradada(true);
          } else if (res.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('offline-jwt-expired'));
          }
          return null;
        })
        .catch((e) => {
          if (esErrorDeRed(e)) {
            setConexionDegradada(true);
          }
          return null;
        });

      const redRapida = await Promise.race([
        fetchRed,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FAST_CACHE_RACE_MS))
      ]);

      if (redRapida && redRapida.ok) {
        return redRapida;
      }

      sirvioCache = true;
      return cachedResp;
    }

    // Si aún no hay nada en caché para esta consulta:
    try {
      const res = await intentarConRefresh401(init, TIMEOUT_LECTURA_MS);
      if (res.ok) {
        setConexionDegradada(false);
        void guardarCache(key, url, method, bodyStr, headers, res.clone(), info.tabla);
        return res;
      }
      if (res.status >= 500 || res.status === 401) {
        if (res.status >= 500) setConexionDegradada(true);
        if (res.status === 401 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('offline-jwt-expired'));
        }
        const r = await deCache();
        if (r) return r;
        const fb = respuestaSeguraFallback();
        if (fb) return fb;
      }
      return res;
    } catch (e) {
      if (esErrorDeRed(e)) {
        setConexionDegradada(true);
      }
      const r = await deCache();
      if (r) return r;
      const fb = respuestaSeguraFallback();
      if (fb) return fb;
      throw e;
    }
  }

  // ── ESCRITURAS ──
  if (info.isRpc) {
    // Consulta analítica de AgroBot a la base de datos: dar tiempo suficiente
    if (info.fn === 'execute_ai_query') {
      if (modoCampo) throw new TypeError('Failed to fetch (Modo Campo activo)');
      return conTimeout(url, init, TIMEOUT_FUNCTIONS_MS);
    }
    // Solo los recálculos de historial se pueden diferir; el resto exige conexión
    if (!/^recalcular_/.test(info.fn)) {
      if (modoCampo) throw new TypeError('Failed to fetch (Modo Campo activo)');
      return intentarConRefresh401(init, TIMEOUT_ESCRITURA_MS);
    }
    if (sinSenalEfectiva) return encolarEscritura(method, url, info.tabla, info.u, headers, bodyStr);
    try {
      const res = await intentarConRefresh401(init, TIMEOUT_ESCRITURA_MS);
      if (res.ok) {
        setConexionDegradada(false);
        return res;
      }
      if (res.status === 401 || res.status >= 500) {
        if (res.status >= 500) setConexionDegradada(true);
        if (res.status === 401 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('offline-jwt-expired'));
        }
        return encolarEscritura(method, url, info.tabla, info.u, headers, bodyStr);
      }
      return res;
    } catch (e) {
      if (esErrorDeRed(e)) {
        setConexionDegradada(true);
        return encolarEscritura(method, url, info.tabla, info.u, headers, bodyStr);
      }
      throw e;
    }
  }

  let cuerpoFinal = bodyStr;
  // Inserts simples: id generado aquí => reintentar nunca duplica filas
  if (method === 'POST' && bodyStr && TABLAS_CON_ID_UUID.has(info.tabla)) {
    const upsert = info.u.searchParams.has('on_conflict') || /resolution=/.test(headers.get('prefer') || '');
    if (!upsert) {
      try {
        const parsed = JSON.parse(bodyStr);
        const conId = (r: any) => (r && typeof r === 'object' && r.id === undefined ? { id: crypto.randomUUID(), ...r } : r);
        cuerpoFinal = JSON.stringify(Array.isArray(parsed) ? parsed.map(conId) : conId(parsed));
      } catch { /* se envía tal cual */ }
    }
  }

  if (sinSenalEfectiva) return encolarEscritura(method, url, info.tabla, info.u, headers, cuerpoFinal);

  try {
    const res = await intentarConRefresh401({ ...init, body: cuerpoFinal ?? init.body }, TIMEOUT_ESCRITURA_MS);
    if (res.ok) {
      setConexionDegradada(false);
      // Reflejar inmediatamente el cambio en caché local para evitar ver datos de la carrera de 350ms al cambiar de vista
      try {
        const cuerpoObj = cuerpoFinal ? JSON.parse(cuerpoFinal) : null;
        void aplicarEscrituraEnCache(info.tabla, method, parseFiltros(info.u.searchParams), cuerpoObj);
      } catch { /* noop */ }
      return res;
    }
    if (res.status === 401 || res.status >= 500) {
      if (res.status >= 500) setConexionDegradada(true);
      if (res.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline-jwt-expired'));
      }
      return encolarEscritura(method, url, info.tabla, info.u, headers, cuerpoFinal);
    }
    return res;
  } catch (e) {
    if (esErrorDeRed(e)) {
      setConexionDegradada(true);
      return encolarEscritura(method, url, info.tabla, info.u, headers, cuerpoFinal);
    }
    throw e;
  }
}
