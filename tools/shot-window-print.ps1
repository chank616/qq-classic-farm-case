# Capture a window even when it is covered, by asking the window to render itself.
param([string]$ProcName = 'FarmTray', [string]$Out = 'artifacts/fix-preview/panel.png')

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class Win2 {
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    public static List<IntPtr> ByProcess(uint want) {
        var found = new List<IntPtr>();
        EnumWindows(delegate(IntPtr h, IntPtr p) { uint pid; GetWindowThreadProcessId(h, out pid); if (pid == want && IsWindowVisible(h)) found.Add(h); return true; }, IntPtr.Zero);
        return found;
    }
    public static string Title(IntPtr h) { int n = GetWindowTextLength(h); if (n <= 0) return ""; var sb = new StringBuilder(n + 2); GetWindowText(h, sb, sb.Capacity); return sb.ToString(); }
}
"@

$proc = Get-Process -Name $ProcName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Error "process not found: $ProcName"; exit 1 }
$best = [IntPtr]::Zero; $bestArea = 0; $bestRect = New-Object Win2+RECT
foreach ($h in [Win2]::ByProcess([uint32]$proc.Id)) {
    $r = New-Object Win2+RECT
    if (-not [Win2]::GetWindowRect($h, [ref]$r)) { continue }
    $a = ($r.R - $r.L) * ($r.B - $r.T)
    if ($a -gt $bestArea) { $bestArea = $a; $best = $h; $bestRect = $r }
}
if ($best -eq [IntPtr]::Zero) { Write-Error "no visible window for $ProcName"; exit 1 }
$w = $bestRect.R - $bestRect.L; $h2 = $bestRect.B - $bestRect.T
$bmp = New-Object System.Drawing.Bitmap($w, $h2)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[void][Win2]::PrintWindow($best, $hdc, 2)
$g.ReleaseHdc($hdc); $g.Dispose()
$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Host ("saved {0} {1}x{2} title={3}" -f $Out, $w, $h2, [Win2]::Title($best))
