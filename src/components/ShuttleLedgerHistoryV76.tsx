import React, { useMemo, useState } from 'react';

type AnyRecord = Record<string, any>;

interface Props {
  purchases: AnyRecord[];
  usages: AnyRecord[];
  adjustments: AnyRecord[];

  // SHUTTLE_USAGE_MODEL_REPAIR_V1
  onRepairUsageDay?: (input: {
    sessionDate: string;
    brand: string;
    model: string;
    unitCost: number;
    correctedQuantity: number;
  }) => boolean;

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
  onRepairUsageDay,
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

        // SHUTTLE_USAGE_MODEL_REPAIR_V1
        unknownQuantity: number;
        unknownCost: number;
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
          unknownQuantity: 0,
          unknownCost: 0,
        };

      const name = shuttleName(item);

      const rowQuantity = Math.max(
        0,
        num(item.quantity)
      );

      const rowCost = Math.max(
        0,
        usageCost(item)
      );

      if (name && name !== '-') {
        current.names.add(name);
      } else {
        current.unknownQuantity += rowQuantity;
        current.unknownCost += rowCost;
      }

      current.quantity += rowQuantity;

      current.matches += Math.max(
        0,
        usageMatchCount(item)
      );

      current.totalCost += rowCost;

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

  // SHUTTLE_USAGE_MODEL_REPAIR_V1
  const modelOptions = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        brand: string;
        model: string;
        label: string;
        quantity: number;
        totalCost: number;
        unitCost: number;
      }
    >();

    purchases.forEach((item) => {
      const brand = String(item.brand || '').trim();
      const model = String(item.model || '').trim();

      // A repair target must have an explicit model.
      if (!model) return;

      const label =
        [brand, model].filter(Boolean).join(' ') || model;

      const key = `${brand}|||${model}`;

      const current =
        map.get(key) || {
          key,
          brand,
          model,
          label,
          quantity: 0,
          totalCost: 0,
          unitCost: 0,
        };

      current.quantity += Math.max(
        0,
        num(item.quantity)
      );

      current.totalCost += Math.max(
        0,
        purchaseTotal(item)
      );

      current.unitCost =
        current.quantity > 0
          ? current.totalCost / current.quantity
          : purchaseUnitCost(item);

      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [purchases]);

  const [repairDrafts, setRepairDrafts] = useState<
    Record<
      string,
      {
        modelKey: string;
        quantity: string;
      }
    >
  >({});
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
                <th className="px-4 py-3 text-center">
                  แก้รุ่น/จำนวน
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

                  const repairDraft =
                    repairDrafts[day.date] || {
                      modelKey:
                        modelOptions[0]?.key || '',
                      quantity:
                        String(day.unknownQuantity),
                    };

                  const selectedModel =
                    modelOptions.find(
                      (item) =>
                        item.key ===
                        repairDraft.modelKey
                    ) || modelOptions[0];

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

                      <td className="px-4 py-3">
                        {day.unknownQuantity > 0 &&
                        onRepairUsageDay ? (
                          <div className="min-w-[240px] space-y-2 rounded-xl border border-amber-800/50 bg-amber-950/20 p-2">
                            <div className="text-[10px] font-bold text-amber-300">
                              พบไม่ระบุรุ่น {day.unknownQuantity} ลูก
                            </div>

                            <select
                              value={
                                repairDraft.modelKey ||
                                modelOptions[0]?.key ||
                                ''
                              }
                              onChange={(event) =>
                                setRepairDrafts(
                                  (current) => ({
                                    ...current,
                                    [day.date]: {
                                      modelKey:
                                        event.target.value,
                                      quantity:
                                        repairDraft.quantity,
                                    },
                                  })
                                )
                              }
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-white outline-none focus:border-amber-500"
                            >
                              {modelOptions.length === 0 && (
                                <option value="">
                                  ยังไม่มี Stock ที่ระบุรุ่น
                                </option>
                              )}

                              {modelOptions.map((option) => (
                                <option
                                  key={option.key}
                                  value={option.key}
                                >
                                  {option.label} • {money(option.unitCost)} ฿/ลูก
                                </option>
                              ))}
                            </select>

                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={repairDraft.quantity}
                                onChange={(event) =>
                                  setRepairDrafts(
                                    (current) => ({
                                      ...current,
                                      [day.date]: {
                                        modelKey:
                                          repairDraft.modelKey ||
                                          modelOptions[0]?.key ||
                                          '',
                                        quantity:
                                          event.target.value,
                                      },
                                    })
                                  )
                                }
                                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-[11px] font-bold text-white outline-none focus:border-amber-500"
                                title="จำนวนลูกที่ถูกต้อง"
                              />

                              <span className="text-[10px] text-slate-500">
                                ลูก
                              </span>

                              <button
                                type="button"
                                disabled={!selectedModel}
                                onClick={() => {
                                  if (!selectedModel) {
                                    window.alert(
                                      'ยังไม่มี Stock ที่ระบุรุ่นให้เลือก'
                                    );
                                    return;
                                  }

                                  const correctedQuantity =
                                    Math.max(
                                      0,
                                      Math.round(
                                        Number(
                                          repairDraft.quantity
                                        )
                                      )
                                    );

                                  const repaired =
                                    onRepairUsageDay({
                                      sessionDate:
                                        day.date,
                                      brand:
                                        selectedModel.brand,
                                      model:
                                        selectedModel.model,
                                      unitCost:
                                        selectedModel.unitCost,
                                      correctedQuantity,
                                    });

                                  if (repaired) {
                                    setRepairDrafts(
                                      (current) => {
                                        const next = {
                                          ...current,
                                        };

                                        delete next[day.date];
                                        return next;
                                      }
                                    );
                                  }
                                }}
                                className="ml-auto rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-black text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                ✏️ แก้ไข
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-[10px] text-emerald-400">
                            ✓ ระบุแล้ว
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={9}
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