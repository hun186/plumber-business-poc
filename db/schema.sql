-- PostgreSQL 15+; this schema creates tables only, no real customer data.
CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, address TEXT, email TEXT, note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), title TEXT NOT NULL,
 type TEXT NOT NULL DEFAULT '綜合工程',status TEXT NOT NULL DEFAULT '待估價',
 start_date DATE, due_date DATE, amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(amount>=0), note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_customer_idx ON projects(customer_id);
CREATE TABLE IF NOT EXISTS quotes (
 id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE,
 project_id TEXT NOT NULL REFERENCES projects(id),customer_id TEXT NOT NULL REFERENCES customers(id),
 quote_date DATE NOT NULL DEFAULT current_date,status TEXT NOT NULL DEFAULT '草稿',
 tax_rate NUMERIC(5,2) NOT NULL DEFAULT 5 CHECK(tax_rate>=0 AND tax_rate<=100),
 items JSONB NOT NULL DEFAULT '[]'::jsonb, note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_project_idx ON quotes(project_id);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),
 paid_date DATE NOT NULL DEFAULT current_date,amount NUMERIC(14,2) NOT NULL CHECK(amount>0), note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_project_idx ON payments(project_id);
