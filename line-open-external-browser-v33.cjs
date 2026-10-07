const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'src');

function fail(msg) {
  console.error('❌ ' + msg);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

if (!fs.existsSync(srcDir)) {
  fail('ไม่พบโฟลเดอร์ src');
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(srcDir);
const target = '?mode=member';
const replacement = '?mode=member&openExternalBrowser=1';

let planned = [];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');

  // Do not double-patch links already containing the LINE external-browser parameter.
  const next = original.replace(
    /\?mode=member(?!&openExternalBrowser=1)/g,
    replacement
  );

  if (next !== original) {
    planned.push({ file, original, next });
  }
}

if (planned.length === 0) {
  const already = files.some((file) =>
    fs.readFileSync(file, 'utf8').includes(replacement)
  );

  if (already) {
    console.log('✅ V33 เคยทำแล้ว — Member Link มี openExternalBrowser=1 อยู่แล้ว');
    process.exit(0);
  }

  fail('ไม่พบ Member Link แบบ ?mode=member ใน src');
}

console.log('');
console.log('=== PRE-WRITE VERIFY V33 ===');
for (const item of planned) {
  const rel = path.relative(root, item.file);
  const oldCount = (item.original.match(/\?mode=member(?!&openExternalBrowser=1)/g) || []).length;
  const newCount = (item.next.match(/\?mode=member&openExternalBrowser=1/g) || []).length;
  console.log(`✅ ${rel}: แก้ ${oldCount} จุด → External Browser link ${newCount} จุด`);
}

// Backup then write.
for (const item of planned) {
  const bak = item.file + '.bak-line-external-browser-v33';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(item.file, bak);
    console.log('Backup:', bak);
  }
}

for (const item of planned) {
  fs.writeFileSync(item.file, item.next, 'utf8');
}

console.log('');
console.log('✅ V33 สำเร็จ — ลิงก์สมาชิกจาก LINE จะขอเปิด External Browser โดยตรง');
console.log('');
console.log('Member Link ใหม่:');
console.log('  ?mode=member&openExternalBrowser=1');
console.log('');
console.log('ผลที่ได้:');
console.log('  • กดลิงก์จาก LINE → เปิด Browser ภายนอก');
console.log('  • Android → Default Browser');
console.log('  • iPhone/iPad → External Browser ตามที่ LINE/ระบบรองรับ');
console.log('  • เปิดจาก Browser ปกติ → ใช้งานเหมือนเดิม');
console.log('  • mode=member ยังทำงานเหมือนเดิม');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
