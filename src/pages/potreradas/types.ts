import type { ConfianzaPeso } from '../../utils/ganancia';

export interface Potrerada {
    id: string;
    nombre: string;
    etapa: string;
    animalCount: number;
    vendidoCount: number;
    loteListoParaLimpiar: boolean;
    pesoPromedio: number;
    pesoEstimadoPromedio: number;
    confianzaPeso?: ConfianzaPeso;
    gmpPromedio: number;
    gmpAcumulado: number | null;
    diasPesajePromedio: number;
    marcas: { nombre: string; count: number }[];
    id_rotacion: string | null;
    rotacionNombre: string | null;
    potreroActualNombre: string | null;
    cargaGlobal: number;
}

export interface AnimalPotrero {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    id_potrerada: string | null;
    potreradaNombre?: string;
    pesoActual: number;
    estado?: string;
    gdp?: number;
    gmp?: number;
    gmpAcumulado?: number | null;
    fechaIngresoEtapa?: string | null;
    pesoIngresoEtapa?: number | null;
    peso_compra?: number | null;
    peso_ingreso?: number | null;
    pesajesFiltrados?: { [fecha: string]: number };
    hasCalculatedGmp?: boolean;
    etapa?: string;
    fechaUltimoPesaje?: string | null;
}

export interface ChartData {
    fecha: string;
    pesoPromedio: number;
    gmpPromedio: number | null;
}

export interface PotreradaDetailData {
    potrerada: Potrerada;
    potreroActual: string;
    animales: AnimalPotrero[];
    fechasColumnas: string[];
    gmpPromedioGrupo: number;
    history: ChartData[];
    diasPotreroActual: number | null;
    areaPotreroActual: number | null;
    areaTotalSistema: number | null;
    fincaNombre: string;
}
