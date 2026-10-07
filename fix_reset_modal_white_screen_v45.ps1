param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$file = Join-Path $ProjectPath "src\components\DailyArchiveModal.tsx"

if (-not (Test-Path $file)) {
    throw "ไม่พบไฟล์: $file"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$file.bak-reset-white-screen-$stamp"
Copy-Item $file $backup

Write-Host "Backup created:" -ForegroundColor Cyan
Write-Host "  $backup"
Write-Host ""

$text = Get-Content $file -Raw -Encoding UTF8

if ($text -match 'const\s+checkedInPlayers\s*=') {
    Write-Host "[SKIP] checkedInPlayers already exists" -ForegroundColor Yellow
}
else {
    $anchor = '  const { sessionConfig, players, activeMatches, matchHistory } = currentState;'

    $idx = $text.IndexOf($anchor)
    if ($idx -lt 0) {
        throw "ไม่พบ currentState destructuring ใน DailyArchiveModal.tsx"
    }

    $insertAt = $idx + $anchor.Length

    $insert = @'

  // RESET_MODAL_WHITE_SCREEN_FIX_V45
  // Used by the summary card in this modal.
  const checkedInPlayers = players.filter((p) => p.isCheckedIn);
'@

    $text = $text.Insert($insertAt, $insert)
    Set-Content -Path $file -Value $text -Encoding UTF8

    Write-Host "[OK] Added checkedInPlayers definition" -ForegroundColor Green
}

Write-Host ""
Write-Host "Reset modal white-screen fix applied." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
Write-Host "  npm run dev"
