const fs = require('fs');
const path = require('path');

const root = process.cwd();
const gatePath = path.join(root, 'src', 'components', 'MemberGateModal.tsx');
const selfPath = path.join(root, 'src', 'components', 'SelfCheckInModal.tsx');

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

for (const f of [gatePath, selfPath]) {
  if (!fs.existsSync(f)) fail('ไม่พบไฟล์: ' + f);
}

let gate = fs.readFileSync(gatePath, 'utf8');
let self = fs.readFileSync(selfPath, 'utf8');

if (gate.includes('GUANGUAN_MEMBER_PIN_ONLY_V27A') &&
    self.includes('GUANGUAN_MEMBER_PIN_ONLY_V27A')) {
  console.log('✅ V27A เคยทำแล้ว ไม่ต้องรันซ้ำ');
  process.exit(0);
}

// ============================================================
// MemberGateModal.tsx
// ============================================================

// Replace the whole verifyPlayerCode try/fallback block after enteredCode.
// This repo version has a direct organizer-PIN fallback:
//   enteredCode === expectedCode || enteredCode === organizerPin
const gateBlockRe = /(\s*const enteredCode = verificationCode\.trim\(\);\s*\r?\n)([\s\S]*?)(\s*if\s*\(\s*!(?:verifyRes\.isValid|isValid|valid)\s*\)\s*\{)/m;

// First try a more exact targeted replacement from enteredCode to the known direct fallback.
const gateDirectFallbackRe =
  /const enteredCode = verificationCode\.trim\(\);[\s\S]*?enteredCode\s*===\s*expectedCode\s*\|\|\s*enteredCode\s*===\s*String\(organizerPin\s*\|\|\s*''\)\.trim\(\);/m;

if (!gateDirectFallbackRe.test(gate)) {
  fail(
    'MemberGateModal.tsx: หา block ที่อนุญาต organizer PIN ไม่เจอ',
    'รัน: powershell -NoProfile -Command "Get-Content src\\components\\MemberGateModal.tsx | Select-Object -Skip 150 -First 45"'
  );
}

gate = gate.replace(
  gateDirectFallbackRe,
  `const enteredCode = verificationCode.trim();

      // GUANGUAN_MEMBER_PIN_ONLY_V27A
      // Member login must accept ONLY the member's own current verification code.
      // Organizer PIN must never be a master PIN for member login.
      const isValid = enteredCode === expectedCode;`
);

// The following code may still refer to verifyRes.isValid from the old block.
// Normalize common forms to use our new isValid.
gate = gate.replace(/!verifyRes\.isValid/g, '!isValid');
gate = gate.replace(/verifyRes\.isValid/g, 'isValid');

// Remove unused verifyPlayerCode import.
gate = gate.replace(
  /import\s*\{\s*verifyPlayerCode\s*\}\s*from\s*'\.\.\/utils\/security';\s*\r?\n?/,
  ''
);

// ============================================================
// SelfCheckInModal.tsx
// ============================================================

const selfVerifyRe =
  /const result = verifyPlayerCode\(selectedPlayer,\s*verificationCode,\s*organizerPin\);\s*\r?\n\s*if\s*\(!result\.isValid\)\s*\{/m;

if (!selfVerifyRe.test(self)) {
  fail(
    'SelfCheckInModal.tsx: หา verifyPlayerCode แบบเดิมไม่เจอ',
    'รัน: powershell -NoProfile -Command "Get-Content src\\components\\SelfCheckInModal.tsx | Select-Object -Skip 94 -First 24"'
  );
}

self = self.replace(
  selfVerifyRe,
  `// GUANGUAN_MEMBER_PIN_ONLY_V27A
      // Self check-in must accept ONLY this member's own current verification code.
      const isValid = verificationCode.trim() === expectedCode;
      if (!isValid) {`
);

// Remove verifyPlayerCode from import.
self = self.replace(
  /import\s*\{\s*getPlayerVerificationCode,\s*getMaskedCodeHint,\s*verifyPlayerCode\s*\}\s*from\s*'\.\.\/utils\/security';/,
  `import { getPlayerVerificationCode, getMaskedCodeHint } from '../utils/security';`
);

// ============================================================
// Verify before write
// ============================================================

const checks = [
  [
    'MemberGate no organizer PIN bypass',
    !/enteredCode\s*===\s*String\(organizerPin/.test(gate)
  ],
  [
    'MemberGate compares only expectedCode',
    gate.includes('GUANGUAN_MEMBER_PIN_ONLY_V27A') &&
    gate.includes('const isValid = enteredCode === expectedCode;')
  ],
  [
    'MemberGate no verifyPlayerCode call',
    !gate.includes('verifyPlayerCode(')
  ],
  [
    'SelfCheckIn compares only expectedCode',
    self.includes('GUANGUAN_MEMBER_PIN_ONLY_V27A') &&
    self.includes('const isValid = verificationCode.trim() === expectedCode;')
  ],
  [
    'SelfCheckIn no verifyPlayerCode call',
    !self.includes('verifyPlayerCode(')
  ],
];

console.log('');
console.log('=== PRE-WRITE VERIFY ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

if (!ok) fail('Verify ไม่ผ่าน');

// Backup
for (const f of [gatePath, selfPath]) {
  const bak = f + '.bak-member-pin-v27a';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(f, bak);
    console.log('Backup:', bak);
  }
}

// Write
fs.writeFileSync(gatePath, gate, 'utf8');
fs.writeFileSync(selfPath, self, 'utf8');

console.log('');
console.log('✅ V27A สำเร็จ');
console.log('');
console.log('พฤติกรรมหลังแก้:');
console.log('  • Member Login ใช้รหัสปัจจุบันของสมาชิกเท่านั้น');
console.log('  • Organizer PIN / 1234 ใช้แทน PIN สมาชิกไม่ได้');
console.log('  • Self Check-in ใช้รหัสสมาชิกเท่านั้น');
console.log('  • Organizer Login ไม่ได้รับผลกระทบ');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
