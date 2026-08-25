$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portable = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools\node'
    if (Test-Path -LiteralPath (Join-Path $portable 'node.exe')) {
        $env:PATH = "$portable;$env:PATH"
    } else {
        Write-Host 'Node.js was not found. Install Node or place portable Node at ..\tools\node.' -ForegroundColor Red
        exit 1
    }
}

$port = if ($env:SENDR_PORT) { $env:SENDR_PORT } else { '3000' }

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.next'))) {
    npm run build
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host ""
Write-Host "  Sendr is starting on http://localhost:$port" -ForegroundColor Green
Write-Host "  Files are stored in $PSScriptRoot\.sendr-data" -ForegroundColor DarkGray
Write-Host ""

Start-Process ("http://localhost:" + $port)
npm run start -- -H 0.0.0.0 -p $port
