import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    limpiarCacheLecturas,
    leerSesionLocalSupabase,
    guardarBackupSesionLocal,
    limpiarBackupSesionLocal,
    isModoCampoActivo,
    isConexionDegradada
} from '../lib/httpOffline';
import type { Session, User } from '@supabase/supabase-js';
import type { ModoGanancia } from '../utils/ganancia';

export type UserRole = 'administrador' | 'vaquero' | 'observador' | null;
export type TipoLicencia = 'demo' | 'finca' | 'premium';

export const isLicenciaExpirada = (licencia: TipoLicencia, fechaVencimiento: string | null): boolean => {
    if (licencia === 'demo' || !fechaVencimiento) return false;
    const vencTimestamp = new Date(fechaVencimiento.includes('T') ? fechaVencimiento : fechaVencimiento + 'T23:59:59').getTime();
    return !isNaN(vencTimestamp) && vencTimestamp < Date.now();
};

export interface LicenciaInfo {
    licencia: TipoLicencia;
    limiteAnimales: number;
    totalAnimalesOrganizacion: number;
    fechaInicioLicencia: string | null;
    fechaVencimientoLicencia: string | null;
    organizacionNombre: string | null;
    organizacionId: string | null;
    isVencida: boolean;
    isSobrecupo: boolean;
    isBloqueada: boolean;
}

interface UserFinca {
    id_finca: string;
    nombre_finca: string;
    rol: UserRole;
}

interface UserProfile {
    nombre: string | null;
    apellido: string | null;
}

interface AuthState {
    user: User | null;
    session: Session | null;
    role: UserRole;
    fincaId: string | null;
    userFincas: UserFinca[];
    profile: UserProfile | null;
    isSuperAdmin: boolean;
    licenciaInfo: LicenciaInfo;
    loading: boolean;
    modoGanancia: ModoGanancia;
    setModoGanancia: (modo: ModoGanancia) => void;
    signOut: () => Promise<void>;
    setFincaId: (id: string) => void;
    refreshFincas: () => Promise<void>;
    refreshLicencia: () => Promise<void>;
}

const defaultLicenciaInfo: LicenciaInfo = {
    licencia: 'demo',
    limiteAnimales: 40,
    totalAnimalesOrganizacion: 0,
    fechaInicioLicencia: null,
    fechaVencimientoLicencia: null,
    organizacionNombre: null,
    organizacionId: null,
    isVencida: false,
    isSobrecupo: false,
    isBloqueada: false
};

// Claves de caché local para arrancar al instante (se validan contra el id del usuario)
const CACHE_USER_ID = 'agrogestion_cached_user_id';
const CACHE_USER_OBJ = 'agrogestion_cached_user_obj';
const CACHE_LICENCIA = 'agrogestion_cached_licencia';
const CACHE_EXTRA = 'agrogestion_cached_extra';

const leerJSON = <T,>(key: string): T | null => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
};

const guardarJSON = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento lleno */ }
};

/** Solo actualiza el estado si el contenido cambió: evita que las pantallas vuelvan a pedir datos. */
const siCambio = <T,>(nuevo: T) => (prev: T): T =>
    JSON.stringify(prev) === JSON.stringify(nuevo) ? prev : nuevo;

/**
 * Hidratación síncrona en 0.0 milisegundos desde localStorage.
 * Si el celular ya tenía sesión y finca guardadas, la app entra DIRECTO sin pasar por "Cargando...".
 */
const leerEstadoInicialSincrono = () => {
    try {
        const sesionLocal = leerSesionLocalSupabase();
        const userLocal: User | null = sesionLocal?.user || leerJSON<User>(CACHE_USER_OBJ);
        if (!userLocal?.id) return null;

        const cachedUid = localStorage.getItem(CACHE_USER_ID);
        if (cachedUid && cachedUid !== userLocal.id) return null;

        const fincas = leerJSON<UserFinca[]>('agrogestion_cached_user_fincas');
        const savedFincaId = localStorage.getItem('lastFincaId') || localStorage.getItem('agrogestion_cached_finca_id');
        if (!fincas || fincas.length === 0) return null;
        const finca = fincas.find(f => f.id_finca === savedFincaId) || fincas[0];

        const perfil = leerJSON<UserProfile>('agrogestion_cached_profile');
        const licRaw = leerJSON<LicenciaInfo>(CACHE_LICENCIA);
        let lic = defaultLicenciaInfo;
        if (licRaw) {
            const isVencida = isLicenciaExpirada(licRaw.licencia, licRaw.fechaVencimientoLicencia);
            lic = { ...licRaw, isVencida, isBloqueada: isVencida || licRaw.isSobrecupo };
        }
        const extra = leerJSON<{ modoGanancia?: ModoGanancia; isSuperAdmin?: boolean }>(CACHE_EXTRA);

        return {
            user: userLocal,
            session: (sesionLocal as Session) || null,
            role: finca.rol,
            fincaId: finca.id_finca,
            userFincas: fincas,
            profile: perfil || null,
            isSuperAdmin: Boolean(extra?.isSuperAdmin),
            licenciaInfo: lic,
            modoGanancia: (extra?.modoGanancia || 'GMP') as ModoGanancia
        };
    } catch {
        return null;
    }
};

const AuthContext = createContext<AuthState>({
    user: null,
    session: null,
    role: null,
    fincaId: null,
    userFincas: [],
    profile: null,
    isSuperAdmin: false,
    licenciaInfo: defaultLicenciaInfo,
    loading: true,
    modoGanancia: 'GMP',
    setModoGanancia: () => {},
    signOut: async () => { },
    setFincaId: () => { },
    refreshFincas: async () => { },
    refreshLicencia: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const inicial = useMemo(() => leerEstadoInicialSincrono(), []);

    const [user, setUser] = useState<User | null>(inicial?.user ?? null);
    const [session, setSession] = useState<Session | null>(inicial?.session ?? null);
    const [role, setRole] = useState<UserRole>(inicial?.role ?? null);
    const [fincaId, setFincaId] = useState<string | null>(inicial?.fincaId ?? null);
    const [userFincas, setUserFincas] = useState<UserFinca[]>(inicial?.userFincas ?? []);
    const [profile, setProfile] = useState<UserProfile | null>(inicial?.profile ?? null);
    const [isSuperAdmin, setIsSuperAdmin] = useState(inicial?.isSuperAdmin ?? false);
    const [licenciaInfo, setLicenciaInfo] = useState<LicenciaInfo>(inicial?.licenciaInfo ?? defaultLicenciaInfo);
    const [modoGanancia, setModoGanancia] = useState<ModoGanancia>(inicial?.modoGanancia ?? 'GMP');
    // Si ya había datos en el teléfono, loading arranca en FALSE desde el milisegundo cero (0 pantalla negra)
    const [loading, setLoading] = useState<boolean>(!inicial);
    // Usuario cuyos datos ya se cargaron: evita descargarlos otra vez en cada renovación de token
    const usuarioCargadoRef = useRef<string | null>(inicial?.user?.id ?? null);
    const cerrandoSesionManualRef = useRef<boolean>(false);

    useEffect(() => {
        let activo = true;

        // Seguro anti-bloqueo (Watchdog de 1.5s): jamás permitir que la pantalla se quede en "Cargando..."
        const watchdog = setTimeout(() => {
            if (activo) setLoading(false);
        }, 1500);

        // Si arrancamos desde caché instantánea, refrescar datos en segundo plano sin bloquear la UI
        if (inicial?.user?.id) {
            void fetchUserData(inicial.user.id);
        }

        const procesarSesion = (newSession: Session | null, event?: string) => {
            if (!activo) return;
            if (newSession?.user) {
                cerrandoSesionManualRef.current = false;
                guardarBackupSesionLocal(newSession);
                guardarJSON(CACHE_USER_OBJ, newSession.user);
                setSession(newSession);
                setUser(prev => (prev && prev.id === newSession.user.id ? prev : newSession.user));
                const uid = newSession.user.id;
                if (usuarioCargadoRef.current === uid) {
                    setLoading(false);
                    return;
                }
                usuarioCargadoRef.current = uid;
                if (restaurarDesdeCache(uid)) setLoading(false);
                void fetchUserData(uid);
            } else {
                // PROTECCIÓN CRÍTICA DE POTRERO:
                // Si no hay señal (o el fallo de red impidió refrescar el token) y el usuario NO cerró sesión manualmente,
                // NUNCA expulsar al usuario ni borrar sus datos en medio del campo.
                const respaldo = leerEstadoInicialSincrono();
                const sinSenal = (typeof navigator !== 'undefined' && !navigator.onLine) || isModoCampoActivo() || isConexionDegradada();
                if (!cerrandoSesionManualRef.current && respaldo && (sinSenal || event !== 'SIGNED_OUT')) {
                    setUser(prev => prev ?? respaldo.user);
                    setFincaId(prev => prev ?? respaldo.fincaId);
                    setRole(prev => prev ?? respaldo.role);
                    setUserFincas(prev => (prev.length > 0 ? prev : respaldo.userFincas));
                    setLoading(false);
                    return;
                }

                usuarioCargadoRef.current = null;
                setSession(null);
                setUser(null);
                setRole(null);
                setFincaId(null);
                setUserFincas([]);
                setProfile(null);
                setIsSuperAdmin(false);
                setLicenciaInfo(defaultLicenciaInfo);
                try { localStorage.removeItem('agrogestion_modo_campo'); } catch {}
                setLoading(false);
            }
        };

        // Doble garantía: getSession() resuelve en segundo plano
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (!usuarioCargadoRef.current && s?.user) {
                procesarSesion(s);
            } else if (!s) {
                procesarSesion(null, 'INITIAL_SESSION');
            } else {
                setLoading(false);
            }
        }).catch(() => {
            if (activo) setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, s) => {
                setTimeout(() => {
                    procesarSesion(s, event);
                }, 0);
            }
        );

        // Si al volver del potrero una petición detecta JWT expirado, renovarlo en silencio
        const handleJwtExpired = () => {
            if (!isModoCampoActivo() && navigator.onLine) {
                supabase.auth.refreshSession().catch(() => {});
            }
        };
        window.addEventListener('offline-jwt-expired', handleJwtExpired);

        return () => {
            activo = false;
            clearTimeout(watchdog);
            subscription.unsubscribe();
            window.removeEventListener('offline-jwt-expired', handleJwtExpired);
        };
    }, []);

    /** Restaura el estado guardado SOLO si pertenece al mismo usuario. Devuelve true si se pudo. */
    const restaurarDesdeCache = (userId: string): boolean => {
        if (localStorage.getItem(CACHE_USER_ID) !== userId) return false;
        const fincas = leerJSON<UserFinca[]>('agrogestion_cached_user_fincas');
        const savedFincaId = localStorage.getItem('lastFincaId') || localStorage.getItem('agrogestion_cached_finca_id');
        if (!fincas || fincas.length === 0 || !savedFincaId) return false;
        const finca = fincas.find(f => f.id_finca === savedFincaId) || fincas[0];

        setUserFincas(siCambio(fincas));
        setFincaId(finca.id_finca);
        setRole(finca.rol);
        const perfil = leerJSON<UserProfile>('agrogestion_cached_profile');
        if (perfil) setProfile(siCambio<UserProfile | null>(perfil));
        const lic = leerJSON<LicenciaInfo>(CACHE_LICENCIA);
        if (lic) {
            // Recalcular vencimiento con la fecha de hoy (la caché puede ser de días atrás)
            const isVencida = isLicenciaExpirada(lic.licencia, lic.fechaVencimientoLicencia);
            setLicenciaInfo(siCambio({ ...lic, isVencida, isBloqueada: isVencida || lic.isSobrecupo }));
        }
        const extra = leerJSON<{ modoGanancia?: ModoGanancia; isSuperAdmin?: boolean }>(CACHE_EXTRA);
        if (extra?.modoGanancia) setModoGanancia(extra.modoGanancia);
        if (extra?.isSuperAdmin !== undefined) setIsSuperAdmin(extra.isSuperAdmin);
        return true;
    };

    const fetchLicenciaData = async (targetFincaId: string) => {
        try {
            const { data: fincaData } = await supabase
                .from('fincas')
                .select('id_organizacion, organizaciones ( id, nombre, licencia, limite_animales, fecha_inicio_licencia, fecha_vencimiento_licencia )')
                .eq('id', targetFincaId)
                .single();

            if (fincaData?.organizaciones) {
                const org: any = fincaData.organizaciones;
                const orgId = org.id;

                // Conteo de animales activos de TODA la organización en una sola consulta (join con fincas)
                const { count } = await supabase
                    .from('animales')
                    .select('id, fincas!inner(id_organizacion)', { count: 'exact', head: true })
                    .eq('fincas.id_organizacion', orgId)
                    .eq('estado', 'activo');
                const animalCount = count || 0;

                const lic = (org.licencia as TipoLicencia) || 'demo';
                const limite = org.limite_animales ?? 40;
                const fechaVenc = org.fecha_vencimiento_licencia || null;
                const isVencida = isLicenciaExpirada(lic, fechaVenc);
                const isSobrecupo = animalCount > limite;
                const isBloqueada = isVencida || isSobrecupo;

                const info: LicenciaInfo = {
                    licencia: lic,
                    limiteAnimales: limite,
                    totalAnimalesOrganizacion: animalCount,
                    fechaInicioLicencia: org.fecha_inicio_licencia || null,
                    fechaVencimientoLicencia: fechaVenc,
                    organizacionNombre: org.nombre || null,
                    organizacionId: orgId || null,
                    isVencida,
                    isSobrecupo,
                    isBloqueada
                };
                setLicenciaInfo(siCambio(info));
                guardarJSON(CACHE_LICENCIA, info);
            }
        } catch (err) {
            console.error("Error cargando licencia:", err);
        }
    };

    const fetchUserData = async (userId: string) => {
        try {
            // 1. Verificamos Rol(es) y Finca(s) — necesario primero para obtener fincaId
            const { data: permisos, error: roleError } = await supabase
                .from('permisos_finca')
                .select(`
                    id_finca,
                    rol,
                    fincas ( nombre )
                `)
                .eq('id_usuario', userId);

            if (roleError) {
                console.warn("Fallo de red al obtener permisos de finca en Supabase. Usando caché offline:", roleError);
                // Fallback Offline desde localStorage
                const cachedFincasRaw = localStorage.getItem('agrogestion_cached_user_fincas');
                const cachedFincaId = localStorage.getItem('lastFincaId') || localStorage.getItem('agrogestion_cached_finca_id');
                const cachedRole = (localStorage.getItem('agrogestion_cached_role') as UserRole) || 'administrador';
                const cachedProfileRaw = localStorage.getItem('agrogestion_cached_profile');

                if (cachedFincasRaw) {
                    try { setUserFincas(siCambio(JSON.parse(cachedFincasRaw))); } catch {}
                }
                if (cachedFincaId) {
                    setFincaId(cachedFincaId);
                }
                if (cachedRole) {
                    setRole(cachedRole);
                }
                if (cachedProfileRaw) {
                    try { setProfile(JSON.parse(cachedProfileRaw)); } catch {}
                }
                const lic = leerJSON<LicenciaInfo>(CACHE_LICENCIA);
                if (lic) setLicenciaInfo(siCambio(lic));
            } else if (permisos && permisos.length > 0) {
                const mappedFincas: UserFinca[] = permisos.map((p: any) => ({
                    id_finca: p.id_finca,
                    nombre_finca: p.fincas.nombre,
                    rol: p.rol as UserRole
                }));

                setUserFincas(siCambio(mappedFincas));
                localStorage.setItem('agrogestion_cached_user_fincas', JSON.stringify(mappedFincas));

                const savedFincaId = localStorage.getItem('lastFincaId');
                const validFinca = mappedFincas.find(f => f.id_finca === savedFincaId) || mappedFincas[0];

                setFincaId(validFinca.id_finca);
                setRole(validFinca.rol);
                localStorage.setItem('lastFincaId', validFinca.id_finca);
                localStorage.setItem('agrogestion_cached_finca_id', validFinca.id_finca);
                localStorage.setItem('agrogestion_cached_role', validFinca.rol || '');
                localStorage.setItem(CACHE_USER_ID, userId);

                // Con finca y rol ya definidos la app se puede mostrar: no esperar licencia/perfil/KPI
                setLoading(false);

                // 2. Con el fincaId ya disponible, lanzar en paralelo (en segundo plano):
                //    - Datos de licencia
                //    - Modo de ganancia (configuracion_kpi)
                //    - Perfil del usuario
                //    - Verificación de superadmin
                const [kpiRes, perfilRes, adminRes] = await Promise.all([
                    supabase
                        .from('configuracion_kpi')
                        .select('modo_ganancia')
                        .eq('id_finca', validFinca.id_finca)
                        .single(),
                    supabase
                        .from('perfiles')
                        .select('nombre, apellido')
                        .eq('id', userId)
                        .single(),
                    supabase
                        .from('superadmins')
                        .select('id_usuario')
                        .eq('id_usuario', userId)
                        .maybeSingle(),
                    // Licencia corre en paralelo también (no depende de los otros)
                    fetchLicenciaData(validFinca.id_finca)
                ]);

                if (kpiRes.data?.modo_ganancia) {
                    setModoGanancia(kpiRes.data.modo_ganancia as ModoGanancia);
                }

                if (perfilRes.data) {
                    const perfil = {
                        nombre: perfilRes.data.nombre,
                        apellido: perfilRes.data.apellido
                    };
                    setProfile(siCambio<UserProfile | null>(perfil));
                    localStorage.setItem('agrogestion_cached_profile', JSON.stringify(perfil));
                }

                // Solo actualizar si la consulta respondió bien (sin señal no se pierde el estado guardado)
                if (!adminRes.error) setIsSuperAdmin(!!adminRes.data);
                guardarJSON(CACHE_EXTRA, {
                    modoGanancia: (kpiRes.data?.modo_ganancia as ModoGanancia) || leerJSON<any>(CACHE_EXTRA)?.modoGanancia,
                    isSuperAdmin: adminRes.error ? leerJSON<any>(CACHE_EXTRA)?.isSuperAdmin : !!adminRes.data
                });
            }

        } catch (err) {
            console.warn("Error en fetchUserData, restaurando estado offline de respaldo:", err);
            const cachedFincasRaw = localStorage.getItem('agrogestion_cached_user_fincas');
            const cachedFincaId = localStorage.getItem('lastFincaId') || localStorage.getItem('agrogestion_cached_finca_id');
            const cachedRole = (localStorage.getItem('agrogestion_cached_role') as UserRole) || 'administrador';
            const cachedProfileRaw = localStorage.getItem('agrogestion_cached_profile');

            if (cachedFincasRaw) {
                try { setUserFincas(siCambio(JSON.parse(cachedFincasRaw))); } catch {}
            }
            if (cachedFincaId) setFincaId(cachedFincaId);
            if (cachedRole) setRole(cachedRole);
            if (cachedProfileRaw) {
                try { setProfile(JSON.parse(cachedProfileRaw)); } catch {}
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSetFincaId = (id: string) => {
        const finca = userFincas.find(f => f.id_finca === id);
        if (finca) {
            setFincaId(id);
            setRole(finca.rol);
            localStorage.setItem('lastFincaId', id);
            fetchLicenciaData(id);
        }
    };

    const refreshFincas = async () => {
        if (user) await fetchUserData(user.id);
    };

    const refreshLicencia = async () => {
        if (fincaId) await fetchLicenciaData(fincaId);
    };

    const signOut = async () => {
        cerrandoSesionManualRef.current = true;
        limpiarBackupSesionLocal();
        localStorage.removeItem('lastFincaId');
        localStorage.removeItem(CACHE_USER_ID);
        localStorage.removeItem(CACHE_USER_OBJ);
        try { localStorage.removeItem('agrogestion_modo_campo'); } catch {}
        try { await supabase.auth.signOut(); } catch {}
        await limpiarCacheLecturas();
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            role,
            fincaId,
            userFincas,
            profile,
            isSuperAdmin,
            licenciaInfo,
            loading,
            modoGanancia,
            setModoGanancia,
            signOut,
            setFincaId: handleSetFincaId,
            refreshFincas,
            refreshLicencia
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

