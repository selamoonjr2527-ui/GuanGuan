import React, { useMemo, useState } from 'react';
import { Award, Gift, Megaphone, Plus, Trash2, Trophy, Wallet } from 'lucide-react';
import type { Player, DailySessionArchive } from '../types';

export type GgRewardPeriodV512 = 'month' | 'year' | 'all';
export type GgAnnouncementV512 = {
  id: string;
  title: string;
  message: string;
  audience: 'all' | 'member' | 'birthday';
  memberId?: string;
  startDate: string;
  endDate: string;
  enabled: boolean;
};
export type GgPromotionSettingsV512 = {
  period: GgRewardPeriodV512;
  topMatchReward: string;
  topSpenderReward: string;
  announcements: GgAnnouncementV512[];
};
export const GG_PROMO_DEFAULTS_V512: GgPromotionSettingsV512 = {
  period: 'year', topMatchReward: 'ฟรีค่าคอร์ท 1 ครั้ง',
  topSpenderReward: 'ส่วนลด 50 บาท', announcements: [],
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-teal-500';

interface Props {
  players: Player[];
  archives: DailySessionArchive[];
  settings: GgPromotionSettingsV512;
  onChange: (next: GgPromotionSettingsV512) => void;
  onManageRules: () => void;
  ruleCount: number;
  memberBirthdays: Record<string,string>;
}
export const GuanPromotionHubV512: React.FC<Props> = ({ players, archives, settings, onChange, onManageRules, ruleCount, memberBirthdays }) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<GgAnnouncementV512['audience']>('all');
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(todayLocal);
  const [endDate, setEndDate] = useState(todayLocal);
  const [notice, setNotice] = useState('');
  const set = (patch: Partial<GgPromotionSettingsV512>) => onChange({...settings,...patch});
  // Default older saved settings to an annual view when the user explicitly chooses it.
  const [selectedYear, setSelectedYear] = useState(() => todayLocal().slice(0, 4));
  const years = useMemo(() => [...new Set([
    todayLocal().slice(0, 4),
    ...archives.map(a => String(a.archiveDate || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y))
  ])].sort((a, b) => b.localeCompare(a)), [archives]);
  const result = useMemo(() => {
    const now = todayLocal();
    const archivedByDate = new Map<string,DailySessionArchive>();
    [...archives].sort((a,b) => (a.savedAt||0)-(b.savedAt||0)).forEach(a => archivedByDate.set(a.archiveDate,a));
    const chosen = [...archivedByDate.values()].filter(a =>
      settings.period === 'all' || (settings.period === 'month' ? a.archiveDate.slice(0,7) === now.slice(0,7) : a.archiveDate.slice(0,4) === selectedYear)
    );
    const missingPlayerDetails = chosen.filter(a => !Array.isArray(a.playersSnapshot) || a.playersSnapshot.length === 0);
    // GG_TOP_SPENDER_AUDIT_V522: show paid coverage per closed Archive, never estimate cash from charges.
    const sessionCoverage = chosen.map(a => {
      const snaps = Array.isArray(a.playersSnapshot) ? a.playersSnapshot : [];
      const paid = snaps.filter(p => typeof p.paidAmount === 'number' && Number.isFinite(p.paidAmount) && p.paidAmount >= 0);
      return {
        id: a.id, day: a.archiveDate, members: a.totalPlayers,
        snapshots: snaps.length, recorded: paid.length,
        missing: snaps.length - paid.length,
        paidTotal: paid.reduce((sum, p) => sum + Math.max(0, p.paidAmount ?? 0), 0),
        collected: typeof a.totalCollected === 'number' ? a.totalCollected : null,
      };
    }).sort((a,b) => a.day.localeCompare(b.day));
    const table = new Map<string,{id:string;name:string;matches:number;spent:number;perDay:Record<string,number>}>();
    for (const archive of chosen) {
      for (const snapshot of archive.playersSnapshot || []) {
        const id = snapshot.id;
        if (!id) continue;
        const prior = table.get(id) || {id,name:snapshot.nickname || id,matches:0,spent:0,perDay:{}};
        prior.matches += Math.max(0,Number(snapshot.matchesPlayed||0));
        // Only confirmed paid amounts are eligible for spender ranking.
        if (typeof snapshot.paidAmount === 'number' && Number.isFinite(snapshot.paidAmount) && snapshot.paidAmount > 0) {
          // Partial payments count; a paid=false flag alone does not erase real payments.
          prior.spent += snapshot.paidAmount;
          prior.perDay[archive.archiveDate] = (prior.perDay[archive.archiveDate] || 0) + snapshot.paidAmount;
        }
        table.set(id,prior);
      }
    }
    const values=[...table.values()];
    return {topMatch:values.filter(x=>x.matches>0).sort((a,b)=>b.matches-a.matches).slice(0,5),topSpender:values.filter(x=>x.spent>0).sort((a,b)=>b.spent-a.spent).slice(0,5), archivedSessions:chosen.length, missingPlayerDetails:missingPlayerDetails.map(a => a.archiveDate), sessionCoverage};
  },[archives,settings.period,selectedYear]);
  const today = todayLocal();
  const birthdaysToday = players.filter(p=>{const date=memberBirthdays[p.id];return date && date.slice(5)===today.slice(5)});
  const add = () => {
    if(!title.trim() || !message.trim()) {setNotice('กรุณากรอกหัวข้อและข้อความ');return;}
    if(audience==='member' && !memberId) {setNotice('กรุณาเลือกสมาชิก');return;}
    if(!startDate || !endDate || endDate<startDate) {setNotice('ช่วงวันที่ไม่ถูกต้อง');return;}
    const item:GgAnnouncementV512={id:`announce-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title:title.trim(),message:message.trim(),audience,memberId:audience==='member'?memberId:undefined,startDate,endDate,enabled:true};
    set({announcements:[item,...settings.announcements]});setTitle('');setMessage('');setNotice('บันทึกประกาศแล้ว');
  };
  return <div className="gg-v512 space-y-5 text-slate-100">
    <div className="gg-v512-panel flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div><div className="text-[10px] font-bold tracking-widest text-teal-300">GUANGUAN REWARDS & ANNOUNCEMENTS</div><h1 className="text-2xl font-extrabold mt-1">โปรโมชั่นและประกาศสมาชิก</h1><p className="text-xs text-slate-400 mt-1">ดูอันดับจาก Archive ที่บันทึกแล้ว · ส่งข้อความต้อนรับหลังสมาชิกล็อกอิน</p></div>
      <button type="button" onClick={onManageRules} className="gg-v512-primary"><Gift size={16}/> ตั้งค่าโปรโมชั่นเดิม ({ruleCount})</button>
    </div>
    <div className="gg-v512-panel space-y-4">
      <div className="flex flex-wrap justify-between gap-3 items-center"><h2 className="gg-v512-heading"><Trophy size={18}/> อันดับสมาชิก</h2><select className={inputClass+' !w-auto'} value={settings.period} onChange={e=>set({period:e.target.value as GgRewardPeriodV512})}><option value="month">เดือนนี้</option><option value="year">ปีนี้</option><option value="all">ตลอดกาล</option></select>{settings.period === 'year' && <select aria-label="เลือกปีสำหรับอันดับสมาชิก" className={inputClass+' !w-auto'} value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>{years.map(year=><option key={year} value={year}>ปี {year}</option>)}</select>}</div>
      <div className="text-xs text-slate-400">ใช้เฉพาะ {result.archivedSessions} รอบที่ Save เป็น Archive แล้ว · Top Spender นับเฉพาะยอด Paid ที่มีตัวเลขจริง</div>
      {result.missingPlayerDetails.length > 0 && <div className="rounded-xl border border-amber-700/60 bg-amber-950/25 px-3 py-2 text-xs leading-5 text-amber-200" role="status">อันดับ Top Spender อาจไม่ครบ: {result.missingPlayerDetails.length} รอบในช่วงที่เลือกไม่มีข้อมูลชำระเงินรายคนใน Archive ({result.missingPlayerDetails.join(', ')}). ไม่สามารถนำยอดรวมของรอบมาแจกแจงเป็นยอดสมาชิกได้</div>}
      {/* GG_TOP_SPENDER_AUDIT_V522: ledger coverage explains why an annual total may look like one session. */}
      <details className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-200">
        <summary className="cursor-pointer font-bold text-teal-300">ตรวจสอบยอด Top Spender รายรอบ ({result.sessionCoverage.length} รอบ)</summary>
        <p className="mt-2 text-slate-400">ยอดจ่ายจริงจาก paidAmount ใน Archive เท่านั้น · ไม่ใช้ยอดเรียกเก็บหรือรายรับรวมมาประมาณยอดรายคน</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-[550px] w-full text-left"><thead className="text-slate-400"><tr><th className="py-2">วันที่</th><th>สมาชิกใน Archive</th><th>มี Snapshot</th><th>มี paidAmount</th><th>ยอดจ่ายรายคนรวม</th><th>ยอดรับรวม Archive</th></tr></thead><tbody>
          {result.sessionCoverage.map(r => <tr key={r.id} className="border-t border-slate-800"><td className="py-2">{r.day}</td><td>{r.members}</td><td>{r.snapshots}</td><td className={r.recorded < r.members ? 'text-amber-300' : 'text-emerald-300'}>{r.recorded}/{r.members}</td><td>{r.paidTotal.toLocaleString('th-TH')} ฿</td><td>{r.collected === null ? 'ไม่ระบุ' : `${r.collected.toLocaleString('th-TH')} ฿`}</td></tr>)}
        </tbody></table></div>
        {result.sessionCoverage.some(r=> r.recorded < r.members || (r.collected !== null && Math.abs(r.paidTotal-r.collected) > 0.01)) && <p className="mt-2 text-amber-300">ข้อมูลรายคนยังไม่ครบหรือไม่ตรงกับยอดรับรวม: อันดับอาจต่ำกว่าความจริง ต้องแก้ข้อมูลชำระรายคนที่ต้นทาง ไม่ใช่เปลี่ยนสูตรเป็นยอดเรียกเก็บ</p>}
        <p className="mt-3 font-bold text-slate-200">รายละเอียดผู้จ่าย Top 5 (แยกตามวันที่)</p>
        {result.topSpender.map(p => <div key={p.id} className="mt-2 rounded-lg border border-slate-800 px-3 py-2"><span className="font-semibold">{p.name} — {p.spent.toLocaleString('th-TH')} ฿</span><div className="mt-1 text-slate-400">{Object.entries(p.perDay).sort(([a],[b])=>a.localeCompare(b)).map(([day,amount])=>`${day}: ${amount.toLocaleString('th-TH')} ฿`).join(' · ') || 'ไม่พบรายการจ่าย'}</div></div>)}
      </details>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {([{label:'Top Match',icon:Trophy,list:result.topMatch,field:'matches',reward:settings.topMatchReward,key:'topMatchReward'},{label:'Top Spender',icon:Wallet,list:result.topSpender,field:'spent',reward:settings.topSpenderReward,key:'topSpenderReward'}] as const).map(group=><div key={group.label} className="gg-v512-subpanel space-y-3"><h3 className="gg-v512-heading"><group.icon size={17}/>{group.label}</h3>{group.list.length?group.list.map((x,i)=><div key={x.id} className="gg-v512-rank"><span className="text-teal-300 font-bold">#{i+1}</span><span className="flex-1 font-semibold truncate">{x.name}</span><b>{group.field==='matches'?`${x.matches} Match`:`${x.spent.toLocaleString()} ฿`}</b></div>):<p className="text-xs text-slate-500">ยังไม่มีข้อมูลย้อนหลังสำหรับจัดอันดับ</p>}<label className="text-xs text-slate-400 block">รางวัลที่วางแผนไว้ (ยังไม่แจกอัตโนมัติ)</label><input className={inputClass} value={group.reward} onChange={e=>set({[group.key]:e.target.value})}/></div>)}
      </div>
      <p className="text-xs text-amber-300">รางวัล Top Match / Top Spender เป็นการวางแผนเท่านั้น ยังไม่ปรับยอด Billing หรือเพิ่มสิทธิ์โปรโมชั่นโดยอัตโนมัติ</p>
    </div>
    <div className="gg-v512-panel space-y-4">
      <div><h2 className="gg-v512-heading"><Megaphone size={19}/> ประกาศ Popup หลัง Login</h2><p className="text-xs text-slate-400 mt-1">สมาชิกแต่ละคนเห็นประกาศที่ตรงเงื่อนไขเพียงครั้งเดียวต่อการเปิดแอป/ล็อกอินหนึ่งครั้ง</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label className="gg-v512-label">หัวข้อประกาศ</label><input value={title} onChange={e=>setTitle(e.target.value)} className={inputClass} placeholder="เช่น สุขสันต์วันเกิด!"/></div><div><label className="gg-v512-label">ส่งให้ใคร</label><select value={audience} onChange={e=>setAudience(e.target.value as GgAnnouncementV512['audience'])} className={inputClass}><option value="all">สมาชิกทุกคน</option><option value="member">สมาชิกที่เลือก</option><option value="birthday">สมาชิกที่เกิดวันนี้</option></select></div></div>
      {audience==='member'&&<div><label className="gg-v512-label">เลือกสมาชิก</label><select className={inputClass} value={memberId} onChange={e=>setMemberId(e.target.value)}><option value="">-- เลือกสมาชิก --</option>{players.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}</select></div>}
      {audience==='birthday'&&<div className="text-xs text-teal-200">วันนี้ตรงกับวันเกิด {birthdaysToday.length} คน ({birthdaysToday.map(p=>p.nickname).join(', ')||'ยังไม่มี'}) · อ้างอิงวันเกิดจาก Member Center</div>}
      <div><label className="gg-v512-label">ข้อความที่จะแสดง</label><textarea rows={3} className={inputClass} value={message} onChange={e=>setMessage(e.target.value)} placeholder="เช่น วันนี้ผู้จัดมีขนมและเครื่องดื่มแจกฟรี!"/></div>
      <div className="grid grid-cols-2 gap-3"><label className="gg-v512-label">เริ่มแสดง<input type="date" className={inputClass+' mt-1'} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label className="gg-v512-label">สิ้นสุด<input type="date" className={inputClass+' mt-1'} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></div>
      <div className="flex items-center gap-3"><button type="button" onClick={add} className="gg-v512-primary"><Plus size={16}/> เพิ่มประกาศ</button>{notice&&<span className="text-xs text-teal-300">{notice}</span>}</div>
      <div className="space-y-2">{settings.announcements.map(a=><article className="gg-v512-rank !items-start" key={a.id}><Megaphone size={16} className="text-teal-300 mt-1 shrink-0"/><div className="flex-1 min-w-0"><div className="font-bold">{a.title}</div><p className="text-xs text-slate-300 whitespace-pre-wrap mt-1">{a.message}</p><div className="text-[11px] text-slate-500 mt-2">{a.audience==='all'?'ทุกคน':a.audience==='birthday'?'วันเกิดวันนี้':players.find(p=>p.id===a.memberId)?.nickname||'ไม่พบสมาชิก'} · {a.startDate} ถึง {a.endDate}</div></div><div className="flex gap-2 shrink-0"><button type="button" onClick={()=>set({announcements:settings.announcements.map(x=>x.id===a.id?{...x,enabled:!x.enabled}:x)})} className={a.enabled?'gg-v512-active':'gg-v512-muted'}>{a.enabled?'เปิด':'ปิด'}</button><button type="button" title="ลบประกาศ" onClick={()=>{if(window.confirm(`ลบประกาศ ${a.title}?`))set({announcements:settings.announcements.filter(x=>x.id!==a.id)})}} className="gg-v512-muted"><Trash2 size={15}/></button></div></article>)}{settings.announcements.length===0&&<p className="text-sm text-slate-500">ยังไม่มีประกาศสำหรับสมาชิก</p>}</div>
    </div>
    <div className="gg-v512-panel text-xs text-slate-400 flex gap-2"><Award size={16} className="text-teal-300 shrink-0"/>ข้อความส่วนลดเป็นการแจ้งสิทธิ์เท่านั้น ไม่ใช่การใช้สิทธิ์หรือปรับยอดชำระเงิน การใช้ส่วนลดจริงต้องผ่านระบบโปรโมชั่น/Billing เดิม</div>
  </div>;
};

export const GuanMemberAnnouncementV512:React.FC<{settings:GgPromotionSettingsV512;memberId:string;memberBirthdays:Record<string,string>}> = ({settings,memberId,memberBirthdays}) => {
  const today=todayLocal();
  const announcements=(settings.announcements||[]).filter(a=>a.enabled&&a.startDate<=today&&a.endDate>=today&&(a.audience==='all'||(a.audience==='member'&&a.memberId===memberId)||(a.audience==='birthday'&&memberBirthdays[memberId]?.slice(5)===today.slice(5))));
  const [dismissed,setDismissed]=useState<string[]>([]);
  const [current,setCurrent]=useState(0);
  const selected=announcements.filter(a=>!dismissed.includes(a.id)&&!wasSeen(a.id,memberId))[current] || announcements.find(a=>!dismissed.includes(a.id)&&!wasSeen(a.id,memberId));
  if(!memberId||!selected)return null;
  const close=()=>{const key=seenKey(selected.id,memberId);try{sessionStorage.setItem(key,'1')}catch{} setDismissed(p=>[...p,selected.id]);setCurrent(0)};
  return <div className="fixed inset-0 z-[19000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="gg-announce-title" className="gg-v512-dialog w-full max-w-md space-y-4"><div className="text-teal-300 flex items-center gap-2 text-xs font-bold tracking-wide"><Gift size={17}/> GUANGUAN CLUB</div><h2 id="gg-announce-title" className="text-xl font-bold text-white">{selected.title}</h2><p className="text-slate-200 leading-7 whitespace-pre-wrap text-sm">{selected.message}</p><button type="button" autoFocus onClick={close} className="gg-v512-primary w-full justify-center">รับทราบ</button></div></div>;
};
const seenKey=(id:string,memberId:string)=>`guanguan_announcement_seen_v512:${memberId}:${id}`;
const wasSeen=(id:string,memberId:string)=>{try{return sessionStorage.getItem(seenKey(id,memberId))==='1'}catch{return false}};
