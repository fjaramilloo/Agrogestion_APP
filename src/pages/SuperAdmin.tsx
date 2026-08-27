import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Building2, UserPlus, ShieldCheck, MapPin, Users,
    ChevronDown, ChevronUp, BarChart3, Tractor,
    Eye, Wrench, Globe, Trash2, AlertTriangle,
    Award, Calendar, Edit3, Clock, TrendingUp,
    Upload, Download, FileText, CheckCircle2
} from 'lucide-react';

type TipoLicencia = 'demo' | 'finca' | 'premium';

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
    licencia: TipoLicencia;
    limiteAnimales: number;
    fechaInicioLicencia: string | null;
    fechaVencimientoLicencia: string | null;
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

    const [activeTab, setActiveTab] = useState<'dashboard' | 'crear' | 'precios'>('dashboard');
    const [cuentas, setCuentas] = useState<CuentaAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
    const [globalStats, setGlobalStats] = useState<GlobalStats>({
        totalOrgs: 0, totalFincas: 0, totalAnimales: 0, totalUsuarios: 0
    });
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'org' | 'finca'; id: string; nombre: string } | null>(null);

    // Modal de edición de Licencia
    const [editingLicenciaOrg, setEditingLicenciaOrg] = useState<CuentaAdmin | null>(null);
    const [formLicencia, setFormLicencia] = useState<TipoLicencia>('demo');
    const [formLimite, setFormLimite] = useState<number>(40);
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
    const [formFechaBoletin, setFormFechaBoletin] = useState(new Date().toISOString().split('T')[0]);
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
                .filter(([_, val]) => val && parseFloat(val) > 0)
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

    const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvFile(file);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length <= 1) return;

            const rows: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim());
                if (cols.length >= 5) {
                    const fecha_boletin = cols[0];
                    const region = cols[1].toLowerCase();
                    const fuente_informacion = cols[2];
                    const categoria_animal = cols[3].toUpperCase();
                    const precio_promedio_kg = parseFloat(cols[4]);

                    if (fecha_boletin && region && categoria_animal && !isNaN(precio_promedio_kg)) {
                        const fechaParts = fecha_boletin.split('-');
                        const d = new Date(parseInt(fechaParts[0]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[2]));
                        const year = d.getFullYear() || 2026;
                        const startOfYear = new Date(year, 0, 1);
                        const pastDays = (d.getTime() - startOfYear.getTime()) / 86400000;
                        const semana_ano = Math.max(1, Math.ceil((pastDays + startOfYear.getDay() + 1) / 7));

                        rows.push({
                            fecha_boletin,
                            semana_ano,
                            year,
                            region,
                            fuente_informacion,
                            categoria_animal,
                            precio_promedio_kg
                        });
                    }
                }
            }
            setCsvPreviewRows(rows);
        };
        reader.readAsText(file);
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
        const confirm = window.confirm('¿Eliminar este registro de precio de mercado?');
        if (!confirm) return;
        await supabase.from('precios_mercado_ganado').delete().eq('id', id);
        await fetchPreciosMercado();
    };

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // Fetch orgs con campos de licencia, profiles, fincas, permisos in parallel
            const [{ data: orgsData }, { data: perfilesData }, { data: fincasData }, { data: permisosData }] = await Promise.all([
                supabase.from('organizaciones').select('id, nombre, id_dueño, licencia, limite_animales, fecha_inicio_licencia, fecha_vencimiento_licencia'),
                supabase.from('perfiles').select('id, nombre, apellido'),
                supabase.from('fincas').select('id, nombre, id_organizacion'),
                supabase.from('permisos_finca').select('id_finca, id_usuario, rol')
            ]);

            // Get accurate animal counts per finca using pagination
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
                    licencia: (o.licencia as TipoLicencia) || 'demo',
                    limiteAnimales: o.limite_animales ?? 40,
                    fechaInicioLicencia: o.fecha_inicio_licencia || null,
                    fechaVencimientoLicencia: o.fecha_vencimiento_licencia || null,
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

    const handleOpenEditLicencia = (cuenta: CuentaAdmin) => {
        setEditingLicenciaOrg(cuenta);
        setFormLicencia(cuenta.licencia);
        setFormLimite(cuenta.limiteAnimales);
        setFormVencimiento(cuenta.fechaVencimientoLicencia ? cuenta.fechaVencimientoLicencia.substring(0, 10) : '');
    };

    const handleSelectLicenciaChange = (newLic: TipoLicencia) => {
        setFormLicencia(newLic);
        if (newLic === 'demo') setFormLimite(40);
        else if (newLic === 'finca') setFormLimite(500);
        else if (newLic === 'premium') setFormLimite(999999);
    };

    const handleSaveLicencia = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLicenciaOrg) return;
        setSavingLicencia(true);
        try {
            const updates: any = {
                licencia: formLicencia,
                limite_animales: formLimite,
                fecha_vencimiento_licencia: formVencimiento ? new Date(formVencimiento).toISOString() : null
            };

            const { error } = await supabase
                .from('organizaciones')
                .update(updates)
                .eq('id', editingLicenciaOrg.orgId);

            if (error) throw error;

            setEditingLicenciaOrg(null);
            await fetchDashboardData();
        } catch (err: any) {
            alert('Error al guardar la licencia: ' + err.message);
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
        } catch (err: any) {
            alert('Error eliminando finca: ' + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const handleDeleteOrg = async (orgId: string) => {
        setDeletingId(orgId);
        try {
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
            demo: { bg: 'rgba(255, 152, 0, 0.12)', color: '#ffb74d', border: 'rgba(255, 152, 0, 0.3)', label: 'Demo (40)' },
            finca: { bg: 'rgba(14, 165, 233, 0.12)', color: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)', label: `Finca (${limiteAnimales})` },
            premium: { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.4)', label: 'Premium (∞)' }
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
                            Gestión global de cuentas, licencias, fincas y usuarios de la plataforma
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '10px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.08)' }}>
                {([['dashboard', BarChart3, 'Visión General'], ['crear', UserPlus, 'Nueva Cuenta'], ['precios', TrendingUp, 'Precios de Mercado']] as [string, any, string][]).map(([tab, Icon, label]) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as 'dashboard' | 'crear' | 'precios')}
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
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Cuentas Registradas y Licencias</h3>
                            <span style={{ marginLeft: 'auto', background: 'rgba(124, 58, 237, 0.2)', color: '#a78bfa', padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                                {cuentas.length} organizaciones
                            </span>
                        </div>

                        {loading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: '#a78bfa' }}>Cargando datos de la plataforma...</div>
                        ) : (
                            <div>
                                {/* Table Header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.1fr 1.2fr 60px 80px 80px 80px 40px', gap: '8px', padding: '10px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    {['ORGANIZACIÓN', 'ADMIN', 'LICENCIA', 'VIGENCIA', 'FINCAS', 'VAQ.', 'VISUAL.', 'ANIMALES', ''].map(h => (
                                        <div key={h} style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.8px' }}>{h}</div>
                                    ))}
                                </div>

                                {cuentas.map((cuenta) => (
                                    <div key={cuenta.orgId}>
                                        {/* Main Row */}
                                        <div
                                            style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.1fr 1.2fr 60px 80px 80px 80px 40px', gap: '8px', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
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

                                            {/* Licencia Badge */}
                                            <div>
                                                {renderLicenciaBadge(cuenta)}
                                            </div>

                                            {/* Vigencia / Fechas */}
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={11} color="#a78bfa" />
                                                    <span>Desde: {formatDate(cuenta.fechaInicioLicencia)}</span>
                                                </div>
                                                {cuenta.fechaVencimientoLicencia && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', color: '#f87171' }}>
                                                        <Calendar size={11} />
                                                        <span>Vence: {formatDate(cuenta.fechaVencimientoLicencia)}</span>
                                                    </div>
                                                )}
                                            </div>

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
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <div style={{ fontSize: '0.68rem', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700 }}>
                                                        Detalle por Finca y Control de Licencia
                                                    </div>
                                                    <button
                                                        onClick={() => handleOpenEditLicencia(cuenta)}
                                                        style={{ background: 'rgba(124, 58, 237, 0.2)', border: '1px solid rgba(124, 58, 237, 0.4)', color: '#c084fc', padding: '5px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        <Edit3 size={13} /> Cambiar Licencia / Límites
                                                    </button>
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

            {/* === MODAL EDITAR LICENCIA === */}
            {editingLicenciaOrg && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#1a1a2e', border: '1px solid rgba(124, 58, 237, 0.4)', borderRadius: '16px', padding: '28px', maxWidth: '460px', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <Award size={24} color="#a78bfa" />
                            <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>Gestionar Licencia</h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 20px' }}>
                            Organización: <strong style={{ color: 'white' }}>{editingLicenciaOrg.orgNombre}</strong>
                        </p>

                        <form onSubmit={handleSaveLicencia}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                    Tipo de Plan
                                </label>
                                <select
                                    value={formLicencia}
                                    onChange={e => handleSelectLicenciaChange(e.target.value as TipoLicencia)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontSize: '0.9rem' }}
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
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontSize: '0.9rem' }}
                                />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                    Use 999999 o valor alto para representar animales ilimitados.
                                </span>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                                    Fecha de Vencimiento del Plan (Opcional)
                                </label>
                                <input
                                    type="date"
                                    value={formVencimiento}
                                    onChange={e => setFormVencimiento(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontSize: '0.9rem' }}
                                />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                    Déjelo en blanco si el plan no vence automáticamente.
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setEditingLicenciaOrg(null)}
                                    disabled={savingLicencia}
                                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingLicencia}
                                    style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'rgba(124, 58, 237, 0.8)', color: 'white', cursor: savingLicencia ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
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
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontSize: '0.9rem' }}
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
                                        style={{ background: 'rgba(124, 58, 237, 0.8)', border: '1px solid rgba(124, 58, 237, 0.5)', color: 'white', padding: '13px 28px', borderRadius: '10px', cursor: loadingForm ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', width: 'auto' }}
                                    >
                                        <UserPlus size={18} />
                                        {loadingForm ? 'Procesando...' : 'Crear Cuenta'}
                                    </button>
                                </div>
                            </form>
                    </div>
                </div>
            )}

            {/* === TAB: PRECIOS DE MERCADO === */}
            {activeTab === 'precios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                    {msjPrecios && (
                        <div style={{
                            background: msjPrecios.tipo === 'exito' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(244, 67, 54, 0.12)',
                            border: msjPrecios.tipo === 'exito' ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(244, 67, 54, 0.3)',
                            color: msjPrecios.tipo === 'exito' ? 'var(--success)' : '#ef5350',
                            padding: '14px 18px', borderRadius: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                            {msjPrecios.tipo === 'exito' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                            {msjPrecios.texto}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        {/* Formulario Manual */}
                        <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <TrendingUp size={18} color="#38bdf8" />
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Registro Semanal de Precios</h3>
                            </div>
                            <form onSubmit={handleSaveManualPrecios} style={{ padding: '20px 24px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
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
                                            }}
                                            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
                                        >
                                            <option value="puerto_berrio">Puerto Berrío</option>
                                            <option value="monteria">Montería</option>
                                            <option value="aguachica">Aguachica</option>
                                            <option value="chigorodo">Chigorodó</option>
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

                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', marginBottom: '20px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                                    style={{ width: '100%', background: '#0284c7', border: '1px solid #38bdf8', color: 'white', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {savingPrecios ? 'Guardando...' : 'Guardar Precios Semanales'}
                                </button>
                            </form>
                        </div>

                        {/* Carga Masiva CSV */}
                        <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Upload size={18} color="#c084fc" />
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Carga Masiva CSV (Historial 2026)</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={downloadCSVTemplate}
                                    style={{ background: 'rgba(192, 132, 252, 0.15)', border: '1px solid rgba(192, 132, 252, 0.4)', color: '#c084fc', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Download size={14} /> Descargar Plantilla
                                </button>
                            </div>
                            <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '16px' }}>
                                    Importa archivos CSV con el historial completo del 2026. Las columnas requeridas son: <code style={{ color: '#c084fc' }}>fecha_boletin, region, fuente_informacion, categoria_animal, precio_promedio_kg</code>.
                                </p>

                                <div style={{ border: '2px dashed rgba(192, 132, 252, 0.3)', borderRadius: '12px', padding: '28px', textAlign: 'center', background: 'rgba(192, 132, 252, 0.03)', marginBottom: '20px' }}>
                                    <FileText size={36} color="#c084fc" style={{ opacity: 0.6, marginBottom: '8px' }} />
                                    <div style={{ fontSize: '0.9rem', color: 'white', marginBottom: '8px' }}>
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
                                        style={{ background: 'rgba(192, 132, 252, 0.2)', border: '1px solid rgba(192, 132, 252, 0.4)', color: '#c084fc', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'inline-block' }}
                                    >
                                        Examinar Archivo
                                    </label>
                                </div>

                                {csvPreviewRows.length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600, marginBottom: '8px' }}>
                                            ✓ {csvPreviewRows.length} registros válidos detectados para importación.
                                        </div>
                                        <div style={{ maxHeight: '120px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                                        style={{ width: '100%', background: csvPreviewRows.length > 0 ? '#9333ea' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(192, 132, 252, 0.4)', color: 'white', padding: '12px', borderRadius: '8px', fontWeight: 600, cursor: csvPreviewRows.length > 0 ? 'pointer' : 'not-allowed' }}
                                    >
                                        {uploadingCsv ? 'Importando Registros...' : `Importar ${csvPreviewRows.length} Registros a Supabase`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Registros Existentes */}
                    <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Historial de Precios de Mercado ({preciosRegistrados.length} registros)</h3>
                        </div>
                        {loadingPrecios ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando registros...</div>
                        ) : preciosRegistrados.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay precios registrados en la base de datos. Utiliza el formulario o la carga masiva.</div>
                        ) : (
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
                                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>{p.fecha_boletin}</td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Semana {p.semana_ano} ({p.year})</td>
                                                <td style={{ padding: '12px 16px', textTransform: 'capitalize', color: '#38bdf8' }}>{p.region.replace('_', ' ')}</td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{p.fuente_informacion}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <span style={{ background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                        {p.categoria_animal}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>
                                                    ${p.precio_promedio_kg?.toLocaleString('es-CO')} / kg
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleDeletePrecioRow(p.id)}
                                                        style={{ background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.3)', color: '#ef5350', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
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
