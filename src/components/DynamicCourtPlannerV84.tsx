import React, { useMemo, useState } from 'react';

type AnyRecord = Record<string, any>;

interface CourtPlanRow {
  id: string;
  count: number;
  hours: number;
  rate: number;
}

interface Props {
  archives: AnyRecord[];
  currentMatchHistory: AnyRecord[];
  sessionConfig: AnyRecord;
  players: AnyRecord[];
}

const n = (value: unknown) => {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
};

const money = (value: number) =>
  value.toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const fmt = (value: number, digits = 1) =>
  value.toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

const roundHalfUp = (value: number) =>
  Math.ceil(value * 2) / 2;

const matchDuration = (item: AnyRecord) => {
  const startedAt = n(item.startedAt);
  const finishedAt = n(item.finishedAt);

  if (startedAt > 0 && finishedAt > startedAt) {
    const minutes = (finishedAt - startedAt) / 60000;
    if (minutes >= 5 && minutes <= 120) return minutes;
  }

  const saved = n(item.durationMinutes);
  if (saved >= 5 && saved <= 120) return saved;

  return null;
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);

  if (low === high) return sorted[low];

  const fraction = index - low;

  return (
    sorted[low] +
    (sorted[high] - sorted[low]) * fraction
  );
};

const archiveCourtHours = (archive: AnyRecord) => {
  const direct = n(archive.totalCourtHours);
  if (direct > 0) return direct;

  const date = String(archive.archiveDate || '');
  const venue = String(archive.venueName || '').toLowerCase();

  const isSmash =
    venue.includes('smash') ||
    venue.includes('สแมช');

  if (isSmash && date === '2026-09-25') return 8;
  if (isSmash && date === '2026-10-09') return 9;

  const courts = n(archive.courtCount);
  const hours = n(archive.totalHours);

  return courts > 0 && hours > 0
    ? courts * hours
    : 0;
};

const currentMemberCount = (
  players: AnyRecord[],
  archives: AnyRecord[]
) => {
  const checkedIn = players.filter(
    (p) => p.isCheckedIn
  ).length;

  if (checkedIn > 0) return checkedIn;

  const today = players.filter(
    (p) => p.todayRoster
  ).length;

  if (today > 0) return today;

  const latest = [...archives].sort((a, b) =>
    String(b.archiveDate || '').localeCompare(
      String(a.archiveDate || '')
    )
  )[0];

  return Math.max(0, n(latest?.totalPlayers)) || 24;
};

const initialPlan = (
  sessionConfig: AnyRecord
): CourtPlanRow[] => {
  const activeCourts = Array.isArray(
    sessionConfig.sessionCourts
  )
    ? sessionConfig.sessionCourts.filter(
        (court: AnyRecord) => court.active !== false
      )
    : [];

  if (activeCourts.length > 0) {
    const groups = new Map<
      string,
      { count: number; hours: number; rate: number }
    >();

    activeCourts.forEach((court: AnyRecord) => {
      const [sh, sm] = String(court.startTime || '00:00')
        .split(':')
        .map(Number);
      const [eh, em] = String(court.endTime || '00:00')
        .split(':')
        .map(Number);

      let minutes =
        (eh * 60 + em) - (sh * 60 + sm);

      if (minutes < 0) minutes += 24 * 60;

      const hours = Math.max(0, minutes / 60);
      const rate = Math.max(
        0,
        n(
          court.hourlyRate ??
            sessionConfig.courtHourlyRate ??
            0
        )
      );

      const key = `${hours}|${rate}`;
      const old = groups.get(key);

      groups.set(key, {
        count: (old?.count || 0) + 1,
        hours,
        rate,
      });
    });

    const rows = Array.from(groups.values()).map(
      (item, index) => ({
        id: `initial-${index}`,
        ...item,
      })
    );

    if (rows.length > 0) return rows;
  }

  return [
    {
      id: 'initial-0',
      count: Math.max(
        1,
        Math.floor(n(sessionConfig.courtCount) || 2)
      ),
      hours: Math.max(
        0.5,
        n(sessionConfig.totalHours) || 3
      ),
      rate: Math.max(
        0,
        n(sessionConfig.courtHourlyRate) || 250
      ),
    },
  ];
};

export const DynamicCourtPlannerV84: React.FC<Props> = ({
  archives = [],
  currentMatchHistory = [],
  sessionConfig,
  players = [],
}) => {
  const [rows, setRows] = useState<CourtPlanRow[]>(
    () => initialPlan(sessionConfig)
  );

  const [members, setMembers] = useState(
    () => currentMemberCount(players, archives)
  );

  const [memberCourtFee, setMemberCourtFee] =
    useState(
      Math.max(
        0,
        n(sessionConfig.memberCourtFee ?? 110)
      )
    );

  const [targetMatches, setTargetMatches] =
    useState(4);

  const timing = useMemo(() => {
    const allHistory = [
      ...currentMatchHistory,
      ...archives.flatMap((archive) =>
        Array.isArray(archive.matchHistorySnapshot)
          ? archive.matchHistorySnapshot
          : []
      ),
    ];

    const durations = allHistory
      .map(matchDuration)
      .filter(
        (value): value is number =>
          value !== null
      );

    const avg =
      durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) /
          durations.length
        : Math.max(
            1,
            n(sessionConfig.avgMatchDurationMinutes) || 20
          );

    const p75 =
      durations.length >= 4
        ? percentile(durations, 0.75)
        : avg;

    let totalCourtMinutes = 0;
    let totalMatches = 0;

    archives.forEach((archive) => {
      const courtHours = archiveCourtHours(archive);
      const matches = Math.max(0, n(archive.totalMatches));

      if (courtHours > 0 && matches > 0) {
        totalCourtMinutes += courtHours * 60;
        totalMatches += matches;
      }
    });

    const throughputCycle =
      totalMatches > 0
        ? totalCourtMinutes / totalMatches
        : 0;

    const planningMinutes = Math.max(
      avg,
      p75,
      throughputCycle,
      1
    );

    return {
      avg,
      p75,
      throughputCycle,
      planningMinutes,
      sampleCount: durations.length,
    };
  }, [
    archives,
    currentMatchHistory,
    sessionConfig,
  ]);

  const result = useMemo(() => {
    const cleanRows = rows.map((row) => ({
      ...row,
      count: Math.max(0, Math.floor(n(row.count))),
      hours: Math.max(0, n(row.hours)),
      rate: Math.max(0, n(row.rate)),
    }));

    const totalCourts = cleanRows.reduce(
      (sum, row) => sum + row.count,
      0
    );

    const totalCourtHours = cleanRows.reduce(
      (sum, row) => sum + row.count * row.hours,
      0
    );

    const totalCourtCost = cleanRows.reduce(
      (sum, row) =>
        sum + row.count * row.hours * row.rate,
      0
    );

    const requiredMatches = Math.ceil(
      (Math.max(0, members) *
        Math.max(1, targetMatches)) /
        4
    );

    const requiredCourtHoursRaw =
      (requiredMatches * timing.planningMinutes) / 60;

    const requiredCourtHours =
      roundHalfUp(requiredCourtHoursRaw);

    // Capacity by each court group.
    const capacityMatches = cleanRows.reduce(
      (sum, row) => {
        const matchesPerCourt = Math.floor(
          (row.hours * 60) /
            timing.planningMinutes
        );

        return sum + matchesPerCourt * row.count;
      },
      0
    );

    const capacityMembers =
      targetMatches > 0
        ? Math.floor(
            (capacityMatches * 4) /
              targetMatches
          )
        : 0;

    const avgMatchesPerMember =
      members > 0
        ? (capacityMatches * 4) / members
        : 0;

    const shortageCourtHours = Math.max(
      0,
      requiredCourtHours - totalCourtHours
    );

    const spareCourtHours = Math.max(
      0,
      totalCourtHours - requiredCourtHours
    );

    const courtRevenue =
      Math.max(0, members) *
      Math.max(0, memberCourtFee);

    const courtMargin =
      courtRevenue - totalCourtCost;

    const breakEvenMembers =
      memberCourtFee > 0
        ? Math.ceil(
            totalCourtCost / memberCourtFee
          )
        : 0;

    const profitPerCourtHour =
      totalCourtHours > 0
        ? courtMargin / totalCourtHours
        : 0;

    // Recommendation: add one later court if short.
    const defaultRate =
      cleanRows.length > 0
        ? cleanRows[0].rate
        : Math.max(
            0,
            n(sessionConfig.courtHourlyRate) || 250
          );

    const addOneCourtHours =
      shortageCourtHours > 0
        ? roundHalfUp(shortageCourtHours)
        : 0;

    return {
      cleanRows,
      totalCourts,
      totalCourtHours,
      totalCourtCost,
      requiredMatches,
      requiredCourtHours,
      capacityMatches,
      capacityMembers,
      avgMatchesPerMember,
      shortageCourtHours,
      spareCourtHours,
      courtRevenue,
      courtMargin,
      breakEvenMembers,
      profitPerCourtHour,
      addOneCourtHours,
      defaultRate,
      enough:
        totalCourtHours >= requiredCourtHours,
    };
  }, [
    rows,
    members,
    memberCourtFee,
    targetMatches,
    timing,
    sessionConfig,
  ]);

  const updateRow = (
    id: string,
    field: keyof CourtPlanRow,
    value: number
  ) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, [field]: value }
          : row
      )
    );
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        id: `court-plan-${Date.now()}`,
        count: 1,
        hours: result.addOneCourtHours > 0
          ? result.addOneCourtHours
          : 1,
        rate: result.defaultRate,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((current) =>
      current.length <= 1
        ? current
        : current.filter((row) => row.id !== id)
    );
  };

  const planText = result.cleanRows
    .filter((row) => row.count > 0 && row.hours > 0)
    .map(
      (row) =>
        `${row.count} Court × ${fmt(row.hours)} ชม.`
    )
    .join(' + ');

  return (
    <div
      className="rounded-3xl border border-violet-700/40 bg-slate-900 p-5 sm:p-6"
      data-dynamic-court-plan-v84
    >
      {/* DYNAMIC_COURT_PLAN_V84 */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-black text-violet-300">
            🧮 Dynamic Court Plan
          </div>
          <h3 className="mt-1 text-xl font-black text-white">
            ลองแผน Court แบบเปิดเพิ่มภายหลัง
          </h3>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
            ใส่ได้หลายช่วง เช่น{' '}
            <strong className="text-cyan-300">
              2 Court × 4 ชม. + 1 Court × 1 ชม.
            </strong>
            {' '}ระบบรวม Court-Hours / ค่าใช้จ่าย /
            Capacity ให้เอง
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-800/40 bg-cyan-950/15 px-4 py-3">
          <div className="text-[10px] text-slate-500">
            Effective Cycle อัตโนมัติ
          </div>
          <div className="mt-1 text-2xl font-black text-cyan-300">
            {fmt(timing.planningMinutes)} นาที
          </div>
          <div className="mt-1 text-[9px] text-slate-600">
            Avg {fmt(timing.avg)} • P75 {fmt(timing.p75)}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-slate-400">
          จำนวนสมาชิก
          <input
            type="number"
            min="1"
            value={members}
            onChange={(e) =>
              setMembers(Math.max(0, n(e.target.value)))
            }
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
          />
        </label>

        <label className="text-xs text-slate-400">
          Court Fee / Member
          <input
            type="number"
            min="0"
            value={memberCourtFee}
            onChange={(e) =>
              setMemberCourtFee(
                Math.max(0, n(e.target.value))
              )
            }
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
          />
        </label>

        <label className="text-xs text-slate-400">
          เป้าหมาย Match / คน
          <input
            type="number"
            min="1"
            step="0.5"
            value={targetMatches}
            onChange={(e) =>
              setTargetMatches(
                Math.max(1, n(e.target.value))
              )
            }
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
          />
        </label>
      </div>

      <div className="mt-7 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-white">
              Court Plan
            </h4>
            <p className="mt-1 text-[10px] text-slate-500">
              แต่ละบรรทัดคือ Court ที่เปิดจำนวนชั่วโมงเท่ากัน
            </p>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="rounded-xl border border-cyan-700/50 bg-cyan-950/30 px-3 py-2 text-xs font-black text-cyan-300 hover:bg-cyan-950/60"
          >
            + เพิ่ม Court / ช่วงเวลา
          </button>
        </div>

        {rows.map((row, index) => (
          <div
            key={row.id}
            className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:grid-cols-[90px_1fr_1fr_1fr_auto] sm:items-end"
          >
            <div>
              <div className="text-[10px] text-slate-500">
                ช่วง
              </div>
              <div className="mt-2 font-black text-white">
                #{index + 1}
              </div>
            </div>

            <label className="text-[10px] text-slate-400">
              จำนวน Court
              <input
                type="number"
                min="1"
                value={row.count}
                onChange={(e) =>
                  updateRow(
                    row.id,
                    'count',
                    Math.max(
                      1,
                      Math.floor(n(e.target.value))
                    )
                  )
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
            </label>

            <label className="text-[10px] text-slate-400">
              ชั่วโมง / Court
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={row.hours}
                onChange={(e) =>
                  updateRow(
                    row.id,
                    'hours',
                    Math.max(0.5, n(e.target.value))
                  )
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
            </label>

            <label className="text-[10px] text-slate-400">
              ราคา / Court / Hour
              <input
                type="number"
                min="0"
                value={row.rate}
                onChange={(e) =>
                  updateRow(
                    row.id,
                    'rate',
                    Math.max(0, n(e.target.value))
                  )
                }
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
            </label>

            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={rows.length <= 1}
              className="rounded-xl border border-rose-900/50 px-3 py-2 text-xs font-bold text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ลบ
            </button>
          </div>
        ))}
      </div>

      <div className="mt-7 rounded-2xl border border-violet-800/40 bg-violet-950/10 p-4">
        <div className="text-xs text-slate-500">
          แผนปัจจุบัน
        </div>
        <div className="mt-1 text-lg font-black text-cyan-200">
          {planText || '—'}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              Court-Hours
            </div>
            <div className="mt-1 text-lg font-black text-violet-300">
              {fmt(result.totalCourtHours)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              Court Cost
            </div>
            <div className="mt-1 text-lg font-black text-rose-300">
              {money(result.totalCourtCost)} ฿
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              Break-even
            </div>
            <div className="mt-1 text-lg font-black text-amber-300">
              {result.breakEvenMembers} คน
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              Capacity
            </div>
            <div className="mt-1 text-lg font-black text-cyan-300">
              {result.capacityMembers} คน
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              Court Margin
            </div>
            <div
              className={`mt-1 text-lg font-black ${
                result.courtMargin >= 0
                  ? 'text-emerald-300'
                  : 'text-rose-300'
              }`}
            >
              {result.courtMargin >= 0 ? '+' : ''}
              {money(result.courtMargin)} ฿
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[10px] text-slate-500">
              Avg Match / คน
            </div>
            <div className="mt-1 text-lg font-black text-emerald-300">
              {fmt(result.avgMatchesPerMember)} Match
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mt-6 rounded-2xl border p-4 ${
          result.enough
            ? 'border-emerald-800/50 bg-emerald-950/15'
            : 'border-rose-800/50 bg-rose-950/15'
        }`}
      >
        <div
          className={`text-sm font-black ${
            result.enough
              ? 'text-emerald-300'
              : 'text-rose-300'
          }`}
        >
          {result.enough
            ? '✅ แผน Court-Hours เพียงพอ'
            : '⚠️ แผน Court-Hours ยังไม่พอ'}
        </div>

        <div className="mt-2 text-xs leading-relaxed text-slate-300">
          สำหรับ <strong>{members} คน</strong>{' '}
          เป้า <strong>{fmt(targetMatches)} Match/คน</strong>{' '}
          ควรมีประมาณ{' '}
          <strong className="text-white">
            {fmt(result.requiredCourtHours)} Court-Hours
          </strong>
          {' '}ปัจจุบันมี{' '}
          <strong className="text-white">
            {fmt(result.totalCourtHours)}
          </strong>
        </div>

        {!result.enough && (
          <div className="mt-3 rounded-xl border border-cyan-900/40 bg-cyan-950/15 px-3 py-3 text-xs leading-relaxed text-cyan-200">
            แนะนำง่ายที่สุด: กด{' '}
            <strong>“+ เพิ่ม Court / ช่วงเวลา”</strong>{' '}
            แล้วเพิ่ม{' '}
            <strong>
              1 Court × {fmt(result.addOneCourtHours)} ชม.
            </strong>
            {' '}ระบบจะเติมค่าเริ่มต้นให้ตามส่วนที่ขาด
          </div>
        )}

        {result.enough && result.spareCourtHours >= 1 && (
          <div className="mt-3 text-xs text-amber-200">
            มี Court-Time สำรองประมาณ{' '}
            <strong>{fmt(result.spareCourtHours)} Court-Hours</strong>
            {' '}อาจลด Court หรือเวลาลงได้ ถ้าต้องการลดต้นทุน
          </div>
        )}
      </div>
    </div>
  );
};

export default DynamicCourtPlannerV84;