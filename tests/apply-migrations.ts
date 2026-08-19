// tests/apply-migrations.ts — 每個測試檔套用 D1 migration + seed 預設選項
// 參考官方 AGENTS.md：env 從 cloudflare:test 匯入（對應 miniflare pool options binding）
import { applyD1Migrations, env } from 'cloudflare:test'

// Setup files 在 per-test-file storage isolation 之外執行，可能跑多次。
// applyD1Migrations() 只套用尚未套用的 migration，因此安全。
// seed 預設選項已併入 migrations/0002_seed.sql（INSERT OR IGNORE，單一來源）
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
