param([switch]$Force, [switch]$NoReport, [switch]$Dry, [int]$TimeoutSec = 120)
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'farm-run.ps1'), '-HostTimeoutSec', $TimeoutSec)
if ($Dry) { $arguments += '-Dry' }
& powershell.exe @arguments
exit $LASTEXITCODE
