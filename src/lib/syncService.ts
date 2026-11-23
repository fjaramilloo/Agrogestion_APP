import { supabase } from './supabase';
import { localDB, type HttpWriteQueueItem } from './db';
import { etiquetaOperacion } from './httpOffline';

export interface LineaResumenSync {
  etiqueta: string;
  cantidad: number;
  ok: boolean;
}

export interface ResumenSincronizacion {
  fecha: string;
  lineas: LineaResumenSync[];
  exitosos: number;
  fallidos: number;
  errores: string[];
}

const SYNC_EVENT = 'agrogestion-sync-resumen';

/** Avisa a la interfaz (pop-up) de lo que acaba de subirse a la nube. */
export function anunciarResumenSync(resumen: ResumenSincronizacion) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: resumen }));
}
export const SYNC_EVENT_NAME = SYNC_EVENT;

async function obtenerToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

export async function contarEscriturasPendientes(): Promise<number> {
  try {
    return await localDB.httpWriteQueue.filter(op => op.status !== 'failed').count();
  } catch {
    return 0;
  }
}

export async function contarEscriturasConEstado(): Promise<{ pending: number; failed: number }> {
  try {
    const todas = await localDB.httpWriteQueue.toArray();
    let pending = 0;
    let failed = 0;
    for (const op of todas) {
      if (op.status === 'failed') failed++;
      else pending++;
    }
    return { pending, failed };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

export async function reintentarColaHttpFallida(): Promise<number> {
  try {
    const fallidas = await localDB.httpWriteQueue.where('status').equals('failed').toArray();
    if (!fallidas.length) return 0;
    await localDB.httpWriteQueue.bulkPut(
      fallidas.map(op => ({ ...op, status: 'pending', error_msg: undefined }))
    );
    window.dispatchEvent(new CustomEvent('offline-queue-changed'));
    return fallidas.length;
  } catch {
    return 0;
  }
}

export async function descartarColaHttpFallida(): Promise<number> {
  try {
    const keys = await localDB.httpWriteQueue.where('status').equals('failed').primaryKeys();
    if (!keys.length) return 0;
    await localDB.httpWriteQueue.bulkDelete(keys);
    window.dispatchEvent(new CustomEvent('offline-queue-changed'));
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * Sube en orden todas las escrituras pendientes hechas sin conexión (cambios de rotación, lotes, pesajes, ventas, etc.).
 * - Reintenta 401 tras renovar JWT una vez y conserva la cola ante 5xx / cortes de red.
 * - Solo considera idempotente un 409 si corresponde a la llave primaria (reintento del mismo insert).
 * - Los rechazos definitivos (4xx de negocio/duplicado/permisos) pasan a estado 'failed' para reintento o descarte manual sin trabar la cola.
 */
export async function sincronizarColaHttp(): Promise<{
  procesados: number;
  errores: number;
  lineas: LineaResumenSync[];
  mensajesError: string[];
}> {
  const lineasMap = new Map<string, LineaResumenSync>();
  const mensajesError: string[] = [];
  let procesados = 0;
  let errores = 0;

  const sumar = (op: HttpWriteQueueItem, ok: boolean) => {
    const etiqueta = etiquetaOperacion(op.method, op.tabla);
    const k = `${ok}|${etiqueta}`;
    const l = lineasMap.get(k) || { etiqueta, cantidad: 0, ok };
    l.cantidad += op.filas;
    lineasMap.set(k, l);
  };

  const pendientes = (await localDB.httpWriteQueue.orderBy('ts').toArray()).filter(
    op => op.status !== 'failed'
  );
  if (pendientes.length === 0) return { procesados: 0, errores: 0, lineas: [], mensajesError };

  let token = await obtenerToken();
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!token) return { procesados: 0, errores: 0, lineas: [], mensajesError };
  let yaRefrescoToken = false;

  for (const op of pendientes) {
    try {
      let res = await fetch(op.url, {
        method: op.method,
        headers: { ...op.headers, apikey, Authorization: `Bearer ${token}` },
        body: op.body,
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(30000) : undefined
      });

      // Si el JWT expiró mientras estábamos en potrero, renovarlo con el servidor real y reintentar
      if (res.status === 401 && !yaRefrescoToken) {
        yaRefrescoToken = true;
        try {
          const { data } = await supabase.auth.refreshSession();
          if (data.session?.access_token) {
            token = data.session.access_token;
            res = await fetch(op.url, {
              method: op.method,
              headers: { ...op.headers, apikey, Authorization: `Bearer ${token}` },
              body: op.body,
              signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(30000) : undefined
            });
          }
        } catch { /* noop */ }
      }

      if (res.ok) {
        await localDB.httpWriteQueue.delete(op.id);
        procesados += op.filas;
        sumar(op, true);
        continue;
      }

      // Sin sesión válida o servidor caído: se detiene preservando orden FIFO y se reintenta luego
      if (res.status === 401 || res.status >= 500) {
        if (res.status === 401 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('offline-jwt-expired'));
        }
        break;
      }

      let errJson: any = null;
      try { errJson = await res.clone().json(); } catch { /* noop */ }
      const errConcat = `${errJson?.message || ''} ${errJson?.details || ''} ${errJson?.hint || ''}`;
      const esUpsert = op.url.includes('on_conflict=') || /resolution=(merge|ignore)-duplicates/.test(op.headers?.prefer || '');
      const esDuplicadoPkIdempotente =
        res.status === 409 &&
        op.method === 'POST' &&
        (esUpsert || /_pkey\b|Key \(id\)=/i.test(errConcat));

      if (esDuplicadoPkIdempotente) {
        await localDB.httpWriteQueue.delete(op.id);
        procesados += op.filas;
        sumar(op, true);
        continue;
      }

      // Rechazo definitivo de negocio o permisos: marcar 'failed' sin borrar silenciosamente ni bloquear el resto
      const detalle = errJson?.message || errJson?.details || `rechazado por el servidor (${res.status})`;
      await localDB.httpWriteQueue.update(op.id, { status: 'failed', error_msg: detalle });
      errores += op.filas;
      sumar(op, false);
      mensajesError.push(`${etiquetaOperacion(op.method, op.tabla)}: ${detalle}`);
    } catch {
      // Sin red todavía: se conserva todo lo que falta
      break;
    }
  }

  window.dispatchEvent(new CustomEvent('offline-queue-changed'));
  return { procesados, errores, lineas: Array.from(lineasMap.values()), mensajesError };
}

/**
 * Vuelve a pedir al servidor todas las consultas guardadas (de todos los módulos visitados),
 * para que los datos locales queden al día antes de salir al campo.
 */
export async function refrescarCacheLecturas(maxItems = 300): Promise<number> {
  const token = await obtenerToken();
  if (!token) return 0;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const limiteViejo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  try {
    const viejos = await localDB.httpReadCache.where('ts').below(limiteViejo).primaryKeys();
    if (viejos.length) await localDB.httpReadCache.bulkDelete(viejos);
  } catch { /* noop */ }

  const items = (await localDB.httpReadCache.orderBy('ts').reverse().limit(maxItems).toArray());
  let actualizados = 0;
  let idx = 0;

  const worker = async () => {
    while (idx < items.length) {
      const item = items[idx++];
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { ...item.reqHeaders, apikey, Authorization: `Bearer ${token}` },
          body: item.reqBody ?? undefined,
          signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(20000) : undefined
        });
        if (!res.ok) continue;
        const body = await res.text();
        await localDB.httpReadCache.put({
          ...item,
          status: res.status,
          contentType: res.headers.get('content-type') || item.contentType,
          contentRange: res.headers.get('content-range') || undefined,
          body,
          ts: Date.now()
        });
        actualizados++;
      } catch { /* se conserva la copia anterior */ }
    }
  };

  await Promise.all([worker(), worker(), worker(), worker()]);
  return actualizados;
}
