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
