// src/lib/env.ts — 全域環境型別
import type { Context } from 'hono'

export type Role = 'pending' | 'committee' | 'manager' | 'admin'

export type User = {
  id: number
  role: Role
}

export type Env = {
  Bindings: {
    DB: D1Database
    PHOTOS: R2Bucket
    LINE_CHANNEL_ID: string
    JWT_SECRET: string
    // A7（v1.1.14）：Cloudflare Pages 建置自動注入部署 commit SHA（可能缺，選填）
    CF_PAGES_COMMIT_SHA?: string
  }
  Variables: {
    user: User
    // JWT 有效但 active=0（停用者）時由 resolveUser 設標記，requireAuth 據此回 403 DISABLED 而不再重查 D1
    disabledUser: boolean
  }
}

export type AppContext = Context<Env>
