

# 社區修繕管理系統 開發文件

**版本：v1.1.20（定稿，可施工）** ｜ 日期：2026-09-01

> 本文件為 v1.0 → v1.1 → v1.1.1 → v1.1.2 → v1.1.3 → v1.1.4 → v1.1.5 → v1.1.6 → v1.1.7 → v1.1.8 → v1.1.9 → v1.1.10 → v1.1.11 → v1.1.12 → v1.1.13 → v1.1.14 → v1.1.15 → v1.1.16 → v1.1.17 → v1.1.18 → v1.1.19 → v1.1.20 合併後的完整規格，單獨即可作為施工依據，無需回查舊版。

---

## 0. 版本歷程與決策紀錄

### 0.1 版本歷程

| 版本 | 內容 |
|---|---|
| v1.1.14 | **第二階段後端＋前端＋測試基建全數施工**（E/F/G 交接審查批次＋A/B/C 待辦）：① **詳情權限**——`can_edit` 由後端計算（方案B，詳情不回 `created_by`，前端讀 `t.can_edit`）；② **狀態流**——後端鎖退回（`in_progress→open` 禁）、允許 `open→done`、`in_progress→in_progress` 允許（多次發包覆寫）；③ **void/reopen 競態**——改兩步寫入（先 UPDATE 查 changes 成功才 INSERT，避免 batch+EXISTS 依序讀新狀態的假時間軸）；④ **CSV**——日期真驗證（擋 2026-99-99 500）、`to` 邊界、`from<=to`、injection 忽略前導空白、加發包金額/時間欄；⑤ **登入 upsert 防競態**；⑥ **統計**——完成率方案②（期初未結案分母）、月份切換＋Promise.all；⑦ **session 滑動續期**（exp<900 換發）；⑧ **詳情合併查詢**（4→2 roundtrip）；⑨ **編輯頁**補照片 UI／loading／清空廠商；⑩ **CI**部署版本比對、migration 0009（vendors 索引＋ticket_updates append-only trigger）、PRAGMA FK、committee CSV 403 測試、E2E 補照片/void/reopen。CI 全綠、已部署 |
| v1.1.15 | **案件動態訊息框＋訊息模板系統**（業主 2026-08-23 拍板全部照做）：① **F1 新增** `GET /api/stats/daily-report?date=YYYY-MM-DD&category_id=N`（三角色可讀；當日新建 + last_activity_at 當日既有各算一組，updates_today 最多 3 筆、含 amount）；② **F6 新增** `/api/message-templates` CRUD（沿用既有 options 字典表，type='message_template'）；③ **F8** 純函式模板引擎 `{{var}}` 替換 + `{{#each}}...{{/each}}` 迴圈（含巢狀、缺值容錯、`created_at_time`/`note_or_status`/`amount_text` 自動變數）；④ **F2/F3** 統計頁新增「案件動態」區塊——日期選擇器（max=今天）+ 類別下拉（localStorage 記住）+ 複製按鈕（clipboard+execCommand fallback）+ textarea 即時預覽；⑤ **F7** 訊息模板管理頁（從 `pages.admin` tab 進入，F11-1），含雙層下拉變數插入 + 點擊插入面板 + textarea IntelliSense + 即時預覽 + G7 重置為出廠預設按鈕；⑥ **LIFF 進入點健化**：C1 `loggingIn` flag 防 `liff.login()` 迴圈、C2 `openWindow` fallback、C3 外部瀏覽器 boot 兜底錯誤提示、C4 topbar 顯式回列表按鈕；⑦ **A3** NETWORK 錯誤不再靜默吞掉；⑧ **A5** 留言/作廢/重開後 `router()` 局部刷新（不再 `location.reload()`）；⑨ **A6** catalog 失敗提示訊息改用具體錯誤；⑩ **D6/D7** 下拉省略號 + 列表 max-height；⑪ **D8/D9** 統計頁 5s polling + 切頁 200ms 防抖；⑫ **D1** 照片綁定 race 防護（先驗 photos.status='linked' 後再 INSERT binding）、**D5** 索引、**D3** 預計 page 切換時取消舊請求；⑬ **A4** el() 事件名白名單 dev-only（IS_DEV 判斷 localhost / ?dev / ?mock，production 靜默）。**業主決策**：D2 CHECK 約束先不做（用途不明 + 風險過高）；A1 採補測試方案（b）append-only 重建留 v1.1.16+；A7 `app.js` module 封裝留 v1.1.16+（結構重構不混進本版）。**F11 第三輪整合**（2026-08-23）：F11-1 訊息模板入口放 admin 內不從 nav / F11-2 daily-report `date` 驗證錯誤碼 `MISSING_DATE/INVALID_DATE/DATE_FUTURE` + `taipeiToday()` helper / F11-3 seed body 不含 `{{#if}}` / F11-4 `note_or_status` 加 `kind='system'` 第三態分支 / F11-5 daily-report 回應加 `template.body` / F11-6 既有 ticket 加 `last_activity_at` 時間過濾 / F11-7 半開區間 `[startMs, endMs)`（毫秒數字）取代 `BETWEEN`（caller 自轉 ISO）。**F12 簡化決策**：F12-1 `updates_today` 時間正序（ASC）/ F12-2 模板管理用既有 `options` 字典表（不新開表）+ `option_categories` 關聯表。CI 158/160 unit + 25 E2E 全綠、production 已部署 v1.1.15 |
| v1.1.16 | **案件動態訊息簡化**（業主 2026-08-23 拍板）：① **砍後端 templateEngine**——刪除 `src/lib/templateEngine.ts`，模板渲染全移到前端（`public/templateEngine.js` 負責管理頁即時預覽＋統計頁成品拼裝）；② **daily-report（F1）改回應純資料 + 兩種模板 body**：回傳 `new_cases[]`（案件編號.地點.詢價中.描述）、`timeline_updates[]`（既有案件當日 update 拉平，案件編號.地點.狀態.留言）、`templates:{new_case,timeline}`（可編輯 body，seed 於 migration 0012）＋`has_content` 布林、`date`(unix seconds)；前端自行拼 `修繕系統簡報：{X月Y日}` + s1/s2 + （僅有內容時追加總系統連結），空案時分別顯示「今天無新案件 / 今天沒有案件狀態更新」（header/empty 文案硬編碼，非模板）；③ **訊息模板管理頁（F7）簡化**：從 admin 雙 tab(report/empty)＋雙層下拉變數插入＋IntelliSense → **單 tab「訊息模板」+ 兩個編輯區塊(new_case/timeline)**，body 可用 `{{id}} {{location_label}} {{status}} {{description/note}}` + `{{#each}}...{{/each}}`，含即時預覽 + G7 重置出廠預設；④ **messageTemplates（F6）**：`ALLOWED_LABELS = [new_case, timeline]`（default label='new_case'）、PUT body in-place overwrite（`UNIQUE(type,label)` 下同一 label 覆寫 body，不新增 column、不新 migration）。**業主決策**：R-1 編號=案件真編號 / R-2 僅有實際內容才放系統連結 / R-3 日期「X月Y日」無年份無星期 / R-4 header+empty 文案硬編碼。CI 155/155 unit + E2E 同步更新（規格變更） |
| v1.1.20 | **訊息模板欄位重新分配：type 欄當鍵、label 欄存內容、砍 body 欄**（2026-09-01 業主決策）：① **設計**——舊設計 `type='message_template'`（分類）＋`label='new_case'/'timeline'`（鍵）＋`body`（內容）三欄，`label` 被挪用成機器鍵、內容另開 `body`；新設計 `type` 欄直接當鍵（`message_template_new_case` / `message_template_timeline`）、`label` 欄回歸存內容（模板本體），**`body` 欄整個砍掉**。對外 API 形狀**不變**（`label`=鍵、`body`=內容），前端 UI／統計頁／E2E 零改動。② **migration 0013**（幂等）——`UPDATE` 把 new_case/timeline 兩行搬成新 type＋label=內容；`DELETE` 舊 report/empty（active=0、v1.1.15 遺留、無用途，業主：「沒有辦法修改的兩個不留」）；`DROP INDEX idx_options_message_template`（WHERE type='message_template' 已無匹配列，變死索引）；`ALTER TABLE options DROP COLUMN body`（SQLite ≥3.35；D1 現行 3.48+，content 已全部搬進 label、不丢資料）。③ **`UNIQUE(type,label)` 約束不動**（table 層級、所有 type 共用；新語義＝「同鍵模板內容不可重複」，現行每鍵一列、F7 禁新增故不會踩到；開放類別專用模板時再回頭處理）。④ **後端**——`fetchTmpl`（stats.ts）改 `WHERE type='message_template_'+?` 取 `label AS body`；`messageTemplates.ts` GET/GET:id/PUT 全部改由 `REPLACE(type,'message_template_','')` 導出 `label`、`label AS body`，PUT 內容寫 `label` 欄、鍵寫 `type` 欄（同鍵被其他 id 占用 → 400）。⑤ **mock**（app.js）——fixture 改新 schema（type 當鍵、label 存內容），F6 handler 照後端形狀導出回應，mock 與真實後端不漂移。⑥ **測試**——`tests/messageTemplates.test.ts` 四支 DB 查詢改 `type LIKE 'message_template_%'`；對外行為斷言（label 白名單／PUT body／權限）不變。CI typecheck＋unit＋E2E 全綠後 deployment 才生效。**部署順序：先 deploy 新 code、再 `migrations apply` 0013**——反向會 500：舊 code 讀 `o.body`，一旦先 apply 0013 砍掉 body 欄就 `no such column`；先 deploy 新 code 對舊 DB 只是查不到 `type='message_template_new_case'` → 模板回 null、前端顯示硬編空文案（不 500），風險窗口僅「模板暫空」。兩者間隔勿超過數分鐘 |
| v1.1.19 | **cache-busting 真正生效＋boot() 重構遺漏修正**（2026-08-30 正式環境實測發現）：① **根因**——v1.1.17 的 cache-busting Function（原 `functions/index.html.ts`）依 CF Pages「檔案路由」只對應 `/index.html` 路徑，**網站根 `/` 需要 `functions/index.ts`**；且 `public/_routes.json` 的 include 白名單（`/api/*`、`/share.html`）沒列根路徑 → 根路徑 `/` 一律回靜態 `public/index.html`（寫死 `?v=1.1.14/1.1.15`），cache-busting **從未生效**（部署成功、CI 全綠但功能死碼，E2E 未驗根路徑 HTML 故未發現）。② **修法**——抽出共用產出模組 `functions/lib/dynamic-index.ts`（HTML 模板＋安全標頭，`serveDynamicIndex(env)`）；`functions/index.html.ts` 改薄入口；**新增 `functions/index.ts`**（根路徑 `/`）；`_routes.json` include 加入 `"/"`、`"/index.html"`。③ **boot() 修正**（`public/app.js`）——v1.1.18 重構後「`liffReady && isLoggedIn()`」分支 `forceFreshLogin()` 成功（已觸發 `liff.login()` 導航）時**漏 `return`**，fall-through 到 boot 尾端 `me.role`（`me` 仍為 `null`）→ TypeError、頁面停在「載入中…」無錯誤卡（`liff.login()` 導航失敗時可見）；補 `return`。④ **E2E 回歸測試** `e2e/cache-busting.spec.js`：`GET /` 與 `/index.html` 應回 200 動態 HTML（asset `?v=<12 位 commit>`、`Cache-Control: no-cache`、`nosniff`），asset 版本應等於本 commit 前 12 字（CI 有 `GITHUB_SHA` 時）。⑤ **production D1 migration 漂移修正＋守門**（2026-08-31 業主回報「daily-report 載入失敗：伺服器錯誤」）——**根因**：`d1_migrations` 止於 0009，**0010/0011/0012 從未套用到 production**；0010 正是 `ALTER TABLE options ADD COLUMN body`（message_template 存 body 的欄）→ daily-report 的 `fetchTmpl` 撈 `SELECT o.id, o.body` 一律 `no such column: body` → 500。v1.1.15 的 79a3d6d 曾修「模板未插進 DB」但誤判為 0010 已套用（實際 0010 連 `body` 欄都還沒加）→ 補的 0011 也從未套用，壞到 v1.1.19。**修法**：`npx wrangler d1 migrations apply repair-db0818 --remote` 套用 0010–0012（皆幂等：`INSERT OR IGNORE`／`CREATE INDEX IF NOT EXISTS`／`UPDATE`）；新增 **`scripts/check-migration-drift.py`** 直查 production D1、比對 repo `migrations/` 清單，有缺即 `::error::` 紅掉（CI 掛在 test job、需 GitHub secret `CLOUDFLARE_API_TOKEN`，未設時跳過）——此類「migration 寫了但沒套到 production」的漂移 code 層測試抓不到（單元跑 fresh D1、E2E 全走 `?mock=true`），唯有直查 production schema 能防。**未新增資料表／未改 API 回應格式** |
| v1.1.18 | **登入流程對齊 LINE 官方標準＋修復過期 token 卡死**（業主 2026-08-28 指示查 context7 官方 LIFF 文件後改寫）：① **根因**——LIFF 快取過的 id_token 過期後 `liff.isLoggedIn()` 仍為 true，app 還信它重 POST `/api/auth/session` → 後端永遠 401；且官方文件明訂 `liff.login()` 在 LIFF 瀏覽器內（已登入）是 no-op，無法拿真正新 token，只能手動清瀏覽器資料才登得上。② **修法**——抽出兩個共用 helper：`postSession(idToken)`（唯一 `/api/auth/session` POST 入口）＋`forceFreshLogin()`；session 重建失敗時先 `liff.logout()` 清 LIFF 快取（之後 `isLoggedIn()` 為 false），再 `liff.login()` 走完整 OAuth 拿真正新 token。boot 三處未登入分支統一走此標準流程：isLoggedIn→getIDToken/postSession→失敗即 logout+login。**未新增資料表／未改 API 回應格式**。解決「需清空瀏覽器資料才能登入」。**LINE API 語意取自 `developers.line.biz` LIFF reference（context7 `/websites/developers_line_biz_en_reference_liff`）**。
| v1.1.17 | **前端登出按鈕＋index.html 動態 cache-busting 自動化**（業主 2026-08-27 指示施工）：① **F-logout 新增前端「🚪 登出」按鈕**——置於底部 nav 最右（`public/app.js` 的 `renderNav()`），所有已登入角色（committee/manager/admin）皆可見；點擊先 `confirm` 確認，再 `POST /api/auth/logout`（帶 `X-Requested-With: fetch` 走 csrfGuard）清除 Cookie，隨後 `location.reload()` 由 boot 重新走登入流程。② **A-cache 動態 cache-busting**——新增 `functions/index.html.ts`（Pages Function）在請求時把本機 asset（`/style.css`、`/vendor/*.js`、`/templateEngine.js`、`/app.js`）的 `?v=` 設為 `CF_PAGES_COMMIT_SHA` 前 12 字（本機 `wrangler pages dev` 取 `dev`），並對回應設 `Cache-Control: no-cache`＋與 `_headers` 一致的 `nosniff`／`Referrer-Policy`。**解決「index.html 寫死 ?v=1.1.15 導致瀏覽器長快取舊版、每次部署看不到新程式」**——因每次部署產生唯一 URL，強制抓最新版，无需手動改版本號、永不忘。未新增資料表／未改 API 回應格式。主站仍不加 CSP（沿用 §8.2 決策）。**v1.1.19 內聯修正**：`functions/index.html.ts` 原在 module top-level 用 `process.env.CF_PAGES_COMMIT_SHA`，但 Worker 無 Node `process` → 拋 `ReferenceError: process is not defined`，CF Pages「Failed to publish your Function」、整次部署回退舊版（用戶端仍看得到 v1.1.15）。改為在 onRequest 執行時從 Env 讀 `env.CF_PAGES_COMMIT_SHA`（與 `src/app.ts:43` `/hello` 同款），宣告 optional、dev fallback `'dev'`。typecheck 過。|
| v1.0 | 初版：技術棧、schema、API、畫面、部署、里程碑 |
| v1.1 | 外部評審修訂（20 項）：Cookie session 取代 Bearer、時間格式統一 ISO8601、label 快照、刪除 ticket_no、void/編輯留痕、業主決策 D1–D4 等 |
| v1.1.1 | 二次評審修訂（20 項）：後端改 Hono 單一入口、前端套件一律 vendored、month_done 改從時間軸事件計算、CSV 改簽名下載連結等 |
| v1.1.2 | 三次評審修訂：回歸修復（補回 share 照片端點、P0 畫面、users 防呆、compatibility_date）＋決策補登（D5–D7）＋安全加強（CSV domain separation、5 分鐘效期、CHECK 約束等） |
| v1.1.3 | 四次評審修訂：**修復 middleware 順序架構錯誤**（`/auth` 與 CSV 下載移到全域 requireAuth 之上、`lib/auth.ts` 拆 `resolveUser`/`requireAuth`）＋補回 §7 官方帳號三步＋快取標頭修正（share 照片改 private、內部照片補回）＋CHECK 約束涵蓋 note＋CSV 欄位精簡＋P1 tab 改名 |
| v1.1.4 | 五次實測修訂（16 項，前端為主）：非手機登入、建單改下拉式、指派廠商 UI、留言/回報合一、詳情可編輯、分享連結指向人類頁面 `share.html?token=`、作廢重新開啟改選單、廠商管理獨立 tab、成員權限中文化＋篩選、停用紅/啟用藍、縮圖 lightbox、統計加未結案總數/完成率。**share_url 格式統一改 `/share.html?token={token}`**（v1.1.4 起） |
| v1.1.5 | 六次實測修訂：**權限中文化改對照**（主管=admin > 保全/秘書=manager > 委員=committee，v1.1.4 寫反已修正）、**指派廠商收斂進編輯頁**（保全/秘書層級，不再塞列表/詳情頁）、移除獨立「新增回報」按鈕（回報統一走留言框含狀態更新，委員不可變狀態）、常用說明改下拉＋附加按鈕、修復重新產生分享連結（引用不存在變數會 throw）。**preview 環境決策：關閉 preview 自動部署**（`preview_deployment_setting: none`），單人開發直接 push main 走 production，避免產生無 D1/R2/secret 的壞部署 |
| v1.1.6 | 七次實測修訂：**詳情頁重構（方案 A）**——右上角 ⋮ 選單（分享連結/複製/編輯/作廢/重新開啟/重新產生）、分享連結收進選單、留言/回報改隱藏式（點「💬 留言／回報」才展開）、案件資訊卡緊湊、時間軸為主角。**照片壓縮加強**：`maxSizeMB` 10→0.5、最長邊 1600→1280、品質 0.7（2MB 照片約縮到 200KB）。**seed 單一來源**：seed 併入 `migrations/0002_seed.sql`，刪除根目錄 seed.sql 與 `db:seed:remote` |
| v1.1.7 | **類別關聯 + 留言框常用說明**（詳見 `docs/archive/v1.1.7-變更需求報告.md`）：新增 `option_categories` 多對多 join 表（0003，只建表不 seed）——建單選類別後地點/說明只顯示「該類別關聯＋通用」；`GET /api/options` 三種模式（active／category_id 過濾／include_inactive 附 category_ids 限 manager/admin）；`category_ids` 三態（undefined 不動/[] 清空/有值全量覆寫）；建單驗證 location 屬於 category 或通用；詳情回應補 category_id/location_id；P7 修停用顯示 bug＋勾選矩陣；manager/admin 留言框加常用說明下拉＋附加 |
| v1.1.8 | **效能優化＋死碼清理**：① catalog 快取分層——建單/編輯由「每次進頁強制重讀」改為**短 TTL（30 秒）**，列表/留言維持長 TTL（10 分鐘），避免每次進建單/編輯頁都吃一次 D1 連線延遲（0.8s）；② 移除 `pages.report` 死碼（v1.1.5 起回報已併入詳情頁留言框，`#/report` 無任何入口）＋router 分支；③ 登入後用 `history.replaceState` 清掉 URL 上的 OAuth 殘留參數（code/state/liff*） |
| v1.1.9 | **回報範本（comment_desc）＋全頁面 loading＋專案整理**（詳見 `docs/archive/v1.1.9-變更需求報告.md`）：① 建單用「故障類型範本」（`description`）與回報/留言用「回報範本」（`comment_desc`）**分開管理**——新增選項類型 `comment_desc`（migration 0004 seed），catalog 回應加 `comment_descs`，P7 加回報範本 tab；② **各頁面載入時加 spinner**（詳情頁因串行 4 次 D1 查詢達 ~1s，避免白屏）；③ **詳情頁查詢並行化**（photos+updates 用 Promise.all）；④ **登入修復**——`cleanUrlParams()` 從 boot 開頭移到尾端（原本在 liff 授權前清掉 code/state 導致一般瀏覽器無法跳 LINE 登入，時好時壞）；⑤ **專案整理**——變更報告歸檔 `docs/archive/`、SPEC 補 §4.6 options 契約＋標註里程碑完成、新增 README、刪 `.assoc-wrap` 死碼 |
| v1.1.10 | **loading 錯誤處理補齊＋code review**：① **loading 錯誤處理**——詳情/列表/成員/建單/編輯頁 catch 分支補清 loading（原本錯誤時 loading 不消失）；② **code review 修正**——updates 照片綁定改 `env.DB.batch()` 的 `last_row_id`（原 `ORDER BY id DESC` 並發回報時可能抓錯 update id）、停用者 `resolveUser` 設 `disabledUser` 標記使 `requireAuth` 不再重查 D1（移除 `isDisabledUser`）、share 端點加 UUID 格式驗證擋非 UUID 掃描、mock 測試資料補到 6 筆（涵蓋各狀態） |
| v1.1.11 | **六份 code review 補強（51 項）**（詳見 `docs/archive/v1.1.11-變更計畫.md`）：**後端**——A1 改類別地點不相容回 400 防崩潰、A2 csrfGuard 允許無 body、A3 CSV 台灣時區換算、A4 comment_desc 禁關聯、D1/G1 vendor_id 三態清空、D4 選項重名 400、D8 approved_at、D9 comments 用 batch、E5 assoc 分批寫入、E6 CSV 掛 zod、E7 assertValidAssoc 空陣列也驗、E8 零管理員競態（條件式 UPDATE）、E9 R2 失敗清理、F4 統計複合索引（0005）、F5 分頁 tie-breaker、G5 廠商留痕、G6 reopen 冒號、G7 share Content-Disposition/H3 photo_id 防禦、G8 optionalText null、H1 description 空轉 null、B1 CSV update_count 子查詢、B4 IN 分塊、C2 onError、C3 env 驗證；**前端**——E1 照片 5 張上限+縮圖刪除鍵（含留言框）、E2 剪貼簿 fallback+toast、E3 loadMore 防連點、E4 #nav safe-area、E10/F2 P7 清快取+tab stale 防覆蓋、F1 assoc modal 防清空、F3 relogin 單例、F6 零關聯 alert、F7 主照片 lightbox、B2 router 過濾 query、D2 編輯頁地點連動、D5 防重複送出、D6 CSV location.href、D7 users 回滾、G3 標籤精準比對、H2 share.js lightbox、H5 CSS cursor、C1 no-cache+版本化。CI 全綠、0005 已套 production、已部署。**建單頁 UI 調整**：範本改名「使用範本」並移到說明之下（類別→地點→說明→使用範本→照片） |
| v1.1.13 | **廠商排序＋共用照片選擇器＋編輯照片＋卡片列表改版＋bug 修復**：① **廠商排序欄位**——migration 0008 移除無用 `vendors.phone`、加 `vendors.sort_order`（後台改 DB，無 UI）；② **共用照片選擇器**——抽出 `attachPhotoPicker()` 全域函式，建單/留言框/編輯三處共用同一份照片邏輯（壓縮/≤5 張/縮圖/✕ 刪除）；③ **編輯照片**——編輯頁可補上傳＋刪除既有照片，儲存送 `photo_ids` 全量覆寫（新增綁定、移除解綁 `target_id=NULL` 不刪 R2），時間軸以 system 留痕；④ **卡片列表改版**——顯示一行維修內容、最後活動只顯示日期（同行放建立日期）、標題後補「(N 天)」建立至今天數；⑤ **修復 share 頁縮圖 lightbox 點不開**——share.js 的 `el()` 缺 `onclick` 事件處理，補 `addEventListener`（與 app.js 一致）；⑥ **bug 修復**——done 結案不清空發包金額（COALESCE 保留）、編輯頁說明欄帶入（el() value 走 property）、session 過期 fallback 強制重登、主站 CSP 撤回（改回僅 nosniff/referrer，§8.2）。CI 全綠、0008 已套 production |

### 0.2 業主決策紀錄（已確認，2026-08-18）

| # | 決策 | 內容 |
|---|---|---|
| D1 | 開放管委會留言 | 三種角色均可在案件下新增「留言」：只記錄內容與時間，**不改變案件狀態**，可附照片 |
| D2 | 新增 reopen 功能 | **管理員專屬**：已結案或已作廢的案件可重新開啟，並在時間軸留下紀錄 |
| D3 | CSV 匯出 | 提供案件 CSV 匯出（備份與開會用），權限為管理公司（manager/admin） |
| D4 | 保留「常用說明」為資料庫管理選項 | 類別、地點、常用說明三種選項皆由管理公司在管理頁自行新增／停用。理由：業主明示需求；三種選項共用同一張 options 表與同一支 API，成本趨近於零；前端硬寫會讓「改一條說明就要重新部署」，違背管理公司自助維護目標 |
| D5 | 選項／廠商管理權限下放 | 類別／地點／常用說明選項、廠商的新增／修改／停用，由 v1.0 的「僅 admin」放寬為 **manager/admin**。D4 精神延伸：管理公司自助維護 |
| D6 | 統計頁恢復三角色可讀 | `GET /api/stats/summary` 三角色皆可；**CSV 匯出仍維持 manager/admin**（D3 不變）。業主確認「管委會看得到」 |
| D7 | 編輯權限恢復 v1.0 | `PATCH /api/tickets/:id`：committee 可編輯**自己建的單**；manager/admin 全部。結案／作廢後仍不可編輯 |

### 0.3 產品規則（不可自行更動）

1. 狀態流：`open → in_progress → done`；另有 `void`（作廢）；done/void 僅 admin 可 reopen。**v1.1.14（F3）後端鎖死**：`in_progress→open` 退回禁、`open→open` 禁；`open→done` 可直結案、`in_progress→in_progress` 允許（多次發包覆寫金額）
2. 回報（kind=status）限 manager/admin；留言（kind=comment）三角色皆可、不改狀態
3. 編輯、void、reopen 都必須寫入時間軸；reopen 訊息須帶入實際前狀態（已完成／已作廢）
4. 時間軸（ticket_updates）只能新增，不可修改刪除（開會存檔用）
5. 選項與廠商不刪除，只停用
6. 建單不需填標題：類別＋地點必填、說明選填，標題由系統產生
7. 公開派工頁不顯示廠商名稱、不顯示時間軸、不顯示內部人員
8. 結案（done）後不可再回報，但可留言（留言不會重開案件）；作廢（void）案件不可留言
9. **廠商不進建單**：建單的 POST 不收 `vendor_id`；廠商僅在編輯頁 PATCH 由 manager/admin 指派
10. **廠商排序（v1.1.13）**：`vendors.sort_order` 排序用（與 options.sort_order 同模式），後台直接改資料庫、無前端排序介面；`GET /api/vendors` 依 `active DESC, sort_order, id`。**`vendors.phone` 欄位已移除（0008），勿再引用**
11. **指派廠商只在編輯頁（pages.edit）**（v1.1.5）：不塞進列表卡片或詳情頁
12. **編輯權限**：committee 僅自己建的單；manager/admin 全部（D7）
13. **統計頁三角色皆可**（D6）；**CSV 匯出限 manager/admin**（D3）
14. **vendor_name 刻意外露**：committee 在詳情頁/列表看得到 `vendor_name`，但 `GET /api/vendors` 限 manager/admin——刻意設計
15. **`month_done` 從 `ticket_updates` 計算**（v1.1.14 修正）：完成率方案②的分母用 `ticket_updates.kind='status' AND status='done'` 計算，**禁止用 `tickets.closed_at`**——reopen 改 `closed_at` 會污染完成率

**明確不做（v1.1.13 確認，勿擅自加入）**：
- **不上 React/Vue 等框架**：維持純原生 JS + vendored，避免建置與依賴。
- **不開 `nodejs_compat`**：維持 Workers 純 API，不引 Node 相容。
- **不做多社區／多 tenant**：單一社區，不建 tenant 隔離。
- **不做 LINE Messaging API 推播**：規格列 v1 不做；若未來要做需獨立後端＋OA 開通，非本專案範圍。
- **不做孤兒照片大清理**：v1 保留「未綁定照片只能本人 GET」政策，不設 cron 清掃。
- **不把 vendor 下拉塞回列表卡片/詳情頁**：指派廠商只在編輯頁（v1.1.5 定案）。
- **不建 staging 測試環境**（單人開發）；E2E 用 `?mock=true` 前端記憶體 mock，不碰正式資料（見 §8.7）。

---

## 1. 技術棧與專案結構

### 1.1 技術棧

| 層 | 選型 |
|---|---|
| 平台 | Cloudflare Pages + Pages Functions |
| 後端框架 | Hono（單一 catch-all 入口） |
| 資料庫 | Cloudflare D1（SQLite） |
| 檔案儲存 | Cloudflare R2 |
| 認證 | LINE LIFF（ID token）→ 自簽 JWT 放 HttpOnly Cookie |
| 前端 | 原生 HTML/JS（無框架、無建置），hash router |
| 驗證 | zod（schema 即 API 契約唯一真相來源） |
| JWT | jose（Web Crypto 原生） |
| 前端圖片壓縮 | browser-image-compression（vendored） |
| 測試 | @cloudflare/vitest-pool-workers（Workers 池跑測試，不用 Jest+mock） |

允許依賴：`hono`、`@hono/zod-validator`、`jose`、`zod`、`browser-image-compression`。
禁止：Node.js 專屬 API 或套件（jsonwebtoken、bcrypt、fs、multer、sharp、crypto.createHmac）。

### 1.1.5 工作區與檔案結構慣例（v1.1.15 起）

> 與 CLAUDE.md 規則 14/15 同源；本節說明「為什麼這樣規範」與實測依據，CLAUDE.md 是 AI 必讀的硬性規則摘要。

**規則 14：所有檔案放在 `/var/minis/workspace/` 之下**

- 正式施工目錄：`/var/minis/workspace/repair-system/`
- 備援（如 git clone 過渡）：可放 `/tmp/`，**但 `/tmp/` 不算正式位置**，重開 session 易丟
- `/tmp/` 僅允許當一次性搬遷/驗證的中繼站（CI log、單次 clone 測試、單次 git 實驗等）

**實測依據（2026-08-23）**：早期施工放在 `/tmp/repo-work`，業主於 2026-08-23 明確指示「正式施工目錄統一在 workspace/repair-system/」，搬遷後驗證 `.git` 在 workspace 下能正常運作（git init、add、commit、mv、log 皆可），**唯一限制**是 `rm` 系列系統呼叫被 Minis l2s 同步層擋住（不能用 `git gc`、不能重 pack），但日常 commit/branch/merge/push/mv/rename 都不會觸發 rm，**無實務影響**。

**規則 15：專案根目錄單層**

- 正確：`workspace/repair-system/`（根目錄即專案）
- 錯誤：`workspace/repair-system/repo/`、`workspace/repair-system/src/myapp/`（多層不必要）
- **理由**：AI 與人閱讀時找檔案的成本隨深度增加；minis://workspace/repair-system/ 已是最短可達路徑

**例外**（不違反 14/15）：

- 備援的 `.git` 可放 `/tmp/gitdir/` 類位置（用 `--separate-git-dir`）
- 一次性實驗目錄如 `.gitlocktest`、`.gtest`、`.mvtest` 可放他處，事後必須清掉

**變更需求清單**：`docs/vX.X.X-變更需求清單.md` 是業主討論中的工作稿，未明確拍板的設計細節**不得**寫入本檔（SPEC）、CLAUDE.md、lib-spec.md、page-api-map.md、test-cases.md 等正式規格（見 CLAUDE.md 規則 12.1）。

### 1.2 目錄樹

```
repair-system/
├── public/                        # 前端靜態檔（純 JS，無建置、無 npm import）
│   ├── index.html                 # 主系統（SPA 入口，hash router）
│   ├── app.js / share.js
│   ├── style.css
│   ├── vendor/
│   │   ├── browser-image-compression.js   # vendored UMD build（檔頭註明版本與來源）
│   │   └── liff-mock.js                    # 測試模式 ?mock=true 用（§1.2）
│   ├── _routes.json               # include 白名單：/ 與 /index.html（動態 cache-busting）、/api/*、/share.html
│   └── _headers                   # 靜態檔標頭（安全標頭；主站不設 CSP，見 §8.2）
├── functions/
│   ├── api/
│   │   └── [[path]].ts            # 唯一入口
│   ├── index.ts                   # 根路徑 / 動態 cache-busting（v1.1.19，見 §8.2）
│   ├── index.html.ts              # 路徑 /index.html（v1.1.19 起為薄入口，共用 lib/dynamic-index.ts）
│   ├── lib/dynamic-index.ts       # 動態 index HTML 共用產出（模板＋安全標頭）
│   └── share.html.ts              # 動態渲染派工單頁（v1.1.12，見 §5.8）
├── src/                           # Hono 應用（TypeScript）
│   ├── app.ts                     # app 組裝與 middleware 掛載
│   ├── routes/
│   │   ├── auth.ts                # session / me / logout
│   │   ├── tickets.ts             # 建單/列表/詳情/編輯/回報/留言/作廢/reopen/share-token
│   │   ├── photos.ts / options.ts / vendors.ts / users.ts / stats.ts
│   │   ├── exports.ts             # CSV 簽名（POST /sign）與下載（GET /tickets.csv）
│   │   └── share.ts               # 公開端點
│   └── lib/
│       ├── auth.ts                # resolveUser()、requireAuth()、JWT 簽驗、Cookie
│       ├── csrf.ts                # csrfGuard middleware
│       ├── respond.ts             # 統一回應信封
│       ├── validate.ts            # zod schemas
│       ├── time.ts                # taipeiMonthRangeUtc() 等
│       └── db.ts                  # 共用查詢
├── migrations/
│   ├── 0001_init.sql              # 見 §2
│   ├── 0002_seed.sql              # seed 單一來源（v1.1.6，見 §2.3）
│   ├── 0003_category_assoc.sql    # option_categories join 表（v1.1.7）
│   ├── 0004_comment_desc.sql      # 回報範本選項類型（v1.1.9）
│   ├── 0005_updates_stats_idx.sql # 統計查詢複合索引（v1.1.11，F4）
│   ├── 0006_amount.sql            # 發包金額欄位 amount/amount_at（v1.1.12）
│   ├── 0007_updates_amount.sql    # ticket_updates.amount（時間軸顯示發包金額，v1.1.12）
│   ├── 0008_vendors_sort.sql      # 移除 vendors.phone、加 vendors.sort_order（v1.1.13）
│   └── 0009_vendors_idx_updates_trigger.sql  # vendors 複合索引 + ticket_updates append-only trigger（v1.1.14）
├── CLAUDE.md                      # 見 §6
├── README.md                      # 專案入口（技術棧/結構/本機開發/文件導覽）
├── docs/
│   ├── SPEC.md                    # 最新規格（單一真相來源）
│   ├── lib-spec.md / test-cases.md / page-api-map.md
│   ├── index.html                 # 外部審查工具：完整專案總覽 Markdown 產生器（產出 project-overview.md 供外部審查，非修繕系統 runtime）
│   └── archive/                   # 歷史變更需求報告（已施工）
└── wrangler.toml                  # 見 §8
```

**語言邊界（硬性）**：`functions/` 與 `src/` 使用 TypeScript（Wrangler 以 esbuild 自動編譯，零設定）；`public/` 一律純 JS，禁止 `import` npm 套件。

**前端套件規則（硬性）**：一律 vendored——從 npm 套件 dist 取 UMD build 放 `public/vendor/`，鎖定版本、檔頭註明版本號與來源，以 `<script src="/vendor/...">` 載入（browser-image-compression 掛 `window.imageCompression`）。禁止 CDN。**唯一例外：LINE LIFF 官方 SDK**（`https://static.line-scdn.net/liff/edge/2/sdk.js`）——屬 LINE 平台必要元件、非第三方套件，且 LINE 官方不提供可 vendored 的離線 build，故允許直接以官方 CDN 載入（`public/index.html` 註解標明「LINE 官方 CDN，平台 SDK」）。其餘第三方套件一律不得走 CDN。

### 1.3 唯一入口與 app 組裝

```ts
// functions/api/[[path]].ts —— 整支檔案就這三行
import { handle } from 'hono/cloudflare-pages'
import { app } from '../../src/app'
export const onRequest = handle(app)
```

```ts
// src/app.ts（骨架）—— middleware 掛載順序即安全邊界，勿更動
type Env = {
  Bindings: { DB: D1Database; PHOTOS: R2Bucket; LINE_CHANNEL_ID: string; JWT_SECRET: string }
  Variables: { user: { id: number; role: 'pending'|'committee'|'manager'|'admin' } }
}

export const app = new Hono<Env>().basePath('/api')

app.route('/share', shareRoutes)              // 公開唯讀：無 auth、無 csrf
app.get('/exports/tickets.csv', csvDownload)  // 雙軌自驗：軌A Cookie / 軌B 簽名（見 §4.8）
app.use('/*', csrfGuard)                      // 所有 mutation 驗 CSRF（GET/HEAD 直接放行）
app.route('/auth', authRoutes)   // session 不需登入；me / logout 內部各自掛 requireAuth({ allowPending: true })
app.use('/*', requireAuth())     // ⚠ 以下全部需已開通；此行之上的路由必須自驗權限
app.route('/tickets', ticketRoutes)
app.route('/photos', photoRoutes)
app.route('/options', optionRoutes)
app.route('/vendors', vendorRoutes)
app.route('/users', userRoutes)
app.route('/stats', statsRoutes)
app.route('/exports', exportRoutes)  // 僅 POST /sign（走標準 Cookie＋CSRF 流程）
```

**掛載規則（硬性）**：

1. **凡是可能在無 Cookie 或 pending 狀態被呼叫的端點，一律註冊於全域 `requireAuth()` 之上，並在端點內自驗**（本版共兩支：`GET /share/*` 公開白名單、`GET /exports/tickets.csv` 雙軌）
2. 全域 `requireAuth()` 之上的路由**必須自己完成權限驗證**，不得依賴外層 middleware
3. 角色限制在路由模組內以 `requireAuth({ roles: ['manager','admin'] })` 逐群掛載

> 背景：v1.1.2 曾將 `/auth` 與 `/exports` 整組放在全域 `requireAuth()` 之下——Hono middleware 依註冊順序執行，外層一旦回 403/401，內層的 `allowPending` 或簽名驗證**永遠不會被執行**。本版重排修復。

---

## 2. 資料庫 Schema

### 2.1 migrations/0001_init.sql

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id  TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pending',   -- pending / committee / manager / admin
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,                     -- ISO8601 UTC
  approved_at   TEXT,
  approved_by   INTEGER REFERENCES users(id)       -- 保留欄位，v1 無畫面使用
);

CREATE TABLE vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,   -- 排序（v1.1.13，後台改資料庫；與 options.sort_order 同模式）
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE options (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                        -- category / location / description / comment_desc
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(type, label)
);

-- v1.1.7 類別關聯 join 表（多對多：location/description ↔ category）
CREATE TABLE option_categories (
  option_id   INTEGER NOT NULL REFERENCES options(id),
  category_id INTEGER NOT NULL REFERENCES options(id),
  PRIMARY KEY (option_id, category_id)
);
CREATE INDEX idx_oc_category ON option_categories(category_id);

CREATE TABLE tickets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id      INTEGER REFERENCES options(id),
  category_label   TEXT NOT NULL,                  -- 建單時快照，選項改名不影響歷史
  location_id      INTEGER REFERENCES options(id),
  location_label   TEXT NOT NULL,                  -- 同上
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'open',   -- open / in_progress / done / void
  vendor_id        INTEGER REFERENCES vendors(id),
  share_token      TEXT UNIQUE NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  closed_at        TEXT,        -- 結案或作廢時間；reopen 時清空
  closed_by        INTEGER REFERENCES users(id)
  -- 無 ticket_no：顯示用 '#' + id 補零 4 位，由後端組 title 時產生
  -- 無 updated_at：刻意刪除，由 last_activity_at 涵蓋（非漏抄）
);

CREATE TABLE ticket_updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL CHECK (kind IN ('status','comment','system')),
  status     TEXT CHECK (
               (kind = 'status' AND status IN ('open','in_progress','done','void'))
               OR (kind IN ('comment','system') AND status IS NULL)
             ),
  note       TEXT CHECK (
               (kind = 'comment' AND note IS NOT NULL AND note <> '')
               OR (kind IN ('status','system'))
             ),
  created_at TEXT NOT NULL
  -- 只能新增，不可修改刪除
  -- CHECK 約束讓資料庫成為第二道防線：AI 寫錯 kind/status/note 組合會在 INSERT 時被擋
);

CREATE TABLE photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type  TEXT,                          -- ticket / update；NULL = 尚未綁定
  target_id    INTEGER,
  r2_key       TEXT NOT NULL,                 -- photos/{uuid}，無副檔名
  content_type TEXT NOT NULL,                 -- image/jpeg | image/png | image/webp
  size_bytes   INTEGER NOT NULL,
  uploaded_by  INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_tickets_list    ON tickets(status, last_activity_at DESC);
CREATE INDEX idx_tickets_created ON tickets(created_at);
CREATE INDEX idx_updates_ticket  ON ticket_updates(ticket_id, created_at);
CREATE INDEX idx_photos_target   ON photos(target_type, target_id);
CREATE INDEX idx_options_type    ON options(type, active, sort_order);
```

### 2.2 時間格式統一規則（寫入 side）

一律 ISO8601 UTC。應用層用 `new Date().toISOString()`；SQL 層（seed、bootstrap）用 `strftime('%Y-%m-%dT%H:%M:%fZ','now')` 或固定字串。**禁止 `datetime('now')`**。

### 2.3 seed.sql

> **seed 單一來源（v1.1.6）**：seed 併入 `migrations/0002_seed.sql`（INSERT OR IGNORE）作為唯一來源。vitest 自動套用全部 migration；production 用 `wrangler d1 migrations apply`。根目錄 seed.sql 與 `db:seed:remote` script 已刪除。

```sql
INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES
  ('category', '電梯', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '門禁', 2, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '水泵', 3, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '照明', 4, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '消防', 5, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '漏水', 6, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '其他', 99, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '停車場', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '大廳',   2, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '梯廳',   3, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '頂樓',   4, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '中庭',   5, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '其他',  99, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '水泵浦異音',   1, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '照明故障',     2, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '門禁感應不良', 3, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '水管滲漏',     4, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '油漆剝落',     5, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '其他',        99, 1, '2026-01-01T00:00:00.000Z');
```

> **回報範本 seed**（migration `0004_comment_desc.sql`，v1.1.9）另新增 `type='comment_desc'`（建單用「故障類型範本」與回報用「回報範本」分開）：
> ```
> INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES
>   ('comment_desc', '已通知廠商處理', 1, 1, '2026-01-01T00:00:00.000Z'),
>   ('comment_desc', '已到場勘查',     2, 1, '2026-01-01T00:00:00.000Z'),
>   ('comment_desc', '待料中',         3, 1, '2026-01-01T00:00:00.000Z'),
>   ('comment_desc', '已修復完成',     4, 1, '2026-01-01T00:00:00.000Z'),
>   ('comment_desc', '需追蹤',         5, 1, '2026-01-01T00:00:00.000Z');
> ```

（預設選項為初始值，上線後由管理公司在 P7 自行維護。）

### 2.4 bootstrap 管理員

第一位管理員先正常登入一次（系統建 pending 帳號），再執行：

```sql
UPDATE users SET role='admin',
  approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE line_user_id='<他的 LINE user ID>';
```

---

## 3. 認證與權限

### 3.1 登入流程（Cookie Session 版）

```
使用者點圖文選單 → 開啟 LIFF → liff.getIDToken()
→ POST /api/auth/session { id_token }
    後端：向 LINE 驗證 id_token
      POST https://api.line.me/oauth2/v2.1/verify
      參數：id_token、client_id = LINE_CHANNEL_ID
      核對：aud == LINE_CHANNEL_ID、iss == 'https://access.line.me'、exp 未過期
    → users 表查無此人 → 建立 pending 使用者
      （display_name 取 ID token 的 name claim；缺省時填「LINE 用戶」）
    → 簽發 JWT（jose，HMAC-SHA256，效期 60 分鐘，
       payload 只放 { sub: user_id }，不放 role）
→ Set-Cookie: session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

### 3.2 每支 API 請求的驗證流程

1. 驗 JWT 簽章與效期 → 失敗回 `401 UNAUTHORIZED`
2. **從 D1 讀取該 user 的 role 與 active**（禁止只信 JWT 內容）：
   - `active=0` → `403 DISABLED`（「帳號已停用，請洽管理員」）——v1.1.10：`resolveUser` 查到 active=0 時設 `disabledUser` 標記，`requireAuth` 直接讀標記回 403，**不再重查 D1**（移除 `isDisabledUser`）
   - `role='pending'` → `403 PENDING`（僅 `/api/auth/*` 可用，且 me/logout 需 allowPending）
   - 角色不符 → `403 FORBIDDEN`
3. 停用／降權因此**立即生效**

**v1.1.14（A6）session 滑動續期**：`requireAuth` 在 `resolveUser` 成功後，若 JWT 剩餘效期 < 900 秒（15 分鐘），用 `decodeJwt` 讀 `exp` 比對，換發新 JWT 並 `Set-Cookie`（屬性與登入一致：`Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`）。因 `resolveUser` 已查過 D1 active，停用者不會被續期繞過。

**`lib/auth.ts` 介面（v1.1.3 定案）**——拆為純函式＋middleware 兩層，讓需自驗的端點（如 CSV 下載）可重用驗證邏輯：

```ts
// src/lib/auth.ts

/** 純函式：解析 Cookie、驗 JWT、查 D1，回傳 user 或 null（不拋錯、不寫回應） */
export async function resolveUser(c: Context<Env>): Promise<
  { id: number; role: 'pending'|'committee'|'manager'|'admin' } | null
> {
  // 1. 從 Cookie 取 session JWT；無 Cookie → null
  // 2. jose 驗簽＋效期 → 失敗回 null
  // 3. 從 D1 查 user：SELECT id, role, active FROM users WHERE id = ?
  // 4. 查無此人或 active = 0 → null（停用者視同未登入；
  //    需區分 DISABLED 訊息的端點在 middleware 層另查）
  // 5. 回 { id, role }
}

/** middleware：內部呼叫 resolveUser，依 opts 判斷是否放行 */
export function requireAuth(opts?: {
  roles?: Array<'committee'|'manager'|'admin'>;
  allowPending?: boolean;
}): MiddlewareHandler<Env> {
  return async (c, next) => {
    const user = await resolveUser(c);
    if (!user) {
      return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: '請重新登入' } }, 401);
    }
    if (user.role === 'pending' && !opts?.allowPending) {
      return c.json({ ok: false, error: { code: 'PENDING', message: '帳號等待開通中' } }, 403);
    }
    if (opts?.roles && !opts.roles.includes(user.role as 'committee'|'manager'|'admin')) {
      return c.json({ ok: false, error: { code: 'FORBIDDEN', message: '權限不足' } }, 403);
    }
    c.set('user', user);
    await next();
  };
}
```

- `GET /api/auth/me`、`POST /api/auth/logout` 使用 `requireAuth({ allowPending: true })`（讓 P0 畫面拿得到 display_name）
- 停用（active=0）使用者的 DISABLED 提示：由 `requireAuth` 在 resolveUser 回 null 前，對「JWT 有效但 active=0」的情況改回 `403 DISABLED`（實作時在 middleware 層補此分支；純函式 resolveUser 維持回 null）

### 3.3 CSRF 防護（改用 Cookie 後的必要措施）

- Cookie 設 `SameSite=Lax`
- 所有 mutation（POST/PATCH/DELETE）必須帶自訂 header `X-Requested-With: fetch`，缺 header 一律 `403`
- `Sec-Fetch-Site` **有送且為 cross-site → 拒絕；沒送 → 僅驗 X-Requested-With**（相容不送 Fetch Metadata 的舊版 WebView）
- mutation 只接受 `Content-Type: application/json`（照片上傳的 multipart 除外，同樣驗 header）
- 不開放 CORS

### 3.4 前端 401 處理（靜默重登）

1. 收到 `401 UNAUTHORIZED`
2. `liff.isLoggedIn()` 為 false → `liff.login()`（LINE 內無感完成；外部瀏覽器會出現 LINE 登入畫面）
3. 取 id_token → `POST /api/auth/session` 換新 Cookie → **重送原請求一次**
   - **v1.1.13：若 `POST /api/auth/session` 重建失敗**（LINE idToken 已過期等，後端回 401）→ **fallback 呼叫 `liff.login()` 強制重新授權**取得新 token，避免「後端 session 過期但 LINE 仍登入」時卡住不重登。LINE 內已授權過會無感取得新 token；外部瀏覽器會跳 LINE 登入頁。**v1.1.18 更正**：官方文件明訂 `liff.login()` 在 LIFF 瀏覽器內（已登入狀態）是 no-op，單調它拿不到新 token。故改為先 `liff.logout()` 清 LIFF 快取（之後 `liff.isLoggedIn()` 為 false），再 `liff.login()` 走完整 OAuth 拿真正新 token——不必手動清空瀏覽器資料即可登得上。`postSession`／`forceFreshLogin` 為此標準流程的共用 helper。
4. 重送後仍 401 → 顯示「請重新從 LINE 圖文選單開啟本系統」，**不再重試**
5. `403 DISABLED` / `403 PENDING` 不觸發重登（避免停用帳號無限重登迴圈），直接顯示對應訊息

**非手機／外部瀏覽器登入（v1.1.4）**：不禁止非手機使用。`liff.init` 失敗時仍嘗試用既有 cookie 登入；若無 cookie 且 LIFF SDK 在，重試 init 後登入；完全無 LIFF 環境顯示提示＋重新整理按鈕。

### 3.5 登出

`POST /api/auth/logout` 清除 Cookie（Max-Age=0），並掛 `requireAuth({ allowPending: true })`。**v1.1.17 起前端底部 nav 提供「🚪 登出」按鈕**（所有已登入角色 committee/manager/admin 皆可見），點擊先 `confirm` 確認，再調此端點（前端送 `X-Requested-With: fetch` 以過 `csrfGuard`）；清除成功後 `location.reload()`，由 `boot()` 重新走登入流程。

### 3.6 權限矩陣

| 功能 | committee 委員 | manager 保全/秘書 | admin 主管 |
|---|:-:|:-:|:-:|
| 查看案件、建單、留言（D1）、上傳照片、複製分享連結 | ✓ | ✓ | ✓ |
| 編輯案件（D7） | **僅自己建的單** | ✓ 全部 | ✓ 全部 |
| 指派廠商（v1.1.5：僅編輯頁內，保全/秘書層級） | ✗ | ✓ | ✓ |
| 回報、結案、作廢、重新產生分享連結 | ✗ | ✓ | ✓ |
| **統計摘要（D6）** | **✓** | ✓ | ✓ |
| CSV 匯出（D3） | ✗ | ✓ | ✓ |
| 廠商／選項管理（D5） | ✗ | ✓ | ✓ |
| 成員審核、角色指派、停用、改名 | ✗ | ✗ | ✓ |
| reopen 重新開啟（D2） | ✗ | ✗ | ✓ |
| pending 或 active=0 | 所有 API 除 `/api/auth/*`（me/logout 需 allowPending）一律 `403 PENDING` / `403 DISABLED` | | |

> **權限層級（v1.1.5 定案）**：主管（admin）> 保全/秘書（manager）> 委員（committee）。v1.1.4 曾誤將 admin 標為「保全/秘書」、manager 標為「主管」，已修正。
>
> **註記（非漏洞，勿誤判修掉）**：committee 在案件列表與詳情**看得到 `vendor_name`**（可知道誰在修），但 `GET /api/vendors` 限 manager/admin（不可指派、不可管理廠商資料）。這是刻意設計。

---

## 4. API 契約

### 4.0 通用規格

**回應信封**（統一走 `lib/respond.ts`）：

```json
成功：{ "ok": true, "data": ... }
失敗：{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

**前端 fetch 規則**：所有 mutation（POST/PATCH/DELETE）必帶自訂 header `X-Requested-With: fetch`，缺 header 後端一律 `403`（見 §3.3）。前端 fetch wrapper 必須統一自動帶上此 header。

**錯誤碼表**：

| HTTP | code | 意義 |
|---|---|---|
| 400 | VALIDATION_ERROR | 欄位驗證失敗（依 §4.1 規則表） |
| 400 | ADMIN_LOCKED | 違反 users 防呆規則（不可停用自己／至少保留一位 admin） |
| 401 | UNAUTHORIZED | 未登入 / session 過期 / 簽名錯誤 |
| 401 | EXPORT_LINK_EXPIRED | 匯出下載連結已過期 |
| 403 | PENDING | 帳號待審核 |
| 403 | DISABLED | 帳號已停用 |
| 403 | FORBIDDEN | 角色權限不足（含 CSRF header 缺失） |
| 404 | NOT_FOUND | 資源不存在（含 share token 無效） |
| 500 | INTERNAL | 伺服器錯誤 |

### 4.1 欄位驗證規則表（所有 VALIDATION_ERROR 的判準）

| 欄位 | 規則 |
|---|---|
| category_id / location_id | 必填，且必須是 active 的 option |
| description（建單） | 選填，≤ 500 字 |
| note（回報） | 選填，≤ 500 字 |
| note（留言） | **必填**，1–500 字（資料庫 CHECK 為第二道防線） |
| vendor_id | **僅 PATCH 適用**：選填，**三態**——不帶＝不變、`null`＝清空指派、正整數＝指派新廠商（須 active；D1/G1） |
| photo_ids | 選填，≤ 5 張，**每張須滿足 `uploaded_by=本人` 且 `target_id IS NULL`**（後端強制） |
| status（回報） | 必填：open / in_progress / done |
| 廠商 name | 必填，1–50 字；sort_order 選填，非負整數（預設 0） |
| 選項 label | 必填，1–30 字 |
| 成員 display_name | 必填，1–20 字 |

### 4.2 Auth

**POST `/api/auth/session`** — 見 §3.1。需 CSRF header，不需已登入。

**GET `/api/auth/me`** — 使用 `requireAuth({ allowPending: true })`

```json
{ "ok": true, "data": { "id": 3, "display_name": "陳小姐", "role": "manager" } }
```

**POST `/api/auth/logout`** — 使用 `requireAuth({ allowPending: true })`，清除 Cookie。

### 4.3 Tickets

**POST `/api/tickets`**（三角色）

```json
請求：{ "category_id": 2, "location_id": 1, "description": "選填", "photo_ids": [11, 12] }
```

- **不接受 `vendor_id`**（建單不指派廠商；廠商僅在 PATCH 指派）
- 從 options 取出 label **快照**寫入 `category_label`／`location_label`
- 產生 `share_token`（crypto.randomUUID()）
- `photo_ids` 依 §4.1 驗證後綁定（`target_type='ticket'`）
- 建單＋照片綁定以 `env.DB.batch()` 一次完成
- title ＝ `{category_label}－{location_label} #{id 補零 4 位}`（全角「－」）

**GET `/api/tickets`**（三角色）

- Query：`status`、`category_id`、`page`（預設 1）、`limit`（預設 20，上限 50）
- **`status` 允許值寫死**：`active`（＝open+in_progress，**預設**）｜`open`｜`in_progress`｜`done`｜`void`｜`all`；未帶參數時預設 `active`
- 排序：`last_activity_at DESC`
- 回應：`{ items, page, limit, has_more }`（實作：查 `limit+1` 筆判斷）
- item 欄位：`id, title, status, category_label, location_label, vendor_name, created_at, last_activity_at`
- **item 不含 `stale`**，由前端用 `last_activity_at` 計算
- v1 不做關鍵字搜尋（明示不做的範圍）

**GET `/api/tickets/:id`**（三角色）

- 案件本體＋`photos`（target_type='ticket' 的 url 陣列，格式 `/api/photos/{id}`）＋`updates` 時間軸
- `updates` 每筆：`{ id, kind, status, note, display_name, created_at, photo_urls }`（`status` 可為 NULL）
- 廠商已停用時 `vendor_name` 後綴「（已停用）」
- `share_url` 三角色皆回傳（僅查看／複製；重新產生限 manager/admin）。**格式 `/share.html?token={share_token}`**（指向人類可讀公開頁；v1.1.4 起，原先指向 JSON API `/api/share/{token}`）

**PATCH `/api/tickets/:id`**（**D7：committee 僅自己建的單；manager/admin 全部**）

- 可改：category_id、location_id、description、vendor_id
- **committee 即使編自己的單也不可改 vendor_id**（廠商指派權限仍限 manager/admin）
- 僅 open / in_progress 可編輯（已結案/作廢不可改）
- 改類別/地點時快照 label 同步更新
- **改類別後若原地點不屬於新類別且非通用 → 回 `400 VALIDATION_ERROR` 要求重選地點**（A1，不再清空 location）
- **vendor_id 三態**：不帶＝不變、`null`＝清空指派、正整數＝指派新廠商（D1/G1）
- 儲存後自動寫入時間軸：`kind='system'`、`status=NULL`、`note='已修改：類別 電梯→門禁；說明'`（before→after 摘要，無變動欄位不列出；**廠商變更留 `廠商 舊→新`**，G5）

**POST `/api/tickets/:id/updates`**（manager/admin）

```json
請求：{ "status": "in_progress", "note": "選填", "photo_ids": [21], "amount": 5000 }
```

- ticket.status 同步更新；done 時設 `closed_at`／`closed_by`
- **v1.1.12：`in_progress` 代表「已發包」，必填 `amount`（正整數）**；寫入 `tickets.amount` 與 `amount_at`（發包時間，統計月份基準），同時寫入該筆 `ticket_updates.amount`（時間軸顯示發包金額用）
- **v1.1.13：`amount/amount_at` 只在 in_progress 時更新，其他狀態（含 done）保留既有值不清空**（結案後發包金額與統計月份基準不消失）
- 更新 `last_activity_at`；照片綁定 `target_type='update'` + 該筆 update id
- 多步驟寫入用 `env.DB.batch()`
- 已結案（done）或作廢（void）的單 → 回 `VALIDATION_ERROR`
- **v1.1.14 狀態流限制（F3）**：後端驗證合法轉移——`open → [in_progress, done]`、`in_progress → [in_progress, done]`（in_progress→in_progress 允許＝多次發包覆寫金額）。**鎖死退回（`in_progress→open` 禁）、`open→open` 禁**；違反回 `VALIDATION_ERROR`。前端 comment-box 下拉依 `t.status` 過濾選項（與後端一致）

**POST `/api/tickets/:id/comments`**（三角色，D1）

```json
請求：{ "note": "必填，1–500 字", "photo_ids": [21] }
```

- 寫入 `kind='comment'`、`status=NULL`；**不改變 ticket.status**
- 留言照片一律 `target_type='update'`、`target_id=該留言 id`
- 更新 `last_activity_at`（留言算案件活動）
- open / in_progress / done 可留言（done 留言不會重開）；**void 不可留言**

**POST `/api/tickets/:id/void`**（manager/admin）

```json
請求：{ "note": "選填原因" }
```

- 寫入時間軸 `kind='status'`、`status='void'`、`note=原因`
- ticket 設 `status='void'`、`closed_at`／`closed_by`
- 前端需二次確認（同結案）

**POST `/api/tickets/:id/reopen`**（僅 admin，D2）

```json
請求：{ "status": "in_progress", "note": "選填" }   // status 只能 open 或 in_progress，預設 in_progress
```

- 僅限 done / void 的案件
- ticket：`status`＝指定狀態、`closed_at/closed_by` 清空、更新 `last_activity_at`
- **reopen 不接受 `amount`，也不動既有 `amount/amount_at`**（v1.1.13 語意鎖死）：若 reopen 回 `in_progress`（=已發包），沿用原發包金額與發包時間；統計月份基準不因 reopen 改變
- 時間軸寫入 `kind='status'`、指定 status，note 模板帶入**實際前狀態**：
  `重新開啟（原狀態：已完成）<備註>` 或 `重新開啟（原狀態：已作廢）<備註>`（備註選填，無備註不帶冒號，G6），禁止寫死

**POST `/api/tickets/:id/share-token`**（manager/admin）

- 重新產生 `share_token`，舊連結立即失效，回傳新 `share_url`（格式 `/share.html?token={token}`）

### 4.4 Photos

**POST `/api/photos`**（三角色，multipart）

- 白名單：`image/jpeg`、`image/png`、`image/webp`（**不含 HEIC**）
- 驗 magic bytes：JPEG `FF D8 FF`、PNG `89 50 4E 47`、WebP `RIFF????WEBP`
- ≤ 10MB；R2 key＝`photos/{uuid}`（無副檔名），`httpMetadata.contentType` 一併寫入
- photos 表存 `content_type`、`size_bytes`，`target_id=NULL`（待綁定）
- 回應：`{ id, url }`（url 格式 `/api/photos/{id}`）

**GET `/api/photos/:id`**（已開通使用者）

- Cookie 驗證（`<img>` 直接可用）
- 歸屬檢查：`target_id IS NULL`（未綁定）的照片僅上傳本人可取；已綁定照片所有已開通使用者可讀
- 回應標頭：`Content-Type` 依 DB 記錄、`X-Content-Type-Options: nosniff`、`Content-Disposition: inline; filename="photo-{id}.jpg"`（副檔名依 content_type 推斷）、**`Cache-Control: private, max-age=86400`**（24 小時，避免照片牆滑動時重打 R2）

### 4.5 Share（公開，免登入）

> **安全（v1.1.10）**：`GET /api/share/:token` 與 `/api/share/:token/photos/:photo_id` 只接受**標準 UUID 格式**的 token，非 UUID 直接回 404（防暴力掃描/列舉）。

**GET `/api/share/:token`**

- 回傳**僅白名單欄位**（逐欄 SELECT，禁止 `SELECT *`）：
  `title, status, category_label, location_label, description, photos（target_type='ticket' 的 url，格式 /api/share/{token}/photos/{id}）, created_at, last_activity_at`
  - `last_activity_at` 用途寫明：供 share.html 顯示「狀態更新於 ……」，讓廠商知道資訊時效
- **不回傳**：廠商名稱、時間軸、任何使用者資料
- 標頭：`X-Robots-Tag: noindex`、`Referrer-Policy: no-referrer`
- token 無效 → `404 NOT_FOUND`；share.html 顯示人讀的「連結已失效」頁面（非 JSON）
- Cloudflare Rate Limiting rule 列 v1.1 選配（Dashboard 設定，不寫程式）

**GET `/api/share/:token/photos/:photo_id`**（公開，免登入）

- 必須驗證：該 photo **屬於該 token 對應的 ticket**，且 `target_type='ticket'`
- **不得**回傳 `target_type='update'` 的照片（回報／留言照片屬內部進度，外洩風險）
- 驗證通過才從 R2 輸出；token 無效或 photo 不屬於該 ticket → `404`
- 標頭：**`Cache-Control: private, max-age=300`**（token 重發後舊連結的照片最多再被快取 5 分鐘，且不被共享快取；派工頁圖不多，放棄長快取代價可忽略）、`X-Content-Type-Options: nosniff`

### 4.6 Options／Vendors／Users

| 端點 | 權限 | 說明 |
|---|---|---|
| GET `/api/options/catalog` | 三角色 | 一次抓所有選項＋關聯：`{categories, locations, descriptions, comment_descs}`（v1.1.9 加 comment_descs） |
| GET `/api/options?type=category\|location\|description\|comment_desc` | 三角色 | **三種模式**（v1.1.7）：① 不帶參數＝只回 active；② 帶 `category_id=N`＝只回該類別關聯＋通用；③ 帶 `include_inactive=1`（限 manager/admin）＝含停用並附 `category_ids` |
| POST `/api/options` | manager/admin | `{ type, label, sort_order, category_ids? }`；若 `(type,label)` 已存在 → 該筆 `active=1` 並更新 `sort_order`，否則新增；`category_ids` 三態（undefined 不動／[] 清空／有值全量覆寫） |
| PATCH `/api/options/:id` | manager/admin | 改 label／sort_order／active（停用）／category_ids |
| POST `/api/options/:id/assoc` | manager/admin | 以類別為中心全量覆寫關聯（v1.1.7） |
| GET `/api/vendors` | manager/admin | 列表（含停用）；排序 `active DESC, sort_order, id`（v1.1.13） |
| POST `/api/vendors` | manager/admin | 新增（name） |
| PATCH `/api/vendors/:id` | manager/admin | 修改／停用／改 `sort_order` |
| GET `/api/users` | admin | 列表（含 pending 與停用） |
| PATCH `/api/users/:id` | admin | 可改 `role`、`active`、`display_name`；**防呆規則見下** |

**PATCH `/api/users/:id` 防呆規則**：

| 規則 | 說明 |
|---|---|
| 不可停用自己 | `active` 由 1 改 0 且 `id == 自己` → 拒絕 |
| 不可對自己降權 | `role` 由 admin 改非 admin 且 `id == 自己` → 拒絕 |
| 至少保留一位 admin | 操作後 `active=1 AND role='admin'` 的人數須 ≥ 1，否則拒絕 |

違反上述任一規則 → `400 ADMIN_LOCKED`（message 說明原因如「不可停用自己」「系統至少需保留一位管理員」）。

### 4.7 統計

**GET `/api/stats/summary`**（**三角色皆可**，D6）

| 欄位 | 定義（寫死） |
|---|---|
| `open_count` / `in_progress_count` | 目前狀態即時數 |
| `month_new` | 當月 `created_at` 的案件數 |
| `month_done` | **台灣當月內，時間軸出現過 done 回報的不重複案件數**（見下方 SQL） |
| `month_initial_open` | **期初未結案**（v1.1.14 A3 方案②）：本月月初時點尚未結案（open+in_progress；done/void 不計） |

- **v1.1.14（A3 方案②）完成率分母**：完成率＝`month_done / (month_initial_open + month_new)`，由前端計算；分母為 0 顯示「—」
- `month_initial_open` 因 `tickets.status` 是現狀快照、reopen 會改狀態，以月初時點推導（見下方 SQL 註）

- 月份邊界＝**台灣時區**當月 1 日 00:00 起，由 `taipeiMonthRangeUtc()` 換算 UTC 後帶入 SQL
- `month_done` 依據 append-only 的 `ticket_updates` 計算：reopen 不回溯改變歷史月份數字；同案件同月「結案→reopen→再結案」只計 1 件；作廢自然不算完成

```sql
SELECT COUNT(DISTINCT ticket_id) AS month_done
FROM ticket_updates
WHERE kind = 'status' AND status = 'done'
  AND created_at >= :month_start_utc
  AND created_at <  :month_end_utc
```

**GET `/api/stats/amount-by-category?month=YYYY-MM`**（**三角色皆可**，v1.1.12）

| 欄位 | 定義 |
|---|---|
| `month` | 台灣當月（缺省為當月） |
| `items` | `[{ category_label, total_amount, count }]`——以發包時間為月份基準，各類別 `amount` 加總 |

- **以發包時間（`tickets.amount_at`）為記錄基準**：某月內 `amount_at` 落點的案件，其金額納入該月該類別
- 缺省查當月（`taipeiMonthRangeUtc()`），可傳 `month=YYYY-MM` 查指定月份
- `amount_at` 為 NULL（未發包/詢價中）不計入
- **多次發包語意（v1.1.13 鎖死）**：同一張單若多次回報 `in_progress`，`tickets.amount/amount_at` 會被**覆寫為最後一次**；統計以最終 `amount_at` 落點月份計一次，**不加總歷史各次金額**（時間軸每筆 `ticket_updates.amount` 保留歷史，供詳情查看）

```sql
SELECT category_label, COALESCE(SUM(amount),0) AS total_amount, COUNT(*) AS count
FROM tickets WHERE amount IS NOT NULL AND amount_at >= :start AND amount_at < :end
GROUP BY category_label ORDER BY total_amount DESC
```

### 4.7.1 案件動態日報（F1，v1.1.15）

**GET `/api/stats/daily-report`**（**三角色皆可**）

| Query | 必填 | 說明 |
|---|---|---|
| `date` | **必填** | `YYYY-MM-DD` 台灣時區；**不驗證真實日期以外的合法性**（前端 max=今天） |
| `category_id` | **必填** | 正整數；不存在 → `404 NOT_FOUND` |

- **時間計算**：`taipeiDayRangeUtc(date)` 回 `{startMs, endMs}`（毫秒數字）
  - `startMs` = 該日**台灣 00:00** 的 UTC 對應 = 前一日 16:00:00.000Z
  - `endMs`   = **明日台灣 00:00** 的 UTC 對應 = 該日 16:00:00.000Z
  - **半開區間 `[startMs, endMs)`**（F11-7）
  - 台灣時區 UTC+8，**不是** UTC 當天 00:00 — 見 `tests/time.test.ts` F2 統計語意 case
- **回應結構**（v1.1.16：純資料 + new_case/timeline 兩種模板 body，前端負責渲染成品）：
  ```jsonc
  {
    "date": 1755892800,                 // unix seconds（當日台灣 00:00），前端取 M月D日
    "category_id": 1,
    "category_label": "水電",
    "new_cases": [
      { "id": 7, "location_label": "頂樓", "status": "詢價中", "description": "水泵故障" }
    ],
    "timeline_updates": [
      { "id": 3, "location_label": "大廳", "status": "已發包", "note": "已通知廠商" }
    ],
    "has_content": true,                 // new_cases / timeline_updates 任一非空
    "templates": {
      "new_case": { "id": 12, "body": "{{#each new_cases}}\n{{id}}. {{location_label}}　{{status}}　{{description}}\n{{/each}}" },
      "timeline": { "id": 13, "body": "{{#each timeline_updates}}\n{{id}}. {{location_label}}　{{status}}　{{note}}\n{{/each}}" }
    }
  }
  ```
- **new_cases**：當日（`created_at` 在區間內）、屬該類別之新建案件；`status` 固定為「詢價中」（前端文案，非 tickets.status）
- **timeline_updates**：既有案件（`last_activity_at` 在區間內且 `created_at < startIso`，非當日新建）於當日 update **拉平成一維清單**，每筆含 `id`(案件編號)、`location_label`、`status`(原 status_label)、`note`(留言；null→空字串)。上限：每張既有案件當日 update 最多 3 筆，依 `created_at` 反序取最新 3 再 reverse 為時間正序（由舊到新）
- **業主決策（2026-08-23）**：當日新建 + 當日又有 update 的案件只進 `new_cases`，不進 `timeline_updates`
- **templates.new_case / timeline**：可編輯模板內容（v1.1.16 起 seed 於 migration 0012；**v1.1.20 起內容存 `label` 欄、`type` 欄當鍵**，migration 0013 自 `body` 欄搬遷並 DROP 該欄；active=1、全域）。即使無案件也回傳（前端空案時以硬編文案取代渲染結果）
- **has_content**：`new_cases` 與 `timeline_updates` 任一非空 → true。前端依此決定成品末尾是否追加總系統連結（R-2）

### 4.8 CSV 匯出（D3）

> 背景：iOS LINE WebView 對 `Content-Disposition: attachment` 支援不穩，而使用者 100% 從圖文選單進入。故採「簽名連結＋外部瀏覽器」方案。

**POST `/api/exports/sign`**（manager/admin，標準 Cookie＋CSRF 驗證）

```json
請求：{ "status": "done", "from": "2026-07-01", "to": "2026-07-31" }
回應：{ "ok": true, "data": { "url": "/api/exports/tickets.csv?uid=3&status=done&from=2026-07-01&to=2026-07-31&exp=1755612000&sig=..." } }
```

- 三個篩選參數全選填，與 CSV 端點共用同一個 zod schema
- `exp`＝當下 Unix 秒 + **300（5 分鐘）**
- `sig`＝`base64url(HMAC_SHA256(JWT_SECRET, "export:v1|" + [uid, exp, status||'', from||'', to||''].join('|')))`
  - **domain separation**：前綴 `"export:v1|"` 避免與 session JWT 產生跨用途碰撞

**GET `/api/exports/tickets.csv`**（**註冊於全域 requireAuth 之上**，端點內雙軌自驗，任一通過）

- **軌 A**：呼叫 `resolveUser(c)` 取得有效 session，且 role 為 manager/admin（供已登入的外部瀏覽器直接使用）
- **軌 B**（resolveUser 回 null 或角色不符時）：驗 `uid`/`exp`/`sig`
  1. `exp` 過期 → `401 EXPORT_LINK_EXPIRED`；偵測 `Accept: text/html` 時回極簡 HTML 頁（「下載連結已過期，請回系統重新匯出」），API 呼叫仍回 JSON
  2. 依查詢參數重算 sig，timing-safe 比對不符 → `401 UNAUTHORIZED`
  3. `uid` 對應使用者須存在、`active=1`、role 為 manager/admin（與「停用立即生效」原則一致）

**內容規格**：

- 編碼：**UTF-8 with BOM**（`\uFEFF` 開頭，Excel 開中文不亂碼）
- 欄位（**13 欄**，v1.1.14 加發包金額/時間）：
  `單號, 類別, 地點, 說明, 狀態, 廠商, 建立人, 建立時間, 最後活動, 結案時間, 回報次數, 發包金額, 發包時間`
  - 單號格式 `#0042`；時間格式 `YYYY-MM-DD HH:mm`（台灣時區）；回報次數＝該單 `kind='status'` 的筆數
  - 第 12/13 欄「發包金額／發包時間」＝ `tickets.amount/amount_at`（多次發包覆寫為最後一次；未發包為空字串）
- Query（皆選填）：`status`、`from`、`to`（台灣日期 YYYY-MM-DD，對 created_at 篩選）；無參數＝全部案件
- **日期真驗證（v1.1.14 F2）**：`from`/`to` 除 regex 外，須為真實日期（擋 `2026-02-31`、`2026-99-99`），否則 `400`；`from <= to` 否則 `400`
- **`to` 邊界（v1.1.14 F1）**：視 `to` 為「隔天 00:00 前」，`created_at < to+1天`，不漏 `to` 當天 23:59:59.999
- **CSV injection 防護**：以 `=`、`+`、`-`、`@`、`\t`、`\r` 開頭的儲存格前綴 `'`（v1.1.14 G2：**忽略前導空白**後再判，防 `"  =..."` 繞過）
- **Quoting 規則**：欄位含 `,`、`"`、`\n`、`\r` → 整欄以雙引號包住；欄位內 `"` → `""`
- Header：`Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="repair-tickets-20260818.csv"`（檔名用 ASCII＋匯出日期）、`Cache-Control: no-store`、`X-Robots-Tag: noindex`
- v1 只匯出案件主表；時間軸明細匯出列 v2

**前端流程**：

1. 按「匯出 CSV」（帶目前篩選）→ `POST /api/exports/sign`
2. 取得 url 組成絕對網址 → `liff.openWindow({ url, external: true })`
3. 匯出鈕旁固定提示：「將於外部瀏覽器開啟下載」
4. 已在外部瀏覽器且已登入時：可直接 `window.open`（走軌 A）

### 4.9 訊息模板 CRUD（F6/F8，v1.1.15；v1.1.20 欄位重新分配）

> 不新開表，沿用既有 `options` 字典表。F12-2 業主決策。
> **v1.1.20（業主決策）**：`type` 欄直接當模板鍵（`message_template_new_case` / `message_template_timeline`）、`label` 欄存模板內容，**砍掉 `body` 欄**（migration 0013）。舊的 `type='message_template'`＋`label` 當鍵＋`body` 存內容設計廢止；v1.1.15 的 `report` / `empty` 兩行一併刪除（無用途）。對外 API 形狀不變：query/response 的 `label` 是鍵、`body` 是內容（現取自 `label` 欄）。

**GET `/api/message-templates?category_id=N&label=new_case|timeline`（`label` 選填，預設 `new_case`）；`ALLOWED_LABELS = [new_case, timeline]`，其它值 → `400 VALIDATION_ERROR`**

- 三角色皆可讀
- 回 `{ templates: [{ id, label, body, active, is_category_specific }] }`（v1.1.20：`label` 由 `type` 前綴導出、`body` 取自 `label` 欄）
- 排序：類別專用優先、無則用全域預設（`active=1` 且無 option_categories 關聯）

**GET `/api/message-templates/:id`**

- 三角色皆可讀；無效 id → `400`、不存在 → `404`

**PUT `/api/message-templates/:id`**

- **manager/admin** 限定；committee → `403`
- body 接受 `{ body?: string, label?: 'new_case'|'timeline' }`（至少一欄）；空 body → `400 VALIDATION_ERROR`
- in-place overwrite（v1.1.20）：`body`→`UPDATE label`（內容）、`label`（鍵）→`UPDATE type`（加 `message_template_` 前綴，同鍵被其他 id 占用 → `400 VALIDATION_ERROR`）
- **不做**新增/刪除/啟用切換：編輯就是修改該筆 active=1 模板，存檔後直接覆寫生效

**模板語法（F8）**：

- `{{key}}` 替換；缺值 → 空字串
- `{{#each array}}...{{/each}}` 迴圈；支援巢狀
- `{{序}}` 為迴圈計數器（1-based）
- v1.1.16：模板渲染**全在前端**（`public/templateEngine.js`）。後端 `src/lib/templateEngine.ts` **已刪除**，API 不回傳渲染結果，只回純資料 + 兩種模板 body
- v1.1.16 可編輯模板僅兩支：**new_case**（變數：`{{id}} {{location_label}} {{status}} {{description}}`）與 **timeline**（變數：`{{id}} {{location_label}} {{status}} {{note}}`），皆用 `{{#each new_cases}}` / `{{#each timeline_updates}}` 迴圈
- **變數解析順序**（F8 v1.1.15）：巢狀 each 內變數查找 = 當前 item → 外層 each item（遞迴向上）→ ctx 頂層。內層有同名變數時遮蔽外層。

---

## 5. 前端畫面

### 5.0 全域規則

- `index.html` 為 SPA 入口，hash router 切換 P0–P7；`share.html` 為獨立免登入頁
- 所有 `<img>` 直接使用 API URL（Cookie 自動帶上）
- 使用者內容進 DOM 一律 `textContent`，禁止 `innerHTML`
- 401 一律走 §3.4 靜默重登；403 依 code 顯示對應訊息
- 前端 fetch wrapper 統一自動帶 `X-Requested-With: fetch`（見 §4.0）
- 照片壓縮：`browser-image-compression`（最長邊 1280px、目標 ≤500KB、初始品質 0.7、輸出 JPEG）；**解碼失敗時**顯示「此照片格式無法處理，請改用相機拍攝或先在相簿轉存」
- 觸控目標 ≥ 44px、內文字級 ≥ 16px（input 也 16px，避免 iOS 自動縮放）
- 狀態色：🔴詢價中／🟡處理中（已發包）／🟢已完成／⚫作廢

**v1.1.13 觸控與可讀性補強**：
- **照片刪除鍵 `.thumb-del` ≥ 32px**（原 22px 過小，觸控不佳）
- **狀態徽章對比**：黃底改深琥珀字（`#92400e`）、紅底改淺紅底深紅字、綠底改淺綠底深綠字（WCAG AA 可讀）
- **`<select>` 統一 `padding-right: 32px`**：避免長文字被 iOS 原生箭頭覆蓋
- **`.modal` 加 `max-height: 85vh; overflow-y: auto; display:flex; flex-direction:column`**（選項多時不超出視窗）

**v1.1.13 提示統一**：操作回饋/錯誤改用既有 `toast()`（底部滑出、自動消失），**不再用原生 `alert()`**（WebView 中會中斷體驗）。

### 5.0.1 P0 等待開通頁

```
┌─────────────────────┐
│   🏘️ 社區修繕系統    │
│                     │
│  您好，{LINE 名稱}    │  ← 從 GET /api/auth/me 取得
│  您的帳號等待開通中    │
│  請通知管理公司審核    │
│                     │
│  [ 重新整理 ]         │
└─────────────────────┘
```

- 進入系統後，前端先打 `GET /api/auth/me`；若 `role === 'pending'` → 導向 P0
- P0 提供「重新整理」按鈕，重新打 me 檢查是否已開通

### 5.1 P1 案件列表

- 狀態篩選 tabs：**未結（=active，預設）／詢價（open）／處理（in_progress，代表已發包）／完成（done）／作廢（void）／全部（all）**——名稱與 status 值一一對應；類別下拉篩選
- 卡片：標題、狀態徽章、廠商、最後活動時間
- **指派廠商只在編輯頁**（v1.1.5：列表卡片不塞指派下拉）
- stale 提示**前端計算**：`now − last_activity_at > 7×24h`（僅 open/in_progress 顯示），文案含實際天數：「⚠ 12 天未更新」
- 分頁：依 `has_more` 顯示「載入更多」

### 5.2 P2 建單

- **類別下拉、地點下拉**（v1.1.7 起用 `GET /api/options/catalog` 一次抓完所有選項＋關聯，**分層快取**：建單/編輯用短 TTL（30 秒），列表/留言用長 TTL（10 分鐘）——v1.1.8 優化，取代「每次進頁強制重讀」，避免每次進建單/編輯頁都吃一次 D1 連線延遲；換類別本地過濾即時）
- **使用範本下拉＋附加按鈕**（v1.1.5 改下拉＋附加；v1.1.9 正名「故障類型範本」；v1.1.11 改「使用範本」並移到說明之下）：選取後按「＋ 附加」將文字附加至 textarea，已有內容時以「、」串接；同一說明不重複附加。**順序：類別 → 地點 → 說明 → 使用範本（選填）→ 照片**，範本為選填輔助，位在主要說明欄位之下
- 說明 textarea（選填）、照片上傳（先壓縮 → POST /api/photos → 收 id）
- **照片上傳共用函式（v1.1.13）**：`attachPhotoPicker(photos, initialPhotos?)` 為全域共用（`public/app.js`），建單/留言框/編輯三處**共用同一份**照片選擇邏輯——壓縮、≤5 張上限、縮圖預覽、✕ 刪除鍵、上傳回傳 id。呼叫端持有 `photos` 陣列（mutable），函式同步 push/splice 維護；`initialPhotos`（選填）供編輯頁帶入既有照片。**禁止各頁複製貼上照片邏輯**
- **無廠商欄位**（建單不指派廠商；廠商僅在 PATCH 由 manager/admin 指派）
- **無關聯類別**（v1.1.7）：選到地點/說明全空的類別時，alert 提示並重新讀取 catalog（**不重整頁面，保留已輸入資料**）
- 送出 → POST /api/tickets → 跳 P3

### 5.3 P3 案件詳情

- **右上角 ⋮ 選單**（v1.1.6）：利用返回右邊空間，點開下拉顯示 **分享連結（複製）／✏️ 編輯／🗑 作廢／↩️ 重新開啟／🔄 重新產生分享連結**。分享連結不再佔主版面。
- 案件資訊卡（緊湊：detail-head/detail-line）、照片牆、**時間軸為主角**。時間軸依 `kind` 三種樣式：狀態回報（徽章＋說明＋照片）／💬 留言（姓名＋內容＋照片，無徽章）／系統紀錄（灰色小字，**v1.1.14 顯示實際操作者名字**，無名時 fallback「系統」）
- **發包金額顯示（v1.1.12）**：案件已發包（`amount` 非空）時，資訊卡顯示「發包金額：$X」；時間軸的「已發包(in_progress)」回報更新若帶 `amount`，也在該筆時間軸顯示「發包金額：$X」
- **底部留言框改隱藏式**（v1.1.6）：頁面底部只有「💬 留言／回報」按鈕，點開才展開留言框＋可選狀態更新（manager/admin 可標記處理中/完成，委員僅留言）
- **⋮ 選單**：編輯（**v1.1.14 E1 方案B**：詳情回應含 `can_edit`，由後端算好；committee 僅自己建的單、manager/admin 全部，open/in_progress）、作廢（manager/admin，二次確認含選填原因）、重新開啟（僅 admin 且 done/void → modal 選狀態＋備註）、重新產生分享連結（manager/admin，直接更新輸入框）
- 🟢 完成（P4 回報選 done）需二次確認彈窗
- **縮圖點開放大**（lightbox，v1.1.4）：詳情頁主照片牆、時間軸回報/留言照片、**公開派工頁（share.html）照片牆**三處共用同一 `thumb()`＋`openLightbox()` 邏輯。**v1.1.13 修復 share 頁縮圖點不開**——share.js 的 `el()` 缺 `onclick` 事件處理（`setAttribute` 傳函式無效），補 `addEventListener` 與 app.js 一致；share.html 引用 share.js 加版本參數防快取
- **指派廠商在編輯頁內**（v1.1.5：保全/秘書層級，不再塞列表/詳情頁）
- **編輯照片（v1.1.13）**：編輯頁可**補上傳新照片**（共用 `attachPhotoPicker`）、可**刪除既有照片**（✕ 移除清單）。儲存時送 `photo_ids`（**最終要保留的案件主照片清單，全量覆寫**）——新增的照片綁定到該案、被移除的照片**解除綁定（`target_id=NULL`），不刪 R2**。照片有增刪才送；時間軸以 `system` 紀錄「新增 N 張照片／移除 N 張照片」

### 5.4 P4 回報／留言（v1.1.5 起併入 P3 詳情頁留言框）

> **已移除獨立「新增回報」頁**（v1.1.5 起）：回報統一走 P3 詳情頁底部的「💬 留言／回報」留言框，含狀態更新。v1.1.8 清理死碼，移除 `pages.report` 與 `#/report` 路由。

- 狀態更新（kind=status）限 **manager/admin**，可選 詢價中／🟡 已發包（必填金額）／🟢 完成
- 按 🟢 完成即結案，需二次確認彈窗：「標記為已完成並結案？」
- 純留言（kind=comment）**三角色皆可**，不改狀態
- 委員不可變狀態，僅能留言（§0.3 規則 2）
- **回報範本下拉＋附加**（v1.1.7 加，v1.1.9 改 `type='comment_desc'`）：manager/admin 留言框有「選擇回報範本…」下拉，選取後按「＋ 附加」附加至留言 textarea；**通用不依類別過濾**（追蹤說明，全部顯示）

### 5.5 P5 統計（**三角色皆可**，D6）

- 六個數字卡片（v1.1.4）：詢價中、處理中、**未結案總數**、本月新增、本月完成、**本月完成率**（v1.1.14 A3 方案②改為 `= 本月完成 / (期初未結案 + 本月新增)`，分母 0 顯示「—」）
- **月份切換（v1.1.14 A4）**：近 12 個月下拉，切換時以 `Promise.all` 同步刷新 summary 與各類別金額（避免上下月不一致）
- **各類別金額區塊（v1.1.12）**：以發包時間（`amount_at`）為月份基準，各類別 `amount` 加總，顯示「類別／件數／金額」＋合計
- 「匯出 CSV」按鈕＋固定提示「將於外部瀏覽器開啟下載」（流程見 §4.8）——**僅 manager/admin 可見**（D3）
- **案件動態區塊（F2/F3，v1.1.15）**：「各類別金額」區塊下方，**不擠壓現有版面**：
  ```
  ───── 案件動態 ─────
  [日期 <input type="date" max=今天>] [類別下拉] [📋 複製]
  [訊息預覽 textarea readonly]
  ```
  - 日期選擇器：`<input type="date">`，**max=今天**（不允許選未來），onchange 重抓
  - 類別下拉：從 `ensureCatalog()` 拿 categories，**預設第一個類別**，**不做「全部類別」選項**（訊息會過長），**不存 hash**，**用 `localStorage` 記住上次選擇**（業主 2026-08-23 決策）
  - 複製按鈕：`navigator.clipboard.writeText`；LIFF WebView / iOS Safari 權限問題 fallback `document.execCommand('copy')` + toast「已複製」
  - 訊息預覽（v1.1.16）：讀 daily-report 回傳的 `new_cases` / `timeline_updates` + `templates.new_case/timeline` body → 前端 templateEngine.render 渲染成兩段文案，再拼上硬編 header「修繕系統簡報：{X月Y日}」、空案文案（今天無新案件／今天沒有案件狀態更新），僅有實際內容時末尾追加總系統連結（R-2）
  - **空態**：`new_cases`、`timeline_updates` 皆空 → 兩段分別顯示「今天無新案件」「今天沒有案件狀態更新」（header/empty 文案硬編碼，非模板渲染）
  - **不做**今日/昨日/本週三選一，**單純日期選擇**就夠業主用了

### 5.6 P6 成員管理（admin）

- **權限分級中文化**（v1.1.5 定案）：主管（admin）／保全秘書（manager）／委員（committee）／待開通（pending）
- **篩選**（v1.1.4）：全部成員／待開通／已開通／已停用
- 成員列表：改角色、停用／啟用（**停用紅、啟用藍**，v1.1.4）、改名
- **防呆提示**：停用自己或最後一位 admin 時，後端回 `ADMIN_LOCKED`，前端顯示對應訊息

### 5.6.1 P6.1 訊息模板管理（F7 + G7，v1.1.15，manager/admin）

- 入口：**top nav「📝 訊息模板」**（manager/admin）；獨立頁 `pages.messageTemplates()`
- v1.1.16 **簡化為單 tab「訊息模板」**：固定兩個編輯區塊 — **「新案件」(new_case)** 與 **「時間軸」(timeline)**，各一行顯示名稱 + 類別專用/全域預設 + 「編輯」「重置出廠預設」（G7）
- 每個區塊點「編輯」→ modal：`<textarea>`（可拖曳調整大小）+ **即時預覽**（用前端 fixture 資料渲染，无需 roundtrip）＋變數提示
- body 可用變數：**new_case**＝`{{id}} {{location_label}} {{status}} {{description}}` + `{{#each new_cases}}...{{/each}}`；**timeline**＝`{{id}} {{location_label}} {{status}} {{note}}` + `{{#each timeline_updates}}...{{/each}}`
- 儲存：PUT /api/message-templates/:id（manager/admin 限定，body in-place overwrite）
- **不做**：下拉式變數插入、IntelliSense 自動完成、版本歷史（v1.1.16 簡化砍除）
- **重置為出廠預設（G7）**：seed body hardcode 在前端（與 migration 0012 對齊），確認後 PUT 覆寫

### 5.7 P7 管理（manager/admin，D5）

- 選項管理 tab：**類別／地點／使用範本／回報範本／廠商**（v1.1.4 起廠商獨立成 tab；v1.1.9 加「回報範本」tab 並正名「故障類型範本」；v1.1.11 統一「使用範本」）
- 選項：新增、改名、排序、停用（停用紅）
- 廠商：新增、修改、停用（停用紅／啟用藍）
- **類別關聯（v1.1.7 以類別為中心）**：類別 tab 每列顯示「📍N 地點 · 💬N 說明」關聯計數＋「設定關聯」按鈕；點開 modal 才載入該類別的地點/說明（checkbox 勾選），儲存走 `POST /api/options/:id/assoc` 全量覆寫。**不在列表逐項載入，避免 N+1**。

### 5.8 share.html（公開）

- 進入方式：**`/share.html?token={share_token}`**（v1.1.4 起；share.js 從 query 取 token，相容從 pathname 取）
- 顯示白名單欄位＋照片（照片 url 指向 `/api/share/{token}/photos/{id}`）
- 顯示「狀態更新於 {last_activity_at 換算台灣時間}」（此為 share 回傳 last_activity_at 的用途）
- **動態頁標題（v1.1.12）**：`/share.html` 由 Pages Function（`functions/share.html.ts`）動態渲染，依 token 查 D1 把 `<title>` 組成為「{類別}－{地點} #{id}」，讓通訊軟體分享卡片顯示案件標題（而非寫死「派工單」）；token 無效時回「派工單」預設標題。`_routes.json` 已加入 `/share.html` 走 function
- token 無效顯示「連結已失效，請向管理公司索取新連結」
- 內建 print CSS：管理公司可用瀏覽器「列印→儲存為 PDF」
- 安全標頭：**v1.1.12 起由 `functions/share.html.ts` 內直接回傳**（CSP/nosniff/no-referrer/noindex/no-cache），不再走 `public/_headers`（function 回傳不套用靜態檔 _headers）

---

## 6. CLAUDE.md（放 repo 根目錄，AI 施工必讀）

````markdown
# 社區修繕管理系統 — 施工規則

## 技術棧與結構
- 後端：Cloudflare Pages Functions + Hono。唯一入口 functions/api/[[path]].ts
  （export const onRequest = handle(app)）；路由在 src/routes/，共用層在 src/lib/。
- 語言分界：functions/、src/ 用 TypeScript；public/ 一律純 JS，禁止 import npm 套件。
- 前端第三方套件一律 vendored 至 public/vendor/ 以 <script src> 載入，禁止 CDN（唯一例外：LINE LIFF 官方 SDK，見 §1.2 前端套件規則）。
- 允許依賴：hono, @hono/zod-validator, jose, zod, browser-image-compression。
- 禁止：Node.js 專屬 API 或套件（jsonwebtoken, bcrypt, fs, multer, sharp, crypto.createHmac）。

## 硬性規則
1. SQL 一律 env.DB.prepare(...).bind(...)，禁止字串拼接；
   禁止 SELECT *（所有端點，逐欄列出）。
2. D1 不支援互動式交易；多步驟寫入一律 env.DB.batch([...])。
3. 時間寫入一律 new Date().toISOString()；禁止 datetime('now')；
   月份邊界只准用 src/lib/time.ts 的 taipeiMonthRangeUtc()（Asia/Taipei）。
4. API 回應信封統一走 lib/respond.ts：
   { ok:true, data } / { ok:false, error:{ code, message } }。
5. 權限：一律經 src/lib/auth.ts 的 resolveUser()/requireAuth()（每請求從 D1 讀 role/active）；
   禁止只信 JWT 內容；禁止只用前端藏按鈕當權限控制。
   auth/me、auth/logout 用 requireAuth({ allowPending: true })。
6. middleware 掛載順序即安全邊界（見 §1.3）：
   可能在無 Cookie 或 pending 狀態被呼叫的端點（share、GET /exports/tickets.csv），
   一律註冊於全域 requireAuth() 之上，並在端點內自驗（呼叫 resolveUser 或驗簽名）；
   禁止在全域 requireAuth() 之上新增未自驗權限的路由。
7. mutation 端點一律掛 csrfGuard：驗 X-Requested-With: fetch；
   Sec-Fetch-Site 有送且為 cross-site → 拒絕；沒送 → 僅驗 X-Requested-With（相容舊 WebView）。
8. 使用者內容（description, note, display_name, option label, vendor name）
   進 DOM 一律 textContent，禁止 innerHTML。
9. photo_ids 綁定必驗：uploaded_by=本人 && target_id IS NULL && ≤5 張；
   留言照片一律 target_type='update' + target_id=留言 id。
10. share 公開端點只回 §4.5 白名單欄位，禁止回傳時間軸與內部人員資料；
    share 照片端點必驗 target_type='ticket'。
11. ticket_updates 只有 INSERT，禁止 UPDATE/DELETE。
12. 不得自行新增資料表欄位或修改 API 回應格式；需要變更時輸出 diff 建議並停止，等待人工確認。
13. 不確定的 LINE / Cloudflare API 一律留 // TODO: verify against official docs，禁止猜測。
14. daily-report 簡化後（v1.1.16）訊息預覽不再逐項輸出時間欄位（`new_cases`/`timeline_updates` 皆為案件編號.地點.狀態.描述/留言的純文字），故無 HH:MM 時區問題；其余頁面的時間顯示仍一律台灣時區（與 §8.5 一致）。
15. 詳情連結走登入後路由 `/#/ticket/{id}`，**不走 share_token**（避免把公開連結用於內部通訊）。
16. 模板變數語法（F8）：`{{key}}` 替換 / `{{#each array}}...{{/each}}` 迴圈；後端**完全不渲染**，API 只回純資料 + new_case/timeline 兩種模板 body，前端 templateEngine.render() 負責管理頁預覽與統計頁成品拼裝（v1.1.16）

## 產品規則（不可自行更動）
- 狀態流：open → in_progress → done；另有 void；done/void 僅 admin 可 reopen。
- 回報（kind=status）限 manager/admin；留言（kind=comment）三角色皆可、不改狀態。
- 編輯、void、reopen 都必須寫入時間軸；reopen 訊息須帶入實際前狀態（已完成／已作廢）。
- month_done 從 ticket_updates 計算（見 §4.7），禁止用 tickets.closed_at。
- 建單不接受 vendor_id；廠商僅在 PATCH 由 manager/admin 指派。
- 編輯權限：committee 僅自己建的單；manager/admin 全部（D7）。
- 統計頁三角色皆可（D6）；CSV 匯出限 manager/admin（D3）。
- committee 看得到 vendor_name 但 GET /api/vendors 限 manager/admin——刻意設計，勿「順手修掉」。
````

---

## 7. LINE 平台設定（人工作業）

1. LINE Developers Console 建立 **LINE Login Channel**，取得 Channel ID
2. 建立 **LIFF app**：Scope 勾選 `openid`＋`profile`（`display_name` 取自 ID token 的 `name` claim）；Endpoint URL 填正式網域
3. **preview 環境**：**已取消（v1.1.5）**——preview 部署已關閉，僅需正式 LIFF app，不需另建 preview LIFF
4. **開官方帳號（OA）**：LINE Official Account Manager 註冊，選輕用量免費方案（⚠ 方案名稱與費率以 LINE 官方帳號後台當下公告為準）
5. **OA 與 Login Channel 連動**：OA 後台 → Messaging API 頁 → 選擇與 Login Channel 相同的 Provider → 啟用
6. **圖文選單（Rich Menu）**：OA 後台設定，連結指向 LIFF URL（圖文選單屬官方帳號功能，沒有 OA 就沒有入口）
7. **請成員加入好友**：社區管委會、管理公司人員加入 OA 好友（才能從圖文選單進入系統）
8. Channel ID 設定為 Pages 環境變數 `LINE_CHANNEL_ID`

---

## 8. 部署與工程

### 8.1 wrangler.toml

```toml
name = "repair-system"
compatibility_date = "2026-08-01"
pages_build_output_dir = "public"
# compatibility_flags = ["nodejs_compat"] 目前刻意不開；
# hono/jose/zod 皆 Web API 原生，日後引入 Node 相依再開

[[d1_databases]]
binding = "DB"
database_name = "repair-db0818"
database_id = "99a4f274-d68c-4ad6-b382-6a6e449cf0ed"

[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "repair-photos"

[vars]
LINE_CHANNEL_ID = "2008484338"
```

> **preview 決策（v1.1.5）**：preview 自動部署已關閉（`preview_deployment_setting: none`），單人開發直接 push main 走 production。preview 環境不再需要另建 `repair-db-preview` 或設定 preview 的 D1/R2/secret。

### 8.2 _routes.json 與 _headers

**`public/_routes.json`**：

```json
{ "version": 1, "include": ["/", "/index.html", "/api/*", "/share.html"], "exclude": [] }
```

> **⚠ 根路徑必須顯式列出（v1.1.19 實測修正）**：`include` 是白名單，沒列的路徑一律回靜態檔。v1.1.17 曾加 `functions/index.html.ts` 但沒列 `"/"`——CF Pages 檔案路由上根路徑 `/` 對應的檔名是 `functions/index.ts`（不是 `index.html.ts`），兩條件缺一不可，否則根路徑永遠回靜態 `public/index.html`（寫死 `?v=`），cache-busting 形同虛設。

**`public/_headers`**（Pages 靜態檔標頭設定；**v1.1.12 起 share.html 改由 Pages Function 動態渲染，其安全標頭在 `functions/share.html.ts` 內直接回傳**，`_headers` 不再含 `/share.html` 規則）：

```
/index.html
  Cache-Control: no-cache

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
```

> **⚠️ 主站不加 CSP（v1.1.13 實測後撤回）**：先前曾嘗試加主站 CSP，但**會導致 LINE 以外的瀏覽器無法開啟**（`script-src`/`connect-src` 白名單過嚴，擋掉 LINE 外環境的非 LIFF 載入）。主站維持「僅 nosniff + referrer-policy」、**不設 CSP**。share.html 的 CSP 由 Function 內獨立回傳（`functions/share.html.ts`），不受 `_headers` 影響，維持安全防護。

**`functions/index.ts`＋`functions/index.html.ts`（v1.1.19 重構；v1.1.17 新增）— 動態 cache-busting**：兩支薄入口共用 `functions/lib/dynamic-index.ts` 的 `serveDynamicIndex(env)`，請求時動態產生 index HTML，把本機 asset（`/style.css`、`/vendor/*.js`、`/templateEngine.js`、`/app.js`）的 `?v=` 設為 `CF_PAGES_COMMIT_SHA` 前 12 字（本機 `wrangler pages dev` fallback 取 `dev`），回應頭設 `Cache-Control: no-cache`＋與 `_headers` 一致的 `X-Content-Type-Options: nosniff`／`Referrer-Policy: no-referrer`（主站仍不加 CSP，同本節）。**目的：修復「每次部署看不到新程式」**——原本 `public/index.html` 寫死 `app.js?v=1.1.15`，即便 `_headers` 對 `/index.html` 設 `no-cache`，瀏覽器仍長快取舊版腳本；本 Function 讓每次部署產生唯一 `?v=<commit>` URL → 強制抓最新版、无需手動改版本號、永不忘。與 `functions/share.html.ts` 同属「function 動態渲染 HTML」模式，安全標頭皆於函式內直接回傳（不走 `_headers`）。
> ⚠ v1.1.19 實測修正：v1.1.17 只建了 `functions/index.html.ts`，但 CF Pages 檔案路由上**根路徑 `/` 對應的檔名是 `functions/index.ts`**、`/index.html` 路徑才對應 `index.html.ts`；加上 `_routes.json` include 白名單沒列根路徑 → 根路徑 `/` 一直回靜態 `public/index.html`，cache-busting 從未生效。v1.1.19 起兩支入口＋include 列 `"/"`、`"/index.html"` 才真正生效。
> ⚠ 修改 index HTML 結構（增減 `<script>`、`<link>`）時改 `functions/lib/dynamic-index.ts` 即可（兩支入口共用，勿再各改各的）。

> `X-Frame-Options`／`frame-ancestors`：LIFF 是 WebView 而非 iframe，理論上可設 `DENY`/`'none'`，但**實測確認不影響 LINE 開啟後再鎖**（避免誤擋）。故首版 `_headers` 先不加，列入施工驗證項。

### 8.3 migrations

```bash
npx wrangler d1 migrations create repair-db0818 init   # 產生檔案後貼入 §2.1 SQL
npx wrangler d1 migrations apply repair-db0818 --local      # 開發
npx wrangler d1 migrations apply repair-db0818 --remote     # 正式
```
> seed 已併入 migration（v1.1.6），無需手動執行 seed.sql。
```

### 8.4 secrets

- `JWT_SECRET` 只用 `wrangler pages secret put JWT_SECRET` 設定，不進版控
- 本機開發用 `.dev.vars`，並將 `.dev.vars` 加入 `.gitignore`

### 8.5 D1 備份

誤刪還原：

```bash
npx wrangler d1 time-travel repair-db0818 --timestamp <unix_timestamp>
```

建議每日記錄一次關鍵時間點的 timestamp，或操作前先記錄當下時間。

### 8.6 孤兒照片政策

v1 不處理（R2 免費額度足夠）；v2 若要清理，須另開**獨立 Worker** 設定 cron trigger（Pages Functions 不支援 cron）。

### 8.7 測試與 CI（v1.1.13 確認）

**E2E 不會碰正式資料**（審查曾誤判為「E2E 可能寫入 production」，實際不成立）：

- `public/app.js` 的 `api()` 開頭是 `if (IS_MOCK) return mockApi(path, options)`——**`?mock=true` 時所有 API 呼叫都走前端記憶體 mock（`mockApi`），完全不 `fetch` 正式網域**。
- `liff-mock.js` 僅模擬 LINE 登入；`mockTickets`/`mockOptions`/`mockVendors` 都是記憶體寫死，新增/留言/重發 token 只改記憶體，**不碰正式 D1/R2**。
- 因此**不建 staging 測試環境**（單人開發，見 §0.3 明確不做），E2E 對正式網域跑 `?mock=true` 是安全且正確的。

**單元測試**：`@cloudflare/vitest-pool-workers` 在本地 workerd runtime 跑真實 D1/R2（miniflare），不碰正式資料。

**本地單元測試快速迴圈 `npm run test:local`（v1.1.15 新增，不用 workerd）**：

- **用途**：本機立即驗證單元測試（12 檔 170 tests，約 50 秒），不必等 push 後的 CI。workerd 跑不了的環境（如 Alpine musl 沙箱）也能跑。
- **原理**：`vitest.node.config.ts` 以 `resolve.alias` 把 `cloudflare:test` 指向 `tests/node/cloudflare-test-shim.ts`，**測試檔零改動**：
  - `SELF.fetch()` → Hono `app.request()`（不起 HTTP server）
  - `env.DB` → `tests/node/d1.ts`：以 Node 內建 `node:sqlite` 實作的 D1 shim（prepare/bind/run/all/first/raw/batch/exec；batch 經 `__execForBatch` 保留 INSERT 的 `meta.last_row_id`）
  - `env.PHOTOS` → `tests/node/r2.ts`：Map-based R2 stub
  - shim 於 module load 建立 fresh in-memory DB＋套用 `migrations/` 全套 SQL，並以 `beforeEach` 重置——等價 workers pool 的 isolatedStorage
  - `tests/node/_icu-polyfill.ts`：精簡 ICU 的 Node 上補 en-CA 的 `format`／`formatToParts`（full-ICU 環境自動 no-op），避免日期格式假失敗
- **語意警告**：shim 是近似而非真 D1——錯誤訊息格式、meta 欄位細節與真 D1 有差。**`npm test`（workers pool / CI）仍是唯一真相**；`test:local` 全綠不代表可略過 CI。

**CI 流程**（`.github/workflows/test.yml`）：`npm ci` → typecheck → `npm test`（單元）→ E2E（對正式網域 `?mock=true`）。

**E2E 效能（v1.1.14 優化）**：
- **等待方式**：E2E 一律用 Playwright 的 `expect(...)`／`expect.poll()` **自動重試**（DOM 出現即過），**禁止固定 `waitForTimeout()`**（v1.1.14 已移除全部 14 處固定等待，實際測試從 ~20s 降到 ~9s）。
- **瀏覽器快取**：workflow 對 `~/.cache/ms-playwright` 加 `actions/cache`（keyed on `package-lock.json`），命中後省 `npx playwright install` 的 ~22s 下載。
- **E2E 已知限制（勿再犯）**：mock 模式 `api()` 開頭 `if (IS_MOCK) return mockApi()` → **不走瀏覽器 fetch**，故 `page.on('request')` 攔不到。驗證「送出 API 是否觸發」只能用 UI 互動斷言（dialog/modal/toast 出現），不能攔截請求。

**人工驗收流程（v1.1.14 新增）**：CI 全綠後，另對正式網域 `?mock=true` 逐項實測（不碰正式資料，同 E2E 安全前提）。每次改版後至少跑一遍以下 checklist。

**驗收工具與方法（明確規格）**：
- **工具**：用瀏覽器自動化工具（Minis 內建 `browser_use`，或等價 Playwright / 手動瀏覽器 DevTools）開啟 `https://repair-system-4re.pages.dev/?mock=true`。**禁止用此方式對正式資料寫入**（僅檢視，mock 模式本來就不碰 D1/R2）。
- **方法**：以「讀取 DOM 狀態」為主——對目標元素下 `execute_js`（或 Playwright `locator`）取 `.textContent`／`.value`／元素數量／`.classList` 內含的 `active` 等，**與預期值比對**。不以肉眼描述截圖為準，改以**可斷言的文字/數值**判斷（避免誤判）。
- **判斷準則**：每一項下方列「預期」與「實測」；兩者相符＝PASS，不符＝FAIL（需修復後重跑）。非等到自動載入完的項目，實測前可用 `await sleep(500ms)` 等非同步渲染。

**checklist（工具：`execute_js` 取 DOM；預期如下）**：

| # | 頁面 | 動作 | 預期（DOM 斷言） |
|---|---|---|---|
| 1 | 首頁 `/` | 讀 `.tab` 文字清單 | 含「未結／詢價／處理／完成／作廢／全部」 |
| 2 | 統計頁 `/stats` | 讀 `.month-row select` options | 近 12 個月（如 `2026-08`…`2025-09`） |
| 2b | 統計頁 | 選另一月（`change` 事件）後讀 `.stat-card` 與 `.section-title` | 「本月新增」數與「各類別金額（YYYY-MM」標題**同步**變為該月（Promise.all，無上下月不一致）；完成率分母＝期初未結案＋本月新增 |
| 3 | 詳情 `/ticket/2` | 點 ⋮ → 讀 `.menu-item` | 含「編輯案件」（`can_edit` 由後端算，E1 方案B） |
| 4 | 編輯 `/edit/2` | 讀 `.form label` 清單、`.form input[type=file]`、`.form .photo-preview` | label 含「照片」；有 file input＋preview；`.photo-thumb` 數 ≥0（既有照片） |
| 4b | 編輯 `/edit/2` | 讀廠商 `.form select` options | 含「— 清空指派 —」（值 `_clear`，E5） |
| 5 | 詳情 `/ticket/1`(open) | 開留言框讀狀態 select options | 僅「僅留言／標記已發包／標記完成並結案」，無退回 |
| 5b | 詳情 `/ticket/2`(in_progress) | 開留言框讀狀態 select options | 僅「僅留言／更新發包金額／標記完成並結案」，無退回 |
| 6 | 建單 `/new` | 讀 `.form input[type=file]`＋`.photo-preview` | 兩者存在（照片選擇器正常） |

> 上述為人工/瀏覽器實測（非自動化），與 §8.7 的 CI 自動化互補；實測結果記錄於當次改版報告。

---

## 10. v1 明確不做 與 後續工件

**v1 不做**：關鍵字搜尋、LINE 推播通知、時間軸明細匯出、孤兒照片清理、留言通知、多社區（多 tenant）、`approved_by` 畫面（欄位保留）。

**Rate Limiting（v1.1.13 確認，於 Cloudflare Dashboard 設定，非改程式）**：公開端點建議加每 IP 速率限制，避免被濫用（UUID 已擋列舉，但無每 IP 上限）：
- `GET /api/share/:token`
- `GET /api/share/:token/photos/:id`
- `POST /api/auth/session`
- `GET /api/exports/tickets.csv`（簽名連結）

設定方式：Cloudflare Dashboard → 該 Pages 專案 → Security/Rate limiting rules。**本專案不寫 code 實作**（靠 CF 邊緣層），故屬維運作業，非程式施工項。

**下一批文件（已產出）**：
1. `docs/lib-spec.md` — `src/lib/` 共用層介面規格（`resolveUser`／`requireAuth`／`csrfGuard`／`respond`／`taipeiMonthRangeUtc()` 正確實作範本）——§3.2 已定案 auth 介面，本文件補齊其餘四模組與細節
2. `docs/test-cases.md` — 核心端點測試案例（`@cloudflare/vitest-pool-workers`），已含以下回歸斷言：
   - 未登入打 `/api/tickets` → `401`
   - **pending 打 `/api/auth/me` → `200`（含 display_name）**
   - **無 Cookie 帶有效 sig 打 `/api/exports/tickets.csv` → `200`**
   - 無 Cookie 且 sig 錯誤打 `/api/exports/tickets.csv` → `401`

---

## ⚠️ 開發時請以官方文件核對的點

- LINE ID Token 驗證端點與參數：`POST https://api.line.me/oauth2/v2.1/verify`（搜尋「LINE Login verify ID token」）
- LIFF SDK 最新版本與 `liff.getIDToken()` 用法
- LINE 官方帳號方案名稱與費率（§7 第 4 步，以後台當下公告為準）
- Pages Functions 的 D1/R2 binding 語法（`env.DB.prepare()`、`env.PHOTOS.put()`）
- `hono/cloudflare-pages` 的 `handle()` 與 `basePath` 行為（M1 