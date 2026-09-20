# 商場專櫃營運與招商決策戰情室 (Leasing Hub Dashboard)

> **專案版本**：V2.5 雙視角徹底對齊、5級決策處置與360度YTD趨勢圖完工版  
> **更新日期**：2026-09-21  
> **系統定位**：結合 Google Sheets 雲端資料庫與 Google Apps Script (GAS) Web App，為百貨商場營運處與招商處提供專櫃 KPI 監控、合約到期管線預警與 360 度招商決策支援。  
> **維運交接與指南**：請參閱專案根目錄之 [`PROJECT_HANDOVER.md`](file:///c:/Github/ReactApp/leasing-dashboard/PROJECT_HANDOVER.md)、[`OPERATION_MANUAL.md`](file:///c:/Github/ReactApp/leasing-dashboard/OPERATION_MANUAL.md) 與 [`docs/PROJECT_CONVERSATION_HISTORY.md`](file:///c:/Github/ReactApp/leasing-dashboard/docs/PROJECT_CONVERSATION_HISTORY.md)。

---

## 一、 系統架構與技術棧

| 層級 | 技術架構 | 規格說明 |
| :--- | :--- | :--- |
| **前端戰情室 (Frontend)** | Pure HTML5 + Tailwind CSS + Chart.js + Lucide Icons | 單頁應用程式 (SPA)，具備雙視角（專櫃/廠商）動態切換、360 度抽屜導覽與響應式網頁佈局。 |
| **後端微服務 (Backend)** | Google Apps Script (GAS) | 雙軌路由模式 (`doGet`), 支援 SHA-256 加鹽 Hash 密碼校驗、8 小時 Session Token 與高管身分驗證。 |
| **資料庫核心 (Database)** | Google Sheets (3 核心表) | `Store_Contract_Master` (專櫃主檔), `Monthly_Settlement_Raw` (月結紀錄), `Users` / `Session_Tokens` (權限存取)。 |
| **圖表與動態引擎 (Engine)** | Chart.js + Hash Map 高效索引 | 支援全表運算 $O(1)$ 取數、Top 10 排行榜、OCR 健康度分佈圖、趨勢折線圖與 360 度抽屜 YTD 走勢圖。 |

---

## 二、 各模組開發完成度現況 (100% 完工)

### 1. 認證、資安與人員權限管理 (Auth & Security) — 100%
- [x] **加鹽 SHA-256 密碼雜湊**：前端與後端徹底移除明文密碼存儲。
- [x] **Session Token 管理**：核發 8 小時有效期 Token，過期自動導回登入頁。
- [x] **5 次密碼錯誤鎖定**：帳號失敗達 5 次自動鎖定，需管理員解鎖。
- [x] **帳號申請與審核流程**：新用戶註冊進入 pending 狀態，由 Admin 核可並賦予 Admin/Viewer 角色。
- [x] **人員名冊管理頁面 (`Admin.html`)**：支援「現行同仁」與「停用同仁」分頁、一鍵解鎖與密碼重置。

### 2. 資料庫連接與月結 Excel 智慧匯入 (Data Pipeline) — 100%
- [x] **Google GViz JSONP 跨域通訊**：地端檔案免架 Server 即可 100% 跨域讀取 Google 試算表。
- [x] **雲端 GAS 後端代理**：正式外網模式下以部署者權限讀取，試算表可完全鎖死不對外公開。
- [x] **月結 Excel 智慧匯入 (`Admin.html`)**：
  - 支援複合雙列表頭自動合成（自動去除換行與多餘空格）。
  - 21 欄位智慧映射對照表，手風琴面板自動合閉/展開。
  - Upsert 防重複防跳空寫入技術（以 `專櫃編號_銷售年月` 為 SSOT 唯一鍵）。

### 3. 戰情室 KPI 監控與雙視角總表 (Dashboard & Master Table) — 100%
- [x] **核心 4 大 KPI 卡片**：總銷貨淨額 (GMV)、商場實質總收益、綜合租售比 (OCR%)、警戒專櫃數。
- [x] **專櫃 (Store) vs 廠商 (Vendor) 雙視角**：
  - 專櫃視角：呈現單櫃數據，表頭顯示「專櫃編號」與「專櫃名稱」。
  - 廠商視角：自動聚合同一廠商之坪數、銷貨、去年銷貨、收益與不足次數，表頭顯示「專櫃數」與「廠商名稱」。
- [x] **Top 10 排行榜與圖表切換**：區間銷貨 Top 10 與商場收益 Top 10 支援圖表/表格一鍵切換，容器高度優化至 365px 免拉動。
- [x] **合約到期管線 (Expiry Pipeline)**：納管 $-10 \le \text{天數} \le 90$ 天之專櫃，劃分 5 級視覺警示（深紅逾期、脈衝緊急、橘色關注、黃色提醒、藍色正常）。

### 4. 360 度招商決策抽屜 (360-Degree Decision Drawer) — 100%
- [x] **合約與銷貨明細展現**：完整展示合約起訖、抽成條件、保底金額、面積坪數與銷貨/抽成/保底補收/實質收益明細。
- [x] **廠商視角旗下專櫃子表格**：展開抽屜時自動渲染該廠商所屬之所有專櫃清單與個股績效。
- [x] **廠商視角 5 級實戰決策判定引擎**：
  - 🌟 **戰略核心**：設櫃數 $\ge 2$、Top 20% 營收、$OCR \le 18\%$ $\rightarrow$ 優先鞏固。
  - 🤝 **主力換約**：營運正常、最近到期 $\le 90$ 天 $\rightarrow$ 多櫃打包談。
  - ⚖️ **結構優化**：設櫃數 $\ge 2$ 且強弱櫃併存 $\rightarrow$ 強帶弱、汰弱留強。
  - ⚠️ **承壓協商**：平均 $OCR > 18\%$ 或多次包底不足 $\rightarrow$ 評估降保底或啟動替補。
  - 🚪 **屆期結案**：旗下專櫃均已到期退場 $\rightarrow$ 清算保證金與代扣款。
- [x] **頂部 YTD 動態折線圖**：
  - 支援 `[ 銷貨淨額 ]` ｜ `[ 商場收益 ]` 維度切換。
  - 今年實線 vs 去年虛線同期比對，自動適應年份推移（2026 vs 2025、2027 vs 2026）。
  - 已撤櫃專櫃/集團自動截斷至撤櫃月份。
