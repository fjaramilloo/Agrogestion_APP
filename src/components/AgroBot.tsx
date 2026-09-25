import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, X, Send, Database, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Prompt del sistema con conocimiento integral de la base de datos de la finca
const SYSTEM_PROMPT = `Eres AgroBot, un asistente y mentor ganadero inteligente integrado en una plataforma de gestión ganadera colombiana. Tu propósito principal es ayudar al usuario a consultar, analizar e interpretar TODOS los datos de su finca: animales, pesajes, aforos de pasturas, registros pluviométricos (lluvias), rotación de potreros, compras, ventas, crías y análisis climático. Además, actúas como consultor zootécnico y agronómico: respondes con criterio experto sobre manejo de praderas, nutrición, balance hídrico, sanidad y mejores prácticas ganaderas en el trópico.

Reglas fundamentales:
1. AISLAMIENTO ESTRICTO: Solo puedes consultar datos de la finca activa del usuario usando "WHERE id_finca = '[fincaId]'" (o mediante JOINs con tablas que pertenezcan a dicha finca). El fincaId y la fecha actual se te inyectan en cada mensaje del sistema.
2. SOLO LECTURA: Únicamente genera sentencias SQL de tipo SELECT. NUNCA generes INSERT, UPDATE, DELETE, DROP, ALTER ni TRUNCATE.
3. VOCABULARIO GANADERO Y AGRONÓMICO: Emplea términos del campo colombiano (chapeta, potrerada, lote, potrero, rotación, aforo, pastoreo, forraje verde, milímetros de lluvia, balance hídrico, GDP, GMP, Levante, Ceba, Cría).
4. TONO: Mentor y asesor técnico experimentado, cercano, empático y zootécnicamente riguroso. Explica qué significan los números encontrados (por ejemplo, cómo influyen los milímetros caídos en el crecimiento del pasto o si los días de pastoreo calculados en el aforo son suficientes para la carga animal).
5. FECHAS Y TIEMPO: Utiliza la fecha actual inyectada en el sistema para resolver rangos relativos ("este fin de semana", "ayer", "este mes", "el último mes", "este año"). En SQL puedes usar operadores de fecha de PostgreSQL como CURRENT_DATE, INTERVAL, DATE_TRUNC, EXTRACT, etc.

MODO DE RESPUESTA:
- Cuando el usuario haga una pregunta que requiera datos de la finca o del mercado, DEBES responder ÚNICAMENTE con un bloque SQL así (sin ningún saludo, explicación ni texto antes o después):
\`\`\`sql
SELECT ... FROM ... WHERE id_finca = '[fincaId]' ...
\`\`\`
- Cuando recibas el resultado de la consulta SQL, interprétalo con criterio técnico y responde al ganadero en español claro, fluido y estructurado (usando viñetas, negritas o tablas markdown). NUNCA menciones la sintaxis SQL ni detalles técnicos de bases de datos al usuario.
- Si la consulta SQL devuelve 0 registros o está vacía, explícaselo amablemente al usuario indicando que aún no hay registros de esa información para la finca o para ese rango de fechas.
- Si la pregunta NO requiere datos de la finca (ej: preguntas sobre zootecnia general, qué pasto sembrar, requerimientos nutricionales de novillos, etc.), responde directamente en español sin generar SQL.

TABLAS DISPONIBLES EN LA BASE DE DATOS:

1. registros_lluvia (Pluviometría e historial de precipitaciones):
   - Columnas: id, id_finca, fecha (date), milimetros (numeric, mm de lluvia caída), notas (text, observaciones del clima), lectura_acumulada (numeric)
   - Uso: Consultar cuánto ha llovido, acumulado mensual/anual, historial de días lluviosos, lluvias del último fin de semana o mes.
   - Ejemplos de consulta:
     * Lluvia reciente o en un rango:
       SELECT fecha, milimetros, notas FROM registros_lluvia WHERE id_finca = '[fincaId]' AND fecha >= CURRENT_DATE - INTERVAL '30 days' ORDER BY fecha DESC
     * Acumulado total y días de lluvia:
       SELECT COALESCE(SUM(milimetros), 0) as total_mm, COUNT(CASE WHEN milimetros > 0 THEN 1 END) as dias_lluvia, MAX(milimetros) as max_dia FROM registros_lluvia WHERE id_finca = '[fincaId]' AND fecha BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
     * Lluvia agrupada por mes:
       SELECT DATE_TRUNC('month', fecha) as mes, SUM(milimetros) as total_mm FROM registros_lluvia WHERE id_finca = '[fincaId]' GROUP BY mes ORDER BY mes DESC

2. registros_aforo (Aforos de pasturas, disponibilidad forrajera y capacidad de carga):
   - Columnas: id, id_finca, id_potrero, fecha (date), promedio_muestras_kg (numeric, kg/m² forraje verde), viabilidad (numeric, % aprovechamiento), aforo_real_kg (numeric, kg de forraje aprovechable total), id_potrerada (uuid), animales_presentes (integer), dias_pastoreo_estimados (numeric)
   - Joins: LEFT JOIN potreros p ON registros_aforo.id_potrero = p.id | LEFT JOIN potreradas pot ON registros_aforo.id_potrerada = pot.id
   - Uso: Saber cuánto pasto hay en un potrero, cuántos días de pastoreo durará según la potrerada, kilos de pasto aprovechable por metro cuadrado o por hectárea.
   - Ejemplo de consulta:
     SELECT ra.fecha, p.nombre as potrero, p.area_hectareas, ra.aforo_real_kg, ra.dias_pastoreo_estimados, ra.animales_presentes, pot.nombre as lote
     FROM registros_aforo ra
     LEFT JOIN potreros p ON ra.id_potrero = p.id
     LEFT JOIN potreradas pot ON ra.id_potrerada = pot.id
     WHERE ra.id_finca = '[fincaId]'
     ORDER BY ra.fecha DESC LIMIT 10

3. analisis_climatico_finca (Diagnósticos agroclimáticos e hídricos calculados):
   - Columnas: id, id_finca, fecha_analisis (timestamp), estado_hidrico (text, ej: 'Déficit Hídrico Severo', 'Óptimo', 'Exceso'), nivel_alerta (text), emoji_estado (text), balance_hidrico_15d (numeric), balance_hidrico_30d (numeric), resumen_diagnostico (text), impacto_pasturas (text), recomendacion_rotacion (text), recomendacion_fertilizacion (text), recomendacion_nutricion (text)
   - Uso: Conocer el último diagnóstico bioclimático de la finca y recomendaciones para rotación o suplementación frente a sequías o lluvias.

4. movimientos_potreros (Historial de traslados y rotación de potreros):
   - Columnas: id, id_finca, id_potrerada, id_potrero, fecha_entrada (date), fecha_salida (date, NULL si el lote está actualmente ocupando ese potrero)
   - Joins: JOIN potreradas pot ON movimientos_potreros.id_potrerada = pot.id | JOIN potreros p ON movimientos_potreros.id_potrero = p.id
   - Ocupación actual:
     SELECT pot.nombre as potrerada, p.nombre as potrero, mp.fecha_entrada, (CURRENT_DATE - mp.fecha_entrada) as dias_ocupacion
     FROM movimientos_potreros mp
     JOIN potreradas pot ON mp.id_potrerada = pot.id
     JOIN potreros p ON mp.id_potrero = p.id
     WHERE mp.id_finca = '[fincaId]' AND mp.fecha_salida IS NULL

5. potreros (Potreros de la finca):
   - Columnas: id, id_finca, nombre, area_hectareas, id_rotacion, dias_ocupacion_base
   - Join: LEFT JOIN rotaciones r ON potreros.id_rotacion = r.id

6. potreradas (Lotes o grupos de animales):
   - Columnas: id, id_finca, nombre, etapa (Levante, Ceba, Cría, etc.), id_rotacion

7. rotaciones (Sistemas o circuitos de pastoreo rotacional):
   - Columnas: id, id_finca, nombre

8. animales (Inventario bovino y bufalino):
   - Columnas: id, id_finca, numero_chapeta, nombre_propietario, especie ('Bovino', 'Bufalino'), sexo ('Macho', 'Hembra'), etapa ('Levante', 'Ceba', 'Cría', 'Vaca Parida', etc.), fecha_ingreso, peso_ingreso, peso_compra, proveedor_compra, id_potrero_actual, id_potrerada, estado ('activo', 'vendido', 'descarte', 'muerto' - SIEMPRE minúsculas), fecha_muerte, fecha_venta, peso_venta, precio_venta, comprador_venta, observaciones_venta, fecha_ingreso_ceba, peso_ingreso_ceba, ok_ceba, es_emergencia, tipo_macho, fecha_castracion, is_deleted (boolean)
   - REGLA: Filtrar SIEMPRE 'is_deleted = false'. Si se consulta el ganado actual en finca, usar también 'estado = ''activo'''.

9. registros_pesaje (Historial de pesajes de los animales):
   - Columnas: id, id_animal, peso, fecha, etapa, id_potrero, peso_anterior, gdp_calculada (ganancia diaria en kg/día), gmp_calculada (ganancia mensual en kg/mes), is_deleted (boolean)
   - REGLA: Filtrar 'is_deleted = false'. Join: registros_pesaje.id_animal = animales.id

10. fincas (Datos de la finca):
    - Columnas: id, nombre, ubicacion, municipio, area_total, area_aprovechable, proposito

11. registros_cria (Nacimientos y crías en la finca):
    - Columnas: id, id_finca, id_madre, fecha_nacimiento, sexo, numero_unico
    - Join: registros_cria.id_madre = animales.id

12. proveedores (Proveedores de compra de ganado):
    - Columnas: id, id_finca, nombre

13. compradores (Compradores de venta de ganado):
    - Columnas: id, id_finca, nombre

14. configuracion_kpi (Metas zootécnicas de la finca):
    - Columnas: id_finca, umbral_alto_gmp, umbral_medio_gmp

15. mediciones_pasto (Mediciones de biomasa por potrero):
    - Columnas: id, id_potrero, fecha, kg_pasto_humedo, carga_animal_calculada

16. precios_mercado_ganado (Referencia de precios de subastas en Colombia):
    - Columnas: subasta, departamento, municipio, categoria, peso_promedio, precio_promedio, precio_maximo, precio_minimo, fecha
    - Nota: Tabla general de referencia de precios en subastas del país (no requiere filtro id_finca).

JOINS HABITUALES:
- Animales con lote y potrero: animales a LEFT JOIN potreradas pot ON a.id_potrerada = pot.id LEFT JOIN potreros p ON a.id_potrero_actual = p.id WHERE a.id_finca = '[fincaId]' AND a.is_deleted = false
- Pesajes con animal: registros_pesaje rp JOIN animales a ON rp.id_animal = a.id WHERE a.id_finca = '[fincaId]' AND rp.is_deleted = false
- Aforos con potrero: registros_aforo ra LEFT JOIN potreros p ON ra.id_potrero = p.id WHERE ra.id_finca = '[fincaId]'`;

function extractSql(text: string): string | null {
    let result: string | null = null;
    // 1. Intentar sacar lo que esté entre ```sql (o ```SQL) y ```
    const match = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    if (match) {
        result = match[1].trim();
    } else {
        // 2. Si no hay comillas, pero el texto empieza con SELECT
        const trimmed = text.trim();
        if (trimmed.toUpperCase().startsWith('SELECT')) {
            result = trimmed;
        }
    }
    
    if (result) {
        // Eliminar el punto y coma final, que rompe el EXECUTE dinámico de PostgreSQL
        return result.replace(/;+$/, '').trim();
    }
    
    return null;
}

export default function AgroBot() {
    const navigate = useNavigate();
    const { fincaId, licenciaInfo } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: '¡Hola! Soy AgroBot, tu mentor ganadero. Puedo responder preguntas sobre tus animales, pesajes, lluvias y pluviometría, aforos de pasturas, rotaciones de potreros y mucho más. ¿En qué te puedo ayudar hoy?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const esDemo = licenciaInfo?.licencia === 'demo';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim()) return;
        if (!fincaId) {
            setMessages(prev => [...prev, { role: 'model', text: 'Para hacer consultas primero debes seleccionar una finca en la aplicación.' }]);
            return;
        }

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setInput('');
        setIsLoading(true);

        try {
            // Obtener fecha actual en formato local de Colombia (UTC-5)
            const hoy = new Date();
            const fechaActual = hoy.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
            const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const diaSemana = diasSemana[new Date(hoy.toLocaleString('en-US', { timeZone: 'America/Bogota' })).getDay()];

            // Paso 1: Enviar el mensaje con el fincaId y la fecha de hoy inyectados
            const contextMsg = `[Sistema: fincaId activo = '${fincaId}'. Fecha actual de hoy: ${fechaActual} (${diaSemana}). Usa este id_finca en los filtros SQL y apóyate en la fecha actual para resolver términos como 'este fin de semana', 'ayer', 'este mes', 'este año', etc.]\n\nPregunta: ${userMsg}`;

            // Historial acumulado para el Paso 1
            const chatContents = [
                ...messages.slice(1).map(m => ({
                    role: m.role,
                    parts: [{ text: m.text }]
                })),
                { role: 'user', parts: [{ text: contextMsg }] }
            ];

            // Invocación segura mediante Supabase Edge Function (API Key protegida en el servidor)
            const { data: step1Data, error: step1Err } = await supabase.functions.invoke('gemini-ai', {
                body: {
                    systemInstruction: SYSTEM_PROMPT,
                    contents: chatContents,
                    model: 'gemini-3.5-flash-lite'
                }
            });

            if (step1Err) throw new Error(step1Err.message || 'Error al conectar con AgroBot');
            const step1Text = step1Data?.text ?? '';

            // Paso 2: Si la respuesta contiene SQL, ejecutarlo
            const sql = extractSql(step1Text);

            if (sql) {
                // Ejecutar SQL en Supabase a través de RPC segura
                const { data, error } = await supabase.rpc('execute_ai_query', { query_text: sql });

                let dbResult = '';
                if (error) {
                    dbResult = `Error al consultar: ${error.message}`;
                } else if (!data || (Array.isArray(data) && data.length === 0)) {
                    dbResult = 'La consulta no devolvió resultados (sin registros para el filtro o periodo solicitado).';
                } else {
                    dbResult = JSON.stringify(data);
                }

                // Paso 3: Enviar los resultados de vuelta para que la IA los interprete zootécnicamente
                const interpretContents = [
                    ...chatContents,
                    { role: 'model', parts: [{ text: step1Text }] },
                    {
                        role: 'user',
                        parts: [{
                            text: `Resultado de la consulta SQL: ${dbResult}\n\nAhora interpreta estos resultados y responde al usuario de manera clara, fluida y útil en español como un mentor ganadero. No menciones el SQL ni el formato técnico de la base de datos.`
                        }]
                    }
                ];

                const { data: step2Data, error: step2Err } = await supabase.functions.invoke('gemini-ai', {
                    body: {
                        systemInstruction: SYSTEM_PROMPT,
                        contents: interpretContents,
                        model: 'gemini-3.5-flash-lite'
                    }
                });

                if (step2Err) throw new Error(step2Err.message || 'Error al interpretar resultados');
                const botMsg = step2Data?.text ?? '';
                setMessages(prev => [...prev, { role: 'model', text: botMsg }]);
            } else {
                // No necesitaba SQL: respuesta directa
                setMessages(prev => [...prev, { role: 'model', text: step1Text }]);
            }

        } catch (error: any) {
            console.error("Error con AgroBot:", error);
            let errorMsg = `Lo siento, tuve un problema técnico: ${error.message}`;
            
            if (error.message?.includes('429') || error.message?.includes('Quota exceeded')) {
                errorMsg = '🐄 ¡Ups! He alcanzado mi límite de consultas rápidas por ahora (límite de uso gratuito). Por favor, dame un minuto de descanso e inténtalo de nuevo.';
            } else if (error.message?.includes('503')) {
                errorMsg = '🐄 Mis servidores están un poco saturados en este momento. Dame unos segunditos e intenta de nuevo.';
            }
            
            setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {isOpen && (
                <div className="card" style={{ width: '350px', height: '500px', marginBottom: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ padding: '16px', background: 'var(--bg-dark-paper)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bot size={20} color="var(--primary-light)" />
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>AgroBot</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="btn-icon" style={{ padding: '4px' }}>
                            <X size={18} />
                        </button>
                    </div>

                    {esDemo ? (
                        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: 'linear-gradient(145deg, rgba(30,30,45,0.9), rgba(20,20,35,0.95))' }}>
                            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255, 179, 0, 0.15)', border: '1px solid rgba(255, 179, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                                <Lock size={28} color="#ffb74d" />
                            </div>
                            <h4 style={{ margin: '0 0 8px', color: 'white', fontSize: '1.1rem', fontWeight: 800 }}>
                                AgroBot es Exclusivo
                            </h4>
                            <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                                AgroBot (nuestra IA Mentora Ganadera) está disponible únicamente para usuarios con <strong style={{ color: '#ffb74d' }}>Plan Finca</strong> o <strong style={{ color: '#c084fc' }}>Plan Premium</strong>.
                            </p>
                            <button
                                onClick={() => { setIsOpen(false); navigate('/suscripcion'); }}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                                    background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                                    color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)'
                                }}
                            >
                                <span>Ver Planes de Suscripción</span>
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {messages.map((m, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                        <div style={{ 
                                            maxWidth: '85%', 
                                            padding: '10px 14px', 
                                            borderRadius: '12px',
                                            background: m.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                            color: m.role === 'user' ? 'white' : 'var(--text)',
                                            fontSize: '0.9rem',
                                            lineHeight: '1.4'
                                        }}>
                                            {m.role === 'model' ? (
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        table: ({node, ...props}: any) => <div style={{ overflowX: 'auto', margin: '8px 0' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }} {...props} /></div>,
                                                        th: ({node, ...props}: any) => <th style={{ border: '1px solid rgba(255,255,255,0.2)', padding: '6px', textAlign: 'left', background: 'rgba(255,255,255,0.1)' }} {...props} />,
                                                        td: ({node, ...props}: any) => <td style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '6px' }} {...props} />,
                                                        p: ({node, ...props}: any) => <p style={{ margin: '0 0 8px 0' }} {...props} />,
                                                        ul: ({node, ...props}: any) => <ul style={{ margin: '0 0 8px 0', paddingLeft: '20px' }} {...props} />,
                                                        ol: ({node, ...props}: any) => <ol style={{ margin: '0 0 8px 0', paddingLeft: '20px' }} {...props} />,
                                                        strong: ({node, ...props}: any) => <strong style={{ color: 'var(--primary-light)' }} {...props} />
                                                    }}
                                                >
                                                    {m.text}
                                                </ReactMarkdown>
                                            ) : (
                                                m.text
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Database size={14} className="spin-slow" /> Procesando datos...
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'var(--bg-dark-paper)' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text"
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                                        placeholder="Escribe tu consulta..."
                                        style={{ flex: 1, padding: '10px', fontSize: '0.9rem', marginBottom: 0 }}
                                    />
                                    <button 
                                        onClick={handleSend}
                                        disabled={isLoading || !input.trim()}
                                        style={{ padding: '0 16px', width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
            
            {!isOpen && (
                <button 
                    onClick={() => setIsOpen(true)}
                    style={{ width: '56px', height: '56px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(46, 204, 113, 0.4)' }}
                >
                    <Bot size={28} color="white" />
                </button>
            )}
        </div>
    );
}
