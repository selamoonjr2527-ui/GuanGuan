import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import type { ActiveMatch, ConfirmedPreMatch, Player } from '../types';

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

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      setStatus('Browser นี้ไม่มี Text-to-Speech');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = rate;
    utterance.pitch = 1;
    const thaiVoice = window.speechSynthesis.getVoices().find((voice) =>
      voice.lang.toLowerCase().startsWith('th'));
    if (thaiVoice) utterance.voice = thaiVoice;
    utterance.onerror = () => setStatus('ไม่สามารถอ่านเสียงได้ ตรวจสอบ TTS ภาษาไทยในอุปกรณ์');
    utterance.onstart = () => setStatus('กำลังประกาศเสียง');
    utterance.onend = () => setStatus('พร้อมประกาศ');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [rate]);

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
      if (Number(pm.confirmedAt || 0) <= 0) return;
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
    if (modeRef.current === 'live' && armed.current) {
      // Speech synthesis has a device-local queue. Only this explicitly armed tab speaks.
      speak(fresh[fresh.length - 1].text);
    }
  }, [activeMatches, snapshotPm, sessionDate, playerName, speak]);

  const activate = (next: Mode) => {
    if (next === 'off') {
      armed.current = false;
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
