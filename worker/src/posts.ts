import { Hono } from "hono";
import type { Env } from "./env";
import { type AppEnv, fail, parseCursor, placeholders, readBody, str } from "./http";
import { deleteMediaRows, type MediaRow, mediaJson } from "./media";
import { clip, notifyLater } from "./push";

const MAX_MEDIA_PER_POST = 50;
const MAX_BODY = 2000;
const FEED_MEDIA_PREVIEW = 4; // 타임라인 카드에는 앞의 4장만 보여줍니다.

interface PostRow {
  id: string;
  user_id: number;
  body: string;
  posted_at: number;
  created_at: number;
  display_name: string;
}

async function postsJson(env: Env, userId: number, posts: PostRow[], allMedia: boolean) {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  const ph = placeholders(ids.length);
  const [mediaRes, likeRes, commentRes] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM media WHERE post_id IN (${ph}) AND status = 'ready' ORDER BY position`).bind(...ids),
    env.DB.prepare(
      `SELECT post_id, COUNT(*) AS n, MAX(user_id = ?) AS mine FROM likes WHERE post_id IN (${ph}) GROUP BY post_id`,
    ).bind(userId, ...ids),
    env.DB.prepare(`SELECT post_id, COUNT(*) AS n FROM comments WHERE post_id IN (${ph}) GROUP BY post_id`).bind(...ids),
  ]);
  const mediaByPost = new Map<string, MediaRow[]>();
  for (const m of mediaRes.results as unknown as MediaRow[]) {
    const list = mediaByPost.get(m.post_id!) ?? [];
    list.push(m);
    mediaByPost.set(m.post_id!, list);
  }
  const likes = new Map((likeRes.results as { post_id: string; n: number; mine: number }[]).map((r) => [r.post_id, r]));
  const comments = new Map((commentRes.results as { post_id: string; n: number }[]).map((r) => [r.post_id, r.n]));

  return Promise.all(
    posts.map(async (p) => {
      const list = mediaByPost.get(p.id) ?? [];
      const shown = allMedia ? list : list.slice(0, FEED_MEDIA_PREVIEW);
      return {
        id: p.id,
        body: p.body,
        postedAt: p.posted_at,
        createdAt: p.created_at,
        author: { id: p.user_id, displayName: p.display_name },
        media: await Promise.all(shown.map((m) => mediaJson(env, m))),
        mediaCount: list.length,
        likeCount: likes.get(p.id)?.n ?? 0,
        likedByMe: (likes.get(p.id)?.mine ?? 0) === 1,
        commentCount: comments.get(p.id) ?? 0,
      };
    }),
  );
}

const POST_SELECT = `SELECT p.*, u.display_name FROM posts p JOIN users u ON u.id = p.user_id`;

async function loadPost(env: Env, id: string): Promise<PostRow> {
  const p = await env.DB.prepare(`${POST_SELECT} WHERE p.id = ?`).bind(id).first<PostRow>();
  if (!p) fail(404, "게시물을 찾을 수 없습니다.");
  return p;
}

function parsePostedAt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  // 1970년 이전/미래 1일 이후는 거부
  if (v < 0 || v > Date.now() + 24 * 60 * 60 * 1000) fail(400, "날짜가 올바르지 않습니다.");
  return Math.round(v);
}

export const posts = new Hono<AppEnv>();

// 타임라인. before(밀리초)를 주면 그 날짜 이전부터 보여줍니다 (나이대별 이동).
posts.get("/", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 50);
  const cur = parseCursor(c.req.query("cursor"));
  const before = Number(c.req.query("before"));
  let sql = `${POST_SELECT} WHERE 1 = 1`;
  const params: (string | number)[] = [];
  if (cur) {
    sql += " AND (p.posted_at < ? OR (p.posted_at = ? AND p.id < ?))";
    params.push(cur.ts, cur.ts, cur.id);
  } else if (Number.isFinite(before) && before > 0) {
    sql += " AND p.posted_at < ?";
    params.push(before);
  }
  sql += " ORDER BY p.posted_at DESC, p.id DESC LIMIT ?";
  params.push(limit + 1);
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<PostRow>();
  const page = results.slice(0, limit);
  const last = page.at(-1);
  return c.json({
    items: await postsJson(c.env, c.get("user").id, page, false),
    nextCursor: results.length > limit && last ? `${last.posted_at}_${last.id}` : null,
  });
});

// 게시물 작성: 먼저 /media 로 파일을 올린 뒤 그 id 들을 넘깁니다.
posts.post("/", async (c) => {
  const user = c.get("user");
  const b = await readBody<{ body: string; postedAt: number; mediaIds: string[] }>(c);
  const body = str(b.body, MAX_BODY);
  const mediaIds = Array.isArray(b.mediaIds) ? [...new Set(b.mediaIds.filter((x) => typeof x === "string"))] : [];
  if (mediaIds.length > MAX_MEDIA_PER_POST) fail(400, `사진/영상은 한 번에 ${MAX_MEDIA_PER_POST}개까지 올릴 수 있습니다.`);
  if (!body && mediaIds.length === 0) fail(400, "글이나 사진을 넣어 주세요.");

  if (mediaIds.length > 0) {
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM media WHERE id IN (${placeholders(mediaIds.length)})
       AND user_id = ? AND status = 'ready' AND post_id IS NULL`,
    )
      .bind(...mediaIds, user.id)
      .first<{ n: number }>();
    if (row?.n !== mediaIds.length) fail(400, "업로드가 끝나지 않은 파일이 있습니다. 다시 시도해 주세요.");
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO posts (id, user_id, body, posted_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      user.id,
      body,
      parsePostedAt(b.postedAt) ?? now,
      now,
    ),
    ...mediaIds.map((mid, i) => c.env.DB.prepare("UPDATE media SET post_id = ?, position = ? WHERE id = ?").bind(id, i, mid)),
  ]);
  const [post] = await postsJson(c.env, user.id, [await loadPost(c.env, id)], false);

  const { results: others } = await c.env.DB.prepare("SELECT id FROM users WHERE id != ?").bind(user.id).all<{ id: number }>();
  const what = mediaIds.length > 0 ? `사진·동영상 ${mediaIds.length}개를 올렸어요` : "새 소식을 남겼어요";
  notifyLater(c, "posts", others.map((o) => o.id), {
    title: `${user.display_name} 님이 ${what}`,
    body: body ? clip(body, 80) : "눌러서 확인해 보세요",
    postId: id,
  });
  return c.json({ post });
});

// 게시물 상세: 모든 사진 + 댓글 + 좋아요 누른 사람
posts.get("/:id", async (c) => {
  const user = c.get("user");
  const p = await loadPost(c.env, c.req.param("id"));
  const [[post], comments, likers] = await Promise.all([
    postsJson(c.env, user.id, [p], true),
    c.env.DB.prepare(
      `SELECT c.id, c.body, c.created_at, c.user_id, u.display_name FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at`,
    )
      .bind(p.id)
      .all<{ id: number; body: string; created_at: number; user_id: number; display_name: string }>(),
    c.env.DB.prepare(
      `SELECT u.id, u.display_name FROM likes l JOIN users u ON u.id = l.user_id WHERE l.post_id = ? ORDER BY l.created_at`,
    )
      .bind(p.id)
      .all<{ id: number; display_name: string }>(),
  ]);
  return c.json({
    post,
    comments: comments.results.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      author: { id: r.user_id, displayName: r.display_name },
    })),
    likers: likers.results.map((r) => ({ id: r.id, displayName: r.display_name })),
  });
});

// 글 / 날짜 수정 (올린 사람만)
posts.patch("/:id", async (c) => {
  const user = c.get("user");
  const p = await loadPost(c.env, c.req.param("id"));
  if (p.user_id !== user.id) fail(403, "본인이 올린 게시물만 수정할 수 있습니다.");
  const b = await readBody<{ body: string; postedAt: number }>(c);
  const body = b.body === undefined ? p.body : str(b.body, MAX_BODY);
  const postedAt = parsePostedAt(b.postedAt) ?? p.posted_at;
  await c.env.DB.prepare("UPDATE posts SET body = ?, posted_at = ? WHERE id = ?").bind(body, postedAt, p.id).run();
  const [post] = await postsJson(c.env, user.id, [await loadPost(c.env, p.id)], false);
  return c.json({ post });
});

export async function deletePost(env: Env, postId: string) {
  const { results } = await env.DB.prepare("SELECT * FROM media WHERE post_id = ?").bind(postId).all<MediaRow>();
  await deleteMediaRows(env, results);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(postId),
    env.DB.prepare("DELETE FROM likes WHERE post_id = ?").bind(postId),
    env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId),
  ]);
}

posts.delete("/:id", async (c) => {
  const p = await loadPost(c.env, c.req.param("id"));
  if (p.user_id !== c.get("user").id) fail(403, "본인이 올린 게시물만 삭제할 수 있습니다.");
  await deletePost(c.env, p.id);
  return c.json({ ok: true });
});

// 게시물에서 사진 한 장만 빼기 (올린 사람만). 남은 게 없으면 게시물도 지웁니다.
posts.delete("/:id/media/:mediaId", async (c) => {
  const p = await loadPost(c.env, c.req.param("id"));
  if (p.user_id !== c.get("user").id) fail(403, "본인이 올린 게시물만 수정할 수 있습니다.");
  const m = await c.env.DB.prepare("SELECT * FROM media WHERE id = ? AND post_id = ?")
    .bind(c.req.param("mediaId"), p.id)
    .first<MediaRow>();
  if (!m) fail(404, "파일을 찾을 수 없습니다.");
  await deleteMediaRows(c.env, [m]);
  const left = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE post_id = ?").bind(p.id).first<{ n: number }>();
  const postDeleted = (left?.n ?? 0) === 0 && !p.body;
  if (postDeleted) await deletePost(c.env, p.id);
  return c.json({ ok: true, postDeleted });
});

posts.put("/:id/like", async (c) => {
  const p = await loadPost(c.env, c.req.param("id"));
  const user = c.get("user");
  const r = await c.env.DB.prepare("INSERT OR IGNORE INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)")
    .bind(p.id, user.id, Date.now())
    .run();
  if (r.meta.changes > 0 && p.user_id !== user.id) {
    notifyLater(c, "likes", [p.user_id], {
      title: `${user.display_name} 님이 좋아요를 눌렀어요 ❤️`,
      body: p.body ? clip(p.body, 60) : "내가 올린 사진",
      postId: p.id,
    });
  }
  return c.json({ ok: true });
});

posts.delete("/:id/like", async (c) => {
  await c.env.DB.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?").bind(c.req.param("id"), c.get("user").id).run();
  return c.json({ ok: true });
});

posts.post("/:id/comments", async (c) => {
  const user = c.get("user");
  const p = await loadPost(c.env, c.req.param("id"));
  const body = str((await readBody<{ body: string }>(c)).body, 1000);
  if (!body) fail(400, "댓글 내용을 입력해 주세요.");
  const row = await c.env.DB.prepare(
    "INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING id, created_at",
  )
    .bind(p.id, user.id, body, Date.now())
    .first<{ id: number; created_at: number }>();

  // 소식을 올린 사람 + 이 소식에 댓글을 단 사람들에게 (본인 제외)
  const { results: commenters } = await c.env.DB.prepare("SELECT DISTINCT user_id FROM comments WHERE post_id = ?")
    .bind(p.id)
    .all<{ user_id: number }>();
  const to = [p.user_id, ...commenters.map((r) => r.user_id)].filter((id) => id !== user.id);
  notifyLater(c, "comments", to, { title: `${user.display_name} 님의 댓글`, body: clip(body, 100), postId: p.id });
  return c.json({
    comment: { id: row!.id, body, createdAt: row!.created_at, author: { id: user.id, displayName: user.display_name } },
  });
});

posts.delete("/:id/comments/:commentId", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM comments WHERE id = ? AND post_id = ? AND user_id = ?")
    .bind(Number(c.req.param("commentId")), c.req.param("id"), c.get("user").id)
    .run();
  if (r.meta.changes === 0) fail(404, "본인이 쓴 댓글만 삭제할 수 있습니다.");
  return c.json({ ok: true });
});
