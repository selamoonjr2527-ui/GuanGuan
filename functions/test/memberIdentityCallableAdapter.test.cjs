const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemberIdentityHandlers } = require('../lib/memberIdentityCallableAdapter.js');

function fixture() {
  const calls = [];
  const backend = {
    async createChallenge(...args) { calls.push(['create', ...args]); return { challengeId: 'f'.repeat(32) }; },
    async activate(...args) { calls.push(['activate', ...args]); return 'mock-token'; },
    async login(...args) { calls.push(['login', ...args]); return 'mock-token'; },
    async disable(...args) { calls.push(['disable', ...args]); },
  };
  return { handlers: createMemberIdentityHandlers(backend), calls };
}
const failed = async (fn, code) => assert.rejects(fn, e => e.code === code);

test('organizer actions require server-authenticated UID', async () => {
  const { handlers, calls } = fixture();
  await failed(() => handlers.createChallenge({ data: { memberId: 'm1' } }), 'unauthenticated');
  await failed(() => handlers.disable({ data: { memberId: 'm1' } }), 'unauthenticated');
  assert.equal(calls.length, 0);
});
test('organizer UID comes exclusively from auth, never data', async () => {
  const { handlers, calls } = fixture();
  await failed(() => handlers.createChallenge({ auth: {uid:'trusted'}, data: { memberId:'m1', organizerUid:'forged' } }), 'invalid-argument');
  await handlers.createChallenge({ auth: {uid:'trusted'}, data: { memberId:'m1' } });
  assert.deepEqual(calls, [['create','trusted','m1']]);
});
test('PIN login accepts narrow payload and returns token', async () => {
  const { handlers, calls } = fixture();
  assert.deepEqual(await handlers.login({ data: {memberId:'m1', pin:'392847'} }), {customToken:'mock-token'});
  assert.deepEqual(calls, [['login','m1','392847']]);
  await failed(() => handlers.login({ data: {memberId:'m1', pin:'123'} }), 'invalid-argument');
});
test('activation checks token-shaped inputs', async () => {
  const { handlers, calls } = fixture();
  assert.deepEqual(await handlers.activate({ data: {challengeId:'a'.repeat(32), activationSecret:'b'.repeat(64), pin:'392847'} }), {customToken:'mock-token'});
  assert.equal(calls[0][0], 'activate');
  await failed(() => handlers.activate({ data: {challengeId:'a'.repeat(32), activationSecret:'invalid', pin:'392847'} }), 'invalid-argument');
});
test('backend failures do not reveal internal details', async () => {
  const backend = { async login() {throw new Error('sensitive firestore path / private identity');} };
  const handlers = createMemberIdentityHandlers(backend);
  await assert.rejects(() => handlers.login({ data: {memberId:'m1',pin:'392847'} }), e => e.code === 'permission-denied' && !e.message.includes('sensitive'));
});
