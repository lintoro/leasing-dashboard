# Google Apps Script 雲端部署防錯守則 (GAS Deployment Notice)

## 核心部署原則
1. **本地與雲端一致性**：
   - 本地 `Index.html`、`Code.gs` 與 `appsscript.json` 為真實資料來源（SSOT）。
   - 支援透過 `npx @google/clasp push` 一鍵推送到 Google Apps Script 雲端。
2. **語法與 AST 完整性檢查**：
   - 每次推送或部署前，必須確認程式碼語法完整無中斷、花括號閉合無誤。
3. **Web App 跨網域通訊與 iframe 限制**：
   - Google Apps Script Web App 若以 iframe 嵌入，需設定 `XFrameOptionsMode.ALLOWALL`。
   - 前後端通訊優先使用 `google.script.run`，免除跨域 CORS 與 302 重新導向失敗問題。
