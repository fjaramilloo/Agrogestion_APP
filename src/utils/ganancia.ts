import { getLocalIsoDate } from './dateUtils';

// Utilidad centralizada para manejo de unidades de ganancia de peso
// BD siempre almacena en kg/mes (GMP). Solo el display cambia según el modo.

export type ModoGanancia = 'GMP' | 'GDP';

export function toDisplayValue(valorKgMes: number, modo: ModoGanancia): number {
    if (modo === 'GDP') return valorKgMes * (1000 / 30);
    return valorKgMes;
}

export function toStorageValue(valorDisplay: number, modo: ModoGanancia): number {
    if (modo === 'GDP') return valorDisplay * (30 / 1000);
    return valorDisplay;
}

export function getUnidadLabel(modo: ModoGanancia): string {
    return modo === 'GDP' ? 'gr/día' : 'kg/mes';
}

export function getModoLabel(modo: ModoGanancia): string {
    return modo === 'GDP' ? 'GDP' : 'GMP';
}

/**
 * Normaliza una fecha ISO o timestamp a YYYY-MM-DD
 */
export function normalizeDateStr(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    return String(dateStr).split('T')[0].trim() || null;
}

/**
 * Calcula los días calendario exactos entre dos fechas (YYYY-MM-DD)
 */
export function calcularDiasEntreFechas(fechaInicioStr?: string | null, fechaFinStr?: string | null): number {
    const f1 = normalizeDateStr(fechaInicioStr);
    const f2 = normalizeDateStr(fechaFinStr);
    if (!f1 || !f2) return 0;
    const d1 = new Date(`${f1}T12:00:00`);
    const d2 = new Date(`${f2}T12:00:00`);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Verifica si un pesaje ocurrió en una fecha estrictamente posterior a la fecha base de ingreso.
 * Los pesajes del mismo día de ingreso tienen 0 días de evolución y no deben promediarse como GMP = 0.
 */
export function esPesajePosteriorAIngreso(fechaPesaje?: string | null, fechaIngreso?: string | null): boolean {
    if (!fechaPesaje) return false;
    if (!fechaIngreso) return true;
    return calcularDiasEntreFechas(fechaIngreso, fechaPesaje) > 0;
}

/**
 * Calcula la GMP del último período (entre el penúltimo y el último pesaje, o desde peso_ingreso si es el 1er pesaje posterior al ingreso).
 * Retorna null si el animal solo tiene el pesaje del día de ingreso o no tiene pesajes.
 */
export function calcularGmpUltimoPeriodo(
    ultimoPesaje: any,
    fechaIngreso?: string | null,
    pesoIngreso?: number | null,
    penultimoPesaje?: any
): number | null {
    if (!ultimoPesaje || !ultimoPesaje.fecha) return null;
    if (fechaIngreso && !esPesajePosteriorAIngreso(ultimoPesaje.fecha, fechaIngreso)) {
        return null;
    }

    if (penultimoPesaje && penultimoPesaje.fecha && esPesajePosteriorAIngreso(ultimoPesaje.fecha, penultimoPesaje.fecha)) {
        const diasTramo = calcularDiasEntreFechas(penultimoPesaje.fecha, ultimoPesaje.fecha);
        if (diasTramo > 0 && Number(penultimoPesaje.peso) > 0) {
            if (ultimoPesaje.gmp_calculada !== null && ultimoPesaje.gmp_calculada !== undefined) {
                return Number(ultimoPesaje.gmp_calculada);
            }
            return ((Number(ultimoPesaje.peso) - Number(penultimoPesaje.peso)) / diasTramo) * 30;
        }
    }

    if (ultimoPesaje.gmp_calculada !== null && ultimoPesaje.gmp_calculada !== undefined) {
        return Number(ultimoPesaje.gmp_calculada);
    }
    if (ultimoPesaje.gdp_calculada !== null && ultimoPesaje.gdp_calculada !== undefined) {
        return Number(ultimoPesaje.gdp_calculada) * 30;
    }

    if (fechaIngreso && pesoIngreso && Number(pesoIngreso) > 0) {
        const dias = calcularDiasEntreFechas(fechaIngreso, ultimoPesaje.fecha);
        if (dias > 0) {
            return ((Number(ultimoPesaje.peso) - Number(pesoIngreso)) / dias) * 30;
        }
    }

    return null;
}

/**
 * Calcula la GMP Histórica Acumulada en finca desde el peso/fecha base de ingreso hasta el último pesaje.
 * Retorna null si no hay pesaje posterior a la fecha de ingreso (días <= 0).
 */
export function calcularGmpAcumulado(
    pesoActual?: number | null,
    pesoBaseIngreso?: number | null,
    fechaInicioStr?: string | null,
    fechaUltimoPesajeStr?: string | null
): number | null {
    const pesoAct = Number(pesoActual || 0);
    const pesoBase = Number(pesoBaseIngreso || 0);
    if (!fechaInicioStr || !fechaUltimoPesajeStr || pesoAct <= 0 || pesoBase <= 0) return null;

    const diffDias = calcularDiasEntreFechas(fechaInicioStr, fechaUltimoPesajeStr);
    if (diffDias <= 0) return null;

    const gananciaKilos = pesoAct - pesoBase;
    return (gananciaKilos / diffDias) * 30;
}

// ============================================================================
// MOTOR ZOOTÉCNICO CENTRALIZADO DE PROYECCIÓN DE PESO Y DESPACHOS
// ============================================================================

export const MIN_DIAS_TRAMO_ESTABLE = 45;
export const MAX_GMP_PROYECCION_PASTOREO = 18.0; // 600 g/día máx sostenido en pastoreo
export const MIN_GMP_PROYECCION = 0.0;            // No extrapolar pérdidas indefinidamente
export const DIAS_CONFIANZA_ALTA = 90;
export const DIAS_CONFIANZA_MEDIA = 180;
export const DIAS_VENCIDO_DESPACHO = 150;         // >150d sin báscula no confirma despacho
export const MAX_DIAS_EFECTIVOS_PROYECCION = 135; // 90d al 100% + 90d al 50%, luego congelado
export const DEFAULT_GMP_CEBA = 11.5;
export const DEFAULT_GMP_LEVANTE = 10.0;

export type ConfianzaPeso = 'alta' | 'media' | 'vencida';
export type EtapaVentaObjetivo = 'ceba' | 'levante' | 'cria';

export interface PesajeProyeccionInput {
    peso: number;
    fecha: string;
    etapa?: string | null;
    gdp_calculada?: number | null;
    gmp_calculada?: number | null;
    is_deleted?: boolean | null;
    creado_en?: string | null;
}

export interface AnimalProyeccionInput {
    id?: string;
    etapa?: string | null;
    fecha_ingreso?: string | null;
    peso_ingreso?: number | null;
    peso_compra?: number | null;
    fecha_ingreso_ceba?: string | null;
    peso_ingreso_ceba?: number | null;
    registros_pesaje?: PesajeProyeccionInput[] | null;
}

export interface PesoEstimadoResult {
    pesoActual: number;
    fechaRef: string | null;
    pesoEstimado: number;
    diasSinPesar: number;
    diasEfectivos: number;
    gmpAplicada: number;
    gmpEfectiva: number;
    confianza: ConfianzaPeso;
}

export interface FallbackGmpPorEtapa {
    ceba: number;
    levante: number;
    cria: number;
    general: number;
}

/**
 * Determina la etapa comercial objetivo para despacho según el preset configurado en la finca.
 */
export function getEtapaObjetivoVenta(presetPeso?: string | null): EtapaVentaObjetivo {
    if (presetPeso === 'levante_preceba') return 'levante';
    if (presetPeso === 'destete_cria') return 'cria';
    return 'ceba';
}

/**
 * Factor de desaceleración biológica por peso vivo (madurez fisiológica y deposición grasa).
 */
export function getFactorMadurezPeso(pesoKg: number): number {
    if (pesoKg < 450) return 1.0;
    if (pesoKg < 500) return 0.85;
    if (pesoKg < 540) return 0.65;
    return 0.35;
}

/**
 * Días efectivos de proyección con decaimiento por antigüedad:
 * - 0..90d: 100%
 * - 91..180d: 50%
 * - >180d: congelado (tope 135 días efectivos)
 */
export function getDiasEfectivosProyeccion(diasSinPesar: number): number {
    if (diasSinPesar <= 0) return 0;
    if (diasSinPesar <= DIAS_CONFIANZA_ALTA) return diasSinPesar;
    if (diasSinPesar <= DIAS_CONFIANZA_MEDIA) {
        return DIAS_CONFIANZA_ALTA + (diasSinPesar - DIAS_CONFIANZA_ALTA) * 0.5;
    }
    return MAX_DIAS_EFECTIVOS_PROYECCION;
}

export function getConfianzaPeso(diasSinPesar: number): ConfianzaPeso {
    if (diasSinPesar <= DIAS_CONFIANZA_ALTA) return 'alta';
    if (diasSinPesar <= DIAS_CONFIANZA_MEDIA) return 'media';
    return 'vencida';
}

/**
 * Normaliza, filtra eliminados y ordena pesajes de más reciente a más antiguo (1 por fecha).
 */
export function normalizarPesajesDesc(registros?: PesajeProyeccionInput[] | null): PesajeProyeccionInput[] {
    if (!registros || !Array.isArray(registros) || registros.length === 0) return [];
    const sorted = [...registros]
        .filter((p) => p && p.fecha && p.is_deleted !== true)
        .sort((a, b) => {
            const fa = normalizeDateStr(a.fecha) || '';
            const fb = normalizeDateStr(b.fecha) || '';
            if (fa !== fb) return fb.localeCompare(fa);
            return String(b.creado_en || '').localeCompare(String(a.creado_en || ''));
        });

    const vistos = new Set<string>();
    const dedup: PesajeProyeccionInput[] = [];
    for (const p of sorted) {
        const f = normalizeDateStr(p.fecha);
        if (!f || vistos.has(f)) continue;
        vistos.add(f);
        dedup.push(p);
    }
    return dedup;
}

/**
 * Extrae las tasas históricas estables (>= 45 días) de un animal para proyección o calibración de finca.
 */
function extraerTasasEstables(animal: AnimalProyeccionInput): {
    gmpAcum: number | null;
    gmpUltimo: number | null;
    pesoActual: number;
    fechaRef: string | null;
} {
    const pesajes = normalizarPesajesDesc(animal.registros_pesaje);
    const ultimoP = pesajes[0] || null;
    const penultimoP = pesajes[1] || null;

    const fechaIngreso = normalizeDateStr(animal.fecha_ingreso);
    const pesoIngresoBase = Number(animal.peso_ingreso ?? animal.peso_compra ?? 0);
    const tienePesajePosterior = Boolean(ultimoP && esPesajePosteriorAIngreso(ultimoP.fecha, fechaIngreso));

    const pesoActual = tienePesajePosterior
        ? Number(ultimoP!.peso)
        : (pesoIngresoBase > 0 ? pesoIngresoBase : Number(ultimoP?.peso || 0));

    const fechaRef = tienePesajePosterior
        ? normalizeDateStr(ultimoP!.fecha)
        : (fechaIngreso || normalizeDateStr(ultimoP?.fecha));

    let gmpAcum: number | null = null;
    if (tienePesajePosterior && ultimoP) {
        const esCeba = (animal.etapa || '').toLowerCase() === 'ceba';
        const fechaCeba = normalizeDateStr(animal.fecha_ingreso_ceba);
        const pesoCeba = Number(animal.peso_ingreso_ceba || 0);
        if (esCeba && fechaCeba && pesoCeba > 0) {
            const diasCeba = calcularDiasEntreFechas(fechaCeba, ultimoP.fecha);
            if (diasCeba >= MIN_DIAS_TRAMO_ESTABLE) {
                gmpAcum = ((Number(ultimoP.peso) - pesoCeba) / diasCeba) * 30;
            }
        }
        if (gmpAcum === null && fechaIngreso && pesoIngresoBase > 0) {
            const diasTotal = calcularDiasEntreFechas(fechaIngreso, ultimoP.fecha);
            if (diasTotal >= MIN_DIAS_TRAMO_ESTABLE) {
                gmpAcum = ((Number(ultimoP.peso) - pesoIngresoBase) / diasTotal) * 30;
            }
        }
    }

    let gmpUltimo: number | null = null;
    if (tienePesajePosterior && ultimoP) {
        if (penultimoP && Number(penultimoP.peso) > 0) {
            const diasTramo = calcularDiasEntreFechas(penultimoP.fecha, ultimoP.fecha);
            if (diasTramo >= MIN_DIAS_TRAMO_ESTABLE) {
                gmpUltimo = ((Number(ultimoP.peso) - Number(penultimoP.peso)) / diasTramo) * 30;
            }
        } else if (fechaIngreso && pesoIngresoBase > 0) {
            const diasTramo = calcularDiasEntreFechas(fechaIngreso, ultimoP.fecha);
            if (diasTramo >= MIN_DIAS_TRAMO_ESTABLE) {
                gmpUltimo = ((Number(ultimoP.peso) - pesoIngresoBase) / diasTramo) * 30;
            }
        }
    }

    return { gmpAcum, gmpUltimo, pesoActual, fechaRef };
}

/**
 * Calcula una tasa de respaldo por etapa calibrada con los animales que sí tienen tramos válidos (>= 45d)
 * en la finca actual. Se acota a [6, 16] kg/mes para evitar sesgos extremos.
 */
export function calcularFallbackGmpPorEtapa(animales: AnimalProyeccionInput[]): FallbackGmpPorEtapa {
    const porEtapa: Record<'ceba' | 'levante' | 'cria', number[]> = {
        ceba: [],
        levante: [],
        cria: [],
    };
    const todos: number[] = [];

    for (const a of animales) {
        const { gmpAcum, gmpUltimo } = extraerTasasEstables(a);
        const tasa = gmpAcum !== null && gmpUltimo !== null
            ? (0.6 * gmpAcum + 0.4 * gmpUltimo)
            : (gmpAcum ?? gmpUltimo);
        if (tasa === null || !Number.isFinite(tasa)) continue;
        const clamped = Math.min(MAX_GMP_PROYECCION_PASTOREO, Math.max(MIN_GMP_PROYECCION, tasa));
        todos.push(clamped);
        const et = (a.etapa || '').toLowerCase();
        if (et === 'ceba' || et === 'levante' || et === 'cria') {
            porEtapa[et].push(clamped);
        }
    }

    const avgSafe = (vals: number[], def: number) => {
        if (vals.length < 3) return def;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        return Math.min(16.0, Math.max(6.0, avg));
    };

    const general = avgSafe(todos, DEFAULT_GMP_CEBA);
    return {
        ceba: avgSafe(porEtapa.ceba, general),
        levante: avgSafe(porEtapa.levante, DEFAULT_GMP_LEVANTE),
        cria: avgSafe(porEtapa.cria, DEFAULT_GMP_LEVANTE),
        general,
    };
}

/**
 * Proyecta el peso estimado a hoy (o a fechaObjetivo) con criterio zootécnico:
 * - Ignora tramos < 45d (rebote compensatorio / llenado ruminal)
 * - Mezcla 60% histórico de etapa + 40% último tramo estable
 * - Acota tasa a [0, 18] kg/mes
 * - Aplica factor de madurez fisiológica por peso
 * - Atenúa entre días 91-180 (50%) y congela después de 180 días sin pesar
 */
export function calcularPesoEstimadoHoy(
    animal: AnimalProyeccionInput,
    options?: {
        fechaObjetivo?: string | null;
        fallbackGmp?: number | FallbackGmpPorEtapa | null;
    }
): PesoEstimadoResult {
    const fechaObjetivo = normalizeDateStr(options?.fechaObjetivo) || getLocalIsoDate();
    const { gmpAcum, gmpUltimo, pesoActual, fechaRef } = extraerTasasEstables(animal);

    const etapa = (animal.etapa || '').toLowerCase();
    let defaultFallback = etapa === 'ceba' ? DEFAULT_GMP_CEBA : DEFAULT_GMP_LEVANTE;
    if (typeof options?.fallbackGmp === 'number' && Number.isFinite(options.fallbackGmp)) {
        defaultFallback = options.fallbackGmp;
    } else if (options?.fallbackGmp && typeof options.fallbackGmp === 'object') {
        if (etapa === 'ceba') defaultFallback = options.fallbackGmp.ceba;
        else if (etapa === 'levante') defaultFallback = options.fallbackGmp.levante;
        else if (etapa === 'cria') defaultFallback = options.fallbackGmp.cria;
        else defaultFallback = options.fallbackGmp.general;
    }

    let rawGmp: number;
    if (gmpAcum !== null && gmpUltimo !== null) {
        rawGmp = 0.6 * gmpAcum + 0.4 * gmpUltimo;
    } else if (gmpAcum !== null) {
        rawGmp = gmpAcum;
    } else if (gmpUltimo !== null) {
        rawGmp = gmpUltimo;
    } else {
        rawGmp = defaultFallback;
    }

    const gmpAplicada = Math.min(MAX_GMP_PROYECCION_PASTOREO, Math.max(MIN_GMP_PROYECCION, rawGmp));
    const diasSinPesar = fechaRef ? Math.max(0, calcularDiasEntreFechas(fechaRef, fechaObjetivo)) : 0;
    const diasEfectivos = getDiasEfectivosProyeccion(diasSinPesar);
    const factorPeso = getFactorMadurezPeso(pesoActual);
    const gmpEfectiva = gmpAplicada * factorPeso;
    const pesoEstimado = pesoActual > 0 ? pesoActual + diasEfectivos * (gmpEfectiva / 30) : 0;

    return {
        pesoActual,
        fechaRef,
        pesoEstimado,
        diasSinPesar,
        diasEfectivos,
        gmpAplicada,
        gmpEfectiva,
        confianza: getConfianzaPeso(diasSinPesar),
    };
}

export interface LoteDespachoInput extends AnimalProyeccionInput {
    id_potrerada?: string | null;
    potreradaNombre?: string | null;
    estado?: string | null;
    is_deleted?: boolean | null;
}

export interface LoteDespachoEvaluado {
    id: string;
    nombre: string;
    cantidad: number;
    listos: number;
    pctListos: number;
    pesoPromedioReal: number;
    pesoPromedioEstimado: number;
    diasSinPesarPromedio: number;
    diasFaltantes: number;
    gmpLote: number;
    esVigente: boolean;
}

/**
 * Evalúa qué lotes están próximos a despacho (pesaje <= 150d y etapa objetivo de la finca)
 * y separa los lotes con pesaje atrasado (> 150d) que requieren control de báscula antes de confirmar venta.
 */
export function evaluarLotesParaDespacho(
    animales: LoteDespachoInput[],
    metaKg: number,
    presetPeso?: string | null,
    fechaObjetivo?: string | null
): {
    proximosVigentes: LoteDespachoEvaluado[];
    atrasadosPorConfirmar: LoteDespachoEvaluado[];
} {
    const etapaObjetivo = getEtapaObjetivoVenta(presetPeso);
    const activos = animales.filter((a) => a.estado !== 'vendido' && a.estado !== 'muerto' && a.is_deleted !== true);
    const fallbackMap = calcularFallbackGmpPorEtapa(activos);

    const grupos = new Map<string, {
        id: string;
        nombre: string;
        count: number;
        listos: number;
        sumReal: number;
        sumEst: number;
        sumDias: number;
        sumGmpEf: number;
    }>();

    for (const a of activos) {
        if (!a.id_potrerada) continue;
        if ((a.etapa || '').toLowerCase() !== etapaObjetivo) continue;

        const est = calcularPesoEstimadoHoy(a, { fechaObjetivo, fallbackGmp: fallbackMap });
        let g = grupos.get(a.id_potrerada);
        if (!g) {
            g = {
                id: a.id_potrerada,
                nombre: a.potreradaNombre || 'Lote sin nombre',
                count: 0,
                listos: 0,
                sumReal: 0,
                sumEst: 0,
                sumDias: 0,
                sumGmpEf: 0,
            };
            grupos.set(a.id_potrerada, g);
        }
        g.count++;
        g.sumReal += est.pesoActual;
        g.sumEst += est.pesoEstimado;
        g.sumDias += est.diasSinPesar;
        g.sumGmpEf += est.gmpEfectiva;
        if (est.pesoEstimado >= metaKg) {
            g.listos++;
        }
    }

    const evaluados: LoteDespachoEvaluado[] = [];
    for (const g of grupos.values()) {
        if (g.count === 0) continue;
        const pesoPromReal = g.sumReal / g.count;
        const pesoPromEst = g.sumEst / g.count;
        const diasSinPesarProm = g.sumDias / g.count;
        const gmpLote = g.sumGmpEf / g.count;
        const pctListos = g.listos / g.count;
        const faltanKg = Math.max(0, metaKg - pesoPromEst);
        const diasFaltantes = (g.listos === g.count || faltanKg === 0)
            ? 0
            : (gmpLote > 0 ? Math.ceil(faltanKg / (gmpLote / 30)) : 999);

        evaluados.push({
            id: g.id,
            nombre: g.nombre,
            cantidad: g.count,
            listos: g.listos,
            pctListos,
            pesoPromedioReal: pesoPromReal,
            pesoPromedioEstimado: pesoPromEst,
            diasSinPesarPromedio: diasSinPesarProm,
            diasFaltantes,
            gmpLote,
            esVigente: diasSinPesarProm <= DIAS_VENCIDO_DESPACHO,
        });
    }

    const proximosVigentes = evaluados
        .filter((l) => l.esVigente)
        .sort((a, b) => {
            const aListo = a.pctListos >= 0.5 || a.pesoPromedioEstimado >= metaKg ? 1 : 0;
            const bListo = b.pctListos >= 0.5 || b.pesoPromedioEstimado >= metaKg ? 1 : 0;
            if (bListo !== aListo) return bListo - aListo;
            if (aListo === 1 && Math.abs(b.pctListos - a.pctListos) > 0.01) {
                return b.pctListos - a.pctListos;
            }
            if (a.diasFaltantes !== b.diasFaltantes) {
                return a.diasFaltantes - b.diasFaltantes;
            }
            return b.pesoPromedioEstimado - a.pesoPromedioEstimado;
        });

    const atrasadosPorConfirmar = evaluados
        .filter((l) => !l.esVigente && (l.pesoPromedioEstimado >= metaKg * 0.94 || l.pctListos >= 0.25))
        .sort((a, b) => b.pesoPromedioEstimado - a.pesoPromedioEstimado);

    return { proximosVigentes, atrasadosPorConfirmar };
}

export interface MapaPotreradaMetrics {
    total_animales: number;
    peso_promedio: number;
    peso_promedio_estimado: number;
    dias_sin_pesar: number;
    confianza_peso: ConfianzaPeso;
    marcas: string[];
    fecha_ultimo_pesaje: string | null;
}

/**
 * Calcula métricas consolidadas por potrerada para el Mapa y el Snapshot Offline,
 * garantizando cifras idénticas con o sin conexión.
 */
export function calcularMetricasMapaPotreradas(
    animalesData: Array<AnimalProyeccionInput & { id_potrerada?: string | null; nombre_propietario?: string | null }>,
    fechaObjetivo?: string | null
): Map<string, MapaPotreradaMetrics> {
    const targetDate = normalizeDateStr(fechaObjetivo) || getLocalIsoDate();
    const fallbackPorEtapa = calcularFallbackGmpPorEtapa(animalesData);

    const animalesPorPotrerada = new Map<string, typeof animalesData>();
    for (const a of animalesData) {
        if (!a.id_potrerada) continue;
        let list = animalesPorPotrerada.get(a.id_potrerada);
        if (!list) {
            list = [];
            animalesPorPotrerada.set(a.id_potrerada, list);
        }
        list.push(a);
    }

    const mesesCortos = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const result = new Map<string, MapaPotreradaMetrics>();

    animalesPorPotrerada.forEach((animales, potreradaId) => {
        let sumPeso = 0;
        let sumPesoEstimado = 0;
        let sumDiasSinPesar = 0;
        let validCount = 0;
        let latestPesajeDate: string | null = null;
        const marcasSet = new Set<string>();

        for (const a of animales) {
            const pesajesLimpios = normalizarPesajesDesc(a.registros_pesaje);
            const lastP = pesajesLimpios[0] || null;
            if (lastP?.fecha) {
                const fNorm = normalizeDateStr(lastP.fecha);
                if (fNorm && (!latestPesajeDate || fNorm > latestPesajeDate)) {
                    latestPesajeDate = fNorm;
                }
            }

            const estRes = calcularPesoEstimadoHoy(
                { ...a, registros_pesaje: pesajesLimpios },
                { fechaObjetivo: targetDate, fallbackGmp: fallbackPorEtapa }
            );
            sumPeso += estRes.pesoActual;
            sumPesoEstimado += estRes.pesoEstimado;
            sumDiasSinPesar += estRes.diasSinPesar;
            validCount++;

            if (a.nombre_propietario) {
                marcasSet.add(a.nombre_propietario);
            }
        }

        let formattedPesajeDate: string | null = null;
        if (latestPesajeDate) {
            const dias = Math.max(0, calcularDiasEntreFechas(latestPesajeDate, targetDate));
            const [, mm, dd] = latestPesajeDate.split('-');
            const mes = mesesCortos[Math.max(0, Number(mm) - 1)] || mm;
            const dateStr = `${Number(dd)} ${mes}`;
            formattedPesajeDate = dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `${dateStr} (hace ${dias}d)`;
        }

        const diasSinPesarProm = validCount > 0 ? Math.round(sumDiasSinPesar / validCount) : 0;

        result.set(potreradaId, {
            total_animales: validCount,
            peso_promedio: validCount > 0 ? Math.round(sumPeso / validCount) : 0,
            peso_promedio_estimado: validCount > 0 ? Math.round(sumPesoEstimado / validCount) : 0,
            dias_sin_pesar: diasSinPesarProm,
            confianza_peso: getConfianzaPeso(diasSinPesarProm),
            marcas: Array.from(marcasSet).sort(),
            fecha_ultimo_pesaje: formattedPesajeDate,
        });
    });

    return result;
}

