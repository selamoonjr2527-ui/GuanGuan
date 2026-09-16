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

function backup(file, suffix) {
  const bak = file + suffix;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backup:', bak);
  }
}

backup(appPath, '.bak-shuttle-reset-v2');
backup(financePath, '.bak-shuttle-reset-v2');

let app = fs.readFileSync(appPath, 'utf8');
let finance = fs.readFileSync(financePath, 'utf8');

// ============================================================
// 1) APP.TSX
// Insert reset handler immediately BEFORE handleStartMatch.
// This avoids parsing the full handleStocktakeShuttles block.
// ============================================================
if (!app.includes('const handleResetAllShuttleData =')) {
  const anchor = '  const handleStartMatch = (';

  if (!app.includes(anchor)) {
    console.error('❌ หา handleStartMatch ใน App.tsx ไม่เจอ');
    process.exit(2);
  }

  const handler = `  const handleResetAllShuttleData = (): boolean => {
    if (activeMatches.length > 0) {
      window.alert(
        'ยังรีเซ็ตลูกไม่ได้ เพราะมี Match กำลังเล่นอยู่\\n\\nกรุณาจบ Match ในสนามก่อน'
      );
      return false;
    }

    const confirmed = window.confirm(
      '⚠️ รีเซ็ตข้อมูลลูกขนไก่ทั้งหมด?\\n\\n' +
      'ระบบจะล้าง:\\n' +
      '• Stock / รายการซื้อลูกทั้งหมด\\n' +
      '• ประวัติการใช้ลูก (Usage Ledger)\\n' +
      '• รายการปรับ Stock\\n' +
      '• จำนวนลูกที่ใช้วันนี้\\n' +
      '• ยี่ห้อ / รุ่นลูกในตั้งค่าก๊วน\\n' +
      '• ราคาต้นทุนลูกในตั้งค่าก๊วน\\n\\n' +
      'จะไม่ลบสมาชิก, Match History, การชำระเงิน, Archive หรือ Fund\\n\\n' +
      'กด OK เพื่อรีเซ็ต'
    );

    if (!confirmed) return false;

    setAppState((prev) => ({
      ...prev,
      shuttlePurchases: [],
      shuttleUsageLedger: [],
      shuttleStockAdjustments: [],
      shuttleLowStockThreshold: 12,
      shuttleTargetStock: 36,
      shuttleDefaultPiecesPerTube: 12,
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
  };

`;

  app = app.replace(anchor, handler + anchor);
}

// Wire prop into FinancialStatsView
if (!app.includes('onResetAllShuttleData={handleResetAllShuttleData}')) {
  const propAnchor = '            onStocktakeShuttles={handleStocktakeShuttles}';

  if (!app.includes(propAnchor)) {
    console.error('❌ หา onStocktakeShuttles prop ใน App.tsx ไม่เจอ');
    process.exit(3);
  }

  app = app.replace(
    propAnchor,
    `${propAnchor}
            onResetAllShuttleData={handleResetAllShuttleData}`
  );
}

fs.writeFileSync(appPath, app, 'utf8');

// ============================================================
// 2) FinancialStatsView.tsx
// ============================================================

// Add interface prop.
if (!finance.includes('onResetAllShuttleData?:')) {
  const interfaceStart = finance.indexOf('interface FinancialStatsViewProps {');

  if (interfaceStart === -1) {
    console.error('❌ หา FinancialStatsViewProps ไม่เจอ');
    process.exit(4);
  }

  const interfaceEnd = finance.indexOf('\n}', interfaceStart);

  if (interfaceEnd === -1) {
    console.error('❌ หา end ของ FinancialStatsViewProps ไม่เจอ');
    process.exit(5);
  }

  finance =
    finance.slice(0, interfaceEnd) +
    '\n  onResetAllShuttleData?: () => boolean;' +
    finance.slice(interfaceEnd);
}

// Add destructured prop.
if (!finance.includes('  onResetAllShuttleData,')) {
  const componentStart =
    finance.indexOf('export const FinancialStatsView: React.FC<FinancialStatsViewProps> = ({');

  if (componentStart === -1) {
    console.error('❌ หา FinancialStatsView component ไม่เจอ');
    process.exit(6);
  }

  const destructEnd = finance.indexOf('\n}) => {', componentStart);

  if (destructEnd === -1) {
    console.error('❌ หา end ของ props destructuring ไม่เจอ');
    process.exit(7);
  }

  finance =
    finance.slice(0, destructEnd) +
    '\n  onResetAllShuttleData,' +
    finance.slice(destructEnd);
}

// Add danger zone once.
if (!finance.includes('RESET_SHUTTLE_DANGER_ZONE')) {
  const finalClose = finance.lastIndexOf('\n    </div>\n  );');

  if (finalClose === -1) {
    console.error('❌ หา root closing ของ FinancialStatsView ไม่เจอ');
    process.exit(8);
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
                เริ่ม Stock ลูกใหม่ทั้งหมด โดยไม่ลบสมาชิก Match การชำระเงิน Archive หรือ Fund
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

  finance =
    finance.slice(0, finalClose) +
    dangerZone +
    finance.slice(finalClose);
}

fs.writeFileSync(financePath, finance, 'utf8');

// ============================================================
// VERIFY
// ============================================================
const appFinal = fs.readFileSync(appPath, 'utf8');
const financeFinal = fs.readFileSync(financePath, 'utf8');

const checks = [
  ['Reset handler', appFinal.includes('const handleResetAllShuttleData =')],
  ['Clear purchases', appFinal.includes('shuttlePurchases: []')],
  ['Clear usage ledger', appFinal.includes('shuttleUsageLedger: []')],
  ['Clear stock adjustments', appFinal.includes('shuttleStockAdjustments: []')],
  ['Reset shuttle price', appFinal.includes('shuttlecockPrice: 0')],
  ['Reset shuttle used today', appFinal.includes('shuttlecocksUsedTotal: 0')],
  ['Prop wired to Finance', appFinal.includes('onResetAllShuttleData={handleResetAllShuttleData}')],
  ['Finance prop exists', financeFinal.includes('onResetAllShuttleData?: () => boolean;')],
  ['Reset button exists', financeFinal.includes('รีเซ็ต Stock ลูกทั้งหมด')],
];

console.log('');
console.log('=== VERIFY ===');

let ok = true;

for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

if (!ok) {
  console.error('\n❌ Patch ยังไม่ครบ กรุณาส่ง App.tsx และ FinancialStatsView.tsx ล่าสุดมา');
  process.exit(10);
}

console.log('');
console.log('✅ Patch V2 สำเร็จ');
console.log('✅ เพิ่มปุ่มรีเซ็ต Stock ลูกทั้งหมด');
console.log('✅ ไม่ลบ Member / Match History / Payment / Archive / Fund');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
console.log('  npm.cmd run dev');
