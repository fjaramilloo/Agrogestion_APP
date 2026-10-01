import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<UserRole>(null);
    const [fincaId, setFincaId] = useState<string | null>(null);
    const [userFincas, setUserFincas] = useState<UserFinca[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [licenciaInfo, setLicenciaInfo] = useState<LicenciaInfo>(defaultLicenciaInfo);
    const [modoGanancia, setModoGanancia] = useState<ModoGanancia>('GMP');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserData(session.user.id);
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
                if (session?.user) {
                    fetchUserData(session.user.id);
                } else {
                    setRole(null);
                    setFincaId(null);
                    setUserFincas([]);
                    setProfile(null);
                    setIsSuperAdmin(false);
                    setLicenciaInfo(defaultLicenciaInfo);
                    setLoading(false);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

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

                // Obtener fincas de la org y contar animales activos EN PARALELO
                const { data: orgFincas } = await supabase
                    .from('fincas')
                    .select('id')
                    .eq('id_organizacion', orgId);

                const orgFincaIds = (orgFincas || []).map((f: any) => f.id);
                let animalCount = 0;

                if (orgFincaIds.length > 0) {
                    const { count } = await supabase
                        .from('animales')
                        .select('id', { count: 'exact', head: true })
                        .in('id_finca', orgFincaIds)
                        .eq('estado', 'activo');
                    animalCount = count || 0;
                }

                const lic = (org.licencia as TipoLicencia) || 'demo';
                const limite = org.limite_animales ?? 40;
                const fechaVenc = org.fecha_vencimiento_licencia || null;
                const isVencida = isLicenciaExpirada(lic, fechaVenc);
                const isSobrecupo = animalCount > limite;
                const isBloqueada = isVencida || isSobrecupo;

                setLicenciaInfo({
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
                });
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
                    try { setUserFincas(JSON.parse(cachedFincasRaw)); } catch {}
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
            } else if (permisos && permisos.length > 0) {
                const mappedFincas: UserFinca[] = permisos.map((p: any) => ({
                    id_finca: p.id_finca,
                    nombre_finca: p.fincas.nombre,
                    rol: p.rol as UserRole
                }));

                setUserFincas(mappedFincas);
                localStorage.setItem('agrogestion_cached_user_fincas', JSON.stringify(mappedFincas));

                const savedFincaId = localStorage.getItem('lastFincaId');
                const validFinca = mappedFincas.find(f => f.id_finca === savedFincaId) || mappedFincas[0];

                setFincaId(validFinca.id_finca);
                setRole(validFinca.rol);
                localStorage.setItem('lastFincaId', validFinca.id_finca);
                localStorage.setItem('agrogestion_cached_finca_id', validFinca.id_finca);
                localStorage.setItem('agrogestion_cached_role', validFinca.rol || '');

                // 2. Con el fincaId ya disponible, lanzar en paralelo:
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
                    setProfile({
                        nombre: perfilRes.data.nombre,
                        apellido: perfilRes.data.apellido
                    });
                    localStorage.setItem('agrogestion_cached_profile', JSON.stringify({
                        nombre: perfilRes.data.nombre,
                        apellido: perfilRes.data.apellido
                    }));
                }

                setIsSuperAdmin(!!adminRes.data);
            }

        } catch (err) {
            console.warn("Error en fetchUserData, restaurando estado offline de respaldo:", err);
            const cachedFincasRaw = localStorage.getItem('agrogestion_cached_user_fincas');
            const cachedFincaId = localStorage.getItem('lastFincaId') || localStorage.getItem('agrogestion_cached_finca_id');
            const cachedRole = (localStorage.getItem('agrogestion_cached_role') as UserRole) || 'administrador';
            const cachedProfileRaw = localStorage.getItem('agrogestion_cached_profile');

            if (cachedFincasRaw) {
                try { setUserFincas(JSON.parse(cachedFincasRaw)); } catch {}
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
        await supabase.auth.signOut();
        localStorage.removeItem('lastFincaId');
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

