import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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