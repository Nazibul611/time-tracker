Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32ActiveWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$hwnd = [Win32ActiveWindow]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[Win32ActiveWindow]::GetWindowText($hwnd, $sb, 512) | Out-Null

$procId = 0
[Win32ActiveWindow]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null

try {
  $proc = (Get-Process -Id $procId -ErrorAction Stop).ProcessName
} catch {
  $proc = "unknown"
}

$title = $sb.ToString() -replace "\|", "/"
Write-Output "$proc|$title"
