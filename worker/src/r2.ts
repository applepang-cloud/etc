import { AwsClient } from "aws4fetch";
import type { Env } from "./env";

// 서명된 URL 유효 기간. 서명 시각을 하루 단위로 고정해서 같은 날에는 같은 URL이
// 나오게 합니다. 그래야 브라우저/앱 캐시가 재사용되어 썸네일을 다시 받지 않습니다.
const URL_TTL_SECONDS = 2 * 24 * 60 * 60;
const UPLOAD_TTL_SECONDS = 60 * 60;

let client: AwsClient | undefined;

function r2Client(env: Env): AwsClient {
  client ??= new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  return client;
}

function objectUrl(env: Env, key: string): URL {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${path}`);
}

function amzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export async function presignGet(env: Env, key: string): Promise<string> {
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(URL_TTL_SECONDS));
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const signed = await r2Client(env).sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true, datetime: amzDate(startOfDay) },
  });
  return signed.url;
}

export async function presignPut(env: Env, key: string): Promise<string> {
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_TTL_SECONDS));
  const signed = await r2Client(env).sign(new Request(url, { method: "PUT" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}
