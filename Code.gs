/**
 * 商場專櫃營運與招商決策戰情室 - 後端服務 (Google Apps Script)
 */

function doGet(e) {
  // 渲染前端 Index.html
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('商場專櫃營運與招商決策戰情室 v1.3')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 取得當前登入使用者的 Email (供主管版權限校驗)
 */
function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch (err) {
    return "";
  }
}

/**
 * 安全後端讀取試算表（不需公開試算表權限即可供主管 Web App 使用）
 * @param {string} spreadsheetId 試算表 ID
 * @param {string} tabName 分頁名稱
 * @returns {Array<Object>} JSON 陣列
 */
function getSheetDataAsJson(spreadsheetId, tabName) {
  try {
    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      throw new Error(`找不到分頁: ${tabName}`);
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0].map(h => String(h).trim());
    const result = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // 忽略全空行
      if (row.every(cell => cell === "" || cell === null || cell === undefined)) continue;
      
      const item = {};
      headers.forEach((header, colIdx) => {
        item[header] = row[colIdx];
      });
      result.push(item);
    }

    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
