// tests/tickets.test.ts — M3 案件核心端點測試（§4.3）
// 在真實 workerd runtime 跑，D1 用 miniflare
import { SELF, env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mockLineVerify, loginAs, getOptionId } from "./harness";

const worker = SELF;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M3 案件核心（§4.3）", () => {
  it("建單 → 列表 → 詳情 完整流程", async () => {
    const { cookie } = await loginAs("U-m3-user", "M3測試", "committee");
    const categoryId = await getOptionId("category");
    const locationId = await getOptionId("location");

    // 建單
    const create = await worker.fetch("http://example.com/api/tickets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        Cookie: cookie,
      },
      body: JSON.stringify({
        category_id: categoryId,
        location_id: locationId,
        description: "弱電故障",
      }),
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created.data.title).toContain("弱電修繕");
    expect(created.data.share_token).toBeTruthy();

    // 列表
    const list = await worker.fetch("http://example.com/api/tickets", {
      headers: { Cookie: cookie },
    });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.data.items.length).toBeGreaterThan(0);
    expect(listBody.data.items[0].title).toContain("弱電修繕");

    // 詳情
    const detail = await worker.fetch(
      `http://example.com/api/tickets/${created.data.id}`,
      {
        headers: { Cookie: cookie },
      },
    );
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.data.description).toBe("弱電故障");
    expect(detailBody.data.share_url).toContain("/share.html?token=");
    expect(detailBody.data.updates).toEqual([]);
  });

  it("建單時類別/地點無效 → 400", async () => {
    const { cookie } = await loginAs("U-m3-bad", "壞單", "committee");
    const locationId = await getOptionId("location");
    const r = await worker.fetch("http://example.com/api/tickets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        Cookie: cookie,
      },
      body: JSON.stringify({ category_id: 999, location_id: locationId }),
    });
    expect(r.status).toBe(400);
  });

  it("未登入建單 → 401", async () => {
    const r = await worker.fetch("http://example.com/api/tickets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
      },
      body: JSON.stringify({ category_id: 1, location_id: 1 }),
    });
    expect(r.status).toBe(401);
  });

  it("PATCH param 無效 → 400『無效的 id』（param 分項）", async () => {
    const { cookie } = await loginAs("U-m3-p1", "分項1", "manager");
    const r = await worker.fetch("http://example.com/api/tickets/abc", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        Cookie: cookie,
      },
      body: JSON.stringify({ description: "x".repeat(501) }),
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("無效的 id");
  });

  it("PATCH param 有效、body 無效 → 400（json 分項，訊息非 id 共享）", async () => {
    const { cookie } = await loginAs("U-m3-p2", "分項2", "manager");
    const categoryId = await getOptionId("category");
    const locationId = await getOptionId("location");
    const create = await worker.fetch("http://example.com/api/tickets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        Cookie: cookie,
      },
      body: JSON.stringify({
        category_id: categoryId,
        location_id: locationId,
        description: "分項單",
      }),
    });
    const created = await create.json();
    const r = await worker.fetch(
      `http://example.com/api/tickets/${created.data.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "fetch",
          Cookie: cookie,
        },
        body: JSON.stringify({ description: "x".repeat(501) }),
      },
    );
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).not.toBe("無效的 id");
  });

  it("PATCH 雙分項皆無效 → param 分項先落 400『無效的 id』", async () => {
    const { cookie } = await loginAs("U-m3-p3", "分項3", "manager");
    const r = await worker.fetch("http://example.com/api/tickets/abc", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        Cookie: cookie,
      },
      body: JSON.stringify({ description: "x".repeat(501) }),
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error.message).toBe("無效的 id");
  });
});
