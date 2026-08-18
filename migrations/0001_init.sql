-- 0001_init.sql — 社區修繕管理系統 初始 schema（§2.1）
-- 時間格式一律 ISO8601 UTC；禁止 datetime('now')

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id  TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pending',   -- pending / committee / manager / admin
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,                     -- ISO8601 UTC
  approved_at   TEXT,
  approved_by   INTEGER REFERENCES users(id)       -- 保留欄位，v1 無畫面使用
);

CREATE TABLE vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE options (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                        -- category / location / description
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(type, label)
);

CREATE TABLE tickets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id      INTEGER REFERENCES options(id),
  category_label   TEXT NOT NULL,                  -- 建單時快照，選項改名不影響歷史
  location_id      INTEGER REFERENCES options(id),
  location_label   TEXT NOT NULL,                  -- 同上
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'open',   -- open / in_progress / done / void
  vendor_id        INTEGER REFERENCES vendors(id),
  share_token      TEXT UNIQUE NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  closed_at        TEXT,        -- 結案或作廢時間；reopen 時清空
  closed_by        INTEGER REFERENCES users(id)
  -- 無 ticket_no：顯示用 '#' + id 補零 4 位，由後端組 title 時產生
  -- 無 updated_at：刻意刪除，由 last_activity_at 涵蓋（非漏抄）
);

CREATE TABLE ticket_updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL CHECK (kind IN ('status','comment','system')),
  status     TEXT CHECK (
               (kind = 'status' AND status IN ('open','in_progress','done','void'))
               OR (kind IN ('comment','system') AND status IS NULL)
             ),
  note       TEXT CHECK (
               (kind = 'comment' AND note IS NOT NULL AND note <> '')
               OR (kind IN ('status','system'))
             ),
  created_at TEXT NOT NULL
  -- 只能新增，不可修改刪除
  -- CHECK 約束讓資料庫成為第二道防線：AI 寫錯 kind/status/note 組合會在 INSERT 時被擋
);

CREATE TABLE photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type  TEXT,                          -- ticket / update；NULL = 尚未綁定
  target_id    INTEGER,
  r2_key       TEXT NOT NULL,                 -- photos/{uuid}，無副檔名
  content_type TEXT NOT NULL,                 -- image/jpeg | image/png | image/webp
  size_bytes   INTEGER NOT NULL,
  uploaded_by  INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_tickets_list    ON tickets(status, last_activity_at DESC);
CREATE INDEX idx_tickets_created ON tickets(created_at);
CREATE INDEX idx_updates_ticket  ON ticket_updates(ticket_id, created_at);
CREATE INDEX idx_photos_target   ON photos(target_type, target_id);
CREATE INDEX idx_options_type    ON options(type, active, sort_order);
