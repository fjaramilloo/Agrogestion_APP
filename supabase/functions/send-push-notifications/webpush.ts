// @ts-nocheck
// Implementación nativa WebCrypto de Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID ES256)
// Cero dependencias npm externas para máxima estabilidad en Supabase Edge Runtime (Deno).

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidConfig {
  publicKey: string;
  privateJwkJson: string;
  subject: string;
}

const textEncoder = new TextEncoder();

export function base64UrlEncode(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(sig);
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateJwkJson: string
): Promise<string> {
  const jwk = JSON.parse(privateJwkJson);
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header = base64UrlEncode(textEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = base64UrlEncode(
    textEncoder.encode(JSON.stringify({ aud: audience, exp, sub: subject }))
  );

  const unsigned = `${header}.${payload}`;
  // WebCrypto ECDSA retorna IEEE P1363 raw (r || s, 64 bytes), formato exacto JWS ES256
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    textEncoder.encode(unsigned)
  );
  return `${unsigned}.${base64UrlEncode(sig)}`;
}

export async function encryptWebPushPayload(
  payloadText: string,
  uaPublicKeyB64: string,
  authSecretB64: string
): Promise<Uint8Array> {
  const uaPublicBytes = base64UrlDecode(uaPublicKeyB64);
  const authSecretBytes = base64UrlDecode(authSecretB64);

  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 0x04) {
    throw new Error("Clave pública p256dh de suscripción inválida");
  }
  if (authSecretBytes.length !== 16) {
    throw new Error("Secreto auth de suscripción inválido");
  }

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  const ephemeralPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const asPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeralPair.publicKey)
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublicKey },
      ephemeralPair.privateKey,
      256
    )
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 sección 3.3: IKM = HKDF(salt=auth_secret, IKM=ecdh_secret, info="WebPush: info\0" || ua_pub || as_pub, 32)
  const keyInfo = concatBytes(
    textEncoder.encode("WebPush: info\0"),
    uaPublicBytes,
    asPublicBytes
  );
  const prkKey = await hmacSha256(authSecretBytes, sharedSecret);
  const ikm = await hmacSha256(prkKey, concatBytes(keyInfo, new Uint8Array([0x01])));

  // RFC 8188 / RFC 8291 sección 3.4: CEK y NONCE con salt aleatorio de 16 bytes
  const prk = await hmacSha256(salt, ikm);
  const cekFull = await hmacSha256(
    prk,
    concatBytes(textEncoder.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([0x01]))
  );
  const nonceFull = await hmacSha256(
    prk,
    concatBytes(textEncoder.encode("Content-Encoding: nonce\0"), new Uint8Array([0x01]))
  );

  const cekBytes = cekFull.slice(0, 16);
  const nonceBytes = nonceFull.slice(0, 12);

  const cekKey = await crypto.subtle.importKey(
    "raw",
    cekBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // Delimitador final de registro RFC 8188: 0x02
  const plaintext = concatBytes(textEncoder.encode(payloadText), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonceBytes, tagLength: 128 },
      cekKey,
      plaintext
    )
  );

  // Cabecera aes128gcm: salt (16B) + rs uint32 BE (4B, 4096) + idlen (1B, 65) + keyid (asPublicBytes, 65B)
  const header = new Uint8Array(16 + 4 + 1 + asPublicBytes.length);
  header.set(salt, 0);
  const view = new DataView(header.buffer);
  view.setUint32(16, 4096, false);
  header[20] = asPublicBytes.length;
  header.set(asPublicBytes, 21);

  return concatBytes(header, ciphertext);
}

export async function sendWebPushNotification(
  sub: PushSubscriptionRecord,
  payloadObj: Record<string, unknown>,
  vapid: VapidConfig,
  options: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high" } = {}
): Promise<{ ok: boolean; status: number; gone: boolean; error?: string }> {
  const endpointUrl = new URL(sub.endpoint);
  const audience = endpointUrl.origin;

  const [jwt, encryptedBody] = await Promise.all([
    createVapidJwt(audience, vapid.subject, vapid.privateJwkJson),
    encryptWebPushPayload(JSON.stringify(payloadObj), sub.p256dh, sub.auth),
  ]);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": String(options.ttlSeconds ?? 86400),
      "Urgency": options.urgency ?? "high",
      "Authorization": `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body: encryptedBody,
  });

  if (res.ok || res.status === 201) {
    return { ok: true, status: res.status, gone: false };
  }

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }

  const gone = res.status === 404 || res.status === 410;
  return {
    ok: false,
    status: res.status,
    gone,
    error: bodyText || `HTTP ${res.status}`,
  };
}
