$ErrorActionPreference = 'Stop'
foreach ($browser in @('Google\Chrome', 'Microsoft\Edge')) {
    $key = "HKCU:\Software\$browser\NativeMessagingHosts\com.localwebsip.mock"
    if (Test-Path $key) { Remove-Item -Path $key }
}
$directory = Join-Path $env:LOCALAPPDATA 'LocalWebSip\mock-host'
if (Test-Path $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
Write-Host 'Development mock host registration removed.'
