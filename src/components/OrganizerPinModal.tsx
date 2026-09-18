import React, { useEffect, useState } from 'react';
import {
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  X,
  Lock,
  Mail,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  LoaderCircle,
} from 'lucide-react';
import { auth, isOrganizerUid } from '../firebase';

interface OrganizerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const OrganizerPinModal: React.FC<OrganizerPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const restoreAnonymousSession = async () => {
    try {
      await signOut(auth);
    } catch {
      // Continue and restore anonymous member auth.
    }

    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Unable to restore anonymous member session', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setErrorMsg('กรุณากรอก Email และ Password ของผู้จัดก๊วน');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      if (!isOrganizerUid(credential.user.uid)) {
        await restoreAnonymousSession();
        setPassword('');
        setErrorMsg('บัญชีนี้ Login ได้ แต่ไม่ได้รับสิทธิ์ Organizer ของก๊วนกวน');
        return;
      }

      setPassword('');
      onSuccess();
      onClose();
    } catch (error) {
      const code = (error as { code?: string })?.code;

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg('Email หรือ Password ไม่ถูกต้อง');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('มีการ Login ผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่');
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg('ไม่สามารถเชื่อมต่อ Firebase Authentication ได้ กรุณาตรวจสอบ Internet');
      } else {
        console.error('Organizer Firebase login failed', error);
        setErrorMsg('Login ผู้จัดไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-scale-up">
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Organizer Login</h3>
              <p className="text-[10px] text-slate-400">Firebase Authentication</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* GUANGUAN_ORGANIZER_LOGO_V23B */}
          <div className="flex flex-col items-center text-center gap-2 pb-1">
            <img
              src="/icons/pwa-192x192.png"
              alt="GuanGuan Organizer"
              className="w-20 h-20 rounded-2xl object-cover shadow-xl ring-1 ring-amber-300/30"
            />
            <div>
              <div className="text-sm font-black text-white tracking-tight">GuanGuan</div>
              <div className="text-[10px] font-extrabold tracking-[0.2em] text-amber-400">ORGANIZER</div>
            </div>
          </div>
          <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/50 p-3 text-xs text-emerald-200">
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>
                สิทธิ์ผู้จัดตรวจสอบด้วย Firebase Account และ UID ไม่ใช้ PIN 1234
                เป็นตัวอนุญาต Organizer Mode แล้ว
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-amber-400" />
              <span>Email ผู้จัดก๊วน</span>
            </label>
            <input
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="organizer@example.com"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>Password</span>
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="กรอก Password"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-50"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !email.trim() || !password}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลัง Login...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>เข้าสู่ Organizer</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            สมาชิกทั่วไปไม่ต้อง Login เอง ระบบจะใช้ Anonymous Authentication ให้อัตโนมัติ
          </p>
        </form>
      </div>
    </div>
  );
};
