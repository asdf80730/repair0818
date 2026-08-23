# 社區修繕管理系統

社區管委會用的修繕案件管理 LINE 應用：住戶／委員透過 LINE LIFF 報修，管理公司派單給廠商，廠商透過公開分享連結接收派工單。

- **正式網域**：https://repair-system-4re.pages.dev
- **完整規格**：[docs/SPEC.md](docs/SPEC.md)（v1.1.15 定稿，單一真相來源）
- **施工規則**：[CLAUDE.md](CLAUDE.md)

## 技術棧

- 後端：Cloudflare Pages Functions + [Hono](https://hono.dev)（TypeScript）
- 資料庫：Cloudflare D1（SQLite）
- 儲存：Cloudflare R2（案件照片）
- 認證：LINE LIFF（`getIDToken`）＋自簽 JWT（jose）＋ HttpOnly Cookie
- 前端：原生 JS SPA（無框架），hash router，純 JS、第三方套件一律 vendored 至 `public/vendor/`
- 測試：`@cloudflare/vitest-pool-workers`（單元）+ Playwright（E2E）

## 專案結構

```
functions/api/[[path]].ts   # Pages Functions 唯一入口
src/                        # Hono 後端（app.ts + routes/ + lib/）
migrations/                 # D1 migrations（含 seed）
public/                     # 前端靜態檔（app.js SPA + share.js + style.css + vendor/）
tests/                      # 單元測試（workerd runtime）
e2e/                        # Playwright E2E
docs/                       # SPEC / lib-spec / test-cases / page-api-map / archive/
```

## 本機開發

```bash
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest（需在 glibc 環境跑，Alpine/musl 跑不了）
npm run dev          # wrangler pages dev
npm run deploy       # wrangler pages deploy public
npm run db:migrate:remote  # 套用 D1 migration 到 production
```

## 測試注意

- 單元測試（workerd）是 glibc binary，**Alpine musl 沙箱跑不了** → 靠 GitHub Actions CI。
- E2E 對正式網域跑 `?mock=true`（用 `public/vendor/liff-mock.js` 繞過真實 LINE 登入）。

## 文件導覽

| 文件 | 用途 |
|---|---|
| `docs/SPEC.md` | 最新規格（含 §0.1 版本歷程）——查現況、查變更歷史都看這份 |
| `docs/lib-spec.md` | `src/lib/` 共用層介面規格 |
| `docs/test-cases.md` | 測試案例與測試檔結構 |
| `docs/page-api-map.md` | 頁面 → API 對照表＋實測耗時 |
| `docs/archive/` | 歷史變更需求報告（已施工、內容被 SPEC 吸收） |

## v1.1.15 主要變更

- **案件動態訊息框**：統計頁新增「案件動態」區塊，manager/admin 可用 F1 daily-report + F5 變數模板產生訊息、複製貼到 LINE 群組
- **訊息模板管理頁**：manager/admin 從「管理」頁 tab「訊息模板」進入（F11-1 業主決策：放管理內、不從 nav 進）
- **F2 日期選擇器**：任選一天、max=今天、`localStorage` 記住類別
- **LIFF 進入點健化**：C1 loggingIn flag、C2 openWindow fallback、C3 boot 兜底
- **A4 el() 白名單**：dev-only 拼錯警告（production 靜默）
- **A5 留言/回報/作廢/重開**：局部刷新時間軸（不再整頁 reload）
- 詳細變更與決策紀錄：[docs/archive/v1.1.15-變更需求報告.md](docs/archive/v1.1.15-變更需求報告.md)（2026-08-23 已封存）、[docs/SPEC.md](docs/SPEC.md) §0.1 版本歷程
