param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string] $ExtensionId
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hostScript = Join-Path $root 'native-host\host.js'
if ($node -match '[^\x20-\x7E]|[%"]' -or $hostScript -match '[^\x20-\x7E]|[%"]') {
    throw 'The development launcher requires ASCII paths without percent signs or quotes.'
}
$directory = Join-Path $env:LOCALAPPDATA 'LocalWebSip\mock-host'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$launcher = Join-Path $directory 'localwebsip-mock.cmd'
$manifest = Join-Path $directory 'com.localwebsip.mock.json'

@"
@echo off
"$node" "$hostScript"
"@ | Set-Content -LiteralPath $launcher -Encoding Ascii

@{
    name = 'com.localwebsip.mock'
    description = 'LocalWebSip development-only mock'
    path = $launcher
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json | Set-Content -LiteralPath $manifest -Encoding UTF8

foreach ($browser in @('Google\Chrome', 'Microsoft\Edge')) {
    $key = "HKCU:\Software\$browser\NativeMessagingHosts\com.localwebsip.mock"
    New-Item -Path $key -Force | Out-Null
    Set-Item -Path $key -Value $manifest
}
Write-Host "Registered development mock for $ExtensionId. This is not a SIP phone."
