-- ============================================================================
-- 0002_replace_seed_from_new_excel.sql
-- 承載 wayfinder map #15「以新 Excel 取代初始資料」的 seed 值集全量取代。
-- 0001_initial.sql 已套用 production（D1 只套未套用者）、一字不可改；本檔為幂等增補層。
--
-- 拍板依據：
--   T2（#17）：options(category/location) ＋ vendors 以新表為唯一來源「全量取代」（非增量）。
--     - category 補 0001 沒有者：冷氣空調／公設設備／健身器材（sort_order 10/11/12）。
--     - vendors 補 0001 沒有者：政統工程(非簽約廠)／岱宇健身器材（sort_order 8/9）。
--     - 消防設備 不在新表 → active=0（非 DELETE，保留列與歷史快照對應）。
--     - 新表 location（H 欄映射後）16 列與 0001 現行完全相同 → 無需增補。
--   T4（#19）：users 以 production repair-db0818 實測 8 列放入；
--     id=1（王任鋒）已由 0001 建入且值一致，本檔只補 id=2..8。
--
-- 幂等寫法（硬性）：
--   options 走 INSERT OR IGNORE（表有 UNIQUE(type,label)）。
--   vendors（name 無 UNIQUE）／users（line_user_id 有 UNIQUE）走 INSERT ... SELECT ... WHERE NOT EXISTS。
-- ============================================================================

-- 工程類別（新表 J 欄 distinct 共 12；下列為 0001 沒有的三個新值）
INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES
  ('category', '冷氣空調', 10, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '公設設備', 11, 1, '2026-09-11T00:00:00.000Z'),
  ('category', '健身器材', 12, 1, '2026-09-11T00:00:00.000Z');

-- 消防設備 不在新表 → 停用（保留列，非 DELETE）
UPDATE options SET active = 0
 WHERE type = 'category' AND label = '消防設備';

-- 報修廠商（新表 F 欄 distinct 共 9；下列為 0001 沒有的兩個新值）
INSERT INTO vendors (name, sort_order, active, created_at)
SELECT '政統工程(非簽約廠)', 8, 1, '2026-09-11T00:00:00.000Z'
 WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name = '政統工程(非簽約廠)');
INSERT INTO vendors (name, sort_order, active, created_at)
SELECT '岱宇健身器材', 9, 1, '2026-09-11T00:00:00.000Z'
 WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name = '岱宇健身器材');

-- users：production repair-db0818 實測 8 列（id=1 已由 0001 建入、值一致，此處只補 2..8）
-- id=3 active=0（停用）、全部 approved_by=NULL，皆如實带入。
INSERT INTO users (id, line_user_id, display_name, role, active, created_at, approved_at, approved_by)
SELECT 2, 'Ub012a7ae1af1ebd03ebd618287f25943', '沒有再用', 'manager', 1, '2026-08-18T18:01:19.677Z', NULL, NULL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE line_user_id = 'Ub012a7ae1af1ebd03ebd618287f25943');
INSERT INTO users (id, line_user_id, display_name, role, active, created_at, approved_at, approved_by)
SELECT 3, 'U723aace9685f14d2cd10fc6e52f6b123', '黃永裕', 'admin', 0, '2026-08-22T04:39:56.188Z', '2026-08-22T04:40:01.027Z', NULL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE line_user_id = 'U723aace9685f14d2cd10fc6e52f6b123');
INSERT INTO users (id, line_user_id, display_name, role, active, created_at, approved_at, approved_by)
SELECT 4, 'U4888179a5125427ded2f8e362710974d', '小潘', 'admin', 1, '2026-08-22T05:58:18.172Z', '2026-08-22T05:59:06.012Z', NULL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE line_user_id = 'U4888179a5125427ded2f8e362710974d');
INSERT INTO users (id, line_user_id, display_name, role, active, created_at, approved_at, approved_by)
SELECT 5, 'Uca5655aa92abb5f25f2f328094e4c68b', '徐寶發 Benson', 'admin', 1, '2026-09-09T03:56:43.147Z', '2026-09-09T04:03:47.902Z', NULL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE line_user_id = 'Uca5655aa92abb5f25f2f328094e4c68b');
INSERT INTO users (id, line_user_id, display_name, role, active, created_at, approved_at, approved_by)
SELECT 6, 'U7db5a3965de5745725330bcca03e9359', '石石石miu', 'admin', 1, '2026-09-09T04:02:46.973Z', '2026-09-09T04:03:49.751Z', NULL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE line_user_id = 'U7db5a3965de5745725330bcca03e9359');
INSERT INTO users (id, line_user_id, display_name, role, active, created_at, approved_at, approved_by)
SELECT 7, 'U9064bfee72d584e0514f33dbe374a7bd', '弘均Frank', 'admin', 1, '2026-10-06T04:10:09.740Z', '2026-10-06T04:10:34.458Z', NULL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE line_user_id = 'U9064bfee72d584e0514f33dbe374a7bd');
INSERT INTO users (id, line_user_id, display_name, role, active, created_at, approved_at, approved_by)
SELECT 8, 'U11af49e13082ab78563c1d6e5968b602', '宇甄', 'admin', 1, '2026-10-06T10:52:12.034Z', '2026-10-06T10:52:45.956Z', NULL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE line_user_id = 'U11af49e13082ab78563c1d6e5968b602');
