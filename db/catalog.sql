-- v0.4 additive migration: reusable hierarchical quote work items and separately sourced quote demand.
CREATE TABLE IF NOT EXISTS work_templates (
 id TEXT PRIMARY KEY,
 parent_id TEXT REFERENCES work_templates(id),
 kind TEXT NOT NULL CHECK(kind IN ('package','task')),
 name TEXT NOT NULL,
 unit TEXT NOT NULL DEFAULT '式',
 default_qty REAL NOT NULL DEFAULT 1 CHECK(default_qty > 0),
 unit_price REAL NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
 materials TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(materials)),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS work_templates_parent_idx ON work_templates(parent_id);
CREATE TABLE IF NOT EXISTS quote_material_plans (
 project_id TEXT NOT NULL REFERENCES projects(id),
 item_id TEXT NOT NULL REFERENCES inventory_items(id),
 quote_id TEXT NOT NULL REFERENCES quotes(id),
 planned_qty REAL NOT NULL CHECK(planned_qty > 0),
 PRIMARY KEY(project_id,item_id)
);
CREATE INDEX IF NOT EXISTS quote_material_plans_quote_idx ON quote_material_plans(quote_id);
