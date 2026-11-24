import { supabase } from './supabase';
import { localDB, type HttpWriteQueueItem } from './db';
import {
  etiquetaOperacion,
  jwtEstaExpirado,
  leerSesionLocalSupabase,
  refrescarTokenEstado
} from './httpOffline';

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
  pendientesLineas?: LineaResumenSync[];
  pendientesTotal?: number;
  bloqueoMotivo?: string;
  authRequired?: boolean;
}

const SYNC_EVENT = 'agrogestion-sync-resumen';

/** Avisa a la interfaz (pop-up) de lo que acaba de subirse a la nube. */
export function anunciarResumenSync(resumen: ResumenSincronizacion) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: resumen }));
}
export const SYNC_EVENT_NAME = SYNC_EVENT;

async function obtenerTokenValido(): Promise<{ token: string | null; authInvalid: boolean }> {
  try {
    const { data } = await supabase.auth.getSession();
    const sessionToken = data.session?.access_token;
    if (sessionToken && !jwtEstaExpirado(sessionToken, 30)) {
      return { token: sessionToken, authInvalid: false };
    }
  } catch { /* fallback below */ }

  // Verificar si la copia local en localStorage tiene un token vigente
  const sesionLocal = leerSesionLocalSupabase();
  if (sesionLocal?.access_token && !jwtEstaExpirado(sesionLocal.access_token, 30)) {
    return { token: String(sesionLocal.access_token), authInvalid: false };
  }

  // El JWT expiró o falta: renovar directamente contra Supabase (sin respuesta falsa local)
  const refreshed = await refrescarTokenEstado();
  if (refreshed.token) {
    if (refreshed.refreshToken) {
      try {
        await supabase.auth.setSession({
          access_token: refreshed.token,
          refresh_token: refreshed.refreshToken
        });
      } catch { /* localStorage ya quedó actualizado por refrescarTokenEstado */ }
    }
    return { token: refreshed.token, authInvalid: false };
  }
  return { token: null, authInvalid: refreshed.authInvalid };
}

export async function obtenerResumenPendientesLocales(): Promise<{
  total: number;
  lineas: LineaResumenSync[];
}> {
  const mapa = new Map<string, number>();
  const sumar = (etiqueta: string, n: number) => {
    if (n <= 0) return;
    mapa.set(etiqueta, (mapa.get(etiqueta) || 0) + n);
  };

  try {
    const [httpOps, pesajes, aforos, compras] = await Promise.all([
      localDB.httpWriteQueue.filter(op => op.status !== 'failed').toArray(),
      localDB.pesajesOfflineQueue.filter(x => x.status_sync === 'pending' || x.status_sync === 'syncing').count(),
      localDB.aforosOfflineQueue.filter(x => x.status_sync === 'pending' || x.status_sync === 'syncing').count(),
      localDB.comprasOfflineQueue.filter(x => x.status_sync === 'pending' || x.status_sync === 'syncing').count()
    ]);

    for (const op of httpOps) {
      sumar(etiquetaOperacion(op.method, op.tabla), op.filas || 1);
    }
    sumar('Pendientes · pesajes', pesajes);
    sumar('Pendientes · aforos', aforos);
    sumar('Pendientes · lotes de compra', compras);
  } catch { /* noop */ }

  let total = 0;
  const lineas: LineaResumenSync[] = [];
  for (const [etiqueta, cantidad] of mapa.entries()) {
    total += cantidad;
    lineas.push({ etiqueta, cantidad, ok: true });
  }
  return { total, lineas };
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
  authRequired: boolean;
  bloqueoMotivo?: string;
}> {
  const lineasMap = new Map<string, LineaResumenSync>();
  const mensajesError: string[] = [];
  let procesados = 0;
  let errores = 0;
  let authRequired = false;
  let bloqueoMotivo: string | undefined;

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
  if (pendientes.length === 0) {
    return { procesados: 0, errores: 0, lineas: [], mensajesError, authRequired: false };
  }

  const tokenState = await obtenerTokenValido();
  let token = tokenState.token;
  const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!token) {
    authRequired = tokenState.authInvalid || Boolean(leerSesionLocalSupabase());
    bloqueoMotivo = authRequired
      ? 'Tu sesión expiró mientras trabajabas offline. Inicia sesión nuevamente para subir los registros pendientes (tus datos locales están a salvo).'
      : 'No hay una sesión activa válida para subir los registros pendientes.';
    if (authRequired && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline-auth-required'));
    }
    return { procesados: 0, errores: 0, lineas: [], mensajesError, authRequired, bloqueoMotivo };
  }
  let yaRefrescoToken = false;

  for (const op of pendientes) {
    try {
      let res = await fetch(op.url, {
        method: op.method,
        headers: { ...op.headers, apikey, Authorization: `Bearer ${token}` },
        body: op.body,
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(30000) : undefined
      });

      // Si el JWT expiró, renovarlo directamente contra Supabase (nunca usar respuesta offline falsa)
      if (res.status === 401 && !yaRefrescoToken) {
        yaRefrescoToken = true;
        const refreshed = await refrescarTokenEstado();
        if (refreshed.token) {
          token = refreshed.token;
          if (refreshed.refreshToken) {
            try {
              await supabase.auth.setSession({
                access_token: refreshed.token,
                refresh_token: refreshed.refreshToken
              });
            } catch { /* noop */ }
          }
          res = await fetch(op.url, {
            method: op.method,
            headers: { ...op.headers, apikey, Authorization: `Bearer ${token}` },
            body: op.body,
            signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(30000) : undefined
          });
        } else if (refreshed.authInvalid) {
          authRequired = true;
          bloqueoMotivo = 'Tu sesión expiró. Inicia sesión nuevamente para subir los registros pendientes (tus datos locales no se perderán).';
          break;
        }
      }

      if (res.ok) {
        await localDB.httpWriteQueue.delete(op.id);
        procesados += op.filas;
        sumar(op, true);
        continue;
      }

      // Sin sesión válida o servidor caído: se detiene preservando orden FIFO y se reintenta luego
      if (res.status === 401) {
        authRequired = true;
        bloqueoMotivo = 'No se pudo validar la sesión con el servidor (401). Cierra sesión o vuelve a iniciar sesión para subir los registros pendientes.';
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('offline-jwt-expired'));
          window.dispatchEvent(new CustomEvent('offline-auth-required'));
        }
        break;
      }

      if (res.status >= 500) {
        bloqueoMotivo = `El servidor respondió con un error temporal (${res.status}). Se reintentará automáticamente.`;
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
      // Sin red todavía o timeout: se conserva todo lo que falta
      bloqueoMotivo = 'La conexión con el servidor falló o expiró durante la subida. Tus datos siguen guardados en el celular.';
      break;
    }
  }

  window.dispatchEvent(new CustomEvent('offline-queue-changed'));
  return { procesados, errores, lineas: Array.from(lineasMap.values()), mensajesError, authRequired, bloqueoMotivo };
}

/**
 * Vuelve a pedir al servidor todas las consultas guardadas (de todos los módulos visitados),
 * para que los datos locales queden al día antes de salir al campo.
 */
export async function refrescarCacheLecturas(maxItems = 300): Promise<number> {
  const { token } = await obtenerTokenValido();
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
