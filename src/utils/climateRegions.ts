// Motor de perfiles climáticos regionales para Colombia
// Detecta la zona agroecológica según el campo 'ubicacion' de la finca
// y devuelve los parámetros correctos para el módulo de pluviometría.

export interface PerfilClimatico {
    zona: string;
    descripcion: string;
    umbralEfectivoMm: number;
    diasSecosAlerta: number;
    mmAnualReferencia: number;
    emoji: string;
    recomendaciones: {
        lluviaOptima: string;
        lluviaExceso: string;
        estresHidrico: string;
        transicion: string;
    };
}

const PERFILES_CLIMATICOS: { keywords: string[]; perfil: PerfilClimatico }[] = [
    {
        keywords: [
            'costa', 'caribe', 'montería', 'monteria', 'córdoba', 'cordoba',
            'sucre', 'sincelejo', 'valledupar', 'cesar', 'magdalena', 'santa marta',
            'barranquilla', 'guajira', 'atlántico', 'atlantico', 'bolivar', 'bolívar',
            'mompós', 'mompos', 'corozal', 'chinú', 'chinu', 'sahagún', 'sahagun',
        ],
        perfil: {
            zona: 'Costa Caribe',
            descripcion: 'Trópico Bajo Seco – Bimodal con verano largo',
            umbralEfectivoMm: 8,
            diasSecosAlerta: 10,
            mmAnualReferencia: 1200,
            emoji: '🌴',
            recomendaciones: {
                lluviaOptima: 'Las lluvias están en niveles óptimos. Aproveche el rebrote activo de las praderas para rotar los potreros cada 21-28 días y maximizar la carga animal. Momento ideal para resembrar claros y aplicar herbicidas de control.',
                lluviaExceso: 'Precaución: exceso de humedad puede generar problemas de compactación del suelo y enfermedades podales (pododermatitis). Restrinja la carga en suelos anegados y active drenajes. Revise el estado de los cascos y aplique sulfato de cobre preventivo.',
                estresHidrico: 'Alerta de estrés hídrico. Las lluvias caídas no son suficientes para reactivar el rebrote en pradera. Inicie el protocolo de verano: reduzca la carga animal, active reservas de ensilaje o heno, y garantice fuentes de agua adicionales. Evalúe la suplementación proteica/energética para sostener la GDP.',
                transicion: 'Inicio del período de lluvias detectado. Espere al menos 3-4 aguaceros efectivos antes de aumentar la carga para dar tiempo al rebrote. Aproveche para aplicar correctivos (cal/azufre) y fertilizantes de base nitrogenada.',
            },
        },
    },
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
            umbralEfectivoMm: 5,
            diasSecosAlerta: 12,
            mmAnualReferencia: 2400,
            emoji: '🌧️',
            recomendaciones: {
                lluviaOptima: 'Condiciones hídricas ideales para praderas de Brachiaria. Rote agresivo cada 18-25 días para aprovechar el pico de rebrote antes de la lignificación. Excelente momento para fertilización nitrogenada post-lluvia y para aforo de potreros que guíe la carga óptima (UGG/ha).',
                lluviaExceso: 'Exceso de precipitación puede saturar los suelos y limitar el acceso del ganado a los potreros. Mueva los animales a potreros con mejor drenaje. El estrés térmico combinado con humedad reduce la eficiencia de conversión.',
                estresHidrico: 'Se supera el umbral de estrés hídrico para la región. El crecimiento de Brachiaria se detiene y la oferta forrajera caerá en los próximos días. Ajuste la carga animal, prolongue los períodos de descanso de los potreros y active suplementación estratégica (sal proteinada + energética).',
                transicion: 'Inicio de temporada de lluvias. Los primeros rebrotes son los más nutritivos del año (alta proteína cruda). Optimice la rotación para aprovechar este período y acelerar la GDP. Revise el plan de mineralización.',
            },
        },
    },
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
            umbralEfectivoMm: 5,
            diasSecosAlerta: 14,
            mmAnualReferencia: 2800,
            emoji: '🌾',
            recomendaciones: {
                lluviaOptima: 'Período de invierno activo con buena oferta forrajera. Aproveche para acumular reservas forrajeras (ensilaje de gramíneas nativas) para el verano monomodal. Aplique suplementación mineral azufrada para compensar los suelos lixiviados y mantener la GDP.',
                lluviaExceso: 'Las lluvias intensas del invierno llanero pueden generar anegamientos prolongados. Concentre el ganado en zonas altas (bancos y sabanas altas). Monitoree enfermedades asociadas a aguas estancadas (carbón, anaplasmosis). Verifique el plan sanitario.',
                estresHidrico: 'El verano llanero está impactando la oferta forrajera. Los pastos nativos pierden calidad rápidamente en sequía. Garantice agua permanente y active el inventario de reservas forrajeras. Priorice animales de mayor GDP y evalúe una venta estratégica de rezagados.',
                transicion: 'Inicio del período lluvioso. Los primeros rebrotes de sabana requieren 2-3 semanas de lluvias regulares antes de mover ganado, para no retrasar el establecimiento del pasto.',
            },
        },
    },
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
            descripcion: 'Trópico de Altura – Bimodal frío con riesgo de heladas',
            umbralEfectivoMm: 4,
            diasSecosAlerta: 15,
            mmAnualReferencia: 1600,
            emoji: '🏔️',
            recomendaciones: {
                lluviaOptima: 'Condiciones favorables para Kikuyo y Rye-grass. Ajuste la densidad de siembra y aplique nitrógeno (urea) fraccionado para estimular el macollamiento. Revise el pH del suelo: el encalado es crítico para la disponibilidad de nutrientes en trópico alto.',
                lluviaExceso: 'El exceso de humedad en trópico alto favorece la fasciola hepática (duelas). Revise el protocolo de desparasitación e implemente control de caracoles en zonas húmedas. Limite el pisoteo excesivo en suelos saturados.',
                estresHidrico: 'Períodos secos en trópico alto pueden generar heladas nocturnas que afectan al Kikuyo. Prepare reservas de forraje (heno o ensilaje). Si hay helada prevista, no rote al día siguiente: deje que el pasto se recupere antes de pastorear.',
                transicion: 'Con el inicio de lluvias, el Rye-grass y Kikuyo responden rápidamente. Realice una fertilización de arranque y planifique la rotación considerando que los períodos de descanso en altura son más largos (35-45 días).',
            },
        },
    },
];

const PERFIL_DEFAULT: PerfilClimatico = {
    zona: 'Trópico Bajo',
    descripcion: 'Zona tropical – Parámetros estándar',
    umbralEfectivoMm: 5,
    diasSecosAlerta: 12,
    mmAnualReferencia: 2000,
    emoji: '🌿',
    recomendaciones: {
        lluviaOptima: 'Las condiciones de humedad son favorables para el crecimiento de los pastos. Optimice la rotación de potreros para aprovechar el período de rebrote activo y ajuste la carga animal según el aforo disponible.',
        lluviaExceso: 'Se detecta exceso de precipitación. Monitoree el estado de los suelos y evite el pisoteo en zonas saturadas. Revise el bienestar animal y el estado sanitario del hato.',
        estresHidrico: 'La racha seca supera el umbral de alerta. El crecimiento del pasto se está desacelerando. Considere ampliar los períodos de descanso de los potreros, reducir la carga animal y activar suplementación estratégica para mantener la GDP.',
        transicion: 'Inicio de período lluvioso detectado. Espere que el suelo tenga humedad suficiente antes de intensificar el pastoreo. Buen momento para resembrar y fertilizar.',
    },
};

export function detectarRegionClimatica(ubicacion: string | null | undefined): PerfilClimatico {
    if (!ubicacion) return PERFIL_DEFAULT;

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
): { tipo: 'optima' | 'exceso' | 'estres' | 'transicion'; mensaje: string } {
    const mmMensualReferencia = perfil.mmAnualReferencia / 12;

    if (diasSecosConsecutivos >= perfil.diasSecosAlerta) {
        return { tipo: 'estres', mensaje: perfil.recomendaciones.estresHidrico };
    }
    if (mmUltimos30Dias > mmMensualReferencia * 1.5) {
        return { tipo: 'exceso', mensaje: perfil.recomendaciones.lluviaExceso };
    }
    if (mmUltimos30Dias < mmMensualReferencia * 0.3 && diasSecosConsecutivos > 3) {
        return { tipo: 'transicion', mensaje: perfil.recomendaciones.transicion };
    }
    return { tipo: 'optima', mensaje: perfil.recomendaciones.lluviaOptima };
}
