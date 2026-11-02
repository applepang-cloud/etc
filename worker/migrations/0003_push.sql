-- 푸시 알림: 기기 토큰과 사람별 알림 설정
CREATE TABLE push_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,          -- android | web
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);

CREATE TABLE notify_settings (
  user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  posts    INTEGER NOT NULL DEFAULT 1,   -- 새 사진·소식
  comments INTEGER NOT NULL DEFAULT 1,   -- 내 소식(또는 내가 댓글 단 소식)의 새 댓글
  likes    INTEGER NOT NULL DEFAULT 1    -- 내 소식의 좋아요
);
