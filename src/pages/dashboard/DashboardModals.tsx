import { Fragment, useState } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDisplayValue, getUnidadLabel, getModoLabel, type ModoGanancia } from '../../utils/ganancia';
import type { SelectedGmpDetail } from './types';

export function DashboardMuertesModal({
    muertesData,
    onClose
}: {
    muertesData: any[];
    onClose: () => void;
}) {
    const muertesByYear = muertesData.reduce((acc, animal) => {
        const year = animal.fecha_baja ? animal.fecha_baja.substring(0, 4) : 'Desconocido';
        if (!acc[year]) acc[year] = [];
        acc[year].push(animal);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="dashboard-modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashboard-muertes-title"
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 id="dashboard-muertes-title" style={{ margin: 0, color: 'var(--text-main)' }}>Registro de Muertes y Descartes</h2>
                    <button type="button" aria-label="Cerrar modal de muertes" onClick={onClose} className="btn-icon dashboard-modal-close" style={{ width: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', padding: '0 8px' }}>&times;</button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
                    {muertesData.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No hay muertes registradas.</div>
                    ) : (
                        Object.keys(muertesByYear).sort((a, b) => b.localeCompare(a)).map(year => (
                            <div key={year} style={{ marginBottom: '24px' }}>
                                <h3 style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', color: 'var(--error)', marginTop: 0 }}>
                                    {year} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>({muertesByYear[year].length} animales)</span>
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {muertesByYear[year].map((m: any, idx: number) => (
                                        <div key={idx} style={{
                                            background: 'var(--surface-subtle)',
                                            padding: '16px',
                                            borderRadius: '12px',
                                            border: '1px solid var(--border-subtle)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: '16px'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    Chapeta: {m.numero_chapeta || m.chapeta || 'N/A'}
                                                    {m.tipo_baja === 'carnicero' ? (
                                                        <span style={{ fontSize: '0.7rem', background: 'var(--warning-soft-bg)', color: 'var(--warning)', border: '1px solid var(--warning-soft-border)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Carnicero</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.7rem', background: 'var(--error-soft-bg)', color: 'var(--error)', border: '1px solid var(--error-soft-border)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Muerto</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {m.fecha_baja ? format(new Date(m.fecha_baja), "d 'de' MMMM", { locale: es }) : 'Sin fecha'}
                                                </div>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '50%', textAlign: 'right', fontStyle: 'italic', wordBreak: 'break-word' }}>
                                                {m.observacion || 'Sin observaciones detalladas'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export function DashboardGmpDetailModal({
    detail,
    isMobile,
    modoGanancia,
    onClose
}: {
    detail: SelectedGmpDetail;
    isMobile: boolean;
    modoGanancia: ModoGanancia;
    onClose: () => void;
}) {
    const [sortCol, setSortCol] = useState<'chapeta' | 'propietario' | 'potrerada' | 'gmp'>('gmp');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const toggleSort = (col: 'chapeta' | 'propietario' | 'potrerada' | 'gmp') => {
        if (sortCol === col) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortOrder('asc');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="dashboard-detail-title" style={{ maxWidth: '900px', height: 'auto', maxHeight: '85dvh' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: isMobile ? '16px' : '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div>
                        <h2 id="dashboard-detail-title" style={{ margin: 0, color: 'var(--text-main)', fontSize: isMobile ? '1.15rem' : undefined }}>Detalle de Pesajes: {detail.label}</h2>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: isMobile ? '0.82rem' : undefined }}>Etapa: <strong style={{ color: detail.etapa === 'Levante' ? 'var(--warning)' : 'var(--success)' }}>{detail.etapa}</strong> | {detail.items.length} animales aportando.</p>
                    </div>
                    <button type="button" aria-label="Cerrar detalle de pesajes" onClick={onClose} className="btn-icon dashboard-modal-close" style={{ fontSize: '1.5rem' }}>&times;</button>
                </div>
                <div style={{ padding: isMobile ? '12px' : '24px', overflowY: 'auto' }}>
                    <div className="table-container">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th onClick={() => toggleSort('chapeta')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        Chapeta {sortCol === 'chapeta' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => toggleSort('propietario')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        Propietario {sortCol === 'propietario' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th onClick={() => toggleSort('potrerada')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        Potrerada {sortCol === 'potrerada' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th>Fecha Ant.</th>
                                    <th>Peso Ant.</th>
                                    <th>Fecha Actual</th>
                                    <th>Peso Actual</th>
                                    <th onClick={() => toggleSort('gmp')} style={{ textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        {getModoLabel(modoGanancia)} ({getUnidadLabel(modoGanancia)}) {sortCol === 'gmp' && (sortOrder === 'asc' ? '↑' : '↓')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...detail.items]
                                    .sort((a, b) => {
                                        if (sortCol === 'propietario') {
                                            const valA = a.propietario.toLowerCase();
                                            const valB = b.propietario.toLowerCase();
                                            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                                        } else if (sortCol === 'potrerada') {
                                            const valA = a.potrerada.toLowerCase();
                                            const valB = b.potrerada.toLowerCase();
                                            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                                        } else if (sortCol === 'chapeta') {
                                            const valA = a.chapeta.toLowerCase();
                                            const valB = b.chapeta.toLowerCase();
                                            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                                        } else {
                                            return sortOrder === 'asc' ? a.gmp - b.gmp : b.gmp - a.gmp;
                                        }
                                    })
                                    .map((item, idx) => (
                                        <tr key={idx} className="table-row-hover">
                                            <td style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{item.chapeta}</td>
                                            <td style={{ fontSize: '0.85rem' }}>{item.propietario}</td>
                                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.potrerada}</td>
                                            <td>{item.fechaAnterior}</td>
                                            <td>{item.pesoAnterior} kg</td>
                                            <td>{item.fechaActual}</td>
                                            <td style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.pesoActual} kg</td>
                                            <td style={{
                                                textAlign: 'right',
                                                fontWeight: 'bold',
                                                color: item.gmp < 10 ? 'var(--error)' : 'var(--success)'
                                            }}>
                                                {toDisplayValue(item.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1)}
                                            </td>
                                        </tr>
                                    ))}
                                {detail.items.length === 0 && (
                                    <tr>
                                        <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                            No hay datos detallados para este punto (Datos de ejemplo o históricos insuficientes).
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div style={{ padding: '20px 24px', background: 'var(--surface-subtle)', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
                    <button onClick={onClose} style={{ width: 'auto', padding: '10px 24px' }}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}

export function DashboardRangoModal({
    selectedRangoData,
    isMobile,
    onClose
}: {
    selectedRangoData: { nombre: string; animales: any[] };
    isMobile: boolean;
    onClose: () => void;
}) {
    const grouped = selectedRangoData.animales.reduce((acc: Record<string, any[]>, a) => {
        const key = a.potrerada || 'Sin Ubicación';
        if (!acc[key]) acc[key] = [];
        acc[key].push(a);
        return acc;
    }, {});

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="dashboard-rango-title" style={{ maxWidth: '900px', width: '95%', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: isMobile ? '16px' : '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div>
                        <h2 id="dashboard-rango-title" style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.4rem', color: 'var(--text-main)' }}>Animales en Rango: {selectedRangoData.nombre}</h2>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: isMobile ? '0.82rem' : '0.9rem' }}>Lista detallada de animales con peso estimado a hoy.</p>
                    </div>
                    <button type="button" aria-label="Cerrar detalle de rango" className="btn-icon dashboard-modal-close" onClick={onClose}><X size={24} aria-hidden="true" /></button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    <table className="dashboard-modal-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.12)' }}>
                            <tr>
                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Potrerada</th>
                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chapeta</th>
                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Peso Actual Real</th>
                                <th style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Peso Estimado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(grouped).map(([potrero, animals]) => (
                                <Fragment key={potrero}>
                                    <tr style={{ background: 'var(--primary-soft-bg)', borderLeft: '4px solid var(--primary)' }}>
                                        <td colSpan={4} style={{ fontWeight: 'bold', color: 'var(--primary-light)', fontSize: '0.95rem' }}>
                                            📍 Potrerada: {potrero} ({animals.length} animales)
                                        </td>
                                    </tr>
                                    {animals.map((a, idx) => (
                                        <tr key={`${potrero}-${idx}`} className="table-row-hover">
                                            <td>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    background: 'var(--surface-subtle)',
                                                    border: '1px solid var(--border-subtle)',
                                                    fontSize: '0.8rem',
                                                    color: 'var(--text-muted)'
                                                }}>
                                                    {a.potrerada}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</td>
                                            <td>{Math.round(a.ultimoPeso)} kg</td>
                                            <td style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                                                {Math.round(a.pesoEstimado)} kg
                                                {a.confianzaPeso === 'vencida' && (
                                                    <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--warning)', fontWeight: 600 }}>
                                                        ⚠️ {a.diasSinPesar}d
                                                    </span>
                                                )}
                                                {a.confianzaPeso === 'media' && (
                                                    <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                                        ({a.diasSinPesar}d)
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ padding: '20px 24px', background: 'var(--surface-subtle)', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
                    <button className="btn-secondary" onClick={onClose} style={{ width: 'auto', padding: '10px 24px' }}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}
