import React from 'react';
import { Gift, Cake, Trophy, Wallet, Settings2, LockKeyhole, Sparkles } from 'lucide-react';
import type { Player } from '../types';

interface Props { players: Player[]; ruleCount: number; onManageRules: () => void; }
export const GuanPromotionHubV511: React.FC<Props> = ({ players, ruleCount, onManageRules }) => {
  const ideas = [
    { label: 'วันเกิดสมาชิก', detail: 'เตรียมสิทธิ์พิเศษสำหรับสมาชิกในเดือนเกิด', icon: Cake, tag: 'เตรียมระบบ' },
    { label: 'Top Match', detail: 'รางวัลสำหรับสมาชิกที่ลงเล่นมากที่สุดตามช่วงเวลา', icon: Trophy, tag: 'เตรียมระบบ' },
    { label: 'Top Spender', detail: 'รางวัลตามยอดชำระที่บันทึกจริงจาก Archive', icon: Wallet, tag: 'เตรียมระบบ' },
  ];
  return <div className="gg-promo-v511 space-y-5">
    <header className="gg-promo-v511__hero"><div className="flex items-center gap-3"><div className="gg-promo-v511__hero-icon"><Gift size={24}/></div><div><div className="text-[10px] tracking-widest text-teal-300 font-bold">GUANGUAN REWARDS</div><h1 className="text-xl sm:text-2xl font-bold text-white">โปรโมชั่นและสิทธิพิเศษ</h1><p className="text-xs text-slate-400 mt-1">จัดการโปรโมชั่นที่มีอยู่ และเตรียมแคมเปญใหม่สำหรับสมาชิกก๊วน</p></div></div><button type="button" onClick={onManageRules} className="gg-promo-v511__manage"><Settings2 size={16}/> ตั้งค่าโปรโมชั่นเดิม</button></header>
    <div className="grid grid-cols-2 gap-3"><div className="gg-promo-v511__stat"><span>สมาชิกทั้งหมด</span><strong>{players.length}</strong></div><div className="gg-promo-v511__stat"><span>กฎโปรโมชั่นปัจจุบัน</span><strong>{ruleCount}</strong></div></div>
    <div><div className="flex items-center gap-2 mb-3 text-slate-100 font-bold"><Sparkles size={17} className="text-teal-300"/> ไอเดียโปรโมชั่นที่เตรียมไว้</div><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{ideas.map(({label, detail, icon: Icon,tag})=><article className="gg-promo-v511__idea" key={label}><div className="flex items-start justify-between gap-2"><span className="gg-promo-v511__idea-icon"><Icon size={21}/></span><span className="gg-promo-v511__tag">{tag}</span></div><h2 className="font-bold text-white mt-5">{label}</h2><p className="text-xs text-slate-400 leading-5 mt-1 min-h-10">{detail}</p><div className="flex items-center gap-1.5 text-xs text-slate-500 mt-4 border-t border-slate-700/60 pt-3"><LockKeyhole size={13}/> ยังไม่เปิดคำนวณหรือแจกสิทธิ์อัตโนมัติ</div></article>)}</div></div>
    <div className="gg-promo-v511__notice">โปรโมชั่นที่ใช้งานอยู่ยังจัดการได้ผ่านปุ่ม <strong>ตั้งค่าโปรโมชั่นเดิม</strong> ข้างบน ส่วน Top Match และ Top Spender จะต้องกำหนดช่วงเวลา เงื่อนไข และข้อมูลที่ใช้จัดอันดับก่อนเปิดใช้งานจริง</div>
  </div>;
};
