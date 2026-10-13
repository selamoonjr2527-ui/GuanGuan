import React from 'react';
import { CalendarDays, Clock3, MapPin, Users, Activity, Waves, LayoutGrid } from 'lucide-react';
import type { ActiveMatch, ConfirmedPreMatch, Player, SessionConfig } from '../types';

type GuanDashboardProps = {
  sessionConfig: SessionConfig;
  players: Player[];
  activeMatches: ActiveMatch[];
  currentMemberId: string | null;
  isOrganizerMode: boolean;
  confirmedPreMatch?: ConfirmedPreMatch | null;
  confirmedPreMatch2?: ConfirmedPreMatch | null;
};

const playerStatus: Record<Player['status'], string> = {
  waiting: 'พร้อมเล่น',
  playing: 'กำลังเล่น',
  resting: 'กำลังพัก',
  left: 'กลับแล้ว',
};

export const GuanDashboard: React.FC<GuanDashboardProps> = ({
  sessionConfig,
  players,
  activeMatches,
  currentMemberId,
  isOrganizerMode,
  confirmedPreMatch,
  confirmedPreMatch2,
}) => {
  const checkedIn = players.filter((p) => p.isCheckedIn && p.status !== 'left');
  const playingIds = new Set(activeMatches.flatMap((m) => [...m.teamA, ...m.teamB]));
  const waitingPlayers = checkedIn.filter((p) => p.status === 'waiting' && !playingIds.has(p.id));
  const me = !isOrganizerMode ? players.find((p) => p.id === currentMemberId) : undefined;
  const myStatus = me ? (!me.isCheckedIn ? 'ยังไม่เช็กอิน' : playerStatus[me.status]) : 'ยังไม่ได้เลือกสมาชิก';
  const confirmedQueue = [confirmedPreMatch, confirmedPreMatch2]
    .filter((pm): pm is ConfirmedPreMatch => Boolean(pm))
    .filter((pm) => new Set([...pm.teamA, ...pm.teamB]).size === 4)
    .sort((a, b) => (a.confirmedAt || 0) - (b.confirmedAt || 0));
  const next = confirmedQueue[0];
  const isNextForMe = Boolean(me && next && [...next.teamA, ...next.teamB].includes(me.id));

  return (
    <section className="gg-dashboard" aria-label="GuanGuan live dashboard">
      <div className="gg-dashboard__hero">
        <span className="gg-dashboard__hero-index" aria-hidden="true">GUANGUAN BADMINTON CLUB</span>
        <div className="gg-dashboard__hero-copy">
          <div className="gg-dashboard__eyebrow">
            <span className="gg-pulse" />
            GUANGUAN INTERNAL
            <span className="gg-dashboard__eyebrow-divider" />
            {isOrganizerMode ? 'CLUB ADMIN' : 'MEMBER'}
          </div>
          <h2>{isOrganizerMode ? 'แดชบอร์ดก๊วนกวน' : me ? `สวัสดี ${me.nickname}` : 'พร้อมลงสนามกันหรือยัง?'}</h2>
          <p>{isOrganizerMode ? 'ระบบใช้งานภายในสำหรับก๊วนกวนเท่านั้น' : 'เช็กสถานะสนาม และเตรียมพร้อมสำหรับแมตช์ต่อไป'}</p>
          <div className="gg-dashboard__session-details">
            <span><CalendarDays aria-hidden="true" size={14} />{sessionConfig.date || 'ไม่ระบุวันที่'}</span>
            <span><MapPin aria-hidden="true" size={14} />{sessionConfig.venueName || 'ยังไม่ระบุสนาม'}</span>
            <span><Clock3 aria-hidden="true" size={14} />{sessionConfig.startTime}–{sessionConfig.endTime}</span>
          </div>
        </div>
        <div className="gg-dashboard__hero-emblem" aria-hidden="true">
          <span className="gg-dashboard__emblem-ring" />
          <svg width="114" height="114" viewBox="0 0 114 114" fill="none" aria-hidden="true">
            <path d="M35 28 78 72M46 18 90 61M24 40 67 83" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M19 43 37 24 90 78 77 91 19 43Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <path d="M73 85c5 5 13 7 18 2 5-6 2-13-3-18" fill="currentColor" />
          </svg>
        </div>
      </div>

      <div className="gg-dashboard__metrics-heading">
        <span>GUANGUAN INTERNAL</span>
        <span className="gg-dashboard__metrics-heading-rule" />
        <span>OVERVIEW</span>
      </div>
      <div className="gg-dashboard__metrics">
        {isOrganizerMode ? (
          <>
            <div className="gg-dashboard__metric">
              <div className="gg-dashboard__metric-top"><Users size={15} /> วันนี้</div>
              <strong>{checkedIn.length}<small> คน</small></strong>
              <span>เช็กอินแล้ว</span>
            </div>
            <div className="gg-dashboard__metric">
              <div className="gg-dashboard__metric-top"><LayoutGrid size={15} /> สนาม</div>
              <strong>{activeMatches.length}<small> / {sessionConfig.courtNames.length}</small></strong>
              <span>กำลังใช้งาน</span>
            </div>
            <div className="gg-dashboard__metric">
              <div className="gg-dashboard__metric-top"><Clock3 size={15} /> คิวรอ</div>
              <strong>{waitingPlayers.length}<small> คน</small></strong>
              <span>พร้อมลงเล่น</span>
            </div>
          </>
        ) : (
          <>
            <div className="gg-dashboard__metric gg-dashboard__metric--wide">
              <div className="gg-dashboard__metric-top"><Activity size={15} /> สถานะของฉัน</div>
              <strong className="gg-dashboard__status">{myStatus}</strong>
              <span>{isNextForMe ? 'คุณมีชื่อใน Pre-Match ถัดไป' : 'ติดตามประกาศ Pre-Match ที่ยืนยันแล้ว'}</span>
            </div>
            <div className="gg-dashboard__metric">
              <div className="gg-dashboard__metric-top"><Waves size={15} /> เล่นแล้ว</div>
              <strong>{me?.matchesPlayed ?? 0}<small> Match</small></strong>
              <span>ใน Session นี้</span>
            </div>
          </>
        )}
      </div>

    </section>
  );
};
