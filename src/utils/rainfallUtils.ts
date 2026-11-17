export type TipoMedicionPluviometro = 'diaria' | 'acumulada';

export interface PluviometroFinca {
    id: string;
    id_finca: string;
    nombre: string;
    tipo_medicion: TipoMedicionPluviometro;
    activo: boolean;
    orden: number;
    creado_en?: string;
}

export interface RegistroLluviaRaw {
    id?: string;
    id_finca?: string;
    fecha: string;
    milimetros: number;
    lectura_acumulada?: number | null;
    notas?: string | null;
    creado_en?: string;
    id_pluviometro?: string | null;
    tipo_medicion?: TipoMedicionPluviometro | null;
}

export interface RegistroLluviaConsolidado {
    id: string;
    fecha: string;
    milimetros: number;
    lectura_acumulada?: number | null;
    notas: string;
    creado_en: string;
    id_pluviometro?: string | null;
    detalles: RegistroLluviaRaw[];
}

/**
 * Determina si un registro corresponde a una lectura de contador acumulado
 * (protegiendo transiciones cuando un admin cambia un pluviómetro entre diaria y acumulada).
 */
export function esRegistroAcumulado(r: RegistroLluviaRaw): boolean {
    if (r.tipo_medicion === 'acumulada') return true;
    if (r.tipo_medicion === 'diaria') return false;
    return r.lectura_acumulada !== undefined && r.lectura_acumulada !== null;
}

/**
 * Consolida registros diarios por fecha calculando el promedio de finca cuando
 * existen múltiples pluviómetros reportados en el mismo día.
 * Si se pasa filtroPluviometroId, devuelve únicamente los registros de esa estación.
 */
export function consolidarLluviasPorFecha(
    registros: RegistroLluviaRaw[],
    filtroPluviometroId?: string | null
): RegistroLluviaConsolidado[] {
    const filtrados = filtroPluviometroId
        ? registros.filter(r => r.id_pluviometro === filtroPluviometroId)
        : registros;

    const porFecha = new Map<string, RegistroLluviaRaw[]>();
    for (const r of filtrados) {
        if (!r?.fecha) continue;
        const fechaKey = String(r.fecha).split('T')[0];
        const lista = porFecha.get(fechaKey);
        if (lista) {
            lista.push(r);
        } else {
            porFecha.set(fechaKey, [r]);
        }
    }

    const resultado: RegistroLluviaConsolidado[] = [];
    for (const [fecha, items] of porFecha.entries()) {
        const suma = items.reduce((acc, it) => acc + (Number(it.milimetros) || 0), 0);
        const promedio = items.length > 0 ? parseFloat((suma / items.length).toFixed(1)) : 0;
        const notasValidas = items
            .map(it => (it.notas || '').trim())
            .filter(Boolean);

        const principal = items[0];
        resultado.push({
            id: items.length === 1 && principal.id ? principal.id : `avg-${fecha}`,
            fecha,
            milimetros: promedio,
            lectura_acumulada: items.length === 1 ? (principal.lectura_acumulada ?? null) : null,
            notas: notasValidas.join(' · '),
            creado_en: principal.creado_en || '',
            id_pluviometro: items.length === 1 ? (principal.id_pluviometro ?? null) : null,
            detalles: items,
        });
    }

    return resultado.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Busca la última lectura acumulada válida de un pluviómetro estrictamente anterior a `fecha`.
 * Ignora registros capturados en modo 'diaria' para evitar mezclar series si el admin cambió el modo.
 */
export function obtenerUltimaLecturaAcumulada(
    registros: RegistroLluviaRaw[],
    fecha: string,
    idPluviometro?: string | null,
    excluirId?: string | null
): number | null {
    const anteriores = registros
        .filter(r => {
            if (excluirId && r.id === excluirId) return false;
            const fechaR = String(r.fecha).split('T')[0];
            if (fechaR >= fecha) return false;
            if (idPluviometro) {
                return r.id_pluviometro === idPluviometro;
            }
            return !r.id_pluviometro;
        })
        .sort((a, b) => b.fecha.localeCompare(a.fecha));

    const ultimaAcum = anteriores.find(
        r => esRegistroAcumulado(r) && r.lectura_acumulada !== undefined && r.lectura_acumulada !== null
    );
    if (ultimaAcum && ultimaAcum.lectura_acumulada !== undefined && ultimaAcum.lectura_acumulada !== null) {
        return Number(ultimaAcum.lectura_acumulada);
    }

    // Compatibilidad legado: si no hay id_pluviometro y hay registros antiguos sin lectura_acumulada
    if (!idPluviometro && anteriores.length > 0) {
        const tieneAlgunModo = anteriores.some(r => r.tipo_medicion === 'diaria' || r.tipo_medicion === 'acumulada');
        if (!tieneAlgunModo) {
            return parseFloat(anteriores.reduce((s, r) => s + (Number(r.milimetros) || 0), 0).toFixed(1));
        }
    }

    return null;
}

/**
 * Calcula los milímetros netos del día y la lectura acumulada a persistir según el modo.
 * Garantiza que un cambio de modo en Configuración nunca corrompa registros existentes.
 */
export function calcularMilimetrosRegistro(params: {
    modo: TipoMedicionPluviometro;
    valorNum: number;
    fecha: string;
    registros: RegistroLluviaRaw[];
    idPluviometro?: string | null;
    excluirId?: string | null;
    reiniciarContador?: boolean;
}): { milimetros: number; lectura_acumulada: number | null; tipo_medicion: TipoMedicionPluviometro } {
    const { modo, valorNum, fecha, registros, idPluviometro, excluirId, reiniciarContador } = params;

    if (isNaN(valorNum) || valorNum < 0) {
        throw new Error('Por favor ingresa un valor numérico válido (≥ 0 mm).');
    }

    if (modo === 'diaria') {
        return {
            milimetros: parseFloat(valorNum.toFixed(1)),
            lectura_acumulada: null,
            tipo_medicion: 'diaria',
        };
    }

    const lecturaAnterior = reiniciarContador
        ? 0
        : (obtenerUltimaLecturaAcumulada(registros, fecha, idPluviometro, excluirId) ?? 0);

    const milimetrosDia = valorNum - lecturaAnterior;
    if (milimetrosDia < 0) {
        throw new Error(
            `La lectura ingresada (${valorNum} mm) es menor a la lectura anterior (${lecturaAnterior} mm). Si el pluviómetro digital se reinició a 0, marca la casilla de reinicio.`
        );
    }

    return {
        milimetros: parseFloat(milimetrosDia.toFixed(1)),
        lectura_acumulada: parseFloat(valorNum.toFixed(1)),
        tipo_medicion: 'acumulada',
    };
}
