export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
  // secrets
  INVITE_CODE: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  // 푸시 알림 (선택)
  FIREBASE_CONFIG?: string; // 앱용 Firebase 설정 JSON (공개값)
  FCM_SERVICE_ACCOUNT?: string; // 서비스 계정 키 JSON (비밀값)
  FCM_API_BASE?: string; // 테스트용으로만 바꿉니다.
}

export interface User {
  id: number;
  username: string;
  display_name: string;
}
