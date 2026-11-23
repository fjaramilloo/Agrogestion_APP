import { useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, ReferenceLine, Legend
} from 'recharts';
import { TAB_MENSUAL, TAB_DIARIA, TAB_YOY, type RegistroLluvia } from './types';

interface RainfallChartsSectionProps {
    registros: RegistroLluvia[];
    anoSeleccionado: number;
    anosDisponibles: number[];
    onChangeAno: (ano: number) => void;
    umbralEfectivoMm: number;
    accentPurple: string;
    theme: string;
}

export default function RainfallChartsSection({
    registros,
    anoSeleccionado,
    anosDisponibles,
    onChangeAno,
    umbralEfectivoMm,
    accentPurple,
    theme
}: RainfallChartsSectionProps) {
    const [tabGrafica, setTabGrafica] = useState<string>(TAB_MENSUAL);

    const tooltipStyle = {
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: '8px',
        color: 'var(--text-main)',
        boxShadow: 'var(--shadow-popover)',
    };

    const dataMensual = useMemo(() => {
        const map: Record<string, number> = {};
        registros
            .filter(r => parseISO(r.fecha + 'T12:00:00').getFullYear() === anoSeleccionado)
            .forEach(r => {
                const mes = r.fecha.substring(0, 7);
                map[mes] = (map[mes] || 0) + r.milimetros;
            });
        return Object.keys(map).sort().map(k => ({
            name: format(parseISO(k + '-15'), 'MMM', { locale: es }),
            mm: parseFloat(map[k].toFixed(1)),
        }));
    }, [registros, anoSeleccionado]);

    const dataDiaria = useMemo(() => {
        const hoy = new Date();
        const hace30 = subDays(hoy, 30);
        return registros
            .filter(r => {
                const d = parseISO(r.fecha + 'T12:00:00');
                return d >= hace30 && d <= hoy;
            })
            .sort((a, b) => a.fecha.localeCompare(b.fecha))
            .map(r => ({
                name: format(parseISO(r.fecha + 'T12:00:00'), 'dd/MM', { locale: es }),
                mm: r.milimetros,
            }));
    }, [registros]);

    const dataYoY = useMemo(() => {
        const anoActual = new Date().getFullYear();
        const anoAnterior = anoActual - 1;
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return meses.map((m, idx) => {
            const actual = registros
                .filter(r => {
                    const d = parseISO(r.fecha + 'T12:00:00');
                    return d.getFullYear() === anoActual && d.getMonth() === idx;
                })
                .reduce((s, r) => s + r.milimetros, 0);
            const anterior = registros
                .filter(r => {
                    const d = parseISO(r.fecha + 'T12:00:00');
                    return d.getFullYear() === anoAnterior && d.getMonth() === idx;
                })
                .reduce((s, r) => s + r.milimetros, 0);
            return { name: m, [anoActual]: parseFloat(actual.toFixed(1)), [anoAnterior]: parseFloat(anterior.toFixed(1)) };
        });
    }, [registros]);

    return (
        <div className="card rainfall-chart-card">
            <div className="rainfall-chart-header">
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart2 size={20} color="var(--primary-light)" aria-hidden="true" />
                    Análisis de Precipitación
                </h3>
                <div className="rainfall-chart-controls">
                    {[
                        { id: TAB_MENSUAL, label: 'Mensual' },
                        { id: TAB_DIARIA, label: 'Últimos 30 días' },
                        { id: TAB_YOY, label: 'Año vs Año' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            aria-pressed={tabGrafica === tab.id}
                            onClick={() => setTabGrafica(tab.id)}
                            className={`rainfall-tab-btn ${tabGrafica === tab.id ? 'is-active' : ''}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                    {tabGrafica !== TAB_YOY && (
                        <select
                            aria-label="Año para gráfica de precipitación"
                            value={anoSeleccionado}
                            onChange={e => onChangeAno(Number(e.target.value))}
                            className="rainfall-year-select"
                        >
                            {anosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    )}
                </div>
            </div>

            {tabGrafica === TAB_MENSUAL && (
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dataMensual} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                        <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} unit=" mm" />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`${v ?? 0} mm`, 'Lluvia']} />
                        <Bar dataKey="mm" name="Lluvia (mm)" radius={[4, 4, 0, 0]}
                            fill="url(#barGradient)" />
                        <defs>
                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={theme === 'light' ? '#0284c7' : '#60a5fa'} stopOpacity={0.95} />
                                <stop offset="95%" stopColor={theme === 'light' ? '#0369a1' : '#3b82f6'} stopOpacity={0.7} />
                            </linearGradient>
                        </defs>
                    </BarChart>
                </ResponsiveContainer>
            )}

            {tabGrafica === TAB_DIARIA && (
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dataDiaria} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} unit=" mm" />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`${v ?? 0} mm`, 'Lluvia']} />
                        <ReferenceLine y={umbralEfectivoMm} stroke="var(--success)" strokeDasharray="4 4"
                            label={{ value: `Efectiva (${umbralEfectivoMm}mm)`, fill: 'var(--success)', fontSize: 11 }} />
                        <Bar dataKey="mm" name="Lluvia (mm)" radius={[3, 3, 0, 0]} fill={theme === 'light' ? '#0284c7' : '#60a5fa'} />
                    </BarChart>
                </ResponsiveContainer>
            )}

            {tabGrafica === TAB_YOY && (
                <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={dataYoY} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                        <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} unit=" mm" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ color: 'var(--chart-tick)', fontSize: '0.85rem' }} />
                        <Line type="monotone" dataKey={String(new Date().getFullYear())} stroke={theme === 'light' ? '#0284c7' : '#60a5fa'} strokeWidth={2} dot={{ fill: theme === 'light' ? '#0284c7' : '#60a5fa', r: 3 }} />
                        <Line type="monotone" dataKey={String(new Date().getFullYear() - 1)} stroke={accentPurple} strokeWidth={2} strokeDasharray="5 5" dot={{ fill: accentPurple, r: 3 }} />
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
