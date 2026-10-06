import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'agrogestion_chunk_reload';

/**
 * Igual que React.lazy, pero si el archivo de la pantalla ya no existe (pasa justo después de
 * publicar una versión nueva y el navegador tiene la anterior abierta) recarga la app UNA sola vez
 * en lugar de dejar la pantalla en blanco.
 */
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      if (navigator.onLine && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        // Promesa que nunca resuelve: la página se está recargando
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

/** Descarga en segundo plano (cuando el navegador está libre) las pantallas más usadas. */
export function prefetchWhenIdle(loaders: Array<() => Promise<unknown>>) {
  const run = () => loaders.forEach(load => load().catch(() => {}));
  const w = window as any;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 2500);
  }
}
