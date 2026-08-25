import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Save, PlusCircle, CheckCircle2, AlertTriangle, Pencil, Trash2, X, Check } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toDisplayValue, getUnidadLabel, getModoLabel } from '../utils/ganancia';

interface AnimalPreview {
    id: string;
    numero_chapeta: string;
    peso_ingreso: number;
    peso_compra?: number;
    fecha_ingreso: string;
    etapa: string;
    ultimo_peso?: number;
    fecha_ultimo_peso?: string;
    gmp?: number;
    ok_ceba?: boolean;
    sexo?: 'M' | 'H';
    tipo_macho?: 'novillo' | 'toro' | 'torete';
    fecha_castracion?: string | null;
    nombre_propietario?: string;
    potrerada_nombre?: string;
}

export default function Weighing() {
    const { fincaId, modoGanancia } = useAuth();
    const [chapeta, setChapeta] = useState('');
    const [animal, setAnimal] = useState<AnimalPreview | null>(null);
    const [nuevoPeso, setNuevoPeso] = useState('');
    const [fechaPesaje, setFechaPesaje] = useState(new Date().toISOString().split('T')[0]);
    const [castrarHoy, setCastrarHoy] = useState(false);

    // Estados para la creación
    const [animalNoEncontrado, setAnimalNoEncontrado] = useState(false);
    const [showCrearAnimal, setShowCrearAnimal] = useState(false);
    const [propietarioNuevo, setPropietarioNuevo] = useState('');
    const [fechaIngresoNueva, setFechaIngresoNueva] = useState(new Date().toISOString().split('T')[0]);
    const [pesoIngresoNuevo, setPesoIngresoNuevo] = useState('');

    // Lista de propietarios cargados desde la base de datos
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);

    // Peso umbral para marcar ok_ceba
    const [pesoEntradaCeba, setPesoEntradaCeba] = useState(380);
    // Bandera si el último pesaje guardado marcó ok_ceba
    const [marcadoCeba, setMarcadoCeba] = useState(false);

    const [loading, setLoading] = useState(false);
    const [msjError, setMsjError] = useState('');
    const [msjExito, setMsjExito] = useState('');
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);

    // --- Pesajes de Hoy (Corrección) ---
    const [pesajesHoy, setPesajesHoy] = useState<{ id: string; peso: number; fecha: string; numero_chapeta: string; nombre_propietario: string; potrerada_nombre: string }[]>([]);
    const [editingPesajeId, setEditingPesajeId] = useState<string | null>(null);
    const [editPeso, setEditPeso] = useState('');
    const [sortColHoy, setSortColHoy] = useState<'chapeta' | 'marca' | 'potrerada' | 'peso'>('chapeta');
    const [sortDirHoy, setSortDirHoy] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        if (!fincaId) return;
        const fetchConfig = async () => {
            const { data: config } = await supabase
                .from('configuracion_kpi')
                .select('peso_entrada_ceba, umbral_alto_gmp, umbral_medio_gmp')
                .eq('id_finca', fincaId)
                .single();
            if (config?.peso_entrada_ceba) setPesoEntradaCeba(config.peso_entrada_ceba);
            if (config?.umbral_alto_gmp) setUmbralAlto(config.umbral_alto_gmp);
            if (config?.umbral_medio_gmp) setUmbralMedio(config.umbral_medio_gmp);

            const { data } = await supabase
                .from('propietarios')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setPropietarios(data);
        };
        fetchConfig();
    }, [fincaId]);

    const fetchPesajesHoy = useCallback(async () => {
        if (!fincaId) return;
        const hoy = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('registros_pesaje')
            .select('id, peso, fecha, animales!inner(numero_chapeta, nombre_propietario, id_finca, id_potrerada)')
            .eq('animales.id_finca', fincaId)
            .eq('fecha', hoy)
            .order('id', { ascending: false })
            .limit(50);

        if (error) {
            console.error("Error fetching pesajes hoy:", error);
            return;
        }

        if (data) {
            const potreradasIds = [...new Set(data.map((p: any) => p.animales?.id_potrerada).filter(Boolean))];
            let potreradasMap: Record<string, string> = {};
            if (potreradasIds.length > 0) {
                const { data: pots } = await supabase
                    .from('potreradas')
                    .select('id, nombre')
                    .in('id', potreradasIds);
                if (pots) {
                    pots.forEach((pt: any) => potreradasMap[pt.id] = pt.nombre);
                }
            }

            setPesajesHoy(data.map((p: any) => ({
                id: p.id,
                peso: p.peso,
                fecha: p.fecha,
                numero_chapeta: p.animales?.numero_chapeta || '-',
                nombre_propietario: p.animales?.nombre_propietario || '-',
                potrerada_nombre: p.animales?.id_potrerada ? (potreradasMap[p.animales.id_potrerada] || 'Sin lote') : 'Sin lote'
            })));
        }
    }, [fincaId]);

    useEffect(() => {
        fetchPesajesHoy();
    }, [fetchPesajesHoy]);

    const buscarAnimal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !chapeta.trim()) return;

        setLoading(true);
        setMsjError('');
        setMsjExito('');
        setAnimal(null);
        setAnimalNoEncontrado(false);
        setShowCrearAnimal(false);
        setMarcadoCeba(false);
        setCastrarHoy(false);
        setFechaPesaje(new Date().toISOString().split('T')[0]);

        const { data, error } = await supabase
            .from('animales')
            .select('id, numero_chapeta, peso_ingreso, peso_compra, fecha_ingreso, etapa, ok_ceba, fecha_ingreso_ceba, peso_ingreso_ceba, sexo, tipo_macho, fecha_castracion, nombre_propietario, id_potrerada')
            .eq('id_finca', fincaId)
            .eq('numero_chapeta', chapeta.trim())
            .single();

        if (error || !data) {
            setAnimalNoEncontrado(true);
            setMsjError('Animal no encontrado. Puede revisar la chapeta o crear uno nuevo.');
        } else {
            // Buscar el último pesaje
            const { data: pesajes } = await supabase
                .from('registros_pesaje')
                .select('peso, fecha, gmp_calculada, gdp_calculada')
                .eq('id_animal', data.id)
                .order('fecha', { ascending: false });

            let gmp = 0;
            // Buscar la etapa de la potrerada por separado (evita que un join falle y oculte el animal)
            let potreradaEtapa: string | null = null;
            let potreradaNombre: string | null = null;
            if ((data as any).id_potrerada) {
                const { data: pot } = await supabase
                    .from('potreradas')
                    .select('etapa, nombre')
                    .eq('id', (data as any).id_potrerada)
                    .single();
                potreradaEtapa = pot?.etapa || null;
                potreradaNombre = pot?.nombre || null;
            }
            const etapaEfectiva: string = potreradaEtapa || data.etapa;

            // Usar peso de la etapa actual como base
            let pesoBase = data.peso_compra || data.peso_ingreso;
            let fechaBase = data.fecha_ingreso;
            if (etapaEfectiva === 'ceba') {
                pesoBase = data.peso_ingreso_ceba || pesoBase;
                fechaBase = data.fecha_ingreso_ceba || fechaBase;
            }

            let ultimoPeso = pesoBase;
            let fechaUltimoPeso = fechaBase;

            if (pesajes && pesajes.length > 0) {
                const ultimo = pesajes[0];
                ultimoPeso = ultimo.peso;
                fechaUltimoPeso = ultimo.fecha;

                if (ultimo.gmp_calculada !== null && ultimo.gmp_calculada !== undefined) {
                    gmp = ultimo.gmp_calculada;
                } else if (ultimo.gdp_calculada !== null && ultimo.gdp_calculada !== undefined) {
                    gmp = ultimo.gdp_calculada * 30;
                } else if (pesajes.length > 1) {
                    const penultimo = pesajes[1];
                    const diffDias = differenceInDays(new Date(ultimo.fecha), new Date(penultimo.fecha)) || 1;
                    gmp = ((ultimo.peso - penultimo.peso) / diffDias) * 30;
                } else {
                    const diffDias = differenceInDays(new Date(ultimo.fecha), new Date(fechaBase)) || 1;
                    gmp = ((ultimo.peso - pesoBase) / diffDias) * 30;
                }
            }

            setAnimal({
                ...data,
                etapa: etapaEfectiva,
                potrerada_nombre: potreradaNombre || undefined,
                ultimo_peso: ultimoPeso,
                fecha_ultimo_peso: fechaUltimoPeso,
                gmp: gmp
            });
        }
        setLoading(false);
    };

    const crearRegistroAnimal = async () => {
        if (!fincaId || !chapeta.trim() || !propietarioNuevo || !pesoIngresoNuevo) return;
        setLoading(true);
        setMsjError('');

        try {
            const pesoFloat = parseFloat(pesoIngresoNuevo);
            if (isNaN(pesoFloat) || pesoFloat <= 0) {
                throw new Error('El peso inicial debe ser mayor a 0');
            }

            const insertData = {
                id_finca: fincaId,
                numero_chapeta: chapeta.trim(),
                nombre_propietario: propietarioNuevo,
                especie: 'bovino',
                sexo: 'M',
                tipo_macho: 'toro',
                etapa: 'levante',
                fecha_ingreso: fechaIngresoNueva,
                peso_ingreso: pesoFloat,
                estado: 'activo'
            };

            const { data, error } = await supabase.from('animales').insert(insertData).select().single();

            if (error) throw error;

            setMsjExito(`¡Animal #${chapeta} creado exitosamente!`);

            setMsjExito(`¡Animal #${chapeta} creado exitosamente! Su peso inicial ha sido registrado.`);

            setAnimal({
                id: data.id,
                numero_chapeta: data.numero_chapeta,
                peso_ingreso: data.peso_ingreso,
                fecha_ingreso: data.fecha_ingreso,
                etapa: data.etapa,
                ultimo_peso: data.peso_ingreso,
                fecha_ultimo_peso: data.fecha_ingreso,
                gmp: 0
            });
            setAnimalNoEncontrado(false);
            setShowCrearAnimal(false);
            setNuevoPeso(pesoIngresoNuevo);

        } catch (err: any) {
            setMsjError(err.message || 'Error al crear el animal.');
        } finally {
            setLoading(false);
        }
    };

    const guardarPesaje = async () => {
        if (!animal || !fincaId || !nuevoPeso) return;
        setLoading(true);
        setMsjError('');
        setMarcadoCeba(false);

        try {
            const pesoFloat = parseFloat(nuevoPeso);
            if (isNaN(pesoFloat) || pesoFloat <= 0) {
                throw new Error('El peso debe ser un número mayor a 0');
            }

            let gdpCalculada = 0;
            if (animal.ultimo_peso && animal.fecha_ultimo_peso) {
                const fechaUltimo = animal.fecha_ultimo_peso.split('T')[0];
                
                if (fechaPesaje === fechaUltimo) {
                    throw new Error(`Este animal ya tiene un pesaje registrado para la fecha ${fechaPesaje}.`);
                }

                // Si es el mismo día, no calculamos ganancia para evitar errores de 0 GDP
                if (fechaPesaje !== fechaUltimo) {
                    const diffDias = differenceInDays(new Date(fechaPesaje + 'T12:00:00'), new Date(fechaUltimo + 'T12:00:00'));
                    if (diffDias > 0) {
                        gdpCalculada = (pesoFloat - animal.ultimo_peso) / diffDias;
                    }
                }
            }

            const { error } = await supabase.from('registros_pesaje').insert({
                id_animal: animal.id,
                peso: pesoFloat,
                fecha: fechaPesaje,
                etapa: animal.etapa,
                gdp_calculada: gdpCalculada
            });

            if (error) throw error;

            // Verificar si el peso supera el umbral de entrada a ceba
            let marcaOkCeba = false;
            let updateAnimalData: any = {};
            
            if (animal.etapa === 'levante' && pesoFloat >= pesoEntradaCeba) {
                marcaOkCeba = true;
                updateAnimalData.ok_ceba = true;
                setMarcadoCeba(true);
            }

            if (castrarHoy) {
                updateAnimalData.tipo_macho = 'novillo';
                updateAnimalData.fecha_castracion = fechaPesaje;
            }

            if (Object.keys(updateAnimalData).length > 0) {
                await supabase
                    .from('animales')
                    .update(updateAnimalData)
                    .eq('id', animal.id);
            }

            const msgCeba = marcaOkCeba
                ? ` 🟢 Marcado para pasar a Ceba (${pesoFloat}kg ≥ ${pesoEntradaCeba}kg).`
                : '';
            const msgCastrado = castrarHoy ? ` ✂️ Registrado como Novillo.` : '';

            setMsjExito(`¡Pesaje de ${pesoFloat}kg guardado para la chapeta #${animal.numero_chapeta}!${msgCeba}${msgCastrado}`);
            setAnimal(null);
            setChapeta('');
            setNuevoPeso('');
            setFechaPesaje(new Date().toISOString().split('T')[0]);
            fetchPesajesHoy();
        } catch (err: any) {
            setMsjError(err.message || 'Error al guardar el pesaje');
        } finally {
            setLoading(false);
        }
    };

    const handleEliminarPesaje = async (pesaje: typeof pesajesHoy[0]) => {
        if (!confirm(`¿Eliminar el pesaje de ${pesaje.peso}kg del animal #${pesaje.numero_chapeta}?`)) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('registros_pesaje').delete().eq('id', pesaje.id);
            if (error) throw error;
            fetchPesajesHoy();
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGuardarEdicion = async (pesaje: typeof pesajesHoy[0]) => {
        const nuevoPesoFloat = parseFloat(editPeso);
        if (isNaN(nuevoPesoFloat) || nuevoPesoFloat <= 0) { alert('Ingresa un peso válido.'); return; }
        if (nuevoPesoFloat === pesaje.peso) { setEditingPesajeId(null); return; }
        setLoading(true);
        try {
            const { error } = await supabase
                .from('registros_pesaje')
                .update({ peso: nuevoPesoFloat, peso_anterior: pesaje.peso, fecha_modificacion: new Date().toISOString() })
                .eq('id', pesaje.id);
            if (error) throw error;
            setEditingPesajeId(null);
            setEditPeso('');
            fetchPesajesHoy();
        } catch (err: any) {
            alert('Error al editar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ maxWidth: '600px' }}>
            <h1 className="title text-center" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Registro de Pesaje</h1>
            <p className="text-center" style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>Busque al animal para registrar el peso actual.</p>
            <p className="text-center" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '32px' }}>
                Umbral entrada a ceba: <strong style={{ color: 'var(--primary-light)' }}>{pesoEntradaCeba} kg</strong>
            </p>

            {msjExito && (
                <div style={{
                    backgroundColor: marcadoCeba ? 'rgba(76,175,80,0.25)' : 'rgba(76, 175, 80, 0.2)',
                    color: 'var(--success)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '24px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    border: marcadoCeba ? '1px solid var(--success)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                }}>
                    {marcadoCeba && <CheckCircle2 size={22} />}
                    {msjExito}
                </div>
            )}
            {msjError && <div className="error-message text-center" style={{ fontWeight: 'bold' }}>{msjError}</div>}

            <div className="card" style={{ padding: '32px' }}>
                <form onSubmit={buscarAnimal} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: animal || showCrearAnimal ? '32px' : '0' }}>
                    <div style={{ flex: '1 1 200px', position: 'relative' }}>
                        <Search size={24} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Nro. Chapeta"
                            value={chapeta}
                            onChange={(e) => setChapeta(e.target.value)}
                            style={{ fontSize: '1.5rem', padding: '16px 16px 16px 56px', marginBottom: 0 }}
                            disabled={loading || showCrearAnimal}
                            autoFocus
                        />
                    </div>
                    <button type="submit" disabled={loading || showCrearAnimal} style={{ width: 'auto', padding: '0 32px', fontSize: '1.2rem', flex: '1 1 120px' }}>
                        Buscar
                    </button>
                </form>

                {animalNoEncontrado && !showCrearAnimal && !animal && (
                    <div style={{ textAlign: 'center', marginTop: '24px', padding: '24px', border: '1px dashed var(--warning)', borderRadius: '8px' }}>
                        <p style={{ color: 'white', marginBottom: '16px' }}>El animal no está en la base de datos.</p>
                        <button
                            type="button"
                            onClick={() => { setShowCrearAnimal(true); setMsjError(''); }}
                            style={{ width: 'auto', backgroundColor: 'var(--warning)', color: '#000', margin: '0 auto' }}
                        >
                            <PlusCircle size={20} /> Crear Animal Ahora
                        </button>
                    </div>
                )}

                {showCrearAnimal && !animal && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px', marginTop: '16px' }}>
                        <h3 style={{ color: 'var(--warning)', marginBottom: '16px', fontSize: '1.2rem' }}>Registro Rápido: #{chapeta}</h3>

                        <label>Seleccionar Propietario</label>
                        {propietarios.length > 0 ? (
                            <select
                                value={propietarioNuevo}
                                onChange={e => setPropietarioNuevo(e.target.value)}
                                required
                            >
                                <option value="">-- Elija un propietario --</option>
                                {propietarios.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        ) : (
                            <div style={{ padding: '12px', marginBottom: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', fontSize: '0.9rem', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                No hay propietarios configurados en esta finca. Vaya a <b>Ajustes</b> para crearlos.
                                <input
                                    type="text"
                                    placeholder="Nombre del propietario (Manual)"
                                    value={propietarioNuevo}
                                    style={{ marginTop: '12px' }}
                                    onChange={e => setPropietarioNuevo(e.target.value)}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ flex: 1 }}>
                                <label>Fecha de Ingreso</label>
                                <input
                                    type="date"
                                    value={fechaIngresoNueva}
                                    onChange={e => setFechaIngresoNueva(e.target.value)}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label>Peso de Ingreso (kg)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="Ej 180"
                                    value={pesoIngresoNuevo}
                                    onChange={e => setPesoIngresoNuevo(e.target.value)}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button type="button" onClick={() => setShowCrearAnimal(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={crearRegistroAnimal} disabled={!propietarioNuevo || !pesoIngresoNuevo || loading}>
                                {loading ? 'Creando...' : 'Crear y Continuar'}
                            </button>
                        </div>
                    </div>
                )}

                {animal && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px', marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                            <div>
                                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Animal Encontrado</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>#{animal.numero_chapeta}</div>
                                {animal.nombre_propietario && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                                        Marca/Propietario: <span style={{ color: 'var(--text-light)' }}>{animal.nombre_propietario}</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Última {getModoLabel(modoGanancia)}</div>
                                <div style={{ 
                                    fontSize: '1.5rem', 
                                    fontWeight: 'bold', 
                                    color: (animal.gmp || 0) < 0 ? 'var(--error)' : ((animal.gmp || 0) <= umbralMedio ? 'var(--warning)' : ((animal.gmp || 0) <= umbralAlto ? 'var(--text-light)' : 'var(--success)')),
                                    textShadow: (animal.gmp !== undefined && animal.gmp > umbralMedio && animal.gmp <= umbralAlto) ? '0 0 2px rgba(255,255,255,0.2)' : 'none'
                                }}>
                                    {animal.gmp ? toDisplayValue(animal.gmp, modoGanancia).toFixed(modoGanancia === 'GDP' ? 0 : 1) : '0'} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getUnidadLabel(modoGanancia)}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Último Pesaje</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{animal.ultimo_peso} kg</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{animal.fecha_ultimo_peso ? format(new Date(animal.fecha_ultimo_peso), 'dd/MM/yyyy') : '-'}</div>
                            </div>
                            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Etapa</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', textTransform: 'capitalize' }}>{animal.etapa}</div>
                                {animal.potrerada_nombre && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>{animal.potrerada_nombre}</div>
                                )}
                            </div>
                        </div>

                        {/* Tarjeta de tipo de animal (solo machos) */}
                        {animal.sexo === 'M' && (
                            <div style={{ marginBottom: '16px' }}>
                                {animal.tipo_macho === 'novillo' ? (
                                    <div style={{ padding: '12px 16px', background: 'rgba(33,150,243,0.08)', border: '1px solid rgba(33,150,243,0.25)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', color: '#42a5f5', fontSize: '0.9rem' }}>
                                        <span style={{ fontSize: '1.2rem' }}>✂️</span>
                                        <div>
                                            <strong>Novillo</strong> (castrado)
                                            {animal.fecha_castracion && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Castrado el {format(new Date(animal.fecha_castracion + 'T12:00:00'), 'dd/MM/yyyy')}</div>}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '14px 16px', background: 'rgba(255,152,0,0.06)', border: `1px solid ${castrarHoy ? 'rgba(33,150,243,0.4)' : 'rgba(255,152,0,0.2)'}`, borderRadius: '10px', transition: 'border-color 0.2s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '1.1rem' }}>🐂</span>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--text-light)', fontSize: '0.95rem' }}>Toro (sin castrar)</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>¿Se castró hoy? Marcar como Novillo</div>
                                                </div>
                                            </div>
                                            <label style={{ position: 'relative', display: 'inline-block', width: '52px', height: '28px', cursor: 'pointer', flexShrink: 0 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={castrarHoy}
                                                    onChange={e => setCastrarHoy(e.target.checked)}
                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                />
                                                <span style={{
                                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                    background: castrarHoy ? '#2196F3' : 'rgba(255,255,255,0.1)',
                                                    borderRadius: '28px',
                                                    transition: 'background 0.2s',
                                                    boxShadow: castrarHoy ? '0 0 8px rgba(33,150,243,0.5)' : 'none'
                                                }}>
                                                    <span style={{
                                                        position: 'absolute',
                                                        top: '3px',
                                                        left: castrarHoy ? '27px' : '3px',
                                                        width: '22px', height: '22px',
                                                        background: 'white',
                                                        borderRadius: '50%',
                                                        transition: 'left 0.2s',
                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                                                    }} />
                                                </span>
                                            </label>
                                        </div>
                                        {castrarHoy && (
                                            <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(33,150,243,0.1)', borderRadius: '6px', color: '#42a5f5', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                                Al guardar el pesaje, este animal quedará registrado como <strong>Novillo</strong> para siempre.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Indicador si ya tiene marca ok_ceba - Solo mostrar si está en levante */}
                        {animal.ok_ceba && animal.etapa === 'levante' && (
                            <div style={{ padding: '12px 16px', background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: '8px', marginBottom: '16px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                <CheckCircle2 size={18} /> Este animal ya está marcado para pasar a Ceba
                            </div>
                        )}

                        {/* Indicador del umbral - Solo mostrar si está en levante */}
                        {animal.etapa === 'levante' && (
                            <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Si el nuevo peso ≥ <strong style={{ color: 'var(--primary-light)' }}>{pesoEntradaCeba} kg</strong>, el animal quedará marcado para pasar a Ceba.
                            </div>
                        )}

                        {/* Indicador de peso repetido el mismo día */}
                        {animal.fecha_ultimo_peso && animal.fecha_ultimo_peso.split('T')[0] === fechaPesaje && (
                            <div style={{ padding: '12px 16px', background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.3)', borderRadius: '8px', marginBottom: '16px', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                <AlertTriangle size={18} style={{ flexShrink: 0 }} /> Este animal ya tiene un pesaje registrado en esta fecha.
                            </div>
                        )}

                        <label style={{ fontSize: '1.2rem', color: 'white', marginBottom: '12px' }}>Nuevo Peso (kg)</label>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '1 1 140px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Fecha del pesaje</label>
                                <input
                                    type="date"
                                    value={fechaPesaje}
                                    onChange={(e) => setFechaPesaje(e.target.value)}
                                    style={{ marginBottom: 0 }}
                                    disabled={loading}
                                />
                            </div>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                placeholder="Ej. 350.5"
                                value={nuevoPeso}
                                onChange={(e) => setNuevoPeso(e.target.value)}
                                style={{ fontSize: '2rem', padding: '20px', textAlign: 'center', marginBottom: 0, flex: '1 1 200px' }}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={guardarPesaje}
                                disabled={loading || !nuevoPeso || (animal.fecha_ultimo_peso?.split('T')[0] === fechaPesaje)}
                                style={{ width: 'auto', padding: '0 40px', fontSize: '1.2rem', display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}
                            >
                                <Save size={28} />
                                <span style={{ fontSize: '0.8rem' }}>Guardar</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Panel: Pesajes de Hoy */}
            {pesajesHoy.length > 0 && (() => {
                const toggleSort = (col: typeof sortColHoy) => {
                    if (sortColHoy === col) setSortDirHoy(d => d === 'asc' ? 'desc' : 'asc');
                    else { setSortColHoy(col); setSortDirHoy('asc'); }
                };
                const sorted = [...pesajesHoy].sort((a, b) => {
                    let res = 0;
                    if (sortColHoy === 'chapeta') res = a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true });
                    else if (sortColHoy === 'marca') res = a.nombre_propietario.localeCompare(b.nombre_propietario);
                    else if (sortColHoy === 'potrerada') res = a.potrerada_nombre.localeCompare(b.potrerada_nombre);
                    else if (sortColHoy === 'peso') res = a.peso - b.peso;
                    return sortDirHoy === 'asc' ? res : -res;
                });
                const arrow = (col: typeof sortColHoy) => sortColHoy === col ? (sortDirHoy === 'asc' ? ' ↑' : ' ↓') : ' ↕';
                const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
                const tdStyle: React.CSSProperties = { padding: '12px', fontSize: '0.9rem', verticalAlign: 'middle' };
                return (
                    <div style={{ marginTop: '24px', maxWidth: '100%', width: '800px', marginLeft: 'auto', marginRight: 'auto' }}>
                        <div className="card" style={{ padding: '20px 24px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                ✏️ Pesajes ingresados hoy ({pesajesHoy.length})
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(solo puedes corregir los de hoy)</span>
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle} onClick={() => toggleSort('chapeta')}>Chapeta{arrow('chapeta')}</th>
                                            <th style={thStyle} onClick={() => toggleSort('marca')}>Marca{arrow('marca')}</th>
                                            <th style={thStyle} onClick={() => toggleSort('potrerada')}>Potrerada{arrow('potrerada')}</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('peso')}>Peso{arrow('peso')}</th>
                                            <th style={{ ...thStyle, textAlign: 'center', cursor: 'default' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sorted.map(p => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={tdStyle}>
                                                    <span style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{p.numero_chapeta}</span>
                                                </td>
                                                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{p.nombre_propietario}</td>
                                                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{p.potrerada_nombre}</td>
                                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>
                                                    {editingPesajeId === p.id ? (
                                                        <input
                                                            type="number" step="0.1" value={editPeso}
                                                            onChange={e => setEditPeso(e.target.value)}
                                                            style={{ width: '80px', padding: '6px', margin: 0, textAlign: 'center', fontSize: '0.9rem' }}
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <>{p.peso} kg</>
                                                    )}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                        {editingPesajeId === p.id ? (
                                                            <>
                                                                <button onClick={() => handleGuardarEdicion(p)} disabled={loading}
                                                                    style={{ width: 'auto', padding: '5px 10px', backgroundColor: 'var(--primary)', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                                                                    <Check size={13} /> OK
                                                                </button>
                                                                <button onClick={() => { setEditingPesajeId(null); setEditPeso(''); }}
                                                                    style={{ width: 'auto', padding: '5px 8px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}>
                                                                    <X size={13} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => { setEditingPesajeId(p.id); setEditPeso(String(p.peso)); }} title="Editar"
                                                                    style={{ width: 'auto', padding: '6px', backgroundColor: 'rgba(33,150,243,0.1)', border: '1px solid rgba(33,150,243,0.3)', borderRadius: '7px', color: '#42a5f5' }}>
                                                                    <Pencil size={14} />
                                                                </button>
                                                                <button onClick={() => handleEliminarPesaje(p)} title="Eliminar"
                                                                    style={{ width: 'auto', padding: '6px', backgroundColor: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.3)', borderRadius: '7px', color: 'var(--error)' }}>
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
