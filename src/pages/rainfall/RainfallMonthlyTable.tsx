import { useEffect, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getLocalIsoDate } from '../../utils/dateUtils';
import type { PluviometroFinca } from '../../utils/rainfallUtils';
import type { PerfilClimatico } from '../../utils/climateRegions';
import { clasificarIntensidad, type MesGroup, type RegistroLluvia } from './types';

interface RainfallMonthlyTableProps {
    registros: RegistroLluvia[];
    anoSeleccionado: number;
    anosDisponibles: number[];
    onChangeAno: (ano: number) => void;
    pluviometrosMap: Map<string, PluviometroFinca>;
    pluviometrosActivosCount: number;
    esMultiPluviometro: boolean;
    filtroPluviometro: string;
    perfil: PerfilClimatico;
    isAdminOrCowboy: boolean;
    onEditDate: (fecha: string) => void;
    onRequestEliminar: (id: string, nombreEstacion?: string) => void;
}

export default function RainfallMonthlyTable({
    registros,
    anoSeleccionado,
    anosDisponibles,
    onChangeAno,
    pluviometrosMap,
    pluviometrosActivosCount,
    esMultiPluviometro,
    filtroPluviometro,
    perfil,
    isAdminOrCowboy,
    onEditDate,
    onRequestEliminar
}: RainfallMonthlyTableProps) {
    const [mesGroups, setMesGroups] = useState<MesGroup[]>([]);

    useEffect(() => {
        const filtrados = registros.filter(
            r => parseISO(r.fecha + 'T12:00:00').getFullYear() === anoSeleccionado
        );
        const map: Record<string, RegistroLluvia[]> = {};
        filtrados.forEach(r => {
            const key = r.fecha.substring(0, 7);
            if (!map[key]) map[key] = [];
            map[key].push(r);
        });
        const grupos: MesGroup[] = Object.keys(map)
            .sort((a, b) => b.localeCompare(a))
            .map(key => ({
                key,
                label: format(parseISO(key + '-15'), 'MMMM yyyy', { locale: es }),
                totalMm: parseFloat(map[key].reduce((s, r) => s + r.milimetros, 0).toFixed(1)),
                registros: map[key].sort((a, b) => b.fecha.localeCompare(a.fecha)),
                open: key === getLocalIsoDate().substring(0, 7),
            }));
        setMesGroups(grupos);
    }, [registros, anoSeleccionado]);

    const toggleMes = (key: string) => {
        setMesGroups(prev => prev.map(g => g.key === key ? { ...g, open: !g.open } : g));
    };

    return (
        <div className="card rainfall-history-card">
            {/* Controles de la tabla */}
            <div className="rainfall-history-header">
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={18} color="var(--primary-light)" aria-hidden="true" />
                    Historial de Registros
                </h3>
                <select
                    aria-label="Año del historial de lluvias"
                    value={anoSeleccionado}
                    onChange={e => onChangeAno(Number(e.target.value))}
                    className="rainfall-year-select"
                >
                    {anosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            {mesGroups.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hay registros para el año {anoSeleccionado}.
                </div>
            ) : (
                mesGroups.map(grupo => {
                    const mesSinAno = grupo.label.replace(/\s+\d{4}$/, '');
                    const etiquetaRegistros = grupo.registros.length === 1 ? 'registro' : 'registros';
                    return (
                        <div key={grupo.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            {/* Cabecera del mes */}
                            <button
                                type="button"
                                aria-expanded={grupo.open}
                                aria-label={`${grupo.label}, ${grupo.registros.length} ${etiquetaRegistros}, total ${grupo.totalMm} milímetros`}
                                onClick={() => toggleMes(grupo.key)}
                                className="rainfall-month-btn"
                            >
                                <span className="rainfall-month-name">
                                    {mesSinAno}
                                    <span className="rainfall-month-year"> {anoSeleccionado}</span>
                                </span>
                                <span className="rainfall-month-count">
                                    {grupo.registros.length}
                                    <span className="rainfall-month-count-full"> {etiquetaRegistros}</span>
                                    <span className="rainfall-month-count-short" aria-hidden="true"> reg.</span>
                                </span>
                                <span className="rainfall-month-total">{grupo.totalMm} mm</span>
                                {grupo.open
                                    ? <ChevronUp size={16} className="rainfall-month-chevron" aria-hidden="true" />
                                    : <ChevronDown size={16} className="rainfall-month-chevron" aria-hidden="true" />}
                            </button>

                            {/* Registros del mes */}
                            {grupo.open && (
                                <div
                                    tabIndex={0}
                                    role="region"
                                    aria-label={`Registros de lluvia de ${grupo.label}`}
                                    className="rainfall-table-wrapper"
                                >
                                    <table className="rainfall-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">Fecha</th>
                                                <th scope="col">Lectura Pluviómetro</th>
                                                <th scope="col">Lluvia Neta</th>
                                                <th scope="col">Intensidad</th>
                                                <th scope="col">Notas</th>
                                                <th scope="col"><span className="rainfall-sr-only">Acciones</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {grupo.registros.map(r => {
                                                const intensidad = clasificarIntensidad(r.milimetros, perfil.umbralRegistroMm, perfil.umbralEfectivoMm);
                                                const detalles = r.detalles || [];
                                                const esPromedioMulti = filtroPluviometro === 'todos' && detalles.length > 1;
                                                return (
                                                    <tr key={r.id}>
                                                        <th scope="row" className="rainfall-date-cell">
                                                            <div className="rainfall-date-inner">
                                                                <Calendar size={14} color="var(--primary-light)" aria-hidden="true" />
                                                                <span>
                                                                    {format(parseISO(r.fecha + 'T12:00:00'), 'dd MMM', { locale: es })}
                                                                </span>
                                                            </div>
                                                        </th>
                                                        <td data-label="Lectura" style={{ color: 'var(--text-muted)' }}>
                                                            {esPromedioMulti ? (
                                                                <div className="rainfall-pluv-chips">
                                                                    {detalles.map((d, idx) => {
                                                                        const pluvNombre = d.id_pluviometro ? (pluviometrosMap.get(d.id_pluviometro)?.nombre || 'Estación') : 'General';
                                                                        return (
                                                                            <span key={d.id || idx} className="rainfall-pluv-chip">
                                                                                <span>{pluvNombre}: <strong>{d.milimetros} mm</strong></span>
                                                                                {isAdminOrCowboy && d.id && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => onRequestEliminar(d.id!, pluvNombre)}
                                                                                        title={`Eliminar lectura de ${pluvNombre}`}
                                                                                        aria-label={`Eliminar lectura de ${pluvNombre}`}
                                                                                        className="rainfall-pluv-chip-del"
                                                                                    >
                                                                                        ✕
                                                                                    </button>
                                                                                )}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <span>{r.lectura_acumulada ? `${r.lectura_acumulada} mm` : '—'}</span>
                                                                    {esMultiPluviometro && filtroPluviometro === 'todos' && (
                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                            📍 {r.id_pluviometro ? (pluviometrosMap.get(r.id_pluviometro)?.nombre || 'Estación') : 'Registro general'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td data-label="Lluvia neta">
                                                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--info)' }}>
                                                                {r.milimetros > 0 ? '+' : ''}{r.milimetros}
                                                            </span>
                                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: '4px' }}>mm</span>
                                                            {esPromedioMulti && (
                                                                <div style={{ fontSize: '0.72rem', color: 'var(--info)' }}>
                                                                    Prom. ({detalles.length} est.)
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td data-label="Intensidad">
                                                            <span style={{
                                                                padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
                                                                background: intensidad.bg, border: `1px solid ${intensidad.border}`, color: intensidad.text,
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {intensidad.emoji} {intensidad.label}
                                                            </span>
                                                        </td>
                                                        <td data-label="Notas" className="rainfall-notes-cell">
                                                            {r.notas ? `"${r.notas}"` : '—'}
                                                        </td>
                                                        <td className="rainfall-actions-cell">
                                                            {isAdminOrCowboy && (
                                                                <div className="rainfall-row-actions">
                                                                    {pluviometrosActivosCount >= 1 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => onEditDate(r.fecha)}
                                                                            className="rainfall-icon-btn rainfall-icon-btn--edit"
                                                                            title="Completar o editar lecturas de este día"
                                                                            aria-label={`Editar lecturas del ${r.fecha}`}
                                                                        >
                                                                            <Pencil size={16} aria-hidden="true" />
                                                                            <span className="rainfall-btn-mobile-label">Editar</span>
                                                                        </button>
                                                                    )}
                                                                    {!esPromedioMulti && detalles[0]?.id && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => onRequestEliminar(detalles[0].id!)}
                                                                            className="rainfall-icon-btn rainfall-icon-btn--delete"
                                                                            title="Eliminar registro"
                                                                            aria-label={`Eliminar registro del ${r.fecha}`}
                                                                        >
                                                                            <Trash2 size={16} aria-hidden="true" />
                                                                            <span className="rainfall-btn-mobile-label">Eliminar</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
