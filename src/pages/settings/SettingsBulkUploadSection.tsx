import { useCallback, useEffect, useState } from 'react';
import { Upload, FileText, Maximize, Trash2 } from 'lucide-react';
// @ts-ignore type definitions for papaparse are throwing a false positive in the IDE
import Papa from 'papaparse';
import { supabase } from '../../lib/supabase';
import { useFeedback } from '../../contexts/UiFeedbackContext';
import { recalcularHistorialPesajesAnimal } from '../../utils/gananciaRecalculator';
import { getLocalIsoDate, getGanadoDateError } from '../../utils/dateUtils';
import { parseDecimalInput } from '../../utils/decimalInput';
import { cleanNumber, parseFechaCol, type CargaMasivaItem, type ReporteCargaMasiva } from './types';

interface SettingsBulkUploadSectionProps {
    fincaId: string | null;
    onSetLoading: (val: boolean) => void;
    onSetImportProgress: (prog: { current: number; total: number } | null) => void;
    onClearInlineStatus: () => void;
    onShowReporte: (mensaje: string, reporte: ReporteCargaMasiva) => void;
    refreshLicencia: () => Promise<void>;
}

export default function SettingsBulkUploadSection({
    fincaId,
    onSetLoading,
    onSetImportProgress,
    onClearInlineStatus,
    onShowReporte,
    refreshLicencia
}: SettingsBulkUploadSectionProps) {
    const { showAlert, confirmAction } = useFeedback();
    const [cargasMasivasHoy, setCargasMasivasHoy] = useState<CargaMasivaItem[]>([]);

    const fetchCargasMasivasHoy = useCallback(async () => {
        if (!fincaId) return;
        const hoy = getLocalIsoDate();
        const { data, error } = await supabase
            .from('cargas_masivas')
            .select('id, tipo, nombre_archivo, total_registros, fecha_carga, creado_en, estado')
            .eq('id_finca', fincaId)
            .eq('fecha_carga', hoy)
            .eq('estado', 'activa')
            .order('creado_en', { ascending: false });

        if (!error && data) {
            setCargasMasivasHoy(data as CargaMasivaItem[]);
        }
    }, [fincaId]);

    useEffect(() => {
        void fetchCargasMasivasHoy();
    }, [fetchCargasMasivasHoy]);

    const handleRevertirCargaMasiva = async (carga: CargaMasivaItem) => {
        const tipoLabel = carga.tipo === 'animales' ? 'animales' : 'pesajes';
        const confirmed = await confirmAction(
            `Se revertirá la carga de ${tipoLabel} "${carga.nombre_archivo || 'archivo CSV'}" (${carga.total_registros} registros) y se eliminarán los datos cargados en esta importación.`,
            {
                title: '¿Revertir carga masiva?',
                confirmLabel: 'Sí, revertir carga',
                cancelLabel: 'Cancelar',
                destructive: true,
            }
        );
        if (!confirmed) return;

        onSetLoading(true);
        onClearInlineStatus();

        try {
            if (carga.tipo === 'animales') {
                const { data: animalesCarga, error: errCheck } = await supabase
                    .from('animales')
                    .select('id, numero_chapeta, fecha_venta')
                    .eq('id_carga_masiva', carga.id);

                if (errCheck) throw errCheck;

                const conVenta = animalesCarga?.filter((a: any) => a.fecha_venta) || [];
                if (conVenta.length > 0) {
                    throw new Error(`No se puede deshacer la carga: ${conVenta.length} animal(es) ya tienen ventas registradas (ej. #${conVenta[0].numero_chapeta}).`);
                }

                const animalIds = animalesCarga?.map((a: any) => a.id) || [];
                if (animalIds.length > 0) {
                    await supabase.from('registros_pesaje').delete().in('id_animal', animalIds);
                    await supabase.from('animales').delete().eq('id_carga_masiva', carga.id);
                }

                await supabase.from('cargas_masivas').update({ estado: 'revertida' }).eq('id', carga.id);

                await refreshLicencia();
                await showAlert(
                    `Carga de animales "${carga.nombre_archivo}" revertida con éxito.`,
                    { title: '¡Importación Revertida!', variant: 'success', confirmLabel: 'Cerrar Reporte' }
                );
            } else if (carga.tipo === 'pesajes') {
                const { data: pesajesABorrar, error: errGetP } = await supabase
                    .from('registros_pesaje')
                    .select('id, id_animal')
                    .eq('id_carga_masiva', carga.id);

                if (errGetP) throw errGetP;

                const animalesAfectados = Array.from(new Set(pesajesABorrar?.map((p: any) => p.id_animal).filter(Boolean))) as string[];

                const { error: errDel } = await supabase
                    .from('registros_pesaje')
                    .delete()
                    .eq('id_carga_masiva', carga.id);

                if (errDel) throw errDel;

                await supabase.from('cargas_masivas').update({ estado: 'revertida' }).eq('id', carga.id);

                if (animalesAfectados.length > 0) {
                    const { error: rpcErr } = await supabase.rpc('recalcular_historial_pesajes_animales', { p_id_animales: animalesAfectados });
                    if (rpcErr) {
                        for (const aId of animalesAfectados) {
                            await recalcularHistorialPesajesAnimal(aId, supabase);
                        }
                    }
                }

                await showAlert(
                    `Carga de pesajes "${carga.nombre_archivo}" revertida y ganancias recalculadas con éxito.`,
                    { title: '¡Importación Revertida!', variant: 'success', confirmLabel: 'Cerrar Reporte' }
                );
            }

            await fetchCargasMasivasHoy();
        } catch (err: any) {
            await showAlert('Error al revertir la carga: ' + (err.message || err), {
                title: 'Error en la Carga',
                variant: 'error',
                confirmLabel: 'Cerrar',
            });
        } finally {
            onSetLoading(false);
        }
    };

    const handleBulkAnimalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        onSetLoading(true);
        onClearInlineStatus();

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

                    const { data: pds } = await supabase.from('potreradas').select('id, nombre').eq('id_finca', fincaId);
                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);

                    const mapPotreradas = new Map(pds?.map((p: any) => [p.nombre.toLowerCase().trim(), p.id]));
                    const mapPotreros = new Map(pts?.map((p: any) => [p.nombre.toLowerCase().trim(), p.id]));

                    const potrerosNoReconocidos = new Set<string>();
                    results.data.forEach((row: any) => {
                        const pNombre = row.potrero?.toString().trim();
                        if (pNombre && !mapPotreros.has(pNombre.toLowerCase())) {
                            potrerosNoReconocidos.add(pNombre);
                        }
                    });

                    if (potrerosNoReconocidos.size > 0) {
                        const lista = Array.from(potrerosNoReconocidos).join(', ');
                        throw new Error(`¡ERROR DE UBICACIÓN! Los siguientes potreros en tu Excel NO existen en la App: [${lista}]. Por favor, créalos en la sección de Potreros o corrige sus nombres en el Excel para que coincidan exactamente (ej. 'Iracales' vs 'Iracales 1').`);
                    }

                    const potreradasNuevas = new Map<string, string>();
                    results.data.forEach((row: any) => {
                        const nombre = row.potrerada?.toString().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';
                        if (nombre && !mapPotreradas.has(nombre.toLowerCase())) {
                            potreradasNuevas.set(nombre.toLowerCase(), etapa);
                        }
                    });

                    if (potreradasNuevas.size > 0) {
                        const inserts = results.data.reduce((acc: any[], row: any) => {
                            const nombre = row.potrerada?.toString().trim();
                            const nombreLower = nombre?.toLowerCase();
                            if (nombre && potreradasNuevas.has(nombreLower) && !acc.find(a => a.nombre.toLowerCase() === nombreLower)) {
                                acc.push({
                                    id_finca: fincaId,
                                    nombre,
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
                        creadas?.forEach((p: any) => mapPotreradas.set(p.nombre.toLowerCase().trim(), p.id));
                    }

                    const rows = results.data.map((row: any, index: number) => {
                        const potreradaNombre = row.potrerada?.toString().toLowerCase().trim();
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';

                        const rawFecha = row.fecha_ingreso || row['fecha_ingreso(Año-Mes-Día)'] || row.fecha_ingreso_ceba || row.fecha || row.Fecha;
                        const fechaFinal = parseFechaCol(rawFecha) || getLocalIsoDate();
                        const fechaErr = getGanadoDateError(fechaFinal, `Fila ${index + 2} (${row.numero_chapeta || 'sin chapeta'}): Fecha de ingreso`);
                        if (fechaErr) throw new Error(fechaErr);

                        const pesoIngreso = cleanNumber(row.peso_ingreso);
                        const sexoFinal = row.sexo?.toUpperCase() || 'M';
                        const tipoMachoCSV = row.tipo_macho?.toString().toLowerCase().trim();
                        const tipoMachoFinal = sexoFinal === 'M'
                            ? (tipoMachoCSV === 'novillo' ? 'novillo' : 'toro')
                            : null;

                        return {
                            id_finca: fincaId,
                            numero_chapeta: row.numero_chapeta?.toString().trim(),
                            nombre_propietario: row.propietario || 'Sin Datos',
                            especie: row.especie?.toLowerCase() || 'bovino',
                            sexo: sexoFinal,
                            etapa,
                            fecha_ingreso: fechaFinal,
                            peso_ingreso: pesoIngreso,
                            id_potrerada: potreradaNombre ? (mapPotreradas.get(potreradaNombre) ?? null) : null,
                            id_potrero_actual: potreroNombre ? (mapPotreros.get(potreroNombre) ?? null) : null,
                            estado: 'activo',
                            fecha_ingreso_ceba: etapa === 'ceba' ? fechaFinal : null,
                            peso_ingreso_ceba: etapa === 'ceba' ? pesoIngreso : null,
                            ok_ceba: false,
                            tipo_macho: tipoMachoFinal,
                            proveedor_compra: row.proveedor || row.proveedor_compra || null,
                            observaciones_compra: row.observaciones || row.observaciones_compra || null
                        };
                    });

                    const chapetas = rows.map((r: any) => r.numero_chapeta);
                    if (chapetas.some((c: any) => !c)) throw new Error('Todas las filas deben tener un número de chapeta.');

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

                    const chapetasUnicas = Array.from(chapetasVistas);
                    const existentes: any[] = [];

                    for (let i = 0; i < chapetasUnicas.length; i += 200) {
                        const batch = chapetasUnicas.slice(i, i + 200);
                        const { data: batchData, error: checkError } = await supabase
                            .from('animales')
                            .select('id, numero_chapeta')
                            .eq('id_finca', fincaId)
                            .in('numero_chapeta', batch);

                        if (checkError) throw checkError;
                        if (batchData) existentes.push(...batchData);
                        onSetImportProgress({ current: i + batch.length, total: chapetasUnicas.length });
                    }

                    const existentesMap = new Map(existentes.map(x => [x.numero_chapeta, x.id]));

                    const rowsNuevos = rowsUnicos.filter((r: any) => {
                        if (existentesMap.has(r.numero_chapeta)) {
                            omitidosList.push(`${r.numero_chapeta} (Ya existe)`);
                            return false;
                        }
                        return true;
                    });

                    let insertados = 0;
                    if (rowsNuevos.length > 0) {
                        let idCargaMasiva: string | null = null;
                        try {
                            const userResp = await supabase.auth.getUser();
                            const { data: cargaReg, error: errCarga } = await supabase
                                .from('cargas_masivas')
                                .insert({
                                    id_finca: fincaId,
                                    usuario_id: userResp.data.user?.id,
                                    tipo: 'animales',
                                    nombre_archivo: file.name,
                                    total_registros: rowsNuevos.length,
                                    fecha_carga: getLocalIsoDate(),
                                    estado: 'activa'
                                })
                                .select('id')
                                .single();
                            if (!errCarga && cargaReg) idCargaMasiva = cargaReg.id;
                        } catch (eCarga) {
                            console.warn('No se pudo registrar en cargas_masivas:', eCarga);
                        }

                        if (idCargaMasiva) {
                            rowsNuevos.forEach((r: any) => { r.id_carga_masiva = idCargaMasiva; });
                        }

                        const { data: nuevosAnimales, error: errIns } = await supabase
                            .from('animales')
                            .insert(rowsNuevos)
                            .select();
                        if (errIns) throw errIns;
                        insertados = nuevosAnimales?.length ?? 0;

                        if (nuevosAnimales && nuevosAnimales.length > 0) {
                            const pesajesIniciales = nuevosAnimales.map((animal: any) => ({
                                id_animal: animal.id,
                                peso: animal.peso_ingreso,
                                fecha: animal.fecha_ingreso,
                                etapa: animal.etapa,
                                id_potrero: animal.id_potrero_actual,
                                gdp_calculada: 0,
                                id_carga_masiva: idCargaMasiva
                            }));

                            const { error: errPesajesInit } = await supabase
                                .from('registros_pesaje')
                                .insert(pesajesIniciales);

                            if (errPesajesInit) {
                                console.error('Error al crear pesajes iniciales para animales nuevos:', errPesajesInit);
                                throw new Error('Los animales se crearon, pero falló el registro de sus pesajes iniciales: ' + errPesajesInit.message);
                            }
                        }

                        await fetchCargasMasivasHoy();
                    }

                    const msgPotreradas = potreradasNuevas.size > 0
                        ? ` Además, se crearon ${potreradasNuevas.size} potrerada(s) nueva(s).`
                        : '';

                    onShowReporte(`¡Proceso completado!${msgPotreradas}`, {
                        tipo: 'animales',
                        creados: insertados,
                        actualizados: 0,
                        omitidos: omitidosList.length,
                        omitidosList
                    });
                } catch (err: any) {
                    await showAlert('Error en carga de animales: ' + err.message, {
                        title: 'Error en la Carga',
                        variant: 'error',
                        confirmLabel: 'Corregir Archivo',
                    });
                } finally {
                    onSetLoading(false);
                    onSetImportProgress(null);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkPesajeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        onSetLoading(true);
        onClearInlineStatus();

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

                        if (animError) throw new Error('No se pudieron cargar los datos de los animales');
                        if (data) animalesData.push(...data);
                    }

                    const mapAnimales = new Map(animalesData.map(a => [
                        a.numero_chapeta.toString().trim().toLowerCase(),
                        {
                            id: a.id,
                            etapa: a.etapa,
                            fecha_ingreso: a.fecha_ingreso,
                            peso_ingreso: a.peso_ingreso,
                            fecha_ingreso_ceba: a.fecha_ingreso_ceba,
                        }
                    ]));

                    const omitidosNoExistentes: string[] = [];
                    results.data.forEach((row: any) => {
                        const chapeta = row.numero_chapeta?.toString().trim();
                        if (chapeta && !mapAnimales.has(chapeta.toLowerCase()) && !omitidosNoExistentes.includes(chapeta)) {
                            omitidosNoExistentes.push(chapeta);
                        }
                    });

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

                    const setDuplicados = new Set(pesajesExistentes?.map((p: any) => `${p.id_animal}|${p.fecha}|${p.peso}`));

                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);
                    const mapPotreros = new Map(pts?.map((p: any) => [p.nombre.toLowerCase().trim(), p.id]));

                    const potrerosNoReconocidos = new Set<string>();
                    results.data.forEach((row: any) => {
                        const pNombre = row.potrero?.toString().trim();
                        if (pNombre && !mapPotreros.has(pNombre.toLowerCase())) {
                            potrerosNoReconocidos.add(pNombre);
                        }
                    });

                    if (potrerosNoReconocidos.size > 0) {
                        const lista = Array.from(potrerosNoReconocidos).join(', ');
                        throw new Error(`¡ERROR DE UBICACIÓN EN PESAJES! Los siguientes potreros en tu Excel de PESAJES NO existen en la App: [${lista}]. Por favor, créalos o corrige sus nombres en el Excel.`);
                    }

                    const recordsInsert: any[] = [];
                    const errores: string[] = [];
                    const cebaUpdates = new Map<string, { fecha: string; peso: number }>();
                    const ingresoAActualizar = new Map<string, { fecha: string; peso: number }>();

                    let omitidosDuplicados = 0;

                    results.data.forEach((row: any, index: number) => {
                        const chapeta = row.numero_chapeta?.toString().trim();
                        if (!chapeta) return;

                        const anim = mapAnimales.get(chapeta.toLowerCase());
                        if (!anim) return;

                        const peso = cleanNumber(row.peso);
                        const rawFecha = row.fecha || row['fecha(Año-Mes-Día)'] || row['Fecha'];
                        const fecha = parseFechaCol(rawFecha) || getLocalIsoDate();
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();

                        const fechaErr = getGanadoDateError(fecha, 'Fecha');
                        if (fechaErr) {
                            errores.push(`Fila ${index + 2}: ${fechaErr}`);
                            return;
                        }
                        if (isNaN(peso) || peso <= 0) {
                            errores.push(`Fila ${index + 2}: Peso inválido.`);
                            return;
                        }

                        const key = `${anim.id}|${fecha}|${peso}`;
                        if (setDuplicados.has(key)) {
                            omitidosDuplicados++;
                            return;
                        }
                        setDuplicados.add(key);

                        const etapaCSV = row.etapa?.toString().toLowerCase().trim();
                        const etapaFinal = (etapaCSV === 'cria' || etapaCSV === 'levante' || etapaCSV === 'ceba')
                            ? etapaCSV
                            : anim.etapa;

                        recordsInsert.push({
                            id_animal: anim.id,
                            peso,
                            fecha,
                            etapa: etapaFinal,
                            id_potrero: potreroNombre ? mapPotreros.get(potreroNombre) : null
                        });

                        if (fecha < anim.fecha_ingreso) {
                            const actualUpdate = ingresoAActualizar.get(anim.id);
                            if (!actualUpdate || fecha < actualUpdate.fecha) {
                                ingresoAActualizar.set(anim.id, { fecha, peso });
                            }
                        }

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
                        throw new Error('El archivo no contenía datos válidos.');
                    }

                    let animalesIngresoActualizados = 0;
                    if (ingresoAActualizar.size > 0 || cebaUpdates.size > 0) {
                        const allIds = Array.from(new Set([...ingresoAActualizar.keys(), ...cebaUpdates.keys()]));
                        animalesIngresoActualizados = allIds.length;

                        for (let i = 0; i < allIds.length; i += 100) {
                            const batchIds = allIds.slice(i, i + 100);
                            const updatePromises = batchIds.map(id => {
                                const ingreso = ingresoAActualizar.get(id);
                                const ceba = cebaUpdates.get(id);
                                const up: any = {};
                                if (ingreso) {
                                    up.fecha_ingreso = ingreso.fecha;
                                    up.peso_ingreso = ingreso.peso;
                                }
                                if (ceba) {
                                    up.etapa = 'ceba';
                                    up.ok_ceba = true;
                                    up.fecha_ingreso_ceba = ceba.fecha;
                                    up.peso_ingreso_ceba = ceba.peso;
                                }
                                return supabase.from('animales').update(up).eq('id', id);
                            });

                            const resUpd = await Promise.all(updatePromises);
                            const errs = resUpd.filter(r => r.error);
                            if (errs.length > 0) {
                                console.error('Error al actualizar animales durante la recalibración:', errs);
                                errores.push(`${errs.length} animal(es) no pudieron recalibrar su fecha/peso de ingreso.`);
                            }
                            onSetImportProgress({ current: i + batchIds.length, total: allIds.length });
                        }
                    }

                    let pesajesInsertados = 0;
                    if (recordsInsert.length > 0) {
                        let idCargaMasiva: string | null = null;
                        try {
                            const userResp = await supabase.auth.getUser();
                            const { data: cargaReg, error: errCarga } = await supabase
                                .from('cargas_masivas')
                                .insert({
                                    id_finca: fincaId,
                                    usuario_id: userResp.data.user?.id,
                                    tipo: 'pesajes',
                                    nombre_archivo: file.name,
                                    total_registros: recordsInsert.length,
                                    fecha_carga: getLocalIsoDate(),
                                    estado: 'activa'
                                })
                                .select('id')
                                .single();
                            if (!errCarga && cargaReg) idCargaMasiva = cargaReg.id;
                        } catch (eCarga) {
                            console.warn('No se pudo registrar en cargas_masivas:', eCarga);
                        }

                        if (idCargaMasiva) {
                            recordsInsert.forEach((r: any) => { r.id_carga_masiva = idCargaMasiva; });
                        }

                        for (let i = 0; i < recordsInsert.length; i += 200) {
                            const batch = recordsInsert.slice(i, i + 200);
                            const { error: insertError } = await supabase.from('registros_pesaje').insert(batch);
                            if (insertError) throw insertError;
                            pesajesInsertados += batch.length;
                            onSetImportProgress({ current: i + batch.length, total: recordsInsert.length });
                        }

                        const animalesPesados = Array.from(new Set(recordsInsert.map((r: any) => r.id_animal).filter(Boolean))) as string[];
                        if (animalesPesados.length > 0) {
                            const { error: rpcErr } = await supabase.rpc('recalcular_historial_pesajes_animales', { p_id_animales: animalesPesados });
                            if (rpcErr) {
                                for (const aId of animalesPesados) {
                                    await recalcularHistorialPesajesAnimal(aId, supabase);
                                }
                            }
                        }

                        await fetchCargasMasivasHoy();
                    }

                    let msg = '¡Carga estricta completada!';
                    const resultados = [];
                    if (pesajesInsertados > 0) resultados.push(`se registraron ${pesajesInsertados} pesajes`);
                    if (omitidosDuplicados > 0) resultados.push(`se omitieron ${omitidosDuplicados} duplicados`);
                    if (omitidosNoExistentes.length > 0) resultados.push(`se ignoraron registros de ${omitidosNoExistentes.length} animales que no existen`);
                    if (resultados.length > 0) msg += ` Resultados: ${resultados.join(', ')}.`;
                    if (animalesIngresoActualizados > 0) msg += ` Además, se recalibró el ingreso de ${animalesIngresoActualizados} animales.`;

                    if (errores.length > 0) {
                        await showAlert(`Inconsistencias omitidas:\n${errores.join('\n')}`, {
                            title: 'Inconsistencias omitidas',
                            variant: 'warning',
                            confirmLabel: 'Continuar',
                        });
                    }
                    onShowReporte(msg, {
                        tipo: 'pesajes',
                        creados: pesajesInsertados,
                        actualizados: animalesIngresoActualizados,
                        omitidos: omitidosDuplicados + omitidosNoExistentes.length,
                        omitidosList: omitidosNoExistentes
                    });
                } catch (err: any) {
                    await showAlert(err.message || 'Error procesando el archivo CSV.', {
                        title: 'Error en la Carga',
                        variant: 'error',
                        confirmLabel: 'Corregir Archivo',
                    });
                } finally {
                    onSetLoading(false);
                    onSetImportProgress(null);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkRotacionesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        onSetLoading(true);
        onClearInlineStatus();

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

                    const { data: exRot } = await supabase.from('rotaciones').select('id, nombre').eq('id_finca', fincaId);
                    const { data: exPot } = await supabase.from('potreros').select('id, nombre, id_rotacion').eq('id_finca', fincaId);

                    const mapRotaciones = new Map(exRot?.map((r: any) => [r.nombre.toLowerCase().trim(), r.id]));
                    const mapPotreros = new Map<string, { id: string; id_rotacion: string | null }>(exPot?.map((p: any) => [p.nombre.toLowerCase().trim(), { id: p.id, id_rotacion: p.id_rotacion }]));

                    const rotacionesNuevas = new Map<string, string>();
                    (results.data as any[]).forEach((row: any) => {
                        const rotName = row.nombre_rotacion?.toString().trim();
                        if (rotName && !mapRotaciones.has(rotName.toLowerCase())) {
                            rotacionesNuevas.set(rotName.toLowerCase(), rotName);
                        }
                    });

                    if (rotacionesNuevas.size > 0) {
                        const inserts = Array.from(rotacionesNuevas.values()).map(nombre => ({
                            id_finca: fincaId,
                            nombre
                        }));
                        const { data: creadas, error: rotErr } = await supabase.from('rotaciones').insert(inserts).select();
                        if (rotErr) throw rotErr;
                        creadas?.forEach((r: any) => mapRotaciones.set(r.nombre.toLowerCase().trim(), r.id));
                    }

                    const recordsPotreros: any[] = [];
                    let updatesPotrerosCnt = 0;

                    for (const row of results.data as any[]) {
                        const potName = row.nombre_potrero?.toString().trim();
                        const rotName = row.nombre_rotacion?.toString().trim();
                        const area = parseDecimalInput(row.area_hectareas) || 0;
                        const diasBase = parseInt(row.dias_ocupacion_base) || 1;
                        const rotId = rotName ? mapRotaciones.get(rotName.toLowerCase()) : null;

                        if (!potName) continue;

                        const existingPot = mapPotreros.get(potName.toLowerCase());
                        if (existingPot) {
                            const updateData: any = { area_hectareas: area, dias_ocupacion_base: diasBase };
                            if (rotId) updateData.id_rotacion = rotId;

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
                                id_rotacion: rotId,
                                dias_ocupacion_base: diasBase
                            });
                        }
                    }

                    if (recordsPotreros.length > 0) {
                        const { error: potInsErr } = await supabase.from('potreros').insert(recordsPotreros);
                        if (potInsErr) throw potInsErr;
                    }

                    await showAlert(
                        `¡Carga exitosa! Se crearon ${recordsPotreros.length} potreros nuevos y se actualizaron ${updatesPotrerosCnt} existentes.`,
                        { title: '¡Importación Finalizada!', variant: 'success', confirmLabel: 'Aceptar' }
                    );
                } catch (err: any) {
                    await showAlert(err.message || 'Error procesando el archivo CSV.', {
                        title: 'Error en la Carga',
                        variant: 'error',
                        confirmLabel: 'Corregir Archivo',
                    });
                } finally {
                    onSetLoading(false);
                    if (e.target) e.target.value = '';
                }
            }
        });
    };

    return (
        <section id="settings-panel-cargasMasivas" aria-labelledby="settings-heading-cargas" className="card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <h2 id="settings-heading-cargas" className="settings-section-heading">
                <Upload size={20} color="var(--primary)" aria-hidden="true" /> Carga Masiva (CSV)
            </h2>
            <div className="settings-form-grid">
                <div style={{ padding: '18px', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                    <FileText size={24} color="var(--primary)" aria-hidden="true" />
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Inventario</h3>
                    <button type="button" onClick={() => document.getElementById('bulkAnimalSettings')?.click()} style={{ width: '100%' }}>Subir CSV</button>
                    <a href="/plantilla_animales.csv" download className="settings-plantilla-link">Descargar Plantilla</a>
                    <input type="file" id="bulkAnimalSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkAnimalUpload} />
                </div>
                <div style={{ padding: '18px', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                    <Maximize size={24} color="var(--primary)" aria-hidden="true" />
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Pesajes</h3>
                    <button type="button" onClick={() => document.getElementById('bulkPesajeSettings')?.click()} style={{ width: '100%' }}>Subir CSV</button>
                    <a href="/plantilla_pesajes.csv" download className="settings-plantilla-link">Descargar Plantilla</a>
                    <input type="file" id="bulkPesajeSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkPesajeUpload} />
                </div>
                <div style={{ padding: '18px', backgroundColor: 'var(--surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                    <Upload size={24} color="var(--primary)" aria-hidden="true" />
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Rotaciones</h3>
                    <button type="button" onClick={() => document.getElementById('bulkRotacionSettings')?.click()} style={{ width: '100%' }}>Subir CSV</button>
                    <a href="/plantilla_rotaciones_potreros.csv" download className="settings-plantilla-link">Descargar Plantilla</a>
                    <input type="file" id="bulkRotacionSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkRotacionesUpload} />
                </div>
            </div>

            <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 id="cargas-hoy-heading" style={{ fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <span>Cargas Masivas Realizadas Hoy</span>
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                            {cargasMasivasHoy.length}
                        </span>
                    </h3>
                </div>
                <p className="settings-helper-text" style={{ marginBottom: '14px' }}>
                    Si cometiste un error al cargar datos hoy, puedes revertir la carga. Esta opción está disponible únicamente durante el día de la carga (a medianoche se cierra por seguridad).
                </p>
                {cargasMasivasHoy.length === 0 ? (
                    <div style={{ padding: '18px', textAlign: 'center', backgroundColor: 'var(--surface-inset)', borderRadius: '8px', border: '1px dashed var(--border-strong)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        No se han realizado cargas masivas el día de hoy.
                    </div>
                ) : (
                    <div tabIndex={0} role="region" aria-labelledby="cargas-hoy-heading" className="settings-table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">Tipo</th>
                                    <th scope="col">Archivo</th>
                                    <th scope="col">Registros</th>
                                    <th scope="col">Hora</th>
                                    <th scope="col" style={{ textAlign: 'right' }}>Deshacer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cargasMasivasHoy.map(c => (
                                    <tr key={c.id}>
                                        <td data-label="Tipo">
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                backgroundColor: c.tipo === 'animales' ? 'var(--success-soft-bg)' : 'var(--info-soft-bg)',
                                                color: c.tipo === 'animales' ? 'var(--success)' : 'var(--info)',
                                                border: `1px solid ${c.tipo === 'animales' ? 'var(--success-soft-border)' : 'var(--info-soft-border)'}`
                                            }}>
                                                {c.tipo === 'animales' ? 'Inventario' : 'Pesajes'}
                                            </span>
                                        </td>
                                        <td data-label="Archivo" style={{ fontWeight: '500', overflowWrap: 'anywhere' }}>{c.nombre_archivo || 'Archivo CSV'}</td>
                                        <td data-label="Registros">{c.total_registros}</td>
                                        <td data-label="Hora" style={{ color: 'var(--text-muted)' }}>
                                            {new Date(c.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="settings-table-actions" style={{ textAlign: 'right' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleRevertirCargaMasiva(c)}
                                                aria-label={`Deshacer carga masiva ${c.nombre_archivo || 'Archivo CSV'}`}
                                                className="settings-revert-btn"
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                                <span>Deshacer</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
