# Technical Decisions

> 類型：Durable rationale。只記已存在且影響未來相容性的取捨；記錄依據和可查證來源，不推定新決策。

## Active Decision Index

| ID | 決策 | 狀態 | 依據日期 | 範圍 |
| --- | --- | --- | --- | --- |
| ADR-0001 | 固定主機使用 Node 內建 SQLite，而非舊 PostgreSQL 方案 | Accepted | 2026-10-18 PR #3 | 持久化／部署 |
| ADR-0002 | Vercel 僅提供虛構 localStorage Demo，正式服務限制本機 loopback | Accepted | 2026-10-18 起 README、`server.js` | 安全／部署 |
| ADR-0003 | 庫存採異動帳本、備料與領料嚴格分離 | Accepted | PR #4／#5 | 庫存／工程成本 |
| ADR-0004 | 報價保存快照，材料需求需明確同步 | Accepted | PR #5 | 估價／材料契約 |
| ADR-0005 | SQLite fail-closed 初始化、受控升級與已驗證備份 | Accepted | 2026-10-23 PR #6 | 資料安全／維運 |

## Decision Records

### ADR-0001 — 固定主機 SQLite

- 狀態：Accepted。
- 背景：舊 Issue #1 規劃 Vercel + PostgreSQL，但已合併 PR #3 改採 Node.js `node:sqlite`，不需獨立 DBMS。
- 取捨：固定主機可直接持久化，代價是不得把一般 SQLite 放在 Vercel Serverless 冒充持久資料庫。
- 證據：`package.json`、`lib/sqlite.js`、`README.md`、PR #3。

### ADR-0002 — Demo 與正式資料隔離

- 狀態：Accepted。
- 背景：公開體驗與真實客戶資料需要不同的安全與持久性保證。
- 決策：`VERCEL` 下只回 Demo；正式 Node HTTP 服務僅 bind `127.0.0.1`，正式 API 需要 Session 與 Origin 驗證。
- 後果：多人／外網服務不得靠開放 3000 port 達成，另需 HTTPS、權限與部署方案。
- 證據：`api/_auth.js`、`server.js`、`README.md`。

### ADR-0003 — 庫存異動帳本與衍生成本

- 狀態：Accepted。
- 決策：庫存由 `inventory_movements` 的異動數量決定；需求計畫不改庫存，工程領料在交易內扣庫及以當時成本計入工程，避免改動目前料價重算歷史。
- 後果：負庫存與重複異動 ID 應被拒絕；報表不應再為同一筆領料人工重複計入成本。
- 證據：`db/inventory.sql`、`lib/inventory.js`、`lib/sqlite.js`、PR #4。

### ADR-0004 — 包項快照與明確備料同步

- 狀態：Accepted。
- 決策：範本展開後保存估價材料快照；只有使用者對「已接受」報價明確操作同步才更新報價來源備料，手動需求優先。
- 取捨：避免背景偷偷改庫存與歷史估價；多份已接受報價不直接累加，改以最後同步者為準。
- 證據：`db/catalog.sql`、`lib/catalog.js`、`api/data.js`、PR #5。

### ADR-0005 — Fail-closed SQLite 與停機還原

- 狀態：Accepted。
- 決策：有既存 `.env` 而 DB 不見／schema 不符時拒絕啟動或靜默補空表；`user_version=5`，legacy 需交付人員明確受控授權。備份採 `VACUUM INTO`、Worker 與 SQLite 完整性驗證；Windows 以 NTFS ACL 保護資料。
- 取捨：提高初始化／升級門檻，避免業主無感資料覆寫；還原需停機且將主檔、WAL、SHM 原始組整組封存／移出。
- 證據：`tools/owner-cli.js`、`lib/backup-manager.js`、`lib/backup-worker.js`、`docs/業主部署操作手冊.md`、PR #6。

## 維護規則

- 只有 Accepted 是現行約束，且應與程式及測試核對；新決策若取代舊決策，保留替代鏈。
- 不為一般 bug fix、格式調整新增 ADR。
