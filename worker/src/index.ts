import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { hashPassword, randomToken, safeStringEqual, sha256, verifyPassword } from "./crypto";
import type { Env, User } from "./env";
import { presignGet, presignPut } from "./r2";

type AppEnv = { Bindings: Env; Variables: { user: User } };

const SESSION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

const app = new Hono<AppEnv>().basePath("/api");

// 토큰은 Authorization 헤더로만 주고받기 때문에 모든 출처를 허용해도 안전합니다.
// (로컬에서 `flutter run -d chrome` 으로 개발할 때 필요)
app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "DELETE"] }));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "서버 오류가 발생했습니다." }, 500);
});

function fail(status: 400 | 401 | 403 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}

async function body<T>(c: { req: { json: () => Promise<unknown> } }): Promise<Partial<T>> {
  try {
    const v = await c.req.json();
    return v && typeof v === "object" ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}

function publicUser(u: User) {
  return { id: u.id, username: u.username, displayName: u.display_name };
}

async function createSession(env: Env, userId: number): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * DAY_MS)
    .run();
  return token;
}

// ---------- 인증 ----------

app.post("/auth/signup", async (c) => {
  const b = await body<{ inviteCode: string; username: string; displayName: string; password: string }>(c);
  if (!c.env.INVITE_CODE || typeof b.inviteCode !== "string" || !safeStringEqual(b.inviteCode, c.env.INVITE_CODE)) {
    fail(403, "초대 코드가 올바르지 않습니다.");
  }
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  const displayName = typeof b.displayName === "string" ? b.displayName.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!/^[a-z0-9_]{3,20}$/.test(username)) fail(400, "아이디는 영문 소문자, 숫자, _ 로 3~20자여야 합니다.");
  if (displayName.length < 1 || displayName.length > 20) fail(400, "이름은 1~20자여야 합니다.");
  if (password.length < 8) fail(400, "비밀번호는 8자 이상이어야 합니다.");

  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
  if (exists) fail(409, "이미 사용 중인 아이디입니다.");

  const user = await c.env.DB.prepare(
    "INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id, username, display_name",
  )
    .bind(username, displayName, await hashPassword(password), Date.now())
    .first<User>();
  if (!user) throw new Error("user insert failed");
  return c.json({ token: await createSession(c.env, user.id), user: publicUser(user) });
});

app.post("/auth/login", async (c) => {
  const b = await body<{ username: string; password: string }>(c);
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const row = await c.env.DB.prepare("SELECT id, username, display_name, password_hash FROM users WHERE username = ?")
    .bind(username)
    .first<User & { password_hash: string }>();
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    fail(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  return c.json({ token: await createSession(c.env, row.id), user: publicUser(row) });
});

// 아래 경로는 모두 로그인 필요
app.use("*", async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) fail(401, "로그인이 필요합니다.");
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first<User>();
  if (!user) fail(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  c.set("user", user);
  await next();
});

app.post("/auth/logout", async (c) => {
  const token = (c.req.header("Authorization") ?? "").slice(7);
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return c.json({ ok: true });
});

app.get("/me", (c) => c.json({ user: publicUser(c.get("user")) }));

app.post("/me/password", async (c) => {
  const b = await body<{ currentPassword: string; newPassword: string }>(c);
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || typeof b.currentPassword !== "string" || !(await verifyPassword(b.currentPassword, row.password_hash))) {
    fail(403, "현재 비밀번호가 올바르지 않습니다.");
  }
  if (typeof b.newPassword !== "string" || b.newPassword.length < 8) fail(400, "비밀번호는 8자 이상이어야 합니다.");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(b.newPassword), user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
  ]);
  return c.json({ token: await createSession(c.env, user.id) });
});

// ---------- 사진/영상 ----------

interface MediaRow {
  id: string;
  user_id: number;
  kind: "photo" | "video";
  object_key: string;
  thumb_key: string | null;
  content_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  status: string;
  created_at: number;
  display_name?: string;
}

async function toItem(env: Env, m: MediaRow) {
  return {
    id: m.id,
    kind: m.kind,
    contentType: m.content_type,
    width: m.width,
    height: m.height,
    durationMs: m.duration_ms,
    sizeBytes: m.size_bytes,
    createdAt: m.created_at,
    owner: { id: m.user_id, displayName: m.display_name ?? "" },
    thumbUrl: m.thumb_key ? await presignGet(env, m.thumb_key) : null,
  };
}

function optInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

// 1단계: 업로드 URL 발급. 파일은 앱에서 R2로 직접 올라갑니다.
app.post("/media", async (c) => {
  const b = await body<{ kind: string; contentType: string; hasThumb: boolean }>(c);
  const kind = b.kind === "video" ? "video" : b.kind === "photo" ? "photo" : null;
  if (!kind) fail(400, "kind 는 photo 또는 video 여야 합니다.");
  const contentType = typeof b.contentType === "string" ? b.contentType.toLowerCase() : "";
  const ext = (kind === "photo" ? PHOTO_TYPES : VIDEO_TYPES)[contentType];
  if (!ext) fail(400, `지원하지 않는 파일 형식입니다: ${contentType || "알 수 없음"}`);

  const id = crypto.randomUUID();
  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const objectKey = `media/${month}/${id}.${ext}`;
  const thumbKey = b.hasThumb ? `thumbs/${month}/${id}.jpg` : null;

  await c.env.DB.prepare(
    "INSERT INTO media (id, user_id, kind, object_key, thumb_key, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, c.get("user").id, kind, objectKey, thumbKey, contentType, now.getTime())
    .run();

  return c.json({
    id,
    uploadUrl: await presignPut(c.env, objectKey),
    thumbUploadUrl: thumbKey ? await presignPut(c.env, thumbKey) : null,
  });
});

// 2단계: 업로드 완료 확인. R2에 실제 파일이 있는지 확인한 뒤 목록에 보이게 합니다.
app.post("/media/:id/complete", async (c) => {
  const user = c.get("user");
  const m = await c.env.DB.prepare("SELECT * FROM media WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<MediaRow>();
  if (!m) fail(404, "업로드 정보를 찾을 수 없습니다.");
  if (m.status === "ready") return c.json({ item: await toItem(c.env, { ...m, display_name: user.display_name }) });

  const b = await body<{ width: number; height: number; durationMs: number }>(c);
  const [obj, thumb] = await Promise.all([
    c.env.BUCKET.head(m.object_key),
    m.thumb_key ? c.env.BUCKET.head(m.thumb_key) : Promise.resolve(null),
  ]);
  if (!obj) fail(400, "파일이 아직 업로드되지 않았습니다.");
  const maxBytes = m.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (obj.size > maxBytes || (thumb && thumb.size > MAX_THUMB_BYTES)) {
    await deleteMedia(c.env, m);
    fail(400, `파일이 너무 큽니다. (최대 ${Math.round(maxBytes / 1024 / 1024)}MB)`);
  }
  const thumbKey = thumb ? m.thumb_key : null;

  const updated = await c.env.DB.prepare(
    `UPDATE media SET status = 'ready', size_bytes = ?, width = ?, height = ?, duration_ms = ?, thumb_key = ?
     WHERE id = ? RETURNING *`,
  )
    .bind(obj.size, optInt(b.width), optInt(b.height), optInt(b.durationMs), thumbKey, m.id)
    .first<MediaRow>();
  return c.json({ item: await toItem(c.env, { ...updated!, display_name: user.display_name }) });
});

// 목록 (최신순). cursor 는 이전 응답의 nextCursor 를 그대로 넘기면 됩니다.
app.get("/media", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 60, 1), 100);
  const cursor = c.req.query("cursor");
  let sql = `SELECT m.*, u.display_name FROM media m JOIN users u ON u.id = m.user_id WHERE m.status = 'ready'`;
  const params: (string | number)[] = [];
  if (cursor) {
    const [ts, id] = cursor.split("_");
    sql += " AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))";
    params.push(Number(ts), Number(ts), id ?? "");
  }
  sql += " ORDER BY m.created_at DESC, m.id DESC LIMIT ?";
  params.push(limit + 1);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<MediaRow>();
  const page = results.slice(0, limit);
  const last = page[page.length - 1];
  return c.json({
    items: await Promise.all(page.map((m) => toItem(c.env, m))),
    nextCursor: results.length > limit && last ? `${last.created_at}_${last.id}` : null,
  });
});

// 원본 보기용 URL (사진 크게 보기, 영상 재생)
app.get("/media/:id/url", async (c) => {
  const m = await c.env.DB.prepare("SELECT object_key FROM media WHERE id = ? AND status = 'ready'")
    .bind(c.req.param("id"))
    .first<{ object_key: string }>();
  if (!m) fail(404, "파일을 찾을 수 없습니다.");
  return c.json({ url: await presignGet(c.env, m.object_key) });
});

async function deleteMedia(env: Env, m: Pick<MediaRow, "id" | "object_key" | "thumb_key">) {
  await env.BUCKET.delete(m.thumb_key ? [m.object_key, m.thumb_key] : [m.object_key]);
  await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(m.id).run();
}

// 삭제는 올린 사람만 가능
app.delete("/media/:id", async (c) => {
  const m = await c.env.DB.prepare("SELECT id, user_id, object_key, thumb_key FROM media WHERE id = ?")
    .bind(c.req.param("id"))
    .first<MediaRow>();
  if (!m) fail(404, "파일을 찾을 수 없습니다.");
  if (m.user_id !== c.get("user").id) fail(403, "본인이 올린 파일만 삭제할 수 있습니다.");
  await deleteMedia(c.env, m);
  return c.json({ ok: true });
});

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,

  // 매일 한 번: 하루 넘게 완료되지 않은 업로드와 만료된 세션을 정리합니다.
  async scheduled(_event: ScheduledController, env: Env) {
    const cutoff = Date.now() - DAY_MS;
    const { results } = await env.DB.prepare(
      "SELECT id, object_key, thumb_key FROM media WHERE status = 'pending' AND created_at < ? LIMIT 500",
    )
      .bind(cutoff)
      .all<MediaRow>();
    for (const m of results) await deleteMedia(env, m);
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
  },
} satisfies ExportedHandler<Env>;
