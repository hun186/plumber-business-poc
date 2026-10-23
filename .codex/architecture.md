# Architecture

> 類型：Current state。來源：`server.js`、`api/`、`lib/`、`db/` 與前端檔案。

## 系統邊界

- 系統負責：本機工程業務管理（客戶、案件、估價、工項、材料、庫存、收款／成本、分析、Excel、SQLite 備份）。
- 系統不負責：正式財稅結帳、多使用者角色、Vercel 持久化、線上還原或關機後備份。
- 上游：業主瀏覽器輸入或備份設定；非網路整合式企業平台。
- 下游：本機 SQLite 檔／備份，瀏覽器 XLSX 匯出與列印內容。

## 高階元件

| 元件 | 責任 | 主要位置 |
| --- | --- | --- |
| Browser UI | 儀表板、表單、工項／用料、備份頁、示範 localStorage | `index.html`、`app.js`、`inventory-ui.js`、`catalog-ui.js`、`backup-ui.js` |
| HTTP/API | 固定本機 host、static assets、Cookie／Origin 檢查、對外 JSON | `server.js`、`api/*.js` |
| Business modules | 庫存交易、工項階層／材料配方、snapshot 組裝、毛利計算 | `lib/inventory.js`、`lib/catalog.js`、`lib/sqlite.js`、`reports.js` |
| Persistence | `node:sqlite`、WAL、FK、schema / gated legacy migration | `lib/sqlite.js`、`tools/owner-cli.js`、`db/*.sql` |
| Backups | 排程、檔案 ACL、VACUUM INTO、一致性驗證、版數管理 | `lib/backup-manager.js`、`lib/backup-worker.js`、`api/backups.js` |
| Delivery | Windows 設定、啟動、診斷、手冊與 CI | `tools/owner-cli.js`、根目錄 `*.bat`、`docs/`、`tests/` |

## 主要資料流

1. 本機 `tools/owner-cli.js start` 初始化／驗證受保護設定與既有 SQLite，再在 `127.0.0.1` 啟動網站；`npm start` 對已安裝正式 DB 亦做一致性檢查。
2. 瀏覽器先請求 `GET /api/status` 知悉 `sqlite` 或 `demo`；正式模式經 `POST /api/login` 建立 HMAC Session Cookie。
3. 使用者在頁面變更客戶、案件、估價、庫存與工項時，正式模式透過受驗證 API → `lib` → SQLite 交易；示範模式則在當前瀏覽器 localStorage 使用虛構資料。
4. `lib/sqlite.snapshot()` 匯集核心表、庫存、材料規劃與從領料衍生之材料成本；前端以此顯示總覽／報表。
5. 工項範本套入估價時儲存材料快照；「已接受」後必須明確同步備料。預計需求不扣庫，工程實際領料才建立帳本負數與材料成本。
6. 本機運作期間排程每分鐘做到期檢查；實際備份改由 Worker 驗證環境後以 `VACUUM INTO` 產出受保護副本並驗證，網站可列歷史／下載／刪除。

## 依賴方向與模組邊界

- `server.js` 派送 `api`；`api` 呼叫 `lib`；`lib` 依據 `db` schema 與 SQLite 狀態完成交易。
- `lib/sqlite.snapshot()` 統一組裝資料；庫存與工項模組不應改寫瀏覽器產出的舊報價快照。
- 備份 Worker 建立獨立 SQLite 連線，須驗證 `.env` 與執行中環境相同，再操作原資料庫。
- 瀏覽器 Excel 由 `reports.js` / `xlsx-lite.js` 產出，不是 SQLite 可還原備份。

## 核心資料模型與狀態

| 資料 | 意義 | 權威定義 |
| --- | --- | --- |
| `customers`、`projects` | 客戶與工程 | `db/schema.sqlite.sql` |
| `quotes`（`items` JSON）、`payments`、`costs` | 估價、收款、成本 | `db/schema.sqlite.sql` |
| `inventory_items`、`inventory_movements`、`material_requirements` | 庫存異動帳本與手動需求 | `db/inventory.sql` |
| `work_templates`、`quote_material_plans` | 包項範本、報價來源需求 | `db/catalog.sql` |
| `backup_settings` | 備份天數、保留數、時間與錯誤 | `db/backup.sql` |
| `PRAGMA user_version=5` | 已完成初始化／新增式 schema 的版本標記 | `lib/sqlite.js`、`tools/owner-cli.js` |

## 必須維持的不變條件

- 單機環境驗證失敗不得回退 Demo 或憑空建立取代資料庫。
- `.env`、資料庫與備份 ACL／路徑限制在 Windows 採 fail closed；不以公開網路方式傳送明文管理密碼。
- 庫存領料在交易內禁止負庫存；同一筆領料只反映一次衍生材料成本。
- 已存報價中的材料配方不因範本編輯而變動；計畫需求不改庫存。
- 只能刪除符合受管檔名規則的備份；已驗證的 `.sqlite` 不被中斷暫存清理誤刪。

## 錯誤、重試與回復

- API 經驗證失敗回傳 HTTP 4xx、中文訊息／部分穩定錯誤碼；server 避免洩漏底層憑證。
- SQLite schema／存取錯誤應停止正式啟動，不以空資料表「修復」既有資料。
- 還原由交付者在停機且隔離驗證後操作；原 `.sqlite`／`-wal`／`-shm` 必須整組封存／移出。

## 安全與信任邊界

- 正式 API 使用 Cookie 驗證、POST 同源檢查；Vercel 強制示範模式。
- 敏感來源：`.env`、`data/`、`backups/`；不可寫入版本控制／記憶。
- 手動、排程備份均需重新檢查來源資料庫與檔案權限；頻繁 tick 避免同步 Windows ACL 系統程序，清理在啟動及備份前進行。

## 效能與營運邊界

- 規模與多人同時操作性能：待確認；目前為單機 PoC，不假設可水平擴充。
- 可觀測性：業主 CLI 錯誤代碼與備份狀態頁；沒有已確認的集中監控服務。
- 本機資料與備份同一磁碟無法防硬碟故障，須人工將重要副本移往其他安全裝置。

## 架構導覽

| 需求 | 優先查看 | 測試 |
| --- | --- | --- |
| SQLite 升級／安全 | `tools/owner-cli.js`、`lib/sqlite.js`、`db/*.sql` | `tests/owner-cli.test.js` |
| 備份排程／API | `lib/backup-manager.js`、`lib/backup-worker.js`、`api/backups.js` | `tests/backup-manager.test.js` |
| 工項與 BOM | `lib/catalog.js`、`catalog-ui.js` | `tests/catalog.test.js` |
| 庫存與材料成本 | `lib/inventory.js`、`inventory-ui.js` | `tests/inventory.test.js` |
| 業務／Excel | `api/data.js`、`app.js`、`reports.js` | `tests/core.test.js`、`tests/interaction.test.js` |
