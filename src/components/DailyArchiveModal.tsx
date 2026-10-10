import React, { useState } from 'react';
import { getSessionCourtCost } from '../utils/sessionCourts'; // DYNAMIC_SESSION_COURTS_V63A
import { 
  X, Calendar, Archive, RefreshCw, CheckCircle2, 
  AlertTriangle, Download, Trash2, ChevronRight, FileText,
  Users, Flame, Award, Clock
} from 'lucide-react';
import { SessionConfig, Player, DailySessionArchive, MatchHistoryItem } from '../types';
import { 
  AppState, 
  loadSessionArchives, 
  saveSessionArchive, 
  deleteSessionArchive, 
  createNewDaySessionState 
} from '../utils/storage';
import { deleteSessionArchiveFromFirestore } from '../utils/firestoreCollectionsSync'; // ARCHIVE_DELETE_SYNC_V66A
import confetti from 'canvas-confetti';

interface DailyArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
  onResetSession: (newState: AppState) => void;
  onDiscardSession?: () => Promise<boolean> | boolean;
}

export const DailyArchiveModal: React.FC<DailyArchiveModalProps> = ({
  isOpen,
  onClose,
  currentState,
  onResetSession,
  onDiscardSession,
}) => {
  const [activeTab, setActiveTab] = useState<'reset' | 'history'>('reset');
  const [keepRoster, setKeepRoster] = useState(true);
  const [notes, setNotes] = useState('');
  const [selectedArchive, setSelectedArchive] = useState<DailySessionArchive | null>(null);
  const [archives, setArchives] = useState<DailySessionArchive[]>(() => loadSessionArchives());

  // DISCARD_SESSION_HANDLER_V72B
  const handleDiscardWithoutArchive = async () => {
    if (!onDiscardSession) return;

    const firstConfirm = window.confirm(
      '⚠️ Reset ทิ้ง / ไม่บันทึก?\n\n' +
      'ระบบจะล้างข้อมูลรอบปัจจุบันทั้งหมด เช่น\n' +
      '• Check-in / Today Roster\n' +
      '• Active Match / Match History\n' +
      '• Match / Game / Extra Shuttle\n' +
      '• Billing / Paid / Payment\n' +
      '• Pre-Match\n\n' +
      'จะไม่สร้าง Archive และไม่เพิ่มข้อมูลรอบนี้ในประวัติ\n\n' +
      'กด OK เพื่อไปขั้นตอนยืนยันสุดท้าย'
    );

    if (!firstConfirm) return;

    const typed = window.prompt(
      'เพื่อยืนยันการล้างรอบนี้ กรุณาพิมพ์ RESET แล้วกด OK'
    );

    if ((typed || '').trim().toUpperCase() !== 'RESET') {
      window.alert('ยกเลิกการ Reset');
      return;
    }

    const success = await onDiscardSession();

    if (success) {
      onClose();
    }
  };
  if (!isOpen) return null;

  const { sessionConfig, players, activeMatches, matchHistory } = currentState;
  // RESET_MODAL_WHITE_SCREEN_FIX_V45
  // Used by the summary card in this modal.
  const checkedInPlayers = players.filter((p) => p.isCheckedIn);
  const billingPlayers = players.filter(
    (p) =>
      p.isCheckedIn ||
      p.status === 'left' ||
      Boolean(p.checkInTime) ||
      Boolean(p.checkInTimestamp) ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      p.paid
  );

  const totalMatches = matchHistory.length;
  const totalShuttles = sessionConfig.shuttlecocksUsedTotal;

  const unpaidPlayers = billingPlayers.filter(
    (p) => !p.paid
  );

  // Financial calculations
  const memberCourtFee =
    sessionConfig.memberCourtFee ?? 110;

  const shuttleFee =
    sessionConfig.shuttlecockFeePerMatchPerPerson ?? 25;

  const extraPrice =
    sessionConfig.extraShuttlecockPrice ?? 25;

  const calculateArchivePlayerAmount = (p: Player) => {
    const adjustedMatches = Math.max(
      0,
      Number(p.matchesPlayed || 0) +
        Number((p as any).billingMatchAdjustment || 0)
    );

    const court = memberCourtFee;

    const match =
      adjustedMatches * shuttleFee;

    const extra =
      Number(p.extraShuttlecocks || 0) *
      extraPrice;

    const manualAdjustment =
      Number((p as any).billingAmountAdjustment || 0);

    return Math.max(
      0,
      Math.round(
        court +
        match +
        extra +
        manualAdjustment
      )
    );
  };

  const totalRevenue = billingPlayers.reduce(
    (acc, p) =>
      acc + calculateArchivePlayerAmount(p),
    0
  );

  const totalCollected = billingPlayers.reduce(
    (acc, p) => {
      if (!p.paid) return acc;

      // Paid amount is already locked when payment is confirmed.
      if (
        typeof p.paidAmount === 'number' &&
        Number.isFinite(p.paidAmount)
      ) {
        return acc + p.paidAmount;
      }

      return acc + calculateArchivePlayerAmount(p);
    },
    0
  );

    // COURT_HOURS_V82B
  // Calculate court expense from each actual court booking.
  // Fallback to legacy courtCount x totalHours x hourlyRate when no
  // sessionCourts data exists.
  const archiveSessionCourts = (
    ((sessionConfig as any).sessionCourts || []) as Array<{
      id?: string;
      name?: string;
      startTime?: string;
      endTime?: string;
      hourlyRate?: number;
      active?: boolean;
    }>
  ).filter((court) => court.active !== false);

  const courtDurationHoursV82B = (
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

    if (minutes < 0) minutes += 24 * 60;

    return Math.max(0, minutes / 60);
  };

  const totalCourtHoursV82B =
    archiveSessionCourts.length > 0
      ? archiveSessionCourts.reduce(
          (sum, court) =>
            sum +
            courtDurationHoursV82B(
              court.startTime,
              court.endTime
            ),
          0
        )
      : Number(sessionConfig.courtCount || 0) *
        Number(sessionConfig.totalHours || 0);

  const venueCost =
    archiveSessionCourts.length > 0
      ? archiveSessionCourts.reduce(
          (sum, court) => {
            const hours = courtDurationHoursV82B(
              court.startTime,
              court.endTime
            );

            const rate = Number(
              court.hourlyRate ??
                sessionConfig.courtHourlyRate ??
                0
            );

            return sum + hours * rate;
          },
          0
        )
      : Number(sessionConfig.courtCount || 0) *
        Number(sessionConfig.totalHours || 0) *
        Number(sessionConfig.courtHourlyRate || 0);

  const courtPlanLabelV82B = (() => {
    if (archiveSessionCourts.length === 0) {
      return `${sessionConfig.courtCount} Court × ${sessionConfig.totalHours} ชม.`;
    }

    const groups = new Map<number, number>();

    archiveSessionCourts.forEach((court) => {
      const hours = courtDurationHoursV82B(
        court.startTime,
        court.endTime
      );

      if (hours <= 0) return;

      groups.set(
        hours,
        (groups.get(hours) || 0) + 1
      );
    });

    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(
        ([hours, count]) =>
          `${count} Court × ${Number(
            hours.toFixed(2)
          )} ชม.`
      )
      .join(' + ');
  })();

  const shuttleCost =
    totalShuttles *
    sessionConfig.shuttlecockPrice;

  const extraExpensesTotal =
    (sessionConfig.extraExpenses || []).reduce(
      (acc, curr) => acc + curr.amount,
      0
    );

  const totalExpense =
    venueCost +
    shuttleCost +
    extraExpensesTotal;

  const netProfit =
    totalRevenue - totalExpense;

  const pendingAmount =
    Math.max(
      0,
      totalRevenue - totalCollected
    );

  const handleArchiveAndReset = () => {
    if (activeMatches.length > 0) {
      if (!window.confirm('ยังมีแมตช์ที่กำลังแข่งขันอยู่ คุณแน่ใจหรือไม่ว่าต้องการจบคอร์ทและบันทึกประวัติ?')) {
        return;
      }
    }

    const archiveRecord: DailySessionArchive = {
      id: `archive-${Date.now()}`,
      archiveDate: sessionConfig.date,
      sessionTitle: sessionConfig.sessionTitle,
      venueName: sessionConfig.venueName,
      savedAt: Date.now(),
      totalPlayers: billingPlayers.length,
      totalMatches,
      totalShuttlecocks: totalShuttles,
      totalCourtFee: venueCost,
      totalRevenue,
      totalExpense,
      netProfit,
      totalCollected,
      pendingAmount,
      venueCost,
      // COURT_HOURS_ARCHIVE_SNAPSHOT_V82B
      courtCount:
        archiveSessionCourts.length > 0
          ? archiveSessionCourts.length
          : sessionConfig.courtCount,
      totalHours: sessionConfig.totalHours,
      courtHourlyRate: sessionConfig.courtHourlyRate,
      totalCourtHours: totalCourtHoursV82B,
      courtPlanLabel: courtPlanLabelV82B,
      sessionCourtsSnapshot:
        archiveSessionCourts.length > 0
          ? archiveSessionCourts.map((court) => ({
              id: String(court.id || ''),
              name: String(court.name || ''),
              startTime: String(court.startTime || ''),
              endTime: String(court.endTime || ''),
              hourlyRate: Number(
                court.hourlyRate ??
                  sessionConfig.courtHourlyRate ??
                  0
              ),
              active: court.active !== false,
            }))
          : undefined,
      shuttleCost,
      extraExpensesTotal,
      playersSnapshot: [...players],
      matchHistorySnapshot: [...matchHistory],
      notes: notes.trim() || undefined,
    };

    // Save into archives list
    saveSessionArchive(archiveRecord);
    setArchives(loadSessionArchives());

    // Generate reset state for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const newState = createNewDaySessionState(currentState, {
      keepRoster,
      newDate: tomorrowStr,
    });

    onResetSession(newState);
    confetti({ particleCount: 70, spread: 80, origin: { y: 0.5 } });
    onClose();
  };

  const handleDeleteArchive = async (id: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบประวัติของวันนี้?')) return;
    // ARCHIVE_DELETE_SYNC_V66A
    // Delete Firestore first. Otherwise the realtime listener restores the LocalStorage record.
    try {
      await deleteSessionArchiveFromFirestore(id);
    } catch (error) {
      console.error('Failed to delete archive from Firestore', error);
      window.alert('ลบ Archive จาก Firestore ไม่สำเร็จ กรุณาลองใหม่');
      return;
    }

    deleteSessionArchive(id);
    const updated = loadSessionArchives();
    setArchives(updated);
    if (selectedArchive?.id === id) {
      setSelectedArchive(null);
    }
  };

  const handleDownloadArchiveJSON = (archive: DailySessionArchive) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(archive, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `badminton_archive_${archive.archiveDate}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ระบบปิดก๊วนประจำวัน & จัดการประวัติ (Daily Archive & Reset)
              </h3>
              <p className="text-xs text-slate-400">
                เก็บข้อมูลวันนี้เข้าประวัติย้อนหลัง และเตรียมพร้อมเปิดก๊วนใหม่
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('reset')}
            className={`pb-2.5 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'reset'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>ปิดก๊วนวันนี้ & รีเซ็ตเริ่มใหม่</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>ประวัติก๊วนย้อนหลัง ({archives.length} ครั้ง)</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4">
          {activeTab === 'reset' ? (
            <div className="space-y-4">
              {/* Today summary card */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    สรุปผลการจัดก๊วนวันนี้ ({sessionConfig.date}):
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                    {sessionConfig.sessionTitle}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-slate-400">ผู้เล่นเช็คอิน</div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {checkedInPlayers.length} <span className="text-[10px] text-slate-500">คน</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-slate-400">แมตช์ที่แข่งจบ</div>
                    <div className="text-base font-bold text-amber-400 mt-0.5">
                      {totalMatches} <span className="text-[10px] text-slate-500">รอบ</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-slate-400">ลูกแบดที่ใช้</div>
                    <div className="text-base font-bold text-blue-400 mt-0.5">
                      {totalShuttles} <span className="text-[10px] text-slate-500">ลูก</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-slate-400">รายรับค่าก๊วน</div>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">
                      {totalRevenue.toLocaleString()} <span className="text-[10px] text-slate-500">฿</span>
                    </div>
                  </div>
                </div>

                {unpaidPlayers.length > 0 && (
                  <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-2.5 text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      แจ้งเตือน: ยังมียอดค้างชำระ {unpaidPlayers.length} คน ({unpaidPlayers.map((p) => p.nickname).join(', ')}) หากปิดก๊วน ยอดและรายชื่อนี้จะถูกเก็บไว้ในประวัติ
                    </span>
                  </div>
                )}
              </div>

              {/* Reset Configurations */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-white">ตัวเลือกรีเซ็ตก๊วนสำหรับวันพรุ่งนี้ / ครั้งถัดไป:</h4>

                <label className="flex items-start gap-2.5 cursor-pointer bg-slate-900 p-3 rounded-lg border border-slate-800 hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={keepRoster}
                    onChange={(e) => setKeepRoster(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-emerald-500 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-white">
                      เก็บรายชื่อสมาชิกเดิมไว้ในก๊วน (แนะนำ)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      สมาชิก {players.length} คนจะยังอยู่ในรายชื่อ แต่จะถูกรีเซ็ตสถานะเป็น "รอเช็คอิน", จำนวนเกม = 0, ยอดจ่าย = 0 เพื่อให้คุณไม่ต้องพิมพ์ชื่อใหม่พรุ่งนี้
                    </div>
                  </div>
                </label>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    บันทึกช่วยจำสำหรับวันนี้ (Optional):
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="เช่น ก๊วนสนุกมาก สมาชิกมาครบ ค่าสนามเคลียร์เรียบร้อย..."
                    className="w-full text-xs rounded-xl bg-slate-900 border border-slate-800 text-white p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleArchiveAndReset}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <Archive className="w-4 h-4" />
                  <span>ยืนยันปิดก๊วนวันนี้ & บันทึกประวัติและเปิดก๊วนใหม่</span>
                </button>
                {/* DISCARD_SESSION_BUTTON_V72B */}
                {onDiscardSession && (
                  <div className="mt-4 border-t border-rose-900/50 pt-4">
                    <button
                      type="button"
                      onClick={handleDiscardWithoutArchive}
                      className="w-full rounded-xl border border-rose-700 bg-rose-950/60 px-4 py-3 text-xs sm:text-sm font-black text-rose-200 transition hover:bg-rose-900/70"
                    >
                      🗑️ Reset ทิ้ง / ไม่บันทึก
                    </button>
                    <p className="mt-2 text-center text-[10px] leading-relaxed text-rose-300/80">
                      สำหรับรอบทดลอง • ล้างรอบปัจจุบันโดยไม่สร้าง Archive
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 text-center mt-2">
                  ข้อมูลแมตช์และยอดเงินของวันนี้จะถูกเซฟเก็บไว้อย่างปลอดภัยใน "ประวัติก๊วนย้อนหลัง" สามารถเปิดดูย้อนหลังได้ตลอดเวลา
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {archives.length === 0 ? (
                <div className="text-center py-10 bg-slate-950 border border-slate-800 rounded-xl">
                  <Archive className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">ยังไม่มีประวัติก๊วนที่ถูกบันทึก</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    เมื่อคุณกด "ปิดก๊วนวันนี้ & บันทึกประวัติ" ประวัติของแต่ละวันจะแสดงที่นี่
                  </p>
                </div>
              ) : selectedArchive ? (
                /* Detail of selected archive */
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSelectedArchive(null)}
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    ← กลับไปรายการประวัติทั้งหมด
                  </button>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white">{selectedArchive.sessionTitle}</h4>
                        <div className="text-xs text-slate-400 mt-0.5">
                          📅 วันที่: {selectedArchive.archiveDate} • 📍 {selectedArchive.venueName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadArchiveJSON(selectedArchive)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ดาวน์โหลด JSON</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">ผู้เล่นที่มา</span>
                        <strong className="text-white text-sm">{selectedArchive.totalPlayers} คน</strong>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">แมตช์ทั้งหมด</span>
                        <strong className="text-amber-400 text-sm">{selectedArchive.totalMatches} แมตช์</strong>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">ลูกแบดที่ใช้</span>
                        <strong className="text-blue-400 text-sm">{selectedArchive.totalShuttlecocks} ลูก</strong>
                      </div>
                    </div>

                    {/* Players snapshot */}
                    <div>
                      <div className="text-xs font-bold text-slate-300 mb-1.5">
                        รายชื่อสมาชิกที่เข้าร่วม ({selectedArchive.playersSnapshot.filter((p) => p.isCheckedIn).length} คน):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                        {selectedArchive.playersSnapshot
                          .filter((p) => p.isCheckedIn)
                          .map((p) => (
                            <div
                              key={p.id}
                              className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs flex items-center justify-between"
                            >
                              <span className="text-white font-medium truncate">{p.nickname}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {p.gamesPlayed} เกม
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Matches list */}
                    <div>
                      <div className="text-xs font-bold text-slate-300 mb-1.5">
                        ผลการแข่งขัน ({selectedArchive.matchHistorySnapshot.length} แมตช์):
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {selectedArchive.matchHistorySnapshot.map((m, i) => (
                          <div
                            key={m.id || i}
                            className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs flex items-center justify-between"
                          >
                            <span className="text-slate-300">
                              {m.teamANames.join('+')} vs {m.teamBNames.join('+')}
                            </span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {m.game1ScoreA !== undefined
                                ? `S1: ${m.game1ScoreA}-${m.game1ScoreB} | S2: ${m.game2ScoreA}-${m.game2ScoreB}`
                                : `${m.scoreA || 0} - ${m.scoreB || 0}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Archive list */
                <div className="space-y-2">
                  {archives.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex items-center justify-between transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{item.archiveDate}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                            {item.sessionTitle}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-3">
                          <span>👥 สมาชิก {item.totalPlayers} คน</span>
                          <span>🏸 {item.totalMatches} แมตช์</span>
                          <span>ลูกแบด {item.totalShuttlecocks} ลูก</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedArchive(item)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs text-white font-semibold border border-slate-700 transition"
                        >
                          ดูรายละเอียด
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteArchive(item.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                          title="ลบประวัตินี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



