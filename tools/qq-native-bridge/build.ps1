$ErrorActionPreference = 'Stop'
$bridgeFolder = $PSScriptRoot
$vendorFolder = Join-Path $bridgeFolder 'vendor/minhook-1.3.4'
$compilerFolder = Join-Path (Split-Path (Split-Path $bridgeFolder -Parent) -Parent) '.venv-ida/Lib/site-packages/ziglang'
$compilerExe = Join-Path $compilerFolder 'zig.exe'
if (-not (Test-Path -LiteralPath $compilerExe)) { throw 'Build-only Zig compiler is missing' }
$outputFolder = Join-Path $bridgeFolder 'bin'
New-Item -ItemType Directory -Path $outputFolder -Force | Out-Null
& $compilerExe cc -target x86_64-windows-gnu -shared -O2 -s -I (Join-Path $vendorFolder 'include') -I (Join-Path $vendorFolder 'src') (Join-Path $bridgeFolder 'QQFarmBridge.c') (Join-Path $vendorFolder 'src/hook.c') (Join-Path $vendorFolder 'src/buffer.c') (Join-Path $vendorFolder 'src/trampoline.c') (Join-Path $vendorFolder 'src/hde/hde64.c') -o (Join-Path $outputFolder 'QQFarmBridge.dll')
if ($LASTEXITCODE -ne 0) { throw 'Native QQ bridge compilation failed' }
(Get-FileHash -LiteralPath (Join-Path $outputFolder 'QQFarmBridge.dll') -Algorithm SHA256).Hash | Set-Content -LiteralPath (Join-Path $outputFolder 'QQFarmBridge.sha256') -Encoding ascii
Get-Item (Join-Path $outputFolder 'QQFarmBridge.dll') | Select-Object Name,Length
