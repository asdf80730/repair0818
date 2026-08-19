-- 0003_category_assoc.sql — 類別關聯 join 表（§2.1 v1.1.7）
-- 多對多：一個 option（location/description）可屬於多個 category
-- 無任何 option_categories 列的 option = 通用，所有類別可見
-- 刻意不加 created_at（純關聯表，無稽核需求）
-- 0002_seed.sql 一字不改（已套用到 production）；本 migration 只建表不 seed

CREATE TABLE option_categories (
  option_id   INTEGER NOT NULL REFERENCES options(id),
  category_id INTEGER NOT NULL REFERENCES options(id),
  PRIMARY KEY (option_id, category_id)
);

CREATE INDEX idx_oc_category ON option_categories(category_id);
