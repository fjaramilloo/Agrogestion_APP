import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid, Legend, BarChart, Bar
} from 'recharts';
import { Timer, TrendingUp, Activity, Scale, Skull, Home, MapPin, Users } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface DashboardStats {
    totalAnimales: number;
    promedioLevanteMeses: number;
    gmpLevante: number; // Ganancia Mensual Promedio en levante
    gmpTotal: number;
    totalMuertosAno: number;
    produccionCarneHaAno: number;
    cargaAnimal: number;
}

interface EvolucionItem {
    fecha: string;
    gmp: number;
}

interface LluviaItem {
    fecha: string;
    mm: number;
}

export default function Dashboard() {
    const { fincaId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats>({
        totalAnimales: 0,
        promedioLevanteMeses: 0,
        gmpLevante: 0,
        gmpTotal: 0,
        totalMuertosAno: 0,
        produccionCarneHaAno: 0,
        cargaAnimal: 0
    });
    const [fincaInfo, setFincaInfo] = useState({
        nombre: '',
        proposito: '',
        area_aprovechable: 0,
        ubicacion: ''
    });
    const [evolucionGmp, setEvolucionGmp] = useState<EvolucionItem[]>([]);
    const [evolucionLluvia, setEvolucionLluvia] = useState<LluviaItem[]>([]);

    useEffect(() => {
        async function fetchDashboardData() {
            if (!fincaId) return;
            setLoading(true);

            // 1. Total de Animales
            const { count: totalAnimales } = await supabase
                .from('animales')
                .select('*', { count: 'exact', head: true })
                .eq('id_finca', fincaId)
                .eq('estado', 'activo');

            // 2. Traer todos los animales activos para calcular los KPIs
            const { data: animales } = await supabase
                .from('animales')
                .select('id, etapa, fecha_ingreso, peso_ingreso')
                .eq('id_finca', fincaId)
                .eq('estado', 'activo');

            // 2b. Traer TODOS los animales para la evolución histórica
            const { data: todosAnimales } = await supabase
                .from('animales')
                .select('id, etapa, fecha_ingreso, peso_ingreso')
                .eq('id_finca', fincaId);

            // 3. Traer los últimos pesajes para evolucion
            const { data: pesajes } = await supabase
                .from('registros_pesaje')
                .select('id_animal, peso, fecha, etapa, gdp_calculada')
                .order('fecha', { ascending: true });

            // 3b. Traer registros de lluvia
            const { data: lluvias } = await supabase
                .from('registros_lluvia')
                .select('fecha, milimetros')
                .eq('id_finca', fincaId)
                .order('fecha', { ascending: true });

            // 4. Animales fallecidos este año
            const anioActual = new Date().getFullYear();
            const fechaInicioAnio = `${anioActual}-01-01`;
            const { count: muertosAnio } = await supabase
                .from('animales')
                .select('*', { count: 'exact', head: true })
                .eq('id_finca', fincaId)
                .eq('estado', 'muerto')
                .gte('fecha_muerte', fechaInicioAnio);

            // 5. Información de la Finca
            const { data: finca } = await supabase
                .from('fincas')
                .select('nombre, proposito, area_aprovechable, ubicacion')
                .eq('id', fincaId)
                .single();

            if (finca) {
                setFincaInfo({
                    nombre: finca.nombre,
                    proposito: finca.proposito || 'No Definido',
                    area_aprovechable: finca.area_aprovechable || 0,
                    ubicacion: finca.ubicacion || 'Sin ubicación'
                });
            }

            if (animales && animales.length > 0) {
                let totalDiasLevante = 0;
                let countLevante = 0;
                let gdpSumaLevante = 0;
                let countGdpLevante = 0;
                let gdpSumaTotal = 0;
                let countGdpTotal = 0;

                animales.forEach((animal: any) => {
                    // KPI: Promedio de Permanencia (Solo para Levante)
                    if (animal.etapa === 'levante') {
                        const diffHoy = differenceInDays(new Date(), new Date(animal.fecha_ingreso));
                        totalDiasLevante += diffHoy;
                        countLevante++;
                    }

                    // KPI: Ganancia Mensual Promedio (GMP)
                    const misPesajes = pesajes?.filter((p: any) => p.id_animal === animal.id) || [];

                    if (misPesajes.length > 0) {
                        const ultimoPesaje = misPesajes[misPesajes.length - 1];
                        const diffDiasTotal = differenceInDays(new Date(ultimoPesaje.fecha), new Date(animal.fecha_ingreso));

                        if (diffDiasTotal > 0) {
                            const gananciaTotal = ultimoPesaje.peso - animal.peso_ingreso;
                            const gdpTotal = gananciaTotal / diffDiasTotal;

                            gdpSumaTotal += gdpTotal;
                            countGdpTotal++;

                            if (animal.etapa === 'levante') {
                                gdpSumaLevante += gdpTotal;
                                countGdpLevante++;
                            }
                        }
                    }
                });

                // Convertir GDP (Ganancia Diaria) a GMP (Ganancia Mensual = GDP * 30)
                setStats({
                    totalAnimales: totalAnimales || 0,
                    promedioLevanteMeses: countLevante > 0 ? (totalDiasLevante / countLevante) / 30 : 0,
                    gmpLevante: countGdpLevante > 0 ? (gdpSumaLevante / countGdpLevante) * 30 : 0,
                    gmpTotal: countGdpTotal > 0 ? (gdpSumaTotal / countGdpTotal) * 30 : 0,
                    totalMuertosAno: muertosAnio || 0,
                    produccionCarneHaAno: (finca?.area_aprovechable && finca.area_aprovechable > 0)
                        ? ((totalAnimales || 0) * (countGdpTotal > 0 ? (gdpSumaTotal / countGdpTotal) * 30 : 0) * 12) / finca.area_aprovechable
                        : 0,
                    cargaAnimal: (finca?.area_aprovechable && finca.area_aprovechable > 0)
                        ? (totalAnimales || 0) / finca.area_aprovechable
                        : 0
                });

                // Agrupar pesajes por mes para gráfica de tendencia de GMP
                const gruposPorMes: Record<string, { sumaGmp: number, count: number }> = {};
                const pesajesFiltro = (pesajes || []).filter((p: any) => p.fecha);
                const animalesVistos = new Set();

                pesajesFiltro.forEach((p: any) => {
                    if (!animalesVistos.has(p.id_animal)) {
                        animalesVistos.add(p.id_animal);
                        return;
                    }

                    const fecha = new Date(p.fecha);
                    const mesKey = format(fecha, 'yyyy-MM');
                    let gmpDelPesaje = 0;
                    if (p.gdp_calculada !== undefined && p.gdp_calculada !== null) {
                        gmpDelPesaje = p.gdp_calculada * 30;
                    } else {
                        const animalRel = todosAnimales?.find((a: any) => a.id === p.id_animal);
                        if (animalRel) {
                            const diffDias = differenceInDays(new Date(p.fecha), new Date(animalRel.fecha_ingreso)) || 1;
                            const ganancia = p.peso - animalRel.peso_ingreso;
                            gmpDelPesaje = (ganancia / diffDias) * 30;
                        }
                    }
                    if (!gruposPorMes[mesKey]) gruposPorMes[mesKey] = { sumaGmp: 0, count: 0 };
                    gruposPorMes[mesKey].sumaGmp += gmpDelPesaje;
                    gruposPorMes[mesKey].count++;
                });

                if (Object.keys(gruposPorMes).length > 0) {
                    const tr: EvolucionItem[] = Object.keys(gruposPorMes)
                        .sort()
                        .map(key => {
                            const { sumaGmp, count } = gruposPorMes[key];
                            const prom = sumaGmp / count;
                            const [anio, mes] = key.split('-');
                            return {
                                fecha: format(new Date(parseInt(anio), parseInt(mes) - 1), 'MMM', { locale: es }),
                                gmp: parseFloat(prom.toFixed(1))
                            };
                        });
                    setEvolucionGmp(tr);
                } else {
                    setEvolucionGmp([
                        { fecha: 'Ene', gmp: 12.5 }, { fecha: 'Feb', gmp: 13.2 }, { fecha: 'Mar', gmp: 14.8 }, { fecha: 'Abr', gmp: 15.1 }, { fecha: 'May', gmp: 14.5 }
                    ]);
                }
            } else {
                setEvolucionGmp([
                    { fecha: 'Ene', gmp: 12.5 }, { fecha: 'Feb', gmp: 13.2 }, { fecha: 'Mar', gmp: 14.8 }, { fecha: 'Abr', gmp: 15.1 }, { fecha: 'May', gmp: 14.5 }
                ]);
            }

            // Agrupar lluvias por mes
            const gruposLluvia: Record<string, number> = {};
            (lluvias || []).forEach((r: any) => {
                const mes = r.fecha.substring(0, 7);
                gruposLluvia[mes] = (gruposLluvia[mes] || 0) + r.milimetros;
            });

            if (Object.keys(gruposLluvia).length > 0) {
                const lt: LluviaItem[] = Object.keys(gruposLluvia)
                    .sort()
                    .map(key => {
                        const [anio, mes] = key.split('-');
                        return {
                            fecha: format(new Date(parseInt(anio), parseInt(mes) - 1), 'MMM', { locale: es }),
                            mm: parseFloat(gruposLluvia[key].toFixed(1))
                        };
                    });
                setEvolucionLluvia(lt);
            } else {
                setEvolucionLluvia([
                    { fecha: 'Ene', mm: 120 }, { fecha: 'Feb', mm: 150 }, { fecha: 'Mar', mm: 80 }, { fecha: 'Abr', mm: 200 }, { fecha: 'May', mm: 250 }
                ]);
            }
            setLoading(false);
        }
        fetchDashboardData();
    }, [fincaId]);

    return (
        <div className="page-container" style={{ paddingBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="title" style={{ margin: 0, textAlign: 'left' }}>Indicadores de Finca</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Resumen del ciclo de ceba y levante.</p>
                </div>
                <button className="primary" style={{ width: 'auto', padding: '12px 24px' }}>
                    Descargar Informe
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--primary)' }}>Cargando métricas...</div>
            ) : (
                <>
                    {/* Widget Información de Finca */}
                    <div className="card" style={{
                        marginBottom: '32px',
                        padding: '32px',
                        background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(25, 25, 25, 0.5) 100%)',
                        border: '1px solid rgba(76, 175, 80, 0.2)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '32px',
                        alignItems: 'center'
                    }}>
                        <div style={{
                            padding: '24px',
                            borderRadius: '20px',
                            background: 'rgba(76, 175, 80, 0.2)',
                            color: 'var(--primary-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Home size={48} />
                        </div>
                        <div style={{ flex: 1, minWidth: '250px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.8rem', color: 'white', marginBottom: '8px' }}>{fincaInfo.nombre}</h2>
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                    <MapPin size={18} /> {fincaInfo.ubicacion}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                    <Activity size={18} /> <span style={{ color: 'white', fontWeight: 'bold' }}>{fincaInfo.proposito}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.03)',
                            padding: '20px 32px',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.05)',
                            textAlign: 'center',
                            minWidth: '200px'
                        }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Área de Ganado</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                {fincaInfo.area_aprovechable} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Ha</span>
                            </div>
                        </div>
                    </div>

                    {/* KPI Widgets */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '24px',
                        marginBottom: '32px'
                    }}>
                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(76, 175, 80, 0.15)', color: 'var(--primary-light)' }}>
                                <Scale size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>Total Animales Activos</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.totalAnimales}</div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255, 152, 0, 0.15)', color: 'var(--warning)' }}>
                                <Timer size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>Promedio Levante</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.promedioLevanteMeses.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>meses</span></div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(33, 150, 243, 0.15)', color: '#64B5F6' }}>
                                <TrendingUp size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>GMP Levante</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.gmpLevante.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kg/mes</span></div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(156, 39, 176, 0.15)', color: '#BA68C8' }}>
                                <Activity size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>GMP Ciclo Total</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.gmpTotal.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kg/mes</span></div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)' }}>
                                <Skull size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>Muertes en el Año</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.totalMuertosAno}</div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(76, 175, 80, 0.15)', color: 'var(--primary-light)' }}>
                                <TrendingUp size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>Carne / Ha / Año</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{Math.round(stats.produccionCarneHaAno)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kg</span></div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', border: '1px solid rgba(33, 150, 243, 0.3)' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(33, 150, 243, 0.15)', color: '#64B5F6' }}>
                                <Users size={32} />
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>Carga Animal Actual</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.cargaAnimal.toFixed(2)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>An/Ha</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Gráficas */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
                        <div className="card" style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>Tendencia de Ganancia Mensual de Peso (GMP)</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Promedio mensual de ganancia de peso en la finca</p>
                            </div>
                            <div style={{ width: '100%', height: '350px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={evolucionGmp} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="fecha"
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                        />
                                        <YAxis
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            unit=" kg"
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                                            itemStyle={{ color: 'var(--primary-light)' }}
                                        />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                        <Line
                                            type="monotone"
                                            name="GMP Promedio"
                                            dataKey="gmp"
                                            stroke="var(--primary)"
                                            strokeWidth={4}
                                            dot={{ r: 6, fill: 'var(--primary-dark)', stroke: 'var(--primary-light)', strokeWidth: 2 }}
                                            activeDot={{ r: 8, fill: 'var(--primary-light)' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>Histórico de Lluvias (Pluviosidad)</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Milímetros de agua registrados mensualmente</p>
                            </div>
                            <div style={{ width: '100%', height: '350px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={evolucionLluvia} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="fecha"
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                        />
                                        <YAxis
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            unit=" mm"
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(33, 150, 243, 0.1)' }}
                                            contentStyle={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                                            itemStyle={{ color: '#64B5F6' }}
                                        />
                                        <Bar
                                            name="Lluvia (mm)"
                                            dataKey="mm"
                                            fill="#2196F3"
                                            radius={[6, 6, 0, 0]}
                                            barSize={40}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
