import React from 'react';
import { Activity, CalendarDays, Clock3, Trophy, Users, Wallet, ShieldCheck, UserRound, BadgeCheck } from 'lucide-react';
import type { Player, ActiveMatch, MatchHistoryItem, SessionConfig } from '../types';

type Lifetime = {totalSessions?: number;totalMatches?: number;totalGames?: number};
interface Props {
  mode: 'organizer' | 'member';
  isOrganizerMode: boolean;
  currentMemberId: string;
  players: Player[];
  activeMatches: ActiveMatch[];
  matchHistory: MatchHistoryItem[];
  sessionConfig: SessionConfig;
  memberStats: Record<string, Lifetime>;
}
const Tile: React.FC<{label:string;value:string|number;subtitle?:string;icon:React.ReactNode}> = ({label,value,subtitle,icon}) => (
  <div className="gg-v59-stat-tile"><div className="gg-v59-stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong>{subtitle && <small>{subtitle}</small>}</div></div>
);
export const GuanStatsHubV59: React.FC<Props> = ({mode,isOrganizerMode,currentMemberId,players,activeMatches,matchHistory,sessionConfig,memberStats}) => {
  const member = players.find(p=>p.id===currentMemberId);
  const participating = players.filter(p=>p.todayRoster || p.isCheckedIn || (p.matchesPlayed||0)>0 || p.paid);
  const checked = players.filter(p=>p.isCheckedIn);
  const waiting = checked.filter(p=>p.status==='waiting');
  const completed = matchHistory.length;
  const courtCount = sessionConfig.sessionCourts?.filter(c=>c.bookingStatus!=='cancelled').length || sessionConfig.courtNames.length;
  if (mode==='organizer' && !isOrganizerMode) return <div className="gg-v59-stats-empty">เฉพาะผู้จัดก๊วนเท่านั้น</div>;
  if (mode==='member' && !member) return <div className="gg-v59-stats-empty">กรุณาเข้าสู่ระบบด้วยชื่อสมาชิก เพื่อดูสถิติส่วนตัว</div>;
  const ownHistory = member ? matchHistory.filter(h => {
    const x = h as MatchHistoryItem & {participantIds?:string[];teamAPlayerIds?:string[];teamBPlayerIds?:string[]};
    if (Array.isArray(x.participantIds)) return x.participantIds.includes(member.id);
    if (Array.isArray(x.teamAPlayerIds) || Array.isArray(x.teamBPlayerIds)) return [...(x.teamAPlayerIds||[]),...(x.teamBPlayerIds||[])].includes(member.id);
    return false; // No guessing based on duplicate nicknames
  }):[];
  const lifetime = member ? memberStats[member.id] : undefined;
  return <section className="gg-v59-stats">
    <header className="gg-v59-stats-hero">
      <div className="gg-v59-hero-icon">{mode==='organizer'?<ShieldCheck size={24}/>:<UserRound size={24}/>}</div>
      <div><small>GUANGUAN / {mode==='organizer'?'ORGANIZER ANALYTICS':'MY PLAY HISTORY'}</small><h1>{mode==='organizer'?'สถิติผู้จัด':'สถิติของฉัน'}</h1><p>{mode==='organizer'?'ภาพรวมการเข้าร่วมและการเล่นของก๊วน':'ข้อมูลการเล่นเฉพาะสมาชิกที่เข้าสู่ระบบ'}</p></div>
    </header>
    {mode==='organizer' ? <>
      <div className="gg-v59-stat-grid">
        <Tile icon={<Users/>} label="ลงชื่อวันนี้" value={participating.length} subtitle="สมาชิกในรอบนี้"/>
        <Tile icon={<BadgeCheck/>} label="เช็กอินแล้ว" value={checked.length} subtitle={`รอคิว ${waiting.length} คน`}/>
        <Tile icon={<Activity/>} label="แมตช์กำลังเล่น" value={activeMatches.length} subtitle={`${activeMatches.length*4} ตำแหน่งผู้เล่น`}/>
        <Tile icon={<Trophy/>} label="แมตช์จบแล้ว" value={completed} subtitle="จาก Match History รอบนี้"/>
      </div>
      <div className="gg-v59-stats-panel"><h2>ผู้เล่นประจำรอบนี้</h2><p>เรียงจากจำนวนแมตช์ที่บันทึกแล้ว ไม่รวมแมตช์ที่กำลังแข่งขัน</p>
        {participating.length ? <div className="gg-v59-rank-list">{[...participating].sort((a,b)=>(b.matchesPlayed||0)-(a.matchesPlayed||0)).slice(0,12).map((p,i)=><div key={p.id}><span className="gg-v59-rank">{String(i+1).padStart(2,'0')}</span><b>{p.nickname}</b><small>{p.isCheckedIn ? 'เช็กอินแล้ว':'ยังไม่เช็กอิน'}</small><strong>{p.matchesPlayed||0} Match</strong></div>)}</div>:<div className="gg-v59-none">ยังไม่มีสมาชิกสำหรับรอบนี้</div>}
      </div>
      <div className="gg-v59-stats-footer"><CalendarDays size={16}/> {sessionConfig.date} <span>·</span> {courtCount} คอร์ท <span>·</span> ดูรายรับและต้นทุนได้ที่เมนู “สรุปเงิน”</div>
    </> : <>
      <div className="gg-v59-member-identity"><div className="gg-v59-member-avatar">{member!.nickname.slice(0,1)}</div><div><h2>{member!.nickname}</h2><p>ระดับมือ {member!.skillLevel} · {member!.isCheckedIn?'เช็กอินวันนี้แล้ว':'ยังไม่ได้เช็กอินวันนี้'}</p></div></div>
      <div className="gg-v59-stat-grid">
        <Tile icon={<CalendarDays/>} label="เข้าร่วมสะสม" value={lifetime?.totalSessions ?? '—'} subtitle="รอบที่บันทึกในระบบ"/>
        <Tile icon={<Trophy/>} label="แมตช์สะสม" value={lifetime?.totalMatches ?? '—'} subtitle="สถิติสะสมที่บันทึกไว้"/>
        <Tile icon={<Activity/>} label="แมตช์วันนี้" value={member!.matchesPlayed||0} subtitle="รวมแมตช์จบแล้ว"/>
        <Tile icon={<Clock3/>} label="สถานะวันนี้" value={member!.isCheckedIn ? (member!.status==='playing'?'กำลังเล่น':member!.status==='resting'?'พัก':'รอคิว'):'ยังไม่มา'} subtitle="อัปเดตตาม Session"/>
      </div>
      <div className="gg-v59-stats-panel"><h2>แมตช์ที่จบแล้วในรอบนี้</h2><p>แสดงเฉพาะแมตช์ที่มี Player ID ยืนยันได้ ไม่คาดเดาจากชื่อเล่น</p>
        {ownHistory.length ? <div className="gg-v59-rank-list">{ownHistory.slice(0,12).map(h=><div key={h.id}><span className="gg-v59-rank">{h.courtName}</span><b>{h.teamANames.join(' + ')} vs {h.teamBNames.join(' + ')}</b><strong>{h.durationMinutes} นาที</strong></div>)}</div>:<div className="gg-v59-none">ยังไม่มีประวัติแมตช์ของคุณในรอบนี้</div>}
      </div>
      <div className="gg-v59-stats-footer"><Wallet size={16}/> ยอดที่ต้องชำระให้ตรวจที่เมนู “คิดเงิน” <span>·</span> ไม่แสดงข้อมูลการเงินของก๊วน</div>
    </>}
  </section>;
};
