import { useMemo, useRef, useState } from 'react';
import { X, Download, TrendingUp, MapPin, Target, PieChart as PieChartIcon, DollarSign, TrendingDown } from 'lucide-react';
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
    capitalInvertido?: number;
    precioVentaPromedio?: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF6384'];

const formatCOP = (value: number) =>
    value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function PropietarioDashboardModal({ 
    propietario, 
    animales, 
    onClose,
    umbralAlto = 20,
    umbralMedio = 10,
    capitalInvertido = 0,
    precioVentaPromedio = 0
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
        datosTendenciaGmp,
        // Financial data
        financiero
    } = useMemo(() => {
        let totalPeso = 0;
        let sumaGmp = 0;
        let animalesConGmp = 0;

        const etapasMap = new Map<string, number>();
        const ubicacionesMap = new Map<string, { count: number, peso: number, sumGmpUltimo: number, countGmpUltimo: number, sumGmpHistorico: number, countGmpHistorico: number }>();
        const mesesGmpMap = new Map<string, { sum: number, count: number }>();

        // PASO 2: Sumar todos los kilos iniciales
        let totalKilosIniciales = 0;
        animales.forEach(a => {
            totalKilosIniciales += (a.peso_compra ?? a.peso_ingreso);
        });

        // PASO 3: Precio por kilo de compra
        const precioPorKiloCompra = (capitalInvertido > 0 && totalKilosIniciales > 0)
            ? capitalInvertido / totalKilosIniciales
            : 0;

        // Acumuladores financieros
        let totalGananciaDiaria = 0;
        let utilidadBrutaTotal = 0;
        let utilidadSocioTotal = 0;
        let valorizacionTotal = 0;
        const detalleFinanciero: {
            chapeta: string;
            etapa: string;
            pesoBase: number;
            pesoEstimado: number;
            diasEnFinca: number;
            valorCompra: number;
            valorEstimado: number;
            utilidadBruta: number;
            utilidadSocio: number;
            rentabilidadAnimal: number;
        }[] = [];

        animales.forEach(a => {
            const pesoBase = a.peso_compra ?? a.peso_ingreso;
            const ultimoP = a.registros_pesaje?.[0];
            const pesoU = ultimoP ? ultimoP.peso : pesoBase;
            
            const refDate = ultimoP ? new Date(ultimoP.fecha) : new Date(a.fecha_ingreso);
            const diasHoy = differenceInDays(new Date(), refDate) || 0;
            
            let gmpUltimo = 0;
            if (ultimoP && ultimoP.gmp_calculada !== null && ultimoP.gmp_calculada !== undefined) {
                gmpUltimo = Number(ultimoP.gmp_calculada);
            } else if (ultimoP) {
                const gainTotal = ultimoP.peso - pesoBase;
                const daysTotal = differenceInDays(new Date(ultimoP.fecha), new Date(a.fecha_ingreso)) || 1;
                gmpUltimo = (gainTotal / daysTotal) * 30;
            }

            let gmpHistorico = 0;
            if (ultimoP) {
                const gainAcumulada = ultimoP.peso - pesoBase;
                const diasAcumulados = differenceInDays(new Date(ultimoP.fecha), new Date(a.fecha_ingreso)) || 1;
                gmpHistorico = (gainAcumulada / diasAcumulados) * 30;
            }

            const gmpIndiv = gmpUltimo;
            const estimadoHoy = pesoU + (diasHoy * (gmpIndiv / 30));
            totalPeso += estimadoHoy;

            if (gmpIndiv > 0) {
                sumaGmp += gmpIndiv;
                animalesConGmp++;
            }

            const etapa = (a.etapa || 'Desconocida').toUpperCase();
            etapasMap.set(etapa, (etapasMap.get(etapa) || 0) + 1);

            const ubicacion = a.potreradaNombre !== 'Sin potrerada' ? a.potreradaNombre : (a.potreroNombre !== 'Sin potrero' ? a.potreroNombre : 'Sin Asignar');
            const ubiKey = ubicacion || 'Sin Asignar';
            if (!ubicacionesMap.has(ubiKey)) {
                ubicacionesMap.set(ubiKey, { count: 0, peso: 0, sumGmpUltimo: 0, countGmpUltimo: 0, sumGmpHistorico: 0, countGmpHistorico: 0 });
            }
            const ubiData = ubicacionesMap.get(ubiKey)!;
            ubiData.count++;
            ubiData.peso += estimadoHoy;
            if (gmpUltimo !== 0) { ubiData.sumGmpUltimo += gmpUltimo; ubiData.countGmpUltimo++; }
            if (gmpHistorico !== 0) { ubiData.sumGmpHistorico += gmpHistorico; ubiData.countGmpHistorico++; }

            if (ultimoP && gmpIndiv > 0) {
                const mesAnio = format(new Date(ultimoP.fecha), 'MMM yyyy', { locale: es });
                if (!mesesGmpMap.has(mesAnio)) mesesGmpMap.set(mesAnio, { sum: 0, count: 0 });
                mesesGmpMap.get(mesAnio)!.sum += gmpIndiv;
                mesesGmpMap.get(mesAnio)!.count++;
            }

            // ---- CÁLCULOS FINANCIEROS ----
            if (capitalInvertido > 0 && precioVentaPromedio > 0 && precioPorKiloCompra > 0) {
                // PASO 4: Valor unitario de compra del animal
                const valorCompra = pesoBase * precioPorKiloCompra;

                // PASO 5: Valor estimado actual del animal
                const valorEstimadoAnimal = estimadoHoy * precioVentaPromedio;
                valorizacionTotal += valorEstimadoAnimal;

                // PASO 6: Utilidad bruta del animal
                const utilidadBruta = valorEstimadoAnimal - valorCompra;
                utilidadBrutaTotal += utilidadBruta;

                // PASO 7: Utilidad del socio (40%)
                const utilidadSocio = utilidadBruta * 0.40;
                utilidadSocioTotal += utilidadSocio;

                // PASO 8 & 9: Rentabilidad mensual del animal
                const diasEnFinca = Math.max(1, differenceInDays(new Date(), new Date(a.fecha_ingreso)));
                const rentabilidadAnimal = valorCompra > 0 ? (utilidadSocio / valorCompra) : 0;

                // PASO 10 (Gemini): Ganancia diaria de este animal para el portafolio
                const gananciaDiariaAnimal = utilidadSocio / diasEnFinca;
                totalGananciaDiaria += gananciaDiariaAnimal;

                detalleFinanciero.push({
                    chapeta: a.numero_chapeta,
                    etapa: a.etapa,
                    pesoBase,
                    pesoEstimado: estimadoHoy,
                    diasEnFinca,
                    valorCompra,
                    valorEstimado: valorEstimadoAnimal,
                    utilidadBruta,
                    utilidadSocio,
                    rentabilidadAnimal
                });
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

        // PASO 10: Rentabilidad mensual global del portafolio
        const gananciaMensualTotal = totalGananciaDiaria * 30.4;
        const rentabilidadMensualGlobal = capitalInvertido > 0 ? gananciaMensualTotal / capitalInvertido : 0;

        // PASO 11: TEA
        const tea = Math.pow(1 + rentabilidadMensualGlobal, 12) - 1;

        return {
            totalAnimales: animales.length,
            pesoTotalEstimado: totalPeso,
            gmpPromedioGlobal: animalesConGmp > 0 ? sumaGmp / animalesConGmp : 0,
            datosEtapas: datosEtapasArr,
            datosUbicaciones: datosUbiArr,
            datosTendenciaGmp: datosTendenciaArr,
            financiero: {
                capitalInvertido,
                precioVentaPromedio,
                precioPorKiloCompra,
                valorizacionActual: valorizacionTotal,
                utilidadBrutaTotal,
                utilidadSocioTotal,
                gananciaMensualTotal,
                rentabilidadMensualGlobal,
                tea,
                detalle: detalleFinanciero
            }
        };
    }, [animales, capitalInvertido, precioVentaPromedio]);

    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const canvas = await html2canvas(printRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#1E1E2D',
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;
            
            if (imgHeight <= pdfHeight) {
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
            } else {
                // Multi-page: slice the canvas into pages
                const pageHeightPx = (canvas.width * pdfHeight) / pdfWidth;
                let yOffset = 0;
                while (yOffset < canvas.height) {
                    const pageCanvas = document.createElement('canvas');
                    pageCanvas.width = canvas.width;
                    pageCanvas.height = Math.min(pageHeightPx, canvas.height - yOffset);
                    const ctx = pageCanvas.getContext('2d')!;
                    ctx.drawImage(canvas, 0, yOffset, canvas.width, pageCanvas.height, 0, 0, canvas.width, pageCanvas.height);
                    const pageImg = pageCanvas.toDataURL('image/png');
                    const pageImgHeight = (pageCanvas.height * pdfWidth) / canvas.width;
                    if (yOffset > 0) pdf.addPage();
                    pdf.addImage(pageImg, 'PNG', 0, 0, pdfWidth, pageImgHeight);
                    yOffset += pageHeightPx;
                }
            }
            
            pdf.save(`Informe_Propietario_${propietario.replace(/\s+/g, '_')}.pdf`);
            
        } catch (error) {
            console.error("Error generando PDF", error);
            alert("Hubo un error al generar el documento PDF.");
        } finally {
            setIsExporting(false);
        }
    };

    const hasFinanciero = capitalInvertido > 0 && precioVentaPromedio > 0;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
            <div className="card" style={{ maxWidth: '900px', width: '100%', maxHeight: '95vh', overflowY: 'auto', position: 'relative', backgroundColor: 'var(--surface)', padding: '0' }} onClick={e => e.stopPropagation()}>
                {/* Header estático con botón de cerrar */}
                <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Target color="var(--primary)" /> Informe: {propietario}
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
                    
                    {/* Encabezado del informe */}
                    <div style={{ marginBottom: '28px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Informe de Rendimiento</div>
                        <h1 style={{ margin: '0 0 4px 0', fontSize: '1.8rem', color: 'white' }}>{propietario}</h1>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Generado el {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })} • {totalAnimales} animales activos
                        </div>
                    </div>

                    {/* ======= SECCIÓN 1: INDICADORES GANADEROS ======= */}
                    <div style={{ marginBottom: '8px' }}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            <span style={{ fontSize: '1rem' }}>🐄</span> Indicadores Ganaderos
                        </h2>
                    </div>

                    {/* Tarjetas KPI */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
                        {/* Gráfico Etapas */}
                        <div style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <PieChartIcon size={18} /> Distribución por Etapas
                            </h3>
                            <div style={{ height: '170px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={datosEtapas} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
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
                    <div style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: 'rgba(0,0,0,0.2)', marginBottom: '32px' }}>
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
                                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: ubi.gmpUltimo !== 0 ? getGmpColor(ubi.gmpUltimo) : 'var(--text-muted)' }}>
                                                {ubi.gmpUltimo !== 0 ? `${ubi.gmpUltimo.toFixed(2)} kg/m` : 'N/A'}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right', color: ubi.gmpHistorico !== 0 ? getGmpColor(ubi.gmpHistorico) : 'var(--text-muted)' }}>
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

                    {/* ======= SECCIÓN 2: ANÁLISIS FINANCIERO ======= */}
                    {hasFinanciero && (
                        <>
                            {/* Divisor de sección */}
                            <div style={{ 
                                borderTop: '2px solid rgba(76,175,80,0.3)', 
                                marginBottom: '28px',
                                paddingTop: '28px'
                            }}>
                                <h2 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    <DollarSign size={18} /> Análisis Financiero del Portafolio
                                </h2>
                                <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Cálculo de rentabilidad basado en capital invertido de {formatCOP(financiero.capitalInvertido)} y precio de venta de {formatCOP(financiero.precioVentaPromedio)}/kg.
                                </p>
                            </div>

                            {/* KPIs Financieros principales */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Capital Invertido</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>{formatCOP(financiero.capitalInvertido)}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {formatCOP(Math.round(financiero.precioPorKiloCompra))}/kg compra
                                    </div>
                                </div>
                                <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255, 179, 0, 0.08)', border: '1px solid rgba(255, 179, 0, 0.15)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valorización Actual</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{formatCOP(Math.round(financiero.valorizacionActual))}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {pesoTotalEstimado.toFixed(0)} kg × {formatCOP(financiero.precioVentaPromedio)}/kg
                                    </div>
                                </div>
                                <div style={{ padding: '20px', borderRadius: '12px', background: financiero.utilidadSocioTotal >= 0 ? 'rgba(46, 125, 50, 0.1)' : 'rgba(244,67,54,0.08)', border: `1px solid ${financiero.utilidadSocioTotal >= 0 ? 'rgba(46, 125, 50, 0.25)' : 'rgba(244,67,54,0.2)'}` }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Utilidad Bruta Total</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: financiero.utilidadBrutaTotal >= 0 ? 'var(--primary-light)' : 'var(--error)' }}>
                                        {formatCOP(Math.round(financiero.utilidadBrutaTotal))}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Participación socio (40%): {formatCOP(Math.round(financiero.utilidadSocioTotal))}
                                    </div>
                                </div>
                            </div>

                            {/* KPIs de Rentabilidad */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                                <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(33, 150, 243, 0.06)', border: '1px solid rgba(33, 150, 243, 0.15)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ingreso Mensual Portafolio</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#64b5f6' }}>
                                        {formatCOP(Math.round(financiero.gananciaMensualTotal))}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>por mes (proyectado)</div>
                                </div>
                                <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(46, 125, 50, 0.08)', border: '1px solid rgba(46, 125, 50, 0.2)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rentabilidad Mensual</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: financiero.rentabilidadMensualGlobal >= 0 ? 'var(--primary-light)' : 'var(--error)' }}>
                                        {(financiero.rentabilidadMensualGlobal * 100).toFixed(2)}%
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>sobre capital invertido</div>
                                </div>
                                <div style={{ padding: '20px', borderRadius: '12px', background: financiero.tea >= 0.05 ? 'rgba(46, 125, 50, 0.15)' : 'rgba(255,152,0,0.08)', border: `1px solid ${financiero.tea >= 0.05 ? 'rgba(46,125,50,0.35)' : 'rgba(255,152,0,0.2)'}` }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Rentabilidad Anual (TEA)
                                    </div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: financiero.tea >= 0.05 ? 'var(--success)' : 'var(--warning)' }}>
                                        {(financiero.tea * 100).toFixed(2)}%
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Tasa Efectiva Anual</div>
                                </div>
                            </div>

                            {/* Tabla de detalle por animal */}
                            {financiero.detalle.length > 0 && (
                                <div style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <TrendingDown size={16} /> Detalle por Animal
                                    </h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Chapeta</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Días</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Peso Inicial</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Peso Est. Hoy</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Valor Compra</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Valor Actual</th>
                                                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Utilidad Socio</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {financiero.detalle.map((d, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        <td style={{ padding: '9px 12px', fontWeight: 'bold', color: 'var(--primary-light)' }}>#{d.chapeta}</td>
                                                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{d.diasEnFinca}d</td>
                                                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>{d.pesoBase.toFixed(0)} kg</td>
                                                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>{d.pesoEstimado.toFixed(0)} kg</td>
                                                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCOP(Math.round(d.valorCompra))}</td>
                                                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--secondary)' }}>{formatCOP(Math.round(d.valorEstimado))}</td>
                                                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', color: d.utilidadSocio >= 0 ? 'var(--success)' : 'var(--error)' }}>
                                                            {formatCOP(Math.round(d.utilidadSocio))}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {/* Fila de totales */}
                                                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', fontWeight: 'bold' }}>
                                                    <td colSpan={4} style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>TOTALES</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCOP(Math.round(financiero.detalle.reduce((s,d) => s + d.valorCompra, 0)))}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--secondary)' }}>{formatCOP(Math.round(financiero.valorizacionActual))}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: financiero.utilidadSocioTotal >= 0 ? 'var(--success)' : 'var(--error)' }}>{formatCOP(Math.round(financiero.utilidadSocioTotal))}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        * Los pesos estimados se calculan proyectando el GMP del último período hacia hoy. La rentabilidad es sobre la participación del 40% del socio, con base en el capital invertido declarado.
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}
