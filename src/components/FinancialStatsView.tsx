import React, { useState } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Wallet, 
  Receipt, Users, Calendar, Award, ShieldAlert, Lock, 
  Download, ArrowUpRight, ArrowDownRight, CheckCircle2, 
  AlertCircle, ChevronRight, Plus, Trash2, PieChart, BarChart2,
  FileSpreadsheet, Sparkles, RefreshCw, Layers, ShieldCheck
} from 'lucide-react';
import { SessionConfig, Player, DailySessionArchive, FundTransaction } from '../types';
import { 
  loadSessionArchives, 
  loadFundTransactions, 
  saveFundTransaction, 
  deleteFundTransaction 
} from '../utils/storage';
import confetti from 'canvas-confetti';

interface FinancialStatsViewProps {
  sessionConfig: SessionConfig;
  players: Player[];
  isOrganizerMode: boolean;
  onUnlockOrganizer?: () => void;
  onNavigateToBilling?: () => void;
  onOpenArchiveModal?: () => void;
}

export const FinancialStatsView: React.FC<FinancialStatsViewProps> = ({
  sessionConfig,
  players,
  isOrganizerMode,
  onUnlockOrganizer,
  onNavigateToBilling,
  onOpenArchiveModal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'today' | 'history' | 'treasury'>('today');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Archives & Treasury state
  const [archives, setArchives] = useState<DailySessionArchive[]>(() => loadSessionArchives());
  const [transactions, setTransactions] = useState<FundTransaction[]>(() => loadFundTransactions());
  
  // New fund transaction modal / form
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [txType, setTxType] = useState<'deposit' | 'withdraw'>('withdraw');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txCategory, setTxCategory] = useState<FundTransaction['category']>('shuttlecocks_bulk');

  // Selected archive for detailed inspection
  const [selectedArchive, setSelectedArchive] = useState<DailySessionArchive | null>(null);

  // --- Today's Calculations ---
  const checkedInPlayers = players.filter((p) => p.isCheckedIn);
  const eligiblePlayers = checkedInPlayers.length > 0 ? checkedInPlayers : players;

  const memberCourtFee = sessionConfig.memberCourtFee ?? 110;
  const shuttleFee = sessionConfig.shuttlecockFeePerMatchPerPerson ?? 25;
  const extraPrice = sessionConfig.extraShuttlecockPrice ?? 25;

  const totalGamesPlayed = eligiblePlayers.reduce((acc, p) => acc + p.gamesPlayed, 0);
  const totalExtraShuttles = eligiblePlayers.reduce((acc, p) => acc + (p.extraShuttlecocks || 0), 0);

  // 1. REVENUE (รายรับจากสมาชิก)
  const courtRevenue = eligiblePlayers.length * memberCourtFee;
  const matchShuttleRevenue = totalGamesPlayed * shuttleFee;
  const extraShuttleRevenue = totalExtraShuttles * extraPrice;
  const totalExpectedRevenue = courtRevenue + matchShuttleRevenue + extraShuttleRevenue;

  // Actual Collected (เงินสดที่เก็บได้จริงแล้ว)
  const actualCollectedRevenue = eligiblePlayers
    .filter((p) => p.paid)
    .reduce((acc, p) => {
      const court = memberCourtFee;
      const match = p.gamesPlayed * shuttleFee;
      const extra = (p.extraShuttlecocks || 0) * extraPrice;
      return acc + court + match + extra;
    }, 0);

  const pendingRevenue = Math.max(0, totalExpectedRevenue - actualCollectedRevenue);
  const paidCount = eligiblePlayers.filter((p) => p.paid).length;
  const collectionRate = totalExpectedRevenue > 0 ? (actualCollectedRevenue / totalExpectedRevenue) * 100 : 0;

  // 2. EXPENSES (รายจ่ายจริงของก๊วน)
  const venueCourtCost = sessionConfig.courtCount * sessionConfig.totalHours * sessionConfig.courtHourlyRate;
  const venueShuttleCost = sessionConfig.shuttlecocksUsedTotal * sessionConfig.shuttlecockPrice;
  const extraExpensesTotal = (sessionConfig.extraExpenses || []).reduce((acc, curr) => acc + curr.amount, 0);
  const totalRealExpense = venueCourtCost + venueShuttleCost + extraExpensesTotal;

  // 3. PROFIT / LOSS (กำไร / ขาดทุน)
  const expectedNetProfit = totalExpectedRevenue - totalRealExpense;
  const realizedCashProfit = actualCollectedRevenue - totalRealExpense;

  // Category margins
  const courtProfit = courtRevenue - venueCourtCost;
  const shuttleProfit = (matchShuttleRevenue + extraShuttleRevenue) - venueShuttleCost;

  // 4. HISTORICAL ALL-TIME STATS
  const totalArchivedSessions = archives.length;
  const lifetimeArchivedRevenue = archives.reduce((acc, a) => acc + a.totalRevenue, 0);
  const lifetimeArchivedExpense = archives.reduce((acc, a) => acc + a.totalExpense, 0);
  const lifetimeArchivedProfit = archives.reduce((acc, a) => acc + (a.netProfit ?? (a.totalRevenue - a.totalExpense)), 0);
  
  // Treasury balance
  const treasuryDeposits = transactions
    .filter((t) => t.type === 'deposit')
    .reduce((acc, t) => acc + t.amount, 0);
  const treasuryWithdrawals = transactions
    .filter((t) => t.type === 'withdraw')
    .reduce((acc, t) => acc + t.amount, 0);
  const treasuryNet = treasuryDeposits - treasuryWithdrawals;
  
  // Total Central Fund in Hand (Total Lifetime Profit + Treasury Net)
  const totalCentralFundReserve = lifetimeArchivedProfit + treasuryNet + expectedNetProfit;

  // Averages
  const avgAttendance = totalArchivedSessions > 0
    ? (archives.reduce((acc, a) => acc + a.totalPlayers, 0) / totalArchivedSessions).toFixed(1)
    : (eligiblePlayers.length || 1).toString();
  const avgShuttles = totalArchivedSessions > 0
    ? (archives.reduce((acc, a) => acc + a.totalShuttlecocks, 0) / totalArchivedSessions).toFixed(1)
    : sessionConfig.shuttlecocksUsedTotal.toString();
  const avgProfitPerSession = totalArchivedSessions > 0
    ? Math.round(lifetimeArchivedProfit / totalArchivedSessions)
    : expectedNetProfit;

  // PIN Unlock submit
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === (sessionConfig.organizerPin || '1234')) {
      if (onUnlockOrganizer) onUnlockOrganizer();
      setPinError(false);
      setPinInput('');
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } else {
      setPinError(true);
    }
  };

  // Add Treasury Transaction
  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(txAmount);
    if (isNaN(amountNum) || amountNum <= 0 || !txDescription.trim()) return;

    const newTx: FundTransaction = {
      id: `fund-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      type: txType,
      amount: amountNum,
      description: txDescription.trim(),
      category: txCategory,
      createdAt: Date.now(),
    };

    saveFundTransaction(newTx);
    setTransactions(loadFundTransactions());
    setIsAddTxOpen(false);
    setTxAmount('');
    setTxDescription('');
    confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });
  };

  const handleDeleteTransaction = (id: string) => {
    if (!window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) return;
    deleteFundTransaction(id);
    setTransactions(loadFundTransactions());
  };

  // Export Financial CSV
  const handleExportFinancialReport = () => {
    const rows = [
      ['รายงานสรุปบัญชีรายรับ-รายจ่าย & กำไรขาดทุน ก๊วนกวน'],
      ['วันที่จัดพิมพ์', new Date().toLocaleString('th-TH')],
      ['ก๊วน', sessionConfig.sessionTitle],
      ['วันที่ก๊วน', sessionConfig.date],
      ['สถานที่', sessionConfig.venueName],
      [],
      ['=== 1. สรุปก๊วนวันนี้ ==='],
      ['หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน (บาท)'],
      ['รายรับค่าคอร์ทสมาชิก', `${eligiblePlayers.length} คน x ${memberCourtFee}฿`, courtRevenue.toString()],
      ['รายรับค่าลูกตามแมตช์', `${totalGamesPlayed} เกม x ${shuttleFee}฿`, matchShuttleRevenue.toString()],
      ['รายรับค่าลูกซื้อเพิ่ม', `${totalExtraShuttles} ลูก x ${extraPrice}฿`, extraShuttleRevenue.toString()],
      ['รวมรายรับคาดการณ์ทั้งหมด', '', totalExpectedRevenue.toString()],
      ['ยอดเงินที่เก็บได้จริงแล้ว', `ชำระแล้ว ${paidCount}/${eligiblePlayers.length} คน`, actualCollectedRevenue.toString()],
      ['ยอดค้างชำระ', '', pendingRevenue.toString()],
      [],
      ['รายจ่ายค่าเช่าคอร์ทสนาม', `${sessionConfig.courtCount} คอร์ท x ${sessionConfig.totalHours} ชม. x ${sessionConfig.courtHourlyRate}฿`, venueCourtCost.toString()],
      ['รายจ่ายค่าลูกขนไก่จริง', `${sessionConfig.shuttlecocksUsedTotal} ลูก x ${sessionConfig.shuttlecockPrice}฿`, venueShuttleCost.toString()],
      ...sessionConfig.extraExpenses.map((exp) => [`ค่าใช้จ่ายอื่นๆ: ${exp.name}`, '', exp.amount.toString()]),
      ['รวมรายจ่ายต้นทุนจริงทั้งหมด', '', totalRealExpense.toString()],
      [],
      ['กำไร/ขาดทุนสุทธิคาดการณ์', expectedNetProfit >= 0 ? 'กำไรเข้ากองกลาง' : 'ขาดทุนเข้าเนื้อ', expectedNetProfit.toString()],
      ['กำไรเงินสดในมือปัจจุบัน', '', realizedCashProfit.toString()],
      [],
      ['=== 2. สถิติสะสมภาพรวม ==='],
      ['จำนวนรอบที่จัดก๊วนทั้งหมด', '', totalArchivedSessions.toString()],
      ['รายรับสะสมรวมตลอดกาล', '', (lifetimeArchivedRevenue + totalExpectedRevenue).toString()],
      ['รายจ่ายสะสมรวมตลอดกาล', '', (lifetimeArchivedExpense + totalRealExpense).toString()],
      ['กำไรสะสมสุทธิเข้ากองกลาง', '', (lifetimeArchivedProfit + expectedNetProfit).toString()],
      ['เงินกองกลางสุทธิคงเหลือ', '', totalCentralFundReserve.toString()],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_report_${sessionConfig.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- STRICT ORGANIZER CHECK ---
  if (!isOrganizerMode) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto text-3xl shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-800/80 text-amber-300 text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>ข้อมูลเฉพาะผู้จัดก๊วนเท่านั้น (Organizer Confidential)</span>
            </div>
            <h2 className="text-2xl font-black text-white">
              สรุปบัญชีการเงิน กำไร/ขาดทุน & สถิติกองกลาง
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              ข้อมูลต้นทุนค่าเช่าคอร์ทจริง, ราคาลูกขนไก่ที่จ่ายสนาม, กำไร-ขาดทุนสุทธิ และสถิติเงินกองกลางสะสม ถูกจำกัดสิทธิ์เพื่อรักษาความเป็นส่วนตัวของผู้จัดก๊วน
            </p>
          </div>

          {/* Inline PIN Entry Form */}
          <form onSubmit={handlePinSubmit} className="max-w-xs mx-auto space-y-3 pt-2">
            <div className="space-y-1 text-left">
              <label className="text-xs font-semibold text-slate-300 block text-center">
                กรอกรหัส PIN ผู้จัดก๊วน (4 หลัก) เพื่อปลดล็อค:
              </label>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                className={`w-full text-center text-xl tracking-[0.4em] font-mono py-2.5 px-4 rounded-xl bg-slate-950 border focus:outline-none transition ${
                  pinError
                    ? 'border-rose-500 text-rose-300 focus:border-rose-400'
                    : 'border-slate-700 text-white focus:border-emerald-500'
                }`}
              />
              {pinError && (
                <p className="text-xs text-rose-400 text-center font-medium">
                  รหัส PIN ไม่ถูกต้อง (ค่าเริ่มต้นคือ 1234)
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>ปลดล็อคดูรายงานการเงิน</span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span>🛡️ ระบบความปลอดภัยข้อมูลก๊วนกวน</span>
            <span>•</span>
            <button
              type="button"
              onClick={onNavigateToBilling}
              className="text-emerald-400 hover:underline"
            >
              กลับหน้าชำระเงินสมาชิก
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- ORGANIZER AUTHORIZED VIEW ---
  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 text-[11px] font-bold flex items-center gap-1">
              <Award className="w-3 h-3" />
              <span>โหมดผู้จัดก๊วน (Organizer Command Center)</span>
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-emerald-400 font-semibold">{sessionConfig.sessionTitle}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <span>สรุปบัญชีรายรับ-รายจ่าย & สถิติกำไรขาดทุน</span>
          </h2>
          <p className="text-xs text-slate-400">
            วิเคราะห์ผลประกอบการแบบ Real-time เปรียบเทียบรายรับจากสมาชิกกับต้นทุนค่าสนามจริง พร้อมสถิติสะสมย้อนหลัง
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleExportFinancialReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>ส่งออกรายงาน (CSV)</span>
          </button>

          {onOpenArchiveModal && (
            <button
              type="button"
              onClick={onOpenArchiveModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>บันทึกประวัติ & รีเซ็ตวันใหม่</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('today')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'today'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>1. ก๊วนรอบปัจจุบัน (Today's Financials)</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            expectedNetProfit >= 0 ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
          }`}>
            {expectedNetProfit >= 0 ? `+${expectedNetProfit.toLocaleString()}฿` : `${expectedNetProfit.toLocaleString()}฿`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'history'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>2. สถิติสะสมย้อนหลัง (All-Time Statistics)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
            {archives.length} รอบ
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('treasury')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'treasury'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>3. บัญชีกองกลางก๊วน (Club Treasury)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
            {totalCentralFundReserve.toLocaleString()}฿
          </span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* SUB-TAB 1: TODAY'S FINANCIAL ANALYSIS */}
      {/* ============================================================ */}
      {activeSubTab === 'today' && (
        <div className="space-y-6">
          {/* 4 Core Hero Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Expected Revenue */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                  <span>รายรับคาดการณ์ทั้งหมด</span>
                </span>
                <span className="text-[11px] text-emerald-400 font-semibold">{collectionRate.toFixed(0)}% เก็บได้</span>
              </div>
              <div className="text-3xl font-black text-white">
                {totalExpectedRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between">
                  <span>เงินสดที่เก็บได้จริง:</span>
                  <strong className="text-emerald-400">{actualCollectedRevenue.toLocaleString()} ฿ ({paidCount}/{eligiblePlayers.length} คน)</strong>
                </div>
                <div className="flex justify-between">
                  <span>ยอดค้างชำระ:</span>
                  <strong className={pendingRevenue > 0 ? 'text-amber-400' : 'text-slate-400'}>
                    {pendingRevenue.toLocaleString()} ฿
                  </strong>
                </div>
              </div>
            </div>

            {/* 2. Real Expense */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                  <span>รายจ่ายต้นทุนจริง</span>
                </span>
                <span className="text-[11px] text-slate-400">จ่ายสนาม & ลูก</span>
              </div>
              <div className="text-3xl font-black text-white">
                {totalRealExpense.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between">
                  <span>ค่าคอร์ทสนาม:</span>
                  <span className="text-slate-300">{venueCourtCost.toLocaleString()} ฿ ({sessionConfig.courtCount} คอร์ท x {sessionConfig.totalHours} ชม.)</span>
                </div>
                <div className="flex justify-between">
                  <span>ค่าลูกจริง ({sessionConfig.shuttlecocksUsedTotal} ลูก):</span>
                  <span className="text-slate-300">{venueShuttleCost.toLocaleString()} ฿</span>
                </div>
                {extraExpensesTotal > 0 && (
                  <div className="flex justify-between">
                    <span>ค่าใช้จ่ายอื่นๆ:</span>
                    <span className="text-slate-300">{extraExpensesTotal.toLocaleString()} ฿</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Net Profit / Loss */}
            <div className={`border rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 ${
              expectedNetProfit >= 0
                ? 'bg-gradient-to-br from-slate-900 to-emerald-950/40 border-emerald-500/30'
                : 'bg-gradient-to-br from-slate-900 to-rose-950/40 border-rose-500/30'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  {expectedNetProfit >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                  )}
                  <span>กำไร / ขาดทุนสุทธิ (รอบนี้)</span>
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  expectedNetProfit >= 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}>
                  {expectedNetProfit >= 0 ? '🎉 กำไรเข้ากองกลาง' : '⚠️ ขาดทุนเข้าเนื้อ'}
                </span>
              </div>

              <div className={`text-3xl font-black ${
                expectedNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {expectedNetProfit >= 0 ? `+${expectedNetProfit.toLocaleString()}` : expectedNetProfit.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-400">บาท</span>
              </div>

              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between">
                  <span>กำไรเงินสดในมือปัจจุบัน:</span>
                  <strong className={realizedCashProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {realizedCashProfit >= 0 ? `+${realizedCashProfit.toLocaleString()}` : realizedCashProfit.toLocaleString()} ฿
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>อัตรากำไร (Margin):</span>
                  <span className="text-slate-300 font-semibold">
                    {totalExpectedRevenue > 0 ? ((expectedNetProfit / totalExpectedRevenue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Efficiency & Performance Metrics */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <PieChart className="w-4 h-4 text-indigo-400" />
                  <span>สถิติเฉลี่ย & ประสิทธิภาพ</span>
                </span>
                <span className="text-[11px] text-indigo-400 font-semibold">{eligiblePlayers.length} สมาชิก</span>
              </div>

              <div className="text-3xl font-black text-indigo-400">
                {eligiblePlayers.length > 0 ? (totalExpectedRevenue / eligiblePlayers.length).toFixed(0) : 0}{' '}
                <span className="text-xs font-normal text-slate-400">฿/คน</span>
              </div>

              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between">
                  <span>ต้นทุนเฉลี่ยต่อคน:</span>
                  <span className="text-slate-300">{eligiblePlayers.length > 0 ? (totalRealExpense / eligiblePlayers.length).toFixed(0) : 0} ฿</span>
                </div>
                <div className="flex justify-between">
                  <span>ส่วนต่างเข้ากองกลางต่อคน:</span>
                  <span className="text-emerald-400 font-semibold">
                    {eligiblePlayers.length > 0 ? (expectedNetProfit / eligiblePlayers.length).toFixed(0) : 0} ฿
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>อัตราใช้ลูกต่อเกม:</span>
                  <span className="text-slate-300">
                    {totalGamesPlayed > 0 ? (sessionConfig.shuttlecocksUsedTotal / totalGamesPlayed).toFixed(2) : 0} ลูก/เกม
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Margin Visualizer & Source of Profit */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>โครงสร้างที่มาของกำไรและรายจ่าย (Profit & Loss Flow)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                จำแนกความต่างระหว่างรายรับที่เก็บจากสมาชิก กับต้นทุนจริงที่ต้องจ่ายสนาม
              </p>
            </div>

            {/* Visual Balance Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-300 font-semibold">
                <span>สัดส่วน: ต้นทุนสนามจริง ({totalRealExpense.toLocaleString()}฿) vs รายรับคาดการณ์ ({totalExpectedRevenue.toLocaleString()}฿)</span>
                <span className={expectedNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {expectedNetProfit >= 0 ? `ส่วนเกินกำไร +${expectedNetProfit.toLocaleString()} บาท` : `ขาดทุน ${expectedNetProfit.toLocaleString()} บาท`}
                </span>
              </div>
              <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div 
                  className="bg-rose-500 transition-all duration-500" 
                  style={{ width: `${Math.min(100, (totalRealExpense / (Math.max(totalRealExpense, totalExpectedRevenue) || 1)) * 100)}%` }}
                  title={`ต้นทุนจริง: ${totalRealExpense}฿`}
                />
                {expectedNetProfit > 0 && (
                  <div 
                    className="bg-emerald-400 transition-all duration-500" 
                    style={{ width: `${(expectedNetProfit / (totalExpectedRevenue || 1)) * 100}%` }}
                    title={`กำไรเข้ากองกลาง: ${expectedNetProfit}฿`}
                  />
                )}
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                  <span>ต้นทุนสนาม & ค่าลูก</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  <span>กำไรส่วนเกินเข้ากองกลาง</span>
                </span>
              </div>
            </div>

            {/* 3 Columns Category Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Category 1: Court Fee */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">🏸 1. ส่วนต่างค่าคอร์ท</span>
                  <span className={`text-xs font-bold ${courtProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {courtProfit >= 0 ? `+${courtProfit.toLocaleString()}` : courtProfit.toLocaleString()} ฿
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>เก็บสมาชิก ({eligiblePlayers.length} x {memberCourtFee}฿):</span>
                    <span className="text-slate-200">{courtRevenue.toLocaleString()} ฿</span>
                  </div>
                  <div className="flex justify-between">
                    <span>จ่ายสนามจริง ({sessionConfig.courtCount} คอร์ท x {sessionConfig.totalHours} ชม.):</span>
                    <span className="text-slate-200">-{venueCourtCost.toLocaleString()} ฿</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5">
                  {courtProfit >= 0 
                    ? `สมาชิกมาร่วมตีคุ้มค่าเช่าคอร์ท มีส่วนต่างเข้ากองกลาง ${courtProfit.toLocaleString()} บาท` 
                    : `ค่าคอร์ทที่เก็บจากสมาชิกยังไม่พอจ่ายสนาม ขาดอีก ${Math.abs(courtProfit).toLocaleString()} บาท`}
                </p>
              </div>

              {/* Category 2: Shuttlecock Fee */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">🪶 2. ส่วนต่างค่าลูกขนไก่</span>
                  <span className={`text-xs font-bold ${shuttleProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {shuttleProfit >= 0 ? `+${shuttleProfit.toLocaleString()}` : shuttleProfit.toLocaleString()} ฿
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>เก็บค่าลูกจากสมาชิก ({totalGamesPlayed} เกม + ซื้อเพิ่ม):</span>
                    <span className="text-slate-200">{(matchShuttleRevenue + extraShuttleRevenue).toLocaleString()} ฿</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ต้นทุนลูกจริง ({sessionConfig.shuttlecocksUsedTotal} ลูก x {sessionConfig.shuttlecockPrice}฿):</span>
                    <span className="text-slate-200">-{venueShuttleCost.toLocaleString()} ฿</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5">
                  {shuttleProfit >= 0
                    ? `ยอดค่าลูกเก็บพอดีกับลูกที่ใช้จริง หรือมีกำไรสะสม ${shuttleProfit.toLocaleString()} บาท`
                    : `ใช้ลูกเปลืองเกินยอดที่เก็บ ขาดทุนค่าลูก ${Math.abs(shuttleProfit).toLocaleString()} บาท`}
                </p>
              </div>

              {/* Category 3: Extra Expenses */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">🥤 3. ค่าใช้จ่ายอื่นๆ</span>
                  <span className="text-xs font-bold text-amber-400">
                    -{extraExpensesTotal.toLocaleString()} ฿
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1">
                  {sessionConfig.extraExpenses.length > 0 ? (
                    sessionConfig.extraExpenses.map((exp) => (
                      <div key={exp.id} className="flex justify-between">
                        <span>{exp.name}:</span>
                        <span className="text-slate-200">-{exp.amount.toLocaleString()} ฿</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500 italic">ไม่มีค่าใช้จ่ายเพิ่มเติม</div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5">
                  ค่าใช้จ่ายส่วนกลาง เช่น น้ำดื่ม ขนม ผ้าเย็น ที่ผู้จัดจัดเตรียมให้สมาชิก
                </p>
              </div>
            </div>
          </div>

          {/* Player Breakdown Snapshot Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>สถานะการชำระเงินของสมาชิกวันนี้ ({eligiblePlayers.length} คน)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  จ่ายแล้ว {paidCount} คน ({actualCollectedRevenue.toLocaleString()}฿) • ค้างชำระ {eligiblePlayers.length - paidCount} คน ({pendingRevenue.toLocaleString()}฿)
                </p>
              </div>

              {onNavigateToBilling && (
                <button
                  type="button"
                  onClick={onNavigateToBilling}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold bg-slate-800 hover:bg-slate-750 px-3 py-1.5 rounded-xl border border-slate-700 transition"
                >
                  ไปหน้าจัดการคิดเงิน ➔
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">สมาชิก</th>
                    <th className="px-3 py-3 text-center">ประเภท</th>
                    <th className="px-3 py-3 text-center">เล่นไป</th>
                    <th className="px-3 py-3 text-center">ลูกเพิ่ม</th>
                    <th className="px-3 py-3 text-right">ยอดที่ต้องจ่าย</th>
                    <th className="px-4 py-3 text-center">สถานะชำระ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {eligiblePlayers.map((player) => {
                    const cost = memberCourtFee + (player.gamesPlayed * shuttleFee) + ((player.extraShuttlecocks || 0) * extraPrice);
                    return (
                      <tr key={player.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 font-semibold text-white">
                          {player.nickname}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            player.registrationType === 'walkin'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                          }`}>
                            {player.registrationType === 'walkin' ? 'Walk-in' : 'ลงชื่อ'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-slate-300">
                          {player.gamesPlayed} เกม
                        </td>
                        <td className="px-3 py-3 text-center text-slate-300">
                          {(player.extraShuttlecocks || 0) > 0 ? `+${player.extraShuttlecocks}` : '-'}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-white">
                          {cost.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-3 text-center">
                          {player.paid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>ชำระแล้ว</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 border border-amber-800 px-2.5 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" />
                              <span>รอชำระ</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 2: ALL-TIME HISTORICAL STATISTICS */}
      {/* ============================================================ */}
      {activeSubTab === 'history' && (
        <div className="space-y-6">
          {/* Lifetime KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>กองกลางสะสมสุทธิ</span>
                <span className="text-emerald-400 font-bold">รวมทุกรอบ</span>
              </div>
              <div className="text-3xl font-black text-emerald-400">
                +{(lifetimeArchivedProfit + expectedNetProfit).toLocaleString()} <span className="text-xs font-normal text-slate-400">฿</span>
              </div>
              <p className="text-[11px] text-slate-400">
                กำไรสะสมจาก {archives.length + 1} รอบที่จัด
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>รายรับสะสมตลอดกาล</span>
                <span className="text-slate-400 text-xs">Gross Inflow</span>
              </div>
              <div className="text-3xl font-black text-white">
                {(lifetimeArchivedRevenue + totalExpectedRevenue).toLocaleString()} <span className="text-xs font-normal text-slate-400">฿</span>
              </div>
              <p className="text-[11px] text-slate-400">
                เงินค่าคอร์ทและค่าลูกที่เก็บจากสมาชิกทั้งหมด
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>รายจ่ายสะสมตลอดกาล</span>
                <span className="text-slate-400 text-xs">Gross Outflow</span>
              </div>
              <div className="text-3xl font-black text-rose-400">
                {(lifetimeArchivedExpense + totalRealExpense).toLocaleString()} <span className="text-xs font-normal text-slate-400">฿</span>
              </div>
              <p className="text-[11px] text-slate-400">
                ค่าเช่าคอร์ทสนามและลูกแบดที่จ่ายจริงทั้งหมด
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>สถิติต่อรอบเฉลี่ย</span>
                <span className="text-indigo-400 text-xs">Averages</span>
              </div>
              <div className="text-3xl font-black text-indigo-400">
                +{avgProfitPerSession.toLocaleString()} <span className="text-xs font-normal text-slate-400">฿/รอบ</span>
              </div>
              <p className="text-[11px] text-slate-400">
                เฉลี่ย {avgAttendance} คน/รอบ • {avgShuttles} ลูก/รอบ
              </p>
            </div>
          </div>

          {/* Past Sessions Archive History Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>ตารางบันทึกสถิติและผลกำไรแต่ละรอบ ({archives.length} ครั้งในคลังประวัติ)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ประวัติข้อมูลจะถูกบันทึกอัตโนมัติทุกครั้งที่ผู้จัดกดปุ่ม "บันทึกประวัติ & รีเซ็ตวันใหม่"
                </p>
              </div>

              {onOpenArchiveModal && (
                <button
                  type="button"
                  onClick={onOpenArchiveModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>จัดการคลังประวัติ</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">วันที่</th>
                    <th className="px-3 py-3">ชื่อก๊วน & สถานที่</th>
                    <th className="px-3 py-3 text-center">สมาชิก</th>
                    <th className="px-3 py-3 text-center">ลูกที่ใช้</th>
                    <th className="px-3 py-3 text-right">รายรับ</th>
                    <th className="px-3 py-3 text-right">รายจ่าย</th>
                    <th className="px-3 py-3 text-right">กำไร/ขาดทุน</th>
                    <th className="px-4 py-3 text-center">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {/* Current ongoing session row */}
                  <tr className="bg-emerald-950/20 hover:bg-emerald-950/30 transition border-l-4 border-l-emerald-500">
                    <td className="px-4 py-3 font-bold text-emerald-400">
                      {sessionConfig.date} <span className="text-[10px] bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800 ml-1">วันนี้</span>
                    </td>
                    <td className="px-3 py-3 text-white font-medium">
                      <div>{sessionConfig.sessionTitle}</div>
                      <div className="text-[10px] text-slate-400">{sessionConfig.venueName}</div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-200 font-semibold">
                      {eligiblePlayers.length} คน
                    </td>
                    <td className="px-3 py-3 text-center text-slate-200">
                      {sessionConfig.shuttlecocksUsedTotal} ลูก
                    </td>
                    <td className="px-3 py-3 text-right text-emerald-400 font-bold">
                      {totalExpectedRevenue.toLocaleString()} ฿
                    </td>
                    <td className="px-3 py-3 text-right text-rose-400 font-bold">
                      {totalRealExpense.toLocaleString()} ฿
                    </td>
                    <td className="px-3 py-3 text-right font-black">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                        expectedNetProfit >= 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {expectedNetProfit >= 0 ? `+${expectedNetProfit.toLocaleString()}` : expectedNetProfit.toLocaleString()} ฿
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400 text-[11px]">
                      กำลังดำเนินการ
                    </td>
                  </tr>

                  {/* Past archives rows */}
                  {archives.map((item) => {
                    const profit = item.netProfit ?? (item.totalRevenue - item.totalExpense);
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 font-medium text-slate-300">
                          {item.archiveDate}
                        </td>
                        <td className="px-3 py-3 text-slate-200">
                          <div>{item.sessionTitle}</div>
                          <div className="text-[10px] text-slate-400">{item.venueName}</div>
                        </td>
                        <td className="px-3 py-3 text-center text-slate-300">
                          {item.totalPlayers} คน
                        </td>
                        <td className="px-3 py-3 text-center text-slate-300">
                          {item.totalShuttlecocks} ลูก
                        </td>
                        <td className="px-3 py-3 text-right text-slate-200">
                          {item.totalRevenue.toLocaleString()} ฿
                        </td>
                        <td className="px-3 py-3 text-right text-slate-200">
                          {item.totalExpense.toLocaleString()} ฿
                        </td>
                        <td className="px-3 py-3 text-right font-bold">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                            profit >= 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}>
                            {profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()} ฿
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400 text-[11px] max-w-xs truncate">
                          {item.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 3: CLUB TREASURY FUND (กองกลางก๊วน) */}
      {/* ============================================================ */}
      {activeSubTab === 'treasury' && (
        <div className="space-y-6">
          {/* Treasury Summary Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/70 border border-indigo-500/30 rounded-3xl p-6 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                  Club Treasury Reserve
                </span>
                <h3 className="text-2xl font-black text-white mt-0.5">
                  เงินกองกลางก๊วนสะสมสุทธิ
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-lg">
                  คำนวณจาก (กำไรสะสมจากการจัดก๊วนทั้งหมด) + (เงินฝากตั้งต้น) - (ค่าใช้จ่ายเบิกซื้อลูกแบดยกลัง/อุปกรณ์ส่วนกลาง)
                </p>
              </div>

              <div className="text-left sm:text-right bg-slate-950/80 border border-slate-800 p-4 rounded-2xl">
                <div className="text-xs text-slate-400">ยอดคงเหลือกองกลางปัจจุบัน:</div>
                <div className="text-3xl sm:text-4xl font-black text-emerald-400 mt-0.5">
                  {totalCentralFundReserve.toLocaleString()}{' '}
                  <span className="text-sm font-normal text-slate-400">บาท</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block">กำไรสะสมจากก๊วน:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  +{(lifetimeArchivedProfit + expectedNetProfit).toLocaleString()} ฿
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block">เงินฝากตั้งต้น/สมทบ:</span>
                <span className="text-indigo-400 font-bold text-sm">
                  +{treasuryDeposits.toLocaleString()} ฿
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block">เบิกซื้อลูกยกลัง/อุปกรณ์:</span>
                <span className="text-rose-400 font-bold text-sm">
                  -{treasuryWithdrawals.toLocaleString()} ฿
                </span>
              </div>
            </div>
          </div>

          {/* Treasury Transactions Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>บันทึกการเบิกจ่าย & สมทบเงินกองกลาง ({transactions.length} รายการ)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  บันทึกการเบิกเงินซื้อลูกแบดยกโหล, ลูกสำรอง, กล่องปฐมพยาบาล หรือเงินสปอนเซอร์สมทบ
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddTxOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>+ บันทึกรายการใหม่</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">วันที่</th>
                    <th className="px-3 py-3">ประเภท</th>
                    <th className="px-3 py-3">รายละเอียด</th>
                    <th className="px-3 py-3 text-right">จำนวนเงิน</th>
                    <th className="px-4 py-3 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3 text-slate-300 font-medium">
                        {tx.date}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          tx.type === 'deposit'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {tx.type === 'deposit' ? '⬇️ เงินเข้า / ฝากสมทบ' : '⬆️ เงินออก / เบิกจ่าย'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-white font-medium">
                        {tx.description}
                      </td>
                      <td className={`px-3 py-3 text-right font-bold text-sm ${
                        tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {tx.type === 'deposit' ? `+${tx.amount.toLocaleString()}` : `-${tx.amount.toLocaleString()}`} ฿
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteTransaction(tx.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                          title="ลบรายการ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        ยังไม่มีรายการเบิกจ่ายพิเศษในกองกลาง
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isAddTxOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span>บันทึกรายการเงินกองกลาง</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddTxOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block">ประเภทรายการ:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType('withdraw')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      txType === 'withdraw'
                        ? 'bg-rose-950/60 text-rose-300 border-rose-700'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ⬆️ เบิกเงินออก (จ่ายของ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('deposit')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      txType === 'deposit'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ⬇️ นำเงินเข้า (สมทบ/คืน)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 block">รายละเอียดรายการ:</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ซื้อลูกแบด RSL Classic 1 หลอดสำรอง"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 block">จำนวนเงิน (บาท):</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="เช่น 750"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full text-sm rounded-xl bg-slate-950 border border-slate-800 text-white font-bold px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 block">หมวดหมู่:</label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value as FundTransaction['category'])}
                  className="w-full text-xs rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
                >
                  <option value="shuttlecocks_bulk">ลูกแบดยกลัง / หลอดสำรอง</option>
                  <option value="equipment">อุปกรณ์สนาม / ตาข่าย / ปฐมพยาบาล</option>
                  <option value="drink_snack">น้ำดื่ม / สปอนเซอร์ / ขนม</option>
                  <option value="initial_fund">เงินตั้งต้นกองกลาง</option>
                  <option value="session_surplus">กำไรสะสม</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddTxOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow"
                >
                  บันทึกรายการ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
