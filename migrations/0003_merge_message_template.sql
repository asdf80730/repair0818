-- 0003_merge_message_template.sql — v1.1.33（業主拍板）
-- 訊息模板合併：new_case／timeline 兩支 → 單一支 daily（body 內含 header／新案件段／時間軸段／系統連結）。
-- 幂等：先 DELETE 舊鍵、INSERT OR IGNORE 走 UNIQUE(type,label)；重跑結果一致。

DELETE FROM options WHERE type IN ('message_template_new_case', 'message_template_timeline');

INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES
  ('message_template_daily', '修繕系統簡報：{{date_label}}
{{#each new_cases}}
{{id}}. {{location_label}}　{{status}}　{{description}}
{{/each}}
{{#each timeline_updates}}
{{id}}. {{location_label}}　{{status}}　{{note}}
{{/each}}
{{system_link}}', 0, 1, '2026-10-10T00:00:00.000Z');
