# Development Workflows

> 類型：Current state。命令以 `package.json`、`tools/owner-cli.js` 和 CI 為準；本次初始化不執行會改寫資料／啟動服務的命令。

## 環境前提

| 項目 | 要求 | 來源 |
| --- | --- | --- |
| Node | >=22.13；CI Ubuntu 22 / Windows 24 | `package.json`、`.github/workflows/verify.yml` |
| 套件 | 目前沒有第三方 dependencies/devDependencies，無 lockfile | `package.json`、repository 清單 |
| 系統 | 業主 Windows 單機；Hosted Ubuntu 為測試環境 | `*.bat`、CI |
| 本機服務 | 不需獨立 DBMS；以 `node:sqlite` 在固定主機建立 SQLite | `lib/sqlite.js` |
| 環境變數 | `SQLITE_PATH`、`APP_ADMIN_PASSWORD`、`AUTH_SECRET`；`PORT` 選填；`OWNER_ALLOW_LEGACY_UPGRADE` 僅交付人員受控升級時使用 | `.env.example`、`tools/owner-cli.js` |
| 資料邊界 | `.env`、`data/`、`backups/`、`logs/` 不入版控 | `.gitignore` |

## Canonical Commands

| 用途 | 命令 | 工作目錄 | 已確認程度 |
| --- | --- | --- | --- |
| 首次安全啟動 | `node tools/owner-cli.js start` | repo root | CLI 與 README 已確認；會建立設定與 DB，**不得作為初始化文件工作的驗證命令** |
| 業主設定檢查 | `node tools/owner-cli.js check` | repo root | CLI 已確認；可能涉及正式資料檢查，不在此任務執行 |
| 手動備份 | `node tools/owner-cli.js backup` | repo root | CLI 已確認；會產生備份，不在此任務執行 |
| 已部署後啟動 | `npm start` | repo root | manifest 已確認；拒絕無效／遺失正式 DB 設定 |
| 開發啟動 | `npm run dev` | repo root | manifest 內容與 start 相同 |
| 靜態＋回歸測試 | `npm run check` | repo root | 由 manifest 定義，CI 實際執行 |
| Windows 入口 | `啟動水電好管家.bat`、`部署檢查.bat`、`備份資料.bat` | repo root | 文件與 BAT 已確認；現場仍待驗收 |
| build／format／typecheck 專用命令 | 目前不適用（manifest 未提供） | — | 不要猜測或執行 |
| 套件安裝 | 目前不需第三方 npm dependencies；不執行安裝 | — | manifest 已確認 |

## 驗證矩陣

| 變更類型 | 最小驗證 | 擴大驗證 |
| --- | --- | --- |
| `.codex` / README 純文件 | 檔名、連結、命令／事實一致性與敏感資料掃描；Git diff | 若更新部署命令再檢查 CLI、manifest、SOP |
| 前端 UI / 報表 | `npm run check`，相關 `tests/interaction.test.js` / `tests/core.test.js` | 真正瀏覽器操作與輸出驗證 |
| SQLite／庫存／工項 | `npm run check`，`tests/inventory.test.js`、`tests/catalog.test.js` | Ubuntu/Windows CI 與升級安全檢查 |
| Auth/API/部署 | `npm run check`，`tests/owner-cli.test.js`、`tests/backup-manager.test.js` | Windows NTFS、失敗路徑、業主現場 |
| 業主手冊 | `tests/manual-docx.test.js` 所用 Word/Markdown 一致性檢查 | 隔離還原演練和人工簽收 |

## CI 的權威範圍

- `.github/workflows/verify.yml`：push `main` 或 PR，Ubuntu `node-version: '22'`、Windows `node-version: '24'`，兩個 job 均跑 `npm run check`。
- `main@f44a42b` 在 GitHub Actions run [39923685391](https://github.com/hun186/plumber-business-poc/actions/runs/39923685391) 為 success；**此狀態僅代表該 SHA**，不能當未來新 Commit 的 CI。
- PR #6 最後來源 SHA `c4e1e7a` 的 Hosted CI：Ubuntu/Windows 各 82/82 PASS（run [39921638534](https://github.com/hun186/plumber-business-poc/actions/runs/39921638534)）。
- 初始化 PR 本身若產生新的 SHA，必須另外讀它自己的 Hosted CI；未執行的檢查不可報 PASS。

## 測試資料與外部服務

- `tests/*.test.js` 使用 Node built-in test runner；部署相關測試以 `os.tmpdir()` 建立隔離專案副本與 SQLite fixture。
- Vercel 只用虛構 Demo；請勿在公開展示站輸入真實客戶資料。
- GitHub Actions 是外部 Hosted 驗證，不等同業主自己的 Windows 實機驗收。

## 常見限制與替代驗證

| 限制 | 首選 | 替代 | 缺口 |
| --- | --- | --- | --- |
| 文件初始化禁執行有副作用命令 | 靜態比對 GitHub 已存在程式／manifest／CI | PR Hosted CI | 無法證明業主現場配置 |
| Windows ACL／WAL 還原 | Windows NTFS 現場安裝＋隔離還原演練 | Hosted Windows 單元／故障注入測試 | 不能替代業主機實測 |

## 完成前檢查

- 確認變更範圍與授權、程式／契約／文件一致。
- 確認 SHA、CI 的精確對應；Review running 與 Resolved threads 不等於正式新 SHA Review 完成。
- 不暴露 `.env`、Session、API secrets、資料庫或業主個資。
