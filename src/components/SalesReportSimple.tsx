import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ReportPrintShell } from './ReportPrintShell';
import { splitIntoColumns } from '../utils/exportPdf';

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

    const nombreComprador = (comprador || 'Comprador').trim();
    const fechaDoc = (fechaVenta || '').trim().replace(/\//g, '-');
    const reportTitle = `Venta-${nombreComprador}-${fechaDoc}`.replace(/[\\/:*?"<>|]/g, '-');

    const { itemsPerCol, columnData } = splitIntoColumns(animales, 3);

    return (
        <ReportPrintShell
            variant="letter"
            pageMargin="15mm"
            printLabel="Imprimir / PDF"
            documentTitle={reportTitle}
            onClose={onClose}
        >
            <style>{`
                .report-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 12px;
                    flex-wrap: wrap;
                    border-bottom: 3px solid #1b5e20;
                    padding-bottom: 20px;
                    margin-bottom: 25px;
                }

                .header-left .finca-title {
                    font-size: 24px;
                    font-weight: 900;
                    color: #1b5e20;
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
                    background: #455a64;
                    color: white;
                    padding: 8px;
                    font-weight: 700;
                    border: 1px solid #37474f;
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
                .sum-value { font-size: 20px; font-weight: 900; color: #2e7d32; }
                .sum-unit { font-size: 12px; color: #777; font-weight: 500; margin-left: 2px; }

                .footer-note {
                    margin-top: 28px;
                    font-size: 9px;
                    color: #999;
                    text-align: center;
                    border-top: 1px solid #eee;
                    padding-top: 10px;
                }

                @media print {
                    .footer-note {
                        position: absolute;
                        bottom: 1cm;
                        left: 1.5cm;
                        right: 1.5cm;
                        margin-top: 0;
                    }
                }

                @media screen and (max-width: 768px) {
                    .header-left .finca-title { font-size: 19px; }
                    .info-strip { grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px; }
                    .matrix-grid { flex-direction: column; gap: 12px; }
                    .summary-section { grid-template-columns: 1fr; gap: 10px; padding-top: 18px; }
                }
            `}</style>

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
                {columnData.map((colData, colIdx) => (
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
                ))}
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
        </ReportPrintShell>
    );
}
