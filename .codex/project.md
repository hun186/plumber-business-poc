# Project Profile

> 類型：Current state。對照程式、manifest 與 Hosted GitHub 現況，不保存逐日流水帳。

## Metadata

- 初始化狀態：`INITIALIZED`
- 最後查證日期：2026-10-23（Asia/Taipei）
- 查證基準：`main@f44a42b8ba6c6d2b5241e8c879f7972add0879e4`，GitHub Actions run `39923685391`（success）
- 維護責任：Repository 維護者；個別代理任務不得擅自 Merge

## 一句話目的

水電好管家是面向個人師傅與小型承攬商的繁體中文工程業務管理 PoC，讓使用者在單機 SQLite 網站管理客戶、工程、估價、工項／耗材、收支與毛利估算，並匯出 Excel 和保護本機備份。

## 使用者與使用情境

- 主要使用者：個人水電師傅、小型承攬商；另有交付者協助首次安裝、升級與災難還原。
- 主要使用情境：本機 Windows 單機持久化業務資料、業主日常查詢、估價與備料；公開 Vercel 只供虛構資料展示。
- 主要輸入：客戶、案件、估價工項、工項材料配方、收款、成本、庫存異動、備份設定。
- 主要輸出：SQLite 業務資料與本機備份、網站儀表板／分析、多工作表 `.xlsx` 以及可列印估價單。

## 目標

- 將客戶 → 工程 → 估價單／備料 → 領料／收款／成本 → 管理分析連成可追蹤流程。
- 避免 Demo 模式冒充持久儲存；保護本機資料庫及備份，提供非技術業主部署與錯誤 SOP。
- 區分估算毛利、收款與正式會計認列。

## 非目標（現行版本的已證實限制）

- 不是可直接公網使用的多員工、多角色 SaaS；`server.js` 只綁定 `127.0.0.1`。
- Vercel 沒有持久 SQLite／客戶資料後端；前端 Demo 僅 localStorage。
- 不取代正式財務報表或稅務申報；站內沒有線上資料庫還原。
- 無內建異地自動備份、關機仍執行的備份排程、Windows 常駐服務。

## 技術與執行環境

| 面向 | 目前狀態 | 證據 |
| --- | --- | --- |
| 語言 | JavaScript、HTML、CSS、SQLite SQL、Windows BAT | `package.json`、`server.js`、`index.html`、`db/*.sql` |
| Runtime | Node.js >=22.13；CI Ubuntu Node 22、Windows Node 24 | `package.json`、`.github/workflows/verify.yml` |
| 相依／lockfile | `package.json` 的 dependencies/devDependencies 均空；目前無 lockfile | 根目錄清單、`package.json` |
| 儲存 | 正式固定主機使用 `node:sqlite` + WAL；Vercel 展示用瀏覽器 localStorage | `lib/sqlite.js`、`api/_auth.js`、`README.md` |
| 平台 | Windows 單機部署腳本；Node 入口另在 Ubuntu Hosted CI 測試；業主實機驗收待完成 | `tools/owner-cli.js`、`tests/owner-cli.test.js`、`.github/workflows/verify.yml` |

## Repository 地圖

| 路徑 | 責任 | 何時查看 |
| --- | --- | --- |
| `server.js`、`api/` | 本機 HTTP 靜態檔與身分驗證／業務 API | 修改認證、路由、資料流 |
| `lib/` | SQLite、庫存、工項、備份與 Worker | 修改持久化、交易、計算、安全 |
| `db/*.sql` | 基底與新增式資料表定義 | DB schema、相容升級 |
| `app.js`、`*-ui.js`、`catalog-kit.js` | 瀏覽器介面、示範資料與互動 | UI、前端契約 |
| `reports.js`、`xlsx-lite.js` | 營運分析與瀏覽器 Excel 產出 | 匯出及管理估算 |
| `tools/owner-cli.js`、`*.bat` | 業主首次設定、檢查、啟動、備份 | Windows 部署及 SOP |
| `tests/*.test.js`、`.github/workflows/verify.yml` | 回歸驗證與 Hosted CI | 修改前確認可驗證行為 |
| `docs/業主部署操作手冊.md`、`docs/*.docx` | 業主維運與停機還原指南 | 交付驗收、文件更新 |

## 主要入口

| 入口類型 | 路徑／命令 | 用途 | 狀態 |
| --- | --- | --- | --- |
| 業主首次啟動 | `node tools/owner-cli.js start` 或 `啟動水電好管家.bat` | 驗證並初始化本機持久化服務 | 程式／CI 已驗證；業主現場待驗收 |
| 管理檢查 | `node tools/owner-cli.js check` | 資料與設定檢查 | 程式／測試已確認 |
| 手動備份 | `node tools/owner-cli.js backup` | 一致性 SQLite 副本 | 程式／測試已確認 |
| 後續啟動 | `npm start` | 已安裝環境啟動本機網站 | `package.json` 明確定義 |
| CI | `npm run check` | JavaScript syntax + `node --test` | Ubuntu/Windows Hosted CI 已成功 |

## 事實來源

1. `server.js`、`tools/owner-cli.js`、`lib/*.js`、`api/*.js`、`db/*.sql`。
2. `package.json`、`.github/workflows/verify.yml`、`tests/*.test.js`。
3. `README.md` 與 `docs/業主部署操作手冊.md`。
4. GitHub 已合併 PR #3/#4/#5/#6 與目前有效 Issue（只作歷史／待辦佐證）。

## 資料與產物邊界

- 應提交 Git：程式碼、schema、測試、維護手冊與脫敏設定範例。
- 不應提交：`.env`、`data/`、`backups/`、`logs/`、`node_modules/`、`.vercel/`、`*.sqlite*`（`.gitignore`）。
- 現有測試使用隔離 fixture／暫存 SQLite；不應取真實客戶資料填入示範模式。
- Secret 名稱可記錄，但任何實際管理密碼、`AUTH_SECRET`、Session Cookie 或個資不得寫入記憶文件。

## 外部系統與相鄰專案

| 系統 | 關係 | 限制 |
| --- | --- | --- |
| GitHub Actions | Hosted CI（push main / PR） | 綠燈須對應 exact SHA |
| Vercel | 虛構展示 UI | 不能視作持久化正式資料庫 |
| PostgreSQL | 舊規劃／Issue #1 曾提及 | 現行原始碼已改採 SQLite；不得把舊 issue 當有效架構 |

## 重要限制與不變條件

- 備料不扣庫；實際領料才扣庫並影響工程材料成本。
- 工項模板更動不得追溯改寫既有估價快照；多份報價以最後明確同步的材料需求為準，手動需求優先。
- 正式 SQLite 不得在已有 `.env` 但資料庫遺失時悄悄建立空庫；資料庫升級需遵守受控 legacy 流程。
- 站內備份屬本機備份，還原需停機並整組封存／移出原 SQLite、WAL、SHM。

## 待確認事項

- [ ] Windows 業主現場安裝、隔離還原演練及簽收是否已完成？
- [ ] Issue #1 的舊 PostgreSQL／Vercel 部署任務是否應關閉、重新定義或保留歷史？
- [ ] 進一步多人存取與異地備份方案尚未確認；目前不得宣稱已提供。
