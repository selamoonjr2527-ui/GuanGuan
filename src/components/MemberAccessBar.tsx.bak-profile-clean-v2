import React, { useState } from 'react';
import { 
  UserCheck, UserPlus, Coffee, Play, QrCode, ArrowLeftRight, 
  Check, Lock, Unlock, AlertCircle, Share2, Flame, Sparkles, LogIn
} from 'lucide-react';
import { Player, PlayerStatus, TabType } from '../types';

interface MemberAccessBarProps {
  players: Player[];
  currentMemberId: string | null;
  onSelectMember: (playerId: string) => void;
  onClearMember: () => void;
  onOpenWalkInModal: () => void;
  onOpenMemberGate?: () => void;
  onCheckInMember: (player: Player) => void;
  onUpdateMemberStatus: (playerId: string, status: PlayerStatus) => void;
  onNavigateToTab: (tab: TabType, targetMemberId?: string) => void;
  isOrganizerMode: boolean;
  onToggleOrganizerMode: () => void;
  onShareMemberLink: () => void;
  copiedShareLink: boolean;
  waitingQueueIndex?: number;
  currentPlayingCourt?: string;
}

export const MemberAccessBar: React.FC<MemberAccessBarProps> = ({
  players,
  currentMemberId,
  onSelectMember,
  onClearMember,
  onOpenWalkInModal,
  onOpenMemberGate,
  onCheckInMember,
  onUpdateMemberStatus,
  onNavigateToTab,
  isOrganizerMode,
  onToggleOrganizerMode,
  onShareMemberLink,
  copiedShareLink,
  waitingQueueIndex,
  currentPlayingCourt,
}) => {
  const [isSelectingAnother, setIsSelectingAnother] = useState(false);
  const currentMember = players.find((p) => p.id === currentMemberId);

  // In Organizer Mode: Display sleek Admin Bar
  if (isOrganizerMode) {
    return (
      <div className="mb-6 bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border border-amber-500/40 rounded-2xl p-4 sm:p-4.5 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-lg shrink-0">
              👑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm sm:text-base">
                  โหมดผู้จัดก๊วน (Organizer Admin)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                  ควบคุมสนาม & จัดคู่
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                คุณมีสิทธิ์จัดการคอร์ท จัดสรรคู่เล่น บันทึกผล และดูยอดการเงินทั้งหมด
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={onShareMemberLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition shadow-sm"
              title="คัดลอกลิงก์มุมมองสมาชิกสำหรับส่งให้เพื่อนในก๊วน"
            >
              {copiedShareLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-indigo-400" />}
              <span>{copiedShareLink ? 'คัดลอกลิงก์สมาชิกแล้ว!' : 'แชร์ลิงก์ (มุมมองสมาชิก) 📱'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleOrganizerMode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-sm"
            >
              <span>สลับไปมุมมองสมาชิก</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // In Member View: Case 1 - A member is identified and active
  if (currentMember && !isSelectingAnother) {
    const isCheckedIn = currentMember.isCheckedIn;
    const isPlaying = isCheckedIn && currentMember.status === 'playing';
    const isWaiting = isCheckedIn && currentMember.status === 'waiting';
    const isResting = isCheckedIn && currentMember.status === 'resting';

    return (
      <div className="mb-6 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/70 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Member Profile Info */}
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${currentMember.avatarColor} text-white font-black text-xl flex items-center justify-center shadow shrink-0`}
            >
              {currentMember.nickname.slice(0, 1)}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-medium">เข้าใช้งานในชื่อ:</span>
                <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
                  คุณ {currentMember.nickname}
                </h2>
                {currentMember.registrationType === 'walkin' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                    🚶 Walk-in หน้าสนาม
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                    📋 สมาชิกก๊วน
                  </span>
                )}
                {currentMember.paid ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold">
                    ชำระเงินแล้ว ✅
                  </span>
                ) : null}
              </div>

              {/* Status Message */}
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-300 flex-wrap">
                {!isCheckedIn ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>คุณยังไม่ได้เช็คอินเข้าสนาม (กรุณากดเช็คอินเพื่อเข้าคิวลงเล่น)</span>
                  </span>
                ) : isPlaying ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>กำลังลงเล่นแข่งขัน {currentPlayingCourt ? `(${currentPlayingCourt})` : 'ในสนาม'}</span>
                  </span>
                ) : isWaiting ? (
                  <span className="text-indigo-300 font-bold flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      อยู่ในคิวรอเล่น {waitingQueueIndex !== undefined ? `(คิวที่ #${waitingQueueIndex + 1})` : ''} • เล่นไปแล้ว {currentMember.gamesPlayed} เกม
                    </span>
                  </span>
                ) : isResting ? (
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                    <span>กำลังพักเหนื่อย (ระบบจะไม่จัดคู่ลงเล่นในรอบนี้)</span>
                  </span>
                ) : (
                  <span>สถานะ: {currentMember.status}</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Member Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {!isCheckedIn ? (
              <button
                type="button"
                onClick={() => onCheckInMember(currentMember)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-extrabold transition shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>เช็คอินเข้าสนามทันที ✅</span>
              </button>
            ) : (
              <>
                {isWaiting && (
                  <button
                    type="button"
                    onClick={() => onUpdateMemberStatus(currentMember.id, 'resting')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition"
                    title="ขอพักเหนื่อยรอบนี้ ระบบจะไม่จัดลงคอร์ทถัดไป"
                  >
                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                    <span>ขอพักรอบนี้</span>
                  </button>
                )}

                {isResting && (
                  <button
                    type="button"
                    onClick={() => onUpdateMemberStatus(currentMember.id, 'waiting')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm"
                    title="หายเหนื่อยแล้ว พร้อมกลับเข้าคิวรอลงเล่น"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>พร้อมลงเล่นแล้ว!</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onNavigateToTab('billing', currentMember.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm"
                  title="ดูยอดชำระเงินและสแกนพร้อมเพย์ของฉัน"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>ยอดเงิน/สแกนจ่าย</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                if (onOpenMemberGate) {
                  onOpenMemberGate();
                } else {
                  setIsSelectingAnother(true);
                }
              }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 text-xs transition"
              title="สลับไปใช้งานในชื่อสมาชิกคนอื่น (ต้องยืนยันตัวตน)"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>สลับชื่อ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // In Member View: Case 2 - No member selected, or user requested to switch member
  return (
    <div className="mb-6 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Prompt Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏸</span>
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              ยินดีต้อนรับสู่ก๊วน! (มุมมองสมาชิก)
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold">
              เฉพาะสมาชิก & Walk-in
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
            <b>คนที่ใช้งานระบบได้ ควรเป็นสมาชิกก๊วน หรือคนที่ Walk-in มาแล้วเท่านั้น:</b> กรุณายืนยันชื่อเล่นของคุณ หรือลงทะเบียน Walk-in เพื่อป้องกันการกดแทนกัน
          </p>
        </div>

        {/* Member Gate & Walk-in Action */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <button
            type="button"
            onClick={onOpenMemberGate || (() => setIsSelectingAnother(true))}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-500 hover:from-indigo-400 hover:to-emerald-400 text-white font-bold text-xs transition shadow-md whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            <span>เข้าสู่ระบบด้วยชื่อของคุณ (สมาชิก / Walk-in)</span>
          </button>

          <button
            type="button"
            onClick={onOpenWalkInModal}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold transition shadow-sm whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Walk-in หน้าสนาม</span>
          </button>

          {isSelectingAnother && currentMember && (
            <button
              type="button"
              onClick={() => setIsSelectingAnother(false)}
              className="px-2.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition"
            >
              ยกเลิก
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
