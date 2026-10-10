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

  const [selectedMonth, setSelectedMonth] =
    useState(initialMonth);

  useEffect(() => {
    if (
      availableMonths.length > 0 &&
      !availableMonths.includes(selectedMonth)
    ) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

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

  const summary = useMemo(() => {
    const monthPurchases = purchases.filter(
      (item) =>
        monthKey(purchaseDate(item)) ===
        selectedMonth
    );

    const monthUsages = usages.filter(
      (item) =>
        monthKey(usageDate(item)) ===
        selectedMonth
    );

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
    selectedMonth,
    defaultPiecesPerTube,
  ]);

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
            เงินซื้อ Stock • จำนวนที่ใช้ • รายรับค่าลูกฐาน • กำไร/ขาดทุนค่าลูก
          </p>
        </div>

        <select
          value={selectedMonth}
          onChange={(event) =>
            setSelectedMonth(event.target.value)
          }
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white outline-none"
        >
          {availableMonths.map((key) => (
            <option key={key} value={key}>
              {monthLabel(key)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label="ซื้อ Stock เดือนนี้"
          value={`${money(summary.purchaseValue)}฿`}
          sub={`${money(
            summary.purchaseTubesTotal
          )} หลอด / ${summary.purchasePieces} ลูก`}
        />

        <Metric
          label="ใช้จริงเดือนนี้"
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

      <div className="mt-3 rounded-xl border border-indigo-800/60 bg-indigo-950/20 px-3 py-2 text-[10px] text-indigo-200">
        อ้างอิง 25฿/คน/Match × 4 คน = 100฿ รายรับฐานต่อ Match
        • ต้นทุนใช้ราคาที่ Freeze ตอน Finish Match
      </div>
    </div>
  );
};

export default MonthlyShuttleReportV76;