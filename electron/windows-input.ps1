$ErrorActionPreference = 'Stop'
$null = Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ControllerInput {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL, wParamH; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr value);
  public static bool SendMouse(uint flags, uint data=0) {
    var i = new INPUT { type=0, U=new InputUnion { mi=new MOUSEINPUT { mouseData=data, dwFlags=flags, dwExtraInfo=UIntPtr.Zero } } };
    return SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))) == 1;
  }
  public static bool SendKey(ushort key, bool down) {
    var i = new INPUT { type=1, U=new InputUnion { ki=new KEYBDINPUT { wVk=key, dwFlags=down ? 0u : 2u, dwExtraInfo=UIntPtr.Zero } } };
    return SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))) == 1;
  }
}
'@
try { $null = [ControllerInput]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { }
$pressedKeys = [System.Collections.Generic.HashSet[int]]::new()
$pressedButtons = [System.Collections.Generic.HashSet[string]]::new()
$buttonFlags = @{ left = @(0x0002,0x0004); right = @(0x0008,0x0010); middle = @(0x0020,0x0040) }
function Release-All {
  $success = $true
  foreach ($key in @($pressedKeys)) { if (-not [ControllerInput]::SendKey([uint16]$key, $false)) { $success = $false }; $null = $pressedKeys.Remove($key) }
  foreach ($button in @($pressedButtons)) { if (-not [ControllerInput]::SendMouse([uint32]$buttonFlags[$button][1])) { $success = $false }; $null = $pressedButtons.Remove($button) }
  return $success
}
try {
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    $eventId = $null
    $success = $false
    try {
      $event = $line | ConvertFrom-Json
      $eventId = $event.id
      switch ($event.kind) {
        'move' {
          if ($event.x -is [int] -and $event.y -is [int]) { $success = [ControllerInput]::SetCursorPos([int]$event.x, [int]$event.y) }
        }
        'button' {
          $pair = $buttonFlags[[string]$event.button]
          if ($null -ne $pair) {
            if ($event.down) { $success = [ControllerInput]::SendMouse([uint32]$pair[0]); $null = $pressedButtons.Add([string]$event.button) }
            else { $success = [ControllerInput]::SendMouse([uint32]$pair[1]); $null = $pressedButtons.Remove([string]$event.button) }
          }
        }
        'wheel' { $delta = [int]$event.delta; $data = [BitConverter]::ToUInt32([BitConverter]::GetBytes($delta),0); $success = [ControllerInput]::SendMouse(0x0800, $data) }
        'key' {
          $key = [int]$event.key
          if ($event.down) { $success = [ControllerInput]::SendKey([uint16]$key, $true); $null = $pressedKeys.Add($key) }
          else { $success = [ControllerInput]::SendKey([uint16]$key, $false); $null = $pressedKeys.Remove($key) }
        }
        'releaseAll' { $success = Release-All }
      }
    } catch { $success = $false }
    if ($null -ne $eventId) { [Console]::Out.WriteLine((ConvertTo-Json -Compress @{ id = $eventId; ok = [bool]$success })) }
  }
} finally { Release-All }
