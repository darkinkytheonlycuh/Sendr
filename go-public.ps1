param(
    [switch]$InstallTask,
    [int]$Port = 3000
)

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host ''
Write-Host '================  SENDR :: GO PUBLIC  ================' -ForegroundColor Cyan

$isAdmin = Test-Admin
if ($isAdmin) {
    try {
        if (-not (Get-NetFirewallRule -DisplayName 'Sendr HTTP' -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName 'Sendr HTTP' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
        }
        Write-Host "[+] Windows Firewall allows TCP $Port" -ForegroundColor Green
    } catch {
        Write-Host "[!] Firewall rule failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host '[i] Not running as Administrator, so I could not add the firewall rule.' -ForegroundColor Yellow
    Write-Host '    Right-click this script > Run with PowerShell on an elevated shell to automate it.'
}

$lanIp = $null
try {
    $lanIp = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
        Select-Object -First 1).IPv4Address.IPAddress
} catch {}
if (-not $lanIp) {
    try {
        $lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
            Select-Object -First 1).IPAddress
    } catch {}
}

$publicIp = $null
$mapped = $false
try {
    $nat = New-Object -ComObject HNetCfg.NATUPnP
    $publicIp = $nat.ExternalIPAddress
    try {
        $null = $nat.Mappings.Add($Port, $lanIp, $Port, 'Sendr', $true)
        $mapped = $true
        Write-Host "[+] Router: TCP $Port is now forwarded to $lanIp`:$Port (UPnP)" -ForegroundColor Green
    } catch {
        $mapped = $false
        Write-Host "[i] Router port map already exists or was refused." -ForegroundColor DarkGray
    }
} catch {
    Write-Host '[!] Your router refused automatic forwarding (UPnP disabled?).' -ForegroundColor Yellow
    Write-Host "    Manual fix takes 2 minutes: log into your router (usually http://192.168.1.1)"
    Write-Host "    > Port Forwarding > TCP $Port -> $lanIp : $Port"
}

if ($publicIp -and ($publicIp.StartsWith('10.') -or $publicIp -match '^172\.(1[6-9]|2\d|3[01])\.' -or $publicIp.StartsWith('192.168.'))) {
    Write-Host '[!] Your ISP uses CGNAT (no real public IP). Port forwarding cannot work' -ForegroundColor Yellow
    Write-Host '    until your ISP gives you a public IP or IPv6. Everything else still works.'
}

$listening = $false
try {
    $tcp = New-Object Net.Sockets.TcpClient
    $tcp.ConnectAsync('127.0.0.1', $Port).Wait(800) | Out-Null
    $listening = $tcp.Connected
    $tcp.Close()
} catch {}

if (-not $listening) {
    Write-Host '[+] Starting the Sendr server in a new window...' -ForegroundColor Green
    Start-Process powershell.exe -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSScriptRoot\start-sendr.ps1`""
    )
} else {
    Write-Host '[+] Sendr server is already running.' -ForegroundColor Green
}

if ($InstallTask) {
    try {
        $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument `
            "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\start-sendr.ps1`" -Quiet"
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        Register-ScheduledTask -TaskName 'Sendr Server' -Action $action -Trigger $trigger -Force | Out-Null
        Write-Host '[+] Auto-start at every login installed ("Sendr Server" task).' -ForegroundColor Green
    } catch {
        Write-Host "[!] Could not register auto-start task: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host '------------------  YOUR SITE  ------------------' -ForegroundColor Cyan
Write-Host "  On this PC:     http://localhost:$Port"
if ($lanIp)    { Write-Host "  Same network:   http://$lanIp`:$Port" }
if ($publicIp) { Write-Host "  Whole internet: http://$publicIp`:$Port" -ForegroundColor Green }
Write-Host '-------------------------------------------------' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Files are stored in .sendr-data and stay until someone deletes them.'
Write-Host '  If your home IP ever changes, re-run this script; uploaded files are untouched.'
Write-Host ''
