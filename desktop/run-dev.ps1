# Brauzer rejimida frontend (WEB_ONLY=1, Electron yo'q)
$NodeDir = "d:\erp\.tools\node-v22.12.0-win-x64"
if (-not (Test-Path "$NodeDir\node.exe")) {
    $NodeDir = "d:\erp\.tools\node"
}
$env:PATH = "$NodeDir;$env:PATH"
$env:WEB_ONLY = "1"

Set-Location $PSScriptRoot

Write-Host "=== ERP Frontend (Vite) ===" -ForegroundColor Cyan
Write-Host ".env: VITE_USE_MOCK=false, VITE_API_URL=/api/v1" -ForegroundColor DarkGray
Write-Host "Backend avval ishga tushiring: d:\erp\start-erp.ps1" -ForegroundColor Yellow
Write-Host "Brauzer: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "To'xtatish: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

& "$NodeDir\npm.cmd" run dev
