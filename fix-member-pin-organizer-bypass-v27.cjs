const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = [
  path.join(root, 'src', 'components', 'MemberGateModal.tsx'),
  path.join(root, 'src', 'components', 'SelfCheckInModal.tsx'),
];

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

for (const f of files) {
  if (!fs.existsSync(f)) fail('ไม่พบไฟล์: ' + f);
}

let gate = fs.readFileSync(files[0], 'utf8');
let self = fs.readFileSync(files[1], 'utf8');

if (gate.includes('GUANGUAN_MEMBER_PIN_ONLY_V27') &&
    self.includes('GUANGUAN_MEMBER_PIN_ONLY_V27')) {
  console.log('✅ V27 เคยทำแล้ว ไม่ต้องรันซ้ำ');
  process.exit(0);
}

// MemberGateModal
const gateOld =
  /const verifyRes = verifyPlayerCode\(selectedPlayer,\s*verificationCode\.trim\(\),\s*organizerPin\);\s*\r?\n\s*if \(!verifyRes\.isValid\) \{/;

if (!gateOld.test(gate)) {
  fail(
    'MemberGateModal.tsx: หา verifyPlayerCode แบบเดิมไม่เจอ',
    'รัน: findstr /n /i "verifyPlayerCode organizerPin expectedCode" src\\components\\MemberGateModal.tsx'
  );
}

gate = gate.replace(
  gateOld,
  `// GUANGUAN_MEMBER_PIN_ONLY_V27
      // Member login must validate ONLY against this member's own code.
      // Organizer PIN must never act as a master PIN for member login.
      const isMemberCodeValid = verificationCode.trim() === expectedCode;
      if (!isMemberCodeValid) {`
);

gate = gate.replace(
  /setMemberError\('❌ รหัส 4 หลักไม่ถูกต้อง \(กรุณาใช้ 4 ตัวท้ายเบอร์โทร หรือ PIN ส่วนตัว\)'\);/,
  `setMemberError('❌ PIN ไม่ถูกต้อง กรุณาใช้ PIN ส่วนตัวของสมาชิกนี้');`
);

gate = gate.replace(
  /import\s*\{\s*verifyPlayerCode,\s*getPlayerVerificationCode,\s*getMaskedCodeHint\s*\}\s*from\s*'\.\.\/utils\/security';/,
  `import { getPlayerVerificationCode, getMaskedCodeHint } from '../utils/security';`
);

gate = gate.replace(/^\s*organizerPin = '1234',\s*\r?\n/m, '');

// SelfCheckInModal
const selfOld =
  /const result = verifyPlayerCode\(selectedPlayer,\s*verificationCode,\s*organizerPin\);\s*\r?\n\s*if \(!result\.isValid\) \{/;

if (!selfOld.test(self)) {
  fail(
    'SelfCheckInModal.tsx: หา verifyPlayerCode แบบเดิมไม่เจอ',
    'รัน: findstr /n /i "verifyPlayerCode organizerPin expectedCode" src\\components\\SelfCheckInModal.tsx'
  );
}

self = self.replace(
  selfOld,
  `// GUANGUAN_MEMBER_PIN_ONLY_V27
      // Self check-in must validate ONLY against this member's own code.
      // Organizer PIN must never act as a master PIN for member check-in.
      const isMemberCodeValid = verificationCode.trim() === expectedCode;
      if (!isMemberCodeValid) {`
);

self = self.replace(
  /setErrorMessage\('❌ รหัส 4 หลักไม่ถูกต้อง ตรวจสอบว่าเลือกถูกชื่อหรือไม่'\);/,
  `setErrorMessage('❌ PIN ไม่ถูกต้อง กรุณาใช้ PIN ส่วนตัวของสมาชิกนี้');`
);

self = self.replace(
  /import\s*\{\s*getPlayerVerificationCode,\s*getMaskedCodeHint,\s*verifyPlayerCode\s*\}\s*from\s*'\.\.\/utils\/security';/,
  `import { getPlayerVerificationCode, getMaskedCodeHint } from '../utils/security';`
);

self = self.replace(/^\s*organizerPin = '1234',\s*\r?\n/m, '');

const checks = [
  ['MemberGate uses own code only',
    gate.includes('GUANGUAN_MEMBER_PIN_ONLY_V27') &&
    gate.includes('verificationCode.trim() === expectedCode')],
  ['SelfCheckIn uses own code only',
    self.includes('GUANGUAN_MEMBER_PIN_ONLY_V27') &&
    self.includes('verificationCode.trim() === expectedCode')],
  ['MemberGate no verifyPlayerCode call', !gate.includes('verifyPlayerCode(')],
  ['SelfCheckIn no verifyPlayerCode call', !self.includes('verifyPlayerCode(')],
  ['MemberGate no organizer PIN fallback', !gate.includes("organizerPin = '1234'")],
  ['SelfCheckIn no organizer PIN fallback', !self.includes("organizerPin = '1234'")],
];

console.log('');
console.log('=== PRE-WRITE VERIFY ===');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}
if (!ok) fail('Verify ไม่ผ่าน');

for (const f of files) {
  const bak = f + '.bak-member-pin-v27';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(f, bak);
    console.log('Backup:', bak);
  }
}

fs.writeFileSync(files[0], gate, 'utf8');
fs.writeFileSync(files[1], self, 'utf8');

console.log('');
console.log('✅ V27 สำเร็จ — Member PIN แยกจาก Organizer PIN แล้ว');
console.log('');
console.log('ผลใหม่:');
console.log('  • สมาชิกที่มี PIN แล้ว ต้องใช้ PIN ของตัวเองเท่านั้น');
console.log('  • 1234 / Organizer PIN จะใช้เข้า Member Login ไม่ได้');
console.log('  • Self Check-in ก็ใช้ Organizer PIN แทนไม่ได้');
console.log('  • Organizer Login ยังใช้ PIN ผู้จัดตามเดิม');
console.log('');
console.log('ทดสอบต่อ:');
console.log('  npm.cmd run build');
