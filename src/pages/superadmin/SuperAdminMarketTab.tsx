import { useEffect, useState } from 'react';
import { TrendingUp, Upload, Download, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';
import type { SuperAdminPalette } from './types';

interface SuperAdminMarketTabProps {
    palette: SuperAdminPalette;
}

// Calcula número de semana ISO 8601 de forma robusta
const getISOWeek = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export default function SuperAdminMarketTab({ palette }: SuperAdminMarketTabProps) {
    const { confirmAction, toast } = useFeedback();
    const { accentBlue, accentPurpleSoft, purpleSoftBg, purpleSubtleBg, purpleSoftBorder } = palette;

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

    const fetchPreciosMercado = async () => {
        setLoadingPrecios(true);
        const { data } = await supabase
            .from('precios_mercado_ganado')
            .select('*')
            .order('fecha_boletin', { ascending: false });
        if (data) setPreciosRegistrados(data);
        setLoadingPrecios(false);
    };

    useEffect(() => {
        void fetchPreciosMercado();
    }, []);

    const handleSaveManualPrecios = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingPrecios(true);
        setMsjPrecios(null);
        try {
            const dateError = getGanadoDateError(formFechaBoletin, 'La fecha del boletín');
            if (dateError) {
                throw new Error(dateError);
            }
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

    const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvFile(file);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;

            const firstLine = text.split(/\r?\n/)[0] || '';
            const separator = firstLine.includes(';') ? ';' : ',';

            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length <= 1) return;

            const headers = lines[0].split(separator).map(h =>
                h.trim().toLowerCase()
                    .replace(/^\uFEFF/, '')
                    .replace(/[áàä]/g, 'a')
                    .replace(/[éèë]/g, 'e')
                    .replace(/[íìï]/g, 'i')
                    .replace(/[óòö]/g, 'o')
                    .replace(/[úùü]/g, 'u')
            );

            const idx: Record<string, number> = {};
            headers.forEach((h, i) => { idx[h] = i; });

            const colFecha  = idx['fecha_boletin'] ?? 0;
            const colRegion = idx['region'] ?? 1;
            const colFuente = idx['fuente_informacion'] ?? 2;
            const colCateg  = idx['categoria_animal'] ?? 3;
            const colPrecio = idx['precio_promedio_kg'] ?? 4;

            const rows: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length < 5) continue;

                const fecha_boletin      = cols[colFecha];
                const region             = (cols[colRegion] || '').toLowerCase().trim();
                const fuente_informacion = cols[colFuente] || '';
                const categoria_animal   = (cols[colCateg] || '').toUpperCase().trim();
                const precio_promedio_kg = parseFloat((cols[colPrecio] || '').replace(',', '.'));

                if (!fecha_boletin || !region || !categoria_animal || isNaN(precio_promedio_kg)) continue;

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

    return (
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
                                    min={MIN_GANADO_DATE}
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
    );
}
