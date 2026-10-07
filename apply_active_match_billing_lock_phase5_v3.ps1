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
Copy-Item $appFile "$appFile.bak-active-match-lock-v3-$stamp"
Copy-Item $billingFile "$billingFile.bak-active-match-lock-v3-$stamp"

Write-Host "Backups created:" -ForegroundColor Cyan
Write-Host "  $appFile.bak-active-match-lock-v3-$stamp"
Write-Host "  $billingFile.bak-active-match-lock-v3-$stamp"
Write-Host ""

# ============================================================
# APP.TSX
# ============================================================
$app = Get-Content $appFile -Raw -Encoding UTF8

# ------------------------------------------------------------
# 1) HARD LOCK: Checkout while player is in active match
# ------------------------------------------------------------
if ($app -notmatch "ACTIVE_MATCH_CHECKOUT_LOCK_V43") {
    $fn = "const handleCheckOutPlayer = (playerId: string) => {"
    $fnIndex = $app.IndexOf($fn)

    if ($fnIndex -lt 0) {
        throw "ไม่พบ handleCheckOutPlayer ใน App.tsx"
    }

    $insertAt = $fnIndex + $fn.Length

    $guard = @'

    // ACTIVE_MATCH_CHECKOUT_LOCK_V43
    // A player already placed on court must stay locked until that active match is resolved.
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
        '• เล่นต่อ → รอผู้จัดกด Finish Match ก่อน\n' +
        '• ไม่ได้เล่น / ยกเลิก → ให้ผู้จัดปรับ Billing ของสมาชิกเพื่อยกเว้นค่าลูก Match นี้'
      );
      return;
    }
'@

    $app = $app.Insert($insertAt, $guard)
    Write-Host "[OK] Checkout lock added" -ForegroundColor Green
}
else {
    Write-Host "[SKIP] Checkout lock already exists"
}

# ------------------------------------------------------------
# 2) HARD LOCK: Individual payment while active match
# ------------------------------------------------------------
if ($app -notmatch "ACTIVE_MATCH_PAYMENT_LOCK_V43") {
    $fn = "const handleTogglePlayerPayment = ("
    $fnIndex = $app.IndexOf($fn)

    if ($fnIndex -lt 0) {
        throw "ไม่พบ handleTogglePlayerPayment ใน App.tsx"
    }

    $nextMarker = "if (!target) return;"
    $targetIndex = $app.IndexOf($nextMarker, $fnIndex)

    if ($targetIndex -lt 0) {
        throw "ไม่พบ if (!target) return; ภายใน handleTogglePlayerPayment"
    }

    $insertAt = $targetIndex + $nextMarker.Length

    $guard = @'

    // ACTIVE_MATCH_PAYMENT_LOCK_V43
    // Never finalize payment while the player is still on an active court.
    const targetIsInActiveMatch = appState.activeMatches.some((match) =>
      [...match.teamA, ...match.teamB].includes(playerId)
    );

    if (paid && targetIsInActiveMatch) {
      window.alert(
        `"${target.nickname}" ยังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังไม่สามารถบันทึกชำระเงินได้ เพราะยอด Match ยังไม่ Final\n\n' +
        'กรุณารอ Finish Match ก่อน หรือให้ผู้จัดปรับ Billing หาก Match นี้ถูกยกเลิก'
      );
      return;
    }
'@

    $app = $app.Insert($insertAt, $guard)
    Write-Host "[OK] Payment lock added" -ForegroundColor Green
}
else {
    Write-Host "[SKIP] Payment lock already exists"
}

# ------------------------------------------------------------
# 3) Mark All Paid: best-effort hardening, DO NOT FAIL SCRIPT
# ------------------------------------------------------------
if ($app -notmatch "ACTIVE_MATCH_MARK_ALL_LOCK_V43") {
    $fn = "const handleMarkAllCheckedInPaid"
    $fnIndex = $app.IndexOf($fn)

    if ($fnIndex -ge 0) {
        # Work only inside a limited section to avoid touching unrelated code.
        $segmentLength = [Math]::Min(5000, $app.Length - $fnIndex)
        $segment = $app.Substring($fnIndex, $segmentLength)

        $braceIndex = $segment.IndexOf("{")
        if ($braceIndex -ge 0) {
            $activeIdsInsert = @'

    // ACTIVE_MATCH_MARK_ALL_LOCK_V43
    const activePlayerIdsForBulkPayment = new Set(
      appState.activeMatches.flatMap((match) => [
        ...match.teamA,
        ...match.teamB,
      ])
    );
'@
            $segment = $segment.Insert($braceIndex + 1, $activeIdsInsert)
        }

        $before = $segment

        # Harden eligible filter regardless of spaces/newlines.
        $segment = [regex]::Replace(
            $segment,
            '\(p\)\s*=>\s*!p\.isCheckedIn\s*&&\s*!p\.paid',
            '(p) => !p.isCheckedIn && !p.paid && !activePlayerIdsForBulkPayment.has(p.id)',
            1
        )

        # Harden state update map if the familiar guard exists.
        $segment = [regex]::Replace(
            $segment,
            'if\s*\(\s*p\.isCheckedIn\s*\|\|\s*p\.paid\s*\)\s*return p;',
            'if (p.isCheckedIn || p.paid || activePlayerIdsForBulkPayment.has(p.id)) return p;',
            1
        )

        if ($segment -ne $before) {
            $app = $app.Remove($fnIndex, $segmentLength).Insert($fnIndex, $segment)
            Write-Host "[OK] Mark All Paid active-match filter added" -ForegroundColor Green
        }
        else {
            Write-Host "[WARN] Mark All Paid function found, but filter format differs. Main checkout/payment locks are still installed." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "[WARN] handleMarkAllCheckedInPaid not found. Main checkout/payment locks are still installed." -ForegroundColor Yellow
    }
}
else {
    Write-Host "[SKIP] Mark All Paid lock already exists"
}

# ------------------------------------------------------------
# 4) Pass active player IDs into BillingView
# ------------------------------------------------------------
if ($app -notmatch "activePlayerIds=\{activeMatches\.flatMap") {
    $billingViewIndex = $app.IndexOf("<BillingView")

    if ($billingViewIndex -lt 0) {
        throw "ไม่พบ <BillingView ใน App.tsx"
    }

    $playersMarker = "players={players}"
    $playersIndex = $app.IndexOf($playersMarker, $billingViewIndex)

    if ($playersIndex -lt 0) {
        throw "ไม่พบ players={players} ภายใน BillingView"
    }

    $insertAt = $playersIndex + $playersMarker.Length

    $props = @'

            activePlayerIds={activeMatches.flatMap((match) => [
              ...match.teamA,
              ...match.teamB,
            ])}
'@

    $app = $app.Insert($insertAt, $props)
    Write-Host "[OK] BillingView activePlayerIds prop added" -ForegroundColor Green
}
else {
    Write-Host "[SKIP] BillingView activePlayerIds already exists"
}

Set-Content -Path $appFile -Value $app -Encoding UTF8

# ============================================================
# BILLINGVIEW.TSX
# ============================================================
$billing = Get-Content $billingFile -Raw -Encoding UTF8

# ------------------------------------------------------------
# 5) Add prop
# ------------------------------------------------------------
if ($billing -notmatch "activePlayerIds\?: string\[\]") {
    $marker = "players: Player[];"
    $idx = $billing.IndexOf($marker)

    if ($idx -lt 0) {
        throw "ไม่พบ players: Player[]; ใน BillingViewProps"
    }

    $billing = $billing.Insert(
        $idx + $marker.Length,
        "`r`n  activePlayerIds?: string[];"
    )
    Write-Host "[OK] BillingView prop definition added" -ForegroundColor Green
}

# ------------------------------------------------------------
# 6) Destructure prop
# ------------------------------------------------------------
if ($billing -notmatch "activePlayerIds = \[\]") {
    $componentIndex = $billing.IndexOf("export const BillingView")
    $marker = "players,"
    $idx = $billing.IndexOf($marker, $componentIndex)

    if ($idx -lt 0) {
        throw "ไม่พบ players, ใน BillingView destructuring"
    }

    $billing = $billing.Insert(
        $idx + $marker.Length,
        "`r`n  activePlayerIds = [],"
    )
    Write-Host "[OK] BillingView prop destructuring added" -ForegroundColor Green
}

# ------------------------------------------------------------
# 7) Helper
# ------------------------------------------------------------
if ($billing -notmatch "ACTIVE_MATCH_BILLING_LOCK_V43") {
    $marker = "const [qrDataUrl, setQrDataUrl] = useState<string>('');"
    $idx = $billing.IndexOf($marker)

    if ($idx -lt 0) {
        throw "ไม่พบ qrDataUrl state ใน BillingView"
    }

    $insertAt = $idx + $marker.Length

    $helper = @'

  // ACTIVE_MATCH_BILLING_LOCK_V43
  const activePlayerIdSet = new Set(activePlayerIds);

  const isPlayerInActiveMatch = (playerId: string): boolean =>
    activePlayerIdSet.has(playerId);
'@

    $billing = $billing.Insert($insertAt, $helper)
    Write-Host "[OK] Billing active-match helper added" -ForegroundColor Green
}

# ------------------------------------------------------------
# 8) Block opening QR while active
# ------------------------------------------------------------
if ($billing -notmatch "ACTIVE_MATCH_QR_LOCK_V43") {
    $fn1 = "const handleOpenPlayerQr = async (player: Player) => {"
    $fn2 = "const handleOpenPlayerQr = (player: Player) => {"

    $idx = $billing.IndexOf($fn1)
    $fn = $fn1

    if ($idx -lt 0) {
        $idx = $billing.IndexOf($fn2)
        $fn = $fn2
    }

    if ($idx -lt 0) {
        throw "ไม่พบ handleOpenPlayerQr ใน BillingView"
    }

    $insertAt = $idx + $fn.Length

    $guard = @'

    // ACTIVE_MATCH_QR_LOCK_V43
    if (isPlayerInActiveMatch(player.id)) {
      window.alert(
        `"${player.nickname}" กำลังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังเปิด QR ชำระเงินไม่ได้ เพราะยอด Match ยังไม่ Final\n\n' +
        'รอผู้จัด Finish Match ก่อน'
      );
      return;
    }
'@

    $billing = $billing.Insert($insertAt, $guard)
    Write-Host "[OK] QR lock added" -ForegroundColor Green
}

# ------------------------------------------------------------
# 9) Block manual paid action while active
# ------------------------------------------------------------
if ($billing -notmatch "ACTIVE_MATCH_MANUAL_PAY_LOCK_V43") {
    $fn = "const handleRequestTogglePayment = (player: Player, isMarkingPaid: boolean) => {"
    $idx = $billing.IndexOf($fn)

    if ($idx -lt 0) {
        throw "ไม่พบ handleRequestTogglePayment ใน BillingView"
    }

    $insertAt = $idx + $fn.Length

    $guard = @'

    // ACTIVE_MATCH_MANUAL_PAY_LOCK_V43
    if (isMarkingPaid && isPlayerInActiveMatch(player.id)) {
      window.alert(
        `"${player.nickname}" กำลังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังไม่สามารถชำระเงินได้ เพราะยอด Match ยังไม่ Final'
      );
      return;
    }
'@

    $billing = $billing.Insert($insertAt, $guard)
    Write-Host "[OK] Manual payment lock added" -ForegroundColor Green
}

Set-Content -Path $billingFile -Value $billing -Encoding UTF8

Write-Host ""
Write-Host "Phase 5 v3 applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Main protections:" -ForegroundColor Yellow
Write-Host "  1. Active-match player cannot Check-out"
Write-Host "  2. Active-match player cannot open PromptPay QR"
Write-Host "  3. Active-match player cannot be marked Paid manually"
Write-Host "  4. Mark All Paid is hardened when its current code format is recognized"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
