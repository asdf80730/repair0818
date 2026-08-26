-- 0012_daily_report_templates.sql — v1.1.16 案件動態簡化（新案件 + 時間軸兩種模板）
-- 取代 v1.1.15 的 report/empty 雙模板；本檔 seed `new_case` / `timeline`，並停用舊模板。
-- 沿用 options(type='message_template') + option_categories（類別專用 / 全域預設）。

-- 1) 插入兩種新模板（active=1、無 option_categories = 全域預設）
--    new_case：{{#each new_cases}} ... {{/each}}，每行 `{{id}}. {{location_label}}　{{status}}　{{description}}`
--    timeline：{{#each timeline_updates}} ... {{/each}}，每行 `{{id}}. {{location_label}}　{{status}}　{{note}}`
INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at, body) VALUES
  ('message_template', 'new_case', 0, 1, '2026-01-01T00:00:00.000Z',
   '{{#each new_cases}}
{{id}}. {{location_label}}　{{status}}　{{description}}
{{/each}}'),
  ('message_template', 'timeline', 1, 1, '2026-01-01T00:00:00.000Z',
   '{{#each timeline_updates}}
{{id}}. {{location_label}}　{{status}}　{{note}}
{{/each}}');

-- 2) 停用 v1.1.15 的 report / empty（保留不刪：舊改停用，符合規則）
UPDATE options SET active = 0 WHERE type = 'message_template' AND label IN ('report', 'empty');
