import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';
import { es } from 'date-fns/locale';

interface AnimalSimple {
    numero_chapeta: string;
    peso_salida: string | number;
}

interface SalesReportSimpleProps {
    fincaNombre: string;
    fechaVenta: string;
    animales: AnimalSimple[];
    comprador: string;
    onClose: () => void;
}

export default function SalesReportSimple({ fincaNombre, fechaVenta, animales, comprador, onClose }: SalesReportSimpleProps) {
    const totalKilos = animales.reduce((sum, a) => sum + parseFloat(a.peso_salida.toString()), 0);
    const totalAnimales = animales.length;
    const pesoPromedio = totalAnimales > 0 ? totalKilos / totalAnimales : 0;

    const handlePrint = () => window.print();

    return (
        <div className="report-modal-overlay">
            <style>{`
                @media print {
                    @page { 
                        size: letter;
                        margin: 0.5cm; 
                    }
                    body { background: white; }
                    
                    /* OCULTAR TODO LO QUE NO SEA EL REPORTE */
                    body > *:not(.report-modal-overlay) {
                        display: none !important;
                    }

                    .report-modal-overlay { 
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        background: white !important;
                        padding: 0 !important;
                        display: block !important;
                        width: 100% !important;
                        height: auto !important;
                        overflow: visible !important;
                        z-index: 9999 !important;
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
                    background: rgba(0,0,0,0.8);
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
                    padding: 1.5cm;
                    color: #1a1a1a;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
                    position: relative;
                }

                .report-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 3px solid #2c3e50;
                    padding-bottom: 20px;
                    margin-bottom: 25px;
                }

                .header-left .finca-title {
                    font-size: 24px;
                    font-weight: 900;
                    color: #2c3e50;
                    text-transform: uppercase;
                    margin: 0;
                }

                .header-left .report-subtitle {
                    font-size: 14px;
                    color: #666;
                    margin-top: 4px;
                }

                .info-strip {
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid #eee;
                    margin-bottom: 30px;
                    gap: 20px;
                }

                .info-item label { display: block; font-size: 10px; color: #999; font-weight: 700; text-transform: uppercase; }
                .info-item span { font-size: 14px; font-weight: 600; color: #333; }

                .matrix-grid {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 30px;
                }

                .column-table {
                    flex: 1;
                    border-collapse: collapse;
                    font-size: 10px;
                }

                .column-table th {
                    background: #2c3e50;
                    color: white;
                    padding: 8px;
                    font-weight: 700;
                    border: 1px solid #1a252f;
                    text-transform: uppercase;
                }

                .column-table td {
                    padding: 6px 8px;
                    border: 1px solid #eee;
                    text-align: center;
                }

                .column-table td:first-child { font-weight: 700; color: #34495e; }
                .column-table td:last-child { font-weight: bold; background: #fdfdfd; }

                .summary-section {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 15px;
                    border-top: 2px solid #eee;
                    padding-top: 25px;
                }

                .summary-card {
                    background: #fff;
                    border: 1px solid #e0e0e0;
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                }

                .sum-label { display: block; font-size: 11px; color: #999; font-weight: 700; text-transform: uppercase; margin-bottom: 5px; }
                .sum-value { font-size: 20px; font-weight: 900; color: #2c3e50; }
                .sum-unit { font-size: 12px; color: #777; font-weight: 500; margin-left: 2px; }

                .footer-note {
                    position: absolute;
                    bottom: 1cm;
                    left: 1.5cm;
                    right: 1.5cm;
                    font-size: 9px;
                    color: #bbb;
                    text-align: center;
                    border-top: 1px solid #f9f9f9;
                    padding-top: 10px;
                }
            `}</style>

            <div className="report-container">
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '20px' }}>
                    <button onClick={handlePrint} style={{ padding: '10px 20px', background: '#2c3e50', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Printer size={18} /> Imprimir / PDF
                    </button>
                    <button onClick={onClose} style={{ padding: '10px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="report-header">
                    <div className="header-left">
                        <h1 className="finca-title">{fincaNombre}</h1>
                        <div className="report-subtitle">Resumen de Salida de Ganado</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: 700 }}>Fecha Generado</div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{format(new Date(), 'dd/MM/yyyy')}</div>
                    </div>
                </div>

                <div className="info-strip">
                    <div className="info-item">
                        <label>Comprador / Destino</label>
                        <span>{comprador}</span>
                    </div>
                    <div className="info-item">
                        <label>Fecha Salida</label>
                        <span>{format(new Date(fechaVenta + 'T12:00:00'), "dd 'de' MMMM, yyyy", { locale: es })}</span>
                    </div>
                </div>

                <div className="matrix-grid">
                    {[0, 1, 2].map(colIdx => {
                        const itemsPerCol = Math.ceil(animales.length / 3);
                        const colData = animales.slice(colIdx * itemsPerCol, (colIdx + 1) * itemsPerCol);
                        
                        return (
                            <table key={colIdx} className="column-table">
                                <thead>
                                    <tr>
                                        <th>Chapeta</th>
                                        <th>Peso (kg)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {colData.map((a, i) => (
                                        <tr key={i}>
                                            <td>{a.numero_chapeta}</td>
                                            <td>{parseFloat(a.peso_salida.toString()).toFixed(1)}</td>
                                        </tr>
                                    ))}
                                    {/* Mantenemos simetría visual */}
                                    {colData.length < itemsPerCol && Array.from({ length: itemsPerCol - colData.length }).map((_, i) => (
                                        <tr key={`empty-${i}`} style={{ height: '24px' }}>
                                            <td>&nbsp;</td><td>&nbsp;</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    })}
                </div>

                <div className="summary-section">
                    <div className="summary-card">
                        <span className="sum-label">Animales</span>
                        <div className="sum-value">{totalAnimales}</div>
                    </div>
                    <div className="summary-card">
                        <span className="sum-label">Peso Promedio</span>
                        <div className="sum-value">{pesoPromedio.toFixed(1)}<span className="sum-unit">kg</span></div>
                    </div>
                    <div className="summary-card">
                        <span className="sum-label">Peso Total</span>
                        <div className="sum-value">{totalKilos.toLocaleString('es-CO', { maximumFractionDigits: 1 })}<span className="sum-unit">kg</span></div>
                    </div>
                </div>

                <div className="footer-note">
                    Reporte simple de despacho generado por Agrogestión v3.0 | {fincaNombre}
                </div>
            </div>
        </div>
    );
}
