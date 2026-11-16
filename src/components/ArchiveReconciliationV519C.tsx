import React, { useMemo, useState } from 'react';
import type { DailySessionArchive, ArchiveFinanceVerification } from '../types';
import type { ShuttleUsageRecord } from '../utils/shuttleInventory';
import { confirmArchiveFinanceToFirestore } from '../utils/firestoreCollectionsSync';

interface Props {
  archives: DailySessionArchive[];
  usages: ShuttleUsageRecord[];
  isOrganizerMode: boolean;
}
const money = (value: number) => Math.round(value * 100) / 100;
const fmt = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const near = (a: number, b: number) => Math.abs(a - b) <= 0.01;

/** A verification is valid only while the underlying Archive figures remain unchanged. */
function verified(archive: DailySessionArchive): ArchiveFinanceVerification | null {
  const v = archive.financeVerification;
  if (!v || v.schemaVersion !== 1 || !v.confirmedByUid || !valid(v.confirmedAt)) return null;
  const s = v.snapshot;
  if (!s || s.archiveDate !== archive.archiveDate || s.totalPlayers !== archive.totalPlayers ||
      s.totalShuttlecocks !== archive.totalShuttlecocks || !near(s.totalRevenue, archive.totalRevenue) ||
      !near(s.totalExpense, archive.totalExpense) || !valid(archive.venueCost) ||
      !valid(archive.shuttleCost) || !near(s.venueCost, archive.venueCost) || !near(s.shuttleCost, archive.shuttleCost)) return null;
  if (![v.courtRatePerPlayer, v.courtRevenue, v.shuttleRevenue, v.otherRevenue].every(valid) ||
      [v.courtRatePerPlayer, v.courtRevenue, v.shuttleRevenue, v.otherRevenue].some(x => x < 0) ||
      !near(v.courtRevenue, money(v.courtRatePerPlayer * archive.totalPlayers)) ||
      !near(archive.totalRevenue, money(v.courtRevenue + v.shuttleRevenue + v.otherRevenue))) return null;
  return v;
}

export function ArchiveReconciliationV519C({ archives, usages, isOrganizerMode }: Props) {
  const [selected, setSelected] = useState<DailySessionArchive | null>(null);
  const [rate, setRate] = useState('110');
  const [shuttleRevenue, setShuttleRevenue] = useState('');
  const [otherRevenue, setOtherRevenue] = useState('0');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const rows = useMemo(() => archives.slice().sort((a,b) => a.archiveDate.localeCompare(b.archiveDate)).map(a => {
    const v = verified(a);
    const dayUsage = usages.filter(u => u.sessionDate === a.archiveDate);
    const ledgerPieces = dayUsage.reduce((sum,u) => sum + (valid(u.quantity) ? u.quantity : 0), 0);
    const ledgerCost = money(dayUsage.reduce((sum,u) => sum + (valid(u.totalCost) ? u.totalCost : (u.quantity * u.unitCost)), 0));
    const ledgerPresent = dayUsage.length > 0;
    const ledgerMatches = ledgerPresent && valid(a.shuttleCost) && ledgerPieces === a.totalShuttlecocks && near(ledgerCost, a.shuttleCost);
    const arithmeticOk = valid(a.totalRevenue) && valid(a.totalExpense) && near(a.totalRevenue - a.totalExpense, a.netProfit ?? a.totalRevenue - a.totalExpense);
    const courtProfit = v && valid(a.venueCost) ? money(v.courtRevenue - a.venueCost) : null;
    const shuttleProfit = v && valid(a.shuttleCost) ? money(v.shuttleRevenue - a.shuttleCost) : null;
    const otherProfit = v ? money(v.otherRevenue - (a.totalExpense - (a.venueCost ?? 0) - (a.shuttleCost ?? 0))) : null;
    return {a,v,ledgerPieces,ledgerCost,ledgerPresent,ledgerMatches,arithmeticOk,courtProfit,shuttleProfit,otherProfit};
  }),[archives,usages]);
  const totals = useMemo(() => rows.reduce((s,r) => ({
    revenue:s.revenue+r.a.totalRevenue, expense:s.expense+r.a.totalExpense,
    pieces:s.pieces+r.a.totalShuttlecocks, verified:s.verified+(r.v?1:0),
    court:s.court+(r.courtProfit??0), shuttle:s.shuttle+(r.shuttleProfit??0),
    other:s.other+(r.otherProfit??0), mismatch:s.mismatch+(r.ledgerPresent&&!r.ledgerMatches?1:0),
    missing:s.missing+(!r.ledgerPresent?1:0), arithmetic:s.arithmetic+(!r.arithmeticOk?1:0)
  }),{revenue:0,expense:0,pieces:0,verified:0,court:0,shuttle:0,other:0,mismatch:0,missing:0,arithmetic:0}),[rows]);

  function startConfirm(a: DailySessionArchive) {
    const v = verified(a);
    const nextRate = v?.courtRatePerPlayer ?? 110;
    const court = money(a.totalPlayers * nextRate);
    setSelected(a);
    setRate(String(nextRate));
    setOtherRevenue(String(v?.otherRevenue ?? 0));
    setShuttleRevenue(String(v?.shuttleRevenue ?? money(a.totalRevenue - court)));
    setReason('');
    setMessage('');
  }
  const rateNumber = Number(rate);
  const courtNumber = selected ? money(selected.totalPlayers * rateNumber) : 0;
  const shuttleNumber = Number(shuttleRevenue);
  const otherNumber = Number(otherRevenue);
  const previewOk = !!selected && [rateNumber, courtNumber, shuttleNumber, otherNumber].every(Number.isFinite) &&
    [rateNumber,courtNumber,shuttleNumber,otherNumber].every(x => x >= 0) &&
    near(selected.totalRevenue, money(courtNumber+shuttleNumber+otherNumber));

  async function submit() {
    if (!isOrganizerMode || !selected || !previewOk || !reason.trim() || busy) return;
    const current = archives.find(a => a.id === selected.id);
    if (!current || JSON.stringify({date:current.archiveDate,revenue:current.totalRevenue,expense:current.totalExpense}) !==
        JSON.stringify({date:selected.archiveDate,revenue:selected.totalRevenue,expense:selected.totalExpense})) {
      setMessage('ข้อมูล Archive มีการเปลี่ยน กรุณาปิดแล้วเปิดรายการใหม่'); return;
    }
    if (!window.confirm(`ยืนยันการจัดสรรรายรับ ${selected.archiveDate}?\nค่าคอร์ท ${fmt(courtNumber)} บาท\nค่าลูก ${fmt(shuttleNumber)} บาท\nรายรับอื่น ${fmt(otherNumber)} บาท\n\nการยืนยันนี้ไม่แก้ Stock หรือ Usage Ledger`)) return;
    setBusy(true);setMessage('');
    try {
      await confirmArchiveFinanceToFirestore(selected, {
        courtRatePerPlayer: rateNumber, courtRevenue: courtNumber,
        shuttleRevenue: shuttleNumber, otherRevenue: otherNumber, reason: reason.trim()
      });
      setSelected(null);
    } catch(error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Firestore');
    } finally {setBusy(false);}
  }
  return <section className="rounded-2xl border border-cyan-800/60 bg-slate-900 p-4 sm:p-5 text-slate-100" data-guanguan-archive-verification-v2>
    <div className="flex flex-wrap justify-between gap-2">
      <div><h3 className="text-base font-black">🔎 Archive Reconciliation — ยืนยันรายรับแยกประเภท</h3>
        <p className="mt-1 text-xs text-slate-400">การยืนยันยอดการเงินแยกจากการตรวจ Ledger • ไม่แก้ยอดชำระ Stock หรือธุรกรรม</p></div>
      <span className="text-xs text-cyan-300">{rows.length} รอบ | ผู้จัดยืนยัน {totals.verified} รอบ | Ledger ต่าง {totals.mismatch} รอบ | ไม่มี Ledger {totals.missing} รอบ</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {([
        ['รายรับ Archive', totals.revenue],['รายจ่าย Archive', totals.expense],
        ['กำไร Archive', totals.revenue-totals.expense],['ลูกที่ใช้ Archive', totals.pieces],
        ['กำไรค่าคอร์ทที่ยืนยัน',totals.court],['กำไรลูกที่ยืนยัน',totals.shuttle],
        ['กำไรอื่นที่ยืนยัน',totals.other],['กำไรที่ยังไม่ยืนยัน', money(rows.filter(r=>!r.v).reduce((s,r)=>s+r.a.totalRevenue-r.a.totalExpense,0))],
      ] as [string,number][]).map(([label,value]) =>
        <div key={label} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3"><div className="text-[11px] text-slate-400">{label}</div><div className="mt-1 text-lg font-bold">{fmt(value)} {label.includes('ลูกที่ใช้')?'ลูก':'฿'}</div></div>)}
    </div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-xs">
      <thead><tr className="border-b border-slate-700 text-slate-400">{['วันที่','คน','ลูก','ค่าคอร์ทรับ','ต้นทุนคอร์ท','ค่าลูกรับ','ต้นทุนลูก','กำไร','ยืนยันยอด','Usage Ledger','จัดการ'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead>
      <tbody>{rows.map(r=><tr key={r.a.id} className="border-b border-slate-800">
        <td className="p-2">{r.a.archiveDate}</td><td className="p-2">{r.a.totalPlayers}</td><td className="p-2">{r.a.totalShuttlecocks}</td>
        <td className="p-2">{r.v?fmt(r.v.courtRevenue):'รอยืนยัน'}</td><td className="p-2">{valid(r.a.venueCost)?fmt(r.a.venueCost):'ไม่มีข้อมูล'}</td>
        <td className="p-2">{r.v?fmt(r.v.shuttleRevenue):'รอยืนยัน'}</td><td className="p-2">{valid(r.a.shuttleCost)?fmt(r.a.shuttleCost):'ไม่มีข้อมูล'}</td>
        <td className="p-2">{fmt(r.a.totalRevenue-r.a.totalExpense)}</td>
        <td className="p-2">{r.v?'✓ ผู้จัดยืนยันแล้ว':r.a.financeVerification?'⚠ ยืนยันเดิมหมดอายุ':'รอผู้จัดยืนยัน'}</td>
        <td className="p-2">{!r.arithmeticOk?'⚠ Archive ไม่สมดุล':!r.ledgerPresent?'— ไม่มี Ledger วันเดียวกัน':r.ledgerMatches?'✓ ตรงกัน':`⚠ ต่าง ${fmt(r.ledgerPieces-r.a.totalShuttlecocks)} ลูก / ${fmt(money(r.ledgerCost-(r.a.shuttleCost??0)))} ฿`}</td>
        <td className="p-2">{isOrganizerMode?<button type="button" className="rounded-md border border-teal-600 px-2 py-1 text-teal-200" onClick={()=>startConfirm(r.a)}>{r.v?'ยืนยันใหม่':'ยืนยันยอด'}</button>:'—'}</td>
      </tr>)}</tbody></table></div>
    <p className="mt-3 text-xs text-amber-200">สำคัญ: การกดยืนยันเป็นการจัดสรรรายรับที่ผู้จัดตรวจแล้ว ไม่ได้ยืนยันว่า Ledger/Stock ตรงกัน รอบที่ไม่มี Ledger หรือ Ledger ต่างต้องตรวจแยก ไม่แก้ยอดตามกันอัตโนมัติ</p>
    {selected && <div role="dialog" aria-modal="true" aria-label="ยืนยันยอดการเงิน" className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-teal-700 bg-slate-950 p-5 text-white space-y-3">
        <h4 className="font-black text-lg">ยืนยันยอดรอบ {selected.archiveDate}</h4>
        <p className="text-xs text-slate-300">รายรับ Archive {fmt(selected.totalRevenue)} ฿ | {selected.totalPlayers} คน | ต้นทุนคอร์ท {fmt(selected.venueCost??0)} ฿ | ต้นทุนลูก {fmt(selected.shuttleCost??0)} ฿</p>
        <label className="block text-sm">ค่าคอร์ทรับต่อคน (บาท)<input type="number" min="0" step="0.01" value={rate} onChange={e=>{setRate(e.target.value);if(selected){const predicted=money(selected.totalRevenue - money(selected.totalPlayers*Number(e.target.value)) - Number(otherRevenue));setShuttleRevenue(String(Math.max(0,predicted)));}}} className="mt-1 block w-full rounded border border-slate-600 bg-slate-900 p-2" /></label>
        <label className="block text-sm">รายรับลูกแบดที่ตรวจแล้ว (บาท)<input type="number" min="0" step="0.01" value={shuttleRevenue} onChange={e=>setShuttleRevenue(e.target.value)} className="mt-1 block w-full rounded border border-slate-600 bg-slate-900 p-2" /></label>
        <label className="block text-sm">รายรับอื่น / Extra (บาท)<input type="number" min="0" step="0.01" value={otherRevenue} onChange={e=>setOtherRevenue(e.target.value)} className="mt-1 block w-full rounded border border-slate-600 bg-slate-900 p-2" /></label>
        <p className="text-sm">ค่าคอร์ทรับ = {fmt(courtNumber)} ฿ | รวมแยกประเภท = {fmt(money(courtNumber+shuttleNumber+otherNumber))} ฿</p>
        {!previewOk && <p className="text-sm text-amber-300">ยอดแยกประเภทต้องรวมเท่ากับรายรับ Archive และไม่ติดลบ</p>}
        <label className="block text-sm">เหตุผล / หลักฐานที่ใช้ยืนยัน<input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="เช่น เทียบใบรับเงินและรายชื่อผู้เล่น" className="mt-1 block w-full rounded border border-slate-600 bg-slate-900 p-2" /></label>
        {message && <p role="alert" className="text-sm text-red-300">{message}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setSelected(null)} className="rounded border border-slate-600 px-4 py-2">ยกเลิก</button><button type="button" disabled={!isOrganizerMode||!previewOk||!reason.trim()||busy} onClick={submit} className="rounded bg-teal-700 px-4 py-2 disabled:opacity-40">{busy?'กำลังบันทึก...':'ยืนยันและบันทึก Firestore'}</button></div>
      </div>
    </div>}
  </section>;
}
