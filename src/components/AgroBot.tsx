import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { FunctionDeclaration } from '@google/generative-ai';

// Prompt del sistema
const SYSTEM_PROMPT = `Eres AgroBot, un asistente y mentor ganadero inteligente integrado en una plataforma de gestión ganadera colombiana. Tu propósito principal es ayudar al usuario a consultar, analizar e interpretar los datos de sus animales y fincas. Además, actúas como un consultor zootécnico: puedes responder preguntas generales sobre manejo de ganaderías, mejores prácticas (ej: ¿cómo se hace un aforo?), y conceptos veterinarios o agronómicos.

Tienes acceso a una base de datos estructurada de Supabase con información real de la finca. Cada consulta de datos que generes se ejecutará en tiempo real y se te devolverán los resultados para que los interpretes.

1. Aislamiento de finca: Solo puedes consultar datos de la finca activa del usuario. Nunca accedas ni menciones datos de otras fincas. Siempre usa la herramienta "consultar_datos" si necesitas datos.
2. Solo lectura: Exclusivamente puedes generar sentencias SQL de tipo SELECT.
3. Vocabulario: Usa chapeta, potrerada, lote, potrero, rotación, GMP, GDP, Levante, Ceba, Compra, Venta.
4. Tono: Mentor ganadero experimentado. Corrige errores técnicos o zootécnicos del usuario.
5. Tablas disponibles:
- fincas (id, nombre, area_aprovechable, proposito)
- animales (id, id_finca, numero_chapeta, nombre_propietario, etapa, peso_ingreso, peso_compra, fecha_ingreso, estado, id_potrerada, id_potrero_actual)
- registros_pesaje (id, id_animal, peso, fecha, gdp_calculada, gmp_calculada)
- potreradas (id, id_finca, nombre, etapa, id_rotacion)
- rotaciones (id, id_finca, nombre)
- potreros (id, id_finca, nombre, area_hectareas, id_rotacion)
- propietarios (id, id_finca, nombre)
- configuracion_kpi (id_finca, umbral_alto_gmp, umbral_medio_gmp)

Importante: Para obtener datos, SIEMPRE DEBES USAR LA HERRAMIENTA "consultar_datos". Pasa el SQL como argumento. El SQL debe usar WHERE id_finca = '[fincaId]'. Nunca devuelvas un JSON directamente al usuario, espera la respuesta de la herramienta para dar la respuesta final al usuario.`;

const consultarDatosDeclaration: FunctionDeclaration = {
    name: 'consultar_datos',
    description: 'Ejecuta una consulta SQL SELECT en la base de datos de la finca para obtener información real y actualizada. Debes usar esto SIEMPRE que el usuario haga una pregunta sobre sus animales o fincas.',
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            query: {
                type: SchemaType.STRING,
                description: 'La consulta SQL (solo SELECT) a ejecutar. Debe incluir el filtro por id_finca correspondiente y usar JOINs si es necesario.'
            }
        },
        required: ['query'],
    },
};

export default function AgroBot() {
    const { fincaId } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: '¡Hola! Soy AgroBot, tu mentor ganadero. Puedo ayudarte a analizar los datos de tu finca o responder preguntas sobre zootecnia.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Configurar Gemini
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey || '');
    const model = genAI.getGenerativeModel({
        model: "gemini-3.6-flash",
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: [consultarDatosDeclaration] }]
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    if (!apiKey) {
        return null;
    }

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
            // Historial para mantener contexto
            const history = messages.slice(1).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

            const chat = model.startChat({ history });

            // Enviar mensaje con el fincaId inyectado
            const contextMsg = `[Contexto Oculto: El ID de la finca actual es '${fincaId}'. Filtra siempre por este ID]. Pregunta del usuario: ${userMsg}`;
            let result = await chat.sendMessage(contextMsg);
            
            // Procesar llamadas a herramientas (function calling)
            const functionCalls = result.response.functionCalls();
            if (functionCalls && functionCalls.length > 0) {
                const call = functionCalls[0];
                if (call.name === 'consultar_datos') {
                    const sqlQuery = (call.args as any).query;
                    
                    // Ejecutar en Supabase
                    const { data, error } = await supabase.rpc('execute_ai_query', { query_text: sqlQuery });
                    
                    let dbResultStr = '';
                    if (error) {
                        dbResultStr = `Error en DB: ${error.message}`;
                    } else {
                        dbResultStr = JSON.stringify(data);
                    }

                    // Enviar resultado de vuelta a la IA
                    result = await chat.sendMessage([{
                        functionResponse: {
                            name: 'consultar_datos',
                            response: { result: dbResultStr }
                        }
                    }]);
                }
            }

            const botMsg = result.response.text();
            setMessages(prev => [...prev, { role: 'model', text: botMsg }]);
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
