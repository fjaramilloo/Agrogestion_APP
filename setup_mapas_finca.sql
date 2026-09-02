-- Actualización de Esquema: Soporte para Mapas de Finca (KMZ / KML) y Geometrías de Potrero

-- 1. Añadir campos geospaciales y de estilo a la tabla potreros
ALTER TABLE potreros 
ADD COLUMN IF NOT EXISTS geojson_geometry JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS color_mapa TEXT DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS kml_name TEXT DEFAULT NULL;

-- 2. Crear tabla mapas_finca para almacenar metadatos de los planos por finca
CREATE TABLE IF NOT EXISTS mapas_finca (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    nombre_archivo TEXT NOT NULL,
    centro_latitud NUMERIC,
    centro_longitud NUMERIC,
    zoom_inicial INT DEFAULT 15,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_finca)
);

-- 3. Habilitar políticas RLS (Row Level Security) para mapas_finca
ALTER TABLE mapas_finca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activo para autenticados mapas_finca" ON mapas_finca;
CREATE POLICY "Activo para autenticados mapas_finca" 
ON mapas_finca FOR ALL 
TO authenticated 
USING (true);
