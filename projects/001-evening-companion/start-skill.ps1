param([string]$SessionId)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $SessionId) {
    $recordPath = Join-Path $PSScriptRoot '.runtime/skill-session.json'
    if (Test-Path -LiteralPath $recordPath) {
        $SessionId = (Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json).sessionId
    }
}
Write-Host 'Cyber Xiaowan - original Skill running in Codex CLI' -ForegroundColor Cyan
Write-Host 'This is a live model session. Type your own question to continue.'
if ($SessionId) {
    codex resume --no-alt-screen --sandbox read-only -C $PSScriptRoot $SessionId
} else {
    codex --no-alt-screen --sandbox read-only -C $PSScriptRoot '请使用 $cyber-xiaowan 原版 Skill 与我交流。'
}
