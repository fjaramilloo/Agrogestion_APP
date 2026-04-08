import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, Upload, FileText, UserPlus, Users, CheckSquare, Square, Trash2, Plus, CheckCircle2, MapPin, Maximize, Home, Lock, Briefcase, Truck, ShoppingCart } from 'lucide-react';
// @ts-ignore type definitions for papaparse are throwing a false positive in the IDE
import Papa from 'papaparse';

const parseFechaCol = (fechaStr: string) => {
    if (!fechaStr) return null;
    if (fechaStr.includes('/')) {
        const parts = fechaStr.split('/');
        if (parts.length === 3) {
            let d = parts[0], m = parts[1], y = parts[2];
            // Si el año viene de 2 dígitos (ej 24), lo pasamos a 2024
            if (y.length === 2) y = '20' + y;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    return fechaStr;
};

export default function Settings() {
    const { fincaId, role, userFincas, isSuperAdmin } = useAuth();
    const [umbral, setUmbral] = useState('0.434');
    const [umbralMedioGMP, setUmbralMedioGMP] = useState('10');
    const [umbralAltoGMP, setUmbralAltoGMP] = useState('20');
    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');
    const [showExitoModal, setShowExitoModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [reporteCarga, setReporteCarga] = useState<{
        tipo: 'animales' | 'pesajes';
        creados: number;
        actualizados: number;
        omitidos: number;
        omitidosList: string[];
    } | null>(null);

    // Estados para Cambio de Contraseña
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [newUserRole, setNewUserRole] = useState<'vaquero' | 'observador'>('vaquero');
    const [selectedFincas, setSelectedFincas] = useState<string[]>([]);
    
    // Estados para secciones colapsables
    const [collapsed, setCollapsed] = useState({
        seguridad: true,
        datosTecnicos: true, 
        usuarios: true,
        contactosNegocio: true,
        cargasMasivas: true
    });

    const toggleSection = (section: keyof typeof collapsed) => {
        setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Estados para creación de usuario

    // Estados para Propietarios
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoPropietario, setNuevoPropietario] = useState('');

    // Estados para Proveedores
    const [proveedores, setProveedores] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoProveedor, setNuevoProveedor] = useState('');

    // Estados para Compradores
    const [compradores, setCompradores] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoComprador, setNuevoComprador] = useState('');

    // Estados para Potreradas (Movidos a Potreradas.tsx)

    // Estados para Rotaciones y Potreros (Eliminados, movidos a Rotations.tsx)

    // Estados para Información de la Finca
    const [farmInfo, setFarmInfo] = useState({
        area_total: '',
        area_aprovechable: '',
        ubicacion: '',
        proposito: '',
        precio_venta_promedio: '',
        peso_entrada_ceba: '380',
        consumo_dia_potrero: '50'
    });

    // Filtrar fincas donde el usuario es administrador
    const fincasAdmin = userFincas.filter(f => f.rol === 'administrador' || isSuperAdmin);

    const fetchConfig = async () => {
        if (!fincaId) return;
        const { data } = await supabase
            .from('configuracion_kpi')
            .select('umbral_bajo_gdp, umbral_medio_gmp, umbral_alto_gmp')
            .eq('id_finca', fincaId)
            .single();

        if (data) {
            setUmbral(data.umbral_bajo_gdp?.toString() || '0.434');
            if (data.umbral_medio_gmp !== undefined && data.umbral_medio_gmp !== null) setUmbralMedioGMP(data.umbral_medio_gmp.toString());
            if (data.umbral_alto_gmp !== undefined && data.umbral_alto_gmp !== null) setUmbralAltoGMP(data.umbral_alto_gmp.toString());
        }
    };

    const fetchPropietarios = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('propietarios')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setPropietarios(data);
    };

    const fetchProveedores = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('proveedores')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setProveedores(data);
    };

    const fetchCompradores = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('compradores')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setCompradores(data);
    };

    // fetchPotreradas movido a Potreradas.tsx


    const fetchFincaInfo = async () => {
        if (!fincaId) return;
        
        // Datos generales de la finca
        const { data: finca, error: fincaErr } = await supabase
            .from('fincas')
            .select('area_total, area_aprovechable, ubicacion, proposito')
            .eq('id', fincaId)
            .single();

        // Precio de venta y umbral ceba desde configuracion_kpi
        const { data: config } = await supabase
            .from('configuracion_kpi')
            .select('precio_venta_promedio, peso_entrada_ceba, consumo_dia_potrero')
            .eq('id_finca', fincaId)
            .single();

        if (!fincaErr && finca) {
            setFarmInfo({
                area_total: finca.area_total?.toString() || '',
                area_aprovechable: finca.area_aprovechable?.toString() || '',
                ubicacion: finca.ubicacion || '',
                proposito: finca.proposito || '',
                precio_venta_promedio: config?.precio_venta_promedio?.toString() || '0',
                peso_entrada_ceba: config?.peso_entrada_ceba?.toString() || '380',
                consumo_dia_potrero: config?.consumo_dia_potrero?.toString() || '50'
            });
        }
    };

    useEffect(() => {
        if (!fincaId) return;
        fetchConfig();
        fetchPropietarios();
        fetchProveedores();
        fetchCompradores();
        fetchFincaInfo();

        if (fincaId && selectedFincas.length === 0) {
            setSelectedFincas([fincaId]);
        }
    }, [fincaId]);

    const toggleFincaSelection = (id: string) => {
        setSelectedFincas(prev =>
            prev.includes(id)
                ? prev.filter(f => f !== id)
                : [...prev, id]
        );
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setMsjError('Las contraseñas no coinciden.');
            return;
        }
        if (newPassword.length < 6) {
            setMsjError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        setLoading(true);
        setMsjError('');
        setMsjExito('');
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setMsjError('Error al actualizar contraseña: ' + error.message);
        } else {
            setMsjExito('Contraseña actualizada correctamente.');
            setNewPassword('');
            setConfirmPassword('');
        }
        setLoading(false);
    };

    const guardarConfiguracionYFinca = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        try {
            // 1. Guardar configuracion_kpi (umbrales y precios)
            const valorNum = parseFloat(umbral);
            const valorMedioGMP = parseFloat(umbralMedioGMP);
            const valorAltoGMP = parseFloat(umbralAltoGMP);
            const precioVenta = parseFloat(farmInfo.precio_venta_promedio) || 0;
            const pesoCeba = parseFloat(farmInfo.peso_entrada_ceba) || 380;
            const consumoDia = parseFloat(farmInfo.consumo_dia_potrero) || 50;

            const { error: kpiError } = await supabase
                .from('configuracion_kpi')
                .upsert({ 
                    id_finca: fincaId, 
                    umbral_bajo_gdp: valorNum,
                    umbral_medio_gmp: valorMedioGMP,
                    umbral_alto_gmp: valorAltoGMP,
                    precio_venta_promedio: precioVenta,
                    peso_entrada_ceba: pesoCeba,
                    consumo_dia_potrero: consumoDia
                }, { onConflict: 'id_finca' });

            if (kpiError) throw kpiError;

            // 2. Guardar información de la finca
            const { error: fincaError } = await supabase
                .from('fincas')
                .update({
                    area_total: farmInfo.area_total ? parseFloat(farmInfo.area_total) : null,
                    area_aprovechable: farmInfo.area_aprovechable ? parseFloat(farmInfo.area_aprovechable) : null,
                    ubicacion: farmInfo.ubicacion,
                    proposito: farmInfo.proposito || null
                })
                .eq('id', fincaId);

            if (fincaError) throw fincaError;

            setMsjExito('Información y parámetros actualizados exitosamente.');
        } catch (err: any) {
            setMsjError('Error al guardar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedFincas.length === 0) {
            setMsjError('Debe seleccionar al menos una finca para asignar al usuario.');
            return;
        }
        if (!newUserEmail || !newUserPass) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        try {
            const { error } = await supabase.rpc('crear_trabajador_finca', {
                p_email: newUserEmail,
                p_password: newUserPass,
                p_finca_ids: selectedFincas,
                p_rol: newUserRole
            });

            if (error) throw error;

            setMsjExito(`Usuario ${newUserEmail} creado y asignado a ${selectedFincas.length} fincas.`);
            setNewUserEmail('');
            setNewUserPass('');
            setSelectedFincas([fincaId || '']);
        } catch (err: any) {
            setMsjError('Error creando usuario: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPropietario = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoPropietario.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('propietarios')
                .insert({ id_finca: fincaId, nombre: nuevoPropietario.trim() });

            if (error) throw error;

            setNuevoPropietario('');
            fetchPropietarios();
            setMsjExito('Propietario agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar propietario: ' + (err.code === '23505' ? 'Ya existe un propietario con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removePropietario = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este propietario?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('propietarios').delete().eq('id', id);
            if (error) throw error;
            fetchPropietarios();
            setMsjExito('Propietario eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddProveedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoProveedor.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('proveedores')
                .insert({ id_finca: fincaId, nombre: nuevoProveedor.trim() });

            if (error) throw error;

            setNuevoProveedor('');
            fetchProveedores();
            setMsjExito('Proveedor agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar proveedor: ' + (err.code === '23505' ? 'Ya existe un proveedor con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeProveedor = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este proveedor?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('proveedores').delete().eq('id', id);
            if (error) throw error;
            fetchProveedores();
            setMsjExito('Proveedor eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddComprador = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoComprador.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('compradores')
                .insert({ id_finca: fincaId, nombre: nuevoComprador.trim() });

            if (error) throw error;

            setNuevoComprador('');
            fetchCompradores();
            setMsjExito('Comprador agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar comprador: ' + (err.code === '23505' ? 'Ya existe un comprador con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeComprador = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este comprador?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('compradores').delete().eq('id', id);
            if (error) throw error;
            fetchCompradores();
            setMsjExito('Comprador eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // handleAddPotrerada y removePotrerada movidos a Potreradas.tsx


    const handleBulkAnimalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['numero_chapeta', 'propietario', 'peso_ingreso', 'fecha_ingreso'];
                    const isWeighingFile = headers.includes('peso') && !headers.includes('peso_ingreso');
                    const isRotationFile = headers.includes('nombre_rotacion') || headers.includes('nombre_potrero');

                    if (isWeighingFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de SEGUIMIENTO DE PESAJES en la sección de INVENTARIO. Por favor, use la sección correcta.');
                    }
                    if (isRotationFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de ROTACIONES en la sección de INVENTARIO.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Inventario. Faltan columnas: ${missing.join(', ')}`);
                    }
                    // 1. Obtener mapeos de potreradas y potreros existentes
                    const { data: pds } = await supabase.from('potreradas').select('id, nombre').eq('id_finca', fincaId);
                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);

                    const mapPotreradas = new Map(pds?.map(p => [p.nombre.toLowerCase().trim(), p.id]));
                    const mapPotreros = new Map(pts?.map(p => [p.nombre.toLowerCase().trim(), p.id]));

                    // 2. Detectar potreradas nuevas que vengan en el CSV y crearlas
                    //    Usamos la etapa del animal para la potrerada
                    const potreradasNuevas = new Map<string, string>(); // nombre_lower -> etapa
                    results.data.forEach((row: any) => {
                        const nombre = row.potrerada?.toString().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';
                        if (nombre && !mapPotreradas.has(nombre.toLowerCase())) {
                            potreradasNuevas.set(nombre.toLowerCase(), etapa);
                        }
                    });

                    if (potreradasNuevas.size > 0) {
                        // Obtener nombre original (con capitalización) del CSV para insertar
                        const inserts = results.data.reduce((acc: any[], row: any) => {
                            const nombre = row.potrerada?.toString().trim();
                            const nombreLower = nombre?.toLowerCase();
                            if (nombre && potreradasNuevas.has(nombreLower) && !acc.find(a => a.nombre.toLowerCase() === nombreLower)) {
                                acc.push({
                                    id_finca: fincaId,
                                    nombre: nombre,
                                    etapa: row.etapa?.toLowerCase() || 'levante'
                                });
                            }
                            return acc;
                        }, []);

                        const { data: creadas, error: errCreate } = await supabase
                            .from('potreradas')
                            .insert(inserts)
                            .select('id, nombre');

                        if (errCreate) throw new Error(`Error al crear potreradas: ${errCreate.message}`);

                        // Agregar al mapa las recién creadas
                        creadas?.forEach(p => mapPotreradas.set(p.nombre.toLowerCase().trim(), p.id));
                    }

                    // 3. Construir filas de animales con IDs resueltos
                    const rows = results.data.map((row: any) => {
                        const potreradaNombre = row.potrerada?.toString().toLowerCase().trim();
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';
                        
                        // Mapeo flexible de fechas
                        const rawFecha = row.fecha_ingreso || row['fecha_ingreso(Año-Mes-Día)'] || row.fecha_ingreso_ceba || row.fecha || row.Fecha;
                        const fechaFinal = parseFechaCol(rawFecha) || new Date().toISOString().split('T')[0];
                        const pesoIngreso = parseFloat(row.peso_ingreso) || 0;

                        return {
                            id_finca: fincaId,
                            numero_chapeta: row.numero_chapeta?.toString().trim(),
                            nombre_propietario: row.propietario || 'Sin Datos',
                            especie: row.especie?.toLowerCase() || 'bovino',
                            sexo: row.sexo?.toUpperCase() || 'M',
                            etapa: etapa,
                            fecha_ingreso: fechaFinal,
                            peso_ingreso: pesoIngreso,
                            id_potrerada: potreradaNombre ? (mapPotreradas.get(potreradaNombre) ?? null) : null,
                            id_potrero_actual: potreroNombre ? (mapPotreros.get(potreroNombre) ?? null) : null,
                            estado: 'activo',
                            // Nuevos campos para trazabilidad de ceba
                            fecha_ingreso_ceba: etapa === 'ceba' ? fechaFinal : null,
                            peso_ingreso_ceba: etapa === 'ceba' ? pesoIngreso : null,
                            ok_ceba: false,
                            // Campos opcionales de compra
                            proveedor_compra: row.proveedor || row.proveedor_compra || null,
                            observaciones_compra: row.observaciones || row.observaciones_compra || null
                        };
                    });

                    const chapetas = rows.map((r: any) => r.numero_chapeta);
                    if (chapetas.some((c: any) => !c)) throw new Error("Todas las filas deben tener un número de chapeta.");
                    
                    const omitidosList: string[] = [];
                    const rowsUnicos: any[] = [];
                    const chapetasVistas = new Set<string>();

                    for (const r of rows) {
                        if (chapetasVistas.has(r.numero_chapeta)) {
                            omitidosList.push(`${r.numero_chapeta} (Duplicado en CSV)`);
                        } else {
                            chapetasVistas.add(r.numero_chapeta);
                            rowsUnicos.push(r);
                        }
                    }

                    // 4. Identificar animales existentes en la base de datos
                    const chapetasUnicas = Array.from(chapetasVistas);
                    const { data: existentes, error: checkError } = await supabase
                        .from('animales')
                        .select('id, numero_chapeta')
                        .eq('id_finca', fincaId)
                        .in('numero_chapeta', chapetasUnicas);

                    if (checkError) throw checkError;

                    const existentesMap = new Map(existentes?.map(e => [e.numero_chapeta, e.id]) ?? []);
                    
                    // Lógica solicitada: OMITIR los que ya existen
                    const rowsNuevos = rowsUnicos.filter((r: any) => {
                        if (existentesMap.has(r.numero_chapeta)) {
                            omitidosList.push(`${r.numero_chapeta} (Ya existe)`);
                            return false;
                        }
                        return true;
                    });

                    // 5. Insertar animales nuevos
                    let insertados = 0;
                    if (rowsNuevos.length > 0) {
                        const { data: nuevosAnimales, error: errIns } = await supabase
                            .from('animales')
                            .insert(rowsNuevos)
                            .select();
                        if (errIns) throw errIns;
                        insertados = nuevosAnimales?.length ?? 0;
                    }

                    // 6. Preparar reporte detallado
                    setReporteCarga({
                        tipo: 'animales',
                        creados: insertados,
                        actualizados: 0,
                        omitidos: omitidosList.length,
                        omitidosList: omitidosList
                    });

                    const msgPotreradas = potreradasNuevas.size > 0
                        ? ` Además, se crearon ${potreradasNuevas.size} potrerada(s) nueva(s).`
                        : '';
                    
                    setMsjExito(`¡Proceso completado!${msgPotreradas}`);
                    setShowExitoModal(true);
                } catch (err: any) {
                    setMsjError('Error en carga de animales: ' + err.message);
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkPesajeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['numero_chapeta', 'peso', 'fecha'];
                    const isInventoryFile = headers.includes('peso_ingreso') || headers.includes('propietario');
                    const isRotationFile = headers.includes('nombre_rotacion') || headers.includes('nombre_potrero');

                    if (isInventoryFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de INVENTARIO en la sección de PESAJES. Por favor, use la sección correcta.');
                    }
                    if (isRotationFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de ROTACIONES en la sección de PESAJES.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Seguimiento de Pesajes. Faltan columnas: ${missing.join(', ')}`);
                    }

                    // 1. Obtener animales existentes, pero solo los que vengan en el CSV para no superar el límite de 1000 de Supabase.
                    const chapetasCrudas = results.data
                        .map((r: any) => r.numero_chapeta?.toString().trim())
                        .filter(Boolean);
                    const chapetasEnCSVUnicas = Array.from(new Set(chapetasCrudas));

                    const animalesData: any[] = [];
                    for (let i = 0; i < chapetasEnCSVUnicas.length; i += 200) {
                        const batch = chapetasEnCSVUnicas.slice(i, i + 200);
                        const { data, error: animError } = await supabase
                            .from('animales')
                            .select('id, numero_chapeta, etapa, fecha_ingreso, peso_ingreso, fecha_ingreso_ceba, peso_ingreso_ceba')
                            .eq('id_finca', fincaId)
                            .in('numero_chapeta', batch);

                        if (animError) throw new Error("No se pudieron cargar los datos de los animales");
                        if (data) animalesData.push(...data);
                    }

                    let mapAnimales = new Map(animalesData.map(a => [
                        a.numero_chapeta.toString().trim().toLowerCase(),
                        { 
                            id: a.id, 
                            etapa: a.etapa, 
                            fecha_ingreso: a.fecha_ingreso, 
                            peso_ingreso: a.peso_ingreso,
                            fecha_ingreso_ceba: a.fecha_ingreso_ceba,
                        }
                    ]));

                    // 2. Identificar cuáles animales del CSV NO existen en la base de datos
                    const omitidosNoExistentes: string[] = [];
                    const chapetasEnCSV = new Set<string>();
                    
                    results.data.forEach((row: any) => {
                        const chapeta = row.numero_chapeta?.toString().trim();
                        if (chapeta) {
                            chapetasEnCSV.add(chapeta);
                            if (!mapAnimales.has(chapeta.toLowerCase())) {
                                if (!omitidosNoExistentes.includes(chapeta)) {
                                    omitidosNoExistentes.push(chapeta);
                                }
                            }
                        }
                    });

                    // 3. Obtener pesajes existentes para evitar duplicados (POR LOTES de 200 para evitar Bad Request por URL larga)
                    const idsAnimalesEnCSV = Array.from(mapAnimales.values()).map(a => a.id);
                    const pesajesExistentes: any[] = [];
                    const batchSize = 200;

                    for (let i = 0; i < idsAnimalesEnCSV.length; i += batchSize) {
                        const batch = idsAnimalesEnCSV.slice(i, i + batchSize);
                        const { data: batchData, error: errPesajes } = await supabase
                            .from('registros_pesaje')
                            .select('id_animal, fecha, peso')
                            .in('id_animal', batch);
                        
                        if (errPesajes) throw new Error(`Error verificando duplicados de pesaje: ${errPesajes.message}`);
                        if (batchData) pesajesExistentes.push(...batchData);
                    }

                    const setDuplicados = new Set(pesajesExistentes?.map(p => `${p.id_animal}|${p.fecha}|${p.peso}`));

                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);
                    const mapPotreros = new Map(pts?.map(p => [p.nombre.toLowerCase().trim(), p.id]));

                    const recordsInsert: any[] = [];
                    const errores: string[] = [];
                    const cebaUpdates = new Map<string, { fecha: string, peso: number }>();
                    const ingresoAActualizar = new Map<string, { fecha: string; peso: number }>();

                    let omitidosDuplicados = 0;

                    results.data.forEach((row: any, index: number) => {
                        const chapeta = row.numero_chapeta?.toString().trim();
                        if (!chapeta) return;

                        const anim = mapAnimales.get(chapeta.toLowerCase());
                        if (!anim) return; // Ya debería existir

                        const peso = parseFloat(row.peso);
                        const rawFecha = row.fecha || row['fecha(Año-Mes-Día)'] || row['Fecha'];
                        const fecha = parseFechaCol(rawFecha) || new Date().toISOString().split('T')[0];
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();

                        if (isNaN(peso) || peso <= 0) {
                            errores.push(`Fila ${index + 2}: Peso inválido.`);
                            return;
                        }

                        // VALIDACIÓN DE DUPLICADOS (Idempotencia)
                        const key = `${anim.id}|${fecha}|${peso}`;
                        if (setDuplicados.has(key)) {
                            omitidosDuplicados++;
                            return;
                        }

                        // Evitar duplicados dentro del mismo archivo (Intra-CSV)
                        setDuplicados.add(key);

                        const etapaCSV = row.etapa?.toString().toLowerCase().trim();
                        let etapaFinal = (etapaCSV === 'cria' || etapaCSV === 'levante' || etapaCSV === 'ceba') 
                            ? etapaCSV 
                            : anim.etapa;

                        recordsInsert.push({
                            id_animal: anim.id,
                            peso,
                            fecha,
                            etapa: etapaFinal,
                            id_potrero: potreroNombre ? mapPotreros.get(potreroNombre) : null
                        });

                        // Lógica de actualización de fechas de ingreso (Ingreso antiguo)
                        if (fecha < anim.fecha_ingreso) {
                            const actualUpdate = ingresoAActualizar.get(anim.id);
                            if (!actualUpdate || fecha < actualUpdate.fecha) {
                                ingresoAActualizar.set(anim.id, { fecha, peso });
                            }
                        }

                        // Lógica de paso a ceba
                        if (etapaFinal === 'ceba') {
                            const fechaDB = anim.fecha_ingreso_ceba;
                            const actualBuffer = cebaUpdates.get(anim.id);
                            if (!fechaDB || fecha < fechaDB) {
                                if (!actualBuffer || fecha < actualBuffer.fecha) {
                                    cebaUpdates.set(anim.id, { fecha, peso });
                                }
                            }
                        }
                    });

                    if (recordsInsert.length === 0 && omitidosDuplicados === 0) {
                        throw new Error("El archivo no contenía datos válidos.");
                    }

                    // 4. Ejecutar actualizaciones de animales (Ingreso y Ceba)
                    let animalesIngresoActualizados = 0;
                    if (ingresoAActualizar.size > 0) {
                        for (const [idAnimal, nuevoDato] of ingresoAActualizar.entries()) {
                            const { error: updErr } = await supabase
                                .from('animales')
                                .update({ fecha_ingreso: nuevoDato.fecha, peso_ingreso: nuevoDato.peso })
                                .eq('id', idAnimal);
                            if (!updErr) animalesIngresoActualizados++;
                        }
                    }

                    if (cebaUpdates.size > 0) {
                        for (const [id, data] of cebaUpdates.entries()) {
                            await supabase
                                .from('animales')
                                .update({ 
                                    etapa: 'ceba', 
                                    ok_ceba: true,
                                    fecha_ingreso_ceba: data.fecha,
                                    peso_ingreso_ceba: data.peso
                                })
                                .eq('id', id);
                        }
                    }

                    // 5. Insertar los nuevos pesajes
                    let pesajesInsertados = 0;
                    if (recordsInsert.length > 0) {
                        const { error: insertError } = await supabase.from('registros_pesaje').insert(recordsInsert);
                        if (insertError) throw insertError;
                        pesajesInsertados = recordsInsert.length;
                    }

                    // 6. Mensaje de éxito detallado
                    let msg = `¡Carga estricta completada!`;
                    const resultados = [];
                    if (pesajesInsertados > 0) resultados.push(`se registraron ${pesajesInsertados} pesajes`);
                    if (omitidosDuplicados > 0) resultados.push(`se omitieron ${omitidosDuplicados} duplicados`);
                    if (omitidosNoExistentes.length > 0) resultados.push(`se ignoraron registros de ${omitidosNoExistentes.length} animales que no existen`);
                    
                    if (resultados.length > 0) {
                        msg += ` Resultados: ${resultados.join(', ')}.`;
                    }
                    if (animalesIngresoActualizados > 0) {
                        msg += ` Además, se recalibró el ingreso de ${animalesIngresoActualizados} animales.`;
                    }

                    // Reporte detallado para pesajes
                    setReporteCarga({
                        tipo: 'pesajes',
                        creados: pesajesInsertados,
                        actualizados: animalesIngresoActualizados,
                        omitidos: omitidosDuplicados + omitidosNoExistentes.length,
                        omitidosList: omitidosNoExistentes // Mostramos los animales que faltan en el inventario
                    });

                    setMsjExito(msg);
                    setShowExitoModal(true);
                    if (errores.length > 0) {
                        setMsjError(`Inconsistencias omitidas:\n${errores.join('\n')}`);
                        setShowErrorModal(true);
                    }
                } catch (err: any) {
                    setMsjError(err.message || 'Error procesando el archivo CSV.');
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkRotacionesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['nombre_rotacion', 'nombre_potrero', 'area_hectareas'];
                    const isInventoryFile = headers.includes('peso_ingreso') || headers.includes('numero_chapeta');
                    const isWeighingFile = headers.includes('peso') && !headers.includes('area_hectareas');

                    if (isInventoryFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de INVENTARIO en la sección de ROTACIONES.');
                    }
                    if (isWeighingFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de PESAJES en la sección de ROTACIONES.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Rotaciones y Potreros. Faltan columnas: ${missing.join(', ')}`);
                    }

                    // 1. Obtener datos existentes
                    const { data: exRot } = await supabase.from('rotaciones').select('id, nombre').eq('id_finca', fincaId);
                    const { data: exPot } = await supabase.from('potreros').select('id, nombre, id_rotacion').eq('id_finca', fincaId);

                    const mapRotaciones = new Map(exRot?.map(r => [r.nombre.toLowerCase().trim(), r.id]));
                    const mapPotreros = new Map(exPot?.map(p => [p.nombre.toLowerCase().trim(), { id: p.id, id_rotacion: p.id_rotacion }]));

                    // 2. Identificar rotaciones nuevas
                    const rotacionesNuevas = new Map<string, string>(); // nombre_lower -> original
                    (results.data as any[]).forEach((row: any) => {
                        const rotName = row.nombre_rotacion?.toString().trim();
                        if (rotName && !mapRotaciones.has(rotName.toLowerCase())) {
                            rotacionesNuevas.set(rotName.toLowerCase(), rotName);
                        }
                    });

                    if (rotacionesNuevas.size > 0) {
                        const inserts = Array.from(rotacionesNuevas.values()).map(nombre => ({
                            id_finca: fincaId,
                            nombre: nombre
                        }));
                        const { data: creadas, error: rotErr } = await supabase.from('rotaciones').insert(inserts).select();
                        if (rotErr) throw rotErr;
                        creadas?.forEach(r => mapRotaciones.set(r.nombre.toLowerCase().trim(), r.id));
                    }

                    // 3. Procesar potreros
                    const recordsPotreros: any[] = [];
                    let updatesPotrerosCnt = 0;

                    for (const row of results.data as any[]) {
                        const potName = row.nombre_potrero?.toString().trim();
                        const rotName = row.nombre_rotacion?.toString().trim();
                        const area = parseFloat(row.area_hectareas) || 0;
                        const rotId = rotName ? mapRotaciones.get(rotName.toLowerCase()) : null;

                        if (!potName) continue;

                        const existingPot = mapPotreros.get(potName.toLowerCase());
                        if (existingPot) {
                            // Si el potrero ya existe, actualizamos su área. 
                            // Y solo cambiamos la rotación si se proporcionó una nueva.
                            const updateData: any = { area_hectareas: area };
                            if (rotId) {
                                updateData.id_rotacion = rotId;
                            }
                            
                            const { error: potUpdErr } = await supabase
                                .from('potreros')
                                .update(updateData)
                                .eq('id', existingPot.id);
                            if (potUpdErr) throw potUpdErr;
                            updatesPotrerosCnt++;
                        } else {
                            recordsPotreros.push({
                                id_finca: fincaId,
                                nombre: potName,
                                area_hectareas: area,
                                id_rotacion: rotId
                            });
                        }
                    }

                    if (recordsPotreros.length > 0) {
                        const { error: potInsErr } = await supabase.from('potreros').insert(recordsPotreros);
                        if (potInsErr) throw potInsErr;
                    }

                    setMsjExito(`¡Carga exitosa! Se crearon ${recordsPotreros.length} potreros nuevos y se actualizaron ${updatesPotrerosCnt} existentes.`);
                    setShowExitoModal(true);
                } catch (err: any) {
                    setMsjError(err.message || 'Error procesando el archivo CSV.');
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    if (e.target) e.target.value = '';
                }
            }
        });
    };

    const sectionCards = [
        { id: 'seguridad', label: 'Seguridad', icon: <Lock size={28} />, desc: 'Cuenta y acceso' },
        { id: 'datosTecnicos', label: 'Parámetros', icon: <Home size={28} />, desc: 'KPIs y Finca' },
        { id: 'usuarios', label: 'Personal', icon: <Users size={28} />, desc: 'Gestión de equipo' },
        { id: 'contactosNegocio', label: 'Negocios', icon: <Briefcase size={28} />, desc: 'Contactos y socios' },
        { id: 'cargasMasivas', label: 'Carga Masiva', icon: <Upload size={28} />, desc: 'Importar CSV/Excel' }
    ];


    return (
        <div className="page-container" style={{ maxWidth: '800px' }}>
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '32px' }}>
                <SettingsIcon size={32} /> {role === 'administrador' ? 'Ajustes y Gestión de la Finca' : 'Mi Perfil'}
            </h1>

            {/* Modal de Éxito para Cargas Masivas */}
            {showExitoModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', border: '1px solid var(--primary)', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                            <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', padding: '16px', borderRadius: '50%' }}>
                                <CheckCircle2 size={48} color="var(--primary)" />
                            </div>
                        </div>
                        <h2 style={{ marginBottom: '8px', color: 'white' }}>¡Importación Finalizada!</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                            {msjExito}
                        </p>

                        {reporteCarga && (
                            <div style={{ textAlign: 'left', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ color: 'var(--primary-light)', marginBottom: '16px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Resumen de Operación</h4>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ color: 'white', fontSize: '1.4rem', fontWeight: 'bold' }}>{reporteCarga.creados}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>CREADOS</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ color: 'white', fontSize: '1.4rem', fontWeight: 'bold' }}>{reporteCarga.actualizados}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>ACTUALIZADOS</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ color: '#ef5350', fontSize: '1.4rem', fontWeight: 'bold' }}>{reporteCarga.omitidos}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>OMITIDOS</div>
                                    </div>
                                </div>

                                {reporteCarga.omitidosList.length > 0 && (
                                    <>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Chapetas omitidas (por duplicidad):</span>
                                        </div>
                                        <div style={{ 
                                            backgroundColor: 'rgba(0,0,0,0.2)', 
                                            padding: '10px', 
                                            borderRadius: '8px', 
                                            fontSize: '0.85rem', 
                                            color: '#ef5350',
                                            maxHeight: '100px',
                                            overflowY: 'auto',
                                            wordBreak: 'break-all',
                                            lineHeight: '1.4'
                                        }}>
                                            {reporteCarga.omitidosList.join(', ')}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => { setShowExitoModal(false); setMsjExito(''); setReporteCarga(null); }}
                            style={{ backgroundColor: 'var(--primary)', padding: '12px 40px', fontSize: '1rem', width: '100%' }}
                        >
                            Cerrar Reporte
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Error para Cargas Masivas / Errores Críticos */}
            {showErrorModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', border: '1px solid #ef5350', padding: '40px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                            <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.1)', padding: '20px', borderRadius: '50%' }}>
                                <Upload size={60} color="#ef5350" />
                            </div>
                        </div>
                        <h2 style={{ marginBottom: '16px', color: 'white' }}>Error en la Carga</h2>
                        <div style={{ 
                            backgroundColor: 'rgba(244, 67, 54, 0.05)', 
                            padding: '20px', 
                            borderRadius: '12px', 
                            marginBottom: '32px',
                            border: '1px solid rgba(244, 67, 54, 0.1)',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            <p style={{ color: '#ef5350', fontSize: '1.05rem', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
                                {msjError}
                            </p>
                        </div>
                        <button
                            onClick={() => { setShowErrorModal(false); setMsjError(''); }}
                            style={{ backgroundColor: '#ef5350', color: 'white', padding: '12px 40px', fontSize: '1rem', border: 'none' }}
                        >
                            Corregir Archivo
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
                {(role === 'administrador' || isSuperAdmin) && (
                    <>
                        {/* Dashboard de Ajustes (Grid) */}
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                            gap: '16px', 
                            marginBottom: '32px' 
                        }}>
                            {sectionCards.map(section => {
                                const isActive = !collapsed[section.id as keyof typeof collapsed];
                                return (
                                    <div 
                                        key={section.id}
                                        onClick={() => toggleSection(section.id as any)}
                                        className="card"
                                        style={{ 
                                            margin: 0,
                                            padding: '24px 16px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            textAlign: 'center',
                                            gap: '12px',
                                            border: '2px solid',
                                            borderColor: isActive ? 'var(--primary)' : 'transparent',
                                            background: isActive ? 'rgba(76, 175, 80, 0.08)' : 'rgba(255,255,255,0.02)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            transform: isActive ? 'scale(1.02)' : 'none',
                                            boxShadow: isActive ? '0 10px 20px rgba(0,0,0,0.2)' : 'none'
                                        }}
                                    >
                                        <div style={{ 
                                            color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                                            transition: 'color 0.3s'
                                        }}>
                                            {section.icon}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ 
                                                fontWeight: 'bold', 
                                                fontSize: '1rem',
                                                color: isActive ? 'white' : 'var(--text-muted)'
                                            }}>{section.label}</span>
                                            <small style={{ 
                                                fontSize: '0.75rem', 
                                                color: 'var(--text-muted)',
                                                opacity: 0.8
                                            }}>{section.desc}</small>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Contenido de las Secciones */}
                        <div style={{ position: 'relative' }}>
                            {/* Seguridad */}
                            {!collapsed.seguridad && (
                                <div className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Lock size={20} color="var(--primary)" /> Seguridad de la Cuenta
                                    </h3>
                                    <form onSubmit={handleUpdatePassword}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                            <div>
                                                <label>Nueva Contraseña</label>
                                                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                                            </div>
                                            <div>
                                                <label>Confirmar Contraseña</label>
                                                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                                            </div>
                                        </div>
                                        <button type="submit" disabled={loading} style={{ width: 'auto' }}>
                                            {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Datos Técnicos y Parámetros */}
                            {!collapsed.datosTecnicos && (
                                <div className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Home size={20} color="var(--primary)" /> Datos Técnicos y Parámetros
                                    </h3>
                                    <form onSubmit={guardarConfiguracionYFinca}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Maximize size={16} /> Área Total (Ha)</label>
                                                <input type="number" step="0.01" value={farmInfo.area_total} onChange={e => setFarmInfo({ ...farmInfo, area_total: e.target.value })} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} /> Área Aprovechable (Ha)</label>
                                                <input type="number" step="0.01" value={farmInfo.area_aprovechable} onChange={e => setFarmInfo({ ...farmInfo, area_aprovechable: e.target.value })} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} /> Ubicación</label>
                                                <input type="text" value={farmInfo.ubicacion} onChange={e => setFarmInfo({ ...farmInfo, ubicacion: e.target.value })} />
                                            </div>
                                            <div>
                                                <label>Propósito</label>
                                                <select value={farmInfo.proposito} onChange={e => setFarmInfo({ ...farmInfo, proposito: e.target.value })}>
                                                    <option value="">Seleccione...</option>
                                                    <option value="Doble propósito">Doble propósito</option>
                                                    <option value="producción de carne">Producción de carne</option>
                                                    <option value="Producción de leche">Producción de leche</option>
                                                    <option value="cría">Cría</option>
                                                    <option value="Levante">Levante</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label>Precio Venta (COP/kg)</label>
                                                <input type="number" value={farmInfo.precio_venta_promedio} onChange={e => setFarmInfo({ ...farmInfo, precio_venta_promedio: e.target.value })} />
                                            </div>
                                            <div>
                                                <label>Entrada Ceba (kg)</label>
                                                <input type="number" step="0.5" value={farmInfo.peso_entrada_ceba} onChange={e => setFarmInfo({ ...farmInfo, peso_entrada_ceba: e.target.value })} />
                                            </div>
                                        </div>

                                        <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>Umbrales (Semáforo GMP)</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                            <div>
                                                <label>Umbral Bajo GDP (kg/día)</label>
                                                <input type="number" step="0.001" value={umbral} onChange={(e) => setUmbral(e.target.value)} />
                                            </div>
                                            <div>
                                                <label>Límite Superior Rojo (kg/mes)</label>
                                                <input type="number" step="0.1" value={umbralMedioGMP} onChange={(e) => setUmbralMedioGMP(e.target.value)} />
                                            </div>
                                            <div>
                                                <label>Límite Superior Amarillo (kg/mes)</label>
                                                <input type="number" step="0.1" value={umbralAltoGMP} onChange={(e) => setUmbralAltoGMP(e.target.value)} />
                                            </div>
                                            <div>
                                                <label>Consumo en Potrero (Kg/día)</label>
                                                <input type="number" step="0.1" value={farmInfo.consumo_dia_potrero} onChange={(e) => setFarmInfo({ ...farmInfo, consumo_dia_potrero: e.target.value })} required />
                                            </div>
                                        </div>

                                        <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary-dark)', border: '1px solid var(--primary)' }}>
                                            {loading ? 'Guardando...' : 'Guardar Información'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Gestión de Personal */}
                            {!collapsed.usuarios && (
                                <div className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Users size={20} color="var(--primary)" /> Gestión de Personal
                                    </h3>
                                    <form onSubmit={handleCreateUser}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label>Correo Electrónico</label>
                                                <input type="email" placeholder="trabajador@finca.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required />
                                            </div>
                                            <div>
                                                <label>Contraseña Temporal</label>
                                                <input type="text" value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} required />
                                            </div>
                                            <div>
                                                <label>Perfil / Rol</label>
                                                <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as any)}>
                                                    <option value="vaquero">Trabajador / Vaquero</option>
                                                    <option value="observador">Visualizador / Observador</option>
                                                </select>
                                            </div>
                                        </div>

                                        <label style={{ marginBottom: '12px', display: 'block' }}>Asignar a Fincas:</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            {fincasAdmin.map(f => (
                                                <div key={f.id_finca} onClick={() => toggleFincaSelection(f.id_finca)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', cursor: 'pointer', backgroundColor: selectedFincas.includes(f.id_finca) ? 'rgba(76, 175, 80, 0.1)' : 'transparent', border: '1px solid', borderColor: selectedFincas.includes(f.id_finca) ? 'var(--primary)' : 'transparent' }}>
                                                    {selectedFincas.includes(f.id_finca) ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} color="var(--text-muted)" />}
                                                    <span style={{ fontSize: '0.85rem' }}>{f.nombre_finca}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary)' }}>
                                            <UserPlus size={18} /> {loading ? 'Creando Usuario...' : 'Crear Usuario'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Contactos de Negocio */}
                            {!collapsed.contactosNegocio && (
                                <div className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Briefcase size={20} color="var(--primary)" /> Contactos de Negocios
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                                        <div>
                                            <h4 style={{ color: 'var(--primary-light)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16}/> Propietarios</h4>
                                            <form onSubmit={handleAddPropietario} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                                <input type="text" placeholder="Nuevo Propietario" value={nuevoPropietario} onChange={e => setNuevoPropietario(e.target.value)} style={{ margin: 0 }} />
                                                <button type="submit" style={{ width: 'auto' }} disabled={loading}><Plus size={18}/></button>
                                            </form>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                                {propietarios.map(p => (
                                                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                        <span style={{ fontSize: '0.9rem' }}>{p.nombre}</span>
                                                        <Trash2 size={16} style={{ cursor: 'pointer', color: '#ef5350' }} onClick={() => removePropietario(p.id)} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px' }}>
                                            <div>
                                                <h4 style={{ color: 'var(--primary-light)', marginBottom: '12px' }}><Truck size={16}/> Proveedores</h4>
                                                <form onSubmit={handleAddProveedor} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                                    <input type="text" placeholder="Nuevo Proveedor" value={nuevoProveedor} onChange={e => setNuevoProveedor(e.target.value)} style={{ margin: 0 }} />
                                                    <button type="submit" style={{ width: 'auto' }} disabled={loading}><Plus size={18}/></button>
                                                </form>
                                                {proveedores.map(p => <div key={p.id} style={{ padding: '8px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>{p.nombre}<Trash2 size={14} style={{ color: '#ef5350', cursor: 'pointer' }} onClick={() => removeProveedor(p.id)}/></div>)}
                                            </div>
                                            <div>
                                                <h4 style={{ color: 'var(--primary-light)', marginBottom: '12px' }}><ShoppingCart size={16}/> Compradores</h4>
                                                <form onSubmit={handleAddComprador} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                                    <input type="text" placeholder="Nuevo Comprador" value={nuevoComprador} onChange={e => setNuevoComprador(e.target.value)} style={{ margin: 0 }} />
                                                    <button type="submit" style={{ width: 'auto' }} disabled={loading}><Plus size={18}/></button>
                                                </form>
                                                {compradores.map(c => <div key={c.id} style={{ padding: '8px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>{c.nombre}<Trash2 size={14} style={{ color: '#ef5350', cursor: 'pointer' }} onClick={() => removeComprador(c.id)}/></div>)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Cargas Masivas */}
                            {!collapsed.cargasMasivas && (
                                <div className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                    <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Upload size={20} color="var(--primary)" /> Carga Masiva (CSV)
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                        <div style={{ padding: '20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                            <FileText size={24} style={{ marginBottom: '12px', color: 'var(--primary)' }} />
                                            <h4 style={{ marginBottom: '8px' }}>Inventario</h4>
                                            <button onClick={() => document.getElementById('bulkAnimalSettings')?.click()} style={{ width: '100%', marginBottom: '10px' }}>Subir CSV</button>
                                            <a href="/plantilla_animales.csv" download style={{ fontSize: '0.8rem', color: 'var(--primary-light)' }}>Plantilla</a>
                                            <input type="file" id="bulkAnimalSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkAnimalUpload} />
                                        </div>
                                        <div style={{ padding: '20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                            <Maximize size={24} style={{ marginBottom: '12px', color: 'var(--primary)' }} />
                                            <h4 style={{ marginBottom: '8px' }}>Pesajes</h4>
                                            <button onClick={() => document.getElementById('bulkPesajeSettings')?.click()} style={{ width: '100%', marginBottom: '10px' }}>Subir CSV</button>
                                            <a href="/plantilla_pesajes.csv" download style={{ fontSize: '0.8rem', color: 'var(--primary-light)' }}>Plantilla</a>
                                            <input type="file" id="bulkPesajeSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkPesajeUpload} />
                                        </div>
                                        <div style={{ padding: '20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                            <Upload size={24} style={{ marginBottom: '12px', color: 'var(--primary)' }} />
                                            <h4 style={{ marginBottom: '8px' }}>Rotaciones</h4>
                                            <button onClick={() => document.getElementById('bulkRotacionSettings')?.click()} style={{ width: '100%', marginBottom: '10px' }}>Subir CSV</button>
                                            <a href="/plantilla_rotaciones_potreros.csv" download style={{ fontSize: '0.8rem', color: 'var(--primary-light)' }}>Plantilla</a>
                                            <input type="file" id="bulkRotacionSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkRotacionesUpload} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
