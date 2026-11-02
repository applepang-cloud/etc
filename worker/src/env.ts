export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
  // secrets
  INVITE_CODE: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

export interface User {
  id: number;
  username: string;
  display_name: string;
}
