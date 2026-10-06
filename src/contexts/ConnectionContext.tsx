import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { localDB } from '../lib/db';
import {
  sincronizarCacheFinca,
  procesarSincronizacionOffline
} from '../lib/offlineService';
import {
  sincronizarColaHttp,
  refrescarCacheLecturas,
  contarEscriturasPendientes,
  anunciarResumenSync,
  type LineaResumenSync
} from '../lib/syncService';
import { useAuth } from './AuthContext';

interface ConnectionContextType {
  modoCampo: boolean;
  setModoCampo: (val: boolean) => void;
  toggleModoCampo: () => void;
  isOnline: boolean;
  isRealOnline: boolean;
  syncing: boolean;
  conteoPendienteTotal: number;
  checkRealOnline: () => Promise<boolean>;
  actualizarConteo: () => Promise<number>;
  sincronizarTodo: (fincaId: string) => Promise<{ procesados: number; errores: number }>;
  prepararFincaOffline: (fincaId: string) => Promise<{ success: boolean; animales: number; potreros: number; error?: string }>;
}

const ConnectionContext = createContext<ConnectionContextType>({
  modoCampo: false,
  setModoCampo: () => {},
  toggleModoCampo: () => {},
  isOnline: true,
  isRealOnline: true,
  syncing: false,
  conteoPendienteTotal: 0,
  checkRealOnline: async () => true,
  actualizarConteo: async () => 0,
  sincronizarTodo: async () => ({ procesados: 0, errores: 0 }),
  prepararFincaOffline: async () => ({ success: false, animales: 0, potreros: 0 }),
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
  const [syncing, setSyncing] = useState<boolean>(false);

  // 2. Ping ultrarrápido a Supabase para verificar si la red realmente transmite datos
  const checkRealOnline = useCallback(async (): Promise<boolean> => {
    if (localStorage.getItem('agrogestion_modo_campo') === 'true') {
      setIsRealOnline(false);
      return false;
    }
    if (!navigator.onLine) {
      setIsRealOnline(false);
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      // Ping directo (fuera de la capa offline) para que una copia guardada nunca simule que hay internet
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${base}/auth/v1/health`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const online = res.status < 500;
      setIsRealOnline(online);
      return online;
    } catch {
      setIsRealOnline(false);
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

  // 5. Escuchar cambios de conectividad del navegador
  useEffect(() => {
    if (modoCampo) supabase.auth.stopAutoRefresh();
    const handleOnline = async () => {
      if (!modoCampo) {
        await checkRealOnline();
      }
    };

    const handleOffline = () => {
      setIsRealOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verificación inicial de conectividad real si no está en modo campo
    if (!modoCampo) {
      checkRealOnline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [modoCampo, checkRealOnline]);

  // 6. Conteo unificado de registros pendientes offline (Pesajes, Aforos, Compras, Ventas)
  const actualizarConteo = useCallback(async (): Promise<number> => {
    let total = 0;
    try {
      // Pesajes y aforos de Dexie
      const pesajesCount = await localDB.pesajesOfflineQueue
        .where('status_sync')
        .equals('pending')
        .or('status_sync')
        .equals('failed')
        .count();

      const aforosCount = await localDB.aforosOfflineQueue
        .where('status_sync')
        .equals('pending')
        .or('status_sync')
        .equals('failed')
        .count();

      total += pesajesCount + aforosCount;

      // Cambios genéricos hechos sin conexión (rotaciones, lotes, etc.)
      total += await contarEscriturasPendientes();

      // Compras de localStorage
      const comprasRaw = localStorage.getItem('agrogestion_compras_offline');
      if (comprasRaw) {
        try {
          const compras = JSON.parse(comprasRaw);
          if (Array.isArray(compras)) total += compras.length;
        } catch {}
      }

      // Ventas de localStorage
      const ventasRaw = localStorage.getItem('agrogestion_ventas_offline');
      if (ventasRaw) {
        try {
          const ventas = JSON.parse(ventasRaw);
          if (Array.isArray(ventas)) total += ventas.length;
        } catch {}
      }

      // Aforos legacy en localStorage
      const aforosRaw = localStorage.getItem('agrogestion_aforos_offline');
      if (aforosRaw) {
        try {
          const aforos = JSON.parse(aforosRaw);
          if (Array.isArray(aforos)) total += aforos.length;
        } catch {}
      }
    } catch (e) {
      console.warn('Error al calcular conteo pendiente offline:', e);
    }

    setConteoPendienteTotal(total);
    return total;
  }, []);

  useEffect(() => {
    actualizarConteo();
    const handleQueueChange = () => actualizarConteo();
    window.addEventListener('offline-queue-changed', handleQueueChange);
    const interval = setInterval(actualizarConteo, 20000);

    return () => {
      window.removeEventListener('offline-queue-changed', handleQueueChange);
      clearInterval(interval);
    };
  }, [actualizarConteo]);

  // 7. Sincronizar todas las colas pendientes (Pesajes, Aforos y cualquier cambio hecho sin conexión)
  const { user, fincaId: fincaIdAuth } = useAuth();
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setModoCampoState(false);
      try { localStorage.removeItem('agrogestion_modo_campo'); } catch {}
    }
  }, [user]);

  const sincronizarTodo = async (fincaId: string): Promise<{ procesados: number; errores: number }> => {
    if (!isOnline || syncingRef.current) {
      return { procesados: 0, errores: 0 };
    }

    syncingRef.current = true;
    setSyncing(true);
    try {
      const lineas: LineaResumenSync[] = [];
      const mensajesError: string[] = [];
      let procesados = 0;
      let errores = 0;

      // a) Pesajes y aforos guardados en cola dedicada
      if (fincaId) {
        const r1 = await procesarSincronizacionOffline(fincaId);
        procesados += r1.procesados;
        errores += r1.errores;
        if (r1.pesajes) lineas.push({ etiqueta: 'Creados · pesajes', cantidad: r1.pesajes, ok: true });
        if (r1.aforos) lineas.push({ etiqueta: 'Creados · aforos', cantidad: r1.aforos, ok: true });
        if (r1.errores) lineas.push({ etiqueta: 'Pesajes/aforos con error', cantidad: r1.errores, ok: false });
      }

      // b) Todo lo demás (rotaciones, movimientos de lotes, animales, etc.)
      const r2 = await sincronizarColaHttp();
      procesados += r2.procesados;
      errores += r2.errores;
      lineas.push(...r2.lineas);
      mensajesError.push(...r2.mensajesError);

      // c) Dejar la memoria local al día con lo que ya quedó en la nube
      if (procesados > 0 || errores > 0) {
        await refrescarCacheLecturas();
      }
      if (fincaId) await sincronizarCacheFinca(fincaId);
      await actualizarConteo();

      if (procesados > 0 || errores > 0) {
        anunciarResumenSync({
          fecha: new Date().toISOString(),
          lineas,
          exitosos: procesados,
          fallidos: errores,
          errores: mensajesError
        });
      }
      return { procesados, errores };
    } catch (e) {
      console.error('Error al sincronizar todo:', e);
      return { procesados: 0, errores: 1 };
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  };

  // Sincronización automática: al recuperar la conexión (o salir de Modo Campo) y mientras queden pendientes
  const sincronizarRef = useRef(sincronizarTodo);
  sincronizarRef.current = sincronizarTodo;

  useEffect(() => {
    if (!isOnline) return;

    const intentar = async () => {
      if (syncingRef.current) return;
      try {
        const enCola = await contarEscriturasPendientes();
        const pesajes = await localDB.pesajesOfflineQueue.where('status_sync').anyOf('pending', 'failed').count();
        const aforos = await localDB.aforosOfflineQueue.where('status_sync').anyOf('pending', 'failed').count();
        if (enCola + pesajes + aforos > 0) {
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
  }, [isOnline, fincaIdAuth]);

  // 8. Preparar Finca para el Campo (Descarga completa garantizada para trabajar sin red)
  const prepararFincaOffline = async (fincaId: string): Promise<{ success: boolean; animales: number; potreros: number; error?: string }> => {
    if (!fincaId) return { success: false, animales: 0, potreros: 0, error: 'Finca no seleccionada' };
    
    // Primero verificar si tenemos conexión real
    const tieneRed = await checkRealOnline();
    if (!tieneRed) {
      return { success: false, animales: 0, potreros: 0, error: 'Se requiere conexión a internet para descargar los datos de la finca' };
    }

    try {
      await sincronizarCacheFinca(fincaId);
      // Actualiza también todas las consultas de los módulos ya visitados (rotaciones, lotes, ventas, etc.)
      await refrescarCacheLecturas();
      const animalesCount = await localDB.animalesCache.where('id_finca').equals(fincaId).count();
      const potrerosCount = await localDB.potrerosCache.where('id_finca').equals(fincaId).count();

      return {
        success: true,
        animales: animalesCount,
        potreros: potrerosCount
      };
    } catch (err: any) {
      return {
        success: false,
        animales: 0,
        potreros: 0,
        error: err.message || 'Error al descargar datos'
      };
    }
  };

  return (
    <ConnectionContext.Provider
      value={{
        modoCampo,
        setModoCampo,
        toggleModoCampo,
        isOnline,
        isRealOnline,
        syncing: Boolean(syncing),
        conteoPendienteTotal,
        checkRealOnline,
        actualizarConteo,
        sincronizarTodo,
        prepararFincaOffline
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = () => useContext(ConnectionContext);
