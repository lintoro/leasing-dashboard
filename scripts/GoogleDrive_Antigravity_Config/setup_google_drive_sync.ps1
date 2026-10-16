# Antigravity 全自動新電腦規則與設定同步腳本 (Google Drive 版)
# 使用方式：在任何新電腦換機後，於 Google Drive 的本資料夾中點擊右鍵選擇「以 PowerShell 執行」即可！

$ErrorActionPreference = "Stop"

Write-Host "=========================================================="
Write-Host "🚀 開始為新電腦同步 Antigravity AI 代理人全域規則 (Google Drive 版)..."
Write-Host "=========================================================="

$CurrentDir = Get-Location
$TargetRulesDir = "C:\Users\$env:USERNAME\.gemini\antigravity\user_rules"
$TargetSkillsDir = "C:\Users\$env:USERNAME\.gemini\antigravity\custom_skills"

if (-not (Test-Path "C:\Users\$env:USERNAME\.gemini\antigravity")) {
    New-Item -ItemType Directory -Path "C:\Users\$env:USERNAME\.gemini\antigravity" -Force | Out-Null
}

if (-not (Test-Path $TargetRulesDir)) {
    New-Item -ItemType Directory -Path $TargetRulesDir -Force | Out-Null
}

# 1. 同步全域 Rules
$RulesSrc = "$CurrentDir\global_rules"
if (-not (Test-Path $RulesSrc)) {
    $RulesSrc = "C:\Users\$env:USERNAME\Google Drive\Antigravity_Global_Config\global_rules"
}

if (Test-Path $RulesSrc) {
    Copy-Item -Path "$RulesSrc\*" -Destination $TargetRulesDir -Recurse -Force
    Write-Host "✅ [1/2] 全域規則 (Global Rules) 已成功同步至本機 ($TargetRulesDir)"
}

# 2. 同步自訂 Skills
$SkillsSrc = "$CurrentDir\custom_skills"
if (-not (Test-Path $SkillsSrc)) {
    $SkillsSrc = "C:\Users\$env:USERNAME\Google Drive\Antigravity_Global_Config\custom_skills"
}

if (Test-Path $SkillsSrc) {
    if (-not (Test-Path $TargetSkillsDir)) {
        New-Item -ItemType Directory -Path $TargetSkillsDir -Force | Out-Null
    }
    Copy-Item -Path "$SkillsSrc\*" -Destination $TargetSkillsDir -Recurse -Force
    Write-Host "✅ [2/2] 自訂技能 (Custom Skills) 已成功同步至本機 ($TargetSkillsDir)"
}

Write-Host "=========================================================="
Write-Host "🎉 換機全自動同步完成！所有 Antigravity 代理人規則已在新電腦就位。"
Write-Host "提示：開啟任何 GitHub 專案執行 'git pull'，該專案的 AGENTS.md 亦將自動載入！"
Write-Host "=========================================================="
