// Motor de perfiles climáticos regionales para Colombia
// Detecta la zona agroecológica según el campo 'ubicacion' de la finca
// y devuelve los parámetros correctos para el módulo de pluviometría.
//
// ─────────────────────────────────────────────────────────────────────────────
// Calibración zootécnica y edafoclimática por región:
//
//  DÉFICIT HÍDRICO (Sequía)
//   - umbralRegistroMm    : Norma OMM. < este valor = trazas / margen de
//                           error de instrumento. No cuenta como día con
//                           lluvia ni interrumpe la racha de estrés.
//   - umbralEfectivoMm    : Umbral agronómico basado en ET₀ (FAO Penman-
//                           Monteith) + Factor de intercepción foliar/suelo.
//                           Solo cuando se supera este valor el suelo recibe
//                           recarga hídrica suficiente para sostener el
//                           rebrote del forraje y se reinicia el contador
//                           de racha seca.
//   - diasSecosPreAlerta  : Días sin lluvia efectiva a partir de los cuales
//                           el crecimiento del forraje se desacelera
//                           notoriamente → Alerta Amarilla de Sequía.
//   - diasSecosAlerta     : Estrés hídrico activo que requiere protocolo
//                           de contingencia → Alerta Roja de Sequía.
//
//  EXCESO HÍDRICO (Inundación / Anegamiento)
//   - exceso7dAmarilla    : Lluvia acumulada en 7 días que produce
//                           encharcamiento superficial y saturación de los
//                           primeros 10–15 cm → Alerta Amarilla de Exceso.
//   - exceso7dRoja        : Lluvia acumulada en 7 días que genera anoxia
//                           radicular, compactación por pisoteo (≥35% del
//                           aforo), pododermatitis → Alerta Roja de Exceso.
//  AMORTIGUACIÓN POST-SATURACIÓN (Oreo)
//   - diasBufferPostExceso: Días de retraso matemático sobre la racha seca tras
//                           un evento de exceso. El suelo conserva capacidad de
//                           campo y sostiene fotosíntesis sin estrés.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoEstadoHidrico = 
    | 'optima' 
    | 'preAlerta' 
    | 'estres' 
    | 'excesoPreventivo' 
    | 'excesoCritico' 
    | 'transicion'
    | 'oreo';

export interface PerfilClimatico {
    zona: string;
    descripcion: string;
    et0Diaria: string;              // Rango de ET₀ de referencia FAO Penman-Monteith
    forrajesDominantes: string;     // Especies forrajeras representativas
    sueloDrenaje: string;           // Textura de suelo y tipo de drenaje natural

    // Umbrales de déficit hídrico
    umbralRegistroMm: number;       // < este valor = trazas (OMM)
    umbralEfectivoMm: number;       // Mínimo agronómico para romper racha seca (ET₀-based)
    diasSecosPreAlerta: number;     // Alerta Amarilla de Sequía
    diasSecosAlerta: number;        // Alerta Roja de Sequía

    // Umbrales de exceso hídrico (Matriz Regional calibrada por zootecnista)
    exceso7dAmarilla: number;       // mm/7d → Alerta Amarilla: Encharcamiento Preventivo
    exceso7dRoja: number;           // mm/7d → Alerta Roja: Anegamiento Crítico
    exceso30d: number;              // mm/30d → Alerta Roja: Saturación de Perfil
    diasBufferPostExceso: number;   // Días de amortiguación hídrica tras saturación

    mmAnualReferencia: number;
    emoji: string;

    recomendaciones: {
        lluviaOptima: string;
        preAlerta: string;
        excesoPreventivo: string;   // ⚠️ Alerta Amarilla de Exceso – Encharcamiento
        excesoCritico: string;      // 🌊 Alerta Roja de Exceso – Anegamiento Crítico
        estresHidrico: string;
        transicion: string;
        oreo: string;               // 🌾 Amortiguación y Manejo Topográfico
    };
}

const PERFILES_CLIMATICOS: { keywords: string[]; perfil: PerfilClimatico }[] = [
    // ─────────────────────────────────────────────────────────────────────────
    // 1. COSTA CARIBE
    //    ET₀: 5.5–7.0 mm/día | Suelos: Franco-arcillosos / Vertisoles pesados
    //    Pasturas: Guinea (Mombaza/Tanzania), Angleton, Colosuana, Estrella
    //    Drenaje: Lento a muy lento (Bajos y Planicies)
    // ─────────────────────────────────────────────────────────────────────────
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
            et0Diaria: '5.5 – 7.0 mm/día',
            forrajesDominantes: 'Guinea (Mombaza/Tanzania), Angleton, Colosuana, Estrella Africana',
            sueloDrenaje: 'Franco-arcillosos / Vertisoles pesados – Drenaje lento a muy lento',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 8,
            diasSecosPreAlerta: 5,
            diasSecosAlerta: 10,
            exceso7dAmarilla: 90,
            exceso7dRoja: 150,
            exceso30d: 220,
            diasBufferPostExceso: 4,
            mmAnualReferencia: 1200,
            emoji: '🌴',
            recomendaciones: {
                lluviaOptima: 'Condiciones de humedad favorables para las pasturas. Es el momento de optimizar la rotación cada 21–28 días para aprovechar el pico de proteína foliar antes de la lignificación. Aprovecha para aplicar correctivos al suelo y resembrar claros. Monitorea el aforo para ajustar la carga (UGG/ha) y no comprometer el rebrote.',
                preAlerta: '⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva. En la Costa Caribe la evapotranspiración supera los 6 mm/día y el suelo está comenzando a secar. Alarga los períodos de descanso de los potreros a 30–35 días para no pelar el rebrote. Deja un remanente de 10–15 cm para proteger el suelo del sol directo y evitar que la temperatura radicular supere los 45°C. Revisa las reservas de agua para el ganado.',
                excesoPreventivo: '💧 Alerta Amarilla – Encharcamiento Preventivo: has acumulado lluvia suficiente para saturar los primeros 10–15 cm del perfil en los Vertisoles y Planicies del Caribe, cuyo drenaje natural es lento a muy lento. Mueve el ganado de los bajos y vegas hacia zonas más altas o con mejor pendiente. Reduce la velocidad de rotación para no pelar el rebrote en potreros con lodo. Monitorea la incidencia de pododermatitis (pie podrido / gabarro) en el hato, especialmente en bovinos pesados. Si tienes drenajes o zanjas, revisa que estén descongestionados.',
                excesoCritico: '🌊 Alerta Roja – Anegamiento Crítico: el volumen de lluvia concentrado ha superado el umbral de anegamiento para los suelos de la Costa Caribe. Los Vertisoles están en colapso de macroporosidad: sin oxígeno en la rizosfera las pasturas (Guinea, Angleton) sufren anoxia radicular y detienen completamente su crecimiento. El ganado pierde hasta un 25% de eficiencia energética caminando en el lodo, la pododermatitis se dispara y las pérdidas de aforo por pisoteo pueden superar el 35%. Acción inmediata: 1) Saca los animales de los potreros inundados y concentra en zonas altas con acceso a sombra. 2) Activa el plan sanitario preventivo (vacunación, antisépticos en pezuñas). 3) Evalúa suplementación estratégica con sal mineralizada y proteína para compensar la caída en oferta forrajera. 4) No rotes hasta que el suelo tenga capacidad de carga sin dejar huellas profundas.',
                estresHidrico: '🔴 Alerta Crítica: el déficit hídrico supera el umbral de estrés severo para las pasturas costeras. El Guinea y el Angleton entran en floración prematura con drástica caída de digestibilidad. Activa inmediatamente el protocolo de verano: abre los bancos de forraje (corte/silo de sorgo o maíz), suministra sal mineralizada con 30–40% de proteína digestible (harina de algodón, palmiste o urea) y evalúa venta estratégica de lotes rezagados o terminados para reducir la carga.',
                transicion: 'Inicio del período de lluvias detectado. Espera al menos 3–4 aguaceros efectivos (≥ 8 mm c/u) antes de aumentar la carga animal para dar tiempo al rebrote. Los primeros rebrotes tienen alta proteína: es el mejor momento para fertilizar con nitrógeno y aplicar correctivos al suelo.',
                oreo: '🌾 Suelo en proceso de oreo tras saturación previa en el Caribe. La humedad subsuperficial sostiene la fotosíntesis y el rebrote sin estrés hídrico. Pastorea primero las praderas de sabana alta y bancos con buen drenaje; mantén los bajos y playones en descanso hasta que recuperen piso para no destruir el sward por pisoteo.',
            },
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 2. MAGDALENA MEDIO
    //    ET₀: 4.5–5.5 mm/día | Suelos: Franco-arcillosos a arcillosos ácidos
    //    Pasturas: Brachiaria decumbens, humidicola, brizantha (Toledo, Marandú)
    //    Drenaje: Moderado en loma, muy lento en vegas
    // ─────────────────────────────────────────────────────────────────────────
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
            et0Diaria: '4.5 – 5.5 mm/día',
            forrajesDominantes: 'B. decumbens, B. humidicola, B. brizantha (Toledo/Marandú), Mulato II',
            sueloDrenaje: 'Franco-arcillosos a arcillosos ácidos (oxisoles/ultisoles) – Moderado en loma, muy lento en vegas',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 5,
            diasSecosPreAlerta: 6,
            diasSecosAlerta: 12,
            exceso7dAmarilla: 110,
            exceso7dRoja: 160,
            exceso30d: 300,
            diasBufferPostExceso: 5,
            mmAnualReferencia: 2400,
            emoji: '🌧️',
            recomendaciones: {
                lluviaOptima: 'Condiciones hídricas ideales para las Brachiarias. Rota agresivo cada 18–25 días para aprovechar el pico de rebrote antes de la lignificación. Excelente momento para aplicar fertilización nitrogenada post-lluvia y realizar aforos de los potreros que guíen el ajuste de la carga (UGG/ha).',
                preAlerta: '⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva. El rebrote de la Brachiaria está desacelerando: la tasa de crecimiento puede estar cayendo hasta un 40%, la proteína cruda (PC) baja y la fibra neutro detergente (FDN) sube. Ajusta la rotación pasando de 21–25 días a 28–32 días de descanso para no castigar el meristemo de crecimiento. Evalúa ofrecer sal proteinada (100–150 g/cab/día) para mantener la eficiencia ruminal y sostener la GDP.',
                excesoPreventivo: '💧 Alerta Amarilla – Encharcamiento Preventivo: has acumulado lluvia suficiente para saturar los perfiles bajos y de vega en el Magdalena Medio. Los suelos franco-arcillosos de las riberas y terrazas bajas tienen drenaje muy lento y el agua está comenzando a acumularse en los primeros horizontes. Retira el ganado pesado de las vegas y bajos para evitar daño al sward (dosel forrajero). Alarga el período de descanso de los potreros afectados a 35–40 días para recuperar estructura del suelo. Revisa el plan sanitario y registra el estado de las pezuñas del hato.',
                excesoCritico: '🌊 Alerta Roja – Anegamiento Crítico: el Magdalena Medio ha superado el umbral de anegamiento severo. En las vegas y bajíos, las Brachiarias (decumbens, Toledo, humidicola) están experimentando anoxia radicular: sin oxígeno en el perfil, la raíz no absorbe nutrientes y el pasto entra en parálisis fisiológica. El ganado pierde GDP por el estrés de caminata en barro (hasta 25% de energía neta) y la pododermatitis se puede disparar a tasas de 15–20% del hato. Acción inmediata: 1) Concentra el ganado en las áreas más altas de la finca o en corrales con acceso a suplemento. 2) Activa el protocolo sanitario de pododermatitis (baños de pezuña con sulfato de zinc o formol diluido). 3) Ofrece sal mineralizada enriquecida y suplemento proteico/energético para compensar la caída del aforo. 4) No ingreses al potrero hasta que el suelo soporte el paso sin dejar huellas mayores a 3 cm.',
                estresHidrico: '🔴 Alerta Crítica: el estrés hídrico supera el umbral de alerta para la región. El crecimiento de las Brachiarias se frena abruptamente y la oferta forrajera caerá en los próximos días. Ajusta la carga animal, prolonga los períodos de descanso de los potreros a 35–40 días y activa el plan de suplementación estratégica (sal proteinada + energética). Identifica los potreros con acceso a agua o ribera para concentrar el ganado.',
                transicion: 'Inicio del período de lluvias detectado. Los primeros rebrotes de Brachiaria son los más nutritivos del año (alta proteína cruda). Optimiza la rotación para aprovechar esta ventana y acelerar la GDP. Aplica fertilización de arranque con fósforo y revisa el plan de mineralización.',
                oreo: '🌾 Suelo en proceso de oreo tras saturación previa en el Magdalena Medio. La humedad del subsuelo sostiene la fotosíntesis y el rebrote de la Brachiaria sin estrés hídrico. Pastorea praderas de ladera y loma; mantén las vegas bajas en descanso hasta recuperar piso y evitar el pisotón profundo (>3 cm).',
            },
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 3. LLANOS ORIENTALES / ORINOQUÍA
    //    ET₀: 5.0–6.0 mm/día | Suelos: Oxisoles franco-arenosos (altillanura)
    //    Pasturas: B. humidicola, B. dictyoneura, Llanero, Sabana nativa
    //    Drenaje: Rápido en sabana alta, nulo en bajos / planicie inundable
    // ─────────────────────────────────────────────────────────────────────────
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
            et0Diaria: '5.0 – 6.0 mm/día',
            forrajesDominantes: 'B. humidicola (Dictyoneura), B. decumbens, Paspalum (Llanero), Sabanas nativas',
            sueloDrenaje: 'Oxisoles franco-arenosos (altillanura) / Planicie inundable – Rápido en sabana alta, nulo en bajos',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 5.5,
            diasSecosPreAlerta: 7,
            diasSecosAlerta: 14,
            exceso7dAmarilla: 120,
            exceso7dRoja: 180,
            exceso30d: 380,
            diasBufferPostExceso: 4,
            mmAnualReferencia: 2800,
            emoji: '🌾',
            recomendaciones: {
                lluviaOptima: 'Período de invierno activo con buena oferta forrajera. Aprovecha para acumular reservas forrajeras (ensilaje de gramíneas nativas o sorgo) que soporten el verano monomodal llanero. Aplica suplementación mineral azufrada para compensar los suelos ácidos y lixiviados de la Altillanura y mantener la GDP.',
                preAlerta: '⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva. Las pasturas de sabana y la Humidicola retienen volumen pero su proteína cruda puede estar cayendo a niveles críticos (< 4%), frenando la celulólisis ruminal y comprometiendo la conversión. Inicia suministro de sal mineralizada enriquecida con azufre y nitrógeno no proteico (urea 2–3%) para mantener la flora ruminal activa y que el ganado pueda degradar la fibra seca. Monitorea el estado corporal del hato.',
                excesoPreventivo: '💧 Alerta Amarilla – Encharcamiento Preventivo: el invierno llanero está acumulando volúmenes que comienzan a anegar los bajos y esteros de la sabana. Aunque la Altillanura drena bien, las planicies inundables y los bancos bajos ya están saturados. Concentra el ganado en los bancos y zonas altas de la sabana. Monitorea el estado de los accesos (callejones y caminos internos) para evitar el deterioro de infraestructura. Mantén el plan de mineralización activo: los suelos lixiviados de los Llanos pierden Ca, P y S rápidamente con lluvias intensas.',
                excesoCritico: '🌊 Alerta Roja – Anegamiento Crítico: el invierno llanero ha superado el umbral de anegamiento severo. Los bajos y esteros están completamente saturados o inundados. Las pasturas en las zonas bajas están bajo anoxia radicular: B. humidicola tolera algo de inundación temporal, pero períodos prolongados afectan la fijación de raíces y la absorción de nutrientes. Riesgo crítico de enfermedades vectoriales (anaplasmosis, babesiosis, carbón sintomático) transmitidas por ectoparásitos que proliferan en aguas estancadas. Acción inmediata: 1) Reubica todo el ganado en bancos de sabana alta y potreros con elevación. 2) Aplica el protocolo sanitario preventivo completo (garrapaticida, baños). 3) Activa las reservas forrajeras acumuladas (ensilaje de invierno). 4) Si tienes hato de cría, prioriza las hembras gestantes o en lactancia en las mejores zonas de acceso.',
                estresHidrico: '🔴 Alerta Crítica: el verano llanero está impactando la oferta forrajera activamente. Los pastos nativos pierden calidad rápidamente: fibra lignificada y proteína por el suelo. Garantiza fuentes de agua permanente, activa el inventario de reservas forrajeras acumuladas en invierno. Prioriza animales de mayor GDP y evalúa venta estratégica de rezagados y lotes terminados para reducir la carga soportada.',
                transicion: 'Inicio del período lluvioso detectado. Los primeros rebrotes de sabana requieren 2–3 semanas de lluvias regulares antes de mover el ganado con carga plena, para no retrasar el establecimiento del pasto. Aprovecha para fertilizar y revisar los inventarios de sales minerales.',
                oreo: '🌾 Suelo en proceso de oreo tras saturación invernal en los Llanos. La Altillanura drena rápidamente y sostiene buen pastoreo, pero los esteros y bajos de sabana siguen anegados. Conduce los lotes a las partes altas de la sabana y no fuerces el pastoreo en zonas bajas para proteger el rebrote de Humidicola y pastos nativos.',
            },
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 4. ZONA ANDINA / TRÓPICO ALTO
    //    ET₀: 2.5–3.5 mm/día | Suelos: Andisoles (ceniza volcánica) alta retención
    //    Pasturas: Kikuyo (P. clandestinum), Rye-grass (Lolium), Trébol, Falsa Poa
    //    Drenaje: Rápido a moderado – Riesgo de erosión en pendientes
    // ─────────────────────────────────────────────────────────────────────────
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
            et0Diaria: '2.5 – 3.5 mm/día',
            forrajesDominantes: 'Kikuyo (P. clandestinum), Rye-grass (Lolium perenne), Trébol blanco/rojo, Falsa Poa',
            sueloDrenaje: 'Andisoles de alta retención (ceniza volcánica) – Rápido a moderado, riesgo de erosión en pendientes',
            umbralRegistroMm: 1.0,
            umbralEfectivoMm: 4,
            diasSecosPreAlerta: 8,
            diasSecosAlerta: 15,
            exceso7dAmarilla: 75,
            exceso7dRoja: 120,
            exceso30d: 200,
            diasBufferPostExceso: 6,
            mmAnualReferencia: 1600,
            emoji: '🏔️',
            recomendaciones: {
                lluviaOptima: 'Condiciones favorables para Kikuyo y Rye-grass. Ajusta la densidad de siembra y aplica nitrógeno (urea) fraccionado para estimular el macollamiento. Revisa el pH del suelo: el encalado es crítico para la disponibilidad de nutrientes en trópico alto. Períodos de descanso de 35–45 días para una producción sostenida.',
                preAlerta: '⚠️ Pre-Alerta: llevas varios días sin lluvia efectiva. En trópico alto esto eleva significativamente el riesgo de heladas nocturnas por radiación: los días despejados y secos permiten que la temperatura de las praderas caiga por debajo de 0°C en la madrugada, quemando la lámina foliar del Kikuyo. Evita fertilizar con urea al voleo sin humedad (pérdidas por volatilización > 50%). Alarga los períodos de descanso a 40–50 días y monitorea diariamente el pronóstico de temperatura mínima. Si hay riesgo de helada, activa aspersores de riego nocturno si cuentas con el sistema.',
                excesoPreventivo: '💧 Alerta Amarilla – Exceso de Humedad Preventivo: los Andisoles de trópico alto tienen alta retención de agua, pero en pendientes pronunciadas el exceso de lluvia genera escurrimiento superficial que arrastra los horizontes más ricos en materia orgánica. El nivel de humedad actual favorece condiciones para el desarrollo de Fasciola hepatica (duela del hígado) a través de la proliferación del caracol Lymnaea en zonas húmedas. Implementa control preventivo de caracoles en los bordes de bebederos, cañadas y zonas con agua estancada. Evita el pisoteo en suelos saturados para no destruir la estructura porosa del andisol. Reduce la velocidad de rotación y no apliques urea hasta que el suelo esté en capacidad de campo normal.',
                excesoCritico: '🌊 Alerta Roja – Exceso Crítico de Humedad: el volumen de lluvia supera la capacidad de retención y drenaje de los Andisoles en trópico alto. El principal riesgo no es el anegamiento (el drenaje es rápido), sino la erosión laminar y la pérdida de nutrientes por lixiviación en ladera. Adicionalmente, la saturación de zonas planas y quebradas crea el ambiente perfecto para una infestación masiva de Fasciola hepatica (duela del hígado): el caracol vector prolifera explosivamente. Acción inmediata: 1) Cierra los potreros en pendiente para prevenir erosión y compactación. 2) Aplica protocolo antiparasitario de fasciola (triclabendazol o closantel) preventivo en el hato completo. 3) Revisa y limpia zanjas, cunetas y caminos internos para evitar erosión y derrumbes. 4) Retrasa cualquier fertilización hasta que cese el exceso de humedad.',
                estresHidrico: '🔴 Alerta Crítica: el período seco se extiende y los riesgos de helada aumentan noche a noche. Si hay helada prevista o confirmada, no rotar al día siguiente: deja que el pasto se recupere antes de pastorear para evitar daño al meristemo. Prepara reservas de forraje (heno de Rye-grass o silo de avena). En lechería especializada, ajusta la ración de balanceado y aplica sales buffer para prevenir acidosis si el ganado consume fibra lignificada o quemada.',
                transicion: 'Con el inicio de lluvias, el Rye-grass y el Kikuyo responden rápidamente. Realiza una fertilización de arranque con fósforo y potasio, y planifica la rotación considerando que los períodos de descanso en altura son más largos (35–45 días) para una producción de calidad.',
                oreo: '🌾 Los Andisoles de ceniza volcánica mantienen excelente reserva hídrica tras el exceso de lluvia. El forraje (Kikuyo / Rye-grass) se encuentra en rebrote vigoroso sin estrés hídrico. Pastorea con rotaciones normales en laderas estables y mantén vigilancia sanitaria preventiva sobre Fasciola hepatica en zonas bajas.',
            },
        },
    },
];

const PERFIL_DEFAULT: PerfilClimatico = {
    zona: 'Trópico Bajo',
    descripcion: 'Zona tropical – Parámetros estándar',
    et0Diaria: '4.5 – 5.5 mm/día',
    forrajesDominantes: 'Gramíneas tropicales mixtas (Brachiaria spp., Guinea)',
    sueloDrenaje: 'Mixtos aluviales / Francos – Drenaje moderado',
    umbralRegistroMm: 1.0,
    umbralEfectivoMm: 5,
    diasSecosPreAlerta: 6,
    diasSecosAlerta: 12,
    exceso7dAmarilla: 100,
    exceso7dRoja: 150,
    exceso30d: 260,
    diasBufferPostExceso: 4,
    mmAnualReferencia: 2000,
    emoji: '🌿',
    recomendaciones: {
        lluviaOptima: 'Las condiciones de humedad son favorables para el crecimiento de los pastos. Optimiza la rotación de potreros para aprovechar el período de rebrote activo y ajusta la carga animal según el aforo disponible.',
        preAlerta: '⚠️ Pre-Alerta Hídrica: llevas varios días sin lluvia efectiva y el crecimiento del forraje comienza a desacelerarse. Alarga los períodos de descanso de los potreros, reduce la presión de pastoreo y evalúa la suplementación mineral/proteica para mantener la GDP del hato.',
        excesoPreventivo: '💧 Alerta Amarilla – Encharcamiento Preventivo: la lluvia acumulada en los últimos 7 días comienza a superar la capacidad de drenaje de los suelos de la zona. Mueve el ganado de las zonas bajas y saturadas, reduce la velocidad de rotación para proteger el sward y monitorea el estado de las pezuñas del hato. Revisa los drenajes internos de la finca.',
        excesoCritico: '🌊 Alerta Roja – Anegamiento Crítico: el exceso de precipitación ha superado el umbral de anegamiento severo para los suelos de la zona. Las pasturas están bajo riesgo de anoxia radicular y la presión de pisoteo en el lodo puede destruir el sward. Activa inmediatamente el protocolo de contingencia: retira el ganado de los potreros afectados, activa el plan sanitario (pododermatitis) y suministra suplemento proteico-energético para compensar la caída de la oferta forrajera.',
        estresHidrico: '🔴 Alerta Crítica: la racha seca supera el umbral de estrés hídrico. El crecimiento del pasto se detiene. Amplía los períodos de descanso, reduce la carga animal y activa el plan de suplementación estratégica para mantener la GDP y el estado corporal del ganado.',
        transicion: 'Inicio de período lluvioso detectado. Espera que el suelo tenga humedad suficiente antes de intensificar el pastoreo. Buen momento para resembrar claros y fertilizar.',
        oreo: '🌾 Suelo en proceso de oreo tras saturación de lluvia. La reserva hídrica en el perfil sostiene el crecimiento óptimo del pasto. Prioriza el pastoreo en áreas altas y drena los potreros bajos antes de reingresar los animales para prevenir compactación y pododermatitis.',
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
    mmUltimos30Dias: number,
    mmUltimos7Dias: number
): {
    tipo: TipoEstadoHidrico;
    mensaje: string;
    diasSecosCalculo: number;
    diasSecosBrutos: number;
    diasBuffer: number;
    vieneDeExceso: boolean;
    triggeredBy7d?: boolean;
} {
    const mmMensualReferencia = perfil.mmAnualReferencia / 12;
    const vieneDeExceso = mmUltimos7Dias >= perfil.exceso7dAmarilla || mmUltimos30Dias >= perfil.exceso30d;

    // Cálculo de racha seca agronómica amortiguada
    const diasSecosAjustados = vieneDeExceso 
        ? Math.max(0, diasSecosConsecutivos - perfil.diasBufferPostExceso)
        : diasSecosConsecutivos;

    const baseMeta = {
        diasSecosCalculo: diasSecosAjustados,
        diasSecosBrutos: diasSecosConsecutivos,
        diasBuffer: perfil.diasBufferPostExceso,
        vieneDeExceso,
    };

    // ── Prioridad 1: Anegamiento Crítico (Alerta Roja de Exceso)
    const excesoCritico7d = mmUltimos7Dias >= perfil.exceso7dRoja;
    const excesoCritico30d = mmUltimos30Dias >= perfil.exceso30d;
    if (excesoCritico7d || excesoCritico30d) {
        return {
            ...baseMeta,
            tipo: 'excesoCritico',
            mensaje: perfil.recomendaciones.excesoCritico,
            triggeredBy7d: excesoCritico7d && !excesoCritico30d,
        };
    }

    // ── Prioridad 2: Estrés hídrico severo (Alerta Roja de Sequía)
    //    Evaluado con días ajustados (descontando el buffer si viene de exceso)
    if (diasSecosAjustados >= perfil.diasSecosAlerta) {
        return {
            ...baseMeta,
            tipo: 'estres',
            mensaje: perfil.recomendaciones.estresHidrico,
        };
    }

    // ── Prioridad 3: Encharcamiento Preventivo (Alerta Amarilla de Exceso en ventana 7d)
    if (mmUltimos7Dias >= perfil.exceso7dAmarilla) {
        return {
            ...baseMeta,
            tipo: 'excesoPreventivo',
            mensaje: perfil.recomendaciones.excesoPreventivo,
        };
    }

    // ── Prioridad 4: Oreo Activo / Buffer Topográfico Post-Saturación
    //    El suelo retiene suficiente agua; se previene daño mecánico y se orienta pastoreo a lomas
    if (vieneDeExceso && diasSecosConsecutivos > 0 && diasSecosConsecutivos <= perfil.diasBufferPostExceso) {
        return {
            ...baseMeta,
            tipo: 'oreo',
            mensaje: perfil.recomendaciones.oreo,
        };
    }

    // ── Prioridad 5: Pre-Alerta Hídrica (Alerta Amarilla de Sequía)
    //    Evaluada con días ajustados
    if (diasSecosAjustados >= perfil.diasSecosPreAlerta) {
        return {
            ...baseMeta,
            tipo: 'preAlerta',
            mensaje: perfil.recomendaciones.preAlerta,
        };
    }

    // ── Prioridad 6: Transición / Inicio de lluvias
    if (mmUltimos30Dias < mmMensualReferencia * 0.4 && diasSecosConsecutivos <= 3) {
        return {
            ...baseMeta,
            tipo: 'transicion',
            mensaje: perfil.recomendaciones.transicion,
        };
    }

    // ── Estado 7: Condiciones óptimas de pastoreo
    return {
        ...baseMeta,
        tipo: 'optima',
        mensaje: perfil.recomendaciones.lluviaOptima,
    };
}

