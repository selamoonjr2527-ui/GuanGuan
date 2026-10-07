const fs = require('fs');
const path = require('path');

const root = process.cwd();
const securityPath = path.join(root, 'src', 'utils', 'security.ts');
const memberGatePath = path.join(root, 'src', 'components', 'MemberGateModal.tsx');
const selfCheckPath = path.join(root, 'src', 'components', 'SelfCheckInModal.tsx');

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

for (const f of [securityPath, memberGatePath, selfCheckPath]) {
  if (!fs.existsSync(f)) fail('ไม่พบไฟล์: ' + f);
}

let security = fs.readFileSync(securityPath, 'utf8');
let memberGate = fs.readFileSync(memberGatePath, 'utf8');
let selfCheck = fs.readFileSync(selfCheckPath, 'utf8');

if (
  security.includes('VERIFY_PIN_OR_PHONE_LAST4_V33') &&
  memberGate.includes('MEMBER_AUTH_PIN_OR_PHONE_V33') &&
  selfCheck.includes('SELF_CHECKIN_PIN_OR_PHONE_V33')
) {
  console.log('✅ V33 เคยทำแล้ว ไม่ต้องรันซ้ำ');
  process.exit(0);
}

// ============================================================
// 1) Add a dedicated member-only verifier.
//    Accept PIN OR last 4 phone digits.
//    Never accepts organizer PIN as a master member password.
// ============================================================
if (!security.includes('VERIFY_PIN_OR_PHONE_LAST4_V33')) {
  security += `

// VERIFY_PIN_OR_PHONE_LAST4_V33
// Member authentication rule:
//   - personal PIN 4 digits OR
//   - last 4 digits of member phone
// Organizer PIN is intentionally NOT a member-login fallback.
export function verifyMemberPinOrPhoneLast4(
  player: any,
  enteredCode: string
): {
  isValid: boolean;
  method: 'pin' | 'phone_last4' | null;
} {
  const entered = String(enteredCode || '').replace(/\\D/g, '');

  if (entered.length !== 4) {
    return { isValid: false, method: null };
  }

  const pinDigits = String(player?.pin || '').replace(/\\D/g, '');
  const phoneDigits = String(player?.phone || '').replace(/\\D/g, '');

  if (pinDigits.length === 4 && entered === pinDigits) {
    return { isValid: true, method: 'pin' };
  }

  if (
    phoneDigits.length >= 4 &&
    entered === phoneDigits.slice(-4)
  ) {
    return { isValid: true, method: 'phone_last4' };
  }

  return { isValid: false, method: null };
}
`;
}

// ============================================================
// 2) MemberGateModal
// ============================================================
const memberSecurityImport =
  /import\s*\{[^}]*\}\s*from\s*'\.\.\/utils\/security';/m;

if (!memberSecurityImport.test(memberGate)) {
  fail(
    'MemberGateModal.tsx: หา import ../utils/security ไม่เจอ',
    'รัน: findstr /n /i "utils/security verifyPlayerCode" src\\components\\MemberGateModal.tsx'
  );
}

memberGate = memberGate.replace(
  memberSecurityImport,
  `import {
  getPlayerVerificationCode,
  getMaskedCodeHint,
  verifyMemberPinOrPhoneLast4,
} from '../utils/security';`
);

// Current code can be one-line or multiline after V27B.
const memberVerifyCall =
  /const\s+verifyRes\s*=\s*verifyPlayerCode\s*\([\s\S]*?\)\s*;/m;

if (!memberVerifyCall.test(memberGate)) {
  fail(
    'MemberGateModal.tsx: หา verifyPlayerCode ของ Member Login ไม่เจอ',
    'รัน: powershell -NoProfile -Command "Get-Content src\\components\\MemberGateModal.tsx | Select-Object -Skip 145 -First 45"'
  );
}

memberGate = memberGate.replace(
  memberVerifyCall,
  `// MEMBER_AUTH_PIN_OR_PHONE_V33
      const verifyRes = verifyMemberPinOrPhoneLast4(
        selectedPlayer,
        verificationCode.trim()
      );`
);

// In some current versions there is a local "enteredCode" variable and a fallback.
// Keep expectedCode fallback harmless, but explicitly kill any organizer PIN fallback
// in case an older V27 repair is still present.
memberGate = memberGate.replace(
  /\s*\|\|\s*enteredCode\s*===\s*String\(organizerPin\s*\|\|\s*''\)\.trim\(\)/g,
  ''
);

// Avoid noUnusedParameters if organizerPin is no longer used here.
if (
  memberGate.includes("organizerPin = '1234'") &&
  !memberGate.includes('ORGANIZER_PIN_NOT_MEMBER_AUTH_V33')
) {
  const memberComponentStart =
    /(\}\)\s*=>\s*\{\s*\r?\n)(\s*const\s+\[mode,)/m;

  if (memberComponentStart.test(memberGate)) {
    memberGate = memberGate.replace(
      memberComponentStart,
      `$1  // ORGANIZER_PIN_NOT_MEMBER_AUTH_V33
  void organizerPin;
$2`
    );
  }
}

// ============================================================
// 3) SelfCheckInModal
// ============================================================
const selfSecurityImport =
  /import\s*\{[^}]*\}\s*from\s*'\.\.\/utils\/security';/m;

if (!selfSecurityImport.test(selfCheck)) {
  fail(
    'SelfCheckInModal.tsx: หา import ../utils/security ไม่เจอ',
    'รัน: findstr /n /i "utils/security verifyPlayerCode" src\\components\\SelfCheckInModal.tsx'
  );
}

selfCheck = selfCheck.replace(
  selfSecurityImport,
  `import {
  getPlayerVerificationCode,
  getMaskedCodeHint,
  verifyMemberPinOrPhoneLast4,
} from '../utils/security';`
);

const selfVerifyCall =
  /const\s+result\s*=\s*verifyPlayerCode\s*\([\s\S]*?\)\s*;/m;

if (!selfVerifyCall.test(selfCheck)) {
  fail(
    'SelfCheckInModal.tsx: หา verifyPlayerCode ของ Self Check-in ไม่เจอ',
    'รัน: powershell -NoProfile -Command "Get-Content src\\components\\SelfCheckInModal.tsx | Select-Object -Skip 92 -First 30"'
  );
}

selfCheck = selfCheck.replace(
  selfVerifyCall,
  `// SELF_CHECKIN_PIN_OR_PHONE_V33
      const result = verifyMemberPinOrPhoneLast4(
        selectedPlayer,
        verificationCode.trim()
      );`
);

if (
  selfCheck.includes("organizerPin = '1234'") &&
  !selfCheck.includes('ORGANIZER_PIN_NOT_SELF_AUTH_V33')
) {
  const selfComponentStart =
    /(\}\)\s*=>\s*\{\s*\r?\n)(\s*const\s+\[searchTerm,)/m;

  if (selfComponentStart.test(selfCheck)) {
    selfCheck = selfCheck.replace(
      selfComponentStart,
      `$1  // ORGANIZER_PIN_NOT_SELF_AUTH_V33
  void organizerPin;
$2`
    );
  }
}

// Improve the Self Check-in error so the rule is clear.
selfCheck = selfCheck.replace(
  "setErrorMessage('❌ รหัส 4 หลักไม่ถูกต้อง ตรวจสอบว่าเลือกถูกชื่อหรือไม่');",
  "setErrorMessage('❌ รหัสไม่ถูกต้อง กรุณาใช้ PIN ส่วนตัว หรือ 4 ตัวท้ายเบอร์โทร');"
);

// ============================================================
// Verify before write
// ============================================================
const checks = [
  [
    'Security helper accepts personal PIN',
    security.includes("method: 'pin'") &&
      security.includes('entered === pinDigits')
  ],
  [
    'Security helper accepts phone last 4',
    security.includes("method: 'phone_last4'") &&
      security.includes('phoneDigits.slice(-4)')
  ],
  [
    'Member Login uses new verifier',
    memberGate.includes('MEMBER_AUTH_PIN_OR_PHONE_V33') &&
      memberGate.includes('verifyMemberPinOrPhoneLast4')
  ],
  [
    'Self Check-in uses new verifier',
    selfCheck.includes('SELF_CHECKIN_PIN_OR_PHONE_V33') &&
      selfCheck.includes('verifyMemberPinOrPhoneLast4')
  ],
  [
    'Organizer PIN is not passed to member verifier',
    !/verifyMemberPinOrPhoneLast4\s*\([\s\S]*?organizerPin[\s\S]*?\)/m.test(memberGate) &&
      !/verifyMemberPinOrPhoneLast4\s*\([\s\S]*?organizerPin[\s\S]*?\)/m.test(selfCheck)
  ],
];

console.log('');
console.log('=== PRE-WRITE VERIFY V33 ===');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}

if (!ok) fail('Verify ไม่ผ่าน');

// Backups
for (const f of [securityPath, memberGatePath, selfCheckPath]) {
  const bak = f + '.bak-pin-phone-v33';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(f, bak);
    console.log('Backup:', bak);
  }
}

fs.writeFileSync(securityPath, security, 'utf8');
fs.writeFileSync(memberGatePath, memberGate, 'utf8');
fs.writeFileSync(selfCheckPath, selfCheck, 'utf8');

console.log('');
console.log('✅ V33 สำเร็จ — Member Auth = PIN หรือ 4 ตัวท้ายเบอร์โทร');
console.log('');
console.log('ตัวอย่าง:');
console.log('  PIN สมาชิก = 5678');
console.log('  เบอร์โทร = 089-123-4321');
console.log('  -> 5678 เข้าได้');
console.log('  -> 4321 เข้าได้');
console.log('  -> Organizer PIN ไม่ใช่ Master Password สมาชิก');
console.log('');
console.log('แก้ทั้ง:');
console.log('  • Member Login / สลับสมาชิก');
console.log('  • Self Check-in');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
