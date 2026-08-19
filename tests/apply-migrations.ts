// tests/apply-migrations.ts — 每個測試檔套用 D1 migration + seed 預設選項
// 參考官方 AGENTS.md：env 從 cloudflare:test 匯入（對應 miniflare pool options binding）
import { applyD1Migrations, env } from 'cloudflare:test'
import { readFileSync } from 'node:fs'

// Setup files 在 per-test-file storage isolation 之外執行，可能跑多次。
// applyD1Migrations() 只套用尚未套用的 migration，因此安全。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

// seed 預設選項（§2.3 seed.sql 為單一來源，測試直接讀取執行）
// seed.sql 用 INSERT OR IGNORE，避免 setup 多次執行時 UNIQUE(type,label) 衝突
const seedSql = readFileSync(new URL('../seed.sql', import.meta.url), 'utf8')
await env.DB.exec(seedSql)
