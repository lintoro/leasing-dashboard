/**
 * 商場專櫃營運與招商決策戰情室 (Leasing Hub WebApp) - 原生後端核心微服務
 * 
 * 核心功能架構：
 * 1. 頁面路由：doGet 支援多頁面 WebApp 導向 (?page=login|register|pending|changepwd|admin|dashboard)
 * 2. 帳號與自訂認證：工號+密碼、SHA-256 加鹽雜湊、Session Token (8小時)、5次失敗防爆破鎖定
 * 3. 審核流程：使用者線上申請、管理員核可並配發預設密碼 "000000"、初次登入強制改密碼、管理員一鍵解鎖並重置密碼
 * 4. 資料庫維護：
 *    - Monthly_Settlement_Raw: 支援上傳 Excel 增量 Upsert (專櫃編號+銷售年月為複合鍵)
 *    - Store_Contract_Master: 線上主檔查詢與編輯 CRUD
 * 5. 安全守則：零硬編碼機密、Google Sheets 自動維護 User_Access 與 Session_Tokens 分頁
 */

// ==============================================================================
// 1. 網頁應用程式入口與多頁面路由 (Web App Entry Point & Router)
// ==============================================================================

function doGet(e) {
  try {
    var page = (e && e.parameter && e.parameter.page) ? String(e.parameter.page).toLowerCase() : 'login';
    
    // 初始化確保資料庫分頁齊全
    ensureAuthSheetsExist();

    var templateFile = 'Index';
    var pageTitle = '商場專櫃營運與招商決策戰情室';

    switch (page) {
      case 'login':
        templateFile = 'Login';
        pageTitle = '系統登入 | 專櫃營運與招商戰情室';
        break;
      case 'register':
        templateFile = 'Register';
        pageTitle = '帳號申請 | 專櫃營運與招商戰情室';
        break;
      case 'pending':
        templateFile = 'Pending';
        pageTitle = '審核中 | 專櫃營運與招商戰情室';
        break;
      case 'changepwd':
        templateFile = 'ChangePwd';
        pageTitle = '變更密碼 | 專櫃營運與招商戰情室';
        break;
      case 'admin':
        templateFile = 'Admin';
        pageTitle = '系統管理後台 | 專櫃營運與招商戰情室';
        break;
      case 'dashboard':
      default:
        templateFile = 'Index';
        pageTitle = '商場專櫃營運與招商決策戰情室 v2.0';
        break;
    }

    return HtmlService.createHtmlOutputFromFile(templateFile)
      .setTitle(pageTitle)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  } catch (err) {
    return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;padding:24px;color:#e11d48;"><h2>頁面載入失敗: ' + err.message + '</h2><p>請檢查 GAS 檔案清單是否已完整部署。</p></div>');
  }
}

/**
 * 取得當前 Web App 的公開部屬 URL，提供前端換頁使用
 */
function getScriptUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return '';
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
      var data = fetchSyncDataInternal_();
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
// 2. 資料庫安全結構與自動初始化 (Schema & Initialization)
// ==============================================================================

var USER_TAB_NAME = 'User_Access';
var SESSION_TAB_NAME = 'Session_Tokens';

var USER_HEADERS = [
  'emp_id', 'name', 'department', 'email', 'reason', 'role', 
  'status', 'pwd_hash', 'pwd_salt', 'force_change_pwd', 
  'login_fail_count', 'locked', 'last_login_at', 'pwd_changed_at', 
  'applied_at', 'reviewed_at', 'reviewed_by'
];

var SESSION_HEADERS = [
  'token', 'emp_id', 'role', 'name', 'created_at', 'expires_at'
];

/**
 * 自動檢查並建立 User_Access 與 Session_Tokens 分頁
 */
function ensureAuthSheetsExist() {
  var sheetId = getAppProperty('SPREADSHEET_ID');
  if (!sheetId) return;

  var ss = SpreadsheetApp.openById(sheetId);
  
  // 1. User_Access
  var userSheet = ss.getSheetByName(USER_TAB_NAME);
  if (!userSheet) {
    userSheet = ss.insertSheet(USER_TAB_NAME);
    userSheet.appendRow(USER_HEADERS);
    userSheet.getRange(1, 1, 1, USER_HEADERS.length).setFontWeight('bold').setBackground('#1E2761').setFontColor('#CADCFC');
  }

  // 2. Session_Tokens
  var sessionSheet = ss.getSheetByName(SESSION_TAB_NAME);
  if (!sessionSheet) {
    sessionSheet = ss.insertSheet(SESSION_TAB_NAME);
    sessionSheet.appendRow(SESSION_HEADERS);
    sessionSheet.getRange(1, 1, 1, SESSION_HEADERS.length).setFontWeight('bold').setBackground('#1E2761').setFontColor('#CADCFC');
  }
}

/**
 * 取得試算表物件
 */
function getSpreadsheet() {
  var sheetId = getAppProperty('SPREADSHEET_ID');
  if (!sheetId) {
    throw new Error('尚未在 GAS 腳本屬性中設定 SPREADSHEET_ID');
  }
  return SpreadsheetApp.openById(sheetId);
}

// ==============================================================================
// 3. 雜湊密碼與 Token 工具 (Security Utilities)
// ==============================================================================

/**
 * SHA-256 加鹽雜湊 (輸出 64 碼 Hex)
 */
function hashPassword(salt, password) {
  var raw = salt + '::' + String(password);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    var byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = '0' + byteHex;
    hex += byteHex;
  }
  return hex;
}

/**
 * 生成 16 碼隨機 Salt
 */
function generateSalt() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 16);
}

/**
 * 工號正規化 (去空白、統一轉大寫)
 */
function normalizeEmpId(empId) {
  if (!empId) return '';
  return String(empId).trim().toUpperCase();
}

// ==============================================================================
// 4. 使用者認證與權限管理 (Auth & Session Service)
// ==============================================================================

/**
 * 使用者登入
 * @param {string} empId 工號
 * @param {string} password 密碼
 * @returns {object} 結果與 Token
 */
function gasLogin(empId, password) {
  try {
    var cleanId = normalizeEmpId(empId);
    var cleanPwd = String(password || '').trim();

    if (!cleanId || !cleanPwd) {
      return { success: false, message: '請輸入工號與密碼' };
    }

    ensureAuthSheetsExist();
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return { success: false, message: '系統中尚無帳號資料，請先提交申請或聯繫管理員' };
    }

    var headers = data[0].map(function(h) { return String(h).trim(); });
    var empCol = headers.indexOf('emp_id');
    var statusCol = headers.indexOf('status');
    var hashCol = headers.indexOf('pwd_hash');
    var saltCol = headers.indexOf('pwd_salt');
    var lockCol = headers.indexOf('locked');
    var failCol = headers.indexOf('login_fail_count');
    var forceCol = headers.indexOf('force_change_pwd');
    var roleCol = headers.indexOf('role');
    var nameCol = headers.indexOf('name');
    var lastLoginCol = headers.indexOf('last_login_at');

    var userRowIdx = -1;
    var user = null;

    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === cleanId) {
        userRowIdx = i + 1; // 1-indexed for Sheet API
        user = {};
        for (var c = 0; c < headers.length; c++) {
          user[headers[c]] = data[i][c];
        }
        break;
      }
    }

    if (!user) {
      return { success: false, message: '工號或密碼錯誤' };
    }

    var status = String(user.status || '').toLowerCase();
    if (status === 'pending') {
      return { success: false, message: '您的帳號申請正在審核中，請靜候管理員核可。' };
    }
    if (status === 'rejected') {
      return { success: false, message: '您的帳號申請已被駁回，請聯繫管理員。' };
    }
    if (status === 'disabled') {
      return { success: false, message: '此帳號已被停用，請聯繫系統管理員。' };
    }

    // 檢查是否鎖定
    var isLocked = user.locked === true || String(user.locked).toUpperCase() === 'TRUE';
    if (isLocked) {
      return { success: false, message: '帳號因連續登入失敗已被鎖定！請聯繫管理員協助解鎖。' };
    }

    // 密碼比對
    var inputHash = hashPassword(user.pwd_salt || '', cleanPwd);
    if (inputHash !== user.pwd_hash) {
      // 累加失敗計數
      var failCount = (parseInt(user.login_fail_count, 10) || 0) + 1;
      var willLock = failCount >= 5;
      
      sheet.getRange(userRowIdx, failCol + 1).setValue(failCount);
      if (willLock) {
        sheet.getRange(userRowIdx, lockCol + 1).setValue(true);
        return { success: false, message: '密碼錯誤達 5 次，帳號已被鎖定！請聯繫管理員解鎖。' };
      } else {
        return { success: false, message: '密碼錯誤（尚可嘗試 ' + (5 - failCount) + ' 次）' };
      }
    }

    // 登入成功：重置失敗計數，記錄最後登入時間
    sheet.getRange(userRowIdx, failCol + 1).setValue(0);
    sheet.getRange(userRowIdx, lastLoginCol + 1).setValue(Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss'));

    // 產生 Session Token
    var token = Utilities.getUuid();
    var now = new Date();
    var expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 小時效期
    var sessionSheet = ss.getSheetByName(SESSION_TAB_NAME);

    sessionSheet.appendRow([
      token,
      cleanId,
      user.role || 'viewer',
      user.name || '',
      Utilities.formatDate(now, 'GMT+8', 'yyyy-MM-dd HH:mm:ss'),
      Utilities.formatDate(expiresAt, 'GMT+8', 'yyyy-MM-dd HH:mm:ss')
    ]);

    var mustChangePwd = (cleanPwd === '000000') || user.force_change_pwd === true || String(user.force_change_pwd).toUpperCase() === 'TRUE';

    return {
      success: true,
      token: token,
      role: user.role || 'viewer',
      empId: cleanId,
      name: user.name || '',
      forceChangePwd: mustChangePwd,
      message: '登入成功'
    };

  } catch (err) {
    return { success: false, message: '登入處理發生錯誤: ' + err.message };
  }
}

/**
 * 驗證 Token 有效性
 */
function validateToken(token) {
  if (!token) return { valid: false, message: '尚未登入' };

  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SESSION_TAB_NAME);
    if (!sheet) return { valid: false, message: 'Session 資料表不存在' };

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { valid: false, message: '無有效 Session' };

    var now = new Date().getTime();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(token)) {
        var expireTime = new Date(data[i][5]).getTime();
        if (expireTime > now) {
          return {
            valid: true,
            empId: data[i][1],
            role: data[i][2],
            name: data[i][3]
          };
        } else {
          return { valid: false, message: '連線已逾期 (超過 8 小時)，請重新登入' };
        }
      }
    }
    return { valid: false, message: '無效或已失效的憑證' };
  } catch (err) {
    return { valid: false, message: err.message };
  }
}

/**
 * 使用者登出 (註銷 Token)
 */
function gasLogout(token) {
  if (!token) return { success: true };
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SESSION_TAB_NAME);
    if (!sheet) return { success: true };

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(token)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return { success: true };
  } catch (e) {
    return { success: true };
  }
}

/**
 * 使用者主動變更密碼 (含首次登入強制變更)
 */
function gasChangePassword(token, oldPassword, newPassword) {
  var auth = validateToken(token);
  if (!auth.valid) return { success: false, message: auth.message };

  var cleanNew = String(newPassword || '').trim();
  if (cleanNew.length < 6) {
    return { success: false, message: '新密碼長度至少需 6 碼以上' };
  }

  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    var empCol = headers.indexOf('emp_id');
    var hashCol = headers.indexOf('pwd_hash');
    var saltCol = headers.indexOf('pwd_salt');
    var forceCol = headers.indexOf('force_change_pwd');
    var changedCol = headers.indexOf('pwd_changed_at');

    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === auth.empId) {
        var rowIdx = i + 1;
        var currentSalt = data[i][saltCol];
        var currentHash = data[i][hashCol];
        var isForce = data[i][forceCol] === true || String(data[i][forceCol]).toUpperCase() === 'TRUE';

        // 若不是管理員解鎖後強制重設，則檢查舊密碼
        if (!isForce && oldPassword) {
          if (hashPassword(currentSalt, oldPassword) !== currentHash) {
            return { success: false, message: '原密碼輸入不正確' };
          }
        }

        // 產生新 Salt 與新 Hash
        var newSalt = generateSalt();
        var newHash = hashPassword(newSalt, cleanNew);
        var timeStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');

        sheet.getRange(rowIdx, saltCol + 1).setValue(newSalt);
        sheet.getRange(rowIdx, hashCol + 1).setValue(newHash);
        sheet.getRange(rowIdx, forceCol + 1).setValue(false);
        sheet.getRange(rowIdx, changedCol + 1).setValue(timeStr);

        return { success: true, message: '密碼已成功更新！' };
      }
    }

    return { success: false, message: '找不到使用者帳號' };
  } catch (err) {
    return { success: false, message: '密碼變更失敗: ' + err.message };
  }
}

// ==============================================================================
// 5. 帳號申請與審核作業 (Registration & User Approval)
// ==============================================================================

/**
 * 提交帳號申請
 */
function gasSubmitRequest(formData) {
  try {
    var empId = normalizeEmpId(formData.empId);
    var name = String(formData.name || '').trim();
    var dept = String(formData.department || '').trim();
    var email = String(formData.email || '').trim();
    var reason = String(formData.reason || '').trim();

    if (!empId || !name || !dept) {
      return { success: false, message: '請完整填寫工號、姓名與部門' };
    }

    ensureAuthSheetsExist();
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });
    var empCol = headers.indexOf('emp_id');

    // 檢查工號是否已存在
    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === empId) {
        var existingStatus = String(data[i][headers.indexOf('status')]).toLowerCase();
        if (existingStatus === 'pending') {
          return { success: false, message: '此工號已有申請正在審核中，請勿重複送件。' };
        } else if (existingStatus === 'approved') {
          return { success: false, message: '此工號已是核准使用者，請直接前往登入。' };
        } else {
          return { success: false, message: '此工號已有申請記錄 (' + existingStatus + ')，請聯繫管理員。' };
        }
      }
    }

    var timeStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
    
    // 新增申請列 (預設 viewer, status: pending)
    sheet.appendRow([
      empId, name, dept, email, reason, 'viewer',
      'pending', '', '', true, 
      0, false, '', '', 
      timeStr, '', ''
    ]);

    return { success: true, message: '申請已成功送出！請靜候管理員審核與通知。' };
  } catch (err) {
    return { success: false, message: '申請送出失敗: ' + err.message };
  }
}

/**
 * 取得待審核名單 (僅限 Admin)
 */
function gasGetPendingRequests(adminToken) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足 (需管理員身分)' };
  }

  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: true, requests: [] };

    var headers = data[0].map(function(h) { return String(h).trim(); });
    var statusCol = headers.indexOf('status');
    var list = [];

    for (var i = 1; i < data.length; i++) {
      var rowStatus = String(data[i][statusCol] || '').trim().toLowerCase();
      if (rowStatus === 'pending') {
        var item = {};
        for (var c = 0; c < headers.length; c++) {
          if (headers[c] !== 'pwd_hash' && headers[c] !== 'pwd_salt') {
            var cellVal = data[i][c];
            if (cellVal instanceof Date) {
              item[headers[c]] = Utilities.formatDate(cellVal, 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
            } else {
              item[headers[c]] = (cellVal === null || cellVal === undefined) ? '' : cellVal;
            }
          }
        }
        list.push(item);
      }
    }
    return { success: true, requests: list };
  } catch (err) {
    return { success: false, message: '查詢待審核名單失敗: ' + err.message };
  }
}

/**
 * 管理員核可申請：自動配發預設密碼 "000000"，指定身份 (admin/viewer)，並強制首次登入改密碼
 */
function gasApproveUser(adminToken, targetEmpId, targetRole) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足' };
  }

  try {
    var cleanTarget = normalizeEmpId(targetEmpId);
    var assignedRole = (String(targetRole).toLowerCase() === 'admin') ? 'admin' : 'viewer';
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    var empCol = headers.indexOf('emp_id');
    var roleCol = headers.indexOf('role');
    var statusCol = headers.indexOf('status');
    var hashCol = headers.indexOf('pwd_hash');
    var saltCol = headers.indexOf('pwd_salt');
    var forceCol = headers.indexOf('force_change_pwd');
    var reviewTimeCol = headers.indexOf('reviewed_at');
    var reviewerCol = headers.indexOf('reviewed_by');
    var failCol = headers.indexOf('login_fail_count');
    var lockCol = headers.indexOf('locked');

    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === cleanTarget) {
        var rowIdx = i + 1;
        var salt = generateSalt();
        var defaultHash = hashPassword(salt, '000000');
        var nowStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');

        sheet.getRange(rowIdx, statusCol + 1).setValue('approved');
        if (roleCol !== -1) {
          sheet.getRange(rowIdx, roleCol + 1).setValue(assignedRole);
        }
        sheet.getRange(rowIdx, saltCol + 1).setValue(salt);
        sheet.getRange(rowIdx, hashCol + 1).setValue(defaultHash);
        sheet.getRange(rowIdx, forceCol + 1).setValue(true); // 首次強制改密碼
        sheet.getRange(rowIdx, failCol + 1).setValue(0);
        sheet.getRange(rowIdx, lockCol + 1).setValue(false);
        sheet.getRange(rowIdx, reviewTimeCol + 1).setValue(nowStr);
        sheet.getRange(rowIdx, reviewerCol + 1).setValue(auth.empId);

        var roleLabel = (assignedRole === 'admin') ? '管理人員 (Admin)' : '一般人員 (Viewer)';
        return { 
          success: true, 
          defaultPwd: '000000',
          role: assignedRole,
          message: '工號 [' + cleanTarget + '] 已核可（身份：' + roleLabel + '）！預設密碼為 000000，登入後將強制修改密碼。' 
        };
      }
    }
    return { success: false, message: '找不到指定工號' };
  } catch (err) {
    return { success: false, message: '核可失敗: ' + err.message };
  }
}

/**
 * 管理員駁回申請
 */
function gasRejectUser(adminToken, targetEmpId) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足' };
  }

  try {
    var cleanTarget = normalizeEmpId(targetEmpId);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    var empCol = headers.indexOf('emp_id');
    var statusCol = headers.indexOf('status');
    var reviewTimeCol = headers.indexOf('reviewed_at');
    var reviewerCol = headers.indexOf('reviewed_by');

    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === cleanTarget) {
        var rowIdx = i + 1;
        var nowStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
        sheet.getRange(rowIdx, statusCol + 1).setValue('rejected');
        sheet.getRange(rowIdx, reviewTimeCol + 1).setValue(nowStr);
        sheet.getRange(rowIdx, reviewerCol + 1).setValue(auth.empId);
        return { success: true, message: '已駁回工號 [' + cleanTarget + '] 之申請' };
      }
    }
    return { success: false, message: '找不到指定工號' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * 管理員停用帳號
 */
function gasDisableUser(adminToken, targetEmpId) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足' };
  }

  try {
    var cleanTarget = normalizeEmpId(targetEmpId);
    if (cleanTarget === auth.empId) {
      return { success: false, message: '無法停用自己的帳號' };
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    var empCol = headers.indexOf('emp_id');
    var statusCol = headers.indexOf('status');

    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === cleanTarget) {
        sheet.getRange(i + 1, statusCol + 1).setValue('disabled');
        return { success: true, message: '工號 [' + cleanTarget + '] 已標記停用' };
      }
    }
    return { success: false, message: '找不到指定工號' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * 管理員重新啟用（復權）已停用帳號
 */
function gasEnableUser(adminToken, targetEmpId) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足' };
  }

  try {
    var cleanTarget = normalizeEmpId(targetEmpId);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    var empCol = headers.indexOf('emp_id');
    var statusCol = headers.indexOf('status');
    var failCol = headers.indexOf('login_fail_count');
    var lockCol = headers.indexOf('locked');

    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === cleanTarget) {
        var rowIdx = i + 1;
        sheet.getRange(rowIdx, statusCol + 1).setValue('approved');
        if (failCol !== -1) sheet.getRange(rowIdx, failCol + 1).setValue(0);
        if (lockCol !== -1) sheet.getRange(rowIdx, lockCol + 1).setValue(false);
        return { success: true, message: '工號 [' + cleanTarget + '] 已重新啟用！' };
      }
    }
    return { success: false, message: '找不到指定工號' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * 管理員解鎖帳號並重置為 000000 (強制登入後改密碼)
 */
function gasUnlockAndResetUser(adminToken, targetEmpId) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足' };
  }

  try {
    var cleanTarget = normalizeEmpId(targetEmpId);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    var empCol = headers.indexOf('emp_id');
    var hashCol = headers.indexOf('pwd_hash');
    var saltCol = headers.indexOf('pwd_salt');
    var forceCol = headers.indexOf('force_change_pwd');
    var failCol = headers.indexOf('login_fail_count');
    var lockCol = headers.indexOf('locked');
    var statusCol = headers.indexOf('status');

    for (var i = 1; i < data.length; i++) {
      if (normalizeEmpId(data[i][empCol]) === cleanTarget) {
        var rowIdx = i + 1;
        var salt = generateSalt();
        var defaultHash = hashPassword(salt, '000000');

        sheet.getRange(rowIdx, lockCol + 1).setValue(false);
        sheet.getRange(rowIdx, failCol + 1).setValue(0);
        sheet.getRange(rowIdx, statusCol + 1).setValue('approved');
        sheet.getRange(rowIdx, saltCol + 1).setValue(salt);
        sheet.getRange(rowIdx, hashCol + 1).setValue(defaultHash);
        sheet.getRange(rowIdx, forceCol + 1).setValue(true); // 再次登入需強制修改

        return { 
          success: true, 
          defaultPwd: '000000',
          message: '帳號已成功解鎖！新密碼已重置為 000000，請口頭告知同仁登入後進行修改。' 
        };
      }
    }
    return { success: false, message: '找不到指定工號' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * 取得所有使用者列表 (Admin 用)
 */
function gasGetAllUsers(adminToken) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足' };
  }

  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(USER_TAB_NAME);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: true, users: [] };

    var headers = data[0].map(function(h) { return String(h).trim(); });
    var list = [];

    for (var i = 1; i < data.length; i++) {
      var item = {};
      for (var c = 0; c < headers.length; c++) {
        // 資安遮蔽
        if (headers[c] !== 'pwd_hash' && headers[c] !== 'pwd_salt') {
          var cellVal = data[i][c];
          if (cellVal instanceof Date) {
            item[headers[c]] = Utilities.formatDate(cellVal, 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
          } else {
            item[headers[c]] = (cellVal === null || cellVal === undefined) ? '' : cellVal;
          }
        }
      }
      list.push(item);
    }
    return { success: true, users: list };
  } catch (err) {
    return { success: false, message: '查詢使用者名冊失敗: ' + err.message };
  }
}

/**
 * 初始化建立第一位管理者 (或直接由 Script Properties 觸發)
 */
function createInitialAdmin(empId, name, password) {
  ensureAuthSheetsExist();
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(USER_TAB_NAME);
  var cleanId = normalizeEmpId(empId);
  var salt = generateSalt();
  var hash = hashPassword(salt, password || '000000');
  var nowStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    cleanId, name || '系統管理員', '資訊招商處', '', '初始管理員帳號', 'admin',
    'approved', hash, salt, false,
    0, false, '', '',
    nowStr, nowStr, 'SYSTEM_INIT'
  ]);

  Logger.log('✅ 管理員帳號 [' + cleanId + '] 建立完成！');
  return '管理員 [' + cleanId + '] 建立成功';
}

// ==============================================================================
// 6. Excel 增量更新與專櫃主檔 CRUD (Data Upsert & Master Editor)
// ==============================================================================

/**
 * 專櫃 ID 正規化 (補滿 5 碼)
 */
function normalizeId(id) {
  if (id === null || id === undefined) return '';
  var s = String(id).trim();
  if (!s) return '';
  while (s.length < 5) s = '0' + s;
  return s;
}

/**
 * 月結資料上傳：增量 Upsert 寫入 Monthly_Settlement_Raw
 * 複合鍵：normalizeId(專櫃編號) + '_' + normalizeYm(銷售年月)
 */
function upsertMonthlyData(adminToken, rows) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足 (需管理員身分)' };
  }

  if (!rows || !rows.length) {
    return { success: false, message: '無上傳資料' };
  }

  Logger.log('=== upsertMonthlyData 開始 === 共 ' + rows.length + ' 筆資料');
  Logger.log('=== 第一筆 item keys: ' + JSON.stringify(Object.keys(rows[0] || {})));
  Logger.log('=== 第一筆 item 值: ' + JSON.stringify(rows[0]));

  try {
    var rawTab = getAppProperty('RAW_TAB') || 'Monthly_Settlement_Raw';
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(rawTab);
    if (!sheet) {
      Logger.log('=== 找不到分頁: ' + rawTab);
      return { success: false, message: '找不到月結分頁: ' + rawTab };
    }

    var DEFAULT_MONTHLY_HEADERS = [
      '專櫃編號', '專櫃名稱', '銷售年月', '銷貨淨額', '銷貨稅額', 
      '抽成額合計', '保底抽成不足補收額', '不足次數', '本期實付專櫃金額'
    ];

    var sheetData = sheet.getDataRange().getValues();
    Logger.log('=== 試算表 getDataRange 共 ' + sheetData.length + ' 列');
    var hasValidHeaders = (sheetData.length > 0 && sheetData[0] && sheetData[0].some(function(c) { return String(c).trim() !== ''; }));
    Logger.log('=== hasValidHeaders: ' + hasValidHeaders + '，表頭: ' + JSON.stringify(sheetData[0]));

    if (!hasValidHeaders) {
      // 試算表若被清空，自動修復並補建標準表頭
      Logger.log('=== 試算表無表頭，自動補建標準表頭');
      sheet.clear();
      sheet.appendRow(DEFAULT_MONTHLY_HEADERS);
      sheet.getRange(1, 1, 1, DEFAULT_MONTHLY_HEADERS.length).setFontWeight('bold').setBackground('#1E2761').setFontColor('#CADCFC');
      sheetData = sheet.getDataRange().getValues();
    }

    var headers = sheetData[0].map(function(h) { return String(h).trim(); });
    Logger.log('=== 試算表 headers: ' + JSON.stringify(headers));
    
    // 找出關鍵欄位索引 (擴大正規比對以相容 結帳年月、期別、月份)
    var idColName = headers.find(function(h) { return /專櫃編號|專櫃代號|Vendor_ID|^ID$/i.test(h); }) || headers[0];
    var ymColName = headers.find(function(h) { return /銷售年月|結帳年月|結算年月|帳期|年月|月份|Period|YM/i.test(h); }) || (headers.length > 2 ? headers[2] : headers[1]);

    var idColIdx = headers.indexOf(idColName);
    var ymColIdx = headers.indexOf(ymColName);
    Logger.log('=== idCol: ' + idColName + '(idx=' + idColIdx + ')，ymCol: ' + ymColName + '(idx=' + ymColIdx + ')');

    // 尋找試算表中真正的最後一筆非空資料列
    var trueLastRow = 1;
    var keyMap = {};

    for (var r = 1; r < sheetData.length; r++) {
      var row = sheetData[r];
      var hasRealContent = false;
      for (var c = 0; c < row.length; c++) {
        if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
          hasRealContent = true;
          break;
        }
      }
      if (hasRealContent) {
        trueLastRow = r + 1;
        var rowId = normalizeId(sheetData[r][idColIdx]);
        var rowYm = normalizeYm(sheetData[r][ymColIdx]);
        if (rowId && rowYm) {
          keyMap[rowId + '_' + rowYm] = {
            rowNum: r + 1,
            dataRowIndex: r
          };
        }
      }
    }
    Logger.log('=== trueLastRow: ' + trueLastRow + '，keyMap 既有筆數: ' + Object.keys(keyMap).length);

    // 載入專櫃主檔 (Store_Contract_Master)，建立專櫃有效合約期對照表
    var masterTabName = getAppProperty('MASTER_TAB') || 'Store_Contract_Master';
    var masterSheet = ss.getSheetByName(masterTabName);
    var contractMap = {}; // { '00001': [ { startYm: '202401', endYm: '202612' } ] }
    var hasMasterSheet = false;

    if (masterSheet) {
      hasMasterSheet = true;
      var mData = masterSheet.getDataRange().getValues();
      if (mData.length > 1) {
        var mHeaders = mData[0].map(function(h) { return String(h).trim(); });
        var mIdCol = mHeaders.find(function(h) { return /專櫃編號|專櫃代號|Vendor_ID|ID/i.test(h); }) || mHeaders[0];
        var mStartCol = mHeaders.find(function(h) { return /起始|開始|生效|Start/i.test(h); });
        var mEndCol = mHeaders.find(function(h) { return /到期|結束|截止|End/i.test(h); });

        var mIdIdx = mHeaders.indexOf(mIdCol);
        var mStartIdx = mStartCol ? mHeaders.indexOf(mStartCol) : -1;
        var mEndIdx = mEndCol ? mHeaders.indexOf(mEndCol) : -1;

        for (var mr = 1; mr < mData.length; mr++) {
          var mStoreId = normalizeId(mData[mr][mIdIdx]);
          if (!mStoreId) continue;

          var sYm = (mStartIdx >= 0) ? normalizeYm(mData[mr][mStartIdx]) : '';
          var eYm = (mEndIdx >= 0) ? normalizeYm(mData[mr][mEndIdx]) : '';

          if (!contractMap[mStoreId]) contractMap[mStoreId] = [];
          contractMap[mStoreId].push({
            startYm: sYm || '190001',
            endYm: eYm || '209912'
          });
        }
      }
    }
    Logger.log('=== 合約主檔專櫃數: ' + Object.keys(contractMap).length);

    var updatedCount = 0;
    var insertedCount = 0;
    var skippedCount = 0;
    var skippedNoKeyCount = 0;
    var skippedOutContractCount = 0;
    var newRowsToAppend = [];

    for (var i = 0; i < rows.length; i++) {
      var item = rows[i];
      var inputId = '';
      var inputYm = '';

      // 第一輪：依欄位名稱正規比對
      for (var k in item) {
        if (/專櫃編號|專櫃代號|Vendor_ID|^ID$/i.test(k)) inputId = normalizeId(item[k]);
        if (/銷售年月|結帳年月|結算年月|帳期年月|年月|期別|月份|Period|^YM$/i.test(k)) inputYm = normalizeYm(item[k]);
      }

      // 第二輪：值特徵自動識別備援
      if (!inputId || !inputYm) {
        for (var k2 in item) {
          var valStr = String(item[k2] || '').trim();
          if (!inputYm && (/^202\d{3}$/.test(valStr) || /^202\d[-/](0[1-9]|1[0-2])$/.test(valStr))) {
            inputYm = normalizeYm(valStr);
          }
          if (!inputId && /^\d{1,5}$/.test(valStr) && !/^202\d{3}$/.test(valStr) && /編號|代號|代碼|專櫃|ID/i.test(k2)) {
            inputId = normalizeId(valStr);
          }
        }
      }

      if (i === 0) {
        Logger.log('=== 第0筆 inputId=[' + inputId + '] inputYm=[' + inputYm + ']');
      }

      if (!inputId || !inputYm) {
        skippedNoKeyCount++;
        continue;
      }

      // 檢查合約主檔：若有專櫃主檔，且該專櫃不存在或上傳年月不在合約期內，則自動排除
      if (hasMasterSheet && Object.keys(contractMap).length > 0) {
        var storeContracts = contractMap[inputId];
        if (!storeContracts || storeContracts.length === 0) {
          skippedOutContractCount++;
          continue; // 不在專櫃主檔中
        }

        var isWithinContract = storeContracts.some(function(c) {
          return inputYm >= c.startYm && inputYm <= c.endYm;
        });

        if (!isWithinContract) {
          skippedOutContractCount++;
          continue; // 不在有效合約期內
        }
      }

      var compositeKey = inputId + '_' + inputYm;

      if (keyMap[compositeKey]) {
        var existingInfo = keyMap[compositeKey];
        var targetRowIdx = existingInfo.rowNum;
        var existingDataRow = (existingInfo.dataRowIndex >= 0) ? sheetData[existingInfo.dataRowIndex] : null;
        var hasDiff = false;
        var updatedRowValues = [];

        for (var col = 0; col < headers.length; col++) {
          var hName = headers[col];
          var existingVal = existingDataRow ? existingDataRow[col] : '';
          var newVal = findValueInObject(item, hName);
          
          if (newVal === undefined || newVal === null) {
            updatedRowValues.push(existingVal);
          } else {
            updatedRowValues.push(newVal);
            if (!isValueEqual(existingVal, newVal)) {
              hasDiff = true;
            }
          }
        }

        if (hasDiff) {
          sheet.getRange(targetRowIdx, 1, 1, headers.length).setValues([updatedRowValues]);
          if (existingDataRow) {
            sheetData[existingInfo.dataRowIndex] = updatedRowValues;
          }
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        // 新增列：依試算表表頭順序組裝
        var newRowArr = [];
        for (var col = 0; col < headers.length; col++) {
          var hName = headers[col];
          var val = findValueInObject(item, hName);
          newRowArr.push(val !== undefined && val !== null ? val : '');
        }
        if (i === 0) {
          Logger.log('=== 第0筆新增列 newRowArr: ' + JSON.stringify(newRowArr));
        }
        newRowsToAppend.push(newRowArr);
        insertedCount++;
        keyMap[compositeKey] = {
          rowNum: trueLastRow + newRowsToAppend.length,
          dataRowIndex: -1
        };
      }
    }

    // 批次附加新列
    if (newRowsToAppend.length > 0) {
      var writeRow = trueLastRow + 1;
      Logger.log('=== 批次寫入 ' + newRowsToAppend.length + ' 列，從第 ' + writeRow + ' 列開始');
      sheet.getRange(writeRow, 1, newRowsToAppend.length, headers.length).setValues(newRowsToAppend);
    }

    Logger.log('=== 完成 inserted=' + insertedCount + ' updated=' + updatedCount + ' skipped=' + skippedCount + ' noKey=' + skippedNoKeyCount);

    var resultMsg = '';
    var contractNote = skippedOutContractCount > 0 ? '（已自動依專櫃主檔過濾排除非合約期/未建主檔專櫃 ' + skippedOutContractCount + ' 筆）' : '';
    var debugInfo = '【診斷】rows=' + rows.length + 
                    ' | 表頭=' + headers.slice(0,4).join(',') + '...' +
                    ' | trueLastRow=' + trueLastRow + 
                    ' | 既有=' + Object.keys(keyMap).length +
                    ' | inserted=' + insertedCount + 
                    ' | updated=' + updatedCount + 
                    ' | skipped=' + skippedCount + 
                    ' | noKey=' + skippedNoKeyCount +
                    ' | outContract=' + skippedOutContractCount;
    if (rows.length > 0) {
      var firstKeys = Object.keys(rows[0]).slice(0, 6).join(',');
      debugInfo += ' | 第1筆keys=' + firstKeys;
    }

    if (insertedCount === 0 && updatedCount === 0 && skippedCount === 0) {
      resultMsg = '上傳未寫入任何資料：' + contractNote + (skippedNoKeyCount > 0 ? '（無效鍵值: ' + skippedNoKeyCount + ' 筆）' : '') + '。\n' + debugInfo;
      return { success: false, message: resultMsg, debug: debugInfo };
    } else if (insertedCount === 0 && updatedCount === 0 && skippedCount > 0) {
      resultMsg = '上傳資料皆已存在且內容完全一致！共略過 ' + skippedCount + ' 筆重複資料，未進行重複寫入。' + contractNote + '\n' + debugInfo;
    } else {
      resultMsg = '月結資料寫入成功！新增 ' + insertedCount + ' 筆（寫入第 ' + (trueLastRow + 1) + ' 至 ' + (trueLastRow + insertedCount) + ' 列），覆蓋更新 ' + updatedCount + ' 筆，略過重複無異動 ' + skippedCount + ' 筆。' + contractNote + '\n' + debugInfo;
    }

    return {
      success: true,
      updatedCount: updatedCount,
      insertedCount: insertedCount,
      skippedCount: skippedCount,
      message: resultMsg,
      debug: debugInfo
    };

  } catch (err) {
    Logger.log('=== upsertMonthlyData 例外: ' + err.message + '\n' + err.stack);
    return { success: false, message: '月結資料 Upsert 失敗: ' + err.message };
  }
}

/**
 * 輔助函式：判斷試算表舊值與 Excel 新值是否實質相等（容錯空白、型別與浮點數精度）
 */
function isValueEqual(v1, v2) {
  if (v1 === v2) return true;
  if ((v1 === null || v1 === undefined || String(v1).trim() === '') && 
      (v2 === null || v2 === undefined || String(v2).trim() === '')) {
    return true;
  }
  
  // 日期比對處理 (Google Sheets 讀出的 Date 物件 vs 字串)
  if (v1 instanceof Date || Object.prototype.toString.call(v1) === '[object Date]') {
    var d1Str = Utilities.formatDate(v1, 'GMT+8', 'yyyy-MM-dd');
    var s2 = String(v2).trim().replace(/\//g, '-');
    if (d1Str === s2) return true;
    var ym1 = Utilities.formatDate(v1, 'GMT+8', 'yyyyMM');
    if (normalizeYm(v2) === ym1) return true;
  }

  // 數值比對處理 (如 50000 與 "50000" 或 "50,000")
  var cleanS1 = String(v1).replace(/,/g, '').trim();
  var cleanS2 = String(v2).replace(/,/g, '').trim();
  var n1 = Number(cleanS1);
  var n2 = Number(cleanS2);
  if (!isNaN(n1) && !isNaN(n2) && cleanS1 !== '' && cleanS2 !== '') {
    return Math.abs(n1 - n2) < 0.0001;
  }

  // 預設字串純文字比對
  return cleanS1 === cleanS2;
}

/**
 * 輔助函數：模糊比對物件欄位（高容錯對齊，移除空格、底線、括號與「金額」綴詞）
 */
function findValueInObject(obj, targetKey) {
  if (obj[targetKey] !== undefined) return obj[targetKey];
  
  function cleanStr(s) {
    return String(s || '')
      .replace(/[\s_\(\)（）]/g, '')
      .replace(/金額/g, '')
      .toLowerCase();
  }

  var cleanTarget = cleanStr(targetKey);
  for (var k in obj) {
    if (cleanStr(k) === cleanTarget) {
      return obj[k];
    }
  }

  // 二次備援：同義詞別名映射
  var ALIAS_MAP = {
    '銷貨淨額未稅': ['銷貨淨額', '銷貨金額', '營業額', '銷貨淨額_未稅金額'],
    '銷貨淨額稅額': ['銷貨稅額', '銷貨淨額_稅額'],
    '抽成額合計': ['抽成額_合計', '抽成金額', '抽成總額', '抽成額'],
    '包底抽成不足(含稅)': ['保底抽成不足補收額', '差額補收金額', '不足補收額', '不足金額'],
    '應付帳款(含稅)': ['本期實付專櫃金額', '應付帳款_合計', '實付專櫃', '實付金額'],
    '進貨淨額合計': ['進貨淨額_合計', '進貨淨額']
  };

  if (ALIAS_MAP[targetKey]) {
    var aliases = ALIAS_MAP[targetKey];
    for (var a = 0; a < aliases.length; a++) {
      var aliasClean = cleanStr(aliases[a]);
      for (var k2 in obj) {
        if (cleanStr(k2) === aliasClean) {
          return obj[k2];
        }
      }
    }
  }

  return undefined;
}

/**
 * 取得專櫃主檔資料 (支援後台線上檢視與編輯)
 */
function getMasterData(token) {
  var auth = validateToken(token);
  if (!auth.valid) {
    return { success: false, message: auth.message };
  }

  try {
    var masterTab = getAppProperty('MASTER_TAB') || 'Store_Contract_Master';
    var sheetId = getAppProperty('SPREADSHEET_ID');
    var result = getSheetDataAsJson_(sheetId, masterTab);
    return result;
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * 更新單一專櫃主檔紀錄
 */
function updateMasterRecord(adminToken, storeId, fields) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足 (需管理員身分)' };
  }

  try {
    var cleanId = normalizeId(storeId);
    var masterTab = getAppProperty('MASTER_TAB') || 'Store_Contract_Master';
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(masterTab);
    if (!sheet) return { success: false, message: '找不到主檔分頁' };

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });
    var idColName = headers.find(function(h) { return /專櫃編號|專櫃代號|Vendor_ID|ID/i.test(h); }) || headers[0];
    var idColIdx = headers.indexOf(idColName);

    for (var i = 1; i < data.length; i++) {
      if (normalizeId(data[i][idColIdx]) === cleanId) {
        var rowIdx = i + 1;
        for (var col = 0; col < headers.length; col++) {
          var h = headers[col];
          if (fields[h] !== undefined) {
            sheet.getRange(rowIdx, col + 1).setValue(fields[h]);
          }
        }
        return { success: true, message: '專櫃 [' + cleanId + '] 資料已儲存更新！' };
      }
    }
    return { success: false, message: '找不到專櫃代號: ' + cleanId };
  } catch (err) {
    return { success: false, message: '更新主檔失敗: ' + err.message };
  }
}

/**
 * 新增單一專櫃主檔紀錄
 */
function insertMasterRecord(adminToken, fields) {
  var auth = validateToken(adminToken);
  if (!auth.valid || auth.role !== 'admin') {
    return { success: false, message: '權限不足 (需管理員身分)' };
  }

  try {
    var masterTab = getAppProperty('MASTER_TAB') || 'Store_Contract_Master';
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(masterTab);
    if (!sheet) return { success: false, message: '找不到主檔分頁' };

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });
    var idColName = headers.find(function(h) { return /專櫃編號|專櫃代號|Vendor_ID|ID/i.test(h); }) || headers[0];
    var idColIdx = headers.indexOf(idColName);

    var cleanId = normalizeId(fields[idColName] || fields['專櫃編號'] || fields['ID']);
    if (!cleanId) return { success: false, message: '請指定專櫃編號' };

    // 檢查是否重複
    for (var i = 1; i < data.length; i++) {
      if (normalizeId(data[i][idColIdx]) === cleanId) {
        return { success: false, message: '專櫃編號 [' + cleanId + '] 已存在，請直接進行編輯！' };
      }
    }

    var newRow = [];
    for (var col = 0; col < headers.length; col++) {
      var h = headers[col];
      var val = fields[h];
      if (col === idColIdx) val = cleanId;
      newRow.push(val !== undefined && val !== null ? val : '');
    }

    sheet.appendRow(newRow);
    return { success: true, message: '專櫃 [' + cleanId + '] 新增成功！' };
  } catch (err) {
    return { success: false, message: '新增專櫃失敗: ' + err.message };
  }
}

// ==============================================================================
// 7. 核心數據安全讀取服務 (Backend Data Provider - 保留原有功能)
// ==============================================================================

/**
 * 取得雲端試算表真實資料 (強制檢查使用者 Session Token，由後端代理讀取，試算表 ID 零外洩)
 */
function apiGetSyncData(token) {
  var auth = validateToken(token);
  if (!auth.valid) {
    return {
      success: false,
      requireLogin: true,
      error: auth.message || '尚未登入或連線已逾時，請重新登入'
    };
  }
  var result = fetchSyncDataInternal_();
  result.userName = auth.name;
  result.userRole = auth.role;
  return result;
}

/**
 * 內部共用：實際讀取專櫃主檔與月結資料 (底線結尾函式不暴露給前端 google.script.run)
 */
function fetchSyncDataInternal_() {
  var userEmail = getCurrentUserEmail();
  var sheetId = getAppProperty('SPREADSHEET_ID');
  
  if (!sheetId) {
    throw new Error('尚未在 GAS 腳本屬性 (Script Properties) 中設定 SPREADSHEET_ID');
  }

  var masterTab = getAppProperty('MASTER_TAB') || 'Store_Contract_Master';
  var rawTab = getAppProperty('RAW_TAB') || 'Monthly_Settlement_Raw';

  var masterResult = getSheetDataAsJson_(sheetId, masterTab);
  var rawResult = getSheetDataAsJson_(sheetId, rawTab);

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
 * 內部共用：讀取試算表並轉換為 JSON 陣列 (底線結尾函式不暴露給前端 google.script.run)
 */
function getSheetDataAsJson_(spreadsheetId, tabName) {
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
// 8. 資安與屬性管理工具 (Script Properties Manager)
// ==============================================================================

function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

function getAppProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

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

  ensureAuthSheetsExist();
  Logger.log('✅ 腳本屬性初始化完成！SPREADSHEET_ID 與分頁結構已安全綁定。');
}

function normalizeYm(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'GMT+8', 'yyyyMM');
  var s = String(val).replace(/[-/]/g, '').trim();
  return s.length >= 6 ? s.slice(0, 6) : s;
}

/**
 * 🔧 測試用函式（可直接在 GAS 編輯器選取此函式後點「執行」）
 * 模擬前端上傳一筆商場 202608 資料，測試 upsertMonthlyData 寫入是否正常
 */
function testUpsert() {
  var adminEmail = Session.getActiveUser().getEmail();
  Logger.log('=== 執行者 Email: ' + adminEmail);

  // 模擬一筆前端傳來的資料（同時帶有原始欄位和標準欄位兩組鍵值）
  var mockRows = [
    {
      '專櫃編號': '00001',
      '專櫃名稱': '測試專櫃A',
      '結帳年月': '202608',
      '銷貨淨額_未稅金額': 500000,
      '銷貨淨額_稅額': 25000,
      '抽成額_合計': 75000,
      '銷售年月': '202608',
      '銷貨淨額': 500000,
      '銷貨稅額': 25000,
      '抽成額合計': 75000,
      '保底抽成不足補收額': 0,
      '本期實付專櫃金額': 425000
    }
  ];

  Logger.log('=== 模擬資料: ' + JSON.stringify(mockRows[0]));

  // SESSION_HEADERS: [0]token [1]emp_id [2]role [3]name [4]created_at [5]expires_at
  var ss = getSpreadsheet();
  var tokenSheet = ss.getSheetByName(SESSION_TAB_NAME);
  var adminToken = null;

  if (tokenSheet) {
    var tokenData = tokenSheet.getDataRange().getValues();
    Logger.log('=== Session_Tokens 共 ' + tokenData.length + ' 列');
    if (tokenData.length > 1) {
      Logger.log('=== 第1筆: token=' + tokenData[1][0] + ' emp=' + tokenData[1][1] + ' role=' + tokenData[1][2] + ' expires=' + tokenData[1][5]);
    }
    var now = new Date();
    for (var i = 1; i < tokenData.length; i++) {
      var tRow = tokenData[i];
      var token   = tRow[0];  // token
      var role    = tRow[2];  // role
      var expires = tRow[5];  // expires_at
      Logger.log('=== row ' + i + ': role=[' + role + '] expires=[' + expires + '] valid=' + (expires && new Date(expires) > now));
      if (role === 'admin' && expires && new Date(expires) > now) {
        adminToken = token;
        Logger.log('=== ✅ 找到有效 admin token，工號: ' + tRow[1]);
        break;
      }
    }
  } else {
    Logger.log('=== ❌ 找不到 Session_Tokens 分頁');
  }

  if (!adminToken) {
    Logger.log('=== ❌ 找不到有效的 admin token，請先從 Web App 登入管理員帳號後再執行！');
    return;
  }

  var result = upsertMonthlyData(adminToken, mockRows);
  Logger.log('=== 寫入結果: ' + JSON.stringify(result));
}

