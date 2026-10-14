import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import type { ActiveMatch, ConfirmedPreMatch, Player } from '../types';
// GG_MEMBER_FCM_PUBLISH_V1 - dynamic import avoids inflating the main PWA chunk
import { subscribeVoiceEventsV525, publishVoiceEventV525 } from '../utils/voiceBroadcastV525'; // GG_FIREBASE_VOICE_BROADCAST_V525

type Mode = 'off' | 'test' | 'live';
type VoiceEvent = { key: string; kind: 'pm' | 'court'; text: string; memberIds: string[] };
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

const playTabletLocalBeepV3 = async (): Promise<boolean> => {
  try {
    const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as
      | (new () => AudioContext)
      | undefined;

    if (!AudioContextCtor) return false;

    const context = new AudioContextCtor();

    if (context.state === 'suspended') {
      await context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.38);

    window.setTimeout(() => {
      try {
        oscillator.disconnect();
        gain.disconnect();
        void context.close();
      } catch {
        // Ignore cleanup errors.
      }
    }, 700);

    return true;
  } catch (error) {
    console.warn('[GuanGuan Voice] Tablet local beep failed', error);
    return false;
  }
};

// GUANGUAN_TABLET_LOCAL_TEST_V3
export const GuanVoiceAnnouncerV515: React.FC<Props> = ({
  players, confirmedPreMatches, activeMatches, sessionDate,
}) => {
  const [mode, setMode] = useState<Mode>(() => {
    const old = safeRead(MODE_KEY, 'off');
    // GG_VOICE_RESTORE_LIVE_FIRST_GESTURE_V1
    // Remember LIVE/TEST across reloads. Android speech is armed below on the
    // first real tap/key gesture to comply with browser autoplay policy.
    return old === 'live' || old === 'test' ? old : 'off';
  });
  const [rate, setRate] = useState(() => Number(safeRead(RATE_KEY, '0.9')) || 0.9);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('ยังไม่เปิดเสียง');
  const [history, setHistory] = useState<VoiceEvent[]>([]);
  const [ttsDiagnostic, setTtsDiagnostic] = useState('ยังไม่ได้ทดสอบ');
  const armed = useRef(false);
  const initialized = useRef(false);
  const oldPm = useRef<Record<string, string>>({});
  const oldMatches = useRef(new Set<string>());
  const seen = useRef(new Set<string>());
  const previousSession = useRef(sessionDate);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // GG_TABLET_TTS_HARD_ARM_V3
  // Android Chrome often requires a REAL speechSynthesis.speak() call inside
  // a direct user gesture. Capture phase ensures taps are seen even when an
  // app control stops event propagation. We keep retrying until TTS actually
  // starts, then remove the unlock listeners.
  useEffect(() => {
    if (modeRef.current === 'off') return;

    let unlocked = false;
    let trying = false;

    const removeUnlockListeners = () => {
      window.removeEventListener(
        'pointerdown',
        armStoredVoiceMode,
        true
      );
      window.removeEventListener(
        'touchstart',
        armStoredVoiceMode,
        true
      );
      window.removeEventListener(
        'click',
        armStoredVoiceMode,
        true
      );
      window.removeEventListener(
        'keydown',
        armStoredVoiceMode,
        true
      );
    };

    const armStoredVoiceMode = () => {
      if (unlocked || trying) return;
      if (!('speechSynthesis' in window)) return;

      trying = true;
      armed.current = true;

      try {
        window.speechSynthesis.resume();

        const unlockUtterance =
          new SpeechSynthesisUtterance('พร้อม');

        unlockUtterance.lang = 'th-TH';
        unlockUtterance.rate = 1;
        unlockUtterance.pitch = 1;
        unlockUtterance.volume = 1;

        const thaiVoice = window.speechSynthesis
          .getVoices()
          .find((voice) =>
            voice.lang.toLowerCase().startsWith('th')
          );

        if (thaiVoice) {
          unlockUtterance.voice = thaiVoice;
        }

        unlockUtterance.onstart = () => {
          unlocked = true;
          trying = false;
          armed.current = true;

          setStatus(
            modeRef.current === 'live'
              ? 'LIVE พร้อมประกาศอัตโนมัติ'
              : 'TEST พร้อมใช้งาน'
          );

          removeUnlockListeners();
        };

        unlockUtterance.onend = () => {
          trying = false;
        };

        unlockUtterance.onerror = (event) => {
          trying = false;
          armed.current = false;
          console.warn(
            'Tablet TTS unlock utterance failed; will retry on next tap',
            event
          );
          setStatus('แตะหน้าจออีกครั้งเพื่อเปิดเสียง');
        };

        window.speechSynthesis.speak(unlockUtterance);
      } catch (unlockError) {
        trying = false;
        armed.current = false;
        console.warn(
          'Tablet TTS hard arm failed; will retry on next tap',
          unlockError
        );
      }
    };

    window.addEventListener(
      'pointerdown',
      armStoredVoiceMode,
      true
    );
    window.addEventListener(
      'touchstart',
      armStoredVoiceMode,
      true
    );
    window.addEventListener(
      'click',
      armStoredVoiceMode,
      true
    );
    window.addEventListener(
      'keydown',
      armStoredVoiceMode,
      true
    );

    return () => {
      removeUnlockListeners();
    };
  }, [mode]);

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
    window.speechSynthesis.resume();
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

  // GG_VOICE_DIRECT_LOCAL_V4
  // UI actions on this device speak locally first. Firestore is still used to
  // broadcast to other LIVE devices. A short text cache prevents this same
  // device from speaking its own Firestore echo again.
  const recentDirectSpeech = useRef(new Map<string, number>());

  const speakDirect = useCallback((text: string) => {
    recentDirectSpeech.current.set(text, Date.now());
    armed.current = true;
    window.speechSynthesis?.resume();
    speak(text);
  }, [speak]);
  // GG_FIREBASE_VOICE_BROADCAST_V525: only newly published events are spoken, never a backfill.
  useEffect(() => {
    return subscribeVoiceEventsV525((event) => {
      if (event.sessionDate !== sessionDate) return;
      if (modeRef.current !== 'live' || !armed.current) return;
      setHistory(prev => [{key:event.id,kind:event.kind,text:event.text}, ...prev.filter(p=>p.key!==event.id)].slice(0,6));

      const directAt = recentDirectSpeech.current.get(event.text) || 0;
      if (Date.now() - directAt < 8000) {
        recentDirectSpeech.current.delete(event.text);
        return;
      }

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
      const text = `ขอเชิญ ${listNames(names)} ลงสนาม ${speakable(match.courtName)} ได้เลยค่ะ`;
      speakDirect(text);
      publish('court', text, `call-court-${match.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    };
    const onRecallPm = (event: Event) => {
      const slot = (event as CustomEvent<{slot:number}>).detail?.slot;
      const pm = pmRef.current[Number(slot) - 1];
      if (!pm) { setStatus('ไม่พบ Pre-Match ที่ยืนยันแล้ว'); return; }
      if (modeRef.current === 'off') { setStatus('กรุณาเปิด TEST หรือ LIVE บนอุปกรณ์นี้ก่อน'); return; }
      const names = [...pm.teamA, ...pm.teamB].map(id => playersRef.current.find(p => p.id === id)?.nickname?.trim() || '');
      if (names.some(name => !name)) { setStatus('รายชื่อ Pre-Match ไม่ครบ'); return; }
      armed.current = true;
      const text = `ขอเชิญ ${listNames(names)} เตรียมตัว พร้อมลงสนามในลำดับถัดไปค่ะ`;
      speakDirect(text);
      publish('pm', text, `call-pm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    };
    window.addEventListener('guanguan:recall-prematch', onRecallPm);
    window.addEventListener('guanguan:recall-court', onRecall);
    return () => { window.removeEventListener('guanguan:recall-court', onRecall); window.removeEventListener('guanguan:recall-prematch', onRecallPm); };
  }, [publish, speakDirect]);

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
        text: `ขอเชิญ ${listNames(names)} เตรียมตัว พร้อมลงสนามในลำดับถัดไปค่ะ`,
        memberIds: [...pm.teamA, ...pm.teamB] });
    });
    activeMatches.forEach((match) => {
      if (oldMatches.current.has(String(match.id))) return;
      const names = [...match.teamA, ...match.teamB].map(playerName);
      if (names.some((n) => !n)) return;
      newEvents.push({ key: `${sessionDate}:match:${match.id}`, kind: 'court',
        text: `ขอเชิญ ${listNames(names)} ลงสนาม ${speakable(match.courtName)} ได้เลยค่ะ`,
        memberIds: [...match.teamA, ...match.teamB] });
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
    // On the LIVE tablet, speak immediately from the state transition instead
    // of waiting for Firestore to echo the event back to this same browser.
    fresh.forEach((ev) => {
      if (modeRef.current === 'live' && armed.current) {
        speakDirect(ev.text);
      }

      publish(ev.kind, ev.text, ev.key);

      void import('../utils/memberPushV1')
        .then(({ sendMemberQueuePushV1 }) =>
          sendMemberQueuePushV1({
            memberIds: ev.memberIds,
            kind: ev.kind,
            title:
              ev.kind === 'court'
                ? '🏸 ถึงคิวแล้ว! ลงสนามได้เลย'
                : '🔔 เตรียมตัว! ใกล้ถึงคิวแล้ว',
            body: ev.text,
            tag: ev.key,
            url: '/',
          })
        )
        .catch((pushError) => {
          console.warn(
            'GuanGuan member push failed',
            pushError
          );
        });
    });
  }, [activeMatches, snapshotPm, sessionDate, playerName, publish, speakDirect]);

  // GUANGUAN_TABLET_TTS_DIAGNOSTIC_V2
  const runTtsDiagnosticV2 = useCallback(async () => {
    armed.current = true;

    const beepOk = await playTabletLocalBeepV3();

    if (!('speechSynthesis' in window)) {
      setTtsDiagnostic(`Beep: ${beepOk ? 'OK' : 'FAIL'} | SpeechSynthesis: NOT SUPPORTED`);
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();
    synth.resume();

    const loadVoices = async (): Promise<SpeechSynthesisVoice[]> => {
      let voices = synth.getVoices();
      if (voices.length > 0) return voices;

      await new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          synth.removeEventListener('voiceschanged', finish);
          resolve();
        };

        synth.addEventListener('voiceschanged', finish);
        window.setTimeout(finish, 1200);
      });

      voices = synth.getVoices();
      return voices;
    };

    const voices = await loadVoices();
    const thaiVoice = voices.find((voice) =>
      voice.lang.toLowerCase().startsWith('th')
    );
    const englishVoice = voices.find((voice) =>
      voice.lang.toLowerCase().startsWith('en')
    );

    const speakOnce = (
      text: string,
      lang: string,
      voice?: SpeechSynthesisVoice
    ): Promise<'START+END' | 'ERROR' | 'TIMEOUT'> =>
      new Promise((resolve) => {
        let done = false;
        let started = false;

        const finish = (result: 'START+END' | 'ERROR' | 'TIMEOUT') => {
          if (done) return;
          done = true;
          resolve(result);
        };

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        if (voice) utterance.voice = voice;

        utterance.onstart = () => {
          started = true;
        };

        utterance.onend = () => {
          finish(started ? 'START+END' : 'ERROR');
        };

        utterance.onerror = () => {
          finish('ERROR');
        };

        synth.resume();
        synth.speak(utterance);

        window.setTimeout(() => finish('TIMEOUT'), 6000);
      });

    setTtsDiagnostic(
      `Beep: ${beepOk ? 'OK' : 'FAIL'} | กำลังทดสอบ Thai TTS...`
    );

    const thaiResult = await speakOnce(
      'ทดสอบเสียงภาษาไทย หนึ่ง สอง สาม',
      'th-TH',
      thaiVoice
    );

    synth.cancel();
    synth.resume();

    setTtsDiagnostic(
      `Beep: ${beepOk ? 'OK' : 'FAIL'} | Thai TTS: ${thaiResult} | กำลังทดสอบ English TTS...`
    );

    const englishResult = await speakOnce(
      'English voice test one two three',
      'en-US',
      englishVoice
    );

    const voiceSummary =
      voices.length > 0
        ? voices
            .slice(0, 12)
            .map((voice) => `${voice.name} (${voice.lang})`)
            .join(' | ')
        : 'NONE';

    setTtsDiagnostic(
      [
        `Beep: ${beepOk ? 'OK' : 'FAIL'}`,
        `Thai TTS: ${thaiResult}`,
        `English TTS: ${englishResult}`,
        `Thai Voice Found: ${thaiVoice ? 'YES' : 'NO'}`,
        `Voice Count: ${voices.length}`,
        `Voices: ${voiceSummary}`
      ].join(' || ')
    );
  }, []);
  // GG_TABLET_VOICE_MENU_LISTENER_V3
  useEffect(() => {
    const openVoicePanel = () => setExpanded(true);
    window.addEventListener('guanguan:open-voice-panel', openVoicePanel);
    return () => window.removeEventListener('guanguan:open-voice-panel', openVoicePanel);
  }, []);
  const activate = (next: Mode) => {
    if (next === 'off') {
      armed.current = false;
      speechQueue.current = [];
      speaking.current = false;
      window.speechSynthesis?.cancel();
      setStatus('ปิดเสียงแล้ว');
    } else {
      armed.current = true; // user gesture for Android Chrome audio policy
      window.speechSynthesis?.resume();
      setStatus(next === 'live' ? 'เปิดเครื่องประกาศแล้ว' : 'โหมดทดสอบเสียง');
      speak(next === 'live' ? 'เปิดระบบประกาศก๊วนกวนแล้วค่ะ' : 'ทดสอบเสียงก๊วนกวน หนึ่ง สอง สามค่ะ');
    }
    modeRef.current = next;
    setMode(next);
    safeWrite(MODE_KEY, next);
  };

  return (
    <div className="gg-voice-v515" aria-label="ระบบประกาศเสียง GuanGuan">
      {/* GG_VOICE_FLOATING_LAUNCHER_REMOVED_V1
          Floating "เสียงเรียกชื่อ LIVE" launcher removed from the UI.
          Voice settings still open from Tools / More via guanguan:open-voice-panel. */}
      {expanded && <div className="gg-voice-v515__body">
        <div className="gg-voice-v515__heading">
          <span><Radio size={16}/> Voice Announcer</span>
          <button
            type="button"
            className="gg-voice-v515__close"
            onClick={() => setExpanded(false)}
            aria-label="ปิดหน้าต่างเสียง"
            title="ปิด"
          >
            ✕
          </button>
        </div>
        {/* GG_VOICE_POPUP_CLOSE_V4 */}
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
        <button type="button" className="gg-voice-v515__test" onClick={() => { armed.current = true; setStatus('กำลังทดสอบเสียงบนเครื่องนี้...'); void playTabletLocalBeepV3(); window.speechSynthesis?.resume(); speak('ทดสอบเสียงประกาศก๊วนกวนค่ะ'); }}>
          <Play size={14}/> ทดสอบเสียงภาษาไทย
        </button>
        <button
          type="button"
          className="gg-voice-v515__test"
          onClick={() => { void runTtsDiagnosticV2(); }}
        >
          <Play size={14}/> TTS Diagnostic
        </button>
        <div
          className="gg-voice-v515__status"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {ttsDiagnostic}
        </div>        <div role="status" className="gg-voice-v515__status">{status}</div>
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
