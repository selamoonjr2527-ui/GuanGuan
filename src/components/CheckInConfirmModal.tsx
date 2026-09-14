import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  KeyRound,
  ShieldCheck,
  UserCheck,
  LogOut,
  Info,
} from 'lucide-react';
import { Player, PlayerStatus, SKILL_LEVELS } from '../types';
import { getPlayerVerificationCode, getMaskedCodeHint, verifyPlayerCode } from '../utils/security';

export interface CheckInConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
  actionType: 'checkin' | 'checkout' | 'status_change';
  targetStatus?: PlayerStatus;
  organizerPin?: string;
  isOrganizerMode?: boolean;
  showSkill?: boolean;
  onConfirm: (player: Player, newPin?: string) => void;
}

export const CheckInConfirmModal: React.FC<CheckInConfirmModalProps> = ({
  isOpen,
  onClose,
  player,
  actionType,
  targetStatus,
  organizerPin = '1234',
  isOrganizerMode = false,
  showSkill = false,
  onConfirm,
}) => {
  const [enteredCode, setEnteredCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isSelfConfirmed, setIsSelfConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEnteredCode('');
      setNewPin('');
      setIsSelfConfirmed(false);
      setErrorMessage('');
    }
  }, [isOpen, player]);

  if (!isOpen || !player) return null;

  const expectedCode = getPlayerVerificationCode(player);
  const hasExpectedCode = !!expectedCode;
  const maskedHint = getMaskedCodeHint(player);
  const skillMeta = SKILL_LEVELS[player.skillLevel];

  const handleConfirmAction = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // If in Organizer mode, organizer can bypass verification code
    if (isOrganizerMode) {
      onConfirm(player, newPin.trim() ? newPin.trim() : undefined);
      onClose();
      return;
    }

    // If player has an expected code (phone or pin)
    if (hasExpectedCode) {
      if (!enteredCode.trim()) {
        setErrorMessage('กรุณากรอกรหัส 4 หลักเพื่อยืนยันตัวตน');
        return;
      }

      const result = verifyPlayerCode(player, enteredCode, organizerPin);
      if (!result.isValid) {
        setErrorMessage(
          '❌ รหัส 4 หลักไม่ถูกต้อง กรุณาตรวจสอบว่าเลือกถูกชื่อหรือไม่ หรือให้ผู้จัดช่วยยืนยัน'
        );
        return;
      }
    } else {
      // Player does not have phone or pin
      if (!isSelfConfirmed && !newPin.trim()) {
        setErrorMessage('กรุณากดติ๊กถูกยืนยันตัวตน หรือตั้งรหัส 4 หลักก่อนดำเนินการ');
        return;
      }
    }

    onConfirm(player, newPin.trim() ? newPin.trim() : undefined);
    onClose();
  };

  const getActionTitle = () => {
    if (actionType === 'checkin') {
      return {
        title: 'ยืนยันการเช็คอิน (Check-in)',
        subtitle: 'ตรวจสอบรายชื่อและยืนยันตัวตนเพื่อเข้าสู่คิวพร้อมลงเล่น',
        badge: '🟢 ยืนยันตัวตนก่อนเข้าคิว',
        buttonText: '✅ ยืนยันเช็คอินเข้าคิว',
        buttonColor: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
      };
    }
    if (actionType === 'checkout') {
      return {
        title: 'ยืนยันการเช็คเอาท์ / ยกเลิกเช็คอิน',
        subtitle: 'ป้องกันการกดผิดชื่อ เพื่อไม่ให้ผู้เล่นอื่นหลุดออกจากคิว',
        badge: '🔴 ยืนยันตัวตนก่อนนำออกจากคิว',
        buttonText: '🚗 ยืนยันเช็คเอาท์ (ออกจากคิว)',
        buttonColor: 'bg-rose-500 hover:bg-rose-400 text-white',
      };
    }
    return {
      title: 'ยืนยันการเปลี่ยนสถานะผู้เล่น',
      subtitle: `เปลี่ยนสถานะเป็น "${
        targetStatus === 'waiting'
          ? 'พร้อมลงคิว'
          : targetStatus === 'resting'
          ? 'พักเหนื่อย'
          : 'กลับแล้ว'
      }"`,
      badge: '🔄 ยืนยันการเปลี่ยนสถานะ',
      buttonText: 'ยืนยันเปลี่ยนสถานะ',
      buttonColor: 'bg-blue-600 hover:bg-blue-500 text-white',
    };
  };

  const config = getActionTitle();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-5 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3.5 gap-2">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${
                actionType === 'checkin'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : actionType === 'checkout'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              }`}
            >
              {actionType === 'checkin' ? (
                <UserCheck className="w-5 h-5" />
              ) : actionType === 'checkout' ? (
                <LogOut className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">{config.title}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                  {config.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{config.subtitle}</p>
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

        {/* Player Identity Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-inner">
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${player.avatarColor} text-white font-bold flex items-center justify-center text-xl shadow-md shrink-0 border border-white/10`}
          >
            {player.nickname.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-extrabold text-white truncate">
                {player.nickname}
              </span>
              {player.gender === 'female' && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-pink-950 text-pink-400 border border-pink-800">
                  หญิง
                </span>
              )}
              {player.registrationType === 'walkin' ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                  🚶 Walk-in
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  📋 ลงชื่อล่วงหน้า
                </span>
              )}
            </div>

            {player.fullName && (
              <p className="text-xs text-slate-300 mt-0.5 truncate">
                ชื่อจริง: <span className="text-white font-medium">{player.fullName}</span>
              </p>
            )}

            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
              <span>เล่นแล้ว: <strong className="text-white">{player.gamesPlayed}</strong> เกม</span>
              <span>•</span>
              {showSkill ? (
                <span className={`font-semibold ${skillMeta.color}`}>
                  มือ {player.skillLevel}
                </span>
              ) : (
                <span className="text-slate-400">
                  {player.isCheckedIn ? 'มาสนามแล้ว' : 'ยังไม่มา'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Warning if checkout */}
        {actionType === 'checkout' && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-rose-200">ข้อควรระวังในการเช็คเอาท์:</div>
              <p className="text-[11px] text-rose-300/90 leading-relaxed">
                การเช็คเอาท์จะนำชื่อคุณออกจากคิวรอเล่นทั้งหมด และหากชื่ออยู่ในคิวเตรียมพร้อม (Pre-Match) จะถูกยกเลิกทันทีเพื่อไม่ให้เกมในสนามสะดุด
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleConfirmAction} className="space-y-4">
          {/* Security Verification Section */}
          <div className="space-y-3 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>ระบบป้องกันการกดผิดชื่อ (Identity Protection)</span>
            </div>

            {isOrganizerMode ? (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>คุณอยู่ใน <strong>โหมดผู้จัดก๊วน</strong> สามารถกดยืนยันได้ทันทีโดยไม่ต้องใส่ PIN</span>
              </div>
            ) : hasExpectedCode ? (
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">
                  กรุณากรอกรหัส 4 หลัก เพื่อยืนยันว่าเป็นคุณ:
                  <span className="block text-[11px] text-emerald-400 mt-0.5 font-medium">
                    💡 คำใบ้: {maskedHint}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoFocus
                    placeholder="ใส่เลข 4 ตัวท้าย เช่น 3344"
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full text-center tracking-widest text-lg font-mono py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>
                <p className="text-[10px] text-slate-500 text-center">
                  * หากจำเลขไม่ได้ ให้แจ้งผู้จัดก๊วนเพื่อช่วยตรวจสอบหรือปลดล็อก
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                    <Info className="w-3.5 h-3.5 text-blue-400" />
                    <span>สมาชิกท่านนี้ยังไม่ได้ผูกเบอร์โทรศัพท์หรือ PIN</span>
                  </div>
                  <p className="text-[11px]">
                    คุณสามารถตั้งรหัส 4 หลักไว้ใช้ป้องกันคนอื่นกดแทนในครั้งต่อไปได้ (ไม่บังคับ):
                  </p>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="ตั้ง PIN 4 หลัก (เช่น 1234)"
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
                    ฉันขอยืนยันว่าฉันคือ <strong className="text-emerald-400">{player.nickname}</strong> ตัวจริง และไม่ได้กดกระทำแทนผู้อื่น
                  </span>
                </label>
              </div>
            )}

            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs text-center font-medium animate-shake">
                {errorMessage}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              ยกเลิก / ไม่ใช่ฉัน
            </button>

            <button
              type="submit"
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition shadow-md flex items-center justify-center gap-1.5 ${config.buttonColor}`}
            >
              <span>{config.buttonText}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
