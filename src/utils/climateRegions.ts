// Motor de perfiles climáticos regionales para Colombia
// Detecta la zona agroecológica según el campo 'ubicacion' de la finca
// y devuelve los parámetros correctos para el módulo de pluviometría.
//
// Calibración zootécnica por región:
//   - umbralRegistroMm: Norma OMM. < 1.0 mm = "trazas / margen de error de instrumento".
//     No cuenta como día con lluvia ni interrumpe la racha de estrés forrajero.
//   - umbralEfectivoMm: Umbral agronómico. Solo cuando se supera este valor el suelo
//     recibe recarga hídrica suficiente para sostener el rebrote del forraje y se
//     reinicia el contador de racha seca.
//   - diasSecosPreAlerta: A partir de este día de racha seca el crecimiento del
//     forraje se desacelera notoriamente y el asistente emite alerta amarilla.
//   - diasSecosAlerta: A partir de aquí es estrés hídrico activo y se requiere
//     protocolo de contingencia (reducción de carga, reservas forrajeras).

export interface PerfilClimatico {
    zona: string;
    descripcion: string;
    umbralRegistroMm: number;   // Mínimo OMM: < este valor = trazas, no cuenta como lluvia
    umbralEfectivoMm: number;   // Agronómico: mínimo para reactivar rebrote y romper racha seca
    diasSecosPreAlerta: number; // Inicio de desaceleración forrajera → Alerta Amarilla
    diasSecosAlerta: number;    // Estrés hídrico activo → Alerta Roja
    mmAnualReferencia: number;
    emoji: string;
    recomendaciones: {
        lluviaOptima: string;
        preAlerta: string;
        lluviaExceso: string;
        estresHidrico: string;
        transicion: string;
    };
}

const PERFILES_CLIMATICOS: { keywords: string[]; perfil: PerfilClimatico }[] = [
    // ─────────────────────────────────────────────────────────────
    // 1. COSTA CARIBE
    //    ET₀: 5.5–7.0 mm/día | Suelos: arcillosos/arenosos calientes
    //    Pasturas: Guinea (Mombasa/Tanzania), Angleton, Colosuana,
    //              Brachiaria Toledo, Estrella Africana
    // ─────────────────────────────────────────────────────────────
    {
        keywords: [
            'costa caribe', 'costa', 'caribe', 'montería', 'monteria', 'córdoba', 'cordoba',
            'sucre', 'sincelejo', 'valledupar', 'cesar', 'santa marta',
            'barranquilla', 'guajira', 'atlántico', 'atlantico', 'bolivar', 'bolívar',
            'mompós', 'mompos', 'corozal', 'chinú', 'chinu', 'sahagún', 'sahagun',
        ],
        perfil: {
            zona: 'Costa Caribe',
            descripcion: 'Trópico Bajo Seco – Bimodal con verano largo e intenso',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 8,
            diasSecosPreAlerta: 5,
            diasSecosAlerta: 10,
            mmAnualReferencia: 1200,
            emoji: '🌴',
            recomendaciones: {
                lluviaOptima: 'Condiciones de humedad favorables para las pasturas. Es el momento de optimizar la rotación cada 21–28 días para aprovechar el pico de proteína foliar antes de la lignificación. Aprovecha para aplicar correctivos al suelo y resembrar claros. Monitorea el aforo para ajustar la carga (UGG/ha) y no comprometer el rebrote.',
                preAlerta: `⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva. En la Costa Caribe la evapotranspiración supera los 6 mm/día y el suelo está comenzando a secar. Alarga los períodos de descanso de los potreros a 30–35 días para no pelar el rebrote. Deja un remanente de 10–15 cm para proteger el suelo del sol directo y evitar que la temperatura radicular supere los 45°C. Revisa las reservas de agua para el ganado.`,
                lluviaExceso: 'Exceso de precipitación. En suelos arcillosos de la Costa el pisoteo con saturación genera compactación severa y pudrición de raíces. Restringe el acceso a los potreros más pesados, activa drenajes y monitorea la presencia de pododermatitis (pie podrido). Aprovecha para verificar el plan sanitario completo.',
                estresHidrico: '🔴 Alerta Crítica: el déficit hídrico supera el umbral de estrés severo para las pasturas costeras. El Guinea y el Angleton entran en floración prematura con drástica caída de digestibilidad. Activa inmediatamente el protocolo de verano: abre los bancos de forraje (corte/silo de sorgo o maíz), suministra sal mineralizada con 30–40% de proteína digestible (harina de algodón, palmiste o urea) y evalúa venta estratégica de lotes rezagados o terminados para reducir la carga.',
                transicion: 'Inicio del período de lluvias detectado. Espera al menos 3–4 aguaceros efectivos (≥ 8 mm c/u) antes de aumentar la carga animal para dar tiempo al rebrote. Los primeros rebrotes tienen alta proteína: es el mejor momento para fertilizar con nitrógeno y aplicar correctivos al suelo.',
            },
        },
    },

    // ─────────────────────────────────────────────────────────────
    // 2. MAGDALENA MEDIO
    //    ET₀: 4.5–5.5 mm/día | Suelos: aluviales / terrazas
    //    Pasturas: Brachiaria decumbens, humidicola, brizantha
    //              (Marandú, Toledo), Mulato II
    // ─────────────────────────────────────────────────────────────
    {
        keywords: [
            'magdalena medio', 'puerto berrío', 'puerto berrio', 'la dorada',
            'aguachica', 'barrancabermeja', 'yondó', 'yondo', 'puerto nare',
            'puerto triunfo', 'remedios', 'vegachí', 'vegachi', 'maceo',
            'cimitarra', 'landázuri', 'landazuri', 'san pablo', 'cantagallo',
        ],
        perfil: {
            zona: 'Magdalena Medio',
            descripcion: 'Trópico Bajo Húmedo – Bimodal con buen régimen hídrico',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 5,
            diasSecosPreAlerta: 6,
            diasSecosAlerta: 12,
            mmAnualReferencia: 2400,
            emoji: '🌧️',
            recomendaciones: {
                lluviaOptima: 'Condiciones hídricas ideales para las Brachiarias. Rota agresivo cada 18–25 días para aprovechar el pico de rebrote antes de la lignificación. Excelente momento para aplicar fertilización nitrogenada post-lluvia y realizar aforos de los potreros que guíen el ajuste de la carga (UGG/ha).',
                preAlerta: `⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva. El rebrote de la Brachiaria está desacelerando: la tasa de crecimiento puede estar cayendo hasta un 40%, la proteína cruda (PC) baja y la fibra neutro detergente (FDN) sube. Ajusta la rotación pasando de 21–25 días a 28–32 días de descanso para no castigar el meristemo de crecimiento. Evalúa ofrecer sal proteinada (100–150 g/cab/día) para mantener la eficiencia ruminal y sostener la GDP.`,
                lluviaExceso: 'Exceso de precipitación. El encharcamiento en suelos planos del Magdalena Medio limita el acceso a los potreros y reduce la eficiencia de conversión. Mueve los animales a potreros con mejor drenaje. El estrés térmico combinado con humedad excesiva y el pisoteo en lodo compactan el suelo y dañan las raíces del pasto.',
                estresHidrico: '🔴 Alerta Crítica: el estrés hídrico supera el umbral de alerta para la región. El crecimiento de las Brachiarias se frena abruptamente y la oferta forrajera caerá en los próximos días. Ajusta la carga animal, prolonga los períodos de descanso de los potreros a 35–40 días y activa el plan de suplementación estratégica (sal proteinada + energética). Identifica los potreros con acceso a agua o ribera para concentrar el ganado.',
                transicion: 'Inicio del período de lluvias detectado. Los primeros rebrotes de Brachiaria son los más nutritivos del año (alta proteína cruda). Optimiza la rotación para aprovechar esta ventana y acelerar la GDP. Aplica fertilización de arranque con fósforo y revisa el plan de mineralización.',
            },
        },
    },

    // ─────────────────────────────────────────────────────────────
    // 3. LLANOS ORIENTALES / ORINOQUÍA
    //    ET₀: 5.0–6.0 mm/día | Suelos: Oxisoles / Altillanura
    //    Pasturas: Brachiaria humidicola (Dictyoneura), Llanero,
    //              Decumbens, Sabanas nativas (Trachypogon, Paspalum)
    // ─────────────────────────────────────────────────────────────
    {
        keywords: [
            'llanos', 'orinoquía', 'orinoquia', 'meta', 'villavicencio', 'casanare',
            'yopal', 'arauca', 'vichada', 'puerto gaitán', 'puerto gaitan',
            'granada', 'san martín', 'san martin', 'acacías', 'acacias',
            'restrepo', 'cumaral', 'paz de ariporo', 'hato corozal',
        ],
        perfil: {
            zona: 'Llanos Orientales / Orinoquía',
            descripcion: 'Trópico Bajo – Monomodal con invierno intenso y verano marcado',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 5,
            diasSecosPreAlerta: 7,
            diasSecosAlerta: 14,
            mmAnualReferencia: 2800,
            emoji: '🌾',
            recomendaciones: {
                lluviaOptima: 'Período de invierno activo con buena oferta forrajera. Aprovecha para acumular reservas forrajeras (ensilaje de gramíneas nativas o sorgo) que soporten el verano monomodal llanero. Aplica suplementación mineral azufrada para compensar los suelos ácidos y lixiviados de la Altillanura y mantener la GDP.',
                preAlerta: `⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva. Las pasturas de sabana y la Humidicola retienen volumen pero su proteína cruda puede estar cayendo a niveles críticos (< 4%), frenando la celulólisis ruminal y comprometiendo la conversión. Inicia suministro de sal mineralizada enriquecida con azufre y nitrógeno no proteico (urea 2–3%) para mantener la flora ruminal activa y que el ganado pueda degradar la fibra seca. Monitorea el estado corporal del hato.`,
                lluviaExceso: 'Las lluvias intensas del invierno llanero pueden generar anegamientos prolongados en los bajos y esteros. Concentra el ganado en zonas altas (bancos de sabana). Monitorea enfermedades asociadas a aguas estancadas (carbón sintomático, anaplasmosis, babesiosis). Verifica el plan sanitario completo.',
                estresHidrico: '🔴 Alerta Crítica: el verano llanero está impactando la oferta forrajera activamente. Los pastos nativos pierden calidad rápidamente: fibra lignificada y proteína por el suelo. Garantiza fuentes de agua permanente, activa el inventario de reservas forrajeras acumuladas en invierno. Prioriza animales de mayor GDP y evalúa venta estratégica de rezagados y lotes terminados para reducir la carga soportada.',
                transicion: 'Inicio del período lluvioso detectado. Los primeros rebrotes de sabana requieren 2–3 semanas de lluvias regulares antes de mover el ganado con carga plena, para no retrasar el establecimiento del pasto. Aprovecha para fertilizar y revisar los inventarios de sales minerales.',
            },
        },
    },

    // ─────────────────────────────────────────────────────────────
    // 4. ZONA ANDINA / TRÓPICO ALTO
    //    ET₀: 2.5–3.5 mm/día | Suelos: Andisoles / alta MO
    //    Pasturas: Kikuyo (P. clandestinum), Rye-grass (Lolium),
    //              Trébol blanco/rojo, Falsa Poa
    //    RIESGO ESPECIAL: Heladas nocturnas por radiación en verano
    // ─────────────────────────────────────────────────────────────
    {
        keywords: [
            'antioquia', 'medellín', 'medellin', 'risaralda', 'caldas',
            'quindío', 'quindio', 'cundinamarca', 'bogotá', 'bogota',
            'boyacá', 'boyaca', 'nariño', 'narino', 'pasto', 'ipiales',
            'ubaté', 'ubate', 'zipaquirá', 'zipaquira', 'tunja', 'duitama', 'sogamoso',
            'manizales', 'pereira', 'armenia', 'chinchiná', 'chinchina',
        ],
        perfil: {
            zona: 'Zona Andina / Trópico Alto',
            descripcion: 'Trópico de Altura – Bimodal frío con riesgo de heladas nocturnas',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 4,
            diasSecosPreAlerta: 8,
            diasSecosAlerta: 15,
            mmAnualReferencia: 1600,
            emoji: '🏔️',
            recomendaciones: {
                lluviaOptima: 'Condiciones favorables para Kikuyo y Rye-grass. Ajusta la densidad de siembra y aplica nitrógeno (urea) fraccionado para estimular el macollamiento. Revisa el pH del suelo: el encalado es crítico para la disponibilidad de nutrientes en trópico alto. Períodos de descanso de 35–45 días para una producción sostenida.',
                preAlerta: `⚠️ Pre-Alerta: llevas varios días sin lluvia efectiva. En trópico alto esto eleva significativamente el riesgo de heladas nocturnas por radiación: los días despejados y secos permiten que la temperatura de las praderas caiga por debajo de 0°C en la madrugada, quemando la lámina foliar del Kikuyo. Evita fertilizar con urea al voleo sin humedad (pérdidas por volatilización > 50%). Alarga los períodos de descanso a 40–50 días y monitorea diariamente el pronóstico de temperatura mínima. Si hay riesgo de helada, activa aspersores de riego nocturno si cuentas con el sistema.`,
                lluviaExceso: 'El exceso de humedad en trópico alto favorece el desarrollo de Fasciola hepática (duela del hígado). Implementa control de caracoles en zonas húmedas y revisa el protocolo de desparasitación. Limita el pisoteo en suelos saturados para prevenir la compactación que en andisoles es especialmente dañina para la estructura porosa del suelo.',
                estresHidrico: '🔴 Alerta Crítica: el período seco se extiende y los riesgos de helada aumentan noche a noche. Si hay helada prevista o confirmada, no rotar al día siguiente: deja que el pasto se recupere antes de pastorear para evitar daño al meristemo. Prepara reservas de forraje (heno de Rye-grass o silo de avena). En lechería especializada, ajusta la ración de balanceado y aplica sales buffer para prevenir acidosis si el ganado consume fibra lignificada o quemada.',
                transicion: 'Con el inicio de lluvias, el Rye-grass y el Kikuyo responden rápidamente. Realiza una fertilización de arranque con fósforo y potasio, y planifica la rotación considerando que los períodos de descanso en altura son más largos (35–45 días) para una producción de calidad.',
            },
        },
    },
];

const PERFIL_DEFAULT: PerfilClimatico = {
    zona: 'Trópico Bajo',
    descripcion: 'Zona tropical – Parámetros estándar',
    umbralRegistroMm: 1.0,
    umbralEfectivoMm: 5,
    diasSecosPreAlerta: 6,
    diasSecosAlerta: 12,
    mmAnualReferencia: 2000,
    emoji: '🌿',
    recomendaciones: {
        lluviaOptima: 'Las condiciones de humedad son favorables para el crecimiento de los pastos. Optimiza la rotación de potreros para aprovechar el período de rebrote activo y ajusta la carga animal según el aforo disponible.',
        preAlerta: '⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva y el crecimiento del forraje comienza a desacelerarse. Alarga los períodos de descanso de los potreros, reduce la presión de pastoreo y evalúa la suplementación mineral/proteica para mantener la GDP del hato.',
        lluviaExceso: 'Se detecta exceso de precipitación. Monitorea el estado de los suelos y evita el pisoteo en zonas saturadas. Revisa el bienestar animal y el estado sanitario del hato.',
        estresHidrico: '🔴 Alerta Crítica: la racha seca supera el umbral de estrés hídrico. El crecimiento del pasto se detiene. Amplía los períodos de descanso, reduce la carga animal y activa el plan de suplementación estratégica para mantener la GDP y el estado corporal del ganado.',
        transicion: 'Inicio de período lluvioso detectado. Espera que el suelo tenga humedad suficiente antes de intensificar el pastoreo. Buen momento para resembrar claros y fertilizar.',
    },
};

export function detectarRegionClimatica(ubicacion: string | null | undefined): PerfilClimatico {
    if (!ubicacion) return PERFIL_DEFAULT;

    // Match exacto con los valores del dropdown (prioridad absoluta)
    const EXACT_MAP: Record<string, PerfilClimatico> = {};
    for (const entrada of PERFILES_CLIMATICOS) {
        EXACT_MAP[entrada.perfil.zona.toLowerCase()] = entrada.perfil;
    }
    const exactKey = ubicacion.trim().toLowerCase();
    if (EXACT_MAP[exactKey]) return EXACT_MAP[exactKey];

    // Fallback: búsqueda por keywords (compatibilidad con datos antiguos)
    const texto = ubicacion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let mejorCoincidencia: { perfil: PerfilClimatico; matches: number } | null = null;

    for (const entrada of PERFILES_CLIMATICOS) {
        const matches = entrada.keywords.filter(kw => {
            const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return texto.includes(kwNorm);
        }).length;

        if (matches > 0 && (!mejorCoincidencia || matches > mejorCoincidencia.matches)) {
            mejorCoincidencia = { perfil: entrada.perfil, matches };
        }
    }

    return mejorCoincidencia ? mejorCoincidencia.perfil : PERFIL_DEFAULT;
}

export function generarRecomendacion(
    perfil: PerfilClimatico,
    diasSecosConsecutivos: number,
    mmUltimos30Dias: number
): { tipo: 'optima' | 'exceso' | 'estres' | 'transicion' | 'preAlerta'; mensaje: string } {
    const mmMensualReferencia = perfil.mmAnualReferencia / 12;

    // Prioridad 1: Estrés hídrico activo (Alerta Roja)
    if (diasSecosConsecutivos >= perfil.diasSecosAlerta) {
        return { tipo: 'estres', mensaje: perfil.recomendaciones.estresHidrico };
    }

    // Prioridad 2: Pre-Alerta Hídrica (Alerta Amarilla)
    // Se activa cuando la racha supera el umbral de pre-alerta
    if (diasSecosConsecutivos >= perfil.diasSecosPreAlerta) {
        return { tipo: 'preAlerta', mensaje: perfil.recomendaciones.preAlerta };
    }

    // Prioridad 3: Exceso de precipitación (Alerta Azul/Naranja)
    if (mmUltimos30Dias > mmMensualReferencia * 1.5) {
        return { tipo: 'exceso', mensaje: perfil.recomendaciones.lluviaExceso };
    }

    // Prioridad 4: Transición / Inicio de lluvias
    // Acumulado muy bajo Y racha corta (inicio de la temporada lluviosa)
    if (mmUltimos30Dias < mmMensualReferencia * 0.4 && diasSecosConsecutivos <= 3) {
        return { tipo: 'transicion', mensaje: perfil.recomendaciones.transicion };
    }

    // Estado 5: Condiciones óptimas
    return { tipo: 'optima', mensaje: perfil.recomendaciones.lluviaOptima };
}
