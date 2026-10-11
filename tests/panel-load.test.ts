// tests/panel-load.test.ts — v1.1.34 FE2：loadInto 面板載入 seam 的 contract
// jsdom（node pool）直接呼叫 window.loadInto 釘三條政策（workers pool 無 jsdom 跳過，
// 由 e2e 於 chromium 覆蓋）：
//   1. stale-render：舊請求的回應晚到 → 整筆丟棄，不得覆蓋新請求的渲染
//   2. error-visible：請求失敗要在 panel 顯示 .error（含 e.message）
//   3. stale-error：晚到的「失敗」也丟棄——不得在新請求已成功後蓋上 error
// 時間控制：loadInto 本身回傳 promise——直接 await 各請求的落定鏈，不經任何時鐘。
// stats 月份 race（連點月份舊蓋新）與 admin tab stale 自此由 token 單點保證。
import { describe, it, expect } from "vitest";
import { bootMock, hasJsdom } from "./harness";

type LoadInto = (
  panel: HTMLElement,
  fetcher: () => Promise<unknown>,
  render: (b: unknown) => void,
  opts?: { label?: string },
) => Promise<void>;

// jsdom 30：classic script 的頂層宣告不落 window——harness.ts 已於 eval 內掛 window.loadInto；
// 這裡以具名型別讀取（win 本身即 JSDOM window，結構相同，只是 lib.dom 沒有 app.js 的函式）。
function getLoadInto(win: Window): LoadInto {
  const w = win as Window & { loadInto: LoadInto };
  return w.loadInto;
}

describe("loadInto：非同步面板載入 seam（FE2）", () => {
  it("stale：舊回應晚到整筆丟棄，最新請求的渲染作數", async () => {
    if (!(await hasJsdom())) return;
    const { doc, win } = await bootMock("#/list");
    const loadInto = getLoadInto(win);
    const panel = doc.createElement("div");
    doc.body.appendChild(panel);

    const oldReq = Promise.withResolvers<unknown>();
    const newReq = Promise.withResolvers<unknown>();

    const pOld = loadInto(
      panel,
      () => oldReq.promise,
      () => {
        panel.textContent = "來自舊請求";
      },
    );
    const pNew = loadInto(
      panel,
      () => newReq.promise,
      () => {
        panel.textContent = "來自新請求";
      },
    );
    newReq.resolve({});
    await pNew; // 新請求先落定並渲染
    oldReq.resolve({});
    await pOld; // 舊請求晚到——token 已易主，必須整筆丟棄

    expect(panel.textContent).toBe("來自新請求");
    expect(panel.querySelector("p.error")).toBe(null);
  });

  it("error：請求失敗時 panel 顯示 .error 且帶 e.message", async () => {
    if (!(await hasJsdom())) return;
    const { doc, win } = await bootMock("#/list");
    const loadInto = getLoadInto(win);
    const panel = doc.createElement("div");
    doc.body.appendChild(panel);

    await loadInto(
      panel,
      () => Promise.reject(new Error("連不到伺服器")),
      () => {
        panel.textContent = "不該渲染";
      },
    );

    const err = panel.querySelector("p.error");
    expect(err).not.toBe(null);
    expect(err!.textContent).toBe("連不到伺服器");
  });

  it("stale-error：晚到的失敗要丟棄，不得在新請求成功後蓋上 error", async () => {
    if (!(await hasJsdom())) return;
    const { doc, win } = await bootMock("#/list");
    const loadInto = getLoadInto(win);
    const panel = doc.createElement("div");
    doc.body.appendChild(panel);

    const oldReq = Promise.withResolvers<unknown>();
    const newReq = Promise.withResolvers<unknown>();

    const pOld = loadInto(
      panel,
      () => oldReq.promise,
      () => {
        panel.textContent = "不該渲染";
      },
    );
    const pNew = loadInto(
      panel,
      () => newReq.promise,
      () => {
        panel.textContent = "最新的好資料";
      },
    );
    newReq.resolve({});
    await pNew;
    oldReq.reject(new Error("晚到的失敗"));
    await pOld; // 舊請求晚到才爆錯——token 已是新請求的，丟棄

    expect(panel.textContent).toBe("最新的好資料");
    expect(panel.querySelector("p.error")).toBe(null);
  });
});
