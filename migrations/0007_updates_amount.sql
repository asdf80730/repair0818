-- 0007_updates_amount.sql — ticket_updates 發包金額欄位（v1.1.12）
-- 讓時間軸的「已發包(in_progress)」更新紀錄帶金額，時間軸可顯示發包金額
ALTER TABLE ticket_updates ADD COLUMN amount INTEGER;
