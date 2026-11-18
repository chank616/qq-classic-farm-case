param([switch]$SelfContained)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$publishDir = Join-Path $projectRoot ('artifacts/package-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$bundleRuntime = $SelfContained.IsPresent.ToString().ToLowerInvariant()
dotnet publish (Join-Path $PSScriptRoot 'tray/FarmTray.csproj') -c Release -r win-x64 --self-contained $bundleRuntime -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o $publishDir --nologo
if ($LASTEXITCODE -ne 0) { throw 'C# publish failed' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'deploy-csharp/README.md') -Destination $publishDir
Copy-Item -LiteralPath (Join-Path $projectRoot 'deploy-csharp/farm-native.json') -Destination $publishDir
$archive = Join-Path $projectRoot 'QQFarm-CSharp-win-x64.zip'
Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $archive -Force
Get-Item -LiteralPath $archive | Select-Object FullName,Length
