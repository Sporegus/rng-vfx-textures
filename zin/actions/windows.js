// Reports the active (foreground) window's position so Zin can sit on it,
// follow it when you drag it, and fall off when you close it.
const ps = require('./ps');

const WIN32 = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class ZW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  public struct RECT { public int L; public int T; public int R; public int B; }
}
"@
[ZW]::SetProcessDPIAware() | Out-Null
function Get-Active {
  $h = [ZW]::GetForegroundWindow()
  $r = New-Object ZW+RECT
  # 9 = DWMWA_EXTENDED_FRAME_BOUNDS: the visible frame, without the invisible resize border
  if ([ZW]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [ZW]::GetWindowRect($h, [ref]$r) | Out-Null }
  $sb = New-Object System.Text.StringBuilder 256
  [ZW]::GetWindowText($h, $sb, 256) | Out-Null
  [uint32]$procId = 0
  [ZW]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  @{ h = [int64]$h; l = $r.L; t = $r.T; r = $r.R; b = $r.B; title = $sb.ToString(); pid = $procId; max = [ZW]::IsZoomed($h); min = [ZW]::IsIconic($h) } | ConvertTo-Json -Compress
}
`;

function start(onChange) {
  let last = '';
  return ps.stream(WIN32 + `
while ($true) {
  [Console]::Out.WriteLine((Get-Active))
  Start-Sleep -Milliseconds 250
}`, (line) => {
    if (line === last) return;
    last = line;
    try { onChange(JSON.parse(line)); } catch {}
  });
}

async function active() {
  return JSON.parse(await ps.run(WIN32 + 'Get-Active'));
}

module.exports = { start, active };
