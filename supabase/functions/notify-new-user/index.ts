// @ts-nocheck
// supabase/functions/notify-new-user/index.ts
// v5: Blindado contra bypass de secreto e inyección HTML / Header injection

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_EMAIL   = Deno.env.get("NOTIFY_EMAIL")   ?? "";
const FN_SECRET      = Deno.env.get("FUNCTION_SECRET") ?? "agrogestion_notify_2026";

function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeHeader(text: unknown): string {
  if (text === null || text === undefined) return "";
  return String(text).replace(/[\r\n]+/g, " ").trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, content-type, x-function-secret",
      },
    });
  }

  try {
    // 1. Verificación estricta de secret de seguridad (Bypass Prevention)
    const receivedSecret = req.headers.get("x-function-secret");
    if (!receivedSecret || receivedSecret !== FN_SECRET) {
      console.warn("[notify-new-user] Petición no autorizada rechazada (secret inválido o ausente)");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      nombre              = "Sin nombre",
      apellido            = "",
      email               = "desconocido@email.com",
      nombre_organizacion = "Sin organizacion",
      nombre_finca        = "Sin finca",
      created_at          = new Date().toISOString(),
    } = body;

    // Fecha legible en zona Colombia (UTC-5)
    const fechaLegible = new Date(created_at).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // 2. Sanitización contra HTML Injection y XSS en plantillas de correo
    const safeNombre   = escapeHtml(nombre);
    const safeApellido = escapeHtml(apellido);
    const safeEmail    = escapeHtml(email);
    const safeOrg      = escapeHtml(nombre_organizacion);
    const safeFinca    = escapeHtml(nombre_finca);
    const safeFecha    = escapeHtml(fechaLegible);

    // 3. Sanitización de cabeceras contra Email Header Injection
    const subjNombre   = sanitizeHeader(nombre);
    const subjApellido = sanitizeHeader(apellido);
    const subjOrg      = sanitizeHeader(nombre_organizacion);

    const htmlBody = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Nuevo Registro - AgroGestion</title></head>
<body style="margin:0;padding:0;background:#0f1923;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1923;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#162030;border-radius:12px;border:1px solid #1e3a2f;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a4731,#0f2d1e);padding:28px 32px;text-align:center;border-radius:12px 12px 0 0;">
            <img src="https://www.appagrogestion.com/pwa-192x192.png" width="56" height="56" alt="AgroGestión" style="display:block;margin:0 auto 10px;border-radius:14px;border:0;outline:none;" />
            <h1 style="color:#60ad5e;margin:0;font-size:22px;font-weight:700;">AgroGestión</h1>
            <p style="color:#8bc34a;margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Nuevo Registro de Cuenta Demo</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="color:#b0bec5;margin:0 0 20px;font-size:15px;line-height:1.6;">
              Alguien acaba de crear una cuenta demo en <strong style="color:#e0e0e0;">AgroGestion</strong>:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1923;border-radius:10px;margin-bottom:20px;">
              <tr><td style="padding:14px 20px;border-bottom:1px solid #1e3a2f;">
                <span style="color:#78909c;font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">&#128100; Nombre</span>
                <span style="color:#e0e0e0;font-size:16px;font-weight:600;">${safeNombre} ${safeApellido}</span>
              </td></tr>
              <tr><td style="padding:14px 20px;border-bottom:1px solid #1e3a2f;">
                <span style="color:#78909c;font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">&#128231; Correo</span>
                <span style="color:#60ad5e;font-size:15px;">${safeEmail}</span>
              </td></tr>
              <tr><td style="padding:14px 20px;border-bottom:1px solid #1e3a2f;">
                <span style="color:#78909c;font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">&#127970; Organizacion / Ganaderia</span>
                <span style="color:#e0e0e0;font-size:15px;font-weight:600;">${safeOrg}</span>
              </td></tr>
              <tr><td style="padding:14px 20px;border-bottom:1px solid #1e3a2f;">
                <span style="color:#78909c;font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">&#127807; Finca Inicial</span>
                <span style="color:#e0e0e0;font-size:15px;">${safeFinca}</span>
              </td></tr>
              <tr><td style="padding:14px 20px;">
                <span style="color:#78909c;font-size:11px;text-transform:uppercase;display:block;margin-bottom:3px;">&#128197; Fecha de Registro</span>
                <span style="color:#e0e0e0;font-size:15px;">${safeFecha}</span>
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.25);border-radius:10px;margin-bottom:24px;">
              <tr><td style="padding:14px 18px;">
                <p style="color:#ffd54f;margin:0;font-size:13px;line-height:1.6;">
                  &#9201; <strong>Recordatorio:</strong> Si esta cuenta no registra animales en los proximos <strong>30 dias</strong>, considera contactar al usuario o eliminar la cuenta demo inactiva.
                </p>
              </td></tr>
            </table>
            <div style="text-align:center;">
              <a href="https://www.appagrogestion.com/superadmin" style="display:inline-block;background:linear-gradient(135deg,#2e7d32,#1b5e20);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
                Ver Panel SuperAdmin &rarr;
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#0f1923;padding:16px 32px;text-align:center;border-top:1px solid #1e3a2f;border-radius:0 0 12px 12px;">
            <p style="color:#546e7a;margin:0;font-size:12px;">
              AgroGestion — Sistema de Gestion Ganadera<br>
              Correo automatico generado al registrarse un nuevo usuario.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textBody = [
      "NUEVO REGISTRO - AGROGESTION",
      "==============================",
      `Nombre:        ${nombre} ${apellido}`,
      `Correo:        ${email}`,
      `Organizacion:  ${nombre_organizacion}`,
      `Finca:         ${nombre_finca}`,
      `Fecha:         ${fechaLegible}`,
      "",
      "Recuerda: si no registra animales en 30 dias, considera contactarlo o eliminar la cuenta demo.",
    ].join("\n");

    // Enviar via Resend API (HTTP fetch - compatible con Supabase Edge Runtime)
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "AgroGestion <onboarding@resend.dev>",
        to:      [NOTIFY_EMAIL],
        subject: `Nuevo registro: ${subjNombre} ${subjApellido} - ${subjOrg}`,
        html:    htmlBody,
        text:    textBody,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      throw new Error(`Resend API error ${resendRes.status}: ${JSON.stringify(resendData)}`);
    }

    console.log(`[notify-new-user] OK - Email enviado. ID: ${resendData.id} para: ${email}`);

    return new Response(
      JSON.stringify({ success: true, email_id: resendData.id, message: `Notificacion enviada para ${email}` }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err: any) {
    console.error("[notify-new-user] ERROR:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
