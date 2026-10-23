-- v0.5 scheduled backups: settings are stored in the business SQLite DB.
-- No external scheduler or cloud storage is required for a localhost installation.
CREATE TABLE IF NOT EXISTS backup_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 interval_days INTEGER NOT NULL DEFAULT 1 CHECK(interval_days BETWEEN 1 AND 365),
 retention_count INTEGER NOT NULL DEFAULT 50 CHECK(retention_count BETWEEN 1 AND 500),
 last_auto_at TEXT,
 last_error TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO backup_settings(id,interval_days,retention_count,last_auto_at,last_error)
VALUES(1,1,50,NULL,NULL);
