[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$workspaceDirectory = (Resolve-Path -LiteralPath (Join-Path $projectDirectory '..\..')).Path
$shellDirectory = Join-Path $projectDirectory 'src\runtime-shell'
$electronExecutable = Join-Path $shellDirectory 'node_modules\electron\dist\electron.exe'
$projectUrl = 'http://127.0.0.1:8796/projects/014-programmable-worlds/web/index.html'
$serverDirectory = Join-Path $workspaceDirectory '.cache\napali-static-server'

function Test-ProjectServer {
    try {
        $response = Invoke-WebRequest -Uri $projectUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains('runtime/source-live.html?embed=1') -and $response.Content.Contains('app.js')
    } catch { return $false }
}

function Test-PreviewPort {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $attempt = $client.ConnectAsync('127.0.0.1', 8796)
        if (-not $attempt.Wait(700)) { return $false }
        return $client.Connected
    } catch { return $false }
    finally { $client.Dispose() }
}

if (-not (Test-Path -LiteralPath $electronExecutable -PathType Leaf)) {
    throw 'The task-owned Electron runtime is missing. In src/runtime-shell run npm install, then node node_modules/electron/install.js.'
}
$nodeCommand = Get-Command node -ErrorAction Stop
& $nodeCommand.Source (Join-Path $shellDirectory 'prepare-shell.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the task-owned renderer.' }

if (-not (Test-ProjectServer)) {
    if (Test-PreviewPort) {
        throw 'Port 8796 is already occupied, but it does not serve this project. The existing service was left untouched.'
    }
    $pythonCommand = Get-Command python -ErrorAction Stop
    New-Item -ItemType Directory -Path $serverDirectory -Force | Out-Null
    $serverProcess = Start-Process -FilePath $pythonCommand.Source `
        -ArgumentList @('-m', 'http.server', '8796', '--bind', '127.0.0.1', '--directory', ('"' + $workspaceDirectory + '"')) `
        -WorkingDirectory $workspaceDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $serverDirectory 'stdout.log') `
        -RedirectStandardError (Join-Path $serverDirectory 'stderr.log')
    [ordered]@{ pid = $serverProcess.Id; root = $workspaceDirectory; url = $projectUrl; startedAt = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $serverDirectory 'server.json') -Encoding UTF8
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $serverReady = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-ProjectServer) { $serverReady = $true; break }
        if ($serverProcess.HasExited) { throw 'The task static server exited. See .cache/napali-static-server/stderr.log.' }
        Start-Sleep -Milliseconds 250
    }
    if (-not $serverReady) { throw 'The task static server did not become ready. Existing applications and services were left untouched.' }
}

# The page receives the original renderer as a live controllable stream, using
# the task-owned hidden OpenGL engine even in a normal browser.
& $nodeCommand.Source (Join-Path $shellDirectory 'launch-source-bridge.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Could not start the background original renderer service.' }

# The published subset runs M8 directly; the historical native8798 experiment is local-only.

# These settings apply only to the new child process. Running this user entry
# always opens the normal hub; inherited hidden acceptance flags cannot alter it.
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $electronExecutable
$startInfo.WorkingDirectory = $shellDirectory
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
foreach ($qaVariable in @('NAPALI_QA', 'NAPALI_QA_SCENE', 'NAPALI_QA_BACKEND', 'NAPALI_QA_COMPILE_ONLY', 'NAPALI_QA_TIMEOUT_MS')) {
    $startInfo.EnvironmentVariables.Remove($qaVariable)
}
$applicationProcess = [System.Diagnostics.Process]::Start($startInfo)
Write-Host ('Opened the project hub with the task-owned renderer. PID: ' + $applicationProcess.Id)
Write-Host $projectUrl
