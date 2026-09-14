import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Lock,
  KeyRound,
  AlertCircle,
  CreditCard,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Player } from '../types';
import { getPlayerVerificationCode, verifyPlayerCode, getMaskedCodeHint } from '../utils/security';

interface PaymentConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
  cost: number;
  costBreakdown?: string;
  isMarkingPaid: boolean;
  isOrganizerMode?: boolean;
  organizerPin?: string;
  onConfirm: (pinUsed?: string) => void;
}

export const PaymentConfirmModal: React.FC<PaymentConfirmModalProps> = ({
  isOpen,
  onClose,
  player,
  cost,
  costBreakdown,
  isMarkingPaid,
  isOrganizerMode = false,
  organizerPin = '1234',
  onConfirm,
}) => {
  const [enteredCode, setEnteredCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isSelfConfirmed, setIsSelfConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [useOrganizerMasterPin, setUseOrganizerMasterPin] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEnteredCode('');
      setNewPin('');
      setIsSelfConfirmed(false);
      setErrorMessage('');
      setUseOrganizerMasterPin(false);
    }
  }, [isOpen, player]);

  if (!isOpen || !player) return null;

  const expectedCode = getPlayerVerificationCode(player);
  const hasVerificationCode = Boolean(expectedCode);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // If Organizer Mode, directly allow without forcing PIN entry
    if (isOrganizerMode && !useOrganizerMasterPin) {
      onConfirm(newPin.trim() ? newPin.trim() : undefined);
      if (isMarkingPaid) {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      }
      onClose();
      return;
    }

    // Member mode or Organizer Master Pin mode
    if (useOrganizerMasterPin) {
      if (enteredCode.trim() !== organizerPin.trim()) {
        setErrorMessage('❌ รหัสผ่านผู้จัดก๊วน (Master PIN) ไม่ถูกต้อง');
        return;
      }
    } else if (hasVerificationCode) {
      if (!enteredCode.trim()) {
        setErrorMessage('กรุณากรอกรหัส 4 หลักเพื่อยืนยันตัวตน');
        return;
      }
      const result = verifyPlayerCode(player, enteredCode, organizerPin);
      if (!result.isValid) {
        setErrorMessage('❌ รหัส 4 หลักไม่ถูกต้อง กรุณาตรวจสอบว่าเลือกถูกชื่อหรือไม่');
        return;
      }
    } else {
      // No code set yet
      if (!isSelfConfirmed && !newPin.trim()) {
        setErrorMessage('กรุณากดติ๊กถูกยืนยันตัวตน หรือตั้งรหัส PIN 4 หลัก');
        return;
      }
    }

    onConfirm(newPin.trim() ? newPin.trim() : undefined);
    if (isMarkingPaid) {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-5 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2.5 rounded-2xl text-xl shrink-0 ${
                isMarkingPaid
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {isMarkingPaid ? <CreditCard className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isMarkingPaid ? 'ยืนยันการชำระเงิน' : 'ยกเลิกสถานะการชำระเงิน'}
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>ระบบป้องกันการกดชื่อจ่ายผิด</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player Identity & Cost Card */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 shadow-inner">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${player.avatarColor} text-white font-bold flex items-center justify-center text-lg shadow-sm shrink-0`}
            >
              {player.nickname.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-white">{player.nickname}</span>
                {player.registrationType === 'walkin' ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                    Walk-in
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    สมาชิก
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                {player.fullName ? `ชื่อจริง: ${player.fullName}` : `เล่นไปแล้ว ${player.gamesPlayed} เกม`}
              </p>
            </div>
          </div>

          {/* Amount Box */}
          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">ยอดเงินที่ต้องชำระ:</span>
              <div className="text-2xl font-extrabold text-emerald-400">
                {cost.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
              </div>
            </div>
            {costBreakdown && (
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">รายละเอียด:</span>
                <span className="text-xs text-slate-300 font-medium">{costBreakdown}</span>
              </div>
            )}
          </div>
        </div>

        {/* Form Action */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isOrganizerMode ? (
            /* Organizer Direct Confirmation */
            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-800/50 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <span>👑 โหมดผู้จัดก๊วน (Organizer Verified)</span>
              </div>
              <p className="text-xs text-slate-300">
                {isMarkingPaid
                  ? `โปรดตรวจสอบว่า คุณ${player.nickname} ได้โอนเงินจำนวน ${cost} บาท ถูกต้องแล้ว`
                  : `คุณกำลังจะยกเลิกสถานะชำระเงินของ คุณ${player.nickname} กลับเป็น 'รอชำระเงิน'`}
              </p>
            </div>
          ) : (
            /* Member Verification (Requires 4-digit code or self-affirmation) */
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-200">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>ยืนยันตัวตนก่อนทำรายการ</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUseOrganizerMasterPin(!useOrganizerMasterPin)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 transition underline"
                >
                  {useOrganizerMasterPin ? 'ใช้รหัสสมาชิก' : 'ให้ผู้จัดช่วยยืนยัน'}
                </button>
              </div>

              {useOrganizerMasterPin ? (
                <div className="space-y-2">
                  <label className="block text-xs text-amber-300 font-medium">
                    ใส่รหัส Master PIN ของผู้จัดก๊วน:
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus
                    placeholder="รหัสผู้จัด 4 หลัก"
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value)}
                    className="w-full text-center tracking-widest text-lg font-mono py-2 px-3 rounded-xl bg-slate-900 border border-amber-600/50 text-white focus:outline-none focus:border-amber-400 font-bold"
                  />
                </div>
              ) : hasVerificationCode ? (
                <div className="space-y-2">
                  <label className="block text-xs text-slate-300">
                    กรอกรหัส 4 หลักของ คุณ <strong className="text-white">{player.nickname}</strong>:
                    <span className="block text-[11px] text-emerald-400 font-medium mt-0.5">
                      💡 {getMaskedCodeHint(player)}
                    </span>
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus
                    placeholder="ใส่เลข 4 ตัวท้าย เช่น 3344"
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full text-center tracking-widest text-lg font-mono py-2 px-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                  <p className="text-[10px] text-slate-500 text-center">
                    * ป้องกันไม่ให้สมาชิกคนอื่นเผลอกดชื่อจ่ายผิดคน
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5 text-blue-400" />
                      <span>ยังไม่มีรหัสเบอร์โทร/PIN บันทึกไว้</span>
                    </div>
                    <p className="text-[11px]">
                      ตั้งรหัส PIN 4 หลักเพื่อความปลอดภัยในการเช็คอินและจ่ายเงินครั้งต่อไป (ไม่บังคับ):
                    </p>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="ตั้ง PIN 4 หลัก เช่น 1234"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full text-center tracking-widest text-sm font-mono py-1.5 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 mt-1"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:bg-slate-900 transition">
                    <input
                      type="checkbox"
                      checked={isSelfConfirmed}
                      onChange={(e) => setIsSelfConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-0 w-4 h-4 bg-slate-950"
                    />
                    <span className="text-xs text-slate-300 leading-tight">
                      ฉันขอยืนยันว่าฉันคือ <strong className="text-emerald-400">{player.nickname}</strong> ตัวจริง และชำระยอด {cost} บาท ถูกต้อง
                    </span>
                  </label>
                </div>
              )}

              {errorMessage && (
                <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs text-center font-medium">
                  {errorMessage}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition shadow-md flex items-center justify-center gap-1.5 ${
                isMarkingPaid
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {isMarkingPaid ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ยืนยันชำระเงิน {cost}฿</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>ยืนยันยกเลิกชำระ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
