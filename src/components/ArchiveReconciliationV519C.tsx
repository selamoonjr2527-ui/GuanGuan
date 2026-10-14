import React, { useMemo } from 'react';
import type { DailySessionArchive } from '../types';
import type { ShuttleUsageRecord } from '../utils/shuttleInventory';

interface Props {
  archives: DailySessionArchive[];
  usages: ShuttleUsageRecord[];
}

const verifiedRate: Record<string, { players: number; pieces: number; revenue: number; venue: number; shuttle: number }> = {
  '2026-09-18': { players: 23, pieces: 21, revenue: 4630, venue: 2000, shuttle: 1743 },
  '2026-10-09': { players: 23, pieces: 23, revenue: 4830, venue: 2250, shuttle: 1610 },
  '2026-10-11': { players: 18, pieces: 17, revenue: 3680, venue: 1500, shuttle: 1190 },
};
const fmt = (x: number) => x.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const n = (x: number | undefined) => Number.isFinite(x) ? Number(x) : 0;
const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Read-only bridge: authoritative closed-session Archive vs independent Usage Ledger. */
export function ArchiveReconciliationV519C({ archives, usages }: Props) {
  const rows = useMemo(() => {
    return [...archives].sort((a, b) => a.archiveDate.localeCompare(b.archiveDate)).map(a => {
      const known = verifiedRate[a.archiveDate];
      const costReady = a.venueCost != null && a.shuttleCost != null;
      const costOther = costReady ? n(a.totalExpense) - n(a.venueCost) - n(a.shuttleCost) : null;
      const rateReady = known != null && known.players === a.totalPlayers && known.pieces === a.totalShuttlecocks && close(known.revenue, a.totalRevenue) && costReady && close(known.venue, n(a.venueCost)) && close(known.shuttle, n(a.shuttleCost));
      // Only allocate 110 THB/member when archived data matches user-verified day.
      const courtRevenue = rateReady ? a.totalPlayers * 110 : null;
      const shuttleRevenue = courtRevenue == null ? null : a.totalRevenue - courtRevenue;
      const courtProfit = courtRevenue == null ? null : courtRevenue - n(a.venueCost);
      const shuttleProfit = shuttleRevenue == null ? null : shuttleRevenue - n(a.shuttleCost);
      const dayUsage = usages.filter(u => u.sessionDate === a.archiveDate);
      const ledgerPieces = dayUsage.reduce((s, u) => s + n(u.quantity), 0);
      const ledgerCost = dayUsage.reduce((s, u) => s + n(u.totalCost || u.quantity * u.unitCost), 0);
      const ledgerRevenue = dayUsage.reduce((s, u) => s + n(u.baseMemberRevenue), 0);
      const ledgerPresent = dayUsage.length > 0;
      const ledgerMatch = ledgerPresent && ledgerPieces === a.totalShuttlecocks && a.shuttleCost != null && close(ledgerCost, a.shuttleCost);
      const archiveArithmeticOk = close(a.totalRevenue - a.totalExpense, a.netProfit ?? a.totalRevenue - a.totalExpense);
      return { a, rateReady, costOther, courtRevenue, shuttleRevenue, courtProfit, shuttleProfit, ledgerPieces, ledgerCost, ledgerRevenue, ledgerPresent, ledgerMatch, archiveArithmeticOk };
    });
  }, [archives, usages]);
  const totals = useMemo(() => rows.reduce((s, r) => ({
    revenue: s.revenue + r.a.totalRevenue,
    expense: s.expense + r.a.totalExpense,
    profit: s.profit + r.a.totalRevenue - r.a.totalExpense,
    pieces: s.pieces + r.a.totalShuttlecocks,
    court: s.court + (r.courtProfit ?? 0),
    shuttle: s.shuttle + (r.shuttleProfit ?? 0),
    unallocated: s.unallocated + (r.courtProfit == null || r.shuttleProfit == null ? r.a.totalRevenue - r.a.totalExpense : -(r.costOther ?? 0)),
    verified: s.verified + (r.rateReady ? 1 : 0),
    mismatch: s.mismatch + (!r.archiveArithmeticOk || (r.ledgerPresent && !r.ledgerMatch) ? 1 : 0),
  }), { revenue: 0, expense: 0, profit: 0, pieces: 0, court: 0, shuttle: 0, unallocated: 0, verified: 0, mismatch: 0 }), [rows]);
  return <section className="rounded-2xl border border-cyan-800/60 bg-slate-900 p-4 sm:p-5 text-slate-100" data-guanguan-archive-audit-v519c>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-black">🔎 Archive Reconciliation — ยอดกลางของรอบที่ปิดแล้ว</h3>
      <p className="mt-1 text-xs text-slate-400">อ่าน Archive เป็นยอดอ้างอิง • เปรียบเทียบ Usage Ledger • ไม่แก้ Stock หรือธุรกรรม</p></div>
      <span className="rounded-lg border border-cyan-700 px-2 py-1 text-xs text-cyan-300">{rows.length} รอบ | ยืนยันสูตรแยกกองทุน {totals.verified} รอบ</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[
        ['รายรับ Archive', totals.revenue, '฿'], ['รายจ่าย Archive', totals.expense, '฿'],
        ['กำไร Archive', totals.profit, '฿'], ['ลูกที่ใช้ Archive', totals.pieces, 'ลูก'],
        ['กำไรค่าคอร์ท (ยืนยัน)', totals.court, '฿'], ['กำไรค่าลูก (ยืนยัน)', totals.shuttle, '฿'],
        ['กำไรยังไม่จัดสรร', totals.unallocated, '฿'], ['รอบที่ต้องตรวจ Ledger', totals.mismatch, 'รอบ'],
      ].map(([label, amount, unit]) => <div key={String(label)} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3"><div className="text-[11px] text-slate-400">{label}</div><div className="mt-1 text-lg font-bold">{fmt(Number(amount))} {unit}</div></div>)}
    </div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead><tr className="border-b border-slate-700 text-slate-400"><th className="p-2">วันที่</th><th className="p-2 text-right">คน</th><th className="p-2 text-right">ลูก Archive</th><th className="p-2 text-right">ค่าคอร์ทรับ</th><th className="p-2 text-right">ต้นทุนคอร์ท</th><th className="p-2 text-right">ค่าลูกรับ</th><th className="p-2 text-right">ต้นทุนลูก</th><th className="p-2 text-right">กำไร</th><th className="p-2">ตรวจ Usage Ledger</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.a.id} className="border-b border-slate-800"><td className="p-2">{r.a.archiveDate}</td><td className="p-2 text-right">{r.a.totalPlayers}</td><td className="p-2 text-right">{r.a.totalShuttlecocks}</td><td className="p-2 text-right">{r.courtRevenue == null ? 'รออัตราที่ยืนยัน' : fmt(r.courtRevenue)}</td><td className="p-2 text-right">{r.a.venueCost == null ? 'ไม่มีข้อมูล' : fmt(r.a.venueCost)}</td><td className="p-2 text-right">{r.shuttleRevenue == null ? 'รอยืนยัน' : fmt(r.shuttleRevenue)}</td><td className="p-2 text-right">{r.a.shuttleCost == null ? 'ไม่มีข้อมูล' : fmt(r.a.shuttleCost)}</td><td className="p-2 text-right font-semibold">{fmt(r.a.totalRevenue - r.a.totalExpense)}</td><td className="p-2">{!r.archiveArithmeticOk ? '⚠️ Archive ไม่สมดุล' : !r.ledgerPresent ? '— ไม่มี Usage Ledger วันเดียวกัน' : r.ledgerMatch ? `✓ ตรง: ${r.ledgerPieces} ลูก / ${fmt(r.ledgerCost)} ฿` : `⚠️ Ledger ${r.ledgerPieces} ลูก / ${fmt(r.ledgerCost)} ฿ (ต่าง ${fmt(r.ledgerPieces-r.a.totalShuttlecocks)} ลูก / ${fmt(r.ledgerCost-n(r.a.shuttleCost))} ฿)`}</td></tr>)}
    </tbody></table></div>
    <p className="mt-3 text-xs leading-5 text-amber-200">ยอดรายรับลูกของ Archive ที่ยืนยันแล้ว = รายรับรวม − (จำนวนสมาชิก × 110) และอาจรวมรายการ Extra/ปรับยอดที่ยังแยกไม่ได้ • ส่วน `baseMemberRevenue` ของ Usage Ledger ไม่ใช่รายรับลูกทั้งหมด • กำไรไม่ได้เท่ากับเงินสด • ข้อมูลที่ไม่มี Ledger ต้องตรวจสอบก่อนแก้ Stock</p>
  </section>;
}
