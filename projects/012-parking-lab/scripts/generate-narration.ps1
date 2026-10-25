# Run with Windows PowerShell: powershell.exe -NoProfile -File scripts/generate-narration.ps1
[CmdletBinding()]
param([switch]$Force)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$projectRoot = Split-Path -Parent $PSScriptRoot
$audioDirectory = Join-Path $projectRoot 'public\audio'
[System.IO.Directory]::CreateDirectory($audioDirectory) | Out-Null
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $speech.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Name -eq 'Microsoft Huihui Desktop' } | Select-Object -First 1
if (-not $voice) { throw 'Microsoft Huihui Desktop is required for consistent Mandarin narration.' }
$speech.SelectVoice($voice.VoiceInfo.Name)
$speech.Rate = 0
$speech.Volume = 100

# Keep the caption manifest and generated audio fingerprinted against the same text.
$manifestPath = Join-Path $audioDirectory 'narration-source.json'
$buildPath = Join-Path $audioDirectory 'narration-build.json'
$previousBuild = $null
if (Test-Path -LiteralPath $buildPath) {
  $previousBuild = Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
$builtClips = [ordered]@{}
$generationSettings = [ordered]@{ voice = $voice.VoiceInfo.Name; rate = $speech.Rate; sampleRate = 22050; bits = 16; channels = 1 }
$sameSettings = $previousBuild -and $previousBuild.voice -eq $generationSettings.voice -and $previousBuild.rate -eq $generationSettings.rate -and $previousBuild.sampleRate -eq 22050 -and $previousBuild.bits -eq 16 -and $previousBuild.channels -eq 1
Push-Location $projectRoot
try {
  'import {writeFileSync} from "node:fs"; import {NARRATION} from "./src/narration.js"; writeFileSync("public/audio/narration-source.json", JSON.stringify(NARRATION,null,2),"utf8");' | & node --input-type=module
  if ($LASTEXITCODE -ne 0) { throw 'Could not read narration source.' }
  $narration = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($entry in $narration.PSObject.Properties) {
    $outputPath = Join-Path $audioDirectory ($entry.Name + '.wav')
    $previousClip = if ($previousBuild -and $previousBuild.clips) { $previousBuild.clips.PSObject.Properties[$entry.Name].Value } else { $null }
    $unchanged = -not $Force -and $sameSettings -and $previousClip -and $previousClip.text -ceq $entry.Value.text -and (Test-Path -LiteralPath $outputPath)
    if ($unchanged) {
      $unchanged = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $previousClip.sha256
    }
    if (-not $unchanged) {
      $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
      $speech.SetOutputToWaveFile($outputPath, $format)
      $speech.Speak($entry.Value.text)
      $speech.SetOutputToNull()
    }
    $builtClips[$entry.Name] = [ordered]@{ text = $entry.Value.text; sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = (Get-Item -LiteralPath $outputPath).Length }
    $result = if ($unchanged) { 'unchanged' } else { 'generated' }
    Write-Output ($entry.Name + ': ' + $result + ', ' + $builtClips[$entry.Name].bytes + ' bytes')
  }
  $generationSettings.clips = $builtClips
  $buildJson = $generationSettings | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($buildPath, $buildJson, [System.Text.UTF8Encoding]::new($false))
  Write-Output ('Voice: ' + $voice.VoiceInfo.Name)
} finally {
  Pop-Location
  $speech.Dispose()
}
