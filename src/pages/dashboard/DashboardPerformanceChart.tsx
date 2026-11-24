import { useMemo, useState } from 'react';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid, Legend, BarChart, Bar, ReferenceLine
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDisplayValue, getUnidadLabel, getModoLabel, type ModoGanancia } from '../../utils/ganancia';
import { parseLocalDate } from '../../utils/dateUtils';
import type { EvolucionItem, GmpDetailItem, SelectedGmpDetail } from './types';

interface DashboardPerformanceChartProps {
    rawData: { animales: any[]; pesajes: any[] } | null;
    cortesPeso: { corte1: number; corte2: number; corte3: number; preset?: string };
    gmpLevante: number;
    gmpCeba: number;
    modoGanancia: ModoGanancia;
    isMobile: boolean;
    onSelectPointDetail: (detail: SelectedGmpDetail) => void;
}

export default function DashboardPerformanceChart({
    rawData,
    cortesPeso,
    gmpLevante,
    gmpCeba,
    modoGanancia,
    isMobile,
    onSelectPointDetail
}: DashboardPerformanceChartProps) {
    const [vistaGrafica, setVistaGrafica] = useState<'mensual' | 'pesaje' | 'rango'>('mensual');
    const [filterTipo, setFilterTipo] = useState<'historico' | 'actual'>('actual');

    // Memo para procesar la evolución GMP según el filtro de forma instantánea sin re-renders adicionales
    const { evolucionGmp, evolucionPorPesaje, evolucionPorRango, detallesGmpAgrupados } = useMemo(() => {
        if (!rawData) {
            return {
                evolucionGmp: [] as EvolucionItem[],
                evolucionPorPesaje: [] as any[],
                evolucionPorRango: [] as any[],
                detallesGmpAgrupados: { levante: {}, ceba: {} } as {
                    levante: Record<number, GmpDetailItem[]>;
                    ceba: Record<number, GmpDetailItem[]>;
                }
            };
        }

        const { animales, pesajes } = rawData;
        const animalesFiltrados = filterTipo === 'actual'
            ? animales.filter(a => a.estado === 'activo')
            : animales;

        // Agrupar pesajes por animal
        const pesajesPorAnimal: Record<string, any[]> = {};
        pesajes.forEach((p: any) => {
            if (!pesajesPorAnimal[p.id_animal]) {
                pesajesPorAnimal[p.id_animal] = [];
            }
            pesajesPorAnimal[p.id_animal].push(p);
        });

        // Agrupar por Mes/Año del pesaje
        const agrupadoPorMes: Record<string, {
            sortIndex: string;
            label: string;
            levanteSum: number;
            levanteCount: number;
            cebaSum: number;
            cebaCount: number;
            levanteDetalles: GmpDetailItem[];
            cebaDetalles: GmpDetailItem[];
        }> = {};

        // Agrupar por Rango de Peso
        const agrupadoPorRango: Record<string, { sum: number; count: number; sumDias: number }> = {
            'rango1': { sum: 0, count: 0, sumDias: 0 },
            'rango2': { sum: 0, count: 0, sumDias: 0 },
            'rango3': { sum: 0, count: 0, sumDias: 0 },
            'rango4': { sum: 0, count: 0, sumDias: 0 },
        };

        // Agrupar por Número de Pesaje (2, 3, 4...)
        const agrupadoPorNum: Record<number, {
            sumLevante: number;
            countLevante: number;
            sumCeba: number;
            countCeba: number;
            sumDiasLevante: number;
            sumDiasCeba: number;
        }> = {};

        animalesFiltrados.forEach(animal => {
            const misPesajes = pesajesPorAnimal[animal.id];
            if (!misPesajes || misPesajes.length === 0) return;

            const ordenados = [...misPesajes].sort((a, b) =>
                String(a.fecha || '').split('T')[0].localeCompare(String(b.fecha || '').split('T')[0])
            );

            let prevWeight = parseFloat(animal.peso_ingreso ?? animal.peso_compra ?? 0);
            let prevDate = parseLocalDate(animal.fecha_ingreso);
            let validWeighingCounter = 1;

            ordenados.forEach((p: any) => {
                const currentWeight = parseFloat(p.peso);
                const currentDateStr = String(p.fecha || '').split('T')[0];
                const currentDate = parseLocalDate(currentDateStr);
                if (!prevDate || !currentDate || isNaN(prevDate.getTime()) || isNaN(currentDate.getTime())) return;
                const diffDias = differenceInDays(currentDate, prevDate);

                if (diffDias > 0) {
                    validWeighingCounter++;
                    const numPesaje = validWeighingCounter;
                    const ganancia = currentWeight - prevWeight;
                    let gdp = (p.gdp_calculada !== null && p.gdp_calculada !== undefined && p.gdp_calculada !== 0) ? Number(p.gdp_calculada) : (ganancia / diffDias);
                    if (gdp === 0 && ganancia !== 0) {
                        gdp = ganancia / diffDias;
                    }
                    const gmpVal = gdp * 30;

                    // Excluir de los promedios gráficos tramos muy cortos (<14 días, p.ej. correcciones al día siguiente)
                    // o valores biológicamente imposibles (>60 o <-45 kg/mes) para no distorsionar la tendencia de la finca.
                    const esIntervaloValidoParaGrafica =
                        diffDias >= 14 &&
                        Number.isFinite(gmpVal) &&
                        gmpVal >= -45 &&
                        gmpVal <= 60;

                    if (esIntervaloValidoParaGrafica) {
                        // 1. Agrupar para gráfica Mensual
                        const sortKey = currentDateStr.substring(0, 7);
                        const labelMes = format(currentDate, 'MMM yy', { locale: es }).replace(/^\w/, c => c.toUpperCase());

                        if (!agrupadoPorMes[sortKey]) {
                            agrupadoPorMes[sortKey] = {
                                sortIndex: sortKey,
                                label: labelMes,
                                levanteSum: 0, levanteCount: 0,
                                cebaSum: 0, cebaCount: 0,
                                levanteDetalles: [], cebaDetalles: []
                            };
                        }

                        // 2. Agrupar para gráfica por Número de Pesaje
                        if (!agrupadoPorNum[numPesaje]) {
                            agrupadoPorNum[numPesaje] = { sumLevante: 0, countLevante: 0, sumCeba: 0, countCeba: 0, sumDiasLevante: 0, sumDiasCeba: 0 };
                        }

                        const detail: GmpDetailItem = {
                            id_animal: animal.id,
                            chapeta: animal.numero_chapeta || 'N/A',
                            propietario: animal.nombre_propietario || 'Sin Propietario',
                            potrerada: animal.potreradas?.nombre || 'Sin lote',
                            fechaAnterior: format(prevDate, 'dd/MM/yyyy'),
                            pesoAnterior: prevWeight,
                            fechaActual: format(currentDate, 'dd/MM/yyyy'),
                            pesoActual: currentWeight,
                            gmp: parseFloat(gmpVal.toFixed(1))
                        };

                        if (p.etapa === 'levante') {
                            agrupadoPorMes[sortKey].levanteSum += gmpVal;
                            agrupadoPorMes[sortKey].levanteCount++;
                            agrupadoPorMes[sortKey].levanteDetalles.push(detail);

                            agrupadoPorNum[numPesaje].sumLevante += gmpVal;
                            agrupadoPorNum[numPesaje].countLevante++;
                            agrupadoPorNum[numPesaje].sumDiasLevante += diffDias;
                        } else {
                            agrupadoPorMes[sortKey].cebaSum += gmpVal;
                            agrupadoPorMes[sortKey].cebaCount++;
                            agrupadoPorMes[sortKey].cebaDetalles.push(detail);

                            agrupadoPorNum[numPesaje].sumCeba += gmpVal;
                            agrupadoPorNum[numPesaje].countCeba++;
                            agrupadoPorNum[numPesaje].sumDiasCeba += diffDias;
                        }

                        // 3. Agrupar por Rango de Peso (Tomamos el peso al INICIO del intervalo)
                        const pesoRef = prevWeight;
                        const c1 = Number(cortesPeso.corte1) || 430;
                        const c2 = Number(cortesPeso.corte2) || 480;
                        const c3 = Number(cortesPeso.corte3) || 530;

                        let targetRango = '';
                        if (pesoRef <= c1) targetRango = 'rango1';
                        else if (pesoRef <= c2) targetRango = 'rango2';
                        else if (pesoRef <= c3) targetRango = 'rango3';
                        else targetRango = 'rango4';

                        agrupadoPorRango[targetRango].sum += gmpVal;
                        agrupadoPorRango[targetRango].count++;
                        agrupadoPorRango[targetRango].sumDias += diffDias;
                    }
                }

                prevWeight = currentWeight;
                prevDate = currentDate;
            });
        });

        // Procesar gráfica de Número de Pesaje
        const dataPorNum = Object.keys(agrupadoPorNum)
            .map(k => parseInt(k))
            .sort((a, b) => a - b)
            .map(num => {
                const item = agrupadoPorNum[num];
                const avgMesesLev = item.countLevante > 0 ? (item.sumDiasLevante / item.countLevante) / 30 : 0;
                const avgMesesCeba = item.countCeba > 0 ? (item.sumDiasCeba / item.countCeba) / 30 : 0;

                return {
                    name: `P${num}`,
                    levante: item.countLevante > 0 ? parseFloat((item.sumLevante / item.countLevante).toFixed(1)) : 0,
                    ceba: item.countCeba > 0 ? parseFloat((item.sumCeba / item.countCeba).toFixed(1)) : 0,
                    mesesLevante: parseFloat(avgMesesLev.toFixed(1)),
                    mesesCeba: parseFloat(avgMesesCeba.toFixed(1))
                };
            })
            .filter(d => d.levante !== 0 || d.ceba !== 0)
            .slice(0, 15);

        // 4. Procesar gráfica de Rangos de Peso
        const c1Val = Number(cortesPeso.corte1) || 430;
        const c2Val = Number(cortesPeso.corte2) || 480;
        const c3Val = Number(cortesPeso.corte3) || 530;

        const dataPorRango = [
            { name: `< ${c1Val} kg`, ...agrupadoPorRango.rango1 },
            { name: `${c1Val + 1} - ${c2Val} kg`, ...agrupadoPorRango.rango2 },
            { name: `${c2Val + 1} - ${c3Val} kg`, ...agrupadoPorRango.rango3 },
            { name: `> ${c3Val} kg`, ...agrupadoPorRango.rango4 },
        ].map(r => ({
            name: r.name,
            gmp: r.count > 0 ? parseFloat((r.sum / r.count).toFixed(1)) : 0,
            meses: r.count > 0 ? parseFloat(((r.sumDias / r.count) / 30).toFixed(1)) : 0
        }));

        const sortedKeys = Object.keys(agrupadoPorMes).sort();

        const dataEvolucion: EvolucionItem[] = [];
        const levDetails: Record<number, GmpDetailItem[]> = {};
        const cebaDetails: Record<number, GmpDetailItem[]> = {};

        if (sortedKeys.length > 0) {
            const recentKeys = sortedKeys.slice(-15);

            recentKeys.forEach((key, index) => {
                const group = agrupadoPorMes[key];
                const item: EvolucionItem = { numero: index, label: group.label };
                if (group.levanteCount > 0) item.gmpLevante = parseFloat((group.levanteSum / group.levanteCount).toFixed(1));
                if (group.cebaCount > 0) item.gmpCeba = parseFloat((group.cebaSum / group.cebaCount).toFixed(1));

                dataEvolucion.push(item);
                levDetails[index] = group.levanteDetalles;
                cebaDetails[index] = group.cebaDetalles;
            });
        }

        return {
            evolucionGmp: dataEvolucion,
            evolucionPorPesaje: dataPorNum,
            evolucionPorRango: dataPorRango,
            detallesGmpAgrupados: { levante: levDetails, ceba: cebaDetails }
        };
    }, [filterTipo, rawData, cortesPeso]);

    return (
        <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '32px' }}>
            {/* Cabecera con Selectores */}
            <div style={{ padding: isMobile ? '16px' : '24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: isMobile ? '12px' : '20px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.4rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={isMobile ? 18 : 24} color="var(--primary)" />
                            {isMobile ? 'Rendimiento Ganadero' : 'Análisis de Rendimiento Ganadero'}
                        </h3>
                        {!isMobile && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                                {vistaGrafica === 'mensual' && 'Evolución cronológica del promedio de ganancia por mes.'}
                                {vistaGrafica === 'pesaje' && 'Eficiencia según el número de pesajes realizados al lote.'}
                                {vistaGrafica === 'rango' && 'Productividad segmentada por rangos de peso fisiológicos.'}
                            </p>
                        )}
                    </div>
                    <div className="dashboard-filter-toggle">
                        <button
                            type="button"
                            onClick={() => setFilterTipo('actual')}
                            className={`btn-toggle ${filterTipo === 'actual' ? 'active' : ''}`}
                            style={{ padding: isMobile ? '6px 12px' : '8px 16px', fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                        >Activos</button>
                        <button
                            type="button"
                            onClick={() => setFilterTipo('historico')}
                            className={`btn-toggle ${filterTipo === 'historico' ? 'active' : ''}`}
                            style={{ padding: isMobile ? '6px 12px' : '8px 16px', fontSize: isMobile ? '0.8rem' : '0.85rem' }}
                        >Histórico</button>
                    </div>
                </div>

                {/* === KPI CARDS RÁPIDAS — SOLO MÓVIL === */}
                {isMobile && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
                        {/* Levante */}
                        <div style={{
                            background: 'var(--warning-soft-bg)',
                            border: '1px solid var(--warning-soft-border)',
                            borderRadius: '12px',
                            padding: '12px 14px',
                            display: 'flex', flexDirection: 'column', gap: '4px'
                        }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--warning)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🐄 Levante</span>
                            <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--warning)', lineHeight: 1 }}>
                                {toDisplayValue(gmpLevante, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getUnidadLabel(modoGanancia)}</span>
                        </div>
                        {/* Ceba */}
                        <div style={{
                            background: 'var(--success-soft-bg)',
                            border: '1px solid var(--success-soft-border)',
                            borderRadius: '12px',
                            padding: '12px 14px',
                            display: 'flex', flexDirection: 'column', gap: '4px'
                        }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🐂 Ceba</span>
                            <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--success)', lineHeight: 1 }}>
                                {toDisplayValue(gmpCeba, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getUnidadLabel(modoGanancia)}</span>
                        </div>
                    </div>
                )}

                {/* Selector de Tipo de Gráfica (Tabs) */}
                {isMobile ? (
                    /* === TABS PÍLDORA COMPACTOS — SOLO MÓVIL === */
                    <div style={{
                        display: 'flex',
                        gap: '6px',
                        marginTop: '14px',
                        background: 'var(--surface-inset)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        padding: '4px',
                    }}>
                        {([
                            { id: 'mensual', icon: '📅', label: 'Mensual' },
                            { id: 'pesaje', icon: '⚖️', label: 'Pesaje' },
                            { id: 'rango', icon: '📊', label: 'Rango' },
                        ] as const).map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setVistaGrafica(tab.id)}
                                style={{
                                    flex: 1,
                                    padding: '8px 4px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: vistaGrafica === tab.id
                                        ? 'var(--primary-soft-bg)'
                                        : 'transparent',
                                    color: vistaGrafica === tab.id ? 'var(--primary-light)' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                                    fontWeight: vistaGrafica === tab.id ? 700 : 400,
                                    fontSize: '0.72rem',
                                    textTransform: 'none',
                                    letterSpacing: 'normal',
                                    boxShadow: 'none',
                                    transition: 'all 0.18s',
                                    outline: vistaGrafica === tab.id ? '1px solid var(--primary-soft-border)' : 'none',
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    /* === TABS DESKTOP — sin cambios === */
                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                        <button
                            type="button"
                            onClick={() => setVistaGrafica('mensual')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '10px', transition: 'all 0.2s', boxShadow: 'none',
                                background: vistaGrafica === 'mensual' ? 'var(--primary-soft-bg)' : 'transparent',
                                border: '1px solid',
                                borderColor: vistaGrafica === 'mensual' ? 'var(--primary)' : 'var(--border-subtle)',
                                color: vistaGrafica === 'mensual' ? 'var(--primary-light)' : 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: vistaGrafica === 'mensual' ? 'bold' : 'normal'
                            }}
                        >
                            📅 Evolución Mensual
                        </button>
                        <button
                            type="button"
                            onClick={() => setVistaGrafica('pesaje')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '10px', transition: 'all 0.2s', boxShadow: 'none',
                                background: vistaGrafica === 'pesaje' ? 'var(--primary-soft-bg)' : 'transparent',
                                border: '1px solid',
                                borderColor: vistaGrafica === 'pesaje' ? 'var(--primary)' : 'var(--border-subtle)',
                                color: vistaGrafica === 'pesaje' ? 'var(--primary-light)' : 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: vistaGrafica === 'pesaje' ? 'bold' : 'normal'
                            }}
                        >
                            ⚖️ Por Nro Pesaje
                        </button>
                        <button
                            type="button"
                            onClick={() => setVistaGrafica('rango')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '10px', transition: 'all 0.2s', boxShadow: 'none',
                                background: vistaGrafica === 'rango' ? 'var(--primary-soft-bg)' : 'transparent',
                                border: '1px solid',
                                borderColor: vistaGrafica === 'rango' ? 'var(--primary)' : 'var(--border-subtle)',
                                color: vistaGrafica === 'rango' ? 'var(--primary-light)' : 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: vistaGrafica === 'rango' ? 'bold' : 'normal'
                            }}
                        >
                            📊 Por Rango de Peso
                        </button>
                    </div>
                )}
            </div>

            {/* Cuerpo de la Gráfica */}
            <div style={{ padding: isMobile ? '12px 8px' : '32px', minHeight: isMobile ? '280px' : '400px' }}>
                {isMobile && vistaGrafica === 'mensual' ? (
                    /* === MÓVIL: SCROLL HORIZONTAL para la vista mensual con muchos puntos === */
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <div style={{ width: `${Math.max(evolucionGmp.length * 52, 320)}px`, height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={evolucionGmp} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                    <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                    <XAxis dataKey="label" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                                    <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={42} />
                                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.8rem' }} formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]} />
                                    <Line
                                        type="monotone"
                                        name={`${getModoLabel(modoGanancia)} Levante`}
                                        dataKey="gmpLevante"
                                        stroke="var(--warning)"
                                        strokeWidth={2.5}
                                        dot={(props: any) => {
                                            const isLast = props.index === evolucionGmp.length - 1;
                                            if (!isLast) return <g key={props.key} />;
                                            return <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill="var(--warning)" stroke="var(--bg-card)" strokeWidth={2} />;
                                        }}
                                        activeDot={{
                                            r: 7,
                                            onClick: (_e: any, payload: any) => {
                                                const num = payload.payload.numero;
                                                onSelectPointDetail({ label: payload.payload.label, etapa: 'Levante', items: detallesGmpAgrupados.levante[num] || [] });
                                            }
                                        }}
                                        connectNulls
                                    />
                                    <Line
                                        type="monotone"
                                        name={`${getModoLabel(modoGanancia)} Ceba`}
                                        dataKey="gmpCeba"
                                        stroke="var(--success)"
                                        strokeWidth={2.5}
                                        dot={(props: any) => {
                                            const isLast = props.index === evolucionGmp.length - 1;
                                            if (!isLast) return <g key={props.key} />;
                                            return <circle key={props.key} cx={props.cx} cy={props.cy} r={5} fill="var(--success)" stroke="var(--bg-card)" strokeWidth={2} />;
                                        }}
                                        activeDot={{
                                            r: 7,
                                            onClick: (_e: any, payload: any) => {
                                                const num = payload.payload.numero;
                                                onSelectPointDetail({ label: payload.payload.label, etapa: 'Ceba', items: detallesGmpAgrupados.ceba[num] || [] });
                                            }
                                        }}
                                        connectNulls
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        {evolucionGmp.length > 6 && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '6px', opacity: 0.6 }}>
                                ← Desliza para ver todos los meses →
                            </div>
                        )}
                    </div>
                ) : (
                    /* === DESKTOP / TABLET + vistas pesaje/rango en móvil === */
                    <div style={{ width: '100%', height: isMobile ? '260px' : '400px', minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            {vistaGrafica === 'mensual' ? (
                                <LineChart data={evolucionGmp} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                    <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                    <XAxis dataKey="label" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                    <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)' }} formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]} />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                    <Line
                                        type="monotone"
                                        name={`${getModoLabel(modoGanancia)} Levante`}
                                        dataKey="gmpLevante"
                                        stroke="var(--warning)"
                                        strokeWidth={4}
                                        dot={{ r: 6, fill: 'var(--warning)', stroke: 'var(--bg-card)', strokeWidth: 2, cursor: 'pointer' }}
                                        activeDot={{
                                            r: 8,
                                            onClick: (_e: any, payload: any) => {
                                                const num = payload.payload.numero;
                                                onSelectPointDetail({ label: payload.payload.label, etapa: 'Levante', items: detallesGmpAgrupados.levante[num] || [] });
                                            }
                                        }}
                                        connectNulls
                                    />
                                    <Line
                                        type="monotone"
                                        name={`${getModoLabel(modoGanancia)} Ceba`}
                                        dataKey="gmpCeba"
                                        stroke="var(--success)"
                                        strokeWidth={4}
                                        dot={{ r: 6, fill: 'var(--success)', stroke: 'var(--bg-card)', strokeWidth: 2, cursor: 'pointer' }}
                                        activeDot={{
                                            r: 8,
                                            onClick: (_e: any, payload: any) => {
                                                const num = payload.payload.numero;
                                                onSelectPointDetail({ label: payload.payload.label, etapa: 'Ceba', items: detallesGmpAgrupados.ceba[num] || [] });
                                            }
                                        }}
                                        connectNulls
                                    />
                                </LineChart>
                            ) : vistaGrafica === 'pesaje' ? (
                                <BarChart data={evolucionPorPesaje} margin={{ top: 10, right: isMobile ? 8 : 30, left: isMobile ? -10 : 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                    <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                    <XAxis dataKey="name" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} />
                                    <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} width={isMobile ? 42 : undefined} />
                                    <Tooltip
                                        cursor={{ fill: 'var(--surface-subtle)' }}
                                        contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)', fontSize: isMobile ? '0.8rem' : '1rem' }}
                                        formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]}
                                        labelFormatter={(label) => {
                                            const point = evolucionPorPesaje.find(d => d.name === label);
                                            return (
                                                <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{label}</div>
                                                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {point && point.levante > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>Intervalo Levante: {point.mesesLevante} meses</div>}
                                                        {point && point.ceba > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Intervalo Ceba: {point.mesesCeba} meses</div>}
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar name="Levante" dataKey="levante" fill="var(--warning)" radius={[4, 4, 0, 0]} barSize={isMobile ? 22 : 35} />
                                    <Bar name="Ceba" dataKey="ceba" fill="var(--success)" radius={[4, 4, 0, 0]} barSize={isMobile ? 22 : 35} />
                                </BarChart>
                            ) : (
                                <BarChart data={evolucionPorRango} margin={{ top: 10, right: isMobile ? 8 : 30, left: isMobile ? -10 : 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                                    <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                                    <XAxis dataKey="name" stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} />
                                    <YAxis stroke="var(--chart-tick)" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-tick)', fontSize: isMobile ? 10 : 12 }} unit=" kg" width={isMobile ? 42 : undefined} />
                                    <Tooltip
                                        cursor={{ fill: 'var(--surface-subtle)' }}
                                        contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)', fontSize: isMobile ? '0.8rem' : '1rem' }}
                                        formatter={(value: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, getModoLabel(modoGanancia)]}
                                        labelFormatter={(label) => {
                                            const point = evolucionPorRango.find(d => d.name === label);
                                            return (
                                                <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>Rango: {label}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--primary-light)', marginTop: '4px' }}>
                                                        Intervalo medio: {point?.meses} meses
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar name={getModoLabel(modoGanancia)} dataKey="gmp" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={isMobile ? 30 : 45} label={{ position: 'top', fill: 'var(--text-main)', fontSize: isMobile ? 10 : 12, formatter: (v: any) => toDisplayValue(v, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1) }} />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}
