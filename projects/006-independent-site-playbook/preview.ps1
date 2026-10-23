[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8066
)

$TaskWebPath = Join-Path -Path $PSScriptRoot -ChildPath 'web'
Write-Host "独立站实践手册：http://127.0.0.1:$Port/"
Write-Host '按 Ctrl+C 停止本地预览。'
python -m http.server $Port --bind 127.0.0.1 --directory $TaskWebPath
