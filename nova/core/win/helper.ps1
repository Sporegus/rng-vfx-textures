# Nova's Windows helper: one long-running PowerShell process that answers
# JSON requests on stdin with JSON replies on stdout, one per line:
#   in:  {"id":1,"cmd":"foreground","args":{}}
#   out: {"id":1,"ok":true,"result":{...}}
# It only does the narrow things listed in the switch below. It never runs a
# command it's given, and values are read as data, never pasted into code.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -ReferencedAssemblies System.Drawing @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class NovaWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  public delegate bool MonProc(IntPtr m, IntPtr dc, ref RECT r, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct MONITORINFOEX { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice; }
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }

  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonProc f, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFOEX mi);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr d);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowLong(IntPtr h, int i);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();

  public static List<IntPtr> TopWindows() {
    var list = new List<IntPtr>();
    EnumWindows((h, p) => { if (IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static List<MONITORINFOEX> Monitors() {
    var list = new List<MONITORINFOEX>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr m, IntPtr dc, ref RECT r, IntPtr p) => {
      var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX)); GetMonitorInfo(m, ref mi); list.Add(mi); return true;
    }, IntPtr.Zero);
    return list;
  }
  public static bool Cloaked(IntPtr h) { int v; return DwmGetWindowAttribute(h, 14, out v, 4) == 0 && v != 0; }
  public static RECT Frame(IntPtr h) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r); return r; }
  public static uint IdleMs() { var i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return GetTickCount() - i.dwTime; }
  public static bool Locked() { IntPtr d = OpenInputDesktop(0, false, 0x0100); if (d == IntPtr.Zero) return true; CloseDesktop(d); return false; }
  static INPUT Key(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = 1; i.u.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags }; return i; }
  public static uint KeyEvent(ushort vk, bool up) { return SendInput(1, new[] { Key(vk, 0, up ? 2u : 0u) }, Marshal.SizeOf(typeof(INPUT))); }
  public static uint TypeChar(char c) {
    // KEYEVENTF_UNICODE: types the character itself, whatever the keyboard layout
    return SendInput(2, new[] { Key(0, c, 4u), Key(0, c, 4u | 2u) }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static uint Mouse(int x, int y, uint flags) {
    var i = new INPUT(); i.type = 0; i.u.mi = new MOUSEINPUT { dx = x, dy = y, dwFlags = flags };
    return SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
[NovaWin]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing

$script:held = New-Object 'System.Collections.Generic.HashSet[int]'
$script:mouseHeld = $false

function Win-Info([IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 512
  [NovaWin]::GetWindowText($h, $sb, 512) | Out-Null
  [uint32]$procId = 0
  [NovaWin]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  $pname = ''; try { $pname = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
  $r = [NovaWin]::Frame($h)
  $mon = [NovaWin]::MonitorFromWindow($h, 2)
  @{ hwnd = [int64]$h; title = $sb.ToString(); pid = [int]$procId; process = $pname; x = $r.L; y = $r.T; w = $r.R - $r.L; h = $r.B - $r.T;
     max = [NovaWin]::IsZoomed($h); min = [NovaWin]::IsIconic($h); monitor = [int64]$mon; dpi = [int]([NovaWin]::GetDpiForWindow($h)) }
}
function Monitor-List {
  $i = 0
  foreach ($m in [NovaWin]::Monitors()) {
    @{ index = $i; device = $m.szDevice; primary = (($m.dwFlags -band 1) -eq 1);
       x = $m.rcMonitor.L; y = $m.rcMonitor.T; w = $m.rcMonitor.R - $m.rcMonitor.L; h = $m.rcMonitor.B - $m.rcMonitor.T;
       wx = $m.rcWork.L; wy = $m.rcWork.T; ww = $m.rcWork.R - $m.rcWork.L; wh = $m.rcWork.B - $m.rcWork.T }
    $i++
  }
}
function Monitor-Of($info, $mons) {
  $cx = $info.x + [int]($info.w / 2); $cy = $info.y + [int]($info.h / 2)
  foreach ($m in $mons) { if ($cx -ge $m.x -and $cx -lt $m.x + $m.w -and $cy -ge $m.y -and $cy -lt $m.y + $m.h) { return $m } }
  return $mons[0]
}
function Uia-Element([IntPtr]$h) { [System.Windows.Automation.AutomationElement]::FromHandle($h) }
function Uia-Describe($e) {
  $c = $e.Current
  $r = $c.BoundingRectangle
  $o = @{ name = $c.Name; type = $c.ControlType.ProgrammaticName -replace 'ControlType\.', ''; id = $c.AutomationId; enabled = $c.IsEnabled;
          x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height; password = $c.IsPassword }
  if ($c.IsPassword) { $o.name = '[password field]' }   # never read what's in a password box
  else {
    try { $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $v = $vp.Current.Value; if ($v) { $o.value = $v.Substring(0, [Math]::Min(400, $v.Length)) } } catch {}
  }
  $o
}

function Handle($cmd, $a) {
  switch ($cmd) {
    'ping' { return @{ pong = $true } }
    'foreground' { return (Win-Info ([NovaWin]::GetForegroundWindow())) }
    'windows' {
      $out = @()
      foreach ($h in [NovaWin]::TopWindows()) {
        if ([NovaWin]::Cloaked($h)) { continue }
        $i = Win-Info $h
        if ($i.title -and $i.w -gt 50 -and $i.h -gt 50) { $out += $i }
        if ($out.Count -ge 60) { break }
      }
      return ,@($out)
    }
    'monitors' { return ,@(Monitor-List) }
    'move' {
      # to another monitor, keeping the same relative spot and size (shrunk to fit)
      $h = [IntPtr][int64]$a.hwnd
      $mons = @(Monitor-List)
      if ($mons.Count -lt 2) { throw 'only one monitor' }
      $info = Win-Info $h
      $from = Monitor-Of $info $mons
      $to = $mons | Where-Object { $_.index -eq [int]$a.monitor } | Select-Object -First 1
      if (-not $to) { throw 'no such monitor' }
      $wasMax = $info.max
      if ($wasMax -or $info.min) { [NovaWin]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 120; $info = Win-Info $h }
      $w = [Math]::Min($info.w, $to.ww); $hh = [Math]::Min($info.h, $to.wh)
      $rx = if ($from.ww -gt $w) { ($info.x - $from.wx) / [double]($from.ww - $info.w + 1) } else { 0 }
      $ry = if ($from.wh -gt $hh) { ($info.y - $from.wy) / [double]($from.wh - $info.h + 1) } else { 0 }
      $nx = $to.wx + [int]([Math]::Max(0, [Math]::Min(1, $rx)) * ($to.ww - $w))
      $ny = $to.wy + [int]([Math]::Max(0, [Math]::Min(1, $ry)) * ($to.wh - $hh))
      [NovaWin]::SetWindowPos($h, [IntPtr]::Zero, $nx, $ny, $w, $hh, 0x0014) | Out-Null   # NOZORDER | NOACTIVATE
      if ($wasMax) { Start-Sleep -Milliseconds 80; [NovaWin]::ShowWindow($h, 3) | Out-Null }
      Start-Sleep -Milliseconds 150
      $after = Win-Info $h
      return @{ before = $from.index; after = (Monitor-Of $after $mons).index; window = $after }
    }
    'arrange' {
      $h = [IntPtr][int64]$a.hwnd
      switch ($a.op) {
        'minimize' { [NovaWin]::ShowWindow($h, 6) | Out-Null }
        'maximize' { [NovaWin]::ShowWindow($h, 3) | Out-Null }
        'restore' { [NovaWin]::ShowWindow($h, 9) | Out-Null }
        default {
          [NovaWin]::ShowWindow($h, 9) | Out-Null
          $m = Monitor-Of (Win-Info $h) @(Monitor-List)
          $half = [int]($m.ww / 2)
          $x = if ($a.op -eq 'snap_left') { $m.wx } else { $m.wx + $half }
          [NovaWin]::SetWindowPos($h, [IntPtr]::Zero, $x, $m.wy, $half, $m.wh, 0x0014) | Out-Null
        }
      }
      Start-Sleep -Milliseconds 150
      return (Win-Info $h)
    }
    'focus' {
      $h = [IntPtr][int64]$a.hwnd
      if ([NovaWin]::IsIconic($h)) { [NovaWin]::ShowWindow($h, 9) | Out-Null }
      [NovaWin]::BringWindowToTop($h) | Out-Null
      [NovaWin]::SetForegroundWindow($h) | Out-Null
      Start-Sleep -Milliseconds 120
      return @{ foreground = ([int64][NovaWin]::GetForegroundWindow() -eq [int64]$h) }
    }
    'idle' { return @{ ms = [int][NovaWin]::IdleMs(); locked = [NovaWin]::Locked() } }
    'key' {
      $vk = [uint16]$a.vk
      if ($a.up) { [NovaWin]::KeyEvent($vk, $true) | Out-Null; $script:held.Remove([int]$vk) | Out-Null }
      else { [NovaWin]::KeyEvent($vk, $false) | Out-Null; $script:held.Add([int]$vk) | Out-Null }
      return @{ held = @($script:held) }
    }
    'type' {
      $t = [string]$a.text
      if ($t.Length -gt 2000) { throw 'text too long' }
      foreach ($c in $t.ToCharArray()) { [NovaWin]::TypeChar($c) | Out-Null; Start-Sleep -Milliseconds 4 }
      return @{ typed = $t.Length }
    }
    'click' {
      # absolute coordinates on the virtual desktop -> 0..65535
      $vx = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $nx = [int](([double]$a.x - $vx.X) * 65535 / ($vx.Width - 1)); $ny = [int](([double]$a.y - $vx.Y) * 65535 / ($vx.Height - 1))
      [NovaWin]::Mouse($nx, $ny, 0x8001 -bor 0x4000) | Out-Null   # MOVE | ABSOLUTE | VIRTUALDESK
      $down = if ($a.button -eq 'right') { 0x0008 } else { 0x0002 }; $up = if ($a.button -eq 'right') { 0x0010 } else { 0x0004 }
      $script:mouseHeld = $true
      [NovaWin]::Mouse(0, 0, $down) | Out-Null; Start-Sleep -Milliseconds 30; [NovaWin]::Mouse(0, 0, $up) | Out-Null
      $script:mouseHeld = $false
      return @{ clicked = $true }
    }
    'release_all' {
      foreach ($vk in @($script:held)) { [NovaWin]::KeyEvent([uint16]$vk, $true) | Out-Null }
      $n = $script:held.Count; $script:held.Clear()
      if ($script:mouseHeld) { [NovaWin]::Mouse(0, 0, 0x0004) | Out-Null; [NovaWin]::Mouse(0, 0, 0x0010) | Out-Null; $script:mouseHeld = $false }
      return @{ released = $n }
    }
    'uia_focused' {
      $e = [System.Windows.Automation.AutomationElement]::FocusedElement
      if (-not $e) { return $null }
      return (Uia-Describe $e)
    }
    'uia_tree' {
      $h = [IntPtr][int64]$a.hwnd
      $root = Uia-Element $h
      $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
      $out = New-Object System.Collections.ArrayList
      $max = [int]($(if ($a.max) { $a.max } else { 150 }))
      $stack = New-Object System.Collections.Stack
      $stack.Push(@($root, 0))
      while ($stack.Count -gt 0 -and $out.Count -lt $max) {
        $pair = $stack.Pop(); $e = $pair[0]; $d = $pair[1]
        try { $desc = Uia-Describe $e; $desc.depth = $d; if ($desc.name -or $desc.value) { [void]$out.Add($desc) } } catch { continue }
        if ($d -ge [int]$(if ($a.depth) { $a.depth } else { 6 })) { continue }
        $kids = @(); $c = $walker.GetFirstChild($e)
        while ($c -and $kids.Count -lt 60) { $kids += $c; $c = $walker.GetNextSibling($c) }
        for ($k = $kids.Count - 1; $k -ge 0; $k--) { $stack.Push(@($kids[$k], $d + 1)) }
      }
      return ,@($out)
    }
    'uia_selection' {
      $e = [System.Windows.Automation.AutomationElement]::FocusedElement
      if (-not $e) { return @{ text = $null; reason = 'nothing focused' } }
      if ($e.Current.IsPassword) { return @{ text = $null; reason = 'password field' } }
      try {
        $tp = $e.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
        $sel = $tp.GetSelection()
        $txt = ($sel | ForEach-Object { $_.GetText(8000) }) -join "`n"
        return @{ text = $txt }
      } catch { return @{ text = $null; reason = 'this app does not share its selected text' } }
    }
    'uia_find' {
      $h = [IntPtr][int64]$a.hwnd
      $root = Uia-Element $h
      $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
      $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
      $want = ([string]$a.name).ToLower()
      $hits = @()
      foreach ($e in $all) { $n = $e.Current.Name; if ($n -and $n.ToLower().Contains($want)) { $hits += (Uia-Describe $e) }; if ($hits.Count -ge 10) { break } }
      return ,@($hits)
    }
    'uia_invoke' {
      # presses a button through accessibility, no coordinates involved
      $h = [IntPtr][int64]$a.hwnd
      $root = Uia-Element $h
      $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, [string]$a.name)
      $e = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if (-not $e) { throw 'element not found' }
      $p = $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $p.Invoke()
      return @{ invoked = $a.name }
    }
    'screenshot' {
      $x = [int]$a.x; $y = [int]$a.y; $w = [int]$a.w; $hh = [int]$a.h
      if ($w -le 0 -or $hh -le 0 -or $w -gt 8000 -or $hh -gt 8000) { throw 'bad size' }
      $bmp = New-Object System.Drawing.Bitmap $w, $hh
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      return @{ png = [Convert]::ToBase64String($ms.ToArray()); w = $w; h = $hh }
    }
    'ocr' {
      # Windows' built-in text recognition (Windows 10+)
      Add-Type -AssemblyName System.Runtime.WindowsRuntime
      $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
      $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
      $null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
      $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
      function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
      $bytes = [Convert]::FromBase64String([string]$a.png)
      $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
      $writer = New-Object Windows.Storage.Streams.DataWriter($stream.GetOutputStreamAt(0))
      $writer.WriteBytes($bytes)
      Await ($writer.StoreAsync()) ([uint32]) | Out-Null
      $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
      if (-not $engine) { throw 'no OCR language installed' }
      $res = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      return @{ text = $res.Text; lines = @($res.Lines | ForEach-Object { $_.Text }) }
    }
    default { throw "unknown command $cmd" }
  }
}

Add-Type -AssemblyName System.Windows.Forms
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $id = $null
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    $res = Handle ([string]$req.cmd) $req.args
    [Console]::Out.WriteLine((@{ id = $id; ok = $true; result = $res } | ConvertTo-Json -Compress -Depth 6))
  } catch {
    [Console]::Out.WriteLine((@{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
  [Console]::Out.Flush()
}
