# bug-list — 規格對照稽核彙報（未修，待業主開工單）

> 稽核方式：逐條對照 `docs/SPEC.md` 與 `src/`，在沙箱以 vitest（`vitest.node.config.ts`，node shim）直打端點＋直讀 D1／R2。
> 產出日：2026-09-07（HEAD `529f59a`）。**本檔只記問題，不改碼、不改既有測試**（`npm run test:local` 157/157 仍綠）。
> 證據級別：**A＝觀測直证**（拿到回應體／DB 值／response header）；**B＝碼讀＋可重現**；**C＝結果不稳或未定因，需人工複核**。
> 複跑：`audit-suite.test.ts`（18 條）＋`deep.test.ts`（5 條）→ 放進 `tests/` 後 `npx vitest run --config vitest.node.config.ts tests/<檔名>`。

## A 級（直证）

### A1 全站 zValidator 攔截的 400 不走 §4.0 統一信封
- **證據**：`POST /api/tickets`（body 缺 `category_id`）與 `GET /api/exports/tickets.csv?from=2026-02-31` 實回
  `{"success":false,"error":{"issues":[...],"name":"ZodError"}}` — 無 `ok`、無 `error.code`、無 `error.message`。
- **影響**：`public/app.js` 的 `api()` 只讀 `body.error.code/message` → 表單端 toast 显示 **undefined**；代碼依 `code` 分流程的分支全部失效。
- **範圍**：全站 18 個 `zValidator()` 呼叫點（含 §4.8 E6 匯出日期框、案件建立）。
- **對照**：同 app 內手工 `fail()` 的錯誤碼紀律是對的（例：daily-report 缺 `date` → `MISSING_DATE`，逐字合 §4.7.1）→ 属這條路徑漏接，非全局认知問題。
- **修法提示**（已核對 `@hono/zod-validator@0.4.3` dist）：第三參數 hook
  `zValidator(target, schema, (r, c) => (r.success ? undefined : c.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: ... } }, 400)))`，包成 `lib/validate.ts` helper 全量替換（18 行改動）。

### A2 模板清單未排除「他類別專屬」模板 → P7 預覽／編輯拿錯內容（§4.9）
- **證據**：查 `category_id=2&label=timeline` 實回
  `[{id:31(屬類別3專屬), is_category_specific:0}, {id:30(全域預設), is_category_specific:0}]` — 排序把**別類別的專屬模板排在第一**，且旗標與「全域預設」相同。
- **串到前端**：`public/app.js:1853` `const t = (r.data.templates || [])[0]` 取第一筆當「目前生效模板」→ 預覽與編輯實則指向類別 3 的內容。
- **同資料兩處結論不一**：`src/routes/stats.ts:272` daily-report 用 `id IN（該類別關聯）UNION id NOT IN（任何關聯）` 才是對的寫法；清單端點沒跟（§4.9/CLAUDE.md 硬規則 6「兩邊同步」於此失守）。
- **必現條件**：migration seed 的全域 timeline `sort_order=1`，而後台新建模板預設 `0` → 新建的類別專屬模板一定排在前面。

### A3 CSV 匯出檔名不符 §4.8；同一根因會把 F1 案件動態整頁打掛
- **證據**：response header 實測 `Content-Disposition: attachment; filename="repair-tickets-9/7/2026.csv"`（檔名含斜線；§4.8 要 `repair-tickets-<YYYYMMDD>.csv`，例 `20260818`）。
- **根因**：`src/lib/time.ts` 的 `taipeiDate()`／`taipeiToday()` 吃 `new Intl.DateTimeFormat('en-CA',{timeZone}).format()` 的**字串輸出**（格式非任何規格保證）。本機（Node 22、完整 ICU）實測：`taipeiDate()="9/7/2026"`、拿掉 polyfill 時 `taipeiToday()="09/07/2026"`。
- **下游**：`src/routes/stats.ts:124` `if (date > taipeiToday()) → DATE_FUTURE` 是**字串比較** → 「2026-09-07」大於「09/07/2026」恒真 → 任何合法日期都回 400（F1 案件動態整頁不能用）。現況靠下面 F1 的 TEMP polyfill 假裝 small-ICU 才綠。
- **前例**：v1.1.21 已為前端做過同款修正（`taipeiDateStr()` 改用 `formatToParts`，SPEC 自注「受限 ICU 回 ISO、完整 ICU 回 MM/DD/YYYY 都會壞」）→ 後端這兩處是同一件事的漏網之魚。

### A4 台北 00:00:00.000 的案件被日報表放錯日（§4.7 `taipeiDayRangeUtc`）
- **證據**：種雨筆試資料 — `created_at=2026-09-06 16:00:00`（UTC）＝台北 `2026-09-07 00:00:00`，
  拉 `daily-report?date=2026-09-06` **含它**（該屬 09-07），拉 `date=2026-09-07` **又不含它**（該含的漏掉）。
  另一筆 `15:59:59`（台北 09-06 23:59:59）歸 09-06 ✓ 正確。
- **判讀**：日窗邊界為雙封閉（`start<=x<=end`）而非左閉右開 → 精確落在午夜零點的列「前一天多一筆、當天漏一筆」。發生幾率低（本端寫入帶毫秒），但任何以秒為精度寫入的資料／外來 seeded 資料即踩。
- **另**：同檔 `taipeiMonthRangeUtc`（月報表）用的是 `formatToParts` 計算（安全），僅日窗此邊界待修。

### A5 `POST /api/vendors` 吞 `sort_order`（§4.1 vs §4.6 自相矛盾）
- **證據**：送 `sort_order=7` → DB 實存 `0`；同筆 `PATCH` 送 4 → DB 得 4（PATCH 正常）。
- **文件面**：§4.1 欄位表「廠商 name｜必填…；`sort_order` 選填，非負整數（預設 0）」與 §4.6「`POST /api/vendors`｜新增（`name`）」互斥；實作照 §4.6。
- **待決**：以 §4.1 為準改碼，還是以 §4.6 為準改文件（v1.1.13 起廠商無後台 UI、欄位靠直接改 DB，故影響面小）。

## C 級（結果不稳／未定因，需人工複核）

### C1 `PUT /api/message-templates/:id` 可覆寫 `active=0` 的模板（§4.9）
- 碼讀：handler 只查存在性、不過濾 `active=1` → 已停用模板會被就地改內容（違 §4.9「編輯就是修改該筆 `active=1` 模板」，且 F7 已砍啟用切換）。
- 但同一請求在我這裡狀態在 200／404 間跳（不同寫法結果不同），**不下結論**。建議人工手動打一次定论。

### C2 `liff_state` 一次性與 cookie 旗標（§4.0）— **未驗到**
- 因下面 C3 的 500，`POST /api/auth/session` 成功路徑之外的 `Set-Cookie` 我這裡取不到（`null`），HttpOnly／SameSite／`liff_state` 清除三項待人工在真環境（或補測試）確認。

### C3 LINE 驗證不通過（`success:false`）回 500 INTERNAL「無法連線 LINE 驗證服務」
- 以 mock 觸發（HTTP 200 ＋ `{"success":false}`）→ 實回 `500 {ok:false,error:{code:'INTERNAL',message:'無法連線 LINE 驗證服務'}}`。
- SPEC 未定義此分支的錯誤碼（grep 無）→ 不算硬性违规，但**預期內的失敗回 5xx** 會讓前端當「臨時故障」重試、並污染告警。
- 需業主兩件事：① 確認真實 LINE 於 token 作廢時的回傳外形（决定這是否走同一分支）；② 決定是否補 SPEC 條並改 401。

## 通過項（正面驗證，可放心的地方）

- §4.6 選項三模式全對：不帶參＝只回 active｜`include_inactive=1&category_id=N`＝回全部＋`associated`｜僅 `include_inactive=1`＝含停用＋附 `category_ids`；committee 帶 `include_inactive` → 403 `FORBIDDEN`（合 §4.0 表）。
- 關聯寫入 `POST /api/options/{category_id}/assoc`（body `{type, option_ids}`）全量覆寫語意正確；`type=category` 附 `category_ids` → 400（§4.1）。
- 待開通：讀／寫皆拒 403 `PENDING`（合 §4.0 表）；缺 CSRF 標頭 → 403 `FORBIDDEN`（§4.0 明列 FORBIDDEN 含 CSRF 缺失）。
- 照片（§4.4）：未綁定僅上傳者可讀（他人 404）；綁定後開通使用者可讀；`Cache-Control: private, max-age=86400` ＋ `X-Content-Type-Options: nosniff` ＋ `Content-Disposition: inline` 齊。綁定→解綁（`target_id=NULL`）不刪 R2 實體；案件作廢（`void`）前後附件可讀性一致（200→200）；全程無「已綁定但 R2 缺失」的孤兒。
- 分享連結（§4.5／§4.7.1 安全條）：非標準 UUID token → 404；`share_token` 輪換後舊 token → 404、新 token → 200；**拿 A 的 token 讀 B 的照片 → 404（無跨案件越權）**；竄改簽名的匯出連結 → 401（信封正確）。
- §4.8 軌A（已登入 manager 直連匯出）→ 200 ＋ `text/csv`。

## 工程面（非功能，但同屬交付品質）

### E1 `vitest.node.config.ts` 的 `setupFiles` 重複鍵＋TEMP 驗證脚手架未清
- `setupFiles` 在同一個物件字面裡出現兩次（第 15、29 行），檔內註解仍寫著「TEMP: 驗完移除」「正式版此行應為 `setupFiles: []`」；`tests/node/_icu-polyfill.ts` 頂端也自註「暫時性驗證用、正式版不含此檔」。
- 風險：`_icu-polyfill.ts` 把 `Intl.DateTimeFormat` 換掉來假裝 small-ICU，正好把 A3 那類問題從本地測試視線里拿掉 → 「本地全綠」不等於「完整 ICU 環境全綠」。建議连同 A3 一起清（留註解、拿掉註冊，或把 polyfill 改成顯式開關）。

## 稽核覆蓋邊界（誠實）
- 只跑 node shim（`test:local`）；`npm test`（workerd）本沙箱跑不起（musl/glibc），那側舆 workers runtime 的 Intl 差異未證。
- 沙箱看到的原始碼字串經通道有畸變（`run`/`consol.log` 等），故**單字元差異一律未當 bug 報**；上列全是行為輸出（status／JSON 結構／DB 值／header）。
- 未覆蓋：F11 通知、P14 簽名页真機流程、R2 生命週期（過期清理）、D1 migration 升級路徑。
