# GLOSSARY

單一 context（見 `docs/agents/domain.md`）。術語以 `docs/SPEC.md` 為權威出處，此處只收概念名。

## 領域概念

- **案件（ticket）** — 一筆修繕請求的紀錄；建單時綁一個類別＋一個地點。
- **案件標題（ticket title）** — 顯示用案件名：{類別}－{地點} #{id 補零 4 位}（全形「－」）；唯一定義在 `src/lib/db.ts` 的 `makeTitle()`。
- **類別（category）** — 案件的分類（如「水電」），選項之一。
- **地點（location）** — 案件發生處；可屬某類別或通用（全部類別可用）。
- **使用範本（description）** — 建單時套用的說明文字，可綁類別。
- **回報範本（comment_desc）** — 回報節點旁的通用追蹤說明；不綁類別、全部顯示。
- **訊息模板（message template）** — 案件動態日報的單一支 `daily` 範本（v1.1.33 起整併自 new_case／timeline 兩支）；可綁類別，無關聯時落全域預設。
- **回報（update）** — 案件的進度記錄（狀態流節點），只增不改不刪（append-only）。
- **留言（comment）** — 時間軸上的附加說明，可附照片。
- **已發包** — 回報狀態 `in_progress` 的語意：該案已发包並記金額。
- **作廢（void）** — 案件置為作廢態並留作廢原因。
- **重開（reopen）** — 結案／作廢後重新打開案件。
- **廠商（vendor）** — 被指派執修的廠商；不刪除、只停用。
- **待開通（pending）** — 已登入但尚未獲授權限的使用者。
- **委員（committee）** — 第一層角色：建單、看自己建單的詳情、留言。
- **保全/秘書（manager）** — 第二層角色：全量案件＋管理面（選項/廠商/成員/模板/匯出）。
- **主管（admin）** — 第三層角色：保全/秘書全部權限，另可改成員角色。
- **分享連結（share token）** — 派工單公開頁的入口憑證；輪換後舊憑證作廢。

## 系統機制

- **面板載入（loadInto）** — `public/app.js` 的非同步面板載入唯一 seam：D9 防閃 loading、token 認領回應（stale 丟棄）、錯誤上面板三件政策一处；列表「載入更多」的 append 語意為刻意例外。
- **角色閘門（requireRoles）** — `src/lib/auth.ts` 註冊於全域 `requireAuth()` 之下的角色閘門中間層：只讀 `c.get("user")`、不重複驗簽與 D1 讀；「誰擋這個請求」的宣稱點自 27 個掛載收斂為全域一處。
- **選項過濾（optionsInCategory）** — `public/app.js` 的下拉規則單一定義：「該類別關聯＋通用（`category_id` null）」；後端權威是 `optionAllowedInCategory`，規則變更須兩處同動。建單／編輯兩頁共用此函式，類別連動以 id（非 label）比對還原。
