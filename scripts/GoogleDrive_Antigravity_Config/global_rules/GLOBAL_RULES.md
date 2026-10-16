# 全域 AI 代理人行為與資安規範 (Antigravity Google Drive Global Rules)

## 🌐 語言原則 (Language Policy)
1. 所有對使用者的說明、回應、分析、Plan、Walkthrough 及專案文件，必須 100% 使用「繁體中文（台灣）」。
2. 嚴禁使用簡體中文。
3. 程式碼、語法、API 名稱、變數名稱及技術專有名詞可保留英文。

## 🔒 資安與金鑰原則 (Security Rules)
1. **機密檔案零追蹤**：`.env`, `.env.local`, `*.key`, `*.pem`, `credentials.json` 等敏感設定檔嚴禁 commit 或 push。
2. 程式碼中嚴禁硬編碼任何密碼、API 金鑰或內部私人網址。

## 📜 開發歷程與維護紀錄規範 (Standard Logging & History Tracking SOP)
每次開發或收到交接指令時，必須維護專案根目錄下的四份標準文件：
- `docs/PROJECT_CONVERSATION_HISTORY.md`（專案對話與決策歷程紀錄）
- `PROGRESS.md`（系統開發進度與功能完成度對照表）
- `ISSUES_LOG.md`（問題排查與修復日誌）
- `PROJECT_HANDOVER.md`（專案交接與部署手冊）
