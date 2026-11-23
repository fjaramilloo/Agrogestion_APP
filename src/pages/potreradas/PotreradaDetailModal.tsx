import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
    Users,
    X,
    MapPin,
    TrendingUp,
    Info,
    Scale,
    Activity,
    Download,
    Loader2
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import {
    toDisplayValue,
    getUnidadLabel,
    getModoLabel,
    getGmpColor as resolveGmpColor,
    type ModoGanancia
} from '../../utils/ganancia';
import { exportarDetallePotreradaPdf } from './potreradaDetailPdf';
import type { PotreradaDetailData } from './types';

interface PotreradaDetailModalProps {
    selectedDetailId: string | null;
    detailLoading: boolean;
    detailData: PotreradaDetailData | null;
    showFullHistory: boolean;
    onToggleFullHistory: (val: boolean) => void;
    fincaId: string | null;
    role: string | null;
    modoGanancia: ModoGanancia;
    umbralMedio: number;
    umbralAlto: number;
    isMobile: boolean;
    onOpenMoveModal: () => void;
    onOpenWeighingForm: () => void;
    onClose: () => void;
}

export default function PotreradaDetailModal({
    selectedDetailId,
    detailLoading,
    detailData,
    showFullHistory,
    onToggleFullHistory,
    fincaId,
    role,
    modoGanancia,
    umbralMedio,
    umbralAlto,
    isMobile,
    onOpenMoveModal,
    onOpenWeighingForm,
    onClose
}: PotreradaDetailModalProps) {
    const { showAlert } = useFeedback();
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({
        key: 'numero_chapeta',
        direction: 'asc'
    });
    const chartsRef = useRef<HTMLDivElement>(null);
    const [exportingPdf, setExportingPdf] = useState(false);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAnimals = useMemo(() => {
        if (!detailData?.animales) return [];
        return [...detailData.animales].sort((a: any, b: any) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            const valA = a[key];
            const valB = b[key];

            if (key === 'numero_chapeta') {
                return direction === 'asc'
                    ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
                    : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [detailData?.animales, sortConfig]);

    const handleExportPDF = async () => {
        if (!detailData) return;
        setExportingPdf(true);
        try {
            await exportarDetallePotreradaPdf({
                fincaId,
                detailData,
                sortedAnimals,
                chartsElement: chartsRef.current,
                modoGanancia,
                umbralMedio,
                umbralAlto
            });
        } catch (error) {
            console.error('Error al generar PDF:', error);
            await showAlert('Hubo un error al exportar el informe.', { title: 'Error al exportar', variant: 'error' });
        } finally {
            setExportingPdf(false);
        }
    };

    if (!selectedDetailId) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card modal-content" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
                {detailLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--primary)' }}>
                        Cargando información...
                    </div>
                ) : detailData ? (() => {
                    const activeFechasColumnas = detailData.fechasColumnas.filter(fecha =>
                        detailData.animales.some(a => a.pesajesFiltrados && a.pesajesFiltrados[fecha] && a.fechaIngresoEtapa !== fecha)
                    );
                    const validCompra = detailData.animales.filter(a => a.peso_compra);
                    const totalCompra = validCompra.reduce((sum, a) => sum + (a.peso_compra || 0), 0);
                    const promCompra = validCompra.length > 0 ? totalCompra / validCompra.length : 0;

                    const validIngreso = detailData.animales.filter(a => a.pesoIngresoEtapa);
                    const totalIngreso = validIngreso.reduce((sum, a) => sum + (a.pesoIngresoEtapa || 0), 0);
                    const promIngreso = validIngreso.length > 0 ? totalIngreso / validIngreso.length : 0;

                    const validActual = detailData.animales.filter(a => a.pesoActual);
                    const totalActual = validActual.reduce((sum, a) => sum + (a.pesoActual || 0), 0);
                    const promActual = validActual.length > 0 ? totalActual / validActual.length : 0;

                    const getGmpColor = (val: number) => resolveGmpColor(val, umbralMedio, umbralAlto);
                    const getSortAria = (key: string): 'ascending' | 'descending' | undefined =>
                        sortConfig?.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined;

                    return (
                        <>
                            <div className="potreradas-modal-header">
                                <div className="potreradas-modal-header-top" style={{ flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                                        <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary-light)', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>
                                            {detailData.potrerada.nombre}
                                        </h2>
                                        <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                <MapPin size={14} color="var(--primary)" aria-hidden="true" /> <span className="mobile-hide">Potrero:</span> <strong style={{ color: 'var(--text)' }}>{detailData.potreroActual}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                <TrendingUp size={14} color={getGmpColor(detailData.gmpPromedioGrupo)} aria-hidden="true" />
                                                <span className="mobile-hide">{getModoLabel(modoGanancia)} Últ:</span>
                                                <strong style={{ color: getGmpColor(detailData.gmpPromedioGrupo) }}>
                                                    {toDisplayValue(detailData.gmpPromedioGrupo, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                </strong>
                                                {detailData.potrerada.gmpAcumulado !== null && detailData.potrerada.gmpAcumulado !== undefined && (
                                                    <span style={{ marginLeft: '4px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                        (Hist: <strong style={{ color: getGmpColor(detailData.potrerada.gmpAcumulado) }}>
                                                            {toDisplayValue(detailData.potrerada.gmpAcumulado, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                        </strong>)
                                                    </span>
                                                )}
                                            </div>
                                            {(() => {
                                                const productivity = (detailData.animales.length * detailData.potrerada.gmpPromedio) / (detailData.areaTotalSistema || 1);
                                                return (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                        <Activity size={14} color="var(--primary-light)" aria-hidden="true" /> <span className="mobile-hide">Prod:</span> <strong style={{ color: 'var(--primary-light)' }}>{productivity.toFixed(1)} kg/Ha/Mes</strong>
                                                    </div>
                                                );
                                            })()}
                                            {detailData.areaTotalSistema && detailData.areaTotalSistema > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    <Scale size={14} color="var(--warning)" aria-hidden="true" /> <span className="mobile-hide">Carga:</span> <strong style={{ color: 'var(--text)' }}>{(detailData.animales.length / detailData.areaTotalSistema).toFixed(2)} C/Ha</strong>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="potreradas-detail-controls">
                                        <label className="potreradas-history-switch">
                                            <input
                                                type="checkbox"
                                                role="switch"
                                                aria-checked={showFullHistory}
                                                className="potreradas-visually-hidden potreradas-history-input"
                                                checked={showFullHistory}
                                                onChange={e => onToggleFullHistory(e.target.checked)}
                                            />
                                            <span className={`potreradas-history-track${showFullHistory ? ' is-on' : ''}`} aria-hidden="true">
                                                <span className="potreradas-history-thumb" />
                                            </span>
                                            <span>Historial</span>
                                        </label>
                                        <div className="potreradas-detail-divider" style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }}></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {role !== 'observador' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={onOpenMoveModal}
                                                        className="icon-btn-tooltip potreradas-detail-action-btn"
                                                        data-tooltip="Mover Animales"
                                                        aria-label="Mover animales a otro lote"
                                                        style={{
                                                            background: 'var(--secondary-soft-bg)',
                                                            color: 'var(--secondary)',
                                                            border: '1px solid var(--secondary-soft-border)',
                                                        }}
                                                    >
                                                        <Users size={16} color="var(--secondary)" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={onOpenWeighingForm}
                                                        className="icon-btn-tooltip potreradas-detail-action-btn"
                                                        data-tooltip="Nuevo Pesaje"
                                                        aria-label="Registrar nuevo pesaje grupal"
                                                        style={{
                                                            background: 'var(--success-soft-bg)',
                                                            color: 'var(--success)',
                                                            border: '1px solid var(--success-soft-border)',
                                                        }}
                                                    >
                                                        <Scale size={16} color="var(--success)" aria-hidden="true" />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                type="button"
                                                onClick={handleExportPDF}
                                                disabled={exportingPdf}
                                                className="icon-btn-tooltip potreradas-detail-action-btn"
                                                data-tooltip="Descargar PDF"
                                                aria-label="Descargar reporte PDF del lote"
                                                style={{
                                                    background: 'var(--surface-subtle)',
                                                    color: 'var(--text-main)',
                                                    border: '1px solid var(--border-strong)',
                                                }}
                                            >
                                                {exportingPdf ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Download size={16} color="var(--text-main)" aria-hidden="true" />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="icon-btn-tooltip potreradas-detail-action-btn"
                                                data-tooltip="Cerrar detalle"
                                                aria-label="Cerrar detalle"
                                                style={{
                                                    margin: 0,
                                                    background: 'var(--surface-subtle)',
                                                    color: 'var(--text-main)',
                                                    border: '1px solid var(--border-strong)',
                                                }}
                                            >
                                                <X size={18} color="var(--text-main)" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="potreradas-detail-body" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                <div className="responsive-grid potreradas-charts-grid" style={{ marginBottom: '24px' }} ref={chartsRef}>
                                    <div className="glass-panel" style={{ padding: '16px', height: '280px' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</h4>
                                        {detailData.history.length > 1 ? (
                                            <ResponsiveContainer width="100%" height="85%">
                                                <LineChart data={detailData.history}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                                    <XAxis dataKey="fecha" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)' }} />
                                                    <Line type="monotone" dataKey="pesoPromedio" name="Peso (kg)" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary)', r: 4 }} activeDot={{ r: 6 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0 20px' }}>Información insuficiente para generar la gráfica</div>
                                        )}
                                    </div>

                                    <div className="glass-panel" style={{ padding: '16px', height: '280px' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{getModoLabel(modoGanancia)} Promedio</h4>
                                        {detailData.history.some(d => d.gmpPromedio !== null) ? (
                                            <ResponsiveContainer width="100%" height="85%">
                                                <LineChart data={detailData.history.filter(d => d.gmpPromedio !== null)}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                                                    <XAxis dataKey="fecha" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} />
                                                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', color: 'var(--text-main)' }} formatter={(value: any, name: any) => [`${toDisplayValue(value, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)} ${getUnidadLabel(modoGanancia)}`, name]} />
                                                    <Line type="monotone" dataKey="gmpPromedio" name={`${getModoLabel(modoGanancia)}`} stroke="var(--success)" strokeWidth={3} dot={{ fill: 'var(--success)', r: 4 }} activeDot={{ r: 6 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0 20px' }}>Información insuficiente para generar la gráfica</div>
                                        )}
                                    </div>
                                </div>

                                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Info size={14} aria-hidden="true" /> Detalle por Animal ({sortedAnimals.length})
                                </h4>

                                {isMobile ? (
                                    <>
                                        {detailData.animales.length > 0 && (
                                            <div className="potreradas-detail-summary">
                                                <div className="potreradas-summary-pill">
                                                    <div className="potreradas-summary-label">Peso Actual</div>
                                                    <div className="potreradas-summary-val">{totalActual > 0 ? `${Math.round(totalActual).toLocaleString('es-CO')} kg` : '-'}</div>
                                                    <div className="potreradas-summary-sub">Prom: {promActual > 0 ? `${Math.round(promActual).toLocaleString('es-CO')} kg` : '-'}</div>
                                                </div>
                                                <div className="potreradas-summary-pill">
                                                    <div className="potreradas-summary-label">Peso Ingreso</div>
                                                    <div className="potreradas-summary-val">{totalIngreso > 0 ? `${Math.round(totalIngreso).toLocaleString('es-CO')} kg` : '-'}</div>
                                                    <div className="potreradas-summary-sub">Prom: {promIngreso > 0 ? `${Math.round(promIngreso).toLocaleString('es-CO')} kg` : '-'}</div>
                                                </div>
                                                {detailData.potrerada.etapa === 'levante' && totalCompra > 0 && (
                                                    <div className="potreradas-summary-pill" style={{ gridColumn: '1 / -1' }}>
                                                        <div className="potreradas-summary-label">Peso Compra</div>
                                                        <div className="potreradas-summary-val">
                                                            {Math.round(totalCompra).toLocaleString('es-CO')} kg{' '}
                                                            <span className="potreradas-summary-sub">(Prom: {Math.round(promCompra).toLocaleString('es-CO')} kg)</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {sortedAnimals.length > 0 && (
                                            <div className="potreradas-mobile-sort-bar" aria-label="Ordenar animales">
                                                {[
                                                    { key: 'numero_chapeta', label: 'Chapeta' },
                                                    { key: 'pesoActual', label: 'Peso actual' },
                                                    { key: 'pesoIngresoEtapa', label: 'Ingreso' },
                                                    { key: 'gmp', label: getModoLabel(modoGanancia) },
                                                ].map(opt => {
                                                    const active = sortConfig?.key === opt.key;
                                                    return (
                                                        <button
                                                            key={opt.key}
                                                            type="button"
                                                            className={`potreradas-mobile-sort-chip${active ? ' is-active' : ''}`}
                                                            onClick={() => handleSort(opt.key)}
                                                        >
                                                            {opt.label}{active ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {sortedAnimals.length === 0 ? (
                                            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                Esta potrerada no tiene animales activos.
                                            </div>
                                        ) : (
                                            <div className="potreradas-animal-cards">
                                                {sortedAnimals.map(a => (
                                                    <div key={a.id} className="potreradas-animal-card">
                                                        <div className="potreradas-animal-card-top">
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <strong style={{ fontSize: '1.05rem', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</strong>
                                                                    {a.estado === 'vendido' && (
                                                                        <span style={{ background: 'var(--error-soft-bg)', color: 'var(--error)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', border: '1px solid var(--error-soft-border)', fontWeight: 'bold' }}>Vendido</span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.nombre_propietario}</div>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                                                    {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                                </div>
                                                                {a.hasCalculatedGmp && (
                                                                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: getGmpColor(a.gmp || 0) }}>
                                                                        Últ: {toDisplayValue(a.gmp || 0, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                        {a.gmpAcumulado !== undefined && a.gmpAcumulado !== null && (
                                                                            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                                                                                {' · Hist: '}
                                                                                <span style={{ color: getGmpColor(a.gmpAcumulado) }}>
                                                                                    {toDisplayValue(a.gmpAcumulado, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                                </span>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="potreradas-animal-metrics">
                                                            <span>
                                                                Ingreso: <strong>{a.pesoIngresoEtapa ? `${Math.round(a.pesoIngresoEtapa)} kg` : '-'}</strong>
                                                                {a.fechaIngresoEtapa ? ` (${format(new Date(a.fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy')})` : ''}
                                                            </span>
                                                            {detailData.potrerada.etapa === 'levante' && (
                                                                <span>Compra: <strong>{a.peso_compra ? `${Math.round(a.peso_compra)} kg` : '-'}</strong></span>
                                                            )}
                                                        </div>

                                                        {activeFechasColumnas.length > 0 && (
                                                            <div className="potreradas-animal-dates">
                                                                {activeFechasColumnas.map(fecha => {
                                                                    const isEntryDate = a.fechaIngresoEtapa === fecha;
                                                                    const val = a.pesajesFiltrados && a.pesajesFiltrados[fecha] && !isEntryDate ? Math.round(a.pesajesFiltrados[fecha]) : null;
                                                                    if (val === null) return null;
                                                                    return (
                                                                        <span key={fecha} className="potreradas-date-chip">
                                                                            {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}: <strong>{val} kg</strong>
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="table-container">
                                        <table className="potreradas-detail-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                                                    <th scope="col" aria-sort={getSortAria('numero_chapeta')}>
                                                        <button type="button" onClick={() => handleSort('numero_chapeta')} className="potreradas-sort-btn">
                                                            <span>CHAPETA</span>
                                                            {sortConfig?.key === 'numero_chapeta' && (
                                                                <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                            )}
                                                        </button>
                                                    </th>
                                                    <th scope="col" style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PROPIETARIO</th>
                                                    {detailData.potrerada.etapa === 'levante' && (
                                                        <th scope="col" style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PESO COMPRA</th>
                                                    )}
                                                    <th scope="col" aria-sort={getSortAria('pesoIngresoEtapa')}>
                                                        <button type="button" onClick={() => handleSort('pesoIngresoEtapa')} className="potreradas-sort-btn potreradas-sort-btn--center">
                                                            <span>PESO INGRESO</span>
                                                            {sortConfig?.key === 'pesoIngresoEtapa' && (
                                                                <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                            )}
                                                        </button>
                                                    </th>
                                                    <th scope="col" aria-sort={getSortAria('pesoActual')}>
                                                        <button type="button" onClick={() => handleSort('pesoActual')} className="potreradas-sort-btn potreradas-sort-btn--center">
                                                            <span>PESO ACTUAL</span>
                                                            {sortConfig?.key === 'pesoActual' && (
                                                                <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                            )}
                                                        </button>
                                                    </th>
                                                    {activeFechasColumnas.map(fecha => (
                                                        <th key={fecha} scope="col" style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PESAJE {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}</th>
                                                    ))}
                                                    <th scope="col" aria-sort={getSortAria('gmp')}>
                                                        <button type="button" onClick={() => handleSort('gmp')} className="potreradas-sort-btn potreradas-sort-btn--right">
                                                            <span>{getModoLabel(modoGanancia)}</span>
                                                            {sortConfig?.key === 'gmp' && (
                                                                <span aria-hidden="true" style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                            )}
                                                        </button>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedAnimals.map((a, idx) => (
                                                    <tr key={a.id} style={{ borderBottom: idx < sortedAnimals.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                                        <td style={{ padding: '12px 16px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span>#{a.numero_chapeta}</span>
                                                                {a.estado === 'vendido' && (
                                                                    <span style={{ background: 'var(--error-soft-bg)', color: 'var(--error)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', border: '1px solid var(--error-soft-border)', fontWeight: 'bold' }}>Vendido</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{a.nombre_propietario}</td>
                                                        {detailData.potrerada.etapa === 'levante' && (
                                                            <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                <div style={{ fontWeight: 'bold' }}>{a.peso_compra ? `${Math.round(a.peso_compra)} kg` : '-'}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.fechaIngresoEtapa ? format(new Date(a.fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy') : '-'}</div>
                                                            </td>
                                                        )}
                                                        <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                            <div style={{ fontWeight: 'bold' }}>{a.pesoIngresoEtapa ? `${Math.round(a.pesoIngresoEtapa)} kg` : '-'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.fechaIngresoEtapa ? format(new Date(a.fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yy') : '-'}</div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                        </td>
                                                        {activeFechasColumnas.map(fecha => {
                                                            const isEntryDate = a.fechaIngresoEtapa === fecha;
                                                            return (
                                                                <td key={fecha} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                    {a.pesajesFiltrados && a.pesajesFiltrados[fecha] && !isEntryDate ? `${Math.round(a.pesajesFiltrados[fecha])} kg` : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                            {a.hasCalculatedGmp ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                                    <div>
                                                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginRight: '4px' }}>Últ:</span>
                                                                        <span style={{ color: getGmpColor(a.gmp || 0), fontWeight: 'bold' }}>
                                                                            {toDisplayValue(a.gmp || 0, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                        </span>
                                                                    </div>
                                                                    {a.gmpAcumulado !== undefined && a.gmpAcumulado !== null && (
                                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                            Hist:{' '}
                                                                            <span style={{ color: getGmpColor(a.gmpAcumulado), fontWeight: 600 }}>
                                                                                {toDisplayValue(a.gmpAcumulado, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {sortedAnimals.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4 + activeFechasColumnas.length + 1} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                            Esta potrerada no tiene animales activos.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            {detailData.animales.length > 0 && (
                                                <tfoot>
                                                    <tr style={{ borderTop: '2px solid var(--border-strong)', background: 'var(--surface-subtle)' }}>
                                                        <td colSpan={2} style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>TOTALES:</td>
                                                        {detailData.potrerada.etapa === 'levante' && (
                                                            <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                {totalCompra > 0 ? `${Math.round(totalCompra).toLocaleString('es-CO')} kg` : '-'}
                                                            </td>
                                                        )}
                                                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {totalIngreso > 0 ? `${Math.round(totalIngreso).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {totalActual > 0 ? `${Math.round(totalActual).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        {activeFechasColumnas.map(fecha => {
                                                            const total = detailData.animales.reduce((acc, a) => acc + (a.pesajesFiltrados && a.pesajesFiltrados[fecha] ? a.pesajesFiltrados[fecha] : 0), 0);
                                                            return (
                                                                <td key={fecha} style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                                    {total > 0 ? `${Math.round(total).toLocaleString('es-CO')} kg` : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td></td>
                                                    </tr>
                                                    <tr style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
                                                        <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.7rem' }}>PROMEDIOS:</td>
                                                        {detailData.potrerada.etapa === 'levante' && (
                                                            <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                                {promCompra > 0 ? `${Math.round(promCompra).toLocaleString('es-CO')} kg` : '-'}
                                                            </td>
                                                        )}
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                            {promIngreso > 0 ? `${Math.round(promIngreso).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                            {promActual > 0 ? `${Math.round(promActual).toLocaleString('es-CO')} kg` : '-'}
                                                        </td>
                                                        {activeFechasColumnas.map(fecha => {
                                                            const validAnimals = detailData.animales.filter(a => a.pesajesFiltrados && a.pesajesFiltrados[fecha]);
                                                            const total = validAnimals.reduce((acc, a) => acc + (a.pesajesFiltrados![fecha] || 0), 0);
                                                            const avg = validAnimals.length > 0 ? total / validAnimals.length : 0;
                                                            return (
                                                                <td key={fecha} style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                                    {avg > 0 ? `${Math.round(avg).toLocaleString('es-CO')} kg` : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="potreradas-modal-footer">
                                <button type="button" onClick={onClose} className="potreradas-btn-close-footer">
                                    Cerrar
                                </button>
                            </div>
                        </>
                    );
                })() : (
                    <div style={{ padding: '40px', textAlign: 'center' }}>No se pudo cargar la información.</div>
                )}
            </div>
        </div>
    );
}
