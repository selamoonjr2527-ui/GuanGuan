import React, { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Player, SessionConfig } from '../types';
import { generatePromptPayPayload } from '../utils/promptpay';

type AdjustmentKind = 'match' | 'extra' | 'amount';

interface OrganizerBillingAdjustmentsProps {
  players: Player[];
  sessionConfig: SessionConfig;
  calculatePlayerCost: (player: Player) => number;
  onApplyAdjustment: (
    playerId: string,
    kind: AdjustmentKind,
    delta: number,
    reason: string
  ) => void;
  onUndoAdjustment: (playerId: string) => void;
  onTogglePlayerPayment: (
    playerId: string,
    paid: boolean,
    amount?: number,
    newPin?: string
  ) => void;
}

export const OrganizerBillingAdjustments: React.FC<OrganizerBillingAdjustmentsProps> = ({
  players,
  sessionConfig,
  calculatePlayerCost,
  onApplyAdjustment,
  onUndoAdjustment,
  onTogglePlayerPayment,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [amountDelta, setAmountDelta] = useState('');
  const [search, setSearch] = useState('');
  const [combinedQr, setCombinedQr] = useState<string>('');
  const [combinedAmount, setCombinedAmount] = useState(0);
  const [combinedPlayerIds, setCombinedPlayerIds] = useState<string[]>([]);

  const visiblePlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => {
        if (!q) return true;
        return (
          p.nickname.toLowerCase().includes(q) ||
          (p.fullName || '').toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'));
  }, [players, search]);

  const selectedPlayers = useMemo(
    () => players.filter((p) => selectedIds.includes(p.id)),
    [players, selectedIds]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const requireAdjustmentReady = () => {
    if (selectedPlayers.length === 0) {
      window.alert('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
      return false;
    }
    if (!reason.trim()) {
      window.alert('กรุณาใส่เหตุผลการปรับยอด');
      return false;
    }
    const paid = selectedPlayers.filter((p) => p.paid);
    if (paid.length > 0) {
      window.alert(
        'มีสมาชิกที่ชำระแล้ว: ' +
          paid.map((p) => p.nickname).join(', ') +
          '\nกรุณา Undo Payment ก่อนแก้ยอด'
      );
      return false;
    }
    return true;
  };

  const apply = (kind: AdjustmentKind, delta: number) => {
    if (!requireAdjustmentReady()) return;
    selectedPlayers.forEach((p) =>
      onApplyAdjustment(p.id, kind, delta, reason.trim())
    );
  };

  const applyAmount = () => {
    const delta = Number(amountDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      window.alert('กรุณาใส่จำนวนเงิน เช่น 20 หรือ -20');
      return;
    }
    if (!requireAdjustmentReady()) return;
    selectedPlayers.forEach((p) =>
      onApplyAdjustment(p.id, 'amount', delta, reason.trim())
    );
    setAmountDelta('');
  };

  const openCombinedPayment = async () => {
    const payable = selectedPlayers.filter((p) => !p.isCheckedIn && !p.paid);
    if (payable.length < 2) {
      window.alert(
        'ชำระรวมต้องเลือกอย่างน้อย 2 คนที่ Check-out แล้วและยังไม่ชำระ'
      );
      return;
    }

    const amount = payable.reduce(
      (sum, p) => sum + calculatePlayerCost(p),
      0
    );

    if (amount <= 0) {
      window.alert('ยอดรวมต้องมากกว่า 0 บาท');
      return;
    }

    try {
      const payload = generatePromptPayPayload(
        sessionConfig.promptPayId,
        amount
      );
      const url = await QRCode.toDataURL(payload, {
        width: 320,
        margin: 2,
      });
      setCombinedQr(url);
      setCombinedAmount(amount);
      setCombinedPlayerIds(payable.map((p) => p.id));
    } catch (err) {
      console.error('Failed to generate combined PromptPay QR', err);
      window.alert('สร้าง QR ชำระรวมไม่สำเร็จ');
    }
  };

  const confirmCombinedPaid = () => {
    const payable = players.filter((p) => combinedPlayerIds.includes(p.id));
    if (payable.length === 0) return;

    const detail = payable
      .map((p) => `${p.nickname} ${calculatePlayerCost(p)}฿`)
      .join('\n');

    if (
      !window.confirm(
        `ยืนยันรับชำระรวม ${combinedAmount} บาทหรือไม่?\n\n${detail}\n\nระบบจะบันทึกยอดแยกให้สมาชิกแต่ละคน`
      )
    ) {
      return;
    }

    payable.forEach((p) =>
      onTogglePlayerPayment(p.id, true, calculatePlayerCost(p))
    );

    setCombinedQr('');
    setCombinedAmount(0);
    setCombinedPlayerIds([]);
    setSelectedIds([]);
  };

  return (
    <>
      {/* ORGANIZER_BILLING_ADJUSTMENTS_V31 */}
      <div className="bg-slate-900 border border-amber-700/50 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-white">
              🛠 ปรับยอดสมาชิก — Organizer
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              เพิ่ม/ลด Match, Extra Shuttle, ปรับเงิน และชำระรวมหลายคน
            </p>
          </div>
          <div className="text-xs font-bold text-amber-300">
            เลือกแล้ว {selectedIds.length} คน
          </div>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา Member ID / ชื่อเล่น / ชื่อจริง"
          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
        />

        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800">
          {visiblePlayers.map((p) => {
            const matchAdj = Number((p as any).billingMatchAdjustment || 0);
            const amountAdj = Number((p as any).billingAmountAdjustment || 0);
            const effectiveMatches = Math.max(
              0,
              (p.matchesPlayed || 0) + matchAdj
            );
            const checked = selectedIds.includes(p.id);

            return (
              <label
                key={p.id}
                className={`flex items-center gap-3 px-3 py-2.5 ${p.paid ? 'opacity-50' : 'hover:bg-slate-800/60 cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={p.paid}
                  onChange={() => toggleSelected(p.id)}
                  className="w-4 h-4"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">
                      {p.nickname}
                    </span>
                    <span className="text-[10px] text-slate-500">{p.id}</span>
                    {p.paid && (
                      <span className="text-[10px] text-emerald-400">
                        ✅ ชำระแล้ว
                      </span>
                    )}
                    {p.isCheckedIn && (
                      <span className="text-[10px] text-amber-300">
                        ยัง Check-in
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Match {p.matchesPlayed || 0}
                    {matchAdj !== 0
                      ? ` ${matchAdj > 0 ? '+' : ''}${matchAdj} = ${effectiveMatches}`
                      : ''}
                    {' • '}Extra {p.extraShuttlecocks || 0}
                    {' • '}ปรับเงิน {amountAdj > 0 ? '+' : ''}
                    {amountAdj}฿
                    {' • '}
                    <strong className="text-emerald-300">
                      รวม {calculatePlayerCost(p)}฿
                    </strong>
                  </div>
                  {(p as any).billingAdjustmentReason && (
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      ล่าสุด: {(p as any).billingAdjustmentReason}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => apply('match', 1)}
            className="rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 px-3 py-2 text-xs font-bold text-emerald-300"
          >
            +1 Match
          </button>
          <button
            type="button"
            onClick={() => apply('match', -1)}
            className="rounded-xl bg-rose-950 hover:bg-rose-900 border border-rose-800 px-3 py-2 text-xs font-bold text-rose-300"
          >
            -1 Match
          </button>
          <button
            type="button"
            onClick={() => apply('extra', 1)}
            className="rounded-xl bg-blue-950 hover:bg-blue-900 border border-blue-800 px-3 py-2 text-xs font-bold text-blue-300"
          >
            +1 Extra
          </button>
          <button
            type="button"
            onClick={() => apply('extra', -1)}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300"
          >
            -1 Extra
          </button>
        </div>

        <div className="grid sm:grid-cols-[1fr_180px_auto] gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลการปรับยอด เช่น ผู้จัดลืมกดจบ Match"
            className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          />
          <input
            type="number"
            value={amountDelta}
            onChange={(e) => setAmountDelta(e.target.value)}
            placeholder="+/- บาท เช่น -20"
            className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={applyAmount}
            className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950"
          >
            ปรับเงิน
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => {
              if (selectedPlayers.length === 0) {
                window.alert('กรุณาเลือกสมาชิก');
                return;
              }
              if (
                !window.confirm(
                  `Undo รายการปรับล่าสุดของสมาชิกที่เลือก ${selectedPlayers.length} คนหรือไม่?`
                )
              ) {
                return;
              }
              selectedPlayers.forEach((p) => onUndoAdjustment(p.id));
            }}
            className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-200"
          >
            ↩ Undo Adjustment ล่าสุด
          </button>

          <button
            type="button"
            onClick={openCombinedPayment}
            className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-extrabold text-slate-950"
          >
            💰 ชำระรวมหลายคน
          </button>
        </div>

        <div className="text-[10px] text-slate-500">
          +1 Match จะเพิ่มค่า Base Shuttle ตาม Match อัตโนมัติ • +1 Extra ใช้เฉพาะลูกเพิ่ม • สมาชิกที่ชำระแล้วต้อง Undo Payment ก่อนแก้ยอด
        </div>
      </div>

      {combinedQr && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-700 p-5 text-center space-y-4 shadow-2xl">
            <div>
              <div className="text-sm font-extrabold text-white">
                💰 PromptPay ชำระรวม
              </div>
              <div className="text-3xl font-black text-emerald-400 mt-1">
                {combinedAmount.toLocaleString()} บาท
              </div>
            </div>

            <img
              src={combinedQr}
              alt="Combined PromptPay QR"
              className="w-64 h-64 mx-auto rounded-xl bg-white p-2"
            />

            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-left text-xs space-y-1">
              {players
                .filter((p) => combinedPlayerIds.includes(p.id))
                .map((p) => (
                  <div key={p.id} className="flex justify-between gap-3">
                    <span className="text-slate-300">{p.nickname}</span>
                    <span className="font-bold text-emerald-300">
                      {calculatePlayerCost(p)}฿
                    </span>
                  </div>
                ))}
            </div>

            <button
              type="button"
              onClick={confirmCombinedPaid}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 py-2.5 text-sm font-extrabold text-slate-950"
            >
              ✅ ยืนยันชำระรวม
            </button>
            <button
              type="button"
              onClick={() => {
                setCombinedQr('');
                setCombinedAmount(0);
                setCombinedPlayerIds([]);
              }}
              className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-bold text-slate-300"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </>
  );
};
