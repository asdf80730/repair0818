-- 0002_seed.sql — 預設選項 seed（§2.3）
-- 併入 migration 作為唯一來源：vitest 自動套用、production 用 wrangler d1 migrations apply
-- INSERT OR IGNORE：重複套用時 UNIQUE(type,label) 不衝突
-- 預設選項為初始值，上線後由管理公司在 P7 自行維護
-- 時間格式一律 ISO8601 UTC

INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES
  ('category', '電梯', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '門禁', 2, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '水泵', 3, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '照明', 4, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '消防', 5, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '漏水', 6, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '其他', 99, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '停車場', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '大廳',   2, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '梯廳',   3, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '頂樓',   4, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '中庭',   5, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '其他',  99, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '水泵浦異音',   1, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '照明故障',     2, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '門禁感應不良', 3, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '水管滲漏',     4, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '油漆剝落',     5, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '其他',        99, 1, '2026-01-01T00:00:00.000Z');
