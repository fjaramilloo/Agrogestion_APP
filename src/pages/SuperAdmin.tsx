import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './SuperAdmin.css';
import {
    Building2, UserPlus, ShieldCheck, MapPin, Users,
    ChevronDown, ChevronUp, BarChart3,
    Eye, Wrench, Globe, Trash2, AlertTriangle,
    Award, Edit3, Clock, TrendingUp,
    CheckCircle2, Mail, Search, AlertCircle, X
} from 'lucide-react';
import { CowIcon } from '../components/CowIcon';
import SuperAdminMarketTab from './superadmin/SuperAdminMarketTab';
import SuperAdminCreateAccountTab from './superadmin/SuperAdminCreateAccountTab';
import SuperAdminLicenseModal from './superadmin/SuperAdminLicenseModal';
import SuperAdminDeleteModal from './superadmin/SuperAdminDeleteModal';
import {
    formatSuperAdminDate,
    getEstadoSemaforo,
    getSuperAdminPalette,
    type ConfirmDeleteTarget,
    type CuentaAdmin,
    type FiltroCuenta,
    type FincaInfo,
    type TipoLicencia
} from './superadmin/types';

export default function SuperAdmin() {
    const { isSuperAdmin, loading: authLoading } = useAuth();
    const { theme } = useTheme();
    const isLight = theme === 'light';
    const palette = getSuperAdminPalette(isLight);
    const {
        accentPurple,
        accentPurpleSoft,
        purpleSoftBg,
        purpleSubtleBg,
        purpleSoftBorder,
        accentBlue,
        accentBlueSoft,
        accentBlueBadge,
        accentGreen,
        accentAmber,
        accentOrange,
        accentRed
    } = palette;

    const [activeTab, setActiveTab] = useState<'dashboard' | 'crear' | 'precios'>('dashboard');
    const [cuentas, setCuentas] = useState<CuentaAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
    const [filtroActivo, setFiltroActivo] = useState<FiltroCuenta>('todos');
    const [busqueda, setBusqueda] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteTarget | null>(null);
    const [editingLicenciaOrg, setEditingLicenciaOrg] = useState<CuentaAdmin | null>(null);

    useEffect(() => {
        if (isSuperAdmin) {
            fetchDashboardData();
        }
    }, [isSuperAdmin]);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_superadmin_cuentas_detalle');
            if (error) throw error;

            const cuentasRaw = (data || []) as any[];
            const cuentasBuilt: CuentaAdmin[] = cuentasRaw.map((c: any) => {
                const fincasOrg: FincaInfo[] = (c.fincas || []).map((f: any) => ({
                    id: f.id,
                    nombre: f.nombre,
                    animalesActivos: f.animales_activos || 0,
                    vaqueros: f.vaqueros || [],
                    observadores: f.observadores || []
                }));

                const uniqueVaqueros = new Set(fincasOrg.flatMap(f => f.vaqueros.map(v => v.id)));
                const uniqueObservadores = new Set(fincasOrg.flatMap(f => f.observadores.map(ob => ob.id)));

                return {
                    orgId: c.org_id,
                    orgNombre: c.org_nombre || 'Sin nombre',
                    adminNombre: [c.admin_nombre, c.admin_apellido].filter(Boolean).join(' ') || 'Sin nombre',
                    adminEmail: c.email || '',
                    emailConfirmado: Boolean(c.email_confirmado),
                    emailConfirmedAt: c.email_confirmed_at || null,
                    lastSignInAt: c.last_sign_in_at || null,
                    licencia: (c.licencia as TipoLicencia) || 'demo',
                    limiteAnimales: c.limite_animales ?? 40,
                    fechaInicioLicencia: c.fecha_inicio_licencia || null,
                    fechaVencimientoLicencia: c.fecha_vencimiento_licencia || null,
                    creadoEn: c.org_creado_en || c.user_created_at,
                    idDueño: c.id_dueño,
                    fincas: fincasOrg,
                    totalFincas: c.total_fincas || fincasOrg.length,
                    totalVaqueros: uniqueVaqueros.size,
                    totalObservadores: uniqueObservadores.size,
                    totalAnimales: c.total_animales || 0,
                    diasRegistro: c.dias_registro ?? 0,
                    esHuerfano: Boolean(c.es_huerfano)
                };
            });

            setCuentas(cuentasBuilt);
        } catch (err: any) {
            console.error('Error fetching dashboard data:', err);
        } finally {
            setLoading(false);
        }
    };

    const renderLicenciaBadge = (cuenta: CuentaAdmin) => {
        const { licencia, limiteAnimales } = cuenta;
        const styles: Record<TipoLicencia, { bg: string; color: string; border: string; label: string }> = {
            demo: { bg: 'var(--warning-soft-bg)', color: accentAmber, border: 'var(--warning-soft-border)', label: 'Demo (40)' },
            finca: { bg: 'var(--info-soft-bg)', color: accentBlue, border: 'var(--info-soft-border)', label: `Finca (${limiteAnimales})` },
            premium: { bg: purpleSoftBg, color: accentPurpleSoft, border: purpleSoftBorder, label: 'Premium (∞)' }
        };
        const st = styles[licencia] || styles.demo;

        return (
            <div
                onClick={(e) => { e.stopPropagation(); setEditingLicenciaOrg(cuenta); }}
                style={{
                    background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                    padding: '4px 10px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                    transition: 'transform 0.15s'
                }}
                title="Haga clic para cambiar plan de licencia"
                onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
                <Award size={12} />
                <span>{st.label}</span>
                <Edit3 size={10} style={{ opacity: 0.7 }} />
            </div>
        );
    };

    if (authLoading) {
        return (
            <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--primary-light)' }}>
                    Cargando...
                </div>
            </div>
        );
    }

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

    const renderSemaforoBadge = (cuenta: CuentaAdmin) => {
        const sem = getEstadoSemaforo(cuenta, palette);
        return (
            <span
                className="semaforo-badge"
                style={{ background: sem.bg, color: sem.color, border: `1px solid ${sem.border}` }}
                title={`${sem.label}: ${sem.sublabel}`}
            >
                <span>{sem.icon}</span>
                <span>{sem.label}</span>
            </span>
        );
    };

    // Conteo para chips de filtrado y métricas de alerta
    const numInactivas30d = cuentas.filter(c => getEstadoSemaforo(c, palette).tipo === 'inactiva_30d').length;
    const numEnRiesgo = cuentas.filter(c => getEstadoSemaforo(c, palette).tipo === 'en_riesgo').length;
    const numSinConfirmar = cuentas.filter(c => !c.emailConfirmado).length;
    const numActivas = cuentas.filter(c => getEstadoSemaforo(c, palette).tipo === 'activa').length;
    const numPago = cuentas.filter(c => c.licencia !== 'demo').length;

    // Filtro combinado de búsqueda y chips
    const cuentasFiltradas = cuentas.filter(c => {
        if (busqueda.trim()) {
            const term = busqueda.toLowerCase().trim();
            const matchOrg = (c.orgNombre || '').toLowerCase().includes(term);
            const matchAdmin = (c.adminNombre || '').toLowerCase().includes(term);
            const matchEmail = (c.adminEmail || '').toLowerCase().includes(term);
            if (!matchOrg && !matchAdmin && !matchEmail) return false;
        }

        if (filtroActivo === 'todos') return true;
        if (filtroActivo === 'sin_confirmar') return !c.emailConfirmado;
        const sem = getEstadoSemaforo(c, palette);
        return sem.tipo === filtroActivo;
    });

    const statCards = [
        {
            label: 'Total Cuentas',
            value: cuentas.length,
            Icon: Globe,
            color: accentPurple,
            bg: purpleSoftBg,
            border: filtroActivo === 'todos' ? accentPurple : purpleSoftBorder,
            onClick: () => setFiltroActivo('todos')
        },
        {
            label: 'Para Inactivar (+30d)',
            value: numInactivas30d,
            Icon: AlertTriangle,
            color: numInactivas30d > 0 ? accentRed : 'var(--text-muted)',
            bg: numInactivas30d > 0 ? 'var(--error-soft-bg)' : 'var(--surface-subtle)',
            border: filtroActivo === 'inactiva_30d' ? accentRed : (numInactivas30d > 0 ? 'var(--error-soft-border)' : 'var(--border-subtle)'),
            onClick: () => setFiltroActivo('inactiva_30d')
        },
        {
            label: 'Email Pendiente',
            value: numSinConfirmar,
            Icon: Mail,
            color: numSinConfirmar > 0 ? accentOrange : 'var(--text-muted)',
            bg: numSinConfirmar > 0 ? 'var(--warning-soft-bg)' : 'var(--surface-subtle)',
            border: filtroActivo === 'sin_confirmar' ? accentOrange : (numSinConfirmar > 0 ? 'var(--warning-soft-border)' : 'var(--border-subtle)'),
            onClick: () => setFiltroActivo('sin_confirmar')
        },
        {
            label: 'Demos con Ganado',
            value: numActivas,
            Icon: CowIcon,
            color: accentGreen,
            bg: 'var(--success-soft-bg)',
            border: filtroActivo === 'activa' ? accentGreen : 'var(--success-soft-border)',
            onClick: () => setFiltroActivo('activa')
        }
    ];

    return (
        <div className="page-container superadmin-container">
            {/* Header */}
            <div className="superadmin-header">
                <div className="superadmin-header-icon">
                    <ShieldCheck size={26} color={accentPurple} />
                </div>
                <div>
                    <h1 className="superadmin-title">
                        Consola de Administración
                    </h1>
                    <p className="superadmin-subtitle">
                        Gestión global de cuentas, licencias, fincas y usuarios de la plataforma
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="superadmin-tabs">
                {([['dashboard', BarChart3, 'Visión General'], ['crear', UserPlus, 'Nueva Cuenta'], ['precios', TrendingUp, 'Precios de Mercado']] as [string, any, string][]).map(([tab, Icon, label]) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as 'dashboard' | 'crear' | 'precios')}
                        className="superadmin-tab-btn"
                        style={{
                            background: activeTab === tab ? purpleSoftBg : 'transparent',
                            color: activeTab === tab ? accentPurple : 'var(--text-muted)',
                            boxShadow: activeTab === tab ? `0 0 0 1px ${purpleSoftBorder}` : 'none'
                        }}
                    >
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>

            {/* === TAB: DASHBOARD === */}
            {activeTab === 'dashboard' && (
                <>
                    {/* Actionable KPI Cards */}
                    <div className="superadmin-stats-grid">
                        {statCards.map((card) => (
                            <div
                                key={card.label}
                                onClick={card.onClick}
                                className="superadmin-stat-card"
                                style={{
                                    background: card.bg,
                                    border: `1px solid ${card.border}`,
                                    cursor: 'pointer'
                                }}
                                title={`Toca para filtrar por ${card.label}`}
                            >
                                <div className="superadmin-stat-icon" style={{ background: card.bg, border: `1px solid ${card.border}` }}>
                                    <card.Icon size={20} color={card.color} />
                                </div>
                                <div>
                                    <div className="superadmin-stat-value" style={{ color: card.color }}>{card.value}</div>
                                    <div className="superadmin-stat-label">{card.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Search and Filters Controls */}
                    <div className="superadmin-controls-container">
                        <div className="superadmin-search-wrapper">
                            <Search size={16} color="var(--text-muted)" className="superadmin-search-icon" />
                            <input
                                type="text"
                                placeholder="Buscar por ganadería, titular o correo..."
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                className="superadmin-search-input"
                            />
                            {busqueda && (
                                <button onClick={() => setBusqueda('')} className="superadmin-search-clear">
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Horizontal Scrollable Filter Chips (Mobile-First) */}
                        <div className="superadmin-filter-chips">
                            <button
                                onClick={() => setFiltroActivo('todos')}
                                className={`superadmin-chip ${filtroActivo === 'todos' ? 'active' : ''}`}
                            >
                                Todas ({cuentas.length})
                            </button>
                            <button
                                onClick={() => setFiltroActivo('inactiva_30d')}
                                className={`superadmin-chip chip-danger ${filtroActivo === 'inactiva_30d' ? 'active' : ''}`}
                            >
                                🔴 Para Inactivar (+30d) ({numInactivas30d})
                            </button>
                            <button
                                onClick={() => setFiltroActivo('en_riesgo')}
                                className={`superadmin-chip chip-warning ${filtroActivo === 'en_riesgo' ? 'active' : ''}`}
                            >
                                🟠 En Riesgo ({numEnRiesgo})
                            </button>
                            <button
                                onClick={() => setFiltroActivo('activa')}
                                className={`superadmin-chip chip-success ${filtroActivo === 'activa' ? 'active' : ''}`}
                            >
                                🟢 Demos con Ganado ({numActivas})
                            </button>
                            <button
                                onClick={() => setFiltroActivo('sin_confirmar')}
                                className={`superadmin-chip chip-amber ${filtroActivo === 'sin_confirmar' ? 'active' : ''}`}
                            >
                                ⚠️ Email Pendiente ({numSinConfirmar})
                            </button>
                            <button
                                onClick={() => setFiltroActivo('cliente_pago')}
                                className={`superadmin-chip chip-purple ${filtroActivo === 'cliente_pago' ? 'active' : ''}`}
                            >
                                💎 Clientes Pago ({numPago})
                            </button>
                        </div>
                    </div>

                    {/* Accounts Container */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Building2 size={18} color={accentPurple} />
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>Cuentas Registradas y Estado</h3>
                            <span style={{ marginLeft: 'auto', background: purpleSoftBg, border: `1px solid ${purpleSoftBorder}`, color: accentPurple, padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                                {cuentasFiltradas.length} mostradas
                            </span>
                        </div>

                        {loading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: accentPurple }}>Cargando datos de la plataforma...</div>
                        ) : cuentasFiltradas.length === 0 ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                {busqueda || filtroActivo !== 'todos'
                                    ? 'No se encontraron cuentas con los filtros seleccionados.'
                                    : 'No hay organizaciones registradas.'}
                            </div>
                        ) : (
                            <>
                                {/* Desktop Table View */}
                                <div className="superadmin-desktop-view">
                                    {/* Table Header */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 1.1fr 1.3fr 55px 55px 55px 75px 80px', gap: '8px', padding: '10px 20px', background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                                        {['ORGANIZACIÓN & ESTADO', 'ADMINISTRADOR / EMAIL', 'LICENCIA', 'ANTIGÜEDAD / LOGIN', 'FINCAS', 'VAQ.', 'VIS.', 'GANADO', 'ACCIONES'].map(h => (
                                            <div key={h} style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.8px' }}>{h}</div>
                                        ))}
                                    </div>

                                    {cuentasFiltradas.map((cuenta) => {
                                        const semaforo = getEstadoSemaforo(cuenta, palette);
                                        return (
                                            <div key={cuenta.orgId}>
                                                {/* Main Row */}
                                                <div
                                                    style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 1.1fr 1.3fr 55px 55px 55px 75px 80px', gap: '8px', padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                                    onMouseOver={e => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                                    onClick={() => setExpandedOrg(expandedOrg === cuenta.orgId ? null : cuenta.orgId)}
                                                >
                                                    {/* Org & Semaforo */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: semaforo.bg, border: `1px solid ${semaforo.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '16px' }}>
                                                            {semaforo.icon}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {cuenta.orgNombre}
                                                            </div>
                                                            <div style={{ marginTop: '3px' }}>
                                                                {renderSemaforoBadge(cuenta)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Admin & Email with Confirmation Status */}
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {cuenta.adminNombre}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                                            <a
                                                                href={`mailto:${cuenta.adminEmail}`}
                                                                onClick={e => e.stopPropagation()}
                                                                style={{ fontSize: '0.75rem', color: 'var(--primary-light)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                                title="Escribir correo"
                                                            >
                                                                {cuenta.adminEmail}
                                                            </a>
                                                            {cuenta.emailConfirmado ? (
                                                                <span style={{ color: accentGreen, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center' }} title="Email verificado">
                                                                    <CheckCircle2 size={12} />
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: accentOrange, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center' }} title="Email pendiente de confirmación">
                                                                    <AlertCircle size={12} />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Licencia Badge */}
                                                    <div>
                                                        {renderLicenciaBadge(cuenta)}
                                                    </div>

                                                    {/* Antigüedad & Último Login */}
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Clock size={11} color={accentPurple} />
                                                            <span>Hace {cuenta.diasRegistro}d ({formatSuperAdminDate(cuenta.creadoEn)})</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', color: accentBlueSoft }}>
                                                            <Eye size={11} />
                                                            <span>Login: {cuenta.lastSignInAt ? formatSuperAdminDate(cuenta.lastSignInAt) : 'Nunca'}</span>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <span style={{ background: 'var(--info-soft-bg)', border: '1px solid var(--info-soft-border)', color: accentBlue, padding: '3px 8px', borderRadius: '16px', fontSize: '0.78rem', fontWeight: 700 }}>
                                                            {cuenta.totalFincas}
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Wrench size={13} color="var(--warning)" />
                                                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{cuenta.totalVaqueros}</span>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Eye size={13} color={accentBlueSoft} />
                                                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{cuenta.totalObservadores}</span>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CowIcon size={14} color="var(--primary-light)" />
                                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{cuenta.totalAnimales.toLocaleString('es-CO')}</span>
                                                    </div>

                                                    {/* Acciones */}
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                                                        <a
                                                            href={`mailto:${cuenta.adminEmail}?subject=AgroGestión%20Soporte`}
                                                            onClick={e => e.stopPropagation()}
                                                            style={{ background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)', borderRadius: '6px', padding: '4px 6px', display: 'flex', alignItems: 'center', color: 'var(--primary-light)', textDecoration: 'none' }}
                                                            title="Contactar al usuario"
                                                        >
                                                            <Mail size={12} />
                                                        </a>
                                                        <button
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                setConfirmDelete({
                                                                    type: 'org',
                                                                    id: cuenta.orgId,
                                                                    idDueño: cuenta.idDueño,
                                                                    nombre: cuenta.orgNombre,
                                                                    email: cuenta.adminEmail,
                                                                    esInactiva: semaforo.tipo === 'inactiva_30d'
                                                                });
                                                            }}
                                                            style={{
                                                                background: 'var(--error-soft-bg)',
                                                                border: `1px solid ${semaforo.tipo === 'inactiva_30d' ? 'var(--error)' : 'var(--error-soft-border)'}`,
                                                                borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--error)'
                                                            }}
                                                            title={semaforo.tipo === 'inactiva_30d' ? 'Eliminar cuenta demo inactiva (+30d)' : 'Eliminar organización'}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                        {expandedOrg === cuenta.orgId
                                                            ? <ChevronUp size={16} color={accentPurple} />
                                                            : <ChevronDown size={16} color="var(--text-muted)" />
                                                        }
                                                    </div>
                                                </div>

                                                {/* Expanded Detail */}
                                                {expandedOrg === cuenta.orgId && (
                                                    <div style={{ background: purpleSubtleBg, borderBottom: `1px solid ${purpleSoftBorder}`, padding: '16px 20px 20px 60px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                            <div style={{ fontSize: '0.68rem', color: accentPurple, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700 }}>
                                                                Fincas y Permisos ({cuenta.fincas.length})
                                                            </div>
                                                            <button
                                                                onClick={() => setEditingLicenciaOrg(cuenta)}
                                                                style={{ background: purpleSoftBg, border: `1px solid ${purpleSoftBorder}`, color: accentPurpleSoft, padding: '5px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                            >
                                                                <Edit3 size={13} /> Cambiar Licencia / Límites
                                                            </button>
                                                        </div>

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                            {cuenta.fincas.length === 0 ? (
                                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Sin fincas registradas.</p>
                                                            ) : cuenta.fincas.map(f => (
                                                                <div key={f.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
                                                                    <div style={{ minWidth: '180px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <MapPin size={14} color={accentBlue} />
                                                                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{f.nombre}</span>
                                                                        </div>
                                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <CowIcon size={13} color="var(--primary-light)" />
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
                                                                                    <span key={v.id} style={{ background: 'var(--secondary-soft-bg)', color: 'var(--secondary)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', border: '1px solid var(--secondary-soft-border)' }}>
                                                                                        {v.nombre}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {f.observadores.length > 0 && (
                                                                        <div>
                                                                            <div style={{ fontSize: '0.62rem', color: accentBlueSoft, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', fontWeight: 700 }}>
                                                                                Visualizadores
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                                                {f.observadores.map(ob => (
                                                                                    <span key={ob.id} style={{ background: 'var(--info-soft-bg)', color: accentBlueBadge, padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', border: '1px solid var(--info-soft-border)' }}>
                                                                                        {ob.nombre}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {f.vaqueros.length === 0 && f.observadores.length === 0 && (
                                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Sin usuarios adicionales asignados</span>
                                                                    )}

                                                                    <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                                                                        <button
                                                                            onClick={() => setConfirmDelete({ type: 'finca', id: f.id, nombre: f.nombre })}
                                                                            style={{ background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--error)', fontSize: '0.72rem', fontWeight: 600 }}
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
                                        );
                                    })}
                                </div>

                                {/* Mobile Cards View (Optimizado para Teléfonos) */}
                                <div className="superadmin-mobile-view" style={{ padding: '14px' }}>
                                    {cuentasFiltradas.map((cuenta) => {
                                        const semaforo = getEstadoSemaforo(cuenta, palette);
                                        return (
                                            <div key={cuenta.orgId} className="superadmin-card">
                                                {/* Card Header */}
                                                <div className="superadmin-card-header">
                                                    <div className="superadmin-card-title-box">
                                                        <div style={{
                                                            width: '38px',
                                                            height: '38px',
                                                            borderRadius: '10px',
                                                            background: semaforo.bg,
                                                            border: `1px solid ${semaforo.border}`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '18px',
                                                            flexShrink: 0
                                                        }}>
                                                            {semaforo.icon}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div className="superadmin-card-title">{cuenta.orgNombre}</div>
                                                            <div style={{ fontSize: '0.72rem', color: semaforo.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>{semaforo.label}</span>
                                                                <span style={{ opacity: 0.5 }}>•</span>
                                                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{semaforo.sublabel}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        {renderLicenciaBadge(cuenta)}
                                                    </div>
                                                </div>

                                                {/* User Info & Email Verification Pill */}
                                                <div className="superadmin-card-user-row">
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Users size={13} color="var(--text-muted)" />
                                                            <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-main)' }}>{cuenta.adminNombre}</span>
                                                        </div>
                                                        {cuenta.emailConfirmado ? (
                                                            <span style={{ background: 'var(--success-soft-bg)', color: accentGreen, border: '1px solid var(--success-soft-border)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <CheckCircle2 size={11} /> Confirmado
                                                            </span>
                                                        ) : (
                                                            <span style={{ background: 'var(--warning-soft-bg)', color: accentOrange, border: '1px solid var(--warning-soft-border)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <AlertCircle size={11} /> Email Pendiente
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, marginTop: '2px' }}>
                                                        <Mail size={12} color="var(--text-muted)" />
                                                        <a
                                                            href={`mailto:${cuenta.adminEmail}`}
                                                            style={{ color: 'var(--primary-light)', fontSize: '0.8rem', textDecoration: 'none', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                                                            title="Toca para enviar correo"
                                                        >
                                                            {cuenta.adminEmail || 'Sin correo'}
                                                        </a>
                                                    </div>
                                                </div>

                                                {/* Registration & Activity Dates */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--surface-subtle)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={11} color={accentPurple} />
                                                        <span>Registro: hace {cuenta.diasRegistro}d</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: cuenta.lastSignInAt ? accentBlueSoft : 'var(--text-muted)' }}>
                                                        <Eye size={11} />
                                                        <span>Login: {cuenta.lastSignInAt ? formatSuperAdminDate(cuenta.lastSignInAt) : 'Nunca'}</span>
                                                    </div>
                                                </div>

                                                {/* Metrics Mini-Grid */}
                                                <div className="superadmin-metrics-grid">
                                                    <div className="superadmin-metric-chip">
                                                        <div className="superadmin-metric-chip-val" style={{ color: accentBlue }}>
                                                            <MapPin size={12} /> {cuenta.totalFincas}
                                                        </div>
                                                        <div className="superadmin-metric-chip-lbl">Fincas</div>
                                                    </div>
                                                    <div className="superadmin-metric-chip">
                                                        <div className="superadmin-metric-chip-val" style={{ color: 'var(--primary-light)' }}>
                                                            <CowIcon size={14} color="var(--primary-light)" /> {cuenta.totalAnimales.toLocaleString('es-CO')}
                                                        </div>
                                                        <div className="superadmin-metric-chip-lbl">Ganado</div>
                                                    </div>
                                                    <div className="superadmin-metric-chip">
                                                        <div className="superadmin-metric-chip-val" style={{ color: 'var(--warning)' }}>
                                                            <Wrench size={12} /> {cuenta.totalVaqueros}
                                                        </div>
                                                        <div className="superadmin-metric-chip-lbl">Vaqueros</div>
                                                    </div>
                                                    <div className="superadmin-metric-chip">
                                                        <div className="superadmin-metric-chip-val" style={{ color: accentBlueSoft }}>
                                                            <Eye size={12} /> {cuenta.totalObservadores}
                                                        </div>
                                                        <div className="superadmin-metric-chip-lbl">Visores</div>
                                                    </div>
                                                </div>

                                                {/* Mobile Actions Bar */}
                                                <div className="superadmin-card-actions">
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        <a
                                                            href={`mailto:${cuenta.adminEmail}?subject=Soporte%20AgroGesti%C3%B3n`}
                                                            className="superadmin-btn-action"
                                                            style={{ background: 'var(--primary-soft-bg)', color: 'var(--primary-light)', border: '1px solid var(--primary-soft-border)', textDecoration: 'none', padding: '6px 10px' }}
                                                        >
                                                            <Mail size={12} /> Contactar
                                                        </a>

                                                        <button
                                                            onClick={() => setEditingLicenciaOrg(cuenta)}
                                                            className="superadmin-btn-action"
                                                            style={{ background: purpleSoftBg, color: accentPurpleSoft, border: `1px solid ${purpleSoftBorder}`, padding: '6px 10px' }}
                                                        >
                                                            <Edit3 size={12} /> Plan
                                                        </button>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        {semaforo.tipo === 'inactiva_30d' ? (
                                                            <button
                                                                onClick={() => setConfirmDelete({
                                                                    type: 'org',
                                                                    id: cuenta.orgId,
                                                                    idDueño: cuenta.idDueño,
                                                                    nombre: cuenta.orgNombre,
                                                                    email: cuenta.adminEmail,
                                                                    esInactiva: true
                                                                })}
                                                                className="superadmin-btn-action"
                                                                style={{
                                                                    background: 'var(--error-soft-bg)',
                                                                    color: accentRed,
                                                                    border: '1px solid var(--error)',
                                                                    fontWeight: 700,
                                                                    padding: '6px 10px'
                                                                }}
                                                                title="Eliminar demo inactiva (+30 días sin animales)"
                                                            >
                                                                <Trash2 size={12} /> Inactivar
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setConfirmDelete({
                                                                    type: 'org',
                                                                    id: cuenta.orgId,
                                                                    idDueño: cuenta.idDueño,
                                                                    nombre: cuenta.orgNombre,
                                                                    email: cuenta.adminEmail,
                                                                    esInactiva: false
                                                                })}
                                                                className="superadmin-btn-action"
                                                                style={{ background: 'var(--error-soft-bg)', color: 'var(--error)', border: '1px solid var(--error-soft-border)', padding: '6px 10px' }}
                                                                title="Eliminar organización"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}

                                                        {cuenta.fincas.length > 0 && (
                                                            <button
                                                                onClick={() => setExpandedOrg(expandedOrg === cuenta.orgId ? null : cuenta.orgId)}
                                                                className="superadmin-btn-action"
                                                                style={{ background: 'var(--surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-strong)', padding: '6px 8px' }}
                                                            >
                                                                {expandedOrg === cuenta.orgId ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Mobile Fincas Accordion */}
                                                {expandedOrg === cuenta.orgId && (
                                                    <div className="superadmin-fincas-accordion">
                                                        <div style={{ fontSize: '0.68rem', color: accentPurple, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, marginBottom: '4px' }}>
                                                            Fincas Registradas ({cuenta.fincas.length})
                                                        </div>
                                                        {cuenta.fincas.length === 0 ? (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin fincas registradas.</div>
                                                        ) : (
                                                            cuenta.fincas.map(f => (
                                                                <div key={f.id} className="superadmin-finca-item">
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <MapPin size={13} color={accentBlue} />
                                                                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>{f.nombre}</span>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setConfirmDelete({ type: 'finca', id: f.id, nombre: f.nombre })}
                                                                            style={{ background: 'transparent', border: 'none', color: 'var(--error)', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                                        >
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    </div>

                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <CowIcon size={13} color="var(--primary-light)" />
                                                                        <strong style={{ color: 'var(--text-main)' }}>{f.animalesActivos}</strong> animales activos
                                                                    </div>

                                                                    {f.vaqueros.length > 0 && (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                            <span style={{ fontSize: '0.62rem', color: 'var(--warning)', fontWeight: 700, textTransform: 'uppercase' }}>Vaq:</span>
                                                                            {f.vaqueros.map(v => (
                                                                                <span key={v.id} style={{ background: 'var(--secondary-soft-bg)', color: 'var(--secondary)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.7rem', border: '1px solid var(--secondary-soft-border)' }}>
                                                                                    {v.nombre}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    {f.observadores.length > 0 && (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                            <span style={{ fontSize: '0.62rem', color: accentBlueSoft, fontWeight: 700, textTransform: 'uppercase' }}>Vis:</span>
                                                                            {f.observadores.map(ob => (
                                                                                <span key={ob.id} style={{ background: 'var(--info-soft-bg)', color: accentBlueBadge, padding: '2px 6px', borderRadius: '8px', fontSize: '0.7rem', border: '1px solid var(--info-soft-border)' }}>
                                                                                    {ob.nombre}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}

            {/* === MODAL EDITAR LICENCIA === */}
            {editingLicenciaOrg && (
                <SuperAdminLicenseModal
                    cuenta={editingLicenciaOrg}
                    palette={palette}
                    onClose={() => setEditingLicenciaOrg(null)}
                    onSaved={fetchDashboardData}
                />
            )}

            {/* === CONFIRM DELETE MODAL === */}
            {confirmDelete && (
                <SuperAdminDeleteModal
                    target={confirmDelete}
                    onClose={() => setConfirmDelete(null)}
                    onDeleted={async (type) => {
                        if (type === 'org') setExpandedOrg(null);
                        await fetchDashboardData();
                    }}
                />
            )}

            {/* === TAB: CREAR CUENTA === */}
            {activeTab === 'crear' && (
                <SuperAdminCreateAccountTab
                    palette={palette}
                    onAccountCreated={async () => {
                        await fetchDashboardData();
                        setActiveTab('dashboard');
                    }}
                />
            )}

            {/* === TAB: PRECIOS DE MERCADO === */}
            {activeTab === 'precios' && (
                <SuperAdminMarketTab palette={palette} />
            )}
        </div>
    );
}
