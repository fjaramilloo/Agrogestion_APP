# Implementación del Modelo de Licenciamiento (Monetización)

Desde la visión gerencial, estructurar el software para que cobre según el tamaño de la ganadería es el paso natural para volver esto un negocio rentable. 

Para lograr que la aplicación limite el registro de animales o usuarios según el plan (Semilla, Comercial, Hacienda) sin romper lo que ya tenemos construido, este es el plan técnico y estratégico.

> [!CAUTION]
> Estas modificaciones tocan el núcleo de la base de datos (Supabase) y la interfaz de usuario. Altera cómo se insertan los animales y cómo funciona el SuperAdmin. Requiere ejecución cuidadosa.

## Open Questions

Antes de tirar código, como tu estratega te pregunto:
1. **¿Control de Seguridad:** ¿Deseas que los bloqueos por límite de animales se hagan de forma estricta en la Base de Datos (mediante *Triggers* de Postgres) o prefieres que por ahora solo bloqueemos el botón en la interfaz de usuario (React)? Mi recomendación es hacerlo en la Base de Datos; el software debe ser inviolable.
2. **Pasarela de Pagos:** ¿Nos integramos de una vez con una pasarela como Stripe/Wompi/MercadoPago para que el ganadero pague solo con tarjeta, o por ahora quieres que el **SuperAdmin** asigne y active las licencias manualmente cuando recibas una transferencia?

---

## Proposed Changes

Agruparemos el trabajo en tres frentes: Estructura de Datos, Interfaz de Usuario, y Gestión de SuperAdmin.

### 1. Base de Datos (Supabase)

Tenemos que alterar el esquema para que la organización sea "consciente" de su nivel de suscripción.

#### [MODIFY] `supabase_schema.sql`
- **Nuevos Tipos de Datos:** Crear un `ENUM tipo_licencia ('semilla', 'comercial', 'hacienda')`.
- **Modificar `organizaciones`:** Añadir las columnas `licencia` (por defecto 'semilla'), `limite_animales` (por defecto 40), y `fecha_vencimiento_licencia`.
- **Triggers Defensivos (Guardrails):** 
  - Crear un *Trigger* `verificar_limite_animales` en la tabla `animales` (BEFORE INSERT). Este contará cuántos animales con `estado = 'activo'` tiene la organización. Si va a insertar el animal 41 y la licencia es 'semilla', la base de datos abortará la transacción con un mensaje de error.
  - Crear un *Trigger* `verificar_limite_usuarios` en la tabla `permisos_finca` para evitar que las fincas 'semilla' inviten a múltiples vaqueros.

### 2. Lógica Frontend y Autenticación (React)

La aplicación tiene que saber en todo momento qué licencia tiene el usuario para habilitar o esconder botones.

#### [MODIFY] `src/contexts/AuthContext.tsx`
- Ampliar la consulta inicial del perfil del usuario para traerse la información de la `organizacion` (tipo de licencia y límites).
- Exponer estas variables globalmente para que cualquier pantalla pueda consumirlas (ej. `const { licencia, limiteAnimales } = useAuth();`).

#### [NEW] `src/pages/Suscripcion.tsx` o `Billing.tsx`
- Crear una nueva pantalla dentro del menú lateral que le muestre al dueño de la finca el estado de su negocio: 
  - *Plan Actual:* Semilla.
  - *Uso:* 38 de 40 animales registrados (mostrar una barra de progreso que se ponga roja al acercarse al límite).
  - *Llamado a la acción (Upgrade):* Botones mostrando los beneficios del plan Comercial y Hacienda.

### 3. Ajustes Operativos en la Interfaz (Límites)

#### [MODIFY] `src/pages/Inventory.tsx`
- Interceptar el botón de "Agregar Animal". Antes de abrir el modal, validar si `animalesActivos >= limiteAnimales`.
- Si se superó el límite, mostrar un **Modal de Upsell** (Venta) indicando: *"Has alcanzado el límite de tu hato gratuito. Para registrar más animales y seguir midiendo la rentabilidad de tu negocio, actualiza a la licencia Comercial."*

#### [MODIFY] `src/pages/SuperAdmin.tsx`
- En tu panel de control actual, agregar una sección para editar los detalles de la organización.
- Controles manuales para que cambies a un cliente de 'semilla' a 'comercial' y le extiendas su `fecha_vencimiento_licencia`.

---

## Verification Plan

### Automated Tests / Reglas de Seguridad
- Intentar forzar un POST a Supabase para insertar un animal 41 en una organización 'semilla' y verificar que el servidor rechace la petición (Probando la solidez del Trigger).

### Manual Verification
- Ingresar como un ganadero 'semilla', ver el límite en la tabla de inventario, presionar "Agregar", y verificar que salte la ventana de mejora (Upsell).
- Ingresar como `SuperAdmin`, cambiar la licencia de ese ganadero a 'comercial', recargar la página del ganadero y comprobar que ahora el límite desaparece y puede registrar su ganado libremente.
