$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$previewUrl = 'http://127.0.0.1:4312/'
$viteScript = Join-Path $projectDirectory 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $viteScript)) {
    throw '请先在本项目目录执行 npm install。'
}
if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'web\index.html'))) {
    throw '请先在本项目目录执行 npm run build。'
}
$response = $null
try { $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 2 } catch {}
if ($response -and $response.Content -notmatch '3D 练车场') {
    throw '4312 端口已被其他服务使用，请先检查端口。'
}
if (-not $response) {
    $logDirectory = Join-Path $projectDirectory '.local'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
    $viteArguments = @(('"' + $viteScript + '"'), 'preview', '--host', '127.0.0.1', '--port', '4312', '--strictPort')
    $previewProcess = Start-Process -FilePath $nodeExecutable -ArgumentList $viteArguments -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'preview.log') -RedirectStandardError (Join-Path $logDirectory 'preview-error.log') -PassThru
    $previewProcess.Id | Set-Content -LiteralPath (Join-Path $logDirectory 'preview.pid')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 1; break } catch { Start-Sleep -Milliseconds 200 }
    }
    if (-not $response) { throw '启动失败，请查看 .local\preview-error.log。' }
}
Write-Output "练习场已就绪：$previewUrl"
Start-Process $previewUrl
