import React, { useState, useEffect } from 'react';
import { X, UserPlus, Award, Edit3, Check, AlertTriangle, Sparkles } from 'lucide-react';
import { Player, SkillLevel, SKILL_LEVELS } from '../types';
import {
  isNicknameDuplicate,
  getDuplicatePlayer,
  generateNicknameSuggestions,
} from '../utils/nameValidation';

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePlayer: (player: Omit<Player, 'id' | 'status' | 'gamesPlayed' | 'paid'>) => void;
  playerToEdit?: Player | null;
  onUpdatePlayer?: (player: Player) => void;
  defaultRegistrationType?: 'registered' | 'walkin';
  existingPlayers?: Player[];
}

const AVATAR_GRADIENTS = [
  'from-emerald-500 to-teal-600',
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-violet-600',
  'from-pink-500 to-rose-400',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-red-600',
  'from-cyan-500 to-blue-600',
];


const normalizeSkillLevel = (level?: string): SkillLevel => {
  // Backward compatibility: old data may still contain "S"
  if (level === 'S') return 'PRO' as SkillLevel;

  if (level && Object.prototype.hasOwnProperty.call(SKILL_LEVELS, level)) {
    return level as SkillLevel;
  }

  return 'B' as SkillLevel;
};

export const PlayerModal: React.FC<PlayerModalProps> = ({
  isOpen,
  onClose,
  onSavePlayer,
  playerToEdit,
  onUpdatePlayer,
  defaultRegistrationType = 'registered',
  existingPlayers = [],
}) => {
  const [nickname, setNickname] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('B');
  const [registrationType, setRegistrationType] = useState<'registered' | 'walkin'>('registered');
  const [penaltyMatches, setPenaltyMatches] = useState<number>(1);
  const [autoCheckIn, setAutoCheckIn] = useState(true);
  const [formError, setFormError] = useState<string>('');

  useEffect(() => {
    setFormError('');
    if (playerToEdit) {
      setNickname(playerToEdit.nickname || '');
      setFullName(playerToEdit.fullName || '');
      setPhone(playerToEdit.phone || '');
      setPin(playerToEdit.pin || '');
      setGender(playerToEdit.gender || 'male');
      setSkillLevel(normalizeSkillLevel(playerToEdit.skillLevel));
      setRegistrationType(playerToEdit.registrationType || 'registered');
      setPenaltyMatches(playerToEdit.walkInPenaltyMatches ?? 1);
      setAutoCheckIn(playerToEdit.isCheckedIn || false);
    } else {
      setNickname('');
      setFullName('');
      setPhone('');
      setPin('');
      setGender('male');
      setSkillLevel('B');
      setRegistrationType(defaultRegistrationType);
      setPenaltyMatches(1);
      setAutoCheckIn(true);
    }
  }, [playerToEdit, isOpen, defaultRegistrationType]);

  // Duplicate Nickname Detection
  const trimmedNickname = nickname.trim();
  const duplicatePlayer = isNicknameDuplicate(trimmedNickname, existingPlayers, playerToEdit?.id)
    ? getDuplicatePlayer(trimmedNickname, existingPlayers, playerToEdit?.id)
    : undefined;
  const isDuplicate = Boolean(duplicatePlayer && trimmedNickname.length > 0);

  const suggestions = isDuplicate
    ? generateNicknameSuggestions(trimmedNickname, existingPlayers, playerToEdit?.id, fullName)
    : [];

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!trimmedNickname) {
      setFormError('กรุณากรอกชื่อเล่น');
      return;
    }

    if (isDuplicate) {
      const suggestText = suggestions.length > 0 ? ` (แนะนำ: ${suggestions.join(', ')})` : '';
      setFormError(`ชื่อเล่น "${trimmedNickname}" ซ้ำกับสมาชิกในระบบแล้ว กรุณาเติมตัวเลขหรือระบุชื่อเล่นอื่นเพื่อป้องกันเช็คอินและคิดเงินผิดคน${suggestText}`);
      return;
    }

    if (playerToEdit && onUpdatePlayer) {
      // Editing existing player
      onUpdatePlayer({
        ...playerToEdit,
        nickname: trimmedNickname,
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        pin: pin.trim() ? pin.trim() : undefined,
        gender,
        skillLevel,
        registrationType,
        walkInPenaltyMatches: registrationType === 'walkin' ? penaltyMatches : 0,
        skillScore: (SKILL_LEVELS[skillLevel] ?? SKILL_LEVELS.B).score,
      });
    } else {
      // Adding new player
      const randomGradient =
        registrationType === 'walkin'
          ? 'from-amber-500 to-orange-600'
          : AVATAR_GRADIENTS[Math.floor(Math.random() * AVATAR_GRADIENTS.length)];

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;

      onSavePlayer({
        nickname: trimmedNickname,
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        pin: pin.trim() ? pin.trim() : undefined,
        gender,
        skillLevel,
        registrationType,
        walkInPenaltyMatches: registrationType === 'walkin' ? penaltyMatches : 0,
        skillScore: (SKILL_LEVELS[skillLevel] ?? SKILL_LEVELS.B).score,
        isCheckedIn: autoCheckIn,
        checkInTime: autoCheckIn ? timeStr : undefined,
        avatarColor: randomGradient,
      });
    }

    onClose();
  };

  const isEditing = !!playerToEdit;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
       {/* GUANGUAN_PLAYER_MODAL_SCROLL_V25 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto my-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${isEditing ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
              {isEditing ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEditing ? `แก้ไขข้อมูล: ${playerToEdit.nickname}` : 'เพิ่มสมาชิก/เพื่อนร่วมก๊วน'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEditing ? 'เปลี่ยนชื่อเล่น, ชื่อจริง, เบอร์โทร หรือระดับมือ' : 'กรอกรายละเอียดเพื่อนใหม่เพื่อนำเข้าระบบก๊วน'}
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

        {formError && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-start gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{formError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Nickname (Required) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-semibold">
                ชื่อเล่น (ที่ใช้เรียกในสนาม) <span className="text-rose-400">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                ต้องไม่ซ้ำกับคนอื่นในก๊วน
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="เช่น ต้น, บาส, ก้อย"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (formError) setFormError('');
                }}
                className={`w-full rounded-xl bg-slate-950 border px-3 py-2.5 text-xs text-white focus:outline-none font-medium transition ${
                  isDuplicate
                    ? 'border-amber-500/80 focus:border-amber-400 bg-amber-950/10'
                    : 'border-slate-800 focus:border-emerald-500'
                }`}
              />
              {isDuplicate && (
                <div className="absolute right-3 top-2.5 text-amber-400 flex items-center gap-1 text-[11px] font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>ชื่อซ้ำ</span>
                </div>
              )}
            </div>

            {/* Hint & Suggestions for Duplicate Nickname */}
            {isDuplicate ? (
              <div className="mt-2 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-2 animate-fade-in">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-amber-300">
                      ชื่อ "{trimmedNickname}" ซ้ำกับสมาชิกในก๊วนแล้ว
                    </div>
                    {duplicatePlayer && (
                      <div className="text-[11px] text-slate-300 mt-0.5">
                        (มีสมาชิก: <span className="font-semibold text-white">{duplicatePlayer.nickname}</span> {duplicatePlayer.fullName ? `[${duplicatePlayer.fullName}]` : ''} อยู่ในระบบแล้ว)
                      </div>
                    )}
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      💡 เพื่อป้องกันการจำสับสน เช็คอิน หรือคิดเงินผิดคน แนะนำให้เติมตัวเลข เช่น <strong>"{trimmedNickname} 2"</strong> หรือระบุชื่อเล่นอื่น/อักษรย่อ
                    </p>
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="pt-1.5 border-t border-amber-800/40">
                    <div className="text-[11px] font-semibold text-amber-300 mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>แตะชื่อแนะนำเพื่อเปลี่ยนอัตโนมัติ:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => {
                            setNickname(sug);
                            setFormError('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-600/50 text-xs font-semibold transition active:scale-95 flex items-center gap-1"
                        >
                          <span>+ {sug}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span>💡 หากมีเพื่อนชื่อเล่นเดียวกัน ให้เติมเลข (เช่น ต้น 2) หรือระบุชื่ออื่นเพื่อความชัดเจน</span>
              </p>
            )}
          </div>

          {/* Full Name & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">ชื่อ-นามสกุลจริง</label>
              <input
                type="text"
                placeholder="สมชาย ใจดี"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">เบอร์โทรศัพท์</label>
              <input
                type="tel"
                placeholder="08x-xxx-xxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Verification PIN for Identity Protection */}
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-slate-300 font-medium">
                🛡️ รหัส PIN ยืนยันตัวตน 4 หลัก
              </label>
              <span className="text-[10px] text-emerald-400">
                {phone.replace(/\D/g, '').length >= 4 ? `(ค่าเริ่มต้น: ••••${phone.replace(/\D/g, '').slice(-4)})` : '(ไม่บังคับ)'}
              </span>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder={phone.replace(/\D/g, '').length >= 4 ? `ใช้เลข 4 ตัวท้ายเบอร์โทร (${phone.replace(/\D/g, '').slice(-4)}) หรือตั้งใหม่` : 'ใส่เลข 4 หลัก เช่น 1234'}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 text-white px-3 py-2 text-xs font-mono tracking-wider focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-400">
              ใช้สำหรับตรวจสอบความปลอดภัยตอนสมาชิกกดเช็คอิน / เช็คเอาท์ ป้องกันคนอื่นกดผิดชื่อ
            </p>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-slate-400 mb-1">เพศ:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`py-2 rounded-xl border text-center transition ${
                  gender === 'male'
                    ? 'bg-blue-600 text-white font-bold border-blue-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                ชาย
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`py-2 rounded-xl border text-center transition ${
                  gender === 'female'
                    ? 'bg-pink-600 text-white font-bold border-pink-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                หญิง
              </button>
              <button
                type="button"
                onClick={() => setGender('other')}
                className={`py-2 rounded-xl border text-center transition ${
                  gender === 'other'
                    ? 'bg-purple-600 text-white font-bold border-purple-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                อื่นๆ
              </button>
            </div>
          </div>

          {/* Registration Type: Registered vs Walk-in with Penalty */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              ประเภทการเข้าร่วมก๊วน:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRegistrationType('registered')}
                className={`py-2.5 px-3 rounded-xl border text-left transition flex items-center justify-between ${
                  registrationType === 'registered'
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-bold ring-2 ring-emerald-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <span>📋 ลงชื่อล่วงหน้า</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                    ได้สิทธิ์ลงสนามตามคิวปกติ
                  </div>
                </div>
                {registrationType === 'registered' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => setRegistrationType('walkin')}
                className={`py-2.5 px-3 rounded-xl border text-left transition flex items-center justify-between ${
                  registrationType === 'walkin'
                    ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-bold ring-2 ring-amber-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <span>🚶 Walk-in หน้าสนาม</span>
                  </div>
                  <div className="text-[10px] text-amber-400 font-normal mt-0.5">
                    ติด Penalty +1 รอบรอคิว
                  </div>
                </div>
                {registrationType === 'walkin' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            </div>

            {registrationType === 'walkin' && (
              <div className="mt-2.5 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <span>⚠️</span>
                    <span>โทษรอคิว (Penalty Rounds):</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { rounds: 1, label: '+1 รอบ (+2 เกม)' },
                      { rounds: 2, label: '+2 รอบ (+4 เกม)' },
                      { rounds: 0, label: 'ยกเว้น (0 รอบ)' },
                    ].map(({ rounds, label }) => (
                      <button
                        key={rounds}
                        type="button"
                        onClick={() => setPenaltyMatches(rounds)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                          penaltyMatches === rounds
                            ? 'bg-amber-500 text-slate-950 font-bold shadow'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  <strong>กติกา:</strong> สมาชิก Walk-in จะถูกจัดคิวเสมือนมีเกมเล่นสะสมเพิ่มตามโทษ เพื่อให้ผู้เล่นที่ลงชื่อล่วงหน้าได้ลงเล่นก่อนอย่างแน่นอน
                </p>
              </div>
            )}
          </div>

          {/* Skill Level Selection */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
              <span>ระดับมือ (Skill Level):</span>
              <span className="text-[10px] text-emerald-400 font-normal">
                ปรับเปลี่ยนได้ในแบบประเมิน
              </span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(SKILL_LEVELS) as SkillLevel[]).map((level) => {
                const meta = SKILL_LEVELS[level];
                const isSelected = skillLevel === level;
                return (
                  <button
                    type="button"
                    key={level}
                    onClick={() => setSkillLevel(level)}
                    className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                      isSelected
                        ? `${meta.bgColor} ${meta.color} ${meta.borderColor} font-extrabold ring-2 ring-emerald-500/50`
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-sm">{level}</span>
                    <span className="text-[9px] truncate max-w-[50px] mt-0.5 opacity-80">
                      {meta.nameThai.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800/80">
              {(SKILL_LEVELS[skillLevel] ?? SKILL_LEVELS.B).description}
            </p>
          </div>

          {/* Auto Check-in Option (Only for new player) */}
          {!isEditing && (
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  checked={autoCheckIn}
                  onChange={(e) => setAutoCheckIn(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-300 font-medium">
                  เช็คอินเข้าก๊วนทันที (สถานะ: มาถึงสนามแล้ว)
                </span>
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-xl font-bold transition shadow ${
                isEditing
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {isEditing ? 'บันทึกการแก้ไข' : 'บันทึกผู้เล่น'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
