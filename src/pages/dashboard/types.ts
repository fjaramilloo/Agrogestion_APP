export interface DashboardStats {
    totalAnimales: number;
    promedioLevanteMeses: number;
    gmpLevante: number;
    promedioCebaMeses: number;
    gmpCeba: number;
    gmpTotal: number;
    totalMuertosAno: number;
    produccionCarneHaAno: number;
    cargaAnimal: number;
    pesoPromedioEntrada: number;
    pesoPromedioSalida: number;
    metaMinima?: number;
}

export interface EvolucionItem {
    numero: number;
    label: string;
    gmpLevante?: number;
    gmpCeba?: number;
}

export interface GmpDetailItem {
    id_animal: string;
    chapeta: string;
    propietario: string;
    potrerada: string;
    fechaAnterior: string;
    pesoAnterior: number;
    fechaActual: string;
    pesoActual: number;
    gmp: number;
}

export interface LluviaItem {
    fecha: string;
    mm: number;
}

export interface SelectedGmpDetail {
    label: string;
    etapa: string;
    items: GmpDetailItem[];
}
