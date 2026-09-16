const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src', 'components', 'PreMatchView.tsx');

if (!fs.existsSync(target)) {
  console.error('ไม่พบไฟล์:', target);
  process.exit(1);
}

let text = fs.readFileSync(target, 'utf8');
const backup = target + '.bak-hide-resting-pm-page';

if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
  console.log('Backup:', backup);
}

const startMarker = '      {/* Resting Players List (if any) */}';
const start = text.indexOf(startMarker);

if (start === -1) {
  console.log('ℹ️ ไม่พบ Resting Players List — อาจถูกซ่อนไปแล้ว');
  process.exit(0);
}

// This block is the final section before the component's closing wrapper.
const componentClose = '\n    </div>\n  );';
const end = text.indexOf(componentClose, start);

if (end === -1) {
  console.error('หา component closing ไม่เจอ — ไม่แก้ไฟล์เพื่อความปลอดภัย');
  process.exit(2);
}

text = text.slice(0, start) + text.slice(end);

fs.writeFileSync(target, text, 'utf8');

console.log('');
console.log('✅ ซ่อนรายชื่อคนพักออกจากหน้า Pre-Match แล้ว');
console.log('   • ไม่แสดงใน Waiting Queue');
console.log('   • ไม่แสดงใน PM Manual Picker');
console.log('   • ไม่แสดงใน Resting Players List ด้านล่างหน้า PM');
console.log('   • ยังสามารถเปลี่ยน "หายเหนื่อยแล้ว" จากหน้า Check-in / Member ได้');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
