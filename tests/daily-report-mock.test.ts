// tests/daily-report-mock.test.ts — daily-report mock 組裝鏈本地抓回（retro 2026-10-11 R2 #1）
// 契約：stats「案件動態」tab 的預覽必須由 mock seed 真實組裝出「新案件」與「時間軸」兩段
// （e2e daily-report.spec.js 只在 deploy 後跑；本測把它挪進 test:local＝pre-commit 抓紅）。
// 防的兩個回歸：① mock seed 欄位被改壞（location_label 遺失→預覽變空案文案）
// ② jsdom harness 漏載 templateEngine.js（composeDailyMessage 靜默回退空案文案）。
import { describe, it, expect } from "vitest";
import { bootMock, hasJsdom } from "./harness";

describe("daily-report mock 組裝（本地抓回）", () => {
  it("報告 tab 預覽含新案件與時間軸的 location_label", async () => {
    if (!(await hasJsdom())) return;
    const { win, doc } = await bootMock("#/stats");
    const tabs = [...doc.querySelectorAll(".tab")];
    tabs[1].dispatchEvent(new win.Event("click", { bubbles: true }));
    for (let i = 0; i < 30; i++) await new Promise((r) => win.setTimeout(r, 0));

    const preview = doc.querySelector(".report-preview") as HTMLTextAreaElement;
    expect(preview).toBeTruthy();
    // 空案 fallback 的硬編文案出現＝組裝鏈斷了（seed 或 templateEngine 有問題）
    expect(preview.value).not.toContain("今天無新案件");
    expect(preview.value).not.toContain("今天沒有案件狀態更新");
    // seed id 99（今日建）→ 新案件段；id 98（今日有 update）→ 時間軸段
    expect(preview.value).toMatch(/99\. 停車場　詢價中/);
    expect(preview.value).toMatch(/98\. 大廳　/);
    expect(preview.value).toContain("廠商今日到場勘查");
  });
});
