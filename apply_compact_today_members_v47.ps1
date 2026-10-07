param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$file = Join-Path $ProjectPath "src\components\CheckInView.tsx"

if (-not (Test-Path $file)) {
    throw "ไม่พบไฟล์: $file"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$file.bak-today-members-v47-$stamp"
Copy-Item $file $backup

Write-Host "Backup created:" -ForegroundColor Cyan
Write-Host "  $backup"
Write-Host ""

$text = Get-Content $file -Raw -Encoding UTF8

# ============================================================
# 1) selectedFilter: add TODAY and make it default
# ============================================================
if ($text -notmatch "TODAY_MEMBERS_V47") {
    $pattern = "const \[selectedFilter, setSelectedFilter\] = useState<([^>]+)>\('all'\);"
    $match = [regex]::Match($text, $pattern)

    if (-not $match.Success) {
        throw "ไม่พบ selectedFilter state ใน CheckInView.tsx"
    }

    $oldUnion = $match.Groups[1].Value

    if ($oldUnion -notmatch "'today'") {
        $newUnion = "'today' | " + $oldUnion
    } else {
        $newUnion = $oldUnion
    }

    $replacement = "const [selectedFilter, setSelectedFilter] = useState<$newUnion>('today'); // TODAY_MEMBERS_V47"
    $text = $text.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)

    Write-Host "[OK] Default filter = TODAY" -ForegroundColor Green
}
else {
    Write-Host "[SKIP] TODAY state already installed" -ForegroundColor Yellow
}

# ============================================================
# 2) TODAY behavior:
#    - no search => only checked-in players
#    - typing search => search ALL member master
# ============================================================
if ($text -notmatch "TODAY_SEARCH_ALL_V47") {
    $pattern = "if\s*\(\s*!matchSearch\s*\)\s*return false;"
    $match = [regex]::Match($text, $pattern)

    if (-not $match.Success) {
        throw "ไม่พบ if (!matchSearch) return false; ภายใน filteredPlayers"
    }

    $insertAt = $match.Index + $match.Length

    $insert = @'

    // TODAY_SEARCH_ALL_V47
    // Default = only today's checked-in players.
    // If user types in search, search the whole member master.
    const hasSearch = searchTerm.trim().length > 0;

    if (selectedFilter === 'today' && !hasSearch && !p.isCheckedIn) {
      return false;
    }
'@

    $text = $text.Insert($insertAt, $insert)
    Write-Host "[OK] TODAY filter + Search All behavior added" -ForegroundColor Green
}
else {
    Write-Host "[SKIP] TODAY search behavior already installed" -ForegroundColor Yellow
}

# ============================================================
# 3) Add TODAY chip before existing ALL chip
# ============================================================
if ($text -notmatch "TODAY_FILTER_BUTTON_V47") {
    $allClick = "onClick={() => setSelectedFilter('all')}"
    $clickIndex = $text.IndexOf($allClick)

    if ($clickIndex -lt 0) {
        Write-Host "[WARN] ไม่พบปุ่ม All เดิม - ข้ามการเพิ่มปุ่ม Today" -ForegroundColor Yellow
    }
    else {
        $buttonIndex = $text.LastIndexOf("<button", $clickIndex)

        if ($buttonIndex -lt 0) {
            Write-Host "[WARN] ไม่พบ <button ก่อนปุ่ม All - ข้ามการเพิ่มปุ่ม Today" -ForegroundColor Yellow
        }
        else {
            $todayButton = @'
            {/* TODAY_FILTER_BUTTON_V47 */}
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

'@
            $text = $text.Insert($buttonIndex, $todayButton)
            Write-Host "[OK] TODAY filter button added" -ForegroundColor Green
        }
    }
}
else {
    Write-Host "[SKIP] TODAY button already installed" -ForegroundColor Yellow
}

# ============================================================
# 4) Rename ALL chip text only
# ============================================================
if ($text -match "ทั้งหมด \(\{players\.length\}\)") {
    $text = [regex]::Replace(
        $text,
        "ทั้งหมด \(\{players\.length\}\)",
        "สมาชิกทั้งหมด ({players.length})",
        1
    )
    Write-Host "[OK] 'ทั้งหมด' renamed to 'สมาชิกทั้งหมด'" -ForegroundColor Green
}

# ============================================================
# 5) Search placeholder
# ============================================================
$oldPlaceholder = 'placeholder="ค้นหาชื่อเล่น, ชื่อจริง หรือเบอร์โทรศัพท์..."'
$newPlaceholder = 'placeholder="ค้นหาสมาชิกทั้งหมดเพื่อ Check-in: ชื่อเล่น, ชื่อจริง หรือเบอร์โทร..."'

if ($text.Contains($oldPlaceholder)) {
    $text = $text.Replace($oldPlaceholder, $newPlaceholder)
    Write-Host "[OK] Search placeholder updated" -ForegroundColor Green
}

# ============================================================
# 6) Add compact Today summary
# ============================================================
if ($text -notmatch "TODAY_MEMBER_SUMMARY_V47") {
    $anchor = "        {/* Filter Chips & Search Input */}"
    $idx = $text.IndexOf($anchor)

    if ($idx -ge 0) {
        $summary = @'
        {/* TODAY_MEMBER_SUMMARY_V47 */}
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

'@
        $text = $text.Insert($idx, $summary)
        Write-Host "[OK] Today summary added" -ForegroundColor Green
    }
    else {
        Write-Host "[WARN] ไม่พบ Filter Chips comment - ข้าม Today summary" -ForegroundColor Yellow
    }
}

# ============================================================
# 7) Save
# ============================================================
Set-Content -Path $file -Value $text -Encoding UTF8

Write-Host ""
Write-Host "Compact Today Members v47 applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Behavior:" -ForegroundColor Yellow
Write-Host "  - เปิดหน้า Check-in = แสดงเฉพาะคนที่ Check-in วันนี้"
Write-Host "  - พิมพ์ Search = ค้นหาจากสมาชิกทั้งหมด"
Write-Host "  - ปุ่ม วันนี้ = กลับมาดูคนที่มาเล่นวันนี้"
Write-Host "  - ปุ่ม สมาชิกทั้งหมด = ดู Member Master ทั้งหมด"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
Write-Host "  npm run dev"
