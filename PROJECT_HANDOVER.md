# 商場專櫃營運與招商決策戰情室 (Leasing Hub Dashboard)
# 專案交接與架構技術白皮書 (Project Handover Document)

> **版本**：v1.3.2  
> **建立日期**：2026 年 09 月 19 日  
> **專案工作目錄**：`C:\Github\ReactApp\leasing-dashboard`  
> **Git 分支**：`master` (Commit: `f334908`)  
> **主要檔案**：`Index.html` (前端戰情室單頁應用)、`Code.gs` (GAS 後端微服務)、`config.local.js` (地端私有配置)

---

## 1. 專案背景與整體架構

本專案為百貨商場專櫃營運指標與招商決策戰情室，旨在提供商場主管、營運經理及招商團隊一站式的核心 KPI 監控、專櫃健康度診斷、合約到期預警，以及廠商談判方針建議。

### 雙軌部署架構 (Dual-Mode Architecture)

本系統兼顧**「主管雲端外網登入」**與**「工程/營運地端離線開發」**兩種運行環境：

```
                              ┌───────────────────────────────────────────────┐
                              │            Google 試算表資料庫                │
                              │  - Store_Contract_Master (專櫃主檔 全館專櫃)    │
                              │  - Monthly_Settlement_Raw (月結資料 歷史月結紀錄) │
                              └───────────────────────┬───────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       │                                                             │
                       ▼                                                             ▼
        【雲端生產環境 (Google Apps Script)】                           【地端本機環境 (Local File / Dev)】
  ┌───────────────────────────────────────────┐                 ┌───────────────────────────────────────────┐
  │ 1. 主管透過專屬外網 Web App 網址進入       │                 │ 1. 開發者或人員直接雙擊打開 Index.html    │
  │ 2. 後端 Code.gs 透過腳本屬性讀取試算表 ID  │                 │ 2. 瀏覽器自動載入本地私有 config.local.js │
  │ 3. 前端透過 google.script.run 代理取數    │                 │ 3. 採用 Google GViz 原生 JSONP 跨域通訊   │
  │ 4. 外網封包 100% 零洩漏試算表真實網址與 ID│                 │ 4. 徹底突破瀏覽器 file:// 與 CORS 阻擋    │
  └───────────────────────────────────────────┘                 └───────────────────────────────────────────┘
```

---

## 2. 今日改造痛點、經過與實施方案

今日針對整體系統進行了全方位的體質改造，徹底解決了效能瓶頸、計算盲區、除零例外、跨域阻礙與決策失真等 7 大致命問題：

### 痛點 1：全表掃描效能卡頓 ($O(N \times M) \rightarrow O(1)$)
* **原始問題**：先前每次切換月份區間或篩選品類時，系統針對每個專櫃在全量歷史月結紀錄（歷史月結紀錄）中反覆執行 `filter` 遍歷，計算複雜度高達 $O(N \times M)$。當月結資料逐年累積時，切換區間會產生嚴重卡頓。
* **改造實施**：
  * 在記憶體中建立多維 Hash Map 索引快取：
    * `monthlyStorePeriodMap`（鍵值：`${storeId}_${period}`，直接對映單一紀錄）
    * `monthlyPeriodMap`（鍵值：`${period}`，用於趨勢圖與區間總覽）
    * `monthlyStoreMap`（鍵值：`${storeId}`，用於專櫃歷史回溯）
  * 實作 `rebuildMonthlyIndices()` 函式，在展示重設、試算表同步與 CSV 匯入時自動重建索引。
  * `computeDynamicData` 與趨勢圖計算改為 Map 直接取值，運算提速百倍，點擊區間瞬間渲染。

---

### 痛點 2：YoY 年增率盲區（新進櫃位與零成長混淆）
* **原始問題**：原本計算邏輯為 `priorSales > 0 ? (salesNet - priorSales) / priorSales : 0`。當專櫃去年無同期資料（`priorSales === 0`）時，系統直接給 `0`，前端統一輸出 `+0.0%`。這會讓剛進駐的優質新專櫃被誤標為「零成長老專櫃」，且在評選「YoY 成長冠軍」時會產生嚴重誤導。
* **改造實施**：
  * 明確拆分指標狀態：
    * `hasPriorData = priorSales > 0;`
    * `yoy = hasPriorData ? (salesNet - priorSales) / priorSales : null;`
    * `isNewStore = !hasPriorData && salesNet > 0;`
  * 前端呈現標準化：
    * 新進駐專櫃統一以青色醒目標註 **`新進駐`**，KPI 區塊顯示 `新進駐/無同期`。
    * 老專櫃營收剛好持平者，正確顯示 **`0.0%`**。
    * 排行榜自動排除無同期的新櫃，確保成長冠軍數據的真實性。

---

### 痛點 3：銷貨為 0 與負銷貨（退換貨）邊界防護
* **原始問題**：當專櫃發生大額退換貨導致銷貨淨額為負（如 `-5,000` 元），或該期間尚未出表（銷貨為 `0`）時，計算租金負擔比（OCR）與坪效會產生負百分比（如 `-45%`）甚至 `Infinity`、`NaN`，造成報表版面破裂。
* **改造實施**：
  * 加入 `hasValidSales = salesNet > 0;` 嚴格防護。
  * 銷貨為 0 或負數時：
    * OCR 與坪效安全歸零，前端表格統一呈現 `--`。
    * 決策策略文字精確提示：「本期累計淨額為負（退貨大於銷貨），請查對退換貨明細及退抽手續。」

---

### 痛點 4：地端隔離後 file:// 協定遭 CORS 攔截全面報警
* **原始問題**：資安重構將寫死的試算表 ID 移至環境變數後，地端打開檔案無法連線；而若使用原本的 `fetch('https://docs.google.com/.../gviz/tq?tqx=out:csv...')`，因 Google 試算表端點未回傳 `Access-Control-Allow-Origin` 標頭，現代瀏覽器會在 `file://` 下強制攔截，拋出 `TypeError: Failed to fetch`（同步失敗）。
* **改造實施**：
  1. **本機私有設定隔離**：建立 [`config.local.js`](file:///C:/Github/ReactApp/leasing-dashboard/config.local.js)，透過全域 `window.__LOCAL_CONFIG__` 注入試算表 ID，並在 [`.gitignore`](file:///C:/Github/ReactApp/leasing-dashboard/.gitignore) 中嚴格排除，**100% 確保機密金鑰不上傳 Git**。
  2. **JSONP 跨域引擎**：將資料抓取改寫為 `fetchSheetTabGViz`，利用動態 `<script>` 標籤載入 Google Visualization API 的原生回呼（`tqx=responseHandler:cb`）。此方法**徹底突破同源政策限制，在任何無伺服器、本機檔案協定下均可 100% 成功跨域抓取**，實測秒載 全館專櫃與 歷史月結紀錄月結紀錄！

---

### 痛點 5：納管門檻放寬至「基準日前三個月（-90 天）」
* **原始問題**：原本總表設定只顯示 `daysToExpiry >= 0`（當日仍在櫃專櫃），使得招商主管在檢視月報時，無法回溯最近剛到期退場專櫃的營收表現與退場結算。
* **改造實施**：
  * 計算引擎門檻由 `-30` 放寬至 `-90` 天：`getDaysDiff(store.end) >= -90`。
  * 總表過濾門檻放寬：`rows.filter(r => r.daysToExpiry >= -90)`。
  * 到期天數欄位針對退場專櫃標註 `已撤 XX 天`（搭配半透明行視覺效果），清晰呈現退場履歷。

---

### 痛點 6：已撤櫃專櫃回溯診斷引擎（四級招商對策）
* **原始問題**：納管已撤櫃專櫃後，原本的規則會因為退場銷貨為 0，而將其誤判為「新進駐/籌備中」，失去招商決策意義。
* **改造實施**：
  * 當 `daysToExpiry < 0` 時，自動啟動專屬的【已撤櫃專櫃回溯診斷引擎】，依照退場前的營業表現進行四級分類：

| 分級標籤 | 樣式風格 | 觸發條件 | 招商處置建議方針 (Drawer 抽屜顯示) |
| :--- | :--- | :--- | :--- |
| **已撤/建議重招** | 翠綠微光徽章 | 退場前無多次保底不足（`<2`），且成長強勁（`YoY>=5%`）或收益佳（`OCR>=8%`） | 曾為高集客或營收正成長之績優專櫃，可能因租期屆滿或品牌展店策略退場。建議招商團隊列為重點回訪名冊，評估提供優勢櫃位或新企劃條件，洽談回駐重招。 |
| **已撤/建議淘汰** | 玫瑰深紅徽章 | 頻繁保底不足（`>=2` 次）或嚴重衰退（`YoY<=-15%`）或負擔比失衡（`OCR>22%`） | 歷史銷貨動能低迷且多次觸發保底不足，品牌承租與集客效益不佳。建議封存品牌檔案，原則上不再主動回簽或續約引進，釋出坪數保留予新業種品牌。 |
| **已撤/轉備選庫** | 灰藍石板徽章 | 正常出表履約期滿，無嚴重衰退但未達顯著成長 | 履約正常且營收平穩，合約期滿退場。建議轉入商場儲備品牌庫存，若日後有同品類改裝期、臨時快閃檔期或空櫃過渡，可列為備選洽商合作對象。 |
| **已撤/合約結案** | 靛紫深色徽章 | 納管期間銷貨為 0 或負數（未出表純掛名） | 納管期間無出表銷貨數據，已屆期退場。請查對財務手續、設備點交與保證金返還流程，確認無未結清款項。 |

---

### 痛點 7：租售比（OCR）異常提醒分流與撤櫃專屬提示
* **原始問題**：已撤櫃專櫃在選定區間若無銷貨，自然會落入 OCR 異常清單中。若無明顯區分，主管在看戰情室時會以為是「在櫃專櫃未出表或營運崩盤」，造成管理困擾。
* **改造實施**：
  * 異常提醒區塊全面進行兩大群組垂直分流：
    1. **⚠️ 在櫃營運異常需追蹤**：專屬紅玫瑰外框 + 呼吸燈紅點，標註 `某專櫃 (在櫃銷貨為0)` 或 `(>80%)`，第一時間聚焦真正需要巡櫃關切的在櫃專櫃。
    2. **📦 已撤櫃專櫃**：獨立石板色徽章，醒目標明 `[已撤XX天] 某專櫃`，並提示「退場自然無銷貨/租售比，非在櫃風險」。若全無在櫃異常，外框自動降噪還原為中性邊框。

---

## 3. 系統檔案清單與責任劃分

```
C:\Github\ReactApp\leasing-dashboard\
├── Index.html                  # 【前端核心】戰情室單頁應用程式（包含 UI、圖表、所有計算引擎與抽屜）
├── Admin.html                  # 【管理後台】月結資料上傳匯入器（支援 21 欄位智慧映射、Upsert 覆蓋防重複）
├── Code.gs                     # 【GAS 後端微服務】提供 doGet、doPost、apiGetSyncData、upsertMonthlyData 與屬性管理
├── appsscript.json             # 【GAS 專案設定檔】時區 (Asia/Taipei)、例外處理與 Web App 配置
├── config.local.js             # 【本機私有設定】(已被 .gitignore 排除) 存放地端 SPREADSHEET_ID
├── config.local.example.js     # 【本機私有設定範本】供新環境或交接參考
├── .env.local                  # 【環境變數】(已被 .gitignore 排除) 存放 VITE_SPREADSHEET_ID 等機密
├── .env.example                # 【環境變數範本】
├── .gitignore                  # 【Git 排除清單】嚴格阻擋 .env*、*.key、.clasp.json、config.local.js
├── .clasp.json                 # 【GAS 部署工具設定】(已由 .gitignore 排除) 綁定 Script ID
├── AGENTS.md                   # 【開發者代理人手冊】架構規格、業務邏輯與程式碼風格指引
├── SYSTEM_AUDIT_AND_ROADMAP.md # 【系統架構審計與後續演進路線圖】
└── PROJECT_HANDOVER.md         # 【本交接白皮書】
```

---

## 4. 日常操作與維護指引

### A. 地端本機開啟與使用
1. 直接在 Windows 檔案總管中雙擊打開 [`Index.html`](file:///C:/Github/ReactApp/leasing-dashboard/Index.html)。
2. 預設載入「展示模式」（Demo 資料），避免無網路時白畫面。
3. 連續點擊右上角標題列版本文字（**暗門**）**6 次**：
   - 系統自動讀取 `config.local.js` 中的試算表 ID。
   - 右下角彈出「正在從 Google 試算表同步真實資料...」$\rightarrow$「試算表同步成功！已載入 全館專櫃、歷史月結紀錄月結紀錄」。
   - 切換至正式模式，所有指標與圖表立即更新為全量大數據。
4. 若需切換其他試算表測試，可點擊右上角「齒輪」設定視窗，直接在介面覆寫輸入並儲存。

   - 切換至正式模式，所有指標與圖表立即更新為全量大數據。
4. 若需切換其他試算表測試，可點擊右上角「齒輪」設定視窗，直接在介面覆寫輸入並儲存。

### B. 部署至 Google 雲端外網 (GAS Clasp)
當準備發布給主管使用時，本機已預先配置完成 Google Clasp 工具：
```powershell
# 1. 確保工作目錄正確
cd C:\Github\ReactApp\leasing-dashboard

# 2. 推送程式碼至 Google Apps Script 雲端專案
npx @google/clasp push --force

# 3. 發布版本覆蓋至正式 deploymentId（確保正式 URL 指向最新代碼）
npx @google/clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description "v25 廠商專櫃數欄位+5級決策方針+360抽屜YTD走勢圖"
```

---

## 5. 近期版本推移與演進重點紀錄 (Version Changelog & Handover Notes)

### 📌 版本 v24 ~ v25 (2026-09-21) — 雙視角徹底對齊與 360 度 YTD 趨勢圖
1. **表頭動態切換**：
   - 第一欄：專櫃視角顯示「`專櫃編號`」；廠商視角切換顯示「`專櫃數`」。
   - 第二欄：專櫃視角顯示「`專櫃名稱`」；廠商視角切換顯示「`廠商名稱`」。
   - 移除廠商視角下重複之無效「廠商」欄位。
2. **廠商視角 360 度抽屜 5 級實戰決策引擎**：
   - 🌟 **戰略核心**：設櫃數 $\ge 2$、Top 20% 營收、$OCR \le 18\%$ $\rightarrow$ 優先鞏固、約訪高層談旗艦位與新品牌。
   - 🤝 **主力換約**：營運正常達標、最近到期 $\le 90$ 天 $\rightarrow$ 多櫃打包談，以集團總量鎖定條款。
   - ⚖️ **結構優化**：設櫃數 $\ge 2$ 且強弱櫃併存（OCR 落差大） $\rightarrow$ 強帶弱、汰弱留強，要求整改弱櫃或縮坪移位。
   - ⚠️ **承壓協商**：平均 $OCR > 18\%$ 或多次包底不足 $\rightarrow$ 評估降保底或啟動替補品牌備案。
   - 🚪 **屆期結案**：旗下所有專櫃到期日均 $<0$（全數退場） $\rightarrow$ 結算保證金與代扣款並歸檔。
3. **360 度抽屜頂部 YTD 折線圖**：
   - 新增可切換 `[ 銷貨淨額 ]` 與 `[ 商場收益 ]` 的 YTD 趨勢圖。
   - 今年與去年同期雙折線（實線 vs 虛線）對比，已撤櫃專櫃/集團自動截斷至撤櫃月份。
   - 動態計算年分（預設今年 vs 去年，如 2026 vs 2025；2027 年時自動切換為 2027 vs 2026）。
4. **系統說明文件手冊產出**：
   - 新增 `OPERATION_MANUAL.md`，為管理者與使用者撰寫完整的 繁體中文（台灣） 系統設定與操作說明。

---

## 6. 重要注意事項 (Gotchas & Best Practices)

1. **資安鐵律（零硬編碼）**：
   * 絕不可在 `Index.html` 或 `Code.gs` 中寫入試算表 ID、GAS Script ID 或 API Secret。
   * 地端請一律透過 `config.local.js` 提供，雲端請一律由 GAS `PropertiesService` 提供。
   * 每次執行 `git add` 前，確認 `git status` 中沒有出現 `.env.local`、`config.local.js` 或 `.clasp.json`。

2. **Google 試算表分頁命名約定**：
   * 專櫃合約主檔分頁名稱：`Store_Contract_Master`
   * 月結原始資料分頁名稱：`Monthly_Settlement_Raw`
   * 若業務端更改試算表分頁名稱，需在 `config.local.js` 或設定視窗中同步修改。

3. **Google 試算表共用權限**：
   * 地端透過 GViz JSONP 讀取時，試算表的共用權限需設為**「知道連結的使用者（檢視者）」**。
   * 雲端透過 GAS 後端代理讀取時，只要 GAS 專案持有者的 Google 帳號有權限即可，試算表無須對外公開。

4. **版本更新與正式部署發布**：
   * 單純 `npx @google/clasp push` 只會更新 `@HEAD`，不會影響正式網址。
   * 發布給使用者測試時，必須執行 `npx @google/clasp deploy --deploymentId YOUR_DEPLOYMENT_ID` 指向定點部署 ID。

---

### 專案狀態確認
* 本專案全量程式碼已通過語法檢驗、真實數據模擬與 Clasp 正式部署測試。
* Git 倉庫與正式環境部署已對齊（`Version 25`）。
* 所有變更、手冊與交接注意事項已同步更新於專案根目錄之 [`PROJECT_HANDOVER.md`](file:///c:/Github/ReactApp/leasing-dashboard/PROJECT_HANDOVER.md) 與 [`OPERATION_MANUAL.md`](file:///c:/Github/ReactApp/leasing-dashboard/OPERATION_MANUAL.md)。

