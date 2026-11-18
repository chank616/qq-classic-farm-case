# Installs or removes the current user's farm tray startup shortcut.
# Shortcut targets are Unicode, including paths containing Chinese characters.
#
#   powershell -ExecutionPolicy Bypass -File tools\setup-autostart.ps1
#   powershell -ExecutionPolicy Bypass -File tools\setup-autostart.ps1 -Remove
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$tray = Join-Path $PSScriptRoot 'tray\bin\Release\net10.0-windows\FarmTray.exe'
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'FarmTray.lnk'

if ($Remove) {
  Remove-Item $lnk -Force -ErrorAction SilentlyContinue
  Write-Host 'autostart removed'
  exit 0
}

if (-not (Test-Path $tray)) { Write-Host ('missing ' + $tray); exit 1 }

$wsh = New-Object -ComObject WScript.Shell
$s = $wsh.CreateShortcut($lnk)
$s.TargetPath = $tray
$s.Arguments = ''
$s.WorkingDirectory = $PSScriptRoot
$s.Description = 'QQ Farm daily workflow while QQ is available'
$s.Save()
foreach ($old in @('qqfarm-onepass.lnk', 'qqfarm-onepass.vbs')) {
  $oldPath = Join-Path $startup $old
  if (Test-Path -LiteralPath $oldPath) { Remove-Item -LiteralPath $oldPath -Force }
}
Write-Host ('autostart shortcut -> ' + $lnk)
