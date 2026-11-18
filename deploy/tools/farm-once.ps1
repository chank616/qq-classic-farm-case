# Compatibility entry point. Daily verification is owned by farm-run.ps1.
# The former 12-hour throttle and QQ termination behavior have been retired.
param([switch]$Force, [switch]$CloseQQ, [switch]$Continuous,
      [int]$TimeoutSec = 120, [int]$MinIntervalHours = 0)
$ErrorActionPreference = 'Stop'
if ($Continuous) {
  $tray = Join-Path $PSScriptRoot 'tray\bin\Release\net10.0-windows\FarmTray.exe'
  Start-Process -FilePath $tray -WindowStyle Hidden | Out-Null
  exit 0
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'farm-run.ps1') -HostTimeoutSec $TimeoutSec
exit $LASTEXITCODE
