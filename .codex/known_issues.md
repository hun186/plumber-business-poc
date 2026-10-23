# Known Issues

> 類型：Verified open problems。把已證實的追蹤狀態落差與程式缺陷明確區分；不創造未經驗證的故障。

## Open Issues

| ID | 嚴重度 | 問題 | 影響 | Workaround | 證據 | 狀態 |
| --- | --- | --- | --- | --- | --- | --- |
| KI-001 | 文件／追蹤器落差 | Issue #1 仍 Open 且描述 Vercel PostgreSQL／`db/schema.sql`；現行 `main` 是本機 SQLite | 容易讓新代理誤採過時部署方向 | 以程式、README、PR #3 為現行架構依據，不擅自沿用 Issue #1 | [Issue #1](https://github.com/hun186/plumber-business-poc/issues/1)、`lib/sqlite.js` | Open／待維護者確認處置 |

## Issue Details

### KI-001 — 舊版 PostgreSQL Issue 與現況不一致

- 首次確認：2026-10-23，在 Hosted GitHub `main@f44a42b`。
- 預期：Current backlog 不應將已取代的 PostgreSQL、Vercel 持久 DB 作為已採用方案。
- 實際：Issue #1 仍 Open，包含已不存在的 `db/schema.sql`、`DATABASE_URL`、跨裝置 PostgreSQL 驗收條目；目前程式、PR #3 與 README 指向 `node:sqlite` 單機架構。
- 影響：開發方向與驗收敘述可能誤導；**不是目前已證明的線上執行故障**。
- Workaround：先查 `project.md`、`architecture.md`、最新程式與 Git；若需改 Issue，另取使用者授權。
- 完成條件：維護者明確確認關閉、改寫或保留為歷史；本次初始化不擅自更改 Issue。

## Recently Resolved

| ID | 解決摘要 | 驗證 | 日期 |
| --- | --- | --- | --- |
| KI-HIST-01 | Windows 備份 ACL／中斷檔案回收／WAL 還原 SOP 等 PR #6 Codex Findings 已逐輪修正 | `c4e1e7a` Ubuntu／Windows 各 82/82 PASS；28 threads resolved；最新正式 Codex receipt 無重大問題 | 2026-10-23 |

## 記錄準則

- 業主 Windows 實機簽收**尚未完成的驗證**放 `backlog.md`，不能謊稱已知產品 bug。
- 未經重現不得把純風險、可能缺陷列為 Open Issue。
