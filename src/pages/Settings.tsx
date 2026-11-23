import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { useModalDialog } from '../hooks/useModalDialog';
import { useNavigate } from 'react-router-dom';
import {
    Settings as SettingsIcon,
    Upload,
    Users,
    CheckCircle2,
    MapPin,
    Maximize,
    Home,
    Lock,
    Briefcase,
    Target,
    Scale,
    DollarSign,
    Coins,
    CreditCard,
    Leaf,
    Award,
    X,
    Eye,
    EyeOff
} from 'lucide-react';
import PushNotificationsCard from '../components/PushNotificationsCard';
import './Settings.css';
import { toDisplayValue, toStorageValue, getUnidadLabel, getModoLabel, type ModoGanancia } from '../utils/ganancia';
import { sanitizeDecimalInput, parseDecimalInput } from '../utils/decimalInput';
import SettingsPluviometrosSection from './settings/SettingsPluviometrosSection';
import SettingsUsersSection from './settings/SettingsUsersSection';
import SettingsBusinessListsSection from './settings/SettingsBusinessListsSection';
import SettingsBulkUploadSection from './settings/SettingsBulkUploadSection';
import {
    PRESETS_RANGOS_PESO,
    formatMilesNumber,
    unformatMilesNumber,
    type ReporteCargaMasiva
} from './settings/types';

export { PRESETS_RANGOS_PESO };

export default function Settings() {
    const navigate = useNavigate();
    const { fincaId, role, userFincas, isSuperAdmin, modoGanancia, setModoGanancia, licenciaInfo, refreshLicencia } = useAuth();
    const { theme } = useTheme();
    const { toast } = useFeedback();
    const isLight = theme === 'light';
    const accentPurple = isLight ? '#7c3aed' : '#c084fc';
    const [umbral, setUmbral] = useState('0.434');
    const [participacionUtilidad, setParticipacionUtilidad] = useState('60');
    const [umbralMedioDisplay, setUmbralMedioDisplay] = useState('10');
    const [umbralAltoDisplay, setUmbralAltoDisplay] = useState('20');
    const [modoLocal, setModoLocal] = useState<ModoGanancia>(modoGanancia);
    const [loading, setLoading] = useState(false);
    const [inlineStatus, setInlineStatus] = useState<{ section: string; type: 'success' | 'error'; text: string } | null>(null);
    const [exitoModalMessage, setExitoModalMessage] = useState<string | null>(null);
    const [showNewPwd, setShowNewPwd] = useState(false);
    const [showConfirmPwd, setShowConfirmPwd] = useState(false);

    const sectionPanelRef = useRef<HTMLDivElement>(null);
    const canManageFarm = role === 'administrador' || isSuperAdmin;

    const showSectionFeedback = (section: string, type: 'success' | 'error', text: string) => {
        setInlineStatus({ section, type, text });
        toast(text, type);
    };

    const [reporteCarga, setReporteCarga] = useState<ReporteCargaMasiva | null>(null);

    const closeExitoModal = () => {
        setExitoModalMessage(null);
        setReporteCarga(null);
    };
    const exitoDialogProps = useModalDialog(Boolean(exitoModalMessage), closeExitoModal);
    const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [collapsed, setCollapsed] = useState({
        seguridad: true,
        datosTecnicos: true,
        usuarios: true,
        contactosNegocio: true,
        cargasMasivas: true
    });

    const toggleSection = (section: keyof typeof collapsed) => {
        const nextState = !collapsed[section];
        setCollapsed({
            seguridad: true,
            datosTecnicos: true,
            usuarios: true,
            contactosNegocio: true,
            cargasMasivas: true,
            [section]: nextState
        });
        if (nextState && typeof window !== 'undefined' && window.innerWidth <= 768) {
            window.requestAnimationFrame(() => {
                sectionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    };

    const renderInlineStatus = (sectionKey: string) => {
        if (!inlineStatus || inlineStatus.section !== sectionKey || exitoModalMessage) return null;
        const isErr = inlineStatus.type === 'error';
        return (
            <div
                role={isErr ? 'alert' : 'status'}
                className={`settings-inline-status ${isErr ? 'settings-inline-status--error' : 'settings-inline-status--success'}`}
            >
                <span>{inlineStatus.text}</span>
                <button
                    type="button"
                    className="settings-toast-close"
                    onClick={() => setInlineStatus(null)}
                    aria-label="Cerrar aviso"
                >
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
        );
    };

    const [farmInfo, setFarmInfo] = useState({
        area_total: '',
        area_aprovechable: '',
        ubicacion: '',
        municipio: '',
        proposito: '',
        precio_venta_promedio: '',
        precio_compra_promedio: '',
        costo_mensual_animal: '',
        peso_entrada_ceba: '380',
        consumo_dia_potrero: '50',
        corte_peso_1: '430',
        corte_peso_2: '480',
        corte_peso_3: '530',
        preset_peso: 'ceba_tradicional'
    });

    const fincasAdmin = userFincas.filter((f: any) => f.rol === 'administrador' || isSuperAdmin);

    const fetchConfig = async () => {
        if (!fincaId) return;
        const { data } = await supabase
            .from('configuracion_kpi')
            .select('umbral_bajo_gdp, umbral_medio_gmp, umbral_alto_gmp, modo_ganancia')
            .eq('id_finca', fincaId)
            .single();

        if (data) {
            const modo: ModoGanancia = (data.modo_ganancia as ModoGanancia) || 'GMP';
            setModoLocal(modo);
            const bajoKgMes = data.umbral_bajo_gdp ?? 0.434;
            setUmbral(toDisplayValue(bajoKgMes, modo).toFixed(modo === 'GDP' ? 0 : 3));
            const medioKgMes = data.umbral_medio_gmp ?? 10;
            const altoKgMes = data.umbral_alto_gmp ?? 20;
            setUmbralMedioDisplay(toDisplayValue(medioKgMes, modo).toFixed(modo === 'GDP' ? 0 : 1));
            setUmbralAltoDisplay(toDisplayValue(altoKgMes, modo).toFixed(modo === 'GDP' ? 0 : 1));
        }
    };

    const fetchFincaInfo = async () => {
        if (!fincaId) return;

        const { data: finca, error: fincaErr } = await supabase
            .from('fincas')
            .select('area_total, area_aprovechable, ubicacion, municipio, proposito')
            .eq('id', fincaId)
            .single();

        const { data: config } = await supabase
            .from('configuracion_kpi')
            .select('precio_venta_promedio, precio_compra_promedio, costo_mensual_animal, peso_entrada_ceba, consumo_dia_potrero, participacion_utilidad, corte_peso_1, corte_peso_2, corte_peso_3, preset_peso')
            .eq('id_finca', fincaId)
            .single();

        if (!fincaErr && finca) {
            setFarmInfo({
                area_total: finca.area_total?.toString() || '',
                area_aprovechable: finca.area_aprovechable?.toString() || '',
                ubicacion: finca.ubicacion || '',
                municipio: finca.municipio || '',
                proposito: finca.proposito || '',
                precio_venta_promedio: config?.precio_venta_promedio?.toString() || '0',
                precio_compra_promedio: config?.precio_compra_promedio?.toString() || '0',
                costo_mensual_animal: config?.costo_mensual_animal?.toString() || '0',
                peso_entrada_ceba: config?.peso_entrada_ceba?.toString() || '380',
                consumo_dia_potrero: config?.consumo_dia_potrero?.toString() || '50',
                corte_peso_1: config?.corte_peso_1?.toString() || '430',
                corte_peso_2: config?.corte_peso_2?.toString() || '480',
                corte_peso_3: config?.corte_peso_3?.toString() || '530',
                preset_peso: config?.preset_peso || 'ceba_tradicional'
            });
            const partDecimal = config?.participacion_utilidad ?? 0.6;
            setParticipacionUtilidad(Math.round(partDecimal * 100).toString());
        }
    };

    useEffect(() => {
        if (!fincaId) return;
        void fetchConfig();
        void fetchFincaInfo();
    }, [fincaId]);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setInlineStatus(null);
        if (newPassword !== confirmPassword) {
            showSectionFeedback('seguridad', 'error', 'Las contraseñas no coinciden.');
            return;
        }
        if (newPassword.length < 6) {
            showSectionFeedback('seguridad', 'error', 'La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            showSectionFeedback('seguridad', 'error', 'Error al actualizar contraseña: ' + error.message);
        } else {
            showSectionFeedback('seguridad', 'success', 'Contraseña actualizada correctamente.');
            setNewPassword('');
            setConfirmPassword('');
        }
        setLoading(false);
    };

    const guardarConfiguracionYFinca = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;

        setInlineStatus(null);
        setLoading(true);

        try {
            const valorBajoGMP = toStorageValue(parseDecimalInput(umbral) || 0.434, modoLocal);
            const valorMedioGMP = toStorageValue(parseDecimalInput(umbralMedioDisplay) || 10, modoLocal);
            const valorAltoGMP = toStorageValue(parseDecimalInput(umbralAltoDisplay) || 20, modoLocal);
            const precioVenta = parseDecimalInput(farmInfo.precio_venta_promedio) || 0;
            const precioCompra = parseDecimalInput(farmInfo.precio_compra_promedio) || 0;
            const costoMensual = parseDecimalInput(farmInfo.costo_mensual_animal) || 0;
            const pesoCeba = parseDecimalInput(farmInfo.peso_entrada_ceba) || 380;
            const consumoDia = parseDecimalInput(farmInfo.consumo_dia_potrero) || 50;
            const partPct = Math.min(99, Math.max(1, parseInt(participacionUtilidad) || 60));
            const participacionDecimal = partPct / 100;
            const c1 = parseDecimalInput(farmInfo.corte_peso_1) || 430;
            const c2 = parseDecimalInput(farmInfo.corte_peso_2) || 480;
            const c3 = parseDecimalInput(farmInfo.corte_peso_3) || 530;

            const { error: kpiError } = await supabase
                .from('configuracion_kpi')
                .upsert({
                    id_finca: fincaId,
                    umbral_bajo_gdp: valorBajoGMP,
                    umbral_medio_gmp: valorMedioGMP,
                    umbral_alto_gmp: valorAltoGMP,
                    precio_venta_promedio: precioVenta,
                    precio_compra_promedio: precioCompra,
                    costo_mensual_animal: costoMensual,
                    peso_entrada_ceba: pesoCeba,
                    consumo_dia_potrero: consumoDia,
                    modo_ganancia: modoLocal,
                    participacion_utilidad: participacionDecimal,
                    corte_peso_1: c1,
                    corte_peso_2: c2,
                    corte_peso_3: c3,
                    preset_peso: farmInfo.preset_peso || 'ceba_tradicional'
                }, { onConflict: 'id_finca' });

            if (kpiError) throw kpiError;
            setModoGanancia(modoLocal);

            const areaTotalParsed = parseDecimalInput(farmInfo.area_total);
            const areaAprovechableParsed = parseDecimalInput(farmInfo.area_aprovechable);
            const fincaPayload: Record<string, any> = {
                area_total: farmInfo.area_total && !isNaN(areaTotalParsed) ? areaTotalParsed : null,
                area_aprovechable: farmInfo.area_aprovechable && !isNaN(areaAprovechableParsed) ? areaAprovechableParsed : null,
                ubicacion: farmInfo.ubicacion || null,
                municipio: farmInfo.municipio || null,
            };
            if (farmInfo.proposito) {
                fincaPayload.proposito = farmInfo.proposito;
            }

            const { error: fincaError } = await supabase
                .from('fincas')
                .update(fincaPayload)
                .eq('id', fincaId);

            if (fincaError) throw new Error('Error finca: ' + fincaError.message);

            showSectionFeedback('datosTecnicos', 'success', 'Información y parámetros actualizados exitosamente.');
        } catch (err: any) {
            showSectionFeedback('datosTecnicos', 'error', 'Error al guardar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const sectionCards = [
        { id: 'seguridad', label: 'Seguridad', icon: <Lock size={28} />, desc: 'Cuenta y notificaciones' },
        { id: 'datosTecnicos', label: 'Parámetros', icon: <Home size={28} />, desc: 'KPIs y Finca' },
        { id: 'usuarios', label: 'Personal', icon: <Users size={28} />, desc: 'Gestión de equipo' },
        { id: 'contactosNegocio', label: 'Negocios', icon: <Briefcase size={28} />, desc: 'Contactos y socios' },
        { id: 'cargasMasivas', label: 'Carga Masiva', icon: <Upload size={28} />, desc: 'Importar CSV/Excel' },
        { id: 'suscripcion', label: 'Suscripción', icon: <Award size={28} />, desc: 'Plan y Licencia', isLink: true }
    ];

    const isSeguridadOpen = !canManageFarm || !collapsed.seguridad;

    return (
        <div className="page-container settings-page">
            <h1 className="title settings-title">
                <SettingsIcon size={30} aria-hidden="true" />
                <span>{canManageFarm ? 'Ajustes y Gestión de la Finca' : 'Mi Perfil y Seguridad'}</span>
            </h1>

            {/* Modal nativo de Éxito para Cargas Masivas */}
            <dialog
                {...exitoDialogProps}
                className="settings-dialog"
                aria-labelledby="settings-exito-title"
            >
                <div className="card settings-dialog-card" style={{ textAlign: 'center', border: '1px solid var(--primary)', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                        <div style={{ backgroundColor: 'var(--success-soft-bg)', padding: '16px', borderRadius: '50%' }}>
                            <CheckCircle2 size={44} color="var(--primary)" aria-hidden="true" />
                        </div>
                    </div>
                    <h2 id="settings-exito-title" style={{ marginBottom: '8px', color: 'var(--text-main)' }}>¡Importación Finalizada!</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                        {exitoModalMessage}
                    </p>

                    {reporteCarga && (
                        <div style={{ textAlign: 'left', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
                            <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '14px', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Resumen de Operación</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-main)', fontSize: '1.35rem', fontWeight: 'bold' }}>{reporteCarga.creados}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>CREADOS</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-main)', fontSize: '1.35rem', fontWeight: 'bold' }}>{reporteCarga.actualizados}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>ACTUALIZADOS</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--error)', fontSize: '1.35rem', fontWeight: 'bold' }}>{reporteCarga.omitidos}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>OMITIDOS</div>
                                </div>
                            </div>

                            {reporteCarga.omitidosList.length > 0 && (
                                <>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px' }}>
                                        Chapetas omitidas (por duplicidad):
                                    </div>
                                    <div style={{
                                        backgroundColor: 'var(--error-soft-bg)',
                                        border: '1px solid var(--error-soft-border)',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        color: 'var(--error)',
                                        maxHeight: '100px',
                                        overflowY: 'auto',
                                        wordBreak: 'break-all',
                                        lineHeight: '1.4'
                                    }}>
                                        {reporteCarga.omitidosList.join(', ')}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        autoFocus
                        onClick={closeExitoModal}
                        style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', padding: '12px 24px', fontSize: '1rem', width: '100%' }}
                    >
                        Cerrar Reporte
                    </button>
                </div>
            </dialog>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {canManageFarm && (
                    <nav aria-label="Secciones de configuración">
                        <div className="settings-menu-grid">
                            {sectionCards.map(section => {
                                if (section.isLink) {
                                    return (
                                        <button
                                            type="button"
                                            key={section.id}
                                            onClick={() => navigate('/suscripcion')}
                                            className="settings-menu-card settings-menu-card--link"
                                        >
                                            <span className="settings-menu-card-icon" style={{ color: accentPurple }} aria-hidden="true">
                                                {section.icon}
                                            </span>
                                            <span style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    <span className="settings-menu-card-title">{section.label}</span>
                                                    <span
                                                        className="settings-plan-badge"
                                                        style={{
                                                            background: licenciaInfo?.licencia === 'premium' ? (isLight ? '#f3e8ff' : 'rgba(168, 85, 247, 0.25)') : licenciaInfo?.licencia === 'finca' ? 'var(--info-soft-bg)' : 'var(--warning-soft-bg)',
                                                            color: licenciaInfo?.licencia === 'premium' ? accentPurple : licenciaInfo?.licencia === 'finca' ? 'var(--info)' : 'var(--warning)'
                                                        }}
                                                    >
                                                        {licenciaInfo?.licencia || 'demo'}
                                                    </span>
                                                </span>
                                                <small className="settings-menu-card-desc">{section.desc}</small>
                                            </span>
                                        </button>
                                    );
                                }
                                const isActive = !collapsed[section.id as keyof typeof collapsed];
                                return (
                                    <button
                                        type="button"
                                        key={section.id}
                                        onClick={() => toggleSection(section.id as keyof typeof collapsed)}
                                        aria-expanded={isActive}
                                        aria-controls={`settings-panel-${section.id}`}
                                        className={`settings-menu-card ${isActive ? 'settings-menu-card--active' : ''}`}
                                    >
                                        <span className="settings-menu-card-icon" aria-hidden="true">
                                            {section.icon}
                                        </span>
                                        <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                                            <span className="settings-menu-card-title">{section.label}</span>
                                            <small className="settings-menu-card-desc">{section.desc}</small>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </nav>
                )}

                {!canManageFarm && (
                    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '16px' }}>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>
                                Perfil activo
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                                {role === 'vaquero' ? 'Trabajador / Vaquero' : 'Visualizador / Observador'}
                            </div>
                        </div>
                        <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '10px', background: 'var(--primary-soft-bg)', color: 'var(--primary)', border: '1px solid var(--primary-soft-border)', fontWeight: 600 }}>
                            Acceso de campo
                        </span>
                    </div>
                )}

                {/* Contenido de las Secciones */}
                <div ref={sectionPanelRef} className="settings-section-anchor" style={{ position: 'relative' }}>
                    {isSeguridadOpen && (
                        <section id="settings-panel-seguridad" aria-labelledby="settings-heading-seguridad" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                            <h2 id="settings-heading-seguridad" className="settings-section-heading">
                                <Lock size={20} color="var(--primary)" aria-hidden="true" /> Seguridad de la Cuenta
                            </h2>
                            <form onSubmit={handleUpdatePassword} aria-labelledby="settings-heading-seguridad">
                                {renderInlineStatus('seguridad')}
                                <div className="settings-form-grid-wide" style={{ marginBottom: '20px' }}>
                                    <div className="settings-field">
                                        <label htmlFor="settings-new-password">Nueva Contraseña</label>
                                        <div className="settings-input-affix-wrap" style={{ marginBottom: 0 }}>
                                            <input
                                                id="settings-new-password"
                                                name="new_password"
                                                type={showNewPwd ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                minLength={6}
                                                enterKeyHint="next"
                                                placeholder="Mínimo 6 caracteres"
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                style={{ paddingRight: '52px' }}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPwd(prev => !prev)}
                                                aria-pressed={showNewPwd}
                                                aria-label={showNewPwd ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                                                className="settings-toast-close"
                                                style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                                            >
                                                {showNewPwd ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="settings-field">
                                        <label htmlFor="settings-confirm-password">Confirmar Contraseña</label>
                                        <div className="settings-input-affix-wrap" style={{ marginBottom: 0 }}>
                                            <input
                                                id="settings-confirm-password"
                                                name="confirm_password"
                                                type={showConfirmPwd ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                minLength={6}
                                                enterKeyHint="done"
                                                placeholder="Repite la nueva contraseña"
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                                style={{ paddingRight: '52px' }}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPwd(prev => !prev)}
                                                aria-pressed={showConfirmPwd}
                                                aria-label={showConfirmPwd ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'}
                                                className="settings-toast-close"
                                                style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                                            >
                                                {showConfirmPwd ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button type="submit" disabled={loading}>
                                    {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
                                </button>
                            </form>
                            <PushNotificationsCard />
                        </section>
                    )}

                    {canManageFarm && (
                        <>
                            {!collapsed.datosTecnicos && (
                                <section id="settings-panel-datosTecnicos" aria-labelledby="settings-heading-parametros" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h2 id="settings-heading-parametros" className="settings-section-heading">
                                        <Home size={20} color="var(--primary)" aria-hidden="true" /> Datos Técnicos y Parámetros
                                    </h2>
                                    <form onSubmit={guardarConfiguracionYFinca} aria-labelledby="settings-heading-parametros">
                                        {renderInlineStatus('datosTecnicos')}

                                        <fieldset className="settings-fieldset">
                                            <legend className="settings-legend">Información de la Finca y Costos</legend>
                                            <div className="settings-form-grid">
                                                <div className="settings-field">
                                                    <label htmlFor="settings-area-total"><Maximize size={16} aria-hidden="true" /> Área Total (Ha)</label>
                                                    <input id="settings-area-total" name="area_total" type="text" inputMode="decimal" enterKeyHint="next" value={farmInfo.area_total} onChange={e => setFarmInfo({ ...farmInfo, area_total: sanitizeDecimalInput(e.target.value) })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-area-aprovechable"><CheckCircle2 size={16} aria-hidden="true" /> Área Aprovechable (Ha)</label>
                                                    <input id="settings-area-aprovechable" name="area_aprovechable" type="text" inputMode="decimal" enterKeyHint="next" value={farmInfo.area_aprovechable} onChange={e => setFarmInfo({ ...farmInfo, area_aprovechable: sanitizeDecimalInput(e.target.value) })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-ubicacion"><MapPin size={16} aria-hidden="true" /> Región Climática</label>
                                                    <select id="settings-ubicacion" name="ubicacion" value={farmInfo.ubicacion} onChange={e => setFarmInfo({ ...farmInfo, ubicacion: e.target.value })}>
                                                        <option value="">Seleccione Región...</option>
                                                        <option value="Costa Caribe">Costa Caribe</option>
                                                        <option value="Magdalena Medio">Magdalena Medio</option>
                                                        <option value="Llanos Orientales / Orinoquía">Llanos Orientales</option>
                                                        <option value="Zona Andina / Trópico Alto">Trópico Alto (Zona Andina)</option>
                                                    </select>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-municipio"><MapPin size={16} aria-hidden="true" /> Municipio / Ciudad</label>
                                                    <input id="settings-municipio" name="municipio" type="text" enterKeyHint="next" placeholder="Ej. Montería, Córdoba" value={farmInfo.municipio} onChange={e => setFarmInfo({ ...farmInfo, municipio: e.target.value })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-proposito"><Target size={16} aria-hidden="true" /> Propósito</label>
                                                    <select id="settings-proposito" name="proposito" value={farmInfo.proposito} onChange={e => setFarmInfo({ ...farmInfo, proposito: e.target.value })}>
                                                        <option value="">Seleccione...</option>
                                                        <option value="Doble propósito">Doble propósito</option>
                                                        <option value="producción de carne">Producción de carne</option>
                                                        <option value="Producción de leche">Producción de leche</option>
                                                        <option value="cría">Cría</option>
                                                        <option value="Levante">Levante</option>
                                                    </select>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-peso-entrada-ceba"><Scale size={16} aria-hidden="true" /> Entrada Ceba (kg)</label>
                                                    <input id="settings-peso-entrada-ceba" name="peso_entrada_ceba" type="text" inputMode="decimal" enterKeyHint="next" value={farmInfo.peso_entrada_ceba} onChange={e => setFarmInfo({ ...farmInfo, peso_entrada_ceba: sanitizeDecimalInput(e.target.value) })} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-consumo-dia"><Leaf size={16} aria-hidden="true" /> Consumo Pasto (Kg/Día)</label>
                                                    <input id="settings-consumo-dia" name="consumo_dia_potrero" type="text" inputMode="decimal" enterKeyHint="next" value={farmInfo.consumo_dia_potrero} onChange={(e) => setFarmInfo({ ...farmInfo, consumo_dia_potrero: sanitizeDecimalInput(e.target.value) })} required />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-precio-compra"><Coins size={16} aria-hidden="true" /> Precio Compra (COP/kg)</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <span className="settings-input-prefix" aria-hidden="true">$</span>
                                                        <input
                                                            id="settings-precio-compra"
                                                            name="precio_compra_promedio"
                                                            type="text"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={formatMilesNumber(farmInfo.precio_compra_promedio)}
                                                            onChange={e => setFarmInfo({ ...farmInfo, precio_compra_promedio: unformatMilesNumber(e.target.value) })}
                                                            style={{ paddingLeft: '32px' }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-precio-venta"><DollarSign size={16} aria-hidden="true" /> Precio Venta (COP/kg)</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <span className="settings-input-prefix" aria-hidden="true">$</span>
                                                        <input
                                                            id="settings-precio-venta"
                                                            name="precio_venta_promedio"
                                                            type="text"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={formatMilesNumber(farmInfo.precio_venta_promedio)}
                                                            onChange={e => setFarmInfo({ ...farmInfo, precio_venta_promedio: unformatMilesNumber(e.target.value) })}
                                                            style={{ paddingLeft: '32px' }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-costo-mensual"><CreditCard size={16} aria-hidden="true" /> Costo Mensual por Animal</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <span className="settings-input-prefix" aria-hidden="true">$</span>
                                                        <input
                                                            id="settings-costo-mensual"
                                                            name="costo_mensual_animal"
                                                            type="text"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={formatMilesNumber(farmInfo.costo_mensual_animal)}
                                                            onChange={e => setFarmInfo({ ...farmInfo, costo_mensual_animal: unformatMilesNumber(e.target.value) })}
                                                            style={{ paddingLeft: '32px' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </fieldset>

                                        <fieldset className="settings-fieldset">
                                            <legend className="settings-legend">Participación de Utilidad</legend>
                                            <div className="settings-form-grid">
                                                <div className="settings-field">
                                                    <label htmlFor="settings-part-finca"><Coins size={16} aria-hidden="true" /> % Utilidad Finca / Tenedor</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <input
                                                            id="settings-part-finca"
                                                            name="participacion_utilidad"
                                                            type="number"
                                                            min="1"
                                                            max="99"
                                                            step="1"
                                                            inputMode="numeric"
                                                            enterKeyHint="next"
                                                            value={participacionUtilidad}
                                                            onChange={e => setParticipacionUtilidad(e.target.value)}
                                                            style={{ paddingRight: '38px' }}
                                                        />
                                                        <span className="settings-input-suffix" aria-hidden="true">%</span>
                                                    </div>
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-part-inversionista"><Coins size={16} aria-hidden="true" /> % Utilidad Inversionista (dueño)</label>
                                                    <div className="settings-input-affix-wrap">
                                                        <input
                                                            id="settings-part-inversionista"
                                                            name="participacion_inversionista"
                                                            type="number"
                                                            readOnly
                                                            value={Math.max(1, 100 - (parseInt(participacionUtilidad) || 60))}
                                                            style={{ paddingRight: '38px', cursor: 'default', opacity: 0.65 }}
                                                        />
                                                        <span className="settings-input-suffix" aria-hidden="true">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </fieldset>

                                        <div style={{
                                            background: 'var(--primary-soft-bg)',
                                            border: '1px solid var(--primary-soft-border)',
                                            borderRadius: '12px',
                                            padding: '18px',
                                            marginBottom: '24px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            textAlign: 'center',
                                            gap: '8px'
                                        }}>
                                            <div style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                Punto de Equilibrio Estimado
                                            </div>
                                            <div style={{ fontSize: '2.25rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                                {(() => {
                                                    const costo = parseFloat(farmInfo.costo_mensual_animal) || 0;
                                                    const precio = parseFloat(farmInfo.precio_venta_promedio) || 0;
                                                    const partDecimal = (Math.min(99, Math.max(1, parseInt(participacionUtilidad) || 60))) / 100;
                                                    if (precio === 0) return '0.0';
                                                    const peKgMes = (costo / partDecimal) / precio;
                                                    const val = toDisplayValue(peKgMes, modoLocal);
                                                    return val.toFixed(modoLocal === 'GDP' ? 0 : 1);
                                                })()}
                                                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                                    {modoLocal === 'GDP' ? 'Gr/Día' : 'Kg/Mes'}
                                                </span>
                                            </div>
                                            <p className="settings-helper-text" style={{ margin: 0, maxWidth: '400px' }}>
                                                Adelanto {modoLocal === 'GDP' ? 'diario' : 'mensual'} mínimo requerido por animal para cubrir costos directos e indirectos.
                                            </p>
                                        </div>

                                        <fieldset className="settings-subcard" style={{ borderStyle: 'solid' }}>
                                            <legend className="settings-legend" style={{ marginBottom: '8px', paddingInline: '6px' }}>Rangos de Peso (Dashboard y Despachos)</legend>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                                <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Scale size={18} color="var(--primary)" aria-hidden="true" />
                                                    Cortes de Peso de la Finca
                                                </h3>
                                            </div>

                                            <p className="settings-helper-text" style={{ marginTop: 0, marginBottom: '16px' }}>
                                                Selecciona el modelo productivo o personaliza los cortes de peso. La tabla del Dashboard y las alertas de despacho se ajustarán automáticamente.
                                            </p>

                                            <div className="settings-form-grid" style={{ marginBottom: '18px' }}>
                                                <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                                                    <label htmlFor="settings-preset-peso">
                                                        <Target size={16} aria-hidden="true" /> Plantilla / Modelo Productivo
                                                    </label>
                                                    <select
                                                        id="settings-preset-peso"
                                                        name="preset_peso"
                                                        value={farmInfo.preset_peso}
                                                        onChange={(e) => {
                                                            const selectedId = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item => item.id === selectedId);
                                                            if (p && selectedId !== 'personalizado') {
                                                                setFarmInfo({
                                                                    ...farmInfo,
                                                                    preset_peso: selectedId,
                                                                    corte_peso_1: p.corte1.toString(),
                                                                    corte_peso_2: p.corte2.toString(),
                                                                    corte_peso_3: p.corte3.toString()
                                                                });
                                                            } else {
                                                                setFarmInfo({ ...farmInfo, preset_peso: 'personalizado' });
                                                            }
                                                        }}
                                                    >
                                                        {PRESETS_RANGOS_PESO.map(pr => (
                                                            <option key={pr.id} value={pr.id}>{pr.nombre}</option>
                                                        ))}
                                                    </select>
                                                    {PRESETS_RANGOS_PESO.find(p => p.id === farmInfo.preset_peso)?.descripcion && (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: '-12px', marginBottom: '8px', display: 'block' }}>
                                                            💡 {PRESETS_RANGOS_PESO.find(p => p.id === farmInfo.preset_peso)?.descripcion}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="settings-field">
                                                    <label htmlFor="settings-corte-1">Corte 1: Adaptación / Inicio (kg)</label>
                                                    <input
                                                        id="settings-corte-1"
                                                        name="corte_peso_1"
                                                        type="number"
                                                        step="1"
                                                        inputMode="numeric"
                                                        enterKeyHint="next"
                                                        value={farmInfo.corte_peso_1}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item =>
                                                                item.id !== 'personalizado' &&
                                                                item.corte1.toString() === val &&
                                                                item.corte2.toString() === farmInfo.corte_peso_2 &&
                                                                item.corte3.toString() === farmInfo.corte_peso_3
                                                            );
                                                            setFarmInfo({
                                                                ...farmInfo,
                                                                corte_peso_1: val,
                                                                preset_peso: p ? p.id : 'personalizado'
                                                            });
                                                        }}
                                                        required
                                                    />
                                                </div>

                                                <div className="settings-field">
                                                    <label htmlFor="settings-corte-2">Corte 2: Desarrollo Medio (kg)</label>
                                                    <input
                                                        id="settings-corte-2"
                                                        name="corte_peso_2"
                                                        type="number"
                                                        step="1"
                                                        inputMode="numeric"
                                                        enterKeyHint="next"
                                                        value={farmInfo.corte_peso_2}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item =>
                                                                item.id !== 'personalizado' &&
                                                                item.corte1.toString() === farmInfo.corte_peso_1 &&
                                                                item.corte2.toString() === val &&
                                                                item.corte3.toString() === farmInfo.corte_peso_3
                                                            );
                                                            setFarmInfo({
                                                                ...farmInfo,
                                                                corte_peso_2: val,
                                                                preset_peso: p ? p.id : 'personalizado'
                                                            });
                                                        }}
                                                        required
                                                    />
                                                </div>

                                                <div className="settings-field">
                                                    <label htmlFor="settings-corte-3" style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                                        Corte 3: Meta Venta / Despacho (kg)
                                                    </label>
                                                    <input
                                                        id="settings-corte-3"
                                                        name="corte_peso_3"
                                                        type="number"
                                                        step="1"
                                                        inputMode="numeric"
                                                        enterKeyHint="next"
                                                        value={farmInfo.corte_peso_3}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const p = PRESETS_RANGOS_PESO.find(item =>
                                                                item.id !== 'personalizado' &&
                                                                item.corte1.toString() === farmInfo.corte_peso_1 &&
                                                                item.corte2.toString() === farmInfo.corte_peso_2 &&
                                                                item.corte3.toString() === val
                                                            );
                                                            setFarmInfo({
                                                                ...farmInfo,
                                                                corte_peso_3: val,
                                                                preset_peso: p ? p.id : 'personalizado'
                                                            });
                                                        }}
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ background: 'var(--surface-inset)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Vista Previa en Dashboard:
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: '8px' }}>
                                                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fila 1 (Entrada)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>&lt; {farmInfo.corte_peso_1 || 0} kg</div>
                                                    </div>
                                                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fila 2 (Levante)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{(parseFloat(farmInfo.corte_peso_1) || 0) + 1} - {farmInfo.corte_peso_2 || 0} kg</div>
                                                    </div>
                                                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fila 3 (Pre-Salida)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{(parseFloat(farmInfo.corte_peso_2) || 0) + 1} - {farmInfo.corte_peso_3 || 0} kg</div>
                                                    </div>
                                                    <div style={{ background: 'var(--success-soft-bg)', padding: '8px 10px', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--success-soft-border)' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Fila 4 (Despacho 🚚)</div>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--success)', fontSize: '0.9rem' }}>&gt; {farmInfo.corte_peso_3 || 0} kg</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </fieldset>

                                        <fieldset className="settings-fieldset" style={{ marginBottom: 0 }}>
                                            <legend className="settings-legend">Umbrales (Semáforo {getModoLabel(modoLocal)})</legend>

                                            <div className="settings-unidad-row">
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unidad de ganancia:</span>
                                                <div className="settings-unidad-toggle" role="group" aria-label="Unidad de ganancia">
                                                    {(['GMP', 'GDP'] as ModoGanancia[]).map(m => (
                                                        <button
                                                            key={m}
                                                            type="button"
                                                            aria-pressed={modoLocal === m}
                                                            className="settings-unidad-btn"
                                                            onClick={() => {
                                                                const medioKgMes = toStorageValue(parseDecimalInput(umbralMedioDisplay) || 10, modoLocal);
                                                                const altoKgMes = toStorageValue(parseDecimalInput(umbralAltoDisplay) || 20, modoLocal);
                                                                setUmbralMedioDisplay(toDisplayValue(medioKgMes, m).toFixed(m === 'GDP' ? 0 : 1));
                                                                setUmbralAltoDisplay(toDisplayValue(altoKgMes, m).toFixed(m === 'GDP' ? 0 : 1));
                                                                setModoLocal(m);
                                                            }}
                                                            style={{
                                                                background: modoLocal === m ? 'var(--primary)' : 'transparent',
                                                                color: modoLocal === m ? 'var(--on-primary)' : 'var(--text-muted)'
                                                            }}
                                                        >
                                                            {m} <span style={{ fontWeight: 400, fontSize: '0.75rem' }}>({m === 'GMP' ? 'kg/mes' : 'gr/día'})</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="settings-form-grid">
                                                <div className="settings-field">
                                                    <label htmlFor="settings-umbral-rojo">Límite Superior Rojo ({getUnidadLabel(modoLocal)})</label>
                                                    <input id="settings-umbral-rojo" name="umbral_medio" type="text" inputMode="decimal" enterKeyHint="next" value={umbralMedioDisplay} onChange={(e) => setUmbralMedioDisplay(sanitizeDecimalInput(e.target.value))} />
                                                </div>
                                                <div className="settings-field">
                                                    <label htmlFor="settings-umbral-amarillo">Límite Superior Amarillo ({getUnidadLabel(modoLocal)})</label>
                                                    <input id="settings-umbral-amarillo" name="umbral_alto" type="text" inputMode="decimal" enterKeyHint="done" value={umbralAltoDisplay} onChange={(e) => setUmbralAltoDisplay(sanitizeDecimalInput(e.target.value))} />
                                                </div>
                                            </div>
                                        </fieldset>

                                        <div className="settings-sticky-save-bar">
                                            <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)', border: '1px solid var(--primary)' }}>
                                                {loading ? 'Guardando...' : 'Guardar Información'}
                                            </button>
                                        </div>
                                    </form>

                                    <SettingsPluviometrosSection
                                        fincaId={fincaId}
                                        renderInlineStatus={renderInlineStatus}
                                        onFeedback={showSectionFeedback}
                                        onClearInlineStatus={() => setInlineStatus(null)}
                                    />
                                </section>
                            )}

                            {!collapsed.usuarios && (
                                <SettingsUsersSection
                                    fincaId={fincaId}
                                    fincasAdmin={fincasAdmin}
                                    loading={loading}
                                    onSetLoading={setLoading}
                                />
                            )}

                            {!collapsed.contactosNegocio && (
                                <SettingsBusinessListsSection
                                    fincaId={fincaId}
                                    loading={loading}
                                    onSetLoading={setLoading}
                                    renderInlineStatus={renderInlineStatus}
                                    onFeedback={showSectionFeedback}
                                    onClearInlineStatus={() => setInlineStatus(null)}
                                />
                            )}

                            {!collapsed.cargasMasivas && (
                                <SettingsBulkUploadSection
                                    fincaId={fincaId}
                                    onSetLoading={setLoading}
                                    onSetImportProgress={setImportProgress}
                                    onClearInlineStatus={() => setInlineStatus(null)}
                                    onShowReporte={(msg, reporte) => {
                                        setReporteCarga(reporte);
                                        setExitoModalMessage(msg);
                                    }}
                                    refreshLicencia={refreshLicencia}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            {loading && (
                <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[3000] p-4" style={{ backgroundColor: 'var(--backdrop-scrim)' }}>
                    <div className="rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}>
                        <div className="relative w-20 h-20 mx-auto mb-6">
                            <div className="absolute inset-0 border-4 rounded-full" style={{ borderColor: 'var(--primary-soft-border)' }}></div>
                            <div className="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}></div>
                        </div>
                        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-main)' }}>Procesando...</h3>
                        <p className="mb-6" style={{ color: 'var(--text-muted)' }}>Por favor espera un momento mientras guardamos los datos.</p>

                        {importProgress && (
                            <div className="w-full rounded-full h-3 mb-2 overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                                <div
                                    className="h-full transition-all duration-300 ease-out"
                                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%`, backgroundColor: 'var(--primary)' }}
                                ></div>
                            </div>
                        )}
                        {importProgress && (
                            <p className="text-sm font-medium" style={{ color: 'var(--primary-light)' }}>
                                {importProgress.current} de {importProgress.total} registros
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
