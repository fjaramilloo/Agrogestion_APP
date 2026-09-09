-- Actualización del trigger handle_new_user para soporte de Auto-registro y creación automática de Cuenta Demo
-- FIX: Añadido SET LOCAL row_security = off para que el SECURITY DEFINER pueda bypassear RLS
--      (las políticas RLS usan auth.uid() que es NULL durante el trigger de registro)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_finca_id UUID;
  v_nombre TEXT;
  v_apellido TEXT;
  v_nombre_org TEXT;
  v_nombre_finca TEXT;
BEGIN
  -- Desactivar RLS para este bloque (la función corre como superuser con SECURITY DEFINER,
  -- pero auth.uid() es NULL durante el trigger por lo que las políticas RLS bloquean los INSERTs)
  SET LOCAL row_security = off;

  -- Extraer información del metadata enviado desde el frontend (supabase.auth.signUp)
  v_nombre := new.raw_user_meta_data->>'nombre';
  v_apellido := new.raw_user_meta_data->>'apellido';
  v_nombre_org := new.raw_user_meta_data->>'nombre_organizacion';
  v_nombre_finca := new.raw_user_meta_data->>'nombre_finca';

  -- Insertar o actualizar en la tabla de perfiles
  INSERT INTO public.perfiles (id, email, nombre, apellido)
  VALUES (new.id, new.email, v_nombre, v_apellido)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nombre = COALESCE(EXCLUDED.nombre, perfiles.nombre),
      apellido = COALESCE(EXCLUDED.apellido, perfiles.apellido),
      actualizado_en = now();

  -- Si viene información para crear organización y finca automáticamente (Auto-registro de cuenta Demo)
  IF v_nombre_org IS NOT NULL AND v_nombre_finca IS NOT NULL THEN
    -- 1. Crear Organización con licencia 'demo' (límite 40 animales)
    INSERT INTO public.organizaciones (nombre, id_dueño, licencia, limite_animales)
    VALUES (v_nombre_org, new.id, 'demo', 40)
    RETURNING id INTO v_org_id;

    -- 2. Crear Finca inicial
    INSERT INTO public.fincas (id_organizacion, nombre, ubicacion)
    VALUES (v_org_id, v_nombre_finca, 'Por definir')
    RETURNING id INTO v_finca_id;

    -- 3. Asignar Permiso de Administrador para esta finca al usuario recién creado
    INSERT INTO public.permisos_finca (id_usuario, id_finca, rol)
    VALUES (new.id, v_finca_id, 'administrador');

    -- 4. Configurar KPIs por defecto para la nueva finca
    INSERT INTO public.configuracion_kpi (id_finca, umbral_bajo_gdp)
    VALUES (v_finca_id, 0.434)
    ON CONFLICT (id_finca) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;
