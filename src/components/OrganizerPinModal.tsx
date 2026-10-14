import React, { useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, isOrganizerUid } from '../firebase';
import {
  X,
  Lock,
  KeyRound,
  ShieldCheck,
  Mail,
  AlertCircle,
} from 'lucide-react';

interface OrganizerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AccessMode = 'email' | 'setup_pin' | 'pin' | 'profiles';

type OrganizerProfile = {
  id: string;
  name: string;
  pinHash: string;
  createdAt: number;
};

const QUICK_PIN_HASH_KEY =
  'guanguan_organizer_quick_pin_hash_v61';

const ORGANIZER_PROFILES_KEY =
  'guanguan_tablet_organizer_profiles_v2';

const ORGANIZER_PROFILE_ACTIVE_KEY =
  'guanguan_tablet_organizer_profile_active_v2';

const readOrganizerProfiles = (): OrganizerProfile[] => {
  try {
    const raw = localStorage.getItem(ORGANIZER_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.pinHash === 'string'
      )
      .slice(0, 2);
  } catch {
    return [];
  }
};

const writeOrganizerProfiles = (profiles: OrganizerProfile[]) => {
  localStorage.setItem(
    ORGANIZER_PROFILES_KEY,
    JSON.stringify(profiles.slice(0, 2))
  );
};

// GG_QUICK_PIN_HTTP_FALLBACK_V1
// crypto.subtle is unavailable on some Android browsers when the dev site is
// opened via plain HTTP/LAN IP. Firebase Auth remains the real authorization
// boundary; this hash is only for the device-local convenience PIN.
const fallbackPinHash = (pin: string): string => {
  const source = `guanguan-local-pin-v1:${pin}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);

    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
    h3 = Math.imul(h3 ^ code, 0xc2b2ae35);
    h4 = Math.imul(h4 ^ code, 0x27d4eb2f);
  }

  const parts = [h1, h2, h3, h4].map(
    (value) => (value >>> 0).toString(16).padStart(8, '0')
  );

  // Repeat/mix to keep the stored format at 64 hex characters.
  return `${parts.join('')}${parts.reverse().join('')}`;
};

const hashPin = async (pin: string): Promise<string> => {
  try {
    const subtle =
      typeof globalThis !== 'undefined'
        ? globalThis.crypto?.subtle
        : undefined;

    if (subtle) {
      const data = new TextEncoder().encode(pin);
      const digest = await subtle.digest('SHA-256', data);

      return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (cryptoError) {
    console.warn(
      'Web Crypto unavailable for local Quick PIN; using local fallback hash.',
      cryptoError
    );
  }

  return fallbackPinHash(pin);
};

export const OrganizerPinModal: React.FC<
  OrganizerPinModalProps
> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<AccessMode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // GG_TABLET_ORGANIZER_PROFILES_V2
  const [profiles, setProfiles] = useState<OrganizerProfile[]>(() =>
    typeof window !== 'undefined' ? readOrganizerProfiles() : []
  );
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [profileName, setProfileName] = useState('');

  const refreshMode = () => {
    const isTrustedFirebaseUser = isOrganizerUid(
      auth.currentUser?.uid
    );

    const localProfiles =
      typeof window !== 'undefined' ? readOrganizerProfiles() : [];

    setProfiles(localProfiles);

    if (isTrustedFirebaseUser) {
      if (localProfiles.length > 0) {
        const activeId =
          localStorage.getItem(ORGANIZER_PROFILE_ACTIVE_KEY) ||
          localProfiles[0].id;

        setSelectedProfileId(
          localProfiles.some((profile) => profile.id === activeId)
            ? activeId
            : localProfiles[0].id
        );
        setMode('profiles');
      } else {
        setMode('setup_pin');
      }
    } else {
      setMode('email');
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setPassword('');
    setPin('');
    setPinConfirm('');
    refreshMode();
  }, [isOpen]);

  if (!isOpen) return null;

  const finishSuccess = () => {
    // GG_ORGANIZER_SUCCESS_CANCEL_SPLIT_V1
    // Successful authentication is NOT a cancel action.
    // App.tsx onSuccess already closes the modal after granting Organizer mode.
    setError('');
    setPassword('');
    setPin('');
    setPinConfirm('');
    onSuccess();
  };

  const handleEmailLogin = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError('กรุณากรอก Email และ Password ผู้จัด');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      if (!isOrganizerUid(credential.user.uid)) {
        await signOut(auth);
        setError('บัญชีนี้ไม่มีสิทธิ์ Organizer');
        return;
      }

      // GG_ORGANIZER_EMAIL_ALWAYS_SETUP_PIN_V1
      // Email/password was just verified. Always let this device set a fresh
      // Quick PIN so a stale/unknown local PIN can never trap the Organizer.
      setPassword('');
      setPin('');
      setPinConfirm('');
      setProfileName(
        credential.user.email?.split('@')[0] || 'Organizer'
      );
      setError('');
      setMode('setup_pin');
    } catch (loginError: any) {
      console.error('Organizer Firebase login failed', loginError);
      setError(
        'เข้าสู่ระบบผู้จัดไม่สำเร็จ กรุณาตรวจสอบ Email / Password'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSetupPin = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(pin)) {
      setError('Quick PIN ผู้จัดต้องเป็นตัวเลข 6 หลัก');
      return;
    }

    if (pin !== pinConfirm) {
      setError('PIN และยืนยัน PIN ไม่ตรงกัน');
      return;
    }

    if (!isOrganizerUid(auth.currentUser?.uid)) {
      setError(
        'Firebase Organizer Session หมดอายุ กรุณา Login ด้วย Email อีกครั้ง'
      );
      setMode('email');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const hash = await hashPin(pin);
      const currentProfiles = readOrganizerProfiles();
      const normalizedName = profileName.trim() || 'Organizer';

      const existingIndex = currentProfiles.findIndex(
        (profile) => profile.name === normalizedName
      );

      let nextProfiles = [...currentProfiles];

      if (existingIndex >= 0) {
        nextProfiles[existingIndex] = {
          ...nextProfiles[existingIndex],
          pinHash: hash,
        };
      } else {
        if (nextProfiles.length >= 2) {
          setError('Tablet นี้บันทึกผู้จัดได้สูงสุด 2 โปรไฟล์');
          return;
        }

        nextProfiles.push({
          id: `org-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          name: normalizedName,
          pinHash: hash,
          createdAt: Date.now(),
        });
      }

      writeOrganizerProfiles(nextProfiles);

      const activeProfile =
        nextProfiles.find(
          (profile) => profile.name === normalizedName
        ) || nextProfiles[nextProfiles.length - 1];

      localStorage.setItem(
        ORGANIZER_PROFILE_ACTIVE_KEY,
        activeProfile.id
      );

      localStorage.setItem(QUICK_PIN_HASH_KEY, hash);

      setProfiles(nextProfiles);
      setSelectedProfileId(activeProfile.id);
      finishSuccess();
    } catch (pinError) {
      console.error('Failed to create Organizer Quick PIN', pinError);
      setError(
        `ไม่สามารถสร้าง Quick PIN ได้${
          pinError instanceof Error && pinError.message
            ? `: ${pinError.message}`
            : ''
        }`
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePinUnlock = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(pin)) {
      setError('กรุณากรอก Quick PIN 6 หลัก');
      return;
    }

    if (!isOrganizerUid(auth.currentUser?.uid)) {
      setError(
        'อุปกรณ์นี้ไม่มี Firebase Organizer Session แล้ว กรุณา Login ด้วย Email ใหม่ 1 ครั้ง'
      );
      setMode('email');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const selectedProfile = readOrganizerProfiles().find(
        (profile) => profile.id === selectedProfileId
      );

      const savedHash =
        selectedProfile?.pinHash ||
        localStorage.getItem(QUICK_PIN_HASH_KEY);

      if (!savedHash) {
        setMode('setup_pin');
        return;
      }

      const inputHash = await hashPin(pin);

      if (inputHash !== savedHash) {
        setError('Quick PIN ไม่ถูกต้อง');
        return;
      }

      if (selectedProfileId) {
        localStorage.setItem(
          ORGANIZER_PROFILE_ACTIVE_KEY,
          selectedProfileId
        );
      }

      finishSuccess();
    } catch (pinError) {
      console.error('Organizer Quick PIN verification failed', pinError);
      setError('ตรวจสอบ Quick PIN ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleForgetDevice = async () => {
    const confirmed = window.confirm(
      'ล้างสิทธิ์ผู้จัดออกจากอุปกรณ์นี้หรือไม่?\n\n' +
      'ครั้งถัดไปจะต้อง Login ด้วย Email / Password ใหม่'
    );

    if (!confirmed) return;

    localStorage.removeItem(QUICK_PIN_HASH_KEY);
    localStorage.removeItem(ORGANIZER_PROFILES_KEY);
    localStorage.removeItem(ORGANIZER_PROFILE_ACTIVE_KEY);

    try {
      await signOut(auth);
    } catch (logoutError) {
      console.error('Organizer device sign-out failed', logoutError);
    }

    setPin('');
    setPassword('');
    setError('');
    setMode('email');
  };

  return (
    <div className="gg-organizer-login-v5131 fixed inset-0 z-[2147483500] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md">
      {/* ORGANIZER_QUICK_PIN_V61 / GG_ORGANIZER_LOGIN_V5131 */}
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/40 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/15 p-2 text-amber-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-black text-white">
                เข้าสู่ระบบผู้จัดก๊วน
              </div>
              <div className="text-[10px] text-slate-400">
                GUANGUAN / ORGANIZER
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'profiles' && (
          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-cyan-800/50 bg-cyan-950/25 p-3 text-xs leading-5 text-cyan-100">
              เลือกผู้จัดบนอุปกรณ์นี้ แล้วกรอก Quick PIN ของแต่ละคน
              <br />
              Firebase Organizer Session ของอุปกรณ์นี้ยังเป็นสิทธิ์หลัก
            </div>

            <div className="grid gap-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    setSelectedProfileId(profile.id);
                    setPin('');
                    setError('');
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedProfileId === profile.id
                      ? 'border-amber-400 bg-amber-500/10'
                      : 'border-slate-700 bg-slate-950'
                  }`}
                >
                  <div className="text-sm font-black text-white">
                    👤 {profile.name}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    Quick PIN แยกเฉพาะโปรไฟล์นี้
                  </div>
                </button>
              ))}
            </div>

            <form onSubmit={handlePinUnlock} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) =>
                  setPin(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  )
                }
                className="w-full rounded-xl border border-amber-600/50 bg-slate-950 px-4 py-4 text-center text-2xl font-black tracking-[0.5em] text-white outline-none focus:border-amber-400"
                placeholder="••••••"
              />

              {error && (
                <div className="rounded-xl border border-rose-700/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !selectedProfileId}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                เข้าโหมดผู้จัด
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                if (profiles.length >= 2) {
                  setError('Tablet นี้บันทึกผู้จัดได้สูงสุด 2 โปรไฟล์');
                  return;
                }

                setProfileName('');
                setPin('');
                setPinConfirm('');
                setError('');
                setMode('setup_pin');
              }}
              className="w-full rounded-xl border border-emerald-700/60 bg-emerald-950/20 px-4 py-2.5 text-xs font-black text-emerald-300"
            >
              + เพิ่มผู้จัดบน Tablet นี้
            </button>

            <button
              type="button"
              onClick={() => setMode('email')}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-bold text-slate-400"
            >
              ใช้ Email / Password ผู้จัด
            </button>
          </div>
        )}

        {mode === 'email' && (          <form
            onSubmit={handleEmailLogin}
            className="space-y-4 p-5"
          >
            <div className="rounded-2xl border border-cyan-800/50 bg-cyan-950/25 p-3 text-xs leading-5 text-cyan-100">
              อุปกรณ์ใหม่ต้องยืนยันตัวตนผู้จัดด้วย
              Email / Password <strong>เพียงครั้งแรก</strong>
              หลังจากนั้นใช้งาน Quick PIN ได้
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-300">
                <Mail className="h-3.5 w-3.5" />
                Organizer Email
              </label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-500"
                placeholder="organizer@email.com"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-300">
                <Lock className="h-3.5 w-3.5" />
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-700/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {busy
                ? 'กำลังตรวจสอบ...'
                : 'ยืนยัน Organizer ด้วย Firebase'}
            </button>
          </form>
        )}

        {mode === 'setup_pin' && (
          <form
            onSubmit={handleSetupPin}
            className="space-y-4 p-5"
          >
            <div className="rounded-2xl border border-emerald-700/50 bg-emerald-950/25 p-3 text-xs leading-5 text-emerald-100">
              ยืนยันบัญชีผู้จัดเรียบร้อยแล้ว
              <br />
              ตั้ง <strong>Quick PIN 6 หลัก</strong>
              สำหรับอุปกรณ์นี้ ครั้งต่อไปไม่ต้องกรอก Email
            </div>

            <div>
              <label className="mb-1.5 text-xs font-bold text-slate-300">
                ชื่อผู้จัดบนอุปกรณ์นี้
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(event) =>
                  setProfileName(event.target.value.slice(0, 24))
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-500"
                placeholder="เช่น โจ้ / ป๋วย"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-300">
                <KeyRound className="h-3.5 w-3.5" />
                ตั้ง Quick PIN 6 หลัก
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) =>
                  setPin(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  )
                }
                className="w-full rounded-xl border border-amber-600/50 bg-slate-950 px-4 py-3 text-center text-xl font-black tracking-[0.45em] text-white outline-none focus:border-amber-400"
                placeholder="••••••"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 text-xs font-bold text-slate-300">
                ยืนยัน Quick PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinConfirm}
                onChange={(event) =>
                  setPinConfirm(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-xl font-black tracking-[0.45em] text-white outline-none focus:border-amber-400"
                placeholder="••••••"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-700/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              บันทึก PIN และเข้าโหมดผู้จัด
            </button>
          </form>
        )}

        {mode === 'pin' && (
          <form
            onSubmit={handlePinUnlock}
            className="space-y-4 p-5"
          >
            <div className="rounded-2xl border border-amber-700/50 bg-amber-950/25 p-3 text-xs leading-5 text-amber-100">
              อุปกรณ์นี้ยืนยันตัวตนผู้จัดไว้แล้ว
              <br />
              กรอก Quick PIN เพื่อเข้าโหมดผู้จัด
            </div>

            <div>
              <label className="mb-1.5 block text-center text-xs font-bold text-slate-300">
                Quick PIN ผู้จัด
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) =>
                  setPin(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  )
                }
                className="w-full rounded-xl border border-amber-600/50 bg-slate-950 px-4 py-4 text-center text-2xl font-black tracking-[0.5em] text-white outline-none focus:border-amber-400"
                placeholder="••••••"
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-700/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              เข้าสู่โหมดผู้จัด
            </button>

            <button
              type="button"
              onClick={() => {
                // GG_ORGANIZER_RECREATE_PIN_V1
                if (!isOrganizerUid(auth.currentUser?.uid)) {
                  setError(
                    'Firebase Organizer Session หมดอายุ กรุณา Login ด้วย Email ใหม่ก่อนตั้ง PIN'
                  );
                  setMode('email');
                  return;
                }

                localStorage.removeItem(QUICK_PIN_HASH_KEY);
                setPin('');
                setPinConfirm('');
                setError('');
                setMode('setup_pin');
              }}
              className="w-full rounded-xl border border-emerald-700/60 bg-emerald-950/20 px-4 py-2.5 text-xs font-black text-emerald-300 hover:bg-emerald-950/40"
            >
              🔑 ตั้ง / สร้าง Quick PIN ใหม่
            </button>

            <button
              type="button"
              onClick={handleForgetDevice}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-rose-300"
            >
              ลืม PIN / ล้างสิทธิ์ผู้จัดจากอุปกรณ์นี้
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

