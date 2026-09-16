import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCqub_p5koak894EwApEexlUGVMoGAkg3E',
  authDomain: 'guanguan-cbbe7.firebaseapp.com',
  projectId: 'guanguan-cbbe7',
  storageBucket: 'guanguan-cbbe7.firebasestorage.app',
  messagingSenderId: '373321059260',
  appId: '1:373321059260:web:253d8f1d7a53adce2bf9b9',
};

// Reuse the Firebase app during Vite HMR instead of initializing it twice.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Firestore persistent cache lets the organizer keep reading/writing the data
// already used by the app while the tablet is offline. Pending writes sync when
// the network returns. Multi-tab mode prevents a second browser tab from
// disabling persistence on the same tablet.
let firestore: Firestore;

try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (error) {
  // This mainly protects development/HMR or a browser where Firestore was
  // initialized earlier. The app remains usable, but that session may use the
  // normal Firestore cache until the next clean reload.
  console.warn('Firestore persistent cache initialization fallback:', error);
  firestore = getFirestore(app);
}

export const db = firestore;
export const auth = getAuth(app);

// Firebase Authentication Organizer allow-list.
// UIDs are account identifiers, not passwords/secrets.
export const ORGANIZER_UID = 'DWpEIuKxqRTBptDKqM4FIKjMPmf1';

export const ORGANIZER_UIDS = [
  ORGANIZER_UID,
  'Ofkc1m00ikbEg84VifbePLk1k0l2',
] as const;

export function isOrganizerUid(uid?: string | null): boolean {
  return Boolean(uid && ORGANIZER_UIDS.includes(uid as (typeof ORGANIZER_UIDS)[number]));
}
