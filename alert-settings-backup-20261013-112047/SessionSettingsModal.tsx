import React, { useState } from 'react';
import { X, Settings, ShieldCheck, Plus, Trash2, Database, Download, Upload, Check } from 'lucide-react';
import { SessionConfig } from '../types';

interface SessionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SessionConfig;
  onSaveConfig: (updated: SessionConfig) => void;
  onExportBackup?: () => void;
  onImportBackup?: (importedData: any) => void;
}

export const SessionSettingsModal: React.FC<SessionSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onExportBackup,
  onImportBackup,
}) => {
  const [sessionTitle, setSessionTitle] = useState(config.sessionTitle);
  const [venueName, setVenueName] = useState(config.venueName);
  const [date, setDate] = useState(config.date);
  const [startTime, setStartTime] = useState(config.startTime);
  const [endTime, setEndTime] = useState(config.endTime);
  const [courtCount, setCourtCount] = useState(config.courtCount);
  const [courtHourlyRate, setCourtHourlyRate] = useState(config.courtHourlyRate);
  const [totalHours, setTotalHours] = useState(config.totalHours);
  const [shuttlecockBrand, setShuttlecockBrand] = useState(config.shuttlecockBrand);
  const [shuttlecockPrice, setShuttlecockPrice] = useState(config.shuttlecockPrice);
  const [promptPayId, setPromptPayId] = useState(config.promptPayId);
  const [promptPayName, setPromptPayName] = useState(config.promptPayName);
  const [memberCourtFee, setMemberCourtFee] = useState(config.memberCourtFee ?? 110);
  const [shuttlecockFeePerMatchPerPerson, setShuttlecockFeePerMatchPerPerson] = useState(config.shuttlecockFeePerMatchPerPerson ?? 25);
  const [extraShuttlecockPrice, setExtraShuttlecockPrice] = useState(config.extraShuttlecockPrice ?? 25);
  const [hideSkillFromMembers, setHideSkillFromMembers] = useState(config.hideSkillFromMembers ?? true);
  const [organizerPin, setOrganizerPin] = useState(config.organizerPin || '1234');
  const [avgMatchDurationMinutes, setAvgMatchDurationMinutes] = useState(config.avgMatchDurationMinutes || 18);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (onImportBackup) {
          onImportBackup(parsed);
          setImportStatus('นำเข้าข้อมูลสำเร็จ!');
          setTimeout(() => setImportStatus(null), 3000);
        }
      } catch (err) {
        alert('ไฟล์ข้อมูลไม่ถูกต้อง กรุณาเลือกไฟล์ JSON ที่สำรองไว้');
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Generate court names
    const names = Array.from({ length: courtCount }, (_, i) => `คอร์ท ${i + 1}`);

    onSaveConfig({
      ...config,
      sessionTitle: sessionTitle.trim() || 'ก๊วนแบดมินตัน',
      venueName: venueName.trim() || 'สนามแบดมินตัน',
      date,
      startTime,
      endTime,
      courtCount,
      courtNames: names,
      courtHourlyRate: Math.max(0, courtHourlyRate),
      totalHours: Math.max(1, totalHours),
      shuttlecockBrand: shuttlecockBrand.trim() || 'ลูกขนไก่มาตรฐาน',
      shuttlecockPrice: Math.max(0, shuttlecockPrice),
      promptPayId: promptPayId.trim() || '0891234567',
      promptPayName: promptPayName.trim() || 'หัวก๊วน',
      memberCourtFee: Math.max(0, memberCourtFee),
      shuttlecockFeePerMatchPerPerson: Math.max(0, shuttlecockFeePerMatchPerPerson),
      extraShuttlecockPrice: Math.max(0, extraShuttlecockPrice),
      hideSkillFromMembers,
      organizerPin: organizerPin.trim() || '1234',
      avgMatchDurationMinutes: Math.max(5, avgMatchDurationMinutes),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">ตั้งค่าข้อมูลก๊วน & อัตราค่าบริการ</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Title & Venue */}
          <div className="space-y-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                ชื่อก๊วน / ชื่องานแบด:
              </label>
              <input
                type="text"
                required
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">ชื่อสนามแบดมินตัน / สถานที่:</label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-slate-400 mb-1">วันที่:</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white px-2 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">เวลาเริ่ม:</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white px-2 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">เวลาเลิก:</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white px-2 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Courts and Rates */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-3">
            <span className="text-emerald-400 font-bold block">🏟️ ข้อมูลคอร์ท & เวลา:</span>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">จำนวนคอร์ท:</label>
                <select
                  value={courtCount}
                  onChange={(e) => setCourtCount(parseInt(e.target.value))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value={1}>1 คอร์ท</option>
                  <option value={2}>2 คอร์ท</option>
                  <option value={3}>3 คอร์ท</option>
                  <option value={4}>4 คอร์ท</option>
                  <option value={5}>5 คอร์ท</option>
                  <option value={6}>6 คอร์ท</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">ชม. รวมที่ตี:</label>
                <input
                  type="number"
                  min="1"
                  value={totalHours}
                  onChange={(e) => setTotalHours(parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">ค่าคอร์ท (฿/ชม.):</label>
                <input
                  type="number"
                  min="0"
                  value={courtHourlyRate}
                  onChange={(e) => setCourtHourlyRate(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Shuttlecock Brand & Rate */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-3">
            <span className="text-amber-400 font-bold block">🏸 ข้อมูลลูกขนไก่:</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">ยี่ห้อ / รุ่นลูก:</label>
                <input
                  type="text"
                  value={shuttlecockBrand}
                  onChange={(e) => setShuttlecockBrand(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">ราคาต่อลูก (บาท):</label>
                <input
                  type="number"
                  min="0"
                  value={shuttlecockPrice}
                  onChange={(e) => setShuttlecockPrice(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* PromptPay Settings */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-3">
            <span className="text-blue-400 font-bold block">📱 ข้อมูลพร้อมเพย์สำหรับรับโอนเงิน:</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">เบอร์โทร หรือ เลขบัตร ปชช:</label>
                <input
                  type="text"
                  required
                  placeholder="089xxxxxxx หรือ 13 หลัก"
                  value={promptPayId}
                  onChange={(e) => setPromptPayId(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">ชื่อเจ้าของบัญชี:</label>
                <input
                  type="text"
                  required
                  placeholder="นายสมชาย (หัวก๊วน)"
                  value={promptPayName}
                  onChange={(e) => setPromptPayName(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Club Rate Settings */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-bold block">🏸 อัตราคิดเงินระบบก๊วน (Club Rate System):</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                ค่าเริ่มต้นใช้งาน
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-300 mb-1">ค่าคอร์ทสมาชิก (฿/คน):</label>
                <input
                  type="number"
                  min="0"
                  value={memberCourtFee}
                  onChange={(e) => setMemberCourtFee(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 font-bold px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">ทุกคนจ่าย 110฿</span>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">ค่าลูก (฿/คน/แมตช์):</label>
                <input
                  type="number"
                  min="0"
                  value={shuttlecockFeePerMatchPerPerson}
                  onChange={(e) => setShuttlecockFeePerMatchPerPerson(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-amber-400 font-bold px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">1 แมตช์ 1 ลูก 25฿</span>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">ซื้อลูกเพิ่ม (฿/ลูก):</label>
                <input
                  type="number"
                  min="0"
                  value={extraShuttlecockPrice}
                  onChange={(e) => setExtraShuttlecockPrice(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white font-bold px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">ลูกละ 25฿</span>
              </div>
            </div>
          </div>

          {/* Privacy & Skill Visibility Control */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/90 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span className="text-white font-bold text-xs">ความเป็นส่วนตัว & เกณฑ์มือ (Privacy & PIN):</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                เฉพาะผู้จัดก๊วน
              </span>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={hideSkillFromMembers}
                onChange={(e) => setHideSkillFromMembers(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-950 border-slate-700 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-bold text-white block">
                  ซ่อนการประเมินระดับมือไม่ให้สมาชิกทั่วไปเห็น (แนะนำ)
                </span>
                <span className="text-slate-400 text-[11px] block mt-0.5">
                  เมื่อเปิดใช้งาน สมาชิกทั่วไปจะไม่เห็นคะแนนประเมิน (N, S-, S, S+, P) จะเห็นเฉพาะผู้จัดก๊วนเท่านั้น
                </span>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-slate-300 mb-1">
                  รหัส PIN ผู้จัดก๊วน (Admin PIN):
                </label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="1234"
                  value={organizerPin}
                  onChange={(e) => setOrganizerPin(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 font-mono text-center tracking-widest focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">ใช้สลับเข้าโหมดผู้จัด</span>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  เวลาแข่งเฉลี่ย (นาที/แมตช์):
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={avgMatchDurationMinutes}
                  onChange={(e) => setAvgMatchDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 text-white px-2 py-1.5 text-center focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">ใช้คำนวณคิวในหน้า Pre-Match</span>
              </div>
            </div>
          </div>

          {/* Data Storage & Backup Section */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/90 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="text-white font-bold text-xs">แหล่งจัดเก็บข้อมูล (Data Storage):</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-medium">
                LocalStorage บันทึกอัตโนมัติ
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ข้อมูลก๊วนทั้งหมด (รายชื่อสมาชิก, ผลประเมินมือ, ประวัติแมตช์, คอร์ท, บิลคิดเงิน, เลขพร้อมเพย์) จะถูกบันทึกไว้ใน Browser ของอุปกรณ์นี้โดยอัตโนมัติ ไม่สูญหายเมื่อปิดหน้าต่างเว็บหรือรีเฟรชหน้าจอ
            </p>

            {importStatus && (
              <div className="p-2 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-1.5 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>{importStatus}</span>
              </div>
            )}

            {/* Backup & Restore Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              {onExportBackup && (
                <button
                  type="button"
                  onClick={onExportBackup}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-700 text-xs transition font-semibold"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ดาวน์โหลดสำรองข้อมูล (.json)</span>
                </button>
              )}

              {onImportBackup && (
                <label className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-700 text-xs transition cursor-pointer font-semibold">
                  <Upload className="w-3.5 h-3.5 text-blue-400" />
                  <span>นำเข้าข้อมูลสำรอง (.json)</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition shadow"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
