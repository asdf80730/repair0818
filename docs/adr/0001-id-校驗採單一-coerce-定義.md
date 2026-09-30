# 0001 — `:id` 校驗採單一 coerce 定義

- Status: accepted
- Date: 2026-09-30

## Context

1. `:id` 路徑參數原本在 14 個 handler 內各自手動校驗（讀原始參數、`Number(...)`、`Number.isInteger`＋正整數判斷），同一規則重寫 14 份。
2. `v1.1.24` 已有共用驗證縫 `zv`（`lib/respond.ts`），400 走統一信封（`ok:false`＋`error.code='VALIDATION_ERROR'`＋`error.message`），訊息取 zod 首個 issue 的 `message`。
3. `param` target 的值是路由參數記錄，全部為字串；`json` target 的值經 JSON 解析，數字為數字型。
4. 候補方案有兩套數字 schema（非 coerce 給 JSON、coerce 給 param），或一套共用。

## Decision

1. id 規則採**單一定義**：`const id = z.coerce.number({ message: '無效的 id' }).int({ message: '無效的 id' }).positive({ message: '無效的 id' })`；`idParam = z.object({ id })` 復用之；JSON 欄位（`category_id`／`location_id`／`vendor_id`／`photo_ids`／`category_ids`）同指此定義。
2. 校驗訊息三步（coerce／int／positive）各掛同一個 `message: '無效的 id'`，使全部失敗路徑（`0`／小數／非數字）經 §4.0 統一信封發出同一訊息。
3. 非 id 參數（share 的 `token`／`photo_id`）與 query target 的 `category_id`（daily-report）維持各自既有處理，不併入本次收斂。
4. 校驗順序不動：auth → `param` validator →（`json` validator）→ handler；同端點 param／json 雙 validator 並存，依 target 分鍵互不覆蓋。

## Consequences

1. 規則改動只改一處（`lib/validate.ts` 的 `id`），14 個端點零改動。
2. JSON 體的 id 欄位獲寬：字串數字（如 `"vendor_id": "42"`）亦校驗通過並轉為數字（coerce 語意），與 param 判準一致。
3. id 全失敗路徑的 400 訊息固定為『無效的 id』，不再出現 zod 預設訊息；既有測試只釘 status＋`error.code`，訊息對齊不破壞任何斷言。
4. 邊界案例以 9 條單測釘住（`boundary.test.ts` 6＋`tickets.test.ts` 3），含 param 分項先於 json 分項的 precedence。
