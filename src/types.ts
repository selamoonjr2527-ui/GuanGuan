export type SkillLevel = 'Newbie' | 'C' | 'B' | 'A' | 'PRO';

export interface SkillLevelInfo {
  code: SkillLevel;
  nameThai: string;
  nameEng: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  score: number; // 1 to 5
}

export const SKILL_LEVELS: Record<SkillLevel, SkillLevelInfo> = {
  'Newbie': {
    code: 'Newbie',
    nameThai: 'มือใหม่ (Newbie)',
    nameEng: 'Newbie / Beginner',
    description: 'เพิ่งเริ่มเล่น ตีโต้สั้นได้ ยังเซฟไม่ถึงหลัง กำลังฝึกเบสิค',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-950/60',
    borderColor: 'border-amber-300 dark:border-amber-800',
    score: 1.0,
  },
  'C': {
    code: 'C',
    nameThai: 'มือเริ่มต้นพัฒนา (C)',
    nameEng: 'Level C / Novice',
    description: 'ตีเซฟถึงหลังได้บ้าง วางลูกได้พอสมควร แต่ลูกหยอดและความเร็วคอร์ทกำลังพัฒนา',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/60',
    borderColor: 'border-emerald-300 dark:border-emerald-800',
    score: 2.0,
  },
  'B': {
    code: 'B',
    nameThai: 'มือกลาง (B)',
    nameEng: 'Level B / Intermediate',
    description: 'มือมาตรฐานประจำก๊วน เสิร์ฟแม่น เซฟถึงหลัง ตัดหยอดเป็น วิ่งคอร์ทสม่ำเสมอ',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-950/60',
    borderColor: 'border-blue-300 dark:border-blue-800',
    score: 3.0,
  },
  'A': {
    code: 'A',
    nameThai: 'มือแน่น (A)',
    nameEng: 'Level A / Advanced',
    description: 'ตบหนัก ดักหน้าเน็ตแม่น มีทักษะหมุนเวียนคู่ (Rotation) เล่นเกมเร็วได้ดี',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-950/60',
    borderColor: 'border-purple-300 dark:border-purple-800',
    score: 4.0,
  },
  'PRO': {
    code: 'PRO',
    nameThai: 'มือโปร (PRO)',
    nameEng: 'PRO / Competitive',
    description: 'ระดับนักกีฬาหรือแข่งขัน วางลูกเร็ว คมกริบ พละกำลังและทักษะรอบด้าน',
    color: 'text-rose-700 dark:text-rose-300',
    bgColor: 'bg-rose-100 dark:bg-rose-950/60',
    borderColor: 'border-rose-300 dark:border-rose-800',
    score: 5.0,
  },
};

export type PlayerStatus = 'waiting' | 'playing' | 'resting' | 'left';

export type TabType = 'prematch' | 'checkin' | 'courts' | 'assessment' | 'billing' | 'finance';

export interface Player {
  id: string;
  nickname: string;
  fullName?: string;
  phone?: string;
  pin?: string; // 4-digit PIN / security code for self check-in / check-out verification
  gender: 'male' | 'female' | 'other';
  skillLevel: SkillLevel;
  skillScore: number;
  isCheckedIn: boolean;
  checkInTime?: string;
  checkInTimestamp?: number;
  lastMatchFinishTime?: number;
  status: PlayerStatus;
  registrationType?: 'registered' | 'walkin'; // สมาชิกที่ลงชื่อล่วงหน้า vs Walk-in
  walkInPenaltyMatches?: number; // Penalty ให้คนลงชื่อล่วงหน้าได้เล่นก่อน (เช่น +1 รอบ = 2 เกม)
  gamesPlayed: number; // เล่นไปกี่เกม (1 รอบไป-กลับ = 2 เกม)
  matchesPlayed?: number; // เล่นไปกี่รอบไป-กลับ
  extraShuttlecocks?: number; // Extra shuttlecocks purchased by the player (25 THB each)
  paid: boolean;
  paidAmount?: number;
  paymentMethod?: 'promptpay' | 'cash' | 'transfer';
  paymentTime?: string;
  notes?: string;
  avatarColor: string;
}

export interface MatchCourt {
  courtId: string;
  courtName: string;
  currentGame?: ActiveMatch;
}

export interface ActiveMatch {
  id: string;
  courtId: string;
  courtName: string;
  teamA: [string, string]; // Player IDs
  teamB: [string, string]; // Player IDs
  startTime: number; // timestamp
  shuttlecocksCount: number;
  status: 'playing' | 'finished';
  scoreA?: number;
  scoreB?: number;
  game1ScoreA?: number;
  game1ScoreB?: number;
  game2ScoreA?: number;
  game2ScoreB?: number;
  isRoundTrip?: boolean; // เล่นไป-กลับ (2 เกม)
  endTime?: number;
}

export interface MatchHistoryItem {
  id: string;
  courtName: string;
  teamANames: string[];
  teamBNames: string[];
  teamASkillAvg: number;
  teamBSkillAvg: number;
  startTime: string;
  durationMinutes: number;
  shuttlecocksCount: number;
  scoreA?: number;
  scoreB?: number;
  game1ScoreA?: number;
  game1ScoreB?: number;
  game2ScoreA?: number;
  game2ScoreB?: number;
  isRoundTrip?: boolean;
}

export interface ConfirmedPreMatch {
  id: string;
  slotNumber?: 1 | 2;
  targetCourtName?: string;
  teamA: [string, string]; // Player IDs
  teamB: [string, string]; // Player IDs
  pairingLabelThai?: string;
  explanationThai?: string;
  confirmedAt: number; // timestamp
  notes?: string;
}

export type SplitMethod = 'club_rate' | 'equal' | 'per_game' | 'fixed';

export interface SessionConfig {
  sessionTitle: string;
  date: string;
  venueName: string;
  startTime: string;
  endTime: string;
  courtCount: number;
  courtNames: string[];
  courtHourlyRate: number; // e.g. 180 THB
  totalHours: number; // e.g. 3 hours
  shuttlecockBrand: string; // e.g. "RSL Silver Speed 76"
  shuttlecockPrice: number; // e.g. 75 THB per shuttle
  shuttlecocksUsedTotal: number;
  extraExpenses: Array<{ id: string; name: string; amount: number }>;
  splitMethod: SplitMethod;
  fixedFeePerPerson: number; // used if splitMethod === 'fixed'
  memberCourtFee?: number; // Court fee per member, default: 110 THB
  shuttlecockFeePerMatchPerPerson?: number; // Shuttlecock fee per person per match, default: 25 THB
  extraShuttlecockPrice?: number; // Price per extra shuttlecock bought by member, default: 25 THB
  promptPayId: string; // Phone or Citizen ID
  promptPayName: string;
  hideSkillFromMembers?: boolean; // If true, members cannot see skill evaluations or ratings
  organizerPin?: string; // 4-digit PIN for organizer admin mode (default: '1234')
  avgMatchDurationMinutes?: number; // Estimated match length for queue calculation (default: 18)
}

export interface AssessmentQuestion {
  id: string;
  category: string;
  titleThai: string;
  options: {
    textThai: string;
    points: number; // 1 to 5
    description: string;
  }[];
}

export interface DailySessionArchive {
  id: string;
  archiveDate: string; // วันที่จัดก๊วน เช่น 2026-09-11
  sessionTitle: string;
  venueName: string;
  savedAt: number; // timestamp
  totalPlayers: number;
  totalMatches: number;
  totalShuttlecocks: number;
  totalCourtFee: number;
  totalRevenue: number;
  totalExpense: number;
  netProfit?: number; // กำไร / ขาดทุนสุทธิ
  totalCollected?: number; // ยอดที่เก็บเงินจริงได้แล้ว
  pendingAmount?: number; // ยอดค้างชำระ
  venueCost?: number; // ค่าเช่าคอร์ทจ่ายสนามจริง
  shuttleCost?: number; // ค่าลูกขนไก่จ่ายสนามจริง
  extraExpensesTotal?: number; // ค่าใช้จ่ายอื่นๆ เช่น น้ำดื่ม
  playersSnapshot: Player[];
  matchHistorySnapshot: MatchHistoryItem[];
  notes?: string;
}

export interface FundTransaction {
  id: string;
  date: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  description: string;
  category?: 'shuttlecocks_bulk' | 'equipment' | 'drink_snack' | 'initial_fund' | 'session_surplus' | 'other';
  createdAt: number;
}
