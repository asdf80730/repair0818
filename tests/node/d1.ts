// tests/node/d1.ts — D1 shim over node:sqlite（本地快速回饋用）
// ⚠️ 語意近似而非 100% 相等：錯誤訊息格式、meta 欄位細節與真 D1 有差。
// CI 的 workers pool（vitest.config.ts）仍是唯一真相；本 shim 只供本地開發迴圈。
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

// 用 require 載入，避免 vite 對新內建模組 node:sqlite 的解析問題
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: any }

type BindValue = string | number | bigint | null | Uint8Array

function norm(v: unknown): BindValue {
  if (v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  return v as BindValue
}

function d1Err(sql: string, e: unknown): never {
  throw new Error(`D1_ERROR: ${sql.trim().slice(0, 80)}: ${(e as Error).message}`)
}

export class D1Shim {
  private db: DatabaseSync

  constructor(db?: DatabaseSync) {
    this.db = db ?? new DatabaseSync(':memory:')
  }

  get raw(): DatabaseSync {
    return this.db
  }

  exec(sql: string) {
    this.db.exec(sql)
    return { success: true }
  }

  prepare<T = Record<string, unknown>>(sql: string) {
    const self = this
    const isSelect = /^\s*(SELECT|WITH|PRAGMA|VALUES)/i.test(sql)

    function makeBound(values: unknown[]) {
      const args = values.map(norm)
      let stmt: ReturnType<DatabaseSync['prepare']> | null = null
      const getStmt = () => (stmt ??= self.db.prepare(sql))

      async function runLike() {
        try {
          const info = getStmt().run(...(args as never[]))
          return {
            results: [] as T[],
            success: true,
            meta: {
              changes: Number(info.changes),
              last_row_id: Number(info.lastInsertRowid),
              duration: 0,
              rows_read: 0,
              rows_written: 0,
            },
          }
        } catch (e) { d1Err(sql, e) }
      }

      async function allLike<R>() {
        try {
          const rows = getStmt().all(...(args as never[])) as R[]
          return { results: rows, success: true, meta: { duration: 0, changes: 0, rows_read: rows.length, rows_written: 0 } }
        } catch (e) { d1Err(sql, e) }
      }

      return {
        async run() { return isSelect ? allLike<T>() : runLike() },
        async first<R = T>(colName?: string): Promise<R | null> {
          try {
            const row = getStmt().get(...(args as never[])) as Record<string, unknown> | undefined
            if (!row) return null
            if (colName !== undefined) return (row[colName] ?? null) as R
            return row as R
          } catch (e) { d1Err(sql, e) }
        },
        async all<R = T>() { return allLike<R>() },
        async raw<R = unknown[]>(): Promise<R> {
          return getStmt().all(...(args as never[])) as R
        },
        // batch() 內部用：取得完整結果（含 INSERT 的 meta.last_row_id）
        __execForBatch<R = T>(): Promise<{ results: R[]; success: boolean; meta: Record<string, number> }> {
          return isSelect ? allLike<R>() : runLike()
        },
        __boundArgs: args,
      }
    }

    const unbound = makeBound([])
    return {
      sql,
      bind: (...values: unknown[]) => makeBound(values),
      run: unbound.run,
      first: unbound.first,
      all: unbound.all,
      raw: unbound.raw,
      __execForBatch: unbound.__execForBatch,
    }
  }

  async batch<T = Record<string, unknown>>(
    statements: Array<ReturnType<D1Shim['prepare']>['bind']> extends (f: infer F) => any ? ReturnType<F>[] : never[],
  ) {
    const out: Array<{ results?: T[]; success: boolean; meta: Record<string, number> }> = []
    for (const s of statements) {
      out.push(await (s as any).__execForBatch<T>())
    }
    return out
  }

  dump(): ArrayBuffer { throw new Error('dump() not supported in local shim') }

  /** 套用 migrations/*.sql（依檔名字母序） */
  applyMigrations(dir: string) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    for (const f of files) {
      this.db.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
    }
    return files.length
  }
}
