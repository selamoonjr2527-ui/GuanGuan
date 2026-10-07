const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.tsx');

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

if (!fs.existsSync(appPath)) fail('ไม่พบ src\\App.tsx');

let app = fs.readFileSync(appPath, 'utf8');

if (app.includes('AUTO_SESSION_HOURS_FROM_TIME_V33')) {
  console.log('✅ V33 เคยทำแล้ว ไม่ต้องรันซ้ำ');
  process.exit(0);
}

const oldRe = /const handleUpdateSessionConfig = \(newConfig: SessionConfig\) => \{\s*\r?\n\s*setAppState\(\(prev\) => \(\{ \.\.\.prev, sessionConfig: newConfig \}\)\);\s*\r?\n\s*\};/m;

if (!oldRe.test(app)) {
  fail(
    'App.tsx: หา handleUpdateSessionConfig แบบเดิมไม่เจอ',
    'รัน: powershell -NoProfile -Command "Get-Content src\\App.tsx | Select-String -Pattern \\"handleUpdateSessionConfig\\" -Context 0,8"'
  );
}

const replacement = `const handleUpdateSessionConfig = (newConfig: SessionConfig) => {
    setAppState((prev) => {
      // AUTO_SESSION_HOURS_FROM_TIME_V33
      // เวลาเริ่ม/จบเป็น Source of Truth ของจำนวนชั่วโมงเช่าคอร์ท
      // เช่น 19:00 -> 23:00 = 4 ชั่วโมง
      const timeChanged =
        newConfig.startTime !== prev.sessionConfig.startTime ||
        newConfig.endTime !== prev.sessionConfig.endTime;

      let totalHours = newConfig.totalHours;

      if (timeChanged) {
        const parseMinutes = (value?: string): number | null => {
          const match = String(value || '').match(/^(\\d{1,2}):(\\d{2})$/);
          if (!match) return null;

          const h = Number(match[1]);
          const m = Number(match[2]);

          if (
            !Number.isFinite(h) ||
            !Number.isFinite(m) ||
            h < 0 ||
            h > 23 ||
            m < 0 ||
            m > 59
          ) {
            return null;
          }

          return h * 60 + m;
        };

        const startMinutes = parseMinutes(newConfig.startTime);
        const endMinutes = parseMinutes(newConfig.endTime);

        if (startMinutes !== null && endMinutes !== null) {
          let durationMinutes = endMinutes - startMinutes;

          // รองรับกรณีเล่นข้ามเที่ยงคืน เช่น 22:00 -> 01:00
          if (durationMinutes <= 0) {
            durationMinutes += 24 * 60;
          }

          totalHours = Math.round((durationMinutes / 60) * 100) / 100;
        }
      }

      return {
        ...prev,
        sessionConfig: {
          ...newConfig,
          totalHours,
        },
      };
    });
  };`;

app = app.replace(oldRe, replacement);

if (
  !app.includes('AUTO_SESSION_HOURS_FROM_TIME_V33') ||
  !app.includes('durationMinutes / 60')
) {
  fail('Verify V33 ไม่ผ่าน');
}

const bak = appPath + '.bak-auto-session-hours-v33';
if (!fs.existsSync(bak)) {
  fs.copyFileSync(appPath, bak);
  console.log('Backup:', bak);
}

fs.writeFileSync(appPath, app, 'utf8');

console.log('');
console.log('✅ V33 สำเร็จ — เวลาใน Setting จะอัปเดต totalHours อัตโนมัติ');
console.log('');
console.log('ตัวอย่าง:');
console.log('  19:00 -> 22:00 = 3 ชั่วโมง');
console.log('  19:00 -> 23:00 = 4 ชั่วโมง');
console.log('  19:00 -> 22:30 = 3.5 ชั่วโมง');
console.log('');
console.log('Finance จะคำนวณค่าเช่าคอร์ท = จำนวนคอร์ท x ชั่วโมง x ราคา/ชั่วโมง');
console.log('หมายเหตุ: memberCourtFee 110 บาท/คน ยังเป็นราคาคงที่ตามกติกาเดิม');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
