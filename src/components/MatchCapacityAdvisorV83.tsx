import React, { useMemo } from 'react';

type AnyRecord = Record<string, any>;

interface Props {
  archives: AnyRecord[];
  currentMatchHistory: AnyRecord[];
  sessionConfig: AnyRecord;
  players: AnyRecord[];
}

const n = (value: unknown) => {
  const x = Number(value || 0);
  return Number.isFinite(x) ? x : 0;
};

const roundHalfUp = (value: number) =>
  Math.ceil(value * 2) / 2;

const fmt = (value: number, digits = 1) =>
  value.toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

const durationFromMatch = (
  match: AnyRecord
): number | null => {
  const startedAt = n(match.startedAt);
  const finishedAt = n(match.finishedAt);

  if (
    startedAt > 0 &&
    finishedAt > startedAt
  ) {
    const minutes =
      (finishedAt - startedAt) / 60000;

    if (minutes >= 5 && minutes <= 120) {
      return minutes;
    }
  }

  const saved = n(match.durationMinutes);

  if (saved >= 5 && saved <= 120) {
    return saved;
  }

  return null;
};

const percentile = (
  values: number[],
  p: number
) => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const index =
    (sorted.length - 1) * p;

  const lo = Math.floor(index);
  const hi = Math.ceil(index);

  if (lo === hi) return sorted[lo];

  const fraction = index - lo;

  return (
    sorted[lo] +
    (sorted[hi] - sorted[lo]) *
      fraction
  );
};

const historicalCourtHours = (
  archive: AnyRecord
) => {
  const direct = n(archive.totalCourtHours);
  if (direct > 0) return direct;

  const date = String(
    archive.archiveDate || ''
  );

  const venue = String(
    archive.venueName || ''
  ).toLowerCase();

  const isSmash =
    venue.includes('smash') ||
    venue.includes('สแมช');

  // Confirmed historical data.
  if (isSmash && date === '2026-09-25') {
    return 8;
  }

  if (isSmash && date === '2026-10-09') {
    return 9;
  }

  const count = n(archive.courtCount);
  const hours = n(archive.totalHours);

  if (count > 0 && hours > 0) {
    return count * hours;
  }

  return 0;
};

const durationHours = (
  startTime?: string,
  endTime?: string
) => {
  if (!startTime || !endTime) return 0;

  const [sh, sm] = String(startTime)
    .split(':')
    .map(Number);
  const [eh, em] = String(endTime)
    .split(':')
    .map(Number);

  if (
    !Number.isFinite(sh) ||
    !Number.isFinite(sm) ||
    !Number.isFinite(eh) ||
    !Number.isFinite(em)
  ) {
    return 0;
  }

  let minutes =
    eh * 60 + em - (sh * 60 + sm);

  if (minutes < 0) {
    minutes += 24 * 60;
  }

  return Math.max(0, minutes / 60);
};

const currentCourtPlan = (
  sessionConfig: AnyRecord
) => {
  const courts = Array.isArray(
    sessionConfig.sessionCourts
  )
    ? sessionConfig.sessionCourts.filter(
        (court: AnyRecord) =>
          court.active !== false
      )
    : [];

  if (courts.length > 0) {
    const totalCourtHours = courts.reduce(
      (sum: number, court: AnyRecord) =>
        sum +
        durationHours(
          court.startTime,
          court.endTime
        ),
      0
    );

    return {
      courts: courts.length,
      totalCourtHours,
      avgHoursPerCourt:
        courts.length > 0
          ? totalCourtHours /
            courts.length
          : 0,
    };
  }

  const count = Math.max(
    1,
    n(sessionConfig.courtCount) || 1
  );

  const hours = Math.max(
    0,
    n(sessionConfig.totalHours)
  );

  return {
    courts: count,
    totalCourtHours: count * hours,
    avgHoursPerCourt: hours,
  };
};

export const MatchCapacityAdvisorV83: React.FC<
  Props
> = ({
  archives = [],
  currentMatchHistory = [],
  sessionConfig,
  players = [],
}) => {
  const result = useMemo(() => {
    const allHistory = [
      ...currentMatchHistory,
      ...archives.flatMap((archive) =>
        Array.isArray(
          archive.matchHistorySnapshot
        )
          ? archive.matchHistorySnapshot
          : []
      ),
    ];

    const durations = allHistory
      .map(durationFromMatch)
      .filter(
        (value): value is number =>
          value !== null
      );

    const averageDuration =
      durations.length > 0
        ? durations.reduce(
            (sum, value) => sum + value,
            0
          ) / durations.length
        : Math.max(
            1,
            n(
              sessionConfig
                .avgMatchDurationMinutes
            ) || 20
          );

    const p75Duration =
      durations.length >= 4
        ? percentile(durations, 0.75)
        : averageDuration;

    // Effective cycle includes match + court turnover / idle time.
    let observedCourtMinutes = 0;
    let observedMatches = 0;

    archives.forEach((archive) => {
      const courtHours =
        historicalCourtHours(archive);

      const matches = Math.max(
        0,
        n(archive.totalMatches)
      );

      if (
        courtHours > 0 &&
        matches > 0
      ) {
        observedCourtMinutes +=
          courtHours * 60;
        observedMatches += matches;
      }
    });

    const effectiveCycle =
      observedMatches > 0
        ? observedCourtMinutes /
          observedMatches
        : 0;

    // Use the slower real-world measure for planning.
    const planningMinutes = Math.max(
      averageDuration,
      p75Duration,
      effectiveCycle,
      1
    );

    const checkedIn = players.filter(
      (p) => p.isCheckedIn
    ).length;

    const todayRoster = players.filter(
      (p) => p.todayRoster
    ).length;

    const latestArchiveMembers =
      archives.length > 0
        ? Math.max(
            0,
            n(
              [...archives].sort((a, b) =>
                String(
                  b.archiveDate || ''
                ).localeCompare(
                  String(
                    a.archiveDate || ''
                  )
                )
              )[0]?.totalPlayers
            )
          )
        : 0;

    const memberCount =
      checkedIn > 0
        ? checkedIn
        : todayRoster > 0
        ? todayRoster
        : latestArchiveMembers > 0
        ? latestArchiveMembers
        : 24;

    // GuanGuan operating target: roughly 4 Matches/member.
    const targetMatchesPerMember = 4;

    const requiredMatches = Math.ceil(
      (memberCount *
        targetMatchesPerMember) /
        4
    );

    const requiredCourtHoursRaw =
      (requiredMatches *
        planningMinutes) /
      60;

    // Round booking recommendation to 0.5 hour.
    const requiredCourtHours =
      roundHalfUp(requiredCourtHoursRaw);

    const plan =
      currentCourtPlan(sessionConfig);

    const currentCapacityMatches =
      Math.floor(
        (plan.totalCourtHours * 60) /
          planningMinutes
      );

    const currentCapacityMembers =
      Math.floor(
        (currentCapacityMatches * 4) /
          targetMatchesPerMember
      );

    const shortageCourtHours =
      Math.max(
        0,
        requiredCourtHours -
          plan.totalCourtHours
      );

    const extraCourtHours =
      roundHalfUp(shortageCourtHours);

    const hoursPerCourt =
      Math.max(
        0.5,
        plan.avgHoursPerCourt ||
          n(sessionConfig.totalHours) ||
          4
      );

    const recommendedCourts =
      Math.max(
        1,
        Math.ceil(
          requiredCourtHours /
            hoursPerCourt
        )
      );

    const recommendedHoursIfKeepCourts =
      roundHalfUp(
        requiredCourtHours /
          Math.max(1, plan.courts)
      );

    const averageMatchesPerMember =
      currentCapacityMatches > 0 &&
      memberCount > 0
        ? (currentCapacityMatches * 4) /
          memberCount
        : 0;

    const enough =
      plan.totalCourtHours >=
      requiredCourtHours;

    return {
      durations,
      averageDuration,
      p75Duration,
      effectiveCycle,
      planningMinutes,
      memberCount,
      targetMatchesPerMember,
      requiredMatches,
      requiredCourtHours,
      plan,
      currentCapacityMatches,
      currentCapacityMembers,
      extraCourtHours,
      recommendedCourts,
      recommendedHoursIfKeepCourts,
      averageMatchesPerMember,
      enough,
    };
  }, [
    archives,
    currentMatchHistory,
    sessionConfig,
    players,
  ]);

  return (
    <div
      className="rounded-3xl border border-cyan-700/40 bg-gradient-to-br from-slate-900 to-cyan-950/15 p-4 sm:p-5"
      data-match-capacity-advisor-v83
    >
      {/* MATCH_CAPACITY_ADVISOR_V83 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black text-cyan-300">
            ⏱ Auto Match Timing & Court Advisor
          </div>
          <h3 className="mt-1 text-lg font-black text-white">
            ระบบแนะนำ Court / ชั่วโมงอัตโนมัติ
          </h3>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            ใช้เวลา Start → Finish จริงของ Match
            + ประสิทธิภาพ Court จาก Archive
            ไม่ต้องกรอกนาทีต่อ Match เอง
          </p>
        </div>

        <div
          className={`rounded-2xl border px-4 py-3 ${
            result.enough
              ? 'border-emerald-700/50 bg-emerald-950/20'
              : 'border-rose-700/50 bg-rose-950/20'
          }`}
        >
          <div className="text-[10px] text-slate-400">
            สำหรับ {result.memberCount} คน
          </div>
          <div
            className={`mt-1 text-xl font-black ${
              result.enough
                ? 'text-emerald-300'
                : 'text-rose-300'
            }`}
          >
            {result.enough
              ? '✅ Court-Hours พอ'
              : '⚠️ Court-Hours ไม่พอ'}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-[10px] text-slate-500">
            Avg Match จริง
          </div>
          <div className="mt-1 text-lg font-black text-cyan-300">
            {fmt(result.averageDuration)} นาที
          </div>
          <div className="mt-1 text-[9px] text-slate-600">
            จาก {result.durations.length} Match
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-[10px] text-slate-500">
            P75 Match
          </div>
          <div className="mt-1 text-lg font-black text-violet-300">
            {fmt(result.p75Duration)} นาที
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-[10px] text-slate-500">
            Effective Cycle
          </div>
          <div className="mt-1 text-lg font-black text-amber-300">
            {fmt(result.planningMinutes)} นาที
          </div>
          <div className="mt-1 text-[9px] text-slate-600">
            ใช้ค่านี้วางแผนจริง
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-[10px] text-slate-500">
            Court-Hours ปัจจุบัน
          </div>
          <div className="mt-1 text-lg font-black text-white">
            {fmt(result.plan.totalCourtHours)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-[10px] text-slate-500">
            Court-Hours ที่ควรมี
          </div>
          <div className="mt-1 text-lg font-black text-emerald-300">
            {fmt(result.requiredCourtHours)}
          </div>
          <div className="mt-1 text-[9px] text-slate-600">
            เป้า {result.targetMatchesPerMember} Match/คน
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="text-xs font-black text-white">
          📌 คำแนะนำ
        </div>

        {result.enough ? (
          <div className="mt-2 text-sm leading-relaxed text-emerald-200">
            จำนวนสมาชิก <strong>{result.memberCount} คน</strong>{' '}
            เหมาะกับ Court-Hours ปัจจุบันแล้ว
            โดยรองรับได้ประมาณ{' '}
            <strong>
              {fmt(result.averageMatchesPerMember)} Match/คน
            </strong>
          </div>
        ) : (
          <div className="mt-2 space-y-2 text-sm leading-relaxed">
            <div className="text-rose-200">
              สำหรับ <strong>{result.memberCount} คน</strong>{' '}
              และเป้าหมาย{' '}
              <strong>{result.targetMatchesPerMember} Match/คน</strong>{' '}
              ต้องใช้ประมาณ{' '}
              <strong>{fmt(result.requiredCourtHours)} Court-Hours</strong>
              {' '}แต่ปัจจุบันมี{' '}
              <strong>{fmt(result.plan.totalCourtHours)}</strong>
            </div>

            <div className="text-cyan-200">
              ทางเลือก A: เพิ่ม Court-Time อีกประมาณ{' '}
              <strong>{fmt(result.extraCourtHours)} Court-Hours</strong>
            </div>

            <div className="text-violet-200">
              ทางเลือก B: ถ้าเล่นประมาณ{' '}
              <strong>{fmt(result.plan.avgHoursPerCourt)} ชม./Court</strong>{' '}
              แนะนำอย่างน้อย{' '}
              <strong>{result.recommendedCourts} Court</strong>
            </div>

            <div className="text-amber-200">
              ทางเลือก C: ถ้าคงไว้{' '}
              <strong>{result.plan.courts} Court</strong>{' '}
              ควรเปิดประมาณ{' '}
              <strong>{fmt(result.recommendedHoursIfKeepCourts)} ชม./Court</strong>
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-slate-500">
          ระบบใช้ Effective Cycle ที่ช้ากว่า
          ระหว่างเวลา Match จริง, P75 และ Throughput จาก Court-Hours
          เพื่อเผื่อเวลาสลับคน/จัดคู่/พัก Court
          จึงไม่ประเมิน Capacity แบบเต็ม 100% เกินจริง
        </div>
      </div>
    </div>
  );
};

export default MatchCapacityAdvisorV83;