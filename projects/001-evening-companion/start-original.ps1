param(
    [ValidateSet('idle', 'think', 'work', 'clap', 'question', 'heart', 'sleep')]
    [string]$State,
    [int]$Port = 4318
)
$ErrorActionPreference = 'Stop'
$sourceDir = Join-Path $PSScriptRoot 'upstream'
$originalCommit = '19496aaba767bc6b594d1e32f51eda3ee038ef5a'
if (-not (Test-Path -LiteralPath $sourceDir)) {
    git clone https://github.com/cyberxiaowan/cyber-xiaowan.git $sourceDir
    if ($LASTEXITCODE -ne 0) { throw 'Unable to clone upstream.' }
    git -C $sourceDir checkout --detach $originalCommit
    if ($LASTEXITCODE -ne 0) { throw 'Unable to checkout recorded upstream commit.' }
}
$actualCommit = git -C $sourceDir rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actualCommit.Trim() -ne $originalCommit) {
    throw 'Upstream revision differs from the recorded original. Check the checkout before running.'
}
if (git -C $sourceDir status --porcelain) {
    throw 'Upstream has local changes. Original preview requires an unchanged checkout.'
}
$previousRuntime = $env:CYBER_XIAOWAN_PET_HOME
$env:CYBER_XIAOWAN_PET_HOME = Join-Path $PSScriptRoot '.runtime/original'
try {
    $entry = Join-Path $sourceDir 'pet/cli.mjs'
    if ($State) { & node $entry --no-open --port $Port $State }
    else {
        Write-Host "Original upstream pet: http://127.0.0.1:$Port/"
        & node $entry --no-open --port $Port
    }
} finally {
    $env:CYBER_XIAOWAN_PET_HOME = $previousRuntime
}
