import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Player } from '../types';

interface MemberPinModalProps {
  isOpen: boolean;
  player: Player | null;
  onClose: () => void;
  onSavePin: (playerId: string, newPin: string) => void;
}

const safeDigits = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  try {
    return String(value).replace(/\D/g, '');
  } catch {
    return '';
  }
};

export const MemberPinModal: React.FC<MemberPinModalProps> = ({
  isOpen,
  player,
  onClose,
  onSavePin,
}) => {
  const [currentCode, setCurrentCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isOpen) return;

    setCurrentCode('');
    setNewPin('');
    setConfirmPin('');
    setErrorMsg('');
    setSuccessMsg('');
    setShowPins(false);
    setFailedAttempts(0);
    setLockedUntil(0);
    setNow(Date.now());
  }, [isOpen, player?.id]);

  useEffect(() => {
    if (!isOpen || lockedUntil <= Date.now()) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, lockedUntil]);

  const verification = useMemo(() => {
    const pin = safeDigits((player as any)?.pin);
    if (pin.length === 4) {
      return {
        expected: pin,
        label: 'PIN ปัจจุบัน 4 หลัก',
        source: 'pin' as const,
      };
    }

    const phone = safeDigits((player as any)?.phone);
    if (phone.length >= 4) {
      return {
        expected: phone.slice(-4),
        label: 'เลข 4 ตัวท้ายของเบอร์โทร',
        source: 'phone' as const,
      };
    }

    return {
      expected: '',
      label: '',
      source: 'none' as const,
    };
  }, [player]);

  if (!isOpen || !player || typeof document === 'undefined') return null;

  const remainingLockSeconds = Math.max(
    0,
    Math.ceil((lockedUntil - now) / 1000)
  );
  const isLocked = remainingLockSeconds > 0;

  const handleWrongCode = () => {
    const nextAttempts = failedAttempts + 1;

    if (nextAttempts >= 5) {
      const until = Date.now() + 60_000;
      setFailedAttempts(0);
      setLockedUntil(until);
      setNow(Date.now());
      setErrorMsg('กรอกรหัสผิดหลายครั้ง • ล็อกชั่วคราว 60 วินาที');
      return;
    }

    setFailedAttempts(nextAttempts);
    setErrorMsg(
      `รหัสปัจจุบันไม่ถูกต้อง • เหลืออีก ${5 - nextAttempts} ครั้งก่อนล็อกชั่วคราว`
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (isLocked) {
      setErrorMsg(`กรุณารอ ${remainingLockSeconds} วินาทีก่อนลองใหม่`);
      return;
    }

    if (!verification.expected) {
      setErrorMsg(
        'สมาชิกคนนี้ยังไม่มี PIN หรือเบอร์โทรสำหรับยืนยัน กรุณาให้ผู้จัด Reset PIN ให้ก่อน'
      );
      return;
    }

    if (!/^\d{4}$/.test(currentCode)) {
      setErrorMsg(`กรุณากรอก${verification.label}ให้ครบ 4 หลัก`);
      return;
    }

    if (currentCode !== verification.expected) {
      handleWrongCode();
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      setErrorMsg('PIN ใหม่ต้องเป็นตัวเลข 4 หลัก');
      return;
    }

    if (newPin !== confirmPin) {
      setErrorMsg('PIN ใหม่และยืนยัน PIN ไม่ตรงกัน');
      return;
    }

    if (verification.source === 'pin' && newPin === verification.expected) {
      setErrorMsg('PIN ใหม่ต้องไม่ซ้ำกับ PIN ปัจจุบัน');
      return;
    }

    onSavePin(player.id, newPin);
    setSuccessMsg('เปลี่ยน PIN สำเร็จแล้ว ✓');
    setCurrentCode('');
    setNewPin('');
    setConfirmPin('');
    setFailedAttempts(0);
    setLockedUntil(0);

    window.setTimeout(() => {
      onClose();
    }, 900);
  };

  const modal = (
    <div className="fixed inset-0 z-[22000] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[26px] border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-cyan-950/25 to-slate-900 flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>

          <div className="flex-1">
            <h3 className="text-base font-black text-white">เปลี่ยน PIN สมาชิก</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {player.nickname} • PIN สำหรับเข้าใช้งานสมาชิก
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-slate-700 bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-300 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl bg-emerald-950/20 border border-emerald-800/40 p-3 flex items-start gap-2 text-xs text-emerald-200">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              ต้องยืนยัน{' '}
              <strong>
                {verification.source === 'pin'
                  ? 'PIN เดิม'
                  : verification.source === 'phone'
                  ? 'เลข 4 ตัวท้ายเบอร์โทร'
                  : 'ตัวตน'}
              </strong>{' '}
              ก่อนเปลี่ยน PIN ใหม่
            </span>
          </div>

          {verification.source === 'none' ? (
            <div className="rounded-xl bg-amber-950/30 border border-amber-800/50 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                ไม่มี PIN/เบอร์โทรที่ใช้ยืนยันได้ กรุณาแจ้งผู้จัดให้ Reset PIN จาก Member Center
              </span>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[11px] font-bold text-slate-300">
                  {verification.label}
                </label>
                <input
                  type={showPins ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  disabled={isLocked}
                  value={currentCode}
                  onChange={(e) =>
                    setCurrentCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="••••"
                  className="mt-1 w-full h-12 rounded-xl bg-slate-950 border border-slate-700 px-3 text-center text-xl tracking-[0.5em] pl-[0.5em] font-black font-mono text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300">
                    PIN ใหม่
                  </label>
                  <input
                    type={showPins ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    disabled={isLocked}
                    value={newPin}
                    onChange={(e) =>
                      setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="••••"
                    className="mt-1 w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-center text-lg tracking-[0.4em] pl-[0.4em] font-black font-mono text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300">
                    ยืนยัน PIN ใหม่
                  </label>
                  <input
                    type={showPins ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    disabled={isLocked}
                    value={confirmPin}
                    onChange={(e) =>
                      setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="••••"
                    className="mt-1 w-full h-11 rounded-xl bg-slate-950 border border-slate-700 px-3 text-center text-lg tracking-[0.4em] pl-[0.4em] font-black font-mono text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPins}
                  onChange={(e) => setShowPins(e.target.checked)}
                />
                {showPins ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                แสดงตัวเลขชั่วคราว
              </label>
            </>
          )}

          {isLocked && (
            <div className="rounded-xl bg-rose-950/50 border border-rose-700/50 p-3 text-xs text-rose-200">
              🔒 ล็อกชั่วคราว • ลองใหม่ได้ใน {remainingLockSeconds} วินาที
            </div>
          )}

          {errorMsg && !isLocked && (
            <div className="rounded-xl bg-rose-950/50 border border-rose-700/50 p-3 text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl bg-emerald-950/50 border border-emerald-700/50 p-3 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={
                verification.source === 'none' ||
                isLocked ||
                Boolean(successMsg)
              }
              className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-black"
            >
              บันทึก PIN ใหม่
            </button>
          </div>

          <p className="text-[10px] text-slate-500 text-center">
            เพื่อให้เข้ากับระบบ Login สมาชิกปัจจุบัน PIN ใช้ตัวเลข 4 หลัก
          </p>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
