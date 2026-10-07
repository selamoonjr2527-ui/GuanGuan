param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

function Read-Utf8([string]$Path) {
    Get-Content -Path $Path -Raw -Encoding UTF8
}

function Insert-AfterFirst {
    param(
        [string]$Text,
        [string]$Needle,
        [string]$Insert,
        [string]$Label
    )
    $idx = $Text.IndexOf($Needle)
    if ($idx -lt 0) { throw "ไม่พบ anchor: $Label" }
    $pos = $idx + $Needle.Length
    return $Text.Insert($pos, $Insert)
}

$typesPath   = Join-Path $ProjectPath "src\types.ts"
$storagePath = Join-Path $ProjectPath "src\utils\storage.ts"
$appPath     = Join-Path $ProjectPath "src\App.tsx"
$checkPath   = Join-Path $ProjectPath "src\components\CheckInView.tsx"

foreach ($p in @($typesPath,$storagePath,$appPath,$checkPath)) {
    if (-not (Test-Path $p)) { throw "ไม่พบไฟล์: $p" }
}

$types   = Read-Utf8 $typesPath
$storage = Read-Utf8 $storagePath
$app     = Read-Utf8 $appPath
$check   = Read-Utf8 $checkPath

Write-Host "Validating current source..." -ForegroundColor Cyan

# ============================================================
# 1) Player model
# ============================================================
if ($types -notmatch "todayRoster\?:\s*boolean") {
    $needle = "  isCheckedIn: boolean;"
    if (-not $types.Contains($needle)) { throw "ไม่พบ Player.isCheckedIn ใน types.ts" }

    $types = $types.Replace(
        $needle,
        "  isCheckedIn: boolean;`r`n  todayRoster?: boolean; // สมาชิกที่อยู่ในรายชื่อเล่นของ session วันนี้"
    )
    Write-Host "[OK] Player.todayRoster prepared" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Player.todayRoster already exists" -ForegroundColor Yellow
}

# ============================================================
# 2) Daily Reset clears Today's Roster
# ============================================================
if ($storage -notmatch "TODAY_ROSTER_RESET_V48B") {
    $start = $storage.IndexOf("export function createNewDaySessionState(")
    if ($start -lt 0) { throw "ไม่พบ createNewDaySessionState" }

    $end = $storage.IndexOf("export function exportAppStateAsJSON", $start)
    if ($end -lt 0) { $end = $storage.Length }

    $seg = $storage.Substring($start, $end - $start)

    if ($seg -notmatch "todayRoster:\s*false") {
        $needle = "        isCheckedIn: false,"
        $idx = $seg.IndexOf($needle)
        if ($idx -lt 0) { throw "ไม่พบ isCheckedIn:false ใน createNewDaySessionState" }

        $seg = $seg.Remove($idx, $needle.Length).Insert(
            $idx,
            "        isCheckedIn: false,`r`n        todayRoster: false, // TODAY_ROSTER_RESET_V48B"
        )
        $storage = $storage.Remove($start, $end - $start).Insert($start, $seg)
    }

    Write-Host "[OK] Daily Reset clears Today's Roster" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Daily Reset already patched" -ForegroundColor Yellow
}

# ============================================================
# 3) App: Check-in auto joins Today
# ============================================================
$checkInStart = $app.IndexOf("const handleCheckInPlayer")
$checkOutStart = if ($checkInStart -ge 0) { $app.IndexOf("const handleCheckOutPlayer", $checkInStart) } else { -1 }

if ($checkInStart -lt 0 -or $checkOutStart -lt 0) {
    throw "ไม่พบ handleCheckInPlayer / handleCheckOutPlayer ใน App.tsx"
}

$seg = $app.Substring($checkInStart, $checkOutStart - $checkInStart)

if ($seg -notmatch "todayRoster:\s*true") {
    $needle = "            isCheckedIn: true,"
    $idx = $seg.IndexOf($needle)
    if ($idx -lt 0) { throw "ไม่พบ isCheckedIn:true ใน handleCheckInPlayer" }

    $seg = $seg.Remove($idx, $needle.Length).Insert(
        $idx,
        "            isCheckedIn: true,`r`n            todayRoster: true, // TODAY_ROSTER_CHECKIN_V48B"
    )
    $app = $app.Remove($checkInStart, $checkOutStart - $checkInStart).Insert($checkInStart, $seg)
    Write-Host "[OK] Check-in automatically joins Today" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Check-in already joins Today" -ForegroundColor Yellow
}

# Quick Walk-in/new quick add
$quickStart = $app.IndexOf("const handleQuickAddAndCheckIn")
if ($quickStart -ge 0) {
    $quickEnd = $app.IndexOf("const handleToggleWalkInPenalty", $quickStart)

    if ($quickEnd -gt $quickStart) {
        $seg = $app.Substring($quickStart, $quickEnd - $quickStart)

        if ($seg -notmatch "todayRoster:\s*true") {
            $needle = "      isCheckedIn: true,"
            $idx = $seg.IndexOf($needle)
            if ($idx -ge 0) {
                $seg = $seg.Remove($idx, $needle.Length).Insert(
                    $idx,
                    "      isCheckedIn: true,`r`n      todayRoster: true,"
                )
                $app = $app.Remove($quickStart, $quickEnd - $quickStart).Insert($quickStart, $seg)
                Write-Host "[OK] Walk-in automatically joins Today" -ForegroundColor Green
            }
        }
    }
}

# ============================================================
# 4) App: Today roster handler
# ============================================================
if ($app -notmatch "TODAY_ROSTER_HANDLER_V48B") {
    $anchor = "  const handleToggleCheckIn = (playerId: string) => {"
    $idx = $app.IndexOf($anchor)

    if ($idx -lt 0) { throw "ไม่พบ handleToggleCheckIn ใน App.tsx" }

    $handler = @'
  // TODAY_ROSTER_HANDLER_V48B
  const handleToggleTodayRoster = (playerId: string, inRoster: boolean) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId) return p;

        const hasTodayActivity =
          p.isCheckedIn ||
          (p.matchesPlayed || 0) > 0 ||
          (p.extraShuttlecocks || 0) > 0 ||
          Boolean(p.paid);

        // Prevent accidental removal after the member has started today's session.
        if (!inRoster && hasTodayActivity) {
          return p;
        }

        return {
          ...p,
          todayRoster: inRoster,
        };
      }),
    }));
  };

'@
    $app = $app.Insert($idx, $handler)
    Write-Host "[OK] Today roster handler added" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Today roster handler already exists" -ForegroundColor Yellow
}

# Pass handler to CheckInView
if ($app -notmatch "onToggleTodayRoster=\{handleToggleTodayRoster\}") {
    $needle = "onCheckOutPlayer={handleCheckOutPlayer}"
    $idx = $app.IndexOf($needle)
    if ($idx -lt 0) { throw "ไม่พบ CheckInView onCheckOutPlayer prop" }

    $lineStart = $app.LastIndexOf("`n", $idx)
    if ($lineStart -lt 0) { $lineStart = 0 } else { $lineStart++ }

    $lineEnd = $app.IndexOf("`n", $idx)
    if ($lineEnd -lt 0) { throw "หา line end ของ onCheckOutPlayer ไม่พบ" }

    $line = $app.Substring($lineStart, $lineEnd - $lineStart + 1)
    $indent = ([regex]::Match($line, "^\s*")).Value

    $app = $app.Insert(
        $lineEnd + 1,
        $indent + "onToggleTodayRoster={handleToggleTodayRoster}`r`n"
    )

    Write-Host "[OK] CheckInView receives Today roster handler" -ForegroundColor Green
}

# ============================================================
# 5) CheckInView prop
# ============================================================
if ($check -notmatch "onToggleTodayRoster\?:") {
    $needle = "  onCheckOutPlayer?: (playerId: string) => void;"
    if (-not $check.Contains($needle)) { throw "ไม่พบ onCheckOutPlayer prop ใน CheckInView" }

    $check = $check.Replace(
        $needle,
        "$needle`r`n  onToggleTodayRoster?: (playerId: string, inRoster: boolean) => void;"
    )
}

if ($check -notmatch "(?m)^\s*onToggleTodayRoster,\s*$") {
    $pattern = "(?m)^(\s*)onCheckOutPlayer,\s*$"
    $m = [regex]::Match($check, $pattern)

    if (-not $m.Success) { throw "ไม่พบ onCheckOutPlayer ใน destructuring ของ CheckInView" }

    $replacement = $m.Value + "`r`n" + $m.Groups[1].Value + "onToggleTodayRoster,"
    $check = $check.Remove($m.Index, $m.Length).Insert($m.Index, $replacement)
}

# ============================================================
# 6) CheckInView helper + Today count
# ============================================================
if ($check -notmatch "TODAY_ROSTER_HELPER_V48B") {
    $anchor = "  // Computed counts"
    $idx = $check.IndexOf($anchor)
    if ($idx -lt 0) { throw "ไม่พบ // Computed counts ใน CheckInView" }

    $helper = @'
  // TODAY_ROSTER_HELPER_V48B
  const isTodayRosterPlayer = (p: Player) =>
    Boolean(
      p.todayRoster ||
      p.isCheckedIn ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      p.paid
    );

'@
    $check = $check.Insert($idx, $helper)
}

if ($check -notmatch "const todayRosterCount") {
    $needle = "  const checkedInCount = players.filter((p) => p.isCheckedIn).length;"
    if (-not $check.Contains($needle)) { throw "ไม่พบ checkedInCount ใน CheckInView" }

    $check = $check.Replace(
        $needle,
        "  const todayRosterCount = players.filter(isTodayRosterPlayer).length;`r`n$needle"
    )
}

# Absents = today's roster but not checked in
$check = [regex]::Replace(
    $check,
    "const absentCount = players\.filter\(\(p\) => !p\.isCheckedIn\)\.length;",
    "const absentCount = players.filter((p) => isTodayRosterPlayer(p) && !p.isCheckedIn).length;",
    1
)

# Current member lookup
if ($check -notmatch "const currentMemberForToday") {
    $needle = "  const absentCount = players.filter((p) => isTodayRosterPlayer(p) && !p.isCheckedIn).length;"
    $idx = $check.IndexOf($needle)

    if ($idx -lt 0) { throw "ไม่พบ absentCount หลังปรับ Today roster" }

    $lineEnd = $check.IndexOf("`n", $idx)
    if ($lineEnd -lt 0) { throw "หา line end absentCount ไม่พบ" }

    $insert = @'
  const currentMemberForToday = currentMemberId
    ? players.find((p) => p.id === currentMemberId)
    : undefined;

'@
    $check = $check.Insert($lineEnd + 1, $insert)
}

# ============================================================
# 7) selectedFilter default Today
# ============================================================
$statePattern = "const \[selectedFilter, setSelectedFilter\] = useState<([^>]+)>\('(?:all|today)'\);(?:\s*//[^\r\n]*)?"
$m = [regex]::Match($check, $statePattern)

if (-not $m.Success) {
    throw "ไม่พบ selectedFilter state ใน CheckInView"
}

$union = $m.Groups[1].Value
if ($union -notmatch "'today'") {
    $union = "'today' | " + $union
}

$newState = "const [selectedFilter, setSelectedFilter] = useState<$union>('today'); // TODAY_ROSTER_FILTER_V48B"
$check = $check.Remove($m.Index, $m.Length).Insert($m.Index, $newState)

# ============================================================
# 8) Today filter behavior
# ============================================================
if ($check -match "TODAY_SEARCH_ALL_V47") {
    $check = $check.Replace(
        "if (selectedFilter === 'today' && !hasSearch && !p.isCheckedIn) {",
        "if (selectedFilter === 'today' && !hasSearch && !isTodayRosterPlayer(p)) {"
    )
} elseif ($check -notmatch "TODAY_ROSTER_SEARCH_V48B") {
    $pattern = "if\s*\(\s*!matchSearch\s*\)\s*return false;"
    $m = [regex]::Match($check, $pattern)

    if (-not $m.Success) { throw "ไม่พบ if (!matchSearch) return false ใน filteredPlayers" }

    $insert = @'

    // TODAY_ROSTER_SEARCH_V48B
    // No search: show Today's Roster only.
    // Searching: search the whole Member Master.
    const hasSearch = searchTerm.trim().length > 0;

    if (selectedFilter === 'today' && !hasSearch && !isTodayRosterPlayer(p)) {
      return false;
    }
'@
    $check = $check.Insert($m.Index + $m.Length, $insert)
}

$check = $check.Replace(
    "if (selectedFilter === 'absent' && p.isCheckedIn) return false;",
    "if (selectedFilter === 'absent' && (p.isCheckedIn || !isTodayRosterPlayer(p))) return false;"
)

# ============================================================
# 9) Today button
# ============================================================
if ($check -notmatch "setSelectedFilter\('today'\)") {
    $allClick = "onClick={() => setSelectedFilter('all')}"
    $clickIdx = $check.IndexOf($allClick)

    if ($clickIdx -lt 0) { throw "ไม่พบปุ่ม filter ทั้งหมด" }

    $buttonIdx = $check.LastIndexOf("<button", $clickIdx)
    if ($buttonIdx -lt 0) { throw "ไม่พบ <button> ของ filter ทั้งหมด" }

    $todayButton = @'
            {/* TODAY_ROSTER_BUTTON_V48B */}
            <button
              type="button"
              onClick={() => setSelectedFilter('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedFilter === 'today'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              วันนี้ ({todayRosterCount})
            </button>

'@
    $check = $check.Insert($buttonIdx, $todayButton)
}

$check = $check.Replace("วันนี้ ({checkedInCount})", "วันนี้ ({todayRosterCount})")
$check = $check.Replace("ผู้เล่นวันนี้ {checkedInCount} คน", "รายชื่อวันนี้ {todayRosterCount} คน")

# ============================================================
# 10) Organizer + วันนี้ / member self register
# ============================================================
if ($check -notmatch "const inTodayRoster = isTodayRosterPlayer\(player\)") {
    $needle = "          const canActOnPlayer = isOrganizerMode || isCurrentUser;"
    if (-not $check.Contains($needle)) { throw "ไม่พบ canActOnPlayer ใน Player Card" }

    $check = $check.Replace(
        $needle,
@'
          const canActOnPlayer = isOrganizerMode || isCurrentUser;
          const inTodayRoster = isTodayRosterPlayer(player);
          const hasTodayActivity =
            player.isCheckedIn ||
            (player.matchesPlayed || 0) > 0 ||
            (player.extraShuttlecocks || 0) > 0 ||
            Boolean(player.paid);
'@
    )
}

if ($check -notmatch "TODAY_ROSTER_CARD_ACTION_V48B") {
    $anchor = "                {/* Edit & Delete Player Buttons (Organizer Only) */}"
    $idx = $check.IndexOf($anchor)

    if ($idx -lt 0) { throw "ไม่พบ Organizer action anchor ใน CheckInView" }

    $action = @'
                {/* TODAY_ROSTER_CARD_ACTION_V48B */}
                {isOrganizerMode && onToggleTodayRoster && (
                  <button
                    type="button"
                    disabled={inTodayRoster && hasTodayActivity}
                    onClick={() => onToggleTodayRoster(player.id, !inTodayRoster)}
                    className={`px-2.5 py-2 rounded-lg text-[10px] font-black border transition ${
                      inTodayRoster
                        ? hasTodayActivity
                          ? 'bg-emerald-950/40 text-emerald-500/70 border-emerald-900/50 cursor-not-allowed'
                          : 'bg-emerald-950/70 hover:bg-rose-950/70 text-emerald-300 hover:text-rose-300 border-emerald-800/60'
                        : 'bg-cyan-950/60 hover:bg-cyan-900/70 text-cyan-300 border-cyan-800/60'
                    }`}
                  >
                    {inTodayRoster ? '✓ วันนี้' : '+ วันนี้'}
                  </button>
                )}

'@
    $check = $check.Insert($idx, $action)
}

if ($check -notmatch "TODAY_ROSTER_SELF_REGISTER_V48B") {
    $anchor = "      {/* Player Cards Grid */}"
    $idx = $check.IndexOf($anchor)

    if ($idx -lt 0) { throw "ไม่พบ Player Cards Grid ใน CheckInView" }

    $block = @'
      {/* TODAY_ROSTER_SELF_REGISTER_V48B */}
      {!isOrganizerMode &&
        currentMemberForToday &&
        !isTodayRosterPlayer(currentMemberForToday) &&
        onToggleTodayRoster && (
          <div className="rounded-2xl border border-cyan-700/50 bg-cyan-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-white">จะมาเล่นวันนี้ใช่ไหม?</div>
              <div className="text-xs text-slate-400 mt-0.5">
                ลงชื่อไว้ก่อนได้ ยังไม่ถือว่า Check-in จนกว่าจะมาถึงสนาม
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleTodayRoster(currentMemberForToday.id, true)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black transition"
            >
              + ลงชื่อเล่นวันนี้
            </button>
          </div>
        )}

'@
    $check = $check.Insert($idx, $block)
}

# ============================================================
# VALIDATION COMPLETE: only now backup + write
# ============================================================
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$writes = @(
    @{ Path = $typesPath;   Text = $types },
    @{ Path = $storagePath; Text = $storage },
    @{ Path = $appPath;     Text = $app },
    @{ Path = $checkPath;   Text = $check }
)

Write-Host ""
Write-Host "Validation passed. Creating backups..." -ForegroundColor Cyan

foreach ($item in $writes) {
    $backup = "$($item.Path).bak-today-roster-v48b-$stamp"
    Copy-Item $item.Path $backup
    Write-Host "  $backup"
}

foreach ($item in $writes) {
    Set-Content -Path $item.Path -Value $item.Text -Encoding UTF8
}

Write-Host ""
Write-Host "[OK] Today's Roster core v48b applied." -ForegroundColor Green
Write-Host ""
Write-Host "Behavior:" -ForegroundColor Yellow
Write-Host "  - Member Master remains permanent"
Write-Host "  - Organizer searches Master and presses '+ วันนี้'"
Write-Host "  - Member can press '+ ลงชื่อเล่นวันนี้'"
Write-Host "  - Check-in automatically joins Today"
Write-Host "  - Reset clears Today's Roster"
Write-Host "  - Search still searches all members"
Write-Host ""
Write-Host "NOTE: MemberGateModal is intentionally NOT modified in this patch." -ForegroundColor Yellow
Write-Host "      This avoids the source mismatch that stopped v48."
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  npm run build"
Write-Host "  npm run dev"
