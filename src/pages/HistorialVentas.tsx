import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Tag, Calendar, Users, FileText, X, Info, TrendingUp, Download, Loader2 } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import SalesReport from '../components/SalesReport';
import SalesReportSimple from '../components/SalesReportSimple';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toDisplayValue, getUnidadLabel, getModoLabel } from '../utils/ganancia';

interface AnimalVentaParaReporte {
    numero_chapeta: string;
    peso_salida: string | number;
    propietario: string;
    gmp?: number;
    potreroNombre?: string;
    fecha_ingreso?: string;
    peso_ingreso?: number;
    fecha_inicio_ceba?: string | null;
    peso_inicio_ceba?: number | null;
    precio_venta?: string;
    es_estimado?: boolean;
}

// Tipo enriquecido para la tarjeta de detalle de la venta
interface AnimalVentaDetalle {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    etapa: string;
    peso_ingreso: number;
    peso_compra?: number | null;
    fecha_ingreso: string;
    peso_venta: number;
    gmp: number;
    pesajesFiltrados: Record<string, number>;
    pesajesTotalesMap: Record<string, number>;
    registros_pesaje: { peso: number; fecha: string; gdp_calculada: number; etapa: string }[];
}

interface VentaGrupo {
    id: string;
    titulo: string;
    fechaVenta: string;
    comprador: string;
    observaciones?: string;
    animalesCount: number;
    pesoPromedio: number;
    gmpPromedio: number;
    animalesReporte: AnimalVentaParaReporte[];
    animalesDetalle: AnimalVentaDetalle[];
}

export default function HistorialVentas() {
    const { fincaId, userFincas, modoGanancia } = useAuth();
    const [ventas, setVentas] = useState<VentaGrupo[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);
    
    // Estado para abrir el reporte PDF completo
    const [selectedVenta, setSelectedVenta] = useState<VentaGrupo | null>(null);

    // Estado para abrir el reporte simple (solo chapeta + peso)
    const [selectedVentaSimple, setSelectedVentaSimple] = useState<VentaGrupo | null>(null);

    // Estado para abrir modal de detalle de venta (estilo Potreradas)
    const [detalleVenta, setDetalleVenta] = useState<VentaGrupo | null>(null);
    const [exportingDetallePdf, setExportingDetallePdf] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    // Estado para tarjeta individual de un animal vendido
    const [selectedAnimalDetalle, setSelectedAnimalDetalle] = useState<AnimalVentaDetalle | null>(null);

    // Resumen de métricas
    const [metrics, setMetrics] = useState({
        count: 0,
        avgWeight: 0,
        avgGmp: 0,
        metaMinima: 0
    });

    useEffect(() => {
        if (!fincaId) return;
        
        const fetchVentas = async () => {
            setLoading(true);
            const { data: config } = await supabase
                .from('configuracion_kpi')
                .select('umbral_alto_gmp, umbral_medio_gmp, precio_venta_promedio, costo_mensual_animal')
                .eq('id_finca', fincaId)
                .single();
            
            let metaMinimaVal = 0;
            if (config) {
                setUmbralAlto(config.umbral_alto_gmp ?? 20);
                setUmbralMedio(config.umbral_medio_gmp ?? 10);
                
                const precio = parseFloat(config.precio_venta_promedio || 0);
                const costo = parseFloat(config.costo_mensual_animal || 0);
                if (precio > 0) {
                    metaMinimaVal = (costo / 0.6) / precio;
                }
            }

            const { data, error } = await supabase
                .from('animales')
                .select(`
                    id, 
                    numero_chapeta, 
                    nombre_propietario,
                    comprador_venta,
                    fecha_venta,
                    peso_venta,
                    peso_ingreso,
                    peso_compra,
                    fecha_ingreso,
                    etapa,
                    fecha_ingreso_ceba,
                    peso_ingreso_ceba,
                    es_emergencia,
                    precio_venta,
                    observaciones_venta,
                    potreros (nombre),
                    registros_pesaje (
                        peso,
                        fecha,
                        etapa,
                        gdp_calculada
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('estado', 'vendido')
                .order('fecha_venta', { ascending: false });

            if (data && !error) {
                const grouped = data.reduce((acc: any, animal: any) => {
                    const fecha = animal.fecha_venta || 'Sin fecha';
                    const comprador = animal.comprador_venta || 'Desconocido';
                    
                    if (comprador.toLowerCase() === 'desconocido') return acc;
                    
                    const key = `${fecha}-${comprador}`;
                    
                    const registros = (animal.registros_pesaje || []).sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );
                    const ultimoP = registros[0];
                    
                    const pesoSalida = animal.peso_venta || ultimoP?.peso || 0;
                    const pesoIngresoDB = animal.peso_compra ?? animal.peso_ingreso ?? 0;
                    let gmp = 0;

                    if (fecha && animal.fecha_ingreso && pesoIngresoDB > 0 && pesoSalida > 0) {
                        const d1 = new Date(animal.fecha_ingreso + 'T12:00:00');
                        const d2 = new Date(fecha + 'T12:00:00');
                        const dias = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                        gmp = ((pesoSalida - pesoIngresoDB) / dias) * 30;
                    }

                    const potreroObj = animal.potreros as any;
                    const potreroNombre = Array.isArray(potreroObj) ? potreroObj[0]?.nombre : potreroObj?.nombre || 'Sin potrero';

                    const registroCeba = (animal.registros_pesaje || [])
                        .filter((r: any) => r.etapa === 'ceba')
                        .sort((x: any, y: any) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime())[0];
                    const fechaInicioCeba = animal.fecha_ingreso_ceba || (registroCeba ? registroCeba.fecha : (animal.etapa === 'ceba' ? animal.fecha_ingreso : null));
                    const pesoInicioCeba = animal.peso_ingreso_ceba || (registroCeba ? registroCeba.peso : (animal.etapa === 'ceba' ? (animal.peso_compra ?? animal.peso_ingreso) : null));

                    const animalRep: AnimalVentaParaReporte = {
                        numero_chapeta: animal.numero_chapeta,
                        peso_salida: animal.peso_venta || ultimoP?.peso || 0,
                        propietario: animal.nombre_propietario,
                        gmp: gmp,
                        potreroNombre: potreroNombre,
                        fecha_ingreso: animal.fecha_ingreso,
                        peso_ingreso: animal.peso_compra ?? animal.peso_ingreso,
                        fecha_inicio_ceba: fechaInicioCeba,
                        peso_inicio_ceba: pesoInicioCeba,
                        precio_venta: animal.precio_venta != null ? animal.precio_venta.toString() : undefined,
                        es_estimado: animal.es_emergencia
                    };

                    // Datos enriquecidos para el modal de detalle
                    const registrosOrdenados = (animal.registros_pesaje || []).sort((x: any, y: any) =>
                        new Date(x.fecha).getTime() - new Date(y.fecha).getTime()
                    );
                    
                    const registrosEtapa = registrosOrdenados.filter((r: any) => r.etapa === animal.etapa);
                    
                    const pesajesMap: Record<string, number> = {};
                    registrosEtapa.forEach((r: any) => {
                        const fechaNorm = r.fecha ? r.fecha.split('T')[0] : r.fecha;
                        pesajesMap[fechaNorm] = Number(r.peso);
                    });
                    
                    const pesajesTotalesMap: Record<string, number> = {};
                    registrosOrdenados.forEach((r: any) => {
                        const fechaNorm = r.fecha ? r.fecha.split('T')[0] : r.fecha;
                        pesajesTotalesMap[fechaNorm] = Number(r.peso);
                    });

                    const animalDet: AnimalVentaDetalle = {
                        id: animal.id,
                        numero_chapeta: animal.numero_chapeta,
                        nombre_propietario: animal.nombre_propietario,
                        etapa: animal.etapa,
                        peso_ingreso: animal.peso_compra ?? animal.peso_ingreso,
                        fecha_ingreso: animal.fecha_ingreso,
                        peso_venta: animal.peso_venta || ultimoP?.peso || 0,
                        gmp: gmp,
                        pesajesFiltrados: pesajesMap,
                        pesajesTotalesMap: pesajesTotalesMap,
                        registros_pesaje: registrosOrdenados.map((r: any) => ({
                            peso: r.peso,
                            fecha: r.fecha,
                            gdp_calculada: r.gdp_calculada || 0,
                            etapa: r.etapa
                        }))
                    };

                    if (!acc[key]) {
                        acc[key] = {
                            id: key,
                            titulo: `Venta - ${fecha} - ${comprador}`,
                            fechaVenta: fecha,
                            comprador: comprador,
                            observaciones: animal.observaciones_venta,
                            animalesCount: 0,
                            pesoTotal: 0,
                            gmpTotal: 0,
                            gmpCount: 0,
                            animalesReporte: [],
                            animalesDetalle: []
                        };
                    }
                    
                    acc[key].animalesCount++;
                    acc[key].pesoTotal += parseFloat(animalRep.peso_salida.toString());
                    acc[key].gmpTotal += gmp;
                    acc[key].gmpCount++;
                    acc[key].animalesReporte.push(animalRep);
                    acc[key].animalesDetalle.push(animalDet);
                    
                    return acc;
                }, {});

                const ventasList: VentaGrupo[] = Object.values(grouped).map((v: any) => ({
                    ...v,
                    pesoPromedio: v.animalesCount > 0 ? v.pesoTotal / v.animalesCount : 0,
                    gmpPromedio: v.gmpCount > 0 ? v.gmpTotal / v.gmpCount : 0
                }));
                
                // Ordenar por fecha descendente
                ventasList.sort((a, b) => new Date(b.fechaVenta).getTime() - new Date(a.fechaVenta).getTime());
                setVentas(ventasList);

                // Calcular métricas anuales
                const curYear = new Date().getFullYear();
                const yearlyAnimals = data.filter(a => a.fecha_venta && new Date(a.fecha_venta).getFullYear() === curYear);
                const countY = yearlyAnimals.length;
                const weightY = countY > 0 ? yearlyAnimals.reduce((sum, a) => sum + (a.peso_venta || 0), 0) / countY : 0;
                
                let totalGmpY = 0;
                let validGmpCount = 0;
                
                yearlyAnimals.forEach(animal => {
                    const pesoSalida = animal.peso_venta || 0;
                    const pesoIngresoDB = animal.peso_compra ?? animal.peso_ingreso ?? 0;
                    const fechaSalida = animal.fecha_venta;
                    const fechaIngreso = animal.fecha_ingreso;
                    
                    if (fechaSalida && fechaIngreso && pesoIngresoDB > 0 && pesoSalida > 0) {
                        const d1 = new Date(fechaIngreso + 'T12:00:00');
                        const d2 = new Date(fechaSalida + 'T12:00:00');
                        const dias = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                        const gmpV = ((pesoSalida - pesoIngresoDB) / dias) * 30;
                        totalGmpY += gmpV;
                        validGmpCount++;
                    }
                });
                const avgGmpY = validGmpCount > 0 ? totalGmpY / validGmpCount : 0;

                setMetrics({
                    count: countY,
                    avgWeight: weightY,
                    avgGmp: avgGmpY,
                    metaMinima: metaMinimaVal
                });
            }
            setLoading(false);
        };
        fetchVentas();
    }, [fincaId]);

    const filteredVentas = ventas.filter(v => 
        v.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || 
        v.comprador.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatFecha = (fechaStr: string) => {
        if (fechaStr === 'Sin fecha') return fechaStr;
        try {
            return format(new Date(fechaStr + 'T12:00:00'), 'dd MMM yyyy', { locale: es });
        } catch {
            return fechaStr;
        }
    };

    // Calcular columnas de fechas para el modal de detalle
    const getFechasColumnas = (animales: AnimalVentaDetalle[], showFull: boolean) => {
        const fechasSet = new Set<string>();
        animales.forEach(a => {
            const pesajes = showFull ? a.pesajesTotalesMap : a.pesajesFiltrados;
            Object.keys(pesajes).forEach(f => fechasSet.add(f));
        });
        return Array.from(fechasSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    };

    const handleExportPDF = async () => {
        if (!printRef.current || !detalleVenta) return;
        setExportingDetallePdf(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 100)); // reflow
            const canvas = await html2canvas(printRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#121212',
                logging: false,
                windowWidth: 1200
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Venta_${detalleVenta.titulo.replace(/\s+/g, '_')}_${formatFecha(detalleVenta.fechaVenta).replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error('Error al exportar PDF:', error);
        } finally {
            setExportingDetallePdf(false);
        }
    };

    return (
        <div className="page-container">
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Tag size={32} /> Historial de Ventas
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                Registro histórico de todas las ventas realizadas en la finca. Haz clic en el ícono PDF para ver el informe, o en "Ver Detalle" para inspeccionar los animales.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <div className="glass-panel" style={{ textAlign: 'center', padding: '20px', borderTop: '4px solid var(--primary-light)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold', letterSpacing: '0.5px' }}>Animales Vendidos ({new Date().getFullYear()})</div>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary-light)' }}>{metrics.count}</div>
                </div>
                <div className="glass-panel" style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold', letterSpacing: '0.5px' }}>Peso Promedio Venta</div>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: 'white' }}>{metrics.avgWeight.toFixed(0)} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>kg</span></div>
                </div>
                <div className="glass-panel" style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold', letterSpacing: '0.5px' }}>{getModoLabel(modoGanancia)} Promedio Historial</div>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: (metrics.avgGmp < 0 ? 'var(--error)' : (metrics.avgGmp <= umbralMedio ? 'var(--warning)' : (metrics.avgGmp <= umbralAlto ? 'var(--text-light)' : 'var(--success)'))) }}>
                        {toDisplayValue(metrics.avgGmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 2)} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{getUnidadLabel(modoGanancia)}</span>
                    </div>
                </div>
                <div className="glass-panel" style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold', letterSpacing: '0.5px' }}>Meta Mínima (Eq.)</div>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: 'white' }}>
                        {toDisplayValue(metrics.metaMinima, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 2)} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getUnidadLabel(modoGanancia)}</span>
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por comprador o fecha..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ marginBottom: 0, paddingLeft: '40px' }}
                    />
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--primary-light)' }}>
                    Cargando historial de ventas...
                </div>
            ) : filteredVentas.length === 0 ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hay ventas registradas que coincidan con la búsqueda.
                </div>
            ) : (
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Venta / Fecha</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Comprador</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Animales</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Peso Prom.</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>GMP Lote</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredVentas.map((venta, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s ease' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>{venta.fechaVenta}</div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Calendar size={12} /> {formatFecha(venta.fechaVenta)}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{venta.comprador}</div>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <span style={{ fontWeight: 'bold', color: 'white' }}>{venta.animalesCount}</span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <span style={{ fontWeight: 'bold', color: 'white' }}>{Math.round(venta.pesoPromedio)}</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>kg</span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <span style={{
                                                color: venta.gmpPromedio < 0 ? 'var(--error)' : (venta.gmpPromedio <= umbralMedio ? 'var(--warning)' : (venta.gmpPromedio <= umbralAlto ? 'var(--text-light)' : 'var(--success)')),
                                                fontWeight: 'bold'
                                            }}>
                                                {venta.gmpPromedio.toFixed(1)}
                                                <small style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '2px' }}>kg/m</small>
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => setDetalleVenta(venta)}
                                                    style={{ 
                                                        background: 'rgba(76, 175, 80, 0.1)', 
                                                        border: '1px solid rgba(76, 175, 80, 0.3)', 
                                                        color: 'var(--success)', 
                                                        padding: '6px 12px', 
                                                        borderRadius: '6px', 
                                                        cursor: 'pointer', 
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                    title="Ver detalle de animales"
                                                >
                                                    <Info size={14} /> Detalle
                                                </button>
                                                <button
                                                    onClick={() => setSelectedVentaSimple(venta)}
                                                    style={{ 
                                                        background: 'rgba(33, 150, 243, 0.1)', 
                                                        border: '1px solid rgba(33, 150, 243, 0.3)', 
                                                        color: '#64b5f6', 
                                                        padding: '6px 12px', 
                                                        borderRadius: '6px', 
                                                        cursor: 'pointer', 
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                    title="Informe simple"
                                                >
                                                    <FileText size={14} /> Simple
                                                </button>
                                                <button
                                                    onClick={() => setSelectedVenta(venta)}
                                                    style={{ 
                                                        background: 'rgba(244, 67, 54, 0.1)', 
                                                        border: '1px solid rgba(244, 67, 54, 0.3)', 
                                                        color: 'var(--error)', 
                                                        padding: '6px 12px', 
                                                        borderRadius: '6px', 
                                                        cursor: 'pointer', 
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                    title="Informe PDF"
                                                >
                                                    <FileText size={14} /> PDF
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal PDF Report completo */}
            {selectedVenta && (
                <SalesReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={selectedVenta.fechaVenta}
                    animales={selectedVenta.animalesReporte}
                    comprador={selectedVenta.comprador}
                    observaciones={selectedVenta.observaciones}
                    umbralAlto={umbralAlto}
                    umbralMedio={umbralMedio}
                    modoGanancia={modoGanancia}
                    onClose={() => setSelectedVenta(null)}
                />
            )}

            {/* Modal Informe Simple */}
            {selectedVentaSimple && (
                <SalesReportSimple
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={selectedVentaSimple.fechaVenta}
                    animales={selectedVentaSimple.animalesReporte}
                    comprador={selectedVentaSimple.comprador}
                    onClose={() => setSelectedVentaSimple(null)}
                />
            )}

            {/* ================================================================
                MODAL DETALLE DE VENTA - Estilo Potreradas
            ================================================================ */}
            {detalleVenta && (() => {
                const fechasColumnas = getFechasColumnas(detalleVenta.animalesDetalle, showFullHistory);
                
                const allWeighings: { fecha: string; peso: number; gdp: number; isAnchor?: boolean }[] = [];
                detalleVenta.animalesDetalle.forEach(a => {
                    // Punto de ingreso: sirve como ancla para calcular GDP del primer pesaje,
                    // pero NO debe aportar GMP a la gráfica (no hay ganancia todavía)
                    const anchorFecha = a.fecha_ingreso ? a.fecha_ingreso.split('T')[0] : null;
                    const anchorPeso = Number(a.peso_ingreso || 0);

                    if (showFullHistory) {
                        if (anchorFecha && anchorPeso) {
                            allWeighings.push({ fecha: anchorFecha, peso: anchorPeso, gdp: 0, isAnchor: true });
                        }
                    } else {
                        if (anchorFecha && anchorPeso && a.etapa !== 'ceba') {
                            allWeighings.push({ fecha: anchorFecha, peso: anchorPeso, gdp: 0, isAnchor: true });
                        }
                    }

                    const registrosAUsar = (showFullHistory
                        ? (a.registros_pesaje || [])
                        : (a.registros_pesaje || []).filter(r => r.etapa === a.etapa)
                    ).slice().sort((x, y) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());

                    // Siempre calculamos GDP secuencialmente usando el ingreso como punto de arranque.
                    // Esto cubre casos donde gdp_calculada es null en la BD (ej: primer pesaje de ceba).
                    let prevFechaChart: Date | null = anchorFecha ? new Date(anchorFecha + 'T12:00:00') : null;
                    let prevPesoChart: number | null = anchorPeso > 0 ? anchorPeso : null;

                    registrosAUsar.forEach(r => {
                        const fecha = r.fecha.split('T')[0];
                        const peso = Number(r.peso);
                        let gdp = 0;
                        if (prevFechaChart !== null && prevPesoChart !== null) {
                            const currDate = new Date(fecha + 'T12:00:00');
                            const days = Math.floor((currDate.getTime() - prevFechaChart.getTime()) / (1000 * 60 * 60 * 24));
                            if (days > 0) {
                                gdp = (peso - prevPesoChart) / days;
                            }
                            prevFechaChart = currDate;
                            prevPesoChart = peso;
                        } else {
                            // Fallback: usar gdp_calculada de la BD si no hay contexto previo
                            gdp = Number(r.gdp_calculada || 0);
                        }
                        allWeighings.push({ fecha, peso, gdp });
                    });
                });

                const groupedByDate: { [key: string]: { totalPeso: number; totalGdp: number; countPeso: number; countGdp: number } } = {};
                allWeighings.forEach(w => {
                    if (!groupedByDate[w.fecha]) {
                        groupedByDate[w.fecha] = { totalPeso: 0, totalGdp: 0, countPeso: 0, countGdp: 0 };
                    }
                    groupedByDate[w.fecha].totalPeso += w.peso;
                    groupedByDate[w.fecha].countPeso += 1;
                    // Los puntos de ingreso (ancla) no aportan GMP — no hay ganancia todavía
                    if (!w.isAnchor) {
                        groupedByDate[w.fecha].totalGdp += w.gdp;
                        groupedByDate[w.fecha].countGdp += 1;
                    }
                });

                const chartData = Object.keys(groupedByDate)
                    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
                    .map(date => ({
                        fechaStr: format(new Date(date + 'T12:00:00'), 'dd MMM', { locale: es }),
                        fecha: date,
                        pesoPromedio: Math.round(groupedByDate[date].totalPeso / groupedByDate[date].countPeso),
                        // Si la fecha es solo un punto de ingreso (ancla), no trazar GMP
                        gmpPromedio: groupedByDate[date].countGdp > 0
                            ? Number(((groupedByDate[date].totalGdp / groupedByDate[date].countGdp) * 30).toFixed(1))
                            : undefined
                    }));


                return (
                    <div className="modal-overlay">
                        <div className="card modal-content" style={{ maxWidth: '960px', padding: 0 }}>
                            <div ref={printRef} style={{ backgroundColor: '#121212', borderRadius: '16px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                {/* Header */}
                                <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary-light)', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>
                                            {detalleVenta.titulo.toUpperCase()}
                                        </h2>
                                        <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <Calendar size={14} color="var(--primary)" />
                                                <span>Fecha salida:</span>
                                                <strong style={{ color: 'var(--text)' }}>{formatFecha(detalleVenta.fechaVenta)}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <Users size={14} color="var(--primary)" />
                                                <span>Comprador:</span>
                                                <strong style={{ color: 'var(--text)' }}>{detalleVenta.comprador}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <TrendingUp size={14} color="var(--success)" />
                                                <span>GMP Lote:</span>
                                                <strong style={{ color: 'var(--success)' }}>{detalleVenta.gmpPromedio.toFixed(1)} kg/m</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-light)' }}>
                                            <div style={{
                                                width: '32px', height: '18px', borderRadius: '18px',
                                                background: showFullHistory ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                                position: 'relative', transition: 'background 0.3s'
                                            }}>
                                                <div style={{
                                                    width: '14px', height: '14px', borderRadius: '50%', background: 'white',
                                                    position: 'absolute', top: '2px', left: showFullHistory ? '16px' : '2px',
                                                    transition: 'left 0.3s'
                                                }} />
                                            </div>
                                            <span>Historial</span>
                                            <input 
                                                type="checkbox" 
                                                style={{ display: 'none' }} 
                                                checked={showFullHistory} 
                                                onChange={e => setShowFullHistory(e.target.checked)} 
                                            />
                                        </label>
                                        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }}></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button 
                                                onClick={handleExportPDF}
                                                disabled={exportingDetallePdf}
                                                className="icon-btn-tooltip"
                                                data-tooltip="Descargar PDF"
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    color: 'white',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: '8px', width: '36px', height: '36px', padding: 0,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {exportingDetallePdf ? <Loader2 size={16} className="spin" /> : <Download size={16} color="white" />}
                                            </button>
                                            <button 
                                                onClick={() => setDetalleVenta(null)} 
                                                className="icon-btn-tooltip"
                                                data-tooltip="Cerrar detalle"
                                                style={{ 
                                                    margin: 0, width: '36px', height: '36px', padding: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <X size={18} color="white" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Contenido con scroll */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                
                                {/* Gráficas Responsive */}
                                {chartData.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                                        <div className="card" style={{ padding: '16px', height: '280px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</h4>
                                            {chartData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="85%">
                                                    <LineChart data={chartData}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                        <XAxis dataKey="fechaStr" stroke="var(--text-muted)" fontSize={12} />
                                                        <YAxis stroke="var(--text-muted)" fontSize={12} domain={['auto', 'auto']} />
                                                        <RechartsTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                                        <Line type="monotone" dataKey="pesoPromedio" name="Peso (kg)" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary)', r: 4 }} activeDot={{ r: 6 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>Información insuficiente</div>
                                            )}
                                        </div>

                                        <div className="card" style={{ padding: '16px', height: '280px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>GMP Promedio</h4>
                                            {chartData.length > 1 ? (
                                                <ResponsiveContainer width="100%" height="85%">
                                                    <LineChart data={chartData.slice(1)}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                        <XAxis dataKey="fechaStr" stroke="var(--text-muted)" fontSize={12} />
                                                        <YAxis stroke="var(--text-muted)" fontSize={12} domain={['auto', 'auto']} />
                                                        <RechartsTooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                                        <Line type="monotone" dataKey="gmpPromedio" name="GMP (kg/m)" stroke="var(--success)" strokeWidth={3} dot={{ fill: 'var(--success)', r: 4 }} activeDot={{ r: 6 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>Información insuficiente</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Info size={14} /> Detalle por Animal — clic en una fila para ver la tarjeta del animal
                                </h4>
                                <div className="table-container">
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>CHAPETA</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PROPIETARIO</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PESO COMPRA</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PESO INGRESO</th>
                                                {fechasColumnas.map(fecha => (
                                                    <th key={fecha} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        PESAJE {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}
                                                    </th>
                                                ))}
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PESO VENTA</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>GMP</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalleVenta.animalesDetalle.map((a, idx) => (
                                                <tr
                                                    key={a.id}
                                                    className="table-row-hover"
                                                    style={{ borderBottom: idx < detalleVenta.animalesDetalle.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer' }}
                                                    onClick={() => setSelectedAnimalDetalle(a)}
                                                >
                                                    <td style={{ padding: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</td>
                                                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{a.nombre_propietario}</td>
                                                    <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        <div style={{ fontWeight: 'bold' }}>{a.peso_compra ? `${Math.round(a.peso_compra)} kg` : '-'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.peso_compra && a.fecha_ingreso ? format(new Date(a.fecha_ingreso + 'T12:00:00'), 'dd/MM/yy') : '-'}</div>
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        <div style={{ fontWeight: 'bold' }}>{a.peso_ingreso ? `${Math.round(a.peso_ingreso)} kg` : '-'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.fecha_ingreso ? format(new Date(a.fecha_ingreso + 'T12:00:00'), 'dd/MM/yy') : '-'}</div>
                                                    </td>
                                                    {fechasColumnas.map(fecha => (
                                                        <td key={fecha} style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {showFullHistory ? (
                                                                a.pesajesTotalesMap[fecha] ? a.pesajesTotalesMap[fecha].toFixed(1) : '-'
                                                            ) : (
                                                                a.pesajesFiltrados[fecha] ? a.pesajesFiltrados[fecha].toFixed(1) : '-'
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', color: 'var(--primary-light)' }}>
                                                        {a.peso_venta ? `${Math.round(a.peso_venta)} kg` : '-'}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            color: (a.gmp || 0) < 0 ? 'var(--error)' : ((a.gmp || 0) <= umbralMedio ? 'var(--warning)' : ((a.gmp || 0) <= umbralAlto ? 'var(--text-light)' : 'var(--success)')),
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {(a.gmp || 0).toFixed(1)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {detalleVenta.animalesDetalle.length === 0 && (
                                                <tr>
                                                    <td colSpan={4 + fechasColumnas.length + 1} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                        No hay datos disponibles para esta venta.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        {detalleVenta.animalesDetalle.length > 0 && (() => {
                                            const validCompra = detalleVenta.animalesDetalle.filter(a => a.peso_compra);
                                            const totalCompra = validCompra.reduce((sum, a) => sum + (a.peso_compra || 0), 0);
                                            const promCompra = validCompra.length > 0 ? totalCompra / validCompra.length : 0;

                                            const validIngreso = detalleVenta.animalesDetalle.filter(a => a.peso_ingreso);
                                            const totalIngreso = validIngreso.reduce((sum, a) => sum + (a.peso_ingreso || 0), 0);
                                            const promIngreso = validIngreso.length > 0 ? totalIngreso / validIngreso.length : 0;

                                            const validVenta = detalleVenta.animalesDetalle.filter(a => a.peso_venta);
                                            const totalVenta = validVenta.reduce((sum, a) => sum + (a.peso_venta || 0), 0);
                                            const promVenta = validVenta.length > 0 ? totalVenta / validVenta.length : 0;

                                            return (
                                                <tfoot>
                                                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                                                        <td colSpan={2} style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>TOTALES:</td>
                                                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {totalCompra > 0 ? `${Math.round(totalCompra).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {totalIngreso > 0 ? `${Math.round(totalIngreso).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        {fechasColumnas.map(fecha => {
                                                            const total = detalleVenta.animalesDetalle.reduce((acc, a) => {
                                                                const mapa = showFullHistory ? a.pesajesTotalesMap : a.pesajesFiltrados;
                                                                return acc + (mapa && mapa[fecha] ? mapa[fecha] : 0);
                                                            }, 0);
                                                            return (
                                                                <td key={fecha} style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                    {total > 0 ? `${Math.round(total).toLocaleString('es-CO')} kg` : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', color: 'var(--primary-light)' }}>
                                                            {totalVenta > 0 ? `${Math.round(totalVenta).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                    <tr style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.7rem' }}>PROMEDIOS:</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                            {promCompra > 0 ? `${Math.round(promCompra).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                            {promIngreso > 0 ? `${Math.round(promIngreso).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        {fechasColumnas.map(fecha => {
                                                            const validAnimals = detalleVenta.animalesDetalle.filter(a => {
                                                                const mapa = showFullHistory ? a.pesajesTotalesMap : a.pesajesFiltrados;
                                                                return mapa && mapa[fecha];
                                                            });
                                                            const total = validAnimals.reduce((acc, a) => {
                                                                const mapa = showFullHistory ? a.pesajesTotalesMap : a.pesajesFiltrados;
                                                                return acc + (mapa![fecha] || 0);
                                                            }, 0);
                                                            const avg = validAnimals.length > 0 ? total / validAnimals.length : 0;
                                                            return (
                                                                <td key={`prom-${fecha}`} style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                                    {avg > 0 ? `${Math.round(avg).toLocaleString('es-CO')} kg` : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                            {promVenta > 0 ? `${Math.round(promVenta).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            );
                                        })()}
                                    </table>
                                </div>
                            </div>
                            </div>

                            {/* Footer */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>
                                <button onClick={() => setDetalleVenta(null)} style={{ width: 'auto', padding: '8px 24px', fontSize: '0.9rem' }}>
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ================================================================
                TARJETA DE ANIMAL INDIVIDUAL (estilo Inventario)
            ================================================================ */}
            {selectedAnimalDetalle && (() => {
                const a = selectedAnimalDetalle;
                const registrosOrdenados = [...a.registros_pesaje].sort((x, y) =>
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const ultimoP = registrosOrdenados[0];
                const fechaU = ultimoP
                    ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es })
                    : format(new Date(a.fecha_ingreso), 'dd/MM/yyyy', { locale: es });

                // Timeline: ingreso + todos los pesajes (de más nuevo a más viejo para la tabla)
                const baseWeight = a.peso_compra ?? a.peso_ingreso;
                const timeline = [
                    ...registrosOrdenados.map((p, i, arr) => {
                        const siguiente = arr[i + 1] || { peso: baseWeight, fecha: a.fecha_ingreso };
                        const d = differenceInDays(new Date(p.fecha), new Date(siguiente.fecha)) || 1;
                        const ganancia = p.peso - siguiente.peso;
                        const gmp = (ganancia / d) * 30;
                        return { fecha: p.fecha, peso: p.peso, gmp, gdp: p.gdp_calculada ?? (ganancia / d), esIngreso: false };
                    }),
                    { fecha: a.fecha_ingreso, peso: baseWeight, gmp: 0, gdp: 0, esIngreso: true }
                ];

                const chartData = [...timeline].reverse().map(item => ({
                    fechaStr: format(new Date(item.fecha), 'dd/MMM', { locale: es }),
                    peso: item.peso
                }));

                return (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px' }}>
                        <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}>
                            <button
                                onClick={() => setSelectedAnimalDetalle(null)}
                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }}
                            >
                                <X size={24} />
                            </button>

                            <div style={{ paddingRight: '40px', marginBottom: '24px' }}>
                                <h2 style={{ color: 'white', margin: 0, fontSize: '1.8rem' }}>
                                    <span style={{ color: 'var(--primary)', marginRight: '8px' }}>#</span>
                                    {a.numero_chapeta}
                                </h2>
                                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
                                    {a.etapa} • {a.nombre_propietario}
                                    <span style={{ marginLeft: '8px', color: 'var(--error)', fontSize: '0.75rem', background: 'rgba(244,67,54,0.1)', padding: '2px 8px', borderRadius: '20px', textTransform: 'none' }}>VENDIDO</span>
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso Entrada Finca</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{baseWeight} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', marginTop: '4px' }}>
                                        {format(new Date(a.fecha_ingreso + 'T12:00:00'), 'dd/MM/yyyy')}
                                    </div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso Venta</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>{a.peso_venta} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Último pesaje: {fechaU}
                                    </div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>GMP</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: (a.gmp || 0) < 0 ? 'var(--error)' : ((a.gmp || 0) <= umbralMedio ? 'var(--warning)' : ((a.gmp || 0) <= umbralAlto ? 'var(--text-light)' : 'var(--success)')) }}>
                                        {(a.gmp || 0).toFixed(1)} kg/m
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Ganancia mensual</div>
                                </div>
                            </div>

                            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Evolución de Peso</h3>
                            <div style={{ height: '220px', width: '100%', marginBottom: '32px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                        <XAxis dataKey="fechaStr" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                            itemStyle={{ color: 'var(--primary-light)' }}
                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                        />
                                        <Line type="monotone" dataKey="peso" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary-light)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} name="Peso (kg)" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Historial de Registros</h3>
                            <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                        <tr>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fecha</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Peso (kg)</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ganancia Mensual</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timeline.map((item, index) => (
                                            <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ fontWeight: '500' }}>{format(new Date(item.fecha), 'dd/MM/yyyy')}</div>
                                                    {item.esIngreso && <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 'bold' }}>INGRESO</div>}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{item.peso}</td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {item.esIngreso ? (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                                                    ) : (
                                                        <>
                                                            <div style={{ 
                                                                color: item.gmp < 0 ? 'var(--error)' : (item.gmp <= umbralMedio ? 'var(--warning)' : (item.gmp <= umbralAlto ? 'var(--text-light)' : 'var(--success)')), 
                                                                fontWeight: 'bold',
                                                                textShadow: (item.gmp > umbralMedio && item.gmp <= umbralAlto) ? '0 0 2px rgba(255,255,255,0.2)' : 'none'
                                                            }}>
                                                                {item.gmp > 0 ? '+' : ''}{item.gmp.toFixed(1)} kg/mes
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>GDP: {item.gdp > 0 ? '+' : ''}{item.gdp.toFixed(3)} kg/día</div>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ marginTop: '20px', textAlign: 'right' }}>
                                <button
                                    onClick={() => setSelectedAnimalDetalle(null)}
                                    style={{ width: 'auto', padding: '8px 24px', fontSize: '0.9rem' }}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
