import { useMemo, useRef, useState } from 'react';
import { X, Download, TrendingUp, MapPin, Target, PieChart as PieChartIcon } from 'lucide-react';
import { 
    PieChart, Pie, Cell, 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Pesaje {
    peso: number;
    fecha: string;
    gdp_calculada: number;
    gmp_calculada?: number;
}

interface Animal {
    id: string;
    numero_chapeta: string;
    etapa: string;
    peso_ingreso: number;
    peso_compra?: number | null;
    fecha_ingreso: string;
    potreroNombre?: string;
    potreradaNombre?: string;
    registros_pesaje: Pesaje[];
}

interface PropietarioDashboardProps {
    propietario: string;
    animales: Animal[];
    onClose: () => void;
    umbralAlto?: number;
    umbralMedio?: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF6384'];

export default function PropietarioDashboardModal({ 
    propietario, 
    animales, 
    onClose,
    umbralAlto = 20,
    umbralMedio = 10
}: PropietarioDashboardProps) {
    const printRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);

    const getGmpColor = (gmpValue: number) => {
        if (gmpValue < 0) return 'var(--error)';
        if (gmpValue <= umbralMedio) return 'var(--warning)';
        if (gmpValue <= umbralAlto) return 'var(--text-light)';
        return 'var(--success)';
    };

    const { 
        totalAnimales, 
        pesoTotalEstimado, 
        gmpPromedioGlobal,
        datosEtapas,
        datosUbicaciones,
        datosTendenciaGmp
    } = useMemo(() => {
        // gmpUltimo = gmp_calculada del último pesaje (período entre últimos dos pesajes)
        // gmpHistorico = ganancia acumulada desde fecha_ingreso hasta último pesaje
        let totalPeso = 0;
        let sumaGmp = 0;
        let animalesConGmp = 0;

        const etapasMap = new Map<string, number>();
        const ubicacionesMap = new Map<string, { count: number, peso: number, sumGmpUltimo: number, countGmpUltimo: number, sumGmpHistorico: number, countGmpHistorico: number }>();
        const mesesGmpMap = new Map<string, { sum: number, count: number }>();

        animales.forEach(a => {
            const pesoBase = a.peso_compra ?? a.peso_ingreso;
            const ultimoP = a.registros_pesaje?.[0]; // En inventario el [0] suele ser el último en la vista de lista, pero si se pasa la lista completa es el más reciente.
            const pesoU = ultimoP ? ultimoP.peso : pesoBase;
            
            // Si pasamos animales con el último pesaje ya ordenado:
            const refDate = ultimoP ? new Date(ultimoP.fecha) : new Date(a.fecha_ingreso);
            const diasHoy = differenceInDays(new Date(), refDate) || 0;
            
            // GMP Última: del último período entre pesajes (gmp_calculada del trigger)
            let gmpUltimo = 0;
            if (ultimoP && ultimoP.gmp_calculada !== null && ultimoP.gmp_calculada !== undefined) {
                gmpUltimo = Number(ultimoP.gmp_calculada);
            } else if (ultimoP) {
                // Fallback: calcular con el período completo si no hay gmp_calculada
                const gainTotal = ultimoP.peso - pesoBase;
                const daysTotal = differenceInDays(new Date(ultimoP.fecha), new Date(a.fecha_ingreso)) || 1;
                gmpUltimo = (gainTotal / daysTotal) * 30;
            }

            // GMP Histórica: ganancia acumulada desde ingreso hasta último pesaje
            let gmpHistorico = 0;
            if (ultimoP) {
                const gainAcumulada = ultimoP.peso - pesoBase;
                const diasAcumulados = differenceInDays(new Date(ultimoP.fecha), new Date(a.fecha_ingreso)) || 1;
                gmpHistorico = (gainAcumulada / diasAcumulados) * 30;
            }

            // Para estimado y semáforo global usamos gmpUltimo
            const gmpIndiv = gmpUltimo;
            const estimadoHoy = pesoU + (diasHoy * (gmpIndiv / 30));
            totalPeso += estimadoHoy;

            if (gmpIndiv > 0) {
                sumaGmp += gmpIndiv;
                animalesConGmp++;
            }

            // Etapas
            const etapa = (a.etapa || 'Desconocida').toUpperCase();
            etapasMap.set(etapa, (etapasMap.get(etapa) || 0) + 1);

            // Ubicaciones (Potreradas o Potreros)
            const ubicacion = a.potreradaNombre !== 'Sin potrerada' ? a.potreradaNombre : (a.potreroNombre !== 'Sin potrero' ? a.potreroNombre : 'Sin Asignar');
            const ubiKey = ubicacion || 'Sin Asignar';
            if (!ubicacionesMap.has(ubiKey)) {
                ubicacionesMap.set(ubiKey, { count: 0, peso: 0, sumGmpUltimo: 0, countGmpUltimo: 0, sumGmpHistorico: 0, countGmpHistorico: 0 });
            }
            const ubiData = ubicacionesMap.get(ubiKey)!;
            ubiData.count++;
            ubiData.peso += estimadoHoy;
            if (gmpUltimo !== 0) {
                ubiData.sumGmpUltimo += gmpUltimo;
                ubiData.countGmpUltimo++;
            }
            if (gmpHistorico !== 0) {
                ubiData.sumGmpHistorico += gmpHistorico;
                ubiData.countGmpHistorico++;
            }

            // Tendencia Histórica
            // Como el listado puede venir con 1 solo pesaje (por la optimización en Inventory), 
            // la tendencia GMP solo tomará el último. Lo ideal sería usar esto si se pasa el historial, 
            // pero con el último pesaje podemos agrupar cuándo fue ese pesaje.
            if (ultimoP && gmpIndiv > 0) {
                const mesAnio = format(new Date(ultimoP.fecha), 'MMM yyyy', { locale: es });
                if (!mesesGmpMap.has(mesAnio)) mesesGmpMap.set(mesAnio, { sum: 0, count: 0 });
                mesesGmpMap.get(mesAnio)!.sum += gmpIndiv;
                mesesGmpMap.get(mesAnio)!.count++;
            }
        });

        const datosEtapasArr = Array.from(etapasMap.entries()).map(([name, value]) => ({ name, value }));
        
        const datosUbiArr = Array.from(ubicacionesMap.entries())
            .map(([nombre, data]) => ({
                nombre,
                cantidad: data.count,
                pesoPromedio: data.count > 0 ? (data.peso / data.count) : 0,
                gmpUltimo: data.countGmpUltimo > 0 ? (data.sumGmpUltimo / data.countGmpUltimo) : 0,
                gmpHistorico: data.countGmpHistorico > 0 ? (data.sumGmpHistorico / data.countGmpHistorico) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad);

        // Para la tendencia, ordenar por fecha real, pero tenemos strings "May 2026". 
        // Simplificación: tomamos los meses presentes en el historial reciente
        const mesesNombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const datosTendenciaArr = Array.from(mesesGmpMap.entries())
            .map(([mes, data]) => ({
                mes,
                gmp: data.sum / data.count,
                sortValue: (() => {
                    const parts = mes.split(' ');
                    const monthIdx = mesesNombres.findIndex(m => m === parts[0].toLowerCase());
                    return parseInt(parts[1] || '0') * 100 + (monthIdx >= 0 ? monthIdx : 0);
                })()
            }))
            .sort((a, b) => a.sortValue - b.sortValue);

        return {
            totalAnimales: animales.length,
            pesoTotalEstimado: totalPeso,
            gmpPromedioGlobal: animalesConGmp > 0 ? sumaGmp / animalesConGmp : 0,
            datosEtapas: datosEtapasArr,
            datosUbicaciones: datosUbiArr,
            datosTendenciaGmp: datosTendenciaArr
        };
    }, [animales]);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        try {
            // Un pequeño retraso para asegurar que los gráficos estén renderizados
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const canvas = await html2canvas(printRef.current, {
                scale: 2, // Mayor calidad
                useCORS: true,
                backgroundColor: '#1E1E2D', // Fondo oscuro del modal
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
            pdf.save(`Rendimiento_Propietario_${propietario.replace(/\s+/g, '_')}.pdf`);
            
        } catch (error) {
            console.error("Error generando PDF", error);
            alert("Hubo un error al generar el documento PDF.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
            <div className="card" style={{ maxWidth: '900px', width: '100%', maxHeight: '95vh', overflowY: 'auto', position: 'relative', backgroundColor: 'var(--surface)', padding: '0' }} onClick={e => e.stopPropagation()}>
                {/* Header estático con botón de cerrar */}
                <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Target color="var(--primary)" /> Rendimiento: {propietario}
                    </h2>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            onClick={handleDownloadPdf}
                            disabled={isExporting}
                            style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                        >
                            <Download size={18} /> {isExporting ? 'Generando...' : 'Descargar PDF'}
                        </button>
                        <button 
                            onClick={onClose}
                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-muted)', padding: '8px', display: 'flex', alignItems: 'center' }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Contenedor a exportar */}
                <div ref={printRef} style={{ padding: '24px', backgroundColor: 'var(--surface)' }}>
                    
                    {/* Tarjetas KPI */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                        <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(46, 125, 50, 0.1)', border: '1px solid rgba(46, 125, 50, 0.2)' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>Total Animales</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>{totalAnimales}</div>
                        </div>
                        <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255, 179, 0, 0.05)', border: '1px solid rgba(255, 179, 0, 0.1)' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>Peso Total Estimado</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{pesoTotalEstimado.toLocaleString(undefined, {maximumFractionDigits:0})} kg</div>
                        </div>
                        <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(33, 150, 243, 0.05)', border: '1px solid rgba(33, 150, 243, 0.1)' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>GMP Promedio Global</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: getGmpColor(gmpPromedioGlobal) }}>{gmpPromedioGlobal.toFixed(2)} kg/mes</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                        {/* Gráfico Etapas */}
                        <div style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <PieChartIcon size={18} /> Distribución por Etapas
                            </h3>
                            <div style={{ height: '170px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={datosEtapas}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={45}
                                            outerRadius={70}
                                            paddingAngle={4}
                                            dataKey="value"
                                        >
                                            {datosEtapas.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: 'rgba(30, 30, 45, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                            formatter={(value: any, name: any) => [`${value} animales`, name]}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Leyenda con número y porcentaje */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                {(() => {
                                    const total = datosEtapas.reduce((s, e) => s + e.value, 0);
                                    return datosEtapas.map((etapa, idx) => {
                                        const pct = total > 0 ? ((etapa.value / total) * 100).toFixed(1) : '0';
                                        return (
                                            <div key={etapa.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: COLORS[idx % COLORS.length], flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', textTransform: 'capitalize' }}>{etapa.name}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: COLORS[idx % COLORS.length] }}>{etapa.value} animales</span>
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '42px', textAlign: 'right' }}>{pct}%</span>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>

                        {/* Tendencia GMP */}
                        <div style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} /> Evolución GMP (Últimos Pesajes)
                            </h3>
                            <div style={{ height: '250px' }}>
                                {datosTendenciaGmp.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={datosTendenciaGmp} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                            <XAxis dataKey="mes" stroke="rgba(255,255,255,0.5)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                                            <YAxis stroke="rgba(255,255,255,0.5)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: 'rgba(30, 30, 45, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                formatter={(value: any) => [`${Number(value).toFixed(2)} kg/m`, 'GMP']}
                                            />
                                            <Line type="monotone" dataKey="gmp" stroke="var(--primary)" strokeWidth={3} dot={{r: 4, fill: 'var(--primary)'}} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                                        Sin datos históricos suficientes
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Ubicaciones */}
                    <div style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={18} /> Resumen por Ubicación
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ padding: '12px', color: 'var(--text-muted)' }}>Potrerada / Potrero</th>
                                        <th style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>Cant.</th>
                                        <th style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>Peso Prom.</th>
                                        <th style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
                                            GMP Última
                                            <div style={{ fontSize: '0.7rem', fontWeight: 'normal', color: 'var(--text-muted)', opacity: 0.7 }}>último período</div>
                                        </th>
                                        <th style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
                                            GMP Histórica
                                            <div style={{ fontSize: '0.7rem', fontWeight: 'normal', color: 'var(--text-muted)', opacity: 0.7 }}>desde ingreso</div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {datosUbicaciones.map((ubi, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '12px', fontWeight: '500', textTransform: 'capitalize' }}>{ubi.nombre}</td>
                                            <td style={{ padding: '12px', textAlign: 'right', color: 'var(--primary-light)' }}>{ubi.cantidad}</td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>{ubi.pesoPromedio.toFixed(1)} kg</td>
                                            <td style={{ 
                                                padding: '12px', 
                                                textAlign: 'right', 
                                                fontWeight: '600',
                                                color: ubi.gmpUltimo !== 0 ? getGmpColor(ubi.gmpUltimo) : 'var(--text-muted)' 
                                            }}>
                                                {ubi.gmpUltimo !== 0 ? `${ubi.gmpUltimo.toFixed(2)} kg/m` : 'N/A'}
                                            </td>
                                            <td style={{ 
                                                padding: '12px', 
                                                textAlign: 'right',
                                                color: ubi.gmpHistorico !== 0 ? getGmpColor(ubi.gmpHistorico) : 'var(--text-muted)' 
                                            }}>
                                                {ubi.gmpHistorico !== 0 ? `${ubi.gmpHistorico.toFixed(2)} kg/m` : 'N/A'}
                                            </td>
                                        </tr>
                                    ))}
                                    {datosUbicaciones.length === 0 && (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No hay datos de ubicación disponibles.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
