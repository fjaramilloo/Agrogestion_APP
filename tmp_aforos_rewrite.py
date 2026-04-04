import re

with open('src/pages/Aforos.tsx', 'r') as f:
    code = f.read()

# Replace Imports
code = code.replace(
    "import { Layers, Plus, Save, Trash2, Info, X } from 'lucide-react';",
    "import { Layers, Plus, Save, Trash2, Info, X, Wifi, WifiOff, UploadCloud } from 'lucide-react';"
)

from_interfaces = """interface RegistroAforo {
    id: string;
    fecha: string;
    promedio_muestras_kg: number;
    viabilidad: number;
    aforo_real_kg: number;
    potrero: { nombre: string };
    animales_presentes?: number;
    id_potrero: string;
}"""
to_interfaces = """interface RegistroAforo {
    id: string;
    fecha: string;
    promedio_muestras_kg: number;
    viabilidad: number;
    aforo_real_kg: number;
    potrero: { nombre: string };
    animales_presentes?: number;
    id_potrero: string;
    isOffline?: boolean;
}

interface OfflineAforoPayload {
    id_temp: string;
    id_finca: string;
    id_potrero: string;
    fecha: string;
    muestras: number[];
    promedio_muestras_kg: number;
    viabilidad: number;
    aforo_real_kg: number;
    id_potrerada: string | null;
    animales_presentes: number;
    potrero: { nombre: string };
}"""
code = code.replace(from_interfaces, to_interfaces)

# Component Starts
from_hooks = """    const [consumoBase, setConsumoBase] = useState(50); // Default, from config"""
to_hooks = """    const [consumoBase, setConsumoBase] = useState(50); // Default, from config
    
    // Online / Sync State
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState<OfflineAforoPayload[]>([]);
    const [syncing, setSyncing] = useState(false);"""
code = code.replace(from_hooks, to_hooks)


# Effects
from_effect = """    useEffect(() => {
        if (!fincaId) return;

        const fetchConfig = async () => {
            const { data } = await supabase.from('configuracion_kpi').select('consumo_dia_potrero').eq('id_finca', fincaId).single();
            if (data && data.consumo_dia_potrero) {
                setConsumoBase(data.consumo_dia_potrero);
            }
        };

        fetchConfig();
        fetchPotreros();
        fetchHistorial();
    }, [fincaId]);"""
to_effect = """    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); }
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const saved = localStorage.getItem('agrogestion_aforos_offline');
        if (saved) {
            try { setOfflineQueue(JSON.parse(saved)); } catch (e) {}
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!fincaId) return;

        const fetchConfig = async () => {
            if (isOnline) {
                const { data } = await supabase.from('configuracion_kpi').select('consumo_dia_potrero').eq('id_finca', fincaId).single();
                if (data && data.consumo_dia_potrero) {
                    setConsumoBase(data.consumo_dia_potrero);
                    localStorage.setItem(`agrogestion_config_aforo_${fincaId}`, data.consumo_dia_potrero.toString());
                }
            } else {
                const cached = localStorage.getItem(`agrogestion_config_aforo_${fincaId}`);
                if (cached) setConsumoBase(parseFloat(cached));
            }
        };

        fetchConfig();
        fetchPotreros();
        fetchHistorial();
    }, [fincaId, isOnline]);
    
    useEffect(() => {
        if (isOnline && offlineQueue.length > 0) {
            syncOfflineQueue();
        }
    }, [isOnline]);"""
code = code.replace(from_effect, to_effect)


from_effect2 = """        const fetchContext = async () => {
            // Find current movement that links to this potrero
            const { data: mov } = await supabase
                .from('movimientos_potreros')
                .select(`
                    id_potrerada,
                    potreradas (id, nombre)
                `)
                .eq('id_potrero', selectedPotreroId)
                .is('fecha_salida', null)
                .limit(1)
                .single();

            if (mov && mov.potreradas) {
                setPotreradaInfo(mov.potreradas as any);
                // Get animal count for this potrerada
                const { count } = await supabase
                    .from('animales')
                    .select('id', { count: 'exact', head: true })
                    .eq('id_potrerada', mov.id_potrerada)
                    .eq('estado', 'activo');
                setAnimalCount(count || 0);
            } else {
                setPotreradaInfo(null);
                setAnimalCount(0);
            }
        };"""
to_effect2 = """        const fetchContext = async () => {
            if (isOnline) {
                // Find current movement that links to this potrero
                const { data: mov } = await supabase
                    .from('movimientos_potreros')
                    .select(`
                        id_potrerada,
                        potreradas (id, nombre)
                    `)
                    .eq('id_potrero', selectedPotreroId)
                    .is('fecha_salida', null)
                    .limit(1)
                    .single();

                if (mov && mov.potreradas) {
                    setPotreradaInfo(mov.potreradas as any);
                    // Get animal count for this potrerada
                    const { count } = await supabase
                        .from('animales')
                        .select('id', { count: 'exact', head: true })
                        .eq('id_potrerada', mov.id_potrerada)
                        .eq('estado', 'activo');
                    setAnimalCount(count || 0);
                    localStorage.setItem(`ctx_aforo_${selectedPotreroId}`, JSON.stringify({ potreradaInfo: mov.potreradas, animalCount: count }));
                } else {
                    setPotreradaInfo(null);
                    setAnimalCount(0);
                    localStorage.removeItem(`ctx_aforo_${selectedPotreroId}`);
                }
            } else {
                const cached = localStorage.getItem(`ctx_aforo_${selectedPotreroId}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setPotreradaInfo(parsed.potreradaInfo);
                    setAnimalCount(parsed.animalCount || 0);
                } else {
                    setPotreradaInfo(null);
                    setAnimalCount(0);
                }
            }
        };"""
code = code.replace(from_effect2, to_effect2)


from_fetch_potreros = """    const fetchPotreros = async () => {
        const { data } = await supabase
            .from('potreros')
            .select('id, nombre, area_hectareas')
            .eq('id_finca', fincaId)
            .order('nombre');
        if (data) setPotreros(data);
    };"""
to_fetch_potreros = """    const fetchPotreros = async () => {
        if (isOnline) {
            const { data } = await supabase
                .from('potreros')
                .select('id, nombre, area_hectareas')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) {
                setPotreros(data);
                localStorage.setItem(`agrogestion_potreros_aforo_${fincaId}`, JSON.stringify(data));
            }
        } else {
            const cached = localStorage.getItem(`agrogestion_potreros_aforo_${fincaId}`);
            if (cached) setPotreros(JSON.parse(cached));
        }
    };

    const syncOfflineQueue = async () => {
        if (!fincaId || offlineQueue.length === 0 || !navigator.onLine) return;
        setSyncing(true);
        let newQueue = [...offlineQueue];
        try {
            for (const payload of offlineQueue) {
                const aforoToInsert = { ...payload };
                delete (aforoToInsert as any).id_temp;
                delete (aforoToInsert as any).potrero;

                const { error } = await supabase.from('registros_aforo').insert(aforoToInsert);
                if (!error) {
                    newQueue = newQueue.filter(item => item.id_temp !== payload.id_temp);
                }
            }
            setOfflineQueue(newQueue);
            localStorage.setItem('agrogestion_aforos_offline', JSON.stringify(newQueue));
            if (offlineQueue.length > 0) setMsjExito('Aforos offline sincronizados exitosamente.');
            fetchHistorial();
        } catch (err) {
            console.error('Error syncing:', err);
        } finally {
            setSyncing(false);
        }
    };"""
code = code.replace(from_fetch_potreros, to_fetch_potreros)


from_fetch_historial = """    const fetchHistorial = async () => {
        const { data } = await supabase
            .from('registros_aforo')
            .select(`
                id, fecha, promedio_muestras_kg, viabilidad, aforo_real_kg, animales_presentes, id_potrero,
                potrero:potreros(nombre)
            `)
            .eq('id_finca', fincaId)
            .order('fecha', { ascending: false })
            .limit(50);
        if (data) setHistorial(data as any);
    };"""
to_fetch_historial = """    const fetchHistorial = async () => {
        if (isOnline) {
            const { data } = await supabase
                .from('registros_aforo')
                .select(`
                    id, fecha, promedio_muestras_kg, viabilidad, aforo_real_kg, animales_presentes, id_potrero,
                    potrero:potreros(nombre)
                `)
                .eq('id_finca', fincaId)
                .order('fecha', { ascending: false })
                .limit(50);
            if (data) {
                setHistorial(data as any);
                localStorage.setItem(`agrogestion_aforos_hist_${fincaId}`, JSON.stringify(data));
            }
        } else {
            const cached = localStorage.getItem(`agrogestion_aforos_hist_${fincaId}`);
            if (cached) setHistorial(JSON.parse(cached));
        }
    };"""
code = code.replace(from_fetch_historial, to_fetch_historial)


from_save = """        setLoading(true);
        try {
            const { error } = await supabase.from('registros_aforo').insert({
                id_finca: fincaId,
                id_potrero: selectedPotreroId,
                fecha: fecha,
                muestras: nums, // jsonb
                promedio_muestras_kg: avgMuestra,
                viabilidad: viaValue,
                aforo_real_kg: aforoReal,
                id_potrerada: potreradaInfo?.id || null,
                animales_presentes: animalCount
            });
            if (error) throw error;
            
            setMsjExito('Aforo guardado exitosamente.');
            setMuestras(Array(8).fill(''));
            setSelectedPotreroId('');
            setViabilidad('70');
            fetchHistorial();
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            setLoading(false);
        }"""
to_save = """        if (isOnline) {
            setLoading(true);
            try {
                const { error } = await supabase.from('registros_aforo').insert({
                    id_finca: fincaId,
                    id_potrero: selectedPotreroId,
                    fecha: fecha,
                    muestras: nums, // jsonb
                    promedio_muestras_kg: avgMuestra,
                    viabilidad: viaValue,
                    aforo_real_kg: aforoReal,
                    id_potrerada: potreradaInfo?.id || null,
                    animales_presentes: animalCount
                });
                if (error) throw error;
                
                setMsjExito('Aforo guardado exitosamente.');
                setMuestras(Array(8).fill(''));
                setSelectedPotreroId('');
                setViabilidad('70');
                fetchHistorial();
            } catch (err: any) {
                setMsjError(err.message);
            } finally {
                setLoading(false);
            }
        } else {
            const pNombre = potreros.find(p => p.id === selectedPotreroId)?.nombre || 'Desconocido';
            const newPayload: OfflineAforoPayload = {
                id_temp: 'aforo_' + Math.random().toString(36).substring(7),
                id_finca: fincaId,
                id_potrero: selectedPotreroId,
                fecha: fecha,
                muestras: nums,
                promedio_muestras_kg: avgMuestra,
                viabilidad: viaValue,
                aforo_real_kg: aforoReal,
                id_potrerada: potreradaInfo?.id || null,
                animales_presentes: animalCount,
                potrero: { nombre: pNombre }
            };
            const newQueue = [...offlineQueue, newPayload];
            setOfflineQueue(newQueue);
            localStorage.setItem('agrogestion_aforos_offline', JSON.stringify(newQueue));
            
            setMsjExito('Aforo guardado localmente (Offline). Se sincronizará cuando haya conexión.');
            setMuestras(Array(8).fill(''));
            setSelectedPotreroId('');
            setViabilidad('70');
        }"""
code = code.replace(from_save, to_save)


from_openCalc = """    const openCalculadora = async (aforo: RegistroAforo) => {
        setModalCalcOpen({ open: true, aforo, diasLleva: 'Calculando...' });
        const animales = aforo.animales_presentes || 1;
        const consumo = consumoBase;
        const dias = aforo.aforo_real_kg / (animales * consumo);

        setCalcConsumo(consumo.toString());
        setCalcAnimales(animales.toString());
        setCalcDias(dias.toFixed(1));

        // Calcular días reales actuales de ocupación basándonos en el movimiento activo
        const { data: mov } = await supabase
            .from('movimientos_potreros')
            .select(`fecha_ingreso`)
            .eq('id_potrero', aforo.id_potrero)
            .is('fecha_salida', null)
            .order('fecha_ingreso', { ascending: false })
            .limit(1)
            .single();

        let diasStr = 'Ninguno';
        if (mov && mov.fecha_ingreso) {
            const ms = new Date().getTime() - new Date(mov.fecha_ingreso).getTime();
            const days = Math.floor(ms / (1000 * 60 * 60 * 24));
            diasStr = `${Math.max(0, days)} días`;
        }

        setModalCalcOpen({ open: true, aforo, diasLleva: diasStr });
    };"""
to_openCalc = """    const openCalculadora = async (aforo: RegistroAforo) => {
        setModalCalcOpen({ open: true, aforo, diasLleva: 'Calculando...' });
        const animales = aforo.animales_presentes || 1;
        const consumo = consumoBase;
        const dias = aforo.aforo_real_kg / (animales * consumo);

        setCalcConsumo(consumo.toString());
        setCalcAnimales(animales.toString());
        setCalcDias(dias.toFixed(1));

        if (isOnline) {
            // Calcular días reales actuales de ocupación basándonos en el movimiento activo
            const { data: mov } = await supabase
                .from('movimientos_potreros')
                .select(`fecha_ingreso`)
                .eq('id_potrero', aforo.id_potrero)
                .is('fecha_salida', null)
                .order('fecha_ingreso', { ascending: false })
                .limit(1)
                .single();

            let diasStr = 'Ninguno';
            if (mov && mov.fecha_ingreso) {
                const ms = new Date().getTime() - new Date(mov.fecha_ingreso).getTime();
                const days = Math.floor(ms / (1000 * 60 * 60 * 24));
                diasStr = `${Math.max(0, days)} días`;
            }

            setModalCalcOpen(prev => ({ ...prev, diasLleva: diasStr }));
            localStorage.setItem(`agrogestion_calc_dias_${aforo.id_potrero}`, diasStr);
        } else {
            const cached = localStorage.getItem(`agrogestion_calc_dias_${aforo.id_potrero}`);
            setModalCalcOpen(prev => ({ ...prev, diasLleva: cached || 'Desconocido (Offline)' }));
        }
    };"""
code = code.replace(from_openCalc, to_openCalc)


from_hdr = """            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '32px' }}>
                <Layers size={32} /> Aforos de Potreros
            </h1>"""
to_hdr = """            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
                <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                    <Layers size={32} /> Aforos de Potreros
                </h1>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px', 
                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold',
                        backgroundColor: isOnline ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                        color: isOnline ? 'var(--success)' : 'var(--error)'
                    }}>
                        {isOnline ? <><Wifi size={18} /> Online</> : <><WifiOff size={18} /> Offline</>}
                    </span>

                    {offlineQueue.length > 0 && isOnline && (
                        <button onClick={syncOfflineQueue} disabled={syncing} style={{ backgroundColor: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px' }}>
                            <UploadCloud size={18} /> {syncing ? 'Sincronizando...' : `Sincronizar (${offlineQueue.length})`}
                        </button>
                    )}
                </div>
            </div>"""
code = code.replace(from_hdr, to_hdr)

from_display_historial = """                    {historial.length === 0 ? ("""
to_display_historial = """    const displayHistorial = [
        ...offlineQueue.map(q => ({
            id: q.id_temp,
            fecha: q.fecha,
            promedio_muestras_kg: q.promedio_muestras_kg,
            viabilidad: q.viabilidad,
            aforo_real_kg: q.aforo_real_kg,
            animales_presentes: q.animales_presentes,
            id_potrero: q.id_potrero,
            potrero: q.potrero,
            isOffline: true
        })), 
        ...historial
    ];

                    {displayHistorial.length === 0 ? ("""
code = code.replace(from_display_historial, to_display_historial)

from_map_hs = """{historial.map(h => ("""
to_map_hs = """{displayHistorial.map((h: any) => ("""
code = code.replace(from_map_hs, to_map_hs)

from_map_item = """                                        <strong style={{ color: 'white', fontSize: '1.1rem' }}>{h.potrero?.nombre}</strong>"""
to_map_item = """                                        <strong style={{ color: 'white', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {h.potrero?.nombre}
                                            {h.isOffline && <span style={{ fontSize: '0.7rem', backgroundColor: 'var(--error)', padding: '2px 6px', borderRadius: '10px' }}>Pendiente Sync</span>}
                                        </strong>"""
code = code.replace(from_map_item, to_map_item)

with open('src/pages/Aforos.tsx', 'w') as f:
    f.write(code)

