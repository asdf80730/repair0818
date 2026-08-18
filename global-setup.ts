// global-setup.ts — 在 Node.js 環境把 Pages Functions 編譯成 Worker（供 integration 測試）
// 參考官方 fixture: pages-functions-unit-integration-self/global-setup.ts
// 差異：官方用 --watch + events.once(stdout)，本專案 build 一次即結束，
//       故改為等待 process exit，避免 stdout 關閉後 events.once 永遠等不到。
import childProcess from 'node:child_process'

export default async function () {
  console.log('Building Pages Functions for vitest...')

  // build 到 dist-functions（vitest 預設忽略 dist 變更，故不用 dist）
  const buildProcess = childProcess.spawn(
    'npx wrangler pages functions build --outdir dist-functions',
    { cwd: process.cwd(), shell: true, stdio: 'inherit' },
  )

  // 等 build 完成（exit code 0）或失敗
  const code = await new Promise<number | null>((resolve) => {
    buildProcess.on('exit', resolve)
    buildProcess.on('error', () => resolve(null))
  })

  if (code !== 0) {
    throw new Error(`Pages Functions build failed (exit code ${code})`)
  }
}
