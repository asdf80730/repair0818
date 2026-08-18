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
  }
  Variables: {
    user: User
  }
}

export type AppContext = Context<Env>
