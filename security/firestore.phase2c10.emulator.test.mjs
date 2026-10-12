import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection } from 'firebase/firestore';

const projectId = 'demo-guanguan-security';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw new Error('Local Firestore Emulator only; expected 127.0.0.1:8080');
}
if (process.env.GCLOUD_PROJECT !== projectId) throw new Error('Demo project only');
const base = 'clubs/guanguan';
const at = (db, sub, id) => doc(db, `${base}/${sub}/${id}`);
let env;
const member = (version = 1, uid = 'member-auth', id = 'member-a', provider = 'custom') =>
  env.authenticatedContext(uid, {role:'member', memberId:id, credentialVersion:version, firebase:{sign_in_provider:provider}}).firestore();
const organizer = (uid = 'organizer-auth', provider = 'password') =>
  env.authenticatedContext(uid, {firebase:{sign_in_provider:provider}}).firestore();
const unknown = () => env.authenticatedContext('other-user').firestore();
const unauth = () => env.unauthenticatedContext().firestore();
const seed = async (sub,id,data) => env.withSecurityRulesDisabled(async ctx => setDoc(at(ctx.firestore(),sub,id),data));

before(async () => {
  const rules = await readFile(new URL('./firestore.phase2c10.emulator.rules',import.meta.url),'utf8');
  env = await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed('organizerRoles','organizer-auth',{role:'organizer',active:true,authUid:'organizer-auth'});
  await seed('memberPrivate','member-a',{memberId:'member-a',authUid:'member-auth',status:'active',credentialVersion:1});
  await seed('runtime','publicSession',{players:[]});
  await seed('runtime','currentSession',{state:{secret:true}});
  await seed('memberViews','member-a',{memberId:'member-a'});
  await seed('paymentTransaction','bill-a',{playerId:'member-a',amount:42});
  await seed('archives','archive-a',{totalRevenue:42});
  await seed('fundTransactions','fund-a',{amount:42});
});
after(async () => {await env?.cleanup();});

test('active organizer role works; arbitrary and anonymous-auth identities denied',async()=>{
  await assertSucceeds(getDoc(at(organizer(),'runtime','currentSession')));
  await assertFails(getDoc(at(unknown(),'runtime','currentSession')));
  await assertFails(getDoc(at(organizer('organizer-auth','anonymous'),'runtime','currentSession')));
  await assertFails(getDoc(at(unauth(),'runtime','currentSession')));
});
test('removing organizer role revokes read and write immediately',async()=>{
  const db=organizer();
  await assertSucceeds(updateDoc(at(db,'runtime','currentSession'),{revision:2}));
  await seed('organizerRoles','organizer-auth',{role:'organizer',active:false,authUid:'organizer-auth'});
  await assertFails(getDoc(at(db,'runtime','currentSession')));
  await assertFails(updateDoc(at(db,'runtime','currentSession'),{revision:3}));
});
test('members read public projection only with matching current credential version',async()=>{
  await assertSucceeds(getDoc(at(member(),'runtime','publicSession')));
  await assertSucceeds(getDoc(at(member(),'memberViews','member-a')));
  await assertSucceeds(getDoc(at(member(),'paymentTransaction','bill-a')));
  await assertFails(getDoc(at(member(2),'runtime','publicSession')));
  await assertFails(getDoc(at(member(1,'other-auth'),'runtime','publicSession')));
  await assertFails(getDoc(at(member(1,'member-auth','member-a','anonymous'),'runtime','publicSession')));
});
test('disable, version bump and re-enable all reject stale member credentials',async()=>{
  const db=member(1);
  await assertSucceeds(getDoc(at(db,'runtime','publicSession')));
  await seed('memberPrivate','member-a',{memberId:'member-a',authUid:'member-auth',status:'disabled',credentialVersion:2});
  await assertFails(getDoc(at(db,'runtime','publicSession')));
  await seed('memberPrivate','member-a',{memberId:'member-a',authUid:'member-auth',status:'active',credentialVersion:2});
  await assertFails(getDoc(at(db,'runtime','publicSession')));
  await assertSucceeds(getDoc(at(member(2),'runtime','publicSession')));
});
test('private identities, roles and authentication counters deny ALL client access',async()=>{
  for(const name of ['memberPrivate','organizerRoles','memberEnrollmentChallenges','memberAuthLimits','memberActionReceipts']){
    for(const db of [member(),organizer(),unknown(),unauth()]){
      await assertFails(getDoc(at(db,name,name==='organizerRoles'?'organizer-auth':'member-a')));
      await assertFails(setDoc(at(db,name,'forged'),{role:'organizer',active:true}));
      await assertFails(getDocs(collection(db,`${base}/${name}`)));
    }
  }
});
test('member cannot read canonical, archives, funds, others billing or alter public data',async()=>{
  const db=member();
  for(const [name,id] of [['runtime','currentSession'],['archives','archive-a'],['fundTransactions','fund-a']]){
    await assertFails(getDoc(at(db,name,id)));
  }
  await assertFails(getDoc(at(db,'paymentTransaction','bill-b')));
  await assertFails(setDoc(at(db,'runtime','publicSession'),{players:[{private:true}]}));
  await assertFails(updateDoc(at(db,'paymentTransaction','bill-a'),{amount:0}));
});
