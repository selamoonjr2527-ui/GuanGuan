const ORGANIZER_UIDS = new Set([
  "DWpEIuKxqRTBptDKqM4FIKjMPmf1",
  "Ofkc1m00ikbEg84VifbePLk1k0l2",
]);

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/" +
  "securetoken@system.gserviceaccount.com";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";

const encoder = new TextEncoder();
let oauthCache = { token: "", expiresAt: 0 };

function responseJson(data, status, request) {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    origin === "https://guanguan-cbbe7.web.app" ||
    origin === "https://guanguan-cbbe7.firebaseapp.com" ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin":
        allowed && origin ? origin : "https://guanguan-cbbe7.web.app",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-max-age": "86400",
      "vary": "Origin",
    },
  });
}

function b64urlToBytes(v) {
  const n = v.replace(/-/g, "+").replace(/_/g, "/");
  const p = n + "=".repeat((4 - (n.length % 4)) % 4);
  const b = atob(p);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i += 1) out[i] = b.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes) {
  let b = "";
  for (const value of bytes) b += String.fromCharCode(value);
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeJson(obj) {
  return bytesToB64url(encoder.encode(JSON.stringify(obj)));
}

async function verifyFirebaseIdToken(request, env) {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");

  const token = h.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("UNAUTHENTICATED");

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  const now = Math.floor(Date.now() / 1000);

  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    payload.aud !== env.FIREBASE_PROJECT_ID ||
    payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.exp !== "number" ||
    payload.exp <= now ||
    typeof payload.iat !== "number" ||
    payload.iat > now + 60
  ) throw new Error("UNAUTHENTICATED");

  const jwksRes = await fetch(FIREBASE_JWKS_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!jwksRes.ok) throw new Error("UNAUTHENTICATED");

  const jwks = await jwksRes.json();
  const jwk = Array.isArray(jwks.keys)
    ? jwks.keys.find((k) => k.kid === header.kid)
    : null;
  if (!jwk) throw new Error("UNAUTHENTICATED");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`)
  );

  if (!ok) throw new Error("UNAUTHENTICATED");
  return payload;
}

async function sha256Hex(value) {
  const d = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importPrivateKey(pem) {
  const s = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (oauthCache.token && oauthCache.expiresAt > now + 120) return oauthCache.token;

  const h = encodeJson({ alg: "RS256", typ: "JWT" });
  const p = encodeJson({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: FCM_SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const input = `${h}.${p}`;

  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(input)
  );
  const assertion = `${input}.${bytesToB64url(new Uint8Array(sig))}`;

  const r = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const j = await r.json();
  if (!r.ok || typeof j.access_token !== "string") throw new Error("FCM_OAUTH");

  oauthCache = {
    token: j.access_token,
    expiresAt: now + Number(j.expires_in || 3600),
  };
  return oauthCache.token;
}

function cleanMemberId(v) {
  const s = typeof v === "string" ? v.trim().slice(0, 128) : "";
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("BAD_MEMBER_ID");
  return s;
}

function cleanText(v, n) {
  return typeof v === "string" ? v.trim().slice(0, n) : "";
}

async function register(request, env, auth) {
  const body = await request.json();
  const memberId = cleanMemberId(body.memberId);
  const token = cleanText(body.token, 4096);

  if (token.length < 20) throw new Error("BAD_TOKEN");
  if (
    auth.role !== "member" ||
    auth.memberId !== memberId ||
    !Number.isSafeInteger(Number(auth.credentialVersion)) ||
    Number(auth.credentialVersion) < 1
  ) throw new Error("MEMBER_MISMATCH");

  const hash = await sha256Hex(token);
  await env.DB.prepare(
    `INSERT INTO member_push_tokens
     (token_hash, member_id, token, auth_uid, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(token_hash) DO UPDATE SET
       member_id = excluded.member_id,
       token = excluded.token,
       auth_uid = excluded.auth_uid,
       updated_at = excluded.updated_at`
  ).bind(hash, memberId, token, auth.sub, Date.now()).run();

  return { ok: true };
}

async function fcmSend(env, accessToken, token, data) {
  const url =
    `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        data,
        webpush: { headers: { TTL: "300", Urgency: "high" } },
      },
    }),
  });

  let payload = null;
  try { payload = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, payload };
}

async function send(request, env, auth) {
  if (!ORGANIZER_UIDS.has(auth.sub)) throw new Error("ORGANIZER_ONLY");

  const body = await request.json();
  const ids = Array.from(
    new Set((Array.isArray(body.memberIds) ? body.memberIds : [])
      .slice(0, 30)
      .map(cleanMemberId))
  );

  const title = cleanText(body.title, 120);
  const messageBody = cleanText(body.body, 300);
  const tag = cleanText(body.tag, 160) || "guanguan-queue";
  const url = cleanText(body.url, 300) || "/";
  const kind = cleanText(body.kind, 20);

  if (!ids.length || !title || !messageBody) throw new Error("BAD_SEND");

  const placeholders = ids.map(() => "?").join(",");
  const rowsResult = await env.DB.prepare(
    `SELECT token_hash, token
     FROM member_push_tokens
     WHERE member_id IN (${placeholders})`
  ).bind(...ids).all();

  const rows = Array.isArray(rowsResult.results) ? rowsResult.results : [];
  if (!rows.length) return { ok: true, targetTokens: 0, sent: 0, failed: 0 };

  const accessToken = await getAccessToken(env);
  const data = { title, body: messageBody, tag, url, kind };

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await fcmSend(env, accessToken, row.token, data);
    if (result.ok) {
      sent += 1;
      continue;
    }

    failed += 1;
    const detail = JSON.stringify(result.payload || {});
    if (result.status === 404 || detail.includes("UNREGISTERED")) {
      await env.DB.prepare(
        "DELETE FROM member_push_tokens WHERE token_hash = ?"
      ).bind(row.token_hash).run();
    }
  }

  return { ok: true, targetTokens: rows.length, sent, failed };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return responseJson({ ok: true }, 200, request);
    }

    if (request.method !== "POST") {
      return responseJson({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, request);
    }

    let auth;
    try {
      auth = await verifyFirebaseIdToken(request, env);
    } catch {
      return responseJson({ ok: false, error: "UNAUTHENTICATED" }, 401, request);
    }

    try {
      const path = new URL(request.url).pathname;

      if (path === "/v1/register") {
        return responseJson(await register(request, env, auth), 200, request);
      }

      if (path === "/v1/send") {
        return responseJson(await send(request, env, auth), 200, request);
      }

      return responseJson({ ok: false, error: "NOT_FOUND" }, 404, request);
    } catch (error) {
      const code = error?.message || "REQUEST_FAILED";
      const status =
        code === "MEMBER_MISMATCH" || code === "ORGANIZER_ONLY"
          ? 403
          : 400;
      console.warn("Push request failed", code);
      return responseJson({ ok: false, error: code }, status, request);
    }
  },
};
