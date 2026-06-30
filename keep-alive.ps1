$ErrorActionPreference = "SilentlyContinue"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$localPort = 4000
$tunnelSubdomain = "gugudi-mini"
$checkInterval = 30
$publicUrl = "https://$tunnelSubdomain.loca.lt"

function Test-LocalService {
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:$localPort/api/health" -TimeoutSec 5 -UseBasicParsing
        return $res.StatusCode -eq 200
    } catch { return $false }
}

function Test-PublicTunnel {
    try {
        $res = Invoke-WebRequest -Uri $publicUrl -TimeoutSec 10 -UseBasicParsing
        return $res.StatusCode -eq 200
    } catch { return $false }
}

function Start-LocalService {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] local service starting..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList "run","start" -WorkingDirectory $projectRoot -WindowStyle Hidden
    Start-Sleep -Seconds 8
}

function Start-Tunnel {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] tunnel reconnecting..." -ForegroundColor Yellow
    Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'node|node.exe|cmd.exe') -and ($_.CommandLine -match 'localtunnel|loca\.lt|--subdomain') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
    Start-Process -FilePath "npx" -ArgumentList "-y","localtunnel","--port","$localPort","--local-host","127.0.0.1","--subdomain","$tunnelSubdomain" -WorkingDirectory $projectRoot -WindowStyle Hidden
    Start-Sleep -Seconds 10
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] tunnel restored: $publicUrl" -ForegroundColor Green
}

Write-Host "========================================"
Write-Host "  Gugudi Keep-Alive Script"
Write-Host "========================================"
Write-Host ""
Write-Host "Local:  http://127.0.0.1:$localPort"
Write-Host "Public: $publicUrl"
Write-Host "Interval: ${checkInterval}s"
Write-Host ""
Write-Host "Press Ctrl+C to stop"
Write-Host ""

while ($true) {
    $localOk = Test-LocalService
    if (-not $localOk) { Start-LocalService }

    $publicOk = Test-PublicTunnel
    if (-not $publicOk) { Start-Tunnel }
    else { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] OK: $publicUrl" -ForegroundColor DarkGray }

    Start-Sleep -Seconds $checkInterval
}