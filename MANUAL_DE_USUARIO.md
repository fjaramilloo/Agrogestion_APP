# 📖 MANUAL DE USUARIO OFICIAL: SISTEMA INTEGRAL DE GESTIÓN GANADERA

> **DIRIGIDO A:** Propietarios, Administradores de Finca y Mayordomos / Vaqueros de Campo.  
> **OBJETIVO:** Dominar el manejo de la plataforma ganadera de forma sencilla, práctica y sin margen de error, transformando el día a día del campo en datos precisos para maximizar los kilos de carne, la carga animal y la rentabilidad por hectárea.

---

## 📑 TABLA DE CONTENIDO
1. [Introducción y Filosofía del Sistema](#1-introducción-y-filosofía-del-sistema)
2. [Roles de Usuario y Permisos](#2-roles-de-usuario-y-permisos)
3. [Instalación en el Celular (PWA) y Modo Sin Señal (Offline)](#3-instalación-en-el-celular-pwa-y-modo-sin-señal-offline)
4. [Módulo 1: Inicio y Dashboard Gerencial](#4-módulo-1-inicio-y-dashboard-gerencial)
5. [Módulo 2: Plano de Finca y Georreferenciación](#5-módulo-2-plano-de-finca-y-georreferenciación)
6. [Módulo 3: Pluviometría (Control de Lluvias)](#6-módulo-3-pluviometría-control-de-lluvias)
7. [Módulo 4: Aforos y Oferta Forrajera](#7-módulo-4-aforos-y-oferta-forrajera)
8. [Módulo 5: Rotación de Lotes y Movimientos de Potrero](#8-módulo-5-rotación-de-lotes-y-movimientos-de-potrero)
9. [Módulo 6: Control de Pesaje en Corral](#9-módulo-6-control-de-pesaje-en-corral)
10. [Módulo 7: Registro de Compras (Entradas)](#10-módulo-7-registro-de-compras-entradas)
11. [Módulo 8: Registro de Ventas (Salidas) y Animales para Ceba](#11-módulo-8-registro-de-ventas-salidas-y-animales-para-ceba)
12. [Módulo 9: Inventario Bovino y Ficha Individual](#12-módulo-9-inventario-bovino-y-ficha-individual)
13. [Módulo 10: Potreradas (Lotes de Manejo) e Historiales](#13-módulo-10-potreradas-lotes-de-manejo-e-historiales)
14. [Módulo 11: Mercado de Ganado y Precios de Referencia](#14-módulo-11-mercado-de-ganado-y-precios-de-referencia)
15. [Módulo 12: Configuración de la Finca y Usuarios](#15-módulo-12-configuración-de-la-finca-y-usuarios)
16. [Módulo 13: Asistente Inteligente (AgroBot)](#16-módulo-13-asistente-inteligente-agrobot)
17. [Resumen Rápido: Rutinas de Campo (Día a Día)](#17-resumen-rápido-rutinas-de-campo-día-a-día)

---

## 1. INTRODUCCIÓN Y FILOSOFÍA DEL SISTEMA

La ganadería moderna no se administra "al ojo"; se gerencia con **números y datos medibles**. Esta aplicación ha sido diseñada para unir dos mundos fundamentales:

1. **El trabajo de campo (Manga, Corral y Potrero):** Registro ágil, simple y sin complicaciones para el vaquero o mayordomo, incluso **sin cobertura celular ni internet**.
2. **La toma de decisiones estratégicas (Gerencia y Finanzas):** Monitoreo en tiempo real de Ganancia Diaria de Peso (GDP / GMP), Capacidad de Carga ($UGG/ha$), Producción de carne ($kg/ha/año$) y rentabilidad para el propietario o administrador.

> 💡 **REGLA DE ORO GANADERA:**  
> *"Dato que no se anota en el momento, kilo que se pierde en la cuenta."* Registrar las labores el mismo día garantiza cuentas claras y animales más productivos.

---

## 2. ROLES DE USUARIO Y PERMISOS

Para evitar equivocaciones y proteger la información sensible, el sistema cuenta con 3 perfiles de acceso:

| Perfil | ¿Quién lo usa? | ¿Qué puede hacer en la App? |
| :--- | :--- | :--- |
| **Administrador** | Propietario / Gerente / Administrador General | Control total: Dashboard financiero, compras, ventas, pesajes, aforos, configuración de metas, creación de potreros y asignación de usuarios. |
| **Vaquero / Mayordomo** | Mayordomo / Administrador de Campo / Vaquero de Corral | Trabajo operativo: Pesajes en báscula, rotación de potreros, registro de lluvias, aforos, registro de compras y ventas de campo. |
| **Observador** | Socios / Inversionistas / Asesores Técnicos / Veterinarios | Solo lectura: Consulta de inventario, dashboard, mapas y reportes sin permisos para modificar ni borrar datos. |

---

## 3. INSTALACIÓN EN EL CELULAR (PWA) Y MODO SIN SEÑAL (OFFLINE)

No es obligatorio descargar la app desde una tienda de aplicaciones; funciona como **Aplicación Web Progresiva (PWA)** en cualquier teléfono inteligente (Android o iPhone) o computador.

### 📱 ¿Cómo instalar la App en la pantalla de inicio del celular?

* **En Android (Google Chrome):**
  1. Abre el enlace de la aplicación en Chrome.
  2. Toca los **tres puntos** de la esquina superior derecha.
  3. Selecciona **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
  4. Aparecerá el icono en tu pantalla como cualquier aplicación instalada.

* **En iPhone (Safari):**
  1. Abre el enlace de la app en Safari.
  2. Toca el botón de **Compartir** (icono de un cuadro con una flecha hacia arriba).
  3. Desliza hacia abajo y pulsa **"Agregar al inicio"** (o *"Add to Home Screen"*).
  4. Presiona **"Agregar"**.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 1: PANTALLA DE INICIO DE SESIÓN / SELECCIÓN DE FINCA]     |
| *Mostrar la pantalla de login limpia y el selector desplegable de fincas en el     |
|  menú lateral con el indicador de finca activa.*                                   |
+-----------------------------------------------------------------------------------+
```

### 📶 ¿Cómo funciona el modo SIN SEÑAL (Offline) en el corral?
* **Antes de salir al corral:** Conéctate al Wi-Fi o datos de la casa para que la aplicación cargue la lista actualizada de animales y potreros en la memoria del teléfono.
* **En la manga o potrero (Sin Internet):** Puedes realizar pesajes y aforos con normalidad. La app mostrará el icono de **"Sin Conexión"** y guardará los registros en la memoria interna del teléfono.
* **Al regresar a la casa con señal:** La app detectará automáticamente el internet y sincronizará todos los registros con la base de datos central sin que tengas que volver a digitarlos.

---

## 4. MÓDULO 1: INICIO Y DASHBOARD GERENCIAL

El **Dashboard** es el panel de control central. Ofrece una radiografía inmediata de la salud productiva y zootécnica de la finca.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 2: VISTA GENERAL DEL DASHBOARD]                           |
| *Mostrar las tarjetas principales de KPIs: Total Animales, Ganancia Media Mensual |
|  (GMP/GDP), Carga Animal (UGG/ha), Producción kg/ha/año y las gráficas.*          |
+-----------------------------------------------------------------------------------+
```

### 📊 Indicadores Clave (KPIs) Explicados:
1. **Total Animales:** Cantidad de cabezas activas en la finca.
2. **Ganancia Media Mensual / Diaria (GMP / GDP):**
   * **GMP ($kg/mes$):** Kilos ganados por animal en un mes promedio (30 días).
   * **GDP ($g/día$):** Gramos diarios de ganancia de peso vivo.
   * *Semáforo de colores de rendimiento:*
     * 🟢 **Verde (Alto rendimiento):** Animales con ganancia óptima (superan la meta de la finca).
     * 🟡 **Amarillo (Rendimiento medio):** Animales con ganancia aceptable pero con oportunidad de mejora.
     * 🔴 **Rojo (Bajo rendimiento / En riesgo):** Animales quedados o perdiendo peso (requieren revisión sanitaria o de pastura).
3. **Carga Animal ($UGG/ha$):** Unidades Gran Ganado (animal estándar de 450 kg) por hectárea aprovechable. Permite saber si la finca está subutilizada o sobrecargada.
4. **Producción de Carne ($kg/ha/año$):** Eficiencia productiva por cada hectárea de pasto al año.
5. **Tiempo Promedio de Permanencia:** Meses promedio que llevan los lotes en la finca (Levante y Ceba).
6. **Distribución por Rangos de Peso:** Gráfico que agrupa los animales por categorías ($<430\text{ kg}$, $431\text{-}480\text{ kg}$, $481\text{-}530\text{ kg}$, $>530\text{ kg}$) para programar camiones de venta.
7. **Descarga de Reporte en Excel:** Botón verde superior para exportar la base de datos completa con un solo clic.

---

## 5. MÓDULO 2: PLANO DE FINCA Y GEORREFERENCIACIÓN

Permite visualizar la distribución espacial de los potreros, fuentes hídricas y callejones de la finca sobre mapa satelital interactivo.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 3: PLANO DE FINCA / MAPA SATELITAL]                       |
| *Mostrar el mapa con los potreros delimitados por polígonos de colores,           |
|  la ventana emergente de información del potrero y el botón de traslado rápido.*  |
+-----------------------------------------------------------------------------------+
```

### 🗺️ Funcionalidades del Mapa:
* **Colores de Potreros:**
  * 🟢 **Verde:** Potrero disponible o con descanso adecuado listo para pastoreo.
  * 🟡 / 🔴 **Ocupado / En alerta:** Potrero con ganado actualmente adentro. Muestra los días que lleva ocupado y la carga animal actual.
* **Información al tocar un Potrero:**
  * Nombre del potrero y área exacta en hectáreas ($ha$).
  * Lote o potrerada que se encuentra adentro.
  * Cantidad de animales y peso promedio estimado.
  * Días continuos de ocupación.
* **Traslado Rápido desde el Mapa:** Si mueves un lote, puedes hacer clic sobre el potrero de destino y presionar **"Trasladar Lote Aquí"** para actualizar la ubicación inmediatamente.
* **Carga de Archivo KMZ (Google Earth):** El Administrador puede subir el plano perimetral de la finca en formato `.kmz` para mapear automáticamente todos los potreros.

---

## 6. MÓDULO 3: PLUVIOMETRÍA (CONTROL DE LLUVIAS)

La lluvia es el motor del pasto. Este módulo convierte los milímetros del pluviómetro en una herramienta para anticipar la oferta de comida y evitar sobrepastoreos en verano.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 4: MÓDULO DE PLUVIOMETRÍA Y FORMULARIO DE LLUVIA]         |
| *Mostrar la gráfica de barras mensual de lluvias, el comparativo año a año y el   |
|  formulario modal para registrar milímetros diarios.*                             |
+-----------------------------------------------------------------------------------+
```

### 🌧️ ¿Cómo registrar la lluvia del día?
1. Ingresa a **Pluviometría** en el menú *Trabajo de Campo*.
2. Haz clic en **"Registrar Lluvia"** (+).
3. Selecciona la **Fecha** (por defecto carga la fecha de hoy).
4. Elige el modo de entrada:
   * **Entrada Diaria (Recomendado):** Anotas la lectura del día (ejemplo: $28.5\text{ mm}$).
   * **Lectura Acumulada:** Para pluviómetros continuos donde anotas la marca de la escala total.
5. *(Opcional)* Agrega una nota de campo (ejemplo: *"Aguacero con fuerte viento en la zona baja"*).
6. Presiona **Guardar**.

### 💡 Interpretación de la Lluvia:
* **Trazas ($<1.0\text{ mm}$):** Humedad superficial, no representa recarga de forraje.
* **Lluvia Leve ($1.0\text{ a }4.9\text{ mm}$):** Refresca el ambiente pero con baja penetración en suelo.
* **Lluvia Efectiva ($\ge 5.0\text{ mm}$):** Activa el rebrote de las pasturas y el crecimiento foliar.
* **Lluvia Fuerte ($\ge 20.0\text{ mm}$):** Recarga hídrica profunda en el perfil del suelo.

---

## 7. MÓDULO 4: AFOROS Y OFERTA FORRAJERA

El aforo permite calcular cuántos kilos de pasto produce un potrero para saber con exactitud **cuántos animales caben y cuántos días deben quedarse**.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 5: MÓDULO DE AFOROS Y CALCULADORA DE FORRAJE]             |
| *Mostrar la cuadrícula de ingreso de muestras de 1m², el cálculo de materia verde |
|  y el resultado de días recomendados de pastoreo.*                                |
+-----------------------------------------------------------------------------------+
```

### 🌾 Procedimiento de Aforo en Campo (Paso a Paso):
1. **Lanza el marco:** Recorre el potrero en zigzag o "X" y lanza un marco de $1\text{ m}^2$ (o $0.5\text{ m} \times 0.5\text{ m}$) en 6 a 8 puntos representativos (zonas buenas, regulares y bajas).
2. **Corta y pesa:** Corta el pasto a la altura de remanente recomendada y pésalo en una gramera digital.
3. **Ingresa a la App:**
   * Ve a **Aforos y Forraje**.
   * Selecciona el **Potrero** evaluado.
   * Digita el peso en gramos de cada muestra tomada en las casillas correspondientes.
   * Ajusta el **Porcentaje de Viabilidad o Aprovechamiento** (se recomienda $70\%$ para descontar pisoteo, bosta y tallos leñosos).
4. **Resultado Automático:**
   * La app calcula el promedio de $kg/m^2$, el forraje total aprovechable en el potrero y los **días sugeridos de ocupación** según el tamaño del lote.
   * Presiona **"Guardar Aforo"**.

---

## 8. MÓDULO 5: ROTACIÓN DE LOTES Y MOVIMIENTOS DE POTRERO

Mover el ganado a tiempo evita que los animales coman el rebrote tierno y degraden la pastura.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 6: ROTACIÓN DE LOTES Y CAMBIO DE POTRERO]                 |
| *Mostrar la interfaz donde se elige el Lote, se visualiza el potrero actual y se   |
|  selecciona el potrero de destino con fecha de movimiento.*                       |
+-----------------------------------------------------------------------------------+
```

### 🔄 ¿Cómo registrar el cambio de potrero de un lote?
1. Ve a **Rotación de Lotes** en el menú *Trabajo de Campo*.
2. **Selecciona la Potrerada (Lote):** Ejemplo: *"Lote Novillos Ceba 1"*.
3. La app te mostrará en qué potrero está actualmente y cuántos días lleva allí.
4. **Selecciona el Potrero Destino:** Elige el potrero limpio y descansado al que entra el lote.
5. **Fecha del Movimiento:** Confirma la fecha en que se abrieron los broches.
6. Presiona **"Guardar Movimiento"**.
7. *¿Qué hace el sistema automáticamente?*
   * Cierra la ocupación del potrero anterior y empieza a contar sus **Días de Descanso**.
   * Abre la ocupación del nuevo potrero e inicia el contador de **Días de Ocupación**.

---

## 9. MÓDULO 6: CONTROL DE PESAJE EN CORRAL

Es el módulo más utilizado durante los días de trabajo en la báscula. Está optimizado para digitar rápido y sin errores.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 7: PANTALLA PRINCIPAL DE PESAJE EN BÁSCULA]               |
| *Mostrar el buscador de chapeta, los datos del animal encontrado, la casilla de   |
|  nuevo peso, el indicador verde de GDP y la tabla de pesajes de hoy abajo.*       |
+-----------------------------------------------------------------------------------+
```

### ⚖️ Flujo de Pesaje en la Báscula:
1. Digita el **Número de Chapeta** (o marca) del animal en el buscador.
2. La app busca inmediatamente el animal y te muestra:
   * Su peso anterior y la fecha del último pesaje.
   * El lote (potrerada) al que pertenece y su propietario.
3. Ingresa el **Nuevo Peso (kg)** que marca la báscula.
4. **Cálculo instantáneo en pantalla:**
   * Te muestra cuántos kilos ganó, los gramos por día ($g/día$) o kilos por mes ($kg/mes$).
   * Muestra el color de rendimiento (Verde, Amarillo o Rojo).
   * Si el animal supera el peso de ceba configurado (ejemplo: $\ge 380\text{ kg}$), se activa la casilla **"OK Ceba"**.
5. Presiona **"Guardar Pesaje"** (o presiona la tecla *Enter*). El cursor vuelve automáticamente a la casilla de chapeta para recibir al siguiente animal.

### ❓ ¿Qué pasa si el animal no existe en el sistema?
Si cantan una chapeta que no está en la base de datos, la app te avisará: *"Animal no encontrado"*. Te dará un botón directo para **"Crear Animal Nuevo"**, donde ingresas su propietario, peso de ingreso y lote, quedando registrado inmediatamente sin interrumpir la pesada.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 8: MODAL PARA CREAR ANIMAL NUEVO DURANTE EL PESAJE]       |
| *Mostrar el formulario rápido con chapeta, peso de ingreso, propietario y lote.*   |
+-----------------------------------------------------------------------------------+
```

### ✏️ Corrección de errores del día:
En la parte inferior de la pantalla aparece la tabla **"Pesajes Registrados Hoy"**. Si el vaquero digitó un peso equivocado (ejemplo: escribió $350$ en vez de $450$), simplemente hace clic en el icono del **Lápiz**, corrige el número y guarda el cambio.

---

## 10. MÓDULO 7: REGISTRO DE COMPRAS (ENTRADAS)

Cada vez que llega un camión de ganado a la finca, debe registrarse para alimentar el inventario y conocer el costo del kilo entrante.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 9: FORMULARIO DE REGISTRO DE COMPRA DE GANADO]            |
| *Mostrar los campos de proveedor, lote, báscula finca vs compra y tabla de        |
|  animales ingresados.*                                                             |
+-----------------------------------------------------------------------------------+
```

### 📥 Pasos para registrar una compra:
1. Ve a **Registrar Compra** en el menú *Trabajo de Campo*.
2. **Datos Generales:**
   * **Fecha de Ingreso:** Día de llegada a la finca.
   * **Proveedor:** Ganadero o subasta de origen.
   * **Propietario:** A nombre de quién queda el ganado.
   * **Potrerada / Lote Inicial:** A qué lote se incorporan.
3. **Ingreso de Animales:**
   * Selecciona cuántos animales llegaron en el lote.
   * Para cada animal digita su **Número de Chapeta** y su **Peso de Ingreso (kg)** en la báscula de la finca.
4. **Control de Merma (Opcional pero muy recomendado):**
   * Si tienes el peso de compra en báscula de origen (en la subasta o finca vendedora), activa la casilla *"Incluir Peso de Compra Total"*.
   * El sistema calculará la **merma en transporte (kilos perdidos en el viaje y porcentaje)**.
5. Presiona **"Guardar Compra"** y descarga el reporte de entrada.

---

## 11. MÓDULO 8: REGISTRO DE VENTAS (SALIDAS) Y ANIMALES PARA CEBA

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 10: REGISTRO DE VENTA Y LIQUIDACIÓN DE SALIDA]            |
| *Mostrar la selección de comprador, la lista de chapetas vendidas, la ganancia de |
|  kilos acumulada y el resumen total de la liquidación.*                           |
+-----------------------------------------------------------------------------------+
```

### 🏷️ ¿Cómo registrar la salida de animales vendidos?
1. Ve a **Registrar Venta** en *Trabajo de Campo*.
2. Ingresa la **Fecha de Venta** y el **Comprador / Frigorífico**.
3. Digita la **Chapeta** de los animales que se van en el camión y su **Peso Final de Salida (kg)**.
4. La app calculará automáticamente:
   * Ganancia total de peso durante toda su estadía en la finca.
   * Ganancia media diaria ($g/día$) final del ciclo.
   * Kilos totales facturados.
5. Presiona **"Confirmar y Procesar Venta"**.
   * Los animales vendidos pasan automáticamente a estado *"Vendido"* y salen del inventario activo, conservando todo su historial para auditoría.

### 🥩 Módulo "Animales para Ceba":
Cuando en una sesión de pesaje los animales alcanzan el peso objetivo de finalización, se activa un acceso directo en el menú con un punto verde. Al entrar, tienes la lista lista para imprimir o compartir por WhatsApp con el comprador de ganado o el transportador.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 11: LISTADO DE ANIMALES LISTOS PARA CEBA / MERCADO]       |
| *Mostrar la tabla de novillos listos para despacho comercial con sus pesos.*      |
+-----------------------------------------------------------------------------------+
```

---

## 12. MÓDULO 9: INVENTARIO BOVINO Y FICHA INDIVIDUAL

El módulo de **Inventario** es el archivo maestro de la ganadería.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 12: TABLA DE INVENTARIO Y FICHA INDIVIDUAL DEL ANIMAL]    |
| *Mostrar la lista general con filtros y la vista desplegada de un animal con su   |
|  curva histórica de pesajes.*                                                     |
+-----------------------------------------------------------------------------------+
```

### 🔍 ¿Qué puedes consultar y hacer aquí?
* **Buscador Universal:** Encuentra cualquier animal por su número de chapeta en segundos.
* **Filtros Avanzados:** Filtra por Lote, Etapa (Levante / Ceba), Sexo (Machos / Hembras), Propietario o Rango de Peso.
* **Hoja de Vida del Animal:** Al hacer clic en un animal, se despliega su historial completo:
  * Fecha de llegada y peso inicial.
  * Gráfica cronológica de todos sus pesajes en la finca.
  * GDP entre cada pesaje.
  * Días totales acumulados.
  * Potreros por los que ha rotado.
* **Dar de baja por muerte o pérdida:** Permite registrar la fecha y causa de muerte de un animal para mantener las estadísticas de mortalidad al día.

---

## 13. MÓDULO 10: POTRERADAS (LOTES DE MANEJO) E HISTORIALES

En ganadería tropical no se manejan animales sueltos; se manejan **Lotes o Potreradas** homogéneas.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 13: GESTIÓN DE LOTES / POTRERADAS]                        |
| *Mostrar las tarjetas de lotes activos con su peso promedio, cantidad de cabezas  |
|  y potrero actual asignado.*                                                      |
+-----------------------------------------------------------------------------------+
```

### 👥 Gestión de Potreradas:
* **Crear nuevo Lote:** Permite nombrar grupos (ejemplo: *"Lote 1 - Machos Levante"*, *"Lote 2 - Ceba Pesada"*).
* **Métricas por Lote:** Muestra el peso promedio del grupo, la ganancia promedio mensual y el potrero donde duermen hoy.
* **Historiales de Compras y Ventas:** Módulos de consulta histórica para revisar liquidaciones pasadas, fechas de despacho, kilos entregados y proveedores anteriores.

---

## 14. MÓDULO 11: MERCADO DE GANADO Y PRECIOS DE REFERENCIA

Permite consultar las cotizaciones y tendencias de precios del ganado en pie en las principales subastas del país.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 14: PANTALLA DE MERCADO Y PRECIOS DE REFERENCIA]          |
| *Mostrar las cotizaciones por categoría (Macho ceba, levante, terneros, hembras)  |
|  y gráficos de tendencia de precios.*                                             |
+-----------------------------------------------------------------------------------+
```

### 📈 Utilidad práctica:
* Conocer el valor de mercado en tiempo real de los kilos producidos en la finca.
* Comparar ofertas de compradores frente al precio oficial de subasta.
* Tomar decisiones informadas de compra y venta según estacionalidad de precios.

---

## 15. MÓDULO 12: CONFIGURACIÓN DE LA FINCA Y USUARIOS

Ubicado al final del menú lateral, exclusivo para el Administrador o Dueño.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 15: PANTALLA DE CONFIGURACIÓN Y PARÁMETROS TÉCNICOS]      |
| *Mostrar la configuración de umbrales GMP/GDP, gestión de usuarios, contactos     |
|  y la sección de importación masiva por Excel.*                                   |
+-----------------------------------------------------------------------------------+
```

### ⚙️ Opciones de Configuración:
1. **Configuración de Metas Zootécnicas:**
   * Definir si prefieres visualizar ganancias en **Gramos por Día ($g/día$)** o **Kilos por Mes ($kg/mes$)**.
   * Ajustar los umbrales del semáforo (ejemplo: Verde $>650\text{ g/día}$, Amarillo entre $400$ y $650\text{ g/día}$, Rojo $<400\text{ g/día}$).
   * Peso umbral de entrada a ceba (ejemplo: $380\text{ kg}$).
2. **Directorio de Contactos:**
   * Crear y editar Propietarios de ganado (en caso de ganado en compañía o varios socios).
   * Crear Proveedores habituales y Compradores.
3. **Gestión de Usuarios y Colaboradores:**
   * Crear accesos para el mayordomo, administradores o veterinarios asignando su correo, contraseña y rol correspondiente.
4. **Cargas Masivas (Excel / CSV):**
   * Importador rápido para subir inventarios grandes de animales o históricos de pesajes desde plantillas de Excel sin digitar uno a uno.

---

## 16. MÓDULO 13: ASISTENTE INTELIGENTE (AGROBOT)

En la esquina inferior de la pantalla encontrarás a **AgroBot**, un consultor zootécnico y financiero disponible las 24 horas.

```
+-----------------------------------------------------------------------------------+
| 📸 [INSERTAR PANTALLAZO 16: VENTANA DE CHAT CON AGROBOT]                          |
| *Mostrar una conversación interactiva con AgroBot resolviendo una duda técnica     |
|  sobre suplementación mineral o aforo.*                                           |
+-----------------------------------------------------------------------------------+
```

### 🤖 Ejemplos de consultas que puedes hacerle a AgroBot:
* *"¿Cuántos kilos de sal mineralizada al 8% debo suministrar a 60 novillos de 350 kg?"*
* *"Tengo un potrero de Brachiaria decumbens de 4 hectáreas con aforo de 1.2 kg/m². ¿Cuántos días me soporta 40 novillos?"*
* *"¿Cómo calculo el costo del kilo producido si estoy gastando $180 pesos diarios en suplemento?"*
* AgroBot responde con criterio técnico aplicado al trópico bajo, fundamentado en balances nutricionales y rentabilidad ganadera.

---

## 17. RESUMEN RÁPIDO: RUTINAS DE CAMPO (DÍA A DÍA)

### 🤠 Rutina Diaria del Mayordomo / Vaquero:
```
1. EN LA MAÑANA:
   - Mirar el pluviómetro -> Abrir App -> "Pluviometría" -> Registrar mm de lluvia.
2. DURANTE LA ROTACIÓN DE GANADO:
   - Al cambiar de potrero -> Abrir App -> "Rotación de Lotes" -> Mover lote al nuevo potrero.
3. DÍA DE TRABAJO EN BÁSCULA:
   - Abrir App en la mañana con internet para actualizar caché.
   - En el corral -> "Control de Pesaje" -> Digitar chapeta y peso de cada animal.
   - Al terminar -> Volver a la casa y verificar que los pesajes se sincronicen.
```

### 👔 Rutina Semanal / Mensual del Propietario:
```
1. REVISIÓN DE RESULTADOS:
   - Abrir "Dashboard" -> Evaluar la Ganancia Diaria de Peso (GDP) promedio del mes.
   - Identificar animales en semáforo ROJO para ordenar purga, cambio de lote o chequeo veterinario.
2. EVALUACIÓN DE PASTOS:
   - Abrir "Plano de Finca" y "Aforos" -> Verificar días de descanso de potreros y carga animal (UGG/ha).
3. PROGRAMACIÓN COMERCIAL:
   - Revisar "Animales para Ceba" y "Mercado" -> Coordinar camiones de venta con el frigorífico.
   - Descargar reporte en Excel para control financiero.
```

---

### 💡 CONSEJOS DE ORO PARA CERO ERRORES EN LA FINCA:
* ✅ **Nunca dejes una pesada para mañana:** Registra el pesaje el mismo día en que se pasa el ganado por la báscula.
* ✅ **Identificación clara:** Asegúrate de que las chapetas en la oreja del animal coincidan exactamente con el número digitado en la app.
* ✅ **Mantén los potreros al día:** Si abres el broche para pasar el ganado de potrero, anótalo de inmediato en la app. Dejarlo para después descuenta mal los días de descanso del pasto.

---
*Manual redactado y estructurado con rigor técnico y zootécnico para garantizar la máxima rentabilidad y control operativo de su empresa ganadera.*
