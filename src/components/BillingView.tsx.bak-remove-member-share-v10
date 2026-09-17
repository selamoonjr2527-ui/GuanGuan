import React, { useState } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { 
  QrCode, Copy, Check, Download, Users, 
  Calculator, Share2, Trash2, Edit3, Plus, Minus, Info, Search, ShieldAlert, Lock,
  TrendingUp, ChevronRight, ShieldCheck
} from 'lucide-react';
import { Player, SessionConfig, SKILL_LEVELS } from '../types';
import { generatePromptPayPayload, formatPromptPayDisplay } from '../utils/promptpay';
import { PaymentConfirmModal } from './PaymentConfirmModal';
import {
  PromotionRedemption,
  calculatePlayerFinalCharge,
} from '../utils/promotionRules';

interface BillingViewProps {
  sessionConfig: SessionConfig;
  players: Player[];
  isOrganizerMode?: boolean;
  organizerPin?: string;
  onUnlockOrganizer?: () => void;
  onNavigateToFinance?: () => void;
  onUpdateSessionConfig: (newConfig: SessionConfig) => void;
  onTogglePlayerPayment: (playerId: string, paid: boolean, amount?: number, newPin?: string) => void;
  onMarkAllCheckedInPaid: () => void;
  onEditPlayer?: (player: Player) => void;
  onUpdatePlayerExtraShuttlecocks?: (playerId: string, delta: number) => void;
  promotionRedemptions?: PromotionRedemption[];
}

export const BillingView: React.FC<BillingViewProps> = ({
  sessionConfig,
  players,
  isOrganizerMode = true,
  organizerPin = '1234',
  onUnlockOrganizer,
  onNavigateToFinance,
  onUpdateSessionConfig,
  onTogglePlayerPayment,
  onMarkAllCheckedInPaid,
  onEditPlayer,
  onUpdatePlayerExtraShuttlecocks,
  promotionRedemptions = [],
}) => {
  const [copiedLine, setCopiedLine] = useState(false);
  const [copiedMemberLink, setCopiedMemberLink] = useState(false);
  const [copiedPromptPay, setCopiedPromptPay] = useState(false);
  const [selectedPlayerForQr, setSelectedPlayerForQr] = useState<Player | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Payment confirmation safety modal
  const [confirmPaymentData, setConfirmPaymentData] = useState<{
    player: Player;
    cost: number;
    costBreakdown?: string;
    isMarkingPaid: boolean;
  } | null>(null);

  // Member-only personal lookup selection
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');

  // Extra expense state
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');

  // Billing participants in this session.
  // Checked-out players stay visible because payment is allowed only after Checkout.
  const checkedInPlayers = players.filter((p) => p.isCheckedIn);
  const eligiblePlayers = players.filter(
    (p) =>
      p.isCheckedIn ||
      p.status === 'left' ||
      Boolean(p.checkInTime) ||
      Boolean(p.checkInTimestamp) ||
      (p.matchesPlayed || 0) > 0 ||
      p.paid
  );

  // Club Rate specific settings (default: 110฿ court, 25฿ shuttle/person/match, 25฿ extra shuttle)
  const memberCourtFee = sessionConfig.memberCourtFee ?? 110;
  const shuttlecockFeePerMatch = sessionConfig.shuttlecockFeePerMatchPerPerson ?? 25;
  const extraShuttlecockPrice = sessionConfig.extraShuttlecockPrice ?? 25;

  const totalGamesPlayed = eligiblePlayers.reduce(
    (acc, p) => acc + (p.gamesPlayed || 0),
    0
  );
  const totalMatchesPlayed = eligiblePlayers.reduce(
    (acc, p) => acc + (p.matchesPlayed || 0),
    0
  );
  const totalExtraShuttlecocks = eligiblePlayers.reduce((acc, p) => acc + (p.extraShuttlecocks || 0), 0);

  // Extra expenses
  const extraExpensesTotal = sessionConfig.extraExpenses.reduce((acc, curr) => acc + curr.amount, 0);

  // Venue-based totals (for equal / per_game / fixed)
  const venueCourtTotal = sessionConfig.courtCount * sessionConfig.totalHours * sessionConfig.courtHourlyRate;
  const venueShuttleTotal = sessionConfig.shuttlecocksUsedTotal * sessionConfig.shuttlecockPrice;
  const venueGrandTotal = venueCourtTotal + venueShuttleTotal + extraExpensesTotal;

  // Club-rate totals
  const clubCourtTotal = eligiblePlayers.length * memberCourtFee;
  const clubShuttleMatchTotal = totalMatchesPlayed * shuttlecockFeePerMatch;
  const clubExtraShuttleTotal = totalExtraShuttlecocks * extraShuttlecockPrice;
  const clubBaseGrandTotal =
    clubCourtTotal + clubShuttleMatchTotal + clubExtraShuttleTotal + extraExpensesTotal;

  const clubPromotionDiscountTotal = eligiblePlayers.reduce((sum, player) => {
    const charge = calculatePlayerFinalCharge(
      player,
      sessionConfig,
      promotionRedemptions,
      sessionConfig.date
    );
    return sum + charge.promotionDiscount;
  }, 0);

  const clubGrandTotal = Math.max(
    0,
    clubBaseGrandTotal - clubPromotionDiscountTotal
  );

  const isClubRate = sessionConfig.splitMethod === 'club_rate';
  const grandTotal = isClubRate ? clubGrandTotal : venueGrandTotal;

  // Function to calculate exact cost for each player
  const calculatePlayerCost = (player: Player): number => {
    if (sessionConfig.splitMethod === 'club_rate') {
      return calculatePlayerFinalCharge(
        player,
        sessionConfig,
        promotionRedemptions,
        sessionConfig.date
      ).finalTotal;
    }

    if (sessionConfig.splitMethod === 'fixed') {
      return sessionConfig.fixedFeePerPerson;
    }

    if (sessionConfig.splitMethod === 'per_game') {
      if (totalGamesPlayed === 0) {
        return Math.round(grandTotal / (eligiblePlayers.length || 1));
      }
      const ratio = player.gamesPlayed / totalGamesPlayed;
      return Math.round(grandTotal * ratio);
    }

    // Default 'equal' split
    return Math.ceil(grandTotal / (eligiblePlayers.length || 1));
  };

  const getPlayerBreakdownText = (player: Player): string => {
    if (sessionConfig.splitMethod === 'club_rate') {
      const charge = calculatePlayerFinalCharge(
        player,
        sessionConfig,
        promotionRedemptions,
        sessionConfig.date
      );

      const parts = [`ค่าคอร์ท ${charge.courtFee}฿`];
      if (charge.matchCount > 0) {
        parts.push(`ค่าลูก ${charge.matchCount} Match (${charge.shuttleFee}฿)`);
      } else {
        parts.push('ยังไม่ได้ลง Match • ยังไม่มีค่าลูก');
      }

      if (charge.extraShuttleCount > 0) {
        parts.push(
          `ลูกเพิ่ม ${charge.extraShuttleCount} ลูก (${charge.extraShuttleFee}฿)`
        );
      }

      if (charge.promotionDiscount > 0) {
        parts.push(`ส่วนลดโปร -${charge.promotionDiscount}฿`);
      }

      return parts.join(' + ');
    }
    return '';
  };

  const defaultCostPerPerson = eligiblePlayers.length > 0
    ? Math.ceil(grandTotal / eligiblePlayers.length)
    : 0;

  // Generate QR code for a given amount
  const generateQrForAmount = async (amount: number) => {
    try {
      const payload = generatePromptPayPayload(sessionConfig.promptPayId, amount);
      const url = await QRCode.toDataURL(payload, {
        width: 320,
        margin: 2,
        color: {
          dark: '#020617',
          light: '#ffffff',
        },
      });
      setQrDataUrl(url);
      setShowQrModal(true);
    } catch (err) {
      console.error('Failed to generate PromptPay QR', err);
    }
  };

  const handleOpenGeneralQr = () => {
    setSelectedPlayerForQr(null);
    generateQrForAmount(defaultCostPerPerson);
  };

  const handleOpenPlayerQr = (player: Player) => {
    if (player.isCheckedIn) {
      window.alert(`กรุณา Check-out "${player.nickname}" ก่อนเปิด QR ชำระเงิน`);
      return;
    }
    setSelectedPlayerForQr(player);
    const amount = calculatePlayerCost(player);
    generateQrForAmount(amount);
  };

  const handleRequestTogglePayment = (player: Player, isMarkingPaid: boolean) => {
    if (isMarkingPaid && player.isCheckedIn) {
      window.alert(
        `กรุณา Check-out "${player.nickname}" ก่อนชำระเงิน\n\nระบบจะล็อกยอดหลัง Check-out เพื่อป้องกันจำนวน Match เปลี่ยนระหว่างเล่น`
      );
      return;
    }

    const cost = calculatePlayerCost(player);
    const breakdown = getPlayerBreakdownText(player);
    setConfirmPaymentData({
      player,
      cost,
      costBreakdown: breakdown,
      isMarkingPaid,
    });
  };

  const handleSafeMarkAllPaid = () => {
    const checkedOutUnpaid = eligiblePlayers.filter(
      (p) => !p.isCheckedIn && !p.paid
    );

    if (checkedOutUnpaid.length === 0) {
      window.alert('ยังไม่มีสมาชิกที่ Check-out และรอชำระเงิน');
      return;
    }

    if (
      window.confirm(
        `ทำเครื่องหมายชำระเฉพาะสมาชิกที่ Check-out แล้ว ${checkedOutUnpaid.length} คน ใช่หรือไม่?`
      )
    ) {
      onMarkAllCheckedInPaid();
    }
  };

  const handleCopyPromptPayNumber = () => {
    navigator.clipboard.writeText(sessionConfig.promptPayId);
    setCopiedPromptPay(true);
    setTimeout(() => setCopiedPromptPay(false), 2000);
  };

  // Add extra expense
  const handleAddExtraExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newExpenseAmount);
    if (!newExpenseName.trim() || isNaN(amount) || amount <= 0) return;

    const updated = [
      ...sessionConfig.extraExpenses,
      { id: `exp-${Date.now()}`, name: newExpenseName.trim(), amount },
    ];
    onUpdateSessionConfig({ ...sessionConfig, extraExpenses: updated });
    setNewExpenseName('');
    setNewExpenseAmount('');
  };

  const handleRemoveExtraExpense = (id: string) => {
    const updated = sessionConfig.extraExpenses.filter((item) => item.id !== id);
    onUpdateSessionConfig({ ...sessionConfig, extraExpenses: updated });
  };

  // Generate LINE message text with comprehensive breakdown
  const generateLineMessage = (): string => {
    const paidList = eligiblePlayers.filter((p) => p.paid);
    const unpaidList = eligiblePlayers.filter((p) => !p.paid);

    const formatPlayerLine = (p: Player) => {
      const cost = calculatePlayerCost(p);
      if (sessionConfig.splitMethod === 'club_rate') {
        const extra = (p.extraShuttlecocks || 0) > 0 ? ` + ลูกเพิ่ม ${p.extraShuttlecocks} ลูก` : '';
        return `  ${p.nickname}: ${cost}฿ (คอร์ท ${memberCourtFee}฿ + ลูก ${p.matchesPlayed || 0} Match${extra})`;
      }
      return `  ${p.nickname}: ${cost}฿ (${p.gamesPlayed} เกม)`;
    };

    const unpaidText = unpaidList.length > 0
      ? unpaidList.map((p) => `⏳ ${formatPlayerLine(p)}`).join('\n')
      : '  (ชำระครบทุกคนแล้ว 🎉)';

    const paidText = paidList.length > 0
      ? paidList.map((p) => `✅ ${formatPlayerLine(p)}`).join('\n')
      : '  (ยังไม่มีผู้ชำระ)';

    let methodSummary = '';
    if (sessionConfig.splitMethod === 'club_rate') {
      methodSummary = `🏸 อัตราค่าบริการระบบก๊วน:
- ค่าคอร์ทสมาชิก: ${memberCourtFee} บาท/คน
- ค่าลูก: 1 แมตช์ต่อลูก (${shuttlecockFeePerMatch} บาท/คน/แมตช์)
- ซื้อลูกเพิ่ม: ${extraShuttlecockPrice} บาท/ลูก`;
    } else if (sessionConfig.splitMethod === 'per_game') {
      methodSummary = `🏸 คิดเงินตามสัดส่วนเกมที่เล่น (เล่นมากจ่ายตามส่วน)`;
    } else if (sessionConfig.splitMethod === 'fixed') {
      methodSummary = `🏸 ราคาเหมาต่อคน: ${sessionConfig.fixedFeePerPerson} บาท`;
    } else {
      methodSummary = `🏸 หารเท่ากันทุกคน: ตกคนละ ~${defaultCostPerPerson} บาท`;
    }

    return `🏸 สรุปยอดก๊วนแบดมินตัน
📌 ก๊วน: ${sessionConfig.sessionTitle}
📅 วันที่: ${sessionConfig.date} (${sessionConfig.startTime} - ${sessionConfig.endTime} น.)
📍 สถานที่: ${sessionConfig.venueName}
------------------------------------
${methodSummary}
💰 ยอดรวมทั้งสิ้น: ${grandTotal.toLocaleString()} บาท (สมาชิก ${eligiblePlayers.length} คน)
------------------------------------
📱 ช่องทางชำระเงินผ่าน PromptPay:
เลขพร้อมเพย์: ${formatPromptPayDisplay(sessionConfig.promptPayId)}
ชื่อบัญชี: ${sessionConfig.promptPayName}
------------------------------------
สถานะการชำระเงิน (${paidList.length}/${eligiblePlayers.length} คน):

[รอชำระ]:
${unpaidText}

[ชำระแล้ว]:
${paidText}

------------------------------------
🔗 ลิงก์เช็คคิวและชำระเงิน (มุมมองสมาชิก):
${typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?mode=member` : ''}

ขอบคุณทุกคนที่มาร่วมสนุกกันครับ! เจอกันใหม่ครั้งหน้าครับ 🙏🏸`;
  };

  const handleCopyLineText = () => {
    const text = generateLineMessage();
    navigator.clipboard.writeText(text);
    setCopiedLine(true);
    setTimeout(() => setCopiedLine(false), 2500);
  };

  const handleCopyMemberLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}${window.location.pathname}?mode=member`;
      navigator.clipboard.writeText(url);
      setCopiedMemberLink(true);
      setTimeout(() => setCopiedMemberLink(false), 2500);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const rows = [
      ['ชื่อเล่น', 'ชื่อจริง', 'เบอร์โทร', 'ระดับมือ', 'จำนวนเกม', 'จำนวนแมตช์', 'ลูกซื้อเพิ่ม (ลูก)', 'ยอดที่ต้องจ่าย (บาท)', 'สถานะการจ่าย'],
      ...eligiblePlayers.map((p) => [
        p.nickname,
        p.fullName || '',
        p.phone || '',
        p.skillLevel,
        (p.gamesPlayed || 0).toString(),
        (p.matchesPlayed || 0).toString(),
        (p.extraShuttlecocks || 0).toString(),
        calculatePlayerCost(p).toString(),
        p.paid ? 'ชำระแล้ว' : 'รอชำระ',
      ]),
      [],
      ['สรุปค่าใช้จ่าย'],
      isClubRate
        ? ['ค่าคอร์ทสมาชิกทั้งหมด', clubCourtTotal.toString()]
        : ['ค่าคอร์ทสนาม', venueCourtTotal.toString()],
      isClubRate
        ? ['ค่าลูกตามแมตช์', clubShuttleMatchTotal.toString()]
        : ['ค่าลูกขนไก่', venueShuttleTotal.toString()],
      isClubRate
        ? ['ค่าลูกซื้อเพิ่ม', clubExtraShuttleTotal.toString()]
        : [],
      ['ค่าใช้จ่ายอื่นๆ', extraExpensesTotal.toString()],
      ['ยอดรวมทั้งหมด', grandTotal.toString()],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `badminton_billing_${sessionConfig.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalCollected = eligiblePlayers
    .filter((p) => p.paid)
    .reduce(
      (acc, p) =>
        acc +
        (typeof p.paidAmount === 'number'
          ? p.paidAmount
          : calculatePlayerCost(p)),
      0
    );

  const pendingAmount = grandTotal - totalCollected;

  // Active member for lookup
  const activeMember = eligiblePlayers.find((p) => p.id === selectedMemberId);

  // Filtered player list for table
  const filteredPlayers = eligiblePlayers.filter((p) => {
    if (!memberSearchQuery.trim()) return true;
    const q = memberSearchQuery.toLowerCase();
    return p.nickname.toLowerCase().includes(q) || (p.fullName && p.fullName.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Privacy Notice Banner for Members */}
      {!isOrganizerMode && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>หน้าชำระเงินสำหรับสมาชิก (Member Billing)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                  ส่วนบุคคล
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                เลือกชื่อของคุณเพื่อดูยอดที่ต้องชำระเฉพาะบุคคล และสแกน QR พร้อมเพย์เพื่อโอนเงิน (ยอดสรุปผลรวมทั้งหมดจะเห็นได้เฉพาะผู้จัดก๊วน)
              </p>
            </div>
          </div>

          {onUnlockOrganizer && (
            <button
              type="button"
              onClick={onUnlockOrganizer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition self-start sm:self-auto shrink-0"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>โหมดผู้จัดก๊วน</span>
            </button>
          )}
        </div>
      )}

      {/* MEMBER-ONLY: Personal Bill Lookup & Direct QR Scan */}
      {!isOrganizerMode && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/70 border border-indigo-500/30 rounded-2xl p-5 sm:p-6 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-400" />
                <span>ค้นหาและตรวจเช็คยอดชำระของคุณ</span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                คลิกเลือกชื่อเล่นของคุณเพื่อตรวจสอบยอดชำระ และเปิด QR Code พร้อมเพย์ตรงยอด
              </p>
            </div>

            {/* Dropdown Selector */}
            <div className="w-full sm:w-64">
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              >
                <option value="">-- คลิกเพื่อเลือกชื่อของคุณ --</option>
                {eligiblePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    คุณ {p.nickname} ({p.gamesPlayed || 0} เกม / {p.matchesPlayed || 0} Match • {p.paid ? 'ชำระแล้ว ✅' : p.isCheckedIn ? 'ยัง Check-in 🔒' : 'รอชำระ ⏳'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* If Member is Selected */}
          {activeMember ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
              {/* Left Column: Member Card & Breakdown */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${activeMember.avatarColor} text-white text-lg font-bold flex items-center justify-center shadow shrink-0`}
                  >
                    {activeMember.nickname.slice(0, 1)}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">คุณ {activeMember.nickname}</h4>
                    <span className="text-xs text-slate-400">
                      ลงเล่นไปแล้ว: <strong className="text-white">{activeMember.gamesPlayed || 0}</strong> เกม • <strong className="text-amber-300">{activeMember.matchesPlayed || 0}</strong> Match
                    </span>
                  </div>
                </div>

                {/* Amount Due Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">
                      {activeMember.isCheckedIn
                        ? 'ยอดปัจจุบัน (Check-out ก่อนจ่าย):'
                        : 'ยอดสุทธิที่ต้องชำระ:'}
                    </span>
                    <div className="text-3xl font-extrabold text-emerald-400 mt-0.5">
                      {calculatePlayerCost(activeMember).toLocaleString()}{' '}
                      <span className="text-sm font-normal text-slate-400">บาท</span>
                    </div>
                  </div>

                  <div>
                    {activeMember.paid ? (
                      <button
                        type="button"
                        onClick={() => handleRequestTogglePayment(activeMember, false)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition shadow-sm"
                        title="คลิกหากต้องการยกเลิกการชำระเงิน (ต้องยืนยันตัวตน)"
                      >
                        <Check className="w-4 h-4" />
                        <span>ชำระเงินแล้ว ✅</span>
                      </button>
                    ) : activeMember.isCheckedIn ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Check-out ก่อนชำระ</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRequestTogglePayment(activeMember, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 animate-pulse transition shadow-sm"
                        title="คลิกเพื่อยืนยันชำระเงิน (มีระบบตรวจรหัส 4 หลัก)"
                      >
                        <span>รอชำระเงิน (กดจ่าย) ⏳</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Itemized Breakdown */}
                <div className="space-y-2 text-xs">
                  <span className="text-slate-400 font-bold block">รายละเอียดค่าใช้จ่าย:</span>
                  <div className="space-y-1.5 bg-slate-900/60 rounded-xl p-3 border border-slate-800/80">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>• ค่าคอร์ทสมาชิก:</span>
                      <span className="font-semibold text-white">{memberCourtFee} บาท</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>• ค่าลูกตามแมตช์ ({activeMember.matchesPlayed || 0} Match x {shuttlecockFeePerMatch}฿):</span>
                      <span className="font-semibold text-amber-400">
                        {((activeMember.matchesPlayed || 0) * shuttlecockFeePerMatch)} บาท
                      </span>
                    </div>
                    {(activeMember.extraShuttlecocks || 0) > 0 && (
                      <div className="flex items-center justify-between text-slate-300">
                        <span>• ค่าลูกซื้อเพิ่ม ({activeMember.extraShuttlecocks} ลูก x {extraShuttlecockPrice}฿):</span>
                        <span className="font-semibold text-blue-400">
                          {((activeMember.extraShuttlecocks || 0) * extraShuttlecockPrice)} บาท
                        </span>
                      </div>
                    )}
                    {(activeMember.matchesPlayed || 0) === 0 && (
                      <div className="rounded-lg bg-cyan-950/30 border border-cyan-800/40 px-2.5 py-2 text-[10px] text-cyan-300">
                        ✓ เช็คอินอย่างเดียวคิดเฉพาะค่าคอร์ท • ค่าลูกจะเริ่มหลังจบ Match แรก
                      </div>
                    )}
                    {calculatePlayerFinalCharge(
                      activeMember,
                      sessionConfig,
                      promotionRedemptions,
                      sessionConfig.date
                    ).promotionDiscount > 0 && (
                      <div className="flex items-center justify-between text-emerald-300">
                        <span>• ส่วนลดโปรโมชั่น:</span>
                        <span className="font-semibold">
                          -{calculatePlayerFinalCharge(
                            activeMember,
                            sessionConfig,
                            promotionRedemptions,
                            sessionConfig.date
                          ).promotionDiscount} บาท
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* PromptPay Info */}
                <div className="text-xs bg-slate-900/60 rounded-xl p-3 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 block text-[11px]">พร้อมเพย์หัวก๊วน:</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {formatPromptPayDisplay(sessionConfig.promptPayId)}
                    </span>
                    <span className="text-[11px] text-slate-400 block">({sessionConfig.promptPayName})</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPromptPayNumber}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                  >
                    {copiedPromptPay ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPromptPay ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Scan PromptPay QR Directly */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-bold text-slate-300 mb-1">
                  สแกนจ่ายของ: คุณ {activeMember.nickname}
                </span>
                <span className="text-xs text-emerald-400 font-extrabold mb-3">
                  ยอดเงิน: {calculatePlayerCost(activeMember)} บาท
                </span>

                {activeMember.isCheckedIn && !activeMember.paid ? (
                  <div className="w-full rounded-2xl bg-amber-950/30 border border-amber-700/40 p-6 text-center mb-3">
                    <Lock className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                    <div className="text-sm font-bold text-amber-300">
                      กรุณา Check-out ก่อนชำระเงิน
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      QR จะเปิดหลัง Check-out เพื่อให้ยอด Match ถูกล็อกแล้ว
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenPlayerQr(activeMember)}
                      className="p-3 bg-white rounded-2xl shadow-lg hover:scale-105 transition cursor-pointer group mb-3"
                      title="คลิกเพื่อเปิดดู QR ขนาดใหญ่"
                    >
                      <QrCode className="w-40 h-40 text-slate-950 mx-auto" />
                      <span className="text-[10px] text-slate-600 font-bold block mt-1">
                        คลิกเพื่อเปิดสแกน QR ขนาดใหญ่ 🔍
                      </span>
                    </button>
                    <p className="text-[11px] text-slate-400 max-w-xs">
                      สแกนผ่านแอปธนาคารใดก็ได้ ระบบจะใส่ยอด {calculatePlayerCost(activeMember)} บาท ให้อัตโนมัติ
                    </p>
                  </>
                )}

                {!activeMember.paid && activeMember.isCheckedIn ? (
                  <div className="w-full mt-3 py-2.5 px-4 rounded-xl bg-slate-800 text-amber-300 font-bold text-xs border border-amber-800/50 flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" />
                    <span>Check-out ก่อน จึงจะยืนยันชำระได้</span>
                  </div>
                ) : !activeMember.paid ? (
                  <button
                    type="button"
                    onClick={() => handleRequestTogglePayment(activeMember, true)}
                    className="w-full mt-3 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>โอนเงินแล้ว กดเพื่อยืนยันชำระ (ตรวจรหัส 4 หลัก)</span>
                  </button>
                ) : (
                  <div className="w-full mt-3 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs flex items-center justify-between">
                    <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>ชำระเงินแล้ว {activeMember.paymentTime ? `(${activeMember.paymentTime})` : ''}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRequestTogglePayment(activeMember, false)}
                      className="text-[11px] text-slate-400 hover:text-rose-400 underline transition"
                    >
                      ยกเลิกชำระ
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Quick Member Pills when none selected */
            <div className="pt-2">
              <span className="text-xs text-slate-400 block mb-2 font-medium">
                หรือคลิกชื่อเล่นของคุณจากรายการด้านล่าง:
              </span>
              <div className="flex flex-wrap gap-2">
                {eligiblePlayers.map((p) => {
                  const cost = calculatePlayerCost(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedMemberId(p.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 ${
                        p.paid
                          ? 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          : 'bg-indigo-950/40 text-indigo-200 border-indigo-800/60 hover:border-indigo-500'
                      }`}
                    >
                      <span>{p.nickname}</span>
                      <span className="text-[10px] text-slate-400">({cost}฿)</span>
                      {p.paid && <span className="text-emerald-400 text-[10px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ORGANIZER-ONLY: Financial Summary & Profit/Loss Shortcut Banner */}
      {isOrganizerMode && onNavigateToFinance && (
        <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-emerald-950/60 border border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-300">📊 สรุปเรื่องเงินสำหรับผู้จัด</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                  👑 เฉพาะผู้จัดเท่านั้น
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                ดูวิเคราะห์รายรับ-รายจ่ายจริง, ต้นทุนค่าสนาม, กำไร/ขาดทุนสุทธิ & สถิติกองกลาง
              </h3>
              <p className="text-xs text-slate-400">
                ระบบคำนวณส่วนต่างกำไรเข้ากองกลาง และบันทึกประวัติย้อนหลังทุกรอบของก๊วนกวน
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToFinance}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition shrink-0 self-start sm:self-auto"
          >
            <span>เปิดหน้ารายงานการเงิน & สถิติ</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ORGANIZER-ONLY: Top Cost Breakdown Cards */}
      {isOrganizerMode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isClubRate ? (
            <>
              {/* Club Court Fee */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>ค่าคอร์ทสมาชิก</span>
                  <span className="text-emerald-400 font-semibold">{memberCourtFee}฿ / คน</span>
                </div>
                <div className="text-2xl font-extrabold text-white mt-1">
                  {clubCourtTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  สมาชิกที่เช็คอิน {eligiblePlayers.length} คน x {memberCourtFee}฿
                </p>
              </div>

              {/* Club Match Shuttle Fee */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>ค่าลูกตามแมตช์ (1 แมตช์/ลูก)</span>
                  <span className="text-amber-400 font-semibold">{shuttlecockFeePerMatch}฿ / คน</span>
                </div>
                <div className="text-2xl font-extrabold text-amber-400 mt-1">
                  {clubShuttleMatchTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  ลงเล่นรวม {totalMatchesPlayed} Match x {shuttlecockFeePerMatch}฿
                </p>
              </div>

              {/* Extra Shuttlecocks */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>ค่าลูกซื้อเพิ่ม</span>
                  <span className="text-blue-400 font-semibold">{extraShuttlecockPrice}฿ / ลูก</span>
                </div>
                <div className="text-2xl font-extrabold text-blue-400 mt-1">
                  {clubExtraShuttleTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  สมาชิกซื้อเพิ่มรวม {totalExtraShuttlecocks} ลูก
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>ค่าเช่าคอร์ทสนาม</span>
                  <span className="text-emerald-400 font-semibold">{sessionConfig.courtHourlyRate}฿ / ชม.</span>
                </div>
                <div className="text-2xl font-extrabold text-white mt-1">
                  {venueCourtTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {sessionConfig.courtCount} คอร์ท x {sessionConfig.totalHours} ชม.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>ค่าลูกขนไก่</span>
                  <span className="text-amber-400 font-semibold">{sessionConfig.shuttlecockPrice}฿ / ลูก</span>
                </div>
                <div className="text-2xl font-extrabold text-amber-400 mt-1">
                  {venueShuttleTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {sessionConfig.shuttlecocksUsedTotal} ลูก ({sessionConfig.shuttlecockBrand})
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>ยอดรวมสนามทั้งหมด</span>
                  <span className="text-xs bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded">
                    {eligiblePlayers.length} คน
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-white mt-1">
                  {venueGrandTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
                </div>
                <p className="text-[11px] text-emerald-400 font-medium mt-1">
                  หารเฉลี่ยคนละ ~{defaultCostPerPerson.toLocaleString()} บาท
                </p>
              </div>
            </>
          )}

          {/* Grand Total & Collection status card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>ยอดรวมทั้งสิ้น / ค้างชำระ</span>
              <span className="text-xs text-slate-400">
                จ่ายแล้ว {eligiblePlayers.filter((p) => p.paid).length}/{eligiblePlayers.length} คน
              </span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {totalCollected.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ {grandTotal.toLocaleString()} ฿</span>
            </div>
            <p className="text-[11px] text-rose-400 mt-1 font-medium">
              ค้างชำระ: {Math.max(0, pendingAmount).toLocaleString()} บาท
            </p>
          </div>
        </div>
      )}

      {/* ORGANIZER-ONLY: Calculator Config & Formula Switcher */}
      {isOrganizerMode && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <span>วิธีคิดเงิน & สรุปค่าใช้จ่าย (Billing Formula)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                เลือกรูปแบบการคิดเงิน: ระบบก๊วน (คอร์ท 110฿ + ลูก 25฿/คน/Match + ลูกเพิ่ม 25฿), หารเท่า, หรือตามจำนวนเกม
              </p>
            </div>

            {/* Split Mode Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium gap-1">
              <button
                type="button"
                onClick={() => onUpdateSessionConfig({ ...sessionConfig, splitMethod: 'club_rate' })}
                className={`px-2.5 py-1.5 rounded-lg transition text-center ${
                  sessionConfig.splitMethod === 'club_rate'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🏸 1. ระบบก๊วน (แนะนำ)
              </button>
              <button
                type="button"
                onClick={() => onUpdateSessionConfig({ ...sessionConfig, splitMethod: 'equal' })}
                className={`px-2.5 py-1.5 rounded-lg transition text-center ${
                  sessionConfig.splitMethod === 'equal'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                2. หารเท่ากันทุกคน
              </button>
              <button
                type="button"
                onClick={() => onUpdateSessionConfig({ ...sessionConfig, splitMethod: 'per_game' })}
                className={`px-2.5 py-1.5 rounded-lg transition text-center ${
                  sessionConfig.splitMethod === 'per_game'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                3. หารตามจำนวนเกม
              </button>
              <button
                type="button"
                onClick={() => onUpdateSessionConfig({ ...sessionConfig, splitMethod: 'fixed' })}
                className={`px-2.5 py-1.5 rounded-lg transition text-center ${
                  sessionConfig.splitMethod === 'fixed'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                4. กำหนดราคาตายตัว
              </button>
            </div>
          </div>

          {/* Live inputs based on chosen mode */}
          {isClubRate ? (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <label className="text-[11px] text-slate-400 block mb-1">
                    ค่าคอร์ทสมาชิก (ทุกคนต้องจ่าย):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={memberCourtFee}
                      onChange={(e) =>
                        onUpdateSessionConfig({
                          ...sessionConfig,
                          memberCourtFee: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-full text-xs rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 font-extrabold px-3 py-2 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-slate-400 shrink-0">฿/คน</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">มาตรฐาน: 110 บาทสำหรับสมาชิก</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <label className="text-[11px] text-slate-400 block mb-1">
                    ค่าลูก (1 แมตช์ต่อลูก จ่ายต่อคน):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={shuttlecockFeePerMatch}
                      onChange={(e) =>
                        onUpdateSessionConfig({
                          ...sessionConfig,
                          shuttlecockFeePerMatchPerPerson: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-full text-xs rounded-lg bg-slate-900 border border-slate-700 text-amber-400 font-extrabold px-3 py-2 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-slate-400 shrink-0">฿/คน/Match</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">มาตรฐาน: ลูกละ 25 บาท จ่ายต่อคน</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <label className="text-[11px] text-slate-400 block mb-1">
                    สมาชิกต้องการซื้อลูกเพิ่ม:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={extraShuttlecockPrice}
                      onChange={(e) =>
                        onUpdateSessionConfig({
                          ...sessionConfig,
                          extraShuttlecockPrice: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-full text-xs rounded-lg bg-slate-900 border border-slate-700 text-blue-400 font-extrabold px-3 py-2 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-slate-400 shrink-0">฿/ลูก</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">มาตรฐาน: ลูกละ 25 บาทต่อคน</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-400/90 bg-emerald-950/40 border border-emerald-900/50 rounded-xl p-2.5">
                <Info className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>สูตรคิดเงินระบบก๊วน:</strong> ยอดของสมาชิกแต่ละคน = ค่าคอร์ท <strong>{memberCourtFee}฿</strong> + (จำนวน Match ที่เล่น x <strong>{shuttlecockFeePerMatch}฿</strong>) + (ลูกซื้อเพิ่ม x <strong>{extraShuttlecockPrice}฿</strong>)
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">จำนวนลูกที่ใช้:</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={sessionConfig.shuttlecocksUsedTotal}
                    onChange={(e) =>
                      onUpdateSessionConfig({
                        ...sessionConfig,
                        shuttlecocksUsedTotal: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 focus:outline-none focus:border-emerald-500 font-bold"
                  />
                  <span className="text-xs text-slate-400 shrink-0">ลูก</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">ราคาลูกต่อลูก:</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={sessionConfig.shuttlecockPrice}
                    onChange={(e) =>
                      onUpdateSessionConfig({
                        ...sessionConfig,
                        shuttlecockPrice: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs text-slate-400 shrink-0">฿</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">ค่าคอร์ทต่อชั่วโมง:</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={sessionConfig.courtHourlyRate}
                    onChange={(e) =>
                      onUpdateSessionConfig({
                        ...sessionConfig,
                        courtHourlyRate: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs text-slate-400 shrink-0">฿/ชม.</span>
                </div>
              </div>

              {sessionConfig.splitMethod === 'fixed' ? (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">ราคาเหมาต่อคน:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={sessionConfig.fixedFeePerPerson}
                      onChange={(e) =>
                        onUpdateSessionConfig({
                          ...sessionConfig,
                          fixedFeePerPerson: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-bold px-3 py-2 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-slate-400 shrink-0">฿</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">เวลารวมที่ตี:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      value={sessionConfig.totalHours}
                      onChange={(e) =>
                        onUpdateSessionConfig({
                          ...sessionConfig,
                          totalHours: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-slate-400 shrink-0">ชม.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extra Expenses Tag List */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="text-xs text-slate-400 font-medium mb-2">ค่าใช้จ่ายเพิ่มเติม (น้ำดื่ม, ผ้าเย็น, ขนม ฯลฯ):</div>
            <div className="flex flex-wrap items-center gap-2">
              {sessionConfig.extraExpenses.map((exp) => (
                <span
                  key={exp.id}
                  className="inline-flex items-center gap-1.5 text-xs bg-slate-950 border border-slate-800 px-3 py-1 rounded-xl text-slate-300"
                >
                  <span>{exp.name} ({exp.amount}฿)</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveExtraExpense(exp.id)}
                    className="text-slate-500 hover:text-rose-400 ml-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}

              {/* Quick add expense inline form */}
              <form onSubmit={handleAddExtraExpense} className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="ชื่อรายการ เช่น น้ำดื่ม"
                  value={newExpenseName}
                  onChange={(e) => setNewExpenseName(e.target.value)}
                  className="text-xs rounded-lg bg-slate-950 border border-slate-800 text-white px-2.5 py-1 w-32 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  placeholder="บาท"
                  value={newExpenseAmount}
                  onChange={(e) => setNewExpenseAmount(e.target.value)}
                  className="text-xs rounded-lg bg-slate-950 border border-slate-800 text-white px-2 py-1 w-16 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 px-2.5 py-1 rounded-lg border border-slate-700 font-semibold"
                >
                  + เพิ่ม
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Tools Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">พร้อมเพย์รับโอนเงิน:</div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>{formatPromptPayDisplay(sessionConfig.promptPayId)}</span>
              <span className="text-xs font-normal text-slate-400">({sessionConfig.promptPayName})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCopyPromptPayNumber}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
          >
            {copiedPromptPay ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPromptPay ? 'คัดลอกแล้ว!' : 'คัดลอกเบอร์พร้อมเพย์'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyMemberLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm"
            title="แชร์ลิงก์มุมมองสมาชิกสำหรับให้สมาชิกเช็คยอดและสแกนจ่าย"
          >
            {copiedMemberLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
            <span>{copiedMemberLink ? 'คัดลอกลิงก์แล้ว!' : 'แชร์ลิงก์สมาชิก 📱'}</span>
          </button>

          {isOrganizerMode && (
            <>
              <button
                type="button"
                onClick={handleOpenGeneralQr}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm"
              >
                <QrCode className="w-4 h-4" />
                <span>แสดง QR เฉลี่ย ({defaultCostPerPerson}฿)</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLineText}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-bold transition shadow-sm"
              >
                {copiedLine ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedLine ? 'คัดลอกสำเร็จแล้ว!' : 'คัดลอกส่งเข้า LINE กลุ่ม 📱'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                title="ส่งออกไฟล์ CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Players Billing Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>
                {isOrganizerMode
                  ? `รายชื่อยอดชำระของผู้เล่นทั้งหมด (${eligiblePlayers.length} คน)`
                  : `รายชื่อและยอดชำระของสมาชิกแต่ละคน (${eligiblePlayers.length} คน)`}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isOrganizerMode
                ? 'คิดค่าคอร์ท 110฿ + ค่าลูก 25฿/คน/แมตช์ + ลูกซื้อเพิ่ม 25฿/ลูก ผู้จัดสามารถปรับแก้หรือทำเครื่องหมายชำระได้'
                : 'สมาชิกทุกคนสามารถตรวจสอบยอดที่ตนเองต้องชำระ และคลิกสแกน QR เพื่อโอนเงินได้สะดวก'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search filter in table */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="text-xs rounded-xl bg-slate-950 border border-slate-800 text-white pl-8 pr-3 py-1.5 w-36 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {isOrganizerMode && (
              <button
                type="button"
                onClick={handleSafeMarkAllPaid}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800 px-3 py-1.5 rounded-xl transition shrink-0"
              >
                จ่ายครบเฉพาะคนที่ Check-out
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">ผู้เล่น</th>
                {isOrganizerMode && <th className="px-3 py-3 text-center">ระดับมือ</th>}
                <th className="px-3 py-3 text-center">เล่นไป</th>
                {isClubRate && isOrganizerMode && (
                  <>
                    <th className="px-3 py-3 text-center">ค่าคอร์ท</th>
                    <th className="px-3 py-3 text-center">ค่าลูกแข่ง</th>
                    <th className="px-3 py-3 text-center">ซื้อลูกเพิ่ม</th>
                  </>
                )}
                <th className="px-3 py-3 text-right">ยอดที่ต้องชำระ</th>
                <th className="px-3 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-right">สแกนจ่าย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredPlayers.map((player) => {
                const cost = calculatePlayerCost(player);
                const extraCount = player.extraShuttlecocks || 0;
                const matchCount = player.matchesPlayed || 0;
                const matchShuttleCost = matchCount * shuttlecockFeePerMatch;

                return (
                  <tr
                    key={player.id}
                    className={`hover:bg-slate-800/40 transition ${
                      player.paid ? 'bg-slate-900' : 'bg-rose-950/10'
                    }`}
                  >
                    {/* Player Name */}
                    <td className="px-4 py-3.5 flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg bg-gradient-to-br ${player.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}
                      >
                        {player.nickname.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                          <span>{player.nickname}</span>
                          {isOrganizerMode && onEditPlayer && (
                            <button
                              type="button"
                              onClick={() => onEditPlayer(player)}
                              title="แก้ไขชื่อเล่น / ข้อมูลสมาชิก"
                              className="text-slate-500 hover:text-blue-400 p-0.5 rounded hover:bg-slate-800 transition"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {isClubRate
                            ? `คอร์ท ${memberCourtFee}฿ + ลูก ${player.matchesPlayed || 0} Match${extraCount > 0 ? ` + เพิ่ม ${extraCount} ลูก` : ''}`
                            : player.fullName || player.phone || 'สมาชิก'}
                        </div>
                      </div>
                    </td>

                    {/* Skill Level (Organizer only) */}
                    {isOrganizerMode && (
                      <td className="px-3 py-3.5 text-center">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${SKILL_LEVELS[player.skillLevel].bgColor} ${SKILL_LEVELS[player.skillLevel].color} ${SKILL_LEVELS[player.skillLevel].borderColor}`}
                        >
                          มือ {player.skillLevel}
                        </span>
                      </td>
                    )}

                    {/* Games Played */}
                    <td className="px-3 py-3.5 text-center font-bold text-white">
                      <div>{player.gamesPlayed || 0} เกม</div>
                      <div className="text-[10px] text-amber-400 font-medium">
                        {player.matchesPlayed || 0} Match
                      </div>
                    </td>

                    {/* Club Rate breakdown columns (Organizer only) */}
                    {isClubRate && isOrganizerMode && (
                      <>
                        <td className="px-3 py-3.5 text-center text-slate-300 font-medium">
                          {memberCourtFee}฿
                        </td>
                        <td className="px-3 py-3.5 text-center text-amber-400 font-medium">
                          {matchShuttleCost}฿
                          <span className="text-[10px] text-slate-500 block">
                            ({matchCount}x{shuttlecockFeePerMatch}฿)
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2 py-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => onUpdatePlayerExtraShuttlecocks?.(player.id, -1)}
                              disabled={extraCount <= 0}
                              className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition"
                              title="ลดจำนวนลูกที่ซื้อเพิ่ม"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-bold text-white min-w-[2.5rem] text-center">
                              {extraCount} ลูก
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdatePlayerExtraShuttlecocks?.(player.id, 1)}
                              className="w-5 h-5 flex items-center justify-center rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition"
                              title="ซื้อลูกเพิ่ม (+25฿)"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          {extraCount > 0 && (
                            <span className="text-[10px] text-blue-400 block mt-0.5 font-medium">
                              +{extraCount * extraShuttlecockPrice}฿
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Cost Due */}
                    <td className="px-3 py-3.5 text-right font-extrabold text-sm sm:text-base text-white">
                      {cost.toLocaleString()} <span className="text-xs font-normal text-slate-400">฿</span>
                    </td>

                    {/* Payment Status */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        type="button"
                        disabled={!player.paid && player.isCheckedIn}
                        onClick={() => handleRequestTogglePayment(player, !player.paid)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition shadow-sm ${
                          player.paid
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : player.isCheckedIn
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-700/40 cursor-not-allowed'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                        }`}
                        title={
                          isOrganizerMode
                            ? (player.paid ? 'กดเพื่อยกเลิกการชำระ (โหมดผู้จัด)' : 'กดเพื่อบันทึกการชำระ (โหมดผู้จัด)')
                            : (player.paid ? 'ชำระแล้ว (กดเพื่อยกเลิก ต้องใช้รหัสยืนยัน)' : 'รอชำระ (กดจ่าย ต้องใช้รหัส 4 หลัก)')
                        }
                      >
                        {player.paid ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>ชำระแล้ว</span>
                          </>
                        ) : player.isCheckedIn ? (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Check-out ก่อน</span>
                          </>
                        ) : (
                          <span>รอชำระ (กดจ่าย)</span>
                        )}
                      </button>
                    </td>

                    {/* Scan QR */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={player.isCheckedIn && !player.paid}
                        onClick={() => handleOpenPlayerQr(player)}
                        title={
                          player.isCheckedIn && !player.paid
                            ? 'ต้อง Check-out ก่อนเปิด QR ชำระเงิน'
                            : 'เปิด QR พร้อมเพย์สำหรับผู้เล่นคนนี้'
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] transition ${
                          player.isCheckedIn && !player.paid
                            ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                        <span>QR {cost}฿</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PromptPay QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Thai PromptPay QR
              </span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Target info */}
            <div>
              <h4 className="text-base font-bold text-white">
                {selectedPlayerForQr ? `สแกนจ่ายของ: ${selectedPlayerForQr.nickname}` : 'สแกนจ่ายค่าก๊วนแบด'}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                บัญชี: {sessionConfig.promptPayName} ({formatPromptPayDisplay(sessionConfig.promptPayId)})
              </p>
              {selectedPlayerForQr && (
                <p className="text-[11px] text-amber-400/90 mt-1 font-medium bg-slate-950 py-1 px-2 rounded-lg border border-slate-800">
                  💡 {getPlayerBreakdownText(selectedPlayerForQr)}
                </p>
              )}
            </div>

            {/* Amount Badge */}
            <div className="py-2 px-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-xs text-slate-400">ยอดชำระ:</span>
              <div className="text-3xl font-extrabold text-emerald-400">
                {(selectedPlayerForQr ? calculatePlayerCost(selectedPlayerForQr) : defaultCostPerPerson).toLocaleString()}{' '}
                <span className="text-base font-normal text-slate-400">บาท</span>
              </div>
            </div>

            {/* QR Canvas / Image */}
            <div className="p-4 bg-white rounded-2xl inline-block shadow-lg mx-auto">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="PromptPay QR Code"
                  className="w-56 h-56 mx-auto rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                  กำลังสร้าง QR...
                </div>
              )}
              <div className="mt-2 text-[11px] text-slate-600 font-bold flex items-center justify-center gap-1">
                <span>สแกนผ่านแอปธนาคารได้ทุกธนาคาร</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2">
              {isOrganizerMode && selectedPlayerForQr && !selectedPlayerForQr.isCheckedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    const player = selectedPlayerForQr;
                    setShowQrModal(false);
                    handleRequestTogglePayment(player, true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>บันทึกว่าได้รับเงินแล้ว ✅</span>
                </button>
              ) : selectedPlayerForQr && !selectedPlayerForQr.paid && !selectedPlayerForQr.isCheckedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    const player = selectedPlayerForQr;
                    setShowQrModal(false);
                    handleRequestTogglePayment(player, true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>โอนเงินแล้ว ยืนยันชำระ (รหัส 4 หลัก)</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation 2-Step Safety Modal */}
      <PaymentConfirmModal
        isOpen={confirmPaymentData !== null}
        onClose={() => setConfirmPaymentData(null)}
        player={confirmPaymentData?.player || null}
        cost={confirmPaymentData?.cost || 0}
        costBreakdown={confirmPaymentData?.costBreakdown}
        isMarkingPaid={confirmPaymentData?.isMarkingPaid ?? true}
        isOrganizerMode={isOrganizerMode}
        organizerPin={organizerPin}
        onConfirm={(pinUsed) => {
          if (confirmPaymentData) {
            onTogglePlayerPayment(
              confirmPaymentData.player.id,
              confirmPaymentData.isMarkingPaid,
              confirmPaymentData.cost,
              pinUsed
            );
            if (confirmPaymentData.isMarkingPaid) {
              confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
            }
            setConfirmPaymentData(null);
          }
        }}
      />
    </div>
  );
};
