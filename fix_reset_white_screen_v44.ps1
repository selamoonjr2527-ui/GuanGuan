param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$appFile = Join-Path $ProjectPath "src\App.tsx"

if (-not (Test-Path $appFile)) {
    throw "ไม่พบไฟล์: $appFile"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$appFile.bak-reset-fix-$stamp"
Copy-Item $appFile $backup

Write-Host "Backup created:" -ForegroundColor Cyan
Write-Host "  $backup"
Write-Host ""

$app = Get-Content $appFile -Raw -Encoding UTF8

$oldSpread = @'
          setAppState((prev) => ({
            ...newState,
'@

$newSpread = @'
          setAppState((prev) => ({
            // RESET_WHITE_SCREEN_FIX_V44
            // Preserve the complete previous AppState first because
            // DailyArchiveModal may return only the fields it resets.
            ...prev,
            ...(newState || {}),
'@

if ($app.Contains($oldSpread)) {
    $app = $app.Replace($oldSpread, $newSpread)
    Write-Host "[OK] Added safe AppState fallback" -ForegroundColor Green
}
elseif ($app -match "RESET_WHITE_SCREEN_FIX_V44") {
    Write-Host "[SKIP] Safe AppState fallback already installed" -ForegroundColor Yellow
}
else {
    throw "ไม่พบ onResetSession setAppState รูปแบบเดิมใน App.tsx"
}

$oldPlayers = '            players: newState.players.map((player) => ({'
$newPlayers = @'
            players: (
              Array.isArray(newState?.players)
                ? newState.players
                : prev.players
            ).map((player) => ({
'@

if ($app.Contains($oldPlayers)) {
    $app = $app.Replace($oldPlayers, $newPlayers)
    Write-Host "[OK] Added safe players fallback" -ForegroundColor Green
}
elseif ($app.Contains("Array.isArray(newState?.players)")) {
    Write-Host "[SKIP] Safe players fallback already installed" -ForegroundColor Yellow
}
else {
    throw "ไม่พบ players: newState.players.map ใน onResetSession"
}

Set-Content -Path $appFile -Value $app -Encoding UTF8

Write-Host ""
Write-Host "Reset white-screen fix applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
Write-Host "  npm run dev"
