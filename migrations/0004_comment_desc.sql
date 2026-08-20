-- 0004_comment_desc.sql — 回報範本選項類型（§4.6 v1.1.9）
-- 建單用「故障類型範本」(description)；回報/留言用「回報範本」(comment_desc)，兩者分開管理
-- INSERT OR IGNORE：重複套用時 UNIQUE(type,label) 不衝突
-- 回報範本為通用追蹤說明，不綁類別（不寫 option_categories）
-- 時間格式一律 ISO8601 UTC

INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES
  ('comment_desc', '已通知廠商處理', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('comment_desc', '已到場勘查',     2, 1, '2026-01-01T00:00:00.000Z'),
  ('comment_desc', '待料中',         3, 1, '2026-01-01T00:00:00.000Z'),
  ('comment_desc', '已修復完成',     4, 1, '2026-01-01T00:00:00.000Z'),
  ('comment_desc', '需追蹤',         5, 1, '2026-01-01T00:00:00.000Z');
