const fs = require('fs');
const path = require('path');

const root = process.cwd();

const gatePath = path.join(root, 'src', 'components', 'MemberGateModal.tsx');
const selfPath = path.join(root, 'src', 'components', 'SelfCheckInModal.tsx');

const gateBak = gatePath + '.bak-member-pin-v27a';
const selfBak = selfPath + '.bak-member-pin-v27a';

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

if (!fs.existsSync(gateBak) || !fs.existsSync(selfBak)) {
  fail(
    'ไม่พบ backup ของ V27A',
    'เช็กไฟล์ด้วย: dir src\\components\\*.bak-member-pin-v27a'
  );
}

// Start from the clean files saved BEFORE V27A changed them.
let gate = fs.readFileSync(gateBak, 'utf8');
let self = fs.readFileSync(selfBak, 'utf8');

// ============================================================
// MemberGateModal.tsx
// Keep original structure intact. Only disable Organizer PIN
// as a valid member credential.
// ============================================================

const gateVerifyCall =
  /verifyPlayerCode\(\s*selectedPlayer,\s*enteredCode,\s*organizerPin\s*\)/m;

if (!gateVerifyCall.test(gate)) {
  fail(
    'MemberGate backup: หา verifyPlayerCode(selectedPlayer, enteredCode, organizerPin) ไม่เจอ',
    'ยังไม่ได้แก้ไฟล์'
  );
}

gate = gate.replace(
  gateVerifyCall,
  `verifyPlayerCode(
          selectedPlayer,
          enteredCode,
          '' // GUANGUAN_MEMBER_PIN_ONLY_V27B: no organizer PIN fallback
        )`
);

const gateDirectBypass =
  /enteredCode\s*===\s*expectedCode\s*\|\|\s*enteredCode\s*===\s*String\(organizerPin\s*\|\|\s*''\)\.trim\(\)/m;

if (!gateDirectBypass.test(gate)) {
  fail(
    'MemberGate backup: หา direct organizer PIN bypass ไม่เจอ',
    'ยังไม่ได้แก้ไฟล์'
  );
}

gate = gate.replace(
  gateDirectBypass,
  `enteredCode === expectedCode`
);

// ============================================================
// SelfCheckInModal.tsx
// Keep original syntax/flow. Only stop passing organizer PIN.
// ============================================================

const selfVerifyCall =
  /verifyPlayerCode\(\s*selectedPlayer,\s*verificationCode,\s*organizerPin\s*\)/m;

if (!selfVerifyCall.test(self)) {
  fail(
    'SelfCheckIn backup: หา verifyPlayerCode(... organizerPin) ไม่เจอ',
    'ยังไม่ได้แก้ไฟล์'
  );
}

self = self.replace(
  selfVerifyCall,
  `verifyPlayerCode(
        selectedPlayer,
        verificationCode,
        '' // GUANGUAN_MEMBER_PIN_ONLY_V27B: no organizer PIN fallback
      )`
);

// ============================================================
// Verify BEFORE writing
// ============================================================

const checks = [
  ['MemberGate direct organizer bypass removed',
    !/enteredCode\s*===\s*String\(organizerPin/.test(gate)],
  ['MemberGate no organizerPin passed to verifyPlayerCode',
    !/verifyPlayerCode\(\s*selectedPlayer,\s*enteredCode,\s*organizerPin\s*\)/m.test(gate)],
  ['MemberGate own-code check remains',
    /enteredCode\s*===\s*expectedCode/.test(gate)],
  ['SelfCheckIn no organizerPin passed to verifyPlayerCode',
    !/verifyPlayerCode\(\s*selectedPlayer,\s*verificationCode,\s*organizerPin\s*\)/m.test(self)],
  ['V27B marker present in MemberGate',
    gate.includes('GUANGUAN_MEMBER_PIN_ONLY_V27B')],
  ['V27B marker present in SelfCheckIn',
    self.includes('GUANGUAN_MEMBER_PIN_ONLY_V27B')],
];

console.log('');
console.log('=== PRE-WRITE VERIFY V27B ===');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}

if (!ok) fail('Verify ไม่ผ่าน');

// Save the broken V27A versions too, just in case.
for (const f of [gatePath, selfPath]) {
  const brokenBak = f + '.bak-broken-v27a';
  if (fs.existsSync(f) && !fs.existsSync(brokenBak)) {
    fs.copyFileSync(f, brokenBak);
  }
}

// Write repaired files based on clean V27A backups.
fs.writeFileSync(gatePath, gate, 'utf8');
fs.writeFileSync(selfPath, self, 'utf8');

console.log('');
console.log('✅ V27B สำเร็จ');
console.log('  • Restore โครงสร้างไฟล์เดิมจาก backup ก่อน V27A');
console.log('  • ตัด Organizer PIN ออกจาก Member Login');
console.log('  • ตัด Organizer PIN ออกจาก Self Check-in');
console.log('  • ไม่เปลี่ยนโครงสร้าง if/else เดิม');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
