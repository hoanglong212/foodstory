[CmdletBinding()]
param(
    [switch]$PersistUser
)

$ErrorActionPreference = 'Stop'

function Split-PathValue {
    param([AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return @()
    }

    return @(
        $Value -split ';' |
            ForEach-Object { $_.Trim().Trim('"') } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
}

function Merge-PathEntries {
    param([string[]]$Entries)

    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $result = New-Object 'System.Collections.Generic.List[string]'

    foreach ($entry in $Entries) {
        if ([string]::IsNullOrWhiteSpace($entry)) {
            continue
        }

        $cleanEntry = $entry.Trim().Trim('"').TrimEnd('\')
        if ([string]::IsNullOrWhiteSpace($cleanEntry)) {
            continue
        }

        if ($seen.Add($cleanEntry)) {
            $result.Add($cleanEntry)
        }
    }

    return @($result)
}

function Publish-EnvironmentChange {
    if (-not ('Codex.NativeMethods' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace Codex {
    public static class NativeMethods {
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern IntPtr SendMessageTimeout(
            IntPtr hWnd,
            uint message,
            UIntPtr wParam,
            string lParam,
            uint flags,
            uint timeout,
            out UIntPtr result
        );
    }
}
'@
    }

    $broadcastHandle = [IntPtr]0xffff
    $settingsChanged = 0x001A
    $abortIfHung = 0x0002
    $result = [UIntPtr]::Zero

    [void][Codex.NativeMethods]::SendMessageTimeout(
        $broadcastHandle,
        $settingsChanged,
        [UIntPtr]::Zero,
        'Environment',
        $abortIfHung,
        5000,
        [ref]$result
    )
}

$processEntries = Split-PathValue ([Environment]::GetEnvironmentVariable('Path', 'Process'))
$userEntries = Split-PathValue ([Environment]::GetEnvironmentVariable('Path', 'User'))
$machineEntries = Split-PathValue ([Environment]::GetEnvironmentVariable('Path', 'Machine'))

$systemRoot = if ($env:SystemRoot) { $env:SystemRoot } else { 'C:\Windows' }
$programFiles = if ($env:ProgramFiles) { $env:ProgramFiles } else { 'C:\Program Files' }
$roamingAppData = [Environment]::GetFolderPath('ApplicationData')

$requiredCandidates = @(
    (Join-Path $systemRoot 'System32'),
    $systemRoot,
    (Join-Path $systemRoot 'System32\Wbem'),
    (Join-Path $systemRoot 'System32\WindowsPowerShell\v1.0'),
    (Join-Path $systemRoot 'System32\OpenSSH'),
    (Join-Path $programFiles 'Git\cmd'),
    (Join-Path $programFiles 'nodejs'),
    'C:\tool',
    (Join-Path $roamingAppData 'npm')
)

$requiredEntries = @(
    $requiredCandidates |
        Where-Object { Test-Path -LiteralPath $_ -PathType Container }
)

$codexShimEntries = @(
    $processEntries |
        Where-Object { $_ -match '[\\/]\.codex[\\/]tmp[\\/]arg0[\\/]' }
)
$ordinaryProcessEntries = @(
    $processEntries |
        Where-Object { $_ -notmatch '[\\/]\.codex[\\/]tmp[\\/]arg0[\\/]' }
)

$repairedProcessEntries = Merge-PathEntries @(
    $codexShimEntries
    $requiredEntries
    $machineEntries
    $userEntries
    $ordinaryProcessEntries
)
$env:Path = $repairedProcessEntries -join ';'

if ($PersistUser) {
    $backupDirectory = Join-Path $env:USERPROFILE '.codex\path-backups'
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = Join-Path $backupDirectory "user-path-$timestamp.txt"
    [Environment]::GetEnvironmentVariable('Path', 'User') |
        Set-Content -LiteralPath $backupPath -Encoding UTF8

    # Include essential system directories because some IDE/Codex launchers
    # currently inherit the User PATH without merging the Machine PATH.
    $repairedUserEntries = Merge-PathEntries @(
        $requiredEntries
        $userEntries
    )
    [Environment]::SetEnvironmentVariable('Path', ($repairedUserEntries -join ';'), 'User')
    Publish-EnvironmentChange

    Write-Output "User PATH updated. Backup: $backupPath"
}

$commands = @('git', 'node', 'npm.cmd', 'rtk')
$missingCommands = @(
    foreach ($command in $commands) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            $command
        }
    }
)

if ($missingCommands.Count -gt 0) {
    throw "PATH repair incomplete. Missing commands: $($missingCommands -join ', ')"
}

Write-Output 'PATH repaired for this PowerShell process.'
foreach ($command in $commands) {
    $resolved = Get-Command $command -ErrorAction Stop | Select-Object -First 1
    Write-Output ("{0}: {1}" -f $command, $resolved.Source)
}

$rtkPath = (Get-Command 'rtk' -ErrorAction Stop | Select-Object -First 1).Source
$smokeChecks = @(
    @('git', '--version'),
    @('node', '--version'),
    @('proxy', 'npm.cmd', '--version')
)

foreach ($arguments in $smokeChecks) {
    & $rtkPath @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "PATH smoke check failed: rtk $($arguments -join ' ')"
    }
}

if ($PersistUser) {
    Write-Output 'Permanent repair complete. Restart the IDE once so it inherits the repaired PATH.'
}
