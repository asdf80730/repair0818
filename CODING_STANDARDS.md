# 編碼標準（審查軸用）

> 本檔是 **reviewer 的規則檔**（`/code-review` Standards 軸必讀），不是施工指南。
> 實作權威來源仍是 `CLAUDE.md` 硬性規則 1–15 與 SPEC §0.3——此處只收錄工具抓不到、
> 需 reviewer 判斷的條目；能被确定性檢查抓的（檔頭版本、migration drift）都在
> CI scripts 裡守，不重複寫規則。

## e2e 斷言：時間敏感值必須用 regex，不用字串硬編

字串硬編 mock 衍生的天數（`getByText("電梯－停車場 (53 天)")`）隔天照臉變紅——
天數由 `dayDiff` 對「今天」算，fixture `created_at` 固定。實測案例：v1.1.33 輪硬編
`(53 天)` 進 main，2026-10-11 即到期紅（retro 2026-10-07/10 相連兩輪都踩）。

- 斷言形：`expect(page.getByText(/電梯－停車場 \(\d+ 天\)/).first()).toBeVisible()`
- `.first()` 不可省：mock 有同地點雙列（53/0 天）→ strict mode violation 假紅。
- 例外：斷言要「唯一性」而 regex 不夠時，改 `locator(...).filter({ hasText }).first()`，
  絕不拿天數數字當唯一性來源。

## 定版出鏈清單（改行為／ bump 版本時逐點核對）

檔頭與 §0.1 一致性已由 `scripts/check-doc-versions.py`（CI）機械守；以下四點需人判：

1. **程式內行為註解**：寫了「兩模板」之類已被本版合併的字樣（例：`stats.ts` daily-report 標頭曾滯留 v1.1.16 寫法）。
2. **tests／e2e 檔頭與斷言旁版號**：滯留 `v1.1.32` 級舊標會被下游讀者當契約（本輪抓到 3 處）。
3. **SPEC 內 migration 編號引用**：「migration 0NNN」只有 `migrations/0NNN_*.sql` 實存才准裸寫；歷史 migration 一律寫「歷史 0NNN，已 squash 入 0001」——「歷史」兩字是關鍵詞，讓未來 grep 者知道該編號不存在於現行檔。
4. **CHANGELOG 性質段落**（SPEC §0.1 新列）的日期＝拍板日，不是施工日。
