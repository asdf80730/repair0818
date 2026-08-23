// tests/node/cloudflare-test-shim.ts — 取代 'cloudflare:test' 的本地 shim
// 透過 vitest.node.config.ts 的 resolve.alias 把 'cloudflare:test' 指到這裡，
// 測試檔本身零改動。匯出面與官方一致：SELF / env / applyD1Migrations。
//
// ⚠️ workers pool 的 isolatedStorage 是「每個 test 都有全新 DB」；
// 本地等價實現：beforeEach 重置 in-memory DB + R2，並重新套 migration。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach } from 'vitest'
import { app } from '../../src/app'
import type { Env } from '../../src/lib/env'
import { D1Shim } from './d1'
import { R2Stub } from './r2'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(here, '../../migrations')

// ── env：與 workers pool 的 ProvidedEnv 對應 ──────────────────────────
function freshDb() {
  const db = new D1Shim()
  db.raw.exec('PRAGMA foreign_keys = ON')
  db.applyMigrations(migrationsDir) // 等價 apply-migrations.ts setup：fresh DB 全套 migration + seed
  return db
}

let db = freshDb()
export const PHOTOS = new R2Stub()

export const env = {
  get DB() {
    return db
  },
  PHOTOS,
  TEST_MIGRATIONS: [] as string[], // 僅為型別/介面相容；migration 已直接套用
  LINE_CHANNEL_ID: 'test-channel',
  JWT_SECRET: 'test-secret',
} as unknown as Env & { TEST_MIGRATIONS: string[] }

// 每個 test 前重置（等價 workers pool isolatedStorage）
beforeEach(() => {
  db = freshDb()
  PHOTOS.clear()
})

// ── SELF：包成 worker.fetch(url, init) 形式，內部走 Hono app.request ──
export const SELF = {
  fetch: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = init === undefined && input instanceof Request ? input : new Request(input, init)
    return app.fetch(req, env, undefined)
  },
}

// ── applyD1Migrations：本地版直接 no-op（setup 時已套完，且 fresh DB 不需要追蹤）──
export async function applyD1Migrations(_db: unknown, _migrations: unknown) {
  return // migrations 已在 module load 時全量套用
}

export default { SELF, env, applyD1Migrations }
