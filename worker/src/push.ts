// 푸시 알림 (Firebase Cloud Messaging HTTP v1)
//
// 설정하지 않으면(FCM_SERVICE_ACCOUNT 없음) 알림만 조용히 건너뛰고 나머지 기능은 그대로 동작합니다.

import { Hono } from "hono";
import type { Env } from "./env";
import { type AppEnv, fail, placeholders, readBody, str } from "./http";

type Kind = "posts" | "comments" | "likes";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function serviceAccount(env: Env): ServiceAccount | null {
  if (!env.FCM_SERVICE_ACCOUNT) return null;
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    console.error("FCM_SERVICE_ACCOUNT 형식이 올바르지 않습니다.");
    return null;
  }
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

let cachedToken: { email: string; token: string; expiresAt: number } | undefined;

/** 서비스 계정으로 OAuth 액세스 토큰을 받습니다 (1시간 동안 재사용). */
export async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.email === sa.client_email && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claims}`)));
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`FCM 토큰 발급 실패: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { email: sa.client_email, token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export interface Notice {
  title: string;
  body: string;
  postId?: string;
}

/**
 * [userIds] 중 해당 알림을 켜 둔 사람의 모든 기기로 보냅니다.
 * 응답을 늦추지 않도록 waitUntil 안에서 호출하세요.
 */
export async function notify(env: Env, origin: string, kind: Kind, userIds: number[], notice: Notice) {
  const sa = serviceAccount(env);
  const ids = [...new Set(userIds)];
  if (!sa || ids.length === 0) return;

  const { results } = await env.DB.prepare(
    `SELECT t.token, t.platform FROM push_tokens t LEFT JOIN notify_settings s ON s.user_id = t.user_id
     WHERE t.user_id IN (${placeholders(ids.length)}) AND COALESCE(s.${kind}, 1) = 1`,
  )
    .bind(...ids)
    .all<{ token: string; platform: string }>();
  if (results.length === 0) return;

  const auth = await accessToken(sa);
  const base = env.FCM_API_BASE ?? "https://fcm.googleapis.com";
  const data: Record<string, string> = { kind, ...(notice.postId ? { postId: notice.postId } : {}) };
  const stale: string[] = [];

  await Promise.all(
    results.map(async ({ token }) => {
      const res = await fetch(`${base}/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: notice.title, body: notice.body },
            data,
            android: { priority: "high", notification: { sound: "default", tag: notice.postId } },
            webpush: {
              headers: { Urgency: "high" },
              notification: { icon: `${origin}/icons/Icon-192.png`, tag: notice.postId },
              fcm_options: { link: `${origin}/` },
            },
          },
        }),
      });
      if (res.ok) return;
      const text = await res.text();
      // 앱을 지웠거나 알림을 끈 기기의 토큰은 지웁니다.
      if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(text)) {
        stale.push(token);
      } else {
        console.error("FCM 전송 실패", res.status, text);
      }
    }),
  );
  if (stale.length > 0) {
    await env.DB.prepare(`DELETE FROM push_tokens WHERE token IN (${placeholders(stale.length)})`).bind(...stale).run();
  }
}

/** 알림 전송 실패가 원래 요청을 망가뜨리지 않도록 감쌉니다. */
export function notifyLater(
  c: { executionCtx: { waitUntil(p: Promise<unknown>): void }; env: Env; req: { url: string } },
  kind: Kind,
  userIds: number[],
  notice: Notice,
) {
  const origin = new URL(c.req.url).origin;
  c.executionCtx.waitUntil(notify(c.env, origin, kind, userIds, notice).catch((e) => console.error("알림 실패", e)));
}

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

// ---------- 공개: 앱이 Firebase를 초기화할 설정값 (비밀값 아님) ----------

export const pushPublic = new Hono<AppEnv>();

pushPublic.get("/push/config", (c) => {
  let firebase: unknown = null;
  try {
    firebase = c.env.FIREBASE_CONFIG ? JSON.parse(c.env.FIREBASE_CONFIG) : null;
  } catch {
    console.error("FIREBASE_CONFIG 형식이 올바르지 않습니다.");
  }
  return c.json({ enabled: !!firebase && !!serviceAccount(c.env), firebase });
});

// ---------- 로그인 필요: 기기 등록, 알림 설정 ----------

export const push = new Hono<AppEnv>();

push.post("/push/tokens", async (c) => {
  const b = await readBody<{ token: string; platform: string }>(c);
  const token = str(b.token, 4096);
  if (!token) fail(400, "token 이 필요합니다.");
  const platform = b.platform === "web" ? "web" : "android";
  await c.env.DB.prepare(
    `INSERT INTO push_tokens (token, user_id, platform, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at`,
  )
    .bind(token, c.get("user").id, platform, Date.now())
    .run();
  return c.json({ ok: true });
});

push.delete("/push/tokens", async (c) => {
  const token = str((await readBody<{ token: string }>(c)).token, 4096);
  await c.env.DB.prepare("DELETE FROM push_tokens WHERE token = ? AND user_id = ?").bind(token, c.get("user").id).run();
  return c.json({ ok: true });
});

push.get("/me/notifications", async (c) => {
  const s = await c.env.DB.prepare("SELECT posts, comments, likes FROM notify_settings WHERE user_id = ?")
    .bind(c.get("user").id)
    .first<{ posts: number; comments: number; likes: number }>();
  return c.json({ posts: (s?.posts ?? 1) === 1, comments: (s?.comments ?? 1) === 1, likes: (s?.likes ?? 1) === 1 });
});

push.put("/me/notifications", async (c) => {
  const b = await readBody<{ posts: boolean; comments: boolean; likes: boolean }>(c);
  const v = (x: unknown) => (x === false ? 0 : 1);
  await c.env.DB.prepare(
    `INSERT INTO notify_settings (user_id, posts, comments, likes) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET posts = excluded.posts, comments = excluded.comments, likes = excluded.likes`,
  )
    .bind(c.get("user").id, v(b.posts), v(b.comments), v(b.likes))
    .run();
  return c.json({ ok: true });
});
