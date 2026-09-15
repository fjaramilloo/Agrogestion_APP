/**
 * climateAiService.ts
 * ============================================================
 * Servicio de Diagnóstico Agroclimático IA para AgroGestión
 * ============================================================
 * Responsabilidades:
 *   1. Calcular el Balance Hídrico real (Precipitación - ET₀)
 *      para ventanas de 7, 15 y 30 días.
 *   2. Construir el payload compacto y el prompt zootécnico
 *      estructurado para Gemini AI.
 *   3. Llamar a la IA con restricción de maxOutputTokens: 400
 *      para garantizar respuestas telegráficas en mobile.
 *   4. Persistir el diagnóstico en Supabase (analisis_climatico_finca).
 *   5. Guardar el último diagnóstico en localStorage como caché
 *      offline de carga instantánea.
 *   6. Exponer el fallback local (Motor Determinístico Calibrado)
 *      cuando no hay conexión o falla la API.
 * ============================================================
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase';
import { format, subDays, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { detectarRegionClimatica, generarRecomendacion, type PerfilClimatico } from '../utils/climateRegions';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RegistroLluviaMinimo {
    fecha: string;       // 'YYYY-MM-DD'
    milimetros: number;
}

export interface DiagnosticoClimatico {
    id?: string;
    fecha_analisis: string;
    estado_hidrico: string;
    nivel_alerta: 'optima' | 'preAlerta' | 'estres' | 'excesoPreventivo' | 'excesoCritico' | 'transicion' | 'oreo';
    emoji_estado: string;
    balance_hidrico_15d: number;
    balance_hidrico_30d: number;
    resumen_diagnostico: string;
    impacto_pasturas: string;
    recomendacion_rotacion: string;
    recomendacion_fertilizacion: string;
    recomendacion_nutricion: string;
    metadatos_lluvia: Record<string, unknown>;
    fuente: 'ia' | 'local';
}

// ─── Constante de caché offline ───────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'agro_diagnostico_climatico_';

// ─── 1. Balance Hídrico ───────────────────────────────────────────────────────

interface BalancesHidricos {
    lluvia_hoy: number;
    lluvia_7d: number;
    lluvia_15d: number;
    lluvia_30d: number;
    lluvia_mes: number;
    variacion_mes_pct: number | null;
    dias_efectivos_mes: number;
    dias_secos_mes: number;
    dias_transcurridos_mes: number;
    dias_racha_seca: number;
    acumulado_anual: number;
    et0_diaria: number;
    balance_7d: number;
    balance_15d: number;
    balance_30d: number;
}

function calcularBalances(
    registros: RegistroLluviaMinimo[],
    perfil: PerfilClimatico
): BalancesHidricos {
    const hoy = new Date();
    const hace7 = subDays(hoy, 7);
    const hace15 = subDays(hoy, 15);
    const hace30 = subDays(hoy, 30);
    const inicioMes = startOfMonth(hoy);
    const finMes = endOfMonth(hoy);
    const inicioMesAnt = startOfMonth(subDays(inicioMes, 1));
    const finMesAnt = endOfMonth(subDays(inicioMes, 1));

    const parse = (r: RegistroLluviaMinimo) => parseISO(r.fecha + 'T12:00:00');

    const filtrar = (desde: Date, hasta: Date = hoy) =>
        registros.filter(r => { const d = parse(r); return d >= desde && d <= hasta; });

    const sumar = (arr: RegistroLluviaMinimo[], umbral = 0) =>
        arr.filter(r => r.milimetros >= umbral).reduce((s, r) => s + r.milimetros, 0);

    const regMes = registros.filter(r =>
        isWithinInterval(parse(r), { start: inicioMes, end: finMes })
    );
    const regMesAnt = registros.filter(r =>
        isWithinInterval(parse(r), { start: inicioMesAnt, end: finMesAnt })
    );

    const fechaHoy = format(hoy, 'yyyy-MM-dd');
    const regHoy = registros.find(r => r.fecha === fechaHoy);
    const lluviaHoy = regHoy?.milimetros ?? 0;

    const lluviaMes = sumar(regMes);
    const lluviaMesAnt = sumar(regMesAnt);
    const variacionMes = lluviaMesAnt > 0
        ? Math.round(((lluviaMes - lluviaMesAnt) / lluviaMesAnt) * 100)
        : null;

    const diasEfectivosMes = regMes.filter(r => r.milimetros >= perfil.umbralEfectivoMm).length;
    const diasConLluvia = new Set(
        regMes.filter(r => r.milimetros >= perfil.umbralRegistroMm).map(r => r.fecha)
    ).size;
    const diasTranscurridos = hoy.getDate();
    const diasSecosMes = Math.max(0, diasTranscurridos - diasConLluvia);

    // Racha seca: días consecutivos sin lluvia efectiva
    const ordenados = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha));
    let rachaSecos = 0;
    if (ordenados.length > 0) {
        const primero = parse(ordenados[0]);
        rachaSecos = Math.floor((hoy.getTime() - primero.getTime()) / 86400000);
        if (ordenados[0].milimetros >= perfil.umbralEfectivoMm) {
            rachaSecos = 0;
        } else {
            for (const r of ordenados) {
                if (r.milimetros >= perfil.umbralEfectivoMm) {
                    rachaSecos = Math.floor((hoy.getTime() - parse(r).getTime()) / 86400000);
                    break;
                }
            }
        }
    }

    const anoActual = hoy.getFullYear();
    const acumuladoAnual = registros
        .filter(r => parse(r).getFullYear() === anoActual)
        .reduce((s, r) => s + r.milimetros, 0);

    // ET₀ numérica: tomar la media del rango textual del perfil
    // (ej: "4.5 – 5.5 mm/día" → 5.0)
    const et0 = perfil.et0DiariaNumerica ?? 5.0;

    const lluvia7d = sumar(filtrar(hace7), perfil.umbralRegistroMm);
    const lluvia15d = sumar(filtrar(hace15), perfil.umbralRegistroMm);
    const lluvia30d = sumar(filtrar(hace30), perfil.umbralRegistroMm);

    return {
        lluvia_hoy: parseFloat(lluviaHoy.toFixed(1)),
        lluvia_7d: parseFloat(lluvia7d.toFixed(1)),
        lluvia_15d: parseFloat(lluvia15d.toFixed(1)),
        lluvia_30d: parseFloat(lluvia30d.toFixed(1)),
        lluvia_mes: parseFloat(lluviaMes.toFixed(1)),
        variacion_mes_pct: variacionMes,
        dias_efectivos_mes: diasEfectivosMes,
        dias_secos_mes: diasSecosMes,
        dias_transcurridos_mes: diasTranscurridos,
        dias_racha_seca: rachaSecos,
        acumulado_anual: parseFloat(acumuladoAnual.toFixed(1)),
        et0_diaria: et0,
        balance_7d: parseFloat((lluvia7d - 7 * et0).toFixed(1)),
        balance_15d: parseFloat((lluvia15d - 15 * et0).toFixed(1)),
        balance_30d: parseFloat((lluvia30d - 30 * et0).toFixed(1)),
    };
}

// ─── 2. Construcción del Prompt ───────────────────────────────────────────────

function buildSystemPrompt(): string {
    return `Eres el Asistente Zootécnico y Consultor Agroclimático Senior de AgroGestión Ganadera, con más de 30 años de experiencia en manejo de pasturas tropicales, balances hídricos (FAO Penman-Monteith) y nutrición de bovinos en Colombia (Magdalena Medio, Costa Caribe, Llanos Orientales y Trópico Alto).

Tu misión es analizar la radiografía pluviométrica real de una finca, contrastar la precipitación contra la demanda de evapotranspiración (ET0), detectar fenómenos engañosos (lluvias aisladas en medio de sequía, falsos arranques de invierno, o anegamiento por saturación) y emitir un diagnóstico zootécnico ultra conciso y accionable.

REGLAS ZOOTÉCNICAS ESTRICTAS:
1. BALANCE HÍDRICO: Nunca diagnostiques "Condición Óptima" si el Balance Hídrico de 15 días es < -30 mm, aunque haya llovido hace 2 o 3 días. Una lluvia aislada de 10-20 mm tras racha seca solo moja 3-5 cm; se evapora en 48-72 h a >32°C. Diagnostícala como "Lluvia Aislada / Déficit Hídrico Activo".
2. PASTURAS: Con déficit, la pastura frena rebrote, sube FDN y baja proteína (<5%). PROHIBIDO recomendar rotaciones cortas (18-25 días); ordena alargar descanso a 30-38 días para no sobrepastorear.
3. FERTILIZACIÓN: PROHIBIDO recomendar urea al voleo sin humedad continua (>50% se volatiliza a >30°C sin agua).
4. NUTRICIÓN: Recomienda sal con NNP (urea pecuaria 2-3%) o sal proteinada (100-150 g/cab/día) para degradar fibra seca y sostener la GDP.

REGLAS DE FORMATO — MUY IMPORTANTE:
- Sé telegráfico y ultra conciso. Máximo 1-2 oraciones por campo.
- Responde ÚNICAMENTE con un objeto JSON válido, sin etiquetas markdown ni texto adicional.
- Límites estrictos: resumen_ejecutivo ≤180 chars; impacto_pasturas ≤140 chars; cada recomendación ≤120 chars.

{
  "estado_hidrico": "Texto corto y contundente del estado real",
  "nivel_alerta": "optima|preAlerta|estres|excesoPreventivo|excesoCritico|transicion|oreo",
  "emoji_estado": "🟡|🔴|✅|💧|🌊|🌾|🌤️",
  "balance_hidrico_15d_mm": 0,
  "resumen_ejecutivo": "Máx 180 chars con números clave.",
  "impacto_pasturas": "Máx 140 chars: rebrote, FDN y proteína.",
  "recomendaciones": {
    "rotacion_pastoreo": "Máx 120 chars: días de descanso y remanente.",
    "fertilizacion_suelo": "Máx 120 chars: pauta sobre fertilización.",
    "nutricion_suplementacion": "Máx 120 chars: sal/suplemento para GDP."
  }
}`;
}

function buildUserPrompt(
    perfil: PerfilClimatico,
    municipio: string | null,
    balances: BalancesHidricos
): string {
    const hoy = new Date();
    const nombreMes = format(hoy, 'MMMM', { locale: es });
    const variStr = balances.variacion_mes_pct !== null
        ? `${balances.variacion_mes_pct > 0 ? '+' : ''}${balances.variacion_mes_pct}% vs anterior`
        : 'sin dato anterior';

    return `Analiza la siguiente radiografía agroclimática de la finca:

DATOS DE LA FINCA:
- Municipio: ${municipio ?? 'No especificado'}
- Zona Agroecológica: ${perfil.zona} (ET₀ estimada: ${balances.et0_diaria} mm/día)
- Forrajes Predominantes: ${perfil.forrajesDominantes}
- Suelos y Drenaje: ${perfil.sueloDrenaje}

REGISTROS DE PRECIPITACIÓN:
- Fecha: ${format(hoy, 'dd MMMM yyyy', { locale: es })}
- Lluvia Hoy: ${balances.lluvia_hoy} mm
- Lluvia 7 Días: ${balances.lluvia_7d} mm (Demanda ET₀ 7d: ${(7 * balances.et0_diaria).toFixed(1)} mm | Balance: ${balances.balance_7d} mm)
- Lluvia 15 Días: ${balances.lluvia_15d} mm (Demanda ET₀ 15d: ${(15 * balances.et0_diaria).toFixed(1)} mm | Balance: ${balances.balance_15d} mm)
- Lluvia 30 Días: ${balances.lluvia_30d} mm (Demanda ET₀ 30d: ${(30 * balances.et0_diaria).toFixed(1)} mm | Balance: ${balances.balance_30d} mm)
- Lluvia ${nombreMes}: ${balances.lluvia_mes} mm en ${balances.dias_transcurridos_mes} días (${variStr})
- Días con Lluvia Efectiva (≥${perfil.umbralEfectivoMm} mm) en el mes: ${balances.dias_efectivos_mes}
- Días Secos en el mes: ${balances.dias_secos_mes} de ${balances.dias_transcurridos_mes} días
- Racha Seca Actual: ${balances.dias_racha_seca} días desde la última lluvia efectiva
- Acumulado Anual: ${balances.acumulado_anual} mm (Ref: ${perfil.mmAnualReferencia.toLocaleString()} mm/año)

INSTRUCCIÓN:
Genera el diagnóstico zootécnico en el JSON especificado. Sé directo, conciso y accionable.`;
}

// ─── 3. Parser JSON Seguro ─────────────────────────────────────────────────────

function parseRespuestaIA(texto: string): Record<string, unknown> | null {
    try {
        // Limpiar posibles marcadores de bloque de código que el modelo pueda agregar
        const limpio = texto.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        return JSON.parse(limpio);
    } catch {
        // Intentar extraer el JSON del texto si hay texto adicional
        const match = texto.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { /* no-op */ }
        }
        return null;
    }
}

// ─── 4. Fallback Determinístico Local ─────────────────────────────────────────

function generarDiagnosticoLocal(
    perfil: PerfilClimatico,
    balances: BalancesHidricos
): DiagnosticoClimatico {
    const rec = generarRecomendacion(
        perfil,
        balances.dias_racha_seca,
        balances.lluvia_30d,
        balances.lluvia_7d,
        balances.lluvia_15d
    );

    const EMOJI_MAP: Record<string, string> = {
        estres: '🔴', excesoCritico: '🌊', preAlerta: '🟡',
        excesoPreventivo: '💧', oreo: '🌾', transicion: '🌤️', optima: '✅',
    };

    const ESTADO_MAP: Record<string, string> = {
        estres: 'Estrés Hídrico Severo – Sequía Activa',
        excesoCritico: 'Anegamiento Crítico – Riesgo de Anoxia',
        preAlerta: 'Pre-Alerta por Déficit Hídrico',
        excesoPreventivo: 'Encharcamiento Preventivo',
        oreo: 'Suelo en Oreo – Post Saturación',
        transicion: 'Transición / Inicio de Lluvias',
        optima: 'Condición Hídrica Óptima',
    };

    // Aplicar regla de lluvia aislada: Si BH15 < -30 mm o lluvia aislada detectada
    let nivelFinal = rec.tipo;
    let estadoFinal = ESTADO_MAP[rec.tipo] ?? ESTADO_MAP.optima;
    let resumenFinal = rec.mensaje;

    if (rec.lluviaAislada || (rec.tipo === 'optima' && balances.balance_15d < -30)) {
        nivelFinal = 'preAlerta';
        estadoFinal = 'Lluvia Aislada – Déficit Hídrico Quincenal Activo';
        resumenFinal = perfil.recomendaciones.lluviaAislada;
    }

    return {
        fecha_analisis: new Date().toISOString(),
        estado_hidrico: estadoFinal,
        nivel_alerta: nivelFinal as DiagnosticoClimatico['nivel_alerta'],
        emoji_estado: EMOJI_MAP[nivelFinal] ?? '🟡',
        balance_hidrico_15d: balances.balance_15d,
        balance_hidrico_30d: balances.balance_30d,
        resumen_diagnostico: resumenFinal,
        impacto_pasturas: `Días secos ${balances.dias_secos_mes}/${balances.dias_transcurridos_mes}. Balance 15d: ${balances.balance_15d} mm vs demanda ET₀.`,
        recomendacion_rotacion: nivelFinal === 'preAlerta' || nivelFinal === 'estres'
            ? `Alargar descanso a 30–38 días; dejar remanente mínimo de 12 cm.`
            : `Mantener rotación según rebrote activo; evaluar aforo para ajustar carga.`,
        recomendacion_fertilizacion: balances.lluvia_15d < 30
            ? `Suspender urea al voleo. Sin humedad >30°C, volatilización supera el 50%.`
            : `Aplicar nitrógeno fraccionado post-lluvia con suelo en capacidad de campo.`,
        recomendacion_nutricion: `Ofrecer sal proteinada (100–150 g/cab/día) o sal con NNP al 2% para sostener GDP.`,
        metadatos_lluvia: { ...balances },
        fuente: 'local',
    };
}

// ─── 5. Caché Local (Offline) ─────────────────────────────────────────────────

function guardarCacheLocal(fincaId: string, diagnostico: DiagnosticoClimatico) {
    try {
        localStorage.setItem(
            CACHE_KEY_PREFIX + fincaId,
            JSON.stringify(diagnostico)
        );
    } catch { /* storage lleno, no fatal */ }
}

export function leerCacheLocal(fincaId: string): DiagnosticoClimatico | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY_PREFIX + fincaId);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// ─── 6. API Principal ─────────────────────────────────────────────────────────

/**
 * Carga el último diagnóstico climático de Supabase.
 * Retorna null si no existe o hay error (fallback al cache local).
 */
export async function obtenerUltimoAnalisisClimatico(
    fincaId: string
): Promise<DiagnosticoClimatico | null> {
    try {
        const { data, error } = await supabase
            .from('analisis_climatico_finca')
            .select('*')
            .eq('id_finca', fincaId)
            .order('fecha_analisis', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return null;

        return {
            id: data.id,
            fecha_analisis: data.fecha_analisis,
            estado_hidrico: data.estado_hidrico,
            nivel_alerta: data.nivel_alerta,
            emoji_estado: data.emoji_estado ?? '🟡',
            balance_hidrico_15d: data.balance_hidrico_15d ?? 0,
            balance_hidrico_30d: data.balance_hidrico_30d ?? 0,
            resumen_diagnostico: data.resumen_diagnostico ?? '',
            impacto_pasturas: data.impacto_pasturas ?? '',
            recomendacion_rotacion: data.recomendacion_rotacion ?? '',
            recomendacion_fertilizacion: data.recomendacion_fertilizacion ?? '',
            recomendacion_nutricion: data.recomendacion_nutricion ?? '',
            metadatos_lluvia: data.metadatos_lluvia ?? {},
            fuente: data.fuente ?? 'local',
        };
    } catch {
        return null;
    }
}

/**
 * Genera, persiste y retorna el diagnóstico climático.
 * Si hay conexión y API key: usa Gemini AI.
 * Si está offline o falla: usa el Motor Determinístico Calibrado.
 * Siempre guarda en caché local para acceso offline.
 */
export async function generarYGuardarAnalisisClimatico(
    fincaId: string,
    registros: RegistroLluviaMinimo[],
    ubicacion: string | null,
    municipio: string | null
): Promise<DiagnosticoClimatico> {
    const perfil = detectarRegionClimatica(ubicacion);
    const balances = calcularBalances(registros, perfil);

    let diagnostico: DiagnosticoClimatico;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const estaOnline = navigator.onLine;

    if (apiKey && estaOnline) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            
function withTimeout<T>(promise: Promise<T>, ms = 9000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout de respuesta IA (${ms / 1000}s)`)), ms)
        ),
    ]);
}

            // Usamos gemini-3.5-flash (igual que AgroBot) con fallback a gemini-3.6-flash y timeout estricto
            let resultado;
            try {
                const model = genAI.getGenerativeModel({
                    model: 'gemini-3.5-flash',
                    systemInstruction: buildSystemPrompt(),
                    generationConfig: {
                        maxOutputTokens: 600,
                        temperature: 0.2,
                        topP: 0.8,
                    },
                });
                resultado = await withTimeout(model.generateContent(buildUserPrompt(perfil, municipio, balances)), 9000);
            } catch (err35) {
                console.warn('[climateAiService] Fallback a gemini-3.6-flash por:', err35);
                const model36 = genAI.getGenerativeModel({
                    model: 'gemini-3.6-flash',
                    systemInstruction: buildSystemPrompt(),
                    generationConfig: {
                        maxOutputTokens: 600,
                        temperature: 0.2,
                        topP: 0.8,
                    },
                });
                resultado = await withTimeout(model36.generateContent(buildUserPrompt(perfil, municipio, balances)), 9000);
            }

            const texto = resultado.response.text();
            const json = parseRespuestaIA(texto);

            if (json && json.nivel_alerta && json.estado_hidrico) {
                const rec = json.recomendaciones as Record<string, string> | undefined;
                diagnostico = {
                    fecha_analisis: new Date().toISOString(),
                    estado_hidrico: String(json.estado_hidrico),
                    nivel_alerta: String(json.nivel_alerta) as DiagnosticoClimatico['nivel_alerta'],
                    emoji_estado: String(json.emoji_estado ?? '🟡'),
                    balance_hidrico_15d: Number(json.balance_hidrico_15d_mm ?? balances.balance_15d),
                    balance_hidrico_30d: balances.balance_30d,
                    resumen_diagnostico: String(json.resumen_ejecutivo ?? '').trim(),
                    impacto_pasturas: String(json.impacto_pasturas ?? '').trim(),
                    recomendacion_rotacion: String(rec?.rotacion_pastoreo ?? '').trim(),
                    recomendacion_fertilizacion: String(rec?.fertilizacion_suelo ?? '').trim(),
                    recomendacion_nutricion: String(rec?.nutricion_suplementacion ?? '').trim(),
                    metadatos_lluvia: { ...balances, zona: perfil.zona, municipio },
                    fuente: 'ia',
                };
            } else {
                console.warn('[climateAiService] JSON incompleto o no parseable de IA. Usando motor local.');
                diagnostico = generarDiagnosticoLocal(perfil, balances);
            }
        } catch (error) {
            console.error('[climateAiService] Error al llamar a la API de Gemini:', error);
            // Error en API (cuota, timeout, 503) → fallback local
            diagnostico = generarDiagnosticoLocal(perfil, balances);
        }
    } else {
        // Sin conexión → fallback local
        diagnostico = generarDiagnosticoLocal(perfil, balances);
    }

    // Persistir en Supabase (en background, sin bloquear la UI)
    if (estaOnline) {
        supabase.from('analisis_climatico_finca').insert({
            id_finca: fincaId,
            fecha_analisis: diagnostico.fecha_analisis,
            estado_hidrico: diagnostico.estado_hidrico,
            nivel_alerta: diagnostico.nivel_alerta,
            emoji_estado: diagnostico.emoji_estado,
            balance_hidrico_15d: diagnostico.balance_hidrico_15d,
            balance_hidrico_30d: diagnostico.balance_hidrico_30d,
            resumen_diagnostico: diagnostico.resumen_diagnostico,
            impacto_pasturas: diagnostico.impacto_pasturas,
            recomendacion_rotacion: diagnostico.recomendacion_rotacion,
            recomendacion_fertilizacion: diagnostico.recomendacion_fertilizacion,
            recomendacion_nutricion: diagnostico.recomendacion_nutricion,
            metadatos_lluvia: diagnostico.metadatos_lluvia,
            fuente: diagnostico.fuente,
        }).then(); // fire-and-forget
    }

    // Siempre guardar en caché local para disponibilidad offline
    guardarCacheLocal(fincaId, diagnostico);

    return diagnostico;
}
