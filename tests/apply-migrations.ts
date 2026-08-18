// tests/apply-migrations.ts — 每個測試檔套用 D1 migration
// 參考官方 D1 fixture：test/apply-migrations.ts
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// Setup files 在 per-test-file storage isolation 之外執行，可能跑多次。
// applyD1Migrations() 只套用尚未套用的 migration，因此安全。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
