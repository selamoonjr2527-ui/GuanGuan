import { Player, SessionConfig, MatchHistoryItem, ActiveMatch, AssessmentQuestion, ConfirmedPreMatch, DailySessionArchive, FundTransaction, SkillLevel } from '../types';
import {
  deleteFundTransactionFromFirestore,
  deleteSessionArchiveFromFirestore,
  upsertFundTransactionToFirestore,
  upsertSessionArchiveToFirestore,
} from './firestoreCollectionsSync';

const STORAGE_KEY = 'badminton_club_session_v1';
const ARCHIVE_KEY = 'badminton_club_archives_v1';
const FUND_KEY = 'badminton_club_fund_v1';

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionTitle: 'ก๊วนกวน 🏸',
  date: new Date().toISOString().split('T')[0],
  venueName: 'สนามแบดมินตัน Smash Bangna',
  startTime: '19:00',
  endTime: '22:00',
  courtCount: 2,
  courtNames: ['คอร์ท 1', 'คอร์ท 2'],
  courtHourlyRate: 200, // 200 THB/hour
  totalHours: 3, // 3 hours (19:00 - 22:00)
  shuttlecockBrand: 'RSL Classic Speed 77',
  shuttlecockPrice: 75, // 75 THB per shuttlecock
  shuttlecocksUsedTotal: 12,
  extraExpenses: [
    { id: 'water-1', name: 'น้ำดื่ม & สปอนเซอร์ส่วนกลาง', amount: 150 },
  ],
  splitMethod: 'club_rate',
  fixedFeePerPerson: 180,
  memberCourtFee: 110, // ค่าคอร์ท 110 บาทสำหรับสมาชิก
  shuttlecockFeePerMatchPerPerson: 25, // ค่าลูก 25 บาท ต่อคน ต่อแมตช์ (1 match ต่อลูก)
  extraShuttlecockPrice: 25, // ซื้อลูกเพิ่ม ลูกละ 25 บาท ต่อคน
  promptPayId: '0891234567',
  promptPayName: 'นายเอกชัย (หัวก๊วนใจดี)',
  hideSkillFromMembers: true,
  organizerPin: '1234',
  avgMatchDurationMinutes: 18,
};

export function normalizeSkillLevel(level: any): SkillLevel {
  if (level === 'N' || level === 'Newbie') return 'Newbie';
  if (level === 'S-' || level === 'C') return 'C';
  if (level === 'S' || level === 'B') return 'B';
  if (level === 'S+' || level === 'A') return 'A';
  if (level === 'P' || level === 'PRO') return 'PRO';
  return 'B';
}

export const INITIAL_PLAYERS: Player[] = [
  {
    id: 'p-1',
    nickname: 'พี่เอก (หัวก๊วน)',
    fullName: 'เอกชัย วัฒนกุล',
    phone: '089-123-4567',
    gender: 'male',
    skillLevel: 'A',
    skillScore: 4.2,
    isCheckedIn: true,
    checkInTime: '18:50',
    status: 'playing',
    gamesPlayed: 2,
    matchesPlayed: 1,
    paid: true,
    paidAmount: 180,
    paymentMethod: 'promptpay',
    paymentTime: '19:05',
    avatarColor: 'from-amber-500 to-orange-600',
  },
  {
    id: 'p-2',
    nickname: 'ต้น',
    fullName: 'ธนากร สุขสม',
    phone: '081-222-3344',
    gender: 'male',
    skillLevel: 'B',
    skillScore: 3.2,
    isCheckedIn: true,
    checkInTime: '18:55',
    status: 'playing',
    gamesPlayed: 2,
    matchesPlayed: 1,
    paid: false,
    avatarColor: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'p-3',
    nickname: 'บาส',
    fullName: 'พีรภัทร ชนะพล',
    phone: '086-555-4321',
    gender: 'male',
    skillLevel: 'PRO',
    skillScore: 4.8,
    isCheckedIn: true,
    checkInTime: '19:00',
    status: 'playing',
    gamesPlayed: 2,
    matchesPlayed: 1,
    paid: true,
    paidAmount: 180,
    paymentMethod: 'promptpay',
    paymentTime: '19:15',
    avatarColor: 'from-rose-500 to-red-600',
  },
  {
    id: 'p-4',
    nickname: 'นัท',
    fullName: 'ณัฐพงษ์ ศรีสุข',
    phone: '089-777-8899',
    gender: 'male',
    skillLevel: 'C',
    skillScore: 2.3,
    isCheckedIn: true,
    checkInTime: '19:02',
    status: 'playing',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: false,
    avatarColor: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'p-5',
    nickname: 'ก้อย',
    fullName: 'กมลชนก จันทร์เพ็ญ',
    phone: '090-333-1122',
    gender: 'female',
    skillLevel: 'Newbie',
    skillScore: 1.2,
    isCheckedIn: true,
    checkInTime: '19:05',
    status: 'waiting',
    gamesPlayed: 2,
    matchesPlayed: 1,
    paid: false,
    avatarColor: 'from-pink-500 to-rose-400',
  },
  {
    id: 'p-6',
    nickname: 'มายด์',
    fullName: 'พิมพ์ชนก นพรัตน์',
    phone: '083-444-9988',
    gender: 'female',
    skillLevel: 'C',
    skillScore: 2.1,
    isCheckedIn: true,
    checkInTime: '19:10',
    status: 'waiting',
    gamesPlayed: 2,
    matchesPlayed: 1,
    paid: true,
    paidAmount: 180,
    paymentMethod: 'promptpay',
    avatarColor: 'from-purple-500 to-violet-600',
  },
  {
    id: 'p-7',
    nickname: 'วิน',
    fullName: 'กวินทร์ มหาสมุทร',
    phone: '082-999-1234',
    gender: 'male',
    skillLevel: 'B',
    skillScore: 3.4,
    isCheckedIn: true,
    checkInTime: '19:12',
    status: 'waiting',
    gamesPlayed: 2,
    matchesPlayed: 1,
    paid: false,
    avatarColor: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'p-8',
    nickname: 'เจมส์',
    fullName: 'วรพล ภัทรเดชา',
    phone: '087-654-3210',
    gender: 'male',
    skillLevel: 'A',
    skillScore: 3.9,
    isCheckedIn: true,
    checkInTime: '19:15',
    status: 'waiting',
    gamesPlayed: 2,
    matchesPlayed: 1,
    paid: false,
    avatarColor: 'from-violet-500 to-purple-600',
  },
  {
    id: 'p-9',
    nickname: 'นุ่น',
    fullName: 'อรัญญา แก้วมณี',
    phone: '095-111-2233',
    gender: 'female',
    skillLevel: 'Newbie',
    skillScore: 1.4,
    isCheckedIn: true,
    checkInTime: '19:16',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: false,
    avatarColor: 'from-amber-400 to-yellow-500',
  },
  {
    id: 'p-10',
    nickname: 'โบ๊ท',
    fullName: 'ชัยวัฒน์ รักษ์ดี',
    phone: '084-888-7766',
    gender: 'male',
    skillLevel: 'B',
    skillScore: 3.0,
    isCheckedIn: true,
    checkInTime: '19:18',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: false,
    avatarColor: 'from-teal-500 to-emerald-600',
  },
  {
    id: 'p-11',
    nickname: 'อาร์ม',
    fullName: 'อรรถพล พรหมดี',
    phone: '081-333-4455',
    gender: 'male',
    skillLevel: 'B',
    skillScore: 3.1,
    isCheckedIn: true,
    checkInTime: '19:20',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: true,
    paidAmount: 180,
    paymentMethod: 'promptpay',
    avatarColor: 'from-blue-600 to-indigo-700',
  },
  {
    id: 'p-12',
    nickname: 'แพรว',
    fullName: 'แพรวพรรณ ชินวัตร',
    phone: '089-444-5566',
    gender: 'female',
    skillLevel: 'C',
    skillScore: 2.2,
    isCheckedIn: true,
    checkInTime: '19:22',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: false,
    avatarColor: 'from-fuchsia-500 to-pink-600',
  },
  {
    id: 'p-13',
    nickname: 'กอล์ฟ',
    fullName: 'กิตติศักดิ์ เจริญพร',
    phone: '086-777-1122',
    gender: 'male',
    skillLevel: 'A',
    skillScore: 4.0,
    isCheckedIn: true,
    checkInTime: '19:24',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: true,
    paidAmount: 180,
    paymentMethod: 'cash',
    avatarColor: 'from-emerald-600 to-green-700',
  },
  {
    id: 'p-14',
    nickname: 'เบลล์',
    fullName: 'ศศิวิมล บุญส่ง',
    phone: '091-888-2233',
    gender: 'female',
    skillLevel: 'Newbie',
    skillScore: 1.3,
    isCheckedIn: true,
    checkInTime: '19:25',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: false,
    avatarColor: 'from-orange-400 to-amber-500',
  },
  {
    id: 'p-15',
    nickname: 'ท็อป',
    fullName: 'ธีรดนย์ มั่นคง',
    phone: '085-999-3344',
    gender: 'male',
    skillLevel: 'B',
    skillScore: 3.3,
    isCheckedIn: true,
    checkInTime: '19:28',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: false,
    avatarColor: 'from-sky-500 to-cyan-600',
  },
  {
    id: 'p-16',
    nickname: 'มุก',
    fullName: 'มุกดา รัตนโชติ',
    phone: '097-666-4455',
    gender: 'female',
    skillLevel: 'C',
    skillScore: 2.0,
    isCheckedIn: true,
    checkInTime: '19:30',
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paid: false,
    avatarColor: 'from-rose-400 to-pink-500',
  },
];

export const INITIAL_ACTIVE_MATCHES: ActiveMatch[] = [
  {
    id: 'match-1',
    courtId: 'court-1',
    courtName: 'คอร์ท 1',
    teamA: ['p-1', 'p-4'], // พี่เอก (S+) + นัท (S-) = Avg (4.2+2.3)/2 = 3.25
    teamB: ['p-2', 'p-3'], // ต้น (S) + บาส (P) = Avg (3.2+4.8)/2 = 4.0
    startTime: Date.now() - 1000 * 60 * 12, // 12 minutes ago
    shuttlecocksCount: 1,
    status: 'playing',
    game1ScoreA: 21,
    game1ScoreB: 18,
    game2ScoreA: 17,
    game2ScoreB: 19,
    scoreA: 38,
    scoreB: 37,
    isRoundTrip: true,
  },
];

export const INITIAL_MATCH_HISTORY: MatchHistoryItem[] = [
  {
    id: 'hist-1',
    courtName: 'คอร์ท 1',
    teamANames: ['พี่เอก (หัวก๊วน)', 'ก้อย'],
    teamBNames: ['ต้น', 'มายด์'],
    teamASkillAvg: 2.7,
    teamBSkillAvg: 2.65,
    startTime: '19:05',
    durationMinutes: 18,
    shuttlecocksCount: 1,
    game1ScoreA: 21,
    game1ScoreB: 18,
    game2ScoreA: 19,
    game2ScoreB: 21,
    scoreA: 40,
    scoreB: 39,
    isRoundTrip: true,
  },
  {
    id: 'hist-2',
    courtName: 'คอร์ท 2',
    teamANames: ['บาส', 'วิน'],
    teamBNames: ['เจมส์', 'พี่เอก (หัวก๊วน)'],
    teamASkillAvg: 4.1,
    teamBSkillAvg: 4.05,
    startTime: '19:10',
    durationMinutes: 20,
    shuttlecocksCount: 1,
    game1ScoreA: 22,
    game1ScoreB: 20,
    game2ScoreA: 21,
    game2ScoreB: 19,
    scoreA: 43,
    scoreB: 39,
    isRoundTrip: true,
  },
];

export const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'q1',
    category: 'Clear / Lift (ลูกเซฟ / ลูกโย่ง)',
    titleThai: '1. ทักษะการตีลูกเซฟโด่งถึงท้ายคอร์ทฝั่งตรงข้าม',
    options: [
      { textThai: 'ยังตีไม่ค่อยถึงหลัง ลูกตกแถวกลางคอร์ท', points: 1, description: 'ระดับ Newbie (มือใหม่)' },
      { textThai: 'เซฟถึงหลังได้เมื่อยืนตั้งหลักทัน แต่ถ้าโดนไล่จะตีแป๊ก', points: 2, description: 'ระดับ C (มือเริ่มต้นพัฒนา)' },
      { textThai: 'เซฟถึงหลังได้สม่ำเสมอ ทั้งโฟร์แฮนด์และโอเวอร์เฮด', points: 3, description: 'ระดับ B (มือกลาง)' },
      { textThai: 'เซฟได้ทั้งโด่งลึกและลูกดาดเร็ว พลิกจากรับเป็นรุกได้คล่อง', points: 4, description: 'ระดับ A (มือแน่น)' },
      { textThai: 'เซฟและดีดลูกจากทุกตำแหน่งได้คม แม่นยำ และมีพลังสูง', points: 5, description: 'ระดับ PRO (มือโปร/นักกีฬา)' },
    ],
  },
  {
    id: 'q2',
    category: 'Smash & Drop (ลูกตบ / ตัดหยอด)',
    titleThai: '2. ลูกบุกโจมตี (การตบลูก และการตัดหยอด)',
    options: [
      { textThai: 'ยังตบไม่ได้ ตีผลักหรือแปะข้ามเน็ตไปเป็นหลัก', points: 1, description: 'ระดับ Newbie' },
      { textThai: 'ตบได้บ้างแต่ไม่หนักมาก ตัดหยอดมีติดเน็ตบ่อย', points: 2, description: 'ระดับ C' },
      { textThai: 'ตบมีทิศทาง ตัดหยอดลงชิดเน็ต จังหวะบุกได้แต้มเรื่อยๆ', points: 3, description: 'ระดับ B' },
      { textThai: 'ตบหนักและเร็ว ปักลงพื้น หลอกหน้าไม้หยอดเนียนมาก', points: 4, description: 'ระดับ A' },
      { textThai: 'จังหวะตบเฉียบขาด ความเร็วลูกสูง ตบฉีกมุมแม่นยำทุกลูก', points: 5, description: 'ระดับ PRO' },
    ],
  },
  {
    id: 'q3',
    category: 'Defense & Receive (เกมรับ / การรับลูกตบ)',
    titleThai: '3. เกมรับและการรับลูกตบ/ลูกดาด',
    options: [
      { textThai: 'กลัวลูกตบ หลบหรือตีไม่ทันบ่อยครั้ง', points: 1, description: 'ระดับ Newbie' },
      { textThai: 'รับลูกตบเบาๆ ได้ แต่ถ้าตบแรงมักยกคืนเข้ากลางให้เขาซ้ำ', points: 2, description: 'ระดับ C' },
      { textThai: 'รับลูกตบได้ดี สวนกลับเป็นลูกดาดหรือหยอดบล็อกหน้าเน็ตได้', points: 3, description: 'ระดับ B' },
      { textThai: 'เหนียวแน่น ปัดป้องลูกตบหนักได้ทั้งโฟร์และแบ็คแฮนด์ วางมุมได้', points: 4, description: 'ระดับ A' },
      { textThai: 'กำแพงเหล็ก รับเหนียวมาก สามารถเคาน์เตอร์แอทแทคได้ทันที', points: 5, description: 'ระดับ PRO' },
    ],
  },
  {
    id: 'q4',
    category: 'Footwork & Speed (ฟุตเวิร์คและการเคลื่อนที่)',
    titleThai: '4. ฟุตเวิร์ค ก้าวขา และความเร็วในการคลุมคอร์ท',
    options: [
      { textThai: 'วิ่งมั่ว ยังไม่มีสเต็ปก้าวขา เหนื่อยเร็ว', points: 1, description: 'ระดับ Newbie' },
      { textThai: 'เคลื่อนที่ได้พอตัว แต่ถ้าถูกโยกซ้ายขวาจะก้าวไม่ทัน', points: 2, description: 'ระดับ C' },
      { textThai: 'ฟุตเวิร์คเป็นระบบ กลับมาจุดกึ่งกลางคอร์ททันเกือบตลอด', points: 3, description: 'ระดับ B' },
      { textThai: 'คล่องตัว สปริงข้อเท้าดี พุ่งรับและถอยหลังได้รวดเร็ว', points: 4, description: 'ระดับ A' },
      { textThai: 'สปีดเท้าและปฏิกิริยาระดับแข่งขัน ร่างกายฟิตสมบูรณ์', points: 5, description: 'ระดับ PRO' },
    ],
  },
  {
    id: 'q5',
    category: 'Doubles Rotation & Tactics (ระบบการเล่นคู่และการยืนตำแหน่ง)',
    titleThai: '5. ความเข้าใจระบบการเล่นคู่ (หมุนเวียนหน้า-หลัง / ซ้าย-ขวา)',
    options: [
      { textThai: 'ยังไม่เข้าใจระบบคู่ แย่งกันตีหรือยืนทับตำแหน่งกันบ่อย', points: 1, description: 'ระดับ Newbie' },
      { textThai: 'พอรู้ว่าลูกลอยให้ยืนคู่ ลูกหยอดให้ยืนหน้า-หลัง แต่ยังมีสับสน', points: 2, description: 'ระดับ C' },
      { textThai: 'เข้าใจระบบหมุนเวียนคู่ดี รู้ว่าเมื่อไหร่ควรขึ้นหน้าหรือถอยหลัง', points: 3, description: 'ระดับ B' },
      { textThai: 'ประสานงานกับคู่ได้เป็นธรรมชาติ ซ้อนลูก ดักทางคู่ต่อสู้แม่น', points: 4, description: 'ระดับ A' },
      { textThai: 'อ่านเกมทะลุปรุโปร่ง จัดการพื้นที่และสร้างโอกาสให้คู่เล่นง่ายตลอด', points: 5, description: 'ระดับ PRO' },
    ],
  },
];

export interface AppState {
  sessionConfig: SessionConfig;
  players: Player[];
  activeMatches: ActiveMatch[];
  matchHistory: MatchHistoryItem[];
  confirmedPreMatch?: ConfirmedPreMatch | null;
  confirmedPreMatch2?: ConfirmedPreMatch | null;
}

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.sessionConfig && parsed.players) {
        // Merge missing initial players if needed
        const existingIds = new Set(parsed.players.map((p: Player) => p.id));
        const mergedPlayers: Player[] = [...parsed.players];
        for (const initP of INITIAL_PLAYERS) {
          if (!existingIds.has(initP.id)) {
            mergedPlayers.push(initP);
          }
        }

        // Migrate and normalize skill levels
        const normalizedPlayers: Player[] = mergedPlayers.map((p: any) => ({
          ...p,
          skillLevel: normalizeSkillLevel(p.skillLevel),
        }));

        // Sanitize active matches: prevent multiple matches on the SAME court
        const rawMatches: ActiveMatch[] = Array.isArray(parsed.activeMatches) ? parsed.activeMatches : [];
        const seenCourts = new Set<string>();
        const sanitizedMatches: ActiveMatch[] = [];
        const playingPlayers = new Set<string>();

        for (const match of rawMatches) {
          if (match && match.courtId && !seenCourts.has(match.courtId)) {
            const matchPlayers = [...(match.teamA || []), ...(match.teamB || [])];
            // Check if players are already on another court
            const hasConflict = matchPlayers.some((id) => playingPlayers.has(id));
            if (!hasConflict) {
              seenCourts.add(match.courtId);
              sanitizedMatches.push(match);
              matchPlayers.forEach((id) => playingPlayers.add(id));
            }
          }
        }

        // Sanitize confirmedPreMatch
        let validPre1 = parsed.confirmedPreMatch || null;
        if (validPre1) {
          const pre1Players = [...(validPre1.teamA || []), ...(validPre1.teamB || [])];
          if (pre1Players.some((id) => playingPlayers.has(id)) || new Set(pre1Players).size !== 4) {
            validPre1 = null;
          }
        }

        // Sanitize confirmedPreMatch2
        let validPre2 = parsed.confirmedPreMatch2 || null;
        if (validPre2) {
          const pre2Players = [...(validPre2.teamA || []), ...(validPre2.teamB || [])];
          const pre1Players = validPre1 ? new Set([...validPre1.teamA, ...validPre1.teamB]) : new Set<string>();
          if (
            pre2Players.some((id) => playingPlayers.has(id)) ||
            pre2Players.some((id) => pre1Players.has(id)) ||
            new Set(pre2Players).size !== 4
          ) {
            validPre2 = null;
          }
        }

        const migratedState: AppState = {
          ...parsed,
          players: normalizedPlayers,
          activeMatches: sanitizedMatches,
          confirmedPreMatch: validPre1,
          confirmedPreMatch2: validPre2,
          sessionConfig: {
            ...DEFAULT_SESSION_CONFIG,
            ...parsed.sessionConfig,
          },
        };

        // Persist migrated/normalized data so old browser data is permanently upgraded.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedState));

        return migratedState;
      }
    }
  } catch (e) {
    console.error('Failed to load state from localStorage', e);
  }

  return {
    sessionConfig: DEFAULT_SESSION_CONFIG,
    players: INITIAL_PLAYERS,
    activeMatches: INITIAL_ACTIVE_MATCHES,
    matchHistory: INITIAL_MATCH_HISTORY,
  };
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state to localStorage', e);
  }
}

export const SEED_SESSION_ARCHIVES: DailySessionArchive[] = [
  {
    id: 'archive-seed-1',
    archiveDate: '2026-09-04',
    sessionTitle: 'ก๊วนกวน วันศุกร์สุดสัปดาห์ 🏸',
    venueName: 'สนามแบดมินตัน วินเนอร์ คอร์ท (รามคำแหง)',
    savedAt: new Date('2026-09-04T22:15:00').getTime(),
    totalPlayers: 18,
    totalMatches: 8,
    totalShuttlecocks: 14,
    totalCourtFee: 1200,
    totalRevenue: 3050,
    totalExpense: 2400,
    netProfit: 650,
    totalCollected: 3050,
    pendingAmount: 0,
    venueCost: 1200,
    shuttleCost: 1050,
    extraExpensesTotal: 150,
    playersSnapshot: [],
    matchHistorySnapshot: [],
    notes: 'สมาชิกมาครบ คึกคักมาก ตีไป-กลับครบทุกคู่ ยอดเงินเข้ากองกลาง +650 บาท',
  },
  {
    id: 'archive-seed-2',
    archiveDate: '2026-09-08',
    sessionTitle: 'ก๊วนกวน วันอังคารสบายๆ 🏸',
    venueName: 'สนามแบดมินตัน วินเนอร์ คอร์ท (รามคำแหง)',
    savedAt: new Date('2026-09-08T22:10:00').getTime(),
    totalPlayers: 16,
    totalMatches: 7,
    totalShuttlecocks: 12,
    totalCourtFee: 1200,
    totalRevenue: 2710,
    totalExpense: 2220,
    netProfit: 490,
    totalCollected: 2710,
    pendingAmount: 0,
    venueCost: 1200,
    shuttleCost: 900,
    extraExpensesTotal: 120,
    playersSnapshot: [],
    matchHistorySnapshot: [],
    notes: 'เกมสูสี บรรยากาศสนุกสนาน สมาชิกชำระเงินครบ 100%',
  },
];

export function loadSessionArchives(): DailySessionArchive[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load archives', e);
  }
  return SEED_SESSION_ARCHIVES;
}

export function saveSessionArchive(archive: DailySessionArchive): void {
  try {
    const current = loadSessionArchives();
    const updated = [archive, ...current.filter((a) => a.id !== archive.id)];
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(updated));

    // Mirror to Firestore without changing the existing synchronous API.
    void upsertSessionArchiveToFirestore(archive).catch((e) => {
      console.error('Failed to sync session archive to Firestore', e);
    });
  } catch (e) {
    console.error('Failed to save session archive', e);
  }
}

export function deleteSessionArchive(id: string): void {
  try {
    const current = loadSessionArchives();
    const updated = current.filter((a) => a.id !== id);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(updated));

    void deleteSessionArchiveFromFirestore(id).catch((e) => {
      console.error('Failed to delete session archive from Firestore', e);
    });
  } catch (e) {
    console.error('Failed to delete session archive', e);
  }
}

export const SEED_FUND_TRANSACTIONS: FundTransaction[] = [
  {
    id: 'fund-1',
    date: '2026-09-01',
    type: 'deposit',
    amount: 1000,
    description: 'เงินตั้งต้นกองกลางก๊วนกวน',
    category: 'initial_fund',
    createdAt: new Date('2026-09-01T10:00:00').getTime(),
  },
  {
    id: 'fund-2',
    date: '2026-09-05',
    type: 'withdraw',
    amount: 850,
    description: 'ซื้อลูกแบดยกโหล RSL Classic Speed 77 (1 โหลสำรอง)',
    category: 'shuttlecocks_bulk',
    createdAt: new Date('2026-09-05T14:30:00').getTime(),
  },
];

export function loadFundTransactions(): FundTransaction[] {
  try {
    const raw = localStorage.getItem(FUND_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load fund transactions', e);
  }
  return SEED_FUND_TRANSACTIONS;
}

export function saveFundTransaction(transaction: FundTransaction): void {
  try {
    const current = loadFundTransactions();
    const updated = [transaction, ...current.filter((t) => t.id !== transaction.id)];
    localStorage.setItem(FUND_KEY, JSON.stringify(updated));

    void upsertFundTransactionToFirestore(transaction).catch((e) => {
      console.error('Failed to sync fund transaction to Firestore', e);
    });
  } catch (e) {
    console.error('Failed to save fund transaction', e);
  }
}

export function deleteFundTransaction(id: string): void {
  try {
    const current = loadFundTransactions();
    const updated = current.filter((t) => t.id !== id);
    localStorage.setItem(FUND_KEY, JSON.stringify(updated));

    void deleteFundTransactionFromFirestore(id).catch((e) => {
      console.error('Failed to delete fund transaction from Firestore', e);
    });
  } catch (e) {
    console.error('Failed to delete fund transaction', e);
  }
}

export function hasStoredSessionArchives(): boolean {
  try {
    return localStorage.getItem(ARCHIVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function replaceSessionArchivesLocal(
  archives: DailySessionArchive[]
): void {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archives));
  } catch (e) {
    console.error('Failed to replace local session archives', e);
  }
}

export function hasStoredFundTransactions(): boolean {
  try {
    return localStorage.getItem(FUND_KEY) !== null;
  } catch {
    return false;
  }
}

export function replaceFundTransactionsLocal(
  transactions: FundTransaction[]
): void {
  try {
    localStorage.setItem(FUND_KEY, JSON.stringify(transactions));
  } catch (e) {
    console.error('Failed to replace local fund transactions', e);
  }
}

export function createNewDaySessionState(
  currentState: AppState,
  options: {
    keepRoster: boolean;
    newDate?: string;
  }
): AppState {
  const nextDate = options.newDate || new Date().toISOString().split('T')[0];

  const resetPlayers: Player[] = options.keepRoster
    ? currentState.players.map((p) => ({
        ...p,
        isCheckedIn: false,
        checkInTime: undefined,
        checkInTimestamp: undefined,
        lastMatchFinishTime: undefined,
        status: 'waiting' as const,
        gamesPlayed: 0,
        matchesPlayed: 0,
        extraShuttlecocks: 0,
        paid: false,
        paidAmount: undefined,
        paymentMethod: undefined,
        paymentTime: undefined,
      }))
    : [];

  return {
    sessionConfig: {
      ...currentState.sessionConfig,
      date: nextDate,
      shuttlecocksUsedTotal: 0,
    },
    players: resetPlayers,
    activeMatches: [],
    matchHistory: [],
    confirmedPreMatch: null,
    confirmedPreMatch2: null,
  };
}

export function exportAppStateAsJSON(state: AppState): void {
  try {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `badminton_club_backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (e) {
    console.error('Failed to export state', e);
  }
}

