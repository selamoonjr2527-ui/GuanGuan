import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapCanonicalStateToPublicSession } from '../src/publicSessionProjection.ts';

const makeCanonicalState = () => ({
  sessionConfig: {
    sessionTitle: 'Synthetic Session',
    date: '2099-03-14',
    venueName: 'Synthetic Venue',
    startTime: '18:00',
    endTime: '22:00',
    courtCount: 2,
    courtNames: ['Synthetic Court A', 'Synthetic Court B'],
    hideSkillFromMembers: true,
    organizerPin: 'SYNTHETIC_ORGANIZER_SECRET',
    promptPayId: 'SYNTHETIC_PAYMENT_DESTINATION',
    promptPayName: 'Synthetic Payment Recipient',
    courtHourlyRate: 9999,
    memberCourtFee: 8888,
    shuttlecockFeePerMatchPerPerson: 7777,
    extraShuttlecockPrice: 6666,
    extraExpenses: [{ id: 'secret-expense', name: 'Synthetic private expense', amount: 5555 }],
    splitMethod: 'fixed',
    fixedFeePerPerson: 4444,
    avgMatchDurationMinutes: 37,
  },
  players: [
    {
      id: 'member-b',
      nickname: 'Synthetic B',
      fullName: 'SYNTHETIC_FULL_NAME_B',
      phone: 'SYNTHETIC_PHONE_B',
      pin: 'SYNTHETIC_PIN_B',
      gender: 'female',
      skillLevel: 'B',
      skillScore: 3.2,
      isCheckedIn: true,
      todayRoster: true,
      checkInTime: '18:21',
      checkInTimestamp: 4070908800000,
      lastMatchFinishTime: 4070908801000,
      status: 'waiting',
      registrationType: 'walkin',
      walkInPenaltyMatches: 1,
      gamesPlayed: 2,
      matchesPlayed: 1,
      extraShuttlecocks: 4,
      paid: true,
      paidAmount: 12345,
      paymentMethod: 'promptpay',
      paymentTime: '18:22',
      notes: 'SYNTHETIC_PRIVATE_PLAYER_NOTE',
      billingAmountAdjustment: 123,
      billingAdjustmentReason: 'SYNTHETIC_BILLING_REASON',
      avatarColor: 'bg-[url(https://invalid.example/synthetic)]',
      unknownPrivateField: 'SYNTHETIC_UNKNOWN_SECRET',
    },
    {
      id: 'member-a',
      nickname: 'Synthetic A',
      fullName: 'SYNTHETIC_FULL_NAME_A',
      phone: 'SYNTHETIC_PHONE_A',
      pin: 'SYNTHETIC_PIN_A',
      skillLevel: 'A',
      skillScore: 4.1,
      isCheckedIn: true,
      todayRoster: true,
      status: 'playing',
      registrationType: 'registered',
      gamesPlayed: 4,
      matchesPlayed: 2,
      paid: false,
      paidAmount: 54321,
      paymentMethod: 'cash',
      notes: 'SYNTHETIC_PRIVATE_NOTE_A',
    },
    {
      id: 'inactive-member',
      nickname: 'Inactive Synthetic',
      phone: 'SYNTHETIC_INACTIVE_PHONE',
      pin: 'SYNTHETIC_INACTIVE_PIN',
      isCheckedIn: false,
      todayRoster: false,
      status: 'left',
      gamesPlayed: 0,
      matchesPlayed: 0,
      paid: false,
    },
  ],
  activeMatches: [{
    id: 'match-synthetic',
    courtId: 'court-1',
    courtName: 'Synthetic Court A',
    teamA: ['member-a', 'member-b'],
    teamB: ['member-c', 'member-d'],
    startTime: 4070908802000,
    shuttlecocksCount: 2,
    status: 'playing',
    game1ScoreA: 21,
    game1ScoreB: 18,
    game2ScoreA: 19,
    game2ScoreB: 21,
    extraSecret: 'SYNTHETIC_MATCH_SECRET',
  }],
  confirmedPreMatch: {
    id: 'pm-1',
    slotNumber: 1,
    teamA: ['member-a', 'member-b'],
    teamB: ['member-c', 'member-d'],
    confirmedAt: 4070908803000,
    registrationType: 'not-a-public-field',
    pairingLabelThai: 'SYNTHETIC_PAIRING_LABEL',
    explanationThai: 'SYNTHETIC_PRIVATE_EXPLANATION',
    notes: 'SYNTHETIC_PRIVATE_PM_NOTE',
  },
  confirmedPreMatch2: {
    id: 'pm-2',
    slotNumber: 2,
    teamA: ['member-e', 'member-f'],
    teamB: ['member-g', 'member-h'],
    confirmedAt: 4070908804000,
    explanationThai: 'SYNTHETIC_EXPLANATION_2',
  },
  confirmedPreMatch3: {
    id: 'pm-3',
    slotNumber: 3,
    teamA: ['member-i', 'member-j'],
    teamB: ['member-k', 'member-l'],
    confirmedAt: 4070908805000,
    notes: 'SYNTHETIC_PRIVATE_PM3_NOTE',
  },
  memberLifetimeStats: { memberA: 'SYNTHETIC_LIFETIME_STATS' },
  deletedMembers: [{ phone: 'SYNTHETIC_DELETED_PHONE' }],
  promotionRules: [{ name: 'SYNTHETIC_PRIVATE_PROMOTION' }],
  promotionRedemptions: [{ amount: 9876 }],
  shuttlePurchases: [{ supplier: 'SYNTHETIC_PRIVATE_SUPPLIER' }],
  shuttleUsageLedger: [{ cost: 8765 }],
  confirmedPreMatchDraft: { teamA: ['SYNTHETIC_UNCONFIRMED_PLAYER'] },
});

const collectKeys = (value, output = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, output));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      output.add(key.toLowerCase());
      collectKeys(child, output);
    }
  }
  return output;
};

describe('Public Session projection mapper', () => {
  it('emits only member-facing session, roster, live match, confirmed PM, and history fields', () => {
    const result = mapCanonicalStateToPublicSession(makeCanonicalState(), 42);

    assert.equal(result.schemaVersion, 1);
    assert.equal(result.sourceRevision, 42);
    assert.deepEqual(result.session, {
      sessionId: 'guanguan:2099-03-14',
      title: 'Synthetic Session',
      date: '2099-03-14',
      venueName: 'Synthetic Venue',
      startTime: '18:00',
      endTime: '22:00',
      courts: [
        { id: 'court-1', name: 'Synthetic Court A', displayOrder: 1 },
        { id: 'court-2', name: 'Synthetic Court B', displayOrder: 2 },
      ],
      skillVisibility: 'hidden',
    });
    assert.deepEqual(result.roster.map(({ id }) => id), ['member-a', 'member-b']);
    const pmWalkIn = result.confirmedPreMatches[0].participants.find(({ id }) => id === 'member-b');
    assert.equal(pmWalkIn.registrationType, 'walkin');
    assert.equal(pmWalkIn.walkInPenaltyMatches, 1);
    assert.equal(pmWalkIn.matchesPlayed, 1);
    assert.equal('registrationType' in result.roster[1], false);
    assert.equal('walkInPenaltyMatches' in result.roster[1], false);
    assert.equal('gamesPlayed' in result.roster[1], false);
    assert.equal('matchesPlayed' in result.roster[1], false);
    assert.equal(result.roster[0].skillLevel, undefined);
    assert.equal(result.activeMatches.length, 1);
    assert.equal(result.activeMatches[0].startedAt, 4070908802000);
    assert.deepEqual(result.confirmedPreMatches.map(({ slotNumber }) => slotNumber), [1, 2, 3]);
    assert.equal(result.confirmedPreMatches[2].confirmedAt, 4070908805000);
    assert.equal(result.matchHistory.length, 0);
  });

  it('keeps the serialized projection free of private, payment, organizer, and queue-time data', () => {
    const state = makeCanonicalState();
    state.matchHistory = [{
      id: 'history-synthetic',
      courtName: 'Synthetic Court A',
      startTime: '19:00',
      durationMinutes: 30,
      teamANames: ['Synthetic A', 'Synthetic B'],
      teamBNames: ['Synthetic C', 'Synthetic D'],
      shuttlecocksCount: 2,
      game1ScoreA: 21,
      game1ScoreB: 18,
      scoreA: 40,
      scoreB: 39,
      paidAmount: 777,
      phone: 'SYNTHETIC_HISTORY_PHONE',
    }];
    const serialized = JSON.stringify(mapCanonicalStateToPublicSession(state, 7));
    const keys = collectKeys(JSON.parse(serialized));
    const forbiddenKeys = [
      'phone', 'pin', 'fullname', 'gender', 'paid', 'paidamount', 'paymentmethod',
      'paymenttime', 'organizerpin', 'promptpayid', 'promptpayname', 'courthourlyrate',
      'membercourtfee', 'extrashuttlecockprice', 'extraexpenses', 'splitmethod',
      'fixedfeeperperson', 'notes', 'explanationthai', 'pairinglabelthai',
      'lastmatchfinishtime', 'checkintimestamp', 'checkintime', 'queueposition',
      'waitingindex', 'waittime', 'waitms', 'billingamountadjustment',
      'billingadjustmentreason', 'memberlifetimestats', 'deletedmembers',
      'promotionrules', 'promotionredemptions', 'shuttlepurchases', 'shuttleusageledger',
    ];

    for (const key of forbiddenKeys) assert.equal(keys.has(key), false, `Unexpected key: ${key}`);
    const rosterKeys = collectKeys(JSON.parse(serialized).roster);
    for (const key of ['registrationtype', 'walkinpenaltymatches', 'gamesplayed', 'matchesplayed']) {
      assert.equal(rosterKeys.has(key), false, `Queue input leaked into general roster: ${key}`);
    }
    assert.equal(keys.has('explanationthai'), false);
    assert.equal(keys.has('pairinglabelthai'), false);
    for (const secret of [
      'SYNTHETIC_PHONE_A', 'SYNTHETIC_PIN_A', 'SYNTHETIC_FULL_NAME_A',
      'SYNTHETIC_PAYMENT_DESTINATION', 'SYNTHETIC_ORGANIZER_SECRET',
      'SYNTHETIC_PRIVATE_EXPLANATION', 'SYNTHETIC_PRIVATE_PM_NOTE',
      'SYNTHETIC_UNCONFIRMED_PLAYER', 'SYNTHETIC_UNKNOWN_SECRET',
      'SYNTHETIC_HISTORY_PHONE',
    ]) assert.equal(serialized.includes(secret), false, `Unexpected secret value: ${secret}`);

    assert.deepEqual(JSON.parse(serialized).matchHistory[0], {
      id: 'history-synthetic',
      courtName: 'Synthetic Court A',
      startTime: '19:00',
      durationMinutes: 30,
      teamANames: ['Synthetic A', 'Synthetic B'],
      teamBNames: ['Synthetic C', 'Synthetic D'],
      shuttlecocksCount: 2,
      scoreA: 40,
      scoreB: 39,
      game1ScoreA: 21,
      game1ScoreB: 18,
    });
  });

  it('is deterministic and does not mutate canonical input', () => {
    const state = makeCanonicalState();
    const before = structuredClone(state);
    const first = mapCanonicalStateToPublicSession(state, 12);
    const second = mapCanonicalStateToPublicSession(state, 12);

    assert.deepEqual(first, second);
    assert.deepEqual(state, before);
    assert.deepEqual(first.roster.map(({ id }) => id), ['member-a', 'member-b']);
  });

  it('handles malformed and optional source data without leaking it or throwing', () => {
    assert.deepEqual(mapCanonicalStateToPublicSession(null, -1), {
      schemaVersion: 1,
      sourceRevision: 0,
      session: {
        sessionId: 'guanguan:undated',
        title: '',
        date: '',
        venueName: '',
        startTime: '',
        endTime: '',
        courts: [],
        skillVisibility: 'hidden',
      },
      roster: [],
      activeMatches: [],
      confirmedPreMatches: [],
      queueSummary: { waitingCount: 0, restingCount: 0 },
      matchHistory: [],
    });

    const malformed = mapCanonicalStateToPublicSession({
      sessionConfig: { date: 123, venueName: null, courtNames: ['Court X', null, ''] },
      players: [
        null,
        { id: 123, nickname: 'Invalid ID' },
        { id: 'optional', nickname: 'Optional', todayRoster: true, gamesPlayed: 'not-a-number', status: 'invalid' },
      ],
      activeMatches: [{ id: 'broken', teamA: ['only-one'], teamB: [] }],
      confirmedPreMatch: { teamA: ['x', 'x'], teamB: ['y', 'z'] },
      confirmedPreMatch2: null,
      confirmedPreMatch3: undefined,
      matchHistory: [false, { id: 'valid', courtName: 'Court X' }],
    }, Number.NaN);

    assert.equal(malformed.sourceRevision, 0);
    assert.deepEqual(malformed.session.courts, [{ id: 'court-1', name: 'Court X', displayOrder: 1 }]);
    assert.deepEqual(malformed.roster.map(({ id, status }) => ({ id, status })), [
      { id: 'optional', status: 'left' },
    ]);
    assert.deepEqual(malformed.activeMatches, []);
    assert.deepEqual(malformed.confirmedPreMatches, []);
    assert.deepEqual(malformed.matchHistory, [{
      id: 'valid', courtName: 'Court X', startTime: '', durationMinutes: 0,
      teamANames: [], teamBNames: [], shuttlecocksCount: 0,
    }]);
  });

  it('includes skill fields only when the canonical member visibility setting is public', () => {
    const state = makeCanonicalState();
    state.sessionConfig.hideSkillFromMembers = false;
    const result = mapCanonicalStateToPublicSession(state, 1);

    assert.equal(result.session.skillVisibility, 'public');
    assert.equal(result.roster.find(({ id }) => id === 'member-a').skillLevel, 'A');
    assert.equal(result.roster.find(({ id }) => id === 'member-a').skillScore, 4.1);
  });

  it('does not serialize source array ordering or hidden queue timing', () => {
    const state = makeCanonicalState();
    const first = mapCanonicalStateToPublicSession(state, 5);
    state.players.reverse();
    const second = mapCanonicalStateToPublicSession(state, 5);

    assert.deepEqual(first.roster.map(({ id }) => id), second.roster.map(({ id }) => id));
    const serialized = JSON.stringify(first);
    assert.equal(serialized.includes('4070908800000'), false);
    assert.equal(serialized.includes('4070908801000'), false);
    assert.equal(serialized.includes('18:21'), false);
    assert.equal(serialized.includes('queueRank'), false);
    assert.equal(serialized.includes('waitDuration'), false);
  });
});