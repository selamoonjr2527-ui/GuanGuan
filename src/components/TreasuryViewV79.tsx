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
    'contribution' | 'expense' | 'repayment'
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
          !isLegacyAdvanceDeposit(tx)
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
          !isAdvanceRepayment(tx)
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

    const closedArchiveDatesV81 = new Set(
      archives
        .map((item) =>
          String(item.archiveDate || '').trim()
        )
        .filter(Boolean)
    );

    const autoRecoveredShuttleCostV81 =
      shuttleUsageLedger
        .filter((item) =>
          closedArchiveDatesV81.has(
            String(
              item.sessionDate ||
                item.archiveDate ||
                item.date ||
                ''
            ).trim()
          )
        )
        .reduce(
          (sum, item) =>
            sum + archivedUsageCostV81(item),
          0
        );

    const outstandingAdvance = Math.max(
      0,
      organizerAdvancePrincipal -
        autoRecoveredShuttleCostV81 -
        advanceRepayments
    );

    // Current session expected profit does NOT enter the fund yet.
    const fundBalance =
      closedProfit +
      fundContributions -
      fundExpenses -
      advanceRepayments;

    return {
      closedProfit,
      fundContributions,
      fundExpenses,
      advanceRepayments,
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

  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter(
          (tx) =>
            !isLegacyAdvanceDeposit(tx) &&
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
      (mode === 'expense' || mode === 'repayment') &&
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
        mode === 'contribution'
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
              กำไรรอบปัจจุบัน
            </div>
            <div
              className={`mt-1 text-lg font-black ${
                currentSessionProfit >= 0
                  ? 'text-amber-300'
                  : 'text-rose-300'
              }`}
            >
              {currentSessionProfit >= 0 ? '+' : ''}
              {money(currentSessionProfit)} ฿
            </div>
            <div className="mt-1 text-[9px] text-slate-500">
              ยังไม่เข้ากองกลาง
            </div>
          </div>
        </div>
      </div>

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
              เงินที่ผู้จัดออกซื้อ Stock ก่อน • ไม่ใช่เงินสมทบกองกลาง
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
              คืนทุนอัตโนมัติ + คืนเพิ่ม
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