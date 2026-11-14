# 商場專櫃營運與招商決策戰情室 - 問題排查與修復日誌 (Issues Log)

> **專案名稱**：商場專櫃營運與招商決策戰情室 (Leasing Hub Dashboard)  
> **建立日期**：2026-09-21  
> **文件定位**：記錄開發、匯入、計算與部署過程中所遇 Bug、除錯過程、根因分析與最終修復方案。

---

## 🐛 問題排查與修復紀錄表

### Issue #001：代扣款開立(未稅) 匯入時欄位對照無反應與對不出來問題
* **發生日期**：2026-09-20
* **問題現象**：月結 Excel 匯入時，「代扣款開立(未稅)」欄位即便表格表頭名稱完全相同，仍無法自動映襯對齊。
* **根因分析**：
  1. `TARGET_COLUMNS` 中的正則表達式未脫敏半角括號 `(` `)`，導致正則比對失敗。
  2. 未包含全角括號 `（` `）` 及空格容錯。
* **修復方案**：
  - 更新 `Admin.html` 與 `Code.gs` 的映射字典，將括號改為可選轉義，並升級 `findValueInObject` 模糊搜尋函式，預先抹除贅詞與括號。

---

### Issue #002：Clasp Push 後正式環境 Web App 網址版本未更新（版本脫鉤）
* **發生日期**：2026-09-20
* **問題現象**：本地執行 `npx @google/clasp push` 成功後，開啟正式外網網址發現畫面與邏輯仍停留在舊版本。
* **根因分析**：
  - Clasp `push` 指令僅更新 Apps Script 的 `@HEAD` (開發最新版)，若未執行 `deploy` 指定 `--deploymentId`，正式 URL 指向的 Version 部署不會自動更新。
* **修復方案**：
  - 於 `PROJECT_HANDOVER.md` 與 `AGENTS.md` 建立標準部署 SOP，發布時必須統一執行：
    `npx @google/clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description "版本說明"`

---

### Issue #003：YoY 成長率將新進駐專櫃誤判為 +0.0% 零成長老專櫃
* **發生日期**：2026-09-19
* **問題現象**：剛進駐的新專櫃在去年無同期資料，原本邏輯直接歸零回傳 0，導致前端顯示 `+0.0%`，讓新櫃被誤認成零成長老櫃。
* **根因分析**：未將「無同期資料 (null)」與「真零成長 (0.0%)」進行狀態解耦。
* **修復方案**：
  - 拆分 `hasPriorData` 邏輯，若無同期資料則 `yoy = null`，前端呈現醒目青色 **`新進駐`** 標籤。

---

### Issue #004：Top 10 表格高度不足出現滾動條
* **發生日期**：2026-09-21
* **問題現象**：區間 Top 10 與實收 Top 10 表格在容器高 312px 時，第 10 筆資料會被遮擋，需要手動滑動。
* **修復方案**：
  - 將 `top-sales-view-table` 與 `top-rev-view-table` 的容器高度調整為 `365px`，使 10 筆資料完美展現。

---

### Issue #005：直連戰情室網址 (`?page=dashboard`) 跳過登入驗證並直接顯示資料
* **發生日期**：2026-11-13
* **問題現象**：未登入且無 `viewer` 帳號時，在瀏覽器直連 `?page=dashboard` 仍直接顯示「訪客 VIEWER」與完整營運數據。
* **根因分析**：
  1. **後端 API 無 Token 驗證**：`Code.gs` 之 `apiGetSyncData()` 未驗證 Session Token，且 `getSheetDataAsJson()` 未以底線結尾私有化而暴露給前端。
  2. **前端時序漏洞**：`Index.html` `window.onload` 同時平行呼叫 `checkDashboardAuth()` 與 `triggerRealSync()`，未等待驗證通過即拉取資料；HTML 預設寫死「訪客 / VIEWER」。
  3. **GAS 沙盒阻擋自動跳轉**：非使用者手勢觸發的 `window.top.location.href` 在 GAS iframe 內被瀏覽器安全機制擋掉，導致未能導回登入頁。
* **修復方案**：
  - **後端封堵 (`Code.gs`)**：`apiGetSyncData(token)` 強制執行 `validateToken(token)`；新增私有函式 `fetchSyncDataInternal_()` 供 `doPost`（通過 `APP_SHARED_SECRET` 後）與 `apiGetSyncData` 共用，並將 `getSheetDataAsJson` 改為私有函式 `getSheetDataAsJson_()`。
  - **前端閘門 (`Index.html`、`Admin.html`)**：移除預設「訪客 VIEWER」字樣；必須先通過 `validateToken(token)` 驗證成功後才呼叫 `triggerRealSync(token)` 或載入後台資料；未登入時維持全螢幕鎖定遮罩並提供手動「前往登入頁面」按鈕。
  - **跳轉容錯 (`Index.html`、`Admin.html`、`Login.html`、`ChangePwd.html`)**：`navigateTo()` 加上 `try/catch` 降級至 `window.location.href`。
