// global-setup.ts — 在 Node.js 環境把 Pages Functions 編譯成 Worker（供 integration 測試）
// 參考官方 fixture: pages-functions-unit-integration-self/global-setup.ts
import childProcess from 'node:child_process'
import events from 'node:events'

export default async function () {
  console.log('Building Pages Functions for vitest...')

  // 不 build 到 dist（vitest 預設忽略 dist 變更），build 到 dist-functions
  const buildProcess = childProcess.spawn(
    'npx wrangler pages functions build --outdir dist-functions',
    { cwd: process.cwd(), shell: true },
  )
  buildProcess.stdout.pipe(process.stdout)
  buildProcess.stderr.pipe(process.stderr)

  // 等第一次 build 完成
  await events.once(buildProcess.stdout, 'data')

  // teardown 時停止 watch
  return () => {
    buildProcess.kill()
  }
}
