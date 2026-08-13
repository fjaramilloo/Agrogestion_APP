import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Prompt del sistema
const SYSTEM_PROMPT = `Eres AgroBot, un asistente y mentor ganadero inteligente integrado en una plataforma de gestión ganadera colombiana. Tu propósito principal es ayudar al usuario a consultar, analizar e interpretar los datos de sus animales y fincas. Además, actúas como un consultor zootécnico: puedes responder preguntas generales sobre manejo de ganaderías, mejores prácticas, y conceptos veterinarios o agronómicos.

Reglas importantes:
1. AISLAMIENTO: Solo puedes consultar datos de la finca activa del usuario (el fincaId se te inyecta automáticamente en cada mensaje de sistema).
2. SOLO LECTURA: Solo puedes generar sentencias SQL de tipo SELECT. NUNCA generes INSERT, UPDATE, DELETE, DROP, TRUNCATE.
3. VOCABULARIO: Usa chapeta, potrerada, lote, potrero, rotación, GMP, GDP, Levante, Ceba, Compra, Venta.
4. TONO: Mentor ganadero experimentado. Corrige errores técnicos o zootécnicos con criterio.

Cuando el usuario haga una pregunta que requiera datos de la finca, DEBES responder ÚNICAMENTE con un bloque SQL así (sin ningún texto antes ni después):
\`\`\`sql
SELECT ... FROM ... WHERE id_finca = '[fincaId]' ...
\`\`\`

Cuando ya tengas los datos del resultado de la consulta, entonces interprétalos y responde al usuario en español de manera natural y útil, como un buen asesor ganadero. No menciones el SQL ni detalles técnicos.

Si la pregunta NO requiere datos (ej: preguntas sobre zootecnia general, definiciones, etc.), responde directamente en español.

Tablas disponibles:
- fincas (id, nombre, area_aprovechable, proposito)
- animales (id, id_finca, numero_chapeta, nombre_propietario, etapa, peso_ingreso, peso_compra, fecha_ingreso, estado, id_potrerada, id_potrero_actual)
- registros_pesaje (id, id_animal, peso, fecha, gdp_calculada, gmp_calculada)
- potreradas (id, id_finca, nombre, etapa, id_rotacion)
- rotaciones (id, id_finca, nombre)
- potreros (id, id_finca, nombre, area_hectareas, id_rotacion)
- propietarios (id, id_finca, nombre)
- configuracion_kpi (id_finca, umbral_alto_gmp, umbral_medio_gmp)

Joins: animales.id_potrerada = potreradas.id | registros_pesaje.id_animal = animales.id | usa LEFT JOIN para relaciones opcionales.`;

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
    const { fincaId } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: '¡Hola! Soy AgroBot, tu mentor ganadero. ¿En qué te puedo ayudar hoy?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    if (!apiKey) return null;

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
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-3.6-flash",
                systemInstruction: SYSTEM_PROMPT,
            });

            // Historial de la conversación
            const history = messages.slice(1).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

            const chat = model.startChat({ history });

            // Paso 1: Enviar el mensaje con el fincaId inyectado
            const contextMsg = `[Sistema: fincaId activo = '${fincaId}'. Usa este ID en todos los filtros SQL.]\n\nPregunta: ${userMsg}`;
            const step1 = await chat.sendMessage(contextMsg);
            const step1Text = step1.response.text();

            // Paso 2: Si la respuesta contiene SQL, ejecutarlo
            const sql = extractSql(step1Text);

            if (sql) {
                // Ejecutar SQL en Supabase
                const { data, error } = await supabase.rpc('execute_ai_query', { query_text: sql });

                let dbResult = '';
                if (error) {
                    dbResult = `Error al consultar: ${error.message}`;
                } else if (!data || (Array.isArray(data) && data.length === 0)) {
                    dbResult = 'La consulta no devolvió resultados.';
                } else {
                    dbResult = JSON.stringify(data);
                }

                // Paso 3: Enviar los resultados de vuelta para que la IA los interprete
                const step2 = await chat.sendMessage(
                    `Resultado de la consulta SQL: ${dbResult}\n\nAhora interpreta estos resultados y responde al usuario de manera clara y útil en español. No menciones el SQL ni el formato técnico.`
                );
                const botMsg = step2.response.text();
                setMessages(prev => [...prev, { role: 'model', text: botMsg }]);
            } else {
                // No necesitaba SQL: respuesta directa
                setMessages(prev => [...prev, { role: 'model', text: step1Text }]);
            }

        } catch (error: any) {
            console.error("Error con AgroBot:", error);
            setMessages(prev => [...prev, { role: 'model', text: `Lo siento, tuve un problema técnico: ${error.message}` }]);
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
                                    {m.text}
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
