import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import type { ActiveMatch, ConfirmedPreMatch, Player } from '../types';
import { subscribeVoiceEventsV525, publishVoiceEventV525 } from '../utils/voiceBroadcastV525'; // GG_FIREBASE_VOICE_BROADCAST_V525

type Mode = 'off' | 'test' | 'live';
type VoiceEvent = { key: string; kind: 'pm' | 'court'; text: string };
const MODE_KEY = 'guanguan_voice_mode_v515';
const RATE_KEY = 'guanguan_voice_rate_v515';
const SEEN_KEY = 'guanguan_voice_seen_v515';
const THAI_NAMES: Record<string, string> = { PH: 'พีเอช', N1: 'เอ็นหนึ่ง', N2: 'เอ็นสอง' };

const speakable = (value: string) => THAI_NAMES[value.trim().toUpperCase()] || value.trim();
const listNames = (names: string[]) => names.map((name) => `คุณ ${speakable(name)}`).join(',  ');
const safeRead = (key: string, fallback = '') => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const safeWrite = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
};

interface Props {
  players: Player[];
  confirmedPreMatches: Array<ConfirmedPreMatch | null | undefined>;
  activeMatches: ActiveMatch[];
  sessionDate: string;
}

export const GuanVoiceAnnouncerV515: React.FC<Props> = ({
  players, confirmedPreMatches, activeMatches, sessionDate,
}) => {
  const [mode, setMode] = useState<Mode>(() => {
    const old = safeRead(MODE_KEY, 'off');
    // Require an explicit user click after every page load to arm speech.
    return old === 'test' ? 'test' : 'off';
  });
  const [rate, setRate] = useState(() => Number(safeRead(RATE_KEY, '0.9')) || 0.9);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('ยังไม่เปิดเสียง');
  const [history, setHistory] = useState<VoiceEvent[]>([]);
  const armed = useRef(false);
  const initialized = useRef(false);
  const oldPm = useRef<Record<string, string>>({});
  const oldMatches = useRef(new Set<string>());
  const seen = useRef(new Set<string>());
  const previousSession = useRef(sessionDate);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const playerName = useCallback((id: string) =>
    players.find((p) => p.id === id)?.nickname?.trim() || '', [players]);

  const snapshotPm = useMemo(() => confirmedPreMatches.map((pm, index) => ({
    slot: index + 1,
    pm,
    fingerprint: pm ? `${pm.id}:${Number(pm.confirmedAt || 0)}` : '',
  })), [confirmedPreMatches]);

  // GG_VOICE_DOUBLE_CALL_V523: serial queue; each announcement plays exactly twice.
  const speechQueue = useRef<string[]>([]);
  const speaking = useRef(false);
  const speakNext = useCallback(() => {
    if (speaking.current) return;
    const text = speechQueue.current.shift();
    if (!text) { setStatus('พร้อมประกาศ'); return; }
    if (!('speechSynthesis' in window)) { setStatus('Browser นี้ไม่มี Text-to-Speech'); return; }
    speaking.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = rate;
    utterance.pitch = 1;
    const thaiVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('th'));
    if (thaiVoice) utterance.voice = thaiVoice;
    utterance.onstart = () => setStatus('กำลังประกาศเสียง (2 รอบ)');
    const next = () => { speaking.current = false; speakNext(); };
    utterance.onend = next;
    utterance.onerror = () => { setStatus('เสียงมีปัญหา ตรวจสอบ TTS'); next(); };
    window.speechSynthesis.speak(utterance);
  }, [rate]);
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) { setStatus('Browser นี้ไม่มี Text-to-Speech'); return; }
    speechQueue.current.push(text, text);
    speakNext();
  }, [speakNext]);
  // GG_FIREBASE_VOICE_BROADCAST_V525: only newly published events are spoken, never a backfill.
  useEffect(() => {
    return subscribeVoiceEventsV525((event) => {
      if (event.sessionDate !== sessionDate) return;
      if (modeRef.current !== 'live' || !armed.current) return;
      setHistory(prev => [{key:event.id,kind:event.kind,text:event.text}, ...prev.filter(p=>p.key!==event.id)].slice(0,6));
      speak(event.text);
    }, (error) => setStatus('Firebase Voice: '+error.message));
  }, [sessionDate, speak]);
  const publish = useCallback((kind:'pm'|'court', text:string, uniqueKey:string) => {
    void publishVoiceEventV525({sessionDate,kind,text,uniqueKey}).catch((error:Error) => setStatus('ส่งประกาศไม่สำเร็จ: '+error.message));
  }, [sessionDate]);
  const matchesRef = useRef(activeMatches);
  const playersRef = useRef(players);
  matchesRef.current = activeMatches;
  playersRef.current = players;
  // GG_VOICE_PREMATCH_CALL_V524
  const pmRef = useRef(confirmedPreMatches);
  pmRef.current = confirmedPreMatches;
  useEffect(() => {
    const onRecall = (event: Event) => {
      const matchId = (event as CustomEvent<{matchId:string}>).detail?.matchId;
      const match = matchesRef.current.find(m => m.id === matchId);
      if (!match) return;
      const names = [...match.teamA, ...match.teamB].map(id => playersRef.current.find(p => p.id === id)?.nickname?.trim() || '');
      if (names.some(n => !n)) { setStatus('รายชื่อผู้เล่นไม่ครบ'); return; }
      // Manual calls are explicit gestures, permitted in TEST or LIVE on this device.
      if (modeRef.current === 'off') { setStatus('กรุณาเปิดโหมด TEST หรือ LIVE บนอุปกรณ์นี้ก่อน'); return; }
      armed.current = true;
      publish('court', `ขอเชิญ ${listNames(names)} ลงสนาม ${speakable(match.courtName)} ได้เลยค่ะ`, `call-court-${match.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    };
    const onRecallPm = (event: Event) => {
      const slot = (event as CustomEvent<{slot:number}>).detail?.slot;
      const pm = pmRef.current[Number(slot) - 1];
      if (!pm) { setStatus('ไม่พบ Pre-Match ที่ยืนยันแล้ว'); return; }
      if (modeRef.current === 'off') { setStatus('กรุณาเปิด TEST หรือ LIVE บนอุปกรณ์นี้ก่อน'); return; }
      const names = [...pm.teamA, ...pm.teamB].map(id => playersRef.current.find(p => p.id === id)?.nickname?.trim() || '');
      if (names.some(name => !name)) { setStatus('รายชื่อ Pre-Match ไม่ครบ'); return; }
      armed.current = true;
      publish('pm', `ขอเชิญ ${listNames(names)} เตรียมตัว พร้อมลงสนามในลำดับถัดไปค่ะ`, `call-pm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    };
    window.addEventListener('guanguan:recall-prematch', onRecallPm);
    window.addEventListener('guanguan:recall-court', onRecall);
    return () => { window.removeEventListener('guanguan:recall-court', onRecall); window.removeEventListener('guanguan:recall-prematch', onRecallPm); };
  }, [publish]);

  useEffect(() => {
    const pmMap: Record<string, string> = {};
    snapshotPm.forEach(({ slot, fingerprint }) => { pmMap[String(slot)] = fingerprint; });
    const matchIds = new Set(activeMatches.map((match) => String(match.id)));
    // Do not replay historical PM/matches when the tablet connects or after a reset.
    if (!initialized.current || previousSession.current !== sessionDate) {
      initialized.current = true;
      previousSession.current = sessionDate;
      oldPm.current = pmMap;
      oldMatches.current = matchIds;
      return;
    }

    const newEvents: VoiceEvent[] = [];
    snapshotPm.forEach(({ slot, pm, fingerprint }) => {
      if (!pm || !fingerprint || oldPm.current[String(slot)] === fingerprint) return;
      // Confirmed Pre-Match without confirmedAt is supported; initial hydration remains ignored.
      // Editing a confirmed lineup with the same ID/timestamp isn't a fresh confirmation.
      if ((oldPm.current[String(slot)] || '').length > 0 &&
          oldPm.current[String(slot)] === fingerprint) return;
      const names = [...pm.teamA, ...pm.teamB].map(playerName);
      if (names.some((n) => !n)) return;
      newEvents.push({ key: `${sessionDate}:pm:${fingerprint}`, kind: 'pm',
        text: `ขอเชิญ ${listNames(names)} เตรียมตัว พร้อมลงสนามในลำดับถัดไปค่ะ` });
    });
    activeMatches.forEach((match) => {
      if (oldMatches.current.has(String(match.id))) return;
      const names = [...match.teamA, ...match.teamB].map(playerName);
      if (names.some((n) => !n)) return;
      newEvents.push({ key: `${sessionDate}:match:${match.id}`, kind: 'court',
        text: `ขอเชิญ ${listNames(names)} ลงสนาม ${speakable(match.courtName)} ได้เลยค่ะ` });
    });
    oldPm.current = pmMap;
    oldMatches.current = matchIds;
    if (newEvents.length === 0) return;
    // Skip duplicates from Firestore refresh, rendering and same browser session.
    const alreadySeen = new Set(safeRead(SEEN_KEY).split('|').filter(Boolean));
    const fresh = newEvents.filter((ev) => !seen.current.has(ev.key) && !alreadySeen.has(ev.key));
    fresh.forEach((ev) => seen.current.add(ev.key));
    if (!fresh.length) return;
    setHistory((old) => [...fresh, ...old].slice(0, 6));
    const nextSeen = [...alreadySeen, ...fresh.map((ev) => ev.key)].slice(-80);
    safeWrite(SEEN_KEY, nextSeen.join('|'));
    // Organizer-only Firestore writes. Other clients receive but cannot publish.
    fresh.forEach(ev => publish(ev.kind, ev.text, ev.key));
  }, [activeMatches, snapshotPm, sessionDate, playerName, publish]);

  const activate = (next: Mode) => {
    if (next === 'off') {
      armed.current = false;
      speechQueue.current = [];
      speaking.current = false;
      window.speechSynthesis?.cancel();
      setStatus('ปิดเสียงแล้ว');
    } else {
      armed.current = true; // user gesture for Android Chrome audio policy
      setStatus(next === 'live' ? 'เปิดเครื่องประกาศแล้ว' : 'โหมดทดสอบเสียง');
      speak(next === 'live' ? 'เปิดระบบประกาศก๊วนกวนแล้วค่ะ' : 'ทดสอบเสียงก๊วนกวน หนึ่ง สอง สามค่ะ');
    }
    modeRef.current = next;
    setMode(next);
    safeWrite(MODE_KEY, next);
  };

  return (
    <div className="gg-voice-v515" aria-label="ระบบประกาศเสียง GuanGuan">
      <div className="gg-voice-v515__bar">
        <button type="button" className="gg-voice-v515__expand" onClick={() => setExpanded((v) => !v)}>
          {mode === 'off' ? <VolumeX size={16}/> : <Volume2 size={16}/>}
          <span>เสียงเรียกชื่อ</span>
          <span className="gg-voice-v515__state">{mode === 'live' ? 'LIVE' : mode === 'test' ? 'TEST' : 'OFF'}</span>
          {expanded ? <ChevronDown size={15}/> : <ChevronUp size={15}/>}
        </button>
      </div>
      {expanded && <div className="gg-voice-v515__body">
        <div className="gg-voice-v515__heading"><Radio size={16}/> Voice Announcer</div>
        <p>เลือกเปิดเสียงแยกในแต่ละเครื่อง แนะนำให้ Android Tablet เป็นเครื่อง LIVE และ Notebook ใช้ TEST</p>
        <div className="gg-voice-v515__modes">
          <button type="button" className={mode === 'off' ? 'is-current' : ''} onClick={() => activate('off')}>ปิด</button>
          <button type="button" className={mode === 'test' ? 'is-current' : ''} onClick={() => activate('test')}>Notebook Test</button>
          <button type="button" className={mode === 'live' ? 'is-current' : ''} onClick={() => activate('live')}>Android LIVE</button>
        </div>
        <label className="gg-voice-v515__rate">ความเร็วเสียง {rate.toFixed(1)}x
          <input type="range" min="0.7" max="1.2" step="0.1" value={rate}
            onChange={(e) => { const next = Number(e.target.value); setRate(next); safeWrite(RATE_KEY, String(next)); }}/>
        </label>
        <button type="button" className="gg-voice-v515__test" onClick={() => { armed.current = true; speak('ทดสอบเสียงประกาศก๊วนกวนค่ะ'); }}>
          <Play size={14}/> ทดสอบเสียงภาษาไทย
        </button>
        <div role="status" className="gg-voice-v515__status">{status}</div>
        {history.length > 0 && <div className="gg-voice-v515__history">
          <strong>ประกาศล่าสุด</strong>
          {history.map((event) => <button type="button" key={event.key}
            onClick={() => { armed.current = true; speak(event.text); }}
            title="กดเรียกซ้ำ"><Volume2 size={14}/><span>{event.text}</span></button>)}
        </div>}
        <small>Chrome ต้องเปิดหน้าจอค้างไว้ และ Android ต้องมีเสียงภาษาไทย TTS ติดตั้งอยู่ กรุณาทดสอบกับ Bluetooth ก่อนใช้งาน</small>
      </div>}
    </div>
  );
};
