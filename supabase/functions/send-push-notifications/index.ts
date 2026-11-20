// @ts-nocheck
// supabase/functions/send-push-notifications/index.ts
// Edge Function para Web Push PWA: pruebas, eventos en tiempo real y barrido diario (6:30 a.m. CO)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendWebPushNotification, type VapidConfig } from "./webpush.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-push-secret, x-client-info, apikey",
};

const BOGOTA_TZ = "America/Bogota";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getBogotaDateStr(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDateShortEs(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const mes = meses[Math.max(0, Number(m) - 1)] || m;
  return `${Number(d)} ${mes}`;
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("es-CO");
}

function differenceInDaysDate(dateA: Date, dateB: Date): number {
  const utcA = Date.UTC(dateA.getUTCFullYear(), dateA.getUTCMonth(), dateA.getUTCDate());
  const utcB = Date.UTC(dateB.getUTCFullYear(), dateB.getUTCMonth(), dateB.getUTCDate());
  return Math.floor((utcA - utcB) / 86_400_000);
}

async function loadRuntimeConfig(adminClient: any): Promise<{
  vapid: VapidConfig;
  internalCronSecret: string;
}> {
  const { data, error } = await adminClient.rpc("get_push_runtime_config_internal");
  if (error || !data) {
    throw new Error("No se pudo cargar la configuración VAPID en Supabase");
  }
  const map = new Map<string, string>();
  for (const row of data) {
    if (row?.key && row?.value) map.set(row.key, row.value);
  }
  const publicKey = map.get("vapid_public_key") || "";
  const privateJwkJson = map.get("vapid_private_key") || "";
  const subject = map.get("vapid_subject") || "mailto:soporte@appagrogestion.com";
  const internalCronSecret = map.get("internal_cron_secret") || "";

  if (!publicKey || !privateJwkJson || !internalCronSecret) {
    throw new Error("Faltan claves VAPID o secret interno en private.push_runtime_secrets");
  }

  return {
    vapid: { publicKey, privateJwkJson, subject },
    internalCronSecret,
  };
}

async function sendToSubscriptions(
  adminClient: any,
  subs: any[],
  payload: Record<string, unknown>,
  vapid: VapidConfig,
  urgency: "normal" | "high" = "high"
): Promise<{ sent: number; failed: number; removedGone: number; lastError?: string }> {
  let sent = 0;
  let failed = 0;
  let removedGone = 0;
  let lastError: string | undefined;

  const goneIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const res = await sendWebPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          vapid,
          { urgency }
        );
        if (res.ok) {
          sent++;
        } else {
          failed++;
          lastError = res.error;
          if (res.gone && sub.id) {
            goneIds.push(sub.id);
          }
        }
      } catch (err) {
        failed++;
        lastError = err instanceof Error ? err.message : String(err);
      }
    })
  );

  if (goneIds.length > 0) {
    removedGone = goneIds.length;
    await adminClient.from("push_subscriptions").delete().in("id", goneIds);
  }

  return { sent, failed, removedGone, lastError };
}

/** Obtiene mapa userId -> Set<'administrador' | 'vaquero' | 'observador'> para una lista de fincas */
async function getFarmRecipientsByFarm(
  adminClient: any,
  fincaIds: string[]
): Promise<{
  fincaInfoMap: Map<string, { id: string; nombre: string; orgId: string; licencia: string; fechaVenc: string | null }>;
  rolesByFarm: Map<string, Map<string, string>>;
}> {
  const fincaInfoMap = new Map();
  const rolesByFarm = new Map<string, Map<string, string>>();
  if (fincaIds.length === 0) return { fincaInfoMap, rolesByFarm };

  const [{ data: fincas }, { data: permisos }] = await Promise.all([
    adminClient
      .from("fincas")
      .select("id, nombre, id_organizacion, organizaciones(id, nombre, id_dueño, licencia, fecha_vencimiento_licencia)")
      .in("id", fincaIds),
    adminClient
      .from("permisos_finca")
      .select("id_finca, id_usuario, rol")
      .in("id_finca", fincaIds),
  ]);

  for (const f of fincas || []) {
    const org = f.organizaciones || {};
    fincaInfoMap.set(f.id, {
      id: f.id,
      nombre: f.nombre || "Finca",
      orgId: f.id_organizacion,
      licencia: org.licencia || "demo",
      fechaVenc: org.fecha_vencimiento_licencia || null,
    });
    const map = new Map<string, string>();
    const ownerId = org["id_dueño"];
    if (ownerId) {
      map.set(ownerId, "administrador");
    }
    rolesByFarm.set(f.id, map);
  }

  for (const p of permisos || []) {
    const map = rolesByFarm.get(p.id_finca);
    if (!map) continue;
    // Conservar rol administrador si el dueño también tiene fila
    if (map.get(p.id_usuario) !== "administrador") {
      map.set(p.id_usuario, p.rol);
    }
  }

  return { fincaInfoMap, rolesByFarm };
}

async function handleTestPush(
  adminClient: any,
  req: Request,
  body: any,
  vapid: VapidConfig
): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "No autenticado" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Sesión inválida" }, 401);
  }

  const userId = userData.user.id;
  let query = adminClient
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (body?.endpoint) {
    query = query.eq("endpoint", body.endpoint);
  }

  const { data: subs, error: subErr } = await query;
  if (subErr) throw subErr;
  if (!subs || subs.length === 0) {
    return jsonResponse({ error: "No hay suscripción activa para este dispositivo." }, 404);
  }

  const res = await sendToSubscriptions(
    adminClient,
    subs,
    {
      title: "AgroGestión · Prueba exitosa",
      body: "Las alertas llegarán así a este celular incluso con la app cerrada.",
      url: "/configuracion",
      tag: `agrogestion-test-${Date.now()}`,
    },
    vapid,
    "high"
  );

  return jsonResponse({ ok: res.sent > 0, ...res });
}

async function handleProcessQueue(adminClient: any, vapid: VapidConfig): Promise<Response> {
  const nowIso = new Date().toISOString();
  const { data: candidates, error: qErr } = await adminClient
    .from("push_event_queue")
    .select("*")
    .eq("status", "pending")
    .lte("ready_at", nowIso)
    .order("ready_at", { ascending: true })
    .limit(25);

  if (qErr) throw qErr;
  if (!candidates || candidates.length === 0) {
    return jsonResponse({ processed: 0 });
  }

  // Reclamar atómicamente fila por fila para evitar duplicados en concurrencia
  const claimed: any[] = [];
  for (const row of candidates) {
    const { data: upd } = await adminClient
      .from("push_event_queue")
      .update({ status: "processing", attempts: (row.attempts || 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (upd) claimed.push(upd);
  }

  if (claimed.length === 0) {
    return jsonResponse({ processed: 0 });
  }

  const fincaIds = [...new Set(claimed.map((e) => e.id_finca))];
  const { fincaInfoMap, rolesByFarm } = await getFarmRecipientsByFarm(adminClient, fincaIds);

  const userIdsSet = new Set<string>();
  for (const fId of fincaIds) {
    const map = rolesByFarm.get(fId);
    if (map) {
      for (const uid of map.keys()) userIdsSet.add(uid);
    }
  }

  const allUserIds = [...userIdsSet];
  let subsByUser = new Map<string, any[]>();
  if (allUserIds.length > 0) {
    const { data: subs } = await adminClient
      .from("push_subscriptions")
      .select("*")
      .in("user_id", allUserIds)
      .eq("enabled", true)
      .eq("realtime_events_enabled", true);

    for (const s of subs || []) {
      const list = subsByUser.get(s.user_id) || [];
      list.push(s);
      subsByUser.set(s.user_id, list);
    }
  }

  let totalSent = 0;
  let totalEvents = 0;

  for (const evt of claimed) {
    try {
      const finca = fincaInfoMap.get(evt.id_finca);
      const fincaName = finca?.nombre || "Finca";
      const farmRoles = rolesByFarm.get(evt.id_finca) || new Map<string, string>();

      let notif: {
        title: string;
        body: string;
        url: string;
        tag: string;
        roles: string[];
      } | null = null;

      if (evt.event_type === "lluvia") {
        const [{ data: lluvias }, { data: pluvs }] = await Promise.all([
          adminClient
            .from("registros_lluvia")
            .select("id, milimetros, id_pluviometro, notas")
            .eq("id_finca", evt.id_finca)
            .eq("fecha", evt.event_date),
          adminClient
            .from("pluviometros_finca")
            .select("id, nombre")
            .eq("id_finca", evt.id_finca),
        ]);

        if (lluvias && lluvias.length > 0) {
          const pluvMap = new Map<string, string>((pluvs || []).map((p: any) => [p.id, p.nombre]));
          const totalMm = lluvias.reduce((acc: number, r: any) => acc + (Number(r.milimetros) || 0), 0);
          const promMm = totalMm / lluvias.length;
          const hoyCo = getBogotaDateStr(0);
          const fechaEtiqueta = evt.event_date === hoyCo ? "hoy" : formatDateShortEs(evt.event_date);

          let detalleEstaciones = "";
          if (lluvias.length === 1 && lluvias[0].id_pluviometro && pluvMap.has(lluvias[0].id_pluviometro)) {
            detalleEstaciones = ` (${pluvMap.get(lluvias[0].id_pluviometro)})`;
          } else if (lluvias.length > 1) {
            const lista = lluvias
              .slice(0, 3)
              .map((r: any) => `${pluvMap.get(r.id_pluviometro) || "Estación"}: ${Number(r.milimetros).toFixed(1)} mm`)
              .join(", ");
            detalleEstaciones = ` · ${lista}${lluvias.length > 3 ? ` (+${lluvias.length - 3})` : ""}`;
          }

          notif = {
            title: `🌧️ Reporte de lluvias (${fechaEtiqueta}) · ${fincaName}`,
            body: `${lluvias.length > 1 ? "Promedio" : "Registro"}: ${Number(promMm.toFixed(1))} mm${detalleEstaciones}.`,
            url: "/lluvias",
            tag: `lluvia-${evt.id_finca}-${evt.event_date}`,
            roles: ["administrador", "vaquero", "observador"],
          };
        }
      } else if (evt.event_type === "compra") {
        const animalIds: string[] = Array.isArray(evt.payload?.animal_ids) ? evt.payload.animal_ids : [];
        let count = evt.item_count || 1;
        let sumPeso = 0;
        let prov = evt.payload?.proveedor || "Proveedor";

        if (animalIds.length > 0) {
          const { data: animals } = await adminClient
            .from("animales")
            .select("id, peso_ingreso, proveedor_compra")
            .in("id", animalIds.slice(0, 500));
          if (animals && animals.length > 0) {
            count = Math.max(count, animals.length);
            sumPeso = animals.reduce((acc: number, a: any) => acc + (Number(a.peso_ingreso) || 0), 0);
            prov = animals[0].proveedor_compra || prov;
          }
        }

        const promKg = count > 0 && sumPeso > 0 ? Math.round(sumPeso / Math.min(count, animalIds.length || count)) : 0;
        notif = {
          title: `🛒 Nueva compra · ${fincaName}`,
          body: `${count} ${count === 1 ? "animal ingresado" : "animales ingresados"}${promKg > 0 ? ` (prom. ${promKg} kg)` : ""} · Prov: ${prov}.`,
          url: "/historial-compras",
          tag: `compra-${evt.id_finca}-${evt.event_date}`,
          roles: ["administrador", "vaquero", "observador"],
        };
      } else if (evt.event_type === "venta") {
        const animalIds: string[] = Array.isArray(evt.payload?.animal_ids) ? evt.payload.animal_ids : [];
        let count = evt.item_count || 1;
        let sumPeso = 0;
        let comp = evt.payload?.comprador || "Comprador";

        if (animalIds.length > 0) {
          const { data: sold } = await adminClient
            .from("animales")
            .select("id, peso_venta, comprador_venta")
            .in("id", animalIds.slice(0, 500))
            .eq("estado", "vendido");
          if (sold && sold.length > 0) {
            count = Math.max(count, sold.length);
            sumPeso = sold.reduce((acc: number, a: any) => acc + (Number(a.peso_venta) || 0), 0);
            comp = sold[0].comprador_venta || comp;
          }
        }

        const promKg = count > 0 && sumPeso > 0 ? Math.round(sumPeso / Math.min(count, animalIds.length || count)) : 0;
        notif = {
          title: `💰 Venta registrada · ${fincaName}`,
          body: `${count} ${count === 1 ? "animal vendido" : "animales vendidos"}${sumPeso > 0 ? ` (${formatNumber(sumPeso)} kg, prom. ${promKg} kg)` : ""} · ${comp}.`,
          url: "/historial-ventas",
          tag: `venta-${evt.id_finca}-${evt.event_date}`,
          roles: ["administrador", "observador"],
        };
      } else if (evt.event_type === "pesaje") {
        const pesajeIds: string[] = Array.isArray(evt.payload?.pesaje_ids) ? evt.payload.pesaje_ids : [];
        if (pesajeIds.length > 0) {
          const { data: rows } = await adminClient
            .from("registros_pesaje")
            .select("id, peso, fecha, gdp_calculada, is_deleted, animales!inner(id, estado, fecha_venta)")
            .in("id", pesajeIds.slice(0, 1000));

          // Excluir pesajes marcados como deleted o pertenecientes al cierre de una venta en el mismo día
          const validRows = (rows || []).filter(
            (r: any) =>
              r.is_deleted !== true &&
              !(r.animales?.estado === "vendido" && r.animales?.fecha_venta === r.fecha)
          );

          if (validRows.length > 0) {
            const count = validRows.length;
            const totalPeso = validRows.reduce((acc: number, r: any) => acc + (Number(r.peso) || 0), 0);
            const promKg = Math.round(totalPeso / count);
            const bajas = validRows.filter((r: any) => r.gdp_calculada !== null && Number(r.gdp_calculada) < 0).length;
            const detalleBaja = bajas > 0 ? ` · ⚠️ ${bajas} con pérdida` : "";

            notif = {
              title: `⚖️ Jornada de pesaje · ${fincaName}`,
              body: `${count} ${count === 1 ? "animal pesado" : "animales pesados"} · Promedio: ${promKg} kg${detalleBaja}.`,
              url: "/inventario",
              tag: `pesaje-${evt.id_finca}-${evt.event_date}`,
              roles: ["administrador", "vaquero", "observador"],
            };
          }
        }
      }

      if (notif) {
        const targetSubs: any[] = [];
        for (const [uid, rol] of farmRoles.entries()) {
          if (!notif.roles.includes(rol)) continue;
          const userSubs = subsByUser.get(uid) || [];
          for (const sub of userSubs) {
            if (evt.actor_user_id && uid === evt.actor_user_id && !sub.notify_own_actions) {
              continue;
            }
            targetSubs.push(sub);
          }
        }

        if (targetSubs.length > 0) {
          const sendRes = await sendToSubscriptions(
            adminClient,
            targetSubs,
            {
              title: notif.title,
              body: notif.body,
              url: notif.url,
              tag: notif.tag,
            },
            vapid,
            "high"
          );
          totalSent += sendRes.sent;
        }
      }

      await adminClient
        .from("push_event_queue")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", evt.id);
      totalEvents++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await adminClient
        .from("push_event_queue")
        .update({ status: "failed", last_error: msg })
        .eq("id", evt.id);
    }
  }

  return jsonResponse({ processed: totalEvents, sent: totalSent });
}

async function handleDailyDigest(adminClient: any, vapid: VapidConfig): Promise<Response> {
  const hoyBogota = getBogotaDateStr(0);
  const ayerBogota = getBogotaDateStr(-1);
  const hoyDate = new Date(`${hoyBogota}T12:00:00Z`);

  // Limpieza periódica de logs antiguos para mantener tablas livianas
  const cutoffQueue = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const cutoffDelivery = getBogotaDateStr(-30);
  await Promise.all([
    adminClient.from("push_event_queue").delete().in("status", ["sent", "failed"]).lt("last_event_at", cutoffQueue),
    adminClient.from("push_delivery_log").delete().lt("delivery_date", cutoffDelivery),
  ]);

  const { data: activeSubs, error: subErr } = await adminClient
    .from("push_subscriptions")
    .select("*")
    .eq("enabled", true)
    .eq("daily_digest_enabled", true);

  if (subErr) throw subErr;
  if (!activeSubs || activeSubs.length === 0) {
    return jsonResponse({ sent: 0, skipped: "no_subscribers" });
  }

  const userIds = [...new Set(activeSubs.map((s: any) => s.user_id))];
  const subsByUser = new Map<string, any[]>();
  for (const s of activeSubs) {
    const arr = subsByUser.get(s.user_id) || [];
    arr.push(s);
    subsByUser.set(s.user_id, arr);
  }

  // Determinar todas las fincas a las que pertenecen estos usuarios
  const [{ data: ownerOrgs }, { data: userPerms }] = await Promise.all([
    adminClient.from("organizaciones").select("id, id_dueño").in("id_dueño", userIds),
    adminClient.from("permisos_finca").select("id_finca, id_usuario").in("id_usuario", userIds),
  ]);

  const ownerOrgIds = (ownerOrgs || []).map((o: any) => o.id);
  let ownerFincaIds: string[] = [];
  if (ownerOrgIds.length > 0) {
    const { data: orgFincas } = await adminClient
      .from("fincas")
      .select("id")
      .in("id_organizacion", ownerOrgIds);
    ownerFincaIds = (orgFincas || []).map((f: any) => f.id);
  }

  const fincaIds = [...new Set([...ownerFincaIds, ...(userPerms || []).map((p: any) => p.id_finca)])];
  if (fincaIds.length === 0) {
    return jsonResponse({ sent: 0, skipped: "no_farms" });
  }

  const { fincaInfoMap, rolesByFarm } = await getFarmRecipientsByFarm(adminClient, fincaIds);

  // Consultar datos consolidados en paralelo para evaluar todas las alertas
  const veinteDiasAtras = new Date(hoyDate.getTime() - 20 * 86_400_000).toISOString().slice(0, 10);
  const cuarentaY8HorasAtras = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const [
    { data: configs },
    { data: animals },
    { data: movimientosActivos },
    { data: lluviasAyer },
    { data: climasRecientes },
  ] = await Promise.all([
    adminClient.from("configuracion_kpi").select("id_finca, corte_peso_3").in("id_finca", fincaIds),
    adminClient
      .from("animales")
      .select("id, id_finca, fecha_ingreso, peso_ingreso, peso_compra, id_potrerada, registros_pesaje(peso, fecha, gmp_calculada, is_deleted)")
      .in("id_finca", fincaIds)
      .eq("estado", "activo")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("fecha", { foreignTable: "registros_pesaje", ascending: false }),
    adminClient
      .from("movimientos_potreros")
      .select("id, id_potrero, id_potrerada, id_finca, fecha_entrada, potreradas(id, nombre), potreros(nombre, dias_ocupacion_base, id_rotacion, rotaciones(nombre, potreros(id)))")
      .in("id_finca", fincaIds)
      .is("fecha_salida", null),
    adminClient
      .from("registros_lluvia")
      .select("id_finca, milimetros")
      .in("id_finca", fincaIds)
      .eq("fecha", ayerBogota),
    adminClient
      .from("analisis_climatico_finca")
      .select("id_finca, nivel_alerta, estado_hidrico, emoji_estado, fecha_analisis")
      .in("id_finca", fincaIds)
      .gte("fecha_analisis", cuarentaY8HorasAtras)
      .order("fecha_analisis", { ascending: false }),
  ]);

  const potreroIds = [...new Set((movimientosActivos || []).map((m: any) => m.id_potrero).filter(Boolean))];
  const aforosMap = new Map<string, { dias_pastoreo_estimados: number; fecha: string }>();
  if (potreroIds.length > 0) {
    const { data: aforos } = await adminClient
      .from("registros_aforo")
      .select("id_potrero, dias_pastoreo_estimados, fecha")
      .in("id_potrero", potreroIds)
      .gte("fecha", veinteDiasAtras)
      .order("fecha", { ascending: false });
    for (const af of aforos || []) {
      if (!aforosMap.has(af.id_potrero)) {
        aforosMap.set(af.id_potrero, af);
      }
    }
  }

  const corteVentaMap = new Map<string, number>();
  for (const c of configs || []) {
    corteVentaMap.set(c.id_finca, Number(c.corte_peso_3) || 530);
  }

  const lluviasPorFinca = new Map<string, number[]>();
  for (const l of lluviasAyer || []) {
    const list = lluviasPorFinca.get(l.id_finca) || [];
    list.push(Number(l.milimetros) || 0);
    lluviasPorFinca.set(l.id_finca, list);
  }

  const climaPorFinca = new Map<string, any>();
  for (const cl of climasRecientes || []) {
    if (!climaPorFinca.has(cl.id_finca)) {
      climaPorFinca.set(cl.id_finca, cl);
    }
  }

  interface AlertItem {
    line: string;
    target: string;
    roles: string[];
  }

  let totalSent = 0;

  for (const fId of fincaIds) {
    const finca = fincaInfoMap.get(fId);
    if (!finca) continue;
    const alerts: AlertItem[] = [];
    const fincaAnimals = (animals || []).filter((a: any) => a.id_finca === fId);

    // 1. Cambios de potrero necesarios
    const movs = (movimientosActivos || []).filter((m: any) => m.id_finca === fId);
    let cambiosPotreroCount = 0;
    let primerCambioTxt = "";
    for (const m of movs) {
      const pot = m.potreros;
      const numPots = pot?.rotaciones?.potreros?.length || 0;
      if (numPots <= 1 || !m.fecha_entrada) continue;
      const diasEnPot = differenceInDaysDate(hoyDate, new Date(`${m.fecha_entrada}T12:00:00Z`));
      const aforo = aforosMap.get(m.id_potrero);
      const diasBase = pot?.dias_ocupacion_base || 28;
      const limite = aforo ? Math.floor(Number(aforo.dias_pastoreo_estimados) || diasBase) : diasBase;
      if (diasEnPot >= limite) {
        cambiosPotreroCount++;
        if (!primerCambioTxt) {
          primerCambioTxt = `${m.potreradas?.nombre || "Lote"} (${pot?.nombre || "Potrero"}, ${diasEnPot}/${limite}d)`;
        }
      }
    }
    if (cambiosPotreroCount > 0) {
      alerts.push({
        line:
          cambiosPotreroCount === 1
            ? `Cambio de potrero: ${primerCambioTxt}`
            : `${cambiosPotreroCount} lotes para cambio de potrero`,
        target: "/potreradas",
        roles: ["administrador", "vaquero"],
      });
    }

    // 2. Pesajes vencidos (> 90 días)
    const vencidosCount = fincaAnimals.filter((a: any) => {
      const regs = (a.registros_pesaje || []).filter((r: any) => r.is_deleted !== true);
      const refStr = regs.length > 0 ? regs[0].fecha : a.fecha_ingreso;
      if (!refStr) return false;
      return differenceInDaysDate(hoyDate, new Date(`${refStr}T12:00:00Z`)) > 90;
    }).length;
    if (vencidosCount > 0) {
      alerts.push({
        line: `${vencidosCount} animales con pesaje > 90 días`,
        target: "/inventario",
        roles: ["administrador", "vaquero"],
      });
    }

    // 3. Pérdida de peso en último control
    const conPerdidaCount = fincaAnimals.filter((a: any) => {
      const regs = (a.registros_pesaje || []).filter((r: any) => r.is_deleted !== true);
      return regs.length >= 2 && Number(regs[0].peso) < Number(regs[1].peso);
    }).length;
    if (conPerdidaCount > 0) {
      alerts.push({
        line: `Salud: ${conPerdidaCount} animales perdieron peso`,
        target: "/inventario",
        roles: ["administrador"],
      });
    }

    // 4. Lotes listos para despacho
    const lotesMap = new Map<string, number[]>();
    for (const a of fincaAnimals) {
      if (!a.id_potrerada) continue;
      const regs = (a.registros_pesaje || []).filter((r: any) => r.is_deleted !== true);
      const ult = regs[0];
      const pesoRef = Number(ult ? ult.peso : a.peso_compra ?? a.peso_ingreso) || 0;
      const fechaRef = ult?.fecha || a.fecha_ingreso;
      if (!fechaRef || pesoRef <= 0) continue;
      const dias = Math.max(0, differenceInDaysDate(hoyDate, new Date(`${fechaRef}T12:00:00Z`)));
      const gmp = ult?.gmp_calculada !== null && ult?.gmp_calculada !== undefined ? Number(ult.gmp_calculada) : 10.3;
      const est = pesoRef + dias * (gmp / 30);
      const arr = lotesMap.get(a.id_potrerada) || [];
      arr.push(est);
      lotesMap.set(a.id_potrerada, arr);
    }
    const metaKg = corteVentaMap.get(fId) || 530;
    let lotesListos = 0;
    for (const pesos of lotesMap.values()) {
      const avg = pesos.reduce((acc, x) => acc + x, 0) / pesos.length;
      if (avg >= metaKg) lotesListos++;
    }
    if (lotesListos > 0) {
      alerts.push({
        line: `${lotesListos} lote${lotesListos > 1 ? "s" : ""} listos para despacho (>= ${metaKg} kg)`,
        target: "/potreradas",
        roles: ["administrador", "observador"],
      });
    }

    // 5. Lluvias y alerta hídrica
    const mmAyer = lluviasPorFinca.get(fId) || [];
    const totalMmAyer = mmAyer.reduce((acc, v) => acc + v, 0);
    const clima = climaPorFinca.get(fId);
    const nivelAlerta = clima?.nivel_alerta;
    const climaCritico = ["estres", "excesoCritico", "preAlerta", "excesoPreventivo"].includes(nivelAlerta);

    if (totalMmAyer > 0) {
      const avgAyer = totalMmAyer / mmAyer.length;
      alerts.push({
        line: `Lluvia ayer: ${Number(avgAyer.toFixed(1))} mm${climaCritico ? ` (${clima.estado_hidrico})` : ""}`,
        target: "/lluvias",
        roles: ["administrador", "vaquero", "observador"],
      });
    } else if (climaCritico) {
      alerts.push({
        line: `Alerta hídrica: ${clima.estado_hidrico}`,
        target: "/lluvias",
        roles: ["administrador", "vaquero", "observador"],
      });
    }

    // 6. Vencimiento de suscripción
    if (finca.licencia !== "demo" && finca.fechaVenc) {
      const diasRest = differenceInDaysDate(new Date(finca.fechaVenc), hoyDate);
      if (diasRest <= 8) {
        alerts.push({
          line:
            diasRest < 0
              ? `Suscripción ${finca.licencia.toUpperCase()} expirada`
              : diasRest === 0
              ? `¡Tu suscripción ${finca.licencia.toUpperCase()} vence hoy!`
              : `Suscripción vence en ${diasRest} día${diasRest === 1 ? "" : "s"}`,
          target: "/suscripcion",
          roles: ["administrador"],
        });
      }
    }

    if (alerts.length === 0) continue;

    const farmRoles = rolesByFarm.get(fId) || new Map<string, string>();
    for (const [uid, rol] of farmRoles.entries()) {
      const userSubs = subsByUser.get(uid) || [];
      if (userSubs.length === 0) continue;

      const visibleAlerts = alerts.filter((a) => a.roles.includes(rol));
      if (visibleAlerts.length === 0) continue;

      const alertKey = `daily:${uid}:${fId}`;
      const { error: logErr } = await adminClient
        .from("push_delivery_log")
        .insert({ alert_key: alertKey, delivery_date: hoyBogota, id_finca: fId });

      // Si ya se envió hoy (constraint unique 23505), no duplicar
      if (logErr) continue;

      const title =
        visibleAlerts.length === 1
          ? `${finca.nombre} · Resumen 6:30 a.m.`
          : `☀️ ${finca.nombre} · ${visibleAlerts.length} alertas del día`;
      const bodyText =
        visibleAlerts.length === 1
          ? visibleAlerts[0].line
          : visibleAlerts.slice(0, 4).map((a) => `• ${a.line}`).join("\n");

      const sendRes = await sendToSubscriptions(
        adminClient,
        userSubs,
        {
          title,
          body: bodyText,
          url: visibleAlerts[0].target,
          tag: `daily-${fId}-${hoyBogota}`,
        },
        vapid,
        "normal"
      );
      if (sendRes.sent === 0) {
        await adminClient
          .from("push_delivery_log")
          .delete()
          .eq("alert_key", alertKey)
          .eq("delivery_date", hoyBogota);
      }
      totalSent += sendRes.sent;
    }
  }

  return jsonResponse({ date: hoyBogota, sent: totalSent });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Variables del servidor Supabase incompletas" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { vapid, internalCronSecret } = await loadRuntimeConfig(adminClient);

    const body = await req.json().catch(() => ({}));
    const action = body?.action || "process-queue";

    if (action === "test") {
      return await handleTestPush(adminClient, req, body, vapid);
    }

    const receivedSecret = req.headers.get("x-push-secret") ?? "";
    if (!timingSafeEqualStr(receivedSecret, internalCronSecret)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (action === "daily-digest") {
      return await handleDailyDigest(adminClient, vapid);
    }
    if (action === "process-queue") {
      return await handleProcessQueue(adminClient, vapid);
    }

    return jsonResponse({ error: `Acción desconocida: ${action}` }, 400);
  } catch (err) {
    console.error("[send-push-notifications] Error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Error interno" },
      500
    );
  }
});
