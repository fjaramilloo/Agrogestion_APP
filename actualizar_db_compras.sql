-- Crear tabla proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    nombre TEXT NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_finca, nombre)
);

-- Habilitar RLS
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para proveedores
CREATE POLICY "Activo para autenticados proveedores" ON proveedores FOR ALL TO authenticated USING (true);

-- Agregar campos a la tabla animales
ALTER TABLE animales ADD COLUMN IF NOT EXISTS proveedor_compra TEXT;
ALTER TABLE animales ADD COLUMN IF NOT EXISTS observaciones_compra TEXT;
