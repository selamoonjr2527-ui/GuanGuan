param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

function Read-Utf8([string]$Path) {
    return Get-Content -Path $Path -Raw -Encoding UTF8
}

function Replace-FirstLiteral {
    param(
        [string]$Text,
        [string]$Old,
        [string]$New,
        [string]$Label
    )
    $idx = $Text.IndexOf($Old)
    if ($idx -lt 0) {
        throw "ไม่พบ anchor: $Label"
    }
    return $Text.Remove($idx, $Old.Length).Insert($idx, $New)
}

function Replace-FirstRegex {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Replacement,
        [string]$Label
    )
    $m = [regex]::Match($Text, $Pattern)
    if (-not $m.Success) {
        throw "ไม่พบ pattern: $Label"
    }
    return $Text.Remove($m.Index, $m.Length).Insert($m.Index, $Replacement)
}

$typesPath   = Join-Path $ProjectPath "src\types.ts"
$storagePath = Join-Path $ProjectPath "src\utils\storage.ts"
$appPath     = Join-Path $ProjectPath "src\App.tsx"
$checkPath   = Join-Path $ProjectPath "src\components\CheckInView.tsx"
$gatePath    = Join-Path $ProjectPath "src\components\MemberGateModal.tsx"
$selfPath    = Join-Path $ProjectPath "src\components\SelfCheckInModal.tsx"

$required = @($typesPath, $storagePath, $appPath, $checkPath, $gatePath)
foreach ($p in $required) {
    if (-not (Test-Path $p)) {
        throw "ไม่พบไฟล์: $p"
    }
}

$types   = Read-Utf8 $typesPath
$storage = Read-Utf8 $storagePath
$app     = Read-Utf8 $appPath
$check   = Read-Utf8 $checkPath
$gate    = Read-Utf8 $gatePath
$self    = if (Test-Path $selfPath) { Read-Utf8 $selfPath } else { $null }

Write-Host "Validating current source..." -ForegroundColor Cyan

# ============================================================
# 1) Player model: todayRoster
# ============================================================
if ($types -notmatch "todayRoster\?: boolean") {
    $types = Replace-FirstLiteral `
        -Text $types `
        -Old "  isCheckedIn: boolean;" `
        -New "  isCheckedIn: boolean;`r`n  todayRoster?: boolean; // Selected / registered for the current daily session" `
        -Label "Player.isCheckedIn"
}

# ============================================================
# 2) Daily reset must clear Today's Roster
# ============================================================
if ($storage -notmatch "TODAY_ROSTER_RESET_V48") {
    $start = $storage.IndexOf("export function createNewDaySessionState(")
    if ($start -lt 0) { throw "ไม่พบ createNewDaySessionState" }

    $end = $storage.IndexOf("export function exportAppStateAsJSON", $start)
    if ($end -lt 0) { $end = $storage.Length }

    $segment = $storage.Substring($start, $end - $start)

    if ($segment -notmatch "todayRoster:\s*false") {
        $old = "        isCheckedIn: false,"
        $idx = $segment.IndexOf($old)
        if ($idx -lt 0) { throw "ไม่พบ isCheckedIn:false ใน createNewDaySessionState" }

        $segment = $segment.Remove($idx, $old.Length).Insert(
            $idx,
            "        isCheckedIn: false,`r`n        todayRoster: false, // TODAY_ROSTER_RESET_V48"
        )
        $storage = $storage.Remove($start, $end - $start).Insert($start, $segment)
    }
}

# ============================================================
# 3) App: checking in automatically joins Today's Roster
# ============================================================
$checkInStart = $app.IndexOf("const handleCheckInPlayer")
if ($checkInStart -lt 0) { throw "ไม่พบ handleCheckInPlayer ใน App.tsx" }

$checkOutStart = $app.IndexOf("const handleCheckOutPlayer", $checkInStart)
if ($checkOutStart -lt 0) { throw "ไม่พบ handleCheckOutPlayer หลัง handleCheckInPlayer" }

$checkInSegment = $app.Substring($checkInStart, $checkOutStart - $checkInStart)

if ($checkInSegment -notmatch "todayRoster:\s*true") {
    $old = "            isCheckedIn: true,"
    $idx = $checkInSegment.IndexOf($old)
    if ($idx -lt 0) { throw "ไม่พบ isCheckedIn:true ใน handleCheckInPlayer" }

    $checkInSegment = $checkInSegment.Remove($idx, $old.Length).Insert(
        $idx,
        "            isCheckedIn: true,`r`n            todayRoster: true, // TODAY_ROSTER_CHECKIN_V48"
    )
    $app = $app.Remove($checkInStart, $checkOutStart - $checkInStart).Insert($checkInStart, $checkInSegment)
}

# Quick add / Walk-in should also be in Today's Roster
$quickStart = $app.IndexOf("const handleQuickAddAndCheckIn")
if ($quickStart -ge 0) {
    $quickEnd = $app.IndexOf("const handleToggleWalkInPenalty", $quickStart)
    if ($quickEnd -gt $quickStart) {
        $quickSegment = $app.Substring($quickStart, $quickEnd - $quickStart)
        if ($quickSegment -notmatch "todayRoster:\s*true") {
            $old = "      isCheckedIn: true,"
            $idx = $quickSegment.IndexOf($old)
            if ($idx -ge 0) {
                $quickSegment = $quickSegment.Remove($idx, $old.Length).Insert(
                    $idx,
                    "      isCheckedIn: true,`r`n      todayRoster: true,"
                )
                $app = $app.Remove($quickStart, $quickEnd - $quickStart).Insert($quickStart, $quickSegment)
            }
        }
    }
}

# New member added from Check-in screen = Today's Roster
$addStart = $app.IndexOf("const handleAddPlayer")
if ($addStart -ge 0) {
    $addEnd = $app.IndexOf("const handleQuickAddAndCheckIn", $addStart)
    if ($addEnd -lt 0) { $addEnd = [Math]::Min($app.Length, $addStart + 5000) }

    $addSegment = $app.Substring($addStart, $addEnd - $addStart)
    if ($addSegment -notmatch "TODAY_ROSTER_NEW_MEMBER_V48") {
        $old = "      paid: false,"
        $idx = $addSegment.IndexOf($old)
        if ($idx -ge 0) {
            $addSegment = $addSegment.Remove($idx, $old.Length).Insert(
                $idx,
                "      paid: false,`r`n      todayRoster: true, // TODAY_ROSTER_NEW_MEMBER_V48"
            )
            $app = $app.Remove($addStart, $addEnd - $addStart).Insert($addStart, $addSegment)
        }
    }
}

# Organizer/member toggle handler
if ($app -notmatch "TODAY_ROSTER_HANDLER_V48") {
    $anchor = "  const handleToggleCheckIn = (playerId: string) => {"
    $idx = $app.IndexOf($anchor)
    if ($idx -lt 0) { throw "ไม่พบ handleToggleCheckIn anchor" }

    $handler = @'
  // TODAY_ROSTER_HANDLER_V48
  // Member Master is permanent; todayRoster only controls who is on today's playing list.
  const handleToggleTodayRoster = (playerId: string, inRoster: boolean) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId) return p;

        const hasTodayActivity =
          p.isCheckedIn ||
          p.status === 'left' ||
          (p.matchesPlayed || 0) > 0 ||
          (p.extraShuttlecocks || 0) > 0 ||
          Boolean(p.paid);

        // Do not remove a player who already has activity/billing for this session.
        if (!inRoster && hasTodayActivity) return p;

        return {
          ...p,
          todayRoster: inRoster,
          ...(inRoster
            ? {
                registrationType: 'registered' as const,
                walkInPenaltyMatches: 0,
              }
            : {}),
        };
      }),
    }));
  };

'@
    $app = $app.Insert($idx, $handler)
}

# Pass handler into CheckInView
if ($app -notmatch "onToggleTodayRoster=\{handleToggleTodayRoster\}") {
    $old = "              onCheckOutPlayer={handleCheckOutPlayer}"
    $idx = $app.IndexOf($old)
    if ($idx -lt 0) {
        $old = "            onCheckOutPlayer={handleCheckOutPlayer}"
        $idx = $app.IndexOf($old)
    }
    if ($idx -lt 0) { throw "ไม่พบ CheckInView onCheckOutPlayer prop" }

    $lineEnd = $app.IndexOf("`n", $idx)
    if ($lineEnd -lt 0) { throw "หา line end ของ onCheckOutPlayer ไม่พบ" }

    $indentMatch = [regex]::Match($app.Substring($idx, $lineEnd - $idx), "^\s*")
    $indent = $indentMatch.Value

    $app = $app.Insert($lineEnd + 1, "$indent" + "onToggleTodayRoster={handleToggleTodayRoster}`r`n")
}

# ============================================================
# 4) CheckInView props
# ============================================================
if ($check -notmatch "onToggleTodayRoster\?:") {
    $check = Replace-FirstLiteral `
        -Text $check `
        -Old "  onCheckOutPlayer?: (playerId: string) => void;" `
        -New "  onCheckOutPlayer?: (playerId: string) => void;`r`n  onToggleTodayRoster?: (playerId: string, inRoster: boolean) => void;" `
        -Label "CheckInViewProps.onCheckOutPlayer"
}

if ($check -notmatch "^\s*onToggleTodayRoster,\s*$") {
    $check = Replace-FirstLiteral `
        -Text $check `
        -Old "  onCheckOutPlayer,`r`n" `
        -New "  onCheckOutPlayer,`r`n  onToggleTodayRoster,`r`n" `
        -Label "CheckInView destructuring onCheckOutPlayer"
}

# Ensure TODAY exists and is default
$statePattern = "const \[selectedFilter, setSelectedFilter\] = useState<([^>]+)>\('(?:all|today)'\);(?:\s*//[^\r\n]*)?"
$m = [regex]::Match($check, $statePattern)
if (-not $m.Success) { throw "ไม่พบ selectedFilter state ใน CheckInView" }

$union = $m.Groups[1].Value
if ($union -notmatch "'today'") { $union = "'today' | " + $union }
$newState = "const [selectedFilter, setSelectedFilter] = useState<$union>('today'); // TODAY_ROSTER_FILTER_V48"
$check = $check.Remove($m.Index, $m.Length).Insert($m.Index, $newState)

# Helper and counts
if ($check -notmatch "TODAY_ROSTER_HELPER_V48") {
    $anchor = "  // Computed counts"
    $idx = $check.IndexOf($anchor)
    if ($idx -lt 0) { throw "ไม่พบ // Computed counts ใน CheckInView" }

    $helper = @'
  // TODAY_ROSTER_HELPER_V48
  // Legacy-safe: existing session activity automatically counts as being on today's roster.
  const isTodayRosterPlayer = (p: Player) =>
    Boolean(
      p.todayRoster ||
      p.isCheckedIn ||
      p.status === 'left' ||
      p.checkInTime ||
      p.checkInTimestamp ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      p.paid
    );

'@
    $check = $check.Insert($idx, $helper)
}

if ($check -notmatch "const todayRosterCount") {
    $old = "  const checkedInCount = players.filter((p) => p.isCheckedIn).length;"
    $new = "  const todayRosterCount = players.filter(isTodayRosterPlayer).length;`r`n  const checkedInCount = players.filter((p) => p.isCheckedIn).length;"
    $check = Replace-FirstLiteral -Text $check -Old $old -New $new -Label "checkedInCount"
}

# absent = registered today but not checked in
$check = [regex]::Replace(
    $check,
    "const absentCount = players\.filter\(\(p\) => !p\.isCheckedIn\)\.length;",
    "const absentCount = players.filter((p) => isTodayRosterPlayer(p) && !p.isCheckedIn).length;",
    1
)

# current member for self daily registration
if ($check -notmatch "const currentMemberForRoster") {
    $needle = "  const absentCount = players.filter((p) => isTodayRosterPlayer(p) && !p.isCheckedIn).length;"
    $idx = $check.IndexOf($needle)
    if ($idx -lt 0) { throw "ไม่พบ absentCount หลังแปลง" }
    $lineEnd = $check.IndexOf("`n", $idx)
    $insert = @'

  const currentMemberForRoster = currentMemberId
    ? players.find((p) => p.id === currentMemberId)
    : undefined;
'@
    $check = $check.Insert($lineEnd + 1, $insert)
}

# TODAY filtering behavior (compatible with v47)
if ($check -match "TODAY_SEARCH_ALL_V47") {
    $check = $check.Replace(
        "if (selectedFilter === 'today' && !hasSearch && !p.isCheckedIn) {",
        "if (selectedFilter === 'today' && !hasSearch && !isTodayRosterPlayer(p)) {"
    )
} elseif ($check -notmatch "TODAY_ROSTER_SEARCH_V48") {
    $pattern = "if\s*\(\s*!matchSearch\s*\)\s*return false;"
    $m = [regex]::Match($check, $pattern)
    if (-not $m.Success) { throw "ไม่พบ if (!matchSearch) return false ใน CheckInView" }

    $insert = @'

    // TODAY_ROSTER_SEARCH_V48
    // Default shows Today's Roster. Typing searches the whole Member Master.
    const hasSearch = searchTerm.trim().length > 0;
    if (selectedFilter === 'today' && !hasSearch && !isTodayRosterPlayer(p)) {
      return false;
    }
'@
    $check = $check.Insert($m.Index + $m.Length, $insert)
}

# "ยังไม่มา" should mean absent from today's roster, not all master members.
$check = $check.Replace(
    "if (selectedFilter === 'absent' && p.isCheckedIn) return false;",
    "if (selectedFilter === 'absent' && (p.isCheckedIn || !isTodayRosterPlayer(p))) return false;"
)

# Ensure a Today button exists
if ($check -notmatch "setSelectedFilter\('today'\)") {
    $allClick = "onClick={() => setSelectedFilter('all')}"
    $clickIdx = $check.IndexOf($allClick)
    if ($clickIdx -lt 0) { throw "ไม่พบปุ่ม filter All เพื่อเพิ่ม Today button" }
    $buttonIdx = $check.LastIndexOf("<button", $clickIdx)
    if ($buttonIdx -lt 0) { throw "ไม่พบ <button ของ filter All" }

    $todayButton = @'
            {/* TODAY_ROSTER_BUTTON_V48 */}
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

# Update Today count if v47 used checkedInCount
$check = $check.Replace("วันนี้ ({checkedInCount})", "วันนี้ ({todayRosterCount})")
$check = $check.Replace("ผู้เล่นวันนี้ {checkedInCount} คน", "รายชื่อวันนี้ {todayRosterCount} คน")

# Card-level flags
if ($check -notmatch "const inTodayRoster = isTodayRosterPlayer\(player\)") {
    $old = "          const canActOnPlayer = isOrganizerMode || isCurrentUser;"
    $new = @'
          const canActOnPlayer = isOrganizerMode || isCurrentUser;
          const inTodayRoster = isTodayRosterPlayer(player);
          const hasTodayActivity =
            player.isCheckedIn ||
            player.status === 'left' ||
            (player.matchesPlayed || 0) > 0 ||
            (player.extraShuttlecocks || 0) > 0 ||
            Boolean(player.paid);
'@
    $check = Replace-FirstLiteral -Text $check -Old $old -New $new -Label "canActOnPlayer"
}

# Organizer add/remove Today button
if ($check -notmatch "TODAY_ROSTER_CARD_ACTION_V48") {
    $anchor = "                {/* Edit & Delete Player Buttons (Organizer Only) */}"
    $idx = $check.IndexOf($anchor)
    if ($idx -lt 0) { throw "ไม่พบ Edit & Delete Player Buttons anchor" }

    $action = @'
                {/* TODAY_ROSTER_CARD_ACTION_V48 */}
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
                    title={
                      inTodayRoster
                        ? hasTodayActivity
                          ? 'มีการ Check-in / เล่น / คิดเงินแล้ว จึงไม่สามารถเอาออกจากรายชื่อวันนี้'
                          : 'เอาออกจากรายชื่อวันนี้'
                        : 'เพิ่มสมาชิกคนนี้เข้ารายชื่อวันนี้'
                    }
                  >
                    {inTodayRoster ? '✓ วันนี้' : '+ วันนี้'}
                  </button>
                )}

'@
    $check = $check.Insert($idx, $action)
}

# Member self-register button
if ($check -notmatch "TODAY_ROSTER_SELF_REGISTER_V48") {
    $anchor = "      {/* Player Cards Grid */}"
    $idx = $check.IndexOf($anchor)
    if ($idx -lt 0) { throw "ไม่พบ Player Cards Grid anchor" }

    $selfBlock = @'
      {/* TODAY_ROSTER_SELF_REGISTER_V48 */}
      {!isOrganizerMode &&
        currentMemberForRoster &&
        !isTodayRosterPlayer(currentMemberForRoster) &&
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
              onClick={() => onToggleTodayRoster(currentMemberForRoster.id, true)}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black transition"
            >
              + ลงชื่อเล่นวันนี้
            </button>
          </div>
        )}

'@
    $check = $check.Insert($idx, $selfBlock)
}

# ============================================================
# 5) MemberGate: don't force a 100-name dropdown
# ============================================================
if ($gate -notmatch "Search,") {
    $gate = $gate.Replace(
        "ShieldCheck, UserPlus, LogIn, Lock, AlertCircle, Sparkles, Check, Phone, KeyRound",
        "ShieldCheck, UserPlus, LogIn, Lock, AlertCircle, Sparkles, Check, Phone, KeyRound, Search"
    )
}

if ($gate -notmatch "MEMBER_GATE_SEARCH_V48") {
    $old = "  const [memberError, setMemberError] = useState('');"
    $new = "  const [memberError, setMemberError] = useState('');`r`n  const [memberSearch, setMemberSearch] = useState(''); // MEMBER_GATE_SEARCH_V48"
    $gate = Replace-FirstLiteral -Text $gate -Old $old -New $new -Label "MemberGate memberError state"
}

if ($gate -notmatch "const todayRosterPlayers") {
    $anchor = "  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);"
    $idx = $gate.IndexOf($anchor)
    if ($idx -lt 0) { throw "ไม่พบ selectedPlayer ใน MemberGate" }

    $derived = @'
  const isTodayRosterPlayer = (p: Player) =>
    Boolean(
      p.todayRoster ||
      p.isCheckedIn ||
      p.status === 'left' ||
      p.checkInTime ||
      p.checkInTimestamp ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      p.paid
    );

  const todayRosterPlayers = players.filter(isTodayRosterPlayer);
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const selectablePlayers = (
    normalizedMemberSearch
      ? players.filter(
          (p) =>
            p.nickname.toLowerCase().includes(normalizedMemberSearch) ||
            Boolean(p.fullName?.toLowerCase().includes(normalizedMemberSearch)) ||
            Boolean(p.phone?.includes(memberSearch.trim()))
        )
      : todayRosterPlayers
  ).slice(0, 30);

'@
    $gate = $gate.Insert($idx, $derived)
}

$gate = $gate.Replace(
    "(มีสมาชิก {players.length} คน)",
    "(วันนี้ {todayRosterPlayers.length} / สมาชิกทั้งหมด {players.length})"
)

if ($gate -notmatch "placeholder=""ค้นหาชื่อเล่น") {
    $selectTag = "              <select"
    $idx = $gate.IndexOf($selectTag)
    if ($idx -lt 0) { throw "ไม่พบ select สมาชิกใน MemberGate" }

    $searchUi = @'
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setSelectedPlayerId('');
                    setVerificationCode('');
                    setMemberError('');
                  }}
                  placeholder="ค้นหาชื่อเล่น / ชื่อจริง / เบอร์โทร..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400 transition"
                />
              </div>

'@
    $gate = $gate.Insert($idx, $searchUi)
}

$gate = $gate.Replace("{players.map((p) => (", "{selectablePlayers.map((p) => (")

# ============================================================
# 6) SelfCheckInModal: empty search should not render 100 names
#    Optional; warn rather than fail.
# ============================================================
$selfChanged = $false
if ($null -ne $self -and $self -notmatch "SELF_CHECKIN_TODAY_ROSTER_V48") {
    $pattern = "(?s)  const unCheckedPlayers = players\.filter\(\s*\(p\) =>\s*!p\.isCheckedIn &&\s*\(p\.nickname\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\) \|\|\s*\(p\.fullName && p\.fullName\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)\)\)\s*\);"
    $m = [regex]::Match($self, $pattern)

    if ($m.Success) {
        $replacement = @'
  // SELF_CHECKIN_TODAY_ROSTER_V48
  const hasPlayerSearch = searchTerm.trim().length > 0;
  const unCheckedPlayers = players
    .filter((p) => {
      if (p.isCheckedIn) return false;

      if (hasPlayerSearch) {
        const q = searchTerm.trim().toLowerCase();
        return (
          p.nickname.toLowerCase().includes(q) ||
          Boolean(p.fullName?.toLowerCase().includes(q)) ||
          Boolean(p.phone?.includes(searchTerm.trim()))
        );
      }

      return Boolean(
        p.todayRoster ||
        p.status === 'left' ||
        p.checkInTime ||
        p.checkInTimestamp ||
        (p.matchesPlayed || 0) > 0 ||
        (p.extraShuttlecocks || 0) > 0 ||
        p.paid
      );
    })
    .slice(0, 30);
'@
        $self = $self.Remove($m.Index, $m.Length).Insert($m.Index, $replacement)
        $selfChanged = $true
    }
}

# ============================================================
# All required transformations succeeded.
# Backup and write atomically-ish.
# ============================================================
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$writes = @(
    @{ Path = $typesPath;   Text = $types },
    @{ Path = $storagePath; Text = $storage },
    @{ Path = $appPath;     Text = $app },
    @{ Path = $checkPath;   Text = $check },
    @{ Path = $gatePath;    Text = $gate }
)

if ($selfChanged) {
    $writes += @{ Path = $selfPath; Text = $self }
}

Write-Host ""
Write-Host "Validation passed. Creating backups..." -ForegroundColor Cyan

foreach ($item in $writes) {
    $backup = "$($item.Path).bak-today-roster-v48-$stamp"
    Copy-Item $item.Path $backup
    Write-Host "  $backup"
}

foreach ($item in $writes) {
    Set-Content -Path $item.Path -Value $item.Text -Encoding UTF8
}

Write-Host ""
Write-Host "[OK] Today's Roster v48 applied." -ForegroundColor Green
Write-Host ""
Write-Host "New behavior:" -ForegroundColor Yellow
Write-Host "  1. Member Master remains permanent."
Write-Host "  2. Organizer searches a member and presses '+ วันนี้'."
Write-Host "  3. Added member appears in Today's Roster but is NOT checked in yet."
Write-Host "  4. Member can press '+ ลงชื่อเล่นวันนี้' for themselves."
Write-Host "  5. Check-in automatically adds the member to Today's Roster."
Write-Host "  6. Daily Reset clears Today's Roster but keeps Member Master."
Write-Host "  7. Member login initially shows Today's Roster; type Search to find any master member."
if (-not $selfChanged) {
    Write-Host "  [WARN] SelfCheckInModal list optimization was not patched (core roster still installed)." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
Write-Host "  npm run dev"
