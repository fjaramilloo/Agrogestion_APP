import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import type { ModoGanancia } from '../utils/ganancia';

export type UserRole = 'administrador' | 'vaquero' | 'observador' | null;
export type TipoLicencia = 'demo' | 'finca' | 'premium';

export interface LicenciaInfo {
    licencia: TipoLicencia;
    limiteAnimales: number;
    totalAnimalesOrganizacion: number;
    fechaInicioLicencia: string | null;
    fechaVencimientoLicencia: string | null;
    organizacionNombre: string | null;
    organizacionId: string | null;
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
    organizacionId: null
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

                // Contar animales activos de la organización
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

                setLicenciaInfo({
                    licencia: (org.licencia as TipoLicencia) || 'demo',
                    limiteAnimales: org.limite_animales ?? 40,
                    totalAnimalesOrganizacion: animalCount,
                    fechaInicioLicencia: org.fecha_inicio_licencia || null,
                    fechaVencimientoLicencia: org.fecha_vencimiento_licencia || null,
                    organizacionNombre: org.nombre || null,
                    organizacionId: orgId || null
                });
            }
        } catch (err) {
            console.error("Error cargando licencia:", err);
        }
    };

    const fetchUserData = async (userId: string) => {
        try {
            // 1. Verificamos Rol(es) y Finca(s)
            const { data: permisos, error: roleError } = await supabase
                .from('permisos_finca')
                .select(`
                    id_finca,
                    rol,
                    fincas ( nombre )
                `)
                .eq('id_usuario', userId);

            if (roleError) {
                console.error("Error obteniendo roles:", roleError);
            } else if (permisos && permisos.length > 0) {
                const mappedFincas: UserFinca[] = permisos.map((p: any) => ({
                    id_finca: p.id_finca,
                    nombre_finca: p.fincas.nombre,
                    rol: p.rol as UserRole
                }));

                setUserFincas(mappedFincas);

                const savedFincaId = localStorage.getItem('lastFincaId');
                const validFinca = mappedFincas.find(f => f.id_finca === savedFincaId) || mappedFincas[0];

                setFincaId(validFinca.id_finca);
                setRole(validFinca.rol);

                // Cargar datos de Licencia de la Finca Seleccionada
                await fetchLicenciaData(validFinca.id_finca);

                // Leer modo_ganancia de configuracion_kpi de la finca seleccionada
                const { data: kpiData } = await supabase
                    .from('configuracion_kpi')
                    .select('modo_ganancia')
                    .eq('id_finca', validFinca.id_finca)
                    .single();
                if (kpiData?.modo_ganancia) {
                    setModoGanancia(kpiData.modo_ganancia as ModoGanancia);
                }
            }

            // 2. Verificamos Perfil
            const { data: perfilData } = await supabase
                .from('perfiles')
                .select('nombre, apellido')
                .eq('id', userId)
                .single();
            
            if (perfilData) {
                setProfile({
                    nombre: perfilData.nombre,
                    apellido: perfilData.apellido
                });
            }

            // 3. Verificamos si es superadmin
            const { data: adminData } = await supabase
                .from('superadmins')
                .select('id_usuario')
                .eq('id_usuario', userId)
                .single();

            setIsSuperAdmin(!!adminData);

        } catch (err) {
            console.error(err);
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

