# Plan de Implementación: Asistente AgroClimático Zootécnico Dinámico e Inteligente

## 1. Diagnóstico del Problema Actual

### 1.1. Análisis Zootécnico y Climático de la Situación Real (Caso Puerto Berrío - Septiembre)
Al analizar la información registrada en la finca durante los primeros 15 días de septiembre:
- **Lluvia del mes:** 16.5 mm acumulados en 15 días (-85% vs mes anterior).
- **Frecuencia efectiva:** 1 solo día con lluvia $\ge 5\text{ mm}$ (el 11 de septiembre con 14.7 mm) y 14 días secos.
- **Evapotranspiración potencial de referencia ($ET_0$):** En Puerto Berrío (Magdalena Medio), la $ET_0$ oscila entre $4.8$ y $5.5\text{ mm/día}$.
- **Demanda hídrica ambiental en 15 días:** $15\text{ días} \times 5.0\text{ mm/día} \approx 75.0\text{ mm}$.
- **Balance Hídrico Neto:** $16.5\text{ mm} - 75.0\text{ mm} = \mathbf{-58.5\text{ mm}}$ (Déficit hídrico marcado).

### 1.2. ¿Por qué el sistema actual emitió "CONDICIÓN ÓPTIMA"?
1. **Dependencia lineal del reinicio de racha:** La lluvia aislada de 14.7 mm del 11 de septiembre reinició el contador `diasSecos` a 0. Al 15 de septiembre marcaba solo 3 días sin lluvia. Como el umbral de pre-alerta exige $\ge 6$ días, no activó alerta de sequía.
2. **Inercia de la ventana móvil de 30 días:** Los 99.6 mm acumulados en 30 días arrastraban eventos de mediados de agosto que ya fueron totalmente consumidos o evaporados.
3. **Ausencia de balance hídrico acumulado:** El motor no calculaba la relación entre oferta de agua y demanda evapotranspirativa de la quincena.
4. **Plantillas fijas estáticas:** Al no clasificar en sequía ni en exceso, el código cayó por descarte en el estado por defecto (`optima`), emitiendo recomendaciones peligrosas para el potrero (rotación agresiva y fertilización nitrogenada sin humedad de soporte).

---

## 2. Arquitectura de la Solución Dinámica & Modo Offline

Para lograr que el análisis sea **100% dinámico, contextual, rápido y zootécnicamente preciso**, sin ralentizar la aplicación ni fallar en el potrero sin señal:

```
                              ┌────────────────────────────────────────┐
                              │     REGISTRO DE LLUVIA EN POTRERO      │
                              └───────────────────┬────────────────────┘
                                                  │
                                  ¿HAY CONEXIÓN A INTERNET?
                                 /                         \
                             [SÍ]                           [NO] (Modo Offline)
                              │                               │
            ┌─────────────────┴────────────────┐   ┌──────────┴───────────────────────┐
            │  1. Ingesta a Supabase           │   │  1. Se guarda en Cola IndexedDB  │
            │  2. Disparo de IA (Gemini)       │   │  2. Motor Local Determina Estado │
            │  3. Guarda Diagnóstico en DB     │   │     (Calcula Balance Hídrico BH) │
            │  4. Actualiza Caché Local        │   │  3. Muestra Diagnóstico Inmediato│
            └──────────────────────────────────┘   └──────────┬───────────────────────┘
                                                              │
                                                  Al recuperar señal Wi-Fi/4G
                                                              │
                                                   Auto-Sincronización & IA
```

### Principios de Rendimiento y Operación:
1. **Latencia Cero en Carga:** Al entrar a la app, el diagnóstico se lee de la base de datos o de IndexedDB/localStorage en **0 ms**. No bloquea el render ni muestra pantallas de carga pesadas.
2. **Modo Offline Autónomo:** Si el usuario no tiene conexión, el **Motor Local Calibrado (`climateRegions.ts`)** evalúa el Balance Hídrico ($BH_{15}$) en el dispositivo y muestra el diagnóstico corregido (evitando falsos óptimos). Al recuperar señal, la IA sincroniza y enriquece el análisis.
3. **Restricción Estricta de Longitud (Mobile First):** Respuestas ultra compactas para que en pantalla de celular no consuma más de 220px de alto ni oculte las gráficas o tablas.

---

## 3. Especificación del Prompt y Restricción de Longitud

### 3.1. Restricciones de Longitud y Parámetros
- **`maxOutputTokens`:** 400 tokens (tiempo de inferencia $< 450\text{ ms}$).
- **Límites de caracteres por campo:**
  - `resumen_ejecutivo`: Máximo **180 caracteres** (2 oraciones directas con números).
  - `impacto_pasturas`: Máximo **140 caracteres** (rebrote y calidad de forraje).
  - `rotacion_pastoreo`: Máximo **120 caracteres** (días de descanso y remanente).
  - `fertilizacion_suelo`: Máximo **120 caracteres** (decisión de suspender o aplicar).
  - `nutricion_suplementacion`: Máximo **120 caracteres** (sal / proteína para sostener GDP).

### 3.2. System Prompt Estructurado
```text
Eres el Asistente Zootécnico y Consultor Agroclimático Senior de AgroGestión Ganadera, con más de 30 años de experiencia en manejo de pasturas tropicales, balances hídricos (FAO Penman-Monteith) y nutrición de bovinos en Colombia (Magdalena Medio, Costa Caribe, Llanos Orientales y Trópico Alto).

Tu misión es analizar la radiografía pluviométrica real de una finca, contrastar la precipitación contra la demanda de evapotranspiración (ET0), detectar fenómenos engañosos (lluvias aisladas en medio de sequía, falsos arranques de invierno, o anegamiento por saturación) y emitir un diagnóstico zootécnico ultra conciso y accionable.

REGLAS ZOOTÉCNICAS ESTRICTAS:
1. EVALUACIÓN DEL BALANCE HÍDRICO:
   - Nunca diagnostiques "Condición Óptima" si el Balance Hídrico de los últimos 15 días es marcadamente negativo (Lluvia 15d < 50% de la ET0 acumulada), aunque haya llovido hace 2 o 3 días.
   - Una lluvia aislada de 10 a 20 mm tras días secos solo humedece los primeros 3 a 5 cm y se evapora en 48-72 horas. Diagnostícala como "Lluvia Aislada / Déficit Hídrico Activo" o "Falso Alivio".

2. FISIOLOGÍA DE PASTURAS:
   - Con déficit hídrico, la pastura frena rebrote, acelera floración, sube FDN y baja proteína cruda (< 5%).
   - PROHIBIDO recomendar rotaciones cortas (18-25 días); ordena alargar descanso a 30-38 días para no sobrepastorear.

3. FERTILIZACIÓN Y MANEJO:
   - PROHIBIDO recomendar fertilización nitrogenada al voleo (urea) sin humedad continua (se volatiliza > 50% a > 30°C).

4. ESTRATEGIA NUTRICIONAL:
   - Recomienda sal mineralizada con NNP (urea pecuaria 2-3%) o sal proteinada (100-150 g/cab/día) para degradar fibra seca y sostener la GDP.

REGLAS DE FORMATO Y CONCISIÓN (MUY IMPORTANTE):
- Sé telegráfico, directo y ultra conciso. Máximo 1 a 2 oraciones por campo.
- Responde ÚNICAMENTE con un objeto JSON válido (sin etiquetas markdown ni texto introductorio):
{
  "estado_hidrico": "Texto corto (ej: Déficit Hídrico Quincenal – Lluvia Aislada)",
  "nivel_alerta": "optima" | "preAlerta" | "estres" | "excesoPreventivo" | "excesoCritico" | "transicion" | "oreo",
  "emoji_estado": "🟡" | "🔴" | "✅" | "💧" | "🌊" | "🌾" | "🌤️",
  "balance_hidrico_15d_mm": number,
  "resumen_ejecutivo": "Máx 180 caracteres: Diagnóstico con números de lluvia vs demanda.",
  "impacto_pasturas": "Máx 140 caracteres: Efecto en rebrote, FDN y proteína foliar.",
  "recomendaciones": {
    "rotacion_pastoreo": "Máx 120 caracteres: Días de descanso y remanente en cm.",
    "fertilizacion_suelo": "Máx 120 caracteres: Pauta directa sobre fertilización.",
    "nutricion_suplementacion": "Máx 120 caracteres: Sal mineral o proteinada para GDP."
  }
}
```

### 3.3. User Prompt (Inyección de Variables Reales)
```text
Analiza la siguiente radiografía agroclimática de la finca:

DATOS DE LA FINCA:
- Municipio: {municipio}
- Zona Agroecológica: {zona} (ET0 estimada: {et0_diaria} mm/día)
- Forrajes Predominantes: {forrajes_dominantes}
- Suelos y Drenaje: {suelo_drenaje}

REGISTROS DE PRECIPITACIÓN CALCULADOS:
- Fecha: {fecha_actual}
- Lluvia Hoy: {lluvia_hoy} mm
- Lluvia 7 Días: {lluvia_7d} mm (ET0 demandada: {et0_7d} mm | Balance 7d: {balance_7d} mm)
- Lluvia 15 Días: {lluvia_15d} mm (ET0 demandada: {et0_15d} mm | Balance 15d: {balance_15d} mm)
- Lluvia 30 Días: {lluvia_30d} mm (ET0 demandada: {et0_30d} mm | Balance 30d: {balance_30d} mm)
- Lluvia Mes Actual ({nombre_mes}): {lluvia_mes} mm en {dias_mes} días ({variacion_mes}% vs anterior)
- Días con Lluvia Efectiva (≥ {umbral_efectivo} mm): {dias_efectivos} días
- Días Secos en el mes: {dias_secos_mes} de {dias_mes} días
- Racha Seca Actual: {dias_racha_seca} días
- Acumulado Anual: {acumulado_anual} mm (Ref: {referencia_anual} mm/año)

INSTRUCCIÓN:
Genera el diagnóstico zootécnico y las directrices operativas en el formato JSON especificado.
```

---

## 4. Componentes Técnicos a Desarrollar

### Componente 1: Base de Datos (`setup_analisis_climatico.sql`)
Tabla en Supabase `analisis_climatico_finca` con RLS:
- `id` (UUID, PK)
- `id_finca` (UUID, FK)
- `fecha_analisis` (TIMESTAMP WITH TIME ZONE)
- `estado_hidrico` (TEXT)
- `nivel_alerta` (TEXT)
- `emoji_estado` (TEXT)
- `balance_hidrico_15d` (NUMERIC)
- `balance_hidrico_30d` (NUMERIC)
- `resumen_diagnostico` (TEXT)
- `impacto_pasturas` (TEXT)
- `recomendacion_rotacion` (TEXT)
- `recomendacion_fertilizacion` (TEXT)
- `recomendacion_nutricion` (TEXT)
- `metadatos_lluvia` (JSONB)
- `creado_en` (TIMESTAMP WITH TIME ZONE)

### Componente 2: Motor de Inferencia IA (`src/services/climateAiService.ts`)
- Módulo cliente asíncrono que consolida el contexto agroclimático, llama a `GoogleGenerativeAI` (`gemini-2.5-flash` o `gemini-3.5-flash`) con `maxOutputTokens: 400`, parsea el JSON y guarda en Supabase + caché local.

### Componente 3: Calibración del Motor Local Determinístico (`src/utils/climateRegions.ts`)
- Incorporación del cálculo de Balance Hídrico Quincenal ($BH_{15} = \text{Lluvia}_{15d} - 15 \times ET_0$) y detección de Lluvia Aislada para garantizar que el fallback offline nunca emita "Condición Óptima" con balance $< -30\text{ mm}$.

### Componente 4: Rediseño Visual Compacto en Frontend (`src/pages/Rainfall.tsx`)
- Micro-tarjeta ejecutiva móvil (< 220px de altura total).
- Píldoras de acción rápida:
  - 🌾 **Rotación:** Días de descanso y remanente.
  - ⛔ **Fertilización:** Decisión informada.
  - 🧂 **Nutrición:** Sal / Suplemento para GDP.
- Botón de actualización manual "Reanalizar con IA".

---

## 5. Plan de Ejecución

1. **Paso 1:** Ejecutar migración SQL para la tabla `analisis_climatico_finca` en Supabase.
2. **Paso 2:** Crear servicio `climateAiService.ts` con manejo de límites, timeout y fallback local.
3. **Paso 3:** Calibrar `climateRegions.ts` con $ET_0$ numérica y cálculo de $BH_{15}$.
4. **Paso 4:** Actualizar `Rainfall.tsx` con el nuevo diseño compacto y el flujo de disparo asíncrono.
5. **Paso 5:** Validar con el caso real de Puerto Berrío y pruebas de desconexión (offline).
