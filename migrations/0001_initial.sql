-- ============================================================================
-- repair0818 初始資料庫 — 單一 squash migration（淨最終態）
-- 心之所向社區 修繕情況統計表 初始資料
--
-- 版本：v1.1.20 之後最終 schema
-- 用途：系統未上線，把 0001~0013 所有 migration 壓平成單一檔，直接建最終結構。
--       不再保留歷史 ALTER ADD/DROP/補插 中間步驟。
-- 選項來源：以 Excel「報修清冊」data validation 為唯一來源；
--       0002 預設的 工程類別(電梯/門禁/水泵/照明/消防) 與 地點(停車場/大廳/梯廳/頂樓/中庭/)
--       已剔除以避免重疊（漏水/其他 因 Excel 也有，改由 Excel 版本保留）。
--       保留 系統功能所需範本：description(建單)、comment_desc(回報)、message_template(每日簡報)。
-- 時間格式一律 ISO8601 UTC
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------- Schema ----------------
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id  TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pending',   -- pending / committee / manager / admin
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,                     -- ISO8601 UTC
  approved_at   TEXT,
  approved_by   INTEGER REFERENCES users(id)
);

CREATE TABLE vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE options (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                        -- category / location / description / comment_desc / message_template_*
  label      TEXT NOT NULL,                        -- 一般選項=顯示文字；message_template_*=模板 body 內容(v1.1.20)
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(type, label)
);

CREATE TABLE option_categories (
  option_id   INTEGER NOT NULL REFERENCES options(id),
  category_id INTEGER NOT NULL REFERENCES options(id),
  PRIMARY KEY (option_id, category_id)
);

CREATE TABLE tickets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id      INTEGER REFERENCES options(id),
  category_label   TEXT NOT NULL,                  -- 建單時快照
  location_id      INTEGER REFERENCES options(id),
  location_label   TEXT NOT NULL,                  -- 快照（= 期別+原始位置）
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'open',   -- open / in_progress / done / void
  vendor_id        INTEGER REFERENCES vendors(id),
  share_token      TEXT UNIQUE NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  closed_at        TEXT,
  closed_by        INTEGER REFERENCES users(id),
  amount           INTEGER,
  amount_at        TEXT
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
  amount     INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type  TEXT,
  target_id    INTEGER,
  r2_key       TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  uploaded_by  INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_tickets_list    ON tickets(status, last_activity_at DESC);
CREATE INDEX idx_tickets_created ON tickets(created_at);
CREATE INDEX idx_updates_ticket  ON ticket_updates(ticket_id, created_at);
CREATE INDEX idx_updates_stats   ON ticket_updates(kind, status, created_at);
CREATE INDEX idx_photos_target   ON photos(target_type, target_id);
CREATE INDEX idx_options_type    ON options(type, active, sort_order);
CREATE INDEX idx_oc_category     ON option_categories(category_id);
CREATE INDEX idx_vendors_active_sort ON vendors(active, sort_order, id);

-- 觸發器：ticket_updates 為 append-only（時間軸不可修改刪除）
CREATE TRIGGER IF NOT EXISTS prevent_ticket_updates_update
BEFORE UPDATE ON ticket_updates
BEGIN
  SELECT RAISE(ABORT, 'ticket_updates is append-only (UPDATE forbidden)');
END;
CREATE TRIGGER IF NOT EXISTS prevent_ticket_updates_delete
BEFORE DELETE ON ticket_updates
BEGIN
  SELECT RAISE(ABORT, 'ticket_updates is append-only (DELETE forbidden)');
END;

-- ---------------- 初始資料 ----------------
-- 管理員：王任鋒（created_by 統一引用 id=1）
INSERT INTO users (id, line_user_id, display_name, role, active, created_at)
VALUES (1, 'Ucd377f91b66f4f0f7a382a21b3862f15', '王任鋒', 'admin', 1, '2026-09-11T00:00:00.000Z');

-- 工程類別（Excel J欄）→ options.category
INSERT INTO options (type, label, sort_order, active, created_at) VALUES
  ('category', '弱電修繕',   1, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '機電修繕',   2, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '電梯修繕',   3, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '園藝植栽',   4, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '泳池設備',   5, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '消防設備',   6, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '漏水',       7, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '地磚泥作',   8, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '水電項目',   9, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '其他',      99, 1, '2026-09-11T00:00:00.000Z');

-- 報修地點（Excel H欄，合併期別）→ options.location
INSERT INTO options (type, label, sort_order, active, created_at) VALUES
  ('location', '三期A',         1, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期B',         2, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期B1地下室公設',3, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期B2地下室公設',4, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期B3地下室公設',5, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期C',         6, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期D',         7, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期E',         8, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期F',         9, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期J',        10, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期K',        11, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期一樓外圍',  12, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '三期公共區域',  13, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期B1地下室公設',14, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期B2地下室公設',15, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期B3地下室公設',16, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期G',        17, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期H',        18, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期I',        19, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期I棟',      20, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期J',        21, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期K',        22, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期一樓外圍',  23, 1, '2026-09-11T00:00:00.000Z'),
  ('location', '四期公共區域',  24, 1, '2026-09-11T00:00:00.000Z');

-- 報修廠商（Excel F欄）→ vendors
INSERT INTO vendors (name, sort_order, active, created_at) VALUES
  ('富華創新',   1, 1, '2026-09-11T00:00:00.000Z'),
  ('順宏弱電',   2, 1, '2026-09-11T00:00:00.000Z'),
  ('國霖機電',   3, 1, '2026-09-11T00:00:00.000Z'),
  ('OTIS電梯',   4, 1, '2026-09-11T00:00:00.000Z'),
  ('園藝',       5, 1, '2026-09-11T00:00:00.000Z'),
  ('智生活',     6, 1, '2026-09-11T00:00:00.000Z'),
  ('其它',       7, 1, '2026-09-11T00:00:00.000Z');

-- 建單說明範本　→ options.description
INSERT INTO options (type, label, sort_order, active, created_at) VALUES
  ('description', '水泵浦異音',   1, 1, '2026-09-11T00:00:00.000Z'),
  ('description', '照明故障',     2, 1, '2026-09-11T00:00:00.000Z'),
  ('description', '門禁感應不良', 3, 1, '2026-09-11T00:00:00.000Z'),
  ('description', '水管滲漏',     4, 1, '2026-09-11T00:00:00.000Z'),
  ('description', '油漆剝落',     5, 1, '2026-09-11T00:00:00.000Z'),
  ('description', '其他',        99, 1, '2026-09-11T00:00:00.000Z');

-- 回報範本　→ options.comment_desc
INSERT INTO options (type, label, sort_order, active, created_at) VALUES
  ('comment_desc', '已通知廠商處理', 1, 1, '2026-09-11T00:00:00.000Z'),
  ('comment_desc', '已到場勘查',     2, 1, '2026-09-11T00:00:00.000Z'),
  ('comment_desc', '待料中',         3, 1, '2026-09-11T00:00:00.000Z'),
  ('comment_desc', '已修復完成',     4, 1, '2026-09-11T00:00:00.000Z'),
  ('comment_desc', '需追蹤',         5, 1, '2026-09-11T00:00:00.000Z');

-- 訊息模板（每日簡報）→ options.message_template_new_case / _timeline
INSERT INTO options (type, label, sort_order, active, created_at) VALUES
  ('message_template_new_case', '{{#each new_cases}}
{{id}}. {{location_label}}　{{status}}　{{description}}
{{/each}}', 0, 1, '2026-09-11T00:00:00.000Z'),
  ('message_template_timeline', '{{#each timeline_updates}}
{{id}}. {{location_label}}　{{status}}　{{note}}
{{/each}}', 1, 1, '2026-09-11T00:00:00.000Z');

-- ============================================================================
-- 以下為 150 筆初始報修單（tickets）
-- 狀態映射：已完成/售服系統已結案→done｜取消報修/重複報修→void
--           已報修→in_progress(amount=1)｜已報修等報價/未報修/空白→open
-- 說明：原項次/報修人/報修方式 併入 description（報修方式無值則不寫）
-- 廠商空白→vendor_id=NULL；category/location 由 label 子查詢對應 id
-- ============================================================================
