import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    TrendingUp,
    TrendingDown,
    Lock,
    Scale,
    Info,
    Calendar,
    MapPin,
    Layers,
    Activity,
    ChevronRight,
    MessageCircle,
    ArrowUpRight,
    Award
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';

interface PrecioBoletin {
    id: string;
    fecha_boletin: string;
    semana_ano: number;
    year: number;
    region: string;
    fuente_informacion: string;
    categoria_animal: string;
    precio_promedio_kg: string | number;
    precio_anterior_kg: string | number | null;
    variacion_porcentaje: string | number;
}

interface AnimalCategorizado {
    id: string;
    category: string;
    weight: number;
}

const CATEGORY_NAMES: Record<string, string> = {
    ML: 'Macho Levante (ML)',
    MC: 'Macho Ceba (MC)',
    MG: 'Macho Gordo (MG)',
    HL: 'Hembra Levante (HL)',
    HV: 'Hembra de Vientre (HV)',
    VP: 'Vaca Parida (VP)',
    VH: 'Vaca Horra (VH)'
};

const CATEGORY_COLORS: Record<string, string> = {
    ML: '#38bdf8', // Macho Levante: Celeste
    MC: '#c084fc', // Macho Ceba: Morado claro
    MG: '#f43f5e', // Macho Gordo: Rosa/Rojo
    HL: '#34d399', // Hembra Levante: Verde
    HV: '#fbbf24', // Hembra Vientre: Amarillo/Naranja
    VP: '#808080', // Vaca Parida: Gris
    VH: '#ec4899'  // Vaca Horra: Rosa fuerte
};

const REGIONS = [
    { id: 'nacional', label: 'Promedio Nacional', source: 'Promedio de Plazas' },
    { id: 'puerto_berrio', label: 'Puerto Berrío', source: 'Sugaberrío' },
    { id: 'monteria', label: 'Montería', source: 'Subastar' },
    { id: 'aguachica', label: 'Aguachica', source: 'Sugaberrío' },
    { id: 'chigorodo', label: 'Chigorodó', source: 'Suganar' },
    { id: 'medellin', label: 'Medellín', source: 'Central Ganadera' }
];

export default function MercadoGanado() {
    const { fincaId, licenciaInfo } = useAuth();
    const plan = licenciaInfo?.licencia || 'demo';

    const [precios, setPrecios] = useState<PrecioBoletin[]>([]);
    const [animales, setAnimales] = useState<AnimalCategorizado[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRegion, setSelectedRegion] = useState('nacional');
    const [activeTabChart, setActiveTabChart] = useState<'semanal' | 'mensual'>('semanal');
    const [selectedCategoryChart, setSelectedCategoryChart] = useState<string>('ML');
    
    // Modal de bloqueo
    const [showUpsell, setShowUpsell] = useState(false);
    const [upsellTargetPlan, setUpsellTargetPlan] = useState<'finca' | 'premium'>('finca');

    const fetchDatos = async () => {
        setLoading(true);
        try {
            // 1. Fetch precios de mercado
            const { data: preciosData, error: errPrecios } = await supabase
                .from('vista_precios_mercado')
                .select('*')
                .order('fecha_boletin', { ascending: true });

            if (errPrecios) throw errPrecios;
            if (preciosData) setPrecios(preciosData);

            // 2. Fetch animales para valoración patrimonial (si es premium)
            if (fincaId) {
                const { data: animData } = await supabase
                    .from('animales')
                    .select(`
                        id, sexo, etapa, peso_ingreso, peso_compra,
                        registros_pesaje (peso, fecha)
                    `)
                    .eq('id_finca', fincaId)
                    .eq('estado', 'activo');

                if (animData) {
                    const processed = animData.map((a: any) => {
                        const registros = (a.registros_pesaje || []).sort((x: any, y: any) =>
                            new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                        );
                        const weight = registros[0]?.peso ?? (a.peso_compra ?? a.peso_ingreso ?? 0);

                        // Clasificación zootécnica
                        let category = 'ML';
                        if (a.sexo === 'M') {
                            if (a.etapa === 'levante' || a.etapa === 'cria') {
                                category = 'ML';
                            } else {
                                category = weight >= 440 ? 'MG' : 'MC';
                            }
                        } else {
                            if (a.etapa === 'levante' || a.etapa === 'cria') {
                                category = 'HL';
                            } else {
                                if (weight < 320) {
                                    category = 'HL';
                                } else if (weight >= 320 && weight < 400) {
                                    category = 'HV';
                                } else if (weight >= 400 && weight < 450) {
                                    category = 'VH';
                                } else {
                                    category = 'VP';
                                }
                            }
                        }
                        return { id: a.id, category, weight: Number(weight) };
                    });
                    setAnimales(processed);
                }
            }
        } catch (err: any) {
            console.error('Error cargando datos de mercado:', err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDatos();
    }, [fincaId]);

    // Filtrar los precios por la región seleccionada (restringiendo a Nacional si es plan Demo)
    const activeRegion = useMemo(() => {
        if (plan === 'demo') return 'nacional';
        return selectedRegion;
    }, [selectedRegion, plan]);

    // Precios de la última fecha/boletín disponible para la región activa
    const preciosUltimoBoletin = useMemo(() => {
        const preciosRegion = precios.filter(p => p.region === activeRegion);
        if (preciosRegion.length === 0) return [];
        
        // Obtener la fecha más reciente
        const fechasUnicas = Array.from(new Set(preciosRegion.map(p => p.fecha_boletin)))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        
        const ultimaFecha = fechasUnicas[0];
        return preciosRegion.filter(p => p.fecha_boletin === ultimaFecha);
    }, [precios, activeRegion]);

    const fechaUltimoBoletin = useMemo(() => {
        if (preciosUltimoBoletin.length === 0) return '';
        const f = preciosUltimoBoletin[0].fecha_boletin;
        try {
            const parts = f.split('-');
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch {
            return f;
        }
    }, [preciosUltimoBoletin]);

    // Relación de Reemplazo (ML / MG y MC / MG)
    const ratiosReemplazo = useMemo(() => {
        const preciosMap: Record<string, number> = {};
        preciosUltimoBoletin.forEach(p => {
            preciosMap[p.categoria_animal] = Number(p.precio_promedio_kg);
        });

        const ml = preciosMap['ML'] || 0;
        const mc = preciosMap['MC'] || 0;
        const mg = preciosMap['MG'] || 0;

        return {
            flacoGordo: mg > 0 ? (ml / mg) : 0,
            cebaGordo: mg > 0 ? (mc / mg) : 0
        };
    }, [preciosUltimoBoletin]);

    // Valoración de Inventario Patrimonial (Premium)
    const valoracionPatrimonial = useMemo(() => {
        const preciosMap: Record<string, number> = {};
        preciosUltimoBoletin.forEach(p => {
            preciosMap[p.categoria_animal] = Number(p.precio_promedio_kg);
        });

        // Agrupar animales por categoría y sumar pesos y cantidad
        const grupos: Record<string, { cant: number; totalPeso: number; precioKg: number; subtotal: number }> = {};
        
        Object.keys(CATEGORY_NAMES).forEach(cat => {
            grupos[cat] = { cant: 0, totalPeso: 0, precioKg: preciosMap[cat] || 0, subtotal: 0 };
        });

        animales.forEach(a => {
            if (grupos[a.category]) {
                grupos[a.category].cant += 1;
                grupos[a.category].totalPeso += a.weight;
            }
        });

        let totalGeneral = 0;
        let totalCabezas = 0;
        let totalKilos = 0;

        Object.keys(grupos).forEach(cat => {
            const g = grupos[cat];
            g.subtotal = g.totalPeso * g.precioKg;
            totalGeneral += g.subtotal;
            totalCabezas += g.cant;
            totalKilos += g.totalPeso;
        });

        return {
            items: Object.entries(grupos).map(([cat, val]) => ({ category: cat, ...val })),
            totalGeneral,
            totalCabezas,
            totalKilos
        };
    }, [preciosUltimoBoletin, animales]);

    // Datos procesados para la gráfica
    const chartData = useMemo(() => {
        const preciosRegion = precios.filter(p => p.region === activeRegion);
        
        // Agrupar por fecha
        const fechas = Array.from(new Set(preciosRegion.map(p => p.fecha_boletin))).sort();
        
        if (activeTabChart === 'semanal') {
            return fechas.map(f => {
                const fila: any = { name: f.split('-').slice(1).join('/') }; // Ej: 08-15
                preciosRegion.filter(p => p.fecha_boletin === f).forEach(p => {
                    fila[p.categoria_animal] = Number(p.precio_promedio_kg);
                });
                return fila;
            });
        } else {
            // Agrupar promedios mensuales
            const mensualMap: Record<string, Record<string, { suma: number; cant: number }>> = {};

            preciosRegion.forEach(p => {
                const mesKey = p.fecha_boletin.slice(0, 7); // Ej: 2026-08
                if (!mensualMap[mesKey]) mensualMap[mesKey] = {};
                if (!mensualMap[mesKey][p.categoria_animal]) {
                    mensualMap[mesKey][p.categoria_animal] = { suma: 0, cant: 0 };
                }
                mensualMap[mesKey][p.categoria_animal].suma += Number(p.precio_promedio_kg);
                mensualMap[mesKey][p.categoria_animal].cant += 1;
            });

            return Object.keys(mensualMap).sort().map(mes => {
                const fila: any = { name: mes };
                Object.keys(mensualMap[mes]).forEach(cat => {
                    const info = mensualMap[mes][cat];
                    fila[cat] = Math.round(info.suma / info.cant);
                });
                return fila;
            });
        }
    }, [precios, activeRegion, activeTabChart]);

    const handleSelectRegion = (regId: string) => {
        if (plan === 'demo' && regId !== 'nacional') {
            setUpsellTargetPlan('finca');
            setShowUpsell(true);
            return;
        }
        setSelectedRegion(regId);
    };    const whatsappMessage = encodeURIComponent(
        `Hola, deseo actualizar mi plan en AgroGestión para desbloquear el monitor completo de mercado regional y la valoración de inventario.`
    );
    const whatsappLink = `https://wa.me/573117424489?text=${whatsappMessage}`;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: 'var(--primary-light)' }}>
                <Activity size={32} className="animate-spin" style={{ marginRight: '12px' }} />
                <span>Analizando comportamiento de precios ganaderos...</span>
            </div>
        );
    }

    return (
        <div className="page-container" style={{ paddingBottom: '40px' }}>
            {/* Cabecera */}
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ background: 'rgba(124, 58, 237, 0.12)', border: '1px solid rgba(124, 58, 237, 0.3)', borderRadius: '12px', padding: '8px', display: 'flex' }}>
                            <TrendingUp size={24} color="#a78bfa" />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'white' }}>Monitor de Mercado Ganadero</h1>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Precios de referencia de las principales subastas del país y tendencias del 2026.
                    </p>
                </div>

                {fechaUltimoBoletin && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Calendar size={16} color="#a78bfa" />
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Boletín Vigente</div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'white' }}>{fechaUltimoBoletin}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Selector de Plazas / Regiones */}
            <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={16} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Plaza de Referencia:</span>
                </div>
                <select
                    value={activeRegion}
                    onChange={(e) => handleSelectRegion(e.target.value)}
                    style={{
                        width: 'auto',
                        minWidth: '220px',
                        padding: '8px 32px 8px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(30, 30, 30, 0.8) url("data:image/svg+xml;utf8,<svg fill=\'%23c084fc\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 8px center',
                        backgroundSize: '20px',
                        color: 'white',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        margin: 0,
                        outline: 'none',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none'
                    }}
                >
                    {REGIONS.map(r => {
                        const isLocked = plan === 'demo' && r.id !== 'nacional';
                        return (
                            <option key={r.id} value={r.id}>
                                {r.label} {isLocked ? ' 🔒' : ''}
                            </option>
                        );
                    })}
                </select>
            </div>

            {/* Banner Informativo Demo */}
            {plan === 'demo' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', background: 'rgba(255, 179, 0, 0.08)', border: '1px solid rgba(255, 179, 0, 0.25)', borderRadius: '12px', padding: '16px 20px', marginBottom: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Lock size={20} color="#ffb74d" style={{ flexShrink: 0 }} />
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#ffb74d' }}>
                            Estás en el <strong>Plan Demo</strong>. Solo tienes acceso al Promedio Nacional. Actualiza tu plan para ver los precios regionales de Puerto Berrío, Montería, Aguachica, Chigorodó y Medellín.
                        </p>
                    </div>
                    <button 
                        onClick={() => { setUpsellTargetPlan('finca'); setShowUpsell(true); }}
                        style={{ background: '#ffb74d', border: 'none', color: '#1a1a2e', padding: '8px 16px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                        Actualizar Plan <ArrowUpRight size={14} />
                    </button>
                </div>
            )}

            {/* Grid de Precios por Categoría */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                {Object.keys(CATEGORY_NAMES).map(catKey => {
                    const pInfo = preciosUltimoBoletin.find(p => p.categoria_animal === catKey);
                    const precio = pInfo ? Number(pInfo.precio_promedio_kg) : 0;
                    const varPct = pInfo ? Number(pInfo.variacion_porcentaje) : 0;

                    return (
                        <div 
                            key={catKey}
                            style={{
                                background: 'rgba(30, 30, 30, 0.65)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '14px',
                                padding: '18px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                minHeight: '130px',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Label Categoria */}
                            <div>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {CATEGORY_NAMES[catKey]}
                                </span>
                            </div>

                            {/* Valor Precio */}
                            <div style={{ margin: '12px 0 6px' }}>
                                {precio > 0 ? (
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                        ${precio.toLocaleString('es-CO')}
                                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ kg</span>
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin datos</div>
                                )}
                            </div>

                            {/* Variación y Fuente */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                                {precio > 0 ? (
                                    <>
                                        {/* Variación */}
                                        <div 
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                color: varPct > 0 
                                                    ? 'var(--success)' 
                                                    : varPct < 0 
                                                        ? 'var(--error)' 
                                                        : 'var(--text-muted)',
                                                background: varPct > 0 
                                                    ? 'rgba(76, 175, 80, 0.1)' 
                                                    : varPct < 0 
                                                        ? 'rgba(244, 67, 54, 0.1)' 
                                                        : 'rgba(255,255,255,0.04)',
                                                padding: '3px 8px',
                                                borderRadius: '6px'
                                            }}
                                        >
                                            {varPct > 0 ? <TrendingUp size={12} /> : varPct < 0 ? <TrendingDown size={12} /> : <Activity size={12} />}
                                            <span>
                                                {varPct > 0 ? `+${varPct.toFixed(2)}%` : `${varPct.toFixed(2)}%`}
                                            </span>
                                        </div>

                                        {/* Fuente */}
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                            {pInfo?.fuente_informacion || 'Subasta'}
                                        </span>
                                    </>
                                ) : (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sin publicación vigente</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Ratios de Reemplazo y Gráfica */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: '24px', marginBottom: '32px', alignItems: 'start' }}>
                
                {/* Panel de Ratios y Métricas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Scale size={18} color="#a78bfa" />
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'white' }}>Relación de Reemplazo</h3>
                        </div>
                        
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '20px' }}>
                            Establece el ratio de costo por kilo del flaco frente al animal gordo terminado.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Ratio 1 */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px 16px' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>Levante / Gordo (ML/MG)</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>
                                        {ratiosReemplazo.flacoGordo > 0 ? ratiosReemplazo.flacoGordo.toFixed(2) : 'N/A'}
                                    </div>
                                    {ratiosReemplazo.flacoGordo > 0 && (
                                        <div style={{ fontSize: '0.72rem', color: ratiosReemplazo.flacoGordo > 1 ? 'var(--warning)' : 'var(--success)' }}>
                                            {ratiosReemplazo.flacoGordo > 1 ? 'Desfavorable (ML > MG)' : 'Favorable (ML < MG)'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Ratio 2 */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px 16px' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>Media Ceba / Gordo (MC/MG)</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#c084fc' }}>
                                        {ratiosReemplazo.cebaGordo > 0 ? ratiosReemplazo.cebaGordo.toFixed(2) : 'N/A'}
                                    </div>
                                    {ratiosReemplazo.cebaGordo > 0 && (
                                        <div style={{ fontSize: '0.72rem', color: ratiosReemplazo.cebaGordo > 1 ? 'var(--warning)' : 'var(--success)' }}>
                                            {ratiosReemplazo.cebaGordo > 1 ? 'Desfavorable' : 'Favorable'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Consejo AgroBot */}
                        <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(124, 58, 237, 0.06)', border: '1px solid rgba(124, 58, 237, 0.15)', borderRadius: '8px', display: 'flex', gap: '10px' }}>
                            <Info size={16} color="#a78bfa" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                                Un ratio de reemplazo inferior a <strong>1.00</strong> indica que estás comprando el kilo flaco a menor precio que el terminado, aumentando el margen zootécnico del ciclo.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Gráfica de Historial */}
                <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '24px', minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'white' }}>Historial y Tendencia</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Visualiza la fluctuación de los precios en el transcurso del año.</p>
                        </div>

                        {/* Tabs Chart */}
                        <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.04)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                                onClick={() => setActiveTabChart('semanal')}
                                style={{ background: activeTabChart === 'semanal' ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', color: activeTabChart === 'semanal' ? 'white' : 'var(--text-muted)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Semanas
                            </button>
                            <button
                                onClick={() => setActiveTabChart('mensual')}
                                style={{ background: activeTabChart === 'mensual' ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', color: activeTabChart === 'mensual' ? 'white' : 'var(--text-muted)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Mensual
                            </button>
                        </div>
                    </div>

                    {/* Selector de categoría para graficar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Filtrar Categoría:</span>
                        <select
                            value={selectedCategoryChart}
                            onChange={(e) => setSelectedCategoryChart(e.target.value)}
                            style={{
                                width: 'auto',
                                minWidth: '180px',
                                padding: '6px 28px 6px 10px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(30, 30, 30, 0.8) url("data:image/svg+xml;utf8,<svg fill=\'%23a78bfa\' height=\'20\' viewBox=\'0 0 24 24\' width=\'20\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M7 10l5 5 5-5z\'/></svg>") no-repeat right 6px center',
                                backgroundSize: '18px',
                                color: 'white',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                margin: 0,
                                outline: 'none',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none'
                            }}
                        >
                            {Object.entries(CATEGORY_NAMES).map(([catKey, catName]) => (
                                <option key={catKey} value={catKey}>
                                    {catName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ height: '320px', width: '100%', position: 'relative' }}>
                        {/* Gráfico Real */}
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" style={{ fontSize: '0.7rem' }} />
                                <YAxis domain={['auto', 'auto']} stroke="rgba(255,255,255,0.3)" style={{ fontSize: '0.7rem' }} />
                                <RechartsTooltip 
                                    contentStyle={{ background: '#1c1c2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '0.8rem' }}
                                    labelStyle={{ color: 'var(--text-muted)' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '10px' }} />
                                <Line 
                                    type="monotone" 
                                    dataKey={selectedCategoryChart} 
                                    name={CATEGORY_NAMES[selectedCategoryChart]} 
                                    stroke={CATEGORY_COLORS[selectedCategoryChart] || '#a78bfa'} 
                                    strokeWidth={2} 
                                    dot={{ r: 4 }} 
                                    activeDot={{ r: 6 }} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* SECCIÓN VALORACIÓN DE INVENTARIO VIVO (Premium) */}
            <div style={{ background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '10px', padding: '8px', display: 'flex' }}>
                            <Layers size={20} color="#c084fc" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'white' }}>Valoración de Inventario Ganadero</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cálculo patrimonial estimado basado en los kilos registrados en tu finca.</p>
                        </div>
                    </div>
                    {licenciaInfo?.licencia === 'premium' && (
                        <div style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)', borderRadius: '10px', padding: '10px 18px', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', color: '#c084fc', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>Valor Estimado del Inventario Vivo</div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'white' }}>
                                $ {valoracionPatrimonial.totalGeneral.toLocaleString('es-CO')} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>COP</span>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ position: 'relative' }}>
                    {licenciaInfo?.licencia !== 'premium' ? (
                        /* Overlay de Bloqueo Premium */
                        <div style={{ padding: '48px 24px', textAlign: 'center', background: 'linear-gradient(180deg, rgba(30,30,30,0.5) 0%, rgba(20,20,20,0.9) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                                <Lock size={26} color="#c084fc" />
                            </div>
                            <h4 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>Valoración de Inventario en Finca</h4>
                            <p style={{ margin: '0 0 24px', fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '480px', lineHeight: '1.4' }}>
                                Estima automáticamente el valor en pesos del inventario vivo de tu finca multiplicando los kilos totales actuales de tu ganado por los precios vigentes de la subasta seleccionada.
                            </p>
                            <button
                                onClick={() => { setUpsellTargetPlan('premium'); setShowUpsell(true); }}
                                style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', color: 'white', padding: '12px 24px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)' }}
                            >
                                Desbloquear con Plan Premium <ChevronRight size={16} />
                            </button>
                        </div>
                    ) : (
                        /* Tabla Real de Valoración */
                        <div style={{ padding: '24px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Categoría</th>
                                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Cabezas</th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Kilos Totales</th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Precio Referencia ($/kg)</th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>Subtotal (COP)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {valoracionPatrimonial.totalCabezas === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                No hay animales registrados en tu finca para valorar.
                                            </td>
                                        </tr>
                                    ) : (
                                        valoracionPatrimonial.items
                                            .filter(item => item.cant > 0)
                                            .map(item => (
                                                <tr key={item.category} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.01)' }}>
                                                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--primary-light)' }}>{CATEGORY_NAMES[item.category]}</td>
                                                    <td style={{ padding: '12px', textAlign: 'center' }}>{item.cant} cabezas</td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>{item.totalPeso.toLocaleString('es-CO')} kg</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>${item.precioKg.toLocaleString('es-CO')}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'white' }}>
                                                        ${item.subtotal.toLocaleString('es-CO')}
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(168, 85, 247, 0.05)', fontWeight: 800 }}>
                                        <td style={{ padding: '16px 12px' }}>Total Consolidado</td>
                                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>{valoracionPatrimonial.totalCabezas} cabezas</td>
                                        <td style={{ padding: '16px 12px', textAlign: 'right' }}>{valoracionPatrimonial.totalKilos.toLocaleString('es-CO')} kg</td>
                                        <td style={{ padding: '16px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                                        <td style={{ padding: '16px 12px', textAlign: 'right', color: '#c084fc', fontSize: '1.05rem' }}>
                                            ${valoracionPatrimonial.totalGeneral.toLocaleString('es-CO')}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* === MODAL UPSELL === */}
            {showUpsell && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#1a1a2e', border: '1px solid rgba(168, 85, 247, 0.4)', borderRadius: '20px', padding: '36px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 10px 30px rgba(124, 58, 237, 0.2)' }}>
                        <div style={{ background: 'rgba(168, 85, 247, 0.15)', borderRadius: '50%', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <Award size={32} color="#c084fc" />
                        </div>
                        <h3 style={{ margin: '0 0 10px', color: 'white', fontSize: '1.4rem' }}>
                            Desbloquea el {upsellTargetPlan === 'premium' ? 'Plan Premium' : 'Plan Finca'}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', margin: '0 0 28px' }}>
                            {upsellTargetPlan === 'premium' 
                                ? 'La Valoración Patrimonial de Inventario Vivo te permite tasar tu hato completo en tiempo real. Disponible de forma exclusiva para empresas y fincas en el Plan Premium.' 
                                : 'Accede a la visualización de boletines regionales (Sugaberrío, Subastar, Suganar, Central Ganadera) y sus correspondientes análisis históricos. Disponible en Plan Finca.'}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noreferrer"
                                style={{ textDecoration: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', color: 'white', padding: '12px 24px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <MessageCircle size={18} /> Solicitar Activación vía WhatsApp
                            </a>
                            <button
                                onClick={() => setShowUpsell(false)}
                                style={{ padding: '10px 24px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}
                            >
                                Regresar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
