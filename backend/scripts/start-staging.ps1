# ERP Live Staging — infrastructure + API + validation
$ErrorActionPreference = "Stop"
$Backend = Split-Path $PSScriptRoot -Parent
$Node = "C:\Users\OSIYOCOMPUTERS\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"
if (-not (Test-Path $Node)) { $Node = "node" }

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

function Test-Port($port) {
    return (Test-NetConnection 127.0.0.1 -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded
}

function Test-ApiHealth {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/health" -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200
    } catch { return $false }
}

Set-Location $Backend

if (-not (Test-Port 5432)) {
    Write-Host "=== 1. Docker Compose (Postgres not on :5432) ===" -ForegroundColor Cyan
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) {
        $candidate = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
        if (Test-Path $candidate) { $docker = $candidate }
        else { throw "Docker not found and Postgres :5432 is down. Start Docker Desktop or PostgreSQL." }
    } else { $docker = $docker.Source }
    & $docker compose -f "$Backend\docker-compose.yml" up -d
    Start-Sleep -Seconds 10
    if (-not (Test-Port 5432)) { throw "Postgres still not listening on :5432" }
} else {
    Write-Host "=== 1. Postgres already on :5432 — skip compose ===" -ForegroundColor Green
}

Write-Host "=== 2. Migrations ===" -ForegroundColor Cyan
& $Node node_modules/prisma/build/index.js migrate deploy

Write-Host "=== 3. Seed ===" -ForegroundColor Cyan
& $Node node_modules/ts-node/dist/bin.js --transpile-only prisma/seed.ts

Write-Host "=== 4. Build ===" -ForegroundColor Cyan
& $Node node_modules/@nestjs/cli/bin/nest.js build

$apiProc = $null
if (-not (Test-ApiHealth)) {
    Write-Host "=== 5. Start API ===" -ForegroundColor Cyan
    $log = Join-Path $Backend "api-boot.log"
    $apiProc = Start-Process -FilePath $Node -ArgumentList "dist/src/main.js" -WorkingDirectory $Backend -PassThru -RedirectStandardOutput $log -RedirectStandardError $log

    $ready = $false
    for ($i = 0; $i -lt 45; $i++) {
        if (Test-ApiHealth) { $ready = $true; break }
        if ($apiProc.HasExited) {
            $tail = Get-Content $log -Tail 30 -ErrorAction SilentlyContinue
            throw "API process exited early (code $($apiProc.ExitCode)). Log:`n$tail"
        }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) {
        $tail = Get-Content $log -Tail 30 -ErrorAction SilentlyContinue
        throw "API did not become healthy on :3000. Log:`n$tail"
    }
    Write-Host "API healthy" -ForegroundColor Green
} else {
    Write-Host "=== 5. API already healthy — skip start ===" -ForegroundColor Green
}

Write-Host "=== 6. Live staging validation ===" -ForegroundColor Cyan
& $Node scripts/live-staging.mjs
$exitCode = $LASTEXITCODE

if ($apiProc -and -not $apiProc.HasExited) {
    Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue
}

exit $exitCode
