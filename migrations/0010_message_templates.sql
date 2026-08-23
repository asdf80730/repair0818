-- 0010_message_templates.sql — 訊息模板系統（v1.1.15 §F12-2）
-- 用既有 options 字典表存 message_template 類型，類別關聯走 option_categories
-- F12-2 業主決策：不新開表、跟 description 範本同模式

ALTER TABLE options ADD COLUMN body TEXT;

-- 預設模板：type='message_template'，label 區分子類型（report/empty）
-- 不寫 option_categories = 全域預設（通用 fallback，所有類別可見）
-- 格式：{{var}} 替換 + {{#each array}}...{{/each}} 迴圈
INSERT OR IGNORE INTO options (type, label, sort_order, active, body) VALUES
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
{{/each}}'),
  ('message_template', 'empty', 1, 1, '今日 {{date}} {{category_label}} 無案件動態');

-- 索引：daily-report / message-templates 查詢都用 type+active 過濾
CREATE INDEX IF NOT EXISTS idx_options_message_template
  ON options(type, label, active) WHERE type = 'message_template';
