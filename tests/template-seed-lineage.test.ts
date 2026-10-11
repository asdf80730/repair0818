// seed 血統防漂移（架構候選 #10）：daily 模板出廠 body 存在三份同文——
//   1. migrations/0003（production D1 seed，歷史不可改）
//   2. SEED_TEMPLATE_BODY（前端 G7「重置為出廠預設」硬編碼）
//   3. mock seed（?mock=true 的 GET templates）
// 本測用「比對三份同文」取代「多一份 seed」：migrations 不改、前端不改，只釘血統。
// workers pool（npm test）無 fs 權限 → 平退跳過；node pool（test:local／CI job）實測。
import { describe, it, expect } from "vitest";

async function readText(path: string): Promise<string | null> {
  try {
    const fs = await import("node:fs");
    return fs.readFileSync(path, "utf8");
  } catch {
    return null; // workers pool 無 fs → 平退
  }
}

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();

describe("daily 模板 seed 血統", () => {
  it("migration 0003 ↔ 前端 SEED_TEMPLATE_BODY ↔ mock seed 同文", async () => {
    const sql = await readText("migrations/0003_merge_message_template.sql");
    const app = await readText("public/app.js");
    if (!sql || !app) return;

    const sqlM = sql.match(/'message_template_daily',\s*'([\s\S]*?)',\s*0, 1,/);
    expect(sqlM, "migration 0003 seed 提取失敗").not.toBe(null);
    const sqlSeed = sqlM![1].replace(/''/g, "'");

    const frontM = app.match(
      /const SEED_TEMPLATE_BODY = \{\s*\n\s*daily: `([\s\S]*?)`,/,
    );
    expect(frontM, "SEED_TEMPLATE_BODY 提取失敗").not.toBe(null);
    const frontSeed = frontM![1];

    const mockM = app.match(/"(修繕系統簡報：(?:[^"\\]|\\.)*)"/);
    expect(mockM, "mock seed 提取失敗").not.toBe(null);
    const mockSeed = JSON.parse(mockM![0]);

    expect(normalize(frontSeed)).toBe(normalize(sqlSeed));
    expect(normalize(mockSeed)).toBe(normalize(sqlSeed));
  });
});
