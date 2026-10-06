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
    return localStorage.getItem('agrogestion_modo_campo') === 'true';
  } catch {
    return false;
  }
};

const MAX_BODY_CHARS = 6_000_000;
const MAX_ENTRADAS_CACHE = 800;
const TIMEOUT_LECTURA_MS = 15000;
const TIMEOUT_ESCRITURA_MS = 20000;

// Tablas cuyo `id` es uuid con default: se puede generar en el cliente (hace seguro reintentar un insert)
const TABLAS_CON_ID_UUID = new Set([
  'analisis_climatico_finca', 'animales', 'auditoria_cambios', 'cargas_masivas', 'compradores',
  'configuracion_kpi', 'fincas', 'mapas_finca', 'mediciones_pasto', 'movimientos_potreros',
  'organizaciones', 'permisos_finca', 'potreradas', 'potreros', 'precios_mercado_ganado',
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
  if (!init.signal && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
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
            const prev = pool.get(idStr);
            if (!prev) {
              pool.set(idStr, { ...row });
            } else {
              pool.set(idStr, { ...prev, ...row });
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
        if (!pool.has(p.id)) {
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
        if (!pool.has(pt.id)) {
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
        if (!pool.has(r.id)) {
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
        if (!pool.has(a.id)) {
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
            registros_pesaje: []
          });
        }
      }
    } else if (tabla === 'vista_precios_mercado') {
      const m = await localDB.mercadoCache.get('mercado_general');
      if (m?.precios && Array.isArray(m.precios)) {
        m.precios.forEach((p: any) => listSinId.push(p));
      }
    }

    const todos = [...pool.values(), ...listSinId];
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

async function guardarCache(key: string, url: string, method: string, reqBody: string | null, reqHeaders: Headers, res: Response, tabla: string) {
  try {
    const body = await res.text();
    if (body.length > MAX_BODY_CHARS) return;
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
  } catch (e) {
    console.warn('[OfflineHTTP] No se pudo guardar caché:', e);
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
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
      if (r !== 0) return desc ? -r : r;
    }
    return 0;
  });
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
    const enriquecer = async (row: any, muestra: any, soloFk?: string[]) => {
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
      const muestra = lista.find(r => Object.values(r).some(v => v && typeof v === 'object')) || null;

      if (method === 'POST') {
        if (esObj) continue;
        for (const r of nuevas) {
          if (cumple(r, filtrosCache) && !lista.some(x => x.id !== undefined && x.id === r.id)) {
            const copia = { ...r };
            if (muestra) await enriquecer(copia, muestra);
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
            if (muestra) await enriquecer(row, muestra, Object.keys(cuerpo || {}));
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
    headers: pick(headers, ['prefer', 'content-type', 'accept', 'content-profile', 'accept-profile'])
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

  // Auth / Storage / Functions: no se pueden usar sin red
  if (!info) {
    if (modoCampo) throw new TypeError('Failed to fetch (Modo Campo activo)');
    return conTimeout(url, init, TIMEOUT_ESCRITURA_MS);
  }

  const headers = new Headers(init.headers);
  const bodyStr = typeof init.body === 'string' ? init.body : null;
  const esLecturaRpc = info.isRpc && method === 'POST' && /^get_/.test(info.fn);
  const esLectura = method === 'GET' || method === 'HEAD' || esLecturaRpc;

  // ── LECTURAS ──
  if (esLectura) {
    const key = `${method} ${url}${esLecturaRpc ? ' ' + bodyStr : ''}`;
    const deCache = async () => {
      const c = await localDB.httpReadCache.get(key);
      if (c) return respuestaDesdeCache(c);
      if (!info.isRpc) {
        const fallback = await smartTableFallback(info.tabla, info.u, headers, method);
        if (fallback) return fallback;
      }
      return null;
    };

    if (modoCampo) {
      const r = await deCache();
      if (r) return r;
      // Blindaje de último recurso para evitar romper páginas con promesas en Modo Campo
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
      throw new TypeError('Failed to fetch (Modo Campo activo, sin datos guardados)');
    }

    try {
      const res = await conTimeout(url, init, TIMEOUT_LECTURA_MS);
      if (res.ok) {
        void guardarCache(key, url, method, bodyStr, headers, res.clone(), info.tabla);
        return res;
      }
      if (res.status >= 500) {
        const r = await deCache();
        if (r) return r;
      }
      return res;
    } catch (e) {
      const r = await deCache();
      if (r) return r;
      throw e;
    }
  }

  // ── ESCRITURAS ──
  if (info.isRpc) {
    // Solo los recálculos de historial se pueden diferir; el resto exige conexión
    if (!/^recalcular_/.test(info.fn)) {
      if (modoCampo) throw new TypeError('Failed to fetch (Modo Campo activo)');
      return conTimeout(url, init, TIMEOUT_ESCRITURA_MS);
    }
    if (modoCampo) return encolarEscritura(method, url, info.tabla, info.u, headers, bodyStr);
    try {
      return await conTimeout(url, init, TIMEOUT_ESCRITURA_MS);
    } catch (e) {
      if (esErrorDeRed(e)) return encolarEscritura(method, url, info.tabla, info.u, headers, bodyStr);
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

  if (modoCampo) return encolarEscritura(method, url, info.tabla, info.u, headers, cuerpoFinal);

  try {
    return await conTimeout(url, { ...init, body: cuerpoFinal ?? init.body }, TIMEOUT_ESCRITURA_MS);
  } catch (e) {
    if (esErrorDeRed(e)) return encolarEscritura(method, url, info.tabla, info.u, headers, cuerpoFinal);
    throw e;
  }
}
