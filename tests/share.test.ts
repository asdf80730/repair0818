// tests/share.test.ts — M6 share 公開頁 + token 重發測試（§4.3/§4.5）
import { SELF, env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mockLineVerify, loginAs, getOptionId, createTicket } from "./harness";

const worker = SELF;

afterEach(() => vi.restoreAllMocks());

describe("M6 share 公開頁 + token 重發（§4.3/§4.5）", () => {
  it("share 公開端點回白名單欄位（免登入）", async () => {
    const mgr = await loginAs("U-m6-mgr", "管理", "manager");
    const { share_token } = await createTicket(mgr.cookie, "分享測試");

    // 免登入打 share
    const r = await worker.fetch(`http://example.com/api/share/${share_token}`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data.title).toContain("弱電修繕");
    expect(body.data.status).toBe("open");
    expect(body.data.description).toBe("分享測試");
    // 白名單：不該有 vendor_name / updates / 內部資料
    expect(body.data.vendor_name).toBeUndefined();
    expect(body.data.updates).toBeUndefined();
  });

  it("share token 無效 → 404", async () => {
    const r = await worker.fetch("http://example.com/api/share/badtoken");
    expect(r.status).toBe(404);
  });

  it("manager 重發 share-token → 舊連結失效", async () => {
    const mgr = await loginAs("U-m6-mgr2", "管理2", "manager");
    const { id, share_token: oldToken } = await createTicket(
      mgr.cookie,
      "分享測試",
    );

    // 重發
    const r = await worker.fetch(
      `http://example.com/api/tickets/${id}/share-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "fetch",
          Cookie: mgr.cookie,
        },
      },
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data.share_url).toContain("/share.html?token=");
    const newToken = new URL("http://x" + body.data.share_url).searchParams.get(
      "token",
    );

    // 舊 token 失效 → 404
    const old = await worker.fetch(`http://example.com/api/share/${oldToken}`);
    expect(old.status).toBe(404);

    // 新 token 有效 → 200
    const fresh = await worker.fetch(
      `http://example.com/api/share/${newToken}`,
    );
    expect(fresh.status).toBe(200);
  });

  it("committee 不可重發 share-token（限 manager/admin）", async () => {
    const comm = await loginAs("U-m6-comm", "管委", "committee");
    const { id } = await createTicket(comm.cookie, "分享測試");
    const r = await worker.fetch(
      `http://example.com/api/tickets/${id}/share-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "fetch",
          Cookie: comm.cookie,
        },
      },
    );
    expect(r.status).toBe(403);
  });
});
