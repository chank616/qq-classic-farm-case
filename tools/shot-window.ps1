# Capture the FarmTray detail window.
# Strategy: grab the whole virtual screen once, then crop the window rect out of it.
# Direct CopyFromScreen(window rect) produced a shifted image, so we go two-step.
param(
    [string]$ProcName = 'FarmTray',
    [string]$Out = 'artifacts/icon-sheet/tray-window.png',
    [int]$Margin = 0
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class Win {
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

    public static List<IntPtr> ByProcess(uint want) {
        var found = new List<IntPtr>();
        EnumWindows(delegate(IntPtr h, IntPtr p) {
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (pid == want && IsWindowVisible(h)) found.Add(h);
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static string Title(IntPtr h) {
        int n = GetWindowTextLength(h);
        if (n <= 0) return "";
        var sb = new StringBuilder(n + 2);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }
}
"@

$proc = Get-Process -Name $ProcName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Error "process not found: $ProcName"; exit 1 }

# pick the largest visible window owned by the process (the detail form, not the tray icon)
$best = [IntPtr]::Zero; $bestArea = 0; $bestRect = New-Object Win+RECT
foreach ($h in [Win]::ByProcess([uint32]$proc.Id)) {
    $r = New-Object Win+RECT
    if (-not [Win]::GetWindowRect($h, [ref]$r)) { continue }
    $a = ($r.R - $r.L) * ($r.B - $r.T)
    if ($a -gt $bestArea) { $bestArea = $a; $best = $h; $bestRect = $r }
}
if ($best -eq [IntPtr]::Zero) { Write-Error "no visible window for $ProcName"; exit 1 }

[void][Win]::ShowWindow($best, 5)
[void][Win]::SetForegroundWindow($best)
Start-Sleep -Milliseconds 400

$r = New-Object Win+RECT
[void][Win]::GetWindowRect($best, [ref]$r)
$vw = $r.R - $r.L; $vh = $r.B - $r.T
Write-Host ("rect={0},{1} {2}x{3} title={4}" -f $r.L, $r.T, $vw, $vh, [Win]::Title($best))

$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$full = New-Object System.Drawing.Bitmap($vs.Width, $vs.Height)
$g = [System.Drawing.Graphics]::FromImage($full)
$g.CopyFromScreen($vs.Left, $vs.Top, 0, 0, $full.Size)
$g.Dispose()

$cx = [Math]::Max(0, $r.L - $vs.Left - $Margin)
$cy = [Math]::Max(0, $r.T - $vs.Top - $Margin)
$cw = [Math]::Min($vw + 2 * $Margin, $full.Width - $cx)
$ch = [Math]::Min($vh + 2 * $Margin, $full.Height - $cy)

$crop = New-Object System.Drawing.Bitmap($cw, $ch)
$g2 = [System.Drawing.Graphics]::FromImage($crop)
$src = New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)
$dst = New-Object System.Drawing.Rectangle(0, 0, $cw, $ch)
$g2.DrawImage($full, $dst, $src, [System.Drawing.GraphicsUnit]::Pixel)
$g2.Dispose()

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$crop.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$full.Dispose(); $crop.Dispose()
Write-Host ("saved {0} {1}x{2} (virtual screen {3}x{4} at {5},{6})" -f $Out, $cw, $ch, $vs.Width, $vs.Height, $vs.Left, $vs.Top)
