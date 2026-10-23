# Interface Contracts

> 類型：Current state。以 handler、parser、SQL 與測試為權威；以下是導覽，不取代程式定義。

## 契約範圍

本專案有本機 HTTP JSON API、Windows/Node CLI、SQLite schema、瀏覽器快照與 XLSX 匯出。遠端外部 RPC、事件佇列、模型檔案目前不適用。

## 契約索引

| ID | 類型 | 名稱 | Producer / Consumer | 權威定義 | 穩定性 |
| --- | --- | --- | --- | --- | --- |
| CT-001 | HTTP | Status／Login／Core Data | `api/status.js`、`api/login.js`、`api/data.js` / `app.js` | `api/*.js`、`tests/core.test.js` | 現行 v0.4，非獨立版本化 public API |
| CT-002 | HTTP | Inventory／Catalog | `api/inventory.js`、`api/catalog.js` / 前端 UI | 同名 handlers、`lib/inventory.js`、`lib/catalog.js` | 同上 |
| CT-003 | HTTP | Backup history/settings/actions/download | `api/backups.js` / `backup-ui.js` | `api/backups.js`、`lib/backup-manager.js`、`tests/backup-manager.test.js` | 同上 |
| CT-004 | CLI | Owner start／check／backup | `tools/owner-cli.js` / `*.bat` | CLI `execute()`、`docs/業主部署操作手冊.md` | 業主交付介面 |
| CT-005 | DB | SQLite schema 與版本標記 | `lib/sqlite.js` / API、backup worker | `db/*.sql`、`tools/owner-cli.js` | 持久性契約，必須安全遷移 |
| CT-006 | Internal JSON | `snapshot()` | `lib/sqlite.js` / 網頁 UI 與 Excel 報表 | `lib/sqlite.js`、`app.js`、`reports.js` | 內部契約 |
| CT-007 | File | SQLite backup／XLSX | `lib/backup-manager.js`、`xlsx-lite.js` / 業主 | 備份管理程式與報表測試 | 重要資料／匯出邊界 |

## 通用相容性規則

- API 以登入 Cookie 控制正式資料存取；POST 必須具受信任 Origin。Vercel Demo 不能觸發持久業務 API。
- 錯誤型態與代碼依實際 endpoint；請勿假設所有 API 一律使用相同 JSON 錯誤欄位。
- 表單與 schema 的標識符、合法日期、數值、外鍵、UNIQUE、CHECK 檢查是契約，不得為兼容舊資料悄悄放寬。
- Secret 值不屬契約文件；僅可記變數名稱與邊界。

## CT-001：本機核心 API

- `GET /api/status` → `{mode:'sqlite'|'demo',version:'0.4.0',sqlitePersistent:boolean,...}`。
- `POST /api/login`：接收 `{password}`；有效時設 HttpOnly、SameSite=Strict Session Cookie；拒絕不可信 Origin 或無效密碼。
- `GET /api/data`：認證後回 `{data:snapshot()}`。
- `POST /api/data`：JSON `{action:'add'|'update',payload:{id,...}}`；entity 依 ID 首字 `c/p/q/r/x` 映射 customer/project/quote/payment/cost；驗證參照與金額（`api/data.js`）。
- 不提供已證實穩定的公開第三方 API 版本／OAuth；需要跨系統使用時先設計認證與版本契約。

## CT-002：庫存與工項 API

- `GET /api/inventory`／`GET /api/catalog`：認證後回 `{data:snapshot()}`。
- `POST /api/inventory`／`POST /api/catalog`：JSON `{action,payload}`，具體 action／欄位由 `lib/inventory.js`、`lib/catalog.js` 限定，不在本文件猜測完整枚舉。
- 受 `db/inventory.sql` 的不能負庫存、異動識別碼唯一、`planned_qty>0` 與 `db/catalog.sql` 的階層／數量限制約束。

## CT-003：備份管理

- `GET /api/backups`：認證後回間隔、保留份數、最後狀態、歷史清單；`GET /api/backups?file=<受管檔名>` 下載已發布 SQLite 副本。
- `POST /api/backups` 以 `action=save`（`intervalDays` 1–365，`retentionCount` 1–500）、`create` 或 `delete`（`name`）修改設定／建立手動備份／刪除備份。
- 只接受符合 `plumber-backup-日期-隨機碼-(auto|manual).sqlite` 管理規則的檔名；下載不提供線上還原。
- `VACUUM INTO` 產出後執行完整性、FK 與業務表驗證；只對已發布備份做清單及保留份數管理，手動備份不被自動排程裁減。

## CT-004：業主 CLI

- `node tools/owner-cli.js start`：初始配置、資料庫驗證、啟動 `127.0.0.1`。
- `node tools/owner-cli.js check`：環境、schema、SQLite 完整性檢查。
- `node tools/owner-cli.js backup`：製作驗證過的備份。
- 非支援參數以 `E_USAGE` 失敗；另見 `E_NODE`、`E_ENV`、`E_CONFIG`、`E_PATH`、`E_DB`、`E_PORT`、`E_BACKUP`。Windows BAT 封裝入口，診斷詳見業主手冊。
- 初始化時只記錄命令，不執行它們以避免生成或存取正式資料。

## CT-005：SQLite schema

- 基礎：`db/schema.sqlite.sql`；耗材：`db/inventory.sql`；包項／配方：`db/catalog.sql`；備份設定：`db/backup.sql`。
- 版本標記 `PRAGMA user_version=5`。現有資料庫結構缺少必要欄位／約束時 fail closed；舊版升級必須先備份確認、一次性設定 `OWNER_ALLOW_LEGACY_UPGRADE=1`，不得由業主任意操作。
- 使用 WAL 與外鍵；備份還原必須將舊 SQLite/WAL/SHM 整組移出，避免舊 WAL 覆蓋還原結果。

## CT-006：前端快照

`snapshot()` 彙整 `customers`、`projects`、`quotes`、`payments`、`costs`、`inventoryItems`、`inventoryMovements`、`materialRequirements`、`workTemplates`、`quoteMaterialPlans`；引入衍生領料成本與報價需求視圖。修改欄位需同時查 UI、API、報表與測試。

## CT-007：業務輸出與備份檔案

- Excel：由瀏覽器 `reports.js` / `xlsx-lite.js` 輸出多工作表 `.xlsx`；可作分析與交換報表，**不是**可還原的正式資料庫備份。
- SQLite：已驗證的 `backups/*.sqlite` 是系統還原來源，但必須由交付人員停機操作；`.partial` / `.lock` 不能當備份。
- 舊版／替代：PostgreSQL `db/schema.sql` 已移除；Issue #1 相關舊契約不是 current contract。

## Deprecated／Migration

| 舊契約 | 現行替代 | 檢查 |
| --- | --- | --- |
| PostgreSQL 測試方案（Issue #1） | `node:sqlite` 單機持久化 | `README.md`、`lib/sqlite.js`、PR #3 |
| 未標記 SQLite schema | `user_version=5` 與受控舊版升級 | `tools/owner-cli.js`、`tests/owner-cli.test.js` |
