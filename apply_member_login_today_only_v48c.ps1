param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$file = Join-Path $ProjectPath "src\App.tsx"

if (-not (Test-Path $file)) {
    throw "ไม่พบไฟล์: $file"
}

$text = Get-Content -Path $file -Raw -Encoding UTF8

Write-Host "Validating MemberGateModal..." -ForegroundColor Cyan

if ($text -match "MEMBER_GATE_TODAY_ONLY_V48C") {
    Write-Host "[SKIP] MemberGate already uses Today's Roster only" -ForegroundColor Yellow
    exit 0
}

$start = $text.IndexOf("<MemberGateModal")
if ($start -lt 0) {
    throw "ไม่พบ <MemberGateModal ใน App.tsx"
}

$end = $text.IndexOf("/>", $start)
if ($end -lt 0) {
    throw "ไม่พบจุดปิด /> ของ MemberGateModal"
}

$blockLength = ($end + 2) - $start
$block = $text.Substring($start, $blockLength)

$needle = "players={players}"
$idx = $block.IndexOf($needle)

if ($idx -lt 0) {
    throw "ไม่พบ players={players} ภายใน MemberGateModal"
}

$replacement = @'
players={players.filter((p) =>
          Boolean(
            p.todayRoster ||
            p.isCheckedIn ||
            (p.matchesPlayed || 0) > 0 ||
            (p.extraShuttlecocks || 0) > 0 ||
            p.paid
          )
        )} /* MEMBER_GATE_TODAY_ONLY_V48C */
'@

$newBlock = $block.Remove($idx, $needle.Length).Insert($idx, $replacement)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$file.bak-member-gate-today-v48c-$stamp"
Copy-Item $file $backup

$newText = $text.Remove($start, $blockLength).Insert($start, $newBlock)
Set-Content -Path $file -Value $newText -Encoding UTF8

Write-Host ""
Write-Host "Backup created:" -ForegroundColor Cyan
Write-Host "  $backup"
Write-Host ""
Write-Host "[OK] Member login now shows Today's Roster only." -ForegroundColor Green
Write-Host ""
Write-Host "Behavior:" -ForegroundColor Yellow
Write-Host "  - หน้าแรกเลือกชื่อสมาชิก = เห็นเฉพาะรายชื่อวันนี้"
Write-Host "  - Member Master ทั้งหมดยังอยู่ครบ"
Write-Host "  - Organizer ยังสามารถเพิ่มสมาชิกเข้า '+ วันนี้' ได้จากหน้า Check-in"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  npm run build"
Write-Host "  npm run dev"
