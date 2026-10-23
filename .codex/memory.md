# Project Memory

> 類型：Recent durable context，最多保留十筆高價值結果；不保存聊天逐字稿。

## Current Focus

- 目前有效基線：`main@f7cc72b43e4115a21242f4692de14d7c899749e3`，已合併 PR #7（Codex 記憶初始化）。
- 當前工作分支正在改善「未變更不重複自動備份」，僅在 GitHub PR 合併後才能視為主線已提供；此次改動保留手動備份、預設間隔與 50 份自動保留規則。
- 初始專案記憶從使用者提供的 `codex-project-md-template.zip` 匯入；根 README 僅修正已證實過時的備份規劃文字。
- 產品現況：本機 Node.js + SQLite；Vercel 僅 localStorage 虛構展示；不把過去 PostgreSQL 計畫當現行架構。
- 交付階段：需在業主 Windows 現場執行首次安裝、登入、資料持久性及隔離備份還原簽收。
- GitHub PR 工作需用 Hosted 最新 SHA 作為權威；Codex Running 不等於 Completed、Thread Resolved 不等於正式無 Finding Review、舊 SHA CI 不等於新 SHA CI。
- 未經使用者明確授權，不得 Merge。

## Recent Outcomes

### 2026-10-23｜PR #6 本機部署與備份安全基線

- 結果：Windows BAT、Owner CLI、SQLite 自動／手動備份、站內管理、WAL-safe 還原 SOP 已進入 `main`（Merge `f44a42b`）。
- 驗證：最後來源 SHA `c4e1e7a`，Ubuntu／Windows 各 82/82 PASS（[run 39921638534](https://github.com/hun186/plumber-business-poc/actions/runs/39921638534)）；合併 `main` 的 push [run 39923685391](https://github.com/hun186/plumber-business-poc/actions/runs/39923685391) 成功。
- Codex：最後 review receipt 對應 `c4e1e7aaaf`，未發現重大問題；此前 28 個 Review Threads 均 Resolve。這不代替現場交付驗收。
- 長期教訓：備份前清理／ACL 可在 Worker 處理，但每分鐘 scheduler tick 不應同步呼叫 Windows PowerShell ACL 程序。

### 2026-10-20｜包項／材料與庫存功能基線

- 結果：PR #5 多層包項、估價快照、手動同步備料及群組導覽；PR #4 庫存異動帳本、缺料／低庫存 UI、領料產生成本；均已反映於目前 `main` 與 README。
- 不變量：計劃不扣庫、領料才扣庫；多份報價只以最後明確同步版本建立報價來源需求，手動需求優先。

### 2026-10-18｜SQLite／Excel／估算毛利基線

- 結果：PR #3 改為 `node:sqlite` 固定主機持久化，Vercel 只展示；多張 Excel 工作表與估算毛利已提供。
- 不變量：案件金額不是已認列營收，收款不是毛利；不可用展示站儲存真實個資。

## Open Handoffs

- 業主 Windows 電腦首次部署／隔離還原／外部備份／簽收：尚無現場完成證據，見 `backlog.md` BL-001。
- GitHub Issue #1 仍 Open，但描述 PostgreSQL／Vercel 正式資料庫方案與目前 SQLite 實作不一致；需由維護者確認其處置，見 `known_issues.md`。
- 後續任何新 PR 的 SHA、CI 與正式 Codex Review 都必須另行核對，不得沿用先前已合併 Commit 的綠燈。

## Archive Index

- 見 `.codex/archive/README.md`；目前尚無需移入 Archive 的本專案歷史。

## 記錄準則

- 只保留會影響下一次任務的成果、驗證與風險界線；日常工作不重寫全部記憶。
- 長期設計與有效命令分別以 `project.md`、`architecture.md`、`workflows.md`、`contracts.md` 為準。
