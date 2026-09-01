-- 0013_message_template_type_as_key.sql — v1.1.20 業主決策：type 欄當模板鍵、label 欄存內容、砍 body 欄
--
-- 舊設計：type='message_template'（分類）+ label='new_case'/'timeline'（鍵）+ body（內容）
-- 新設計：type='message_template_new_case'/'message_template_timeline'（鍵）+ label（內容）
-- 理由：type 才是「哪一支模板」的識別，label 回歸它本該的角色（存內容）；body 欄變多餘。
--
-- 前提（已在 production 驗證）：options 中 type='message_template' 僅 4 行——
--   new_case / timeline（active=1，body 已填）、report / empty（active=0，v1.1.15 遺留）。

-- 1) 搬遷兩支在用的模板：type 加前綴當鍵、label 收進 body 內容
UPDATE options
SET type  = 'message_template_' || label,
    label = body
WHERE type = 'message_template'
  AND label IN ('new_case', 'timeline');

-- 2) 刪除舊 report / empty（active=0、無用途；業主決策「沒有辦法修改的兩個不留」）
DELETE FROM options
WHERE type = 'message_template'
  AND label IN ('report', 'empty');

-- 3) 舊的部分索引 WHERE type='message_template' 已無匹配列，變死索引 → 移除
--    （模板查詢只剩 2 行、options 表很小，不需新索引）
DROP INDEX IF EXISTS idx_options_message_template;

-- 4) 砍 body 欄（SQLite ≥3.35 的 DROP COLUMN；D1 現行 SQLite 3.48+，sandbox 3.48 同版）
--    body 內容已全部搬到 label，此步不丢資料。
--    DROP COLUMN 本身不幂等（重跑會 no such column）；正常流程由 d1_migrations hash 追蹤保證只跑一次，
--    本註記供人工重跑前自行確認。
ALTER TABLE options DROP COLUMN body;
