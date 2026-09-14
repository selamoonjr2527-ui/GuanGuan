import React, { useState } from 'react';
import { 
  UserPlus, Search, CheckCircle2, Circle, Clock, QrCode, 
  Award, RefreshCw, Flame, UserCheck, Coffee, LogOut, ChevronRight,
  Filter, Edit3, ShieldCheck, Lock, AlertTriangle
} from 'lucide-react';
import { Player, SkillLevel, SKILL_LEVELS, PlayerStatus } from '../types';
import { CheckInConfirmModal } from './CheckInConfirmModal';
import { getPlayerVerificationCode } from '../utils/security';

interface CheckInViewProps {
  players: Player[];
  isOrganizerMode?: boolean;
  currentMemberId?: string;
  hideSkillFromMembers?: boolean;
  organizerPin?: string;
  onToggleCheckIn: (playerId: string) => void;
  onCheckInPlayer?: (playerId: string, pin?: string) => void;
  onCheckOutPlayer?: (playerId: string) => void;
  onUpdatePlayerStatus: (playerId: string, status: PlayerStatus) => void;
  onOpenAddPlayerModal: () => void;
  onOpenAddWalkInModal?: () => void;
  onOpenSelfCheckInModal: () => void;
  onOpenAssessmentForPlayer: (player: Player) => void;
  onEditPlayer: (player: Player) => void;
  onDeletePlayer: (playerId: string) => void;
  onToggleWalkInPenalty?: (playerId: string) => void;
  onToggleRegistrationType?: (playerId: string) => void;
  onPromptIdentifyMember?: () => void;
}

export const CheckInView: React.FC<CheckInViewProps> = ({
  players,
  isOrganizerMode = false,
  currentMemberId,
  hideSkillFromMembers = true,
  organizerPin = '1234',
  onToggleCheckIn,
  onCheckInPlayer,
  onCheckOutPlayer,
  onUpdatePlayerStatus,
  onOpenAddPlayerModal,
  onOpenAddWalkInModal,
  onOpenSelfCheckInModal,
  onOpenAssessmentForPlayer,
  onEditPlayer,
  onDeletePlayer,
  onToggleWalkInPenalty,
  onToggleRegistrationType,
  onPromptIdentifyMember,
}) => {
  const showSkill = isOrganizerMode || !hideSkillFromMembers;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'checked_in' | 'waiting' | 'playing' | 'resting' | 'absent'>('all');
  const [skillFilter, setSkillFilter] = useState<SkillLevel | 'all'>('all');
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Verification & Confirmation Modal State
  const [confirmModalData, setConfirmModalData] = useState<{
    isOpen: boolean;
    player: Player | null;
    actionType: 'checkin' | 'checkout' | 'status_change';
    targetStatus?: PlayerStatus;
  }>({
    isOpen: false,
    player: null,
    actionType: 'checkin',
  });

  // Computed counts
  const checkedInCount = players.filter((p) => p.isCheckedIn).length;
  const playingCount = players.filter((p) => p.isCheckedIn && p.status === 'playing').length;
  const waitingCount = players.filter((p) => p.isCheckedIn && p.status === 'waiting').length;
  const restingCount = players.filter((p) => p.isCheckedIn && p.status === 'resting').length;
  const absentCount = players.filter((p) => !p.isCheckedIn).length;

  const filteredPlayers = players.filter((p) => {
    // Search query
    const matchSearch =
      p.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.fullName && p.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.phone && p.phone.includes(searchTerm));

    if (!matchSearch) return false;

    // Status filter
    if (selectedFilter === 'checked_in' && !p.isCheckedIn) return false;
    if (selectedFilter === 'waiting' && (!p.isCheckedIn || p.status !== 'waiting')) return false;
    if (selectedFilter === 'playing' && (!p.isCheckedIn || p.status !== 'playing')) return false;
    if (selectedFilter === 'resting' && (!p.isCheckedIn || p.status !== 'resting')) return false;
    if (selectedFilter === 'absent' && p.isCheckedIn) return false;

    // Skill filter
    if (skillFilter !== 'all' && p.skillLevel !== skillFilter) return false;

    return true;
  });

  // Handle clicking the Check-in button
  const handleInitiateCheckIn = (player: Player) => {
    if (isOrganizerMode) {
      // In organizer mode, can directly check in
      if (onCheckInPlayer) {
        onCheckInPlayer(player.id);
      } else {
        onToggleCheckIn(player.id);
      }
      return;
    }

    // In member mode: Check if user is attempting to check in someone else
    if (currentMemberId && player.id !== currentMemberId) {
      setPermissionNotice(`คุณเข้าใช้งานในชื่ออื่นอยู่ ไม่สามารถกดเช็คอินแทนคุณ ${player.nickname} ได้ (กรุณาสลับชื่อที่แถบด้านบน)`);
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    // In member mode, require 2-step verification modal
    setConfirmModalData({
      isOpen: true,
      player,
      actionType: 'checkin',
    });
  };

  // Handle clicking the Check-out button (or uncheck)
  const handleInitiateCheckOut = (player: Player) => {
    if (!isOrganizerMode && currentMemberId && player.id !== currentMemberId) {
      setPermissionNotice(`คุณไม่สามารถกดเช็คเอาท์แทนคุณ ${player.nickname} ได้ (สิทธิ์เฉพาะเจ้าของชื่อเท่านั้น)`);
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    setConfirmModalData({
      isOpen: true,
      player,
      actionType: 'checkout',
    });
  };

  // Handle member changing status dropdown
  const handleStatusChangeRequest = (player: Player, newStatus: PlayerStatus) => {
    if (isOrganizerMode) {
      onUpdatePlayerStatus(player.id, newStatus);
      return;
    }

    if (currentMemberId && player.id !== currentMemberId) {
      setPermissionNotice(`คุณไม่สามารถเปลี่ยนสถานะแทนคุณ ${player.nickname} ได้ (กรุณาให้เจ้าตัวกดเอง หรือแจ้งผู้จัด)`);
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    if (newStatus === 'left' || newStatus === 'resting') {
      // Prompt confirmation for leaving or resting to prevent accidental clicks
      setConfirmModalData({
        isOpen: true,
        player,
        actionType: 'status_change',
        targetStatus: newStatus,
      });
    } else {
      onUpdatePlayerStatus(player.id, newStatus);
    }
  };

  // Execute confirmed action from modal
  const handleConfirmAction = (pinUsed?: string) => {
    const { player, actionType, targetStatus } = confirmModalData;
    if (!player) return;

    if (actionType === 'checkin') {
      if (onCheckInPlayer) {
        onCheckInPlayer(player.id, pinUsed);
      } else {
        onToggleCheckIn(player.id);
      }
    } else if (actionType === 'checkout') {
      if (onCheckOutPlayer) {
        onCheckOutPlayer(player.id);
      } else {
        onToggleCheckIn(player.id);
      }
    } else if (actionType === 'status_change' && targetStatus) {
      onUpdatePlayerStatus(player.id, targetStatus);
    }

    setConfirmModalData((prev) => ({ ...prev, isOpen: false, player: null }));
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Permission Notice Toast / Alert */}
      {permissionNotice && (
        <div className="bg-rose-950/90 border border-rose-600 text-rose-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-rose-950/40 animate-bounce">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{permissionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setPermissionNotice(null)}
            className="text-xs px-2 py-1 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-white font-medium transition shrink-0"
          >
            เข้าใจแล้ว
          </button>
        </div>
      )}

      {/* Top Security & Safety Banner */}
      <div className="bg-gradient-to-r from-emerald-950/50 via-slate-900 to-cyan-950/40 border border-emerald-500/30 rounded-2xl p-3.5 sm:p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="font-bold text-white flex items-center gap-2">
              <span>🛡️ ระบบความปลอดภัย: ป้องกันการกดเช็คอิน / เช็คเอาท์ผิดชื่อ</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                ยืนยัน 2 ขั้นตอน
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              สมาชิกยืนยันตัวตนด้วยรหัส 4 หลัก (เลข 4 ตัวท้ายของเบอร์โทรศัพท์ หรือ PIN) ป้องกันการเผลอกดแทนกันหรือทำให้เพื่อนหลุดคิว
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSelfCheckInModal}
          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shrink-0 flex items-center gap-1.5 shadow-sm whitespace-nowrap"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>เช็คอินด้วยตนเอง</span>
        </button>
      </div>

      {/* Top Overview Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">เช็คอินแล้ว</div>
            <div className="text-xl font-bold text-white">
              {checkedInCount} <span className="text-xs text-slate-500">/ {players.length} คน</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">กำลังแข่งขัน</div>
            <div className="text-xl font-bold text-amber-400">
              {playingCount} <span className="text-xs text-slate-500">คน</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">พร้อมลงคิว</div>
            <div className="text-xl font-bold text-blue-400">
              {waitingCount} <span className="text-xs text-slate-500">คน</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400">
            <Coffee className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">พักเหนื่อย / ยังไม่มา</div>
            <div className="text-xl font-bold text-slate-300">
              {restingCount} / {absentCount}
            </div>
          </div>
        </div>
      </div>

      {/* Control Actions & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-bold text-white">ระบบเช็คอินหน้าสนาม & รายชื่อก๊วน</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={onOpenSelfCheckInModal}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>QR เช็คอินหน้าสนาม</span>
            </button>

            {isOrganizerMode ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenAddPlayerModal}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-sm"
                  title="เพิ่มสมาชิกที่ลงชื่อล่วงหน้า"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>+ ลงชื่อล่วงหน้า</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenAddWalkInModal || onOpenAddPlayerModal}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-sm"
                  title="เพิ่มสมาชิก Walk-in หน้าสนาม (ติด Penalty 1 รอบ)"
                >
                  <span>🚶</span>
                  <span>+ Walk-in หน้าสนาม</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span>ผู้จัดก๊วนเท่านั้นที่เพิ่มรายชื่อได้</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter Chips & Search Input */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 pt-2 border-t border-slate-800">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาชื่อเล่น, ชื่อจริง หรือเบอร์โทรศัพท์..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedFilter === 'all'
                  ? 'bg-slate-700 text-white font-semibold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              ทั้งหมด ({players.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('checked_in')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedFilter === 'checked_in'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              เช็คอินแล้ว ({checkedInCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('waiting')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedFilter === 'waiting'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              รอคิว ({waitingCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('playing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedFilter === 'playing'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              แข่งอยู่ ({playingCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('absent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedFilter === 'absent'
                  ? 'bg-slate-600 text-white font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              ยังไม่มา ({absentCount})
            </button>

            {showSkill && (
              <select
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value as SkillLevel | 'all')}
                className="bg-slate-950 border border-slate-800 rounded-lg text-xs px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-emerald-500 shrink-0"
              >
                <option value="all">ระดับมือ: ทั้งหมด</option>
                <option value="Newbie">มือ Newbie</option>
                <option value="C">มือ C</option>
                <option value="B">มือ B</option>
                <option value="A">มือ A</option>
                <option value="PRO">มือ PRO</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Player Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredPlayers.map((player) => {
          const skillMeta = SKILL_LEVELS[player.skillLevel];
          const hasVerification = Boolean(getPlayerVerificationCode(player));
          const isCurrentUser = Boolean(currentMemberId && player.id === currentMemberId);
          const canActOnPlayer = isOrganizerMode || isCurrentUser;

          return (
            <div
              key={player.id}
              className={`bg-slate-900 border rounded-2xl p-4 transition duration-200 relative overflow-hidden flex flex-col justify-between ${
                isCurrentUser
                  ? 'border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-950/30'
                  : player.isCheckedIn
                  ? player.status === 'playing'
                    ? 'border-amber-500/50 shadow-md shadow-amber-950/20'
                    : 'border-slate-800 hover:border-slate-700'
                  : 'border-slate-800/60 opacity-75 hover:opacity-100'
              }`}
            >
              {/* Playing accent bar */}
              {player.status === 'playing' && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              )}
              {/* Current user badge bar */}
              {isCurrentUser && !isOrganizerMode && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />
              )}

              <div>
                {/* Header info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${player.avatarColor} text-white font-bold flex items-center justify-center text-lg shadow-sm shrink-0`}
                    >
                      {player.nickname.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white text-base leading-tight">
                          {player.nickname}
                        </span>
                        {isCurrentUser && !isOrganizerMode && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black shadow-sm">
                            คุณ (ฉัน)
                          </span>
                        )}
                        {isOrganizerMode && (
                          <button
                            type="button"
                            onClick={() => onEditPlayer(player)}
                            title="แก้ไขชื่อเล่น / ข้อมูลสมาชิก (เฉพาะผู้จัด)"
                            className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition flex items-center gap-0.5"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span className="text-[10px] text-slate-500 hover:text-blue-400">แก้</span>
                          </button>
                        )}
                        {player.registrationType === 'walkin' ? (
                          <div className="flex items-center gap-1">
                            <span
                              title={`Walk-in ติด Penalty ${player.walkInPenaltyMatches ?? 1} รอบ เพื่อให้คนลงชื่อล่วงหน้าได้เล่นก่อน`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-semibold flex items-center gap-1"
                            >
                              <span>🚶 Walk-in</span>
                              <span className="text-[9px] bg-amber-900/60 px-1 rounded text-amber-200">
                                {(player.walkInPenaltyMatches ?? 1) > 0 ? `+${player.walkInPenaltyMatches ?? 1} รอบ` : 'ไม่ติดโทษ'}
                              </span>
                            </span>
                            {isOrganizerMode && onToggleWalkInPenalty && (
                              <button
                                type="button"
                                onClick={() => onToggleWalkInPenalty(player.id)}
                                title={(player.walkInPenaltyMatches ?? 1) > 0 ? 'คลิกเพื่อยกเว้น Penalty' : 'คลิกเพื่อใส่ Penalty +1 รอบ'}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 transition"
                              >
                                {(player.walkInPenaltyMatches ?? 1) > 0 ? 'ยกเว้นโทษ' : '+โทษ 1 รอบ'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span
                              title="ลงชื่อล่วงหน้า ได้สิทธิ์คอร์ทตามคิวปกติ"
                              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-semibold flex items-center gap-1"
                            >
                              <span>📋 ลงชื่อล่วงหน้า</span>
                            </span>
                            {isOrganizerMode && onToggleRegistrationType && (
                              <button
                                type="button"
                                onClick={() => onToggleRegistrationType(player.id)}
                                title="คลิกเพื่อเปลี่ยนเป็น Walk-in (ติด Penalty)"
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-amber-950/80 text-slate-400 hover:text-amber-300 border border-slate-700/80 transition"
                              >
                                เปลี่ยนเป็น Walk-in
                              </button>
                            )}
                          </div>
                        )}
                        {player.gender === 'female' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-950/80 text-pink-400 border border-pink-900">
                            หญิง
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400 truncate max-w-[130px]">
                          {player.fullName || 'สมาชิกทั่วไป'}
                        </p>
                        {hasVerification ? (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5" title="ป้องกันด้วยรหัส 4 หลัก (เบอร์โทร/PIN)">
                            <Lock className="w-2.5 h-2.5" />
                            <span>มีรหัส 4 หลัก</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5" title="ยืนยันด้วยชื่อ">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            <span>ยืนยันชื่อ</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hand Level Badge (Only shown if showSkill is true) */}
                  <div className="flex flex-col items-end">
                    {showSkill ? (
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold shadow-sm"
                          style={{
                            backgroundColor: `${skillMeta?.color}18`,
                            color: skillMeta?.color || '#10b981',
                            borderColor: `${skillMeta?.color}40`,
                            borderWidth: '1px',
                          }}
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>{player.skillLevel}</span>
                          <span className="text-[10px] opacity-75 font-normal">
                            ({player.skillScore.toFixed(1)})
                          </span>
                        </div>
                        {isOrganizerMode && (
                          <button
                            type="button"
                            onClick={() => onOpenAssessmentForPlayer(player)}
                            className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-0.5 transition"
                            title="เปิดระบบประเมินมือละเอียด"
                          >
                            <span>ประเมินมือ</span>
                            <ChevronRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 px-2 py-0.5 bg-slate-950 rounded border border-slate-800">
                        สมาชิกก๊วน
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub details: Status, Games, Waiting Time */}
                <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">สถานะ:</span>
                    {player.isCheckedIn ? (
                      player.status === 'playing' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          กำลังแข่ง 🏸
                        </span>
                      ) : player.status === 'resting' ? (
                        <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">
                          พักเหนื่อย 🥤
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-800/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          พร้อมลงคิว
                        </span>
                      )
                    ) : (
                      <span className="text-slate-500">ยังไม่มา</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-slate-400">
                      เล่นไปแล้ว: <strong className="text-white font-bold">{player.gamesPlayed}</strong> เกม
                    </div>
                    {player.isCheckedIn && player.checkInTime && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{player.checkInTime}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Bottom Bar */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                {/* Safe Check In / Check Out Action Button */}
                {player.isCheckedIn ? (
                  canActOnPlayer ? (
                    <button
                      type="button"
                      onClick={() => handleInitiateCheckOut(player)}
                      className="flex-1 flex items-center justify-between gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 group"
                      title="คลิกเพื่อยกเลิกเช็คอิน / เช็คเอาท์ (มีระบบป้องกัน 4 หลัก)"
                    >
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>เช็คอินแล้ว ({player.checkInTime || 'หน้าสนาม'})</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 group-hover:text-rose-300 border border-slate-700 transition flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        <span>เช็คเอาท์</span>
                      </span>
                    </button>
                  ) : (
                    <div
                      className="flex-1 flex items-center justify-between gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-slate-950/60 text-emerald-500/80 border border-slate-800"
                      title="เช็คอินแล้ว (เฉพาะเจ้าของชื่อเท่านั้นที่แก้ไขสถานะได้)"
                    >
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500/80" />
                        <span>เช็คอินแล้ว ({player.checkInTime || 'หน้าสนาม'})</span>
                      </div>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-600" />
                        <span>ของผู้อื่น</span>
                      </span>
                    </div>
                  )
                ) : (
                  canActOnPlayer ? (
                    <button
                      type="button"
                      onClick={() => handleInitiateCheckIn(player)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isCurrentUser ? 'คลิกเช็คอิน (ยืนยันฉันมาแล้ว)' : 'คลิกเพื่อเช็คอิน (ยืนยันตัวตน)'}</span>
                    </button>
                  ) : (
                    <div
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-slate-950/60 text-slate-500 border border-slate-800/80"
                      title="สิทธิ์เฉพาะเจ้าของชื่อเท่านั้น (ไม่สามารถกดเช็คอินแทนกันได้)"
                    >
                      <Lock className="w-3.5 h-3.5 text-slate-600" />
                      <span>ยังไม่เช็คอิน (สิทธิ์เฉพาะเจ้าตัว)</span>
                    </div>
                  )
                )}

                {/* Status Toggle Button (if checked in and not actively playing) */}
                {player.isCheckedIn && player.status !== 'playing' && (
                  canActOnPlayer ? (
                    <select
                      value={player.status}
                      onChange={(e) => handleStatusChangeRequest(player, e.target.value as PlayerStatus)}
                      className="text-xs bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-slate-300 focus:outline-none focus:border-emerald-500"
                      title="เปลี่ยนสถานะของฉัน"
                    >
                      <option value="waiting">พร้อมลงคิว 🏸</option>
                      <option value="resting">พักเหนื่อย 🥤</option>
                      <option value="left">กลับแล้ว 🚗</option>
                    </select>
                  ) : (
                    <div
                      className="text-[11px] bg-slate-950/80 border border-slate-800/80 rounded-xl px-2.5 py-2 text-slate-400 whitespace-nowrap"
                      title="สถานะปัจจุบันของผู้เล่นคนนี้"
                    >
                      {player.status === 'waiting' ? 'พร้อมลงคิว 🏸' : player.status === 'resting' ? 'พักเหนื่อย 🥤' : 'กลับแล้ว 🚗'}
                    </div>
                  )
                )}

                {/* Edit & Delete Player Buttons (Organizer Only) */}
                {isOrganizerMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEditPlayer(player)}
                      title="แก้ไขข้อมูลผู้เล่น (เฉพาะผู้จัด)"
                      className="p-2 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeletePlayer(player.id)}
                      title="ลบผู้เล่น (เฉพาะผู้จัด)"
                      className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredPlayers.length === 0 && (
        <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-4xl mb-2">🏸</div>
          <div className="text-slate-300 font-medium">ไม่พบผู้เล่นตามเงื่อนไขที่เลือก</div>
          <p className="text-xs text-slate-500 mt-1">ลองเปลี่ยนคำค้นหาหรือเพิ่มผู้เล่นใหม่</p>
        </div>
      )}

      {/* 2-Step Check-In / Check-Out Confirmation Modal */}
      <CheckInConfirmModal
        isOpen={confirmModalData.isOpen}
        onClose={() => setConfirmModalData((prev) => ({ ...prev, isOpen: false, player: null }))}
        player={confirmModalData.player}
        actionType={confirmModalData.actionType}
        targetStatus={confirmModalData.targetStatus}
        organizerPin={organizerPin}
        isOrganizerMode={isOrganizerMode}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
};
