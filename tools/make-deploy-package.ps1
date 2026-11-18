param([switch]$SelfContained)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'deploy-csharp'
$buildOutput = Join-Path $root 'artifacts\native-publish-build'
$project = Join-Path $root 'tools\tray\FarmTray.csproj'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$runtimeOption = if ($SelfContained) { 'true' } else { 'false' }
& dotnet publish $project -c Release -r win-x64 --self-contained $runtimeOption -o $out `
  ('-p:OutputPath=' + $buildOutput + '\') -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
  ('-p:EnableCompressionInSingleFile=' + $runtimeOption) -p:DebugType=none -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw 'Native C# publish failed' }
Copy-Item -LiteralPath (Join-Path $root 'tools\deploy-README.md') -Destination (Join-Path $out 'README.md') -Force
$manifest = [ordered]@{ runtime = 'csharp'; frameworkDependent = (-not $SelfContained.IsPresent); architecture = 'win-x64'; entry = 'FarmTray.exe'; nodeRequired = $false; powershellRequired = $false }
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'farm-native.json') -Encoding utf8
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = Join-Path $root 'QQFarm-CSharp-win-x64.zip'
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
$zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($name in @('FarmTray.exe', 'README.md', 'farm-native.json')) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $out $name), $name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
Write-Host ('[pack] C# application: ' + $out)
Write-Host ('[pack] zip: ' + $archive)
Write-Host ('[pack] exe KB: ' + [math]::Round((Get-Item -LiteralPath (Join-Path $out 'FarmTray.exe')).Length / 1KB, 1))
Write-Host ('[pack] zip KB: ' + [math]::Round((Get-Item -LiteralPath $archive).Length / 1KB, 1))
