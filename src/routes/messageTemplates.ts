// src/routes/messageTemplates.ts — 訊息模板 CRUD（v1.1.15 F6；v1.1.16 簡化為 new_case / timeline；v1.1.20：type 欄當鍵、label 欄存內容、砍 body 欄）
// 註冊於全域 requireAuth() 之下
//
// 沿用既有 options 字典表。v1.1.20 起 type='message_template_new_case'/'message_template_timeline' 直接當模板鍵、
// label 欄存模板內容（舊 type='message_template'+label 當鍵+body 存內容已併入 type/label，body 欄已 DROP）。
// 類別關聯走 option_categories。
// 對外 API 形狀不變：query/response 的 label 是鍵（new_case/timeline）、body 是內容（取自 label 欄）。
// v1.1.16：模板從 report/empty 改爲「新案件(new_case)／時間軸(timeline)」兩種，供案件動態訊息框使用；
// PUT /:id 就地覆寫 body（UNIQUE(type,label) 下同 label 唯一列，故為更新非新增——v1.1.16 業主決策）。

import { Hono } from "hono";
import { z } from "zod";
import { ok, fail, zv } from "../lib/respond";
import { requireAuth } from "../lib/auth";
import type { Env } from "../lib/env";
import { idParam, listTemplatesQuerySchema } from "../lib/validate";
import {
  listTemplates,
  getTemplateById,
  findTemplateKey,
  isKeyTaken,
  writeTemplate,
} from "../lib/messageTemplates";

export const messageTemplateRoutes = new Hono<Env>();

// 標籤限定：v1.1.16 支援 new_case / timeline 兩種（取代 v1.1.15 的 report/empty）
const ALLOWED_LABELS = ["new_case", "timeline"] as const;

// GET /api/message-templates?category_id=N&label=new_case|timeline
// - 三角色可讀
// - category_id 必填（沿用 F1 決策：不做「全部」，避免訊息過長）
// - label 預設 'new_case'（v1.1.16；原 v1.1.15 為 'report'）
// - 回該類別關聯的模板優先，無則用全域預設（active=1 + 無 option_categories）
messageTemplateRoutes.get(
  "/",
  requireAuth(),
  zv("query", listTemplatesQuerySchema),
  async (c) => {
    // 校驗經 zv（§4.0 統一信封）：category_id 必填正整數；label 預設 new_case
    const { category_id: categoryId, label } = c.req.valid("query");

    // 撈模板：類別關聯優先 → 全域預設（無 option_categories 紀錄）
    // v1.1.20：type 欄當鍵（'message_template_'+label）、label 欄即內容 → 回應 body 取自 label 欄
    const templates = await listTemplates(c, categoryId, label);

    return ok(c, { category_id: categoryId, label, templates });
  },
);

// GET /api/message-templates/:id — 三角色可讀
messageTemplateRoutes.get(
  "/:id",
  requireAuth(),
  zv("param", idParam),
  async (c) => {
    const { id } = c.req.valid("param");
    // v1.1.20：type 欄當鍵、label 欄即內容（回應 body 取自 label 欄）
    const row = await getTemplateById(c, id);
    if (!row) return fail(c, 404, "NOT_FOUND", "模板不存在");
    return ok(c, row);
  },
);

// PUT /api/message-templates/:id — manager/admin（編輯內容 body 或鍵 label）
// 只能編輯現有模板（F7：不做新增、不做刪除、不做啟用切換）
// v1.1.20：內容寫入 label 欄、鍵寫入 type 欄（加 message_template_ 前綴）
const updateTemplateSchema = z
  .object({
    body: z.string().min(1).max(10000).optional(),
    label: z.enum(ALLOWED_LABELS).optional(),
  })
  .refine((v) => v.body !== undefined || v.label !== undefined, {
    message: "至少需提供 body 或 label",
  });

messageTemplateRoutes.put(
  "/:id",
  requireAuth({ roles: ["manager", "admin"] }),
  zv("param", idParam),
  zv("json", updateTemplateSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existingKey = await findTemplateKey(c, id);
    if (existingKey === null) return fail(c, 404, "NOT_FOUND", "模板不存在");

    // 就地覆寫（欄位映射見 lib/messageTemplates）
    if (
      body.label !== undefined &&
      body.label !== existingKey &&
      (await isKeyTaken(c, body.label, id))
    ) {
      return fail(c, 400, "VALIDATION_ERROR", "同 label 已存在");
    }
    await writeTemplate(c, id, {
      body: body.body,
      key:
        body.label !== undefined && body.label !== existingKey
          ? body.label
          : undefined,
    });

    const after = await getTemplateById(c, id);
    return ok(c, after);
  },
);
