import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';
import { es } from 'date-fns/locale';

interface AnimalReport {
    numero_chapeta: string;
    peso_salida: string | number;
    propietario: string;
    gmp?: number;
    potreroNombre?: string;
    fecha_ingreso?: string;
    fecha_inicio_ceba?: string | null;
}

interface SalesReportProps {
    fincaNombre: string;
    fechaVenta: string;
    animales: AnimalReport[];
    comprador: string;
    umbralAlto?: number;
    umbralMedio?: number;
    onClose: () => void;
}

export default function SalesReport({ fincaNombre, fechaVenta, animales, comprador, umbralAlto = 20, umbralMedio = 10, onClose }: SalesReportProps) {
    // Cálculos
    const totalKilos = animales.reduce((sum, a) => sum + parseFloat(a.peso_salida.toString()), 0);
    const totalAnimales = animales.length;
    
    const animalesConGMP = animales.filter(a => a.gmp && a.gmp > 0);
    const promedioGMP = animalesConGMP.length > 0 
        ? animalesConGMP.reduce((sum: number, a) => sum + (a.gmp || 0), 0) / animalesConGMP.length
        : 0;

    const calcularDias = (inicio: string, fin: string) => {
        const d1 = new Date(inicio);
        const d2 = new Date(fin);
        return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
    };

    const diasFincaTotal = animales.reduce((sum, a) => sum + (a.fecha_ingreso ? calcularDias(a.fecha_ingreso, fechaVenta) : 0), 0);
    const promedioDiasFinca = totalAnimales > 0 ? Math.round(diasFincaTotal / totalAnimales) : 0;

    const porMarca = animales.reduce((acc: any, a) => {
        const marca = a.propietario || 'No definida';
        if (!acc[marca]) {
            acc[marca] = { count: 0, kilos: 0, gmpSum: 0, gmpCount: 0 };
        }
        acc[marca].count += 1;
        acc[marca].kilos += parseFloat(a.peso_salida.toString());
        if (a.gmp && a.gmp > 0) {
            acc[marca].gmpSum += a.gmp;
            acc[marca].gmpCount += 1;
        }
        return acc;
    }, {});

    const resumenMarcas = Object.keys(porMarca).map(marca => ({
        marca,
        count: porMarca[marca].count,
        kilos: porMarca[marca].kilos,
        promedio: porMarca[marca].count > 0 ? porMarca[marca].kilos / porMarca[marca].count : 0,
        promedioGMP: porMarca[marca].gmpCount > 0 ? porMarca[marca].gmpSum / porMarca[marca].gmpCount : 0
    }));

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="report-modal-overlay">
            <style>
                {`
                @media print {
                    @page { 
                        size: letter;
                        margin: 15mm; 
                    }
                    body { 
                        background: white !important; 
                        -webkit-print-color-adjust: exact; 
                    }
                    body * {
                        visibility: hidden;
                    }
                    .report-modal-overlay, .report-modal-overlay * {
                        visibility: visible;
                    }
                    .report-modal-overlay {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        display: block !important;
                    }
                    .no-print { display: none !important; }
                    .report-container { 
                        box-shadow: none !important;
                        border: none !important;
                        width: 100% !important;
                        max-width: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                }

                .report-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    z-index: 3000;
                    display: flex;
                    justify-content: center;
                    padding: 40px 20px;
                    overflow-y: auto;
                }

                .report-container {
                    background: white;
                    width: 21.59cm;
                    min-height: 27.94cm;
                    padding: 20mm;
                    color: #1a1a1a;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
                    position: relative;
                    border-radius: 4px;
                }

                .report-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 3px solid #1b5e20;
                    padding-bottom: 20px;
                    margin-bottom: 25px;
                }

                .finca-name { font-size: 24px; font-weight: 900; color: #1b5e20; text-transform: uppercase; }
                .report-type { font-size: 14px; font-weight: 600; color: #666; }
                
                .info-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin-bottom: 30px;
                    background: #f1f8e9;
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid #c8e6c9;
                }

                .info-item label { display: block; font-size: 10px; color: #558b2f; font-weight: 700; text-transform: uppercase; }
                .info-item span { font-size: 14px; font-weight: 600; }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                    margin-bottom: 30px;
                }

                .stat-card {
                    background: #fff;
                    border: 1px solid #eee;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                }

                .stat-label { display: block; font-size: 9px; color: #888; text-transform: uppercase; font-weight: bold; }
                .stat-value { font-size: 16px; font-weight: 800; color: #2e7d32; }

                .table-title {
                    font-size: 12px;
                    font-weight: 800;
                    color: #333;
                    text-transform: uppercase;
                    border-left: 4px solid #1b5e20;
                    padding-left: 10px;
                    margin: 25px 0 15px 0;
                }

                .animals-multi-column-grid {
                    display: flex;
                    gap: 15px;
                    width: 100%;
                }

                .column-table {
                    flex: 1;
                    font-size: 9.5px;
                    border-collapse: collapse;
                }

                .column-table th {
                    background: #455a64;
                    color: white;
                    padding: 6px;
                    font-weight: 700;
                    border: 1px solid #37474f;
                }

                .column-table td {
                    padding: 5px 6px;
                    border: 1px solid #e0e0e0;
                    text-align: center;
                }

                .column-table tr:nth-child(even) { background: #fcfcfc; }
                `}
            </style>

            <div className="report-container">
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '20px' }}>
                    <button onClick={handlePrint} className="btn-primary" style={{ padding: '10px 20px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Printer size={18} /> Imprimir Informe
                    </button>
                    <button onClick={onClose} style={{ padding: '10px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="report-header">
                    <div>
                        <div className="finca-name">{fincaNombre}</div>
                        <div className="report-type">Informe Detallado de Venta / Despacho</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#666' }}>Fecha generado</div>
                        <div style={{ fontWeight: 'bold' }}>{format(new Date(), 'dd/MM/yyyy')}</div>
                    </div>
                </div>

                <div className="info-grid">
                    <div className="info-item">
                        <label>Comprador / Destino</label>
                        <span>{comprador}</span>
                    </div>
                    <div className="info-item">
                        <label>Fecha de Salida</label>
                        <span>{format(new Date(fechaVenta + 'T12:00:00'), "dd 'de' MMMM, yyyy", { locale: es })}</span>
                    </div>
                </div>

                <div className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-label">Cant. Animales</span>
                        <div className="stat-value">{totalAnimales}</div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Peso Promedio</span>
                        <div className="stat-value">{Math.round(totalKilos / totalAnimales)} kg</div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">GMP Promedio</span>
                        <div className="stat-value">{promedioGMP.toFixed(2)} kg</div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Meses Finca (Prom.)</span>
                        <div className="stat-value">{(promedioDiasFinca / 30).toFixed(1)} m</div>
                    </div>
                </div>

                <div className="table-title">Detalle de Salida</div>
                <div className="animals-multi-column-grid">
                    {[0, 1, 2].map(colIdx => {
                        const itemsPerCol = Math.ceil(animales.length / 3);
                        const colData = animales.slice(colIdx * itemsPerCol, (colIdx + 1) * itemsPerCol);
                        
                        return (
                            <table key={colIdx} className="column-table">
                                <thead>
                                    <tr>
                                        <th>Chapeta</th>
                                        <th>Peso</th>
                                        <th>GMP</th>
                                        <th>Marca</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {colData.map((a, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: '700', color: '#1b5e20' }}>{a.numero_chapeta}</td>
                                            <td style={{ fontWeight: 'bold' }}>{a.peso_salida}</td>
                                            <td style={{ 
                                                color: (a.gmp || 0) > umbralAlto ? '#2e7d32' : (a.gmp || 0) > umbralMedio ? '#f57c00' : '#d32f2f',
                                                fontWeight: '600'
                                            }}>
                                                {a.gmp && a.gmp > 0 ? a.gmp.toFixed(1) : '-'}
                                            </td>
                                            <td style={{ fontSize: '8px', color: '#666' }}>{a.propietario}</td>
                                        </tr>
                                    ))}
                                    {/* Rellenar espacios vacios para mantener simetría si es necesario */}
                                    {colData.length < itemsPerCol && Array.from({ length: itemsPerCol - colData.length }).map((_, i) => (
                                        <tr key={`empty-${i}`} style={{ height: '24px' }}>
                                            <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    })}
                </div>

                <div className="table-title">Resumen por Propietario</div>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <table className="column-table" style={{ width: '75%' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left' }}>Propietario</th>
                                <th style={{ textAlign: 'center' }}>Cant.</th>
                                <th style={{ textAlign: 'center' }}>Kilos Totales</th>
                                <th style={{ textAlign: 'center' }}>Peso Prom.</th>
                                <th style={{ textAlign: 'right' }}>GMP Prom.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resumenMarcas.map((r, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'left', fontWeight: '600' }}>{r.marca}</td>
                                    <td style={{ textAlign: 'center' }}>{r.count}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{r.kilos.toLocaleString()} kg</td>
                                    <td style={{ textAlign: 'center' }}>{Math.round(r.promedio)} kg</td>
                                    <td style={{ 
                                        textAlign: 'right', 
                                        fontWeight: 'bold',
                                        color: r.promedioGMP > umbralAlto ? '#2e7d32' : (r.promedioGMP > umbralMedio ? '#f57c00' : '#d32f2f')
                                    }}>
                                        {r.promedioGMP > 0 ? r.promedioGMP.toFixed(2) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ flex: 1, fontSize: '9px', color: '#888', borderLeft: '1px solid #eee', paddingLeft: '15px' }}>
                        <p><strong>Nota:</strong> Este reporte consolida todos los animales vendidos/despachados en la fecha seleccionada. Los valores de GMP se calculan basados en el historial completo.</p>
                        <p style={{ marginTop: '5px' }}>Generado por Agrogestión v3.0</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
