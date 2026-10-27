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
$port = 0
$portSet = $false
$noOpen = $false
$argumentCount = [int]$env:PRESENT_CMD_ARG_COUNT
for ($i = 0; $i -lt $argumentCount; $i++) {
    $argument = [Environment]::GetEnvironmentVariable("PRESENT_CMD_ARG_$i")
    switch -CaseSensitive ($argument) {
        { $_ -in '--help', '-h' } {
            Write-Host @'
Usage: present.cmd [<deck.html> | --html <deck.html>] [--port <1-65535>] [--no-open]

Double-click to choose an HTML file, or drag one HTML file onto this launcher.
Only the selected, self-contained HTML is served on 127.0.0.1.
No Node.js, npm, Python, installation or network download is required.
Keep this window open. Press Q or Ctrl+C to stop the server.
Screen selection, popup and fullscreen permissions are handled by the browser.
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
        default {
            if ($argument.StartsWith('--')) { throw "Unknown option: $argument" }
            if ($null -ne $htmlPath) { throw 'Select only one HTML file.' }
            $htmlPath = $argument
        }
    }
}
if ($null -eq $htmlPath) {
    if ($argumentCount -gt 0) { throw 'Provide an HTML file, or double-click the launcher to choose one.' }
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
              "Cache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n" +
              $ExtraHeaders + "`r`n"
    $stream = $Client.GetStream()
    $stream.WriteTimeout = 2000
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $HeadOnly -and $Body.Length -gt 0) { $stream.Write($Body, 0, $Body.Length) }
}

$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
$connections = New-Object Collections.ArrayList
$readBuffer = New-Object byte[] 4096
try {
    # Port 0 reserves an available port atomically; no URL ACL or admin rights needed.
    $listener.Start()
    $url = "http://127.0.0.1:$($listener.LocalEndpoint.Port)$route"
    Write-Host "Presentation: $url"
    Write-Host "Serving only $([IO.Path]::GetFileName($file)) on 127.0.0.1."
    Write-Host 'Keep this window open. Press Q or Ctrl+C to stop.'
    Write-Host 'Use Chrome / Edge; allow screen access and popups in the HTML dual-screen settings.'
    if (-not $noOpen) {
        try { Start-Process -FilePath $url }
        catch { Write-Warning "Could not open the default browser. Open the URL above in Chrome / Edge. $($_.Exception.Message)" }
    }
    while ($true) {
        if (-not [Console]::IsInputRedirected -and [Console]::KeyAvailable) {
            if ([Console]::ReadKey($true).Key -eq [ConsoleKey]::Q) { break }
        }
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
                    if ($method -cne 'GET' -and -not $headOnly) {
                        Send-Response $client 405 $emptyBody -ExtraHeaders "Allow: GET, HEAD`r`n"
                        continue
                    }
                    # Strip query parameters used by the audience window. Do not
                    # unescape or normalize paths into other local files.
                    $requested = $target.Split('?')[0]
                    if ($requested -ceq '/') {
                        Send-Response $client 302 $emptyBody $headOnly "Location: $route`r`n"
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
    Write-Host 'Presentation server stopped.'
}
