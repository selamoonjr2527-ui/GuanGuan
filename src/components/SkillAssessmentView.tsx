import React, { useState, useEffect } from 'react';
import { 
  Award, CheckCircle2, ChevronRight, HelpCircle, 
  Sparkles, UserCheck, ShieldAlert, BarChart3, Info
} from 'lucide-react';
import { Player, SkillLevel, SKILL_LEVELS, AssessmentQuestion } from '../types';
import { ASSESSMENT_QUESTIONS } from '../utils/storage';
import { calculateSkillTier } from '../utils/matchmaker';

interface SkillAssessmentViewProps {
  players: Player[];
  selectedPlayerForAssessment?: Player | null;
  onUpdatePlayerSkill: (playerId: string, skillLevel: SkillLevel, skillScore: number) => void;
  isOrganizerMode?: boolean;
  hideSkillFromMembers?: boolean;
  onUnlockOrganizer?: () => void;
}

export const SkillAssessmentView: React.FC<SkillAssessmentViewProps> = ({
  players,
  selectedPlayerForAssessment,
  onUpdatePlayerSkill,
  isOrganizerMode = false,
  hideSkillFromMembers = true,
  onUnlockOrganizer,
}) => {
  const isLocked = !isOrganizerMode && hideSkillFromMembers;

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    selectedPlayerForAssessment?.id || players[0]?.id || ''
  );

  // Question answers (questionId -> points 1..5)
  const [answers, setAnswers] = useState<Record<string, number>>({
    q1: 3,
    q2: 3,
    q3: 3,
    q4: 3,
    q5: 3,
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync when selectedPlayerForAssessment changes
  useEffect(() => {
    if (selectedPlayerForAssessment) {
      setSelectedPlayerId(selectedPlayerForAssessment.id);
      // Pre-set answers based on player's current score
      const basePoints = Math.round(selectedPlayerForAssessment.skillScore) || 3;
      setAnswers({
        q1: basePoints,
        q2: basePoints,
        q3: basePoints,
        q4: basePoints,
        q5: basePoints,
      });
    }
  }, [selectedPlayerForAssessment]);

  const targetPlayer = players.find((p) => p.id === selectedPlayerId);

  // Compute average score & suggested tier
  const pointsList = Object.values(answers) as number[];
  const totalPoints = pointsList.reduce((acc: number, curr: number) => acc + curr, 0);
  const averageScore = pointsList.length > 0 ? totalPoints / pointsList.length : 3.0;

  const roundedScore = Math.round(averageScore * 10) / 10;
  const suggestedTier = calculateSkillTier(roundedScore);
  const suggestedMeta = SKILL_LEVELS[suggestedTier];

  const handleSelectOption = (questionId: string, points: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: points,
    }));
  };

  const handleApplyToPlayer = () => {
    if (!targetPlayer) return;
    onUpdatePlayerSkill(targetPlayer.id, suggestedTier, roundedScore);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleDirectSetTier = (tier: SkillLevel) => {
    if (!targetPlayer) return;
    const score = SKILL_LEVELS[tier].score;
    onUpdatePlayerSkill(targetPlayer.id, tier, score);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  if (isLocked) {
    return (
      <div className="max-w-xl mx-auto my-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-5 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center text-3xl mx-auto">
          🔒
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">พื้นที่เฉพาะผู้จัดก๊วน (Organizer Only)</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
            ผลการประเมินและระดับมือ (N, S-, S, S+, P) ถูกตั้งค่าให้มองเห็นได้เฉพาะผู้จัดก๊วน เพื่อรักษาความเป็นส่วนตัวและบรรยากาศที่เป็นกันเองในก๊วน
          </p>
        </div>

        <div className="pt-2">
          {onUnlockOrganizer && (
            <button
              type="button"
              onClick={onUnlockOrganizer}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-md"
            >
              <span>🔑 ปลดล็อคด้วยรหัส PIN ผู้จัดก๊วน</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Introduction Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                <Award className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">ระบบประเมินมือแบดมินตันมาตรฐาน (Hand Level Rating)</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              มาตรฐานก๊วนแบดแบ่งมือออกเป็น 5 ระดับ: <b>Newbie (มือใหม่)</b>, <b>C (เริ่มต้นพัฒนา)</b>, <b>B (มือกลาง)</b>, <b>A (มือแน่น)</b>, และ <b>PRO (มือโปร/แข่ง)</b> เพื่อใช้ในการจัดคู่ให้สูสี ตีสนุก ไม่ได้เปรียบเสียเปรียบ
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl shrink-0">
            <div className="text-xs text-slate-400">เลือกผู้เล่นเพื่อประเมิน:</div>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="text-xs bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname} (ปัจจุบัน: มือ {p.skillLevel})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tier Reference Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>ตารางเกณฑ์วัดระดับฝีมือก๊วนแบดมินตัน</span>
          </h3>
          <span className="text-[11px] text-slate-400">คลิกที่ระดับมือเพื่อปรับระดับให้ผู้เล่นทันที</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {(Object.keys(SKILL_LEVELS) as SkillLevel[]).map((levelKey) => {
            const meta = SKILL_LEVELS[levelKey];
            const isCurrent = targetPlayer?.skillLevel === levelKey;
            const isSuggested = suggestedTier === levelKey;

            return (
              <div
                key={levelKey}
                onClick={() => handleDirectSetTier(levelKey)}
                className={`cursor-pointer border rounded-xl p-3 transition flex flex-col justify-between relative ${
                  isCurrent
                    ? 'border-emerald-500 bg-emerald-950/30 ring-2 ring-emerald-500/40'
                    : isSuggested
                    ? 'border-amber-500/60 bg-amber-950/20'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md border ${meta.bgColor} ${meta.color} ${meta.borderColor}`}
                    >
                      มือ {meta.code}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded">
                        มือปัจจุบัน
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-white text-xs mt-2">{meta.nameThai}</div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                    {meta.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                  <span>คะแนนเทียบ: {meta.score.toFixed(1)}</span>
                  <span className="text-emerald-400 hover:underline">คลิกเลือก</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Assessment Tool */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 5 Questions Form */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>แบบทดสอบประเมิน 5 หมวดทักษะ</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                เลือกคำตอบที่ตรงกับทักษะจริงของ {targetPlayer?.nickname || 'ผู้เล่น'}
              </p>
            </div>
            <div className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full">
              ทำครบ 5 ข้อ
            </div>
          </div>

          <div className="space-y-5">
            {ASSESSMENT_QUESTIONS.map((question) => {
              const currentVal = answers[question.id] || 3;
              return (
                <div key={question.id} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider block">
                        {question.category}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-200 mt-0.5">
                        {question.titleThai}
                      </h4>
                    </div>
                    <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                      {currentVal} คะแนน
                    </span>
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-1 gap-1.5">
                    {question.options.map((opt) => {
                      const isSelected = currentVal === opt.points;
                      return (
                        <button
                          type="button"
                          key={opt.points}
                          onClick={() => handleSelectOption(question.id, opt.points)}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs transition flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                                  : 'border-slate-600'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                            </div>
                            <span>{opt.textThai}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                            {opt.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Realtime Result & Action Card */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sticky top-24 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs text-slate-400 font-medium">ผลการวิเคราะห์ระดับมือ</span>
              <span className="text-xs text-emerald-400 font-bold">Auto Calculate</span>
            </div>

            {/* Target Player Card */}
            {targetPlayer && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${targetPlayer.avatarColor} text-white font-bold flex items-center justify-center text-sm shadow-sm`}
                >
                  {targetPlayer.nickname.slice(0, 1)}
                </div>
                <div>
                  <div className="font-bold text-white text-sm">{targetPlayer.nickname}</div>
                  <div className="text-xs text-slate-400">
                    มือเดิมในระบบ: <span className="text-slate-200 font-medium">มือ {targetPlayer.skillLevel}</span> ({targetPlayer.skillScore.toFixed(1)})
                  </div>
                </div>
              </div>
            )}

            {/* Score Display */}
            <div className="text-center py-4 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2">
              <div className="text-xs text-slate-400 font-medium">คะแนนเฉลี่ยจากการประเมิน</div>
              <div className="text-4xl font-extrabold text-white tracking-tight">
                {roundedScore.toFixed(1)} <span className="text-sm font-normal text-slate-500">/ 5.0</span>
              </div>

              <div className="pt-2">
                <span className="text-xs text-slate-400 block mb-1">ผลระดับมือที่แนะนำ:</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-base font-extrabold border ${suggestedMeta.bgColor} ${suggestedMeta.color} ${suggestedMeta.borderColor}`}
                >
                  <span>มือ {suggestedMeta.code}</span>
                  <span className="text-xs font-normal">({suggestedMeta.nameThai})</span>
                </span>
              </div>
            </div>

            {/* Description note */}
            <div className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-xl border border-slate-800 leading-relaxed">
              <div className="font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-emerald-400" />
                <span>คำแนะนำการจัดลงก๊วน:</span>
              </div>
              {suggestedMeta.description}
            </div>

            {/* Apply Button */}
            <button
              type="button"
              onClick={handleApplyToPlayer}
              disabled={!targetPlayer}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition shadow-md flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>บันทึกระดับมือให้ {targetPlayer?.nickname || 'ผู้เล่น'}</span>
            </button>

            {savedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs text-center animate-fade-in font-medium">
                ✅ อัปเดตระดับมือสำเร็จเรียบร้อย! ระบบจะนำไปคำนวณการจัดคู่ทันที
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
