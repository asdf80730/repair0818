# 擑機 DOM probe（jsdom 30）

前端（`public/app.js`）的 DOM／focus／捲動行為用一支擑機 `.mjs` 核對，走 `jsdom`（`package.json` 的 dev 依賴）。九條不相容點（實測，jsdom 30.1.1）：

1. **`runScripts` 必填 `"dangerously"`**，否則 `window.eval(...)` 回 `null`，随后的 `TypeError: null is not an object` 出在 `helpers/runtime-script-errors.js`：
   `new JSDOM(html, { url: "http://localhost:8788/?mock=true#/list", runScripts: "dangerously" })`。
2. **realm 內的 `window.addEventListener` 會崩**（`'addEventListener' called on an object that is not a valid instance of EventTarget`）→ 抓 document 的版本來用：`const wAdd = document.addEventListener.bind(document)`。
3. **`window.scrollTo` 未實作** → 先指定一個記錄例元：`w.scrollTo = (x, y) => { w.__scroll.push([x, y]) }`，之後斷言 `__scroll`。
4. **`HTMLElement.prototype.focus()` 會崩**（`Failed to construct 'FocusEvent': member view is not of type Window`）→ 先覆寫並把 `document.activeElement` 接上：
   `w.HTMLElement.prototype.focus = function () { w.__act = this }` 與
   `Object.defineProperty(w.document, "activeElement", { get: () => w.__act, configurable: true })`。
5. **`element.click()` 會崩**（`Failed to construct 'PointerEvent': member view is not of type Window`）→ 改用 realm 內的事件：`btn.dispatchEvent(new w.Event("click"))`（監聽器走 `el()` 的 `addEventListener`，`e.currentTarget` 仍正確）。
6. **時序**：`localStorage` 需在 `w.eval(app)` **之前**寫好（頁面在 eval 期就讀），例元覆寫也在 eval 前；`app.js` 底本身會跑 `boot()`，故 eval 後再多排幾輪 `setTimeout(…, 0)` 讓 `fetch` 鏈落地。
7. **`win.eval` 的宣告不落 `window`**（isolated context）→ 需真身函式時在**同一 eval 串**內顯式掛上：`window.initModal = initModal;`（`tests/harness.ts` 的 `bootMock` 已內建）。
8. **JSDOM 實例的 `.document` 是 `undefined`**：`new JSDOM(...)` 只保證 `.window`；document 走 `w.window.document`。
9. **多檔要逐檔 eval**：`win.eval(te + "\n" + app)` 會令尾段宣告失聯（例：`boot is not a function`）；逐檔分開——`win.eval(te); win.eval(pre); win.eval(app);`——同 window 即同 realm，宣告彼此可見。

範本：`tests/init-modal.test.ts` 採雙池——node pool 以 jsdom（harness `bootMock`）測真身 `initModal`，workers pool 走內聯 shim。兩階層（workers pool／node shim）仍以 `bun run test`、`bun run test:local` 為準。

## 長輸出的時序

`artifact://<id>` 只在交付前後短暫可用，隨後即回收（`Artifact 23 not found. Available: 2, 3, …`）。需分段時在首次調用就帶 `:N-M`／`:raw`；已交付的 follow-up 本文即真相，事後補讀會拿到「not found」。

## 瀏覽器 probe（omp `browser` 全域，headless chromium）

佈局量测（rect／scrollWidth）走 `tab.evaluate("<表達式字串>")`——在頁面 context 執行，`window` 可用。`tab.run(fn)` 在 VM context 執行，**無 `window`**（`ReferenceError`）。要點：

1. **A/B sheet 對照需 fresh tab**：同 tab 內改 `link.href` 换 sheet，時序不稳（舊版式未即卸）→ 每個 sheet 開一個 fresh tab（URL query 決定 sheet），且在頁內以標記斷言生效與否（掃 `document.styleSheets` 找目標規則）。
2. **`Bun.serve` 同 port 重建需先 `server.stop()`**；kernel 內 `globalThis.server` 跨 cell 存活。
3. 假綠來源：替換 sheet 後未重排 → 以標記位（如 `min-width` 計算值 `0px` vs `NO`）為準，不以 rect 數值單一佐証。

### 佈局 pre-deploy 驗證（內聯 probe，免 server 免部署）

CSS 排布改動驗不了：production e2e 打的是舊 CSS、本機 `wrangler pages dev` 在 Bun 下崩（CLAUDE.md 已記）。正解＝**內聯 probe**：`bun -e` 起 `playwright` 的 `chromium.launch()`，`page.setContent(html)` 塞「真實 CSS 變數＋真實 pill 文案」的最小組裝頁，390／360 viewport 測三數：列數（`getBoundingClientRect().top` 去重）、`docW == vw`（document 無超寬，v1.1.31 收口邏輯）、容器 `scrollWidth/clientWidth`（內部滾動量）。30 秒得實測值，改動未定版也不用碰 repo。注意 `page.evaluate` 回傳要 `JSON.stringify` 現值。`.seg` 單列改動即此法驗證（2026-10-11，retro #4）。
