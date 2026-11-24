import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { getLocalIsoDate, MIN_GANADO_DATE, getGanadoDateError } from '../../utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../../utils/decimalInput';
import { recalcularHistorialPesajesAnimal } from '../../utils/gananciaRecalculator';
import type { PotreradaOption, PropietarioOption } from './types';

interface InventoryCreateAnimalModalProps {
    fincaId: string | null;
    propietariosLista: PropietarioOption[];
    potreradasDisponibles: PotreradaOption[];
    onClose: () => void;
    onCreated: () => Promise<void> | void;
}

const createInitialAnimalState = () => ({
    numero_chapeta: '',
    nombre_propietario: '',
    especie: 'bovino',
    sexo: 'M',
    etapa: 'levante',
    peso_ingreso: '',
    fecha_ingreso: getLocalIsoDate(),
    id_potrerada: '',
    tipo_macho: 'toro'
});

export default function InventoryCreateAnimalModal({
    fincaId,
    propietariosLista,
    potreradasDisponibles,
    onClose,
    onCreated
}: InventoryCreateAnimalModalProps) {
    const { toast } = useFeedback();
    const [saving, setSaving] = useState(false);
    const [nuevoAnimal, setNuevoAnimal] = useState(createInitialAnimalState);
    const [nuevosPesajes, setNuevosPesajes] = useState<{ fecha: string; peso: string; etapa: string }[]>([]);
    const [msjErrorCrear, setMsjErrorCrear] = useState('');
    const [isChapetaTaken, setIsChapetaTaken] = useState(false);
    const [validatingChapeta, setValidatingChapeta] = useState(false);

    useEffect(() => {
        const checkChapeta = async () => {
            const chapetaTrim = nuevoAnimal.numero_chapeta.trim();
            if (!chapetaTrim || !fincaId) {
                setIsChapetaTaken(false);
                return;
            }
            setValidatingChapeta(true);
            const { data } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', chapetaTrim)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .maybeSingle();

            setIsChapetaTaken(!!data);
            setValidatingChapeta(false);
        };

        const timeoutId = setTimeout(checkChapeta, 500);
        return () => clearTimeout(timeoutId);
    }, [nuevoAnimal.numero_chapeta, fincaId]);

    const handleCrearAnimal = async () => {
        const chapetaTrim = nuevoAnimal.numero_chapeta.trim();
        const isFormValid = chapetaTrim && nuevoAnimal.peso_ingreso && nuevoAnimal.nombre_propietario && nuevoAnimal.especie && nuevoAnimal.sexo && nuevoAnimal.etapa && nuevoAnimal.fecha_ingreso && !isChapetaTaken;
        if (!fincaId || !isFormValid) return;
        setSaving(true);
        setMsjErrorCrear('');

        try {
            const fechaIngresoErr = getGanadoDateError(nuevoAnimal.fecha_ingreso, 'La fecha de ingreso');
            if (fechaIngresoErr) {
                throw new Error(fechaIngresoErr);
            }
            for (let i = 0; i < nuevosPesajes.length; i++) {
                if (nuevosPesajes[i].peso) {
                    const pFechaErr = getGanadoDateError(nuevosPesajes[i].fecha, `La fecha del pesaje adicional #${i + 1}`);
                    if (pFechaErr) throw new Error(pFechaErr);
                    const pNum = parseDecimalInput(nuevosPesajes[i].peso);
                    if (isNaN(pNum) || pNum <= 0) {
                        throw new Error(`El peso del pesaje adicional #${i + 1} debe ser mayor a cero.`);
                    }
                }
            }

            const pesoIngresoNum = Math.round(parseDecimalInput(nuevoAnimal.peso_ingreso));
            if (isNaN(pesoIngresoNum) || pesoIngresoNum <= 0) {
                throw new Error('Por favor ingrese un peso de ingreso numérico válido mayor a cero.');
            }

            const { data: exist } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', chapetaTrim)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .maybeSingle();

            if (exist) throw new Error(`El animal con chapeta #${chapetaTrim} ya existe en esta finca.`);

            const { data: animalInsertado, error: errAnimal } = await supabase
                .from('animales')
                .insert([{
                    id_finca: fincaId,
                    numero_chapeta: chapetaTrim,
                    nombre_propietario: nuevoAnimal.nombre_propietario || 'Finca',
                    especie: nuevoAnimal.especie,
                    sexo: nuevoAnimal.sexo,
                    etapa: nuevoAnimal.etapa,
                    peso_ingreso: pesoIngresoNum,
                    fecha_ingreso: nuevoAnimal.fecha_ingreso,
                    id_potrerada: nuevoAnimal.id_potrerada || null,
                    tipo_macho: nuevoAnimal.sexo === 'M' ? nuevoAnimal.tipo_macho.toLowerCase() : null,
                    estado: 'activo'
                }])
                .select()
                .single();

            if (errAnimal) throw errAnimal;

            if (animalInsertado && nuevosPesajes.length > 0) {
                const pesajesData = nuevosPesajes
                    .filter(p => p.fecha && p.peso && parseDecimalInput(p.peso) > 0)
                    .map(p => ({
                        id_animal: animalInsertado.id,
                        fecha: p.fecha,
                        peso: Math.round(parseDecimalInput(p.peso)),
                        etapa: p.etapa,
                        gdp_calculada: 0
                    }));

                if (pesajesData.length > 0) {
                    const { error: errPesajes } = await supabase
                        .from('registros_pesaje')
                        .insert(pesajesData);
                    if (errPesajes) throw errPesajes;
                    await recalcularHistorialPesajesAnimal(animalInsertado.id, supabase);
                }
            }

            await onCreated();
            onClose();
            toast('Animal creado exitosamente con su historial.', 'success');
        } catch (err: any) {
            setMsjErrorCrear(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="card inventory-modal-card" style={{ maxWidth: '600px', border: '1px solid var(--primary)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ color: 'var(--text-main)', margin: 0 }}>Crear Nuevo Animal</h2>
                    <button type="button" aria-label="Cerrar" onClick={onClose} className="btn-icon" style={{ width: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}><X aria-hidden="true" /></button>
                </div>

                {msjErrorCrear && (
                    <div role="alert" style={{ backgroundColor: 'var(--error-soft-bg)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
                        {msjErrorCrear}
                    </div>
                )}

                <div className="inventory-create-grid-2">
                    <div>
                        <label htmlFor="inv-new-chapeta">Número de Chapeta*</label>
                        <input id="inv-new-chapeta" type="text" value={nuevoAnimal.numero_chapeta} onChange={e => setNuevoAnimal({ ...nuevoAnimal, numero_chapeta: e.target.value })} placeholder="Ej: 1234" autoCorrect="off" autoCapitalize="characters" spellCheck={false} />
                        {validatingChapeta && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Validando...</span>}
                        {isChapetaTaken && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', display: 'block', marginTop: '4px' }}>Esta chapeta ya está en uso por un animal activo.</span>}
                    </div>
                    <div>
                        <label htmlFor="inv-new-prop">Propietario*</label>
                        <select
                            id="inv-new-prop"
                            value={nuevoAnimal.nombre_propietario}
                            onChange={e => setNuevoAnimal({ ...nuevoAnimal, nombre_propietario: e.target.value })}
                        >
                            <option value="">Seleccionar propietario...</option>
                            {propietariosLista.map(p => (
                                <option key={p.id} value={p.nombre}>{p.nombre}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="inventory-create-grid-3">
                    <div>
                        <label htmlFor="inv-new-especie">Especie*</label>
                        <select id="inv-new-especie" value={nuevoAnimal.especie} onChange={e => setNuevoAnimal({ ...nuevoAnimal, especie: e.target.value })}>
                            <option value="bovino">Bovino</option>
                            <option value="bufalino">Bufalino</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="inv-new-sexo">Sexo*</label>
                        <select id="inv-new-sexo" value={nuevoAnimal.sexo} onChange={e => setNuevoAnimal({ ...nuevoAnimal, sexo: e.target.value })}>
                            <option value="M">Macho</option>
                            <option value="H">Hembra</option>
                        </select>
                    </div>
                    {nuevoAnimal.sexo === 'M' && (
                        <div>
                            <label htmlFor="inv-new-tipo-macho">Tipo Macho*</label>
                            <select id="inv-new-tipo-macho" value={nuevoAnimal.tipo_macho} onChange={e => setNuevoAnimal({ ...nuevoAnimal, tipo_macho: e.target.value })}>
                                <option value="toro">Toro</option>
                                <option value="novillo">Novillo</option>
                            </select>
                        </div>
                    )}
                    <div>
                        <label htmlFor="inv-new-etapa">Etapa*</label>
                        <select id="inv-new-etapa" value={nuevoAnimal.etapa} onChange={e => setNuevoAnimal({ ...nuevoAnimal, etapa: e.target.value })}>
                            <option value="cria">Cría</option>
                            <option value="levante">Levante</option>
                            <option value="ceba">Ceba</option>
                        </select>
                    </div>
                </div>

                <div className="inventory-create-grid-2">
                    <div>
                        <label htmlFor="inv-new-peso">Peso Ingreso (kg)*</label>
                        <input id="inv-new-peso" type="text" inputMode="decimal" value={nuevoAnimal.peso_ingreso} onChange={e => setNuevoAnimal({ ...nuevoAnimal, peso_ingreso: sanitizeDecimalInput(e.target.value) })} placeholder="0" />
                    </div>
                    <div>
                        <label htmlFor="inv-new-fecha">Fecha Ingreso*</label>
                        <input id="inv-new-fecha" type="date" min={MIN_GANADO_DATE} value={nuevoAnimal.fecha_ingreso} onChange={e => setNuevoAnimal({ ...nuevoAnimal, fecha_ingreso: e.target.value })} />
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="inv-new-lote">Asignar a Lote (Opcional)</label>
                    <select
                        id="inv-new-lote"
                        value={nuevoAnimal.id_potrerada}
                        onChange={e => {
                            const selectedPotId = e.target.value;
                            const selectedPot = potreradasDisponibles.find(p => p.id === selectedPotId);
                            setNuevoAnimal({
                                ...nuevoAnimal,
                                id_potrerada: selectedPotId,
                                ...(selectedPot?.etapa === 'ceba' ? { etapa: 'ceba' } : {})
                            });
                        }}
                    >
                        <option value="">-- Sin Lote --</option>
                        {potreradasDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.etapa ? ` (${p.etapa.toUpperCase()})` : ''}</option>)}
                    </select>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary-light)' }}>Historial de Pesajes</h3>
                        <button
                            type="button"
                            className="inventory-btn-add-weighing"
                            onClick={() => setNuevosPesajes([...nuevosPesajes, { fecha: getLocalIsoDate(), peso: '', etapa: nuevoAnimal.etapa }])}
                        >
                            + Agregar Pesaje
                        </button>
                    </div>
                    {nuevosPesajes.map((p, idx) => (
                        <div key={idx} className="inventory-extra-weighing-row">
                            <div style={{ flex: 1.5 }}>
                                <label htmlFor={`inv-extra-date-${idx}`} style={{ fontSize: '0.72rem' }}>Fecha</label>
                                <input id={`inv-extra-date-${idx}`} type="date" min={MIN_GANADO_DATE} value={p.fecha} onChange={e => {
                                    const up = [...nuevosPesajes];
                                    up[idx].fecha = e.target.value;
                                    setNuevosPesajes(up);
                                }} style={{ marginBottom: 0 }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label htmlFor={`inv-extra-peso-${idx}`} style={{ fontSize: '0.72rem' }}>Peso (kg)</label>
                                <input id={`inv-extra-peso-${idx}`} type="text" inputMode="decimal" value={p.peso} onChange={e => {
                                    const up = [...nuevosPesajes];
                                    up[idx].peso = sanitizeDecimalInput(e.target.value);
                                    setNuevosPesajes(up);
                                }} style={{ marginBottom: 0 }} placeholder="0" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label htmlFor={`inv-extra-etapa-${idx}`} style={{ fontSize: '0.72rem' }}>Etapa</label>
                                <select id={`inv-extra-etapa-${idx}`} value={p.etapa} onChange={e => {
                                    const up = [...nuevosPesajes];
                                    up[idx].etapa = e.target.value;
                                    setNuevosPesajes(up);
                                }} style={{ marginBottom: 0, padding: '8px' }}>
                                    <option value="cria">Cría</option>
                                    <option value="levante">Levante</option>
                                    <option value="ceba">Ceba</option>
                                </select>
                            </div>
                            <button
                                type="button"
                                className="inventory-history-action-btn"
                                aria-label={`Eliminar pesaje adicional ${idx + 1}`}
                                onClick={() => setNuevosPesajes(nuevosPesajes.filter((_, i) => i !== idx))}
                                style={{ backgroundColor: 'var(--error-soft-bg)', border: '1px solid var(--error-soft-border)', color: 'var(--error)', padding: '8px', marginBottom: '2px' }}
                            >
                                <Trash2 size={18} aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                    {nuevosPesajes.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>No se han agregado pesajes adicionales.</p>}
                </div>

                <div className="inventory-modal-actions-row" style={{ display: 'flex', gap: '12px' }}>
                    <button type="button" className="inventory-btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                        CANCELAR
                    </button>
                    <button
                        type="button"
                        onClick={handleCrearAnimal}
                        style={{ flex: 2 }}
                        disabled={saving || !nuevoAnimal.numero_chapeta || !nuevoAnimal.peso_ingreso || !nuevoAnimal.nombre_propietario || !nuevoAnimal.especie || !nuevoAnimal.sexo || !nuevoAnimal.etapa || !nuevoAnimal.fecha_ingreso || isChapetaTaken}
                    >
                        {saving ? 'GUARDANDO...' : 'GUARDAR ANIMAL'}
                    </button>
                </div>
            </div>
        </div>
    );
}
