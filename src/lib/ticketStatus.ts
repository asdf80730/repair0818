// src/lib/ticketStatus.ts — 案件狀態顯示 label 的單一定義（2026-10-11 架構深化 B1／Q3 拍板）
// 現行只收 label；canTransit／active 語意等狀態流規則屬 B2 範圍，開做時遷入本檔。
// 注意：badge 層 label 與 public/app.js 的 statusBadge() 刻意異字（v1.1.12 業主決策，
// CLAUDE.md 產品規則有案）——本模組只負責「純顯示 label」，不動 badge 語意。

const STATUS_LABEL: Record<string, string> = {
  open: "詢價中",
  in_progress: "已發包",
  done: "已完成",
  void: "已作廢",
};

/** 狀態字串 → 顯示用 label；未知狀態原樣回傳（防呆） */
export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

// ── 狀態流／active 語意（B2 深化 2026-10-11，規則出處 SPEC §4.3／v1.1.14 F3）──

// active（未結案）＝ open ＋ in_progress；done／void 皆屬結算態
const ACTIVE_STATUSES = ["open", "in_progress"];
const CLOSED_STATUSES = ["done", "void"];

/** SQL IN 的枚舉片段：值只來自上面的常數（零綁定參數，合規則 1 的 prepare/bind 前提） */
export const ACTIVE_IN_SQL = `(${ACTIVE_STATUSES.map((s) => `'${s}'`).join(",")})`;
export const CLOSED_IN_SQL = `(${CLOSED_STATUSES.map((s) => `'${s}'`).join(",")})`;

/** 是否屬 active（可編輯／可作廢／可回報的同一閘門語意） */
export function isOpen(status: string): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** 是否已結算（done／void）：不可回報、可 reopen */
export function isClosed(status: string): boolean {
  return CLOSED_STATUSES.includes(status);
}

// F3（v1.1.14）：鎖死退回（in_progress→open 禁）；允許 open→done 直接結案；
// in_progress→in_progress 允許（多次發包覆寫 amount，v1.1.13 語意鎖死勿禁）。
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "done"],
  in_progress: ["in_progress", "done"],
};

/** 狀態流合法性（回報端點用；void／reopen 另有樂觀鎖路徑，不走本函式） */
export function canTransit(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
