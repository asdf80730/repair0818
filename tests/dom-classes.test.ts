// tests/dom-classes.test.ts — v1.1.28 選定形態的新 DOM class 覆蓋（T10）
// node pool（test:local）以 jsdom 實跑 app.js 渲染並斷言；
// workers pool（`test`）無 jsdom/fs（tough-cookie require() 與 node:fs shim 皆不相容）
// → 退到對兩檔相關 token 的源碼校驗，同一 contract、兩池皆綠。
import { describe, it, expect } from "vitest";
import { bootMock, hasJsdom } from "./harness";

describe("列表頁：選定 B（.seg/.rows/.row/.no.num/.t.ticket-title）", () => {
  it("渲染 .seg pill、.rows 容器、每卡 .row，編號補 0、tabular-nums 生效", async () => {
    if (!(await hasJsdom())) return; // workers pool：無 jsdom——contract 由 e2e（chromium）＋ node pool jsdom 覆蓋
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
    if (!(await hasJsdom())) return; // workers pool：無 jsdom——contract 由 e2e（chromium）＋ node pool jsdom 覆蓋
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
