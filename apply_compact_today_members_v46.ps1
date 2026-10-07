param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$file = Join-Path $ProjectPath "src\components\CheckInView.tsx"

if (-not (Test-Path $file)) {
    throw "ไม่พบไฟล์: $file"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$file.bak-today-members-$stamp"
Copy-Item $file $backup

Write-Host "Backup created:" -ForegroundColor Cyan
Write-Host "  $backup"
Write-Host ""

$text = Get-Content $file -Raw -Encoding UTF8

# ------------------------------------------------------------
# 1) Change default filter from ALL -> TODAY
# ------------------------------------------------------------
$oldState = "const [selectedFilter, setSelectedFilter] = useState<'all' | 'checked_in' | 'waiting' | 'playing' | 'resting' | 'absent'>('all');"
$newState = "const [selectedFilter, setSelectedFilter] = useState<'today' | 'all' | 'checked_in' | 'waiting' | 'playing' | 'resting' | 'absent'>('today');"

if ($text.Contains($oldState)) {
    $text = $text.Replace($oldState, $newState)
    Write-Host "[OK] Default view changed to TODAY" -ForegroundColor Green
}
elseif ($text.Contains("'today' | 'all'")) {
    Write-Host "[SKIP] TODAY filter already exists" -ForegroundColor Yellow
}
else {
    throw "ไม่พบ selectedFilter state รูปแบบที่รองรับ"
}

# ------------------------------------------------------------
# 2) Search should find ALL members, even when TODAY is selected
# ------------------------------------------------------------
$filterAnchor = @'
    if (!matchSearch) return false;

    // Status filter
'@

$filterInsert = @'
    if (!matchSearch) return false;

    // TODAY_MEMBERS_V46
    // Default page shows only today's checked-in players.
    // When the user types a search term, search the whole member master
    // so an absent member can still be found and checked in quickly.
    const hasSearch = searchTerm.trim().length > 0;

    if (selectedFilter === 'today' && !hasSearch && !p.isCheckedIn) {
      return false;
    }

    // Status filter
'@

if ($text.Contains($filterAnchor) -and $text -notmatch "TODAY_MEMBERS_V46") {
    $text = $text.Replace($filterAnchor, $filterInsert)
    Write-Host "[OK] TODAY filtering + search-all behavior added" -ForegroundColor Green
}
elseif ($text -match "TODAY_MEMBERS_V46") {
    Write-Host "[SKIP] TODAY filtering already installed" -ForegroundColor Yellow
}
else {
    throw "ไม่พบ filteredPlayers anchor"
}

# ------------------------------------------------------------
# 3) Replace the first filter chip: TODAY first, ALL second
# ------------------------------------------------------------
$allChipPattern = '(?s)<button\s+type="button"\s+onClick=\{\(\) => setSelectedFilter\(''all''\)\}\s+className=\{`px-3 py-1\.5 rounded-lg text-xs font-medium whitespace-nowrap transition \$\{\s*selectedFilter === ''all''\s*\? ''bg-slate-700 text-white font-semibold''\s*: ''bg-slate-950 text-slate-400 hover:text-white border border-slate-800''\s*\}`\}\s*>\s*ทั้งหมด \(\{players\.length\}\)\s*</button>'

$allChipMatch = [regex]::Match($text, $allChipPattern)

if ($allChipMatch.Success) {
    $replacement = @'
<button
              type="button"
              onClick={() => setSelectedFilter('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedFilter === 'today'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              วันนี้ ({checkedInCount})
            </button>

            {isOrganizerMode && (
              <button
                type="button"
                onClick={() => setSelectedFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  selectedFilter === 'all'
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
                title="แสดง Member Master ทั้งหมด"
              >
                สมาชิกทั้งหมด ({players.length})
              </button>
            )}
'@

    $text = $text.Remove($allChipMatch.Index, $allChipMatch.Length).Insert($allChipMatch.Index, $replacement)
    Write-Host "[OK] TODAY / ALL member chips updated" -ForegroundColor Green
}
elseif ($text -match "สมาชิกทั้งหมด \(\{players\.length\}\)") {
    Write-Host "[SKIP] TODAY / ALL chips already updated" -ForegroundColor Yellow
}
else {
    throw "ไม่พบปุ่ม filter 'ทั้งหมด' รูปแบบที่รองรับ"
}

# ------------------------------------------------------------
# 4) Improve search placeholder
# ------------------------------------------------------------
$oldPlaceholder = 'placeholder="ค้นหาชื่อเล่น, ชื่อจริง หรือเบอร์โทรศัพท์..."'
$newPlaceholder = 'placeholder="ค้นหาสมาชิกทั้งหมดเพื่อ Check-in: ชื่อเล่น, ชื่อจริง หรือเบอร์โทร..."'

if ($text.Contains($oldPlaceholder)) {
    $text = $text.Replace($oldPlaceholder, $newPlaceholder)
    Write-Host "[OK] Search placeholder updated" -ForegroundColor Green
}

# ------------------------------------------------------------
# 5) Add a compact Today summary above filter area
# ------------------------------------------------------------
$summaryAnchor = '        {/* Filter Chips & Search Input */}'

if ($text.Contains($summaryAnchor) -and $text -notmatch "TODAY_MEMBER_SUMMARY_V46") {
    $summary = @'
        {/* TODAY_MEMBER_SUMMARY_V46 */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏸</span>
            <div>
              <div className="text-xs font-bold text-white">
                ผู้เล่นวันนี้ {checkedInCount} คน
              </div>
              <div className="text-[10px] text-slate-400">
                Member Master ทั้งหมด {players.length} คน
              </div>
            </div>
          </div>
          <div className="text-[10px] text-emerald-300">
            พิมพ์ค้นหาเพื่อเรียกสมาชิกที่ยังไม่มา
          </div>
        </div>

        {/* Filter Chips & Search Input */}
'@

    $text = $text.Replace($summaryAnchor, $summary)
    Write-Host "[OK] Today summary added" -ForegroundColor Green
}

Set-Content -Path $file -Value $text -Encoding UTF8

Write-Host ""
Write-Host "Today Members compact view applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Behavior:" -ForegroundColor Yellow
Write-Host "  - Default: show today's checked-in players only"
Write-Host "  - Search: searches ALL members, including absent members"
Write-Host "  - Organizer: can open 'สมาชิกทั้งหมด'"
Write-Host "  - Member mode: no giant all-member list by default"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
Write-Host "  npm run dev"
