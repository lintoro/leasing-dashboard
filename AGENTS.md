# 專案 Agent 行為與資安守則 (Project Rules & Security Principles)
# 專案名稱：商場專櫃營運與招商決策戰情室 (Leasing Hub Dashboard)

## 核心資安守則 (Strict Security Policy)
1. **機密檔案零追蹤**：`.env`, `.env.*`, `*.key`, `credentials.json` 等敏感設定檔嚴禁納入 Git 追蹤或推送到公開庫。
2. **Git Commit 防護**：執行任何版控提交前，必須檢查 `git ls-files` 確保無任何敏感檔案、內部財務資訊或個資被誤加。
3. **無硬編碼金鑰與密碼**：程式碼中嚴禁硬編碼任何密碼、API 金鑰或內部機密試算表網址。
4. **語言規範**：所有對使用者的說明、計畫、文件與產出必須遵守「繁體中文（台灣）」語言原則。

## 版控與發布節奏守則 (Git Push & Clasp Deployment Timing)
- **平時地端作業**：單項功能完成或局部調校時，地端作業即可，不需要每次都頻繁推送。
- **限定推送與發布時機**：
  1. **階段性任務完成/交接時**：完成主要功能開發並通過測試後，統一執行資安檢查、Commit 與推送。
  2. **使用者明確下達發布/部署指令時**：依使用者指示執行推送或 Google Apps Script 雲端發布。

---

## ⚡ 核心商業邏輯與架構防錯守則 (Critical Lessons Learned & Error Prevention)

本專案為商場（百貨/購物中心）招商處 (Leasing) 與營運處 (Operations) 之核心決策系統，整合 Google Sheets 雲端資料庫與 Google Apps Script (GAS) Web App。所有 Agent 與協同開發人員**必須嚴格遵守**下列防錯規範：

### 1. 商場實質收益與平帳防沖銷鐵律 (Revenue Calculation & Reconciliation Safety)
- **收益計算定義 (SSOT)**：
  $$\text{商場實質總收益 (realMallRevenue)} = \text{抽成額合計 (commTotal)} + \text{保底抽成不足補收額 (minShortage)}$$
- **平帳防呆機制**：
  - 資料庫欄位中「不足次數」與「差額補收金額」常因手動填表或匯出格式顛倒（例如金額欄位填入次數 1~2 次，而不足金額被置於其他欄）。
  - 代碼中必須維持次數與金額自動檢測與平帳判定，嚴禁移除該容錯保護。
  - 當月結資料無記錄時，應標記為「新進駐/籌備中」，不可誤判為衰退或嚴重虧損。

### 2. 綜合租售比 (OCR%) 健康指標與異常警示閾值
- **定義**：$\text{OCR} = \frac{\text{商場實質收益}}{\text{區間銷貨淨額}}$
- **健康度閥值標準**：
  - **健康**：$OCR \le 18\%$（專櫃營業額足以支撐商場租金抽成）。
  - **警戒**：$OCR > 18\%$（廠商抽成負擔過重，存在撤櫃或經營困難風險）。
  - **特殊異常**：$OCR \le 0\%$（無收益）或 $OCR > 80\%$（可能為純保底補足或銷貨未申報），需觸發 Badges 提醒專人稽核。

### 3. 合約到期與續約管線 (Expiry Pipeline) 計算準則
- **基準日原則**：
  - 預設展示模式以 `2025-01-01` 為基準日；正式模式以系統當日 `new Date()` 為基準日。
  - 天數計算一律使用 `Math.ceil((targetDate - compareDate) / (1000 * 60 * 60 * 24))`。
- **管線納管區間**：$-10 \le \text{到期天數} \le 90$ 天。
  - $< 0$ 天：逾期警示（深紅）。
  - $< 10$ 天：緊急剩餘（紅色脈衝動畫）。
  - $< 30$ 天：橘色關注。
  - $< 60$ 天：黃色提醒。
  - $< 90$ 天：藍色正常推進。

### 4. 專櫃 (Store) vs 廠商/集團 (Vendor) 雙視角聚合守則
- 當切換至「廠商」視角時：
  - 必須將同廠商的所有專櫃（坪數、銷貨、去年銷貨、收益、不足次數）完整加總。
  - 到期天數應取所屬專櫃之**最小剩餘天數（最快到期者）**，確保招商人員掌握最早換約窗口。
  - 抽屜（Drawer）展開時，必須提供「所屬專櫃清單」子表格，以利集團級別談判。

### 5. Google Sheets 日期與年月正規化 (Date & Period Normalization)
- **陷阱**：Google Sheets 會自動將 `202501` 或 `2025-01` 辨識轉為 Date 物件。
- **防錯規範**：
  - 後端 `Code.gs` 與前端解析必須有統一的 `normalizeYm(val)`，去除連字號與斜線，標準化為 `YYYYMM` 格式進行比對。
  - 專櫃 ID 必須透過 `normalizeId()` 保留前置零（如 `00008`），避免數字轉換造成 Join 鍵值失效。

### 6. Google Apps Script Web App 與主管身分認證 (Manager Authorization)
- **後端存取安全**：
  - 試算表資料應優先由 GAS 後端以 `SpreadsheetApp` 讀取，並透過 `Session.getActiveUser().getEmail()` 驗證主管 Email。
  - 嚴禁強迫使用者將內部財務試算表開啟對外公開權限。
- **Clasp 自動發布支援**：
  - 本地已配置 `.clasp.json`，支援使用 `npx @google/clasp push` 直接推送更新。
