-- Extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Limpiar tipos si existen (para re-ejecución sin errores)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_licencia') THEN
        CREATE TYPE tipo_licencia AS ENUM ('demo', 'finca', 'premium');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_finca') THEN
        CREATE TYPE rol_finca AS ENUM ('administrador', 'vaquero', 'observador');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'especie_animal') THEN
        CREATE TYPE especie_animal AS ENUM ('bovino', 'bufalino');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'etapa_animal') THEN
        CREATE TYPE etapa_animal AS ENUM ('cria', 'levante', 'ceba');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_animal') THEN
        CREATE TYPE estado_animal AS ENUM ('activo', 'vendido', 'muerto');
    END IF;
END $$;

-- 1. organizaciones
CREATE TABLE IF NOT EXISTS organizaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    id_dueño UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    licencia tipo_licencia NOT NULL DEFAULT 'demo',
    limite_animales INTEGER NOT NULL DEFAULT 40,
    fecha_inicio_licencia TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    fecha_vencimiento_licencia TIMESTAMP WITH TIME ZONE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. fincas
CREATE TABLE IF NOT EXISTS fincas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_organizacion UUID REFERENCES organizaciones(id) ON DELETE CASCADE NOT NULL,
    nombre TEXT NOT NULL,
    ubicacion TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. permisos_finca
CREATE TABLE IF NOT EXISTS permisos_finca (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_usuario UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    rol rol_finca NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_usuario, id_finca)
);

-- 4. potreros 
CREATE TABLE IF NOT EXISTS potreros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    nombre TEXT NOT NULL,
    area_hectareas NUMERIC NOT NULL,
    id_rotacion UUID REFERENCES rotaciones(id) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4.5 proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    nombre TEXT NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_finca, nombre)
);

-- 4.5.5 rotaciones
CREATE TABLE IF NOT EXISTS rotaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    nombre TEXT NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_finca, nombre)
);

-- 4.6 potreradas
CREATE TABLE IF NOT EXISTS potreradas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    nombre TEXT NOT NULL,
    etapa etapa_animal NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_finca, nombre)
);

-- 4.7 movimientos_potreros
CREATE TABLE IF NOT EXISTS movimientos_potreros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    id_potrerada UUID REFERENCES potreradas(id) ON DELETE CASCADE NOT NULL,
    id_potrero UUID REFERENCES potreros(id) ON DELETE CASCADE NOT NULL,
    fecha_entrada DATE NOT NULL,
    fecha_salida DATE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. animales
CREATE TABLE IF NOT EXISTS animales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    numero_chapeta TEXT NOT NULL,
    nombre_propietario TEXT NOT NULL,
    proveedor_compra TEXT,
    observaciones_compra TEXT,
    especie especie_animal NOT NULL,
    sexo TEXT CHECK (sexo IN ('M', 'H')) NOT NULL,
    etapa etapa_animal NOT NULL,
    fecha_ingreso DATE NOT NULL,
    peso_ingreso NUMERIC NOT NULL,
    peso_compra NUMERIC,
    id_potrero_actual UUID REFERENCES potreros(id) ON DELETE SET NULL,
    id_potrerada UUID REFERENCES potreradas(id) ON DELETE SET NULL,
    estado estado_animal DEFAULT 'activo',
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_finca, numero_chapeta)
);

-- 6. registros_pesaje
CREATE TABLE IF NOT EXISTS registros_pesaje (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_animal UUID REFERENCES animales(id) ON DELETE CASCADE NOT NULL,
    peso NUMERIC NOT NULL,
    fecha DATE NOT NULL,
    etapa etapa_animal NOT NULL,
    id_potrero UUID REFERENCES potreros(id) ON DELETE SET NULL,
    gdp_calculada NUMERIC,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. mediciones_pasto
CREATE TABLE IF NOT EXISTS mediciones_pasto (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_potrero UUID REFERENCES potreros(id) ON DELETE CASCADE NOT NULL,
    fecha DATE NOT NULL,
    kg_pasto_humedo NUMERIC NOT NULL,
    carga_animal_calculada NUMERIC,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. configuracion_kpi
CREATE TABLE IF NOT EXISTS configuracion_kpi (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE UNIQUE NOT NULL,
    umbral_bajo_gdp NUMERIC DEFAULT 0.434 NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. registros_cria
CREATE TABLE IF NOT EXISTS registros_cria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    id_madre UUID REFERENCES animales(id) ON DELETE SET NULL,
    fecha_nacimiento DATE NOT NULL,
    sexo TEXT CHECK (sexo IN ('M', 'H')) NOT NULL,
    numero_unico TEXT NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(id_finca, numero_unico)
);

-- 10. registros_lluvia
CREATE TABLE IF NOT EXISTS registros_lluvia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_finca UUID REFERENCES fincas(id) ON DELETE CASCADE NOT NULL,
    fecha DATE NOT NULL,
    milimetros NUMERIC NOT NULL,
    notas TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Funciones y Triggers para Zootecnia (GDP)
CREATE OR REPLACE FUNCTION calcular_gdp_al_pesar()
RETURNS TRIGGER AS $$
DECLARE
    registro_anterior RECORD;
    dias_transcurridos INTEGER;
    datos_animal RECORD;
BEGIN
    SELECT * INTO registro_anterior
    FROM public.registros_pesaje
    WHERE id_animal = NEW.id_animal AND fecha < NEW.fecha AND id IS DISTINCT FROM NEW.id
    ORDER BY fecha DESC
    LIMIT 1;

    IF FOUND THEN
        dias_transcurridos := NEW.fecha - registro_anterior.fecha;
        IF dias_transcurridos > 0 THEN
            NEW.gdp_calculada := ROUND(((NEW.peso - registro_anterior.peso) / dias_transcurridos)::numeric, 3);
        ELSE
            NEW.gdp_calculada := 0;
        END IF;
    ELSE
        SELECT peso_ingreso, fecha_ingreso INTO datos_animal FROM public.animales WHERE id = NEW.id_animal;
        dias_transcurridos := NEW.fecha - datos_animal.fecha_ingreso;
        IF dias_transcurridos > 0 THEN
            NEW.gdp_calculada := ROUND(((NEW.peso - datos_animal.peso_ingreso) / dias_transcurridos)::numeric, 3);
        ELSE
            NEW.gdp_calculada := 0;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_calcular_gdp ON registros_pesaje;
CREATE TRIGGER trigger_calcular_gdp
BEFORE INSERT OR UPDATE OF peso, fecha ON registros_pesaje
FOR EACH ROW
EXECUTE FUNCTION calcular_gdp_al_pesar();


CREATE OR REPLACE FUNCTION recalcular_gdp_posterior()
RETURNS TRIGGER AS $$
DECLARE
    registro_siguiente RECORD;
    dias_transcurridos INTEGER;
BEGIN
    -- Encontrar el registro mediatamente posterior en fecha
    SELECT * INTO registro_siguiente
    FROM public.registros_pesaje
    WHERE id_animal = NEW.id_animal AND fecha > NEW.fecha AND id IS DISTINCT FROM NEW.id
    ORDER BY fecha ASC
    LIMIT 1;

    IF FOUND THEN
        dias_transcurridos := registro_siguiente.fecha - NEW.fecha;
        IF dias_transcurridos > 0 THEN
            UPDATE public.registros_pesaje
            SET gdp_calculada = ROUND(((registro_siguiente.peso - NEW.peso) / dias_transcurridos)::numeric, 3)
            WHERE id = registro_siguiente.id;
        ELSE
            UPDATE public.registros_pesaje
            SET gdp_calculada = 0
            WHERE id = registro_siguiente.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_recalcular_gdp_posterior ON registros_pesaje;
CREATE TRIGGER trigger_recalcular_gdp_posterior
AFTER INSERT OR UPDATE OF peso, fecha ON registros_pesaje
FOR EACH ROW
EXECUTE FUNCTION recalcular_gdp_posterior();


-- RLs (Row Level Security) - Políticas de seguridad
ALTER TABLE organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fincas ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos_finca ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE potreros ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_potreros ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE potreradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_pesaje ENABLE ROW LEVEL SECURITY;
ALTER TABLE mediciones_pasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_kpi ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_cria ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_lluvia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activo para autenticados organizaciones" ON organizaciones FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados fincas" ON fincas FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados permisos_finca" ON permisos_finca FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados rotaciones" ON rotaciones FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados potreros" ON potreros FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados proveedores" ON proveedores FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados potreradas" ON potreradas FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados animales" ON animales FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados registros_pesaje" ON registros_pesaje FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados mediciones_pasto" ON mediciones_pasto FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados configuracion_kpi" ON configuracion_kpi FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados registros_cria" ON registros_cria FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados registros_lluvia" ON registros_lluvia FOR ALL TO authenticated USING (true);
CREATE POLICY "Activo para autenticados movimientos_potreros" ON movimientos_potreros FOR ALL TO authenticated USING (true);

-- ==========================================
-- Triggers Defensivos (Guardrails Licencias)
-- ==========================================

-- 1. Trigger para verificar límite de animales
CREATE OR REPLACE FUNCTION verificar_limite_animales_func()
RETURNS TRIGGER AS $$
DECLARE
    v_limite INTEGER;
    v_licencia tipo_licencia;
    v_conteo INTEGER;
    v_id_org UUID;
BEGIN
    SELECT f.id_organizacion INTO v_id_org
    FROM fincas f
    WHERE f.id = NEW.id_finca;

    IF v_id_org IS NULL THEN
        RAISE EXCEPTION 'No se encontró la organización asociada a la finca.';
    END IF;

    SELECT o.licencia, o.limite_animales INTO v_licencia, v_limite
    FROM organizaciones o
    WHERE o.id = v_id_org;

    IF v_licencia = 'premium' OR v_limite IS NULL OR v_limite >= 999999 THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_conteo
    FROM animales a
    JOIN fincas f ON a.id_finca = f.id
    WHERE f.id_organizacion = v_id_org
      AND a.estado = 'activo';

    IF v_conteo >= v_limite THEN
        RAISE EXCEPTION 'Límite alcanzado: Su plan (%) le permite un máximo de % animales activos. Actualmente posee % activos.', v_licencia, v_limite, v_conteo;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_verificar_limite_animales ON animales;
CREATE TRIGGER trigger_verificar_limite_animales
BEFORE INSERT ON animales
FOR EACH ROW
EXECUTE FUNCTION verificar_limite_animales_func();

-- 2. Trigger para verificar límite de fincas
CREATE OR REPLACE FUNCTION verificar_limite_fincas_func()
RETURNS TRIGGER AS $$
DECLARE
    v_licencia tipo_licencia;
    v_conteo INTEGER;
BEGIN
    SELECT o.licencia INTO v_licencia
    FROM organizaciones o
    WHERE o.id = NEW.id_organizacion;

    IF v_licencia = 'premium' THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_conteo
    FROM fincas
    WHERE id_organizacion = NEW.id_organizacion;

    IF v_conteo >= 1 THEN
        RAISE EXCEPTION 'Límite alcanzado: Su plan (%) solo permite 1 finca.', v_licencia;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_verificar_limite_fincas ON fincas;
CREATE TRIGGER trigger_verificar_limite_fincas
BEFORE INSERT ON fincas
FOR EACH ROW
EXECUTE FUNCTION verificar_limite_fincas_func();

-- 3. Trigger para verificar límite de usuarios en permisos_finca
CREATE OR REPLACE FUNCTION verificar_limite_usuarios_func()
RETURNS TRIGGER AS $$
DECLARE
    v_licencia tipo_licencia;
    v_id_org UUID;
    v_conteo_vaqueros INTEGER;
    v_conteo_observadores INTEGER;
BEGIN
    SELECT f.id_organizacion INTO v_id_org
    FROM fincas f
    WHERE f.id = NEW.id_finca;

    SELECT o.licencia INTO v_licencia
    FROM organizaciones o
    WHERE o.id = v_id_org;

    IF v_licencia = 'premium' THEN
        RETURN NEW;
    END IF;

    IF NEW.rol = 'vaquero' THEN
        SELECT COUNT(*) INTO v_conteo_vaqueros
        FROM permisos_finca pf
        JOIN fincas f ON pf.id_finca = f.id
        WHERE f.id_organizacion = v_id_org AND pf.rol = 'vaquero';

        IF v_conteo_vaqueros >= 1 THEN
            RAISE EXCEPTION 'Límite alcanzado: Su plan (%) solo permite 1 usuario vaquero.', v_licencia;
        END IF;
    ELSIF NEW.rol = 'observador' THEN
        IF v_licencia = 'demo' THEN
            RAISE EXCEPTION 'Su plan Demo no permite usuarios observadores. Actualice a plan Finca o Premium.';
        ELSIF v_licencia = 'finca' THEN
            SELECT COUNT(*) INTO v_conteo_observadores
            FROM permisos_finca pf
            JOIN fincas f ON pf.id_finca = f.id
            WHERE f.id_organizacion = v_id_org AND pf.rol = 'observador';

            IF v_conteo_observadores >= 1 THEN
                RAISE EXCEPTION 'Límite alcanzado: Su plan Finca solo permite 1 usuario observador.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_verificar_limite_usuarios ON permisos_finca;
CREATE TRIGGER trigger_verificar_limite_usuarios
BEFORE INSERT ON permisos_finca
FOR EACH ROW
EXECUTE FUNCTION verificar_limite_usuarios_func();

-- 4. Trigger para ajustar automáticamente limite_animales y fecha_inicio al cambiar de licencia
CREATE OR REPLACE FUNCTION ajustar_limites_al_cambiar_licencia_func()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.licencia IS DISTINCT FROM OLD.licencia THEN
        NEW.fecha_inicio_licencia := NOW();
        
        IF NEW.limite_animales = OLD.limite_animales THEN
            IF NEW.licencia = 'demo' THEN
                NEW.limite_animales := 40;
            ELSIF NEW.licencia = 'finca' THEN
                NEW.limite_animales := 500;
            ELSIF NEW.licencia = 'premium' THEN
                NEW.limite_animales := 999999;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_ajustar_limites_al_cambiar_licencia ON organizaciones;
CREATE TRIGGER trigger_ajustar_limites_al_cambiar_licencia
BEFORE UPDATE OF licencia ON organizaciones
FOR EACH ROW
EXECUTE FUNCTION ajustar_limites_al_cambiar_licencia_func();

