-- 0008_vendors_sort.sql — 移除 phone 欄位、加入 sort_order（v1.1.13）
-- 原因：phone 前端完全沒使用（後端存了但 UI 無顯示/編輯），移除改作排序用途。
--       排序與 options.sort_order 同模式；現有資料 sort_order 預設 0。
ALTER TABLE vendors DROP COLUMN phone;
ALTER TABLE vendors ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
