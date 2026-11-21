import { format } from 'date-fns';
import { ReportPrintShell } from './ReportPrintShell';
import { splitIntoColumns } from '../utils/exportPdf';

interface AnimalSimple {
    numero_chapeta: string;
    peso_ingreso: string | number;
}

interface PurchaseReportSimpleProps {
    fincaNombre: string;
    fechaCompra: string;
    animales: AnimalSimple[];
    proveedor: string;
    pesoCompraTotal?: number;
    onClose: () => void;
}

export default function PurchaseReportSimple({ fincaNombre, fechaCompra, animales, proveedor, pesoCompraTotal, onClose }: PurchaseReportSimpleProps) {
    const totalKilos = animales.reduce((sum, a) => sum + parseFloat(a.peso_ingreso.toString()), 0);
    const totalAnimales = animales.length;
    const promedioPeso = totalAnimales > 0 ? totalKilos / totalAnimales : 0;

    // Pérdida por transporte (Merma conforme al modelo del usuario: % sobre peso de compra)
    const perdidaKilos = pesoCompraTotal ? (pesoCompraTotal - totalKilos) : 0;
    const porcentajePerdida = (pesoCompraTotal && pesoCompraTotal > 0) ? (perdidaKilos / pesoCompraTotal * 100) : 0;

    const sortedAnimales = [...animales].sort((a, b) =>
        a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true, sensitivity: 'base' })
    );
    const { itemsPerCol, columnData } = splitIntoColumns(sortedAnimales, 3);

    return (
        <ReportPrintShell variant="compact" pageMargin="0.5cm" printLabel="Imprimir (Carta)" onClose={onClose}>
            <style>{`
                .rs-header {
                    text-align: center;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #1b5e20;
                    padding-bottom: 10px;
                }
                .rs-title {
                    font-size: 20px;
                    font-weight: 800;
                    margin-bottom: 4px;
                    color: #1b5e20;
                    text-transform: uppercase;
                }
                .rs-subtitle {
                    font-size: 12px;
                    color: #666;
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    flex-wrap: wrap;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .summary-item {
                    background: #f1f8e9;
                    border: 1px solid #c8e6c9;
                    border-radius: 6px;
                    padding: 8px;
                    text-align: center;
                }
                .summary-item.highlight { background: #fff8e1; border: 1px solid #ffe082; }
                .summary-item.loss { background: #fff5f5; border: 1px solid #feb2b2; }
                .summary-label { 
                    display: block;
                    font-size: 10px;
                    text-transform: uppercase;
                    color: #558b2f;
                    font-weight: 700;
                    margin-bottom: 2px;
                }
                .summary-value { font-size: 14px; font-weight: 800; color: #2e7d32; }
                .loss-value { color: #e53935; font-size: 14px; font-weight: 800; }

                /* Grilla de 3 columnas para animales */
                .animals-multi-column-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 15px;
                    border-top: 1px solid #ddd;
                    padding-top: 10px;
                }
                .column-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                }
                .column-table th {
                    background: #f1f3f5;
                    border: 1px solid #dee2e6;
                    padding: 4px 6px;
                    text-align: left;
                    font-weight: 700;
                }
                .column-table td {
                    border: 1px solid #dee2e6;
                    padding: 3px 6px;
                }
                .table-title {
                    font-size: 13px;
                    font-weight: 700;
                    margin-bottom: 6px;
                    color: #333;
                    border-bottom: 2px solid #1b5e20;
                    display: inline-block;
                }

                @media screen and (max-width: 768px) {
                    .summary-grid {
                        grid-template-columns: 1fr 1fr;
                    }
                    .animals-multi-column-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>

            <div className="rs-header">
                <div className="rs-title">Ingreso Ganado — {fincaNombre}</div>
                <div className="rs-subtitle">
                    <span><strong>Proveedor:</strong> {proveedor}</span>
                    <span><strong>Fecha:</strong> {format(new Date(fechaCompra + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                </div>
            </div>

            <div className="summary-grid">
                <div className="summary-item">
                    <span className="summary-label">Animales</span>
                    <div className="summary-value">{totalAnimales}</div>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Kilos Totales</span>
                    <div className="summary-value">{totalKilos.toLocaleString()} kg</div>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Peso Promedio</span>
                    <div className="summary-value">{promedioPeso.toFixed(1)} kg</div>
                </div>
                {pesoCompraTotal && (
                    <>
                        <div className="summary-item highlight">
                            <span className="summary-label">Peso Compra</span>
                            <div className="summary-value">{pesoCompraTotal.toLocaleString()} kg</div>
                        </div>
                        <div className="summary-item loss">
                            <span className="summary-label">% Pérdida</span>
                            <div className="loss-value">{porcentajePerdida.toFixed(1)}%</div>
                        </div>
                    </>
                )}
            </div>

            <div className="table-title">Detalle de Ingresos</div>
            <div className="animals-multi-column-grid">
                {columnData.map((colItems, colIdx) => (
                    <table key={colIdx} className="column-table">
                        <thead>
                            <tr>
                                <th style={{ width: '20px' }}>#</th>
                                <th>Chapeta</th>
                                <th style={{ textAlign: 'right' }}>Peso (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {colItems.map((a, i) => (
                                <tr key={i}>
                                    <td style={{ color: '#888', fontSize: '8px' }}>{colIdx * itemsPerCol + i + 1}</td>
                                    <td style={{ fontWeight: '600' }}>{a.numero_chapeta}</td>
                                    <td style={{ fontWeight: '700', textAlign: 'right' }}>{parseFloat(a.peso_ingreso.toString()).toFixed(1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ))}
            </div>

            <div style={{ marginTop: '20px', fontSize: '9px', color: '#888', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                <p>Reporte simplificado de recepción de ganado. Generado por Agrogestión v3.0</p>
            </div>
        </ReportPrintShell>
    );
}
