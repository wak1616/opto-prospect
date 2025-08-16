'use client';

import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';

export default function AuthButton() {
    const [user, setUser] = useState<User | null>(null);
    
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, setUser);
        return () => unsub();
      }, []);
    
      if (!user) {
        return (
          <button
            onClick={async () => { await signInWithPopup(auth, googleProvider); }}
            className="border rounded-lg px-3 py-2 hover:bg-gray-50"
            aria-label="Sign in with Google"
          >
            Sign in with Google
          </button>
        );
      }
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Hi, {user.displayName || user.email}</span>
          <button
            onClick={() => signOut(auth)}
            className="border rounded-lg px-3 py-2 hover:bg-gray-50"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </div>
      );
    }