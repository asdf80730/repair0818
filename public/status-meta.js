// 狀態 label／色表唯一來源（v1.1.33 架構候選 #7）
// 兩個 HTML 入口都載入本檔：主系統（dynamic-index → app.js）與派工單公開頁（share.html → share.js）；
// 頁面腳本彼此無法 import，色表以獨立 script 單源。措辭＝業主拍板（v1.1.12：open「詢價中」），
// 任何新增狀態只改這一張表；未知狀態呼叫端走 gray 兜底。
"use strict";
const STATUS_META = {
  open: ["詢價中", "red"],
  in_progress: ["處理中", "yellow"],
  done: ["已完成", "green"],
  void: ["已作廢", "black"],
};
