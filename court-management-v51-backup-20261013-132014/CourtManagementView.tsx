import React, { useMemo, useState } from 'react';
import { CalendarClock, Plus, Clock3, Wallet, History, Save, Info } from 'lucide-react';
import type { ActiveMatch, SessionConfig, SessionCourt, CourtExtension } from '../types';

type Props = {
  config: SessionConfig;
  activeMatches: ActiveMatch[];
  onChange: (next: SessionConfig) => void;
};
const minutes = (time: string): number | null => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const duration = (start: string, end: string): number => {
  const a = minutes(start), b = minutes(end);
  if (a === null || b === null) return 0;
  return (b - a + 1440) % 1440;
};
const validPeriod = (start: string, end: string) => minutes(start) !== null && minutes(end) !== null && start !== end;
const money = (amount: number) => amount.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const makeCourtId = (list: SessionCourt[]): string => {
  const values = list.map(c => Number(/^court-(\d+)$/.exec(c.id)?.[1] || 0));
  return `court-${Math.max(list.length, ...values, 0) + 1}`;
};
const getCourts = (config: SessionConfig): SessionCourt[] =>
  config.sessionCourts?.length ? config.sessionCourts : (config.courtNames || []).map((name, index) => ({
    id: `court-${index + 1}`, name, startTime: config.startTime, endTime: config.endTime,
    hourlyRate: config.courtHourlyRate, active: true,
  }));
const courtCost = (court: SessionCourt): number => {
  const extensions = court.extensions || [];
  const originalEnd = extensions[0]?.previousEndTime || court.endTime;
  const base = duration(court.startTime, originalEnd) / 60 * court.hourlyRate;
  return base + extensions.reduce((sum, x) => sum + x.addedCost, 0);
};

export const CourtManagementView: React.FC<Props> = ({ config, activeMatches, onChange }) => {
  const courts = useMemo(() => getCourts(config), [config]);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('20:00');
  const [newEnd, setNewEnd] = useState('22:00');
  const [newRate, setNewRate] = useState(String(config.courtHourlyRate || 0));
  const [extensionHours, setExtensionHours] = useState<Record<string, string>>({});
  const [extensionRate, setExtensionRate] = useState<Record<string, string>>({});

  const persist = (updated: SessionCourt[]) => onChange({
    ...config, sessionCourts: updated, courtNames: updated.map(c => c.name), courtCount: updated.length,
  });
  const updateCourt = (court: SessionCourt, values: Partial<SessionCourt>) => {
    const next = { ...court, ...values };
    if ((values.startTime || values.endTime) && !validPeriod(next.startTime, next.endTime)) return;
    if (next.hourlyRate < 0 || !Number.isFinite(next.hourlyRate)) return;
    persist(courts.map(item => item.id === court.id ? next : item));
  };
  const addCourt = () => {
    const name = newName.trim();
    const rate = Number(newRate);
    if (!name || courts.some(c => c.name.toLowerCase() === name.toLowerCase())) { window.alert('กรุณาระบุชื่อคอร์ทที่ไม่ซ้ำกัน'); return; }
    if (!validPeriod(newStart, newEnd) || !Number.isFinite(rate) || rate < 0) { window.alert('เวลา หรือค่าเช่าไม่ถูกต้อง'); return; }
    persist([...courts, { id: makeCourtId(courts), name, startTime: newStart, endTime: newEnd, hourlyRate: rate, active: true }]);
    setNewName('');
  };
  const addExtension = (court: SessionCourt) => {
    const hours = Number(extensionHours[court.id] || 1);
    const rate = Number(extensionRate[court.id] ?? court.hourlyRate);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 12 || !Number.isInteger(hours * 2) || !Number.isFinite(rate) || rate < 0) {
      window.alert('เพิ่มเวลาได้ครั้งละ 0.5 ชั่วโมง ถึง 12 ชั่วโมง และค่าเช่าต้องไม่ติดลบ'); return;
    }
    const start = minutes(court.endTime);
    if (start === null) return;
    const nextTime = (start + Math.round(hours * 60)) % 1440;
    const endTime = `${String(Math.floor(nextTime / 60)).padStart(2, '0')}:${String(nextTime % 60).padStart(2, '0')}`;
    const newExtension: CourtExtension = {
      id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      previousEndTime: court.endTime, newEndTime: endTime, minutesAdded: hours * 60,
      hourlyRate: rate, addedCost: hours * rate, createdAt: Date.now(),
    };
    if (!window.confirm(`ยืนยันซื้อชั่วโมงเพิ่มให้ ${court.name}\n${court.endTime} → ${endTime}\nค่าใช้จ่ายเพิ่ม ${money(newExtension.addedCost)} บาท?`)) return;
    updateCourt(court, { endTime, extensions: [...(court.extensions || []), newExtension] });
  };
  const totalCost = courts.reduce((sum, court) => sum + courtCost(court), 0);
  return (
    <section className="gg-court-manage space-y-5 text-slate-100" aria-label="จัดการเวลาจองคอร์ทก๊วนกวน">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
        <div><div className="flex items-center gap-2 text-xl font-bold"><CalendarClock size={22} /> จัดการคอร์ทก๊วนกวน</div>
          <p className="mt-1 text-xs text-slate-400">เพิ่มคอร์ท กำหนดเวลาและค่าเช่าแยกกัน บันทึกการซื้อชั่วโมงเพิ่ม</p></div>
        <div className="rounded-xl border border-slate-600 bg-slate-950 px-4 py-2"><div className="text-xs text-slate-400">ประมาณการค่าเช่าทั้งหมด</div><div className="text-xl font-bold">{money(totalCost)} บาท</div></div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {courts.map(court => {
          const occupied = activeMatches.some(m => m.courtId === court.id);
          const lockedTime = (court.extensions || []).length > 0;
          return <article key={court.id} className="rounded-2xl border border-slate-700 bg-[#171D24] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3"><div className="font-bold text-lg">{court.name}</div>
              <span className="text-xs text-slate-400">{occupied ? 'มีผู้เล่นกำลังแข่ง' : 'ไม่มีแมตช์กำลังแข่ง'}</span></div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">เวลาเริ่ม<input type="time" value={court.startTime} disabled={lockedTime || occupied} onChange={e => updateCourt(court, {startTime:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white disabled:opacity-50" /></label>
              <label className="text-xs text-slate-400">เวลาสิ้นสุด<input type="time" value={court.endTime} disabled={lockedTime || occupied} onChange={e => updateCourt(court, {endTime:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white disabled:opacity-50" /></label>
              <label className="text-xs text-slate-400">ค่าเช่าเดิม (บาท/ชม.)<input type="number" min="0" value={court.hourlyRate} disabled={lockedTime} onChange={e => updateCourt(court, {hourlyRate:Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white disabled:opacity-50" /></label>
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-2"><span className="text-xs text-slate-400">ต้นทุนคอร์ท</span><div className="mt-1 font-bold">{money(courtCost(court))} บาท</div></div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock3 size={16}/> ซื้อเวลาเพิ่ม</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-400">ชั่วโมงที่เพิ่ม<select value={extensionHours[court.id] || '1'} onChange={e=>setExtensionHours(p=>({...p,[court.id]:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-white"><option value="0.5">0.5</option><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option><option value="3">3</option></select></label>
                <label className="text-xs text-slate-400">ราคาชั่วโมงเพิ่ม<input type="number" min="0" placeholder={String(court.hourlyRate)} value={extensionRate[court.id] ?? ''} onChange={e=>setExtensionRate(p=>({...p,[court.id]:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-white" /></label>
              </div>
              <button type="button" onClick={() => addExtension(court)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-teal-600/50 bg-teal-900/30 px-3 py-2 text-sm font-bold text-teal-100 hover:bg-teal-900/50"><Plus size={16}/> ซื้อชั่วโมงเพิ่ม</button>
              {(court.extensions || []).length > 0 && <div className="mt-3 space-y-2 border-t border-slate-700 pt-3"><div className="flex items-center gap-2 text-xs text-slate-400"><History size={13}/> ประวัติซื้อเพิ่ม</div>{court.extensions!.map(x=><div key={x.id} className="flex justify-between text-xs text-slate-300"><span>{x.previousEndTime} → {x.newEndTime} (+{x.minutesAdded/60} ชม.)</span><span>{money(x.addedCost)} บาท</span></div>)}</div>}
            </div>
            {lockedTime && <div className="mt-2 text-xs text-slate-500">มีประวัติซื้อเพิ่มแล้ว จึงล็อกเวลาจองเดิมเพื่อรักษาต้นทุนย้อนหลัง</div>}
          </article>;
        })}
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-900/75 p-5">
        <div className="mb-3 flex items-center gap-2 font-semibold"><Plus size={18}/> เพิ่มคอร์ทใหม่ระหว่างวัน</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="text-xs text-slate-400">ชื่อคอร์ท<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="เช่น N3" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white"/></label>
          <label className="text-xs text-slate-400">เริ่ม<input type="time" value={newStart} onChange={e=>setNewStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white"/></label>
          <label className="text-xs text-slate-400">สิ้นสุด<input type="time" value={newEnd} onChange={e=>setNewEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white"/></label>
          <label className="text-xs text-slate-400">บาท/ชม.<input type="number" min="0" value={newRate} onChange={e=>setNewRate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white"/></label>
        </div>
        <button type="button" onClick={addCourt} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-white"><Save size={15}/> บันทึกคอร์ทใหม่</button>
      </div>
      <div className="flex items-start gap-2 text-xs leading-5 text-amber-200/80"><Info size={17} className="shrink-0"/><span>เวอร์ชัน Foundation: ต้นทุนนี้เป็นประมาณการแยกคอร์ท ยังไม่รวมเข้ากับสูตร Finance หรือ Billing อัตโนมัติ และการปิดคอร์ทตามเวลาจองยังไม่ได้บังคับใช้กับการเริ่มแมตช์</span></div>
    </section>
  );
};
