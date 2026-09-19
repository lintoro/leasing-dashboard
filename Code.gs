/**
 * 商場專櫃營運與招商決策戰情室 (Leasing Hub Dashboard) - 原生後端微服務
 * 
 * 遵循規格與資安原則：
 * 1. 零硬編碼金鑰：試算表 ID 與授權密鑰由 PropertiesService (腳本屬性) 集中託管。
 * 2. 雙向通訊支援：
 *    - 內部調用：google.script.run (Web App 內嵌時使用，免去 CORS 與網路外洩)
 *    - 外部調用：doPost (JSON-RPC / REST 網關，供地端 Vite 或外部主管端存取)
 * 3. 日期型別防錯：依據 AGENTS.md 守則，全域實作 normalizeYm 防止 Google Sheets Date 物件比對失效。
 */

// ==============================================================================
// 1. 網頁應用程式入口 (Web App Entry Point)
// ==============================================================================

function doGet(e) {
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('商場專櫃營運與招商決策戰情室 v1.3')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    return HtmlService.createHtmlOutput('<h2>戰情室載入失敗: ' + err.message + '</h2>');
  }
}

/**
 * 外部 API 網關 (支援跨域 POST 請求)
 */
function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    var action = payload.action || '';
    var clientSecret = payload.apiSecret || '';
    var serverSecret = getAppProperty('APP_SHARED_SECRET');

    // 若伺服器端已設定密鑰，則執行安全驗證
    if (serverSecret && clientSecret !== serverSecret) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: '未授權的 API 存取 (Invalid API Secret)'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getSyncData') {
      var data = apiGetSyncData();
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: '未知操作 (Unknown Action): ' + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================================================
// 2. 核心數據安全讀取服務 (Backend Data Provider)
// ==============================================================================

/**
 * 取得雲端試算表真實資料 (由後端代理讀取，前端與網路封包中 0 外洩試算表 ID)
 */
function apiGetSyncData() {
  var userEmail = getCurrentUserEmail();
  var sheetId = getAppProperty('SPREADSHEET_ID');
  
  if (!sheetId) {
    throw new Error('尚未在 GAS 腳本屬性 (Script Properties) 中設定 SPREADSHEET_ID');
  }

  var masterTab = getAppProperty('MASTER_TAB') || 'Store_Contract_Master';
  var rawTab = getAppProperty('RAW_TAB') || 'Monthly_Settlement_Raw';

  var masterResult = getSheetDataAsJson(sheetId, masterTab);
  var rawResult = getSheetDataAsJson(sheetId, rawTab);

  if (!masterResult.success) throw new Error('專櫃主檔讀取失敗: ' + masterResult.error);
  if (!rawResult.success) throw new Error('月結資料讀取失敗: ' + rawResult.error);

  return {
    success: true,
    userEmail: userEmail,
    masterRows: masterResult.data,
    rawRows: rawResult.data
  };
}

/**
 * 讀取試算表並轉換為 JSON 陣列
 */
function getSheetDataAsJson(spreadsheetId, tabName) {
  try {
    var ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      throw new Error('找不到指定分頁: ' + tabName);
    }

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: true, data: [] };

    var headers = data[0].map(function(h) { return String(h).trim(); });
    var result = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var isEmpty = true;
      for (var k = 0; k < row.length; k++) {
        if (row[k] !== '' && row[k] !== null && row[k] !== undefined) {
          isEmpty = false;
          break;
        }
      }
      if (isEmpty) continue;

      var item = {};
      for (var col = 0; col < headers.length; col++) {
        var val = row[col];
        // 處理日期格式防錯
        if (val instanceof Date) {
          item[headers[col]] = Utilities.formatDate(val, 'GMT+8', 'yyyy-MM-dd');
        } else {
          item[headers[col]] = val;
        }
      }
      result.push(item);
    }

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==============================================================================
// 3. 資安與屬性管理工具 (Script Properties Manager)
// ==============================================================================

/**
 * 取得當前執行/登入使用者的 Email (供主管版權限校驗)
 */
function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

/**
 * 從 GAS 腳本屬性讀取值
 */
function getAppProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/**
 * 【管理員專用】：一鍵初始化腳本屬性 (在 GAS 編輯器中手動執行一次即可)
 * 執行後機密資訊將永久保存在 Google 雲端屬性中，代碼推送到 Git 也不會外洩！
 */
function setupInitialProperties(customSheetId, customSecret) {
  if (!customSheetId || !customSecret) {
    throw new Error('請提供完整參數，例如: setupInitialProperties("試算表ID", "API授權金鑰")');
  }

  PropertiesService.getScriptProperties().setProperties({
    'SPREADSHEET_ID': customSheetId.trim(),
    'APP_SHARED_SECRET': customSecret.trim(),
    'MASTER_TAB': 'Store_Contract_Master',
    'RAW_TAB': 'Monthly_Settlement_Raw'
  });

  Logger.log('✅ 腳本屬性初始化完成！SPREADSHEET_ID 與 APP_SHARED_SECRET 已安全綁定於雲端屬性。');
}

/**
 * 年月正規化輔助函式 (遵循 AGENTS.md 防錯守則)
 */
function normalizeYm(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'GMT+8', 'yyyyMM');
  var s = String(val).replace(/[-/]/g, '').trim();
  return s.length >= 6 ? s.slice(0, 6) : s;
}
