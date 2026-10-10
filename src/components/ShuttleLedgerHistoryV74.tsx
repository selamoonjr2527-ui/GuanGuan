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

const money = (value: unknown) =>
  Math.max(0, Number(value || 0)).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const fmtDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;

  return `${match[3]}/${match[2]}/${match[1]}`;
};

const fmtDateTime = (dateValue: unknown, createdAt: unknown) => {
  const date = fmtDate(dateValue);
  const ts = Number(createdAt || 0);

  if (!ts) return date;

  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${date} ${hh}:${mm}`;
  } catch {
    return date;
  }
};

const shuttleLabel = (item: AnyRecord) => {
  const explicit = String(item.shuttleName || item.name || '').trim();
  if (explicit) return explicit;

  const brand = String(item.brand || '').trim();
  const model = String(item.model || '').trim();

  return [brand, model].filter(Boolean).join(' ') || '-';
};

const getPurchaseUnitCost = (item: AnyRecord) =>
  Math.max(
    0,
    Number(
      item.unitCost ??
        item.costPerPiece ??
        item.pricePerPiece ??
        (Number(item.quantity || 0) > 0
          ? Number(item.totalCost || item.totalPrice || item.amount || 0) /
            Number(item.quantity || 1)
          : 0)
    )
  );

const getPurchaseTotal = (item: AnyRecord) => {
  const explicit = Number(
    item.totalCost ?? item.totalPrice ?? item.amount ?? 0
  );

  if (explicit > 0) return explicit;

  return (
    Math.max(0, Number(item.quantity || 0)) *
    getPurchaseUnitCost(item)
  );
};

const getUsageDate = (item: AnyRecord) =>
  item.sessionDate || item.date || '';

const getPurchaseDate = (item: AnyRecord) =>
  item.purchaseDate || item.date || '';

export const ShuttleLedgerHistoryV74: React.FC<Props> = ({
  purchases,
  usages,
  adjustments,
  sessionCourts = [],
}) => {
  const sortedPurchases = useMemo(
    () =>
      [...(purchases || [])].sort((a, b) => {
        const dateCmp = String(getPurchaseDate(b)).localeCompare(
          String(getPurchaseDate(a))
        );
        if (dateCmp !== 0) return dateCmp;
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      }),
    [purchases]
  );

  const sortedUsages = useMemo(
    () =>
      [...(usages || [])].sort((a, b) => {
        const dateCmp = String(getUsageDate(b)).localeCompare(
          String(getUsageDate(a))
        );
        if (dateCmp !== 0) return dateCmp;
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      }),
    [usages]
  );

  const sortedAdjustments = useMemo(
    () =>
      [...(adjustments || [])].sort(
        (a, b) =>
          String(b.date || '').localeCompare(String(a.date || '')) ||
          Number(b.createdAt || 0) - Number(a.createdAt || 0)
      ),
    [adjustments]
  );

  const currentCourtNameByLegacyName = useMemo(() => {
    const map = new Map<string, string>();

    sessionCourts.forEach((court, index) => {
      const name = String(court?.name || '').trim();
      if (!name) return;

      map.set(`คอร์ท ${index + 1}`, name);
      map.set(`Court ${index + 1}`, name);

      if (court.id) {
        map.set(String(court.id), name);
      }
    });

    return map;
  }, [sessionCourts]);

  const resolveCourtName = (rawValue: unknown) => {
    const raw = String(rawValue || '').trim();

    if (!raw) return '-';

    // Historical aggregate rows intentionally have no exact court.
    if (
      raw.startsWith('Historical Session') ||
      raw.startsWith('Historical Import')
    ) {
      return 'ย้อนหลัง (รวมทั้งรอบ)';
    }

    return currentCourtNameByLegacyName.get(raw) || raw;
  };

  const purchasedQty = sortedPurchases.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0
  );

  const usedQty = sortedUsages.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0
  );

  const adjustmentQty = sortedAdjustments.reduce(
    (sum, item) => sum + Number(item.quantityDelta || 0),
    0
  );

  const remainingQty = purchasedQty - usedQty + adjustmentQty;

  const purchaseValue = sortedPurchases.reduce(
    (sum, item) => sum + getPurchaseTotal(item),
    0
  );

  const usedValue = sortedUsages.reduce(
    (sum, item) =>
      sum +
      Math.max(
        0,
        Number(
          item.totalCost ??
            Number(item.quantity || 0) * Number(item.unitCost || 0)
        )
      ),
    0
  );

  return (
    <div className="mt-5 space-y-5">
      {/* SHUTTLE_LEDGER_HISTORY_V74 */}
      <div className="rounded-2xl border border-cyan-800/50 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-4 sm:px-5">
          <h3 className="text-sm sm:text-base font-black text-white">
            🪶 ประวัติคลังลูกย้อนหลัง • ทุกวัน
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            ตารางนี้แสดง Purchase / Usage / Stock Adjustment ย้อนหลังทั้งหมด
            ไม่ได้จำกัดเฉพาะรอบปัจจุบัน
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">ซื้อเข้ารวม</div>
            <div className="mt-1 text-lg font-black text-cyan-300">
              {purchasedQty} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">ใช้ไปรวม</div>
            <div className="mt-1 text-lg font-black text-amber-300">
              {usedQty} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">คงเหลือจาก Ledger</div>
            <div className="mt-1 text-lg font-black text-emerald-300">
              {remainingQty} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">ต้นทุนใช้ไป</div>
            <div className="mt-1 text-lg font-black text-rose-300">
              {money(usedValue)} ฿
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 px-4 py-3 text-[10px] text-slate-500">
          มูลค่าซื้อสะสม {money(purchaseValue)} ฿ • Stock Adjustment{' '}
          {adjustmentQty >= 0 ? '+' : ''}
          {adjustmentQty} ลูก
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
                <th className="px-3 py-3 text-center">จำนวน</th>
                <th className="px-3 py-3 text-right">ต้นทุน/ลูก</th>
                <th className="px-4 py-3 text-right">มูลค่าซื้อ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedPurchases.length > 0 ? (
                sortedPurchases.map((item) => (
                  <tr key={item.id} className="text-slate-300">
                    <td className="px-4 py-3">
                      {fmtDate(getPurchaseDate(item))}
                    </td>
                    <td className="px-3 py-3 font-semibold text-white">
                      {shuttleLabel(item)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {Number(item.quantity || 0)} ลูก
                    </td>
                    <td className="px-3 py-3 text-right">
                      {money(getPurchaseUnitCost(item))} ฿
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-cyan-300">
                      {money(getPurchaseTotal(item))} ฿
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
            🏸 ประวัติการใช้ลูกจริง
          </h4>
          <p className="mt-1 text-[10px] text-slate-500">
            รวมข้อมูลย้อนหลังและ Match ที่ Finish ในระบบ
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">วันที่/เวลา</th>
                <th className="px-3 py-3">รุ่นลูก</th>
                <th className="px-3 py-3">Court</th>
                <th className="px-3 py-3 text-center">ใช้จริง</th>
                <th className="px-3 py-3 text-right">ต้นทุน/ลูก</th>
                <th className="px-3 py-3 text-right">ต้นทุนรวม</th>
                <th className="px-4 py-3 text-right">รายรับฐาน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedUsages.length > 0 ? (
                sortedUsages.map((item) => (
                  <tr key={item.id} className="text-slate-300">
                    <td className="px-4 py-3">
                      {fmtDateTime(
                        getUsageDate(item),
                        item.createdAt
                      )}
                    </td>
                    <td className="px-3 py-3 font-semibold text-white">
                      {shuttleLabel(item)}
                    </td>
                    <td className="px-3 py-3">
                      {resolveCourtName(item.courtName || item.courtId)}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-amber-300">
                      {Number(item.quantity || 0)} ลูก
                    </td>
                    <td className="px-3 py-3 text-right">
                      {money(item.unitCost || item.costPerPiece)} ฿
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-rose-300">
                      {money(
                        item.totalCost ??
                          Number(item.quantity || 0) *
                            Number(item.unitCost || 0)
                      )}{' '}
                      ฿
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-300">
                      {money(item.baseMemberRevenue)} ฿
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
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
            ⚖️ ประวัติปรับยอด Stock
          </h4>
          <p className="mt-1 text-[10px] text-slate-500">
            จะมีรายการเฉพาะตอนใช้ Stocktake / ลูกเสีย / ลูกหาย / พบ Stock เพิ่ม
            — Purchase และการใช้ Match ไม่ถือเป็น Stock Adjustment
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-3 py-3">เหตุผล</th>
                <th className="px-3 py-3 text-center">ระบบเดิม</th>
                <th className="px-3 py-3 text-center">นับจริง</th>
                <th className="px-3 py-3 text-center">ปรับ</th>
                <th className="px-4 py-3 text-right">มูลค่า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedAdjustments.length > 0 ? (
                sortedAdjustments.map((item) => (
                  <tr key={item.id} className="text-slate-300">
                    <td className="px-4 py-3">
                      {fmtDate(item.date)}
                    </td>
                    <td className="px-3 py-3">
                      {item.reason || item.note || '-'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {Number(item.previousSystemCount || 0)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {Number(item.actualCount || 0)}
                    </td>
                    <td
                      className={`px-3 py-3 text-center font-bold ${
                        Number(item.quantityDelta || 0) >= 0
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {Number(item.quantityDelta || 0) >= 0 ? '+' : ''}
                      {Number(item.quantityDelta || 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {Number(item.valueDelta || 0) >= 0 ? '+' : ''}
                      {money(Math.abs(Number(item.valueDelta || 0)))} ฿
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    ยังไม่มีการปรับยอด Stock — ถูกต้องแล้ว หากยังไม่เคยทำ Stocktake
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

export default ShuttleLedgerHistoryV74;