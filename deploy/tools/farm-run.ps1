param([switch]$Dry, [int]$HostTimeoutSec = 120)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$art = Join-Path $root 'artifacts'
$baseUrl = 'http://127.0.0.1:17841'
$mutex = New-Object System.Threading.Mutex($false, 'Local\QQFarmDailyPass')
if (-not $mutex.WaitOne(0)) { Write-Host 'A farm pass is already running'; exit 3 }
try {
  if (@(Get-Process QQ -ErrorAction SilentlyContinue).Count -eq 0) { Write-Host 'Waiting for QQ'; exit 4 }
  New-Item -ItemType Directory -Force -Path $art | Out-Null
  function Health {
    try { return Invoke-RestMethod ($baseUrl + '/health') -TimeoutSec 2 } catch { return $null }
  }
  if (-not (Health)) {
    $sinkPath = Join-Path $root 'tools\m0-code-sink.js'
    Start-Process -FilePath 'node' -ArgumentList ('"' + $sinkPath + '"') -WorkingDirectory $root -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $art 'sink.stdout.log') -RedirectStandardError (Join-Path $art 'sink.stderr.log') | Out-Null
    for ($i = 0; $i -lt 20; $i++) { if (Health) { break }; Start-Sleep -Milliseconds 500 }
    if (-not (Health)) { throw 'Local farm service could not start' }
  }
  Set-Content -LiteralPath (Join-Path $art 'LIGHTHOST') -Value 'enabled' -Encoding ascii
  # Update only the farm bootstrap; no QQ login changes and no process termination.
  & node (Join-Path $root 'tools\inject_frame_boot.js') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Farm host bootstrap update failed' }
  $health = Health
  if (-not $health.hostReady -or -not $health.hasCode) {
    $farmUrl = 'tencent://ntqq-open/?&subCmd=miniapp&action=openQQMiniApp&actionParams=%7B%22sourceType%22%3A%22open%22%2C%22appId%22%3A%22https%3A%2F%2Fm.q.qq.com%2Fa%2Fp%2F1112386029%3Freferer%3Dpc_shortcut%26via%3Dpc_shortcut%22%2C%22hostScene%22%3A%221246700100%22%7D'
    Start-Process $farmUrl | Out-Null
    $deadline = (Get-Date).AddSeconds($HostTimeoutSec)
    do {
      Start-Sleep -Seconds 2
      $health = Health
      if ($health.hostReady -and $health.hasCode) { break }
    } while ((Get-Date) -lt $deadline)
    if (-not $health.hostReady -or -not $health.hasCode) { throw 'QQ farm host unavailable: waiting for a logged-in QQ session or a farm page reload' }
  }
  $clientArgs = @((Join-Path $root 'client\farm-headless.js'))
  if ($Dry) { $clientArgs += '--dry' }
  & node @clientArgs
  $result = $LASTEXITCODE
  exit $result
} catch {
  $errorReport = @{ generatedAt = (Get-Date).ToString('o'); completed = $false; allRequiredComplete = $false; status = 'host-unavailable'; error = $_.Exception.Message }
  $errorReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $art 'farm-host-error.json') -Encoding utf8
  $statusName = if ($Dry) { 'farm-inspection.json' } else { 'farm-status.json' }
  $errorReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $art $statusName) -Encoding utf8
  Write-Error $_ -ErrorAction Continue
  exit 1
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
