param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$appFile = Join-Path $ProjectPath "src\App.tsx"
$billingFile = Join-Path $ProjectPath "src\components\BillingView.tsx"

foreach ($file in @($appFile, $billingFile)) {
    if (-not (Test-Path $file)) {
        throw "ไม่พบไฟล์: $file"
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $appFile "$appFile.bak-active-match-lock-v2-$stamp"
Copy-Item $billingFile "$billingFile.bak-active-match-lock-v2-$stamp"

Write-Host "Backups created:" -ForegroundColor Cyan
Write-Host "  $appFile.bak-active-match-lock-v2-$stamp"
Write-Host "  $billingFile.bak-active-match-lock-v2-$stamp"
Write-Host ""

# ============================================================
# App.tsx
# ============================================================
$app = Get-Content $appFile -Raw -Encoding UTF8

# 1) Block checkout while active match
if ($app -notmatch "ACTIVE_MATCH_CHECKOUT_LOCK_V41") {
    $pattern = 'const handleCheckOutPlayer = \(playerId: string\) => \{'
    if ($app -notmatch $pattern) {
        throw "ไม่พบ handleCheckOutPlayer ใน App.tsx"
    }

    $replacement = @'
const handleCheckOutPlayer = (playerId: string) => {
    // ACTIVE_MATCH_CHECKOUT_LOCK_V41
    const activeMatchForCheckout = appState.activeMatches.find((match) =>
      [...match.teamA, ...match.teamB].includes(playerId)
    );

    if (activeMatchForCheckout) {
      const targetPlayer = appState.players.find(
        (player) => player.id === playerId
      );

      window.alert(
        `"${targetPlayer?.nickname || 'สมาชิก'}" กำลังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังไม่สามารถ Check-out ได้ เพราะยอด Match ยังไม่ Final\n\n' +
        '• ถ้าเล่น Match นี้ต่อ → รอผู้จัดกดจบ Match ก่อน\n' +
        '• ถ้ายกเลิก → ให้ผู้จัดปรับ Billing ของสมาชิกเพื่อยกเว้นค่าลูก Match นี้'
      );
      return;
    }
'@

    $app = [regex]::Replace($app, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }, 1)
}

# 2) Hard lock payment while active match
if ($app -notmatch "ACTIVE_MATCH_PAYMENT_LOCK_V41") {
    $pattern = '(?s)(const handleTogglePlayerPayment = \(\s*playerId: string,\s*paid: boolean,\s*amount\?: number,\s*newPin\?: string\s*\) => \{\s*const target = appState\.players\.find\(\(p\) => p\.id === playerId\);\s*if \(!target\) return;\s*)'

    $match = [regex]::Match($app, $pattern)
    if (-not $match.Success) {
        throw "ไม่พบ handleTogglePlayerPayment รูปแบบปัจจุบันใน App.tsx"
    }

    $insert = @'
    // ACTIVE_MATCH_PAYMENT_LOCK_V41
    const targetIsInActiveMatch = appState.activeMatches.some((match) =>
      [...match.teamA, ...match.teamB].includes(playerId)
    );

    if (paid && targetIsInActiveMatch) {
      window.alert(
        `"${target.nickname}" ยังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังไม่สามารถชำระเงินได้ เพราะยอด Match ยังไม่ Final\n\n' +
        'กรุณารอจบ Match ก่อน หรือให้ผู้จัดปรับ Billing หากยกเลิก Match นี้'
      );
      return;
    }

'@

    $app = $app.Insert($match.Index + $match.Length, $insert)
}

# 3) Mark All Paid: exclude active match players
if ($app -notmatch "ACTIVE_MATCH_MARK_ALL_LOCK_V41") {
    $pattern = '(?s)const handleMarkAllCheckedInPaid = \(\) => \{\s*(?:(?://[^\r\n]*\r?\n)\s*)*const eligible = appState\.players\.filter\(\s*\(p\) => !p\.isCheckedIn && !p\.paid\s*\);'

    $match = [regex]::Match($app, $pattern)
    if (-not $match.Success) {
        throw "ไม่พบ handleMarkAllCheckedInPaid ในรูปแบบที่รองรับ"
    }

    $replacement = @'
const handleMarkAllCheckedInPaid = () => {
    // ACTIVE_MATCH_MARK_ALL_LOCK_V41
    // Only checked-out players who are not on an active court may be paid.
    const activePlayerIdsForPayment = new Set(
      appState.activeMatches.flatMap((match) => [
        ...match.teamA,
        ...match.teamB,
      ])
    );

    const eligible = appState.players.filter(
      (p) =>
        !p.isCheckedIn &&
        !p.paid &&
        !activePlayerIdsForPayment.has(p.id)
    );
'@

    $app = $app.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)

    $handlerStart = $app.IndexOf("const handleMarkAllCheckedInPaid")
    $nextHandler = $app.IndexOf("const ", $handlerStart + 10)
    if ($nextHandler -lt 0) { $nextHandler = $app.Length }

    $segment = $app.Substring($handlerStart, $nextHandler - $handlerStart)

    if ($segment -match 'if \(p\.isCheckedIn \|\| p\.paid\) return p;') {
        $newGuard = @'
const isStillInActiveMatch = prev.activeMatches.some((match) =>
          [...match.teamA, ...match.teamB].includes(p.id)
        );

        if (p.isCheckedIn || p.paid || isStillInActiveMatch) return p;
'@
        $segment = [regex]::Replace(
            $segment,
            'if \(p\.isCheckedIn \|\| p\.paid\) return p;',
            $newGuard,
            1
        )

        $app = $app.Remove($handlerStart, $nextHandler - $handlerStart).Insert($handlerStart, $segment)
    }
}

# 4) Pass activePlayerIds into BillingView
if ($app -notmatch 'activePlayerIds=\{activeMatches\.flatMap') {
    $pattern = '(<BillingView\s*\r?\n\s*sessionConfig=\{sessionConfig\}\s*\r?\n\s*players=\{players\})'
    $match = [regex]::Match($app, $pattern)

    if (-not $match.Success) {
        throw "ไม่พบ BillingView props ใน App.tsx"
    }

    $replacement = @'
$1
            activePlayerIds={activeMatches.flatMap((match) => [
              ...match.teamA,
              ...match.teamB,
            ])}
'@
    $app = [regex]::Replace($app, $pattern, $replacement, 1)
}

Set-Content -Path $appFile -Value $app -Encoding UTF8

# ============================================================
# BillingView.tsx
# ============================================================
$billing = Get-Content $billingFile -Raw -Encoding UTF8

# 5) Prop
if ($billing -notmatch 'activePlayerIds\?: string\[\]') {
    $billing = $billing.Replace(
        "  players: Player[];",
        "  players: Player[];`r`n  activePlayerIds?: string[];"
    )
}

# 6) Destructure
if ($billing -notmatch 'activePlayerIds = \[\]') {
    $billing = $billing.Replace(
        "  players,",
        "  players,`r`n  activePlayerIds = [],"
    )
}

# 7) Helpers
if ($billing -notmatch "ACTIVE_MATCH_BILLING_LOCK_V41") {
    $anchor = "  const [qrDataUrl, setQrDataUrl] = useState<string>('');"
    if ($billing -notmatch [regex]::Escape($anchor)) {
        throw "ไม่พบ qrDataUrl state ใน BillingView.tsx"
    }

    $helpers = @'

  // ACTIVE_MATCH_BILLING_LOCK_V41
  const activePlayerIdSet = new Set(activePlayerIds);

  const isPlayerInActiveMatch = (playerId: string): boolean =>
    activePlayerIdSet.has(playerId);

  const isPlayerPaymentLocked = (player: Player): boolean =>
    player.isCheckedIn || isPlayerInActiveMatch(player.id);
'@

    $billing = $billing.Replace($anchor, "$anchor$helpers")
}

# 8) QR open guard: support async/non-async versions
$qrPattern = '(?s)(const handleOpenPlayerQr = (?:async )?\(player: Player\) => \{\s*)if \(player\.isCheckedIn\) \{.*?return;\s*\}'
$qrMatch = [regex]::Match($billing, $qrPattern)

if ($qrMatch.Success) {
    $qrReplacement = @'
$1if (isPlayerPaymentLocked(player)) {
      window.alert(
        isPlayerInActiveMatch(player.id)
          ? `"${player.nickname}" กำลังอยู่ใน Match ที่กำลังเล่น\n\nรอให้ผู้จัดกดจบ Match ก่อน จึงจะเปิด QR ชำระเงินได้`
          : `กรุณา Check-out "${player.nickname}" ก่อนเปิด QR ชำระเงิน`
      );
      return;
    }
'@
    $billing = [regex]::Replace($billing, $qrPattern, $qrReplacement, 1)
}

# 9) Payment request guard
$billing = $billing.Replace(
    "if (isMarkingPaid && player.isCheckedIn) {",
    "if (isMarkingPaid && isPlayerPaymentLocked(player)) {"
)

# 10) Table QR disable/title/style conditions
$billing = $billing.Replace(
    "disabled={player.isCheckedIn && !player.paid}",
    "disabled={isPlayerPaymentLocked(player) && !player.paid}"
)

$billing = $billing.Replace(
    "player.isCheckedIn && !player.paid",
    "isPlayerPaymentLocked(player) && !player.paid"
)

# 11) Member active row lock display conditions where safe
$billing = $billing.Replace(
    "!activeMember.paid && activeMember.isCheckedIn",
    "!activeMember.paid && isPlayerPaymentLocked(activeMember)"
)

Set-Content -Path $billingFile -Value $billing -Encoding UTF8

Write-Host ""
Write-Host "Phase 5 v2 applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Active Match rules:" -ForegroundColor Yellow
Write-Host "  - Active player cannot Check-out"
Write-Host "  - Active player cannot open QR / pay"
Write-Host "  - Mark All Paid skips active players"
Write-Host "  - BillingView knows activePlayerIds"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
