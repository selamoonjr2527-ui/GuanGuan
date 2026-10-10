import React from 'react';
import { Download, X, Users, Wallet, CheckCircle2, Clock3 } from 'lucide-react';
import type { Player, SessionConfig } from '../types';
import {
  calculatePlayerFinalCharge,
  type PromotionRedemption,
} from '../utils/promotionRules';

interface MemberCostExportToolV68DProps {
  sessionConfig: SessionConfig;
  players: Player[];
  promotionRedemptions?: PromotionRedemption[];
  onClose: () => void;
}

type ExportRow = {
  nickname: string;
  fullName: string;
  realMatches: number;
  billedMatches: number;
  courtFee: number;
  shuttleFee: number;
  extraCount: number;
  extraFee: number;
  promotionDiscount: number;
  manualAdjustment: number;
  finalTotal: number;
  paymentStatus: 'PAID' | 'PENDING';
  paidAmount: number;
};

export const MemberCostExportToolV68D: React.FC<MemberCostExportToolV68DProps> = ({
  sessionConfig,
  players,
  promotionRedemptions = [],
  onClose,
}) => {
  // MEMBER_COST_EXPORT_TOOL_V68D
  const billingPlayers = players.filter(
    (p) =>
      p.isCheckedIn ||
      p.status === 'left' ||
      Boolean(p.checkInTime) ||
      Boolean(p.checkInTimestamp) ||
      Number(p.matchesPlayed || 0) > 0 ||
      Number(p.extraShuttlecocks || 0) > 0 ||
      Boolean(p.paid)
  );

  const rows: ExportRow[] = billingPlayers.map((player) => {
    const baseMatches = Math.max(0, Number(player.matchesPlayed || 0));
    const matchAdjustment = Number(
      (player as any).billingMatchAdjustment || 0
    );
    const billedMatches = Math.max(0, baseMatches + matchAdjustment);
    const adjustedPlayer: Player = {
      ...player,
      matchesPlayed: billedMatches,
      gamesPlayed: Math.max(
        0,
        Number(player.gamesPlayed || 0) +
          (billedMatches - baseMatches) * 2
      ),
    };

    const charge = calculatePlayerFinalCharge(
      adjustedPlayer,
      sessionConfig,
      promotionRedemptions,
      sessionConfig.date
    );

    const manualAdjustment = Number(
      (player as any).billingAmountAdjustment || 0
    );
    const finalTotal = Math.max(
      0,
      Math.round(Number(charge.finalTotal || 0) + manualAdjustment)
    );

    const paidAmount = player.paid
      ? Number(
          typeof player.paidAmount === 'number'
            ? player.paidAmount
            : finalTotal
        )
      : 0;

    return {
      nickname: player.nickname,
      fullName: player.fullName || '',
      realMatches: baseMatches,
      billedMatches,
      courtFee: Number(charge.courtFee || 0),
      shuttleFee: Number(charge.shuttleFee || 0),
      extraCount: Number(charge.extraShuttleCount || 0),
      extraFee: Number(charge.extraShuttleFee || 0),
      promotionDiscount: Number(charge.promotionDiscount || 0),
      manualAdjustment,
      finalTotal,
      paymentStatus: player.paid ? 'PAID' : 'PENDING',
      paidAmount,
    };
  });

  const totalDue = rows.reduce((sum, row) => sum + row.finalTotal, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paidAmount, 0);
  const totalPending = Math.max(0, totalDue - totalPaid);

  const handleExportCsv = () => {
    if (rows.length === 0) {
      window.alert('ยังไม่มีรายชื่อ / ค่าใช้จ่ายสำหรับ Export');
      return;
    }

    const csvCell = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    const data: unknown[][] = [
      ['GuanGuan - รายชื่อ / ค่าใช้จ่าย'],
      ['วันที่', sessionConfig.date],
      ['ก๊วน', sessionConfig.sessionTitle],
      ['สถานที่', sessionConfig.venueName],
      [],
      [
        'ชื่อเล่น',
        'ชื่อจริง',
        'Match จริง',
        'Match คิดเงิน',
        'ค่าคอร์ท',
        'ค่าลูกตาม Match',
        'Extra Shuttle (ลูก)',
        'ค่า Extra Shuttle',
        'ส่วนลดโปรโมชั่น',
        'ปรับยอด +/-',
        'ยอดสุทธิ',
        'สถานะ',
        'ยอดชำระแล้ว',
      ],
      ...rows.map((row) => [
        row.nickname,
        row.fullName,
        row.realMatches,
        row.billedMatches,
        row.courtFee,
        row.shuttleFee,
        row.extraCount,
        row.extraFee,
        row.promotionDiscount,
        row.manualAdjustment,
        row.finalTotal,
        row.paymentStatus,
        row.paidAmount,
      ]),
      [],
      ['สรุป'],
      ['จำนวนสมาชิก', rows.length],
      ['ยอดที่ต้องชำระรวม', totalDue],
      ['ยอดชำระแล้วรวม', totalPaid],
      ['ยอดค้างชำระ', totalPending],
    ];

    const csv =
      '\uFEFF' +
      data.map((row) => row.map(csvCell).join(',')).join('\r\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GuanGuan_Member_Cost_${sessionConfig.date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-700/45 bg-slate-900 shadow-2xl">
      <div className="flex flex-col gap-3 border-b border-slate-800 bg-gradient-to-r from-emerald-950/55 to-slate-900 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="text-lg font-black text-white">
            📋 Export รายชื่อ / ค่าใช้จ่าย
          </div>
          <div className="mt-1 text-xs text-slate-400">
            ตรวจสอบข้อมูลก่อน Export • ใช้ Billing calculation เดียวกับระบบ
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-black text-slate-300 hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
            ปิด
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <Users className="mb-2 h-4 w-4 text-cyan-400" />
          <div className="text-xl font-black text-white">{rows.length}</div>
          <div className="text-[10px] text-slate-500">สมาชิก</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <Wallet className="mb-2 h-4 w-4 text-amber-400" />
          <div className="text-xl font-black text-amber-300">
            {totalDue.toLocaleString()}฿
          </div>
          <div className="text-[10px] text-slate-500">ยอดรวม</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <CheckCircle2 className="mb-2 h-4 w-4 text-emerald-400" />
          <div className="text-xl font-black text-emerald-300">
            {totalPaid.toLocaleString()}฿
          </div>
          <div className="text-[10px] text-slate-500">ชำระแล้ว</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <Clock3 className="mb-2 h-4 w-4 text-rose-400" />
          <div className="text-xl font-black text-rose-300">
            {totalPending.toLocaleString()}฿
          </div>
          <div className="text-[10px] text-slate-500">ค้างชำระ</div>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-slate-800">
        <table className="min-w-[1050px] w-full text-left text-xs">
          <thead className="bg-slate-950 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">สมาชิก</th>
              <th className="px-3 py-3 text-center">Match</th>
              <th className="px-3 py-3 text-right">คอร์ท</th>
              <th className="px-3 py-3 text-right">ค่าลูก</th>
              <th className="px-3 py-3 text-right">Extra</th>
              <th className="px-3 py-3 text-right">ส่วนลด</th>
              <th className="px-3 py-3 text-right">ปรับยอด</th>
              <th className="px-3 py-3 text-right">สุทธิ</th>
              <th className="px-4 py-3 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {rows.map((row) => (
              <tr key={row.nickname} className="hover:bg-slate-800/35">
                <td className="px-4 py-3">
                  <div className="font-black text-white">{row.nickname}</div>
                  {row.fullName && (
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {row.fullName}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-slate-300">
                  {row.billedMatches}
                  {row.realMatches !== row.billedMatches && (
                    <div className="text-[9px] text-violet-400">
                      จริง {row.realMatches}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right text-slate-300">
                  {row.courtFee.toLocaleString()}฿
                </td>
                <td className="px-3 py-3 text-right text-amber-300">
                  {row.shuttleFee.toLocaleString()}฿
                </td>
                <td className="px-3 py-3 text-right text-blue-300">
                  {row.extraFee.toLocaleString()}฿
                  {row.extraCount > 0 && (
                    <div className="text-[9px] text-slate-500">
                      {row.extraCount} ลูก
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right text-emerald-300">
                  {row.promotionDiscount > 0
                    ? `-${row.promotionDiscount.toLocaleString()}฿`
                    : '-'}
                </td>
                <td className="px-3 py-3 text-right text-violet-300">
                  {row.manualAdjustment === 0
                    ? '-'
                    : `${row.manualAdjustment > 0 ? '+' : ''}${row.manualAdjustment.toLocaleString()}฿`}
                </td>
                <td className="px-3 py-3 text-right font-black text-white">
                  {row.finalTotal.toLocaleString()}฿
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                      row.paymentStatus === 'PAID'
                        ? 'border-emerald-700/50 bg-emerald-950/40 text-emerald-300'
                        : 'border-rose-700/50 bg-rose-950/35 text-rose-300'
                    }`}
                  >
                    {row.paymentStatus}
                  </span>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  ยังไม่มีรายชื่อ / ค่าใช้จ่ายของ Session นี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
