$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ((git branch --show-current) -ne 'security/guan-public-projection-v1') { throw 'Wrong Git branch' }
if (!(Test-Path '.\functions\test\memberIdentityRealAuth.emulator.test.cjs')) { throw 'Test file missing' }
$configFile = Join-Path $PSScriptRoot 'firebase.phase2c91.local.json'
if (Test-Path $configFile) { throw 'Temporary config already exists' }
try {
    $config = Get-Content '.\firebase.json' -Raw | ConvertFrom-Json
    $config.emulators | Add-Member -NotePropertyName auth -NotePropertyValue @{ port = 9099; host = '127.0.0.1' } -Force
    $config.emulators | Add-Member -NotePropertyName firestore -NotePropertyValue @{ port = 8080; host = '127.0.0.1' } -Force
    $config | ConvertTo-Json -Depth 20 | Set-Content $configFile -Encoding UTF8
    $env:GCLOUD_PROJECT = 'demo-guanguan-security'
    $env:GOOGLE_CLOUD_PROJECT = 'demo-guanguan-security'
    npm.cmd --prefix functions run build
    if ($LASTEXITCODE -ne 0) { throw 'Functions build failed' }
    npx.cmd firebase emulators:exec --config $configFile --only auth,firestore --project demo-guanguan-security 'node functions/test/memberIdentityRealAuth.emulator.test.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'Real Auth Emulator tests failed' }
    Write-Host 'PHASE 2C.9.1 REAL AUTH TESTS PASSED' -ForegroundColor Green
}
finally {
    if (Test-Path $configFile) { Remove-Item $configFile -Force }
}
git status --short
