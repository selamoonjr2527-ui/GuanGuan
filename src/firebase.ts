import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCqub_p5koak894EwApEexlUGVMoGAkg3E",
  authDomain: "guanguan-cbbe7.firebaseapp.com",
  projectId: "guanguan-cbbe7",
  storageBucket: "guanguan-cbbe7.firebasestorage.app",
  messagingSenderId: "373321059260",
  appId: "1:373321059260:web:253d8f1d7a53adce2bf9b9",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Firebase Authentication UID for the GuanGuan organizer account.
// The UID itself is not a password/secret.
export const ORGANIZER_UID = 'DWpEIuKxqRTBptDKqM4FIKjMPmf1';