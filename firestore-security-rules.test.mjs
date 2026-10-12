import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-guanguan-security';
const ORGANIZER_UIDS = [
  'DWpEIuKxqRTBptDKqM4FIKjMPmf1',
  'Ofkc1m00ikbEg84VifbePLk1k0l2',
];

let testEnvironment;

const recordRef = (db, collectionName, recordId) =>
  doc(db, 'clubs', 'guanguan', collectionName, recordId);
const runtimeRef = (db, name) => doc(db, 'clubs', 'guanguan', 'runtime', name);
const runtimeCollectionRef = (db) => collection(db, 'clubs', 'guanguan', 'runtime');
const collectionRef = (db, name) => collection(db, 'clubs', 'guanguan', name);
const memberContext = (id, uid = `${id}-auth`) =>
  testEnvironment.authenticatedContext(uid, { role: 'member', memberId: id });
const anonymousContext = () =>
  testEnvironment.authenticatedContext('synthetic-anonymous-user', {
    firebase: { sign_in_provider: 'anonymous' },
  });
const unauthorizedContext = () =>
  testEnvironment.authenticatedContext('synthetic-untrusted-user');

const adminSet = (makeRef, data) =>
  testEnvironment.withSecurityRulesDisabled((context) =>
    setDoc(makeRef(context.firestore()), data)
  );
const adminDelete = (makeRef) =>
  testEnvironment.withSecurityRulesDisabled((context) =>
    deleteDoc(makeRef(context.firestore()))
  );

async function seedSyntheticData() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const records = [
      [runtimeRef(db, 'currentSession'), { schemaVersion: 3, revision: 1, state: { synthetic: true } }],
      [runtimeRef(db, 'publicSession'), {
        schemaVersion: 1,
        sourceRevision: 1,
        players: [
          { id: 'member-a', nickname: 'Synthetic Member A', status: 'waiting' },
          { id: 'member-b', nickname: 'Synthetic Member B', status: 'resting' },
        ],
      }],
      [recordRef(db, 'memberPrivate', 'member-a'), { authUid: 'member-a-auth', status: 'active' }],
      [recordRef(db, 'memberPrivate', 'member-b'), { authUid: 'member-b-auth', status: 'active' }],
      [recordRef(db, 'memberPrivate', 'member-disabled'), { authUid: 'member-disabled-auth', status: 'disabled' }],
      [recordRef(db, 'memberViews', 'member-a'), {
        memberId: 'member-a', nickname: 'Synthetic Member A', gamesPlayed: 2, amountDue: 100,
      }],
      [recordRef(db, 'memberViews', 'member-b'), {
        memberId: 'member-b', nickname: 'Synthetic Member B', gamesPlayed: 4, amountDue: 200,
      }],
      [recordRef(db, 'archives', 'archive-synthetic'), {
        id: 'archive-synthetic', archiveDate: '2099-01-01', totalRevenue: 300,
        playersSnapshot: [
          { id: 'member-a', nickname: 'Synthetic Member A' },
          { id: 'member-b', nickname: 'Synthetic Member B' },
        ],
      }],
      [recordRef(db, 'fundTransactions', 'fund-synthetic'), {
        id: 'fund-synthetic', type: 'deposit', amount: 300, description: 'Synthetic test transaction',
      }],
      [recordRef(db, 'paymentTransaction', 'invoice-member-a'), {
        id: 'invoice-member-a', playerId: 'member-a', nickname: 'Synthetic Member A',
        sessionDate: '2099-01-01', amount: 100, status: 'pending', paymentMethod: 'promptpay',
      }],
      [recordRef(db, 'paymentTransaction', 'invoice-member-b'), {
        id: 'invoice-member-b', playerId: 'member-b', nickname: 'Synthetic Member B',
        sessionDate: '2099-01-01', amount: 200, status: 'pending', paymentMethod: 'promptpay',
      }],
      [recordRef(db, 'memberEnrollmentChallenges', 'challenge-synthetic'), { synthetic: true }],
      [recordRef(db, 'memberActionReceipts', 'receipt-synthetic'), { synthetic: true }],
      [recordRef(db, 'memberAuthLimits', 'member-a'), { synthetic: true }],
    ];
    await Promise.all(records.map(([reference, data]) => setDoc(reference, data)));
  });
}

describe('GuanGuan proposed Firestore Rules', () => {
  before(async () => {
    const rules = await readFile(new URL('./firestore.security.test.rules', import.meta.url), 'utf8');
    assert.ok(rules.trim(), 'The proposed Firestore Rules file must exist and not be empty');
    testEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host: '127.0.0.1', port: 8080, rules },
    });
    assert.ok(testEnvironment, 'Firestore Rules test environment failed to initialize');
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
    await seedSyntheticData();
  });

  after(async () => {
    await testEnvironment?.cleanup();
  });

  it('allows both organizers and denies members and anonymous users on currentSession', async () => {
    for (const uid of ORGANIZER_UIDS) {
      const db = testEnvironment.authenticatedContext(uid).firestore();
      const makeRef = (targetDb) => runtimeRef(targetDb, 'currentSession');
      await adminSet(makeRef, { schemaVersion: 3, revision: 1, state: { synthetic: true } });
      const reference = makeRef(db);
      await assertSucceeds(getDoc(reference));
      await assertFails(getDocs(runtimeCollectionRef(db)));
      await assertSucceeds(updateDoc(reference, { revision: 2 }));
      await assertSucceeds(deleteDoc(reference));
      await assertSucceeds(setDoc(reference, { schemaVersion: 3, revision: 1, state: { synthetic: true } }));
    }
    for (const db of [
      memberContext('member-a').firestore(),
      memberContext('member-b').firestore(),
      anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ]) {
      const makeRef = (targetDb) => runtimeRef(targetDb, 'currentSession');
      await adminSet(makeRef, { schemaVersion: 3, revision: 1, state: { synthetic: true } });
      const reference = makeRef(db);
      await assertFails(getDoc(reference));
      await assertFails(getDocs(runtimeCollectionRef(db)));
      await assertFails(updateDoc(reference, { revision: 9 }));
      await assertFails(deleteDoc(reference));
      await adminDelete(makeRef);
      await assertFails(setDoc(reference, { schemaVersion: 3, state: { forged: true } }));
    }
  });

  it('allows verified members to read publicSession but denies all client writes', async () => {
    for (const id of ['member-a', 'member-b']) {
      const db = memberContext(id).firestore();
      const reference = runtimeRef(db, 'publicSession');
      await assertSucceeds(getDoc(runtimeRef(db, 'publicSession')));
      await assertFails(getDocs(runtimeCollectionRef(db)));
      await assertFails(setDoc(reference, { forged: true }));
      await assertFails(updateDoc(reference, { sourceRevision: 99 }));
      await assertFails(deleteDoc(reference));
    }
    for (const uid of ORGANIZER_UIDS) {
      const db = testEnvironment.authenticatedContext(uid).firestore();
      const reference = runtimeRef(db, 'publicSession');
      await assertSucceeds(getDoc(reference));
      await assertFails(getDocs(runtimeCollectionRef(db)));
      await assertFails(setDoc(reference, { synthetic: true }));
      await assertFails(updateDoc(reference, { sourceRevision: 99 }));
      await assertFails(deleteDoc(reference));
    }
    const deniedClients = [
      anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ];
    for (const db of deniedClients) {
      const reference = runtimeRef(db, 'publicSession');
      await assertFails(getDoc(reference));
      await assertFails(getDocs(runtimeCollectionRef(db)));
      await assertFails(setDoc(reference, { forged: true }));
      await assertFails(updateDoc(reference, { sourceRevision: 99 }));
      await assertFails(deleteDoc(reference));
    }
    await adminDelete((db) => runtimeRef(db, 'publicSession'));
    for (const db of [
      memberContext('member-a').firestore(),
      memberContext('member-b').firestore(),
      ...ORGANIZER_UIDS.map((uid) => testEnvironment.authenticatedContext(uid).firestore()),
      ...deniedClients,
    ]) {
      await assertFails(setDoc(runtimeRef(db, 'publicSession'), { forged: true }));
    }
  });

  it('keeps memberPrivate server-only for members, organizers, anonymous, and unauthenticated clients', async () => {
    const clients = [
      memberContext('member-a').firestore(),
      memberContext('member-b').firestore(),
      ...ORGANIZER_UIDS.map((uid) => testEnvironment.authenticatedContext(uid).firestore()),
      anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ];
    for (const db of clients) {
      const reference = recordRef(db, 'memberPrivate', 'member-a');
      await assertFails(getDoc(reference));
      await assertFails(getDoc(recordRef(db, 'memberPrivate', 'member-b')));
      await assertFails(getDocs(collectionRef(db, 'memberPrivate')));
      await assertFails(setDoc(reference, {
        authUid: 'forged-auth', status: 'active',
      }));
      await assertFails(updateDoc(reference, { status: 'disabled' }));
      await assertFails(deleteDoc(reference));
      await assertFails(setDoc(recordRef(db, 'memberPrivate', 'forged-member'), {
        authUid: 'forged-auth', status: 'active',
      }));
    }
  });

  it('allows memberViews owner reads, denies cross-member access, and permits organizer reads only', async () => {
    const memberA = memberContext('member-a').firestore();
    const memberB = memberContext('member-b').firestore();
    await assertSucceeds(getDoc(recordRef(memberA, 'memberViews', 'member-a')));
    await assertFails(getDoc(recordRef(memberA, 'memberViews', 'member-b')));
    await assertSucceeds(getDoc(recordRef(memberB, 'memberViews', 'member-b')));
    await assertFails(getDoc(recordRef(memberB, 'memberViews', 'member-a')));
    await assertFails(getDocs(collectionRef(memberA, 'memberViews')));
    await assertFails(getDocs(collectionRef(memberB, 'memberViews')));
    for (const [db, memberId] of [[memberA, 'member-a'], [memberB, 'member-b']]) {
      const ownView = recordRef(db, 'memberViews', memberId);
      await assertFails(setDoc(ownView, { memberId }));
      await assertFails(updateDoc(ownView, { amountDue: 0 }));
      await assertFails(deleteDoc(ownView));
      await assertFails(setDoc(recordRef(db, 'memberViews', 'forged-view'), { memberId }));
    }
    for (const db of [
      anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDoc(recordRef(db, 'memberViews', 'member-a')));
      await assertFails(getDocs(collectionRef(db, 'memberViews')));
      const view = recordRef(db, 'memberViews', 'member-a');
      await assertFails(setDoc(recordRef(db, 'memberViews', 'forged-view'), { memberId: 'member-a' }));
      await assertFails(updateDoc(view, { amountDue: 0 }));
      await assertFails(deleteDoc(view));
    }
    for (const uid of ORGANIZER_UIDS) {
      const db = testEnvironment.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(recordRef(db, 'memberViews', 'member-a')));
      await assertSucceeds(getDocs(collectionRef(db, 'memberViews')));
      const memberView = recordRef(db, 'memberViews', 'member-a');
      await assertFails(setDoc(memberView, { memberId: 'member-a' }));
      await assertFails(updateDoc(memberView, { amountDue: 0 }));
      await assertFails(deleteDoc(memberView));
      await assertFails(setDoc(recordRef(db, 'memberViews', 'forged-view'), { memberId: 'member-a' }));
    }
  });

  it('rejects missing, mismatched, disabled, and unrelated member identities', async () => {
    const invalid = [
      memberContext('member-a', 'different-auth-uid').firestore(),
      memberContext('member-a', 'member-b-auth').firestore(),
      memberContext('member-b', 'member-a-auth').firestore(),
      memberContext('member-missing').firestore(),
      memberContext('member-disabled').firestore(),
      testEnvironment.authenticatedContext('unrelated-user', {
        role: 'member', memberId: 'member-a',
      }).firestore(),
    ];
    for (const db of invalid) {
      await assertFails(getDoc(runtimeRef(db, 'publicSession')));
      await assertFails(getDoc(recordRef(db, 'memberViews', 'member-a')));
      await assertFails(getDoc(recordRef(db, 'paymentTransaction', 'invoice-member-a')));
    }
  });

  it('restricts archives to both organizers', async () => {
    for (const uid of ORGANIZER_UIDS) {
      const db = testEnvironment.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(recordRef(db, 'archives', 'archive-synthetic')));
      await assertSucceeds(getDocs(collectionRef(db, 'archives')));
      await assertSucceeds(updateDoc(recordRef(db, 'archives', 'archive-synthetic'), { totalRevenue: 301 }));
      const ownArchive = recordRef(db, 'archives', `archive-${uid}`);
      await assertSucceeds(setDoc(ownArchive, { id: 'synthetic-organizer-archive' }));
      await assertSucceeds(deleteDoc(ownArchive));
    }
    for (const db of [
      memberContext('member-a').firestore(), memberContext('member-b').firestore(), anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDoc(recordRef(db, 'archives', 'archive-synthetic')));
      await assertFails(getDocs(collectionRef(db, 'archives')));
      await assertFails(setDoc(recordRef(db, 'archives', 'forged-archive'), { id: 'forged-archive' }));
      await assertFails(updateDoc(recordRef(db, 'archives', 'archive-synthetic'), { totalRevenue: 0 }));
      await assertFails(deleteDoc(recordRef(db, 'archives', 'archive-synthetic')));
    }
  });

  it('restricts fundTransactions to both organizers', async () => {
    for (const uid of ORGANIZER_UIDS) {
      const db = testEnvironment.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(recordRef(db, 'fundTransactions', 'fund-synthetic')));
      await assertSucceeds(getDocs(collectionRef(db, 'fundTransactions')));
      await assertSucceeds(updateDoc(recordRef(db, 'fundTransactions', 'fund-synthetic'), { amount: 301 }));
      const ownTransaction = recordRef(db, 'fundTransactions', `fund-${uid}`);
      await assertSucceeds(setDoc(ownTransaction, { id: 'synthetic-organizer-fund', amount: 1 }));
      await assertSucceeds(deleteDoc(ownTransaction));
    }
    for (const db of [
      memberContext('member-a').firestore(), memberContext('member-b').firestore(), anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDoc(recordRef(db, 'fundTransactions', 'fund-synthetic')));
      await assertFails(getDocs(collectionRef(db, 'fundTransactions')));
      await assertFails(setDoc(recordRef(db, 'fundTransactions', 'forged-fund'), { amount: 1 }));
      await assertFails(updateDoc(recordRef(db, 'fundTransactions', 'fund-synthetic'), { amount: 0 }));
      await assertFails(deleteDoc(recordRef(db, 'fundTransactions', 'fund-synthetic')));
    }
  });

  it('enforces payment ownership, organizer listing, and backend-only writes', async () => {
    const memberA = memberContext('member-a').firestore();
    const memberB = memberContext('member-b').firestore();
    await assertSucceeds(getDoc(recordRef(memberA, 'paymentTransaction', 'invoice-member-a')));
    await assertFails(getDoc(recordRef(memberA, 'paymentTransaction', 'invoice-member-b')));
    await assertSucceeds(getDoc(recordRef(memberB, 'paymentTransaction', 'invoice-member-b')));
    await assertFails(getDoc(recordRef(memberB, 'paymentTransaction', 'invoice-member-a')));
    await assertFails(getDocs(collectionRef(memberA, 'paymentTransaction')));
    await assertFails(getDocs(collectionRef(memberB, 'paymentTransaction')));
    await assertFails(setDoc(recordRef(memberA, 'paymentTransaction', 'forged-invoice'), {
      playerId: 'member-b', amount: 1, status: 'pending',
    }));
    await assertFails(updateDoc(recordRef(memberA, 'paymentTransaction', 'invoice-member-a'), {
      amount: 1, status: 'pending_verify',
    }));
    await assertFails(updateDoc(recordRef(memberA, 'paymentTransaction', 'invoice-member-a'), {
      status: 'paid',
    }));
    await assertFails(deleteDoc(recordRef(memberA, 'paymentTransaction', 'invoice-member-a')));
    await assertFails(setDoc(recordRef(memberB, 'paymentTransaction', 'forged-invoice'), {
      playerId: 'member-a', amount: 100, status: 'pending',
    }));
    await assertFails(updateDoc(recordRef(memberB, 'paymentTransaction', 'invoice-member-b'), {
      amount: 1, status: 'pending_verify',
    }));
    await assertFails(updateDoc(recordRef(memberB, 'paymentTransaction', 'invoice-member-b'), {
      status: 'paid',
    }));
    await assertFails(deleteDoc(recordRef(memberB, 'paymentTransaction', 'invoice-member-b')));
    for (const db of [
      anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ]) {
      const invoice = recordRef(db, 'paymentTransaction', 'invoice-member-a');
      await assertFails(getDoc(invoice));
      await assertFails(getDocs(collectionRef(db, 'paymentTransaction')));
      await assertFails(setDoc(recordRef(db, 'paymentTransaction', 'forged-invoice'), {
        playerId: 'member-a', amount: 100, status: 'pending',
      }));
      await assertFails(updateDoc(invoice, { status: 'paid' }));
      await assertFails(updateDoc(invoice, { status: 'pending_verify' }));
      await assertFails(deleteDoc(invoice));
    }
    for (const uid of ORGANIZER_UIDS) {
      const db = testEnvironment.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(recordRef(db, 'paymentTransaction', 'invoice-member-a')));
      await assertSucceeds(getDocs(collectionRef(db, 'paymentTransaction')));
      await assertFails(setDoc(recordRef(db, 'paymentTransaction', 'forged-invoice'), {
        playerId: 'member-a', amount: 100, status: 'pending',
      }));
      await assertFails(updateDoc(recordRef(db, 'paymentTransaction', 'invoice-member-a'), { status: 'paid' }));
      await assertFails(updateDoc(recordRef(db, 'paymentTransaction', 'invoice-member-a'), { status: 'pending_verify' }));
      await assertFails(deleteDoc(recordRef(db, 'paymentTransaction', 'invoice-member-a')));
    }
  });

  it('denies client access to enrollment, action receipt, and rate-limit records', async () => {
    const clients = [
      memberContext('member-a').firestore(),
      ...ORGANIZER_UIDS.map((uid) => testEnvironment.authenticatedContext(uid).firestore()),
      anonymousContext().firestore(),
      unauthorizedContext().firestore(),
      testEnvironment.unauthenticatedContext().firestore(),
    ];
    for (const db of clients) {
      for (const name of ['memberEnrollmentChallenges', 'memberActionReceipts', 'memberAuthLimits']) {
        const reference = recordRef(db, name, 'synthetic-record');
        await assertFails(getDocs(collectionRef(db, name)));
        await assertFails(getDoc(reference));
        await assertFails(setDoc(reference, { synthetic: true }));
        await assertFails(updateDoc(reference, { synthetic: false }));
        await assertFails(deleteDoc(reference));
        await assertFails(setDoc(recordRef(db, name, 'forged-record'), { synthetic: true }));
      }
    }
  });
});