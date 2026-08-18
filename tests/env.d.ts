// tests/env.d.ts — 測試環境型別
declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    PHOTOS: R2Bucket
    LINE_CHANNEL_ID: string
    JWT_SECRET: string
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}
