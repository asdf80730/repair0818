/** @vitest-environment jsdom */
// tests/init-modal.test.ts — v1.1.26 initModal 共用 contract 測試
// 以 jsdom 環境跑；因 app.js 無 export 語法，於本檔 inline 一份 initModal。
import { describe, it, expect, beforeEach, vi } from "vitest";

// initModal 與 app.js 同步；因 app.js 無 export 語法，此处 inline 一份。
function initModal(
  mask: HTMLElement,
  firstFocusable: HTMLElement | null,
  closeFn?: () => void,
): void {
  document.body.appendChild(mask);
  mask.setAttribute("role", "dialog");
  mask.setAttribute("aria-modal", "true");
  mask.tabIndex = -1;
  mask.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (closeFn) closeFn();
      else mask.remove();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [
      ...mask.querySelectorAll("input, textarea, select, button, [tabindex]"),
    ].filter((n: HTMLElement) => !n.disabled);
    if (nodes.length === 0) return;
    const first = nodes[0] as HTMLElement;
    const last = nodes[nodes.length - 1] as HTMLElement;
    const act = document.activeElement;
    if (e.shiftKey && (act === first || !mask.contains(act))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && act === last) {
      e.preventDefault();
      first.focus();
    }
  });
  setTimeout(() => firstFocusable && firstFocusable.focus(), 0);
}

function mkNode(tag: string, attrs: Record<string, string> = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

describe("v1.1.26 initModal 共用 contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  it("掛到 document.body 且設為 dialog", () => {
    const mask = mkNode("div", { class: "modal-mask" });
    initModal(mask, null);
    expect(document.body.contains(mask)).toBe(true);
    expect(mask.getAttribute("role")).toBe("dialog");
    expect(mask.getAttribute("aria-modal")).toBe("true");
    expect(mask.tabIndex).toBe(-1);
    vi.useRealTimers();
  });

  it("ESC 走 closeFn，且只觸發一次", () => {
    let n = 0;
    const mask = mkNode("div");
    initModal(mask, null, () => {
      n++;
      mask.remove();
    });
    mask.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(n).toBe(1);
    expect(document.body.contains(mask)).toBe(false);
    vi.useRealTimers();
  });

  it("無 closeFn 時 ESC 直接 remove", () => {
    const mask = mkNode("div");
    initModal(mask, null);
    mask.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.body.contains(mask)).toBe(false);
    vi.useRealTimers();
  });

  it("無可聚焦元素 → 不炸", () => {
    const mask = mkNode("div");
    expect(() => initModal(mask, null)).not.toThrow();
    vi.useRealTimers();
  });

  it("Tab 由最後一元素 wrap 到第一元素", () => {
    const a = mkNode("button");
    const b = mkNode("button");
    const c = mkNode("button");
    const mask = mkNode("div");
    mask.append(a, b, c);
    initModal(mask, a);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(a);
    c.focus();
    mask.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.activeElement).toBe(a);
    vi.useRealTimers();
  });

  it("Shift+Tab 由第一元素 wrap 到最後一元素", () => {
    const a = mkNode("button");
    const b = mkNode("button");
    const mask = mkNode("div");
    mask.append(a, b);
    initModal(mask, a);
    vi.advanceTimersByTime(0);
    a.focus();
    mask.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
    );
    expect(document.activeElement).toBe(b);
    vi.useRealTimers();
  });

  it("disabled 元素被排除", () => {
    const a = mkNode("button");
    const disabled = mkNode("button");
    disabled.disabled = true;
    const mask = mkNode("div");
    mask.append(a, disabled);
    initModal(mask, a);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(a);
    a.focus();
    mask.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
    );
    expect(document.activeElement).toBe(a);
    vi.useRealTimers();
  });
});
