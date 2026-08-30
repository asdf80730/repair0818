#!/usr/bin/env python3
"""scripts/check-migration-drift.py — 直查 production D1，比對與 repo migrations 是否一致。

背景（v1.1.19）：production D1 曾漏套 0010/0011/0012（options.body 欄不存在），
導致 /api/stats/daily-report 一律 500（no such column: body）。
這類「migration 已寫進 repo、卻沒套到 production」的漂移，code 層面的測試**永遠抓不到**：
  - 單元測試跑在「全套 migrations 的 fresh D1」（workerd / node shim），schema 必然完整
  - E2E 全走 ?mock=true，真實後端端點從未被碰過
唯有直查 production schema 才能發現。本 script 是該類 bug 的結構性防線。

用法：python3 scripts/check-migration-drift.py
  需 CLOUDFLARE_API_TOKEN 環境變數（wrangler d1 execute --remote，read-only 查詢）。
  - 有 drift（repo 有、production 缺）→ 印 ::error:: 並 exit 1
  - 一致 → exit 0
  - CLOUDFLARE_API_TOKEN 未設 → 印 ::warning:: 並 exit 0（跳過，不擋 build）
"""
import json
import os
import re
import glob
import subprocess
import sys

DB_NAME = 'repair-db0818'  # 與 wrangler.toml 的 [[d1_databases]] database_name 一致


def main() -> int:
    if not os.environ.get('CLOUDFLARE_API_TOKEN'):
        print('::warning::CLOUDFLARE_API_TOKEN 未設，跳過 production D1 migration drift 檢查')
        return 0

    out = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', DB_NAME, '--remote',
         '--command', 'SELECT name FROM d1_migrations ORDER BY id'],
        capture_output=True, text=True,
    )
    # wrangler 輸出含 emoji 前綴，JSON array 從 [ 到 ]
    m = re.search(r'\[.*\]', out.stdout, re.S)
    if not m:
        print('::error::無法解析 wrangler d1 execute 輸出')
        print(out.stdout[:500])
        print(out.stderr[:500])
        return 1

    data = json.loads(m.group(0))
    prod = {r['name'] for r in data[0]['results']}
    repo = {p.split('/')[-1] for p in glob.glob('migrations/*.sql')}
    missing = sorted(repo - prod)

    if missing:
        print('::error::production D1 缺 migration（repo 已寫、尚未套用）：')
        for name in missing:
            print('  -', name)
        print('修法：npx wrangler d1 migrations apply ' + DB_NAME + ' --remote')
        return 1

    extra = sorted(prod - repo)
    if extra:
        print(f'::warning::production 有 repo 沒有的 migration（可能已手動刪檔）：{extra}')
    print(f'✅ production D1 與 repo migrations 一致（{len(prod)} 支）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
