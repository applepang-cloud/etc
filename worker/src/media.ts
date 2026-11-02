import { Hono } from "hono";
import type { Env } from "./env";
import { type AppEnv, fail, optInt, parseCursor, readBody } from "./http";
import { presignGet, presignPut } from "./r2";

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
const MAX_DERIVED_BYTES = 3 * 1024 * 1024;

export interface MediaRow {
  id: string;
  user_id: number;
  post_id: string | null;
  position: number;
  kind: "photo" | "video";
  object_key: string;
  thumb_key: string | null;
  preview_key: string | null;
  content_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  taken_at: number | null;
  status: string;
  created_at: number;
}

export async function mediaJson(env: Env, m: MediaRow) {
  const [thumbUrl, previewUrl] = await Promise.all([
    m.thumb_key ? presignGet(env, m.thumb_key) : null,
    m.preview_key ? presignGet(env, m.preview_key) : null,
  ]);
  return {
    id: m.id,
    postId: m.post_id,
    ownerId: m.user_id,
    kind: m.kind,
    contentType: m.content_type,
    width: m.width,
    height: m.height,
    durationMs: m.duration_ms,
    takenAt: m.taken_at,
    thumbUrl,
    previewUrl: previewUrl ?? thumbUrl,
  };
}

/** R2 파일과 DB 행을 함께 지웁니다. */
export async function deleteMediaRows(env: Env, rows: Pick<MediaRow, "id" | "object_key" | "thumb_key" | "preview_key">[]) {
  if (rows.length === 0) return;
  const keys = rows.flatMap((m) => [m.object_key, m.thumb_key, m.preview_key].filter((k): k is string => !!k));
  for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
  await env.DB.batch(rows.map((m) => env.DB.prepare("DELETE FROM media WHERE id = ?").bind(m.id)));
}

export const media = new Hono<AppEnv>();

// 1단계: 업로드 URL 발급. 파일은 앱에서 R2로 직접 올라갑니다.
media.post("/", async (c) => {
  const b = await readBody<{ kind: string; contentType: string; hasThumb: boolean; hasPreview: boolean }>(c);
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
  const previewKey = b.hasPreview ? `previews/${month}/${id}.jpg` : null;

  await c.env.DB.prepare(
    `INSERT INTO media (id, user_id, kind, object_key, thumb_key, preview_key, content_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, c.get("user").id, kind, objectKey, thumbKey, previewKey, contentType, now.getTime())
    .run();

  return c.json({
    id,
    uploadUrl: await presignPut(c.env, objectKey),
    thumbUploadUrl: thumbKey ? await presignPut(c.env, thumbKey) : null,
    previewUploadUrl: previewKey ? await presignPut(c.env, previewKey) : null,
  });
});

// 2단계: 업로드 완료 확인. 이후 게시물을 만들 때 이 id 를 넘깁니다.
media.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const m = await c.env.DB.prepare("SELECT * FROM media WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<MediaRow>();
  if (!m) fail(404, "업로드 정보를 찾을 수 없습니다.");
  if (m.status === "ready") return c.json({ item: await mediaJson(c.env, m) });

  const b = await readBody<{ width: number; height: number; durationMs: number; takenAt: number }>(c);
  const takenAt = optInt(b.takenAt);
  const [obj, thumb, preview] = await Promise.all([
    c.env.BUCKET.head(m.object_key),
    m.thumb_key ? c.env.BUCKET.head(m.thumb_key) : null,
    m.preview_key ? c.env.BUCKET.head(m.preview_key) : null,
  ]);
  if (!obj) fail(400, "파일이 아직 업로드되지 않았습니다.");
  const maxBytes = m.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (obj.size > maxBytes || (thumb?.size ?? 0) > MAX_DERIVED_BYTES || (preview?.size ?? 0) > MAX_DERIVED_BYTES) {
    await deleteMediaRows(c.env, [m]);
    fail(400, `파일이 너무 큽니다. (최대 ${Math.round(maxBytes / 1024 / 1024)}MB)`);
  }

  const updated = await c.env.DB.prepare(
    `UPDATE media SET status = 'ready', size_bytes = ?, width = ?, height = ?, duration_ms = ?, taken_at = ?, thumb_key = ?, preview_key = ?
     WHERE id = ? RETURNING *`,
  )
    .bind(
      obj.size,
      optInt(b.width),
      optInt(b.height),
      optInt(b.durationMs),
      takenAt !== null && takenAt <= Date.now() + 86400000 ? takenAt : null,
      thumb ? m.thumb_key : null,
      preview ? m.preview_key : null,
      m.id,
    )
    .first<MediaRow>();
  return c.json({ item: await mediaJson(c.env, updated!) });
});

// 앨범에서 쓰는 날짜: 찍은 시각, 없으면 게시 날짜
const SORT_AT = "COALESCE(m.taken_at, p.posted_at)";

/** 클라이언트 시간대(분, 한국 = 540)를 반영한 "YYYY-MM" */
function tzOffsetMs(c: { req: { query: (k: string) => string | undefined } }): number {
  const tz = Number(c.req.query("tz"));
  return Number.isFinite(tz) && Math.abs(tz) <= 14 * 60 ? tz * 60_000 : 0;
}

// 앨범의 월 목록: [{ month: "2026-10", count: 12, cover }, ...] 최신순. cover 는 그 달의 가장 최근 사진.
media.get("/months", async (c) => {
  const offset = tzOffsetMs(c);
  const { results } = await c.env.DB.prepare(
    `WITH x AS (
       SELECT m.*, ${SORT_AT} AS sort_at, strftime('%Y-%m', (${SORT_AT} + ?) / 1000, 'unixepoch') AS month
       FROM media m JOIN posts p ON p.id = m.post_id WHERE m.status = 'ready'
     ),
     ranked AS (
       SELECT x.*, ROW_NUMBER() OVER (PARTITION BY month ORDER BY sort_at DESC, id DESC) AS rn,
              COUNT(*) OVER (PARTITION BY month) AS count
       FROM x
     )
     SELECT * FROM ranked WHERE rn = 1 ORDER BY month DESC`,
  )
    .bind(offset)
    .all<MediaRow & { month: string; count: number }>();
  return c.json({
    months: await Promise.all(
      results.map(async (r) => ({ month: r.month, count: r.count, cover: await mediaJson(c.env, r) })),
    ),
  });
});

// 앨범: 게시된 사진/영상 (찍은 날짜 최신순). month=YYYY-MM 으로 한 달만 볼 수 있습니다.
media.get("/", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 60, 1), 200);
  const cur = parseCursor(c.req.query("cursor"));
  let sql = `SELECT m.*, p.posted_at, ${SORT_AT} AS sort_at FROM media m JOIN posts p ON p.id = m.post_id
             WHERE m.status = 'ready'`;
  const params: (string | number)[] = [];
  const month = /^(\d{4})-(\d{2})$/.exec(c.req.query("month") ?? "");
  if (month) {
    const offset = tzOffsetMs(c);
    const y = Number(month[1]);
    const mo = Number(month[2]) - 1;
    sql += ` AND ${SORT_AT} >= ? AND ${SORT_AT} < ?`;
    params.push(Date.UTC(y, mo, 1) - offset, Date.UTC(y, mo + 1, 1) - offset);
  }
  if (cur) {
    sql += ` AND (${SORT_AT} < ? OR (${SORT_AT} = ? AND m.id < ?))`;
    params.push(cur.ts, cur.ts, cur.id);
  }
  sql += ` ORDER BY sort_at DESC, m.id DESC LIMIT ?`;
  params.push(limit + 1);
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<MediaRow & { posted_at: number; sort_at: number }>();
  const page = results.slice(0, limit);
  const last = page.at(-1);
  return c.json({
    items: await Promise.all(
      page.map(async (m) => ({ ...(await mediaJson(c.env, m)), postedAt: m.posted_at, sortAt: m.sort_at })),
    ),
    nextCursor: results.length > limit && last ? `${last.sort_at}_${last.id}` : null,
  });
});

// 원본 보기용 URL (사진 크게 보기, 영상 재생)
media.get("/:id/url", async (c) => {
  const m = await c.env.DB.prepare("SELECT object_key FROM media WHERE id = ? AND status = 'ready'")
    .bind(c.req.param("id"))
    .first<{ object_key: string }>();
  if (!m) fail(404, "파일을 찾을 수 없습니다.");
  return c.json({ url: await presignGet(c.env, m.object_key) });
});
