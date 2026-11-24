import { useState } from 'react';
import { Users, Search, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';
import type { Potrerada, PotreradaDetailData } from './types';

interface PotreradaMoveAnimalsModalProps {
    detailData: PotreradaDetailData;
    potreradas: Potrerada[];
    isMobile: boolean;
    isBloqueado: boolean;
    onShowUpsell: () => void;
    onClose: () => void;
    onMoved: () => Promise<void>;
}

export default function PotreradaMoveAnimalsModal({
    detailData,
    potreradas,
    isMobile,
    isBloqueado,
    onShowUpsell,
    onClose,
    onMoved
}: PotreradaMoveAnimalsModalProps) {
    const { showAlert } = useFeedback();
    const [selectedAnimalsToMove, setSelectedAnimalsToMove] = useState<Set<string>>(new Set());
    const [targetPotreradaId, setTargetPotreradaId] = useState('');
    const [movingAnimals, setMovingAnimals] = useState(false);
    const [searchMoveAnimals, setSearchMoveAnimals] = useState('');
    const [moveDate, setMoveDate] = useState(getLocalIsoDate());

    const handleToggleAnimalMove = (animalId: string) => {
        setSelectedAnimalsToMove(prev => {
            const next = new Set(prev);
            if (next.has(animalId)) next.delete(animalId);
            else next.add(animalId);
            return next;
        });
    };

    const handleSelectAllAnimals = () => {
        const term = searchMoveAnimals.toLowerCase().trim();
        const visibleAnimals = detailData.animales.filter(a =>
            (!a.estado || a.estado === 'activo') && (
                !term ||
                a.numero_chapeta.toLowerCase().includes(term) ||
                (a.nombre_propietario || '').toLowerCase().includes(term)
            )
        );
        const allVisibleSelected = visibleAnimals.every(a => selectedAnimalsToMove.has(a.id));
        setSelectedAnimalsToMove(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleAnimals.forEach(a => next.delete(a.id));
            } else {
                visibleAnimals.forEach(a => next.add(a.id));
            }
            return next;
        });
    };

    const handleConfirmMoveAnimals = async () => {
        if (isBloqueado) {
            onShowUpsell();
            return;
        }
        if (selectedAnimalsToMove.size === 0 || !targetPotreradaId) return;
        const targetPotCheck = potreradas.find(p => p.id === targetPotreradaId);
        if (targetPotCheck?.etapa === 'ceba' && detailData.potrerada.etapa !== 'ceba') {
            const dateError = getGanadoDateError(moveDate, 'La fecha de movimiento');
            if (dateError) {
                await showAlert(dateError, { title: 'Dato inválido', variant: 'warning' });
                return;
            }
        }
        setMovingAnimals(true);
        try {
            const ids = Array.from(selectedAnimalsToMove);
            const targetPot = potreradas.find(p => p.id === targetPotreradaId);

            if (targetPot) {
                const updates = ids.map(id => {
                    const animal = detailData.animales.find(a => a.id === id);
                    const payload: any = {
                        id_potrerada: targetPotreradaId,
                        etapa: targetPot.etapa
                    };

                    if (targetPot.etapa === 'ceba' && detailData.potrerada.etapa !== 'ceba') {
                        payload.fecha_ingreso_ceba = moveDate;
                        payload.peso_ingreso_ceba = animal?.pesoActual || animal?.peso_compra || animal?.peso_ingreso || null;
                    }

                    return supabase.from('animales').update(payload).eq('id', id);
                });

                const results = await Promise.all(updates);
                const errors = results.filter(r => r.error);
                if (errors.length > 0) throw errors[0].error;
            } else {
                const { error } = await supabase
                    .from('animales')
                    .update({ id_potrerada: targetPotreradaId })
                    .in('id', ids);
                if (error) throw error;
            }

            await onMoved();
        } catch (err) {
            console.error('Error moviendo animales:', err);
            await showAlert('Ocurrió un error al mover los animales. Intenta de nuevo.', { title: 'Error', variant: 'error' });
        } finally {
            setMovingAnimals(false);
        }
    };

    const stageLevels: Record<string, number> = { cría: 1, cria: 1, levante: 2, ceba: 3 };
    const currentLevel = stageLevels[detailData.potrerada.etapa.toLowerCase()] || 0;

    return (
        <div className="modal-overlay" onClick={() => { if (!movingAnimals) onClose(); }}>
            <div className="card modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
                <div className="potreradas-modal-header">
                    <div className="potreradas-modal-header-top">
                        <div>
                            <h2 style={{ margin: '0 0 4px 0', color: 'var(--secondary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={20} aria-hidden="true" /> Mover Animales de Potrerada
                            </h2>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                Desde: <strong style={{ color: 'var(--text)' }}>{detailData.potrerada.nombre}</strong>
                            </p>
                        </div>
                        <button type="button" aria-label="Cerrar" onClick={onClose} className="btn-icon" disabled={movingAnimals}>
                            <X size={20} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div style={{ padding: isMobile ? '12px 16px' : '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <label htmlFor="potreradas-move-target" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
                        Potrerada destino
                    </label>
                    <select
                        id="potreradas-move-target"
                        value={targetPotreradaId}
                        onChange={e => setTargetPotreradaId(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            marginBottom: 0,
                            background: 'var(--bg-input)',
                            border: `1px solid ${targetPotreradaId ? 'var(--secondary)' : 'var(--border-input)'}`,
                            borderRadius: '8px',
                            color: 'var(--text)',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                        }}
                    >
                        <option value="">— Seleccionar potrerada —</option>
                        {potreradas
                            .filter(p => {
                                if (p.id === detailData.potrerada.id) return false;
                                const targetLevel = stageLevels[p.etapa.toLowerCase()] || 0;
                                return targetLevel >= currentLevel;
                            })
                            .map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.nombre} ({p.etapa}) — {p.animalCount} animales
                                </option>
                            ))}
                    </select>
                </div>

                <div style={{ padding: isMobile ? '12px 16px' : '12px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <label htmlFor="potreradas-move-date" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
                        Fecha de movimiento
                    </label>
                    <input
                        id="potreradas-move-date"
                        type="date"
                        min={MIN_GANADO_DATE}
                        value={moveDate}
                        onChange={e => setMoveDate(e.target.value)}
                        style={{
                            width: '100%',
                            marginBottom: 0,
                            padding: '10px 14px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-input)',
                            borderRadius: '8px',
                            color: 'var(--text)',
                            fontSize: '0.9rem'
                        }}
                    />
                </div>

                <div style={{ padding: isMobile ? '12px 16px 4px' : '12px 24px 4px' }}>
                    <search style={{ position: 'relative', marginBottom: '10px', display: 'block' }} role="search">
                        <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            type="search"
                            aria-label="Buscar animal para mover"
                            placeholder="Buscar por chapeta o propietario..."
                            value={searchMoveAnimals}
                            onChange={e => setSearchMoveAnimals(e.target.value)}
                            className="potreradas-modal-search-input"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            style={{
                                width: '100%',
                                marginBottom: 0,
                                padding: '8px 36px 8px 32px',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-input)',
                                borderRadius: '8px',
                                color: 'var(--text)',
                                fontSize: isMobile ? '1rem' : '0.85rem',
                                boxSizing: 'border-box',
                            }}
                        />
                        {searchMoveAnimals && (
                            <button
                                type="button"
                                aria-label="Limpiar búsqueda"
                                onClick={() => setSearchMoveAnimals('')}
                                className="potreradas-clear-btn"
                            >
                                <X size={15} aria-hidden="true" />
                            </button>
                        )}
                    </search>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                            Animales ({selectedAnimalsToMove.size} seleccionados)
                        </span>
                        <button
                            type="button"
                            onClick={handleSelectAllAnimals}
                            className="potreradas-select-all-btn"
                            style={{
                                width: 'auto',
                                background: 'var(--secondary-soft-bg)',
                                border: '1px solid var(--secondary-soft-border)',
                                borderRadius: '6px',
                                color: 'var(--secondary)',
                                fontSize: '0.78rem',
                                padding: '4px 10px',
                                textTransform: 'none',
                                letterSpacing: 'normal',
                                fontWeight: '600',
                            }}
                        >
                            {selectedAnimalsToMove.size === detailData.animales.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        </button>
                    </div>
                </div>
                <div style={{ flex: 1, maxHeight: isMobile ? undefined : '280px', overflowY: 'auto', padding: isMobile ? '0 16px 12px' : '0 24px 16px' }}>
                    {detailData.animales.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '0.9rem' }}>
                            Esta potrerada no tiene animales.
                        </div>
                    ) : (() => {
                        const term = searchMoveAnimals.toLowerCase().trim();
                        const filtered = detailData.animales
                            .filter(a => !a.estado || a.estado === 'activo')
                            .slice()
                            .sort((a, b) => a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true }))
                            .filter(a =>
                                !term ||
                                a.numero_chapeta.toLowerCase().includes(term) ||
                                (a.nombre_propietario || '').toLowerCase().includes(term)
                            );
                        if (filtered.length === 0) return (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '0.85rem' }}>
                                Sin resultados para &quot;<strong>{searchMoveAnimals}</strong>&quot;
                            </div>
                        );
                        return filtered.map(animal => {
                            const checked = selectedAnimalsToMove.has(animal.id);
                            return (
                                <button
                                    type="button"
                                    key={animal.id}
                                    onClick={() => handleToggleAnimalMove(animal.id)}
                                    className="potreradas-move-row"
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        textTransform: 'none',
                                        letterSpacing: 'normal',
                                        fontWeight: '400',
                                        color: 'var(--text)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        marginBottom: '6px',
                                        borderRadius: '8px',
                                        background: checked ? 'var(--secondary-soft-bg)' : 'var(--surface-subtle)',
                                        border: `1px solid ${checked ? 'var(--secondary-soft-border)' : 'var(--border-subtle)'}`,
                                        boxShadow: 'none',
                                    }}
                                >
                                    <div style={{
                                        width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                                        background: checked ? '#fbbf24' : 'transparent',
                                        border: `2px solid ${checked ? '#fbbf24' : 'var(--border-strong)'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {checked && <span style={{ color: '#111812', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>#{animal.numero_chapeta}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{animal.nombre_propietario}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--primary-light)', fontWeight: '600' }}>
                                            {animal.pesoActual ? `${Math.round(animal.pesoActual)} kg` : '-'}
                                        </div>
                                    </div>
                                </button>
                            );
                        });
                    })()}
                </div>

                <div className="potreradas-modal-footer">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={movingAnimals}
                        className="potreradas-modal-cancel-btn"
                        style={{
                            width: 'auto',
                            borderRadius: '8px', padding: '9px 20px',
                            fontSize: '0.88rem',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirmMoveAnimals}
                        disabled={movingAnimals || selectedAnimalsToMove.size === 0 || !targetPotreradaId}
                        style={{
                            width: 'auto',
                            background: selectedAnimalsToMove.size > 0 && targetPotreradaId ? '#fbbf24' : 'var(--surface-subtle)',
                            border: selectedAnimalsToMove.size > 0 && targetPotreradaId ? 'none' : '1px solid var(--border-subtle)',
                            borderRadius: '8px', padding: '9px 20px',
                            color: selectedAnimalsToMove.size > 0 && targetPotreradaId ? '#111812' : 'var(--text-faint)',
                            cursor: selectedAnimalsToMove.size > 0 && targetPotreradaId ? 'pointer' : 'not-allowed',
                            fontSize: '0.88rem', fontWeight: '700',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                    >
                        {movingAnimals ? (
                            <><Loader2 size={15} className="spin" aria-hidden="true" /> Moviendo...</>
                        ) : (
                            <><Users size={15} aria-hidden="true" /> Mover {selectedAnimalsToMove.size > 0 ? `${selectedAnimalsToMove.size} animal${selectedAnimalsToMove.size !== 1 ? 'es' : ''}` : 'animales'}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
