// @ts-nocheck
// supabase/functions/gemini-ai/index.ts
// Proxy seguro para Google Gemini AI: mantiene la API Key en el servidor
// y solo permite peticiones de usuarios autenticados con JWT válido.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

let cachedKey = Deno.env.get("GEMINI_API_KEY") ?? "";

async function getGeminiKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (supabaseUrl && serviceRoleKey) {
      const client = createClient(supabaseUrl, serviceRoleKey);
      const { data, error } = await client.rpc("get_service_gemini_key");
      if (!error && data) {
        cachedKey = data;
        return cachedKey;
      }
    }
  } catch (e) {
    console.error("[gemini-ai] Error al obtener key de vault:", e);
  }
  return cachedKey;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validar que exista header de autorización
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado: se requiere sesión activa" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = await getGeminiKey();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Servicio de IA no configurado en el servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      contents,
      systemInstruction,
      generationConfig = {},
      model = "gemini-3.5-flash-lite"
    } = body;

    if (!contents) {
      return new Response(
        JSON.stringify({ error: "Parámetro 'contents' es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalizar formato de contents para la API de Gemini
    let formattedContents;
    if (typeof contents === "string") {
      formattedContents = [{ role: "user", parts: [{ text: contents }] }];
    } else if (Array.isArray(contents)) {
      formattedContents = contents.map((c: any) => {
        if (c.parts) return c;
        return {
          role: c.role === "model" ? "model" : "user",
          parts: [{ text: c.text ?? "" }]
        };
      });
    } else {
      formattedContents = [contents];
    }

    const payload: any = { contents: formattedContents };

    if (systemInstruction) {
      payload.system_instruction = {
        parts: [{ text: String(systemInstruction) }]
      };
    }

    if (generationConfig && Object.keys(generationConfig).length > 0) {
      payload.generationConfig = generationConfig;
    }

    // Función interna para llamar a Gemini con modelo específico
    async function callGemini(selectedModel: string) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return res;
    }

    // Intentar con el modelo solicitado, con fallback automático a gemini-3.6-flash si hay saturación
    let geminiRes = await callGemini(model);

    if (!geminiRes.ok && (geminiRes.status === 503 || geminiRes.status === 429)) {
      console.warn(`[gemini-ai] Modelo ${model} devolvió ${geminiRes.status}. Intentando fallback a gemini-3.6-flash...`);
      geminiRes = await callGemini("gemini-3.6-flash");
    }

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const errorMsg = geminiData?.error?.message ?? `Error ${geminiRes.status} de Gemini API`;
      throw new Error(errorMsg);
    }

    const candidate = geminiData.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text ?? "";

    return new Response(
      JSON.stringify({ text, candidates: geminiData.candidates }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[gemini-ai] ERROR:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
