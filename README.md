# 水電好管家｜Plumber Business PoC

繁體中文水電業務管理系統，適用個人水電師傅、小型承攬商的 PoC 展示。使用 Vercel 靜態網站與 Serverless Functions，資料庫模式使用 PostgreSQL。

## 已提供功能

- 營運儀表板：案件數、商機預估金額、已收款／尚未收款、估價與收款趨勢、案件狀態分布。
- 客戶：新增、編輯、搜尋、聯絡資訊與地址。
- 工程案件：新增、編輯、工程分類、狀態、日期、預估金額與客戶關聯。
- 估價單：多工項、單位數量、單價、營業稅率（預設 5%）、金額加總、列印／由瀏覽器另存 PDF、狀態追蹤。
- 收款：新增收款紀錄（包含訂金、分期）、關聯工程、未收款估算。
- RWD 響應式設計，桌機／手機皆可操作。

## 示範模式與真正資料庫模式

**沒有環境變數時：** 可立即試用；預載的客戶、工程及估價單都是虛構案例。新增與編輯儲存在當前瀏覽器的 `localStorage`，不同裝置、瀏覽器、使用者不會同步。請勿輸入真實客戶個資。

**同時設定 `DATABASE_URL`、`APP_ADMIN_PASSWORD`、`AUTH_SECRET` 時：** `/api/status` 顯示 `database`，頁面要求管理密碼；所有資料透過驗證過的 API 儲存到 PostgreSQL，共用資料且不在瀏覽器保存業務資料。須先執行 `db/schema.sql` 建表。資料庫模式預設是空資料庫，不會匯入虛構客戶。

**PoC 限制：** 單一管理員密碼而非正式多帳號權限；尚未支援施工照片、成本／材料庫存、進銷項及發票串接、變更估價版本、正式審計紀錄、定期備份。正式商用前應加入 RBAC、帳號審核、登入速率限制、CSRF 強化、資料加密及個資保護、備份與還原驗證。

## 部署（Vercel）

1. 在 GitHub 建立一個私人儲存庫，將本專案檔案推送至 `main`。
2. 在 Vercel 匯入該 GitHub repo：`Other` Framework Preset，根目錄為 `/`，不需 Build Command；`api/*.js` 會自動作為 Node.js Functions 部署。
3. 不設定環境變數也可先看 PoC 示範介面。
4. 要啟用多人共用資料，建立可供 Vercel 連接的 PostgreSQL，執行 `db/schema.sql`，到 Vercel Project Settings → Environment Variables 設定上述三個值，重新部署。
5. 確認 `/api/status` 回傳 `{"mode":"database"}`，以管理密碼登入，再試新增客戶、工程、估價單與收款。

## 本機預覽

- 靜態示範模式：`python -m http.server 8080`，瀏覽 http://localhost:8080 。
- 含 API 的部署測試：安裝 Vercel CLI，`npm install`，再執行 `vercel dev`（需要已連線的 Vercel 專案）。
- 程式語法檢查：`npm run check`。

## 優先規劃（第二階段）

1. 工程日曆與派工、師傅工時、施工照片與附件。
2. 估價單樣板、版本、轉工程合約、業主簽收與手機 PDF。
3. 材料／人力成本、案件毛利、應收帳齡與催收。
4. 員工帳號及角色權限、操作稽核與備份。

> 本專案為原型，不可在未完成安全強化前放入真實客戶資料。
