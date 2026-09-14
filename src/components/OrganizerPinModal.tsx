import React, { useState } from 'react';
import { X, Lock, KeyRound, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface OrganizerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  correctPin: string;
  onSuccess: () => void;
}

export const OrganizerPinModal: React.FC<OrganizerPinModalProps> = ({
  isOpen,
  onClose,
  correctPin,
  onSuccess,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === correctPin.trim()) {
      setErrorMsg(null);
      setPinInput('');
      onSuccess();
      onClose();
    } else {
      setErrorMsg('รหัส PIN ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">ยืนยันสิทธิ์ผู้จัดก๊วน (Admin)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            ระบบซ่อนระดับมือและผลประเมินไว้ เพื่อให้เห็นเฉพาะผู้จัดก๊วนเท่านั้น กรุณากรอกรหัส PIN ผู้จัด 4 หลัก เพื่อปลดล็อค
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>รหัส PIN ผู้จัดก๊วน:</span>
            </label>
            <input
              type="password"
              maxLength={8}
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="กรอกรหัส PIN (เช่น 1234)"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest text-white focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[11px] text-slate-400 text-center">
              (รหัสเริ่มต้น: <strong className="text-amber-300">1234</strong> หรือรหัสที่คุณตั้งไว้ในเมนูตั้งค่า)
            </p>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow"
            >
              ปลดล็อคผู้จัด
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
