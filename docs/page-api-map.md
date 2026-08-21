# 頁面 → API 對照表（從 app.js 靜態解析）

> 產生方式：解析 public/app.js 各 `pages.X` 函式區段內的 `api()` 呼叫，
> 加上共用函式 `ensureCatalog()`（內部呼叫 `/api/options/catalog`）的呼叫點歸屬。

## 各頁面使用的 API

| 頁面 | 路由 | 呼叫的 API | 備註 |
|---|---|---|---|
| **等待開通** | `#/pending` | 無 | 純 UI |
| **列表** | `#/` | `/api/tickets`<br>`/api/options/catalog`(ensureCatalog) | catalog 用 10 分鐘 TTL 快取 |
| **建單** | `#/new` | `/api/options/catalog`(ensureCatalog **force**) | 短 TTL 30s（v1.1.8） |
| | | `/api/photos`(上傳) | 附加照片時 |
| | | `/api/tickets`(POST) | 送出時 |
| **詳情** | `#/ticket/:id` | `/api/tickets/:id` | 主查詢 |
| | | `/api/options/catalog`(ensureCatalog) | 留言框回報範本用，TTL 快取 |
| | | `/api/photos`(上傳) | 留言附圖時 |
| **編輯** | `#/edit/:id` | `/api/tickets/:id` | 載入 |
| | | `/api/options/catalog`(ensureCatalog **force**) | 短 TTL 30s（v1.1.8） |
| | | `/api/vendors` | 指派廠商下拉 |
| | | `/api/photos`(上傳) | 附加照片時 |
| **統計** | `#/stats` | `/api/stats/summary` | 主查詢 |
| | | `/api/exports/sign` | 匯出 CSV 時 |
| **成員** | `#/users` | `/api/users` | 列表 |
| | | `/api/users/:id`(PATCH) | 改權限/停用時 |
| **管理** | `#/admin` | `/api/options` | 類別/地點/使用範本/回報範本 |
| | | `/api/options/:id`(PATCH) | 編輯選項 |
| | | `/api/vendors` | 廠商 tab |
| | | `/api/vendors/:id`(PATCH) | 編輯廠商 |
| | | `/api/auth/me` | 權限檢查 |
| **公開派工頁** | `/share.html?token=` | `/api/share/:token` | 免登入；**v1.1.12 起由 Pages Function 動態渲染**（無 308） |

## 共用函式
- `ensureCatalog(force)` → `/api/options/catalog`
  - `force=true`（建單/編輯進頁）：**短 TTL 30 秒**（v1.1.8 起，取代每次強制重讀，避免每次進頁吃一次 D1 連線）
  - `force=false`（列表/詳情）：10 分鐘 TTL 快取
  - catalog 回應含 `categories`/`locations`/`descriptions`(使用範本)/`comment_descs`(回報範本)

## 實測耗時（登入狀態，2026-08-20）
| API | 耗時 |
|---|---|
| `/api/hello` | 38ms |
| `/api/tickets`(列表) | 645ms |
| `/api/tickets/:id`(詳情) | 1023ms |
| `/api/options/catalog` | 804ms |
| `/api/options?type=category` | 633ms |
| `/api/vendors` | 776ms |
| `/api/stats/summary` | 743ms |
| `/api/users` | 461ms(403) |
| `/api/share/:token`(公開) | 612ms |

## 各頁面總耗時（依規格 §5 全頁面）
| 規格 | 頁面 | 載入 API | 總耗時 |
|---|---|---|---|
| P0 | 等待開通 | me | 快 |
| P1 | 列表 | tickets + catalog(快取) | ~0.65s |
| P2 | 建單 | catalog(短 TTL 30s) | ~0.8s(冷) / 瞬間(熱) |
| P3 | 詳情 | tickets/:id + catalog | ~1.0s ⚠️最慢 |
| P5 | 統計 | stats/summary | ~0.74s |
| P6 | 成員 | users | ~0.46s |
| P7 | 管理 | options+vendors | ~0.63s |
| — | 公開派工頁 | share/:token | ~0.61s(+0.13s 頁面) |

> 公開派工頁 `/share.html`：**v1.1.12 起由 Pages Function（`functions/share.html.ts`）動態渲染**（server 端查 D1 組 `<title>`，不再有靜態頁 308 重導）；資料 API `/api/share/:token` 為 0.61s。
