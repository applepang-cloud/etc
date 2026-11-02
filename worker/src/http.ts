import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env, User } from "./env";

export type AppEnv = { Bindings: Env; Variables: { user: User } };
export type Ctx = Context<AppEnv>;

export function fail(status: 400 | 401 | 403 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}

export async function readBody<T>(c: Ctx): Promise<Partial<T>> {
  try {
    const v = await c.req.json();
    return v && typeof v === "object" ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}

export function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/** "<숫자>_<id>" 형식의 페이지 커서 */
export function parseCursor(cursor: string | undefined): { ts: number; id: string } | null {
  if (!cursor) return null;
  const i = cursor.indexOf("_");
  const ts = Number(cursor.slice(0, i));
  return i > 0 && Number.isFinite(ts) ? { ts, id: cursor.slice(i + 1) } : null;
}

export function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}
