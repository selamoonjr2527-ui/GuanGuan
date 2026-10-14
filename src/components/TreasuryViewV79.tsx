import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Plus,
  Trash2,
  Wallet,
  Receipt,
  HandCoins,
  PackageOpen,
  Clock3,
} from 'lucide-react';
import {
  DailySessionArchive,
  FundTransaction,
} from '../types';
import {
  saveFundTransaction,
  deleteFundTransaction,
} from '../utils/storage';

type AnyRecord = Record<string, any>;

interface Props {
  archives: DailySessionArchive[];
  transactions: FundTransaction[];
  shuttlePurchases: AnyRecord[];
  shuttleUsageLedger?: AnyRecord[]; // AUTO_SHUTTLE_RECOVERY_V81
  currentSessionProfit: number;
  onRefreshTransactions: () => void;
}

const n = (value: unknown) => {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
};

const money = (value: unknown) =>
  n(value).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const isLegacyAdvanceDeposit = (tx: FundTransaction) => {
  if (tx.type !== 'deposit') return false;

  const text = String(tx.description || '').toLowerCase();

  return (
    text.includes('เงินซื้อลูก') ||
    text.includes('ทดรอง') ||
    (tx.category as string) === 'organizer_advance'
  );
};

const isStockPurchaseWithdrawal = (tx: FundTransaction) =>
  tx.type === 'withdraw' &&
  tx.category === 'shuttlecocks_bulk';

const isCourtAdvance = (tx: FundTransaction) =>
  tx.type === 'deposit' && (tx.category as string) === 'court_advance';
const isCourtRepayment = (tx: FundTransaction) =>
  tx.type === 'withdraw' && (tx.category as string) === 'court_advance_repayment';

const isAdvanceRepayment = (tx: FundTransaction) =>
  tx.type === 'withdraw' &&
  (tx.category as string) === 'advance_repayment';

const purchaseTotal = (item: AnyRecord) => {
  const direct = n(
    item.totalCost ||
      item.totalPrice ||
      item.totalAmount ||
      item.purchaseAmount ||
      item.amount
  );

  if (direct > 0) return direct;

  return (
    Math.max(0, n(item.quantity)) *
    Math.max(
      0,
      n(
        item.unitCost ||
          item.costPerPiece ||
          item.pricePerPiece ||
          item.unitPrice
      )
    )
  );
};

const archivedUsageCostV81 = (
  item: AnyRecord
) => {
  const direct = n(
    item.totalCost ||
      item.cost ||
      item.totalExpense ||
      item.shuttleCost
  );

  if (direct > 0) return direct;

  return (
    Math.max(0, n(item.quantity)) *
    Math.max(
      0,
      n(
        item.unitCost ||
          item.costPerPiece ||
          item.pricePerPiece
      )
    )
  );
};
export const TreasuryViewV79: React.FC<Props> = ({
  archives = [],
  transactions = [],
  shuttlePurchases = [],
  shuttleUsageLedger = [],
  currentSessionProfit,
  onRefreshTransactions,
}) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [mode, setMode] = useState<
    'contribution' | 'expense' | 'repayment' | 'court_advance' | 'court_repayment'
  >('contribution');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const summary = useMemo(() => {
    const closedProfit = archives.reduce(
      (sum, item) =>
        sum +
        n(
          item.netProfit ??
            (n(item.totalRevenue) -
              n(item.totalExpense))
        ),
      0
    );

    const fundContributions = transactions
      .filter(
        (tx) =>
          tx.type === 'deposit' &&
          !isLegacyAdvanceDeposit(tx) &&
          !isCourtAdvance(tx)
      )
      .reduce(
        (sum, tx) => sum + Math.max(0, n(tx.amount)),
        0
      );

    const fundExpenses = transactions
      .filter(
        (tx) =>
          tx.type === 'withdraw' &&
          !isStockPurchaseWithdrawal(tx) &&
          !isAdvanceRepayment(tx) &&
          !isCourtRepayment(tx)
      )
      .reduce(
        (sum, tx) => sum + Math.max(0, n(tx.amount)),
        0
      );

    const advanceRepayments = transactions
      .filter(isAdvanceRepayment)
      .reduce(
        (sum, tx) => sum + Math.max(0, n(tx.amount)),
        0
      );

    // Purchase Ledger is the source of truth for money advanced by organizer.
    // Historical expected total: 4,980 + 4,200 = 9,180 THB.
    const organizerAdvancePrincipal =
      shuttlePurchases.reduce(
        (sum, item) => sum + purchaseTotal(item),
        0
      );

    // GG_TREASURY_TWO_ADVANCES_V519C2: settled Archive costs, never unfinished current session.
    // Accrued advance recovery is NOT an actual cash repayment.
    const ledgerAuditEntries = shuttleUsageLedger.filter((item) => archives.some((a) => a.archiveDate === String(item.sessionDate || item.date || ""))).length;
    const recoveredShuttleArchive = archives.reduce(
      (sum, a) => sum + Math.max(0, n(a.shuttleCost)), 0
    );
    const recoveredCourtArchive = archives.reduce(
      (sum, a) => sum + Math.max(0, n(a.venueCost)), 0
    );
    const courtAdvancePrincipal = transactions
      .filter(isCourtAdvance)
      .reduce((sum, tx) => sum + Math.max(0, n(tx.amount)), 0);
    const courtRepayments = transactions
      .filter(isCourtRepayment)
      .reduce((sum, tx) => sum + Math.max(0, n(tx.amount)), 0);
    const autoRecoveredShuttleCostV81 = recoveredShuttleArchive;
    const outstandingAdvance = Math.max(0,
      organizerAdvancePrincipal - recoveredShuttleArchive - advanceRepayments
    );
    const outstandingCourtAdvance = Math.max(0,
      courtAdvancePrincipal - recoveredCourtArchive - courtRepayments
    );

    // Current session expected profit does NOT enter the fund yet.
    const fundBalance =
      closedProfit +
      fundContributions -
      fundExpenses -
      advanceRepayments -
      courtRepayments;

    return {
      closedProfit,
      fundContributions,
      fundExpenses,
      advanceRepayments,
      courtAdvancePrincipal,
      recoveredCourtArchive,
      courtRepayments,
      outstandingCourtAdvance,
      autoRecoveredShuttleCostV81,
      organizerAdvancePrincipal,
      outstandingAdvance,
      fundBalance,
      legacyAdvanceCount: transactions.filter(
        isLegacyAdvanceDeposit
      ).length,
      legacyStockCount: transactions.filter(
        isStockPurchaseWithdrawal
      ).length,
    };
  }, [archives, transactions, shuttlePurchases]);

  // GG_TREASURY_SPLIT_PREVIEW_V5162B: read-only classification from saved Archives.
  // No balances, Firestore documents or transactions are written by this view.
  // GG_VERIFIED_ARCHIVE_SPLIT_V519C3: revenue allocation from closed Archive only, no Firestore writes.
  // Only use historical rates that were explicitly confirmed by the organizer.
  const bucketPreview = useMemo(() => {
    const confirmed = new Map<string, {players:number; matches:number; revenue:number; venue:number; shuttle:number; rate:number}>([
      ['2026-09-18', {players:23,matches:21,revenue:4630,venue:2000,shuttle:1743,rate:110}],
      ['2026-10-09', {players:24,matches:23,revenue:4940,venue:2250,shuttle:1610,rate:110}],
      ['2026-10-11', {players:19,matches:17,revenue:3790,venue:1500,shuttle:1190,rate:110}],
    ]);
    let court = 0;
    let shuttle = 0;
    let unallocated = 0;
    let incomplete = 0;
    for(const row of archives){
      const archive = row as DailySessionArchive & {memberCourtFee?: number};
      const expected = confirmed.get(archive.archiveDate);
      const verified = expected &&
        archive.totalPlayers === expected.players &&
        archive.totalShuttlecocks === expected.matches &&
        Math.abs(n(archive.totalRevenue)-expected.revenue)<0.01 &&
        Math.abs(n(archive.venueCost)-expected.venue)<0.01 &&
        Math.abs(n(archive.shuttleCost)-expected.shuttle)<0.01;
      const rate = typeof archive.memberCourtFee === 'number' && Number.isFinite(archive.memberCourtFee)
        ? archive.memberCourtFee
        : verified ? expected.rate : undefined;
      const profit = n(archive.netProfit ?? (n(archive.totalRevenue)-n(archive.totalExpense)));
      if(rate===undefined || archive.venueCost==null || archive.shuttleCost==null){
        incomplete += 1;
        unallocated += profit;
        continue;
      }
      const courtShare = n(archive.totalPlayers)*rate-n(archive.venueCost);
      const shuttleShare = n(archive.totalRevenue)-n(archive.totalPlayers)*rate-n(archive.shuttleCost);
      court += courtShare;
      shuttle += shuttleShare;
      // Preserve any additional expenses / corrections not attributable to court or shuttle.
      unallocated += profit-courtShare-shuttleShare;
    }
    return {court,shuttle,unallocated,incomplete,calculatedProfit:court+shuttle+unallocated};
  }, [archives]);

  // GG_CLOSED_COST_PREVIEW_RESTORE_V519C3_HOTFIX
  // Read-only closed Archive costs; does not modify stocks, payments or Firestore.
  const closedCostPreview = useMemo(() => {
    let court = 0;
    let shuttle = 0;
    let courtMissing = 0;
    let shuttleMissing = 0;
    for (const archive of archives) {
      if (typeof archive.venueCost === 'number' && Number.isFinite(archive.venueCost)) {
        court += Math.max(0, archive.venueCost);
      } else { courtMissing += 1; }
      if (typeof archive.shuttleCost === 'number' && Number.isFinite(archive.shuttleCost)) {
        shuttle += Math.max(0, archive.shuttleCost);
      } else { shuttleMissing += 1; }
    }
    return { court, shuttle, courtMissing, shuttleMissing };
  }, [archives]);

  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter(
          (tx) =>
            !isLegacyAdvanceDeposit(tx) &&
            !isCourtAdvance(tx) &&
            !isStockPurchaseWithdrawal(tx)
        )
        .sort(
          (a, b) =>
            String(b.date).localeCompare(String(a.date)) ||
            n(b.createdAt) - n(a.createdAt)
        ),
    [transactions]
  );

  const closeForm = () => {
    setIsAddOpen(false);
    setMode('contribution');
    setAmount('');
    setDescription('');
  };

  const saveTransaction = () => {
    const value = Math.max(0, n(amount));

    if (value <= 0) {
      window.alert('กรอกจำนวนเงินให้ถูกต้อง');
      return;
    }

    if (!description.trim()) {
      window.alert('กรอกรายละเอียดรายการ');
      return;
    }

    if (
      mode === 'court_repayment' &&
      value > summary.outstandingCourtAdvance
    ) {
      window.alert(`ยอดคอร์ททดรองคงค้าง ${money(summary.outstandingCourtAdvance)} บาท`);
      return;
    }

    if (
      mode === 'repayment' &&
      value > summary.outstandingAdvance
    ) {
      window.alert(
        `คืนเกินยอดเงินทดรองคงค้างไม่ได้\n\nคงค้าง ${money(
          summary.outstandingAdvance
        )} บาท`
      );
      return;
    }

    if (
      (mode === 'expense' || mode === 'repayment' || mode === 'court_repayment') &&
      value > Math.max(0, summary.fundBalance)
    ) {
      const ok = window.confirm(
        `เงินกองกลางพร้อมใช้มี ${money(
          Math.max(0, summary.fundBalance)
        )} บาท\n` +
          `รายการนี้ ${money(value)} บาท\n\n` +
          `ต้องการบันทึกต่อหรือไม่?`
      );

      if (!ok) return;
    }

    const tx: FundTransaction = {
      id: `fund-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      type:
        (mode === 'contribution' || mode === 'court_advance')
          ? 'deposit'
          : 'withdraw',
      amount: value,
      description: description.trim(),
      category:
        mode === 'contribution'
          ? 'initial_fund'
          : 'other',
      createdAt: Date.now(),
    };

    if (mode === 'repayment') {
      (tx as any).category = 'advance_repayment';
    }
    if (mode === 'court_advance') {
      (tx as any).category = 'court_advance';
    }
    if (mode === 'court_repayment') {
      (tx as any).category = 'court_advance_repayment';
    }

    saveFundTransaction(tx);
    onRefreshTransactions();
    closeForm();
  };

  const removeTransaction = (tx: FundTransaction) => {
    if (
      !window.confirm(
        `ลบรายการนี้หรือไม่?\n\n${tx.description}\n${money(
          tx.amount
        )} บาท`
      )
    ) {
      return;
    }

    deleteFundTransaction(tx.id);
    onRefreshTransactions();
  };

  return (
    <div className="space-y-5" data-guanguan-treasury-v79c>
      {/* TREASURY_ACCOUNTING_V79C */}
      <div className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Club Treasury
            </div>
            <h2 className="mt-1 text-2xl font-black text-white">
              เงินกองกลางก๊วน
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              กำไรเข้ากองกลางเมื่อปิดรอบและบันทึก Archive แล้วเท่านั้น
              • เงินทดรองซื้อ Stock แยกจากเงินกองกลาง
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-800/50 bg-slate-950/80 px-5 py-4 text-right">
            <div className="text-xs text-slate-400">
              เงินกองกลางพร้อมใช้
            </div>
            <div
              className={`mt-1 text-3xl font-black ${
                summary.fundBalance >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {summary.fundBalance >= 0 ? '+' : ''}
              {money(summary.fundBalance)} ฿
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[10px] text-slate-500">
              กำไรจากรอบที่ปิดแล้ว
            </div>
            <div className="mt-1 text-lg font-black text-emerald-300">
              +{money(summary.closedProfit)} ฿
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[10px] text-slate-500">
              เงินสมทบกองกลางจริง
            </div>
            <div className="mt-1 text-lg font-black text-indigo-300">
              +{money(summary.fundContributions)} ฿
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-[10px] text-slate-500">
              ค่าใช้จ่ายกองกลาง
            </div>
            <div className="mt-1 text-lg font-black text-rose-300">
              -{money(summary.fundExpenses)} ฿
            </div>
          </div>

          <div className="rounded-xl border border-amber-800/40 bg-amber-950/10 p-3">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <Clock3 className="h-3 w-3" />
              กำไรเข้ากองกลางจากรอบปัจจุบัน
            </div>
            <div
              className={`mt-1 text-lg font-black ${
                currentSessionProfit >= 0
                  ? 'text-amber-300'
                  : 'text-rose-300'
              }`}
            >
              +
              {money(0)} ฿
            </div>
            <div className="mt-1 text-[9px] text-slate-500">
              ยังไม่ปิดก๊วน / ยังไม่ Save Archive • ยังไม่เข้ากองกลาง
            </div>
          </div>
        </div>
      </div>

      {/* GG_TREASURY_SPLIT_PREVIEW_V5162B: derived figures, not actual cash wallet balances */}
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5" aria-label="แยกกำไรสะสมตามประเภท">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">แยกกำไรสะสมค่าคอร์ท / ค่าลูก</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">คำนวณจาก Archive ที่ปิดแล้วเท่านั้น • ตัวเลขนี้ยังไม่ใช่เงินสดคงเหลือในแต่ละกระเป๋า</p>
          </div>
          <span className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-200">ตรวจสอบก่อนเปิดบัญชีแยก</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-slate-200">กำไรสะสมจากคอร์ท</div>
            <div className={`mt-2 text-2xl font-bold ${bucketPreview.court >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(bucketPreview.court)} ฿</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">รายได้ค่าคอร์ทสมาชิก − ค่าเช่าสนามจริง</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-slate-200">กำไรสะสมจากลูกแบด</div>
            <div className={`mt-2 text-2xl font-bold ${bucketPreview.shuttle >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(bucketPreview.shuttle)} ฿</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">รายรับที่เหลือหลังหักรายได้คอร์ท − ต้นทุนลูกจริง</div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 text-xs leading-6 text-amber-200">
          ยังไม่ได้จัดสรร / ค่าใช้จ่ายอื่น: <strong>{money(bucketPreview.unallocated)} ฿</strong>
          {bucketPreview.incomplete > 0 && <span> • Archive ที่ข้อมูลไม่พอ {bucketPreview.incomplete} รอบ (ไม่เดาอัตราค่าคอร์ทหรือแหล่งรายได้)</span>}
          <div className="mt-1 text-amber-100/80">ก่อนเปิดใช้เงินสำรองแยกจริง ต้องยืนยันยอดยกมา รายการทดรอง และรูปแบบรายจ่ายแต่ละกองทุน โดยเฉพาะซื้อชั่วโมงสนามล่วงหน้า</div>
        </div>
      </section>

      {/* GG_TREASURY_CLOSED_ONLY_SPLIT_COST_V5162C: accrued costs separated; excludes open session */}
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5" aria-label="ต้นทุนอัตโนมัติจากรอบที่ปิดแล้ว">
        <div className="text-base font-bold text-white">ต้นทุนอัตโนมัติแยกประเภท</div>
        <p className="mt-1 text-xs leading-5 text-slate-400">อ้างอิงเฉพาะ Archive ที่บันทึกแล้ว • ไม่รวมรอบที่ยังเปิด • เป็นข้อมูลต้นทุน ไม่ใช่การคืนเงินสดให้ผู้จัด</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-slate-200">ต้นทุนค่าคอร์ท</div>
            <div className="mt-2 text-2xl font-bold text-sky-300">{money(closedCostPreview.court)} ฿</div>
            <div className="mt-1 text-xs text-slate-400">ค่าคอร์ทจาก Archive ที่ปิดแล้ว {closedCostPreview.courtMissing > 0 ? `• ไม่ทราบต้นทุน ${closedCostPreview.courtMissing} รอบ` : ''}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-slate-200">ต้นทุนลูกแบดที่ใช้</div>
            <div className="mt-2 text-2xl font-bold text-teal-300">{money(closedCostPreview.shuttle)} ฿</div>
            <div className="mt-1 text-xs text-slate-400">ต้นทุนจาก Archive ที่ปิดแล้ว {closedCostPreview.shuttleMissing > 0 ? `• ไม่ทราบต้นทุน ${closedCostPreview.shuttleMissing} รอบ` : ''}</div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-amber-200">หมายเหตุ: ยอดคืนทุนอัตโนมัติในบล็อกเงินทดรองด้านล่างยังอ้างอิง Shuttle Usage Ledger เดิมเท่านั้น ไม่มีการเพิ่มการคืนทุนคอร์ทโดยอัตโนมัติ เพื่อป้องกันการนับเงินซ้ำ</p>
      </section>

      <div className="rounded-3xl border border-cyan-800/50 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-cyan-300" />
              <h3 className="font-black text-white">
                เงินทดรองผู้จัด
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              เงินที่ผู้จัดจ่ายล่วงหน้าสองประเภท • ไม่ใช่เงินสมทบกองกลาง
            </p>
          </div>

          <div className="rounded-xl border border-rose-800/40 bg-rose-950/15 px-4 py-3 text-right">
            <div className="text-[10px] text-slate-500">
              ยังค้างคืนผู้จัด
            </div>
            <div className="text-2xl font-black text-rose-300">
              {money(summary.outstandingAdvance)} ฿
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <PackageOpen className="h-3 w-3" />
              ทดรองซื้อ Stock ทั้งหมด
            </div>
            <div className="mt-1 text-lg font-black text-cyan-300">
              {money(summary.organizerAdvancePrincipal)} ฿
            </div>
            <div className="mt-1 text-[9px] text-slate-600">
              อ้างอิง Purchase Ledger
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              หักต้นทุน Archive + เงินคืนที่บันทึก
            </div>
            <div className="mt-1 text-lg font-black text-emerald-300">
              {money((summary.autoRecoveredShuttleCostV81 || 0) + summary.advanceRepayments)} ฿
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              คงค้าง
            </div>
            <div className="mt-1 text-lg font-black text-rose-300">
              {money(summary.outstandingAdvance)} ฿
            </div>
          </div>
        </div>

        {/* GG_TREASURY_TWO_ADVANCES_V519C2 */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-cyan-800/50 bg-slate-950 p-4">
            <div className="text-sm font-black text-cyan-200">🏸 เงินทดรองค่าลูก</div>
            <p className="mt-1 text-xs text-slate-400">ยอดซื้อจาก Purchase Ledger ไม่รวมเงินทดรองค่าคอร์ท</p>
            <div className="mt-2 text-xs text-slate-400">ผู้จัดออกล่วงหน้า {money(summary.organizerAdvancePrincipal)} ฿</div>
            <div className="mt-1 text-xs text-emerald-300">หักต้นทุนลูกจาก Archive -{money(summary.autoRecoveredShuttleCostV81)} ฿</div>
            <div className="mt-1 text-xs text-slate-400">คืนเงินสดที่บันทึก -{money(summary.advanceRepayments)} ฿</div>
            <div className="mt-3 text-lg font-black text-rose-300">คงค้าง {money(summary.outstandingAdvance)} ฿</div>
          </div>
          <div className="rounded-2xl border border-indigo-800/50 bg-slate-950 p-4">
            <div className="text-sm font-black text-indigo-200">📅 เงินทดรองค่าคอร์ท</div>
            <p className="mt-1 text-xs text-slate-400">ผู้จัดบันทึกยอดจ่ายล่วงหน้าแยกต่างหาก</p>
            <div className="mt-2 text-xs text-slate-400">ผู้จัดออกล่วงหน้า {money(summary.courtAdvancePrincipal)} ฿</div>
            <div className="mt-1 text-xs text-emerald-300">หักต้นทุนสนามจาก Archive -{money(summary.recoveredCourtArchive)} ฿</div>
            <div className="mt-1 text-xs text-slate-400">คืนเงินสดที่บันทึก -{money(summary.courtRepayments)} ฿</div>
            <div className="mt-3 text-lg font-black text-rose-300">คงค้าง {money(summary.outstandingCourtAdvance)} ฿</div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/15 p-3 text-xs leading-relaxed text-amber-200">
          ต้นทุนที่หักอัตโนมัติเป็นการตัดยอดทดรองทางบัญชี ไม่ใช่หลักฐานการคืนเงินสดให้ผู้จัด หากผู้จัดจ่ายค่าคอร์ทไว้แล้วให้บันทึก "ทดรองค่าคอร์ท" เพียงครั้งเดียว และตรวจยอดยกมาก่อนบันทึก
        </div>

        {(summary.legacyAdvanceCount > 0 ||
          summary.legacyStockCount > 0) && (
          <div className="mt-3 rounded-xl border border-amber-900/40 bg-amber-950/10 px-3 py-2 text-[10px] leading-relaxed text-amber-200/80">
            รายการเก่า “เงินซื้อลูก” และรายการเบิกซื้อ Stock
            ไม่ถูกนำมาคิดเป็นเงินกองกลางแล้ว เพื่อป้องกันการนับเงินซ้ำ
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-black text-white">
              <Wallet className="h-4 w-4 text-emerald-400" />
              รายการเงินกองกลาง
            </h3>
            <p className="mt-1 text-[10px] text-slate-500">
              ไม่รวมรายการซื้อ Stock และเงินทดรองเดิม
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950"
          >
            <Plus className="h-4 w-4" />
            บันทึกรายการ
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">วันที่</th>
                <th className="px-3 py-3 text-left">ประเภท</th>
                <th className="px-3 py-3 text-left">รายละเอียด</th>
                <th className="px-3 py-3 text-right">จำนวนเงิน</th>
                <th className="px-4 py-3 text-center">จัดการ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {visibleTransactions.length > 0 ? (
                visibleTransactions.map((tx) => {
                  const repayment = isAdvanceRepayment(tx);

                  return (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 text-slate-300">
                        {tx.date}
                      </td>

                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            repayment
                              ? 'border-cyan-800 bg-cyan-950/40 text-cyan-300'
                              : tx.type === 'deposit'
                              ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                              : 'border-rose-800 bg-rose-950/40 text-rose-300'
                          }`}
                        >
                          {repayment
                            ? 'คืนเงินทดรอง'
                            : tx.type === 'deposit'
                            ? 'เงินเข้ากองกลาง'
                            : 'เบิกกองกลาง'}
                        </span>
                      </td>

                      <td className="px-3 py-3 font-semibold text-white">
                        {tx.description}
                      </td>

                      <td
                        className={`px-3 py-3 text-right font-black ${
                          tx.type === 'deposit'
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {tx.type === 'deposit' ? '+' : '-'}
                        {money(tx.amount)} ฿
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeTransaction(tx)}
                          className="rounded-lg p-2 text-slate-500 hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-7 text-center text-slate-500"
                  >
                    ยังไม่มีรายการเงินกองกลางจริง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddOpen && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-400" />
            <h3 className="font-black text-white">
              บันทึกรายการเงิน
            </h3>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMode('contribution')}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                mode === 'contribution'
                  ? 'border-emerald-600 bg-emerald-950/50 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              + เงินสมทบกองกลาง
            </button>

            <button
              type="button"
              onClick={() => setMode('expense')}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                mode === 'expense'
                  ? 'border-rose-600 bg-rose-950/50 text-rose-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              - เบิกกองกลาง
            </button>

            <button type="button" onClick={() => setMode('court_advance')}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${mode === 'court_advance' ? 'border-indigo-600 bg-indigo-950 text-indigo-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>
              + ผู้จัดทดรองค่าคอร์ท
            </button>
            <button type="button" onClick={() => setMode('court_repayment')}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${mode === 'court_repayment' ? 'border-indigo-600 bg-indigo-950 text-indigo-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>
              ↩ คืนเงินทดรองค่าคอร์ท
            </button>
            <button
              type="button"
              onClick={() => setMode('repayment')}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                mode === 'repayment'
                  ? 'border-cyan-600 bg-cyan-950/50 text-cyan-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              ↩ คืนเงินทดรองผู้จัด
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              จำนวนเงิน
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>

            <label className="text-xs text-slate-400">
              รายละเอียด
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  mode === 'repayment'
                    ? 'เช่น คืนเงินทดรองผู้จัด'
                    : mode === 'contribution'
                    ? 'เช่น เงินสมทบกองกลาง'
                    : 'เช่น ค่าน้ำ / อุปกรณ์ส่วนกลาง'
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>

          {mode === 'repayment' && (
            <div className="mt-3 rounded-xl border border-cyan-900/40 bg-cyan-950/10 px-3 py-2 text-xs text-cyan-200">
              เงินทดรองคงค้าง{' '}
              <strong>
                {money(summary.outstandingAdvance)} บาท
              </strong>
              {' • '}
              กองกลางพร้อมใช้{' '}
              <strong>
                {money(Math.max(0, summary.fundBalance))} บาท
              </strong>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={saveTransaction}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950"
            >
              <CheckCircle2 className="mr-1 inline h-4 w-4" />
              บันทึก
            </button>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreasuryViewV79;