# 嚴格資安守則 (Strict Security Policy)

1. **機密檔案零追蹤**：
   - 任何環境變數檔（如 `.env`, `.env.*`）、金鑰憑證（`*.pem`, `*.key`）及 Google 帳號憑證（`credentials.json`）絕對嚴禁納入 Git 追蹤。
2. **無硬編碼機密**：
   - 程式碼中嚴禁硬編碼任何密碼、私密 API Key 或內部 Google 試算表私密識別碼。
   - 所有權限與機密值應透過 Google Apps Script 腳本屬性（`PropertiesService.getScriptProperties()`）或安全的授權會話（`Session.getActiveUser()`）取得。
3. **資料庫保護**：
   - 商業機密資料（專櫃營收、租約條款、保底金額）嚴禁任意對外公開，後端服務必須做好主管身分驗證。
