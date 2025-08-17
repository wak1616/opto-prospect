import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Only validate Firebase env vars in the browser to avoid breaking SSR/static generation
const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];
if (typeof window !== 'undefined') {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`[firebase] Missing env vars: ${missing.join(', ')}`);
  }
}
  
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };



// Initialize Firebase only in the browser; during SSR/build export harmless placeholders
let app: ReturnType<typeof initializeApp> | undefined;
if (typeof window !== 'undefined') {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export const auth = app ? getAuth(app) : (null as unknown as ReturnType<typeof getAuth>);
export const googleProvider = new GoogleAuthProvider();
export const db = app ? getFirestore(app) : (null as unknown as ReturnType<typeof getFirestore>);