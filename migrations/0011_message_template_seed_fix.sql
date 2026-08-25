-- 0011_fix_message_template_seed.sql — 修復 0010 漏插模板（v1.1.15 bug）
-- 0010 的 INSERT OR IGNORE 漏了 created_at（options.created_at NOT NULL），
-- SQLite 對 NOT NULL 違約採 IGNORE 靜默跳過 → 模板一行都插不進。
-- 因 0010 已在 production 套過（hash 追蹤），新增本檔補插；INSERT OR IGNORE
-- 靠 UNIQUE(type,label) 防重複，若已存在則無害。
INSERT OR IGNORE INTO options (type, label, sort_order, active, body, created_at) VALUES
  ('message_template', 'report', 0, 1, '📅 {{date}} {{category_label}}案件動態（共 {{total_count}} 件）

{{#each new_tickets}}
{{序}}. {{title}}
   {{description}}{{creator_name}} {{created_at_time}}
   詳情：{{detail_url}}
{{/each}}

{{#each existing_tickets}}
{{序}}. {{title}} → {{status_label}}
{{#each updates_today}}
   {{time}} {{actor_name}}：{{note_or_status}}{{amount_text}}
{{/each}}
{{/each}}', '2026-01-01T00:00:00.000Z'),
  ('message_template', 'empty', 1, 1, '今日 {{date}} {{category_label}} 無案件動態', '2026-01-01T00:00:00.000Z');
