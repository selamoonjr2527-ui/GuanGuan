import React from 'react';
import { Trophy, Clock3, Feather } from 'lucide-react';
import type { MatchHistoryItem } from '../types';

type Props = { matchHistory: MatchHistoryItem[] };

export const GuanMatchHistoryV5104: React.FC<Props> = ({ matchHistory }) => {
  if (!matchHistory.length) return null;
  return (
    <section className="gg-v5104-history" aria-label="ประวัติแมตช์ที่แข่งจบแล้ว">
      <div className="gg-v5104-section-heading">
        <div className="gg-v5104-section-heading__title"><Trophy size={17} /><div><h2>ประวัติแมตช์ที่แข่งจบแล้ว</h2><p>รายการที่กดจบแมตช์แล้วในรอบปัจจุบัน</p></div></div>
        <span className="gg-v5104-count">{matchHistory.length} แมตช์</span>
      </div>
      <div className="gg-v5104-history-list">
        {matchHistory.map((hist, index) => (
          <article className="gg-v5104-history-row" key={hist.id}>
            <div className="gg-v5104-history-meta"><span className="gg-v5104-history-seq">#{matchHistory.length - index}</span><strong>{hist.courtName}</strong><span><Clock3 size={12}/> {hist.startTime || '-'}</span><span>{hist.durationMinutes} นาที</span><span><Feather size={12}/> {hist.shuttlecocksCount} ลูก</span></div>
            <div className="gg-v5104-history-teams"><span>{hist.teamANames.join(' + ')}</span><em>VS</em><span>{hist.teamBNames.join(' + ')}</span></div>
            {(hist.game1ScoreA !== undefined && hist.game1ScoreB !== undefined) && (
              <div className="gg-v5104-history-scores">
                <span>เกม 1: {hist.game1ScoreA}–{hist.game1ScoreB}</span>
                {(hist.game2ScoreA !== undefined && hist.game2ScoreB !== undefined) && <span>เกม 2: {hist.game2ScoreA}–{hist.game2ScoreB}</span>}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
