-- v0.3. Safe additive schema for existing SQLite files.
CREATE TABLE IF NOT EXISTS inventory_items (
 id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 unit TEXT NOT NULL DEFAULT '個', unit_cost REAL NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 alert_qty REAL NOT NULL DEFAULT 0 CHECK(alert_qty>=0), note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS material_requirements (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 item_id TEXT NOT NULL REFERENCES inventory_items(id),
 planned_qty REAL NOT NULL CHECK(planned_qty>0), note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(project_id,item_id)
);
CREATE INDEX IF NOT EXISTS requirements_project_idx ON material_requirements(project_id);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES inventory_items(id),
 project_id TEXT REFERENCES projects(id), move_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('receive','issue','adjust')),
 qty REAL NOT NULL CHECK(qty!=0), unit_cost REAL NOT NULL CHECK(unit_cost>=0),
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK((kind='issue' AND qty<0 AND project_id IS NOT NULL)
   OR (kind='receive' AND qty>0 AND project_id IS NULL)
   OR (kind='adjust' AND project_id IS NULL))
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS inventory_movements_project_idx ON inventory_movements(project_id);
