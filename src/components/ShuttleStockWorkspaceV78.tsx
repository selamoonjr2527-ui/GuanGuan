import React, { useMemo, useState } from 'react';
import { loadSessionArchives } from '../utils/storage'; // SHUTTLE_ADVANCE_RECOVERY_V81

type AnyRecord = Record<string, any>;

interface Props {
  sessionDate: string;
  purchases: AnyRecord[];
  usages: AnyRecord[];
  adjustments: AnyRecord[];

  lowStockThreshold: number;
  targetStock: number;
  defaultPiecesPerTube: number;

  onAddPurchase: (purchase: any) => void;
  onDeletePurchase: (purchaseId: string) => boolean | void;
  onStocktake: (
    actualCount: number,
    reason: any,
    note?: string
  ) => boolean | void;
  onSetLowStockThreshold: (value: number) => void;
  onSetReorderSettings: (
    targetStock: number,
    piecesPerTube: number
  ) => void;
}

const n = (value: unknown) => {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
};

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
    .join(' ') || 'ไม่ระบุรุ่น';
};

const usageDateV81 = (item: AnyRecord) =>
  String(
    item.sessionDate ||
      item.archiveDate ||
      item.date ||
      ''
  ).trim();

const usageCostV81 = (item: AnyRecord) => {
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

const purchaseCostV81 = (item: AnyRecord) => {
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
          item.pricePerPiece
      )
    )
  );
};
export const ShuttleStockWorkspaceV78: React.FC<Props> = ({
  sessionDate,
  purchases = [],
  usages = [],
  adjustments = [],
  lowStockThreshold,
  targetStock,
  defaultPiecesPerTube,
  onAddPurchase,
  onDeletePurchase,
  onStocktake,
  onSetLowStockThreshold,
  onSetReorderSettings,
}) => {
  const [editingId, setEditingId] = useState('');
  const [date, setDate] = useState(sessionDate);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [tubes, setTubes] = useState('1');
  const [piecesPerTube, setPiecesPerTube] = useState(
    String(defaultPiecesPerTube || 12)
  );
  const [pricePerTube, setPricePerTube] = useState('');

  const [stocktakeCount, setStocktakeCount] = useState('');
  const [stocktakeReason, setStocktakeReason] =
    useState('manual_count');
  const [stocktakeNote, setStocktakeNote] = useState('');

  const [thresholdInput, setThresholdInput] = useState(
    String(lowStockThreshold)
  );
  const [targetInput, setTargetInput] = useState(
    String(targetStock)
  );
  const [defaultPiecesInput, setDefaultPiecesInput] =
    useState(String(defaultPiecesPerTube || 12));

  const summary = useMemo(() => {
    const purchased = purchases.reduce(
      (sum, item) =>
        sum + Math.max(0, n(item.quantity)),
      0
    );

    const used = usages.reduce(
      (sum, item) =>
        sum + Math.max(0, n(item.quantity)),
      0
    );

    const adjusted = adjustments.reduce(
      (sum, item) =>
        sum + n(item.quantityDelta),
      0
    );

    return {
      purchased,
      used,
      adjusted,
      remaining: purchased - used + adjusted,
    };
  }, [purchases, usages, adjustments]);

  const stockByModel = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        purchased: number;
        used: number;
      }
    >();

    for (const item of purchases) {
      const name = shuttleName(item);
      const current =
        map.get(name) || {
          name,
          purchased: 0,
          used: 0,
        };

      current.purchased += Math.max(
        0,
        n(item.quantity)
      );

      map.set(name, current);
    }

    for (const item of usages) {
      const name = shuttleName(item);
      const current =
        map.get(name) || {
          name,
          purchased: 0,
          used: 0,
        };

      current.used += Math.max(
        0,
        n(item.quantity)
      );

      map.set(name, current);
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.purchased -
        b.used -
        (a.purchased - a.used)
    );
  }, [purchases, usages]);

  const clearPurchaseForm = () => {
    setEditingId('');
    setDate(sessionDate);
    setBrand('');
    setModel('');
    setTubes('1');
    setPiecesPerTube(
      String(defaultPiecesPerTube || 12)
    );
    setPricePerTube('');
  };

  const startEditPurchase = (item: AnyRecord) => {
    const quantity = Math.max(
      0,
      n(item.quantity)
    );

    const ppt = Math.max(
      1,
      n(item.piecesPerTube) ||
        defaultPiecesPerTube ||
        12
    );

    const tubeCount =
      n(
        item.tubes ||
          item.tubeCount ||
          item.quantityTubes ||
          item.totalTubes
      ) || quantity / ppt;

    const totalCost = n(
      item.totalCost ||
        item.totalPrice ||
        item.totalAmount ||
        item.purchaseAmount ||
        item.amount
    );

    const price =
      n(
        item.pricePerTube ||
          item.costPerTube ||
          item.tubePrice
      ) ||
      (tubeCount > 0
        ? totalCost / tubeCount
        : 0);

    setEditingId(String(item.id || ''));
    setDate(purchaseDate(item) || sessionDate);
    setBrand(String(item.brand || ''));
    setModel(
      String(
        item.model ||
          item.name ||
          item.shuttleName ||
          ''
      )
    );
    setTubes(String(tubeCount || 1));
    setPiecesPerTube(String(ppt));
    setPricePerTube(
      price > 0 ? String(price) : ''
    );
  };

  const savePurchase = () => {
    const safeTubes = Math.max(
      0,
      Math.floor(n(tubes))
    );

    const safePieces = Math.max(
      1,
      Math.floor(n(piecesPerTube))
    );

    const safePricePerTube = Math.max(
      0,
      n(pricePerTube)
    );

    if (
      !date ||
      !brand.trim() ||
      !model.trim() ||
      safeTubes <= 0
    ) {
      window.alert(
        'กรอก วันที่ / ยี่ห้อ / รุ่น / จำนวนหลอด ให้ครบ'
      );
      return;
    }

    const quantity = safeTubes * safePieces;
    const totalCost =
      safeTubes * safePricePerTube;
    const unitCost =
      quantity > 0 && totalCost > 0
        ? totalCost / quantity
        : 0;

    const old =
      purchases.find(
        (item) => item.id === editingId
      ) || {};

    const id =
      editingId || `purchase-${Date.now()}`;

    onAddPurchase({
      ...old,
      id,

      date,
      purchaseDate: date,
      purchasedDate: date,

      brand: brand.trim(),
      model: model.trim(),
      name: `${brand.trim()} ${model.trim()}`,
      shuttleName: `${brand.trim()} ${model.trim()}`,

      quantity,
      pieces: quantity,
      totalPieces: quantity,

      tubes: safeTubes,
      tubeCount: safeTubes,
      totalTubes: safeTubes,
      piecesPerTube: safePieces,

      pricePerTube: safePricePerTube,
      costPerTube: safePricePerTube,

      unitCost,
      costPerPiece: unitCost,
      pricePerPiece: unitCost,

      totalCost,
      totalPrice: totalCost,
      totalAmount: totalCost,
      amount: totalCost,

      createdAt:
        n(old.createdAt) ||
        new Date(
          `${date}T12:00:00+07:00`
        ).getTime(),

      updatedAt: Date.now(),
    });

    clearPurchaseForm();
  };

  const saveStocktake = () => {
    if (stocktakeCount.trim() === '') {
      window.alert('กรอกจำนวน Stock ที่นับจริง');
      return;
    }

    const actual = Math.max(
      0,
      Math.floor(n(stocktakeCount))
    );

    const ok = onStocktake(
      actual,
      stocktakeReason,
      stocktakeNote.trim() || undefined
    );

    if (ok !== false) {
      setStocktakeCount('');
      setStocktakeNote('');
    }
  };

  const saveSettings = () => {
    const threshold = Math.max(
      0,
      Math.floor(n(thresholdInput))
    );

    const target = Math.max(
      0,
      Math.floor(n(targetInput))
    );

    const pieces = Math.max(
      1,
      Math.floor(n(defaultPiecesInput))
    );

    onSetLowStockThreshold(threshold);
    onSetReorderSettings(target, pieces);

    window.alert('✅ บันทึกค่าคลังลูกแล้ว');
  };

  // SHUTTLE_ADVANCE_RECOVERY_V81
  // Members pay court + shuttle in one transfer to organizer.
  // For CLOSED/ARCHIVED sessions, the actual shuttle cost used in that
  // session is treated as organizer capital already recovered.
  const advanceRecoveryV81 = useMemo(() => {
    const archives = loadSessionArchives();

    const closedDates = new Set(
      archives
        .map((item: any) =>
          String(item.archiveDate || '').trim()
        )
        .filter(Boolean)
    );

    const totalAdvance = purchases.reduce(
      (sum, item) => sum + purchaseCostV81(item),
      0
    );

    const recoveredFromClosedSessions = usages
      .filter((item) =>
        closedDates.has(usageDateV81(item))
      )
      .reduce(
        (sum, item) => sum + usageCostV81(item),
        0
      );

    const currentOrUnclosedUsageCost = usages
      .filter(
        (item) =>
          !closedDates.has(usageDateV81(item))
      )
      .reduce(
        (sum, item) => sum + usageCostV81(item),
        0
      );

    return {
      totalAdvance,
      recoveredFromClosedSessions,
      currentOrUnclosedUsageCost,
      outstandingAdvance: Math.max(
        0,
        totalAdvance - recoveredFromClosedSessions
      ),
    };
  }, [purchases, usages]);
  const stockIsLow =
    purchases.length > 0 &&
    summary.remaining <= lowStockThreshold;

  return (
    <div
      className="space-y-5"
      data-guanguan-shuttle-stock-v78
    >
      {/* SHUTTLE_STOCK_ONLY_V78 */}
      <div className="rounded-2xl border border-cyan-800/50 bg-gradient-to-br from-slate-900 to-cyan-950/20 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-white">
              🪶 คลังลูกแบด
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Stock เท่านั้น • เพิ่ม / แก้ไข / ตรวจนับ / ปรับจำนวน
            </p>
          </div>

          <div
            className={`rounded-xl border px-4 py-2 text-right ${
              stockIsLow
                ? 'border-rose-800/60 bg-rose-950/25'
                : 'border-emerald-800/50 bg-emerald-950/25'
            }`}
          >
            <div className="text-[10px] text-slate-400">
              Stock คงเหลือ
            </div>
            <div
              className={`text-2xl font-black ${
                stockIsLow
                  ? 'text-rose-300'
                  : 'text-emerald-300'
              }`}
            >
              {summary.remaining} ลูก
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              ซื้อเข้ารวม
            </div>
            <div className="mt-1 font-black text-cyan-300">
              {summary.purchased} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              ใช้ไปรวม
            </div>
            <div className="mt-1 font-black text-amber-300">
              {summary.used} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              ปรับ Stock
            </div>
            <div className="mt-1 font-black text-violet-300">
              {summary.adjusted >= 0 ? '+' : ''}
              {summary.adjusted} ลูก
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl border border-cyan-800/50 bg-slate-900 p-4 sm:p-5"
        data-shuttle-advance-recovery-v81
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-black text-white">
              💰 สรุปเงินทดรอง Stock ลูกแบด
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              สมาชิกโอนยอดรวมให้ผู้จัดอยู่แล้ว
              ดังนั้นต้นทุนลูกที่ใช้ในรอบที่ปิด/Archive แล้ว
              จะถือว่าเป็นเงินทุนที่ผู้จัดได้รับคืนอัตโนมัติ
            </p>
          </div>

          <div className="text-[10px] text-slate-500">
            ใช้เฉพาะรอบที่ปิดแล้วในการคืนทุน
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-cyan-900/50 bg-cyan-950/15 p-3">
            <div className="text-[10px] text-slate-500">
              เงินทดรองซื้อ Stock ทั้งหมด
            </div>
            <div className="mt-1 text-xl font-black text-cyan-300">
              {advanceRecoveryV81.totalAdvance.toLocaleString('th-TH', {
                maximumFractionDigits: 2,
              })}{' '}
              ฿
            </div>
          </div>

          <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/15 p-3">
            <div className="text-[10px] text-slate-500">
              คืนทุนจากลูกที่ใช้แล้ว
            </div>
            <div className="mt-1 text-xl font-black text-emerald-300">
              {advanceRecoveryV81.recoveredFromClosedSessions.toLocaleString(
                'th-TH',
                { maximumFractionDigits: 2 }
              )}{' '}
              ฿
            </div>
            <div className="mt-1 text-[9px] text-slate-600">
              ต้นทุนจริงของรอบที่ Archive แล้ว
            </div>
          </div>

          <div className="rounded-xl border border-rose-900/50 bg-rose-950/15 p-3">
            <div className="text-[10px] text-slate-500">
              เงินทดรองที่ยังค้าง
            </div>
            <div className="mt-1 text-xl font-black text-rose-300">
              {advanceRecoveryV81.outstandingAdvance.toLocaleString(
                'th-TH',
                { maximumFractionDigits: 2 }
              )}{' '}
              ฿
            </div>
            <div className="mt-1 text-[9px] text-slate-600">
              โดยหลักจะเท่ากับมูลค่าทุนของ Stock ที่ยังไม่ถูกใช้
            </div>
          </div>
        </div>

        {advanceRecoveryV81.currentOrUnclosedUsageCost > 0 && (
          <div className="mt-3 rounded-xl border border-amber-900/40 bg-amber-950/10 px-3 py-2 text-[10px] text-amber-200/80">
            รอบปัจจุบัน/รอบที่ยังไม่ Archive มีต้นทุนลูก{' '}
            {advanceRecoveryV81.currentOrUnclosedUsageCost.toLocaleString(
              'th-TH',
              { maximumFractionDigits: 2 }
            )}{' '}
            บาท — ยังไม่นับเป็นเงินคืนทุนจนกว่าจะปิดรอบ
          </div>
        )}
      </div>
      {stockByModel.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-black text-slate-300">
            Stock แยกตามรุ่น
          </h3>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stockByModel.map((item) => {
              const remaining =
                item.purchased - item.used;

              return (
                <div
                  key={item.name}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                >
                  <div className="font-black text-white">
                    {item.name}
                  </div>

                  <div className="mt-2 text-2xl font-black text-emerald-300">
                    {remaining} ลูก
                  </div>

                  <div className="mt-1 text-[10px] text-slate-500">
                    ซื้อ {item.purchased} • ใช้ {item.used}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white">
              {editingId
                ? '✏️ แก้ไขรายการ Stock'
                : '➕ เพิ่ม Stock'}
            </h3>

            <p className="mt-1 text-[10px] text-slate-500">
              ราคา/หลอดเก็บเป็นข้อมูลประกอบ Report เท่านั้น
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={clearPurchaseForm}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300"
            >
              ยกเลิกแก้ไข
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-[10px] text-slate-400">
            วันที่
            <input
              type="date"
              value={date}
              onChange={(e) =>
                setDate(e.target.value)
              }
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>

          <label className="text-[10px] text-slate-400">
            ยี่ห้อ
            <input
              value={brand}
              onChange={(e) =>
                setBrand(e.target.value)
              }
              placeholder="Ling Mei"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>

          <label className="text-[10px] text-slate-400">
            รุ่น
            <input
              value={model}
              onChange={(e) =>
                setModel(e.target.value)
              }
              placeholder="Silver"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>

          <label className="text-[10px] text-slate-400">
            จำนวนหลอด
            <input
              type="number"
              min="1"
              value={tubes}
              onChange={(e) =>
                setTubes(e.target.value)
              }
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>

          <label className="text-[10px] text-slate-400">
            ลูก/หลอด
            <input
              type="number"
              min="1"
              value={piecesPerTube}
              onChange={(e) =>
                setPiecesPerTube(e.target.value)
              }
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>

          <label className="text-[10px] text-slate-400">
            ราคา/หลอด
            <input
              type="number"
              min="0"
              value={pricePerTube}
              onChange={(e) =>
                setPricePerTube(e.target.value)
              }
              placeholder="สำหรับ Report"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={savePurchase}
          className="mt-4 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-400"
        >
          {editingId
            ? '💾 บันทึกการแก้ไข'
            : '➕ เพิ่ม Stock'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-black text-white">
            📦 รายการ Stock ที่ซื้อเข้า
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">
                  วันที่
                </th>
                <th className="px-3 py-3 text-left">
                  รุ่น
                </th>
                <th className="px-3 py-3 text-center">
                  จำนวน
                </th>
                <th className="px-4 py-3 text-right">
                  จัดการ
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {[...purchases]
                .sort((a, b) =>
                  purchaseDate(b).localeCompare(
                    purchaseDate(a)
                  )
                )
                .map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-slate-300">
                      {purchaseDate(item)}
                    </td>

                    <td className="px-3 py-3 font-bold text-white">
                      {shuttleName(item)}
                    </td>

                    <td className="px-3 py-3 text-center text-slate-300">
                      {n(item.quantity)} ลูก
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            startEditPurchase(item)
                          }
                          className="rounded-lg border border-cyan-800 bg-cyan-950/30 px-2.5 py-1.5 text-[10px] font-bold text-cyan-300"
                        >
                          แก้ไข
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `ลบรายการ ${shuttleName(
                                  item
                                )} ${n(
                                  item.quantity
                                )} ลูก หรือไม่?`
                              )
                            ) {
                              onDeletePurchase(
                                String(item.id)
                              );
                            }
                          }}
                          className="rounded-lg border border-rose-800 bg-rose-950/30 px-2.5 py-1.5 text-[10px] font-bold text-rose-300"
                        >
                          ลบรายการ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {purchases.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    ยังไม่มีรายการ Stock
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-black text-white">
            ⚖️ ตรวจนับ / ปรับ Stock
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] text-slate-400">
              จำนวนที่นับจริง
              <input
                type="number"
                min="0"
                value={stocktakeCount}
                onChange={(e) =>
                  setStocktakeCount(
                    e.target.value
                  )
                }
                placeholder={String(
                  summary.remaining
                )}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-slate-400">
              เหตุผล
              <select
                value={stocktakeReason}
                onChange={(e) =>
                  setStocktakeReason(
                    e.target.value
                  )
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="manual_count">
                  ตรวจนับจริง
                </option>
                <option value="damaged">
                  ลูกเสีย
                </option>
                <option value="lost">
                  ลูกหาย
                </option>
                <option value="found">
                  พบ Stock เพิ่ม
                </option>
                <option value="other">
                  อื่นๆ
                </option>
              </select>
            </label>
          </div>

          <input
            value={stocktakeNote}
            onChange={(e) =>
              setStocktakeNote(e.target.value)
            }
            placeholder="หมายเหตุ (ถ้ามี)"
            className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />

          <button
            type="button"
            onClick={saveStocktake}
            className="mt-3 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950"
          >
            บันทึกการปรับ Stock
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-black text-white">
            ⚙️ ตั้งค่า Stock
          </h3>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-[10px] text-slate-400">
              เตือนเมื่อเหลือ
              <input
                type="number"
                min="0"
                value={thresholdInput}
                onChange={(e) =>
                  setThresholdInput(
                    e.target.value
                  )
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-slate-400">
              Target Stock
              <input
                type="number"
                min="0"
                value={targetInput}
                onChange={(e) =>
                  setTargetInput(e.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-slate-400">
              ลูก/หลอด
              <input
                type="number"
                min="1"
                value={defaultPiecesInput}
                onChange={(e) =>
                  setDefaultPiecesInput(
                    e.target.value
                  )
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={saveSettings}
            className="mt-3 rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-black text-white"
          >
            บันทึกการตั้งค่า
          </button>

          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-500">
            Monthly Report / ต้นทุน / กำไรค่าลูก
            ดูที่เมนู 4 “คลังลูกแบด Report”
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShuttleStockWorkspaceV78;