-- 0006_amount.sql — 發包金額欄位（v1.1.12）
-- 需求：處理中拆成「詢價中(open)」與「已發包(in_progress)」兩段語意
-- 不新增狀態值，in_progress 代表已發包；改成已發包時必填金額
-- amount：發包金額（可空，未發包/詢價中為 NULL）
-- amount_at：發包時間（ISO8601 UTC），統計「各類別金額」以發包時間為月份基準
ALTER TABLE tickets ADD COLUMN amount INTEGER;
ALTER TABLE tickets ADD COLUMN amount_at TEXT;
