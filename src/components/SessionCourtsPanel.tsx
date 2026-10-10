import React, { useEffect, useMemo, useState } from 'react';
import { ActiveMatch, SessionConfig, SessionCourt } from '../types';
import {
  calculateCourtHours,
  getSessionCourtCostBreakdown,
  getSessionCourts,
  withSessionCourts,
} from '../utils/sessionCourts';

interface SessionCourtsPanelProps {
  sessionConfig: SessionConfig;
  activeMatches: ActiveMatch[];
  onChange: (nextConfig: SessionConfig) => void;
}

export const SessionCourtsPanel: React.FC<SessionCourtsPanelProps> = ({
  sessionConfig,
  activeMatches,
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<SessionCourt[]>(() =>
    getSessionCourts(sessionConfig)
  );

  useEffect(() => {
    if (!isEditing) {
      setDraft(getSessionCourts(sessionConfig));
    }
  }, [sessionConfig, isEditing]);

  const savedBreakdown = useMemo(
    () => getSessionCourtCostBreakdown(sessionConfig),
    [sessionConfig]
  );

  const savedTotal = savedBreakdown.reduce(
    (sum, court) => sum + court.cost,
    0
  );

  const updateCourt = (
    index: number,
    patch: Partial<SessionCourt>
  ) => {
    setDraft((prev) =>
      prev.map((court, idx) =>
        idx === index ? { ...court, ...patch } : court
      )
    );
  };

  const handleAdd = () => {
    setDraft((prev) => [
      ...prev,
      {
        id: `court-${prev.length + 1}`,
        name: `Court ${prev.length + 1}`,
        startTime: sessionConfig.startTime || '19:00',
        endTime: sessionConfig.endTime || '22:00',
        hourlyRate: Number(sessionConfig.courtHourlyRate || 0),
        active: true,
      },
    ]);
    setIsEditing(true);
  };

  const handleRemove = (index: number) => {
    if (activeMatches.length > 0) {
      window.alert(
        'ยังมี Match กำลังแข่งขันอยู่ จึงยังไม่อนุญาตให้ลบคอร์ท\n\nสามารถเพิ่มคอร์ทใหม่ หรือแก้เวลา/ราคาได้'
      );
      return;
    }

    setDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = () => {
    const clean = draft.map((court, index) => ({
      ...court,
      id: `court-${index + 1}`,
      name: String(court.name || '').trim() || `Court ${index + 1}`,
      startTime: court.startTime || sessionConfig.startTime || '19:00',
      endTime: court.endTime || sessionConfig.endTime || '22:00',
      hourlyRate: Math.max(0, Number(court.hourlyRate || 0)),
      active: true,
    }));

    if (clean.length === 0) {
      window.alert('ต้องมีอย่างน้อย 1 คอร์ท');
      return;
    }

    const names = clean.map((court) => court.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      window.alert('ชื่อคอร์ทซ้ำกัน กรุณาใช้ชื่อคอร์ทจริงที่ไม่ซ้ำ เช่น Court 2 / Court 4');
      return;
    }

    onChange(withSessionCourts(sessionConfig, clean));
    setDraft(clean);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(getSessionCourts(sessionConfig));
    setIsEditing(false);
  };

  return (
    <div className="mb-5 rounded-2xl border border-cyan-800/50 bg-slate-900 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🏟️</span>
            <h3 className="text-base font-black text-white">
              Today's Courts
            </h3>
            <span className="rounded-full border border-cyan-800 bg-cyan-950/50 px-2 py-0.5 text-[10px] font-black text-cyan-300">
              SOURCE OF TRUTH
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            ใส่ชื่อคอร์ทจริงของวันนี้ เช่น Court 2 / Court 4 พร้อมเวลาและราคาของแต่ละคอร์ท
          </p>
        </div>

        {!isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-xl border border-cyan-700 bg-cyan-950/50 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-900/50"
          >
            ✏️ แก้คอร์ทวันนี้
          </button>
        ) : null}
      </div>

      {!isEditing ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {savedBreakdown.map((court) => {
              const busy = activeMatches.some(
                (match) => match.courtId === court.id
              );

              return (
                <div
                  key={court.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black text-white">
                      {court.name}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                        busy
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {busy ? 'กำลังแข่ง' : 'พร้อมใช้'}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-400">
                    {court.startTime} - {court.endTime}
                    {' • '}
                    {court.hours.toFixed(
                      Number.isInteger(court.hours) ? 0 : 1
                    )}{' '}
                    ชม.
                  </div>

                  <div className="mt-1 text-xs text-slate-300">
                    {Number(court.hourlyRate).toLocaleString()} ฿/ชม.
                    {' • '}
                    <span className="font-bold text-amber-300">
                      {Math.round(court.cost).toLocaleString()} ฿
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-400">
              หน้า Member / Queue / จัดคอร์ท จะใช้ชื่อคอร์ทชุดนี้
            </div>
            <div className="text-sm font-black text-amber-300">
              Court Cost วันนี้: {Math.round(savedTotal).toLocaleString()} ฿
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-3">
          {draft.map((court, index) => {
            const hours = calculateCourtHours(
              court.startTime,
              court.endTime
            );
            const cost = hours * Number(court.hourlyRate || 0);
            const busy = activeMatches.some(
              (match) => match.courtId === `court-${index + 1}`
            );

            return (
              <div
                key={`${court.id}-${index}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
              >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <div className="col-span-2 lg:col-span-2">
                    <label className="mb-1 block text-[10px] font-bold text-slate-400">
                      ชื่อคอร์ทจริง
                    </label>
                    <input
                      value={court.name}
                      onChange={(event) =>
                        updateCourt(index, {
                          name: event.target.value,
                        })
                      }
                      placeholder="เช่น Court 2"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                    />
                    {busy ? (
                      <div className="mt-1 text-[10px] text-cyan-300">
                        กำลังแข่งอยู่ แต่สามารถแก้ชื่อคอร์ทจริงได้ ระบบจะอัปเดต Match ปัจจุบันตาม Court ID เดิม
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400">
                      เริ่ม
                    </label>
                    <input
                      type="time"
                      value={court.startTime}
                      onChange={(event) =>
                        updateCourt(index, {
                          startTime: event.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400">
                      จบ
                    </label>
                    <input
                      type="time"
                      value={court.endTime}
                      onChange={(event) =>
                        updateCourt(index, {
                          endTime: event.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-400">
                      บาท/ชม.
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={court.hourlyRate}
                      onChange={(event) =>
                        updateCourt(index, {
                          hourlyRate: Math.max(
                            0,
                            Number(event.target.value || 0)
                          ),
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-center text-[11px]">
                      <div className="text-slate-400">
                        {hours.toFixed(
                          Number.isInteger(hours) ? 0 : 1
                        )}{' '}
                        ชม.
                      </div>
                      <div className="font-black text-amber-300">
                        {Math.round(cost).toLocaleString()} ฿
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={draft.length <= 1 || activeMatches.length > 0}
                      onClick={() => handleRemove(index)}
                      className="rounded-lg border border-rose-800 bg-rose-950/40 px-2.5 py-2 text-xs font-bold text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        activeMatches.length > 0
                          ? 'มี Match กำลังแข่งขันอยู่ จึงยังลบคอร์ทไม่ได้'
                          : 'ลบคอร์ท'
                      }
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-xl border border-indigo-700 bg-indigo-950/40 px-3 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-900/50"
            >
              ➕ เพิ่มคอร์ท
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400"
              >
                ✅ บันทึกคอร์ทวันนี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


