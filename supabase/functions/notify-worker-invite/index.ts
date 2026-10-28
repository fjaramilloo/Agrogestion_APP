// @ts-nocheck
// supabase/functions/notify-worker-invite/index.ts
// Notificación de bienvenida y credenciales para nuevos trabajadores/vaqueros y observadores

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FN_SECRET = Deno.env.get("FUNCTION_SECRET") ?? "agrogestion_notify_2026";

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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, x-function-secret, x-client-info, apikey",
      },
    });
  }

  try {
    // Verificación de autorización: por JWT de usuario autenticado o secret interno
    const authHeader = req.headers.get("authorization") ?? "";
    const receivedSecret = req.headers.get("x-function-secret");

    const isAuthorized = (authHeader && authHeader.startsWith("Bearer ")) || (receivedSecret === FN_SECRET);
    if (!isAuthorized) {
      console.warn("[notify-worker-invite] Petición no autorizada rechazada");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      email,
      nombre = "",
      apellido = "",
      password = "",
      rol = "vaquero",
      fincas = [],
    } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "El correo electrónico es requerido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const safeNombre = escapeHtml(nombre);
    const safeApellido = escapeHtml(apellido);
    const safeEmail = escapeHtml(email);
    const safePassword = escapeHtml(password);

    const fincasList = Array.isArray(fincas) && fincas.length > 0 ? fincas : ["Tu Finca"];
    const fincasTexto = fincasList.join(", ");
    const safeFincas = escapeHtml(fincasTexto);

    const rolNombre = rol === "vaquero" 
      ? "Trabajador / Vaquero" 
      : rol === "observador" 
        ? "Visualizador / Observador" 
        : "Colaborador";
    const safeRol = escapeHtml(rolNombre);

    const subjFinca = sanitizeHeader(fincasList[0] || "AgroGestión");
    const subject = `¡Bienvenido(a) a AgroGestión! Acceso a ${subjFinca}`;

    const htmlBody = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
          
          <!-- Encabezado / Banner Verde AgroGestión -->
          <tr>
            <td style="background: linear-gradient(135deg, #15803d 0%, #166534 100%); padding: 36px 30px; text-align: center;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <img src="https://www.appagrogestion.com/pwa-192x192.png" alt="AgroGestión" width="60" height="60" style="display: block; border-radius: 14px; margin-bottom: 12px; background: #ffffff; padding: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">AgroGestión</h1>
                    <p style="color: #bbf7d0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin: 6px 0 0 0;">¡Bienvenido(a) al Equipo!</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Cuerpo Principal -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; line-height: 1.3; margin: 0 0 14px 0;">
                Hola ${safeNombre ? `<strong>${safeNombre}</strong>` : 'compañero(a)'},
              </h2>
              
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                Has sido dado(a) de alta en <strong>AgroGestión</strong> con el perfil de <strong style="color: #166534;">${safeRol}</strong> para gestionar la labor en la(s) finca(s): <strong style="color: #0f172a;">${safeFincas}</strong>.
              </p>

              <!-- Tarjeta de Credenciales -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0;">
                      🔑 Tus datos para iniciar sesión
                    </p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding: 6px 0; font-size: 14px; color: #475569; width: 140px; font-weight: 600;">Correo:</td>
                        <td style="padding: 6px 0; font-size: 15px; color: #0f172a; font-weight: 700;">${safeEmail}</td>
                      </tr>
                      ${safePassword ? `<tr>
                        <td style="padding: 6px 0; font-size: 14px; color: #475569; font-weight: 600;">Contraseña temporal:</td>
                        <td style="padding: 6px 0; font-size: 15px; color: #16a34a; font-family: monospace; font-weight: 700; letter-spacing: 0.5px;">${safePassword}</td>
                      </tr>` : `<tr>
                        <td style="padding: 6px 0; font-size: 14px; color: #475569; font-weight: 600;">Contraseña:</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-style: italic;">La clave asignada por tu administrador</td>
                      </tr>`}
                      <tr>
                        <td style="padding: 6px 0; font-size: 14px; color: #475569; font-weight: 600;">Rol asignado:</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #334155;">${safeRol}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Botón Principal -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td align="center">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4);">
                          <a href="https://www.appagrogestion.com" target="_blank" style="font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; padding: 15px 36px; display: inline-block; border-radius: 10px; letter-spacing: 0.2px;">
                            🚀 Entrar a AgroGestión &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECCIÓN: CÓMO INSTALAR EN EL CELULAR (PWA) -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #166534; font-size: 16px; font-weight: 700; margin: 0 0 12px 0;">
                  📱 ¿Cómo instalar la App en tu Celular? (Fácil y Rápido)
                </p>
                <p style="color: #15803d; font-size: 13px; line-height: 1.5; margin: 0 0 14px 0;">
                  No necesitas descargarla desde la Play Store o App Store. AgroGestión funciona directamente como una aplicación web en tu pantalla de inicio:
                </p>

                <!-- Android -->
                <div style="background-color: #ffffff; border-radius: 8px; padding: 14px; margin-bottom: 12px; border-left: 4px solid #16a34a;">
                  <p style="color: #0f172a; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">
                    🤖 Si tu teléfono es Android (Google Chrome):
                  </p>
                  <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
                    <li>Abre el enlace <a href="https://www.appagrogestion.com" style="color: #15803d; font-weight: 600;">appagrogestion.com</a> en Chrome.</li>
                    <li>Toca los <strong>tres puntos (⋮)</strong> en la esquina superior derecha.</li>
                    <li>Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</li>
                  </ol>
                </div>

                <!-- iPhone -->
                <div style="background-color: #ffffff; border-radius: 8px; padding: 14px; border-left: 4px solid #0284c7;">
                  <p style="color: #0f172a; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">
                    🍏 Si tienes iPhone (Safari):
                  </p>
                  <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6;">
                    <li>Abre <a href="https://www.appagrogestion.com" style="color: #0284c7; font-weight: 600;">appagrogestion.com</a> en Safari.</li>
                    <li>Toca el botón <strong>Compartir</strong> (icono de un cuadro con una flecha hacia arriba ↑).</li>
                    <li>Desliza hacia abajo y pulsa <strong>"Agregar al inicio"</strong> (o <em>"Add to Home Screen"</em>), luego <strong>"Agregar"</strong>.</li>
                  </ol>
                </div>
              </div>

              <!-- TIP OFFLINE DE CAMPO -->
              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
                <p style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">
                  📶 Consejo clave para el trabajo sin señal en corral o manga:
                </p>
                <p style="color: #78350f; font-size: 13px; line-height: 1.5; margin: 0;">
                  Antes de salir al potrero o corral donde no hay cobertura celular, abre la aplicación en la casa con Wi-Fi o datos móviles. Esto carga la lista de animales y potreros en la memoria de tu teléfono para que puedas registrar pesajes, lluvias y movimientos <strong>completamente sin internet</strong>. Al volver a tener señal, se sincronizará automáticamente.
                </p>
              </div>

              <!-- ENLACE MANUAL DE USUARIO -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; text-align: center;">
                    <p style="color: #334155; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">
                      📖 ¿Deseas consultar el Manual de Usuario Oficial?
                    </p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 10px 0;">
                      Encuentra explicaciones paso a paso con capturas de pantalla de cada módulo.
                    </p>
                    <a href="https://www.appagrogestion.com/manual-de-usuario.pdf" target="_blank" style="color: #16a34a; font-size: 13px; font-weight: 700; text-decoration: underline;">
                      Descargar Manual de Usuario (PDF) &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Despedida -->
              <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0;">
                ¡Muchos éxitos en las labores de campo!<br>
                <strong>Equipo AgroGestión</strong> 🚜🌱
              </p>
            </td>
          </tr>

          <!-- Pie de Página -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 30px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0 0 4px 0;">
                AgroGestión — Sistema Integral de Gestión Ganadera &bull; <a href="https://www.appagrogestion.com" target="_blank" style="color: #16a34a; text-decoration: none; font-weight: 600;">www.appagrogestion.com</a>
              </p>
              <p style="color: #94a3b8; font-size: 11px; margin: 0;">
                Has recibido este mensaje porque un administrador te registró como colaborador en su finca.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textBody = [
      `¡BIENVENIDO(A) A AGROGESTIÓN!`,
      `=================================`,
      `Hola ${nombre ? nombre : ""},`,
      `Has sido vinculado(a) como ${rolNombre} para la(s) finca(s): ${fincasTexto}.`,
      ``,
      `TUS DATOS DE ACCESO:`,
      `- Enlace: https://www.appagrogestion.com`,
      `- Correo: ${email}`,
      password ? `- Contraseña temporal: ${password}` : `- Contraseña: La asignada por tu administrador`,
      ``,
      `CÓMO INSTALAR EN TU CELULAR:`,
      `1. Android: Abre appagrogestion.com en Chrome > Toca los 3 puntos (⋮) > Selecciona 'Instalar aplicación'.`,
      `2. iPhone: Abre appagrogestion.com en Safari > Botón Compartir > Selecciona 'Agregar al inicio'.`,
      ``,
      `TRABAJO SIN SEÑAL EN CORRAL:`,
      `Abre la aplicación con señal o Wi-Fi antes de salir al campo para cargar los animales en la memoria de tu teléfono. Podrás registrar pesajes y rotaciones sin señal y se sincronizarán al regresar.`,
      ``,
      `Manual de Usuario en PDF: https://www.appagrogestion.com/manual-de-usuario.pdf`,
    ].filter(Boolean).join("\n");

    // Despachar a través de Resend API
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AgroGestion <notificaciones@appagrogestion.com>",
        to: [email],
        subject: subject,
        html: htmlBody,
        text: textBody,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      throw new Error(`Resend API error ${resendRes.status}: ${JSON.stringify(resendData)}`);
    }

    console.log(`[notify-worker-invite] OK - Correo de bienvenida enviado a: ${email} (ID: ${resendData.id})`);

    return new Response(
      JSON.stringify({ success: true, email_id: resendData.id, message: `Correo de bienvenida enviado exitosamente a ${email}` }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, status: 200 }
    );
  } catch (err: any) {
    console.error("[notify-worker-invite] ERROR:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, status: 500 }
    );
  }
});
