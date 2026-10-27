@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Pass paths as data, never interpolate them into PowerShell source.
set "PRESENT_CMD_SELF=%~f0"
set "PRESENT_CMD_ARG_COUNT=0"
:collect_args
if "%~1"=="" goto launch
set "PRESENT_CMD_ARG_%PRESENT_CMD_ARG_COUNT%=%~1"
set /a PRESENT_CMD_ARG_COUNT+=1 >nul
shift
goto collect_args
:launch
if not exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
  echo Windows PowerShell 5.1 is required. Use this launcher on Windows 10 or later.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -STA -Command "$ErrorActionPreference='Stop'; try { $source=[IO.File]::ReadAllText($env:PRESENT_CMD_SELF); $marker='#'+' POWERSHELL_PAYLOAD'; $offset=$source.IndexOf($marker,[StringComparison]::Ordinal); if ($offset -lt 0) { throw 'Embedded launcher code is missing.' }; & ([scriptblock]::Create($source.Substring($offset+$marker.Length))) } catch { [Console]::Error.WriteLine('Presentation failed: '+$_.Exception.Message); exit 1 }"
set "PRESENT_CMD_EXIT=%errorlevel%"
if not "%PRESENT_CMD_EXIT%"=="0" (
  echo.
  echo Could not start the presentation. See the error above.
  pause
)
exit /b %PRESENT_CMD_EXIT%

# POWERSHELL_PAYLOAD
# Windows PowerShell 5.1 / .NET only. No helper files or downloads.
$ErrorActionPreference = 'Stop'
$htmlPath = $null
$port = 8768
$portSet = $false
$noOpen = $false
$browserPath = $env:PRESENT_CMD_BROWSER
$argumentCount = [int]$env:PRESENT_CMD_ARG_COUNT
for ($i = 0; $i -lt $argumentCount; $i++) {
    $argument = [Environment]::GetEnvironmentVariable("PRESENT_CMD_ARG_$i")
    switch -CaseSensitive ($argument) {
        { $_ -in '--help', '-h' } {
            Write-Host @'
Usage: present.cmd [<deck.html> | --html <deck.html>] [--port <1-65535>] [--no-open]
                   [--browser <chrome.exe-or-msedge.exe>]

Default: ../assets/deck-template.html, relative to this CMD, not the working folder.
If the default is missing, a file picker opens. Drag/drop overrides the default.
Only the selected, self-contained HTML is served on 127.0.0.1.
No Node.js, npm, Python, installation or network download is required.
Edge / Chrome opens with a dedicated profile for local popup/fullscreen settings.
Click Presenter in the HTML and allow screen management for automatic dual screen.
Keep this window open. Press Q, Esc or Ctrl+C to close the browser and server.
'@
            return
        }
        '--no-open' {
            if ($noOpen) { throw 'Duplicate --no-open.' }
            $noOpen = $true
        }
        '--port' {
            if ($portSet) { throw 'Duplicate --port.' }
            $i++
            $value = [Environment]::GetEnvironmentVariable("PRESENT_CMD_ARG_$i")
            if ($i -ge $argumentCount -or $value -notmatch '^[0-9]+$' -or
                -not [int]::TryParse($value, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
                throw '--port must be an integer from 1 to 65535.'
            }
            $portSet = $true
        }
        '--html' {
            if ($null -ne $htmlPath) { throw 'Select only one HTML file.' }
            $i++
            $htmlPath = [Environment]::GetEnvironmentVariable("PRESENT_CMD_ARG_$i")
            if ($i -ge $argumentCount -or [string]::IsNullOrWhiteSpace($htmlPath)) {
                throw '--html requires an HTML file path.'
            }
        }
        '--browser' {
            $i++
            $browserPath = [Environment]::GetEnvironmentVariable("PRESENT_CMD_ARG_$i")
            if ($i -ge $argumentCount -or [string]::IsNullOrWhiteSpace($browserPath)) {
                throw '--browser requires an Edge or Chrome executable path.'
            }
        }
        default {
            if ($argument.StartsWith('--')) { throw "Unknown option: $argument" }
            if ($null -ne $htmlPath) { throw 'Select only one HTML file.' }
            $htmlPath = $argument
        }
    }
}
if ($null -eq $htmlPath) {
    $defaultFile = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetDirectoryName($env:PRESENT_CMD_SELF)) '../assets/deck-template.html'))
    if ([IO.File]::Exists($defaultFile)) { $htmlPath = $defaultFile }
}
if ($null -eq $htmlPath) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
        $dialog.Title = 'Choose a self-contained HTML presentation'
        $dialog.Filter = 'HTML presentations (*.html;*.htm)|*.html;*.htm'
        $dialog.InitialDirectory = [IO.Path]::GetDirectoryName($env:PRESENT_CMD_SELF)
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
        $htmlPath = $dialog.FileName
    } finally { $dialog.Dispose() }
}
$file = [IO.Path]::GetFullPath($htmlPath)
if ([IO.Path]::GetExtension($file).ToLowerInvariant() -notin '.html', '.htm') {
    throw 'The selected file must have an .html or .htm extension.'
}
# Snapshot the bytes once, just like present.mjs. Never resolve HTTP paths on disk.
$html = [IO.File]::ReadAllBytes($file)
$route = '/' + [Uri]::EscapeDataString([IO.Path]::GetFileName($file))
$emptyBody = [byte[]]@()

function Send-Response {
    param($Client, [int]$Status, [byte[]]$Body = @(), [bool]$HeadOnly = $false, [string]$ExtraHeaders = '')
    $reasons = @{ 200 = 'OK'; 302 = 'Found'; 400 = 'Bad Request'; 404 = 'Not Found';
                  405 = 'Method Not Allowed'; 408 = 'Request Timeout'; 431 = 'Request Header Fields Too Large' }
    $header = "HTTP/1.1 $Status $($reasons[$Status])`r`n" +
              "Content-Type: text/html; charset=utf-8`r`nContent-Length: $($Body.Length)`r`n" +
              "Cache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`n" +
              "Permissions-Policy: window-management=(self)`r`nCross-Origin-Resource-Policy: same-origin`r`nConnection: close`r`n" +
              $ExtraHeaders + "`r`n"
    $stream = $Client.GetStream()
    $stream.WriteTimeout = 2000
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $HeadOnly -and $Body.Length -gt 0) { $stream.Write($Body, 0, $Body.Length) }
}

function Find-PresentationBrowser {
    if ($browserPath) {
        $candidate = [IO.Path]::GetFullPath($browserPath)
        if (-not [IO.File]::Exists($candidate)) { throw "Browser not found: $candidate" }
        return $candidate
    }
    $candidates = @(
        "${env:ProgramFiles(x86)}/Microsoft/Edge/Application/msedge.exe",
        "$env:ProgramFiles/Microsoft/Edge/Application/msedge.exe",
        "$env:LOCALAPPDATA/Microsoft/Edge/Application/msedge.exe",
        "$env:ProgramFiles/Google/Chrome/Application/chrome.exe",
        "${env:ProgramFiles(x86)}/Google/Chrome/Application/chrome.exe",
        "$env:LOCALAPPDATA/Google/Chrome/Application/chrome.exe"
    )
    foreach ($candidate in $candidates) { if ([IO.File]::Exists($candidate)) { return $candidate } }
    foreach ($name in 'msedge.exe', 'chrome.exe') {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { return $command.Source }
    }
    return $null
}

# This profile belongs to the launcher, never the user's ordinary browser.
# Keep screen-management consent interactive; allow only this loopback origin
# to open the audience popup and request fullscreen after permission resolves.
<#
Browser profile/lifecycle logic adapted from HIT-PowerPoint-html (MIT):
https://github.com/DSQsqblxhq/HIT-PowerPoint-html
Copyright (c) 2026 DSQsqblxhq <dsqsqblxhq@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
#>
$browserState = @{ Process = $null; Path = $null; Lock = $null; OwnerFile = $null; Temporary = $false }
function Start-PresentationBrowser([string]$Executable) {
    $root = $env:PRESENT_CMD_PROFILE_ROOT
    if (-not $root) { $root = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'html-in-PPT' }
    [void][IO.Directory]::CreateDirectory($root)
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(
            $env:PRESENT_CMD_SELF.ToLowerInvariant() + "`n" + $Executable.ToLowerInvariant()))).Replace('-', '').Substring(0, 16)
    } finally { $hash.Dispose() }
    $browserState.Path = Join-Path $root ('browser-' + $key)
    $browserState.OwnerFile = $browserState.Path + '.pid'
    try {
        $browserState.Lock = [IO.File]::Open($browserState.Path + '.lock', [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        if ([IO.File]::Exists($browserState.OwnerFile)) {
            $owner = 0
            if ([int]::TryParse([IO.File]::ReadAllText($browserState.OwnerFile), [ref]$owner) -and
                (Get-Process -Id $owner -ErrorAction SilentlyContinue)) { throw [IO.IOException]::new('Browser profile is still in use.') }
        }
    } catch [IO.IOException] {
        if ($browserState.Lock) { $browserState.Lock.Dispose(); $browserState.Lock = $null }
        $browserState.Path += '-' + [Guid]::NewGuid().ToString('N')
        $browserState.OwnerFile = $null
        $browserState.Temporary = $true
    }
    $folder = Join-Path $browserState.Path 'Default'
    [void][IO.Directory]::CreateDirectory($folder)
    $preferences = Join-Path $folder 'Preferences'
    $prefs = if ([IO.File]::Exists($preferences)) {
        ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($preferences, [Text.Encoding]::UTF8))
    } else { [pscustomobject]@{} }
    $node = $prefs
    foreach ($name in 'profile', 'content_settings', 'exceptions') {
        if (-not $node.PSObject.Properties[$name] -or $null -eq $node.$name) {
            $node | Add-Member -NotePropertyName $name -NotePropertyValue ([pscustomobject]@{}) -Force
        }
        $node = $node.$name
    }
    $origin = ([Uri]$url).GetLeftPart([UriPartial]::Authority) + ',*'
    foreach ($name in 'automatic_fullscreen', 'popups') {
        $settings = [pscustomobject]@{}
        $settings | Add-Member -NotePropertyName $origin -NotePropertyValue ([pscustomobject]@{ setting = 1 })
        $node | Add-Member -NotePropertyName $name -NotePropertyValue $settings -Force
    }
    [IO.File]::WriteAllText($preferences + '.tmp', (ConvertTo-Json -InputObject $prefs -Depth 100 -Compress), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath ($preferences + '.tmp') -Destination $preferences -Force
    $arguments = @('--no-first-run', '--no-default-browser-check', '--disable-background-mode',
        ('--user-data-dir="{0}"' -f $browserState.Path), ('--app="{0}"' -f $url))
    $browserState.Process = Start-Process -FilePath $Executable -ArgumentList $arguments -PassThru
    if ($browserState.OwnerFile) { [IO.File]::WriteAllText($browserState.OwnerFile, [string]$browserState.Process.Id) }
    Write-Host "Browser profile: $($browserState.Path)"
}

function Stop-PresentationBrowser {
    try {
        if ($browserState.Process) {
            $deadline = [DateTime]::UtcNow.AddSeconds(2)
            while (-not $browserState.Process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
                try { $browserState.Process.Refresh(); [void]$browserState.Process.CloseMainWindow() }
                catch [InvalidOperationException] { if (-not $browserState.Process.HasExited) { throw } }
                Start-Sleep -Milliseconds 100
            }
            if (-not $browserState.Process.HasExited) {
                if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
                    try { & "$env:SystemRoot/System32/taskkill.exe" /PID $browserState.Process.Id /T /F > $null 2>&1 }
                    catch { if (-not $browserState.Process.HasExited) { throw } }
                } else { $browserState.Process.Kill($true) }
                [void]$browserState.Process.WaitForExit(3000)
            }
            $browserState.Process.Dispose()
        }
    } finally {
        if ($browserState.OwnerFile) { Remove-Item -LiteralPath $browserState.OwnerFile -ErrorAction SilentlyContinue }
        if ($browserState.Lock) { $browserState.Lock.Dispose() }
        if ($browserState.Temporary -and $browserState.Path) {
            Remove-Item -LiteralPath $browserState.Path -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
$connections = New-Object Collections.ArrayList
$readBuffer = New-Object byte[] 4096
$consoleInput = -not [Console]::IsInputRedirected
$oldControlC = $null
$stdinStream = $null
$stdinTask = $null
try {
    # A stable origin preserves screen permission. Default ports 8768..8778
    # are tried in order; an explicitly requested occupied port is an error.
    $lastPort = if ($portSet) { $port } else { $port + 10 }
    for ($candidate = $port; $candidate -le $lastPort; $candidate++) {
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $candidate)
        try { $listener.Start(); break }
        catch [Net.Sockets.SocketException] { $listener.Stop(); if ($candidate -eq $lastPort) { throw } }
    }
    $boundPort = $listener.LocalEndpoint.Port
    $url = "http://127.0.0.1:$boundPort${route}?local-present=1"
    Write-Host "Presentation: $url"
    Write-Host "Serving only $([IO.Path]::GetFileName($file)) on 127.0.0.1."
    Write-Host 'Keep this window open. Press Q, Esc or Ctrl+C to close the presentation and server.'
    Write-Host 'Click Present in the HTML, then allow screen management. The audience uses the other display.'
    if ($consoleInput) {
        $oldControlC = [Console]::TreatControlCAsInput
        [Console]::TreatControlCAsInput = $true
    } else {
        $stdinStream = [Console]::OpenStandardInput()
        $stdinByte = [byte[]]::new(1)
        $stdinTask = $stdinStream.ReadAsync($stdinByte, 0, 1)
    }
    if (-not $noOpen) {
        try {
            $browser = Find-PresentationBrowser
            if ($browser) { Start-PresentationBrowser $browser }
            else { Write-Warning 'Edge / Chrome was not found. Open the URL above manually, or use --browser <path>.' }
        } catch { Write-Warning "Could not start the presentation browser. Open the URL above manually. $($_.Exception.Message)" }
    }
    while ($true) {
        if ($consoleInput -and [Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -in @([ConsoleKey]::Q, [ConsoleKey]::Escape) -or [int]$key.KeyChar -eq 3) { break }
        } elseif ($stdinTask -and $stdinTask.IsCompleted) {
            if ($stdinTask.GetAwaiter().GetResult() -eq 0) { $stdinTask = $null }
            elseif ($stdinByte[0] -in 81, 113, 27, 3) { break }
            else { $stdinTask = $stdinStream.ReadAsync($stdinByte, 0, 1) }
        }
        if ($browserState.Process -and $browserState.Process.HasExited) { break }
        # Browsers may preconnect without sending a request. Keep those sockets
        # separate so an idle connection cannot block the actual presentation.
        for ($accepted = 0; $accepted -lt 8 -and $listener.Pending(); $accepted++) {
            $client = $listener.AcceptTcpClient()
            if ($connections.Count -ge 16) { $client.Close(); continue }
            [void]$connections.Add(@{ Client = $client; Header = ''; Deadline = [DateTime]::UtcNow.AddSeconds(5) })
        }
        foreach ($connection in @($connections)) {
            $close = $false
            try {
                $client = $connection.Client
                $stream = $client.GetStream()
                if ([DateTime]::UtcNow -gt $connection.Deadline) {
                    Send-Response $client 408 $emptyBody
                    $close = $true
                } elseif ($stream.DataAvailable) {
                    $count = $stream.Read($readBuffer, 0, $readBuffer.Length)
                    if ($count -eq 0) { $close = $true; continue }
                    $connection.Header += [Text.Encoding]::ASCII.GetString($readBuffer, 0, $count)
                    if ($connection.Header.Length -gt 16384) {
                        Send-Response $client 431 $emptyBody
                        $close = $true
                        continue
                    }
                    if (-not $connection.Header.Contains("`r`n`r`n")) { continue }
                    $close = $true
                    $line = $connection.Header.Split(@("`r`n"), [StringSplitOptions]::None)[0]
                    if ($line -cnotmatch '^([A-Z]+) (/[^\s]*) HTTP/1\.[01]$') {
                        Send-Response $client 400 $emptyBody
                        continue
                    }
                    $method = $Matches[1]
                    $target = $Matches[2]
                    $headOnly = $method -ceq 'HEAD'
                    $hosts = [regex]::Matches($connection.Header, '(?im)^Host:[ \t]*([^\r\n]+)')
                    if ($hosts.Count -ne 1 -or $hosts[0].Groups[1].Value.Trim() -notin "127.0.0.1:$boundPort", "localhost:$boundPort") {
                        Send-Response $client 400 $emptyBody $headOnly
                        continue
                    }
                    if ($method -cne 'GET' -and -not $headOnly) {
                        Send-Response $client 405 $emptyBody -ExtraHeaders "Allow: GET, HEAD`r`n"
                        continue
                    }
                    # Strip query parameters used by the audience window. Do not
                    # unescape or normalize paths into other local files.
                    $requested = $target.Split('?')[0]
                    if ($requested -ceq '/') {
                        Send-Response $client 302 $emptyBody $headOnly "Location: ${route}?local-present=1`r`n"
                    } elseif ($requested -ceq $route) {
                        Send-Response $client 200 $html $headOnly
                    } else {
                        Send-Response $client 404 $emptyBody $headOnly
                    }
                }
            } catch [IO.IOException] { $close = $true
            } catch [Net.Sockets.SocketException] { $close = $true
            } finally {
                if ($close) { $connection.Client.Close(); $connections.Remove($connection) }
            }
        }
        Start-Sleep -Milliseconds 25
    }
} finally {
    foreach ($connection in $connections) { $connection.Client.Close() }
    $listener.Stop()
    try { Stop-PresentationBrowser } finally {
        if ($null -ne $oldControlC) { [Console]::TreatControlCAsInput = $oldControlC }
        if ($stdinStream) { $stdinStream.Dispose() }
    }
    Write-Host 'Presentation server stopped.'
}
