# Backlog

> 類型：Accepted deferred work 與已存在的後續規劃。不得為填滿清單自行創造新功能。

## Accepted Items

| ID | 優先度 | 狀態 | 項目 | 為何延後 | 完成條件 | 相依／證據 |
| --- | --- | --- | --- | --- | --- | --- |
| BL-001 | 交付必要（非推定 P1） | Ready／待現場執行 | 業主 Windows 實機首次安裝、SQLite 持久保存、站內備份與隔離還原演練、外部第二份備份、簽收 | Hosted CI 不等於客戶電腦的 NTFS、流程與還原成功 | 依手冊「交付簽收檢查」完成並記錄實機版本、安裝、備份、還原結果 | `docs/業主部署操作手冊.md`、PR #6 |

## Candidate Ideas／既有但未另獲執行授權的規劃

下列源自 `README.md` 的「後續規劃」，不是本次初始化新提案；優先順序、時程與實作承諾均待確認。

| ID | 構想 | 完成條件須先確認 | 來源 |
| --- | --- | --- | --- |
| BC-001 | 成本預算與實際成本區分、採購／工時來源、完整性標記 | 成本資料模型與財務邏輯的需求範圍 | `README.md` |
| BC-002 | 報價版本、轉正式訂單、追加減、應收帳齡 | 版本與核准程序、既有估價單相容性 | `README.md` |
| BC-003 | 多員工、角色、操作稽核 | 安全、登入／權限與架構選型 | `README.md` |
| BC-004 | 異地備份與固定主機端到端瀏覽器驗收 | 外部儲存方式、交付環境與客戶授權 | `README.md`、`docs/業主部署操作手冊.md` |

## 外部追蹤協調

- [Issue #1](https://github.com/hun186/plumber-business-poc/issues/1) 仍 Open，但其 PostgreSQL 方案已不符合現行程式；先確認處置，不把其中勾選項當作已接受新需求（參見 `known_issues.md` KI-001）。
- [Issue #2](https://github.com/hun186/plumber-business-poc/issues/2) 已 Closed，SQLite／Excel 的已完成部分不再當未完成 backlog。

## 收錄規則

- Accepted 項需使用者接受、交付必要或已有可檢證承諾；Candidate 不能當成「已排入開發」。
- 任務開始前先比對最新程式、Issue 與 PR，避免重複實作已完成的功能。
