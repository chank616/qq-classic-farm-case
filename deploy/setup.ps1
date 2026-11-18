# One-click setup for a freshly copied deployment package.
# Assumes Node.js LTS is installed and QQ has been opened at least once.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host '[setup] checking node'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host '[setup] node.exe not found in PATH. Install Node.js LTS first.'
  exit 1
}
Write-Host ('[setup] node ' + (& node --version))

Write-Host '[setup] checking the QQEX frame template'
& node (Join-Path $root 'tools\inject_frame_boot.js')
if ($LASTEXITCODE -ne 0) {
  Write-Host '[setup] injection failed. Open the farm mini-app once in QQ, then re-run setup.'
  exit $LASTEXITCODE
}

Write-Host '[setup] installing logon autostart'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\setup-autostart.ps1')

Write-Host ''
Write-Host '[setup] done.'
Write-Host '  run one pass now:'
Write-Host ('    powershell -ExecutionPolicy Bypass -File "' + (Join-Path $root 'tools\farm-run.ps1') + '"')
Write-Host '  disable autostart:'
Write-Host ('    powershell -ExecutionPolicy Bypass -File "' + (Join-Path $root 'tools\setup-autostart.ps1') + '" -Remove')
