import React, { useMemo, useState } from 'react';
import type { MatchHistoryItem } from '../types';

interface MatchHistoryExportViewProps {
  sessionDate: string;
  matchHistory: MatchHistoryItem[];
  onClose: () => void;
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const scoreText = (a?: number, b?: number): string => {
  if (a === undefined && b === undefined) return '-';
  return `${a ?? '-'} - ${b ?? '-'}`;
};

const getGameWinner = (
  a?: number,
  b?: number
): 'A' | 'B' | null => {
  if (typeof a !== 'number' || typeof b !== 'number' || a === b) return null;
  return a > b ? 'A' : 'B';
};

const getMatchResult = (match: MatchHistoryItem): string => {
  const g1 = getGameWinner(match.game1ScoreA, match.game1ScoreB);
  const g2 = getGameWinner(match.game2ScoreA, match.game2ScoreB);

  let winA = 0;
  let winB = 0;

  if (g1 === 'A') winA += 1;
  if (g1 === 'B') winB += 1;
  if (g2 === 'A') winA += 1;
  if (g2 === 'B') winB += 1;

  if (winA > winB) return `Team A (${winA}-${winB})`;
  if (winB > winA) return `Team B (${winB}-${winA})`;

  if (
    typeof match.scoreA === 'number' &&
    typeof match.scoreB === 'number' &&
    match.scoreA !== match.scoreB
  ) {
    return match.scoreA > match.scoreB ? 'Team A' : 'Team B';
  }

  return '-';
};

const splitTeam = (names?: string[]): [string, string] => [
  names?.[0] || '',
  names?.[1] || '',
];

export const MatchHistoryExportView: React.FC<
  MatchHistoryExportViewProps
> = ({ sessionDate, matchHistory, onClose }) => {
  const [copied, setCopied] = useState(false);

  const rows = useMemo(
    () =>
      matchHistory.map((match, index) => {
        const [teamA1, teamA2] = splitTeam(match.teamANames);
        const [teamB1, teamB2] = splitTeam(match.teamBNames);

        return {
          no: index + 1,
          id: match.id,
          courtName: match.courtName || '',
          finishTime: match.startTime || '',
          durationMinutes: Number(match.durationMinutes || 0),
          shuttlecocksCount: Number(match.shuttlecocksCount || 0),
          teamA1,
          teamA2,
          teamB1,
          teamB2,
          teamA: (match.teamANames || []).join(' / '),
          teamB: (match.teamBNames || []).join(' / '),
          teamASkillAvg:
            typeof match.teamASkillAvg === 'number'
              ? match.teamASkillAvg
              : '',
          teamBSkillAvg:
            typeof match.teamBSkillAvg === 'number'
              ? match.teamBSkillAvg
              : '',
          game1: scoreText(match.game1ScoreA, match.game1ScoreB),
          game2: scoreText(match.game2ScoreA, match.game2ScoreB),
          totalScore: scoreText(match.scoreA, match.scoreB),
          result: getMatchResult(match),
        };
      }),
    [matchHistory]
  );

  const totalShuttles = rows.reduce(
    (sum, row) => sum + row.shuttlecocksCount,
    0
  );

  const totalMinutes = rows.reduce(
    (sum, row) => sum + row.durationMinutes,
    0
  );

  const averageMinutes =
    rows.length > 0 ? Math.round(totalMinutes / rows.length) : 0;

  const buildCsv = (): string => {
    const header = [
      'Session Date',
      'No.',
      'Match ID',
      'Court',
      'Finish / Recorded Time',
      'Duration (min)',
      'Shuttlecocks',
      'Team A Player 1',
      'Team A Player 2',
      'Team B Player 1',
      'Team B Player 2',
      'Team A Skill Avg',
      'Team B Skill Avg',
      'Game 1',
      'Game 2',
      'Total Score',
      'Result',
      'Status',
    ];

    const body = rows.map((row) =>
      [
        sessionDate,
        row.no,
        row.id,
        row.courtName,
        row.finishTime,
        row.durationMinutes,
        row.shuttlecocksCount,
        row.teamA1,
        row.teamA2,
        row.teamB1,
        row.teamB2,
        row.teamASkillAvg,
        row.teamBSkillAvg,
        row.game1,
        row.game2,
        row.totalScore,
        row.result,
        'Completed',
      ]
        .map(csvCell)
        .join(',')
    );

    return [header.map(csvCell).join(','), ...body].join('\r\n');
  };

  const handleExportCsv = () => {
    const csv = '\uFEFF' + buildCsv();
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `GuanGuan_Match_History_${sessionDate}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const text = rows
      .map(
        (row) =>
          `${row.no}. ${row.courtName} | ${row.teamA} vs ${row.teamB} | ` +
          `G1 ${row.game1} | G2 ${row.game2} | ${row.durationMinutes} นาที | ` +
          `${row.shuttlecocksCount} ลูก | ${row.finishTime || '-'}`
      )
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.alert('ไม่สามารถ Copy ประวัติแมตช์ได้');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950 text-slate-100">
      {/* MATCH_HISTORY_EXPORT_PAGE_V51 */}
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-violet-400">
              Organizer Export
            </div>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
              🏸 Export ประวัติแมตช์ที่แข่งจบแล้ว
            </h2>
            <div className="mt-1 text-xs text-slate-400">
              Session Date: {sessionDate}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              {copied ? '✅ Copy แล้ว' : '📋 Copy ประวัติ'}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded-xl bg-violet-500 px-3.5 py-2.5 text-xs font-black text-white hover:bg-violet-400"
            >
              ⬇️ Export CSV / Excel
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-rose-700/60 bg-rose-950/40 px-3.5 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-950/70"
            >
              ✕ ปิด
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[11px] text-slate-400">
              Completed Matches
            </div>
            <div className="mt-1 text-2xl font-black text-white">
              {rows.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[11px] text-slate-400">
              Shuttlecocks Used
            </div>
            <div className="mt-1 text-2xl font-black text-white">
              {totalShuttles}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[11px] text-slate-400">
              Total Playing Time
            </div>
            <div className="mt-1 text-2xl font-black text-white">
              {totalMinutes} นาที
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[11px] text-slate-400">
              Average / Match
            </div>
            <div className="mt-1 text-2xl font-black text-white">
              {averageMinutes} นาที
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-black text-white">
              รายละเอียดแมตช์
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              แสดงเฉพาะ Match History ของ Session ปัจจุบันที่ Finish แล้ว
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1350px] w-full text-xs">
              <thead className="bg-slate-950/70 text-slate-400">
                <tr>
                  <th className="px-3 py-3 text-left">#</th>
                  <th className="px-3 py-3 text-left">Court</th>
                  <th className="px-3 py-3 text-left">เวลา Finish</th>
                  <th className="px-3 py-3 text-right">เวลาเล่น</th>
                  <th className="px-3 py-3 text-right">ลูกแบด</th>
                  <th className="px-3 py-3 text-left">Team A</th>
                  <th className="px-3 py-3 text-left">Team B</th>
                  <th className="px-3 py-3 text-center">Game 1</th>
                  <th className="px-3 py-3 text-center">Game 2</th>
                  <th className="px-3 py-3 text-center">รวม</th>
                  <th className="px-3 py-3 text-center">ผล</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/35">
                    <td className="px-3 py-3 text-slate-500">
                      {row.no}
                    </td>
                    <td className="px-3 py-3 font-bold text-white">
                      {row.courtName || '-'}
                    </td>
                    <td className="px-3 py-3 font-mono text-violet-200">
                      {row.finishTime || '-'}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-300">
                      {row.durationMinutes} นาที
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-amber-300">
                      {row.shuttlecocksCount}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-cyan-200">
                        {row.teamA1 || '-'}
                      </div>
                      <div className="mt-0.5 text-slate-400">
                        {row.teamA2 || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-rose-200">
                        {row.teamB1 || '-'}
                      </div>
                      <div className="mt-0.5 text-slate-400">
                        {row.teamB2 || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-white">
                      {row.game1}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-white">
                      {row.game2}
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-black text-white">
                      {row.totalScore}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-300">
                        {row.result}
                      </span>
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      ยังไม่มี Match ที่ Finish ใน Session วันนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

