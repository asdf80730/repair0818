-- 0009_vendors_idx_updates_trigger.sql — vendors 複合索引 + ticket_updates 不可變 trigger（v1.1.14）
-- C3：GET /api/vendors 的 ORDER BY active DESC, sort_order, id → 建複合索引加速
CREATE INDEX IF NOT EXISTS idx_vendors_active_sort ON vendors(active, sort_order, id);

-- C4：ticket_updates 為 append-only（時間軸），禁止 UPDATE / DELETE
-- 只允許 INSERT。違反時 RAISE 明確錯誤，避免錯誤程式/migration 竄改時間軸。
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
