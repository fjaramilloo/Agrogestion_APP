import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Briefcase, Users, Truck, ShoppingCart, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';

type ContactTable = 'propietarios' | 'proveedores' | 'compradores';

interface ContactItem {
    id: string;
    nombre: string;
}

const CONTACT_META: Record<ContactTable, { singular: string; articleLower: string; duplicateMsg: string }> = {
    propietarios: {
        singular: 'propietario',
        articleLower: 'Propietario',
        duplicateMsg: 'Ya existe un propietario con ese nombre.'
    },
    proveedores: {
        singular: 'proveedor',
        articleLower: 'Proveedor',
        duplicateMsg: 'Ya existe un proveedor con ese nombre.'
    },
    compradores: {
        singular: 'comprador',
        articleLower: 'Comprador',
        duplicateMsg: 'Ya existe un comprador con ese nombre.'
    }
};

interface SettingsBusinessListsSectionProps {
    fincaId: string | null;
    loading: boolean;
    onSetLoading: (val: boolean) => void;
    renderInlineStatus: (sectionKey: string) => ReactNode;
    onFeedback: (section: string, type: 'success' | 'error', text: string) => void;
    onClearInlineStatus: () => void;
}

export default function SettingsBusinessListsSection({
    fincaId,
    loading,
    onSetLoading,
    renderInlineStatus,
    onFeedback,
    onClearInlineStatus
}: SettingsBusinessListsSectionProps) {
    const { confirmAction } = useFeedback();
    const [propietarios, setPropietarios] = useState<ContactItem[]>([]);
    const [nuevoPropietario, setNuevoPropietario] = useState('');
    const [proveedores, setProveedores] = useState<ContactItem[]>([]);
    const [nuevoProveedor, setNuevoProveedor] = useState('');
    const [compradores, setCompradores] = useState<ContactItem[]>([]);
    const [nuevoComprador, setNuevoComprador] = useState('');

    const fetchTable = useCallback(async (table: ContactTable) => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from(table)
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');
        if (error || !data) return;
        if (table === 'propietarios') setPropietarios(data);
        else if (table === 'proveedores') setProveedores(data);
        else setCompradores(data);
    }, [fincaId]);

    useEffect(() => {
        void fetchTable('propietarios');
        void fetchTable('proveedores');
        void fetchTable('compradores');
    }, [fetchTable]);

    const addContact = async (table: ContactTable, value: string, clearFn: (v: string) => void, e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !value.trim()) return;
        const meta = CONTACT_META[table];
        onClearInlineStatus();
        onSetLoading(true);
        try {
            const { error } = await supabase
                .from(table)
                .insert({ id_finca: fincaId, nombre: value.trim() });
            if (error) throw error;
            clearFn('');
            void fetchTable(table);
            onFeedback('contactosNegocio', 'success', `${meta.articleLower} agregado correctamente.`);
        } catch (err: any) {
            onFeedback('contactosNegocio', 'error', `Error al agregar ${meta.singular}: ` + (err.code === '23505' ? meta.duplicateMsg : err.message));
        } finally {
            onSetLoading(false);
        }
    };

    const removeContact = async (table: ContactTable, id: string, nombre?: string) => {
        const meta = CONTACT_META[table];
        const confirmed = await confirmAction(
            nombre
                ? `Se eliminará "${nombre}" de la lista de ${table === 'propietarios' ? 'propietarios de la finca' : table}.`
                : `¿Está seguro de eliminar este ${meta.singular}?`,
            {
                title: `¿Eliminar ${meta.singular}?`,
                confirmLabel: 'Eliminar',
                cancelLabel: 'Cancelar',
                destructive: true,
            }
        );
        if (!confirmed) return;
        onClearInlineStatus();
        onSetLoading(true);
        try {
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) throw error;
            void fetchTable(table);
            onFeedback('contactosNegocio', 'success', `${meta.articleLower} eliminado.`);
        } catch (err: any) {
            onFeedback('contactosNegocio', 'error', 'Error al eliminar: ' + err.message);
        } finally {
            onSetLoading(false);
        }
    };

    return (
        <section id="settings-panel-contactosNegocio" aria-labelledby="settings-heading-negocios" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <h2 id="settings-heading-negocios" className="settings-section-heading">
                <Briefcase size={20} color="var(--primary)" aria-hidden="true" /> Contactos de Negocios
            </h2>
            {renderInlineStatus('contactosNegocio')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                <div>
                    <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16} aria-hidden="true" /> Propietarios</h3>
                    <form onSubmit={(e) => addContact('propietarios', nuevoPropietario, setNuevoPropietario, e)} className="settings-inline-add-form">
                        <label htmlFor="settings-nuevo-propietario" className="settings-visually-hidden">Nombre de nuevo propietario</label>
                        <input id="settings-nuevo-propietario" name="nuevo_propietario" type="text" enterKeyHint="done" placeholder="Nuevo Propietario" value={nuevoPropietario} onChange={e => setNuevoPropietario(e.target.value)} />
                        <button type="submit" className="settings-inline-add-btn" disabled={loading} aria-label="Agregar propietario">
                            <Plus size={20} aria-hidden="true" />
                        </button>
                    </form>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: '10px' }}>
                        {propietarios.map(p => (
                            <div key={p.id} className="settings-contact-chip">
                                <span className="settings-contact-name">{p.nombre}</span>
                                <button
                                    type="button"
                                    className="settings-icon-danger-btn"
                                    onClick={() => removeContact('propietarios', p.id, p.nombre)}
                                    aria-label={`Eliminar propietario ${p.nombre}`}
                                >
                                    <Trash2 size={18} aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="settings-form-grid-wide" style={{ gap: '24px' }}>
                    <div>
                        <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Truck size={16} aria-hidden="true" /> Proveedores</h3>
                        <form onSubmit={(e) => addContact('proveedores', nuevoProveedor, setNuevoProveedor, e)} className="settings-inline-add-form">
                            <label htmlFor="settings-nuevo-proveedor" className="settings-visually-hidden">Nombre de nuevo proveedor</label>
                            <input id="settings-nuevo-proveedor" name="nuevo_proveedor" type="text" enterKeyHint="done" placeholder="Nuevo Proveedor" value={nuevoProveedor} onChange={e => setNuevoProveedor(e.target.value)} />
                            <button type="submit" className="settings-inline-add-btn" disabled={loading} aria-label="Agregar proveedor">
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        </form>
                        {proveedores.map(p => (
                            <div key={p.id} className="settings-contact-list-row">
                                <span className="settings-contact-name">{p.nombre}</span>
                                <button
                                    type="button"
                                    className="settings-icon-danger-btn"
                                    onClick={() => removeContact('proveedores', p.id, p.nombre)}
                                    aria-label={`Eliminar proveedor ${p.nombre}`}
                                >
                                    <Trash2 size={18} aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div>
                        <h3 style={{ color: 'var(--primary-light)', marginTop: 0, marginBottom: '12px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}><ShoppingCart size={16} aria-hidden="true" /> Compradores</h3>
                        <form onSubmit={(e) => addContact('compradores', nuevoComprador, setNuevoComprador, e)} className="settings-inline-add-form">
                            <label htmlFor="settings-nuevo-comprador" className="settings-visually-hidden">Nombre de nuevo comprador</label>
                            <input id="settings-nuevo-comprador" name="nuevo_comprador" type="text" enterKeyHint="done" placeholder="Nuevo Comprador" value={nuevoComprador} onChange={e => setNuevoComprador(e.target.value)} />
                            <button type="submit" className="settings-inline-add-btn" disabled={loading} aria-label="Agregar comprador">
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        </form>
                        {compradores.map(c => (
                            <div key={c.id} className="settings-contact-list-row">
                                <span className="settings-contact-name">{c.nombre}</span>
                                <button
                                    type="button"
                                    className="settings-icon-danger-btn"
                                    onClick={() => removeContact('compradores', c.id, c.nombre)}
                                    aria-label={`Eliminar comprador ${c.nombre}`}
                                >
                                    <Trash2 size={18} aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
