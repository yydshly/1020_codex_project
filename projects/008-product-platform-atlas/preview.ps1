[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 8088)
$AtlasWebPath = Join-Path $PSScriptRoot 'web'
Write-Host "产品发现平台图谱：http://127.0.0.1:$Port/"
Write-Host '按 Ctrl+C 停止预览。'
python -m http.server $Port --bind 127.0.0.1 --directory $AtlasWebPath
