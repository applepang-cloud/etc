-- 게시물(글 + 여러 장의 사진/영상), 댓글, 좋아요, 아이 정보, 가족 설정

CREATE TABLE posts (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL DEFAULT '',
  posted_at  INTEGER NOT NULL,   -- 타임라인에 표시되는 날짜 (올린 사람이 바꿀 수 있음)
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_posts_feed ON posts(posted_at DESC, id DESC);

ALTER TABLE media ADD COLUMN post_id TEXT REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE media ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media ADD COLUMN preview_key TEXT;
ALTER TABLE media ADD COLUMN taken_at INTEGER;  -- 찍은 시각 (사진 정보에서 읽음, 없으면 게시 날짜 사용)
CREATE INDEX idx_media_post ON media(post_id, position);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);

CREATE TABLE likes (
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE children (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  birth_date TEXT NOT NULL,      -- YYYY-MM-DD
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 이전 버전에서 올린 파일은 파일 하나당 게시물 하나로 옮깁니다.
INSERT INTO posts (id, user_id, body, posted_at, created_at)
  SELECT id, user_id, '', created_at, created_at FROM media WHERE status = 'ready';
UPDATE media SET post_id = id WHERE status = 'ready';
