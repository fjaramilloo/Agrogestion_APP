import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Building2, UserPlus, ShieldCheck, MapPin, Users,
    ChevronDown, ChevronUp, BarChart3, Tractor,
    Eye, Wrench, Globe, Trash2, AlertTriangle
} from 'lucide-react';

interface FincaInfo {
    id: string;
    nombre: string;
    animalesActivos: number;
    vaqueros: { id: string; nombre: string }[];
    observadores: { id: string; nombre: string }[];
}

interface CuentaAdmin {
    orgId: string;
    orgNombre: string;
    adminNombre: string;
    fincas: FincaInfo[];
    totalFincas: number;
    totalVaqueros: number;
    totalObservadores: number;
    totalAnimales: number;
}

interface GlobalStats {
    totalOrgs: number;
    totalFincas: number;
    totalAnimales: number;
    totalUsuarios: number;
}

export default function SuperAdmin() {
    const { isSuperAdmin } = useAuth();

    const [activeTab, setActiveTab] = useState<'dashboard' | 'crear'>('dashboard');
    const [cuentas, setCuentas] = useState<CuentaAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
    const [globalStats, setGlobalStats] = useState<GlobalStats>({
        totalOrgs: 0, totalFincas: 0, totalAnimales: 0, totalUsuarios: 0
    });
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'org' | 'finca'; id: string; nombre: string } | null>(null);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [org, setOrg] = useState('');
    const [finca, setFinca] = useState('');
    const [ubicacion, setUbicacion] = useState('');
    const [loadingForm, setLoadingForm] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    useEffect(() => {
        if (isSuperAdmin) fetchDashboardData();
    }, [isSuperAdmin]);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // Fetch orgs, profiles, fincas, permisos in parallel
            const [{ data: orgsData }, { data: perfilesData }, { data: fincasData }, { data: permisosData }] = await Promise.all([
                supabase.from('organizaciones').select('id, nombre, id_dueño'),
                supabase.from('perfiles').select('id, nombre, apellido'),
                supabase.from('fincas').select('id, nombre, id_organizacion'),
                supabase.from('permisos_finca').select('id_finca, id_usuario, rol')
            ]);

            // Get accurate animal counts per finca using pagination to avoid 1000-row limit
            const animalMap: Record<string, number> = {};
            const PAGE_SIZE = 1000;
            let page = 0;
            let keepFetching = true;
            while (keepFetching) {
                const from = page * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;
                const { data: animPage } = await supabase
                    .from('animales')
                    .select('id_finca')
                    .eq('estado', 'activo')
                    .order('id')
                    .range(from, to);
                if (!animPage || animPage.length === 0) { keepFetching = false; break; }
                animPage.forEach((a: any) => {
                    animalMap[a.id_finca] = (animalMap[a.id_finca] || 0) + 1;
                });
                if (animPage.length < PAGE_SIZE) keepFetching = false;
                page++;
            }

            const profileMap: Record<string, string> = {};
            (perfilesData || []).forEach((p: any) => {
                profileMap[p.id] = [p.nombre, p.apellido].filter(Boolean).join(' ');
            });

            type PermEntry = { vaqueros: { id: string; nombre: string }[]; observadores: { id: string; nombre: string }[] };
            const permisosByFinca: Record<string, PermEntry> = {};
            (permisosData || []).forEach((perm: any) => {
                if (!permisosByFinca[perm.id_finca]) {
                    permisosByFinca[perm.id_finca] = { vaqueros: [], observadores: [] };
                }
                if (perm.rol === 'vaquero') {
                    permisosByFinca[perm.id_finca].vaqueros.push({ id: perm.id_usuario, nombre: profileMap[perm.id_usuario] || 'Sin nombre' });
                } else if (perm.rol === 'observador') {
                    permisosByFinca[perm.id_finca].observadores.push({ id: perm.id_usuario, nombre: profileMap[perm.id_usuario] || 'Sin nombre' });
                }
            });

            const cuentasBuilt: CuentaAdmin[] = (orgsData || []).map((o: any) => {
                const fincasOrg: FincaInfo[] = (fincasData || [])
                    .filter((f: any) => f.id_organizacion === o.id)
                    .map((f: any) => ({
                        id: f.id,
                        nombre: f.nombre,
                        animalesActivos: animalMap[f.id] || 0,
                        vaqueros: permisosByFinca[f.id]?.vaqueros || [],
                        observadores: permisosByFinca[f.id]?.observadores || []
                    }));

                const uniqueVaqueros = new Set(fincasOrg.flatMap(f => f.vaqueros.map(v => v.id)));
                const uniqueObservadores = new Set(fincasOrg.flatMap(f => f.observadores.map(ob => ob.id)));

                return {
                    orgId: o.id,
                    orgNombre: o.nombre,
                    adminNombre: profileMap[o['id_dueño']] || 'Sin nombre',
                    fincas: fincasOrg,
                    totalFincas: fincasOrg.length,
                    totalVaqueros: uniqueVaqueros.size,
                    totalObservadores: uniqueObservadores.size,
                    totalAnimales: fincasOrg.reduce((sum, f) => sum + f.animalesActivos, 0)
                };
            });

            setCuentas(cuentasBuilt);

            const allVaqueros = new Set(cuentasBuilt.flatMap(c => c.fincas.flatMap(f => f.vaqueros.map(v => v.id))));
            const allObservadores = new Set(cuentasBuilt.flatMap(c => c.fincas.flatMap(f => f.observadores.map(ob => ob.id))));

            setGlobalStats({
                totalOrgs: cuentasBuilt.length,
                totalFincas: cuentasBuilt.reduce((sum, c) => sum + c.totalFincas, 0),
                totalAnimales: cuentasBuilt.reduce((sum, c) => sum + c.totalAnimales, 0),
                totalUsuarios: allVaqueros.size + allObservadores.size
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteFinca = async (fincaId: string) => {
        setDeletingId(fincaId);
        try {
            // Delete in order: pesajes → animales → potreradas → potreros → permisos → finca
            await supabase.from('registros_pesaje').delete().in('id_animal',
                (await supabase.from('animales').select('id').eq('id_finca', fincaId)).data?.map((a: any) => a.id) || []
            );
            await supabase.from('animales').delete().eq('id_finca', fincaId);
            await supabase.from('potreradas').delete().eq('id_finca', fincaId);
            await supabase.from('potreros').delete().eq('id_finca', fincaId);
            await supabase.from('permisos_finca').delete().eq('id_finca', fincaId);
            await supabase.from('configuracion_kpi').delete().eq('id_finca', fincaId);
            const { error } = await supabase.from('fincas').delete().eq('id', fincaId);
            if (error) throw error;
            setConfirmDelete(null);
            await fetchDashboardData();
        } catch (err: any) {
            alert('Error eliminando finca: ' + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const handleDeleteOrg = async (orgId: string) => {
        setDeletingId(orgId);
        try {
            // Get all fincas of this org
            const { data: fincas } = await supabase.from('fincas').select('id').eq('id_organizacion', orgId);
            const fincaIds = (fincas || []).map((f: any) => f.id);

            for (const fId of fincaIds) {
                const { data: animales } = await supabase.from('animales').select('id').eq('id_finca', fId);
                const animalIds = (animales || []).map((a: any) => a.id);
                if (animalIds.length > 0) {
                    await supabase.from('registros_pesaje').delete().in('id_animal', animalIds);
                }
                await supabase.from('animales').delete().eq('id_finca', fId);
                await supabase.from('potreradas').delete().eq('id_finca', fId);
                await supabase.from('potreros').delete().eq('id_finca', fId);
                await supabase.from('permisos_finca').delete().eq('id_finca', fId);
                await supabase.from('configuracion_kpi').delete().eq('id_finca', fId);
            }

            if (fincaIds.length > 0) {
                await supabase.from('fincas').delete().in('id', fincaIds);
            }
            const { error } = await supabase.from('organizaciones').delete().eq('id', orgId);
            if (error) throw error;
            setConfirmDelete(null);
            setExpandedOrg(null);
            await fetchDashboardData();
        } catch (err: any) {
            alert('Error eliminando organización: ' + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const crearAdministrador = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingForm(true);
        setMsjExito('');
        setMsjError('');
        try {
            if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
            const { error } = await supabase.rpc('crear_dueno_finca', {
                p_email: email, p_password: password,
                p_nombre_organizacion: org, p_nombre_finca: finca, p_ubicacion_finca: ubicacion
            });
            if (error) throw new Error(error.message);
            setMsjExito(`¡Cuenta ${email} creada correctamente!`);
            setEmail(''); setPassword(''); setOrg(''); setFinca(''); setUbicacion('');
            await fetchDashboardData();
            setActiveTab('dashboard');
        } catch (err: any) {
            setMsjError(err.message || 'Error no controlado');
        } finally {
            setLoadingForm(false);
        }
    };

    if (!isSuperAdmin) {
        return (
            <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <ShieldCheck size={48} color="var(--error)" style={{ marginBottom: '16px' }} />
                    <p style={{ color: 'var(--error)', fontWeight: 'bold', fontSize: '1.2rem' }}>Acceso exclusivo para Super Administradores.</p>
                </div>
            </div>
        );
    }

    const statCards = [
        { label: 'Organizaciones', value: globalStats.totalOrgs, Icon: Globe, color: '#a78bfa', bg: 'rgba(124, 58, 237, 0.12)', border: 'rgba(124, 58, 237, 0.3)' },
        { label: 'Fincas Registradas', value: globalStats.totalFincas, Icon: MapPin, color: '#38bdf8', bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.3)' },
        { label: 'Animales Activos', value: globalStats.totalAnimales.toLocaleString('es-CO'), Icon: Tractor, color: 'var(--primary-light)', bg: 'rgba(96, 173, 94, 0.12)', border: 'rgba(96, 173, 94, 0.3)' },
        { label: 'Usuarios', value: globalStats.totalUsuarios, Icon: Users, color: 'var(--secondary)', bg: 'rgba(255, 179, 0, 0.12)', border: 'rgba(255, 179, 0, 0.3)' }
    ];

    return (
        <div className="page-container">
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
                    <div style={{ background: 'rgba(124, 58, 237, 0.15)', border: '1px solid rgba(124, 58, 237, 0.4)', borderRadius: '12px', padding: '10px', display: 'flex' }}>
                        <ShieldCheck size={28} color="#a78bfa" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Consola de Administración
                        </h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Gestión global de cuentas, fincas y usuarios de la plataforma
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '10px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.08)' }}>
                {([['dashboard', BarChart3, 'Visión General'], ['crear', UserPlus, 'Nueva Cuenta']] as [string, any, string][]).map(([tab, Icon, label]) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as 'dashboard' | 'crear')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s ease',
                            background: activeTab === tab ? 'rgba(124, 58, 237, 0.25)' : 'transparent',
                            color: activeTab === tab ? '#a78bfa' : 'var(--text-muted)',
                            boxShadow: activeTab === tab ? '0 0 0 1px rgba(124, 58, 237, 0.4)' : 'none'
                        }}
                    >
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>

            {/* === TAB: DASHBOARD === */}
            {activeTab === 'dashboard' && (
                <>
                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                        {statCards.map((card) => (
                            <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: '10px', padding: '10px', display: 'flex' }}>
                                    <card.Icon size={22} color={card.color} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Accounts Table */}
                    <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Building2 size={18} color="#a78bfa" />
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Cuentas Registradas</h3>
                            <span style={{ marginLeft: 'auto', background: 'rgba(124, 58, 237, 0.2)', color: '#a78bfa', padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                                {cuentas.length} organizaciones
                            </span>
                        </div>

                        {loading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#a78bfa' }}>Cargando datos de la plataforma...</div>
                        ) : (
                            <div>
                                {/* Table Header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 100px 110px 100px 40px', gap: '8px', padding: '10px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['ORGANIZACIÓN', 'ADMIN', 'FINCAS', 'VAQUEROS', 'VISUAL.', 'ANIMALES', ''].map(h => (
                                        <div key={h} style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.8px' }}>{h}</div>
                                    ))}
                                </div>

                                {cuentas.map((cuenta) => (
                                    <div key={cuenta.orgId}>
                                        {/* Main Row */}
                                        <div
                                            style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 100px 110px 100px 40px', gap: '8px', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                            onClick={() => setExpandedOrg(expandedOrg === cuenta.orgId ? null : cuenta.orgId)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(124, 58, 237, 0.15)', border: '1px solid rgba(124, 58, 237, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Building2 size={16} color="#a78bfa" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{cuenta.orgNombre}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
                                                        Activa
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{cuenta.adminNombre}</div>

                                            <div>
                                                <span style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    {cuenta.totalFincas}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Wrench size={14} color="var(--warning)" />
                                                <span style={{ fontWeight: 600 }}>{cuenta.totalVaqueros}</span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Eye size={14} color="#60a5fa" />
                                                <span style={{ fontWeight: 600 }}>{cuenta.totalObservadores}</span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Tractor size={14} color="var(--primary-light)" />
                                                <span style={{ fontWeight: 600 }}>{cuenta.totalAnimales.toLocaleString('es-CO')}</span>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'org', id: cuenta.orgId, nombre: cuenta.orgNombre }); }}
                                                    style={{ background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.25)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--error)', fontSize: '0.7rem', fontWeight: 600 }}
                                                    title="Eliminar organización"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                                {expandedOrg === cuenta.orgId
                                                    ? <ChevronUp size={18} color="#a78bfa" />
                                                    : <ChevronDown size={18} color="var(--text-muted)" />
                                                }
                                            </div>
                                        </div>

                                        {/* Expanded Detail */}
                                        {expandedOrg === cuenta.orgId && (
                                            <div style={{ background: 'rgba(124, 58, 237, 0.04)', borderBottom: '1px solid rgba(124, 58, 237, 0.15)', padding: '16px 24px 20px 72px' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px', fontWeight: 700 }}>
                                                    Detalle por Finca
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {cuenta.fincas.length === 0 ? (
                                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Sin fincas registradas.</p>
                                                    ) : cuenta.fincas.map(f => (
                                                        <div key={f.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
                                                            <div style={{ minWidth: '180px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <MapPin size={14} color="#38bdf8" />
                                                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.nombre}</span>
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Tractor size={12} />
                                                                    {f.animalesActivos} animales activos
                                                                </div>
                                                            </div>

                                                            {f.vaqueros.length > 0 && (
                                                                <div>
                                                                    <div style={{ fontSize: '0.62rem', color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', fontWeight: 700 }}>
                                                                        Vaqueros
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                                        {f.vaqueros.map(v => (
                                                                            <span key={v.id} style={{ background: 'rgba(255, 179, 0, 0.1)', color: 'var(--secondary)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', border: '1px solid rgba(255, 179, 0, 0.2)' }}>
                                                                                {v.nombre}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {f.observadores.length > 0 && (
                                                                <div>
                                                                    <div style={{ fontSize: '0.62rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', fontWeight: 700 }}>
                                                                        Visualizadores
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                                        {f.observadores.map(ob => (
                                                                            <span key={ob.id} style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#93c5fd', padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', border: '1px solid rgba(96, 165, 250, 0.2)' }}>
                                                                                {ob.nombre}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {f.vaqueros.length === 0 && f.observadores.length === 0 && (
                                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Sin usuarios adicionales asignados</span>
                                                            )}

                                                            {/* Delete finca button */}
                                                            <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                                                                <button
                                                                    onClick={() => setConfirmDelete({ type: 'finca', id: f.id, nombre: f.nombre })}
                                                                    style={{ background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.25)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--error)', fontSize: '0.72rem', fontWeight: 600 }}
                                                                >
                                                                    <Trash2 size={13} /> Eliminar finca
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {cuentas.length === 0 && !loading && (
                                    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No hay organizaciones registradas.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* === CONFIRM DELETE MODAL === */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#1a1a2e', border: '1px solid rgba(244, 67, 54, 0.4)', borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
                        <div style={{ background: 'rgba(244, 67, 54, 0.15)', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <AlertTriangle size={28} color="var(--error)" />
                        </div>
                        <h3 style={{ margin: '0 0 8px', color: 'white' }}>¿Eliminar {confirmDelete.type === 'org' ? 'organización' : 'finca'}?</h3>
                        <p style={{ color: 'var(--text-muted)', margin: '0 0 8px', fontSize: '1rem' }}>
                            <strong style={{ color: 'white' }}>{confirmDelete.nombre}</strong>
                        </p>
                        <p style={{ color: 'var(--error)', margin: '0 0 28px', fontSize: '0.85rem', background: 'rgba(244,67,54,0.08)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(244,67,54,0.2)' }}>
                            ⚠️ Esta acción eliminará {confirmDelete.type === 'org' ? 'todas las fincas, animales, pesajes y datos asociados' : 'todos los animales, pesajes y datos de esta finca'}. Esta operación <strong>no se puede deshacer</strong>.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmDelete(null)}
                                disabled={!!deletingId}
                                style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => confirmDelete.type === 'org' ? handleDeleteOrg(confirmDelete.id) : handleDeleteFinca(confirmDelete.id)}
                                disabled={!!deletingId}
                                style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--error)', color: 'white', cursor: deletingId ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', opacity: deletingId ? 0.6 : 1 }}
                            >
                                <Trash2 size={16} />
                                {deletingId ? 'Eliminando...' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* === TAB: CREAR CUENTA === */}
            {activeTab === 'crear' && (
                <div style={{ maxWidth: '780px' }}>
                    <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(124, 58, 237, 0.25)', borderRadius: '16px', overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <UserPlus size={18} color="#a78bfa" />
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Crear Nueva Cuenta de Administrador</h3>
                        </div>
                        <div style={{ padding: '28px 24px' }}>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', marginTop: 0, fontSize: '0.9rem' }}>
                                El sistema creará automáticamente el usuario, su empresa y su primera finca.
                            </p>

                            {msjExito && (
                                <div style={{ background: 'rgba(76, 175, 80, 0.12)', border: '1px solid rgba(76, 175, 80, 0.3)', color: 'var(--success)', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', fontWeight: 600 }}>
                                    {msjExito}
                                </div>
                            )}
                            {msjError && (
                                <div style={{ background: 'rgba(244, 67, 54, 0.12)', border: '1px solid rgba(244, 67, 54, 0.3)', color: 'var(--error)', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', fontWeight: 600 }}>
                                    {msjError}
                                </div>
                            )}

                            <form onSubmit={crearAdministrador}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                                    <div>
                                        <h4 style={{ color: '#a78bfa', marginBottom: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            <UserPlus size={15} /> Datos del Usuario
                                        </h4>
                                        <label>Correo Electrónico</label>
                                        <input type="email" placeholder="admin@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={loadingForm} />
                                        <label>Contraseña Temporal</label>
                                        <input type="text" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} disabled={loadingForm} />
                                    </div>
                                    <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '24px' }}>
                                        <h4 style={{ color: '#a78bfa', marginBottom: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            <Building2 size={15} /> Datos de la Empresa
                                        </h4>
                                        <label>Nombre de la Organización</label>
                                        <input type="text" placeholder="Ej. Inversiones Agropecuarias S.A." value={org} onChange={e => setOrg(e.target.value)} required disabled={loadingForm} />
                                        <label>Nombre de la Primera Finca</label>
                                        <input type="text" placeholder="Ej. Hacienda La Esperanza" value={finca} onChange={e => setFinca(e.target.value)} required disabled={loadingForm} />
                                        <label>Ubicación (opcional)</label>
                                        <input type="text" placeholder="Ej. Colombia, Antioquia" value={ubicacion} onChange={e => setUbicacion(e.target.value)} disabled={loadingForm} />
                                    </div>
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                    <button
                                        type="submit"
                                        disabled={loadingForm}
                                        style={{ background: 'rgba(124, 58, 237, 0.8)', border: '1px solid rgba(124, 58, 237, 0.5)', color: 'white', padding: '13px 28px', borderRadius: '10px', cursor: loadingForm ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', width: 'auto' }}
                                    >
                                        <UserPlus size={18} />
                                        {loadingForm ? 'Procesando...' : 'Crear Cuenta'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
