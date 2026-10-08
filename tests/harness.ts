// tests/harness.ts — 共用測試 harness（自 9 支測試檔的檔內拷貝收攏而來）
// interface 就五個名字；兩池共跑：workers pool（原生 cloudflare:test）
// ＋ node pool（vitest.node.config.ts alias → tests/node/cloudflare-test-shim.ts）。
import { SELF, env } from "cloudflare:test";
import { expect, vi } from "vitest";

type NamedRole = "committee" | "manager" | "admin";

/** mock LINE 驗證成功：標準 payload（iss/sub/aud/exp/name） */
export function mockLineVerify(sub: string, name: string) {
  mockLineVerifyRaw({
    iss: "https://access.line.me",
    sub,
    aud: "test-channel",
    exp: Math.floor(Date.now() / 1000) + 3600,
    name,
  });
}

/** mock LINE 驗證：手拼 payload（wrong-iss 等邊界案例用） */
export function mockLineVerifyRaw(payload: Record<string, unknown>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.href.startsWith("https://api.line.me/oauth2/v2.1/verify")) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error("No mock found for " + url.href);
  });
}

/** 建立一個已開通使用者並回傳 session cookie；不帶 role → 留 pending（不 UPDATE） */
export async function loginAs(
  sub: string,
  name: string,
  role?: NamedRole,
): Promise<{ userId: number; cookie: string }> {
  mockLineVerify(sub, name);
  const session = await SELF.fetch("http://example.com/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
    },
    body: JSON.stringify({ id_token: "mock" }),
  });
  expect(session.status).toBe(200);
  const body = await session.json();
  const userId = body.data.user_id;
  if (role) {
    // 直接更新 D1 role（模擬管理員審核，users PATCH 屬 M2 後續）
    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?")
      .bind(role, userId)
      .run();
  }
  const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { userId, cookie };
}

/** 取指定型別第一個 active 的 option id（seed 後動態查） */
export async function getOptionId(
  type: "category" | "location",
): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT id FROM options WHERE type = ? AND active = 1 ORDER BY id LIMIT 1",
  )
    .bind(type)
    .first<{ id: number }>();
  if (!row) throw new Error(`找不到 ${type} 選項，seed 失敗`);
  return row.id;
}

/** 建一張單，回傳回應 data（含 id 與 share_token） */
export async function createTicket(
  cookie: string,
  description = "測試單",
): Promise<{ id: number; share_token: string }> {
  const category_id = await getOptionId("category");
  const location_id = await getOptionId("location");
  const r = await SELF.fetch("http://example.com/api/tickets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: cookie,
    },
    body: JSON.stringify({ category_id, location_id, description }),
  });
  const body = await r.json();
  return body.data;
}

// ── jsdom 裝載器（node pool 專屬；workers pool 無 jsdom/fs，以 hasJsdom 探測後跳過）─
export const APP_PATH = "public/app.js";
export const CSS_PATH = "public/style.css";

/** jsdom 僅 node pool 可用；本檔用 try/catch 讓 workers pool 平退。 */
export async function hasJsdom(): Promise<boolean> {
  const m = await import("jsdom").catch(() => null);
  return typeof m?.JSDOM === "function";
}

/** jsdom 開機：mock=true ＋ hash 路由；focus/activeElement 以本檔 probe 捕捉 */
export async function bootMock(hash: string) {
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
  // jsdom 30：win.eval 為 isolated context，宣告不落 window——同 eval 內顯式掛上
  win.eval(
    app +
      "\nwindow.initModal = initModal;window.restoreKey = restoreKey;" +
      "window.remember = remember;",
  );
  for (let i = 0; i < 12; i++) await new Promise((r) => win.setTimeout(r, 0));
  return { win, doc };
}
