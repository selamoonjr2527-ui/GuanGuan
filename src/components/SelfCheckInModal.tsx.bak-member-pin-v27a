import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  X,
  CheckCircle2,
  UserCheck,
  Search,
  Sparkles,
  UserPlus,
  ShieldCheck,
  Lock,
  ArrowLeft,
  KeyRound,
  AlertCircle,
  Phone,
} from 'lucide-react';
import { Player, SkillLevel, SKILL_LEVELS } from '../types';
import { getPlayerVerificationCode, getMaskedCodeHint, verifyPlayerCode } from '../utils/security';
import {
  isNicknameDuplicate,
  getDuplicatePlayer,
  generateNicknameSuggestions,
} from '../utils/nameValidation';

interface SelfCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  organizerPin?: string;
  onCheckInPlayer: (playerId: string, pin?: string) => void;
  onQuickAddAndCheckIn: (
    name: string,
    skillLevel?: SkillLevel,
    registrationType?: 'registered' | 'walkin',
    phone?: string,
    pin?: string
  ) => void;
}

export const SelfCheckInModal: React.FC<SelfCheckInModalProps> = ({
  isOpen,
  onClose,
  players,
  organizerPin = '1234',
  onCheckInPlayer,
  onQuickAddAndCheckIn,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isSelfConfirmed, setIsSelfConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Walk-in form
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInSkill, setWalkInSkill] = useState<SkillLevel>('B');
  const [walkInError, setWalkInError] = useState('');
  const [checkedSuccessName, setCheckedSuccessName] = useState<string | null>(null);

  // Walk-in Duplicate check
  const trimmedWalkIn = walkInName.trim();
  const isWalkInDuplicate = Boolean(trimmedWalkIn && isNicknameDuplicate(trimmedWalkIn, players));
  const walkInDupPlayer = isWalkInDuplicate ? getDuplicatePlayer(trimmedWalkIn, players) : undefined;
  const walkInSuggestions = isWalkInDuplicate ? generateNicknameSuggestions(trimmedWalkIn, players) : [];

  if (!isOpen) return null;

  const unCheckedPlayers = players.filter(
    (p) =>
      !p.isCheckedIn &&
      (p.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.fullName && p.fullName.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  const handleSelectPlayerToVerify = (player: Player) => {
    setSelectedPlayer(player);
    setVerificationCode('');
    setNewPin('');
    setIsSelfConfirmed(false);
    setErrorMessage('');
  };

  const handleBackToSearch = () => {
    setSelectedPlayer(null);
    setVerificationCode('');
    setNewPin('');
    setIsSelfConfirmed(false);
    setErrorMessage('');
  };

  const handleConfirmCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) return;
    setErrorMessage('');

    const expectedCode = getPlayerVerificationCode(selectedPlayer);

    // Verify code if player has phone or pin
    if (expectedCode) {
      if (!verificationCode.trim()) {
        setErrorMessage('กรุณากรอกรหัส 4 หลักเพื่อยืนยันตัวตน');
        return;
      }
      const result = verifyPlayerCode(selectedPlayer, verificationCode, organizerPin);
      if (!result.isValid) {
        setErrorMessage('❌ รหัส 4 หลักไม่ถูกต้อง ตรวจสอบว่าเลือกถูกชื่อหรือไม่');
        return;
      }
    } else {
      // No code set yet
      if (!isSelfConfirmed && !newPin.trim()) {
        setErrorMessage('กรุณากดติ๊กถูกยืนยันตัวตน หรือตั้งรหัส PIN 4 หลัก');
        return;
      }
    }

    onCheckInPlayer(selectedPlayer.id, newPin.trim() ? newPin.trim() : undefined);
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
    });
    setCheckedSuccessName(selectedPlayer.nickname);
    setSelectedPlayer(null);
    setTimeout(() => setCheckedSuccessName(null), 3000);
  };

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWalkInError('');
    if (!trimmedWalkIn) return;

    if (isWalkInDuplicate) {
      const suggestText = walkInSuggestions.length > 0 ? ` (แนะนำ: ${walkInSuggestions.join(', ')})` : '';
      setWalkInError(`ชื่อ "${trimmedWalkIn}" ซ้ำกับสมาชิกในระบบแล้ว กรุณาเติมตัวเลข เช่น "${walkInSuggestions[0] || trimmedWalkIn + ' 2'}" หรือระบุชื่ออื่น${suggestText}`);
      return;
    }

    onQuickAddAndCheckIn(
      trimmedWalkIn,
      walkInSkill,
      'walkin',
      walkInPhone.trim() || undefined
    );
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
    });
    setCheckedSuccessName(`${trimmedWalkIn} (Walk-in)`);
    setWalkInName('');
    setWalkInPhone('');
    setTimeout(() => setCheckedSuccessName(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 text-xl">
              🏸
            </div>
            <div>
              <h3 className="text-base font-bold text-white">เช็คอินหน้าสนามด้วยตัวเอง (Self Check-in)</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>มีระบบป้องกันการกดเช็คอินผิดชื่อ</span>
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

        {checkedSuccessName && (
          <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-700 text-emerald-300 text-center animate-bounce">
            <div className="text-2xl mb-1">🎉</div>
            <div className="font-bold text-sm">เช็คอินสำเร็จแล้ว: คุณ{checkedSuccessName}!</div>
            <div className="text-xs text-emerald-400/80">ระบบนำชื่อของคุณเข้าสู่คิวพร้อมลงสนามแล้วครับ</div>
          </div>
        )}

        {/* STEP 2: VERIFICATION SCREEN (If player selected) */}
        {selectedPlayer ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleBackToSearch}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>← ย้อนกลับไปค้นหาชื่อใหม่</span>
            </button>

            {/* Selected Player Identity Card */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center gap-3.5 shadow-inner">
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${selectedPlayer.avatarColor} text-white font-bold flex items-center justify-center text-xl shadow-md shrink-0`}
              >
                {selectedPlayer.nickname.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-extrabold text-white">
                    {selectedPlayer.nickname}
                  </span>
                  {selectedPlayer.registrationType === 'walkin' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                      🚶 Walk-in
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                      📋 ลงชื่อล่วงหน้า
                    </span>
                  )}
                </div>
                {selectedPlayer.fullName && (
                  <p className="text-xs text-slate-300 mt-0.5">
                    ชื่อจริง: <span className="text-white font-medium">{selectedPlayer.fullName}</span>
                  </p>
                )}
                <div className="text-[11px] text-slate-400 mt-1">
                  ลงเล่นไปแล้ว: <strong className="text-white">{selectedPlayer.gamesPlayed}</strong> เกม
                </div>
              </div>
            </div>

            <form onSubmit={handleConfirmCheckIn} className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>ยืนยันตัวตนเพื่อป้องกันการเช็คอินผิดชื่อ</span>
                </div>

                {getPlayerVerificationCode(selectedPlayer) ? (
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-300">
                      กรอกรหัส 4 หลักเพื่อยืนยันตัวตน:
                      <span className="block text-[11px] text-emerald-400 font-medium mt-0.5">
                        💡 {getMaskedCodeHint(selectedPlayer)}
                      </span>
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      autoFocus
                      placeholder="ใส่เลข 4 ตัวท้าย เช่น 3344"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full text-center tracking-widest text-lg font-mono py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 font-bold"
                    />
                    <p className="text-[10px] text-slate-500 text-center">
                      * หากจำเลขไม่ได้ ให้ติดต่อผู้จัดก๊วนเพื่อช่วยยืนยัน
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5 text-blue-400" />
                        <span>ยังไม่ได้ลงทะเบียนเบอร์โทรศัพท์/PIN</span>
                      </div>
                      <p className="text-[11px]">
                        สามารถตั้ง PIN 4 หลักไว้ใช้ป้องกันคนอื่นกดแทนในครั้งต่อไป (ไม่บังคับ):
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
                        ฉันขอยืนยันว่าฉันคือ <strong className="text-emerald-400">{selectedPlayer.nickname}</strong> ตัวจริง ไม่ได้กดแทนผู้อื่น
                      </span>
                    </label>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs text-center font-medium">
                    {errorMessage}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleBackToSearch}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  ยกเลิก / เลือกชื่อใหม่
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-md flex items-center justify-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>ยืนยันเช็คอินเข้าคิว</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* STEP 1: SEARCH & SELECT SCREEN */
          <div className="space-y-4">
            {/* Search input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="พิมพ์ชื่อเล่นของคุณเพื่อเช็คอิน..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Unchecked In Players List */}
            <div className="space-y-2">
              <div className="text-xs text-slate-400 font-semibold flex items-center justify-between">
                <span>รายชื่อสมาชิกที่ยังไม่ได้เช็คอิน ({unCheckedPlayers.length} คน):</span>
                <span className="text-[10px] text-emerald-400 font-normal">แตะชื่อเพื่อยืนยันตัวตน</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {unCheckedPlayers.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    onClick={() => handleSelectPlayerToVerify(player)}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500 hover:bg-emerald-950/20 text-left transition flex items-center justify-between gap-2 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl bg-gradient-to-br ${player.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm`}
                      >
                        {player.nickname.slice(0, 1)}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white group-hover:text-emerald-300 flex items-center gap-1.5">
                          <span>{player.nickname}</span>
                          {player.registrationType === 'walkin' && (
                            <span className="text-[9px] px-1 rounded bg-amber-950 text-amber-400 border border-amber-800">
                              Walk-in
                            </span>
                          )}
                        </div>
                        {player.fullName ? (
                          <div className="text-[10px] text-slate-400 truncate">
                            {player.fullName}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500">
                            {getPlayerVerificationCode(player) ? '🔒 มีรหัสยืนยัน' : 'แตะเพื่อเช็คอิน'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 group-hover:text-emerald-400 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  </button>
                ))}

                {unCheckedPlayers.length === 0 && (
                  <div className="col-span-1 sm:col-span-2 py-6 text-center text-xs text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/60">
                    {searchTerm ? 'ไม่พบชื่อที่ค้นหา ลองพิมพ์ชื่ออื่นหรือ Walk-in ด้านล่าง' : 'สมาชิกทุกคนเช็คอินครบแล้ว หรือลงชื่อ Walk-in ด้านล่าง'}
                  </div>
                )}
              </div>
            </div>

            {/* Walk-in Form if not on list */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                  <span>🚶 ไม่มีชื่อในระบบ? (Walk-in เข้าก๊วน):</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                  ติด Penalty 1 รอบ
                </span>
              </div>

              <form onSubmit={handleWalkInSubmit} className="space-y-2 pt-1">
                {walkInError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-start gap-1.5 animate-fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{walkInError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="ระบุชื่อเล่น เช่น บอย..."
                      value={walkInName}
                      onChange={(e) => {
                        setWalkInName(e.target.value);
                        if (walkInError) setWalkInError('');
                      }}
                      className={`w-full px-3 py-2 rounded-xl bg-slate-950 border text-white text-xs focus:outline-none transition ${
                        isWalkInDuplicate
                          ? 'border-amber-500 bg-amber-950/20 focus:border-amber-400'
                          : 'border-slate-800 focus:border-amber-500'
                      }`}
                    />
                    {isWalkInDuplicate && (
                      <span className="absolute right-2.5 top-2 text-[10px] text-amber-400 font-bold">
                        ชื่อซ้ำ
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    placeholder="เบอร์โทร (ใช้ 4 ตัวท้ายเป็นรหัสยืนยัน)"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Duplicate Walk-in Hint & Suggestions */}
                {isWalkInDuplicate && (
                  <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-800/80 text-amber-200 text-xs space-y-2 animate-fade-in">
                    {walkInDupPlayer && !walkInDupPlayer.isCheckedIn ? (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-amber-300">
                              พบชื่อ "{walkInDupPlayer.nickname}" ในรายชื่อล่วงหน้า!
                            </div>
                            <p className="text-[11px] text-slate-300">
                              คุณคือคนนี้หรือไม่? สามารถแตะเพื่อยืนยันตัวตนและเช็คอินได้เลย
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectPlayerToVerify(walkInDupPlayer)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shrink-0 transition"
                        >
                          แตะเช็คอินชื่อนี้
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-amber-300">
                            ชื่อ "{trimmedWalkIn}" เช็คอินอยู่ในสนามแล้ว
                          </div>
                          <p className="text-[11px] text-slate-300 mt-0.5">
                            💡 เพื่อป้องกันการคิดเงินผิดคน แนะนำให้เติมตัวเลข เช่น <strong>"{trimmedWalkIn} 2"</strong> หรือระบุชื่ออื่น
                          </p>
                        </div>
                      </div>
                    )}

                    {walkInSuggestions.length > 0 && (
                      <div className="pt-1 border-t border-amber-800/40 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">เลือกชื่อแนะนำ:</span>
                        {walkInSuggestions.map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => {
                              setWalkInName(sug);
                              setWalkInError('');
                            }}
                            className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-600/40 text-[11px] font-semibold transition active:scale-95"
                          >
                            + {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!isWalkInDuplicate && (
                  <p className="text-[10px] text-slate-400">
                    💡 สมาชิกต้องมีชื่อไม่ซ้ำกัน หากซ้ำให้เติมตัวเลข (เช่น บอย 2) หรือระบุชื่ออื่น
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <select
                    value={walkInSkill}
                    onChange={(e) => setWalkInSkill(e.target.value as SkillLevel)}
                    className="flex-1 bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:border-amber-500"
                    title="ระดับมือโดยประมาณ"
                  >
                    <option value="Newbie">มือ Newbie (มือใหม่)</option>
                    <option value="C">มือ C (เริ่มต้นพัฒนา)</option>
                    <option value="B">มือ B (มือกลาง)</option>
                    <option value="A">มือ A (มือแน่น)</option>
                    <option value="PRO">มือ PRO (มือโปร)</option>
                  </select>

                  <button
                    type="submit"
                    disabled={!walkInName.trim()}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition shrink-0 flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <span>+ เช็คอิน Walk-in</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
