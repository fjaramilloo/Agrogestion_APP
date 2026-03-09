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
    onClose: () => void;
}

export default function PurchaseReport({ fincaNombre, fechaIngreso, animales, onClose }: PurchaseReportProps) {
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

    const resumenMarcas = Object.keys(porMarca).map(marca => ({
        marca,
        count: porMarca[marca].count,
        kilos: porMarca[marca].kilos,
        promedio: porMarca[marca].kilos / porMarca[marca].count
    }));

    // Dividir animales para tabla de 2 columnas
    const half = Math.ceil(animales.length / 2);
    const leftCol = animales.slice(0, half);
    const rightCol = animales.slice(half);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="report-modal-overlay">
            <style>
                {`
                @media print {
                    @page { margin: 1cm; }
                    body * { visibility: hidden; }
                    .report-container, .report-container * { visibility: visible; }
                    .report-container { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        padding: 0;
                        background: white !important;
                        color: black !important;
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
                    max-width: 800px;
                    padding: 40px;
                    border-radius: 4px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    height: fit-content;
                    font-family: 'Inter', sans-serif;
                }
                .report-header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .report-title {
                    font-size: 24px;
                    font-weight: 800;
                    margin-bottom: 8px;
                    color: black;
                }
                .report-subtitle {
                    font-size: 16px;
                    margin-bottom: 20px;
                }
                .report-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                .report-table th, .report-table td {
                    border: 1px solid #ddd;
                    padding: 6px 10px;
                    text-align: left;
                }
                .report-table th {
                    background-color: #f8f8f8;
                    font-weight: 700;
                }
                .report-summary-box {
                    margin-top: 30px;
                    display: flex;
                    width: 100%;
                    border: 1px solid #333;
                }
                .summary-item {
                    flex: 1;
                    padding: 10px;
                    border-right: 1px solid #333;
                }
                .summary-item:last-child { border-right: none; }
                .summary-label { font-weight: 700; }
                .report-footer-table {
                    width: 100%;
                    margin-top: 10px;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                .report-footer-table th, .report-footer-table td {
                    border: 1px solid #333;
                    padding: 8px 12px;
                    text-align: center;
                }
                .report-footer-table th {
                    background-color: #eee;
                }
                `}
            </style>

            <div className="report-container">
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '20px' }}>
                    <button onClick={handlePrint} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}>
                        <Printer size={18} /> Imprimir / PDF
                    </button>
                    <button onClick={onClose} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '10px' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className="report-header">
                    <div className="report-title">Ingreso ganado {fincaNombre}</div>
                    <div className="report-subtitle">
                        <strong>Fecha ingreso:</strong> {format(new Date(fechaIngreso + 'T12:00:00'), 'dd/MM/yyyy')}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0' }}>
                    <table className="report-table" style={{ borderRight: 'none' }}>
                        <thead>
                            <tr>
                                <th>Chapeta</th>
                                <th>Marca</th>
                                <th>Peso</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leftCol.map((a, i) => (
                                <tr key={i}>
                                    <td>{a.numero_chapeta}</td>
                                    <td>{a.propietario}</td>
                                    <td>{a.peso_ingreso}</td>
                                </tr>
                            ))}
                            {/* Relleno para que tengan la misma altura si es impar */}
                            {leftCol.length > rightCol.length && rightCol.length > 0 && Array.from({ length: 0 }).map((_, i) => <tr key={'b' + i}><td colSpan={3}>&nbsp;</td></tr>)}
                        </tbody>
                    </table>
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>Chapeta</th>
                                <th>Marca</th>
                                <th>Peso</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rightCol.map((a, i) => (
                                <tr key={i}>
                                    <td>{a.numero_chapeta}</td>
                                    <td>{a.propietario}</td>
                                    <td>{a.peso_ingreso}</td>
                                </tr>
                            ))}
                            {/* Relleno si la columna derecha es más corta que la izquierda */}
                            {rightCol.length < leftCol.length && (
                                <tr>
                                    <td>&nbsp;</td>
                                    <td>&nbsp;</td>
                                    <td>&nbsp;</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="report-summary-box">
                    <div className="summary-item">
                        <span className="summary-label">Total Kilos:</span> {totalKilos.toLocaleString()}
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Total Animales:</span> {totalAnimales}
                    </div>
                </div>

                <table className="report-footer-table">
                    <thead>
                        <tr>
                            <th>Propietario</th>
                            <th>Nro Animales</th>
                            <th>Kilos total</th>
                            <th>Peso promedio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {resumenMarcas.map((r, i) => (
                            <tr key={i}>
                                <td>{r.marca}</td>
                                <td>{r.count}</td>
                                <td>{r.kilos.toLocaleString()}</td>
                                <td>{Math.round(r.promedio)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
