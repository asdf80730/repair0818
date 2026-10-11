#!/usr/bin/env python3
"""scripts/check-doc-versions.py — SPEC.md 檔頭版本與 §0.1 最新列一致性守門。

背景（v1.1.33 審查實測，retro 2026-10-11 #1）：SPEC 檔頭滯留 v1.1.32、§0.1 已列
v1.1.33——「改內容沒帶到檔頭」是文件漂移最常見形態，完全機械可判。
檔頭必須等於 §0.1 版本表最新列（表格第一筆資料列）。

用法：python3 scripts/check-doc-versions.py（repo 根執行）
  不一致 → ::error:: exit 1；一致 → exit 0。

範圍說明：檔內 migration 編號引用與 tests/e2e 版號註解「該不該更新」非機械可判
（「歷史 0013 已 squash」是合法寫法），屬定版出鏈清單／reviewer 規則——見
CODING_STANDARDS.md，本 script 只管檔頭↔§0.1 零誤判的一條。
"""
import re
import sys

SPEC = "docs/SPEC.md"


def main() -> int:
    try:
        text = open(SPEC, encoding="utf-8").read()
    except OSError as e:
        print(f"::error::讀不到 {SPEC}（{e}）— 需在 repo 根執行")
        return 1

    m_head = re.search(r"\*\*版本：v(\d+\.\d+\.\d+)", text)
    if not m_head:
        print("::error::SPEC.md 找不到「**版本：v...」檔頭")
        return 1
    head = "v" + m_head.group(1)

    m_sec = re.search(r"### 0\.1 版本歷程(.*?)(?=\n### |\Z)", text, re.S)
    if not m_sec:
        print("::error::SPEC.md 找不到「### 0.1 版本歷程」")
        return 1
    rows = re.findall(r"^\|\s*(v\d+\.\d+\.\d+)\s*\|", m_sec.group(1), re.M)
    if not rows:
        print("::error::§0.1 版本表找不到任何資料列")
        return 1
    latest = rows[0]

    if head != latest:
        print(f"::error::SPEC.md 檔頭 {head} ≠ §0.1 最新列 {latest}")
        print("        定版出鏈清單第 1／2 點沒帶到：檔頭與日期、§0.1 新列要同步。")
        return 1

    print(f"✅ SPEC.md 檔頭與 §0.1 一致（{head}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
