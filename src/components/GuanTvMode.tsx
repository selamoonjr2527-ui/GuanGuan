import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Maximize2, Minimize2, X, MapPin, Users, Radio, CircleCheck, Hourglass } from 'lucide-react';
import type { ActiveMatch, ConfirmedPreMatch, Player, SessionConfig, SessionCourt } from '../types';
import './GuanTvMode.css';

type Props = {
  sessionConfig: SessionConfig;
  players: Player[];
  activeMatches: ActiveMatch[];
  confirmedPreMatches: Array<ConfirmedPreMatch | null | undefined>;
  onClose: () => void;
};
const mins = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
};
const courtWindow = (court: SessionCourt, date: string, now: Date): 'upcoming' | 'open' | 'ended' => {
  const a = mins(court.startTime), b = mins(court.endTime);
  if (a === null || b === null) return 'open';
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if (date && date > today) return 'upcoming';
  if (date && date < today) return 'ended';
  const t = now.getHours()*60+now.getMinutes();
  if (b > a) return t < a ? 'upcoming' : t >= b ? 'ended' : 'open';
  // Overnight booking: treat early-morning tail as open only for the session date.
  return t >= a || t < b ? 'open' : 'upcoming';
};
const formatClock = (date: Date) => date.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', hour12:false});
export const GuanTvMode: React.FC<Props> = ({sessionConfig, players, activeMatches, confirmedPreMatches, onClose}) => {
  const [now,setNow] = useState(() => new Date());
  const [fullscreen,setFullscreen] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', esc);
    document.addEventListener('fullscreenchange', full);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', esc); document.removeEventListener('fullscreenchange', full); };
  }, [onClose]);
  const courts = useMemo<SessionCourt[]>(() => {
    if (sessionConfig.sessionCourts?.length) return sessionConfig.sessionCourts.filter(c => c.active !== false);
    return (sessionConfig.courtNames || []).map((name,index) => ({ id:`court-${index+1}`, name, startTime: sessionConfig.startTime, endTime: sessionConfig.endTime, hourlyRate: sessionConfig.courtHourlyRate, active:true }));
  }, [sessionConfig]);
  const byId = useMemo(() => new Map(players.map(p => [p.id, p.nickname])), [players]);
  const displayName = (id: string) => byId.get(id) || '—';
  const toggleFull = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* Fullscreen may be blocked by browser */ }
  };
  return <div className="gg-tv" role="dialog" aria-modal="true" aria-label="GuanGuan TV Mode">
    <header className="gg-tv__header">
      <div className="gg-tv__brand"><span className="gg-tv__mark">GG</span><div><strong>GUAN<span>GUAN</span></strong><small>BADMINTON CLUB</small></div></div>
      <div className="gg-tv__title"><h1>โหมดจอทีวีก๊วน</h1><span>GUANGUAN TV MODE</span></div>
      <div className="gg-tv__clock"><span><CalendarDays size={19}/>{now.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span><strong><Clock3 size={24}/>{formatClock(now)}</strong></div>
      <div className="gg-tv__actions"><button type="button" onClick={toggleFull} title="เต็มจอ" aria-label="เต็มจอ">{fullscreen?<Minimize2 size={20}/>:<Maximize2 size={20}/>}</button><button type="button" onClick={onClose} title="ออกจากโหมดจอทีวี" aria-label="ออกจากโหมดจอทีวี"><X size={22}/></button></div>
    </header>
    <main className="gg-tv__main">
      <section><div className="gg-tv__section-title"><div><Radio size={25}/><h2>LIVE <em>COURTS</em></h2><span>สถานะสนามแบบเรียลไทม์</span></div><b>LIVE</b></div>
      <div className="gg-tv__court-grid">
        {courts.map(court => {
          const match = activeMatches.find(m => m.courtId === court.id) || activeMatches.find(m => m.courtName === court.name);
          const status = courtWindow(court, sessionConfig.date, now);
          const mode = match ? 'playing' : status;
          const label = match ? 'กำลังเล่น' : status === 'open' ? 'สนามว่าง' : status === 'upcoming' ? 'ยังไม่ถึงเวลาเปิดคอร์ท' : 'หมดเวลาจอง';
          return <article key={court.id} className={`gg-tv__court gg-tv__court--${mode}`}>
            <div className="gg-tv__court-head"><div><h3>{court.name}</h3><span>{court.startTime} – {court.endTime}</span></div><span className={`gg-tv__status gg-tv__status--${mode}`}>{match?<Radio size={18}/>:status==='open'?<CircleCheck size={18}/>:<Hourglass size={18}/>} {label}</span></div>
            {match ? <div className="gg-tv__teams"><div><small>TEAM A</small><strong>{match.teamA.map(displayName).join(' / ')}</strong></div><span>VS</span><div><small>TEAM B</small><strong>{match.teamB.map(displayName).join(' / ')}</strong></div></div> : <div className="gg-tv__empty"><div className="gg-tv__court-symbol">▱</div><strong>{label}</strong><span>{status==='upcoming'?`เปิดให้เล่นเวลา ${court.startTime}`:status==='ended'?'สิ้นสุดเวลาจองแล้ว':'รอผู้เล่นลงสนาม'}</span></div>}
            {match && <div className="gg-tv__court-foot"><span>เริ่มเล่น {formatClock(new Date(match.startTime))}</span><span>เล่นมาแล้ว {Math.max(0,Math.floor((now.getTime()-match.startTime)/60000))} นาที</span></div>}
          </article>;
        })}
        {!courts.length && <div className="gg-tv__no-data">ยังไม่มีข้อมูลคอร์ทที่เปิดใช้งาน</div>}
      </div></section>
      <section className="gg-tv__queue-section"><div className="gg-tv__section-title"><div><Users size={25}/><h2>NEXT UP <em>/ PRE-MATCH</em></h2><span>คิวที่ยืนยันแล้ว</span></div></div>
      <div className="gg-tv__queue-grid">
        {confirmedPreMatches.filter((pm): pm is ConfirmedPreMatch => Boolean(pm && pm.confirmedAt > 0)).sort((a,b)=>a.confirmedAt-b.confirmedAt).map((pm,index) => <article key={pm.id} className="gg-tv__queue">
          <div className="gg-tv__queue-head"><b>{index+1}</b><div><strong>Pre-Match #{pm.slotNumber || index+1}</strong><span>{pm.targetCourtName ? `เป้าหมาย: ${pm.targetCourtName}` : 'รอคอร์ทว่างตามลำดับคิว'}</span></div></div>
          <div className="gg-tv__queue-teams"><span>{pm.teamA.map(displayName).join(' / ')}</span><b>VS</b><span>{pm.teamB.map(displayName).join(' / ')}</span></div>
        </article>)}
        {!confirmedPreMatches.some(pm=>pm && pm.confirmedAt > 0) && <div className="gg-tv__no-data gg-tv__no-data--queue">ยังไม่มี Pre-Match ที่ยืนยัน</div>}
      </div></section>
    </main>
    <footer className="gg-tv__footer"><span><MapPin size={20}/>{sessionConfig.venueName || 'GuanGuan Badminton Club'}</span><span>FOR GUANGUAN CLUB USE ONLY</span></footer>
  </div>;
};
