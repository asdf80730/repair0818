# 擑機 DOM probe（jsdom 30）

前端（`public/app.js`）的 DOM／focus／捲動行為用一支擑機 `.mjs` 核對，走 `jsdom`（`package.json` 的 dev 依賴）。四條不相容點（本會話實測，jsdom 30.1.1）：

1. **`runScripts` 必填 `"dangerously"`**，否則 `window.eval(...)` 回 `null`，随后的 `TypeError: null is not an object` 出在 `helpers/runtime-script-errors.js`：
   `new JSDOM(html, { url: "http://localhost:8788/?mock=true#/list", runScripts: "dangerously" })`。
2. **realm 內的 `window.addEventListener` 會崩**（`'addEventListener' called on an object that is not a valid instance of EventTarget`）→ 抓 document 的版本來用：`const wAdd = document.addEventListener.bind(document)`。
3. **`window.scrollTo` 未實作** → 先指定一個記錄例元：`w.scrollTo = (x, y) => { w.__scroll.push([x, y]) }`，之後斷言 `__scroll`。
4. **`HTMLElement.prototype.focus()` 會崩**（`Failed to construct 'FocusEvent': member view is not of type Window`）→ 先覆寫並把 `document.activeElement` 接上：
   `w.HTMLElement.prototype.focus = function () { w.__act = this }` 與
   `Object.defineProperty(w.document, "activeElement", { get: () => w.__act, configurable: true })`。

範本：`tests/init-modal.test.ts` 用自己的 DOM shim，非 jsdom；兩階層（workers pool／node shim）仍以 `bun run test`、`bun run test:local` 為準。

## 長輸出的時序

`artifact://<id>` 只在交付前後短暫可用，隨後即回收（`Artifact 23 not found. Available: 2, 3, …`）。需分段時在首次調用就帶 `:N-M`／`:raw`；已交付的 follow-up 本文即真相，事後補讀會拿到「not found」。
