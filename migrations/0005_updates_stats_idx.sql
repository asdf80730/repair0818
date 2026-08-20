-- 0005_updates_stats_idx.sql — 統計查詢複合索引（v1.1.11 F4）
-- month_done 查詢需同時過濾 kind、status、created_at（§4.7）
-- 0001 已套 production 不可改，故以新 migration 補索引
-- 防：SELECT COUNT(DISTINCT ticket_id) FROM ticket_updates
--     WHERE kind='status' AND status='done' AND created_at >= ? AND created_at < ?
--     全表掃描 → 改走複合索引
CREATE INDEX IF NOT EXISTS idx_updates_stats ON ticket_updates(kind, status, created_at);
