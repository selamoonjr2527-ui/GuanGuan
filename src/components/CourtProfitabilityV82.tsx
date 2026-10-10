import React, { useMemo } from 'react';
import {
  Building2,
  Trophy,
} from 'lucide-react';
import {
  DailySessionArchive,
  Player,
  SessionConfig,
} from '../types';
import { MatchCapacityAdvisorV83 } from './MatchCapacityAdvisorV83';
import { DynamicCourtPlannerV84 } from './DynamicCourtPlannerV84';

type AnyRecord = Record<string, any>;

interface Props {
  archives: DailySessionArchive[];
  sessionConfig: SessionConfig;
  players: Player[];
  matchHistory?: AnyRecord[];
}

const n = (value: unknown) => {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
};

const money = (value: unknown) =>
  n(value).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const fmt = (value: unknown, digits = 1) =>
  n(value).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

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

type CourtPlan = {
  label: string;
  totalCourtHours: number;
  hourlyRate: number;
  venueCost: number;
};

const historicalCourtPlan = (
  archive: AnyRecord
): CourtPlan | null => {
  const date = String(
    archive.archiveDate || ''
  ).trim();

  const venue = String(
    archive.venueName || ''
  ).toLowerCase();

  const isSmash =
    venue.includes('smash') ||
    venue.includes('สแมช');

  if (!isSmash) return null;

  if (date === '2026-09-25') {
    return {
      label: '2 Court × 4 ชม.',
      totalCourtHours: 8,
      hourlyRate: 250,
      venueCost: 2000,
    };
  }

  if (date === '2026-10-09') {
    return {
      label:
        '2 Court × 4 ชม. + 1 Court × 1 ชม.',
      totalCourtHours: 9,
      hourlyRate: 250,
      venueCost: 2250,
    };
  }

  return null;
};

const getCourtPlan = (
  archive: AnyRecord
): CourtPlan => {
  const historical =
    historicalCourtPlan(archive);

  if (historical) {
    return historical;
  }

  const snapshot = Array.isArray(
    archive.sessionCourtsSnapshot
  )
    ? archive.sessionCourtsSnapshot.filter(
        (court: AnyRecord) =>
          court.active !== false
      )
    : [];

  if (snapshot.length > 0) {
    const groups = new Map<number, number>();

    let totalCourtHours = 0;
    let venueCost = 0;

    snapshot.forEach((court: AnyRecord) => {
      const hours = durationHours(
        court.startTime,
        court.endTime
      );

      const rate = Math.max(
        0,
        n(court.hourlyRate)
      );

      totalCourtHours += hours;
      venueCost += hours * rate;

      if (hours > 0) {
        groups.set(
          hours,
          (groups.get(hours) || 0) + 1
        );
      }
    });

    const label = Array.from(
      groups.entries()
    )
      .sort((a, b) => b[0] - a[0])
      .map(
        ([hours, count]) =>
          `${count} Court × ${fmt(hours)} ชม.`
      )
      .join(' + ');

    return {
      label: label || '—',
      totalCourtHours,
      hourlyRate:
        totalCourtHours > 0
          ? venueCost / totalCourtHours
          : 0,
      venueCost,
    };
  }

  const directHours = Math.max(
    0,
    n(archive.totalCourtHours)
  );

  const courtCount = Math.max(
    0,
    n(archive.courtCount)
  );

  const hours = Math.max(
    0,
    n(archive.totalHours)
  );

  const totalCourtHours =
    directHours > 0
      ? directHours
      : courtCount * hours;

  const venueCost = Math.max(
    0,
    n(archive.venueCost)
  );

  return {
    label:
      String(
        archive.courtPlanLabel || ''
      ).trim() ||
      (courtCount > 0 && hours > 0
        ? `${courtCount} Court × ${fmt(hours)} ชม.`
        : '—'),
    totalCourtHours,
    hourlyRate:
      totalCourtHours > 0
        ? venueCost / totalCourtHours
        : Math.max(
            0,
            n(archive.courtHourlyRate)
          ),
    venueCost,
  };
};

const archiveProfit = (
  archive: AnyRecord
) =>
  archive.netProfit !== undefined &&
  archive.netProfit !== null
    ? n(archive.netProfit)
    : n(archive.totalRevenue) -
      n(archive.totalExpense);

export const CourtProfitabilityV82: React.FC<Props> = ({
  archives = [],
  sessionConfig,
  players = [],
  matchHistory = [],
}) => {
  const venueStats = useMemo(() => {
    const map = new Map<
      string,
      {
        venueName: string;
        sessions: number;
        players: number;
        venueCost: number;
        totalCourtHours: number;
        netProfit: number;
        revenue: number;
      }
    >();

    (archives as AnyRecord[]).forEach(
      (archive) => {
        const venueName =
          String(
            archive.venueName || ''
          ).trim() || 'ไม่ระบุสนาม';

        const key =
          venueName.toLowerCase();

        const plan =
          getCourtPlan(archive);

        const old =
          map.get(key) || {
            venueName,
            sessions: 0,
            players: 0,
            venueCost: 0,
            totalCourtHours: 0,
            netProfit: 0,
            revenue: 0,
          };

        old.sessions += 1;
        old.players += Math.max(
          0,
          n(archive.totalPlayers)
        );
        old.venueCost += plan.venueCost;
        old.totalCourtHours +=
          plan.totalCourtHours;
        old.netProfit +=
          archiveProfit(archive);
        old.revenue += n(
          archive.totalRevenue
        );

        map.set(key, old);
      }
    );

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        avgPlayers:
          item.sessions > 0
            ? item.players / item.sessions
            : 0,
        avgCourtHours:
          item.sessions > 0
            ? item.totalCourtHours /
              item.sessions
            : 0,
        avgCourtCost:
          item.sessions > 0
            ? item.venueCost /
              item.sessions
            : 0,
        avgNetProfit:
          item.sessions > 0
            ? item.netProfit /
              item.sessions
            : 0,
        costPerMember:
          item.players > 0
            ? item.venueCost /
              item.players
            : 0,
        profitPerCourtHour:
          item.totalCourtHours > 0
            ? item.netProfit /
              item.totalCourtHours
            : 0,
        netMarginPct:
          item.revenue > 0
            ? (item.netProfit /
                item.revenue) *
              100
            : 0,
      }))
      .sort(
        (a, b) =>
          b.avgNetProfit -
          a.avgNetProfit
      );
  }, [archives]);

  const bestVenue =
    venueStats.length > 0
      ? venueStats[0]
      : null;

  return (
    <div
      className="space-y-10"
      data-court-profitability-v84
    >
      {/* DYNAMIC_COURT_PLAN_V84 */}
      <div className="rounded-3xl border border-violet-800/50 bg-gradient-to-br from-slate-900 to-violet-950/20 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-violet-400">
              Venue & Court Profitability
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">
              🏸 สนาม & Court Profitability
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
              วิเคราะห์จำนวนสมาชิก,
              Court-Hours, เวลา Match จริง
              และค่าใช้จ่ายแต่ละสนาม
            </p>
          </div>

          {bestVenue && (
            <div className="rounded-2xl border border-amber-700/40 bg-amber-950/15 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-amber-300">
                <Trophy className="h-4 w-4" />
                สนามกำไรเฉลี่ยสูงสุด
              </div>
              <div className="mt-1 font-black text-white">
                {bestVenue.venueName}
              </div>
              <div className="mt-1 text-xs text-emerald-300">
                +{money(bestVenue.avgNetProfit)} ฿ / รอบ
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <MatchCapacityAdvisorV83
          archives={archives as AnyRecord[]}
          currentMatchHistory={matchHistory}
          sessionConfig={sessionConfig as any}
          players={players as any[]}
        />
      </section>

      <section className="pt-2">
        <DynamicCourtPlannerV84
          archives={archives as AnyRecord[]}
          currentMatchHistory={matchHistory}
          sessionConfig={sessionConfig as any}
          players={players as any[]}
        />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-300" />
            <h3 className="font-black text-white">
              เปรียบเทียบสนามจาก Archive
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">
                  สนาม
                </th>
                <th className="px-3 py-3 text-center">
                  รอบ
                </th>
                <th className="px-3 py-3 text-center">
                  Avg Members
                </th>
                <th className="px-3 py-3 text-center">
                  Avg Court-Hours
                </th>
                <th className="px-3 py-3 text-right">
                  Avg Court Cost
                </th>
                <th className="px-3 py-3 text-right">
                  Cost / Member
                </th>
                <th className="px-3 py-3 text-right">
                  Avg Net Profit
                </th>
                <th className="px-3 py-3 text-right">
                  Profit / Court-Hr
                </th>
                <th className="px-4 py-3 text-right">
                  Net Margin
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {venueStats.length > 0 ? (
                venueStats.map(
                  (venue, index) => (
                    <tr key={venue.venueName}>
                      <td className="px-4 py-3 font-black text-white">
                        {index === 0 && (
                          <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-300" />
                        )}
                        {venue.venueName}
                      </td>

                      <td className="px-3 py-3 text-center text-slate-300">
                        {venue.sessions}
                      </td>

                      <td className="px-3 py-3 text-center text-slate-300">
                        {fmt(venue.avgPlayers)}
                      </td>

                      <td className="px-3 py-3 text-center text-violet-300">
                        {fmt(
                          venue.avgCourtHours
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-rose-300">
                        {money(
                          venue.avgCourtCost
                        )}{' '}
                        ฿
                      </td>

                      <td className="px-3 py-3 text-right text-cyan-300">
                        {money(
                          venue.costPerMember
                        )}{' '}
                        ฿
                      </td>

                      <td
                        className={`px-3 py-3 text-right font-black ${
                          venue.avgNetProfit >=
                          0
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {venue.avgNetProfit >=
                        0
                          ? '+'
                          : ''}
                        {money(
                          venue.avgNetProfit
                        )}{' '}
                        ฿
                      </td>

                      <td
                        className={`px-3 py-3 text-right font-black ${
                          venue.profitPerCourtHour >=
                          0
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {venue.profitPerCourtHour >=
                        0
                          ? '+'
                          : ''}
                        {money(
                          venue.profitPerCourtHour
                        )}{' '}
                        ฿
                      </td>

                      <td className="px-4 py-3 text-right text-slate-300">
                        {fmt(
                          venue.netMarginPct
                        )}
                        %
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    ยังไม่มี Archive สำหรับเปรียบเทียบสนาม
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 p-5">
          <h3 className="font-black text-white">
            รายละเอียด Court Plan แต่ละรอบ
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">
                  วันที่
                </th>
                <th className="px-3 py-3 text-left">
                  สนาม
                </th>
                <th className="px-3 py-3 text-center">
                  สมาชิก
                </th>
                <th className="px-3 py-3 text-left">
                  Court Plan
                </th>
                <th className="px-3 py-3 text-center">
                  Court-Hours
                </th>
                <th className="px-3 py-3 text-right">
                  Court Cost
                </th>
                <th className="px-4 py-3 text-right">
                  Net Profit
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {[...(archives as AnyRecord[])]
                .sort((a, b) =>
                  String(
                    b.archiveDate
                  ).localeCompare(
                    String(a.archiveDate)
                  )
                )
                .map((archive) => {
                  const plan =
                    getCourtPlan(archive);

                  const profit =
                    archiveProfit(archive);

                  return (
                    <tr key={archive.id}>
                      <td className="px-4 py-3 text-slate-300">
                        {
                          archive.archiveDate
                        }
                      </td>

                      <td className="px-3 py-3 font-semibold text-white">
                        {archive.venueName ||
                          'ไม่ระบุสนาม'}
                      </td>

                      <td className="px-3 py-3 text-center text-slate-300">
                        {n(
                          archive.totalPlayers
                        )}
                      </td>

                      <td className="px-3 py-3 font-semibold text-cyan-200">
                        {plan.label}
                      </td>

                      <td className="px-3 py-3 text-center font-black text-violet-300">
                        {fmt(
                          plan.totalCourtHours
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-rose-300">
                        {money(
                          plan.venueCost
                        )}{' '}
                        ฿
                      </td>

                      <td
                        className={`px-4 py-3 text-right font-black ${
                          profit >= 0
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {profit >= 0
                          ? '+'
                          : ''}
                        {money(profit)} ฿
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default CourtProfitabilityV82;