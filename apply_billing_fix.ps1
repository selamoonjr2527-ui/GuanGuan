param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$appFile = Join-Path $ProjectPath "src\App.tsx"
$archiveFile = Join-Path $ProjectPath "src\components\DailyArchiveModal.tsx"

if (-not (Test-Path $appFile)) {
    throw "ไม่พบไฟล์: $appFile"
}

if (-not (Test-Path $archiveFile)) {
    throw "ไม่พบไฟล์: $archiveFile"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Copy-Item $appFile "$appFile.bak-billing-$stamp"
Copy-Item $archiveFile "$archiveFile.bak-billing-$stamp"

Write-Host "Backup created:" -ForegroundColor Cyan
Write-Host "  $appFile.bak-billing-$stamp"
Write-Host "  $archiveFile.bak-billing-$stamp"
Write-Host ""

$app = Get-Content $appFile -Raw -Encoding UTF8

$newTogglePayment = @'
  const handleTogglePlayerPayment = (
    playerId: string,
    paid: boolean,
    amount?: number,
    newPin?: string
  ) => {
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    // Payment is allowed only AFTER checkout.
    if (paid && target.isCheckedIn) {
      window.alert(
        `กรุณา Check-out "${target.nickname}" ก่อนชำระเงิน\n\nระบบจะล็อกยอดหลัง Check-out เพื่อป้องกันยอดเปลี่ยนระหว่างเล่น`
      );
      return;
    }

    // Apply organizer match adjustment before calculating final charge.
    const adjustedMatches = Math.max(
      0,
      Number(target.matchesPlayed || 0) +
        Number((target as any).billingMatchAdjustment || 0)
    );

    const adjustedPlayer = {
      ...target,
      matchesPlayed: adjustedMatches,
    };

    const finalCharge = calculatePlayerFinalCharge(
      adjustedPlayer,
      sessionConfig,
      promotionRedemptions,
      sessionConfig.date
    );

    const manualAmountAdjustment = Number(
      (target as any).billingAmountAdjustment || 0
    );

    const calculatedAmount = Math.max(
      0,
      Math.round(finalCharge.finalTotal + manualAmountAdjustment)
    );

    // If BillingView already sends the final amount, use it.
    // Otherwise calculate from the canonical billing formula.
    const safeAmount =
      paid
        ? typeof amount === 'number' && Number.isFinite(amount)
          ? Math.max(0, amount)
          : calculatedAmount
        : undefined;

    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              paid,
              paidAmount: safeAmount,
              paymentTime: paid
                ? new Date().toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : undefined,
              paymentMethod: paid
                ? p.paymentMethod
                : undefined,
              pin:
                newPin && newPin.trim().length === 4
                  ? newPin.trim()
                  : p.pin,
            }
          : p
      ),
    }));
  };

'@

$patternToggle = '(?s)  const handleTogglePlayerPayment = \(.*?\r?\n  \};\r?\n\r?\n(?=  const handleMarkAllCheckedInPaid = \(\) => \{)'
$matchesToggle = [regex]::Matches($app, $patternToggle).Count
if ($matchesToggle -ne 1) {
    throw "หา handleTogglePlayerPayment ไม่เจอแบบชัดเจน (พบ $matchesToggle จุด) - ยังไม่ได้แก้ App.tsx"
}
$app = [regex]::Replace($app, $patternToggle, $newTogglePayment, 1)

$newMarkAll = @'
  const handleMarkAllCheckedInPaid = () => {
    // Billing participants for the current session only.
    const isBillingParticipant = (p: Player) =>
      p.isCheckedIn ||
      p.status === 'left' ||
      Boolean(p.checkInTime) ||
      Boolean(p.checkInTimestamp) ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      p.paid;

    const eligible = appState.players.filter(
      (p) =>
        isBillingParticipant(p) &&
        !p.isCheckedIn &&
        !p.paid
    );

    if (eligible.length === 0) {
      window.alert('ยังไม่มีสมาชิกที่ Check-out และรอชำระเงิน');
      return;
    }

    const eligibleIds = new Set(
      eligible.map((p) => p.id)
    );

    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (!eligibleIds.has(p.id)) return p;

        const adjustedMatches = Math.max(
          0,
          Number(p.matchesPlayed || 0) +
            Number((p as any).billingMatchAdjustment || 0)
        );

        const adjustedPlayer = {
          ...p,
          matchesPlayed: adjustedMatches,
        };

        const finalCharge = calculatePlayerFinalCharge(
          adjustedPlayer,
          prev.sessionConfig,
          getPromotionRedemptions(prev as any),
          prev.sessionConfig.date
        );

        const manualAmountAdjustment = Number(
          (p as any).billingAmountAdjustment || 0
        );

        const finalAmount = Math.max(
          0,
          Math.round(
            finalCharge.finalTotal +
            manualAmountAdjustment
          )
        );

        return {
          ...p,
          paid: true,
          paidAmount: finalAmount,
          paymentTime: new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
      }),
    }));

    confetti({
      particleCount: 70,
      spread: 80,
      origin: { y: 0.6 },
    });
  };

'@

$patternMarkAll = '(?s)  const handleMarkAllCheckedInPaid = \(\) => \{.*?\r?\n  \};\r?\n(?=  // HANDLE_BILLING_ADJUSTMENT_V31)'
$matchesMarkAll = [regex]::Matches($app, $patternMarkAll).Count
if ($matchesMarkAll -ne 1) {
    throw "หา handleMarkAllCheckedInPaid ไม่เจอแบบชัดเจน (พบ $matchesMarkAll จุด) - ยังไม่ได้บันทึก App.tsx"
}
$app = [regex]::Replace($app, $patternMarkAll, $newMarkAll, 1)

Set-Content -Path $appFile -Value $app -Encoding UTF8

$archive = Get-Content $archiveFile -Raw -Encoding UTF8

$newArchiveCalc = @'
  const billingPlayers = players.filter(
    (p) =>
      p.isCheckedIn ||
      p.status === 'left' ||
      Boolean(p.checkInTime) ||
      Boolean(p.checkInTimestamp) ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      p.paid
  );

  const totalMatches = matchHistory.length;
  const totalShuttles = sessionConfig.shuttlecocksUsedTotal;

  const unpaidPlayers = billingPlayers.filter(
    (p) => !p.paid
  );

  // Financial calculations
  const memberCourtFee =
    sessionConfig.memberCourtFee ?? 110;

  const shuttleFee =
    sessionConfig.shuttlecockFeePerMatchPerPerson ?? 25;

  const extraPrice =
    sessionConfig.extraShuttlecockPrice ?? 25;

  const calculateArchivePlayerAmount = (p: Player) => {
    const adjustedMatches = Math.max(
      0,
      Number(p.matchesPlayed || 0) +
        Number((p as any).billingMatchAdjustment || 0)
    );

    const court = memberCourtFee;

    const match =
      adjustedMatches * shuttleFee;

    const extra =
      Number(p.extraShuttlecocks || 0) *
      extraPrice;

    const manualAdjustment =
      Number((p as any).billingAmountAdjustment || 0);

    return Math.max(
      0,
      Math.round(
        court +
        match +
        extra +
        manualAdjustment
      )
    );
  };

  const totalRevenue = billingPlayers.reduce(
    (acc, p) =>
      acc + calculateArchivePlayerAmount(p),
    0
  );

  const totalCollected = billingPlayers.reduce(
    (acc, p) => {
      if (!p.paid) return acc;

      // Paid amount is already locked when payment is confirmed.
      if (
        typeof p.paidAmount === 'number' &&
        Number.isFinite(p.paidAmount)
      ) {
        return acc + p.paidAmount;
      }

      return acc + calculateArchivePlayerAmount(p);
    },
    0
  );

  const venueCost =
    sessionConfig.courtCount *
    sessionConfig.totalHours *
    sessionConfig.courtHourlyRate;

  const shuttleCost =
    totalShuttles *
    sessionConfig.shuttlecockPrice;

  const extraExpensesTotal =
    (sessionConfig.extraExpenses || []).reduce(
      (acc, curr) => acc + curr.amount,
      0
    );

  const totalExpense =
    venueCost +
    shuttleCost +
    extraExpensesTotal;

  const netProfit =
    totalRevenue - totalExpense;

  const pendingAmount =
    Math.max(
      0,
      totalRevenue - totalCollected
    );
'@

$patternArchive = '(?s)  const checkedInPlayers = players\.filter\(\(p\) => p\.isCheckedIn\);.*?  const pendingAmount = Math\.max\(0, totalRevenue - totalCollected\);'
$matchesArchive = [regex]::Matches($archive, $patternArchive).Count
if ($matchesArchive -ne 1) {
    throw "หา DailyArchive financial block ไม่เจอแบบชัดเจน (พบ $matchesArchive จุด) - ยังไม่ได้แก้ DailyArchiveModal.tsx"
}
$archive = [regex]::Replace($archive, $patternArchive, $newArchiveCalc, 1)

if ($archive -notmatch 'totalPlayers:\s*checkedInPlayers\.length,') {
    throw "ไม่พบ totalPlayers: checkedInPlayers.length ใน DailyArchiveModal.tsx"
}
$archive = [regex]::Replace(
    $archive,
    'totalPlayers:\s*checkedInPlayers\.length,',
    'totalPlayers: billingPlayers.length,',
    1
)

Set-Content -Path $archiveFile -Value $archive -Encoding UTF8

Write-Host ""
Write-Host "Billing fix applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "แก้แล้ว:" -ForegroundColor Yellow
Write-Host "  1. Payment ใช้ Billing Match Adjustment + Amount Adjustment"
Write-Host "  2. Mark All Paid ไม่รวมสมาชิกที่ไม่ได้มาเล่นวันนี้"
Write-Host "  3. Daily Archive ใช้ matchesPlayed แทน gamesPlayed"
Write-Host "  4. Checkout/Left ยังรวมอยู่ใน Daily Archive"
Write-Host "  5. Collected ใช้ paidAmount ที่ถูกล็อกตอนจ่าย"
Write-Host ""
Write-Host "ถัดไปให้รัน:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Test case:"
Write-Host "  Check-in 110 + 1 Match 25 + Extra Shuttle 25 = 160 บาท"
