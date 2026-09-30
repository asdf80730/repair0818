// src/routes/vendors.ts — 廠商管理（§4.6，D5：manager/admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from "hono";
import { ok, fail, zv } from "../lib/respond";
import { requireAuth } from "../lib/auth";
import {
  createVendorSchema,
  updateVendorSchema,
  idParam,
} from "../lib/validate";
import { nowIso } from "../lib/time";
import { buildPatch } from "../lib/db";
import type { Env } from "../lib/env";

export const vendorRoutes = new Hono<Env>();

// GET /api/vendors — manager/admin，列表（含停用）（§4.6）
// 排序：啟用在前、停用在後；同狀態依 sort_order 再依 id（v1.1.13，與 options.sort_order 同模式）
vendorRoutes.get(
  "/",
  requireAuth({ roles: ["manager", "admin"] }),
  async (c) => {
    const rows = await c.env.DB.prepare(
      "SELECT id, name, sort_order, active, created_at FROM vendors ORDER BY active DESC, sort_order, id",
    ).all();
    return ok(c, rows.results);
  },
);

// POST /api/vendors — manager/admin（§4.6）
vendorRoutes.post(
  "/",
  requireAuth({ roles: ["manager", "admin"] }),
  zv("json", createVendorSchema),
  async (c) => {
    const body = c.req.valid("json");
    const insert = await c.env.DB.prepare(
      "INSERT INTO vendors (name, active, created_at) VALUES (?, 1, ?)",
    )
      .bind(body.name, nowIso())
      .run();
    return ok(c, { id: insert.meta.last_row_id }, 201);
  },
);

// PATCH /api/vendors/:id — manager/admin（§4.6）
vendorRoutes.patch(
  "/:id",
  requireAuth({ roles: ["manager", "admin"] }),
  zv("param", idParam),
  zv("json", updateVendorSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await c.env.DB.prepare(
      "SELECT id FROM vendors WHERE id = ?",
    )
      .bind(id)
      .first<{ id: number }>();
    if (!existing) return fail(c, 404, "NOT_FOUND", "廠商不存在");

    const { sets, binds } = buildPatch({
      name: body.name,
      sort_order: body.sort_order,
      active: body.active,
    });
    if (sets.length === 0) return ok(c, { id, updated: false });

    binds.push(id);
    await c.env.DB.prepare(`UPDATE vendors SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
    return ok(c, { id, updated: true });
  },
);
