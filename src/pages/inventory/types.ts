export interface Pesaje {
    id?: string;
    peso: number;
    fecha: string;
    gdp_calculada: number;
    gmp_calculada?: number;
    potreros?: { nombre: string } | null;
}

export interface Animal {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    especie: string;
    sexo: string;
    tipo_macho?: string | null;
    etapa: string;
    peso_ingreso: number;
    peso_compra?: number | null;
    fecha_ingreso: string;
    fecha_ingreso_ceba?: string | null;
    peso_ingreso_ceba?: number | null;
    estado: string;
    id_potrerada?: string | null;
    potreros?: { nombre: string } | null;
    potreradas?: { nombre: string } | null;
    potreroNombre?: string;
    potreradaNombre?: string;
    diasDesdeUltimoPesaje?: number;
    registros_pesaje: Pesaje[];
}

export interface PotreradaOption {
    id: string;
    nombre: string;
    etapa?: string;
}

export interface PropietarioOption {
    id: string;
    nombre: string;
}
