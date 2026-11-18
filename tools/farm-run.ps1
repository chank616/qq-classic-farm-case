param([switch]$Dry, [int]$HostTimeoutSec = 120)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root 'deploy-csharp\FarmTray.exe'
if (-not (Test-Path -LiteralPath $native)) { $native = Join-Path $root 'tools\tray\bin\Release\net10.0-windows\FarmTray.exe' }
if (-not (Test-Path -LiteralPath $native)) { throw 'Build the C# FarmTray application first.' }
$operation = if ($Dry) { '--inspect-native' } else { '--run-native' }
$process = Start-Process -FilePath $native -ArgumentList $operation -WorkingDirectory (Split-Path -Parent $native) -WindowStyle Hidden -PassThru -Wait
exit $process.ExitCode