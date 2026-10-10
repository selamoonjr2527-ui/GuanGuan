import React, { useMemo, useState } from 'react';
import { MonthlyShuttleReportV76 } from './MonthlyShuttleReportV76';
import { ShuttleLedgerHistoryV76 } from './ShuttleLedgerHistoryV76';

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

const money = (value: unknown) =>
  n(value).toLocaleString('th-TH', {
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

const purchaseCostPerPiece = (item: AnyRecord) =>
  Math.max(
    0,
    n(
      item.unitCost ||
        item.costPerPiece ||
        item.pricePerPiece ||
        item.unitPrice
    )
  );

export const ShuttleStockWorkspaceV77: React.FC<Props> = ({
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

    const purchaseValue = purchases.reduce(
      (sum, item) => {
        const direct = n(
          item.totalCost ||
            item.totalPrice ||
            item.totalAmount ||
            item.purchaseAmount ||
            item.amount
        );

        if (direct > 0) return sum + direct;

        return (
          sum +
          Math.max(0, n(item.quantity)) *
            purchaseCostPerPiece(item)
        );
      },
      0
    );

    const usedValue = usages.reduce(
      (sum, item) => {
        const direct = n(item.totalCost);

        return (
          sum +
          (direct > 0
            ? direct
            : Math.max(0, n(item.quantity)) *
              Math.max(
                0,
                n(item.unitCost || item.costPerPiece)
              ))
        );
      },
      0
    );

    return {
      purchased,
      used,
      adjusted,
      remaining: purchased - used + adjusted,
      purchaseValue,
      usedValue,
      remainingValue: Math.max(
        0,
        purchaseValue - usedValue
      ),
    };
  }, [purchases, usages, adjustments]);

  const stockByModel = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        purchased: number;
        used: number;
        unitCost: number;
      }
    >();

    for (const item of purchases) {
      const name = shuttleName(item);
      const current =
        map.get(name) || {
          name,
          purchased: 0,
          used: 0,
          unitCost: 0,
        };

      current.purchased += Math.max(
        0,
        n(item.quantity)
      );

      const cost = purchaseCostPerPiece(item);
      if (cost > 0) current.unitCost = cost;

      map.set(name, current);
    }

    for (const item of usages) {
      const name = shuttleName(item);
      const current =
        map.get(name) || {
          name,
          purchased: 0,
          used: 0,
          unitCost: Math.max(
            0,
            n(item.unitCost || item.costPerPiece)
          ),
        };

      current.used += Math.max(
        0,
        n(item.quantity)
      );

      map.set(name, current);
    }

    return Array.from(map.values()).sort(
      (a, b) => b.purchased - a.purchased
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
    const qty = Math.max(0, n(item.quantity));
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
      ) || qty / ppt;

    const total =
      n(
        item.totalCost ||
          item.totalPrice ||
          item.totalAmount ||
          item.purchaseAmount ||
          item.amount
      ) ||
      qty * purchaseCostPerPiece(item);

    const perTube =
      n(
        item.pricePerTube ||
          item.costPerTube ||
          item.tubePrice
      ) ||
      (tubeCount > 0 ? total / tubeCount : 0);

    setEditingId(String(item.id || ''));
    setDate(purchaseDate(item) || sessionDate);
    setBrand(String(item.brand || 'Ling Mei'));
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
    setPricePerTube(String(perTube || ''));
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
      safeTubes <= 0 ||
      safePricePerTube <= 0
    ) {
      window.alert(
        'กรอก วันที่ / ยี่ห้อ / รุ่น / จำนวนหลอด / ราคาต่อหลอด ให้ครบ'
      );
      return;
    }

    const quantity = safeTubes * safePieces;
    const totalCost =
      safeTubes * safePricePerTube;
    const unitCost =
      quantity > 0 ? totalCost / quantity : 0;

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

  return (
    <div
      className="space-y-5"
      data-guanguan-shuttle-stock-v77
    >
      {/* SHUTTLE_STOCK_SEPARATION_V77 */}
      <div className="rounded-2xl border border-cyan-800/50 bg-gradient-to-br from-slate-900 to-cyan-950/20 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-white">
              🪶 คลังลูกแบด
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Purchase • Stocktake • Monthly Report • Usage History
            </p>
          </div>

          <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/25 px-4 py-2 text-right">
            <div className="text-[10px] text-slate-400">
              Stock คงเหลือ
            </div>
            <div className="text-2xl font-black text-emerald-300">
              {summary.remaining} ลูก
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">ซื้อเข้า</div>
            <div className="mt-1 font-black text-cyan-300">
              {summary.purchased} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">ใช้ไป</div>
            <div className="mt-1 font-black text-amber-300">
              {summary.used} ลูก
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">ต้นทุนใช้ไป</div>
            <div className="mt-1 font-black text-rose-300">
              {money(summary.usedValue)} ฿
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">มูลค่า Stock โดยประมาณ</div>
            <div className="mt-1 font-black text-emerald-300">
              {money(summary.remainingValue)} ฿
            </div>
          </div>
        </div>
      </div>

      {stockByModel.length > 0 && (
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
                  {item.unitCost > 0
                    ? ` • ${money(
                        item.unitCost
                      )}฿/ลูก`
                    : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white">
              {editingId
                ? '✏️ แก้ไขรายการซื้อ Stock'
                : '➕ เพิ่ม Stock'}
            </h3>
            <p className="mt-1 text-[10px] text-slate-500">
              การแก้ไขข้อมูลลูกทั้งหมดทำจากหน้านี้
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
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>

          <label className="text-[10px] text-slate-400">
            ยี่ห้อ
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Ling Mei"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </label>

          <label className="text-[10px] text-slate-400">
            รุ่น
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
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
              onChange={(e) => setTubes(e.target.value)}
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
            📦 รายการซื้อ Stock
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">วันที่</th>
                <th className="px-3 py-3 text-left">รุ่น</th>
                <th className="px-3 py-3 text-center">จำนวน</th>
                <th className="px-3 py-3 text-right">ต้นทุน/ลูก</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
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
                    <td className="px-3 py-3 text-right text-slate-300">
                      {money(
                        purchaseCostPerPiece(item)
                      )}{' '}
                      ฿
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
                  setStocktakeCount(e.target.value)
                }
                placeholder={String(summary.remaining)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </label>

            <label className="text-[10px] text-slate-400">
              เหตุผล
              <select
                value={stocktakeReason}
                onChange={(e) =>
                  setStocktakeReason(e.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="manual_count">ตรวจนับจริง</option>
                <option value="damaged">ลูกเสีย</option>
                <option value="lost">ลูกหาย</option>
                <option value="found">พบ Stock เพิ่ม</option>
                <option value="other">อื่นๆ</option>
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
            ⚙️ ตั้งค่าคลัง
          </h3>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-[10px] text-slate-400">
              เตือนเมื่อเหลือ
              <input
                type="number"
                min="0"
                value={thresholdInput}
                onChange={(e) =>
                  setThresholdInput(e.target.value)
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
                  setDefaultPiecesInput(e.target.value)
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

          <div className="mt-3 rounded-xl border border-rose-900/40 bg-rose-950/15 px-3 py-2 text-[10px] text-slate-400">
            ไม่มีปุ่ม Reset Stock ทั้งคลังแล้ว • หากข้อมูลคลาดเคลื่อนให้ใช้
            “ตรวจนับ / ปรับ Stock” แทน
          </div>
        </div>
      </div>

      <MonthlyShuttleReportV76
        purchases={purchases}
        usages={usages}
        defaultPiecesPerTube={defaultPiecesPerTube}
        sessionDate={sessionDate}
      />

      <ShuttleLedgerHistoryV76
        purchases={purchases}
        usages={usages}
        adjustments={adjustments}
      />
    </div>
  );
};

export default ShuttleStockWorkspaceV77;