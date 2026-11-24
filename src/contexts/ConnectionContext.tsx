import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { setConexionDegradada } from '../lib/httpOffline';
import {
  sincronizarCacheFinca,
  procesarSincronizacionOffline,
  contarColasOfflineDedicadas,
  reintentarColasOfflineFallidas,
  descartarColasOfflineFallidas,
  normalizarColasAtascadas,
  migrarComprasLegacyLocalStorage
} from '../lib/offlineService';
import {
  sincronizarColaHttp,
  refrescarCacheLecturas,
  contarEscriturasConEstado,
  reintentarColaHttpFallida,
  descartarColaHttpFallida,
  obtenerResumenPendientesLocales,
  anunciarResumenSync,
  type LineaResumenSync
} from '../lib/syncService';
import { useAuth } from './AuthContext';

interface SyncOptions {
  manual?: boolean;
}

interface ConnectionContextType {
  modoCampo: boolean;
  setModoCampo: (val: boolean) => void;
  toggleModoCampo: () => void;
  isOnline: boolean;
  isRealOnline: boolean;
  syncing: boolean;
  authRequired: boolean;
  conteoPendienteTotal: number;
  conteoFallidosTotal: number;
  checkRealOnline: () => Promise<boolean>;
  actualizarConteo: () => Promise<number>;
  sincronizarTodo: (fincaId: string, options?: SyncOptions) => Promise<{ procesados: number; errores: number }>;
  reintentarFallidos: () => Promise<void>;
  descartarFallidos: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextType>({
  modoCampo: false,
  setModoCampo: () => {},
  toggleModoCampo: () => {},
  isOnline: true,
  isRealOnline: true,
  syncing: false,
  authRequired: false,
  conteoPendienteTotal: 0,
  conteoFallidosTotal: 0,
  checkRealOnline: async () => true,
  actualizarConteo: async () => 0,
  sincronizarTodo: async () => ({ procesados: 0, errores: 0 }),
  reintentarFallidos: async () => {},
  descartarFallidos: async () => {},
});

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Modo Campo forzado: se guarda en localStorage para no perderse si se recarga la app en el potrero
  const [modoCampo, setModoCampoState] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.location.pathname === '/login') {
        localStorage.removeItem('agrogestion_modo_campo');
        return false;
      }
      return localStorage.getItem('agrogestion_modo_campo') === 'true';
    } catch {
      return false;
    }
  });

  // Estado verificado por ping activo
  const [isRealOnline, setIsRealOnline] = useState<boolean>(navigator.onLine);
  const [conteoPendienteTotal, setConteoPendienteTotal] = useState<number>(0);
  const [conteoFallidosTotal, setConteoFallidosTotal] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [authRequired, setAuthRequired] = useState<boolean>(false);

  // 2. Ping ultrarrápido a Supabase para verificar si la red realmente transmite datos (rechaza portales cautivos HTML)
  const checkRealOnline = useCallback(async (): Promise<boolean> => {
    if (localStorage.getItem('agrogestion_modo_campo') === 'true') {
      setIsRealOnline(false);
      return false;
    }
    if (!navigator.onLine) {
      setIsRealOnline(false);
      setConexionDegradada(true);
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      // Ping directo (fuera de la capa offline) para que una copia guardada nunca simule que hay internet
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${base}/auth/v1/health`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const online = res.ok && !contentType.includes('text/html');
      setIsRealOnline(online);
      setConexionDegradada(!online);
      return online;
    } catch {
      setIsRealOnline(false);
      setConexionDegradada(true);
      return false;
    }
  }, []);

  // 3. Modificador de Modo Campo
  const setModoCampo = (val: boolean) => {
    setModoCampoState(val);
    try {
      localStorage.setItem('agrogestion_modo_campo', String(val));
    } catch (e) {
      console.error('Error guardando agrogestion_modo_campo:', e);
    }
    if (val) {
      // Si se activa Modo Campo, se asume desconectado de inmediato
      setIsRealOnline(false);
      supabase.auth.stopAutoRefresh();
    } else {
      // Si se desactiva, comprobar si hay internet real
      supabase.auth.startAutoRefresh();
      checkRealOnline();
    }
  };

  const toggleModoCampo = () => {
    setModoCampo(!modoCampo);
  };

  // 4. Estado efectivo de conexión (isOnline):
  // Si Modo Campo está activado, la app es 100% OFFLINE para todas las pantallas
  const isOnline = !modoCampo && isRealOnline;

  // 5. Escuchar cambios de conectividad del navegador y red degradada
  useEffect(() => {
    if (modoCampo) supabase.auth.stopAutoRefresh();
    const handleOnline = async () => {
      if (!modoCampo) {
        await checkRealOnline();
      }
    };

    const handleOffline = () => {
      setIsRealOnline(false);
      setConexionDegradada(true);
    };

    const handleNetworkStatus = (e: any) => {
      const degradada = Boolean(e.detail?.degradada);
      if (degradada) {
        setIsRealOnline(false);
      } else if (!modoCampo) {
        setIsRealOnline(true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-network-status', handleNetworkStatus);

    // Verificación inicial de conectividad real si no está en modo campo
    if (!modoCampo) {
      checkRealOnline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-network-status', handleNetworkStatus);
    };
  }, [modoCampo, checkRealOnline]);

  // Si la red se marcó como degradada pero el navegador dice que hay conexión física (1 rayita),
  // revisar periódicamente (cada 20s) si ya volvió internet real para recuperar el modo online
  useEffect(() => {
    if (modoCampo || isRealOnline) return;
    const interval = setInterval(() => {
      if (navigator.onLine) {
        checkRealOnline();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [modoCampo, isRealOnline, checkRealOnline]);

  const { user, fincaId: fincaIdAuth } = useAuth();

  // Normalizar colas atascadas en 'syncing' y migrar compras legacy al iniciar/cambiar finca
  useEffect(() => {
    normalizarColasAtascadas().catch(() => {});
  }, []);

  useEffect(() => {
    if (fincaIdAuth) {
      migrarComprasLegacyLocalStorage(fincaIdAuth).catch(() => {});
    }
  }, [fincaIdAuth]);

  // 6. Conteo unificado separado en pendientes (reintentables) vs fallidos (requieren acción del usuario)
  const actualizarConteo = useCallback(async (): Promise<number> => {
    let pending = 0;
    let failed = 0;
    try {
      const [httpCounts, dedicatedCounts] = await Promise.all([
        contarEscriturasConEstado(),
        contarColasOfflineDedicadas()
      ]);
      pending = httpCounts.pending + dedicatedCounts.pending;
      failed = httpCounts.failed + dedicatedCounts.failed;
    } catch (e) {
      console.warn('Error al calcular conteo pendiente offline:', e);
    }

    setConteoPendienteTotal(pending);
    setConteoFallidosTotal(failed);
    return pending;
  }, []);

  useEffect(() => {
    actualizarConteo();
    const handleQueueChange = () => { actualizarConteo(); };
    window.addEventListener('offline-queue-changed', handleQueueChange);
    const interval = setInterval(actualizarConteo, 20000);

    return () => {
      window.removeEventListener('offline-queue-changed', handleQueueChange);
      clearInterval(interval);
    };
  }, [actualizarConteo]);

  // 7. Sincronizar todas las colas pendientes con mutex coalescente
  const syncingRef = useRef(false);
  const syncInFlightRef = useRef<Promise<{ procesados: number; errores: number }> | null>(null);
  const resyncRequestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setModoCampoState(false);
      setAuthRequired(false);
      try { localStorage.removeItem('agrogestion_modo_campo'); } catch {}
    }
  }, [user]);

  useEffect(() => {
    const onAuthReq = () => setAuthRequired(true);
    window.addEventListener('offline-auth-required', onAuthReq);
    return () => window.removeEventListener('offline-auth-required', onAuthReq);
  }, []);

  const ejecutarSincronizacion = useCallback(async (
    fincaId: string,
    options?: SyncOptions
  ): Promise<{ procesados: number; errores: number }> => {
    const manual = Boolean(options?.manual);
    const modoCampoActual = (() => {
      try { return localStorage.getItem('agrogestion_modo_campo') === 'true'; } catch { return false; }
    })();

    let onlineAhora = navigator.onLine && !modoCampoActual && isRealOnline;
    if (manual && !modoCampoActual && navigator.onLine && !onlineAhora) {
      onlineAhora = await checkRealOnline();
    }

    if (!onlineAhora) {
      if (manual) {
        const pendInfo = await obtenerResumenPendientesLocales();
        anunciarResumenSync({
          fecha: new Date().toISOString(),
          lineas: [],
          exitosos: 0,
          fallidos: 0,
          errores: [],
          pendientesLineas: pendInfo.lineas,
          pendientesTotal: pendInfo.total,
          bloqueoMotivo: modoCampoActual
            ? 'Tienes el Modo Campo (Forzado) activado. Desactívalo en la barra superior para subir estos registros.'
            : 'El celular no tiene conexión real a internet en este momento. Tus registros están seguros en la memoria local.'
        });
      }
      return { procesados: 0, errores: 0 };
    }

    setConexionDegradada(false);

    if (syncInFlightRef.current) {
      resyncRequestedRef.current = fincaId;
      return syncInFlightRef.current;
    }

    const promesa = (async () => {
      syncingRef.current = true;
      setSyncing(true);
      let totalProcesados = 0;
      let totalErrores = 0;

      try {
        const lineas: LineaResumenSync[] = [];
        const mensajesError: string[] = [];

        // a) Colas dedicadas (compras y registros legacy pendientes de cualquier finca)
        const r1 = await procesarSincronizacionOffline(fincaId);
        totalProcesados += r1.procesados;
        totalErrores += r1.errores;
        if (r1.pesajes) lineas.push({ etiqueta: 'Creados · pesajes', cantidad: r1.pesajes, ok: true });
        if (r1.aforos) lineas.push({ etiqueta: 'Creados · aforos', cantidad: r1.aforos, ok: true });
        if (r1.compras) lineas.push({ etiqueta: 'Creados · lotes de compra', cantidad: r1.compras, ok: true });
        if (r1.ventas) lineas.push({ etiqueta: 'Procesadas · ventas', cantidad: r1.ventas, ok: true });
        if (r1.errores) lineas.push({ etiqueta: 'Registros offline con error', cantidad: r1.errores, ok: false });
        if (r1.mensajesError?.length) mensajesError.push(...r1.mensajesError);

        // b) Cola HTTP unificada (lluvias, pesajes, aforos, rotaciones, movimientos, ventas, inventario, etc.)
        const r2 = await sincronizarColaHttp();
        totalProcesados += r2.procesados;
        totalErrores += r2.errores;
        lineas.push(...r2.lineas);
        mensajesError.push(...r2.mensajesError);

        const necesitaReauth = Boolean(r2.authRequired || r1.authRequired);
        if (necesitaReauth) {
          setAuthRequired(true);
        } else if (totalProcesados > 0) {
          setAuthRequired(false);
        }

        // c) Solo refrescar caché de la nube cuando ya no queden pendientes locales por subir
        const pendientesRestantes = await actualizarConteo();
        if (totalProcesados > 0) {
          if (pendientesRestantes === 0) {
            if (fincaId) await sincronizarCacheFinca(fincaId);
            await refrescarCacheLecturas(50);
          }
          window.dispatchEvent(new CustomEvent('offline-sync-completed', {
            detail: { fincaId, procesados: totalProcesados, errores: totalErrores }
          }));
        }

        if (totalProcesados > 0 || totalErrores > 0) {
          const pendInfo = pendientesRestantes > 0 ? await obtenerResumenPendientesLocales() : { total: 0, lineas: [] };
          anunciarResumenSync({
            fecha: new Date().toISOString(),
            lineas,
            exitosos: totalProcesados,
            fallidos: totalErrores,
            errores: mensajesError,
            pendientesLineas: pendInfo.lineas,
            pendientesTotal: pendInfo.total,
            bloqueoMotivo: r2.bloqueoMotivo,
            authRequired: necesitaReauth
          });
        } else if (manual && (pendientesRestantes > 0 || necesitaReauth)) {
          const pendInfo = await obtenerResumenPendientesLocales();
          anunciarResumenSync({
            fecha: new Date().toISOString(),
            lineas: [],
            exitosos: 0,
            fallidos: 0,
            errores: [],
            pendientesLineas: pendInfo.lineas,
            pendientesTotal: pendInfo.total,
            bloqueoMotivo: r2.bloqueoMotivo || 'Algunos registros no pudieron subirse todavía.',
            authRequired: necesitaReauth
          });
        }
        return { procesados: totalProcesados, errores: totalErrores };
      } catch (e) {
        console.error('Error al sincronizar todo:', e);
        return { procesados: totalProcesados, errores: Math.max(1, totalErrores) };
      } finally {
        syncingRef.current = false;
        setSyncing(false);
        syncInFlightRef.current = null;
      }
    })();

    syncInFlightRef.current = promesa;
    const resultado = await promesa;

    // Si durante el vuelo se pidió otra pasada (p.ej. usuario guardó algo o pulsó sincronizar), ejecutar una pasada limpia
    const pendingFinca = resyncRequestedRef.current;
    if (pendingFinca !== null) {
      resyncRequestedRef.current = null;
      const pend = await actualizarConteo();
      if (pend > 0) {
        await ejecutarSincronizacion(pendingFinca);
      }
    }

    return resultado;
  }, [isRealOnline, actualizarConteo, checkRealOnline]);

  const sincronizarTodo = ejecutarSincronizacion;

  const sincronizarRef = useRef(sincronizarTodo);
  sincronizarRef.current = sincronizarTodo;

  const reintentarFallidos = useCallback(async () => {
    await Promise.all([
      reintentarColaHttpFallida(),
      reintentarColasOfflineFallidas(fincaIdAuth || undefined)
    ]);
    await actualizarConteo();
    const modoCampoActual = (() => {
      try { return localStorage.getItem('agrogestion_modo_campo') === 'true'; } catch { return false; }
    })();
    if (!modoCampoActual && navigator.onLine) {
      const ok = isRealOnline || await checkRealOnline();
      if (ok) {
        await sincronizarRef.current(fincaIdAuth || '');
      }
    }
  }, [fincaIdAuth, actualizarConteo, isRealOnline, checkRealOnline]);

  const descartarFallidos = useCallback(async () => {
    await Promise.all([
      descartarColaHttpFallida(),
      descartarColasOfflineFallidas(fincaIdAuth || undefined)
    ]);
    await actualizarConteo();
  }, [fincaIdAuth, actualizarConteo]);

  // Sincronización automática: al recuperar la conexión (o salir de Modo Campo) y solo mientras haya pendientes reintentables
  useEffect(() => {
    if (!isOnline) return;

    const intentar = async () => {
      if (syncingRef.current) return;
      try {
        const totalPendientes = await actualizarConteo();
        if (totalPendientes > 0) {
          await sincronizarRef.current(fincaIdAuth || '');
        }
      } catch (e) {
        console.warn('[AutoSync] Error:', e);
      }
    };

    const t = setTimeout(intentar, 1500);
    const interval = setInterval(intentar, 30000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [isOnline, fincaIdAuth, actualizarConteo]);

  // 8. Auto-precarga silenciosa en segundo plano:
  // Se ejecuta con pausa de 8s para dejar libre la red a la pantalla actual y guarda marca de tiempo
  // en localStorage (máximo cada 30 min) solo si no hay pendientes sin subir.
  const precargandoRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user || !fincaIdAuth || !isOnline || precargandoRef.current) return;

    const stampKey = `agrogestion_last_precache_${fincaIdAuth}`;
    const ultimo = Number(localStorage.getItem(stampKey) || '0');
    if (Date.now() - ultimo < 30 * 60 * 1000) return;

    const timer = setTimeout(async () => {
      if (precargandoRef.current || syncingRef.current || !isOnline || localStorage.getItem('agrogestion_modo_campo') === 'true') return;
      const pend = await actualizarConteo();
      if (pend > 0) return;

      precargandoRef.current = true;
      try {
        await sincronizarCacheFinca(fincaIdAuth);
        try { localStorage.setItem(stampKey, String(Date.now())); } catch {}
      } catch (e) {
        console.warn('[AutoPrecache] Descarga silenciosa omitida:', e);
      } finally {
        precargandoRef.current = false;
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, [user, fincaIdAuth, isOnline, actualizarConteo]);

  return (
    <ConnectionContext.Provider
      value={{
        modoCampo,
        setModoCampo,
        toggleModoCampo,
        isOnline,
        isRealOnline,
        syncing: Boolean(syncing),
        authRequired,
        conteoPendienteTotal,
        conteoFallidosTotal,
        checkRealOnline,
        actualizarConteo,
        sincronizarTodo,
        reintentarFallidos,
        descartarFallidos
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = () => useContext(ConnectionContext);
