import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock3, History, Search, ShieldCheck, UserRound, Trophy } from 'lucide-react';
import type { MatchHistoryItem, Player, SessionConfig } from '../types';
import { loadSessionArchives } from '../utils/storage';

interface Props {
  players: Player[];
  currentMemberId: string;
  isOrganizerMode: boolean;
  sessionConfig: SessionConfig;
  matchHistory: MatchHistoryItem[];
  archiveRevision?: number;
}

type HistoryRow = { key: string; day: string; court: string; teamA: string[]; teamB: string[]; duration: number; shuttles: number; start: string; matches: number };

export const GuanMemberHistoryV510: React.FC<Props> = ({
  players, currentMemberId, isOrganizerMode, sessionConfig, matchHistory, archiveRevision,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState('all');
  // Refresh archives when an archive operation changes App.archiveRevision.
  const archives = useMemo(() => loadSessionArchives(), [archiveRevision]);
  const member = isOrganizerMode
    ? players.find(p => p.id === selectedId) || null
    : players.find(p => p.id === currentMemberId) || null;

  const nameIsUnique = (nickname: string) => players.filter(p => p.nickname === nickname).length === 1;
  const rows = useMemo(() => {
    if (!member) return [] as HistoryRow[];
    const results: HistoryRow[] = [];
    const used = new Set<string>();
    const addMatches = (history: MatchHistoryItem[], day: string, archivedPlayers: Player[] = []) => {
      history.forEach((item, index) => {
        const raw = item as MatchHistoryItem & { participantIds?: string[]; teamAPlayerIds?: string[]; teamBPlayerIds?: string[] };
        const ids = raw.participantIds || [...(raw.teamAPlayerIds || []), ...(raw.teamBPlayerIds || [])];
        const names = [...(item.teamANames || []), ...(item.teamBNames || [])];
        // Prefer stable IDs. Name fallback only when unique in the relevant roster.
        const roster = archivedPlayers.length ? archivedPlayers : players;
        const matchingNameCount = roster.filter(p => p.nickname === member.nickname).length;
        const belongs = ids.length > 0
          ? ids.includes(member.id)
          : matchingNameCount === 1 && names.includes(member.nickname) && nameIsUnique(member.nickname);
        if (!belongs) return;
        const key = `${day}:${item.id || index}`;
        if (used.has(key)) return;
        used.add(key);
        results.push({
          key, day, court: item.courtName || '-',
          teamA: item.teamANames || [], teamB: item.teamBNames || [],
          duration: Math.max(0, Number(item.durationMinutes || 0)),
          shuttles: Math.max(0, Number(item.shuttlecocksCount || 0)),
          start: item.startTime || '-', matches: 1,
        });
      });
    };
    addMatches(matchHistory, sessionConfig.date);
    [...archives].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).forEach(a => {
      if (a.archiveDate === sessionConfig.date) return; // Current live session is authoritative.
      addMatches(a.matchHistorySnapshot || [], a.archiveDate, a.playersSnapshot || []);
    });
    return results.sort((a, b) => b.day.localeCompare(a.day) || b.key.localeCompare(a.key));
  }, [member, players, matchHistory, archives, sessionConfig.date]);

  const matchingMembers = players.filter(p =>
    `${p.nickname} ${p.fullName || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  const days = Array.from(new Set(rows.map(r => r.day)));
  const visibleRows = dayFilter === 'all' ? rows : rows.filter(r => r.day === dayFilter);
  const totalMinutes = visibleRows.reduce((n, r) => n + r.duration, 0);

  return (
    <div className="space-y-4 text-slate-100" data-gg-member-history-v510>
      <div className="rounded-2xl border border-slate-700/80 bg-[#151d26] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-cyan-700/40 bg-cyan-950/30 p-3 text-cyan-300"><History size={22} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-white">{isOrganizerMode ? 'ประวัติสมาชิก' : 'ประวัติของฉัน'}</h1>
            <p className="mt-1 text-xs text-slate-400">ประวัติแมตช์ที่จบแล้วจากรอบปัจจุบันและ Archive</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-[11px] text-slate-300">
            {isOrganizerMode ? <ShieldCheck size={13} /> : <UserRound size={13} />}
            {isOrganizerMode ? 'Organizer · ทุกคน' : 'เฉพาะบัญชีของฉัน'}
          </span>
        </div>
      </div>

      {isOrganizerMode && (
        <div className="rounded-2xl border border-slate-700 bg-[#151d26] p-4">
          <label className="mb-2 block text-xs font-bold text-slate-300">เลือกสมาชิกเพื่อดูประวัติ</label>
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อเล่นหรือชื่อจริง..." className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-teal-500" />
          </div>
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setDayFilter('all'); }} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500">
            <option value="">-- เลือกสมาชิก --</option>
            {matchingMembers.map(p => <option key={p.id} value={p.id}>{p.nickname}{p.fullName ? ` · ${p.fullName}` : ''}</option>)}
          </select>
        </div>
      )}

      {!member ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-[#141c26] px-5 py-14 text-center">
          <UserRound className="mx-auto mb-3 text-slate-500" size={32} />
          <div className="font-semibold text-slate-300">{isOrganizerMode ? 'เลือกสมาชิกเพื่อดูประวัติ' : 'กรุณาเข้าสู่ระบบสมาชิกก่อน'}</div>
          <p className="mt-1 text-xs text-slate-500">ไม่มีการแสดงประวัติของคนอื่นโดยอัตโนมัติ</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#151d26] p-3">
            <div className="text-sm font-bold text-white">{member.nickname} <span className="ml-1 text-xs font-normal text-slate-400">ประวัติการเล่น</span></div>
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-slate-400" />
              <select value={dayFilter} onChange={e => setDayFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                <option value="all">ทุกวันที่มีประวัติ</option>
                {days.map(day => <option value={day} key={day}>{day}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-[#18232b] p-4"><div className="text-xs text-slate-400">แมตช์ที่จบแล้ว</div><div className="mt-1 text-2xl font-black text-white">{visibleRows.length}</div></div>
            <div className="rounded-xl border border-slate-700 bg-[#18232b] p-4"><div className="text-xs text-slate-400">เวลาเล่นรวม</div><div className="mt-1 text-2xl font-black text-white">{totalMinutes} <span className="text-xs text-slate-400">นาที</span></div></div>
            <div className="col-span-2 rounded-xl border border-slate-700 bg-[#18232b] p-4 sm:col-span-1"><div className="text-xs text-slate-400">วันที่มีแมตช์</div><div className="mt-1 text-2xl font-black text-white">{new Set(visibleRows.map(r => r.day)).size}</div></div>
          </div>
          <div className="space-y-2">
            {visibleRows.map(r => (
              <div key={r.key} className="rounded-xl border border-slate-700 bg-[#182129] p-4 transition hover:border-teal-600/60">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-bold text-white"><Trophy size={15} className="text-teal-400" /> {r.court}</span>
                  <span className="inline-flex items-center gap-2 text-xs text-slate-400"><Clock3 size={13} /> {r.day} · {r.start}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <div className="min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-cyan-100">{r.teamA.join(' / ')}</div>
                  <span className="text-[10px] font-bold text-slate-500">VS</span>
                  <div className="min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-rose-100">{r.teamB.join(' / ')}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400"><span>ใช้เวลา {r.duration} นาที</span><span>ลูกขนไก่ {r.shuttles} ลูก</span></div>
              </div>
            ))}
            {visibleRows.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 bg-[#141c26] py-12 text-center text-sm text-slate-400">ยังไม่มีประวัติแมตช์ที่จบแล้วในช่วงที่เลือก</div>}
          </div>
        </>
      )}
    </div>
  );
};
