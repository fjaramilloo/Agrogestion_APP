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
    return await localDB.httpWriteQueue.count();
  } catch {
    return 0;
  }
}

/**
 * Sube en orden todas las escrituras hechas sin conexión (cambios de rotación, lotes, ventas, etc.).
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

  const pendientes = await localDB.httpWriteQueue.orderBy('ts').toArray();
  if (pendientes.length === 0) return { procesados: 0, errores: 0, lineas: [], mensajesError };

  const token = await obtenerToken();
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!token) return { procesados: 0, errores: 0, lineas: [], mensajesError };

  for (const op of pendientes) {
    try {
      const res = await fetch(op.url, {
        method: op.method,
        headers: { ...op.headers, apikey, Authorization: `Bearer ${token}` },
        body: op.body,
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(30000) : undefined
      });

      // 409 en un insert = ya se había guardado antes (reintento): se da por subido
      if (res.ok || (op.method === 'POST' && res.status === 409)) {
        await localDB.httpWriteQueue.delete(op.id);
        procesados += op.filas;
        sumar(op, true);
        continue;
      }

      // Sin sesión válida o servidor caído: se detiene y se reintenta luego
      if (res.status === 401 || res.status >= 500) break;

      // Rechazo definitivo (permisos, datos inválidos): se informa y se descarta para no trabar la cola
      let detalle = '';
      try { detalle = (await res.json())?.message || ''; } catch { /* noop */ }
      await localDB.httpWriteQueue.delete(op.id);
      errores += op.filas;
      sumar(op, false);
      mensajesError.push(`${etiquetaOperacion(op.method, op.tabla)}: ${detalle || 'rechazado por el servidor (' + res.status + ')'}`);
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
