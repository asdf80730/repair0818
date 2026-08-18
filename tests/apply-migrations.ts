// tests/apply-migrations.ts — 每個測試檔套用 D1 migration + seed 預設選項
// 參考官方 AGENTS.md：env 從 cloudflare:test 匯入（對應 miniflare pool options binding）
import { applyD1Migrations, env } from 'cloudflare:test'

// Setup files 在 per-test-file storage isolation 之外執行，可能跑多次。
// applyD1Migrations() 只套用尚未套用的 migration，因此安全。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

// seed 預設選項（對應 seed.sql，供建單測試使用 category/location/description）
// INSERT OR IGNORE：避免 setup 多次執行時 UNIQUE(type,label) 衝突
await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES ('category', '電梯', 1, 1, '2026-01-01T00:00:00.000Z')"),
  env.DB.prepare("INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES ('category', '門禁', 2, 1, '2026-01-01T00:00:00.000Z')"),
  env.DB.prepare("INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES ('location', '停車場', 1, 1, '2026-01-01T00:00:00.000Z')"),
  env.DB.prepare("INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES ('location', '大廳', 2, 1, '2026-01-01T00:00:00.000Z')"),
])
