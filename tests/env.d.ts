// tests/env.d.ts — 測試環境型別
// cloudflare:test 的 env 是 ProvidedEnv，需 augment 宣告 binding
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database
    PHOTOS: R2Bucket
    TEST_MIGRATIONS: D1Migration[]
    LINE_CHANNEL_ID: string
    JWT_SECRET: string
  }
}
