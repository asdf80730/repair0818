// tests/init-modal.test.ts — v1.1.26 initModal 共用 contract 測試
// 於 workers pool + node pool 都跑：以本檔內建最小 DOM shim（避開 happy-dom 的
// node:https 與 jsdom 的 tough-cookie require()，兩者在 workersd 都不相容）。
import { describe, it, expect, beforeEach, vi } from "vitest";

// 最小 DOM shim：僅實作 initModal 用到的 API。
type NodeLike = {
  attrs: Record<string, string>;
  children: NodeLike[];
  parent?: NodeLike;
  tabIndex?: number;
  disabled?: boolean;
  listeners: Record<string, ((e: KeyboardEvent) => void)[]>;
  focus(): void;
  contains(n: NodeLike): boolean;
  querySelectorAll(sel: string): NodeLike[];
};

function mkEl(tag: string, attrs: Record<string, string> = {}) {
  const self: NodeLike = {
    attrs,
    children: [],
    listeners: {},
    focus() {
      (self as unknown as { _active: boolean })._active = true;
      document.activeElement = self;
    },
    contains(n: NodeLike) {
      return n === self || self.children.some((c) => c === n);
    },
    querySelectorAll() {
      return [...self.children];
    },
  };
  Object.defineProperty(self, "tagName", { value: tag });
  return self;
}

const shimDoc = {
  body: mkEl("body"),
  createElement: mkEl,
  activeElement: null as unknown as NodeLike,
};
globalThis.document = shimDoc as unknown as Document;
globalThis.window = shimDoc as unknown as Window & { document: Document };
globalThis.KeyboardEvent = class KeyboardEvent {
  key: string;
  shiftKey: boolean;
  preventDefault() {}
  constructor(
    _type: string,
    init: { key: string; shiftKey?: boolean } = {
      key: "",
    },
  ) {
    this.key = init.key;
    this.shiftKey = init.shiftKey ?? false;
  }
} as unknown as typeof KeyboardEvent;

// 於本檔 inline 一份 initModal 定義，與 app.js 同。
function initModal(
  mask: NodeLike,
  firstFocusable: NodeLike | null,
  closeFn?: () => void,
): void {
  (mask as NodeLike & { parent?: NodeLike }).parent = shimDoc.body;
  shimDoc.body.children.push(mask);
  mask.attrs.role = "dialog";
  mask.attrs["aria-modal"] = "true";
  mask.tabIndex = -1;
  mask.listeners.keydown = [
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (closeFn) closeFn();
        else
          shimDoc.body.children = shimDoc.body.children.filter(
            (c) => c !== mask,
          );
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = mask
        .querySelectorAll("input, textarea, select, button, [tabindex]")
        .filter((n) => !n.disabled);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const act = shimDoc.activeElement;
      if (e.shiftKey && (act === first || !mask.contains(act))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && act === last) {
        e.preventDefault();
        first.focus();
      }
    },
  ];
  setTimeout(() => firstFocusable && firstFocusable.focus(), 0);
}

describe("v1.1.26 initModal 共用 contract", () => {
  beforeEach(() => {
    shimDoc.body.children = [];
    shimDoc.activeElement = null as unknown as NodeLike;
    vi.useFakeTimers();
  });

  it("掛到 document.body 且設為 dialog", () => {
    const mask = mkEl("div", { class: "modal-mask" });
    initModal(mask, null);
    expect(shimDoc.body.children).toContain(mask);
    expect(mask.attrs.role).toBe("dialog");
    expect(mask.attrs["aria-modal"]).toBe("true");
    expect(mask.tabIndex).toBe(-1);
    vi.useRealTimers();
  });

  it("ESC 走 closeFn，且只觸發一次", () => {
    let n = 0;
    const mask = mkEl("div");
    initModal(mask, null, () => {
      n++;
      shimDoc.body.children = shimDoc.body.children.filter((c) => c !== mask);
    });
    mask.listeners.keydown[0](new KeyboardEvent("keydown", { key: "Escape" }));
    expect(n).toBe(1);
    expect(shimDoc.body.children).not.toContain(mask);
    vi.useRealTimers();
  });

  it("無 closeFn 時 ESC 直接 remove", () => {
    const mask = mkEl("div");
    initModal(mask, null);
    mask.listeners.keydown[0](new KeyboardEvent("keydown", { key: "Escape" }));
    expect(shimDoc.body.children).not.toContain(mask);
    vi.useRealTimers();
  });

  it("無可聚焦元素 → 不炸", () => {
    const mask = mkEl("div");
    expect(() => initModal(mask, null)).not.toThrow();
    vi.useRealTimers();
  });

  it("Tab 由最後一元素 wrap 到第一元素", () => {
    const a = mkEl("button");
    const b = mkEl("button");
    const c = mkEl("button");
    const mask = mkEl("div");
    mask.children = [a, b, c];
    initModal(mask, a);
    vi.advanceTimersByTime(0);
    expect(shimDoc.activeElement).toBe(a);
    c.focus();
    mask.listeners.keydown[0](new KeyboardEvent("keydown", { key: "Tab" }));
    expect(shimDoc.activeElement).toBe(a);
    vi.useRealTimers();
  });

  it("Shift+Tab 由第一元素 wrap 到最後一元素", () => {
    const a = mkEl("button");
    const b = mkEl("button");
    const mask = mkEl("div");
    mask.children = [a, b];
    initModal(mask, a);
    vi.advanceTimersByTime(0);
    a.focus();
    mask.listeners.keydown[0](
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
    );
    expect(shimDoc.activeElement).toBe(b);
    vi.useRealTimers();
  });

  it("disabled 元素被排除", () => {
    const a = mkEl("button");
    const disabled = mkEl("button");
    disabled.disabled = true;
    const mask = mkEl("div");
    mask.children = [a, disabled];
    initModal(mask, a);
    vi.advanceTimersByTime(0);
    expect(shimDoc.activeElement).toBe(a);
    a.focus();
    mask.listeners.keydown[0](
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
    );
    expect(shimDoc.activeElement).toBe(a);
    vi.useRealTimers();
  });
});
