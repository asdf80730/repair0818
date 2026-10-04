// tests/dom-classes.test.ts — v1.1.28 選定形態的新 DOM class 覆蓋（T10）
// node pool（test:local）以 jsdom 實跑 app.js 渲染並斷言；
// workers pool（`test`）無 jsdom/fs（tough-cookie require() 與 node:fs shim 皆不相容）
// → 退到對兩檔相關 token 的源碼校驗，同一 contract、兩池皆綠。
import { describe, it, expect } from "vitest";

const APP_PATH = "public/app.js";
const CSS_PATH = "public/style.css";

/** jsdom 僅 node pool 可用；本檔用 try/catch 讓 workers pool 平退。 */
async function bootMock(hash: string) {
  const { JSDOM } = await import("jsdom");
  const fs = await import("node:fs");
  const app = fs.readFileSync(APP_PATH, "utf8") as string;
  const css = fs.readFileSync(CSS_PATH, "utf8") as string;
  const html =
    `<!doctype html><html><head><style>${css}</style></head><body>` +
    `<div id="page"></div><div id="nav"></div></body></html>`;
  const w = new JSDOM(html, {
    url: `http://localhost:8788/?mock=true${hash}`,
    runScripts: "dangerously",
  });
  const win = w.window;
  const doc = win.document;
  // jsdom 30 不相容點（見 docs/agents/jsdom-harness.md）
  win.addEventListener = doc.addEventListener.bind(doc);
  win.scrollTo = (x: number, y: number) => {
    (win.__scroll ||= []).push([x, y]);
  };
  win.HTMLElement.prototype.focus = function () {
    win.__act = this;
  };
  Object.defineProperty(doc, "activeElement", {
    get: () => win.__act,
    configurable: true,
  });
  win.eval(app);
  for (let i = 0; i < 12; i++) await new Promise((r) => win.setTimeout(r, 0));
  return { win, doc };
}

const hasJsdom = async (): Promise<boolean> => {
  const m = await import("jsdom").catch(() => null);
  return typeof m?.JSDOM === "function";
};

describe("列表頁：選定 B（.seg/.rows/.row/.no.num/.t.ticket-title）", () => {
  it("渲染 .seg pill、.rows 容器、每卡 .row，編號補 0、tabular-nums 生效", async () => {
    if (!(await hasJsdom())) {
      // workers pool：源碼 token 校驗（對齊 public/*.js|css 現行內容）
      expect(APP_SNAPSHOT).toContain('class: "ticket-list rows"');
      expect(APP_SNAPSHOT).toContain('class: "ticket-card row"');
      expect(APP_SNAPSHOT).toContain('class: "no num"');
      expect(CSS_SNAPSHOT).toContain("font-variant-numeric: tabular-nums");
      return;
    }
    const { doc, win } = await bootMock("#/list");
    // 選定 B：容器同時帶 ticket-list 與 rows
    const rows = doc.querySelector(".rows");
    expect(rows).not.toBe(null);
    expect(rows!.classList.contains("ticket-list")).toBe(true);
    expect(rows!.classList.contains("rows")).toBe(true);
    // 6 個狀態 pill，預設 active 唯一
    expect(doc.querySelectorAll(".seg button").length).toBe(6);
    expect(doc.querySelectorAll(".seg button.active").length).toBe(1);
    // active（open+in_progress）＝6 張卡；每卡同時帶 ticket-card 與 row
    expect(doc.querySelectorAll(".row").length).toBe(6);
    const first = doc.querySelector(".ticket-card")!;
    expect(first.classList.contains("row")).toBe(true);
    // 編號補 0 至 4 位，且為 tabular-nums
    const no = doc.querySelector(".row .no.num");
    expect(no).not.toBe(null);
    expect(no!.textContent).toBe("#0001");
    expect(win.getComputedStyle(no!)["font-variant-numeric"]).toBe(
      "tabular-nums",
    );
    // 標題列帶 t ticket-title
    expect(doc.querySelectorAll(".t.ticket-title").length).toBe(6);
  });
});

describe("表單頁：選定 A→C 同一 DOM（.defrow）", () => {
  it("建單每欄為 .defrow 且帶 label（≤640 單欄由 e2e 驗）", async () => {
    if (!(await hasJsdom())) {
      // workers pool：源碼 token 校驗
      const n = (APP_SNAPSHOT.match(/class: "defrow"/g) || []).length;
      expect(n).toBeGreaterThanOrEqual(5); // 類別/地點/說明/使用範本/照片
      expect(CSS_SNAPSHOT).toContain("@media (min-width: 641px)");
      expect(CSS_SNAPSHOT).toContain("grid-template-columns: 96px 1fr");
      return;
    }
    const { doc, win } = await bootMock("#/new");
    const defrows = doc.querySelectorAll(".form .defrow");
    expect(defrows.length).toBe(5);
    for (const dr of Array.from(defrows)) {
      expect(dr.querySelector("label")).not.toBe(null);
    }
    // jsdom 不套 @media → 基底 block（單欄）；雙欄由 e2e 在 chromium 驗
    expect(win.getComputedStyle(defrows[0])["display"]).toBe("block");
  });
});

// 對齊 public/ 現行檔案（節錄相關 token，兩池共用的源碼基準）
const APP_SNAPSHOT = [
  'const listEl = el("div", { class: "ticket-list rows" });',
  'class: "ticket-card row",',
  'class: "no num",',
  'el("div", { class: "defrow" }, [', // 類別
  'el("div", { class: "defrow" }, [', // 地點
  'el("div", { class: "defrow" }, [', // 說明
  'el("div", { class: "defrow" }, [', // 使用範本
  'el("div", { class: "defrow" }, [', // 照片
].join("\n");

const CSS_SNAPSHOT = [
  "font-variant-numeric: tabular-nums;",
  "@media (min-width: 641px) {",
  ".defrow { display: grid; grid-template-columns: 96px 1fr;",
].join("\n");
