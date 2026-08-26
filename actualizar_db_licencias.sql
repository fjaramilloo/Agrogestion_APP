-- Script de Migración: Licencias y Restricciones (Etapa 1)

-- 1. Crear ENUM tipo_licencia si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_licencia') THEN
        CREATE TYPE tipo_licencia AS ENUM ('demo', 'finca', 'premium');
    END IF;
END $$;

-- 2. Alterar la tabla organizaciones para agregar los campos de licencia
ALTER TABLE organizaciones 
ADD COLUMN IF NOT EXISTS licencia tipo_licencia NOT NULL DEFAULT 'demo',
ADD COLUMN IF NOT EXISTS limite_animales INTEGER NOT NULL DEFAULT 40,
ADD COLUMN IF NOT EXISTS fecha_inicio_licencia TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS fecha_vencimiento_licencia TIMESTAMP WITH TIME ZONE;

-- 3. Asignar licencia Premium a la finca del administrador (Agroinversiones Palmola)
UPDATE organizaciones 
SET licencia = 'premium', limite_animales = 999999 
WHERE LOWER(nombre) LIKE '%palmola%';

-- 4. Trigger para verificar límite de animales antes de registrar uno nuevo
CREATE OR REPLACE FUNCTION verificar_limite_animales_func()
RETURNS TRIGGER AS $$
DECLARE
    v_limite INTEGER;
    v_licencia tipo_licencia;
    v_conteo INTEGER;
    v_id_org UUID;
BEGIN
    -- Obtener la organización correspondiente a la finca del animal
    SELECT f.id_organizacion INTO v_id_org
    FROM fincas f
    WHERE f.id = NEW.id_finca;

    IF v_id_org IS NULL THEN
        RAISE EXCEPTION 'No se encontró la organización asociada a la finca.';
    END IF;

    SELECT o.licencia, o.limite_animales INTO v_licencia, v_limite
    FROM organizaciones o
    WHERE o.id = v_id_org;

    -- Si la licencia es premium o el límite es >= 999999, no hay restricción
    IF v_licencia = 'premium' OR v_limite IS NULL OR v_limite >= 999999 THEN
        RETURN NEW;
    END IF;

    -- Contar animales activos de la organización
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

-- 5. Trigger para verificar límite de fincas por organización
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

    -- Para planes Demo y Finca
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

-- 6. Trigger para verificar límite de usuarios/roles en permisos_finca
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

    -- Validar roles
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

-- 7. Trigger para ajustar automáticamente limite_animales y fecha_inicio al cambiar de licencia
CREATE OR REPLACE FUNCTION ajustar_limites_al_cambiar_licencia_func()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.licencia IS DISTINCT FROM OLD.licencia THEN
        NEW.fecha_inicio_licencia := NOW();
        
        -- Si no se envió un límite personalizado diferente al anterior, asignar el valor por defecto del nuevo plan
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
