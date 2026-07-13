[CmdletBinding()]
param(
  [switch]$SkipNpmInstall,
  [switch]$SkipPythonInstall
)

$ErrorActionPreference = 'Stop'
$BackendRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $BackendRoot '.env'
$RequirementsPath = Join-Path $BackendRoot 'requirements-track2-v3.txt'

function Read-DotEnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Test-Path $EnvPath)) { return $null }
  $line = Get-Content $EnvPath | Where-Object {
    $_ -match ('^\s*' + [regex]::Escape($Name) + '\s*=')
  } | Select-Object -Last 1
  if (-not $line) { return $null }
  $value = ($line -replace ('^\s*' + [regex]::Escape($Name) + '\s*=\s*'), '').Trim()
  return $value.Trim('"').Trim("'")
}

function Set-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )
  if (-not (Test-Path $EnvPath)) {
    $example = Join-Path $BackendRoot '.env.example'
    if (Test-Path $example) { Copy-Item $example $EnvPath }
    else { New-Item -ItemType File -Path $EnvPath -Force | Out-Null }
  }
  $escaped = $Value.Replace('"', '\"')
  $line = '{0}="{1}"' -f $Name, $escaped
  $content = @(Get-Content $EnvPath)
  $pattern = '^\s*' + [regex]::Escape($Name) + '\s*='
  $replaced = $false
  for ($i = 0; $i -lt $content.Count; $i++) {
    if ($content[$i] -match $pattern) {
      $content[$i] = $line
      $replaced = $true
    }
  }
  if (-not $replaced) { $content += $line }
  Set-Content -Path $EnvPath -Value $content -Encoding UTF8
}

function Resolve-CommandPath {
  param([Parameter(Mandatory = $true)][string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Test-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  try {
    & $Command @Arguments *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Resolve-Python {
  $configured = Read-DotEnvValue 'TRACK2_V3_ASR_PYTHON_BIN'
  $candidates = @(
    $configured,
    (Join-Path (Split-Path -Parent $BackendRoot) '.venv\Scripts\python.exe'),
    (Join-Path $BackendRoot '.venv\Scripts\python.exe')
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) { return $python.Source }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) { return $py.Source }
  return $null
}

Write-Host "Track 2 V3 Windows setup" -ForegroundColor Cyan
Write-Host "Backend: $BackendRoot"

if (-not $SkipNpmInstall) {
  Write-Host "`n[1/4] Installing Node dependencies..." -ForegroundColor Cyan
  Push-Location $BackendRoot
  try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "`n[1/4] Node install skipped." -ForegroundColor Yellow
}

Write-Host "`n[2/4] Resolving ASR Python..." -ForegroundColor Cyan
$Python = Resolve-Python
if (-not $Python) {
  throw 'No Python executable was found. Create C:\COS30043\foodstory\.venv or configure TRACK2_V3_ASR_PYTHON_BIN.'
}
Write-Host "Python: $Python"

$asrEnabled = (Read-DotEnvValue 'TRACK2_V3_ASR_FALLBACK_ENABLED') -match '^(?i:true|1|yes|on)$'
$hasWhisper = Test-ExternalCommand -Command $Python -Arguments @('-c', 'import faster_whisper')
$hasYtDlpModule = Test-ExternalCommand -Command $Python -Arguments @('-c', 'import yt_dlp')
$needsPythonPackages = (-not $hasYtDlpModule) -or ($asrEnabled -and -not $hasWhisper)

if ($needsPythonPackages) {
  if ($SkipPythonInstall) {
    throw 'yt-dlp or faster-whisper is missing while Python installation was skipped.'
  }
  Write-Host "`n[3/4] Installing yt-dlp and enabled ASR requirements..." -ForegroundColor Cyan
  & $Python -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw 'Failed to upgrade pip.' }
  & $Python -m pip install -r $RequirementsPath
  if ($LASTEXITCODE -ne 0) { throw 'Failed to install Track 2 V3 Python requirements.' }
} else {
  Write-Host "`n[3/4] yt-dlp and enabled ASR requirements are already available." -ForegroundColor Green
}

$YtDlp = (& $Python -c "import shutil; print(shutil.which('yt-dlp') or '')").Trim()
if (-not $YtDlp) {
  throw 'yt-dlp was installed but its executable could not be resolved.'
}
Set-DotEnvValue 'TRACK2_YTDLP_BIN' $YtDlp
Set-DotEnvValue 'YOUTUBE_YT_DLP_PATH' $YtDlp
Set-DotEnvValue 'TRACK2_V3_ASR_PYTHON_BIN' $Python

$Ffmpeg = Resolve-CommandPath 'ffmpeg'
$Ffprobe = Resolve-CommandPath 'ffprobe'
$Tesseract = Resolve-CommandPath 'tesseract'
if ($Ffmpeg) { Set-DotEnvValue 'TRACK2_FFMPEG_BIN' $Ffmpeg; Set-DotEnvValue 'YOUTUBE_FFMPEG_PATH' $Ffmpeg }
if ($Ffprobe) { Set-DotEnvValue 'TRACK2_FFPROBE_BIN' $Ffprobe }
if ($Tesseract) { Set-DotEnvValue 'TRACK2_V3_TESSERACT_BIN' $Tesseract; Set-DotEnvValue 'TRACK2_TESSERACT_BIN' $Tesseract }

Write-Host "Resolved yt-dlp: $YtDlp" -ForegroundColor Green
if (-not $Ffmpeg) { Write-Warning 'ffmpeg is not on PATH. Install it or set TRACK2_FFMPEG_BIN in .env.' }
if (-not $Ffprobe) { Write-Warning 'ffprobe is not on PATH. Install it or set TRACK2_FFPROBE_BIN in .env.' }
if (-not $Tesseract) { Write-Warning 'tesseract is not on PATH. Install it or set TRACK2_V3_TESSERACT_BIN in .env.' }

Write-Host "`n[4/4] Running production preflight..." -ForegroundColor Cyan
Push-Location $BackendRoot
try {
  npm run preflight:track2-v3
  if ($LASTEXITCODE -ne 0) {
    throw 'Track 2 V3 preflight is not ready. Read the JSON checks above; no secret values are printed.'
  }
} finally {
  Pop-Location
}

Write-Host "`nTrack 2 V3 setup is READY." -ForegroundColor Green
Write-Host 'Next: npm run verify:track2-v3'
Write-Host 'Live URL: npm run verify:vision-auto:live -- <youtube-shorts-url>'
