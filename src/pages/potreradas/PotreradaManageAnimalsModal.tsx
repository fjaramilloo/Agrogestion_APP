import { useEffect, useState } from 'react';
import { Users, Search, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { getLocalIsoDate } from '../../utils/dateUtils';
import { getActivePotreroIdForPotrerada } from '../../utils/potreroHelpers';
import type { AnimalPotrero, Potrerada } from './types';

interface PotreradaManageAnimalsModalProps {
    managingPotrerada: Potrerada | null;
    animalesFinca: AnimalPotrero[];
    isMobile: boolean;
    isBloqueado: boolean;
    onShowUpsell: () => void;
    onClose: () => void;
    onRefresh: () => Promise<void>;
}

export default function PotreradaManageAnimalsModal({
    managingPotrerada,
    animalesFinca,
    isMobile,
    isBloqueado,
    onShowUpsell,
    onClose,
    onRefresh
}: PotreradaManageAnimalsModalProps) {
    const { showAlert } = useFeedback();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchTermEnLote, setSearchTermEnLote] = useState('');
    const [filterPropietario, setFilterPropietario] = useState('');
    const [filterPotreradaActual, setFilterPotreradaActual] = useState('');
    const [updatingAnimal, setUpdatingAnimal] = useState<string | null>(null);
    const [manageTab, setManageTab] = useState<'en-lote' | 'agregar'>('en-lote');

    useEffect(() => {
        if (managingPotrerada) {
            setManageTab('en-lote');
            setSearchTerm('');
            setSearchTermEnLote('');
            setFilterPropietario('');
            setFilterPotreradaActual('');
        }
    }, [managingPotrerada?.id]);

    if (!managingPotrerada) return null;

    const handleAddAnimal = async (animalId: string) => {
        if (isBloqueado) {
            onShowUpsell();
            return;
        }
        setUpdatingAnimal(animalId);
        try {
            const animalObj = animalesFinca.find(a => a.id === animalId);
            const targetPotreroId = await getActivePotreroIdForPotrerada(supabase, managingPotrerada.id);
            const etapaLote = managingPotrerada.etapa === 'cría' ? 'cria' : managingPotrerada.etapa;
            const updatePayload: any = {
                id_potrerada: managingPotrerada.id,
                id_potrero_actual: targetPotreroId,
                etapa: etapaLote,
                ok_ceba: false
            };
            if (etapaLote === 'ceba') {
                updatePayload.fecha_ingreso_ceba = getLocalIsoDate();
                if (animalObj?.pesoActual && animalObj.pesoActual > 0) {
                    updatePayload.peso_ingreso_ceba = Math.round(animalObj.pesoActual);
                }
            } else {
                updatePayload.fecha_ingreso_ceba = null;
                updatePayload.peso_ingreso_ceba = null;
            }
            const { error } = await supabase
                .from('animales')
                .update(updatePayload)
                .eq('id', animalId);

            if (error) throw error;
            await onRefresh();
        } catch (error: any) {
            await showAlert('Error al agregar animal: ' + error.message, { title: 'Error', variant: 'error' });
        } finally {
            setUpdatingAnimal(null);
        }
    };

    const handleRemoveAnimal = async (animalId: string) => {
        if (isBloqueado) {
            onShowUpsell();
            return;
        }
        setUpdatingAnimal(animalId);
        try {
            const { error } = await supabase
                .from('animales')
                .update({ id_potrerada: null, id_potrero_actual: null })
                .eq('id', animalId);

            if (error) throw error;
            await onRefresh();
        } catch (error: any) {
            await showAlert('Error al eliminar animal: ' + error.message, { title: 'Error', variant: 'error' });
        } finally {
            setUpdatingAnimal(null);
        }
    };

    const filteredAnimalesFinca = animalesFinca.filter(a => {
        const matchesSearch = a.numero_chapeta.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.nombre_propietario.toLowerCase().includes(searchTerm.toLowerCase());
        const isNotAlreadyInThisPot = a.id_potrerada !== managingPotrerada.id;
        const isActivo = a.estado === 'activo';
        const matchesPropietario = !filterPropietario || a.nombre_propietario === filterPropietario;
        const matchesPotrerada = !filterPotreradaActual ||
            (filterPotreradaActual === '__sin_lote__' ? !a.id_potrerada : a.potreradaNombre === filterPotreradaActual);
        return matchesSearch && isNotAlreadyInThisPot && isActivo && matchesPropietario && matchesPotrerada;
    });

    const propietariosOptions = [...new Set(
        animalesFinca.filter(a => a.estado === 'activo' && a.id_potrerada !== managingPotrerada.id)
            .map(a => a.nombre_propietario).filter(Boolean)
    )].sort();

    const potreradasOptions = [...new Set(
        animalesFinca.filter(a => a.estado === 'activo' && a.id_potrerada !== managingPotrerada.id)
            .map(a => a.potreradaNombre || '')
    )].sort();

    const animalesEnLoteCount = animalesFinca.filter(a => a.id_potrerada === managingPotrerada.id).length;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card modal-content" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                <div className="potreradas-modal-header">
                    <div className="potreradas-modal-header-top" style={{ marginBottom: '6px' }}>
                        <h2 style={{ margin: 0, color: 'var(--primary-light)', fontSize: isMobile ? '1.15rem' : '1.4rem' }}>
                            Gestionar: {managingPotrerada.nombre}
                        </h2>
                        <button type="button" aria-label="Cerrar" onClick={onClose} className="btn-icon" style={{ width: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                            <X size={20} aria-hidden="true" />
                        </button>
                    </div>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>
                        {managingPotrerada.etapa.toUpperCase()} | {animalesEnLoteCount} animales
                    </p>
                </div>

                {isMobile && (
                    <div role="tablist" aria-label="Gestionar animales del lote" className="potreradas-tablist">
                        <button
                            type="button"
                            role="tab"
                            id="potreradas-tab-en-lote"
                            aria-selected={manageTab === 'en-lote'}
                            className="potreradas-tab-btn"
                            onClick={() => setManageTab('en-lote')}
                        >
                            En este lote ({animalesEnLoteCount})
                        </button>
                        <button
                            type="button"
                            role="tab"
                            id="potreradas-tab-agregar"
                            aria-selected={manageTab === 'agregar'}
                            className="potreradas-tab-btn"
                            onClick={() => setManageTab('agregar')}
                        >
                            Agregar otros ({filteredAnimalesFinca.length})
                        </button>
                    </div>
                )}

                <div className="responsive-grid" style={{ flex: 1, gap: '1px', background: 'var(--border-subtle)', overflow: 'hidden', minHeight: 0, display: isMobile ? 'flex' : undefined, flexDirection: isMobile ? 'column' : undefined }}>
                    <div
                        className="potreradas-manage-panel"
                        role={isMobile ? 'tabpanel' : undefined}
                        aria-labelledby={isMobile ? 'potreradas-tab-en-lote' : undefined}
                        hidden={isMobile && manageTab !== 'en-lote'}
                        style={{ background: 'var(--bg-dark-paper)', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}
                    >
                        {!isMobile && (
                            <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={16} color="var(--primary-light)" aria-hidden="true" /> En este lote
                            </h3>
                        )}

                        <search style={{ position: 'relative', marginBottom: '12px', display: 'block' }} role="search">
                            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="search"
                                aria-label="Buscar animales en este lote"
                                placeholder="Buscar en lote..."
                                value={searchTermEnLote}
                                onChange={e => setSearchTermEnLote(e.target.value)}
                                className="potreradas-modal-search-input"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                style={{ padding: '8px 36px 8px 32px', fontSize: isMobile ? '1rem' : '0.85rem', marginBottom: 0 }}
                            />
                            {searchTermEnLote && (
                                <button
                                    type="button"
                                    className="potreradas-clear-btn"
                                    aria-label="Limpiar búsqueda en lote"
                                    onClick={() => setSearchTermEnLote('')}
                                >
                                    <X size={15} aria-hidden="true" />
                                </button>
                            )}
                        </search>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {(() => {
                                const filtrados = animalesFinca.filter(a =>
                                    a.id_potrerada === managingPotrerada.id &&
                                    (a.numero_chapeta.toLowerCase().includes(searchTermEnLote.toLowerCase()) ||
                                        a.nombre_propietario.toLowerCase().includes(searchTermEnLote.toLowerCase()))
                                );

                                if (filtrados.length === 0) {
                                    return (
                                        <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border-strong)', borderRadius: '12px' }}>
                                            {searchTermEnLote ? 'No se encontraron resultados' : 'Vacío'}
                                        </div>
                                    );
                                }

                                return filtrados.map(a => {
                                    const esVendido = a.estado === 'vendido';
                                    return (
                                        <div key={a.id} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', background: esVendido ? 'var(--warning-soft-bg)' : 'var(--surface-subtle)', opacity: esVendido ? 0.78 : 1 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem', textDecoration: esVendido ? 'line-through' : 'none', color: esVendido ? 'var(--text-muted)' : 'inherit' }}>#{a.numero_chapeta}</div>
                                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre_propietario}</div>
                                                {esVendido && (
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--warning)', background: 'var(--warning-soft-bg)', padding: '1px 5px', borderRadius: '6px', display: 'inline-block', marginTop: '2px' }}>VENDIDO</div>
                                                )}
                                            </div>
                                            {!esVendido && (
                                                <button
                                                    type="button"
                                                    disabled={updatingAnimal === a.id}
                                                    onClick={() => handleRemoveAnimal(a.id)}
                                                    aria-label={`Quitar animal #${a.numero_chapeta} del lote`}
                                                    className="btn-icon potreradas-manage-action-btn"
                                                    style={{ color: 'var(--error)', padding: '6px', flexShrink: 0 }}
                                                >
                                                    {updatingAnimal === a.id ? '...' : <Trash2 size={16} aria-hidden="true" />}
                                                </button>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    <div
                        className="potreradas-manage-panel"
                        role={isMobile ? 'tabpanel' : undefined}
                        aria-labelledby={isMobile ? 'potreradas-tab-agregar' : undefined}
                        hidden={isMobile && manageTab !== 'agregar'}
                        style={{ background: 'var(--bg-dark-paper)', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}
                    >
                        {!isMobile && (
                            <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Plus size={16} color="var(--success)" aria-hidden="true" /> Agregar Otros
                            </h3>
                        )}

                        <search style={{ position: 'relative', marginBottom: '8px', display: 'block' }} role="search">
                            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="search"
                                aria-label="Buscar animales para agregar al lote"
                                placeholder="Buscar por chapeta o marca..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="potreradas-modal-search-input"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                style={{ padding: '8px 36px 8px 32px', fontSize: isMobile ? '1rem' : '0.85rem', marginBottom: 0 }}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    className="potreradas-clear-btn"
                                    aria-label="Limpiar búsqueda de animales"
                                    onClick={() => setSearchTerm('')}
                                >
                                    <X size={15} aria-hidden="true" />
                                </button>
                            )}
                        </search>

                        <div className="potreradas-manage-filters">
                            <select
                                aria-label="Filtrar por propietario"
                                value={filterPropietario}
                                onChange={e => setFilterPropietario(e.target.value)}
                                className="potreradas-manage-select"
                                style={{ color: filterPropietario ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <option value="">Todos propietarios</option>
                                {propietariosOptions.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <select
                                aria-label="Filtrar por potrerada actual"
                                value={filterPotreradaActual}
                                onChange={e => setFilterPotreradaActual(e.target.value)}
                                className="potreradas-manage-select"
                                style={{ color: filterPotreradaActual ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                <option value="">Todas potreradas</option>
                                <option value="__sin_lote__">Sin lote</option>
                                {potreradasOptions.filter(Boolean).map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredAnimalesFinca.map(a => (
                                <div key={a.id} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>#{a.numero_chapeta}</div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {a.nombre_propietario}
                                        </div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 'bold', marginTop: '2px', color: a.id_potrerada ? 'var(--primary-light)' : 'var(--text-muted)' }}>
                                            {a.id_potrerada ? `Lote: ${a.potreradaNombre}` : 'Sin lote'}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={updatingAnimal === a.id}
                                        onClick={() => handleAddAnimal(a.id)}
                                        aria-label={`Agregar animal #${a.numero_chapeta} al lote`}
                                        className="btn-icon potreradas-manage-action-btn"
                                        style={{ color: 'var(--success)', padding: '6px', flexShrink: 0 }}
                                    >
                                        {updatingAnimal === a.id ? '...' : <Plus size={16} aria-hidden="true" />}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="potreradas-modal-footer">
                    <button type="button" onClick={onClose} className="potreradas-btn-close-footer">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
