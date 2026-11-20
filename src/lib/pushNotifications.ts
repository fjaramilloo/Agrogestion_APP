import { supabase } from './supabase';

export interface PushPreferences {
  enabled: boolean;
  daily_digest_enabled: boolean;
  realtime_events_enabled: boolean;
  notify_own_actions: boolean;
}

export interface DevicePushStatus {
  supported: boolean;
  isIos: boolean;
  isStandalone: boolean;
  needsIosHomeScreenInstall: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribedInBrowser: boolean;
  endpoint: string | null;
  preferences: PushPreferences;
}

const DEFAULT_PREFS: PushPreferences = {
  enabled: false,
  daily_digest_enabled: true,
  realtime_events_enabled: true,
  notify_own_actions: false,
};

const ENV_VAPID_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || isTouchMac;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

export function isPushSupportedInEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) {
    return null;
  }
  const timeoutPromise = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000));
  const ready = await Promise.race([navigator.serviceWorker.ready, timeoutPromise]);
  return ready || existing;
}

async function fetchVapidPublicKey(): Promise<string> {
  if (ENV_VAPID_KEY) return ENV_VAPID_KEY;
  const { data, error } = await supabase.rpc('get_web_push_public_key');
  if (error || typeof data !== 'string' || !data) {
    throw new Error('No se encontró la clave pública de notificaciones en el servidor.');
  }
  return data;
}

function extractSubscriptionKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const json = sub.toJSON();
  const p256dhFromJson = json.keys?.p256dh;
  const authFromJson = json.keys?.auth;
  if (p256dhFromJson && authFromJson) {
    return { p256dh: p256dhFromJson, auth: authFromJson };
  }
  const rawP256 = sub.getKey('p256dh');
  const rawAuth = sub.getKey('auth');
  if (!rawP256 || !rawAuth) {
    throw new Error('El navegador no entregó las llaves de cifrado Push.');
  }
  return {
    p256dh: arrayBufferToBase64Url(rawP256),
    auth: arrayBufferToBase64Url(rawAuth),
  };
}

export async function getDevicePushStatus(userId?: string | null): Promise<DevicePushStatus> {
  const isIos = isIosDevice();
  const isStandalone = isStandalonePwa();
  const needsIosHomeScreenInstall = isIos && !isStandalone;
  const supported = isPushSupportedInEnvironment();
  const permission: NotificationPermission | 'unsupported' =
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';

  if (!supported || !userId) {
    return {
      supported,
      isIos,
      isStandalone,
      needsIosHomeScreenInstall,
      permission,
      subscribedInBrowser: false,
      endpoint: null,
      preferences: { ...DEFAULT_PREFS },
    };
  }

  try {
    const reg = await getReadyServiceWorkerRegistration();
    const browserSub = reg ? await reg.pushManager.getSubscription() : null;
    if (!browserSub) {
      return {
        supported,
        isIos,
        isStandalone,
        needsIosHomeScreenInstall,
        permission,
        subscribedInBrowser: false,
        endpoint: null,
        preferences: { ...DEFAULT_PREFS },
      };
    }

    const { data: row } = await supabase
      .from('push_subscriptions')
      .select('enabled, daily_digest_enabled, realtime_events_enabled, notify_own_actions')
      .eq('user_id', userId)
      .eq('endpoint', browserSub.endpoint)
      .maybeSingle();

    return {
      supported,
      isIos,
      isStandalone,
      needsIosHomeScreenInstall,
      permission,
      subscribedInBrowser: true,
      endpoint: browserSub.endpoint,
      preferences: row
        ? {
            enabled: Boolean(row.enabled) && permission === 'granted',
            daily_digest_enabled: Boolean(row.daily_digest_enabled),
            realtime_events_enabled: Boolean(row.realtime_events_enabled),
            notify_own_actions: Boolean(row.notify_own_actions),
          }
        : { ...DEFAULT_PREFS },
    };
  } catch {
    return {
      supported,
      isIos,
      isStandalone,
      needsIosHomeScreenInstall,
      permission,
      subscribedInBrowser: false,
      endpoint: null,
      preferences: { ...DEFAULT_PREFS },
    };
  }
}

/** Solicita permiso inmediatamente (dentro del clic) y registra el celular en Supabase. */
export async function enablePushOnThisDevice(
  prefs: Partial<Omit<PushPreferences, 'enabled'>> = {}
): Promise<DevicePushStatus> {
  if (!isPushSupportedInEnvironment()) {
    throw new Error('Este navegador no soporta notificaciones push web.');
  }

  // Solicitar permiso SIN esperas de red previas para mantener la activación del usuario
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Permiso bloqueado en el navegador. Actívalo desde los ajustes del sitio.'
        : 'No se concedió el permiso para mostrar notificaciones.'
    );
  }

  if (!navigator.onLine) {
    throw new Error('Conéctate a internet para registrar este celular en las alertas.');
  }

  const reg = await getReadyServiceWorkerRegistration();
  if (!reg) {
    throw new Error('El Service Worker aún no está listo. Recarga la app e intenta de nuevo.');
  }

  const vapidPublicKey = await fetchVapidPublicKey();
  const appServerKey = urlBase64ToUint8Array(vapidPublicKey);

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Verificar si la suscripción existente corresponde a nuestra clave VAPID actual
    const existingServerKey = sub.options?.applicationServerKey;
    if (existingServerKey) {
      const existingB64 = arrayBufferToBase64Url(existingServerKey);
      if (existingB64 !== vapidPublicKey) {
        await sub.unsubscribe().catch(() => undefined);
        sub = null;
      }
    }
  }

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  }

  const { p256dh, auth } = extractSubscriptionKeys(sub);
  const daily = prefs.daily_digest_enabled ?? true;
  const realtime = prefs.realtime_events_enabled ?? true;
  const own = prefs.notify_own_actions ?? false;

  const { data: savedRow, error } = await supabase.rpc('upsert_my_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
    p_enabled: true,
    p_daily_digest_enabled: daily,
    p_realtime_events_enabled: realtime,
    p_notify_own_actions: own,
  });

  if (error) {
    throw new Error(error.message || 'No se pudo guardar la suscripción en el servidor.');
  }

  return {
    supported: true,
    isIos: isIosDevice(),
    isStandalone: isStandalonePwa(),
    needsIosHomeScreenInstall: false,
    permission,
    subscribedInBrowser: true,
    endpoint: sub.endpoint,
    preferences: {
      enabled: Boolean(savedRow?.enabled ?? true),
      daily_digest_enabled: Boolean(savedRow?.daily_digest_enabled ?? daily),
      realtime_events_enabled: Boolean(savedRow?.realtime_events_enabled ?? realtime),
      notify_own_actions: Boolean(savedRow?.notify_own_actions ?? own),
    },
  };
}

export async function updateDevicePushPreferences(
  endpoint: string,
  nextPrefs: PushPreferences
): Promise<void> {
  if (!navigator.onLine) {
    throw new Error('Necesitas conexión para actualizar las preferencias de notificaciones.');
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .update({
      enabled: nextPrefs.enabled,
      daily_digest_enabled: nextPrefs.daily_digest_enabled,
      realtime_events_enabled: nextPrefs.realtime_events_enabled,
      notify_own_actions: nextPrefs.notify_own_actions,
      last_seen_at: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    })
    .eq('endpoint', endpoint);

  if (error) {
    throw new Error(error.message || 'Error guardando preferencias de notificación.');
  }
}

export async function disablePushOnThisDevice(endpoint: string | null): Promise<void> {
  if (endpoint && navigator.onLine) {
    await supabase
      .from('push_subscriptions')
      .update({
        enabled: false,
        actualizado_en: new Date().toISOString(),
      })
      .eq('endpoint', endpoint);
  }
}

export async function sendTestPushNotification(endpoint?: string | null): Promise<{ sent: number; lastError?: string }> {
  if (!navigator.onLine) {
    throw new Error('Conéctate a internet para enviar la notificación de prueba.');
  }
  const { data, error } = await supabase.functions.invoke('send-push-notifications', {
    body: { action: 'test', endpoint: endpoint || undefined },
  });
  if (error) {
    throw new Error(error.message || 'No se pudo enviar la notificación de prueba.');
  }
  if (!data?.ok) {
    throw new Error(data?.lastError || data?.error || 'El servicio push rechazó el envío de prueba.');
  }
  return { sent: Number(data.sent || 1), lastError: data.lastError };
}

/** Sincroniza silenciosamente una suscripción ya concedida cuando arranca la sesión PWA. */
export async function syncExistingPushSubscription(userId: string): Promise<void> {
  if (
    !userId ||
    typeof window === 'undefined' ||
    !navigator.onLine ||
    !isPushSupportedInEnvironment() ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  try {
    const reg = await getReadyServiceWorkerRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;

    const { data: row } = await supabase
      .from('push_subscriptions')
      .select('id, enabled, p256dh, auth')
      .eq('user_id', userId)
      .eq('endpoint', sub.endpoint)
      .maybeSingle();

    if (!row) return;

    const { p256dh, auth } = extractSubscriptionKeys(sub);
    if (row.p256dh !== p256dh || row.auth !== auth) {
      await supabase
        .from('push_subscriptions')
        .update({ p256dh, auth, last_seen_at: new Date().toISOString(), actualizado_en: new Date().toISOString() })
        .eq('id', row.id);
    } else {
      await supabase
        .from('push_subscriptions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', row.id);
    }
  } catch {
    // Sincronización silenciosa en segundo plano: no interrumpir arranque
  }
}
