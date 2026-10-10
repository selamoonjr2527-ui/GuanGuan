import React, { useEffect, useMemo, useState } from 'react';
import type { Player } from '../types';
import { subscribeToPaymentTransactions } from '../payment/paymentTransactions';
import type { PaymentTransaction } from '../payment/paymentTypes';

interface BillingExportViewProps {
  sessionDate: string;
  players: Player[];
  calculatePlayerCost: (player: Player) => number;
  getPlayerBreakdownText?: (player: Player) => string;
  onClose: () => void;
}

const formatTimestamp = (value?: number): string => {
  if (!value || !Number.isFinite(value)) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const csvCell = (value: unknown) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

export const BillingExportView: React.FC<BillingExportViewProps> = ({
  sessionDate,
  players,
  calculatePlayerCost,
  getPlayerBreakdownText,
  onClose,
}) => {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [paymentLoadError, setPaymentLoadError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return subscribeToPaymentTransactions(
      (items) => {
        setTransactions(items.filter((x) => x.sessionDate === sessionDate));
        setPaymentLoadError('');
      },
      (error) => {
        console.error('[GuanGuan Export] payment listener error', error);
        setPaymentLoadError('อ่าน Payment Timestamp จาก Firestore ไม่สำเร็จ');
      }
    );
  }, [sessionDate]);

  const rows = useMemo(() => {
    return players.map((player, index) => {
      const tx = transactions.find((x) => x.playerId === player.id);
      const amountDue = Math.max(0, Math.round(Number(calculatePlayerCost(player) || 0)));
      const txPaid = tx?.status === 'paid';
      const paidAmount = player.paid
        ? Math.max(0, Math.round(Number(player.paidAmount ?? amountDue)))
        : txPaid
        ? Math.max(0, Math.round(Number(tx?.amount || 0)))
        : 0;
      const outstanding = Math.max(0, amountDue - paidAmount);

      const paymentStatus =
        player.paid || txPaid
          ? 'ชำระแล้ว'
          : tx?.status === 'pending_verify'
          ? 'รอตรวจชำระ'
          : 'รอชำระ';

      const fallbackPaidAt = player.paymentTime
        ? `${sessionDate} ${player.paymentTime}`
        : '';

      return {
        no: index + 1,
        id: player.id,
        nickname: player.nickname,
        fullName: player.fullName || '',
        memberType: player.registrationType === 'walkin' ? 'Walk-in' : 'Member',
        matches: Number(player.matchesPlayed || 0),
        extra: Number(player.extraShuttlecocks || 0),
        breakdown: getPlayerBreakdownText?.(player) || '',
        adjustment: Number((player as any).billingAmountAdjustment || 0),
        adjustmentReason: String((player as any).billingAdjustmentReason || ''),
        amountDue,
        paidAmount,
        outstanding,
        paymentStatus,
        paymentMethod: player.paymentMethod || tx?.paymentMethod || '',
        reportedAt: formatTimestamp(tx?.reportedAt),
        paidAt: formatTimestamp(tx?.paidAt || tx?.verifiedAt) || fallbackPaidAt,
        invoiceNo: tx?.id || '',
      };
    });
  }, [players, transactions, calculatePlayerCost, getPlayerBreakdownText, sessionDate]);

  const totalAmount = rows.reduce((s, r) => s + r.amountDue, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  const buildCsv = () => {
    const header = [
      'No.','Player ID','Nickname','Full Name','Member Type','Matches','Extra Shuttlecocks',
      'Cost Breakdown','Billing Adjustment','Adjustment Reason','Amount Due (THB)',
      'Paid Amount (THB)','Outstanding (THB)','Payment Status','Payment Method',
      'Member Reported Payment At','Paid / Verified At','Invoice No.'
    ];

    const body = rows.map((r) => [
      r.no,r.id,r.nickname,r.fullName,r.memberType,r.matches,r.extra,r.breakdown,
      r.adjustment,r.adjustmentReason,r.amountDue,r.paidAmount,r.outstanding,
      r.paymentStatus,r.paymentMethod,r.reportedAt,r.paidAt,r.invoiceNo
    ].map(csvCell).join(','));

    return [header.map(csvCell).join(','), ...body].join('\r\n');
  };

  const exportCsv = () => {
    const blob = new Blob(['\uFEFF' + buildCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GuanGuan_Billing_${sessionDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copySummary = async () => {
    const text = rows.map((r) =>
      `${r.no}. ${r.nickname}\t${r.amountDue} บาท\t${r.paymentStatus}\t${r.reportedAt || '-'}\t${r.paidAt || '-'}`
    ).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert('ไม่สามารถ Copy รายการได้');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950 text-slate-100">
      {/* BILLING_EXPORT_PAGE_V50 */}
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">Organizer Export</div>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">📤 รายชื่อและค่าใช้จ่ายประจำวัน</h2>
            <div className="mt-1 text-xs text-slate-400">Session Date: {sessionDate}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copySummary} className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
              {copied ? '✅ Copy แล้ว' : '📋 Copy รายการ'}
            </button>
            <button type="button" onClick={exportCsv} className="rounded-xl bg-emerald-500 px-3.5 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400">
              ⬇️ Export CSV / Excel
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-rose-700/60 bg-rose-950/40 px-3.5 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-950/70">
              ✕ ปิด
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {paymentLoadError && (
          <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
            ⚠️ {paymentLoadError} — ค่าใช้จ่ายยัง Export ได้ แต่ Timestamp จาก Payment Transaction อาจว่าง
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="text-[11px] text-slate-400">ผู้เล่นวันนี้</div><div className="mt-1 text-2xl font-black text-white">{rows.length}</div></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="text-[11px] text-slate-400">ยอดเรียกเก็บ</div><div className="mt-1 text-2xl font-black text-white">{totalAmount.toLocaleString()}฿</div></div>
          <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-4"><div className="text-[11px] text-emerald-300/80">ชำระแล้ว</div><div className="mt-1 text-2xl font-black text-emerald-300">{totalPaid.toLocaleString()}฿</div></div>
          <div className="rounded-2xl border border-rose-800/50 bg-rose-950/20 p-4"><div className="text-[11px] text-rose-300/80">คงค้าง</div><div className="mt-1 text-2xl font-black text-rose-300">{totalOutstanding.toLocaleString()}฿</div></div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-black text-white">รายละเอียดรายบุคคล</div>
            <div className="mt-0.5 text-[11px] text-slate-400">แจ้งชำระ = ตอนสมาชิกกดแจ้งชำระแล้ว • Paid = ตอนผู้จัดยืนยันรับเงิน</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1350px] w-full text-xs">
              <thead className="bg-slate-950/70 text-slate-400">
                <tr>
                  <th className="px-3 py-3 text-left">#</th><th className="px-3 py-3 text-left">ชื่อ</th><th className="px-3 py-3 text-left">ประเภท</th>
                  <th className="px-3 py-3 text-center">Match</th><th className="px-3 py-3 text-center">Extra</th><th className="px-3 py-3 text-left">รายละเอียดค่าใช้จ่าย</th>
                  <th className="px-3 py-3 text-right">ยอด</th><th className="px-3 py-3 text-right">จ่ายแล้ว</th><th className="px-3 py-3 text-right">ค้าง</th>
                  <th className="px-3 py-3 text-center">สถานะ</th><th className="px-3 py-3 text-left">วิธีจ่าย</th><th className="px-3 py-3 text-left">แจ้งชำระเวลา</th><th className="px-3 py-3 text-left">Paid เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/35">
                    <td className="px-3 py-3 text-slate-500">{r.no}</td>
                    <td className="px-3 py-3"><div className="font-bold text-white">{r.nickname}</div>{r.fullName && <div className="text-[10px] text-slate-500">{r.fullName}</div>}</td>
                    <td className="px-3 py-3 text-slate-300">{r.memberType}</td>
                    <td className="px-3 py-3 text-center font-bold text-white">{r.matches}</td>
                    <td className="px-3 py-3 text-center text-slate-300">{r.extra}</td>
                    <td className="max-w-[340px] px-3 py-3 text-slate-300">{r.breakdown || '-'}{r.adjustment !== 0 && <div className="mt-1 text-[10px] text-amber-300">Adjustment {r.adjustment > 0 ? '+' : ''}{r.adjustment}฿{r.adjustmentReason ? ` • ${r.adjustmentReason}` : ''}</div>}</td>
                    <td className="px-3 py-3 text-right font-black text-white">{r.amountDue.toLocaleString()}฿</td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-300">{r.paidAmount.toLocaleString()}฿</td>
                    <td className="px-3 py-3 text-right font-bold text-rose-300">{r.outstanding.toLocaleString()}฿</td>
                    <td className="px-3 py-3 text-center"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${r.paymentStatus === 'ชำระแล้ว' ? 'bg-emerald-500/15 text-emerald-300' : r.paymentStatus === 'รอตรวจชำระ' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>{r.paymentStatus}</span></td>
                    <td className="px-3 py-3 text-slate-300">{r.paymentMethod || '-'}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-amber-200">{r.reportedAt || '-'}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-emerald-200">{r.paidAt || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

