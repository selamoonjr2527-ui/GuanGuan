import React from 'react';
import { 
  Users, Award, PlayCircle, Receipt, Settings, RotateCcw, 
  ShieldCheck, Timer, Lock, Unlock, Eye, EyeOff, UserCheck, TrendingUp, Share2, Check
} from 'lucide-react';
import { SessionConfig, TabType } from '../types';

interface HeaderProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  sessionConfig: SessionConfig;
  totalPlayers: number;
  checkedInCount: number;
  activeMatchesCount: number;
  waitingCount: number;
  isOrganizerMode: boolean;
  onToggleOrganizerMode: () => void;
  onOpenSettings: () => void;
  onResetSession: () => void;
  onShareMemberLink?: () => void;
  copiedShareLink?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  sessionConfig,
  totalPlayers,
  checkedInCount,
  activeMatchesCount,
  waitingCount,
  isOrganizerMode,
  onToggleOrganizerMode,
  onOpenSettings,
  onResetSession,
  onShareMemberLink,
  copiedShareLink = false,
}) => {
  const hideSkill = sessionConfig.hideSkillFromMembers ?? true;

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        {/* GUANGUAN_BRAND_HEADER_V23B */}
        <div className="flex items-center gap-2.5 shrink-0 mr-2">
          <img
            src="/icons/pwa-192x192.png"
            alt="GuanGuan"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover shadow-lg ring-1 ring-white/15"
          />
          <div className="hidden sm:block leading-tight">
            <div className="text-sm font-black tracking-tight text-white">GuanGuan</div>
            <div className="text-[10px] font-semibold text-cyan-300/90 tracking-wide">BADMINTON LIVE</div>
          </div>
        </div>
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Logo & Session Details */}
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl shadow-inner shrink-0">
              🏸
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  {sessionConfig.sessionTitle}
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                  <ShieldCheck className="w-3 h-3" /> Live
                </span>
              </div>
              <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                <span>📍 {sessionConfig.venueName}</span>
                <span>•</span>
                <span>📅 {sessionConfig.date}</span>
                <span>•</span>
                <span>⏰ {sessionConfig.startTime} - {sessionConfig.endTime} น.</span>
                <span>•</span>
                <span className="text-emerald-400 font-medium">
                  {sessionConfig.courtCount} คอร์ท ({sessionConfig.courtNames.join(', ')})
                </span>
              </p>
            </div>
          </div>

          {/* Quick Session Stats, Role Switcher & Tools */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            {/* Organizer vs Member Mode Badge & Switcher */}
                        {isOrganizerMode && (
              <button
                            type="button"
                            onClick={onToggleOrganizerMode}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border shadow-sm ${
                              isOrganizerMode
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                                : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25'
                            }`}
                            title={
                              isOrganizerMode
                                ? 'คุณอยู่ในโหมดผู้จัดก๊วน (คลิกเพื่อสลับดูมุมมองสมาชิก)'
                                : 'คุณอยู่ในมุมมองสมาชิก (คลิกเพื่อใส่ PIN ปลดล็อคโหมดผู้จัด)'
                            }
                          >
                            {isOrganizerMode ? (
                              <>
                                <Unlock className="w-3.5 h-3.5 text-amber-400" />
                                <span>โหมด: ผู้จัดก๊วน (Admin)</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 ml-1">
                                  สลับดูมุมมองสมาชิก
                                </span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                                <span>มุมมอง: สมาชิกทั่วไป</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 ml-1">
                                  ปลดล็อคผู้จัด 🔒
                                </span>
                              </>
                            )}
                          </button>
            )}

            {/* Quick Metrics */}
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 text-xs">
              <div className="px-2 py-0.5 rounded bg-slate-700/60 text-slate-300">
                มาแล้ว <span className="font-bold text-emerald-400">{checkedInCount}</span>/{totalPlayers}
              </div>
              <div className="px-2 py-0.5 rounded bg-slate-700/60 text-slate-300">
                รอคิว <span className="font-bold text-indigo-400">{waitingCount}</span> คน
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {onShareMemberLink && (
                <button
                  type="button"
                  onClick={onShareMemberLink}
                  title="แชร์ลิงก์ก๊วนให้สมาชิก (เปิดเป็นมุมมองสมาชิกเสมอ)"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold transition"
                >
                  {copiedShareLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copiedShareLink ? 'คัดลอกแล้ว!' : 'แชร์ก๊วน'}</span>
                </button>
              )}
              {/* SETTINGS_ORGANIZER_ONLY_V9 */}
            {isOrganizerMode && (
              <button
                type="button"
                onClick={onOpenSettings}
                title="ตั้งค่าก๊วนและสนาม"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
              {isOrganizerMode && (
                <button
                  type="button"
                  onClick={onResetSession}
                  title="รีเซ็ตก๊วนใหม่ (เฉพาะผู้จัด)"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center space-x-1 sm:space-x-1.5 mt-2.5 overflow-x-auto pb-1 -mx-2 px-2 sm:mx-0 sm:px-0 scrollbar-thin scrollbar-thumb-slate-700">
          {/* 1. Pre-Match Waiting Board Tab (Featured for both members and organizer) */}
          <button
            type="button"
            onClick={() => onSelectTab('prematch')}
              /* MEMBER_MENU_ORDER_123: Member only */
              style={!isOrganizerMode ? { order: 1 } : undefined}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
              currentTab === 'prematch'
                ? 'bg-indigo-600 text-white font-semibold shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-300 shrink-0" />
            <span>1. คิวรอเล่น</span>
            {waitingCount > 0 && (
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 font-bold">
                {waitingCount}
              </span>
            )}
          </button>

          {/* 2. Check-in & Members */}
          <button
            type="button"
            onClick={() => onSelectTab('checkin')}
              /* MEMBER_MENU_ORDER_123: Member only */
              style={!isOrganizerMode ? { order: 2 } : undefined}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
              currentTab === 'checkin'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>2. สมาชิก ({checkedInCount}/{totalPlayers})</span>
          </button>

          {/* 3. Courts & Matches - Organizers Only */}
          {isOrganizerMode && (
            <button
              type="button"
              onClick={() => onSelectTab('courts')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
                currentTab === 'courts'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>3. จัดคอร์ท ({activeMatchesCount})</span>
              <span className="text-[11px] text-amber-400" title="เฉพาะผู้จัด">👑</span>
            </button>
          )}

          {/* 4. Assessment (Organizer Only or Locked) */}
          {/* HIDE_ASSESSMENT_FROM_MEMBER */}
          {isOrganizerMode && (
            <>

          <button
            type="button"
            onClick={() => onSelectTab('assessment')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
              currentTab === 'assessment'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>4. ประเมินมือ</span>
            {hideSkill && (
              isOrganizerMode ? (
                <span className="text-[11px] text-amber-400" title="เฉพาะผู้จัด">👑</span>
              ) : (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              )
            )}
          </button>
            </>
          )}


          {/* 5. Billing & PromptPay */}
          <button
            type="button"
            onClick={() => onSelectTab('billing')}
              /* MEMBER_MENU_ORDER_123: Member only */
              style={!isOrganizerMode ? { order: 3 } : undefined}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
              currentTab === 'billing'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{/* MEMBER_BILLING_NUMBER_3 */}{isOrganizerMode ? '5.' : '3.'} คิดเงิน</span>
          </button>

          {/* 6. Financial Summary & Profit/Loss (Organizer Only - Hidden from members) */}
          {isOrganizerMode && (
            <button
              type="button"
              onClick={() => onSelectTab('finance')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
                currentTab === 'finance'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${currentTab === 'finance' ? 'text-slate-950' : 'text-amber-400'}`} />
              <span>6. สรุปเงิน</span>
              <span className={`text-[11px] ${currentTab === 'finance' ? 'text-slate-950' : 'text-amber-400'}`} title="เฉพาะผู้จัด">👑</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
