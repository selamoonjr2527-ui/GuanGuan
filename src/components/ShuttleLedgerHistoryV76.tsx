import React, { useMemo } from 'react';

type AnyRecord = Record<string, any>;

interface Props {
  purchases: AnyRecord[];
  usages: AnyRecord[];
  adjustments: AnyRecord[];
  sessionCourts?: Array<{
    id: string;
    name: string;
    active?: boolean;
  }>;
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

const fmtDate = (value: unknown) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw || '-';
};

const usageDate = (item: AnyRecord) =>
  String(item.sessionDate || item.date || '').trim();

const purchaseDate = (item: AnyRecord) =>
  String(
    item.purchaseDate ||
      item.purchasedDate ||
      item.date ||
      ''
  ).trim();

const shuttleName = (item: AnyRecord) => {
  const direct = String(
    item.shuttleName || item.name || ''
  ).trim();

  if (direct) return direct;

  return [item.brand, item.model]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ') || '-';
};

const usageCost = (item: AnyRecord) => {
  const total = num(item.totalCost);

  if (total > 0) return total;

  return (
    Math.max(0, num(item.quantity)) *
    Math.max(
      0,
      num(item.unitCost || item.costPerPiece)
    )
  );
};

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

const usageMatchCount = (item: AnyRecord) => {
  const explicit = num(
    item.matchCount || item.matches
  );

  if (explicit > 0) return explicit;

  const revenue = num(item.baseMemberRevenue);
  const memberCount = Math.max(1, num(item.memberCount) || 4);
  const rate = Math.max(
    1,
    num(item.memberRatePerMatch) || 25
  );

  if (revenue > 0) {
    return Math.max(
      1,
      Math.round(revenue / (memberCount * rate))
    );
  }

  // Normal Finish Match creates one Usage row per Match.
  return item.historyId ? 1 : 0;
};

export const ShuttleLedgerHistoryV76: React.FC<Props> = ({
  purchases = [],
  usages = [],
  adjustments = [],
}) => {
  const dailyUsages = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        names: Set<string>;
        quantity: number;
        matches: number;
        totalCost: number;
        revenue: number;
      }
    >();

    for (const item of usages) {
      const date = usageDate(item);
      if (!date) continue;

      const current =
        map.get(date) || {
          date,
          names: new Set<string>(),
          quantity: 0,
          matches: 0,
          totalCost: 0,
          revenue: 0,
        };

      const name = shuttleName(item);
      if (name && name !== '-') current.names.add(name);

      current.quantity += Math.max(
        0,
        num(item.quantity)
      );

      current.matches += Math.max(
        0,
        usageMatchCount(item)
      );

      current.totalCost += Math.max(
        0,
        usageCost(item)
      );

      current.revenue += Math.max(
        0,
        num(item.baseMemberRevenue)
      );

      map.set(date, current);
    }

    return Array.from(map.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [usages]);

  const sortedPurchases = useMemo(
    () =>
      [...purchases].sort(
        (a, b) =>
          purchaseDate(b).localeCompare(
            purchaseDate(a)
          ) ||
          num(b.createdAt) - num(a.createdAt)
      ),
    [purchases]
  );

  const sortedAdjustments = useMemo(
    () =>
      [...adjustments].sort(
        (a, b) =>
          String(b.date || '').localeCompare(
            String(a.date || '')
          ) ||
          num(b.createdAt) - num(a.createdAt)
      ),
    [adjustments]
  );

  const purchasedQty = purchases.reduce(
    (sum, item) =>
      sum + Math.max(0, num(item.quantity)),
    0
  );

  const usedQty = usages.reduce(
    (sum, item) =>
      sum + Math.max(0, num(item.quantity)),
    0
  );

  const adjustedQty = adjustments.reduce(
    (sum, item) =>
      sum + num(item.quantityDelta),
    0
  );

  const remainingQty =
    purchasedQty - usedQty + adjustedQty;

  return (
    <div
      className="mt-5 space-y-5"
      data-guanguan-shuttle-history-v76
    >
      {/* DAILY_SHUTTLE_USAGE_SUMMARY_V76 */}
      <div className="rounded-2xl border border-cyan-800/50 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-4 sm:px-5">
          <h3 className="text-sm sm:text-base font-black text-white">
            🪶 ประวัติคลังลูกย้อนหลัง
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            สรุปการใช้ลูกเป็นรายวัน • ไม่แสดงแยกทีละ Match
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              ซื้อเข้ารวม
            </div>
            <div className="mt-1 text-lg font-black text-cyan-300">
              {purchasedQty} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              ใช้ไปรวม
            </div>
            <div className="mt-1 text-lg font-black text-amber-300">
              {usedQty} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              คงเหลือ
            </div>
            <div className="mt-1 text-lg font-black text-emerald-300">
              {remainingQty} ลูก
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-3">
          <h4 className="text-sm font-black text-white">
            🏸 ประวัติการใช้ลูกจริง
          </h4>
          <p className="mt-1 text-[10px] text-slate-500">
            1 แถว = 1 วัน • รวมจำนวน Match และจำนวนลูกทั้งหมดของวันนั้น
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-3 py-3">รุ่นลูก</th>
                <th className="px-3 py-3 text-center">
                  Matches
                </th>
                <th className="px-3 py-3 text-center">
                  ใช้จริง
                </th>
                <th className="px-3 py-3 text-right">
                  ต้นทุนเฉลี่ย/ลูก
                </th>
                <th className="px-3 py-3 text-right">
                  ต้นทุนรวม
                </th>
                <th className="px-3 py-3 text-right">
                  รายรับฐาน
                </th>
                <th className="px-4 py-3 text-right">
                  กำไรค่าลูก
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {dailyUsages.length > 0 ? (
                dailyUsages.map((day) => {
                  const avgCost =
                    day.quantity > 0
                      ? day.totalCost / day.quantity
                      : 0;

                  const profit =
                    day.revenue - day.totalCost;

                  return (
                    <tr
                      key={day.date}
                      className="text-slate-300"
                    >
                      <td className="px-4 py-3 font-semibold text-white">
                        {fmtDate(day.date)}
                      </td>

                      <td className="px-3 py-3">
                        {Array.from(day.names).join(', ') ||
                          '-'}
                      </td>

                      <td className="px-3 py-3 text-center">
                        {day.matches}
                      </td>

                      <td className="px-3 py-3 text-center font-black text-amber-300">
                        {day.quantity} ลูก
                      </td>

                      <td className="px-3 py-3 text-right">
                        {money(avgCost)} ฿
                      </td>

                      <td className="px-3 py-3 text-right text-rose-300">
                        {money(day.totalCost)} ฿
                      </td>

                      <td className="px-3 py-3 text-right text-cyan-300">
                        {money(day.revenue)} ฿
                      </td>

                      <td
                        className={`px-4 py-3 text-right font-black ${
                          profit >= 0
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {profit >= 0 ? '+' : ''}
                        {money(profit)} ฿
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    ยังไม่มีประวัติการใช้ลูก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-3">
          <h4 className="text-sm font-black text-white">
            📦 ประวัติซื้อ Stock
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-3 py-3">รุ่น</th>
                <th className="px-3 py-3 text-center">
                  จำนวน
                </th>
                <th className="px-3 py-3 text-right">
                  ต้นทุน/ลูก
                </th>
                <th className="px-4 py-3 text-right">
                  มูลค่าซื้อ
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {sortedPurchases.length > 0 ? (
                sortedPurchases.map((item) => (
                  <tr
                    key={item.id}
                    className="text-slate-300"
                  >
                    <td className="px-4 py-3">
                      {fmtDate(purchaseDate(item))}
                    </td>

                    <td className="px-3 py-3 font-semibold text-white">
                      {shuttleName(item)}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {num(item.quantity)} ลูก
                    </td>

                    <td className="px-3 py-3 text-right">
                      {money(
                        purchaseUnitCost(item)
                      )}{' '}
                      ฿
                    </td>

                    <td className="px-4 py-3 text-right font-semibold text-cyan-300">
                      {money(
                        purchaseTotal(item)
                      )}{' '}
                      ฿
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    ยังไม่มีประวัติซื้อ Stock
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-3">
          <h4 className="text-sm font-black text-white">
            ⚖️ ประวัติปรับยอด Stock
          </h4>
          <p className="mt-1 text-[10px] text-slate-500">
            Stocktake / ลูกเสีย / ลูกหาย / พบ Stock เพิ่มเท่านั้น
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-3 py-3">เหตุผล</th>
                <th className="px-3 py-3 text-center">
                  ระบบเดิม
                </th>
                <th className="px-3 py-3 text-center">
                  นับจริง
                </th>
                <th className="px-3 py-3 text-center">
                  ปรับ
                </th>
                <th className="px-4 py-3 text-right">
                  มูลค่า
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {sortedAdjustments.length > 0 ? (
                sortedAdjustments.map((item) => (
                  <tr
                    key={item.id}
                    className="text-slate-300"
                  >
                    <td className="px-4 py-3">
                      {fmtDate(item.date)}
                    </td>
                    <td className="px-3 py-3">
                      {item.reason ||
                        item.note ||
                        '-'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {num(
                        item.previousSystemCount
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {num(item.actualCount)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {num(item.quantityDelta) >= 0
                        ? '+'
                        : ''}
                      {num(item.quantityDelta)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {money(
                        Math.abs(
                          num(item.valueDelta)
                        )
                      )}{' '}
                      ฿
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    ยังไม่มีการปรับยอด Stock
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ShuttleLedgerHistoryV76;