const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.tsx');
const financePath = path.join(root, 'src', 'components', 'FinancialStatsView.tsx');

for (const f of [appPath, financePath]) {
  if (!fs.existsSync(f)) {
    console.error('❌ ไม่พบไฟล์:', f);
    process.exit(1);
  }
}

function backup(file) {
  const bak = file + '.bak-shuttle-reset';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backup:', bak);
  }
}

backup(appPath);
backup(financePath);

let app = fs.readFileSync(appPath, 'utf8');
let finance = fs.readFileSync(financePath, 'utf8');

// ------------------------------------------------------------
// APP: add one handler that resets ONLY shuttle inventory system.
// It does not touch members, matches, payments, archive or fund.
// ------------------------------------------------------------
if (!app.includes('const handleResetAllShuttleData =')) {
  const anchor = '  const handleStocktakeShuttles =';
  const start = app.indexOf(anchor);

  if (start === -1) {
    console.error('❌ หา handleStocktakeShuttles ใน App.tsx ไม่เจอ');
    process.exit(2);
  }

  // Find the end of this arrow function by brace counting.
  const arrowStart = app.indexOf('=> {', start);
  if (arrowStart === -1) {
    console.error('❌ หา block handleStocktakeShuttles ไม่เจอ');
    process.exit(3);
  }

  let i = arrowStart + 3;
  let depth = 1;
  let quote = null;
  let escaped = false;

  for (; i < app.length; i++) {
    const ch = app[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }

  const semi = app.indexOf(';', i);
  if (semi === -1) {
    console.error('❌ หา end ของ handleStocktakeShuttles ไม่เจอ');
    process.exit(4);
  }

  const handler = `

  const handleResetAllShuttleData = (): boolean => {
    if (activeMatches.length > 0) {
      window.alert('ยังรีเซ็ตลูกไม่ได้ เพราะมี Match กำลังเล่นอยู่\\n\\nกรุณาจบ Match ในสนามก่อน');
      return false;
    }

    const confirmed = window.confirm(
      '⚠️ รีเซ็ตข้อมูลลูกขนไก่ทั้งหมด?\\n\\n' +
      'ระบบจะล้าง:\\n' +
      '• Stock / รายการซื้อลูกทั้งหมด\\n' +
      '• ประวัติการใช้ลูก (Usage Ledger)\\n' +
      '• รายการปรับ Stock\\n' +
      '• จำนวนลูกที่ใช้วันนี้\\n' +
      '• ราคาต้นทุนลูกในตั้งค่าก๊วน\\n\\n' +
      'จะไม่ลบสมาชิก, Match History, การชำระเงิน, คลังประวัติ หรือกองกลาง\\n\\n' +
      'กด OK เพื่อรีเซ็ต'
    );

    if (!confirmed) return false;

    setAppState((prev) => ({
      ...prev,
      shuttlePurchases: [],
      shuttleUsageLedger: [],
      shuttleStockAdjustments: [],
      sessionConfig: {
        ...prev.sessionConfig,
        shuttlecockBrand: '',
        shuttlecockPrice: 0,
        shuttlecocksUsedTotal: 0,
      },
    } as any));

    window.alert(
      '✅ รีเซ็ตข้อมูลลูกเรียบร้อยแล้ว\\n\\n' +
      'Stock = 0 ลูก\\n' +
      'ต้นทุน = 0.00 บาท/ลูก\\n\\n' +
      'จากนี้ให้เพิ่ม Stock ใหม่จากหน้าลูกขนไก่'
    );

    return true;
  };`;

  app = app.slice(0, semi + 1) + handler + app.slice(semi + 1);
}

// Wire prop into FinancialStatsView
if (!app.includes('onResetAllShuttleData={handleResetAllShuttleData}')) {
  const propAnchor = '            onStocktakeShuttles={handleStocktakeShuttles}';
  if (app.includes(propAnchor)) {
    app = app.replace(
      propAnchor,
      `${propAnchor}
            onResetAllShuttleData={handleResetAllShuttleData}`
    );
  } else {
    console.error('❌ หา prop onStocktakeShuttles ใน FinancialStatsView ไม่เจอ');
    process.exit(5);
  }
}

fs.writeFileSync(appPath, app, 'utf8');

// ------------------------------------------------------------
// FinancialStatsView: add optional prop and a Danger Zone button.
// ------------------------------------------------------------

// Interface prop — insert before closing interface brace.
if (!finance.includes('onResetAllShuttleData?:')) {
  const interfaceStart = finance.indexOf('interface FinancialStatsViewProps {');
  if (interfaceStart === -1) {
    console.error('❌ หา FinancialStatsViewProps ไม่เจอ');
    process.exit(6);
  }
  const interfaceEnd = finance.indexOf('\n}', interfaceStart);
  if (interfaceEnd === -1) {
    console.error('❌ หา end interface ไม่เจอ');
    process.exit(7);
  }
  finance =
    finance.slice(0, interfaceEnd) +
    `\n  onResetAllShuttleData?: () => boolean;` +
    finance.slice(interfaceEnd);
}

// Destructure prop.
if (!finance.includes('  onResetAllShuttleData,')) {
  const componentStart = finance.indexOf('export const FinancialStatsView: React.FC<FinancialStatsViewProps> = ({');
  if (componentStart === -1) {
    console.error('❌ หา FinancialStatsView component ไม่เจอ');
    process.exit(8);
  }
  const destructEnd = finance.indexOf('\n}) => {', componentStart);
  if (destructEnd === -1) {
    console.error('❌ หา destructuring end ไม่เจอ');
    process.exit(9);
  }
  finance =
    finance.slice(0, destructEnd) +
    `\n  onResetAllShuttleData,` +
    finance.slice(destructEnd);
}

// Add Danger Zone near bottom of Finance page.
if (!finance.includes('RESET_SHUTTLE_DANGER_ZONE')) {
  const finalClose = finance.lastIndexOf('\n    </div>\n  );');
  if (finalClose === -1) {
    console.error('❌ หา root closing ของ FinancialStatsView ไม่เจอ');
    process.exit(10);
  }

  const dangerZone = `

      {/* RESET_SHUTTLE_DANGER_ZONE */}
      {isOrganizerMode && onResetAllShuttleData && (
        <div className="mt-6 rounded-2xl border border-rose-900/70 bg-rose-950/20 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-rose-300">
                ⚠️ Danger Zone — ข้อมูลลูกขนไก่
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                ใช้เมื่อต้องการเริ่ม Stock ลูกใหม่ทั้งหมด โดยไม่ลบสมาชิก Match หรือข้อมูลการชำระเงิน
              </p>
            </div>

            <button
              type="button"
              onClick={() => onResetAllShuttleData()}
              className="shrink-0 rounded-xl border border-rose-700 bg-rose-950/70 hover:bg-rose-900/70 px-4 py-2.5 text-xs font-extrabold text-rose-200 transition"
            >
              🗑️ รีเซ็ต Stock ลูกทั้งหมด
            </button>
          </div>
        </div>
      )}`;

  finance = finance.slice(0, finalClose) + dangerZone + finance.slice(finalClose);
}

fs.writeFileSync(financePath, finance, 'utf8');

// ------------------------------------------------------------
// Verify
// ------------------------------------------------------------
const appFinal = fs.readFileSync(appPath, 'utf8');
const financeFinal = fs.readFileSync(financePath, 'utf8');

const checks = [
  ['Reset handler', appFinal.includes('const handleResetAllShuttleData =')],
  ['Clear purchases', appFinal.includes('shuttlePurchases: []')],
  ['Clear usage ledger', appFinal.includes('shuttleUsageLedger: []')],
  ['Clear adjustments', appFinal.includes('shuttleStockAdjustments: []')],
  ['Reset session usage', appFinal.includes('shuttlecocksUsedTotal: 0')],
  ['Reset price', appFinal.includes('shuttlecockPrice: 0')],
  ['Prop wired', appFinal.includes('onResetAllShuttleData={handleResetAllShuttleData}')],
  ['Finance button', financeFinal.includes('รีเซ็ต Stock ลูกทั้งหมด')],
];

console.log('');
console.log('=== VERIFY ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

if (!ok) {
  console.error('\n❌ Patch ไม่สมบูรณ์ กรุณาส่ง App.tsx และ FinancialStatsView.tsx ล่าสุดมา');
  process.exit(11);
}

console.log('');
console.log('✅ เพิ่มปุ่มรีเซ็ต Stock ลูกทั้งหมดแล้ว');
console.log('✅ ไม่แตะสมาชิก / Match History / Payment / Archive / Fund');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
console.log('  npm.cmd run dev');
