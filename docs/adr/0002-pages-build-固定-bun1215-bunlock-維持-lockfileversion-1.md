# 0002 — Pages build 固定 bun@1.2.15，`bun.lock` 維持 lockfileVersion 1

- Status: accepted
- Date: 2026-09-30

## Context

1. CF Pages 的 build runner 為 `bun@1.2.15`；本機 bun 為 1.4.x。
2. bun 1.4.x 寫出的 `bun.lock` 檔頭為 `"lockfileVersion": 2`；1.2.15 不識 v2 → `Unknown lockfile version` → `Ignoring lockfile` → 在 `--frozen-lockfile` 下視為 lockfile 有變更，build exit 1。
3. 實測（2026-09-30）：v2 lock 使 Pages build 連續紅、production 部署凍在最後一次成功 build（`hello.commit` 停滯不進）；本機 1.4.2 讀 `lockfileVersion: 1` 之同一份 lock：`--frozen-lockfile` → no changes。

## Decision

1. `bun.lock` 的 `lockfileVersion` 標持 **1**。
2. 本機以任何 bun 版次重生 lock 後，必检查第 2 行仍為 `"lockfileVersion": 1`，不是則手工改回再 commit。
3. 判準以本機迴圈為準：`bun install --frozen-lockfile` 綠 ＋ `bun run test:local` 全綠 ＋ CI（`test.yml`）綠。

## Consequences

1. 本機 1.4.x 對 v1 標記解析正常，且不會覆寫版次號（實測 no-changes）。
2. 日後若 CF runner 升級到識得 v2 的 bun，本規則可隨之簡化；在那之前以 v1 為唯一格式。
