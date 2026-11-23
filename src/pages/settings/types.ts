export interface CargaMasivaItem {
    id: string;
    tipo: 'animales' | 'pesajes';
    nombre_archivo: string;
    total_registros: number;
    fecha_carga: string;
    creado_en: string;
    estado: string;
}

export interface ReporteCargaMasiva {
    tipo: 'animales' | 'pesajes';
    creados: number;
    actualizados: number;
    omitidos: number;
    omitidosList: string[];
}

export const PRESETS_RANGOS_PESO = [
    {
        id: 'ceba_tradicional',
        nombre: 'Ceba Tradicional (430 - 530+ kg)',
        corte1: 430,
        corte2: 480,
        corte3: 530,
        descripcion: 'Para engorde pesado de novillos (Palmola, Alejandría). Meta de despacho: 530 kg.'
    },
    {
        id: 'levante_preceba',
        nombre: 'Levante / Pre-ceba (230 - 380 kg)',
        corte1: 280,
        corte2: 330,
        corte3: 380,
        descripcion: 'Para levante o ceba liviana (La Gerencia). Meta de despacho: 380 kg.'
    },
    {
        id: 'ceba_liviana',
        nombre: 'Ceba Liviana / Exportación (340 - 440 kg)',
        corte1: 340,
        corte2: 390,
        corte3: 440,
        descripcion: 'Para exportación en pie o ceba de ciclo corto. Meta de despacho: 440 kg.'
    },
    {
        id: 'destete_cria',
        nombre: 'Destete / Cría (140 - 220 kg)',
        corte1: 140,
        corte2: 180,
        corte3: 220,
        descripcion: 'Para terneros de destete temprano y cría. Meta de despacho: 220 kg.'
    },
    {
        id: 'personalizado',
        nombre: 'Personalizado (Manual)',
        corte1: 0,
        corte2: 0,
        corte3: 0,
        descripcion: 'Ajusta manualmente los 3 umbrales según tus requerimientos específicos.'
    }
];

export const parseFechaCol = (fechaStr: string) => {
    if (!fechaStr) return null;
    let s = fechaStr.toString().trim();
    if (s.includes(' ')) s = s.split(' ')[0];
    if (s.includes('T')) s = s.split('T')[0];

    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
            const d = parts[0].trim();
            const m = parts[1].trim();
            let y = parts[2].trim();
            if (d.length === 4) {
                return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}`;
            }
            if (y.length === 2) y = '20' + y;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    } else if (s.includes('-')) {
        const parts = s.split('-');
        if (parts.length === 3) {
            const p1 = parts[0].trim();
            const p2 = parts[1].trim();
            let p3 = parts[2].trim();
            if (p1.length === 4) {
                return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
            }
            if (p3.length === 2) p3 = '20' + p3;
            if (p3.length === 4) {
                return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
            }
        }
    }
    return s;
};

export const cleanNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const str = val.toString().replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
};

export const formatMilesNumber = (val: string) => {
    if (!val) return '';
    const clean = val.toString().replace(/\D/g, '');
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const unformatMilesNumber = (val: string) => val.replace(/\D/g, '');
