import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { hashPassword, randomToken, safeStringEqual, sha256, verifyPassword } from "./crypto";
import type { Env, User } from "./env";
import { family } from "./family";
import { type AppEnv, fail, readBody as body } from "./http";
import { deleteMediaRows, type MediaRow, media } from "./media";
import { posts } from "./posts";

const SESSION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

const app = new Hono<AppEnv>().basePath("/api");

// 토큰은 Authorization 헤더로만 주고받기 때문에 모든 출처를 허용해도 안전합니다.
// (로컬에서 `flutter run -d chrome` 으로 개발할 때 필요)
app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "서버 오류가 발생했습니다." }, 500);
});

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

app.route("/media", media);
app.route("/posts", posts);
app.route("/", family);

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,

  // 매일 한 번: 하루 넘게 게시되지 않은 업로드와 만료된 세션을 정리합니다.
  async scheduled(_event: ScheduledController, env: Env) {
    const cutoff = Date.now() - DAY_MS;
    const { results } = await env.DB.prepare(
      "SELECT * FROM media WHERE post_id IS NULL AND created_at < ? LIMIT 500",
    )
      .bind(cutoff)
      .all<MediaRow>();
    await deleteMediaRows(env, results);
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
  },
} satisfies ExportedHandler<Env>;
