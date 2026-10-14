import React, { useEffect, useMemo, useState } from 'react';

type AnyRecord = Record<string, any>;

interface Props {
  purchases: AnyRecord[];
  usages: AnyRecord[];
  defaultPiecesPerTube?: number;
  sessionDate?: string;
}

const num = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const money = (value: unknown) =>
  num(value).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const purchaseDate = (item: AnyRecord) =>
  String(
    item.purchaseDate ||
      item.purchasedDate ||
      item.date ||
      ''
  ).trim();

const usageDate = (item: AnyRecord) =>
  String(item.sessionDate || item.date || '').trim();

const monthKey = (date: string) =>
  /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : '';

const purchaseUnitCost = (item: AnyRecord) =>
  Math.max(
    0,
    num(
      item.unitCost ||
        item.costPerPiece ||
        item.pricePerPiece ||
        item.unitPrice
    )
  );

const purchaseTotal = (item: AnyRecord) => {
  const direct = num(
    item.totalCost ||
      item.totalPrice ||
      item.totalAmount ||
      item.purchaseAmount ||
      item.amount
  );

  if (direct > 0) return direct;

  return Math.max(0, num(item.quantity)) * purchaseUnitCost(item);
};

const purchaseTubes = (
  item: AnyRecord,
  defaultPiecesPerTube: number
) => {
  const direct = num(
    item.tubes ||
      item.tubeCount ||
      item.quantityTubes ||
      item.totalTubes
  );

  if (direct > 0) return direct;

  const piecesPerTube = Math.max(
    1,
    num(item.piecesPerTube) ||
      defaultPiecesPerTube ||
      12
  );

  return Math.max(0, num(item.quantity)) / piecesPerTube;
};

const purchaseTubePrice = (
  item: AnyRecord,
  defaultPiecesPerTube: number
) => {
  const direct = num(
    item.pricePerTube ||
      item.costPerTube ||
      item.tubePrice ||
      item.unitPricePerTube
  );

  if (direct > 0) return direct;

  const tubes = purchaseTubes(
    item,
    defaultPiecesPerTube
  );

  if (tubes > 0) {
    return purchaseTotal(item) / tubes;
  }

  return (
    purchaseUnitCost(item) *
    Math.max(
      1,
      num(item.piecesPerTube) ||
        defaultPiecesPerTube ||
        12
    )
  );
};

const usageTotalCost = (item: AnyRecord) => {
  const direct = num(item.totalCost);

  if (direct > 0) return direct;

  return (
    Math.max(0, num(item.quantity)) *
    Math.max(
      0,
      num(item.unitCost || item.costPerPiece)
    )
  );
};

const usageMatchCount = (item: AnyRecord) => {
  const direct = num(
    item.matchCount || item.matches
  );

  if (direct > 0) return direct;

  const revenue = num(item.baseMemberRevenue);
  const members = Math.max(
    1,
    num(item.memberCount) || 4
  );
  const rate = Math.max(
    1,
    num(item.memberRatePerMatch) || 25
  );

  if (revenue > 0) {
    return Math.max(
      1,
      Math.round(revenue / (members * rate))
    );
  }

  return item.historyId ? 1 : 0;
};

const monthLabel = (key: string) => {
  const [year, month] = key.split('-').map(Number);

  if (!year || !month) return key;

  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
};

export const MonthlyShuttleReportV76: React.FC<Props> = ({
  purchases = [],
  usages = [],
  defaultPiecesPerTube = 12,
  sessionDate = '',
}) => {
  const availableMonths = useMemo(() => {
    const months = new Set<string>();

    purchases.forEach((item) => {
      const key = monthKey(purchaseDate(item));
      if (key) months.add(key);
    });

    usages.forEach((item) => {
      const key = monthKey(usageDate(item));
      if (key) months.add(key);
    });

    const sessionMonth = monthKey(sessionDate);
    if (sessionMonth) months.add(sessionMonth);

    return Array.from(months).sort((a, b) =>
      b.localeCompare(a)
    );
  }, [purchases, usages, sessionDate]);

  const initialMonth =
    monthKey(sessionDate) ||
    availableMonths[0] ||
    '2026-10';

  // GG_SHUTTLE_AUDIT_V518: display-only period selection
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [periodMode, setPeriodMode] = useState<'month' | 'year' | 'all'>('month');
  const availableYears = useMemo(() => Array.from(new Set(availableMonths.map(key => key.slice(0, 4)))).sort((a, b) => b.localeCompare(a)), [availableMonths]);
  const [selectedYear, setSelectedYear] = useState(initialMonth.slice(0, 4));


  useEffect(() => {
    if (
      availableMonths.length > 0 &&
      !availableMonths.includes(selectedMonth)
    ) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) setSelectedYear(availableYears[0]);
  }, [availableYears, selectedYear]);

  // Hide the old Monthly Shuttle Report if it still exists.
  // This is presentation-only and does not touch data.
  useEffect(() => {
    const self = document.querySelector(
      '[data-guanguan-monthly-v76]'
    );

    const hidden: HTMLElement[] = [];

    const headings = Array.from(
      document.querySelectorAll<HTMLElement>(
        'h1,h2,h3,h4,div,span'
      )
    ).filter(
      (element) =>
        element.textContent?.trim() ===
        'Monthly Shuttle Report'
    );

    headings.forEach((heading) => {
      if (self?.contains(heading)) return;

      let node: HTMLElement | null = heading;

      for (let i = 0; i < 8 && node; i += 1) {
        const text = node.textContent || '';

        if (
          text.includes('ซื้อ Stock เดือนนี้') &&
          text.includes('ใช้จริงเดือนนี้') &&
          text.includes('กำไร/ขาดทุนค่าลูก')
        ) {
          node.dataset.guanguanLegacyMonthlyHidden =
            '1';
          node.style.display = 'none';
          hidden.push(node);
          break;
        }

        node = node.parentElement;
      }
    });

    return () => {
      hidden.forEach((node) => {
        node.style.display = '';
        delete node.dataset.guanguanLegacyMonthlyHidden;
      });
    };
  }, []);

  const matchesPeriod = (date: string): boolean => {
    const key = monthKey(date);
    if (!key) return false;
    if (periodMode === 'all') return true;
    return periodMode === 'year' ? key.startsWith(selectedYear + '-') : key === selectedMonth;
  };

  const summary = useMemo(() => {
    const monthPurchases = purchases.filter(item => matchesPeriod(purchaseDate(item)));
    const monthUsages = usages.filter(item => matchesPeriod(usageDate(item)));

    const purchasePieces = monthPurchases.reduce(
      (sum, item) =>
        sum + Math.max(0, num(item.quantity)),
      0
    );

    const purchaseTubesTotal =
      monthPurchases.reduce(
        (sum, item) =>
          sum +
          purchaseTubes(
            item,
            defaultPiecesPerTube
          ),
        0
      );

    const purchaseValue = monthPurchases.reduce(
      (sum, item) =>
        sum + purchaseTotal(item),
      0
    );

    const usedPieces = monthUsages.reduce(
      (sum, item) =>
        sum + Math.max(0, num(item.quantity)),
      0
    );

    const usedCost = monthUsages.reduce(
      (sum, item) =>
        sum + usageTotalCost(item),
      0
    );

    const revenue = monthUsages.reduce(
      (sum, item) =>
        sum +
        Math.max(0, num(item.baseMemberRevenue)),
      0
    );

    const matches = monthUsages.reduce(
      (sum, item) =>
        sum + usageMatchCount(item),
      0
    );

    const tubePrices = monthPurchases
      .map((item) =>
        purchaseTubePrice(
          item,
          defaultPiecesPerTube
        )
      )
      .filter((value) => value > 0);

    const sortedByDate = [...monthPurchases].sort(
      (a, b) =>
        purchaseDate(a).localeCompare(
          purchaseDate(b)
        ) ||
        num(a.createdAt) - num(b.createdAt)
    );

    const latest =
      sortedByDate.length > 0
        ? purchaseTubePrice(
            sortedByDate[
              sortedByDate.length - 1
            ],
            defaultPiecesPerTube
          )
        : 0;

    const min =
      tubePrices.length > 0
        ? Math.min(...tubePrices)
        : 0;

    const max =
      tubePrices.length > 0
        ? Math.max(...tubePrices)
        : 0;

    const avg =
      tubePrices.length > 0
        ? tubePrices.reduce(
            (sum, value) => sum + value,
            0
          ) / tubePrices.length
        : 0;

    return {
      purchasePieces,
      purchaseTubesTotal,
      purchaseValue,
      usedPieces,
      usedCost,
      revenue,
      matches,
      profit: revenue - usedCost,
      latest,
      min,
      max,
      avg,
    };
  }, [
    purchases,
    usages,
    selectedMonth, selectedYear, periodMode,
    defaultPiecesPerTube,
  ]);

  // Separate ledger rollup by calendar month. Values may differ from closed Finance
  // Archive, as this component receives neither Archive nor stock adjustments.
  const auditRows = useMemo(() => {
    const keys = new Set<string>();
    purchases.forEach(p => { const k = monthKey(purchaseDate(p)); if (k) keys.add(k); });
    usages.forEach(u => { const k = monthKey(usageDate(u)); if (k) keys.add(k); });
    const months = [...keys].sort((a, b) => a.localeCompare(b));
    let cumulative = 0;
    return months.map(key => {
      const ps = purchases.filter(p => monthKey(purchaseDate(p)) === key);
      const us = usages.filter(u => monthKey(usageDate(u)) === key);
      const bought = ps.reduce((sum, p) => sum + Math.max(0, num(p.quantity)), 0);
      const used = us.reduce((sum, u) => sum + Math.max(0, num(u.quantity)), 0);
      const purchaseAmount = ps.reduce((sum, p) => sum + purchaseTotal(p), 0);
      const cost = us.reduce((sum, u) => sum + usageTotalCost(u), 0);
      const revenue = us.reduce((sum, u) => sum + Math.max(0, num(u.baseMemberRevenue)), 0);
      cumulative += bought - used;
      const missingCost = us.filter(u => num(u.quantity) > 0 && usageTotalCost(u) <= 0).length;
      const missingRevenue = us.filter(u => num(u.quantity) > 0 && !Object.prototype.hasOwnProperty.call(u, 'baseMemberRevenue')).length;
      return { key, bought, used, remainingDelta: bought - used, cumulative, purchaseAmount, cost, revenue, profit: revenue - cost, missingCost, missingRevenue };
    });
  }, [purchases, usages]);

  const visibleAuditRows = auditRows.filter(row =>
    periodMode === 'all' || (periodMode === 'year' ? row.key.startsWith(selectedYear + '-') : row.key === selectedMonth)
  );
  const missingPurchaseDates = purchases.filter(p => !monthKey(purchaseDate(p))).length;
  const missingUsageDates = usages.filter(u => !monthKey(usageDate(u))).length;

  const Metric = ({
    label,
    value,
    sub,
    valueClass = 'text-white',
  }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    valueClass?: string;
  }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold text-slate-400">
        {label}
      </div>

      <div
        className={`mt-2 text-xl font-black ${valueClass}`}
      >
        {value}
      </div>

      {sub ? (
        <div className="mt-1 text-[10px] text-slate-500">
          {sub}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      data-guanguan-monthly-v76
      className="mb-5 rounded-2xl border border-indigo-800/50 bg-slate-900 p-3 sm:p-4"
    >
      {/* MONTHLY_SHUTTLE_REPORT_FIXED_V76 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-black text-white">
            📊 Monthly Shuttle Report
          </h3>

          <p className="mt-1 text-[10px] text-slate-500">
            รายเดือน / ทั้งปี / ทุกปี • ตรวจยอดซื้อ-ใช้และรายรับฐานจาก Ledger
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-700 bg-slate-950 p-1" role="group" aria-label="ช่วงเวลารายงานลูกแบด">
            {([{ id: 'month', label: 'รายเดือน' }, { id: 'year', label: 'ทั้งปี' }, { id: 'all', label: 'ทุกปี' }] as const).map(option => (
              <button key={option.id} type="button" onClick={() => setPeriodMode(option.id)} aria-pressed={periodMode === option.id}
                className={`min-h-10 rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 ${periodMode === option.id ? 'bg-teal-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>
                {option.label}
              </button>
            ))}
          </div>
          {periodMode === 'month' && <select aria-label="เลือกเดือน" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white sm:w-auto">
            {availableMonths.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
          </select>}
          {periodMode === 'year' && <select aria-label="เลือกปี" value={selectedYear} onChange={event => setSelectedYear(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white sm:w-auto">
            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label={periodMode === 'month' ? "ซื้อ Stock เดือนนี้" : "ซื้อ Stock ตามช่วงเวลา"}
          value={`${money(summary.purchaseValue)}฿`}
          sub={`${money(
            summary.purchaseTubesTotal
          )} หลอด / ${summary.purchasePieces} ลูก`}
        />

        <Metric
          label={periodMode === 'month' ? "ใช้จริงเดือนนี้" : "ใช้จริงตามช่วงเวลา"}
          value={`${summary.usedPieces} ลูก`}
          sub={`${summary.matches} Matches`}
          valueClass="text-amber-300"
        />

        <Metric
          label="ต้นทุนลูกที่ใช้จริง"
          value={`${money(summary.usedCost)}฿`}
          sub={
            summary.usedPieces > 0
              ? `เฉลี่ย ${money(
                  summary.usedCost /
                    summary.usedPieces
                )}฿/ลูก`
              : 'เฉลี่ย 0฿/ลูก'
          }
          valueClass="text-rose-300"
        />

        <Metric
          label="รายได้ค่าลูกรวม"
          value={`${money(summary.revenue)}฿`}
          sub="จาก Match ที่จบแล้ว"
          valueClass="text-cyan-300"
        />

        <Metric
          label="กำไร/ขาดทุนค่าลูก"
          value={`${
            summary.profit >= 0 ? '+' : ''
          }${money(summary.profit)}฿`}
          sub="รายรับฐาน - ต้นทุนที่ใช้จริง"
          valueClass={
            summary.profit >= 0
              ? 'text-emerald-300'
              : 'text-rose-300'
          }
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="ราคาหลอดล่าสุด"
          value={`${money(summary.latest)}฿`}
        />

        <Metric
          label="ต่ำสุด/หลอด"
          value={`${money(summary.min)}฿`}
          valueClass="text-emerald-300"
        />

        <Metric
          label="สูงสุด/หลอด"
          value={`${money(summary.max)}฿`}
          valueClass="text-rose-300"
        />

        <Metric
          label="เฉลี่ย/หลอด"
          value={`${money(summary.avg)}฿`}
          valueClass="text-cyan-300"
        />
      </div>

      {/* GG_SHUTTLE_AUDIT_V518: ledger reconciliation, display only */}
      <section className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:p-4">
        <div className="text-sm font-bold text-white">ตรวจสอบยอดรายเดือนจาก Ledger</div>
        <p className="mt-1 text-xs leading-5 text-slate-400">ยอดคงเหลือสะสมด้านล่าง = จำนวนซื้อ − จำนวนใช้ ตั้งแต่ต้นข้อมูลที่มี (ยังไม่รวม Stock Adjustment หรือยอดยกมา) จึงไม่ใช่ยอด Stock จริง</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-slate-900 text-slate-300"><tr>
              <th className="px-3 py-3">เดือน</th><th className="px-3 py-3 text-right">ซื้อ (ลูก)</th><th className="px-3 py-3 text-right">ใช้ (ลูก)</th><th className="px-3 py-3 text-right">ส่วนต่างสะสม*</th><th className="px-3 py-3 text-right">เงินซื้อ Stock</th><th className="px-3 py-3 text-right">ต้นทุนใช้</th><th className="px-3 py-3 text-right">รายรับฐาน</th><th className="px-3 py-3 text-right">กำไรฐาน</th><th className="px-3 py-3">ตรวจสอบ</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800">
              {visibleAuditRows.map(row => <tr key={row.key} className="text-slate-200">
                <td className="px-3 py-3 font-bold whitespace-nowrap">{row.key}</td>
                <td className="px-3 py-3 text-right">{row.bought}</td><td className="px-3 py-3 text-right">{row.used}</td>
                <td className={`px-3 py-3 text-right ${row.cumulative < 0 ? 'text-rose-300' : ''}`}>{row.cumulative}</td>
                <td className="px-3 py-3 text-right">{money(row.purchaseAmount)} ฿</td><td className="px-3 py-3 text-right">{money(row.cost)} ฿</td>
                <td className="px-3 py-3 text-right">{money(row.revenue)} ฿</td>
                <td className="px-3 py-3 text-right font-bold">{money(row.profit)} ฿</td>
                <td className="px-3 py-3 text-amber-200">{row.missingCost || row.missingRevenue ? `ขาดต้นทุน ${row.missingCost} / รายรับ ${row.missingRevenue} รายการ` : row.cumulative < 0 ? 'ซื้อ-ใช้อาจไม่ครบ' : '—'}</td>
              </tr>)}
              {visibleAuditRows.length === 0 && <tr><td colSpan={9} className="px-3 py-5 text-center text-slate-400">ไม่พบ Ledger ในช่วงเวลาที่เลือก</td></tr>}
            </tbody>
          </table>
        </div>
        {(missingPurchaseDates > 0 || missingUsageDates > 0) && <p className="mt-2 text-xs text-amber-300">มีรายการที่ไม่มีวันที่ถูกต้อง: ซื้อ {missingPurchaseDates} / ใช้ {missingUsageDates} รายการ (ไม่รวมในยอดตามช่วงเวลา)</p>}
        <p className="mt-2 text-xs leading-5 text-slate-400">* ส่วนต่างสะสมคิดจากข้อมูลทุกเดือนก่อนหน้าด้วย • รายรับฐานอ่านจาก baseMemberRevenue เท่านั้น ไม่รวม Extra, Promotion, ยอดปรับมือ หรือเงินรับจริง • ยังไม่ได้เทียบกับ Archive เพราะรายงานนี้ไม่ได้รับข้อมูล Archive</p>
      </section>

      <div className="mt-3 rounded-xl border border-indigo-800/60 bg-indigo-950/20 px-3 py-2 text-[10px] text-indigo-200">
        อ้างอิง 25฿/คน/Match × 4 คน = 100฿ รายรับฐานต่อ Match
        • ต้นทุนใช้ราคาที่ Freeze ตอน Finish Match
      </div>
    </div>
  );
};

export default MonthlyShuttleReportV76;