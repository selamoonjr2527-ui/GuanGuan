import React, { useState } from 'react';
import { 
  ShieldCheck, UserPlus, LogIn, Lock, AlertCircle, Sparkles, Check, Phone, KeyRound 
} from 'lucide-react';
import { Player, SkillLevel } from '../types';
import { verifyPlayerCode, getPlayerVerificationCode, getMaskedCodeHint } from '../utils/security';
import { isNicknameDuplicate, getDuplicatePlayer, generateNicknameSuggestions } from '../utils/nameValidation';

interface MemberGateModalProps {
  isOpen: boolean;
  players: Player[];
  organizerPin?: string;
  onSelectAndVerifyMember: (player: Player, pinUsed?: string) => void;
  onQuickAddWalkIn: (
    name: string,
    skillLevel?: SkillLevel,
    registrationType?: 'registered' | 'walkin',
    phone?: string,
    pin?: string
  ) => void;
  onOpenOrganizerLogin: () => void;
}

export const MemberGateModal: React.FC<MemberGateModalProps> = ({
  isOpen,
  players,
  organizerPin = '1234',
  onSelectAndVerifyMember,
  onQuickAddWalkIn,
  onOpenOrganizerLogin,
}) => {
  const [mode, setMode] = useState<'select_member' | 'walk_in'>('select_member');

  // Member select state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPinSetup, setNewPinSetup] = useState('');
  const [isSelfConfirmed, setIsSelfConfirmed] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Walk-in state
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInPin, setWalkInPin] = useState('');
  const [walkInSkill, setWalkInSkill] = useState<SkillLevel>('B');
  const [walkInError, setWalkInError] = useState('');

  if (!isOpen) return null;

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const expectedCode = selectedPlayer ? getPlayerVerificationCode(selectedPlayer) : null;
  const maskedHint = selectedPlayer ? getMaskedCodeHint(selectedPlayer) : '';

  // Handle member identification submit
  const handleMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError('');

    if (!selectedPlayer) {
      setMemberError('กรุณาคลิกเลือกชื่อเล่นของคุณจากรายชื่อ');
      return;
    }

    if (expectedCode) {
      if (!verificationCode.trim()) {
        setMemberError('กรุณากรอกรหัส 4 หลักเพื่อยืนยันความเป็นเจ้าของชื่อ');
        return;
      }
      const verifyRes = verifyPlayerCode(selectedPlayer, verificationCode.trim(), organizerPin);
      if (!verifyRes.isValid) {
        setMemberError('❌ รหัส 4 หลักไม่ถูกต้อง (กรุณาใช้ 4 ตัวท้ายเบอร์โทร หรือ PIN ส่วนตัว)');
        return;
      }
    } else {
      // Member doesn't have PIN or phone yet, require checking self-confirmation or setting a new 4-digit PIN
      if (!isSelfConfirmed && !newPinSetup.trim()) {
        setMemberError('กรุณากดติ๊กถูกยืนยันว่าเป็นตัวจริง หรือตั้งรหัส PIN 4 หลักป้องกันคนอื่นกดแทน');
        return;
      }
      if (newPinSetup.trim() && newPinSetup.trim().length !== 4) {
        setMemberError('รหัส PIN ต้องเป็นตัวเลข 4 หลัก');
        return;
      }
    }

    onSelectAndVerifyMember(
      selectedPlayer,
      newPinSetup.trim() ? newPinSetup.trim() : verificationCode.trim() || undefined
    );
  };

  // Handle Walk-in submit
  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWalkInError('');

    const trimmedName = walkInName.trim();
    if (!trimmedName) {
      setWalkInError('กรุณาระบุชื่อเล่น');
      return;
    }

    if (isNicknameDuplicate(trimmedName, players)) {
      const suggestions = generateNicknameSuggestions(trimmedName, players);
      const suggestStr = suggestions.length > 0 ? ` (เช่น "${suggestions[0]}")` : '';
      setWalkInError(`ชื่อ "${trimmedName}" ซ้ำกับผู้เล่นในระบบแล้ว กรุณาเติมเลขต่อท้าย${suggestStr}`);
      return;
    }

    if (walkInPin.trim() && walkInPin.trim().length !== 4) {
      setWalkInError('รหัส PIN ส่วนตัวต้องมี 4 หลักพอดี');
      return;
    }

    onQuickAddWalkIn(
      trimmedName,
      walkInSkill,
      'walkin',
      walkInPhone.trim() || undefined,
      walkInPin.trim() || undefined
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-5 sm:p-7 space-y-5 shadow-2xl my-auto text-white relative">
        {/* Top Header Badge */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/30 border border-emerald-500/40 text-3xl shadow-inner mb-1">
            🏸
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              ระบบเช็คอินก๊วนแบดมินตัน
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
            เข้าใช้งานได้เฉพาะ <strong className="text-emerald-300">สมาชิกก๊วน</strong> หรือผู้ที่ <strong className="text-amber-300">Walk-in</strong> มาแล้วเท่านั้น เพื่อความปลอดภัยและป้องกันการกดแทนกัน
          </p>
        </div>

        {/* Tab Switcher: Select Member vs Walk-in */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode('select_member');
              setMemberError('');
            }}
            className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-2 ${
              mode === 'select_member'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>1. เลือกชื่อสมาชิกในก๊วน</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('walk_in');
              setWalkInError('');
            }}
            className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-2 ${
              mode === 'walk_in'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>2. ลงทะเบียน Walk-in</span>
          </button>
        </div>

        {/* MODE 1: Select Member with PIN / Phone 4-digit verification */}
        {mode === 'select_member' && (
          <form onSubmit={handleMemberSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>คลิกเลือกชื่อเล่นของคุณ:</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  (มีสมาชิก {players.length} คน)
                </span>
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => {
                  setSelectedPlayerId(e.target.value);
                  setVerificationCode('');
                  setMemberError('');
                  setIsSelfConfirmed(false);
                  setNewPinSetup('');
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400 transition"
              >
                <option value="">-- แตะเพื่อเลือกชื่อเล่นของคุณ --</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname} ({p.registrationType === 'walkin' ? 'Walk-in' : 'สมาชิก'} • {p.isCheckedIn ? 'เช็คอินแล้ว' : 'ยังไม่มา'})
                  </option>
                ))}
              </select>
            </div>

            {/* If Member is Selected */}
            {selectedPlayer && (
              <div className="p-4 bg-slate-950/80 border border-indigo-500/30 rounded-2xl space-y-3 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedPlayer.avatarColor} text-white font-black text-lg flex items-center justify-center shrink-0`}>
                    {selectedPlayer.nickname.slice(0, 1)}
                  </div>
                  <div>
                    <div className="font-extrabold text-white text-sm">
                      คุณ {selectedPlayer.nickname}
                    </div>
                    <div className="text-xs text-slate-400">
                      {selectedPlayer.fullName || (selectedPlayer.registrationType === 'walkin' ? 'Walk-in หน้าสนาม' : 'สมาชิกในก๊วน')}
                    </div>
                  </div>
                </div>

                {/* Case A: Member already has code (phone 4 digits or custom PIN) */}
                {expectedCode ? (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>ใส่รหัสยืนยัน 4 หลัก:</span>
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>คำใบ้: {maskedHint}</span>
                    </p>
                  </div>
                ) : (
                  /* Case B: Member doesn't have code set yet */
                  <div className="space-y-3 pt-2 border-t border-slate-800">
                    <div className="p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-500/30 text-xs text-indigo-200 flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>ยังไม่มีรหัส 4 หลัก: คุณสามารถกดติ๊กถูกยืนยัน หรือตั้งรหัส PIN 4 หลักเพื่อป้องกันคนอื่นกดแทนในอนาคต</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ตั้งรหัส PIN 4 หลักของคุณ (แนะนำ):</span>
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="เลข 4 หลัก เช่น 1122"
                        value={newPinSetup}
                        onChange={(e) => setNewPinSetup(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-center font-mono tracking-widest text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={isSelfConfirmed}
                        onChange={(e) => setIsSelfConfirmed(e.target.checked)}
                        className="w-4 h-4 text-emerald-500 rounded bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-slate-300">
                        ขอยืนยันว่าฉันคือ <strong>{selectedPlayer.nickname}</strong> ตัวจริง
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {memberError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600/50 text-xs text-rose-200 flex items-start gap-2 shadow-sm animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{memberError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedPlayer}
              className={`w-full py-3 rounded-2xl font-extrabold text-sm transition shadow-lg flex items-center justify-center gap-2 ${
                selectedPlayer
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>เข้าสู่ระบบในชื่อของคุณ ✅</span>
            </button>
          </form>
        )}

        {/* MODE 2: Quick Walk-in Registration */}
        {mode === 'walk_in' && (
          <form onSubmit={handleWalkInSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                ชื่อเล่นของคุณ: <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="เช่น บาส, ต้อม, บอล"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>เบอร์โทรศัพท์ (ถ้ามี):</span>
                </label>
                <input
                  type="tel"
                  placeholder="08x-xxx-xxxx"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>รหัส PIN 4 หลัก (สำหรับป้องกัน):</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="เช่น 1234"
                  value={walkInPin}
                  onChange={(e) => setWalkInPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-center font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                ประเมินระดับฝีมือคร่าวๆ:
              </label>
              <select
                value={walkInSkill}
                onChange={(e) => setWalkInSkill(e.target.value as SkillLevel)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="Newbie">มือใหม่ (Newbie) - กำลังเริ่มเล่น</option>
                <option value="C">มือ C - เริ่มพัฒนา เซฟถึงหลังพอได้</option>
                <option value="B">มือ B - มือกลางมาตรฐานประจำก๊วน</option>
                <option value="A">มือ A - มือแน่น ตบหนัก ดักหน้าเน็ตแม่น</option>
                <option value="PRO">มือ PRO - ระดับนักกีฬา / แข่งขัน</option>
              </select>
            </div>

            {walkInError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600/50 text-xs text-rose-200 flex items-start gap-2 shadow-sm animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{walkInError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-sm transition shadow-lg flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>ลงทะเบียน Walk-in และเข้าใช้งานทันที 🚶</span>
            </button>
          </form>
        )}

        {/* Organizer Admin Unlock Footer */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>สำหรับผู้จัดก๊วน (แอดมิน):</span>
          <button
            type="button"
            onClick={onOpenOrganizerLogin}
            className="text-amber-400 hover:text-amber-300 font-bold underline transition"
          >
            เข้าสู่ระบบด้วยรหัส PIN ผู้จัด 👑
          </button>
        </div>
      </div>
    </div>
  );
};
