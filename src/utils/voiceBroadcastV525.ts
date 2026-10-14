// GG_FIREBASE_VOICE_BROADCAST_V525
import { collection, doc, onSnapshot, setDoc, type FirestoreError } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, isOrganizerUid } from '../firebase';

type VoiceKind = 'pm' | 'court';
export type VoiceMessage = { id:string; sessionDate:string; kind:VoiceKind; text:string; createdAt:number };
const events = collection(db,'clubs','guanguan','voiceAnnouncements');
const validText=(s:string)=>s.trim().slice(0,500);
export async function publishVoiceEventV525(event:{sessionDate:string;kind:VoiceKind;text:string;uniqueKey:string}):Promise<void>{
  if (!isOrganizerUid(auth.currentUser?.uid)) return; // members never write events
  const id = event.uniqueKey.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,160);
  const createdAt = Date.now();
  await setDoc(doc(events,id),{sessionDate:event.sessionDate,kind:event.kind,text:validText(event.text),createdAt});
}
export function subscribeVoiceEventsV525(onMessage:(message:VoiceMessage)=>void,onError:(err:FirestoreError)=>void):()=>void{
  let unsubscribeSnapshot:(()=>void)|undefined;
  const unsubscribeAuth=onAuthStateChanged(auth,(user)=>{
    unsubscribeSnapshot?.();
    unsubscribeSnapshot=undefined;
    if(!user)return;
    let initialized=false;
    const seen=new Set<string>();
    unsubscribeSnapshot=onSnapshot(events,(snapshot)=>{
      if(!initialized){initialized=true; snapshot.docs.forEach(d=>seen.add(d.id));return;}
      for(const change of snapshot.docChanges()){
        if(change.type!=='added'||change.doc.metadata.hasPendingWrites)continue;
        const d=change.doc;
        if(seen.has(d.id))continue;
        seen.add(d.id);
        const value=d.data() as Omit<VoiceMessage,'id'>;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value.sessionDate)||
           !['pm','court'].includes(value.kind)||typeof value.text!=='string'||
           !Number.isFinite(value.createdAt)||Date.now()-value.createdAt>90000||value.createdAt>Date.now()+10000)continue;
        onMessage({id:d.id,...value});
      }
    },onError);
  });
  return ()=>{unsubscribeAuth();unsubscribeSnapshot?.();};
}
