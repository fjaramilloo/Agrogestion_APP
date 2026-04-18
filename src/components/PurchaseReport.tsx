import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';

interface AnimalReport {
    numero_chapeta: string;
    peso_ingreso: string | number;
    propietario: string;
}

interface PurchaseReportProps {
    fincaNombre: string;
    fechaIngreso: string;
    animales: AnimalReport[];
    pesoCompraTotal?: number;
    onClose: () => void;
}

export default function PurchaseReport({ fincaNombre, fechaIngreso, animales, pesoCompraTotal, onClose }: PurchaseReportProps) {
    // Cálculos
    const totalKilos = animales.reduce((sum, a) => sum + parseFloat(a.peso_ingreso.toString()), 0);
    const totalAnimales = animales.length;

    // Agrupación por propietario (Marca)
    const porMarca = animales.reduce((acc: any, a) => {
        const marca = a.propietario || 'No definida';
        if (!acc[marca]) {
            acc[marca] = { count: 0, kilos: 0 };
        }
        acc[marca].count += 1;
        acc[marca].kilos += parseFloat(a.peso_ingreso.toString());
        return acc;
    }, {});

    const factorMerma = (pesoCompraTotal && totalKilos > 0) ? (pesoCompraTotal / totalKilos) : 1;

    const resumenMarcas = Object.keys(porMarca).map(marca => {
        const kilosIngreso = porMarca[marca].kilos;
        const kilosCompra = kilosIngreso * factorMerma;
        
        return {
            marca,
            count: porMarca[marca].count,
            kilos: kilosIngreso,
            kilosCompra: kilosCompra,
            promedio: kilosIngreso / porMarca[marca].count
        };
    });

    const promedioPeso = totalAnimales > 0 ? totalKilos / totalAnimales : 0;
    
    // Pérdida por transporte (Merma conforme al modelo del usuario: % sobre peso de compra)
    const perdidaKilos = pesoCompraTotal ? (pesoCompraTotal - totalKilos) : 0;
    const porcentajePerdida = (pesoCompraTotal && pesoCompraTotal > 0) ? (perdidaKilos / pesoCompraTotal * 100) : 0;

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
                        margin: 0.5cm; 
                    }
                    body * { visibility: hidden; }
                    .report-modal-overlay { background: none !important; padding: 0 !important; }
                    .report-container, .report-container * { visibility: visible; }
                    .report-container { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        padding: 0;
                        background: white !important;
                        color: black !important;
                        box-shadow: none !important;
                        max-width: 100% !important;
                    }
                    .no-print { display: none !important; }
                }
                .report-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    z-index: 2000;
                    display: flex;
                    justify-content: center;
                    padding: 40px 20px;
                    overflow-y: auto;
                }
                .report-container {
                    background: white;
                    color: #333;
                    width: 100%;
                    max-width: 900px;
                    padding: 25px;
                    border-radius: 8px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.25);
                    height: fit-content;
                    font-family: 'Inter', sans-serif;
                }
                .report-header {
                    text-align: center;
                    margin-bottom: 15px;
                }
                .report-title {
                    font-size: 20px;
                    font-weight: 800;
                    margin-bottom: 4px;
                    color: #1b5e20;
                    text-transform: uppercase;
                }
                .report-subtitle {
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 10px;
                    display: flex;
                    justify-content: center;
                    gap: 15px;
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

                .btn-print {
                    padding: 9px 18px;
                    background: #2e7d32;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }

                .btn-print:hover {
                    background: #1b5e20;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 10px rgba(46, 125, 50, 0.2);
                }

                .btn-close {
                    padding: 9px;
                    background: #e0e0e0;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #555;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .btn-close:hover {
                    background: #d0d0d0;
                    color: #000;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                }

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

                @media (max-width: 768px) {
                    .summary-grid {
                        grid-template-columns: 1fr 1fr;
                    }
                    .animals-multi-column-grid {
                        grid-template-columns: 1fr;
                    }
                    .resumen-marca-container {
                        flex-direction: column;
                    }
                    .resumen-marca-table {
                        width: 100% !important;
                        display: block;
                        overflow-x: auto;
                        white-space: nowrap;
                    }
                    .report-container {
                        padding: 15px;
                    }
                }
                `}
            </style>

            <div className="report-container">
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '15px' }}>
                    <button onClick={handlePrint} className="btn-print">
                        <Printer size={16} /> Imprimir (Carta)
                    </button>
                    <button onClick={onClose} className="btn-close">
                        <X size={20} />
                    </button>
                </div>

                <div className="report-header">
                    <div className="report-title">Ingreso Ganado - {fincaNombre}</div>
                    <div className="report-subtitle">
                        <span><strong>Fecha Informe:</strong> {format(new Date(), 'dd/MM/yyyy')}</span>
                        <span><strong>Fecha Ingreso Lote:</strong> {format(new Date(fechaIngreso + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                    </div>
                </div>

                <div className="summary-grid">
                    <div className="summary-item">
                        <span className="summary-label">Animales</span>
                        <div className="summary-value">{totalAnimales}</div>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Peso Total</span>
                        <div className="summary-value">{totalKilos.toLocaleString()} kg</div>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Promedio</span>
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
                    {[0, 1, 2].map(colIdx => {
                        // Dividir el array en 3 partes
                        const itemsPerCol = Math.ceil(animales.length / 3);
                        const colItems = animales.slice(colIdx * itemsPerCol, (colIdx + 1) * itemsPerCol);
                        
                        return (
                            <table key={colIdx} className="column-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '20px' }}>#</th>
                                        <th>Chapeta</th>
                                        <th style={{ textAlign: 'right' }}>Peso</th>
                                        <th>Prop.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {colItems.map((a, i) => (
                                        <tr key={i}>
                                            <td style={{ color: '#888', fontSize: '8px' }}>{colIdx * itemsPerCol + i + 1}</td>
                                            <td style={{ fontWeight: '600' }}>{a.numero_chapeta}</td>
                                            <td style={{ fontWeight: '700', textAlign: 'right' }}>{a.peso_ingreso}</td>
                                            <td style={{ color: '#666', fontSize: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '40px' }}>{a.propietario}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    })}
                </div>

                <div className="table-title" style={{ marginTop: '20px' }}>Resumen por Marca</div>
                <div className="resumen-marca-container" style={{ display: 'flex', gap: '20px' }}>
                    <table className="column-table resumen-marca-table" style={{ width: '70%' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left' }}>Propietario</th>
                                <th style={{ textAlign: 'center' }}>Cant.</th>
                                <th style={{ textAlign: 'center' }}>Kg Recibo</th>
                                <th style={{ textAlign: 'center', background: '#fff8e1' }}>Kg Compra</th>
                                <th style={{ textAlign: 'right' }}>Prom. kg</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resumenMarcas.map((r, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'left', fontWeight: '600' }}>{r.marca}</td>
                                    <td style={{ textAlign: 'center' }}>{r.count}</td>
                                    <td style={{ textAlign: 'center' }}>{r.kilos.toLocaleString()}</td>
                                    <td style={{ textAlign: 'center', fontWeight: '800', borderLeft: '2px solid #ffe082', background: '#fffef9' }}>
                                        {r.kilosCompra.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                    </td>
                                    <td style={{ fontWeight: '700', textAlign: 'right' }}>{Math.round(r.promedio)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ flex: 1, fontSize: '9px', color: '#888', borderLeft: '1px solid #eee', paddingLeft: '15px' }}>
                        <p><strong>Nota:</strong> Los "Kg Compra" son proporcionales al peso total de báscula de compra vs báscula de recepción.</p>
                        <p style={{ marginTop: '5px' }}>Generado por Agrogestión v3.0</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
