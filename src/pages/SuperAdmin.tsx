import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import { getLocalIsoDate } from '../utils/dateUtils';
import './SuperAdmin.css';
import {
    Building2, UserPlus, ShieldCheck, MapPin, Users,
    ChevronDown, ChevronUp, BarChart3,
    Eye, Wrench, Globe, Trash2, AlertTriangle,
    Award, Calendar, Edit3, Clock, TrendingUp,
    Upload, Download, FileText, CheckCircle2,
    Mail, Search, AlertCircle, X
} from 'lucide-react';
import { CowIcon } from '../components/CowIcon';

type TipoLicencia = 'demo' | 'finca' | 'premium';
type PeriodoLicencia = 'mensual' | 'semestral' | 'anual' | 'indefinido' | 'personalizado';
type EstadoSemaforo = 'activa' | 'reciente' | 'en_riesgo' | 'inactiva_30d' | 'cliente_pago';
type FiltroCuenta = 'todos' | 'inactiva_30d' | 'en_riesgo' | 'activa' | 'sin_confirmar' | 'cliente_pago';

// Calcula la fecha de vencimiento sumando el periodo a la fecha de inicio
const calculateVencimiento = (startDateStr: string, periodo: PeriodoLicencia): string => {
    if (periodo === 'indefinido') return '';
    if (!startDateStr) startDateStr = getLocalIsoDate();

    const [y, m, d] = startDateStr.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);

    if (periodo === 'mensual') {
        date.setMonth(date.getMonth() + 1);
    } else if (periodo === 'semestral') {
        date.setMonth(date.getMonth() + 6);
    } else if (periodo === 'anual') {
        date.setFullYear(date.getFullYear() + 1);
    }

    const resY = date.getFullYear();
    const resM = String(date.getMonth() + 1).padStart(2, '0');
    const resD = String(date.getDate()).padStart(2, '0');
    return `${resY}-${resM}-${resD}`;
};

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
    adminEmail: string;
    emailConfirmado: boolean;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    licencia: TipoLicencia;
    limiteAnimales: number;
    fechaInicioLicencia: string | null;
    fechaVencimientoLicencia: string | null;
    creadoEn: string;
    idDueño: string;
    fincas: FincaInfo[];
    totalFincas: number;
    totalVaqueros: number;
    totalObservadores: number;
    totalAnimales: number;
    diasRegistro: number;
    esHuerfano: boolean;
}

export default function SuperAdmin() {
    const { isSuperAdmin, loading: authLoading } = useAuth();
    const { theme } = useTheme();
    const { confirmAction, showAlert, toast } = useFeedback();
    const isLight = theme === 'light';
    const accentPurple = isLight ? '#6d28d9' : '#a78bfa';
    const accentPurpleSoft = isLight ? '#7c3aed' : '#c084fc';
    const purpleSoftBg = isLight ? '#f3e8ff' : 'rgba(124, 58, 237, 0.14)';
    const purpleSubtleBg = isLight ? '#faf5ff' : 'rgba(124, 58, 237, 0.05)';
    const purpleSoftBorder = isLight ? '#c084fc' : 'rgba(124, 58, 237, 0.35)';
    const accentBlue = isLight ? '#0369a1' : '#38bdf8';
    const accentBlueSoft = isLight ? '#1d4ed8' : '#60a5fa';
    const accentBlueBadge = isLight ? '#1e40af' : '#93c5fd';
    const accentGreen = isLight ? 'var(--success)' : '#4ade80';
    const accentAmber = isLight ? '#b45309' : '#ffb74d';
    const accentYellow = isLight ? '#a16207' : '#facc15';
    const accentOrange = isLight ? '#c2410c' : '#fb923c';
    const accentRed = isLight ? 'var(--error)' : '#f87171';

    const [activeTab, setActiveTab] = useState<'dashboard' | 'crear' | 'precios'>('dashboard');
    const [cuentas, setCuentas] = useState<CuentaAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
    const [filtroActivo, setFiltroActivo] = useState<FiltroCuenta>('todos');
    const [busqueda, setBusqueda] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{
        type: 'org' | 'finca';
        id: string;
        idDueño?: string;
        nombre: string;
        email?: string;
        esInactiva?: boolean;
    } | null>(null);

    // Modal de edición de Licencia
    const [editingLicenciaOrg, setEditingLicenciaOrg] = useState<CuentaAdmin | null>(null);
    const [formLicencia, setFormLicencia] = useState<TipoLicencia>('demo');
    const [formLimite, setFormLimite] = useState<number>(40);
    const [formFechaInicio, setFormFechaInicio] = useState<string>('');
    const [formPeriodo, setFormPeriodo] = useState<PeriodoLicencia>('anual');
    const [formVencimiento, setFormVencimiento] = useState<string>('');
    const [savingLicencia, setSavingLicencia] = useState(false);

    // Formulario de creación
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [org, setOrg] = useState('');
    const [finca, setFinca] = useState('');
    const [ubicacion, setUbicacion] = useState('');
    const [licenciaInicial, setLicenciaInicial] = useState<TipoLicencia>('demo');
    const [loadingForm, setLoadingForm] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Precios de mercado state
    const [preciosRegistrados, setPreciosRegistrados] = useState<any[]>([]);
    const [loadingPrecios, setLoadingPrecios] = useState(false);
    const [formFechaBoletin, setFormFechaBoletin] = useState(getLocalIsoDate());
    const [formRegion, setFormRegion] = useState('puerto_berrio');
    const [formFuente, setFormFuente] = useState('Sugaberrío');
    const [preciosCategorias, setPreciosCategorias] = useState<Record<string, string>>({
        ML: '', MC: '', MG: '', HL: '', HV: '', VP: '', VH: ''
    });
    const [savingPrecios, setSavingPrecios] = useState(false);
    const [msjPrecios, setMsjPrecios] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

    // Carga masiva CSV
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvPreviewRows, setCsvPreviewRows] = useState<any[]>([]);
    const [uploadingCsv, setUploadingCsv] = useState(false);

    useEffect(() => {
        if (isSuperAdmin) {
            fetchDashboardData();
            fetchPreciosMercado();
        }
    }, [isSuperAdmin]);

    const fetchPreciosMercado = async () => {
        setLoadingPrecios(true);
        const { data } = await supabase
            .from('precios_mercado_ganado')
            .select('*')
            .order('fecha_boletin', { ascending: false });
        if (data) setPreciosRegistrados(data);
        setLoadingPrecios(false);
    };

    const handleSaveManualPrecios = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingPrecios(true);
        setMsjPrecios(null);
        try {
            const fechaParts = formFechaBoletin.split('-');
            const d = new Date(parseInt(fechaParts[0]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[2]));
            const year = d.getFullYear();
            const startOfYear = new Date(year, 0, 1);
            const pastDays = (d.getTime() - startOfYear.getTime()) / 86400000;
            const semana_ano = Math.max(1, Math.ceil((pastDays + startOfYear.getDay() + 1) / 7));

            const rowsToInsert = Object.entries(preciosCategorias)
                .filter(([, val]) => val && parseFloat(val) > 0)
                .map(([cat, val]) => ({
                    fecha_boletin: formFechaBoletin,
                    semana_ano,
                    year,
                    region: formRegion,
                    fuente_informacion: formFuente,
                    categoria_animal: cat,
                    precio_promedio_kg: parseFloat(val)
                }));

            if (rowsToInsert.length === 0) {
                throw new Error('Ingrese al menos un precio válido por categoría.');
            }

            const { error } = await supabase
                .from('precios_mercado_ganado')
                .upsert(rowsToInsert, { onConflict: 'region,fecha_boletin,categoria_animal' });

            if (error) throw error;

            setMsjPrecios({ tipo: 'exito', texto: `¡Se guardaron ${rowsToInsert.length} precios para la plaza ${formRegion.toUpperCase()}!` });
            setPreciosCategorias({ ML: '', MC: '', MG: '', HL: '', HV: '', VP: '', VH: '' });
            await fetchPreciosMercado();
        } catch (err: any) {
            setMsjPrecios({ tipo: 'error', texto: err.message || 'Error al guardar precios.' });
        } finally {
            setSavingPrecios(false);
        }
    };

    const downloadCSVTemplate = () => {
        const csvHeader = "fecha_boletin,region,fuente_informacion,categoria_animal,precio_promedio_kg\n";
        const sampleData = [
            "2026-01-05,puerto_berrio,Sugaberrío,ML,9500",
            "2026-01-05,puerto_berrio,Sugaberrío,MC,8900",
            "2026-01-05,puerto_berrio,Sugaberrío,MG,8500",
            "2026-01-05,puerto_berrio,Sugaberrío,HL,8700",
            "2026-01-05,puerto_berrio,Sugaberrío,HV,7800",
            "2026-01-05,puerto_berrio,Sugaberrío,VP,6900",
            "2026-01-05,puerto_berrio,Sugaberrío,VH,6700",
            "2026-01-05,monteria,Subastar,ML,9600",
            "2026-01-05,monteria,Subastar,MG,8600"
        ].join("\n");
        const blob = new Blob([csvHeader + sampleData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "plantilla_precios_mercado_2026.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Calcula número de semana ISO 8601 de forma robusta
    const getISOWeek = (date: Date): number => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvFile(file);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;

            // Detectar separador automáticamente: coma o punto y coma (Excel español)
            const firstLine = text.split(/\r?\n/)[0] || '';
            const separator = firstLine.includes(';') ? ';' : ',';

            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length <= 1) return;

            // Normalizar headers: quitar BOM, tildes, espacios y pasar a minúsculas
            const headers = lines[0].split(separator).map(h =>
                h.trim().toLowerCase()
                    .replace(/^\uFEFF/, '')       // BOM de Excel
                    .replace(/[áàä]/g, 'a')
                    .replace(/[éèë]/g, 'e')
                    .replace(/[íìï]/g, 'i')
                    .replace(/[óòö]/g, 'o')
                    .replace(/[úùü]/g, 'u')
            );

            // Mapear índices de columnas por nombre normalizado
            const idx: Record<string, number> = {};
            headers.forEach((h, i) => { idx[h] = i; });

            const colFecha    = idx['fecha_boletin'] ?? 0;
            const colRegion   = idx['region'] ?? 1;
            const colFuente   = idx['fuente_informacion'] ?? 2;
            const colCateg    = idx['categoria_animal'] ?? 3;
            const colPrecio   = idx['precio_promedio_kg'] ?? 4;

            const rows: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length < 5) continue;

                const fecha_boletin    = cols[colFecha];
                const region           = (cols[colRegion] || '').toLowerCase().trim();
                const fuente_informacion = cols[colFuente] || '';
                const categoria_animal = (cols[colCateg] || '').toUpperCase().trim();
                const precio_promedio_kg = parseFloat((cols[colPrecio] || '').replace(',', '.'));

                if (!fecha_boletin || !region || !categoria_animal || isNaN(precio_promedio_kg)) continue;

                // Parsear fecha YYYY-MM-DD
                const [y, m, d2] = fecha_boletin.split('-').map(Number);
                const dateObj = new Date(y, (m || 1) - 1, d2 || 1);
                const year = dateObj.getFullYear() || 2026;
                const semana_ano = getISOWeek(dateObj);

                rows.push({ fecha_boletin, semana_ano, year, region, fuente_informacion, categoria_animal, precio_promedio_kg });
            }
            setCsvPreviewRows(rows);
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleUploadCSV = async () => {
        if (csvPreviewRows.length === 0) return;
        setUploadingCsv(true);
        setMsjPrecios(null);
        try {
            const { error } = await supabase
                .from('precios_mercado_ganado')
                .upsert(csvPreviewRows, { onConflict: 'region,fecha_boletin,categoria_animal' });

            if (error) throw error;

            setMsjPrecios({ tipo: 'exito', texto: `¡Se importaron ${csvPreviewRows.length} precios de mercado correctamente!` });
            setCsvFile(null);
            setCsvPreviewRows([]);
            await fetchPreciosMercado();
        } catch (err: any) {
            setMsjPrecios({ tipo: 'error', texto: 'Error al importar CSV: ' + err.message });
        } finally {
            setUploadingCsv(false);
        }
    };

    const handleDeletePrecioRow = async (id: string) => {
        const confirmed = await confirmAction('¿Eliminar este registro de precio de mercado?', {
            title: 'Eliminar precio',
            confirmLabel: 'Sí, eliminar',
            destructive: true,
        });
        if (!confirmed) return;
        await supabase.from('precios_mercado_ganado').delete().eq('id', id);
        await fetchPreciosMercado();
        toast('Registro eliminado.', 'success');
    };

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

    const handleOpenEditLicencia = (cuenta: CuentaAdmin) => {
        setEditingLicenciaOrg(cuenta);
        setFormLicencia(cuenta.licencia);
        setFormLimite(cuenta.limiteAnimales);

        const inicioStr = cuenta.fechaInicioLicencia ? cuenta.fechaInicioLicencia.substring(0, 10) : getLocalIsoDate();
        setFormFechaInicio(inicioStr);

        if (cuenta.licencia === 'demo' || !cuenta.fechaVencimientoLicencia) {
            setFormPeriodo('indefinido');
            setFormVencimiento('');
        } else {
            const vencStr = cuenta.fechaVencimientoLicencia.substring(0, 10);
            setFormVencimiento(vencStr);
            setFormPeriodo('anual');
        }
    };

    const handlePeriodoChange = (newPeriodo: PeriodoLicencia) => {
        setFormPeriodo(newPeriodo);
        if (newPeriodo !== 'personalizado') {
            const calculated = calculateVencimiento(formFechaInicio, newPeriodo);
            setFormVencimiento(calculated);
        }
    };

    const handleFechaInicioChange = (newInicio: string) => {
        setFormFechaInicio(newInicio);
        if (formLicencia !== 'demo' && formPeriodo !== 'personalizado' && formPeriodo !== 'indefinido') {
            const calculated = calculateVencimiento(newInicio, formPeriodo);
            setFormVencimiento(calculated);
        }
    };

    const handleSelectLicenciaChange = (newLic: TipoLicencia) => {
        setFormLicencia(newLic);
        if (newLic === 'demo') {
            setFormLimite(40);
            setFormPeriodo('indefinido');
            setFormVencimiento('');
        } else if (newLic === 'finca') {
            setFormLimite(500);
            if (formPeriodo === 'indefinido') {
                setFormPeriodo('anual');
                setFormVencimiento(calculateVencimiento(formFechaInicio, 'anual'));
            }
        } else if (newLic === 'premium') {
            setFormLimite(999999);
            if (formPeriodo === 'indefinido') {
                setFormPeriodo('anual');
                setFormVencimiento(calculateVencimiento(formFechaInicio, 'anual'));
            }
        }
    };

    const handleSaveLicencia = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLicenciaOrg) return;
        setSavingLicencia(true);
        try {
            const isDemo = formLicencia === 'demo';
            const isIndefinido = isDemo || formPeriodo === 'indefinido' || !formVencimiento;

            const updates: any = {
                licencia: formLicencia,
                limite_animales: formLimite,
                fecha_inicio_licencia: formFechaInicio ? new Date(formFechaInicio + 'T00:00:00').toISOString() : null,
                fecha_vencimiento_licencia: isIndefinido
                    ? null
                    : new Date(formVencimiento + 'T23:59:59').toISOString()
            };

            const { error } = await supabase
                .from('organizaciones')
                .update(updates)
                .eq('id', editingLicenciaOrg.orgId);

            if (error) throw error;

            setEditingLicenciaOrg(null);
            await fetchDashboardData();
            toast('Licencia actualizada correctamente.', 'success');
        } catch (err: any) {
            await showAlert('Error al guardar la licencia: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setSavingLicencia(false);
        }
    };

    const handleDeleteFinca = async (fincaId: string) => {
        setDeletingId(fincaId);
        try {
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
            toast('Finca eliminada.', 'success');
        } catch (err: any) {
            await showAlert('Error eliminando finca: ' + err.message, { title: 'Error', variant: 'error' });
        } finally {
            setDeletingId(null);
        }
    };

    const handleDeleteOrg = async (orgId: string, idDueño?: string) => {
        setDeletingId(orgId);
        try {
            const isRealOrg = orgId && orgId.length > 20 && !orgId.startsWith('dummy');
            const { error } = await supabase.rpc('eliminar_cuenta_completa_superadmin', {
                p_org_id: isRealOrg ? orgId : null,
                p_user_id: idDueño || null
            });
            if (error) throw error;
            setConfirmDelete(null);
            setExpandedOrg(null);
            await fetchDashboardData();
            toast('Cuenta eliminada.', 'success');
        } catch (err: any) {
            await showAlert('Error eliminando cuenta: ' + err.message, { title: 'Error', variant: 'error' });
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

            // Si se seleccionó una licencia distinta a demo, la actualizamos
            if (licenciaInicial !== 'demo') {
                const { data: createdOrg } = await supabase
                    .from('organizaciones')
                    .select('id')
                    .eq('nombre', org)
                    .order('creado_en', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (createdOrg) {
                    let limitVal = 40;
                    if (licenciaInicial === 'finca') limitVal = 500;
                    else if (licenciaInicial === 'premium') limitVal = 999999;

                    await supabase
                        .from('organizaciones')
                        .update({ licencia: licenciaInicial, limite_animales: limitVal })
                        .eq('id', createdOrg.id);
                }
            }

            setMsjExito(`¡Cuenta ${email} creada correctamente con plan ${licenciaInicial.toUpperCase()}!`);
            setEmail(''); setPassword(''); setOrg(''); setFinca(''); setUbicacion(''); setLicenciaInicial('demo');
            await fetchDashboardData();
            setActiveTab('dashboard');
        } catch (err: any) {
            setMsjError(err.message || 'Error no controlado');
        } finally {
            setLoadingForm(false);
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
                onClick={(e) => { e.stopPropagation(); handleOpenEditLicencia(cuenta); }}
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

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'N/A';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return 'N/A';
        }
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

    // Lógica del semáforo para cuentas demo y licencias
    const getEstadoSemaforo = (cuenta: CuentaAdmin) => {
        if (cuenta.licencia !== 'demo') {
            return {
                tipo: 'cliente_pago' as EstadoSemaforo,
                label: 'Cliente Pago',
                sublabel: cuenta.licencia === 'premium' ? 'Plan Premium' : 'Plan Finca',
                color: accentPurpleSoft,
                bg: purpleSoftBg,
                border: purpleSoftBorder,
                icon: '💎'
            };
        }

        if (cuenta.totalAnimales > 0) {
            return {
                tipo: 'activa' as EstadoSemaforo,
                label: 'Demo Activa',
                sublabel: `${cuenta.totalAnimales} animales`,
                color: accentGreen,
                bg: 'var(--success-soft-bg)',
                border: 'var(--success-soft-border)',
                icon: '🟢'
            };
        }

        if (cuenta.diasRegistro < 15) {
            return {
                tipo: 'reciente' as EstadoSemaforo,
                label: 'En Prueba',
                sublabel: cuenta.diasRegistro === 0 ? 'Hoy' : `Hace ${cuenta.diasRegistro}d`,
                color: accentYellow,
                bg: 'var(--warning-soft-bg)',
                border: 'var(--warning-soft-border)',
                icon: '🟡'
            };
        }

        if (cuenta.diasRegistro <= 30) {
            const diasRestantes = 30 - cuenta.diasRegistro;
            return {
                tipo: 'en_riesgo' as EstadoSemaforo,
                label: 'En Riesgo',
                sublabel: `${diasRestantes}d restantes`,
                color: accentOrange,
                bg: 'var(--warning-soft-bg)',
                border: 'var(--warning-soft-border)',
                icon: '🟠'
            };
        }

        return {
            tipo: 'inactiva_30d' as EstadoSemaforo,
            label: 'Para Inactivar',
            sublabel: `+${cuenta.diasRegistro}d sin ganado`,
            color: accentRed,
            bg: 'var(--error-soft-bg)',
            border: 'var(--error-soft-border)',
            icon: '🔴'
        };
    };

    const renderSemaforoBadge = (cuenta: CuentaAdmin) => {
        const sem = getEstadoSemaforo(cuenta);
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
    const numInactivas30d = cuentas.filter(c => getEstadoSemaforo(c).tipo === 'inactiva_30d').length;
    const numEnRiesgo = cuentas.filter(c => getEstadoSemaforo(c).tipo === 'en_riesgo').length;
    const numSinConfirmar = cuentas.filter(c => !c.emailConfirmado).length;
    const numActivas = cuentas.filter(c => getEstadoSemaforo(c).tipo === 'activa').length;
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
        const sem = getEstadoSemaforo(c);
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
                                        const semaforo = getEstadoSemaforo(cuenta);
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
                                                            <span>Hace {cuenta.diasRegistro}d ({formatDate(cuenta.creadoEn)})</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', color: accentBlueSoft }}>
                                                            <Eye size={11} />
                                                            <span>Login: {cuenta.lastSignInAt ? formatDate(cuenta.lastSignInAt) : 'Nunca'}</span>
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
                                                                onClick={() => handleOpenEditLicencia(cuenta)}
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
                                        const semaforo = getEstadoSemaforo(cuenta);
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
                                                        <span>Login: {cuenta.lastSignInAt ? formatDate(cuenta.lastSignInAt) : 'Nunca'}</span>
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
                                                            onClick={() => handleOpenEditLicencia(cuenta)}
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
                <div style={{ position: 'fixed', inset: 0, background: 'var(--backdrop-scrim)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--surface)', border: `1px solid ${purpleSoftBorder}`, borderRadius: '16px', padding: '28px', maxWidth: '460px', width: '100%', boxShadow: 'var(--shadow-popover)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <Award size={24} color={accentPurple} />
                            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem' }}>Gestionar Licencia</h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 20px' }}>
                            Organización: <strong style={{ color: 'var(--text-main)' }}>{editingLicenciaOrg.orgNombre}</strong>
                        </p>

                        <form onSubmit={handleSaveLicencia}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                    Tipo de Plan
                                </label>
                                <select
                                    value={formLicencia}
                                    onChange={e => handleSelectLicenciaChange(e.target.value as TipoLicencia)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                                >
                                    <option value="demo">Demo (Máx. 40 animales, 1 finca, 1 vaquero)</option>
                                    <option value="finca">Finca (Máx. 500 animales, 1 finca, 1 vaquero + 1 observador)</option>
                                    <option value="premium">Premium (Ilimitado animales, fincas y roles)</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                    Límite Máximo de Animales
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={formLimite}
                                    onChange={e => setFormLimite(Number(e.target.value))}
                                    required
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                                />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                    Use 999999 o valor alto para representar animales ilimitados.
                                </span>
                            </div>

                            {/* Fecha de Inicio de Vigencia */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                    Fecha de Inicio de Vigencia
                                </label>
                                <input
                                    type="date"
                                    value={formFechaInicio}
                                    onChange={e => handleFechaInicioChange(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                                />
                            </div>

                            {/* Periodo de Licencia Droplist */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                    Periodo de Licencia
                                </label>
                                <select
                                    value={formLicencia === 'demo' ? 'indefinido' : formPeriodo}
                                    onChange={e => handlePeriodoChange(e.target.value as PeriodoLicencia)}
                                    disabled={formLicencia === 'demo'}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: formLicencia === 'demo' ? 'var(--surface-inset)' : 'var(--bg-input)', border: '1px solid var(--border-input)', color: formLicencia === 'demo' ? 'var(--text-muted)' : 'var(--text-main)', fontSize: '0.9rem', cursor: formLicencia === 'demo' ? 'not-allowed' : 'pointer', marginBottom: 0 }}
                                >
                                    <option value="indefinido">Sin vencimiento (Ilimitado / Vitalicio)</option>
                                    <option value="mensual">Mensual (+1 Mes)</option>
                                    <option value="semestral">Semestral (+6 Meses)</option>
                                    <option value="anual">Anual (+1 Año)</option>
                                    <option value="personalizado">Personalizado (Fecha manual)</option>
                                </select>
                                {formLicencia === 'demo' && (
                                    <span style={{ fontSize: '0.72rem', color: accentAmber, marginTop: '4px', display: 'block' }}>
                                        ℹ️ Las cuentas Demo siempre tienen vigencia indefinida (sin fecha de vencimiento).
                                    </span>
                                )}
                            </div>

                            {/* Preview / Input de Fecha de Vencimiento */}
                            {formLicencia !== 'demo' && formPeriodo === 'personalizado' ? (
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                        Fecha de Vencimiento Manual
                                    </label>
                                    <input
                                        type="date"
                                        value={formVencimiento}
                                        onChange={e => setFormVencimiento(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: 0 }}
                                    />
                                </div>
                            ) : (formLicencia === 'demo' || formPeriodo === 'indefinido') ? (
                                <div style={{ marginBottom: '24px', background: 'var(--success-soft-bg)', border: '1px solid var(--success-soft-border)', padding: '12px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontSize: '0.82rem', fontWeight: 600 }}>
                                    <CheckCircle2 size={16} />
                                    <span>Plan activo sin fecha límite de expiración (Vigencia Indefinida).</span>
                                </div>
                            ) : (
                                <div style={{ marginBottom: '24px', background: purpleSoftBg, border: `1px solid ${purpleSoftBorder}`, padding: '12px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentPurpleSoft }}>
                                        <Calendar size={16} />
                                        <span>Fecha de Vencimiento Calculada:</span>
                                    </div>
                                    <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                        {formatDate(formVencimiento)}
                                    </strong>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setEditingLicenciaOrg(null)}
                                    disabled={savingLicencia}
                                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingLicencia}
                                    style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#7c3aed', color: 'white', cursor: savingLicencia ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    {savingLicencia ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* === CONFIRM DELETE MODAL === */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--backdrop-scrim)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--surface)', border: `1px solid ${confirmDelete.esInactiva ? 'var(--error)' : 'var(--error-soft-border)'}`, borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-popover)' }}>
                        <div style={{ background: 'var(--error-soft-bg)', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <AlertTriangle size={28} color="var(--error)" />
                        </div>
                        <h3 style={{ margin: '0 0 8px', color: 'var(--text-main)', fontSize: '1.2rem' }}>
                            {confirmDelete.esInactiva
                                ? '¿Inactivar / Eliminar cuenta demo?'
                                : `¿Eliminar ${confirmDelete.type === 'org' ? 'organización' : 'finca'}?`}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', margin: '0 0 4px', fontSize: '1rem' }}>
                            <strong style={{ color: 'var(--text-main)' }}>{confirmDelete.nombre}</strong>
                        </p>
                        {confirmDelete.email && (
                            <p style={{ color: 'var(--text-muted)', margin: '0 0 14px', fontSize: '0.85rem' }}>
                                {confirmDelete.email}
                            </p>
                        )}
                        <p style={{ color: 'var(--error)', margin: '0 0 24px', fontSize: '0.85rem', background: 'var(--error-soft-bg)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--error-soft-border)', textAlign: 'left', lineHeight: 1.5 }}>
                            {confirmDelete.esInactiva ? (
                                <>
                                    ⚠️ <strong>Cuenta demo inactiva (+30 días sin animales):</strong> Se eliminarán la organización, sus datos y el acceso de autenticación del usuario. Esta operación <strong>no se puede deshacer</strong>.
                                </>
                            ) : (
                                <>
                                    ⚠️ Esta acción eliminará {confirmDelete.type === 'org' ? 'todas las fincas, animales, pesajes y accesos asociados' : 'todos los animales, pesajes y datos de esta finca'}. Esta operación <strong>no se puede deshacer</strong>.
                                </>
                            )}
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmDelete(null)}
                                disabled={!!deletingId}
                                style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => confirmDelete.type === 'org' ? handleDeleteOrg(confirmDelete.id, confirmDelete.idDueño) : handleDeleteFinca(confirmDelete.id)}
                                disabled={!!deletingId}
                                style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--error)', color: 'white', cursor: deletingId ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', opacity: deletingId ? 0.6 : 1 }}
                            >
                                <Trash2 size={16} />
                                {deletingId ? 'Eliminando...' : confirmDelete.esInactiva ? 'Sí, inactivar cuenta' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* === TAB: CREAR CUENTA === */}
            {activeTab === 'crear' && (
                <div style={{ maxWidth: '780px' }}>
                    <div style={{ background: 'var(--bg-card)', border: `1px solid ${purpleSoftBorder}`, borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <UserPlus size={18} color={accentPurple} />
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Crear Nueva Cuenta de Administrador</h3>
                        </div>
                        <div style={{ padding: '28px 24px' }}>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', marginTop: 0, fontSize: '0.9rem' }}>
                                El sistema creará automáticamente el usuario, su empresa y su primera finca.
                            </p>

                            {msjExito && (
                                <div style={{ background: 'var(--success-soft-bg)', border: '1px solid var(--success-soft-border)', color: 'var(--success)', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', fontWeight: 600 }}>
                                    {msjExito}
                                </div>
                            )}
                            {msjError && (
                                <div style={{ background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', fontWeight: 600 }}>
                                    {msjError}
                                </div>
                            )}

                            <form onSubmit={crearAdministrador}>
                                <div className="superadmin-form-grid">
                                    <div>
                                        <h4 style={{ color: accentPurple, marginBottom: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            <UserPlus size={15} /> Datos del Usuario
                                        </h4>
                                        <label>Correo Electrónico</label>
                                        <input type="email" placeholder="admin@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={loadingForm} />
                                        <label>Contraseña Temporal</label>
                                        <input type="text" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} disabled={loadingForm} />
                                    </div>
                                    <div className="superadmin-form-right-col">
                                        <h4 style={{ color: accentPurple, marginBottom: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            <Building2 size={15} /> Datos de la Empresa y Licencia
                                        </h4>
                                        <label>Nombre de la Organización</label>
                                        <input type="text" placeholder="Ej. Inversiones Agropecuarias S.A." value={org} onChange={e => setOrg(e.target.value)} required disabled={loadingForm} />
                                        <label>Nombre de la Primera Finca</label>
                                        <input type="text" placeholder="Ej. Hacienda La Esperanza" value={finca} onChange={e => setFinca(e.target.value)} required disabled={loadingForm} />
                                        <label>Ubicación (opcional)</label>
                                        <input type="text" placeholder="Ej. Colombia, Antioquia" value={ubicacion} onChange={e => setUbicacion(e.target.value)} disabled={loadingForm} />

                                        <label style={{ marginTop: '12px' }}>Licencia Asignada Inicial</label>
                                        <select
                                            value={licenciaInicial}
                                            onChange={e => setLicenciaInicial(e.target.value as TipoLicencia)}
                                            disabled={loadingForm}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                                        >
                                            <option value="demo">Demo (40 animales)</option>
                                            <option value="finca">Finca (500 animales)</option>
                                            <option value="premium">Premium (Ilimitado)</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ marginTop: '16px' }}>
                                    <button
                                        type="submit"
                                        disabled={loadingForm}
                                        style={{ background: '#7c3aed', border: '1px solid #6d28d9', color: 'white', padding: '13px 28px', borderRadius: '10px', cursor: loadingForm ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', width: 'auto' }}
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

            {/* === TAB: PRECIOS DE MERCADO === */}
            {activeTab === 'precios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                    {msjPrecios && (
                        <div style={{
                            background: msjPrecios.tipo === 'exito' ? 'var(--success-soft-bg)' : 'var(--error-soft-bg)',
                            border: msjPrecios.tipo === 'exito' ? '1px solid var(--success-soft-border)' : '1px solid var(--error-soft-border)',
                            color: msjPrecios.tipo === 'exito' ? 'var(--success)' : 'var(--error)',
                            padding: '14px 18px', borderRadius: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                            {msjPrecios.tipo === 'exito' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                            {msjPrecios.texto}
                        </div>
                    )}

                    <div className="superadmin-precios-grid">
                        {/* Formulario Manual */}
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <TrendingUp size={18} color={accentBlue} />
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Registro Semanal de Precios</h3>
                            </div>
                            <form onSubmit={handleSaveManualPrecios} style={{ padding: '20px 24px' }}>
                                <div className="superadmin-precios-header-inputs">
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fecha Boletín</label>
                                        <input
                                            type="date"
                                            value={formFechaBoletin}
                                            onChange={e => setFormFechaBoletin(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Región / Plaza</label>
                                        <select
                                            value={formRegion}
                                            onChange={e => {
                                                const r = e.target.value;
                                                setFormRegion(r);
                                                if (r === 'puerto_berrio' || r === 'aguachica') setFormFuente('Sugaberrío');
                                                else if (r === 'monteria') setFormFuente('Subastar');
                                                else if (r === 'chigorodo') setFormFuente('Suganar');
                                                else if (r === 'medellin') setFormFuente('Central Ganadera');
                                            }}
                                            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-main)' }}
                                        >
                                            <option value="puerto_berrio">Puerto Berrío</option>
                                            <option value="monteria">Montería</option>
                                            <option value="aguachica">Aguachica</option>
                                            <option value="chigorodo">Chigorodó</option>
                                            <option value="medellin">Medellín</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fuente</label>
                                        <input
                                            type="text"
                                            value={formFuente}
                                            onChange={e => setFormFuente(e.target.value)}
                                            placeholder="Ej: Sugaberrío"
                                            required
                                        />
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', marginBottom: '20px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: accentBlue, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Precios en $/kg por Categoría
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        {[
                                            { cat: 'ML', label: 'Macho Levante (ML)' },
                                            { cat: 'MC', label: 'Macho Ceba (MC)' },
                                            { cat: 'MG', label: 'Macho Gordo (MG)' },
                                            { cat: 'HL', label: 'Hembra Levante (HL)' },
                                            { cat: 'HV', label: 'Hembra de Vientre (HV)' },
                                            { cat: 'VP', label: 'Vaca Parida (VP)' },
                                            { cat: 'VH', label: 'Vaca Horra (VH)' }
                                        ].map(item => (
                                            <div key={item.cat}>
                                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.label}</label>
                                                <input
                                                    type="number"
                                                    placeholder="Ej: 9500"
                                                    value={preciosCategorias[item.cat] || ''}
                                                    onChange={e => setPreciosCategorias({ ...preciosCategorias, [item.cat]: e.target.value })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={savingPrecios}
                                    style={{ width: '100%', background: '#0284c7', border: '1px solid #0369a1', color: 'white', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {savingPrecios ? 'Guardando...' : 'Guardar Precios Semanales'}
                                </button>
                            </form>
                        </div>

                        {/* Carga Masiva CSV */}
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-card)' }}>
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Upload size={18} color={accentPurpleSoft} />
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Carga Masiva CSV (Historial 2026)</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={downloadCSVTemplate}
                                    style={{ background: purpleSoftBg, border: `1px solid ${purpleSoftBorder}`, color: accentPurpleSoft, padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Download size={14} /> Descargar Plantilla
                                </button>
                            </div>
                            <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '16px' }}>
                                    Importa archivos CSV con el historial completo del 2026. Las columnas requeridas son: <code style={{ color: accentPurpleSoft }}>fecha_boletin, region, fuente_informacion, categoria_animal, precio_promedio_kg</code>.
                                </p>

                                <div style={{ border: `2px dashed ${purpleSoftBorder}`, borderRadius: '12px', padding: '28px', textAlign: 'center', background: purpleSubtleBg, marginBottom: '20px' }}>
                                    <FileText size={36} color={accentPurpleSoft} style={{ opacity: 0.7, marginBottom: '8px' }} />
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                                        {csvFile ? csvFile.name : 'Selecciona un archivo CSV'}
                                    </div>
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={handleCSVFileChange}
                                        style={{ display: 'none' }}
                                        id="csv-file-input"
                                    />
                                    <label
                                        htmlFor="csv-file-input"
                                        style={{ background: purpleSoftBg, border: `1px solid ${purpleSoftBorder}`, color: accentPurpleSoft, padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'inline-block' }}
                                    >
                                        Examinar Archivo
                                    </label>
                                </div>

                                {csvPreviewRows.length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600, marginBottom: '8px' }}>
                                            ✓ {csvPreviewRows.length} registros válidos detectados para importación.
                                        </div>
                                        <div style={{ maxHeight: '120px', overflowY: 'auto', background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {csvPreviewRows.slice(0, 5).map((r, idx) => (
                                                <div key={idx}>{r.fecha_boletin} | {r.region} | {r.categoria_animal}: ${r.precio_promedio_kg}/kg</div>
                                            ))}
                                            {csvPreviewRows.length > 5 && <div>...y {csvPreviewRows.length - 5} registros más.</div>}
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginTop: 'auto' }}>
                                    <button
                                        type="button"
                                        onClick={handleUploadCSV}
                                        disabled={uploadingCsv || csvPreviewRows.length === 0}
                                        style={{ width: '100%', background: csvPreviewRows.length > 0 ? '#7e22ce' : 'var(--surface-subtle)', border: `1px solid ${csvPreviewRows.length > 0 ? '#6b21a8' : 'var(--border-subtle)'}`, color: csvPreviewRows.length > 0 ? 'white' : 'var(--text-muted)', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: csvPreviewRows.length > 0 ? 'pointer' : 'not-allowed' }}
                                    >
                                        {uploadingCsv ? 'Importando Registros...' : `Importar ${csvPreviewRows.length} Registros a Supabase`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Registros Existentes */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Historial de Precios de Mercado ({preciosRegistrados.length} registros)</h3>
                        </div>
                        {loadingPrecios ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando registros...</div>
                        ) : preciosRegistrados.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay precios registrados en la base de datos. Utiliza el formulario o la carga masiva.</div>
                        ) : (
                            <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto', margin: 0, borderRadius: 0 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Fecha</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Semana</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Región</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Fuente</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Categoría</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Precio/kg</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preciosRegistrados.map((p) => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{p.fecha_boletin}</td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Semana {p.semana_ano} ({p.year})</td>
                                                <td style={{ padding: '12px 16px', textTransform: 'capitalize', color: accentBlue }}>{p.region.replace('_', ' ')}</td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{p.fuente_informacion}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <span style={{ background: purpleSoftBg, border: `1px solid ${purpleSoftBorder}`, color: accentPurpleSoft, padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                        {p.categoria_animal}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>
                                                    ${p.precio_promedio_kg?.toLocaleString('es-CO')} / kg
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleDeletePrecioRow(p.id)}
                                                        style={{ background: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        Eliminar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
