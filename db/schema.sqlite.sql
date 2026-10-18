-- SQLite schema for single-host persistent use only. No customer data is seeded.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, address TEXT, email TEXT, note TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), title TEXT NOT NULL,
 type TEXT NOT NULL DEFAULT '綜合工程', status TEXT NOT NULL DEFAULT '待估價',
 start_date TEXT, due_date TEXT, amount REAL NOT NULL DEFAULT 0 CHECK(amount>=0), note TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS projects_customer_idx ON projects(customer_id);
CREATE TABLE IF NOT EXISTS quotes (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE,
 project_id TEXT NOT NULL REFERENCES projects(id), customer_id TEXT NOT NULL REFERENCES customers(id),
 quote_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT '草稿',
 tax_rate REAL NOT NULL DEFAULT 5 CHECK(tax_rate BETWEEN 0 AND 100),
 items TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(items)), note TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS quotes_project_idx ON quotes(project_id);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), paid_date TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount>0), note TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS payments_project_idx ON payments(project_id);
CREATE TABLE IF NOT EXISTS costs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), cost_date TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('材料','人工','外包','設備','其他')),
 amount REAL NOT NULL CHECK(amount>0), note TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS costs_project_idx ON costs(project_id);
CREATE INDEX IF NOT EXISTS costs_category_idx ON costs(category);
