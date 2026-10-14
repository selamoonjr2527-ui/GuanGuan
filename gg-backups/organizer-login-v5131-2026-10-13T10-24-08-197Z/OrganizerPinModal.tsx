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

type AccessMode = 'email' | 'setup_pin' | 'pin';

const QUICK_PIN_HASH_KEY =
  'guanguan_organizer_quick_pin_hash_v61';

const hashPin = async (pin: string): Promise<string> => {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
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

  const refreshMode = () => {
    const isTrustedFirebaseUser = isOrganizerUid(
      auth.currentUser?.uid
    );
    const hasQuickPin =
      typeof window !== 'undefined' &&
      Boolean(localStorage.getItem(QUICK_PIN_HASH_KEY));

    if (isTrustedFirebaseUser) {
      setMode(hasQuickPin ? 'pin' : 'setup_pin');
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
    setError('');
    setPassword('');
    setPin('');
    setPinConfirm('');
    onSuccess();
    onClose();
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

      const hasQuickPin =
        typeof window !== 'undefined' &&
        Boolean(localStorage.getItem(QUICK_PIN_HASH_KEY));

      if (hasQuickPin) {
        // Email was just verified, so this login can enter immediately.
        finishSuccess();
      } else {
        setPassword('');
        setMode('setup_pin');
      }
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
      localStorage.setItem(QUICK_PIN_HASH_KEY, hash);
      finishSuccess();
    } catch (pinError) {
      console.error('Failed to create Organizer Quick PIN', pinError);
      setError('ไม่สามารถสร้าง Quick PIN ได้');
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
      const savedHash = localStorage.getItem(
        QUICK_PIN_HASH_KEY
      );

      if (!savedHash) {
        setMode('setup_pin');
        return;
      }

      const inputHash = await hashPin(pin);

      if (inputHash !== savedHash) {
        setError('Quick PIN ไม่ถูกต้อง');
        return;
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
    <div className="fixed inset-0 z-[2147483500] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md">
      {/* ORGANIZER_QUICK_PIN_V61 */}
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/40 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/15 p-2 text-amber-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-black text-white">
                Organizer Access
              </div>
              <div className="text-[10px] text-slate-400">
                Firebase Auth + Quick PIN
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

        {mode === 'email' && (
          <form
            onSubmit={handleEmailLogin}
            className="space-y-4 p-5"
          >
            <div className="rounded-2xl border border-cyan-800/50 bg-cyan-950/25 p-3 text-xs leading-5 text-cyan-100">
              🔐 อุปกรณ์ใหม่ต้องยืนยัน Firebase Organizer ด้วย
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
              ✅ Firebase Organizer ยืนยันแล้ว
              <br />
              ตั้ง <strong>Quick PIN 6 หลัก</strong>
              สำหรับอุปกรณ์นี้ ครั้งต่อไปไม่ต้องกรอก Email
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
              👑 อุปกรณ์นี้เคยยืนยัน Organizer แล้ว
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
              👑 เข้าโหมดผู้จัด
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

