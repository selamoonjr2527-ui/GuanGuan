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
Copy-Item $appFile "$appFile.bak-active-match-lock-$stamp"
Copy-Item $billingFile "$billingFile.bak-active-match-lock-$stamp"

Write-Host "Backups created:" -ForegroundColor Cyan
Write-Host "  $appFile.bak-active-match-lock-$stamp"
Write-Host "  $billingFile.bak-active-match-lock-$stamp"
Write-Host ""

# ============================================================
# 1) App.tsx - block checkout while player is in an active match
# ============================================================
$app = Get-Content $appFile -Raw -Encoding UTF8

if ($app -notmatch "ACTIVE_MATCH_CHECKOUT_LOCK_V41") {
    $checkoutAnchor = "  const handleCheckOutPlayer = (playerId: string) => {"

    if ($app -notmatch [regex]::Escape($checkoutAnchor)) {
        throw "ไม่พบ handleCheckOutPlayer ใน App.tsx"
    }

    $checkoutReplacement = @'
  const handleCheckOutPlayer = (playerId: string) => {
    // ACTIVE_MATCH_CHECKOUT_LOCK_V41
    // Once a player is on court, the current match has not been finalized yet.
    // Never allow checkout until the active match is resolved.
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
        '• ถ้ายกเลิก Match นี้ → แจ้งผู้จัดให้ปรับ Billing Match -1 เพื่อยกเว้นค่าลูก Match นี้'
      );
      return;
    }
'@

    $app = $app.Replace($checkoutAnchor, $checkoutReplacement)
}

# ============================================================
# 2) App.tsx - hard payment lock for active match
# ============================================================
if ($app -notmatch "ACTIVE_MATCH_PAYMENT_LOCK_V41") {
    $paymentAnchor = @'
  ) => {
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    // Payment is allowed only AFTER checkout.
'@

    if ($app -notmatch [regex]::Escape($paymentAnchor)) {
        throw "ไม่พบจุดเริ่ม handleTogglePlayerPayment ใน App.tsx"
    }

    $paymentReplacement = @'
  ) => {
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    // ACTIVE_MATCH_PAYMENT_LOCK_V41
    // Defense-in-depth: even if player state becomes unchecked accidentally,
    // payment must never be accepted while that player is still on an active court.
    const targetIsInActiveMatch = appState.activeMatches.some((match) =>
      [...match.teamA, ...match.teamB].includes(playerId)
    );

    if (paid && targetIsInActiveMatch) {
      window.alert(
        `"${target.nickname}" ยังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังไม่สามารถชำระเงินได้ เพราะยอด Match ยังไม่ Final\n\n' +
        'กรุณารอจบ Match ก่อน หรือให้ผู้จัดปรับ Billing Match -1 หากยกเลิก Match นี้'
      );
      return;
    }

    // Payment is allowed only AFTER checkout.
'@

    $app = $app.Replace($paymentAnchor, $paymentReplacement)
}

# ============================================================
# 3) App.tsx - Mark All Paid must exclude active-match players
# ============================================================
if ($app -notmatch "ACTIVE_MATCH_MARK_ALL_LOCK_V41") {
    $markAllOld = @'
  const handleMarkAllCheckedInPaid = () => {
    // Legacy function name kept for BillingView compatibility.
    // New rule: only CHECKED-OUT members may be paid.
    const eligible = appState.players.filter(
      (p) => !p.isCheckedIn && !p.paid
    );
'@

    if ($app -notmatch [regex]::Escape($markAllOld)) {
        throw "ไม่พบ handleMarkAllCheckedInPaid รูปแบบเดิมใน App.tsx"
    }

    $markAllNew = @'
  const handleMarkAllCheckedInPaid = () => {
    // Legacy function name kept for BillingView compatibility.
    // ACTIVE_MATCH_MARK_ALL_LOCK_V41
    // Only CHECKED-OUT members who are NOT on an active court may be paid.
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

    $app = $app.Replace($markAllOld, $markAllNew)

    # Also harden the state update inside the handler.
    $insideOld = "        if (p.isCheckedIn || p.paid) return p;"
    $insideNew = @'
        const isStillInActiveMatch = prev.activeMatches.some((match) =>
          [...match.teamA, ...match.teamB].includes(p.id)
        );

        if (p.isCheckedIn || p.paid || isStillInActiveMatch) return p;
'@

    $firstIndex = $app.IndexOf($insideOld, $app.IndexOf("const handleMarkAllCheckedInPaid"))
    if ($firstIndex -lt 0) {
        throw "ไม่พบ payment guard ภายใน handleMarkAllCheckedInPaid"
    }

    $app = $app.Remove($firstIndex, $insideOld.Length).Insert($firstIndex, $insideNew)
}

# ============================================================
# 4) App.tsx - pass active player IDs to BillingView
# ============================================================
if ($app -notmatch "activePlayerIds=\{activeMatches\.flatMap") {
    $billingRenderAnchor = @'
            players={players}
            isOrganizerMode={isOrganizerMode}
'@

    if ($app -notmatch [regex]::Escape($billingRenderAnchor)) {
        throw "ไม่พบ BillingView players prop ใน App.tsx"
    }

    $billingRenderNew = @'
            players={players}
            activePlayerIds={activeMatches.flatMap((match) => [
              ...match.teamA,
              ...match.teamB,
            ])}
            isOrganizerMode={isOrganizerMode}
'@

    $app = $app.Replace($billingRenderAnchor, $billingRenderNew)
}

Set-Content -Path $appFile -Value $app -Encoding UTF8

# ============================================================
# 5) BillingView.tsx - accept active player IDs + helper
# ============================================================
$billing = Get-Content $billingFile -Raw -Encoding UTF8

if ($billing -notmatch "activePlayerIds\?: string\[\]") {
    $propsAnchor = "  players: Player[];"

    if ($billing -notmatch [regex]::Escape($propsAnchor)) {
        throw "ไม่พบ players prop ใน BillingViewProps"
    }

    $billing = $billing.Replace(
        $propsAnchor,
        "$propsAnchor`r`n  activePlayerIds?: string[];"
    )
}

if ($billing -notmatch "activePlayerIds = \[\]") {
    $destructureAnchor = "  players,"

    if ($billing -notmatch [regex]::Escape($destructureAnchor)) {
        throw "ไม่พบ players destructure ใน BillingView"
    }

    $billing = $billing.Replace(
        $destructureAnchor,
        "$destructureAnchor`r`n  activePlayerIds = [],"
    )
}

if ($billing -notmatch "ACTIVE_MATCH_BILLING_LOCK_V41") {
    $stateAnchor = "  const [qrDataUrl, setQrDataUrl] = useState<string>('');"

    if ($billing -notmatch [regex]::Escape($stateAnchor)) {
        throw "ไม่พบ qrDataUrl state ใน BillingView"
    }

    $lockHelpers = @'

  // ACTIVE_MATCH_BILLING_LOCK_V41
  const activePlayerIdSet = new Set(activePlayerIds);

  const isPlayerInActiveMatch = (playerId: string): boolean =>
    activePlayerIdSet.has(playerId);

  const isPlayerPaymentLocked = (player: Player): boolean =>
    player.isCheckedIn || isPlayerInActiveMatch(player.id);
'@

    $billing = $billing.Replace(
        $stateAnchor,
        "$stateAnchor$lockHelpers"
    )
}

# Harden handleOpenPlayerQr.
$billing = [regex]::Replace(
    $billing,
    '(?s)(const handleOpenPlayerQr = async \(player: Player\) => \{\s*)if \(player\.isCheckedIn\) \{.*?return;\s*\}',
    '$1if (isPlayerPaymentLocked(player)) {' + "`r`n" +
    '      window.alert(' + "`r`n" +
    '        isPlayerInActiveMatch(player.id)' + "`r`n" +
    '          ? `"${player.nickname}" กำลังอยู่ใน Match ที่กำลังเล่น\n\nรอให้ผู้จัดกดจบ Match ก่อน จึงจะเปิด QR ชำระเงินได้`' + "`r`n" +
    '          : `กรุณา Check-out "${player.nickname}" ก่อนเปิด QR ชำระเงิน`' + "`r`n" +
    '      );' + "`r`n" +
    '      return;' + "`r`n" +
    '    }',
    1
)

# Harden handleRequestTogglePayment.
$billing = $billing.Replace(
    "if (isMarkingPaid && player.isCheckedIn) {",
    "if (isMarkingPaid && isPlayerPaymentLocked(player)) {"
)

# Make the error message explain active-match lock.
$billing = $billing.Replace(
    'กรุณา Check-out "${player.nickname}" ก่อนชำระเงิน\n\nระบบจะล็อกยอดหลัง Check-out เพื่อป้องกันจำนวน Match เปลี่ยนระหว่างเล่น',
    'ยังไม่สามารถชำระเงิน "${player.nickname}" ได้\n\nต้อง Check-out และต้องไม่อยู่ใน Match ที่กำลังเล่น เพื่อให้ยอด Match Final ก่อน'
)

Set-Content -Path $billingFile -Value $billing -Encoding UTF8

Write-Host ""
Write-Host "Phase 5 Active Match Billing Lock applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Rules now:" -ForegroundColor Yellow
Write-Host "  1. Player on active court cannot Check-out"
Write-Host "  2. Player on active court cannot pay / open PromptPay"
Write-Host "  3. Mark All Paid skips active-court players"
Write-Host "  4. BillingView receives activePlayerIds from App"
Write-Host "  5. If player cancels current match, Organizer can use Billing Match adjustment -1"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
Write-Host "  npm run dev"
