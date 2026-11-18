$ErrorActionPreference = 'Stop'
$native = Join-Path $PSScriptRoot 'FarmTray.exe'
if (-not (Test-Path -LiteralPath $native)) { throw 'Use the deploy-csharp package containing FarmTray.exe.' }
Start-Process -FilePath $native -ArgumentList '--install-autostart' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -Wait
Write-Host 'C# FarmTray autostart installed. No Node.js or PowerShell runtime wrapper is used.'