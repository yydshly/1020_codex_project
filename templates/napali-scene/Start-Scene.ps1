param([int]$Port = 8820, [string]$Config = 'configs/baseline.json')
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try { python scene.py serve --port $Port --config $Config }
finally { Pop-Location }
