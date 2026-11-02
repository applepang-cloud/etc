import { Hono } from "hono";
import { type AppEnv, fail, readBody, str } from "./http";

export const family = new Hono<AppEnv>();

interface ChildRow {
  id: number;
  name: string;
  birth_date: string;
}

const childJson = (r: ChildRow) => ({ id: r.id, name: r.name, birthDate: r.birth_date });

function parseBirthDate(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!d || d.toISOString().slice(0, 10) !== s) fail(400, "생일은 YYYY-MM-DD 형식이어야 합니다.");
  return s;
}

// 가족 정보: 이름, 구성원, 아이들, 초대 코드
family.get("/family", async (c) => {
  const [name, members, children] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT value FROM settings WHERE key = 'family_name'"),
    c.env.DB.prepare("SELECT id, username, display_name FROM users ORDER BY id"),
    c.env.DB.prepare("SELECT id, name, birth_date FROM children ORDER BY birth_date"),
  ]);
  return c.json({
    name: (name.results[0] as { value: string } | undefined)?.value ?? "",
    inviteCode: c.env.INVITE_CODE,
    members: (members.results as { id: number; username: string; display_name: string }[]).map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
    })),
    children: (children.results as unknown as ChildRow[]).map(childJson),
  });
});

family.put("/family", async (c) => {
  const name = str((await readBody<{ name: string }>(c)).name, 30);
  await c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('family_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(name)
    .run();
  return c.json({ ok: true });
});

// 아이 등록/수정/삭제는 가족 누구나 할 수 있습니다.
family.post("/children", async (c) => {
  const b = await readBody<{ name: string; birthDate: string }>(c);
  const name = str(b.name, 20);
  if (!name) fail(400, "이름을 입력해 주세요.");
  const row = await c.env.DB.prepare(
    "INSERT INTO children (name, birth_date, created_at) VALUES (?, ?, ?) RETURNING id, name, birth_date",
  )
    .bind(name, parseBirthDate(b.birthDate), Date.now())
    .first<ChildRow>();
  return c.json({ child: childJson(row!) });
});

family.patch("/children/:id", async (c) => {
  const b = await readBody<{ name: string; birthDate: string }>(c);
  const name = str(b.name, 20);
  if (!name) fail(400, "이름을 입력해 주세요.");
  const row = await c.env.DB.prepare("UPDATE children SET name = ?, birth_date = ? WHERE id = ? RETURNING id, name, birth_date")
    .bind(name, parseBirthDate(b.birthDate), Number(c.req.param("id")))
    .first<ChildRow>();
  if (!row) fail(404, "아이 정보를 찾을 수 없습니다.");
  return c.json({ child: childJson(row) });
});

family.delete("/children/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM children WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});
