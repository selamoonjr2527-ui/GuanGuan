import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Trophy,
  Gift,
  Cake,
  RotateCcw,
  Trash2,
  Search,
  Users,
  CalendarDays,
  Gamepad2,
  AlertTriangle,
  ArchiveRestore,
  Settings2,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Percent,
  BadgeDollarSign,
} from 'lucide-react';
import { Player, SessionConfig } from '../types';
import {
  DeletedMemberRecord,
  MemberLifetimeStatsMap,
  ensureMemberStats,
} from '../utils/memberRecords';
import {
  PromotionRule,
  PromotionRedemption,
  PromotionConditionType,
  PromotionRewardType,
  getPromotionAvailableCredits,
  conditionLabel,
  rewardLabel,
  calculatePlayerBaseCharge,
  getSessionPromotionDiscountTotal,
} from '../utils/promotionRules';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  deletedMembers: DeletedMemberRecord[];
  memberStats: MemberLifetimeStatsMap;
  sessionDate: string;
  sessionConfig: SessionConfig;
  promotionRules: PromotionRule[];
  promotionRedemptions: PromotionRedemption[];
  onRestoreMember: (deletedId: string) => void;
  onPermanentDeleteMember: (deletedId: string) => void;
  onUpdateBirthday: (playerId: string, birthday: string) => void;
  onSavePromotionRule: (rule: PromotionRule) => void;
  onDeletePromotionRule: (promotionId: string) => void;
  onRedeemPromotion: (playerId: string, promotionId: string) => void;
}

const NEW_RULE = (): PromotionRule => ({
  id: `promo-${Date.now()}`,
  name: 'โปรโมชั่นใหม่',
  enabled: true,
  conditionType: 'games_milestone',
  conditionValue: 50,
  rewardType: 'free_shuttle_match',
  rewardValue: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const MemberCenterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  players,
  deletedMembers,
  memberStats,
  sessionDate,
  sessionConfig,
  promotionRules,
  promotionRedemptions,
  onRestoreMember,
  onPermanentDeleteMember,
  onUpdateBirthday,
  onSavePromotionRule,
  onDeletePromotionRule,
  onRedeemPromotion,
}) => {
  const [tab, setTab] = useState<'stats' | 'promotions' | 'trash'>('stats');
  const [search, setSearch] = useState('');
  const [editingRule, setEditingRule] = useState<PromotionRule | null>(null);

  const statsRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return players
      .filter(
        (p) =>
          !q ||
          p.nickname.toLowerCase().includes(q) ||
          (p.fullName || '').toLowerCase().includes(q)
      )
      .map((player) => {
        const stats = ensureMemberStats(memberStats, player, sessionDate);
        const availablePromos = promotionRules
          .filter(
            (rule) =>
              getPromotionAvailableCredits(
                rule,
                player,
                memberStats,
                promotionRedemptions,
                sessionDate
              ) > 0
          )
          .map((rule) => ({
            rule,
            credits: getPromotionAvailableCredits(
              rule,
              player,
              memberStats,
              promotionRedemptions,
              sessionDate
            ),
          }));

        const baseCharge = calculatePlayerBaseCharge(player, sessionConfig);
        const discount = getSessionPromotionDiscountTotal(
          player.id,
          sessionDate,
          promotionRedemptions
        );

        return {
          player,
          stats,
          availablePromos,
          baseCharge,
          promotionDiscount: Math.min(baseCharge.total, discount),
          finalCharge: Math.max(0, baseCharge.total - discount),
        };
      })
      .sort(
        (a, b) =>
          b.availablePromos.length - a.availablePromos.length ||
          b.stats.totalGames - a.stats.totalGames
      );
  }, [
    players,
    memberStats,
    sessionDate,
    search,
    promotionRules,
    promotionRedemptions,
    sessionConfig,
  ]);

  const trashRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deletedMembers
      .filter(
        (r) =>
          !q ||
          r.player.nickname.toLowerCase().includes(q) ||
          (r.player.fullName || '').toLowerCase().includes(q)
      )
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }, [deletedMembers, search]);

  const eligibleCount = statsRows.filter(
    (x) => x.availablePromos.length > 0
  ).length;

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[20000] bg-slate-950/90 backdrop-blur-md overflow-y-auto">
      <div className="min-h-full p-3 sm:p-6 flex items-start justify-center">
        <div className="w-full max-w-6xl bg-slate-900 border border-slate-700 rounded-[28px] shadow-2xl overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-violet-950/20 to-slate-900">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-300 flex items-center justify-center shrink-0">
                <Trophy className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-white">
                  Member Center • สถิติ & โปรโมชั่น
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Lifetime Stats • Custom Promotion • Billing After Checkout • Member Trash
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-700 hover:bg-rose-950 text-slate-400 hover:text-rose-300 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                <div className="text-[10px] text-slate-500">สมาชิก</div>
                <div className="text-xl font-black text-white">{players.length}</div>
              </div>
              <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/50 p-3">
                <div className="text-[10px] text-emerald-400">มีโปรโมชั่นพร้อมใช้</div>
                <div className="text-xl font-black text-emerald-300">{eligibleCount}</div>
              </div>
              <div className="rounded-xl bg-violet-950/30 border border-violet-800/50 p-3">
                <div className="text-[10px] text-violet-400">โปรโมชั่นที่เปิด</div>
                <div className="text-xl font-black text-violet-300">
                  {promotionRules.filter((x) => x.enabled).length}
                </div>
              </div>
              <div className="rounded-xl bg-rose-950/30 border border-rose-800/50 p-3">
                <div className="text-[10px] text-rose-400">ถังขยะ</div>
                <div className="text-xl font-black text-rose-300">{deletedMembers.length}</div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-950 border border-slate-800">
                <button
                  onClick={() => setTab('stats')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                    tab === 'stats' ? 'bg-violet-500 text-white' : 'text-slate-400'
                  }`}
                >
                  <Trophy className="w-4 h-4" /> สมาชิก & สิทธิ์
                </button>
                <button
                  onClick={() => setTab('promotions')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                    tab === 'promotions' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  <Settings2 className="w-4 h-4" /> ตั้งโปรโมชั่น
                </button>
                <button
                  onClick={() => setTab('trash')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                    tab === 'trash' ? 'bg-rose-500 text-white' : 'text-slate-400'
                  }`}
                >
                  <Trash2 className="w-4 h-4" /> ถังขยะ ({deletedMembers.length})
                </button>
              </div>

              {tab !== 'promotions' && (
                <div className="relative w-full lg:w-80">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาชื่อสมาชิก..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              )}
            </div>

            {tab === 'stats' && (
              <>
                <div className="rounded-xl bg-blue-950/25 border border-blue-800/40 p-3 text-xs text-blue-200 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    การคิดค่าลูกใช้ <strong>จำนวน Match</strong> เท่านั้น:
                    1 Match แบบไป-กลับ = 1 ลูกฐาน • แม้ภายในจะบันทึก 2 Games
                    และต้อง <strong>Check-out ก่อน</strong> จึงชำระเงินได้
                  </span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {statsRows.map(
                    ({
                      player,
                      stats,
                      availablePromos,
                      baseCharge,
                      promotionDiscount,
                      finalCharge,
                    }) => (
                      <div
                        key={player.id}
                        className="rounded-2xl bg-slate-950/65 border border-slate-800 p-4 space-y-3"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-11 h-11 rounded-xl bg-gradient-to-br ${
                              player.avatarColor || 'from-indigo-500 to-blue-600'
                            } text-white font-black flex items-center justify-center`}
                          >
                            {player.nickname.slice(0, 1)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-white">{player.nickname}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                                มือ {player.skillLevel}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                                  player.isCheckedIn
                                    ? 'bg-amber-950 border-amber-800 text-amber-300'
                                    : 'bg-emerald-950 border-emerald-800 text-emerald-300'
                                }`}
                              >
                                {player.isCheckedIn ? 'ยัง Check-in • ยังจ่ายไม่ได้' : 'Check-out • จ่ายได้'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-center">
                            <Gamepad2 className="w-4 h-4 text-emerald-400 mx-auto" />
                            <div className="text-lg font-black text-white">{stats.totalGames}</div>
                            <div className="text-[9px] text-slate-500">Lifetime Games</div>
                          </div>
                          <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-center">
                            <Trophy className="w-4 h-4 text-amber-400 mx-auto" />
                            <div className="text-lg font-black text-white">{stats.totalMatches}</div>
                            <div className="text-[9px] text-slate-500">Lifetime Matches</div>
                          </div>
                          <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-center">
                            <Users className="w-4 h-4 text-cyan-400 mx-auto" />
                            <div className="text-lg font-black text-white">{stats.totalSessions}</div>
                            <div className="text-[9px] text-slate-500">Visits</div>
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs">
                          <div className="font-bold text-white mb-2">ยอดรอบนี้</div>
                          <div className="grid grid-cols-2 gap-y-1 text-slate-400">
                            <span>ค่าคอร์ท</span>
                            <span className="text-right">{baseCharge.courtFee.toFixed(0)} บาท</span>
                            <span>ค่าลูก {baseCharge.matchCount} Match</span>
                            <span className="text-right">{baseCharge.shuttleFee.toFixed(0)} บาท</span>
                            <span>ลูกเพิ่ม {baseCharge.extraShuttleCount}</span>
                            <span className="text-right">{baseCharge.extraShuttleFee.toFixed(0)} บาท</span>
                            {promotionDiscount > 0 && (
                              <>
                                <span className="text-emerald-400">ส่วนลดโปรโมชั่น</span>
                                <span className="text-right text-emerald-400">-{promotionDiscount.toFixed(0)} บาท</span>
                              </>
                            )}
                          </div>
                          <div className="border-t border-slate-700 mt-2 pt-2 flex justify-between font-black text-white">
                            <span>สุทธิ</span>
                            <span>{finalCharge.toFixed(0)} บาท</span>
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-pink-300 flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5" />
                              วันเกิด
                            </span>
                          </div>
                          <input
                            type="date"
                            value={stats.birthday || ''}
                            onChange={(e) => onUpdateBirthday(player.id, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                            <Gift className="w-4 h-4" />
                            โปรโมชั่นพร้อมใช้
                          </div>

                          {availablePromos.length > 0 ? (
                            availablePromos.map(({ rule, credits }) => (
                              <div
                                key={rule.id}
                                className="rounded-xl bg-emerald-950/20 border border-emerald-800/40 p-3 flex items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="text-xs font-bold text-white">{rule.name}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {conditionLabel(rule)} → {rewardLabel(rule)}
                                    {credits > 1 ? ` • พร้อมใช้ ${credits} สิทธิ์` : ''}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onRedeemPromotion(player.id, rule.id)}
                                  className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-black shrink-0"
                                >
                                  ใช้สิทธิ์
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="text-[11px] text-slate-500 bg-slate-900 rounded-xl p-3 border border-slate-800">
                              ยังไม่มีโปรโมชั่นพร้อมใช้
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </>
            )}

            {tab === 'promotions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black text-white">Promotion Rules</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      สร้างโปรโมชั่นเองได้ ไม่ต้องแก้ Code
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingRule(NEW_RULE())}
                    className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> เพิ่มโปรโมชั่น
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {promotionRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 space-y-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-white">{rule.name}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                                rule.enabled
                                  ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                                  : 'bg-slate-900 border-slate-700 text-slate-500'
                              }`}
                            >
                              {rule.enabled ? 'เปิดใช้งาน' : 'ปิด'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {conditionLabel(rule)} → {rewardLabel(rule)}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingRule({ ...rule })}
                          className="flex-1 px-3 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 text-xs font-bold"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSavePromotionRule({
                              ...rule,
                              enabled: !rule.enabled,
                              updatedAt: Date.now(),
                            })
                          }
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 flex items-center gap-1"
                        >
                          {rule.enabled ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                          {rule.enabled ? 'On' : 'Off'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePromotionRule(rule.id)}
                          className="px-3 py-2 rounded-xl bg-rose-950 border border-rose-800 text-rose-300 text-xs"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {editingRule && (
                  <div className="rounded-2xl bg-slate-950 border-2 border-amber-500/40 p-4 sm:p-5 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-black text-white">ตั้งค่าโปรโมชั่น</h4>
                      <button onClick={() => setEditingRule(null)} className="text-slate-500 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400">ชื่อโปรโมชั่น</label>
                        <input
                          value={editingRule.name}
                          onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400">เงื่อนไข</label>
                        <select
                          value={editingRule.conditionType}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              conditionType: e.target.value as PromotionConditionType,
                            })
                          }
                          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white"
                        >
                          <option value="games_milestone">ครบจำนวน Games</option>
                          <option value="visits_milestone">ครบจำนวนครั้งที่มา</option>
                          <option value="birthday">วันเกิด</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400">จำนวน</label>
                        <input
                          type="number"
                          min={1}
                          disabled={editingRule.conditionType === 'birthday'}
                          value={editingRule.conditionValue}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              conditionValue: Math.max(1, Number(e.target.value || 1)),
                            })
                          }
                          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-40"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400">รางวัล / ส่วนลด</label>
                        <select
                          value={editingRule.rewardType}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              rewardType: e.target.value as PromotionRewardType,
                            })
                          }
                          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white"
                        >
                          <option value="free_court_fee">ฟรีค่าคอร์ท</option>
                          <option value="free_shuttle_match">ฟรีค่าลูกตามจำนวน Match</option>
                          <option value="discount_amount">ลดเป็นจำนวนบาท</option>
                          <option value="discount_percent">ลดเป็นเปอร์เซ็นต์</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400">
                          {editingRule.rewardType === 'discount_percent'
                            ? 'เปอร์เซ็นต์'
                            : editingRule.rewardType === 'discount_amount'
                            ? 'จำนวนบาท'
                            : editingRule.rewardType === 'free_shuttle_match'
                            ? 'จำนวน Match ที่ฟรี'
                            : 'ค่า'}
                        </label>
                        <input
                          type="number"
                          min={0}
                          disabled={editingRule.rewardType === 'free_court_fee'}
                          value={editingRule.rewardValue}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              rewardValue: Math.max(0, Number(e.target.value || 0)),
                            })
                          }
                          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-40"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs text-slate-300">
                      Preview: <strong className="text-white">{editingRule.name}</strong>
                      <br />
                      {conditionLabel(editingRule)} → {rewardLabel(editingRule)}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSavePromotionRule(editingRule);
                        setEditingRule(null);
                      }}
                      className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" /> บันทึกโปรโมชั่น
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab === 'trash' && (
              <>
                <div className="rounded-xl bg-rose-950/30 border border-rose-800/50 p-3 text-xs text-rose-200 flex gap-2">
                  <ArchiveRestore className="w-4 h-4 shrink-0" />
                  ลบสมาชิกแล้วจะย้ายมาเก็บที่นี่ก่อน Restore กลับด้วย Member ID เดิมได้
                </div>

                <div className="space-y-2">
                  {trashRows.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 flex flex-col md:flex-row md:items-center gap-3"
                    >
                      <div
                        className={`w-11 h-11 rounded-xl bg-gradient-to-br ${
                          item.player.avatarColor || 'from-slate-500 to-slate-700'
                        } text-white font-black flex items-center justify-center`}
                      >
                        {item.player.nickname.slice(0, 1)}
                      </div>
                      <div className="flex-1">
                        <div className="font-black text-white">{item.player.nickname}</div>
                        <div className="text-[10px] text-slate-500">
                          ID: {item.playerId} • มือ {item.player.skillLevel} • ลบ{' '}
                          {new Date(item.deletedAt).toLocaleString('th-TH')}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onRestoreMember(item.id)}
                          className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black flex items-center gap-1"
                        >
                          <RotateCcw className="w-4 h-4" /> Restore
                        </button>
                        <button
                          onClick={() => onPermanentDeleteMember(item.id)}
                          className="px-3 py-2 rounded-xl bg-rose-950 border border-rose-800 text-rose-300 text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" /> ลบถาวร
                        </button>
                      </div>
                    </div>
                  ))}
                  {trashRows.length === 0 && (
                    <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                      🗑️ ถังขยะว่าง
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
